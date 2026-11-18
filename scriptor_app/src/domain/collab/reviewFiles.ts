// REVIEW BY FILE. Collaboration without the app ever touching a network: the owner makes a review copy for one
// person and role, sends it however they like, and brings back the person's feedback file. Nothing in the novel
// changes until the owner accepts it.
//
// A review copy is an ordinary `.novel.json` file holding only what the role may see (`visible`). It is marked on the
// novel's details (`review`, below), and the mark travels with it through every export and import: wherever it is
// opened, the store refuses any change its role may not make (`refusal`).
//
// A port of flutter_app/lib/shared/domain/collab/review_files.dart.

import { type JsonMap, jsonEquals, mapOrNull, numOrNull, str } from '../json';
import { maps } from '../records/jsonRecord';
import { NovelSnapshot, SnapshotError } from '../snapshot/novelSnapshot';
import { PermissionError, type Role, refusal, reviewRoles, roleLabel, roleOf, visible } from './access';
import { CollabError, type CollabWrite } from './collabChanges';
import { type Me, Member } from './records';

/** The mark on a review copy's details: whose novel, for whom, in what role, and what the person has changed since. */
export class ReviewMark {
  constructor(
    /** The owner's novel this is a copy of. */
    readonly novelId: string,
    readonly memberId: string,
    readonly memberName: string,
    readonly role: Role,
    readonly ownerName: string,
    /** The novel's title when the copy was made. */
    readonly title: string,
    readonly madeAt: number,
    /** `<collection>:<id>` of each record the person has added, changed or deleted in this copy: what their feedback
     * file carries back. */
    readonly changed: readonly string[],
  ) {}

  static of(project: JsonMap): ReviewMark | null {
    const m = mapOrNull(project['review']);
    const role = roleOf(m?.['role']);
    if (m === null || role === null || role === 'owner' || role === 'coauthor') return null;
    return new ReviewMark(
      str(m['novelId']),
      str(m['memberId']),
      str(m['memberName']),
      role,
      str(m['ownerName']),
      str(m['title']),
      numOrNull(m['madeAt']) ?? 0,
      (Array.isArray(m['changed']) ? m['changed'] : []).map((k) => str(k)),
    );
  }

  get me(): Me {
    return { id: this.memberId, name: this.memberName, role: this.role };
  }

  toJson(): JsonMap {
    return {
      novelId: this.novelId,
      memberId: this.memberId,
      memberName: this.memberName,
      role: this.role,
      ownerName: this.ownerName,
      title: this.title,
      madeAt: this.madeAt,
      changed: [...this.changed],
    };
  }
}

/** The review copy's own id in a library: one per novel and person, so a newer copy replaces the older. */
export const reviewCopyId = (novelId: string, memberId: string): string => `${novelId}-review-${memberId}`;

const splitKey = (key: string): [string, string] => {
  const at = key.indexOf(':');
  return [key.substring(0, at), key.substring(at + 1)];
};

/** A review copy of `novel` for `member`: every record their role may see, as it may see it, and nothing else. */
export function makeReviewCopy(novel: NovelSnapshot, member: Member, args: { ownerName: string; now: number }): NovelSnapshot {
  if (member.revoked) throw new PermissionError('This person has been removed from the novel.');
  if (!reviewRoles.includes(member.role)) {
    throw new PermissionError(
      `A review copy is made for an editor, a beta reader or a viewer, not a ${roleLabel[member.role]}.`,
    );
  }
  const localId = reviewCopyId(novel.projectId, member.id);
  const lookup = (key: string): JsonMap | null => {
    const [table, id] = splitKey(key);
    return novel.rows(table).find((r) => r['id'] === id) ?? null;
  };
  const project = visible(member.role, member.id, `projects:${novel.projectId}`, novel.project, lookup)!;
  const collections: Record<string, JsonMap[]> = {};
  for (const [name, list] of Object.entries(novel.collections)) {
    const rows: JsonMap[] = [];
    for (const row of list) {
      const seen = visible(member.role, member.id, `${name}:${str(row['id'])}`, row, lookup);
      if (seen === null) continue;
      rows.push(Object.prototype.hasOwnProperty.call(seen, 'projectId') ? { ...seen, projectId: localId } : seen);
    }
    if (rows.length > 0) collections[name] = rows;
  }
  const mark = new ReviewMark(
    novel.projectId,
    member.id,
    member.name,
    member.role,
    args.ownerName,
    str(novel.project['title']),
    args.now,
    [],
  );
  return new NovelSnapshot({
    project: { ...project, id: localId, pinned: false, archived: false, review: mark.toJson() },
    collections,
  });
}

