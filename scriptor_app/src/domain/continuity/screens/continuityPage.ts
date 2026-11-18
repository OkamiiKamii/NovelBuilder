// CONTINUITY on screen: the manuscript read against what the author tracks (deaths, losses, travel times, the limits
// of a power) and against the ages and colours in character profiles. Matched by words, so every finding "appears
// to". A check only reads; the author fixes the text, updates canon (after confirming the exact change), marks it
// intentional, or dismisses it. The pure parts of flutter_app/lib/features/review/continuity_page.dart (its page, its
// tabs, its filters, the cards and the rule form): what is shown and what a press changes.

import { localeCompare } from '../../exchange/collation';
import { type JsonMap } from '../../json';
import { compareNum } from '../../manuscript/dartSort';
import { type StoryModel } from '../../model/storyModel';
import { stableSorted } from '../../reader/stableSort';
import { type Entry } from '../../records/entry';
import { type ReviewDecision, reviewDecisionLabel } from '../../records/review';
import { type StoryNode } from '../../records/storyNode';
import { nodeLabel } from '../../timeline/narrative';
import { dartDoubleTryParse } from '../../records/dartNum';
import { dartTrim } from '../../text/dartString';
import { type AuditResult } from '../audit';
import { type ContinuityChanges } from '../continuityChanges';
import {
  type ContinuityRule,
  type Issue,
  type IssueCategory,
  type RuleKind,
  type RuleTimeUnit,
  type Severity,
  issueCategories,
  issueCategoryLabels,
  possessionStates,
  ruleKindLabels,
  ruleKinds,
  severities,
  severityLabel,
  stateLabels,
  statusStates,
} from '../rules';
import { formatRuleDuration } from '../text';

export type ContinuityTab = 'issues' | 'reviewed' | 'tracked';
export const continuityTabs: readonly ContinuityTab[] = ['issues', 'reviewed', 'tracked'];
export const continuityTabLabel: Readonly<Record<ContinuityTab, string>> = {
  issues: 'Issues',
  reviewed: 'Reviewed',
  tracked: 'What is tracked',
};
export function continuityTabOf(value: unknown): ContinuityTab {
  return continuityTabs.find((t) => t === value) ?? 'issues';
}

/** How a decision is written beside its finding ("Dismissed" for ignored, as the review page says it). */
export function decisionWord(d: ReviewDecision): string {
  return d === 'dismissed' ? 'Dismissed' : reviewDecisionLabel[d];
}

/** The severity chip's colours (review_parts.dart: critical on the error colour, a warning on its container, info on
 * the highest surface), in the System Monolith palette; always with the word, never colour alone. */
export const severityTone: Readonly<Record<Severity, { background: string; ink: string }>> = {
  critical: { background: '#F87171', ink: '#0A0B0E' },
  warning: { background: '#4A1C1C', ink: '#FECACA' },
  info: { background: '#272E40', ink: '#F8FAFC' },
};

