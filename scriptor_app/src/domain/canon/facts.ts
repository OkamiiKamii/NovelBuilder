// CANON STATEMENTS (as in the original app): what is claimed about the fictional world, where it was established, and
// where it stands. The status is the author's alone; nothing here sets or prefers one. A port of
// flutter_app/lib/shared/domain/canon/facts.dart.

import { type JsonMap, idOrNull, numOrNull, str, strOrNull } from '../json';
import { type CanonFact, type CanonStatus } from '../records/canon';
import { maps } from '../records/jsonRecord';
import { dartTrim } from '../text/dartString';

/** The order statuses are listed in: what needs a decision first, then what is true, then what is set aside. */
export const statusOrder: readonly CanonStatus[] = ['conflicting', 'canon', 'provisional', 'retconned', 'non-canon'];

/** Statuses whose wording is on the record: changing it is a retcon, kept in the history. */
export const established: readonly CanonStatus[] = ['canon', 'conflicting'];

/** Statuses that take part in the story's current truth, and so can contradict it. */
export const inPlay: readonly CanonStatus[] = ['canon', 'conflicting', 'provisional'];

/** Statuses that set something aside: not part of the story as it stands. */
export const setAside: readonly CanonStatus[] = ['retconned', 'non-canon'];

export const factKinds: readonly string[] = ['lore', 'attribute', 'rule', 'story'];
export const factKindLabels: Readonly<Record<string, string>> = {
  lore: 'Lore statement',
  attribute: 'Attribute',
  rule: 'World rule',
  story: 'Story fact',
};

export const sourceTypes: readonly string[] = ['chapter', 'entry', 'event', 'note'];
export const sourceLabels: Readonly<Record<string, string>> = {
  chapter: 'Chapter or scene',
  entry: 'Codex entry',
  event: 'Timeline event',
  note: 'Somewhere else',
};

/** Where a fact was established. Points at a chapter, scene, codex entry or timeline event by id; never copies or
 * changes it. */
export class FactSource {
  constructor(readonly raw: JsonMap) {}

  get id(): string {
    return str(this.raw['id']);
  }
  get type(): string {
    const t = this.raw['type'];
    return typeof t === 'string' && sourceTypes.includes(t) ? t : 'note';
  }
  /** The chapter, scene, entry or event. Null for a free-text source. */
  get refId(): string | null {
    return idOrNull(this.raw['refId']);
  }
  /** For manuscript sources: which paragraph (counting from 0, as the editor does). Null when not pinned to one. */
  get block(): number | null {
    const b = this.raw['block'];
    return typeof b === 'number' && b >= 0 ? Math.trunc(b) : null;
  }
  /** The words that establish the fact, as they stood when the source was recorded. */
  get quote(): string {
    return str(this.raw['quote']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
}

/** A possible contradiction the author has looked at and set aside: with another fact, or with a field on a codex
 * entry. */
export type Dismissal = { factId: string | null; entryId: string | null; field: string | null };

export function factSources(fact: CanonFact): FactSource[] {
  return fact.sources.map((s) => new FactSource(s));
}

export function dismissedOf(fact: CanonFact): Dismissal[] {
  return maps(fact.raw['dismissed']).map((d) => ({
    factId: idOrNull(d['factId']),
    entryId: idOrNull(d['entryId']),
    field: strOrNull(d['field']),
  }));
}

export function notesOf(fact: CanonFact): string {
  return str(fact.raw['notes']);
}

export function createdAtOf(fact: CanonFact): number {
  return numOrNull(fact.raw['createdAt']) ?? 0;
}

/** "Royal Academy foundation: Founded 1,000 years ago", quoted and kept short. */
export function factWords(fact: CanonFact): string {
  const subject = dartTrim(fact.subject);
  return `${subject.length > 0 ? `${subject}: ` : ''}${fact.statement}`;
}

/** Text in quotation marks, at most about ninety characters. */
export function quoted(text: string): string {
  const t = dartTrim(text);
  return `“${t.length > 90 ? `${t.substring(0, 88)}…` : t}”`;
}