/** A newer review copy taking the place of the one held: what the owner sends wins, except the person's own changes
 * not yet in it (written after their last feedback, or since changed again), which are kept with their mark. */
export function mergeReviewCopy(incoming: NovelSnapshot, held: NovelSnapshot | null): NovelSnapshot {
  const next = ReviewMark.of(incoming.project);
  if (next === null) throw new SnapshotError('it is not a review copy');
  const was = held === null ? null : ReviewMark.of(held.project);
  if (held === null || was === null) return incoming;
  if (was.novelId !== next.novelId || was.memberId !== next.memberId) return incoming;
  if (next.madeAt < was.madeAt) {
    throw new SnapshotError('it is an older review copy than the one already here, so nothing was changed');
  }
  let result = incoming;
  const stillChanged: string[] = [];
  for (const key of was.changed) {
    const [table, id] = splitKey(key);
    const mine = held.rows(table).find((r) => r['id'] === id) ?? null;
    const theirs = incoming.rows(table).find((r) => r['id'] === id) ?? null;
    if (mine === null) {
      // Deleted here: stays deleted while the owner still has it.
      if (theirs !== null) {
        result = result.withRows(
          table,
          result.rows(table).filter((r) => r['id'] !== id),
        );
        stillChanged.push(key);
      }
      continue;
    }
    const newer =
      theirs === null ||
      (numOrNull(mine['updatedAt'] ?? mine['at']) ?? 0) > (numOrNull(theirs['updatedAt'] ?? theirs['at']) ?? 0);
    if (newer && !jsonEquals(mine, theirs)) {
      result = result.putRow(table, { ...mine, projectId: incoming.projectId });
      stillChanged.push(key);
    }
  }
  return result.copyWith({
    project: {
      ...result.project,
      review: new ReviewMark(
        next.novelId,
        next.memberId,
        next.memberName,
        next.role,
        next.ownerName,
        next.title,
        next.madeAt,
        stillChanged,
      ).toJson(),
    },
  });
}

export const feedbackFormat = 'novel-builder/review-feedback';

/** The feedback file of a review copy: each record the person added, changed or deleted, nothing else. */
export function makeFeedback(copy: NovelSnapshot, now: number): JsonMap {
  const mark = ReviewMark.of(copy.project);
  if (mark === null) throw new CollabError('This novel is not a review copy.');
  return {
    format: feedbackFormat,
    version: 1,
    novelId: mark.novelId,
    title: mark.title,
    memberId: mark.memberId,
    memberName: mark.memberName,
    role: mark.role,
    copyMadeAt: mark.madeAt,
    sentAt: now,
    changes: mark.changed.map((key) => {
      const [table, id] = splitKey(key);
      const row = copy.rows(table).find((r) => r['id'] === id) ?? null;
      return {
        collection: table,
        id,
        row:
          row === null
            ? null
            : Object.prototype.hasOwnProperty.call(row, 'projectId')
              ? { ...row, projectId: mark.novelId }
              : { ...row },
      };
    }),
  };
}

/** The feedback file's text, indented by two spaces as the Flutter app writes it. */
export function feedbackFileText(feedback: JsonMap): string {
  return JSON.stringify(feedback, null, 2);
}

/** What a feedback file would do, worked out before anything is written. */
export class FeedbackPreview {
  constructor(
    readonly novelId: string,
    readonly member: Member,
    readonly sentAt: number,
    /** The records to write, each only if the stored record is still as read. */
    readonly writes: readonly CollabWrite[],
    /** Changes the person's role may not make, with the reason; none of them is written. */
    readonly refused: readonly { what: string; reason: string }[],
    /** Changes the novel already holds. */
    readonly unchanged: number,
  ) {}

  count(collection: string, where?: (row: JsonMap) => boolean): number {
    return this.writes.filter((w) => w.collection === collection && w.value !== null && (where === undefined || where(w.value)))
      .length;
  }
}