/** A tracked rule as one line: "Mira: deceased from Chapter 2". `broken` when something it needs is missing. */
export function describeRule(rule: ContinuityRule, model: StoryModel): { subject: string; detail: string; broken: boolean } {
  const name = (id: string | null): string | null => (id === null ? null : (model.entries.get(id)?.name ?? null));
  const title = (id: string | null): string | null => (id === null ? null : (model.nodes.get(id)?.title ?? null));
  const span =
    `${title(rule.fromNodeId) !== null ? `from ${title(rule.fromNodeId)}` : 'from the start'}` +
    `${title(rule.untilNodeId) !== null ? ` until ${title(rule.untilNodeId)}` : ''}`;
  const subject = name(rule.entryId) ?? 'An entry that was removed';
  switch (rule.kind) {
    case 'travel':
      return {
        subject: `${subject} ↔ ${name(rule.toEntryId) ?? 'a place that was removed'}`,
        detail: rule.amount !== null ? formatRuleDuration(rule.amount, rule.unit) : 'No time recorded',
        broken: name(rule.entryId) === null || name(rule.toEntryId) === null || rule.amount === null,
      };
    case 'power':
      return {
        subject,
        detail:
          `${rule.label.length > 0 ? rule.label : 'Rule'} · blocked by: ` +
          `${rule.words.length > 0 ? rule.words.join(', ') : 'nothing yet'} ` +
          `(${rule.scope === 'paragraph' ? 'same paragraph' : 'anywhere in the scene'})`,
        broken: name(rule.entryId) === null || rule.words.length === 0,
      };
    case 'possession': {
      const state = rule.state === 'held' ? `held by ${name(rule.holderId) ?? 'someone who was removed'}` : (rule.state ?? 'lost');
      return {
        subject,
        detail: `${state} ${span}`,
        broken: name(rule.entryId) === null || (rule.state === 'held' && name(rule.holderId) === null),
      };
    }
  }
  const state =
    rule.state === 'deceased'
      ? 'deceased'
      : rule.label.length > 0
        ? rule.label
        : (stateLabels[rule.state ?? 'absent'] ?? stateLabels['absent']).toLowerCase();
  return {
    subject,
    detail: `${state} ${span}${rule.state === 'condition' ? ` · would not fit: ${rule.words.length > 0 ? rule.words.join(', ') : 'nothing yet'}` : ''}`,
    broken: name(rule.entryId) === null || (rule.state === 'condition' && rule.words.length === 0),
  };
}

/** A tracked rule's card: its line, what else it is written as, and whether it can be checked. */
export function ruleCard(rule: ContinuityRule, model: StoryModel): { subject: string; lines: string[]; edit: string; stop: string; stopMessage: string } {
  const { subject, detail, broken } = describeRule(rule, model);
  return {
    subject,
    lines: [
      detail,
      ...(rule.aliases.length > 0 ? [`Also written as: ${rule.aliases.join(', ')}`] : []),
      ...(broken ? ['This cannot be checked as it stands: something it needs is missing.'] : []),
    ],
    edit: `Edit ${subject}`,
    stop: `Stop tracking ${subject}`,
    stopMessage: `Stop tracking “${subject}: ${detail}”? Decisions you made about its findings are kept, and simply stop applying.`,
  };
}

/** The filters of the Issues tab. */
export type IssueFilters = { severity: Severity | null; category: IssueCategory | null; nodeId: string | null };
export const noIssueFilters: IssueFilters = { severity: null, category: null, nodeId: null };

/** The page as shown: the head line, what was read, each tab's label with its count, the filters' choices, the open
 * findings the filters leave grouped by severity, and the empty states. */
