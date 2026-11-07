import { filledFields, unknownCategory } from '@/modules/codex/schema';
import type { Category, LoreEntry } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { ESTABLISHED, IN_PLAY, STATUS_LABELS, type CanonFact, type Dismissal, type FactSource } from './types';

export interface Flag {
  /** Stable within a fact, for lists and for telling flags apart. */
  key: string;
  kind: 'fact' | 'field' | 'unpaired';
  message: string;
  /** The other fact, when the flag is about one. */
  otherId?: string;
  /** How to set this flag aside, when it can be. */
  dismiss?: Dismissal;
}

export interface FactReview {
  fact: CanonFact;
  flags: Flag[];
}

/** One possible contradiction between two facts, listed once. */
export interface Pair {
  a: CanonFact;
  b: CanonFact;
  /** The author linked them, rather than the comparison noticing. */
  stated: boolean;
}

export interface CanonReview {
  reviews: FactReview[];
  pairs: Pair[];
}

/** Compares wording loosely: case, punctuation and spacing do not make two statements different. */
export const normalize = (text: string): string => text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const quoted = (text: string): string => `“${text.trim().length > 90 ? `${text.trim().slice(0, 88)}…` : text.trim()}”`;

/** "Chapter 4" for where a fact was established, when it names a chapter or scene that still exists. */
function establishedIn(fact: CanonFact, nodes: Map<string, StoryNode>): string | null {
  const source = fact.sources.find((s) => s.type === 'chapter' && s.refId && nodes.has(s.refId));
  return source ? nodes.get(source.refId!)!.title : null;
}

const isDismissed = (fact: CanonFact, other: Dismissal): boolean =>
  fact.dismissed.some((d) => (other.factId ? d.factId === other.factId : d.entryId === other.entryId && normalize(d.field ?? '') === normalize(other.field ?? '')));

/** Two facts are about the same thing when they share a subject and are not tied to different codex entries. */
function sameSubject(a: CanonFact, b: CanonFact): boolean {
  if (!normalize(a.subject) || normalize(a.subject) !== normalize(b.subject)) return false;
  return a.entryIds.length === 0 || b.entryIds.length === 0 || a.entryIds.some((id) => b.entryIds.includes(id));
}

/**
 * AUTHORIAL PRIMACY PRINCIPLE
 * Looks for statements that may contradict one another and describes what it
 * sees. It is a pure function: it changes nothing, and each message says
 * "appears to", because only the author knows whether two statements really
 * disagree, which of them stands, or whether it matters.
 *
 * What it notices:
 *  - two statements in play (canon, conflicting or provisional) with the same
 *    subject, about the same thing, worded differently, at least one of them
 *    established;
 *  - two facts the author has linked as contradicting, while both are in play;
 *  - a statement that differs from a field of the same name on a codex entry
 *    it is about.
 */