const kinds: Readonly<Record<string, string>> = {
  comments: 'A comment',
  suggestions: 'A suggestion',
  activity: 'A line of the activity record',
};

/** Reads a feedback file against the owner's novel. Every change is judged by the role the OWNER gave the person (not
 * what the file says), with the rule the original app's relay applied; only conversations, suggestions and the
 * activity record ever come back. Nothing is written here. */
export function readFeedback(
  text: string,
  args: { novelId: string; members: readonly Member[]; stored: (collection: string, id: string) => JsonMap | null },
): FeedbackPreview {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new CollabError('This file is not a feedback file: it could not be read. Nothing was changed.');
  }
  const file = mapOrNull(data);
  if (file === null || file['format'] !== feedbackFormat) {
    throw new CollabError('This file is not a feedback file from a review copy. Nothing was changed.');
  }
  if ((numOrNull(file['version']) ?? 0) > 1) {
    throw new CollabError('This feedback file was made by a newer version of Novel Builder. Nothing was changed.');
  }
  if (file['novelId'] !== args.novelId) {
    throw new CollabError(
      `This feedback is about another novel (“${str(file['title'], 'untitled')}”). Open that novel to bring it in. Nothing was changed.`,
    );
  }
  const member = args.members.find((m) => m.id === file['memberId']) ?? null;
  if (member === null) {
    throw new CollabError(
      `This feedback is from ${str(file['memberName'], 'someone')}, who is not on this novel’s team. Nothing was changed.`,
    );
  }
  if (member.revoked) {
    throw new CollabError(
      `${member.name} has been removed from this novel, so their feedback is not taken in. Nothing was changed.`,
    );
  }
  const writes: CollabWrite[] = [];
  const refused: { what: string; reason: string }[] = [];
  let unchanged = 0;
  for (const change of maps(file['changes'])) {
    const collection = str(change['collection']);
    const id = str(change['id']);
    const row = mapOrNull(change['row']);
    const what = kinds[collection] ?? `A record in ${collection}`;
    if (!Object.prototype.hasOwnProperty.call(kinds, collection)) {
      refused.push({ what, reason: 'Only conversations, suggestions and the activity record come back in feedback.' });
      continue;
    }
    if (row !== null && (row['id'] !== id || (Object.prototype.hasOwnProperty.call(row, 'projectId') && row['projectId'] !== args.novelId))) {
      refused.push({ what, reason: 'It does not belong to this novel.' });
      continue;
    }
    const before = args.stored(collection, id);
    if (jsonEquals(before, row) || (before === null && row === null)) {
      unchanged++;
      continue;
    }
    const reason = refusal(member.role, member.id, `${collection}:${id}`, before, row);
    if (reason !== null) {
      refused.push({ what, reason });
      continue;
    }
    writes.push({ collection, id, value: row, before });
  }
  return new FeedbackPreview(args.novelId, member, numOrNull(file['sentAt']) ?? 0, writes, refused, unchanged);
}

/** A new person on the team. */
export function newMember(args: {
  projectId: string;
  name: string;
  email: string;
  role: Role;
  now: number;
  id: string;
}): JsonMap {
  if (args.name.trim().length === 0) throw new CollabError('Give the person a name.');
  if (!reviewRoles.includes(args.role)) throw new CollabError('Choose Editor, Beta reader or Viewer.');
  return {
    id: args.id,
    projectId: args.projectId,
    name: args.name.trim(),
    email: args.email.trim(),
    role: args.role,
    status: 'invited',
    createdAt: args.now,
    joinedAt: null,
    lastSyncAt: null,
    updatedAt: args.now,
  };
}

/** Whether a stored novel's details mark it as a review copy (any value Scriptor reads as one). */
export const isReviewCopy = (project: JsonMap): boolean => ReviewMark.of(project) !== null;


/** The pages a review copy opens on: the library, the review workspace (Write), the book reader, the team page (which
 * says it is the owner's) and the settings. Everything else is the author's own working pages, which a review cannot
 * change (review_gate.dart's reviewPageAllowed). */
export function reviewPageAllowed(path: string): boolean {
  return path === '/' || path === '/write' || path === '/write/read' || path === '/review/team' || path === '/settings';
}