export function continuityView(result: AuditResult, rules: readonly ContinuityRule[], filters: IssueFilters) {
  const open = result.open;
  const counts = new Map<Severity, number>(severities.map((s) => [s, open.filter((i) => i.severity === s).length]));
  const chapter = open.some((i) => i.nodeId === filters.nodeId) ? filters.nodeId : null;
  const visible = open.filter(
    (i) =>
      (filters.severity === null || i.severity === filters.severity) &&
      (filters.category === null || i.category === filters.category) &&
      (chapter === null || i.nodeId === chapter),
  );
  const places = new Map<string, string>();
  for (const i of open) places.set(i.nodeId, i.nodeTitle);
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const { documents, paragraphs, rules: ruleCount } = result.scanned;
  const tabCount = (t: ContinuityTab): number =>
    t === 'issues' ? open.length : t === 'reviewed' ? result.resolved.length + result.stale.length : rules.length;
  return {
    header:
      open.length === 0
        ? 'No open issues'
        : `${open.length} open ${plural(open.length, 'issue', 'issues')} · ${counts.get('critical')} critical · ` +
          `${counts.get('warning')} ${plural(counts.get('warning')!, 'warning', 'warnings')} · ${counts.get('info')} info`,
    read:
      `Read ${paragraphs} ${plural(paragraphs, 'paragraph', 'paragraphs')} in ` +
      `${documents} ${plural(documents, 'chapter or scene', 'chapters and scenes')} ` +
      `against ${ruleCount} tracked ${plural(ruleCount, 'rule', 'rules')} and the character ` +
      'profiles, as saved now. A check only reads: it never changes your text or your canon.',
    tabs: continuityTabs.map((t) => ({ tab: t, label: `${continuityTabLabel[t]} (${tabCount(t)})` })),
    filters:
      open.length === 0
        ? null
        : {
            severity: [
              { value: null as Severity | null, label: 'Every severity' },
              ...severities.map((s) => ({ value: s as Severity | null, label: `${severityLabel[s]} (${counts.get(s)})` })),
            ],
            category: [
              { value: null as IssueCategory | null, label: 'Every kind of check' },
              ...issueCategories
                .filter((c) => open.some((i) => i.category === c))
                .map((c) => ({ value: c as IssueCategory | null, label: issueCategoryLabels[c] })),
            ],
            chapter: [
              { value: null as string | null, label: 'Whole manuscript' },
              ...[...places].map(([value, label]) => ({ value: value as string | null, label })),
            ],
            chosenChapter: chapter,
          },
    empty:
      open.length === 0
        ? {
            title: rules.length === 0 && result.resolved.length === 0 ? 'Tell the checker what must stay true' : 'Nothing to review',
            message:
              rules.length === 0
                ? 'Record who has died, what has been lost, how far apart places are and what your magic ' +
                  'cannot do. Every check then reads the manuscript against those, and against the ages ' +
                  'and colours in your character profiles.'
                : 'The manuscript agrees with everything you are tracking, as far as a word-by-word reading ' + 'can tell.',
            track: rules.length === 0 ? 'Choose what to track' : null,
          }
        : null,
    noMatch: open.length > 0 && visible.length === 0 ? 'No issues match these filters.' : null,
    groups: severities
      .map((s) => ({ severity: s, heading: `${severityLabel[s]} (${visible.filter((i) => i.severity === s).length})`, issues: visible.filter((i) => i.severity === s) }))
      .filter((g) => g.issues.length > 0),
    reviewedEmpty:
      result.resolved.length === 0 && result.stale.length === 0
        ? 'Issues you mark as intentional or dismiss are kept here, so you can change your mind.'
        : null,
    staleHeading: 'No longer raised: the text or what is tracked has changed since',
    trackedEmpty:
      rules.length === 0
        ? 'Nothing is tracked yet. Ages, eye colours and hair colours in character profiles are checked without any setup.'
        : null,
  };
}

/** An issue's card: where it is, and the excerpt split round the words it rests on. */
export function issueCard(issue: Issue, model: StoryModel) {
  const at = issue.match.length === 0 ? -1 : issue.excerpt.indexOf(issue.match);
  return {
    category: issueCategoryLabels[issue.category],
    where: `${issue.nodeTitle} · paragraph ${issue.block + 1}`,
    excerpt:
      at < 0
        ? { before: issue.excerpt, match: '', after: '' }
        : { before: issue.excerpt.substring(0, at), match: issue.match, after: issue.excerpt.substring(at + issue.match.length) },
    entries: issue.entryIds.flatMap((id) => {
      const e = model.entries.get(id);
      return e === undefined ? [] : [{ id: e.id, name: e.name, character: e.category === 'character' }];
    }),
    tracked: issue.ruleId !== null,
    canUpdate: issue.fix !== null,
  };
}

/** What "Update canon…" asks before it changes anything. */
export function updateCanonDialog(issue: Issue): { title: string; message: string; confirm: string; done: string } {
  return {
    title: 'Update canon?',
    message: `${issue.fixSummary} The manuscript is not changed.`,
    confirm: 'Update canon',
    done: 'Canon updated.',
  };
}