export function reviewCanon(facts: CanonFact[], entries: LoreEntry[], nodes: StoryNode[], categoryOf: (key: string) => Category | undefined = () => undefined): CanonReview {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const flags = new Map<string, Flag[]>(facts.map((f) => [f.id, []]));
  const pairs: Pair[] = [];
  // Oldest first, so the same contradictions are always listed in the same order.
  const inPlay = facts.filter((f) => IN_PLAY.includes(f.status)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const describe = (other: CanonFact): string => {
    const where = establishedIn(other, nodeById);
    if (ESTABLISHED.includes(other.status)) return `This statement appears to conflict with ${where ? `established canon in ${where}` : `another statement marked ${STATUS_LABELS[other.status]}`}: ${quoted(other.statement)}.`;
    return `A ${STATUS_LABELS[other.status].toLowerCase()} statement appears to differ from this one: ${quoted(other.statement)}.`;
  };

  for (let i = 0; i < inPlay.length; i++) {
    for (let j = i + 1; j < inPlay.length; j++) {
      const [a, b] = [inPlay[i], inPlay[j]];
      const stated = a.conflictsWith.includes(b.id) || b.conflictsWith.includes(a.id);
      const noticed = (ESTABLISHED.includes(a.status) || ESTABLISHED.includes(b.status)) && sameSubject(a, b) && normalize(a.statement) !== normalize(b.statement) && normalize(a.statement) !== '' && normalize(b.statement) !== '';
      if (!stated && !noticed) continue;
      // A link the author made stays until they remove it; something merely noticed can be set aside.
      if (!stated && (isDismissed(a, { factId: b.id }) || isDismissed(b, { factId: a.id }))) continue;
      pairs.push({ a, b, stated });
      flags.get(a.id)!.push({ key: `fact:${b.id}`, kind: 'fact', otherId: b.id, message: describe(b), dismiss: stated ? undefined : { factId: b.id } });
      flags.get(b.id)!.push({ key: `fact:${a.id}`, kind: 'fact', otherId: a.id, message: describe(a), dismiss: stated ? undefined : { factId: a.id } });
    }
  }

  for (const fact of inPlay) {
    const subject = normalize(fact.subject);
    const statement = normalize(fact.statement);
    if (!subject || !statement) continue;
    for (const entryId of fact.entryIds) {
      const entry = entryById.get(entryId);
      if (!entry) continue;
      const fields = filledFields(entry, categoryOf(entry.category) ?? unknownCategory(entry.category), (id) => entryById.get(id)?.name);
      for (const field of fields) {
        const value = normalize(field.text);
        if (normalize(field.label) !== subject || !value) continue;
        // "Alex is 19" agrees with a field that says "19".
        if (` ${statement} `.includes(` ${value} `) || ` ${value} `.includes(` ${statement} `)) continue;
        const dismiss = { entryId, field: field.label };
        if (isDismissed(fact, dismiss)) continue;
        flags.get(fact.id)!.push({ key: `field:${entryId}:${normalize(field.label)}`, kind: 'field', message: `This statement appears to differ from ${entry.name}'s codex profile, which gives ${field.label} as ${quoted(field.text)}.`, dismiss });
      }
    }
  }

  for (const fact of facts) {
    if (fact.status === 'conflicting' && flags.get(fact.id)!.length === 0) {
      flags.get(fact.id)!.push({ key: 'unpaired', kind: 'unpaired', message: 'Marked Conflicting, with no other statement linked or noticed as the one it contradicts.' });
    }
  }

  return { reviews: facts.map((fact) => ({ fact, flags: flags.get(fact.id)! })), pairs };
}

export interface SourceView {
  source: FactSource;
  /** "Chapter 14 (paragraph 120)", "Alex (Character profile)". */
  label: string;
  /** The thing it points at is gone. The source is kept as a record. */
  missing: boolean;
}

/** Names a source the way a reader would cite it. */
export function describeSource(source: FactSource, lookup: { node: (id: string) => StoryNode | undefined; entry: (id: string) => LoreEntry | undefined; event: (id: string) => { name: string } | undefined; category: (key: string) => Category | undefined }): SourceView {
  if (source.type === 'note' || !source.refId) return { source, label: source.note.trim() || 'Unspecified source', missing: false };
  if (source.type === 'chapter') {
    const node = lookup.node(source.refId);
    return { source, label: node ? `${node.title}${source.block !== null ? ` (paragraph ${source.block + 1})` : ''}` : 'A chapter or scene that was removed', missing: !node };
  }
  if (source.type === 'entry') {
    const entry = lookup.entry(source.refId);
    return { source, label: entry ? `${entry.name} (${(lookup.category(entry.category) ?? unknownCategory(entry.category)).singular} profile)` : 'A codex entry that was removed', missing: !entry };
  }
  const event = lookup.event(source.refId);
  return { source, label: event ? `${event.name} (Timeline event)` : 'A timeline event that was removed', missing: !event };
}
