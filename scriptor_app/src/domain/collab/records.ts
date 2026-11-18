// The team's records: who is on it, what they said (conversations, reactions, feedback forms), what they proposed
// (suggestions) and the record of who did what. A port of flutter_app/lib/shared/domain/collab/records.dart.

import { type JsonMap, mapOrNull, numOrNull, str } from '../json';
import { JsonRecord, maps } from '../records/jsonRecord';
import { type Role, roleOf } from './access';
import { type Hunk, textHunks } from './hunks';

/** The owner's id on every device: the novel's own author. A review copy's person has the id the owner gave them. */
export const ownerId = 'owner';

/** Who the person at this device is, in one novel: its owner, or, in a review copy, the person it was made for. */
export type Me = { readonly id: string; readonly name: string; readonly role: Role };

export const reactions: readonly string[] = ['Loved this', 'Laughed', 'Tense', 'Moved', 'Confused', 'Lost interest', 'Did not believe it'];
export const feedbackQuestions: readonly { key: string; label: string }[] = [
  { key: 'pacing', label: 'Pacing' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'engagement', label: 'Wanted to keep reading' },
];

/** What a conversation is about, as stored (`target` on a comment):
 * `{kind: text, chapterId, quote, block, offset}`, `{kind: chapter, chapterId}`, `{kind: entry, entryId}`,
 * `{kind: thread, threadId}` or `{kind: beat, threadId, beatId}`. */
export function targetKeyOf(target: JsonMap): string {
  switch (target['kind']) {
    case 'entry':
      return `entry:${str(target['entryId'])}`;
    case 'thread':
    case 'beat':
      return `thread:${str(target['threadId'])}`;
    default:
      return `chapter:${str(target['chapterId'])}`;
  }
}

/** Someone on the novel's team, kept by the owner. */
export class Member extends JsonRecord {
  get name(): string {
    return str(this.raw['name']);
  }
  get email(): string {
    return str(this.raw['email']);
  }
  get role(): Role {
    return roleOf(this.raw['role']) ?? 'viewer';
  }
  /** `invited`, `active` or `revoked`. */
  get status(): string {
    return str(this.raw['status'], 'invited');
  }
  get revoked(): boolean {
    return this.status === 'revoked';
  }
  /** When feedback from them was last brought in (the original's last sync), or null. */
  get lastSyncAt(): number | null {
    return numOrNull(this.raw['lastSyncAt']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
}

/** One message. The first of a conversation has no parent and carries the conversation's state; replies point at it. */
export class Comment extends JsonRecord {
  get threadId(): string {
    return str(this.raw['threadId'], this.id);
  }
  get threadAuthorId(): string {
    return str(this.raw['threadAuthorId']);
  }
  get parentId(): string | null {
    const p = this.raw['parentId'];
    return typeof p === 'string' ? p : null;
  }
  get isRoot(): boolean {
    return this.parentId === null;
  }
  get target(): JsonMap {
    return mapOrNull(this.raw['target']) ?? {};
  }
  get targetKey(): string {
    return str(this.raw['targetKey']);
  }
  get targetLabel(): string {
    return str(this.raw['targetLabel']);
  }
  /** `comment`, `reaction` or `feedback`. */
  get kind(): string {
    return str(this.raw['kind'], 'comment');
  }
  get body(): string {
    return str(this.raw['body']);
  }
  get ratings(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [k, v] of Object.entries(mapOrNull(this.raw['ratings']) ?? {})) {
      const n = numOrNull(v);
      if (n !== null) out.set(k, n);
    }
    return out;
  }
  get authorId(): string {
    return str(this.raw['authorId']);
  }
  get authorName(): string {
    return str(this.raw['authorName']);
  }
  get authorRole(): Role {
    return roleOf(this.raw['authorRole']) ?? 'viewer';
  }
  get resolved(): boolean {
    return this.raw['status'] === 'resolved';
  }
  get resolvedBy(): string | null {
    const r = this.raw['resolvedBy'];
    return typeof r === 'string' ? r : null;
  }
  get deleted(): boolean {
    return this.raw['deleted'] === true;
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  get updatedAt(): number {
    return numOrNull(this.raw['updatedAt']) ?? 0;
  }
  /** The words a comment on a passage was about. */
  get quote(): string {
    return this.target['kind'] === 'text' ? str(this.target['quote']) : '';
  }
}

export type Thread = { root: Comment; replies: Comment[] };

/** Dart's List.sort is not stable but these sorts compare one number; equal times keep their stored order here. */
const byCreated = (a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt;

/** Conversations, oldest first, each with its replies; only those about `targetKey` when it is given. */
export function threadsOf(comments: Iterable<Comment>, targetKey?: string | null): Thread[] {
  const rows = [...comments].filter((c) => targetKey === undefined || targetKey === null || c.targetKey === targetKey);
  const roots = rows.filter((c) => c.isRoot).sort(byCreated);
  return roots.map((root) => ({
    root,
    replies: rows.filter((c) => c.threadId === root.id && !c.isRoot).sort(byCreated),
  }));
}

export type FieldChange = { field: string; label: string; from: string; to: string };

/** A proposed change to a chapter's text (`kind: text`, with the chapter as found and as its writer would have it) or
 * to a world entry (`kind: fields`). Neither touches the book: only an author's verdict does, one change at a time. */
export class Suggestion extends JsonRecord {
  get isText(): boolean {
    return this.raw['kind'] === 'text';
  }
  get targetId(): string {
    return str(this.raw['targetId']);
  }
  get targetLabel(): string {
    return str(this.raw['targetLabel']);
  }
  get authorId(): string {
    return str(this.raw['authorId']);
  }
  get authorName(): string {
    return str(this.raw['authorName']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
  get base(): unknown {
    return this.raw['base'];
  }
  get proposed(): unknown {
    return this.raw['proposed'];
  }
  get changes(): FieldChange[] {
    return maps(this.raw['changes']).map((c) => ({
      field: str(c['field']),
      label: str(c['label']),
      from: str(c['from']),
      to: str(c['to']),
    }));
  }
  /** `pending`, `accepted` or `rejected`. */
  get status(): string {
    return str(this.raw['status'], 'pending');
  }
  get decisions(): JsonMap {
    return mapOrNull(this.raw['decisions']) ?? {};
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  get updatedAt(): number {
    return numOrNull(this.raw['updatedAt']) ?? 0;
  }
  /** The changes of a text suggestion that no author has ruled on yet. */
  get openHunks(): Hunk[] {
    if (!this.isText) return [];
    const decided = this.decisions;
    return textHunks(this.base, this.proposed).filter((h) => !Object.prototype.hasOwnProperty.call(decided, h.id));
  }
  /** Whether anything in it is still waiting for a verdict. */
  get isOpen(): boolean {
    return this.isText ? this.openHunks.length > 0 : this.status === 'pending';
  }
}

/** One line of the record of who did what. */
export class Activity extends JsonRecord {
  get at(): number {
    return numOrNull(this.raw['at']) ?? 0;
  }
  get actorId(): string {
    return str(this.raw['actorId']);
  }
  get actorName(): string {
    return str(this.raw['actorName']);
  }
  get actorRole(): Role {
    return roleOf(this.raw['actorRole']) ?? 'viewer';
  }
  get verb(): string {
    return str(this.raw['verb']);
  }
  get label(): string {
    return str(this.raw['label']);
  }
  get count(): number {
    return Math.trunc(numOrNull(this.raw['count']) ?? 1);
  }
  get table(): string {
    return str(this.raw['table']);
  }
  get rowId(): string {
    return str(this.raw['rowId']);
  }
}
