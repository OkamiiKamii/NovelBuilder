export const CANON_STATUSES = ['canon', 'provisional', 'non-canon', 'retconned', 'conflicting'] as const;
export type CanonStatus = (typeof CANON_STATUSES)[number];
export const STATUS_LABELS: Record<CanonStatus, string> = { canon: 'Canon', provisional: 'Provisional', 'non-canon': 'Non-Canon', retconned: 'Retconned', conflicting: 'Conflicting' };
export const STATUS_HINTS: Record<CanonStatus, string> = {
  canon: 'Confirmed: officially true in the story as it stands.',
  provisional: 'A working idea, not settled yet.',
  'non-canon': 'Deliberately left out: a discarded draft or alternate version.',
  retconned: 'Was true once, and has been officially replaced.',
  conflicting: 'Contradicts another statement, and is waiting for your decision.',
};
/** The order statuses are listed in: what needs a decision first, then what is true, then what is set aside. */
export const STATUS_ORDER: CanonStatus[] = ['conflicting', 'canon', 'provisional', 'retconned', 'non-canon'];
/** Statuses whose wording is on the record: changing it is a retcon, kept in the history. */
export const ESTABLISHED: CanonStatus[] = ['canon', 'conflicting'];
/** Statuses that take part in the story's current truth, and so can contradict it. */
export const IN_PLAY: CanonStatus[] = ['canon', 'conflicting', 'provisional'];

export const FACT_KINDS = ['lore', 'attribute', 'rule', 'story'] as const;
export type FactKind = (typeof FACT_KINDS)[number];
export const KIND_LABELS: Record<FactKind, string> = { lore: 'Lore statement', attribute: 'Attribute', rule: 'World rule', story: 'Story fact' };

export const SOURCE_TYPES = ['chapter', 'entry', 'event', 'note'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_LABELS: Record<SourceType, string> = { chapter: 'Chapter or scene', entry: 'Codex entry', event: 'Timeline event', note: 'Somewhere else' };

/** Where a fact was established. Points at a chapter, scene, codex entry or timeline event by id; never copies or changes it. */
export interface FactSource {
  id: string;
  type: SourceType;
  /** The chapter, scene, entry or event. Null for a free-text source. */
  refId: string | null;
  /** For manuscript sources: which paragraph (counting from 0, as the editor does). Null when not pinned to one. */
  block: number | null;
  /** The words that establish the fact, as they stood when the source was recorded. */
  quote: string;
  /** Anything else: "author's notebook, p. 12", "decided in the March outline". */
  note: string;
  createdAt: number;
}

/**
 * One step in a fact's history. Entries are only ever added, and their
 * wording and dates are never changed; the author can add to the reason.
 */
export interface FactChange {
  id: string;
  at: number;
  /**
   * `created`  the fact was first recorded.
   * `status`   the author moved it from one canon status to another.
   * `retcon`   an established statement was replaced; `statement` is the archived wording.
   * `reworded` the wording was corrected without changing what is true.
   */
  kind: 'created' | 'status' | 'retcon' | 'reworded';
  /** The wording at this point: for a retcon or rewording, the wording that was replaced. */
  statement: string;
  /** What replaced it, for a retcon or rewording. */
  newStatement?: string;
  fromStatus?: CanonStatus;
  toStatus?: CanonStatus;
  reason: string;
}

/** A possible contradiction the author has looked at and set aside: with another fact, or with a field on a codex entry. */
export interface Dismissal {
  factId?: string;
  entryId?: string;
  field?: string;
}

/**
 * A statement about the fictional world and where it stands.
 *
 * AUTHORIAL PRIMACY PRINCIPLE
 * `status` is set by the author and by nobody else. `review.ts` compares
 * facts and returns observations in neutral words; it never writes a status,
 * resolves a contradiction or prefers one statement over another.
 *
 * Nothing here holds or changes manuscript text or codex entries: facts point
 * at them by id.
 */
export interface CanonFact {
  id: string;
  projectId: string;
  /** What the fact is about, in a few words: "Royal Academy foundation". */
  subject: string;
  /** What is claimed: "Founded 1,000 years ago". */
  statement: string;
  kind: FactKind;
  status: CanonStatus;
  /** Codex entries this fact is about; it is shown on their profiles. */
  entryIds: string[];
  sources: FactSource[];
  /** Other facts the author has said this one contradicts. Either side may hold the link. */
  conflictsWith: string[];
  /** For a retconned fact: the fact that replaced it. */
  replacedById: string | null;
  dismissed: Dismissal[];
  /** Oldest first. Append-only. */
  history: FactChange[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type FactChanges = Partial<Pick<CanonFact, 'subject' | 'statement' | 'kind' | 'entryIds' | 'replacedById' | 'notes'>>;
export type SourceInput = Partial<Pick<FactSource, 'type' | 'refId' | 'block' | 'quote' | 'note'>>;
