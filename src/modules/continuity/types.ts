export const SEVERITIES = ['critical', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = { critical: 'Critical', warning: 'Warning', info: 'Info' };
export const SEVERITY_HINTS: Record<Severity, string> = {
  critical: 'Appears to contradict something recorded as settled, such as a character’s death.',
  warning: 'May contradict a recorded rule, state or distance.',
  info: 'A detail worth a second look.',
};

export const RULE_KINDS = ['status', 'possession', 'travel', 'power'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export const KIND_LABELS: Record<RuleKind, string> = { status: 'Character status', possession: 'Item possession', travel: 'Travel time', power: 'Power or magic rule' };
export const KIND_HINTS: Record<RuleKind, string> = {
  status: 'A character dies, leaves, or is changed from a chapter onwards.',
  possession: 'An item is lost, destroyed, or held by someone from a chapter onwards.',
  travel: 'How long it takes to get from one place to another.',
  power: 'Conditions under which an ability cannot be used.',
};

/** What an issue is about. `trait` issues come from codex fields rather than from a tracked rule. */
export const CATEGORIES = ['status', 'possession', 'travel', 'power', 'trait'] as const;
export type IssueCategory = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<IssueCategory, string> = { status: 'Character & status', possession: 'Inventory & possession', travel: 'Geography & travel', power: 'Power & magic rules', trait: 'Character traits' };

export const STATUS_STATES = ['deceased', 'absent', 'condition'] as const;
export const POSSESSION_STATES = ['lost', 'destroyed', 'held'] as const;
export type RuleState = (typeof STATUS_STATES)[number] | (typeof POSSESSION_STATES)[number];
export const STATE_LABELS: Record<RuleState, string> = { deceased: 'Deceased', absent: 'Away or unable to act', condition: 'Changed (injury, trait…)', lost: 'Lost', destroyed: 'Destroyed', held: 'Held by someone' };

export const TIME_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months'] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];
export const HOURS: Record<TimeUnit, number> = { minutes: 1 / 60, hours: 1, days: 24, weeks: 168, months: 720 };

/**
 * Something the author has recorded as true from a point in the story, which
 * the manuscript can be checked against. It points at codex entries and
 * chapters by id only.
 *
 * Which fields matter depends on `kind`:
 *  status      entryId (character), state, label, words, from/until
 *  possession  entryId (item), state, holderId, from/until
 *  travel      entryId and toEntryId (locations), amount, unit
 *  power       entryId (ability), label (the rule in words), words (what blocks it), scope
 */
export interface ContinuityRule {
  id: string;
  projectId: string;
  kind: RuleKind;
  entryId: string | null;
  /** Other ways the subject is written in the text: "the prince", "Dawnbreaker". */
  aliases: string[];
  state: RuleState | null;
  /** The state or rule in the author's words: "imprisoned in the Keep", "needs direct sunlight". */
  label: string;
  /**
   * For a `condition`: words that would not fit it ("both hands").
   * For a power rule: words describing where it cannot be used ("underground", "night").
   */
  words: string[];
  /** Power rules: look for those words in the same paragraph, or anywhere in the same chapter or scene. */
  scope: 'paragraph' | 'scene';
  holderId: string | null;
  toEntryId: string | null;
  amount: number | null;
  unit: TimeUnit;
  /** The chapter or scene where this becomes true. It applies to everything after it. Null: from the start. */
  fromNodeId: string | null;
  /** The chapter or scene from which it stops being true (the character returns, the item is found). */
  untilNodeId: string | null;
  note: string;
  createdAt: number;
  updatedAt: number;
}

/** `aliases` and `words` may be given as a comma-separated list, as the author types them. */
export type RuleInput = Partial<Omit<ContinuityRule, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'aliases' | 'words'>> & { aliases?: string[] | string; words?: string[] | string };

/**
 * A change to a recorded rule or codex field that would make it agree with
 * the text. Only ever a proposal: it is applied when the author chooses
 * "Update canon" and confirms.
 */
export type Fix =
  | { type: 'end-rule'; ruleId: string; nodeId: string }
  | { type: 'travel'; ruleId: string; amount: number; unit: TimeUnit }
  | { type: 'unblock'; ruleId: string; word: string }
  | { type: 'field'; entryId: string; fieldId: string; value: string };

export interface Issue {
  /** The same for the same finding in the same passage on every run, so a decision about it holds. */
  key: string;
  severity: Severity;
  category: IssueCategory;
  message: string;
  /** The chapter or scene. */
  nodeId: string;
  nodeTitle: string;
  /** Paragraph, counting from 0 as the editor does. */
  block: number;
  excerpt: string;
  /** The words in the excerpt the finding rests on. */
  match: string;
  /** Codex entries involved. */
  entryIds: string[];
  ruleId: string | null;
  fix: Fix | null;
  /** What "Update canon" would do, as a sentence to confirm. */
  fixSummary: string;
}

/**
 * What the author decided about a finding. Every check keeps its decisions
 * here, under the finding's own key.
 *  resolved     dealt with: settled, or fixed somewhere the records do not show
 *  intentional  meant: the story explains it (a flashback, a disguise…)
 *  dismissed    not worth acting on: "Dismiss" on the checks' own pages, "Ignored" on the review dashboard
 *  review       still open, flagged to come back to
 */
export const DECISION_KINDS = ['review', 'resolved', 'intentional', 'dismissed'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];
export const DECISION_LABELS: Record<DecisionKind, string> = { review: 'Needs review', resolved: 'Resolved', intentional: 'Intentional', dismissed: 'Ignored' };
export const DECISION_HINTS: Record<DecisionKind, string> = {
  review: 'Still open, and flagged to come back to. It stays on every list of things to look at.',
  resolved: 'Dealt with: settled, or fixed somewhere the records do not show.',
  intentional: 'Meant: the story explains it (a flashback, a disguise, an unreliable narrator…).',
  dismissed: 'Not worth acting on. The other pages call this Dismiss.',
};
/** A decision takes its finding off the open lists, except "needs review", which keeps it there, flagged. */
export const closes = (decision: Pick<Resolution, 'kind'>): boolean => decision.kind !== 'review';
/** The word a check's own page uses for a decision. */
export const decisionWord = (kind: DecisionKind): string => (kind === 'dismissed' ? 'Dismissed' : DECISION_LABELS[kind]);

/** The author's decision about a finding. Removing it brings the finding back. */
export interface Resolution {
  id: string;
  projectId: string;
  /** The key of the issue it answers. */
  key: string;
  kind: DecisionKind;
  /** Why: "Flashback sequence", "Disguise", "fixed in the draft". Optional. */
  note: string;
  /** What the finding said when it was resolved, so the decision can still be read if the text moves on. */
  message: string;
  nodeId: string | null;
  createdAt: number;
  /** When the decision was last changed; missing on older rows. */
  updatedAt?: number;
}

export const INTENTIONAL_REASONS = ['Flashback sequence', 'Disguise', 'Magic illusion', 'Dream or vision', 'Remembered, not present', 'Unreliable narrator'];
