// CONTINUITY (as in the original app): what the author records as true from a point in the story, which the manuscript
// can be checked against, and what each check finds. A port of flutter_app/lib/shared/domain/continuity/rules.dart.

import { displayValue } from '../codex/fieldValues';
import { type JsonMap, idOrNull, numOrNull, str, strOrNull } from '../json';
import { type Category } from '../records/category';
import { type Entry, viewFields } from '../records/entry';
import { JsonRecord, strings } from '../records/jsonRecord';
import { dartTrim } from '../text/dartString';

export type Severity = 'critical' | 'warning' | 'info';
/** In order of seriousness (Dart's enum index). */
export const severities: readonly Severity[] = ['critical', 'warning', 'info'];
export const severityLabel: Readonly<Record<Severity, string>> = { critical: 'Critical', warning: 'Warning', info: 'Info' };
export const severityHint: Readonly<Record<Severity, string>> = {
  critical: 'Appears to contradict something recorded as settled, such as a character’s death.',
  warning: 'May contradict a recorded rule, state or distance.',
  info: 'A detail worth a second look.',
};
export function severityOf(value: unknown): Severity | null {
  return severities.find((s) => s === value) ?? null;
}

export type RuleKind = 'status' | 'possession' | 'travel' | 'power';
export const ruleKinds: readonly RuleKind[] = ['status', 'possession', 'travel', 'power'];
export const ruleKindLabels: Readonly<Record<RuleKind, string>> = {
  status: 'Character status',
  possession: 'Item possession',
  travel: 'Travel time',
  power: 'Power or magic rule',
};
export const ruleKindHints: Readonly<Record<RuleKind, string>> = {
  status: 'A character dies, leaves, or is changed from a chapter onwards.',
  possession: 'An item is lost, destroyed, or held by someone from a chapter onwards.',
  travel: 'How long it takes to get from one place to another.',
  power: 'Conditions under which an ability cannot be used.',
};

/** What an issue is about. `trait` issues come from codex fields rather than from a tracked rule. */
export type IssueCategory = 'status' | 'possession' | 'travel' | 'power' | 'trait';
export const issueCategories: readonly IssueCategory[] = ['status', 'possession', 'travel', 'power', 'trait'];
export const issueCategoryLabels: Readonly<Record<IssueCategory, string>> = {
  status: 'Character & status',
  possession: 'Inventory & possession',
  travel: 'Geography & travel',
  power: 'Power & magic rules',
  trait: 'Character traits',
};

export const statusStates: readonly string[] = ['deceased', 'absent', 'condition'];
export const possessionStates: readonly string[] = ['lost', 'destroyed', 'held'];
export const stateLabels: Readonly<Record<string, string>> = {
  deceased: 'Deceased',
  absent: 'Away or unable to act',
  condition: 'Changed (injury, trait…)',
  lost: 'Lost',
  destroyed: 'Destroyed',
  held: 'Held by someone',
};

export type RuleTimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
export const ruleTimeUnits: readonly RuleTimeUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months'];
export const hoursIn: Readonly<Record<RuleTimeUnit, number>> = { minutes: 1 / 60, hours: 1, days: 24, weeks: 168, months: 720 };

/** Something the author has recorded as true from a point in the story (`continuityRules`). It points at codex entries
 * and chapters by id only. Which fields matter depends on `kind`:
 *  status      entryId (character), state, label, words, from/until
 *  possession  entryId (item), state, holderId, from/until
 *  travel      entryId and toEntryId (locations), amount, unit
 *  power       entryId (ability), label (the rule in words), words (what blocks it), scope */
