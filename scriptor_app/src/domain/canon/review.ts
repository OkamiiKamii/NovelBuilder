// The canon review: statements that may contradict one another, described, never ruled on. A port of
// flutter_app/lib/shared/domain/canon/review.dart.

import { displayValue } from '../codex/fieldValues';
import { localeCompare } from '../exchange/collation';
import { type CanonFact, canonStatusLabel } from '../records/canon';
import { Category } from '../records/category';
import { type Entry, viewFields } from '../records/entry';
import { type StoryNode } from '../records/storyNode';
import { stableSorted } from '../reader/stableSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { nfkdWords } from '../text/fold';
import {
  type Dismissal,
  type FactSource,
  createdAtOf,
  dismissedOf,
  established,
  factSources,
  inPlay,
  quoted,
} from './facts';

/** One thing the canon review noticed about a statement. */
export type Flag = {
  /** Stable within a fact, for lists and for telling flags apart. */
  key: string;
  /** `fact`, `field` or `unpaired`. */
  kind: 'fact' | 'field' | 'unpaired';
  message: string;
  /** The other fact, when the flag is about one. */
  otherId: string | null;
  /** How to set this flag aside, when it can be. */
  dismiss: Dismissal | null;
};

export class FactReview {
  constructor(
    readonly fact: CanonFact,
    readonly flags: Flag[],
  ) {}
}

/** One possible contradiction between two facts, listed once. `stated`: the author linked them, rather than the
 * comparison noticing. */
export type FactPair = { a: CanonFact; b: CanonFact; stated: boolean };

/** Compares wording loosely: case, punctuation and spacing do not make two statements different. */
export function normalize(text: string): string {
  return nfkdWords(text);
}

/** The fields of an entry that have something in them, labelled and readable, in display order (continuity's
 * `filledFields`, kept here so the canon review reads on its own). */
export function filledFields(
  entry: Entry,
  category: Category,
  nameOf: (entryId: string) => string | null,
): { id: string; label: string; text: string }[] {
  const view = viewFields(entry, category);
  return [
    ...view.category.flatMap(([def, field]) =>
      field === null ? [] : [{ id: field.id, label: def.name, text: displayValue(def.type, field.value, nameOf) }],
    ),
    ...view.own.map((field) => ({
      id: field.id,
      label: field.key.length > 0 ? field.key : 'Untitled field',
      text: displayValue(field.type, field.value, nameOf),
    })),
  ].filter((f) => dartTrim(f.text).length > 0);
}

/** "Chapter 4" for where a fact was established, when it names a chapter or scene that still exists. */
function establishedIn(fact: CanonFact, nodes: ReadonlyMap<string, StoryNode>): string | null {
  const source = factSources(fact).find((s) => s.type === 'chapter' && s.refId !== null && nodes.has(s.refId));
  return source === undefined ? null : nodes.get(source.refId!)!.title;
}

function isDismissed(fact: CanonFact, other: Dismissal): boolean {
  return dismissedOf(fact).some((d) =>
    other.factId !== null
      ? d.factId === other.factId
      : d.entryId === other.entryId && normalize(d.field ?? '') === normalize(other.field ?? ''),
  );
}

/** Two facts are about the same thing when they share a subject and are not tied to different codex entries. */
function sameSubject(a: CanonFact, b: CanonFact): boolean {
  if (normalize(a.subject).length === 0 || normalize(a.subject) !== normalize(b.subject)) return false;
  const bIds = b.entryIds;
  return a.entryIds.length === 0 || bIds.length === 0 || a.entryIds.some((id) => bIds.includes(id));
}

/** AUTHORIAL PRIMACY PRINCIPLE (as in the original app): looks for statements that may contradict one another and
 * describes what it sees. It changes nothing, and each message says "appears to". What it notices:
 *  - two statements in play with the same subject, about the same thing, worded differently, one of them established;
 *  - two facts the author has linked as contradicting, while both are in play;
 *  - a statement that differs from a field of the same name on a codex entry it is about. */
