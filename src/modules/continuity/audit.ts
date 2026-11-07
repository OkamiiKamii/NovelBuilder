import { filledFields, unknownCategory } from '@/modules/codex/schema';
import type { Category, LoreEntry } from '@/modules/codex/types';
import { isDocument, subtreeIds } from '@/modules/manuscript/tree';
import type { StoryNode } from '@/modules/manuscript/types';
import { storyOrder } from '@/modules/relationships/timeline';
import { ageOf, colourOf, coloursIn, durationsIn, excerptAround, find, fingerprint, formatDuration, isActing, isUsed, paragraphsOf, sentencesOf, TRAVEL_WORDS, type Found, type Paragraph } from './text';
import { closes, HOURS, SEVERITIES, type ContinuityRule, type Fix, type Issue, type IssueCategory, type Resolution, type Severity } from './types';

/** Decisions about other checks' findings, kept with these and reviewed where those are shown: the timeline review, knowledge, the record check, canon, journeys and ability paths. */
export const OTHER_CHECKS = ['timeline|', 'knowledge|', 'integrity|', 'records|', 'canon|', 'travel|', 'paths|'];

export interface AuditInput {
  nodes: StoryNode[];
  /** Saved text of each chapter and scene, by node id. */
  docs: Map<string, unknown>;
  entries: LoreEntry[];
  rules: ContinuityRule[];
  resolutions: Resolution[];
  categoryOf?: (key: string) => Category | undefined;
}

export interface AuditResult {
  /** Findings the author has not decided about, most serious first, then in reading order. */
  open: Issue[];
  /** Findings the author marked intentional or dismissed, with the decision. */
  resolved: { issue: Issue; resolution: Resolution }[];
  /** Decisions about passages that no longer raise a finding (the text or the rule has changed). */
  stale: Resolution[];
  scanned: { documents: number; paragraphs: number; rules: number };
}

const AGE_FIELDS = ['age'];
const EYE_FIELDS = ['eyes', 'eye colour', 'eye color'];
const HAIR_FIELDS = ['hair', 'hair colour', 'hair color'];

/**
 * ZERO AUTOMATIC MODIFICATION RULE
 * Reads the manuscript as it is saved and compares it with what the author
 * has recorded: tracked rules and codex fields. It is a pure function. It
 * returns findings and, for each, a *proposed* change to canon that would
 * make the two agree; it applies nothing. Text, rules and codex entries are
 * changed only by the author, one confirmed action at a time.
 *
 * Findings are matched by words, not by understanding, so each one says
 * "appears to": it is for the author to judge.
 */
