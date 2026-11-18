// RECORD CHECK (FEATURES.md #310–#311): how the novel's records point at one another, checked by stated rules. Each
// finding comes from one rule and the records it rests on; the same records give the same findings. Nothing changes
// until the author chooses a fix: a reference taken out (a connection with a missing end goes whole), a field pointed
// at the entry it names, two look-alikes marked "Not duplicates", or merged. A merge is shown in full first (which to
// keep, what would point at it, what is added, what is not kept), goes ahead only once the name of the one merged away
// is typed, and keeps a restore point first, so it can be undone.
//
// The pure parts of flutter_app/lib/features/review/record_check_page.dart.

import { connectionStatusLabel } from '../../codex/screens/connections';
import { formatNumber } from '../../desk/format';
import {
  type BrokenReference,
  type DuplicatePair,
  type UnfitEntry,
  type UnresolvedField,
  type UnsuitedKind,
  brokenReferences,
  duplicateCandidates,
  fixable,
  flaggedConnections,
  goesWhole,
  unfitEntries,
  unresolvedFields,
  unsuitedKinds,
} from '../../integrity/rules';
import { type MergePlan, tableWords } from '../../integrity/fixes';

import type { Connection } from '../../model/connections';
import { EntityRef } from '../../model/entityRef';
import type { StoryModel } from '../../model/storyModel';
import { canonStatusOf } from '../../records/canon';
import { strings } from '../../records/jsonRecord';
import { ReviewItem, decisionCloses } from '../../records/review';
import type { NovelSnapshot } from '../../snapshot/novelSnapshot';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { worldWords } from './warnings';

