// ZERO AUTOMATIC MODIFICATION RULE (as in the original app). Reads the manuscript as it is saved and compares it with
// what the author has recorded: tracked rules and codex fields. It returns findings and, for each, a *proposed* change
// to canon that would make the two agree; it applies nothing. Findings are matched by words, not by understanding, so
// each one says "appears to": it is for the author to judge. A port of
// flutter_app/lib/shared/domain/continuity/audit.dart.

import { localeCompare } from '../exchange/collation';
import { compareNum } from '../manuscript/dartSort';
import { type StoryModel } from '../model/storyModel';
import { subtreeIds } from '../model/storyOrder';
import { isDocument } from '../outline';
import { stableSorted } from '../reader/stableSort';
import { Category } from '../records/category';
import { type Entry } from '../records/entry';
import { type ReviewItem, decisionCloses } from '../records/review';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type StoryNode } from '../records/storyNode';
import {
  type ContinuityRule,
  type Fix,
  type Issue,
  type IssueCategory,
  type Severity,
  filledFields,
  hoursIn,
  severities,
} from './rules';
import {
  type Found,
  type Paragraph,
  ageOf,
  colourOf,
  coloursIn,
  dartWhole,
  durationsIn,
  excerptAround,
  findWords,
  fingerprint,
  formatRuleDuration,
  isActing,
  isUsed,
  paragraphsOf,
  sentencesOf,
  travelWords,
} from './text';

/** Decisions about other checks' findings, kept with these and reviewed where those are shown: the timeline review,
 * knowledge, the record check, canon, journeys and ability paths. */
export const otherChecks: readonly string[] = ['timeline|', 'knowledge|', 'integrity|', 'records|', 'canon|', 'travel|', 'paths|'];

/** What the check found: the findings the author has not decided about (most serious first, then in reading order),
 * those marked intentional or dismissed (with the decision), the decisions about passages that no longer raise a
 * finding, and what was read. */
export type AuditResult = {
  open: Issue[];
  resolved: { issue: Issue; resolution: ReviewItem }[];
  stale: ReviewItem[];
  scanned: { documents: number; paragraphs: number; rules: number };
};

/** Every finding, decided or not. */
export function allIssues(r: AuditResult): Issue[] {
  return [...r.open, ...r.resolved.map((x) => x.issue)];
}

const ageFields = ['age'];
const eyeFields = ['eyes', 'eye colour', 'eye color'];
const hairFields = ['hair', 'hair colour', 'hair color'];

const whole = dartWhole;

/** Reads `docs` (each chapter's and scene's document, by node id) against `rules` and the character profiles, and
 * sorts the findings by the author's `resolutions`. */