export function audit({ nodes, docs, entries, rules, resolutions, categoryOf = () => undefined }: AuditInput): AuditResult {
  const order = storyOrder(nodes);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const position = (id: string) => order.position.get(id) ?? -1;
  const documents = nodes
    .filter((n) => isDocument(n.kind))
    .sort((a, b) => position(a.id) - position(b.id))
    .map((node) => ({ node, paragraphs: paragraphsOf(docs.get(node.id)).filter((p) => p.text.trim()) }));
  const characters = entries.filter((e) => e.category === 'character');
  const issues: Issue[] = [];

  /** Where a rule starts to apply: after the last chapter or scene inside its starting point. */
  const startsAfter = (rule: ContinuityRule): number => (rule.fromNodeId && nodeById.has(rule.fromNodeId) ? Math.max(...subtreeIds(nodes, rule.fromNodeId).map(position)) : -1);
  const endsAt = (rule: ContinuityRule): number => (rule.untilNodeId && nodeById.has(rule.untilNodeId) ? position(rule.untilNodeId) : Infinity);
  const since = (rule: ContinuityRule): string => (rule.fromNodeId && nodeById.has(rule.fromNodeId) ? nodeById.get(rule.fromNodeId)!.title : 'the start of the story');
  /** Every way an entry is written in a paragraph: its name, the rule's aliases, and any words linked to it there. */
  const namesIn = (paragraph: Paragraph, entry: LoreEntry, aliases: string[] = []): string[] => [entry.name, ...aliases, ...paragraph.links.filter((l) => l.entryId === entry.id).map((l) => l.text)];

  const report = (category: IssueCategory, severity: Severity, node: StoryNode, paragraph: Paragraph, at: Found, parts: (string | null)[], details: Pick<Issue, 'message' | 'entryIds' | 'ruleId' | 'fix' | 'fixSummary'>) => {
    issues.push({ key: [category, ...parts.map((p) => p ?? '')].join('|'), severity, category, nodeId: node.id, nodeTitle: node.title, block: paragraph.index, excerpt: excerptAround(paragraph.text, at.index), match: at.text, ...details });
  };

  for (const rule of rules) {
    const subject = rule.entryId ? entryById.get(rule.entryId) : undefined;
    if (!subject) continue;
    const from = startsAfter(rule);
    const until = endsAt(rule);
    const inForce = documents.filter(({ node }) => position(node.id) > from && position(node.id) < until);

    if (rule.kind === 'status') {
      const state = rule.state ?? 'deceased';
      const described = state === 'deceased' ? 'deceased' : rule.label.trim() || (state === 'absent' ? 'away' : 'changed');
      for (const { node, paragraphs } of inForce) {
        const end: Fix = { type: 'end-rule', ruleId: rule.id, nodeId: node.id };
        const endSummary = `Record that ${subject.name} is no longer ${described} from “${node.title}” onwards.`;
        let remembered: { paragraph: Paragraph; at: Found } | null = null;
        let acted = false;
        for (const paragraph of paragraphs) {
          const found = find(paragraph.text, namesIn(paragraph, subject, rule.aliases));
          if (!found.length) continue;
          const acting = found.find((at) => isActing(paragraph.text, at));
          if (state === 'condition') {
            const [clash] = find(paragraph.text, rule.words, true);
            if (clash) report('status', 'warning', node, paragraph, clash, [rule.id, node.id, fingerprint(paragraph.text)], { message: `${subject.name} is recorded as “${described}” from ${since(rule)}; “${clash.text}” in ${node.title} may not fit.`, entryIds: [subject.id], ruleId: rule.id, fix: end, fixSummary: endSummary });
          } else if (acting) {
            acted = true;
            report('status', state === 'deceased' ? 'critical' : 'warning', node, paragraph, acting, [rule.id, node.id, fingerprint(paragraph.text)], { message: `${subject.name} is recorded as ${described} from ${since(rule)}, and appears to speak or act in ${node.title}.`, entryIds: [subject.id], ruleId: rule.id, fix: end, fixSummary: endSummary });
          } else if (state === 'deceased' && !remembered) {
            remembered = { paragraph, at: found[0] };
          }
        }
        // People go on talking about the dead: one gentle note per chapter is enough, and none where there is already an alert.
        if (remembered && !acted) {
          report('status', 'info', node, remembered.paragraph, remembered.at, [rule.id, node.id, 'mentioned'], { message: `${subject.name} is recorded as deceased from ${since(rule)}, and is mentioned in ${node.title}. Nothing to do if they are being remembered.`, entryIds: [subject.id], ruleId: rule.id, fix: end, fixSummary: endSummary });
        }
      }
    }

    if (rule.kind === 'possession') {
      const state = rule.state ?? 'lost';
      const holder = rule.holderId ? entryById.get(rule.holderId) : undefined;
      if (state === 'held' && !holder) continue;
      for (const { node, paragraphs } of inForce) {
        for (const paragraph of paragraphs) {
          const used = find(paragraph.text, namesIn(paragraph, subject, rule.aliases)).find((at) => isUsed(paragraph.text, at));
          if (!used) continue;
          const details = { entryIds: [subject.id, ...(holder ? [holder.id] : [])], ruleId: rule.id, fix: { type: 'end-rule', ruleId: rule.id, nodeId: node.id } as Fix };
          if (state !== 'held') {
            report('possession', 'warning', node, paragraph, used, [rule.id, node.id, fingerprint(paragraph.text)], { ...details, message: `${subject.name} is recorded as ${state} from ${since(rule)}, and appears to be used in ${node.title}.`, fixSummary: `Record that ${subject.name} is no longer ${state} from “${node.title}” onwards.` });
            continue;
          }
          const names = (entry: LoreEntry) => find(paragraph.text, namesIn(paragraph, entry)).length > 0;
          const other = characters.find((c) => c.id !== holder!.id && names(c));
          if (other && !names(holder!)) {
            report('possession', 'warning', node, paragraph, used, [rule.id, node.id, fingerprint(paragraph.text)], { ...details, entryIds: [subject.id, holder!.id, other.id], message: `${subject.name} is recorded as held by ${holder!.name} from ${since(rule)}; in ${node.title} it appears to be used in a passage that names ${other.name} and not ${holder!.name}.`, fixSummary: `Record that ${subject.name} is no longer held by ${holder!.name} from “${node.title}” onwards.` });
          }
        }
      }
    }

    if (rule.kind === 'travel') {
      const destination = rule.toEntryId ? entryById.get(rule.toEntryId) : undefined;
      if (!destination || !rule.amount || rule.amount <= 0) continue;
      const established = rule.amount * HOURS[rule.unit];
      for (const { node, paragraphs } of documents) {
        const mentions = (entry: LoreEntry) => paragraphs.some((p) => find(p.text, namesIn(p, entry, entry.id === subject.id ? rule.aliases : [])).length > 0);
        if (!mentions(subject) || !mentions(destination)) continue;
        for (const paragraph of paragraphs) {
          const aboutTheTrip = find(paragraph.text, [...namesIn(paragraph, subject, rule.aliases), ...namesIn(paragraph, destination)]).length > 0 || find(paragraph.text, TRAVEL_WORDS, true).length > 0;
          if (!aboutTheTrip) continue;
          // The stated time furthest from what is recorded is the one worth showing.
          const [stated] = durationsIn(paragraph.text).sort((a, b) => Math.abs(Math.log(b.hours / established)) - Math.abs(Math.log(a.hours / established)));
          if (!stated) continue;
          const ratio = established / stated.hours;
          if (ratio < 2 && ratio > 0.5) continue;
          const recorded = formatDuration(rule.amount, rule.unit);
          const told = formatDuration(stated.amount, stated.unit);
          report('travel', ratio >= 2 ? 'warning' : 'info', node, paragraph, { index: paragraph.text.indexOf(stated.text), text: stated.text }, [rule.id, node.id, fingerprint(paragraph.text)], {
            entryIds: [subject.id, destination.id], ruleId: rule.id,
            message: ratio >= 2 ? `Travel between ${subject.name} and ${destination.name} is recorded as ${recorded}; ${node.title} appears to cover it in ${told}.` : `Travel between ${subject.name} and ${destination.name} is recorded as ${recorded}; ${node.title} mentions ${told}.`,
            fix: { type: 'travel', ruleId: rule.id, amount: stated.amount, unit: stated.unit }, fixSummary: `Change the recorded travel time between ${subject.name} and ${destination.name} from ${recorded} to ${told}.`,
          });
        }
      }
    }

    if (rule.kind === 'power') {
      if (!rule.words.length) continue;
      const ruleText = rule.label.trim() || `cannot be used near: ${rule.words.join(', ')}`;
      for (const { node, paragraphs } of documents) {
        for (const paragraph of paragraphs) {
          const [used] = find(paragraph.text, namesIn(paragraph, subject, rule.aliases));
          if (!used) continue;
          // The setting is often described once, earlier in the scene.
          const setting = rule.scope === 'paragraph' ? [paragraph] : paragraphs;
          const where = setting.find((p) => find(p.text, rule.words, true).length > 0);
          if (!where) continue;
          const [word] = find(where.text, rule.words, true);
          report('power', 'warning', node, paragraph, used, [rule.id, node.id, fingerprint(paragraph.text)], {
            entryIds: [subject.id], ruleId: rule.id,
            message: `${subject.name} has the rule “${ruleText}”. It appears to be used in ${node.title}, where “${word.text}” is mentioned${where === paragraph ? '' : ` (paragraph ${where.index + 1})`}.`,
            fix: { type: 'unblock', ruleId: rule.id, word: rule.words.find((w) => w.toLowerCase() === word.text.toLowerCase()) ?? word.text }, fixSummary: `Remove “${word.text}” from the conditions that block ${subject.name}.`,
          });
        }
      }
    }
  }

  // Character traits recorded as codex fields: age, eye colour, hair colour.
  for (const character of characters) {
    const fields = filledFields(character, categoryOf(character.category) ?? unknownCategory(character.category), (id) => entryById.get(id)?.name);
    const field = (labels: string[]) => fields.find((f) => labels.includes(f.label.trim().toLowerCase()));
    const age = field(AGE_FIELDS);
    const recordedAge = age ? Number(/\d+/.exec(age.text)?.[0] ?? NaN) : NaN;
    const features = ([['eyes', field(EYE_FIELDS)], ['hair', field(HAIR_FIELDS)]] as const).flatMap(([feature, f]) => (f && coloursIn(f.text).length ? [{ feature, field: f, colours: coloursIn(f.text) }] : []));
    if (Number.isNaN(recordedAge) && !features.length) continue;
    const others = characters.filter((c) => c.id !== character.id);

    for (const { node, paragraphs } of documents) {
      for (const paragraph of paragraphs) {
        const names = namesIn(paragraph, character);
        if (!find(paragraph.text, names).length) continue;
        // "Her blue eyes" in a sentence of its own is this character's when nobody else is in the paragraph.
        const alone = !others.some((c) => find(paragraph.text, [c.name]).length);
        for (const sentence of sentencesOf(paragraph.text)) {
          if (!alone && !find(sentence, names).length) continue;
          const at = (text: string): Found => ({ index: paragraph.text.indexOf(text), text });
          const stated = Number.isNaN(recordedAge) ? null : ageOf(sentence, names);
          if (stated && stated.age !== recordedAge) {
            const value = age!.text.replace(/\d+/, String(stated.age));
            report('trait', Math.abs(stated.age - recordedAge) <= 2 ? 'info' : 'warning', node, paragraph, at(stated.text), [character.id, 'age', node.id, fingerprint(paragraph.text)], {
              entryIds: [character.id], ruleId: null,
              message: `${character.name}'s age is ${recordedAge} on their profile; ${node.title} gives it as ${stated.age}.`,
              fix: { type: 'field', entryId: character.id, fieldId: age!.id, value }, fixSummary: `Change ${character.name}'s ${age!.label} on their profile from “${age!.text}” to “${value}”.`,
            });
          }
          // "Her grey eyes" is only safely this character's when nobody else is named in the sentence.
          if (others.some((c) => find(sentence, [c.name]).length)) continue;
          for (const { feature, field: recorded, colours } of features) {
            const described = colourOf(sentence, feature, names);
            const [colour] = described ? coloursIn(described.text) : [];
            if (!described || !colour || colours.includes(colour)) continue;
            report('trait', 'warning', node, paragraph, at(described.text), [character.id, feature, node.id, fingerprint(paragraph.text)], {
              entryIds: [character.id], ruleId: null,
              message: `${character.name}'s ${feature} ${feature === 'eyes' ? 'are' : 'is'} “${recorded.text}” on their profile; ${node.title} describes ${feature === 'eyes' ? 'them' : 'it'} as ${colour}.`,
              fix: { type: 'field', entryId: character.id, fieldId: recorded.id, value: colour.charAt(0).toUpperCase() + colour.slice(1) }, fixSummary: `Change ${character.name}'s ${recorded.label} on their profile from “${recorded.text}” to “${colour.charAt(0).toUpperCase() + colour.slice(1)}”.`,
            });
          }
        }
      }
    }
  }

  // The same passage can trip the same check twice (a name written two ways); keep the first.
  const unique = [...new Map(issues.map((issue) => [issue.key, issue])).values()];
  const rank = (issue: Issue) => SEVERITIES.indexOf(issue.severity);
  unique.sort((a, b) => rank(a) - rank(b) || position(a.nodeId) - position(b.nodeId) || a.block - b.block || a.key.localeCompare(b.key));

  // A decision that the finding needs review keeps it open.
  const decided = new Map(resolutions.filter(closes).map((r) => [r.key, r]));
  const keys = new Set(unique.map((issue) => issue.key));
  return {
    open: unique.filter((issue) => !decided.has(issue.key)),
    resolved: unique.flatMap((issue) => (decided.has(issue.key) ? [{ issue, resolution: decided.get(issue.key)! }] : [])),
    // Decisions about timeline findings (`timeline/review.ts`) and knowledge findings (`characters/knowledge.ts`) are kept with these but reviewed where those are shown, not here.
    stale: resolutions.filter((r) => !OTHER_CHECKS.some((prefix) => r.key.startsWith(prefix)) && !keys.has(r.key)),
    scanned: { documents: documents.length, paragraphs: documents.reduce((n, d) => n + d.paragraphs.length, 0), rules: rules.length },
  };
}