export const continuityWords = {
  title: 'Continuity',
  fixManuscript: 'Fix manuscript',
  updateCanon: 'Update canon…',
  intentional: 'Mark as intentional…',
  dismiss: 'Dismiss',
  why: 'Why is this intentional?',
  whyHint: 'A note for your future self',
  cancel: 'Cancel',
  saveIntentional: 'Save as intentional',
  reopen: 'Reopen',
  removeDecision: 'Remove this decision',
  yourNote: (note: string) => `Your note: ${note}`,
  whatIsTracked: 'What is tracked',
  stopTitle: 'Stop tracking this?',
  stopConfirm: 'Stop tracking',
  severity: 'Severity',
  kindOfCheck: 'Kind of check',
  chapter: 'Chapter',
} as const;

// ------------------------------------------------------------------------------------------------- the rule form

/** What the rule form holds while it is written. */
export type RuleDraft = {
  entryId: string | null;
  state: string;
  label: string;
  words: string;
  aliases: string;
  scope: 'scene' | 'paragraph';
  holderId: string | null;
  toEntryId: string | null;
  amount: string;
  unit: RuleTimeUnit;
  fromNodeId: string | null;
  untilNodeId: string | null;
};

/** The form as it opens: an existing rule's values, or a new rule of `kind`. */
export function ruleDraft(kind: RuleKind, rule: ContinuityRule | null): RuleDraft {
  return {
    entryId: rule?.entryId ?? null,
    state: rule?.state ?? (kind === 'possession' ? 'lost' : 'deceased'),
    label: rule?.label ?? '',
    words: (rule?.words ?? []).join(', '),
    aliases: (rule?.aliases ?? []).join(', '),
    scope: rule?.scope ?? 'scene',
    holderId: rule?.holderId ?? null,
    toEntryId: rule?.toEntryId ?? null,
    amount: rule === null || rule.amount === null ? '' : formatRuleDuration(rule.amount, 'days').split(' ')[0],
    unit: rule?.unit ?? 'days',
    fromNodeId: rule?.fromNodeId ?? null,
    untilNodeId: rule?.untilNodeId ?? null,
  };
}

const preferred: Readonly<Record<RuleKind, string>> = { status: 'character', possession: 'item', travel: 'location', power: 'power' };
const subjectLabels: Readonly<Record<RuleKind, string>> = { status: 'Character', possession: 'Item', travel: 'From', power: 'Ability or power' };

/** The form's choices and which parts show, for `kind` and the draft as it stands. */
export function ruleForm(model: StoryModel, kind: RuleKind, draft: RuleDraft, editing: boolean) {
  const all = stableSorted(model.entries.values(), (a, b) => localeCompare(a.name, b.name));
  // The fitting category when the novel has it; otherwise everything, so custom categories work too.
  const pool =
    all.some((e) => e.category === preferred[kind]) && kind !== 'power'
      ? all.filter((e) => e.category === preferred[kind] || e.id === draft.entryId || e.id === draft.toEntryId)
      : all;
  const characters = all.filter((e) => e.category === 'character');
  const chapters = stableSorted(
    [...model.nodes.values()].filter((n) => model.order.position.has(n.id)),
    (a, b) => compareNum(model.order.position.get(a.id)!, model.order.position.get(b.id)!),
  );
  const entryChoices = (list: readonly Entry[]) => list.map((e) => ({ value: e.id, label: e.name }));
  const chapterChoices = (none: string) => [
    { value: null as string | null, label: none },
    ...chapters.map((n: StoryNode) => ({ value: n.id as string | null, label: nodeLabel(model, n.id) })),
  ];
  return {
    title: `${editing ? 'Edit' : 'Track'}: ${ruleKindLabels[kind]}`,
    subjectLabel: subjectLabels[kind],
    subjects: entryChoices(pool),
    aliases: { label: 'Also written as (optional)', hint: 'the prince, the heir' },
    states:
      kind === 'status' || kind === 'possession'
        ? (kind === 'status' ? statusStates : possessionStates).map((s) => ({ value: s, label: stateLabels[s] }))
        : null,
    holders: kind === 'possession' && draft.state === 'held' ? entryChoices(characters) : null,
    travel: kind === 'travel' ? { to: entryChoices(pool), amountLabel: 'How long it takes', unitLabel: 'Unit' } : null,
    label:
      kind === 'power' || (kind === 'status' && draft.state !== 'deceased')
        ? kind === 'power'
          ? { label: 'The rule, in words', hint: 'needs direct sunlight' }
          : { label: 'In your words', hint: 'imprisoned in the Keep, lost his left hand' }
        : null,
    words:
      kind === 'power' || (kind === 'status' && draft.state === 'condition')
        ? kind === 'power'
          ? { label: 'Words that mean it cannot be used', hint: 'underground, night, cave' }
          : { label: 'Words that would not fit', hint: 'both hands, ran' }
        : null,
    scope:
      kind === 'power'
        ? [
            { value: 'scene' as const, label: 'Anywhere in the same chapter or scene' },
            { value: 'paragraph' as const, label: 'In the same paragraph' },
          ]
        : null,
    span: kind === 'status' || kind === 'possession' ? { from: chapterChoices('From the start'), until: chapterChoices('Still true at the end') } : null,
  };
}