export function audit(
  model: StoryModel,
  docs: ReadonlyMap<string, unknown>,
  rules: readonly ContinuityRule[],
  resolutions: readonly ReviewItem[],
): AuditResult {
  const nodes = [...model.nodes.values()];
  const position = (id: string): number => model.order.position.get(id) ?? -1;
  const documents = stableSorted(
    nodes.filter((n) => isDocument(n.kind)),
    (a, b) => compareNum(position(a.id), position(b.id)),
  ).map((node) => ({ node, paragraphs: paragraphsOf(docs.get(node.id)).filter((p) => dartTrim(p.text).length > 0) }));
  const entries = [...model.entries.values()];
  const entryById = model.entries;
  const characters = entries.filter((e) => e.category === 'character');
  const issues: Issue[] = [];

  /** Where a rule starts to apply: after the last chapter or scene inside its starting point. */
  const startsAfter = (rule: ContinuityRule): number => {
    const from = rule.fromNodeId;
    if (from === null || !model.nodes.has(from)) return -1;
    return Math.max(...subtreeIds(nodes, from).map(position));
  };
  const endsAt = (rule: ContinuityRule): number => {
    const until = rule.untilNodeId;
    return until !== null && model.nodes.has(until) ? position(until) : Number.POSITIVE_INFINITY;
  };
  const since = (rule: ContinuityRule): string =>
    rule.fromNodeId !== null && model.nodes.has(rule.fromNodeId) ? model.nodes.get(rule.fromNodeId)!.title : 'the start of the story';

  /** Every way an entry is written in a paragraph: its name, the rule's aliases, and any words linked to it there. */
  const namesIn = (paragraph: Paragraph, entry: Entry, aliases: readonly string[] = []): string[] => [
    entry.name,
    ...aliases,
    ...paragraph.links.filter((l) => l.entryId === entry.id).map((l) => l.text),
  ];

  const report = (
    category: IssueCategory,
    severity: Severity,
    node: StoryNode,
    paragraph: Paragraph,
    at: Found,
    parts: readonly (string | null)[],
    rest: { message: string; entryIds: string[]; ruleId: string | null; fix: Fix | null; fixSummary: string },
  ): void => {
    issues.push({
      key: [category, ...parts.map((p) => p ?? '')].join('|'),
      severity,
      category,
      message: rest.message,
      nodeId: node.id,
      nodeTitle: node.title,
      block: paragraph.index,
      excerpt: excerptAround(paragraph.text, at.index),
      match: at.text,
      entryIds: rest.entryIds,
      ruleId: rest.ruleId,
      fix: rest.fix,
      fixSummary: rest.fixSummary,
    });
  };

  for (const rule of rules) {
    const subject = rule.entryId === null ? null : (entryById.get(rule.entryId) ?? null);
    if (subject === null) continue;
    const from = startsAfter(rule);
    const until = endsAt(rule);
    const inForce = documents.filter((d) => position(d.node.id) > from && position(d.node.id) < until);

    if (rule.kind === 'status') {
      const state = rule.state ?? 'deceased';
      const described =
        state === 'deceased' ? 'deceased' : dartTrim(rule.label).length > 0 ? dartTrim(rule.label) : state === 'absent' ? 'away' : 'changed';
      for (const { node, paragraphs } of inForce) {
        const end: Fix = { type: 'end-rule', ruleId: rule.id, nodeId: node.id };
        const endSummary = `Record that ${subject.name} is no longer ${described} from “${node.title}” onwards.`;
        let remembered: { paragraph: Paragraph; at: Found } | null = null;
        let acted = false;
        for (const paragraph of paragraphs) {
          const found = findWords(paragraph.text, namesIn(paragraph, subject, rule.aliases));
          if (found.length === 0) continue;
          const acting = found.find((at) => isActing(paragraph.text, at)) ?? null;
          if (state === 'condition') {
            const clash = findWords(paragraph.text, rule.words, { loose: true })[0] ?? null;
            if (clash !== null) {
              report('status', 'warning', node, paragraph, clash, [rule.id, node.id, fingerprint(paragraph.text)], {
                message:
                  `${subject.name} is recorded as “${described}” from ${since(rule)}; “${clash.text}” in ${node.title} may ` +
                  'not fit.',
                entryIds: [subject.id],
                ruleId: rule.id,
                fix: end,
                fixSummary: endSummary,
              });
            }
          } else if (acting !== null) {
            acted = true;
            report(
              'status',
              state === 'deceased' ? 'critical' : 'warning',
              node,
              paragraph,
              acting,
              [rule.id, node.id, fingerprint(paragraph.text)],
              {
                message:
                  `${subject.name} is recorded as ${described} from ${since(rule)}, and appears to speak or act in ` +
                  `${node.title}.`,
                entryIds: [subject.id],
                ruleId: rule.id,
                fix: end,
                fixSummary: endSummary,
              },
            );
          } else if (state === 'deceased' && remembered === null) {
            remembered = { paragraph, at: found[0] };
          }
        }
        // People go on talking about the dead: one gentle note per chapter is enough, and none where there is already
        // an alert.
        if (remembered !== null && !acted) {
          report('status', 'info', node, remembered.paragraph, remembered.at, [rule.id, node.id, 'mentioned'], {
            message:
              `${subject.name} is recorded as deceased from ${since(rule)}, and is mentioned in ${node.title}. Nothing ` +
              'to do if they are being remembered.',
            entryIds: [subject.id],
            ruleId: rule.id,
            fix: end,
            fixSummary: endSummary,
          });
        }
      }
    }

    if (rule.kind === 'possession') {
      const state = rule.state ?? 'lost';
      const holder = rule.holderId === null ? null : (entryById.get(rule.holderId) ?? null);
      if (state === 'held' && holder === null) continue;
      for (const { node, paragraphs } of inForce) {
        for (const paragraph of paragraphs) {
          const used =
            findWords(paragraph.text, namesIn(paragraph, subject, rule.aliases)).find((at) => isUsed(paragraph.text, at)) ?? null;
          if (used === null) continue;
          const fix: Fix = { type: 'end-rule', ruleId: rule.id, nodeId: node.id };
          if (state !== 'held') {
            report('possession', 'warning', node, paragraph, used, [rule.id, node.id, fingerprint(paragraph.text)], {
              message: `${subject.name} is recorded as ${state} from ${since(rule)}, and appears to be used in ${node.title}.`,
              entryIds: holder === null ? [subject.id] : [subject.id, holder.id],
              ruleId: rule.id,
              fix,
              fixSummary: `Record that ${subject.name} is no longer ${state} from “${node.title}” onwards.`,
            });
            continue;
          }
          const names = (entry: Entry): boolean => findWords(paragraph.text, namesIn(paragraph, entry)).length > 0;
          const other = characters.find((c) => c.id !== holder!.id && names(c)) ?? null;
          if (other !== null && !names(holder!)) {
            report('possession', 'warning', node, paragraph, used, [rule.id, node.id, fingerprint(paragraph.text)], {
              message:
                `${subject.name} is recorded as held by ${holder!.name} from ${since(rule)}; in ${node.title} it appears ` +
                `to be used in a passage that names ${other.name} and not ${holder!.name}.`,
              entryIds: [subject.id, holder!.id, other.id],
              ruleId: rule.id,
              fix,
              fixSummary: `Record that ${subject.name} is no longer held by ${holder!.name} from “${node.title}” onwards.`,
            });
          }
        }
      }
    }

    if (rule.kind === 'travel') {
      const destination = rule.toEntryId === null ? null : (entryById.get(rule.toEntryId) ?? null);
      const amount = rule.amount;
      if (destination === null || amount === null || amount <= 0) continue;
      const established = amount * hoursIn[rule.unit];
      for (const { node, paragraphs } of documents) {
        const mentions = (entry: Entry): boolean =>
          paragraphs.some((p) => findWords(p.text, namesIn(p, entry, entry.id === subject.id ? rule.aliases : [])).length > 0);
        if (!mentions(subject) || !mentions(destination)) continue;
        for (const paragraph of paragraphs) {
          const aboutTheTrip =
            findWords(paragraph.text, [...namesIn(paragraph, subject, rule.aliases), ...namesIn(paragraph, destination)]).length > 0 ||
            findWords(paragraph.text, travelWords, { loose: true }).length > 0;
          if (!aboutTheTrip) continue;
          // The stated time furthest from what is recorded is the one worth showing.
          const stated =
            stableSorted(durationsIn(paragraph.text), (a, b) =>
              compareNum(Math.abs(Math.log(b.hours / established)), Math.abs(Math.log(a.hours / established))),
            )[0] ?? null;
          if (stated === null) continue;
          const ratio = established / stated.hours;
          if (ratio < 2 && ratio > 0.5) continue;
          const recorded = formatRuleDuration(amount, rule.unit);
          const told = formatRuleDuration(stated.amount, stated.unit);
          report(
            'travel',
            ratio >= 2 ? 'warning' : 'info',
            node,
            paragraph,
            { index: paragraph.text.indexOf(stated.text), text: stated.text },
            [rule.id, node.id, fingerprint(paragraph.text)],
            {
              entryIds: [subject.id, destination.id],
              ruleId: rule.id,
              message:
                ratio >= 2
                  ? `Travel between ${subject.name} and ${destination.name} is recorded as ${recorded}; ${node.title} ` +
                    `appears to cover it in ${told}.`
                  : `Travel between ${subject.name} and ${destination.name} is recorded as ${recorded}; ${node.title} ` +
                    `mentions ${told}.`,
              fix: { type: 'travel', ruleId: rule.id, amount: stated.amount, unit: stated.unit },
              fixSummary:
                `Change the recorded travel time between ${subject.name} and ${destination.name} from ${recorded} to ` +
                `${told}.`,
            },
          );
        }
      }
    }

    if (rule.kind === 'power') {
      if (rule.words.length === 0) continue;
      const ruleText = dartTrim(rule.label).length > 0 ? dartTrim(rule.label) : `cannot be used near: ${rule.words.join(', ')}`;
      for (const { node, paragraphs } of documents) {
        for (const paragraph of paragraphs) {
          const used = findWords(paragraph.text, namesIn(paragraph, subject, rule.aliases))[0] ?? null;
          if (used === null) continue;
          // The setting is often described once, earlier in the scene.
          const setting = rule.scope === 'paragraph' ? [paragraph] : paragraphs;
          const where = setting.find((p) => findWords(p.text, rule.words, { loose: true }).length > 0) ?? null;
          if (where === null) continue;
          const word = findWords(where.text, rule.words, { loose: true })[0];
          report('power', 'warning', node, paragraph, used, [rule.id, node.id, fingerprint(paragraph.text)], {
            entryIds: [subject.id],
            ruleId: rule.id,
            message:
              `${subject.name} has the rule “${ruleText}”. It appears to be used in ${node.title}, where “${word.text}” ` +
              `is mentioned${where === paragraph ? '' : ` (paragraph ${where.index + 1})`}.`,
            fix: {
              type: 'unblock',
              ruleId: rule.id,
              word: rule.words.find((w) => dartToLowerCase(w) === dartToLowerCase(word.text)) ?? word.text,
            },
            fixSummary: `Remove “${word.text}” from the conditions that block ${subject.name}.`,
          });
        }
      }
    }
  }

  // Character traits recorded as codex fields: age, eye colour, hair colour.
  for (const character of characters) {
    const fields = filledFields(
      character,
      model.categories.get(character.category) ?? Category.unknown(character.category),
      (id) => entryById.get(id)?.name ?? null,
    );
    const field = (labels: readonly string[]) => fields.find((f) => labels.includes(dartToLowerCase(dartTrim(f.label)))) ?? null;
    const age = field(ageFields);
    const digits = age === null ? null : (/\d+/.exec(age.text)?.[0] ?? null);
    const recordedAge = digits === null ? null : parseFloat(digits);
    const features: { feature: 'eyes' | 'hair'; field: { id: string; label: string; text: string }; colours: string[] }[] = [];
    for (const [feature, f] of [
      ['eyes', field(eyeFields)],
      ['hair', field(hairFields)],
    ] as const) {
      if (f !== null && coloursIn(f.text).length > 0) features.push({ feature, field: f, colours: coloursIn(f.text) });
    }
    if (recordedAge === null && features.length === 0) continue;
    const others = characters.filter((c) => c.id !== character.id);

    for (const { node, paragraphs } of documents) {
      for (const paragraph of paragraphs) {
        const names = namesIn(paragraph, character);
        if (findWords(paragraph.text, names).length === 0) continue;
        // "Her blue eyes" in a sentence of its own is this character's when nobody else is in the paragraph.
        const alone = !others.some((c) => findWords(paragraph.text, [c.name]).length > 0);
        for (const sentence of sentencesOf(paragraph.text)) {
          if (!alone && findWords(sentence, names).length === 0) continue;
          const at = (text: string): Found => ({ index: paragraph.text.indexOf(text), text });
          const stated = recordedAge === null ? null : ageOf(sentence, names);
          if (stated !== null && stated.age !== recordedAge) {
            const statedAge = whole(stated.age);
            const value = age!.text.replace(/\d+/, () => statedAge);
            report(
              'trait',
              Math.abs(stated.age - recordedAge!) <= 2 ? 'info' : 'warning',
              node,
              paragraph,
              at(stated.text),
              [character.id, 'age', node.id, fingerprint(paragraph.text)],
              {
                entryIds: [character.id],
                ruleId: null,
                message: `${character.name}'s age is ${whole(recordedAge!)} on their profile; ${node.title} gives it as ${statedAge}.`,
                fix: { type: 'field', entryId: character.id, fieldId: age!.id, value },
                fixSummary: `Change ${character.name}'s ${age!.label} on their profile from “${age!.text}” to “${value}”.`,
              },
            );
          }
          // "Her grey eyes" is only safely this character's when nobody else is named in the sentence.
          if (others.some((c) => findWords(sentence, [c.name]).length > 0)) continue;
          for (const { feature, field: recorded, colours } of features) {
            const described = colourOf(sentence, feature, names);
            const colour = described === null ? null : (coloursIn(described.text)[0] ?? null);
            if (described === null || colour === null || colours.includes(colour)) continue;
            const capital = `${colour[0].toUpperCase()}${colour.substring(1)}`;
            report(
              'trait',
              'warning',
              node,
              paragraph,
              at(described.text),
              [character.id, feature, node.id, fingerprint(paragraph.text)],
              {
                entryIds: [character.id],
                ruleId: null,
                message:
                  `${character.name}'s ${feature} ${feature === 'eyes' ? 'are' : 'is'} “${recorded.text}” on their ` +
                  `profile; ${node.title} describes ${feature === 'eyes' ? 'them' : 'it'} as ${colour}.`,
                fix: { type: 'field', entryId: character.id, fieldId: recorded.id, value: capital },
                fixSummary: `Change ${character.name}'s ${recorded.label} on their profile from “${recorded.text}” to “${capital}”.`,
              },
            );
          }
        }
      }
    }
  }

  // The same passage can trip the same check twice (a name written two ways); keep the first.
  const unique = new Map<string, Issue>();
  for (const issue of issues) if (!unique.has(issue.key)) unique.set(issue.key, issue);
  const sorted = stableSorted(unique.values(), (a, b) => {
    const s = compareNum(severities.indexOf(a.severity), severities.indexOf(b.severity));
    if (s !== 0) return s;
    const p = compareNum(position(a.nodeId), position(b.nodeId));
    if (p !== 0) return p;
    const k = compareNum(a.block, b.block);
    return k !== 0 ? k : localeCompare(a.key, b.key);
  });

  // A decision that the finding needs review keeps it open.
  const decided = new Map<string, ReviewItem>();
  for (const r of resolutions) if (decisionCloses(r.decision)) decided.set(r.key, r);
  const keys = new Set(sorted.map((i) => i.key));
  return {
    open: sorted.filter((i) => !decided.has(i.key)),
    resolved: sorted.filter((i) => decided.has(i.key)).map((i) => ({ issue: i, resolution: decided.get(i.key)! })),
    stale: resolutions.filter((r) => !otherChecks.some((o) => r.key.startsWith(o)) && !keys.has(r.key)),
    scanned: {
      documents: documents.length,
      paragraphs: documents.reduce((n, d) => n + d.paragraphs.length, 0),
      rules: rules.length,
    },
  };
}