export class ContinuityRule extends JsonRecord {
  get kind(): string {
    return str(this.raw['kind'], 'status');
  }
  get entryId(): string | null {
    return idOrNull(this.raw['entryId']);
  }
  /** Other ways the subject is written in the text: "the prince", "Dawnbreaker". */
  get aliases(): string[] {
    return strings(this.raw['aliases']);
  }
  get state(): string | null {
    return strOrNull(this.raw['state']);
  }
  get label(): string {
    return str(this.raw['label']);
  }
  get words(): string[] {
    return strings(this.raw['words']);
  }
  /** Power rules: look for those words in the same paragraph, or anywhere in the same chapter or scene. */
  get scope(): 'paragraph' | 'scene' {
    return this.raw['scope'] === 'paragraph' ? 'paragraph' : 'scene';
  }
  get holderId(): string | null {
    return idOrNull(this.raw['holderId']);
  }
  get toEntryId(): string | null {
    return idOrNull(this.raw['toEntryId']);
  }
  get amount(): number | null {
    const n = numOrNull(this.raw['amount']);
    return n === null || !Number.isFinite(n) ? null : n;
  }
  get unit(): RuleTimeUnit {
    const u = this.raw['unit'];
    return ruleTimeUnits.find((t) => t === u) ?? 'days';
  }
  /** The chapter or scene where this becomes true. It applies to everything after it. Null: from the start. */
  get fromNodeId(): string | null {
    return idOrNull(this.raw['fromNodeId']);
  }
  /** The chapter or scene from which it stops being true (the character returns, the item is found). */
  get untilNodeId(): string | null {
    return idOrNull(this.raw['untilNodeId']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
}

/** A change to a recorded rule or codex field that would make it agree with the text. Only ever a proposal: it is
 * applied when the author chooses "Update canon" and confirms. */
export type Fix =
  | { type: 'end-rule'; ruleId: string; nodeId: string }
  | { type: 'travel'; ruleId: string; amount: number; unit: string }
  | { type: 'unblock'; ruleId: string; word: string }
  | { type: 'field'; entryId: string; fieldId: string; value: string };

/** One finding of the manuscript check. `key` is the same for the same finding in the same passage on every run, so a
 * decision about it holds; `block` is the paragraph (from 0, as the editor counts); `match` the words in the excerpt it
 * rests on; `fixSummary` what "Update canon" would do, as a sentence to confirm. */
export type Issue = {
  key: string;
  severity: Severity;
  category: IssueCategory;
  message: string;
  nodeId: string;
  nodeTitle: string;
  block: number;
  excerpt: string;
  match: string;
  entryIds: string[];
  ruleId: string | null;
  fix: Fix | null;
  fixSummary: string;
};

/** An issue as the original stores and compares it. */
export function issueJson(i: Issue): JsonMap {
  return {
    key: i.key,
    severity: i.severity,
    category: i.category,
    message: i.message,
    nodeId: i.nodeId,
    nodeTitle: i.nodeTitle,
    block: i.block,
    excerpt: i.excerpt,
    match: i.match,
    entryIds: i.entryIds,
    ruleId: i.ruleId,
    fix: i.fix === null ? null : { ...i.fix },
    fixSummary: i.fixSummary,
  };
}

/** Reasons often given for something meant. */
export const intentionalReasons: readonly string[] = [
  'Flashback sequence',
  'Disguise',
  'Magic illusion',
  'Dream or vision',
  'Remembered, not present',
  'Unreliable narrator',
];

/** The fields of an entry that have something in them, labelled and readable, in display order. */
export function filledFields(
  entry: Entry,
  category: Category,
  nameOf: (entryId: string) => string | null,
): { id: string; label: string; text: string }[] {
  const view = viewFields(entry, category);
  const out: { id: string; label: string; text: string }[] = [];
  for (const [def, field] of view.category) {
    if (field !== null) out.push({ id: field.id, label: def.name, text: displayValue(def.type, field.value, nameOf) });
  }
  for (const field of view.own) {
    out.push({
      id: field.id,
      label: field.key.length > 0 ? field.key : 'Untitled field',
      text: displayValue(field.type, field.value, nameOf),
    });
  }
  return out.filter((f) => dartTrim(f.text).length > 0);
}
