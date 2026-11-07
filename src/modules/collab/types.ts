import type { Role } from '@/modules/sync/access';
import type { DocJSON } from '@/modules/manuscript/types';

/** Someone on the project, as the team sees them. The owner keeps this list; the relay holds the invitations themselves. */
export interface Member {
  id: string;
  projectId: string;
  name: string;
  /** Kept so the owner can send the invitation; other roles are never sent it. */
  email: string;
  role: Role;
  status: 'invited' | 'active' | 'revoked';
  createdAt: number;
  joinedAt: number | null;
  lastSyncAt: number | null;
  updatedAt: number;
}

/** What a conversation is about. */
export type CommentTarget =
  /** A stretch of manuscript text: the words, and where they were (paragraph number, and the offset within it). */
  | { kind: 'text'; chapterId: string; quote: string; block: number; offset: number }
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'entry'; entryId: string }
  | { kind: 'thread'; threadId: string }
  | { kind: 'beat'; threadId: string; beatId: string };

export const REACTIONS = ['Loved this', 'Laughed', 'Tense', 'Moved', 'Confused', 'Lost interest', 'Did not believe it'] as const;
export const FEEDBACK_QUESTIONS = [
  { key: 'pacing', label: 'Pacing' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'engagement', label: 'Wanted to keep reading' },
] as const;

/**
 * One message. The first of a conversation has `parentId` null and carries
 * the conversation's state; replies point at it. Every message is signed
 * with who wrote it and in what role, as it was when written.
 */
export interface Comment {
  id: string;
  projectId: string;
  /** The first message's id (its own, for the first). */
  threadId: string;
  /** Who began the conversation. A reader sees only conversations they began. */
  threadAuthorId: string;
  parentId: string | null;
  target: CommentTarget;
  /** `chapter:<id>`, `entry:<id>` or `thread:<id>`: what to list this under. */
  targetKey: string;
  /** The name of what it is about, as it was when written. */
  targetLabel: string;
  kind: 'comment' | 'reaction' | 'feedback';
  body: string;
  /** For a feedback form: a 1-5 answer to each question. */
  ratings?: Record<string, number>;
  authorId: string;
  authorName: string;
  authorRole: Role;
  status: 'open' | 'resolved';
  resolvedBy: string | null;
  resolvedAt: number | null;
  /** Removed by its writer while others had replied: the conversation stays, the words go. */
  deleted?: boolean;
  /** What it was turned into, when an author acted on it. */
  converted?: { kind: 'task' | 'note' | 'beat'; label: string; to: string; by: string; at: number };
  createdAt: number;
  updatedAt: number;
}

export interface FieldChange {
  /** `name`, `summary`, `description`, or `field:<key>` for one of the entry's own fields. */
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface Verdict {
  verdict: 'accepted' | 'rejected';
  by: string;
  byName: string;
  at: number;
}

/**
 * OWNER FINAL AUTHORITY RULE
 * A change someone proposes without having made it. A text suggestion
 * holds the chapter as its writer found it and as they would have it; a
 * field suggestion holds values for a codex entry. Neither touches the
 * manuscript or the codex. Only an author's verdict does, one change at a
 * time, and the verdict is recorded here with their name.
 */
export interface Suggestion {
  id: string;
  projectId: string;
  kind: 'text' | 'fields';
  /** The chapter or codex entry. */
  targetId: string;
  targetLabel: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  note: string;
  base?: DocJSON;
  proposed?: DocJSON;
  changes?: FieldChange[];
  status: 'pending' | 'accepted' | 'rejected';
  /** For text: a verdict per change (see `textHunks`). For fields: one under `all`. */
  decisions: Record<string, Verdict>;
  decidedBy: string | null;
  decidedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** One line of the record of who did what. Written by the person's own device as they do it, and never rewritten by anyone else. */
export interface Activity {
  id: string;
  projectId: string;
  at: number;
  actorId: string;
  actorName: string;
  actorRole: Role;
  /** Reads after the name: "edited", "commented on", "updated the profile of". */
  verb: string;
  table: string;
  rowId: string;
  label: string;
  /** How many times in a row; saving a chapter every few seconds is one line, not hundreds. */
  count: number;
}