/** What stops the form being saved, as said; null when it can be. */
export function ruleProblem(kind: RuleKind, draft: RuleDraft): string | null {
  const amount = dartDoubleTryParse(dartTrim(draft.amount));
  if (draft.entryId === null) return `Choose ${kind === 'travel' ? 'where the journey starts' : `the ${subjectLabels[kind].toLowerCase()}`}.`;
  if (kind === 'travel' && (draft.toEntryId === null || draft.toEntryId === draft.entryId)) return 'Choose a different place for the journey to end.';
  if (kind === 'travel' && !(amount !== null && amount > 0)) return 'Say how long the journey takes.';
  if (kind === 'possession' && draft.state === 'held' && draft.holderId === null) return 'Choose who holds it.';
  if ((kind === 'power' || (kind === 'status' && draft.state === 'condition')) && dartTrim(draft.words).length === 0) {
    return 'Add at least one word to look for.';
  }
  return null;
}

/** What Save changes: the rule made, or the rule changed. */
export function saveRule(kind: RuleKind, draft: RuleDraft, ruleId: string | null): (c: ContinuityChanges) => void {
  const input: JsonMap = {
    entryId: draft.entryId,
    state: draft.state,
    label: draft.label,
    words: draft.words,
    aliases: draft.aliases,
    scope: draft.scope,
    holderId: draft.holderId,
    toEntryId: draft.toEntryId,
    amount: dartDoubleTryParse(dartTrim(draft.amount)),
    unit: draft.unit,
    fromNodeId: draft.fromNodeId,
    untilNodeId: draft.untilNodeId,
  };
  return (c) => {
    if (ruleId !== null) c.updateRule(ruleId, input);
    else c.createRule(kind, input);
  };
}

/** The tracked rules by kind, in the order kept (oldest first), and the button to track each kind. */
export function trackedGroups(rules: readonly ContinuityRule[]) {
  return {
    add: ruleKinds.map((k) => ({ kind: k, label: ruleKindLabels[k] })),
    groups: ruleKinds
      .map((k) => ({ kind: k, heading: ruleKindLabels[k], rules: rules.filter((r) => r.kind === k) }))
      .filter((g) => g.rules.length > 0),
  };
}

/** The rules in the order the check reads them: oldest first, then by id (by code units, as Dart compares strings). */
export function rulesInOrder(rows: readonly JsonMap[], make: (r: JsonMap) => ContinuityRule): ContinuityRule[] {
  const rules = rows.map(make);
  return stableSorted(rules, (a, b) => {
    const c = compareNum(a.createdAt, b.createdAt);
    return c !== 0 ? c : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