const plural = (n: number, one: string, many: string = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

export type RecordCheck = {
  broken: BrokenReference[];
  unresolved: UnresolvedField[];
  unfit: UnfitEntry[];
  unsuited: UnsuitedKind[];
  openDuplicates: DuplicatePair[];
  decidedDuplicates: { pair: DuplicatePair; decision: ReviewItem }[];
  flagged: Connection[];
  /** How many are still to look at. */
  open: number;
  subtitle: string;
};

/** The whole check, as the page shows it. `title`: the novel's. */
export function recordCheck(snapshot: NovelSnapshot, model: StoryModel, title: string): RecordCheck {
  const decisions = snapshot.rows('continuityResolutions').map((r) => new ReviewItem(r));
  const decision = (key: string) => decisions.find((d) => d.key === key) ?? null;
  const aliases = new Map<string, string[]>();
  for (const p of snapshot.rows('characterProfiles')) {
    if (typeof p['entryId'] === 'string') aliases.set(p['entryId'], strings(p['aliases']));
  }
  const broken = brokenReferences(model, snapshot.rows('structureMarkers'));
  const unresolved = unresolvedFields(model);
  const unfit = unfitEntries(model);
  const unsuited = unsuitedKinds(model);
  const duplicates = duplicateCandidates([...model.entries.values()], aliases);
  const closes = (key: string) => {
    const d = decision(key);
    return d !== null && decisionCloses(d.decision);
  };
  const openDuplicates = duplicates.filter((d) => !closes(d.key));
  const decidedDuplicates = duplicates.filter((d) => closes(d.key)).map((pair) => ({ pair, decision: decision(pair.key)! }));
  const open = broken.length + unresolved.length + unfit.length + unsuited.length + openDuplicates.length;
  return {
    broken,
    unresolved,
    unfit,
    unsuited,
    openDuplicates,
    decidedDuplicates,
    flagged: flaggedConnections(model),
    open,
    subtitle:
      `${title} · ${open === 0 ? 'Nothing to look at' : `${formatNumber(open)} to look at`}` +
      `${decidedDuplicates.length > 0 ? ` · ${formatNumber(decidedDuplicates.length)} decided` : ''}` +
      ` · checked ${plural(model.entries.size, 'entry', 'entries')}, ${plural(model.nodes.size, 'chapter or scene', 'chapters and scenes')}, ${plural(model.events.size, 'event')}`,
  };
}

export const recordCheckWords = {
  title: 'Record check',
  broken: (n: number) => `References to records that no longer exist (${n})`,
  brokenCaption:
    'The rule: a reference must name a record that exists. Connections, relationships, fields, links in the ' +
    'text, plans and appearance records, events, plot threads, system sheets and structural markers are ' +
    'checked.',
  unresolved: (n: number) => `References that name nothing (${n})`,
  unresolvedCaption:
    'The rule: a field that refers to an entry (“Leader”, “Owner”) must hold an entry, not words. Words are ' +
    'kept as they are until you point the field at an entry.',
  unfit: (n: number) => `Values that do not fit their fields (${n})`,
  unfitCaption: 'The rule: each value fits its field as its category defines it. Values are never changed from here.',
  unsuited: (n: number) => `Views set up on fields that no longer suit (${n})`,
  unsuitedCaption:
    'The rule: a view a kind of record is set up for reads fields that still suit it. Only settings you made ' +
    'are listed; a view never set up is not a problem. Settings are kept, and work again once the field suits.',
  duplicates: (n: number) => `Records that look like duplicates (${n})`,
  duplicatesCaption:
    'The rules: two entries of the same category whose names are the same once capitals, accents, ' +
    'punctuation and a leading “The” are set aside; or one whose name is the other’s alias. Nothing is ' +
    'merged unless you say so.',
  flagged: (n: number) => `Connections marked disputed or invalid (${n})`,
  flaggedCaption:
    'Connections you recorded and marked Disputed, or Invalid (retconned, or not canon). Kept as you marked ' + 'them; listed so they are not forgotten.',
  none: 'None.',
  openWhereKept: 'Open where it is kept',
  removeWhole: 'Remove this connection',
  removeReference: 'Take this reference out',
  inText: 'Change it where it is kept: text is never changed from here.',
  noSuchEntry: 'No entry has that name.',
  pointAt: (name: string) => `Point it at ${name}`,
  open: (name: string) => `Open ${name}`,
  openOther: 'Open the other',
  openSettings: 'Open these settings',
  merge: 'Merge…',
  notDuplicates: 'Not duplicates',
  decidedHeading: 'Decided: not duplicates',
  reopen: 'Reopen',
  failed: (what: string, why: string) => `${what} did not happen, and nothing was changed: ${why}`,
} as const;

/** A broken reference, as the page says it. */
export function brokenLine(b: BrokenReference): {
  message: string;
  detail: string;
  /** The record that holds it, when it has a page. */
  whereKept: EntityRef | null;
  fix: string | null;
} {
  return {
    message: worldWords(`${b.says}.`),
    detail: worldWords(`Kept in ${b.where}.`),
    whereKept:
      b.table === 'chapterPlans' || b.table === 'chapters'
        ? new EntityRef('node', b.rowId)
        : b.table === 'loreEntries'
          ? new EntityRef('entry', b.rowId)
          : null,
    fix: fixable.has(b.table) ? (goesWhole.has(b.table) ? recordCheckWords.removeWhole : recordCheckWords.removeReference) : null,
  };
}

export const unresolvedLine = (u: UnresolvedField): string => `${u.entry.name}: “${u.fieldName}” holds “${u.value}”, which names no entry.`;

/** "Mira mentor of Kai", and its status. */
export function flaggedLine(c: Connection, name: (r: EntityRef) => string): { message: string; detail: string } {
  const label = c.label;
  return {
    message: `${name(c.from)} ${label.length === 0 ? 'related to' : `${dartToLowerCase(label[0])}${label.substring(1)}`} ${name(c.to)}`,
    detail: connectionStatusLabel(canonStatusOf(c.canon) ?? 'canon'),
  };
}

/** What "Not duplicates" keeps. */
export const notDuplicatesMessage = (d: DuplicatePair): string => `${d.a.name} and ${d.b.name} are not duplicates.`;

// -------------------------------------------------------------------------------------------------- the merge

export const mergeWords = {
  title: 'Merge two entries',
  which: 'Which one to keep',
  keep: (name: string) => `Keep “${name}”`,
  intro: (plan: MergePlan) =>
    `“${plan.mergeName}” is merged into “${plan.keepName}”, and then deleted. Everything that pointed at it will ` + `point at “${plan.keepName}”:`,
  nothingPoints: '•  Nothing points at it.',
  repointed: (r: { table: string; rows: number }) => `•  ${tableWords(r.table)}: ${formatNumber(r.rows)}`,
  added: (plan: MergePlan) => `Added to “${plan.keepName}”:`,
  notKept: 'Not kept:',
  restorePoint:
    'A restore point is kept first (Settings → Restore points), so it can be undone. The words of your ' + 'chapters are not changed; their links follow the one kept.',
  typeName: (name: string) => `Type “${name}” to go ahead`,
  cancel: 'Cancel',
  go: 'Merge them',
  names: (merge: string, keep: string) => `“${merge}” into “${keep}”`,
  merged: (names: string) => `Merged ${names}.`,
  undo: 'Undo',
  failed: (why: string) => `Merging did not happen, and nothing was changed: ${why}`,
} as const;

/** The merge goes ahead only once the name of the one merged away is typed. */
export function mergeConfirmed(typed: string, mergeName: string): boolean {
  return dartTrim(typed) === dartTrim(mergeName);
}

/** The category key a kind's settings open on. */
export const kindsPath = (key: string): string => `/organize/kinds?kind=${encodeURIComponent(key)}`;