export function reviewCanon(
  facts: readonly CanonFact[],
  entries: readonly Entry[],
  nodes: readonly StoryNode[],
  categoryOf?: (key: string) => Category | null | undefined,
): { reviews: FactReview[]; pairs: FactPair[] } {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const flags = new Map<string, Flag[]>(facts.map((f) => [f.id, []]));
  const pairs: FactPair[] = [];
  // Oldest first, so the same contradictions are always listed in the same order.
  const playing = stableSorted(
    facts.filter((f) => inPlay.includes(f.status)),
    (a, b) => {
      const c = createdAtOf(a) < createdAtOf(b) ? -1 : createdAtOf(a) > createdAtOf(b) ? 1 : 0;
      return c !== 0 ? c : localeCompare(a.id, b.id);
    },
  );

  const describe = (other: CanonFact): string => {
    const where = establishedIn(other, nodeById);
    if (established.includes(other.status)) {
      return (
        'This statement appears to conflict with ' +
        `${where !== null ? `established canon in ${where}` : `another statement marked ${canonStatusLabel[other.status]}`}: ` +
        `${quoted(other.statement)}.`
      );
    }
    return `A ${dartToLowerCase(canonStatusLabel[other.status])} statement appears to differ from this one: ${quoted(other.statement)}.`;
  };

  for (let i = 0; i < playing.length; i++) {
    for (let j = i + 1; j < playing.length; j++) {
      const a = playing[i];
      const b = playing[j];
      const stated = a.conflictsWith.includes(b.id) || b.conflictsWith.includes(a.id);
      const noticed =
        (established.includes(a.status) || established.includes(b.status)) &&
        sameSubject(a, b) &&
        normalize(a.statement) !== normalize(b.statement) &&
        normalize(a.statement).length > 0 &&
        normalize(b.statement).length > 0;
      if (!stated && !noticed) continue;
      // A link the author made stays until they remove it; something merely noticed can be set aside.
      if (
        !stated &&
        (isDismissed(a, { factId: b.id, entryId: null, field: null }) ||
          isDismissed(b, { factId: a.id, entryId: null, field: null }))
      ) {
        continue;
      }
      pairs.push({ a, b, stated });
      flags.get(a.id)!.push({
        key: `fact:${b.id}`,
        kind: 'fact',
        otherId: b.id,
        message: describe(b),
        dismiss: stated ? null : { factId: b.id, entryId: null, field: null },
      });
      flags.get(b.id)!.push({
        key: `fact:${a.id}`,
        kind: 'fact',
        otherId: a.id,
        message: describe(a),
        dismiss: stated ? null : { factId: a.id, entryId: null, field: null },
      });
    }
  }

  for (const fact of playing) {
    const subject = normalize(fact.subject);
    const statement = normalize(fact.statement);
    if (subject.length === 0 || statement.length === 0) continue;
    for (const entryId of fact.entryIds) {
      const entry = entryById.get(entryId);
      if (entry === undefined) continue;
      const category = categoryOf?.(entry.category) ?? Category.unknown(entry.category);
      for (const field of filledFields(entry, category, (id) => entryById.get(id)?.name ?? null)) {
        const value = normalize(field.text);
        if (normalize(field.label) !== subject || value.length === 0) continue;
        // "Alex is 19" agrees with a field that says "19".
        if (` ${statement} `.includes(` ${value} `) || ` ${value} `.includes(` ${statement} `)) continue;
        const dismiss: Dismissal = { factId: null, entryId, field: field.label };
        if (isDismissed(fact, dismiss)) continue;
        flags.get(fact.id)!.push({
          key: `field:${entryId}:${normalize(field.label)}`,
          kind: 'field',
          otherId: null,
          message:
            `This statement appears to differ from ${entry.name}'s codex profile, which gives ${field.label} as ` +
            `${quoted(field.text)}.`,
          dismiss,
        });
      }
    }
  }

  for (const fact of facts) {
    if (fact.status === 'conflicting' && flags.get(fact.id)!.length === 0) {
      flags.get(fact.id)!.push({
        key: 'unpaired',
        kind: 'unpaired',
        otherId: null,
        message: 'Marked Conflicting, with no other statement linked or noticed as the one it contradicts.',
        dismiss: null,
      });
    }
  }

  return { reviews: facts.map((f) => new FactReview(f, flags.get(f.id)!)), pairs };
}

/** A source named the way a reader would cite it: "Chapter 14 (paragraph 120)", "Alex (Character profile)". `missing`:
 * the thing it points at is gone; the source is kept as a record. */
export function describeSource(
  source: FactSource,
  look: {
    node: (id: string) => StoryNode | null | undefined;
    entry: (id: string) => Entry | null | undefined;
    event: (id: string) => string | null | undefined;
    category: (key: string) => Category | null | undefined;
  },
): { label: string; missing: boolean } {
  const refId = source.refId;
  if (source.type === 'note' || refId === null) {
    return { label: dartTrim(source.note).length > 0 ? dartTrim(source.note) : 'Unspecified source', missing: false };
  }
  if (source.type === 'chapter') {
    const n = look.node(refId) ?? null;
    return {
      label:
        n !== null
          ? `${n.title}${source.block !== null ? ` (paragraph ${source.block + 1})` : ''}`
          : 'A chapter or scene that was removed',
      missing: n === null,
    };
  }
  if (source.type === 'entry') {
    const e = look.entry(refId) ?? null;
    return {
      label:
        e !== null
          ? `${e.name} (${(look.category(e.category) ?? Category.unknown(e.category)).singular} profile)`
          : 'A codex entry that was removed',
      missing: e === null,
    };
  }
  const name = look.event(refId) ?? null;
  return { label: name !== null ? `${name} (Timeline event)` : 'A timeline event that was removed', missing: name === null };
}
