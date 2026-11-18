// The team's records of the open novel (who is on it, conversations, suggestions, the activity record), read again
// after every change; who the person at this device is in it (its owner, or the person a review copy was made for);
// and everything people do with them, each change saved whole or not at all and only if the records it changes are
// still as read. A port of flutter_app/lib/features/collab/collab_providers.dart.

import { useMemo } from 'react';

import type { Library } from '../../data/library';
import { deleteRow, putRow } from '../../data/novelStore';
import { openNovelSettingKey } from '../../data/settingsStore';
import { PermissionError, type Role } from '../../domain/collab/access';
import {
  CollabError,
  type CollabWrite,
  decideFields,
  decideHunk,
  newComment,
  removeComment,
  reply,
  saveTextSuggestion,
  setThreadStatus,
  suggestFields,
  withdrawSuggestion,
} from '../../domain/collab/collabChanges';
import { Activity, Comment, type FieldChange, type Me, Member, ownerId, Suggestion, type Thread, threadsOf } from '../../domain/collab/records';
import {
  type FeedbackPreview,
  ReviewMark,
  feedbackFileText,
  makeFeedback,
  makeReviewCopy,
  mergeReviewCopy,
  newMember,
  readFeedback,
} from '../../domain/collab/reviewFiles';
import { newId } from '../../domain/ids';
import { type JsonMap, numOrNull, str } from '../../domain/json';
import type { NovelSnapshot } from '../../domain/snapshot/novelSnapshot';
import { useLibrary, useLibraryRevision } from '../LibraryContext';

/** Who the person at this device is in a novel: the person a review copy was made for, or the novel's owner. */
export function meIn(project: JsonMap): Me {
  const mark = ReviewMark.of(project);
  if (mark !== null) return mark.me;
  const author = str(project['author']).trim();
  return { id: ownerId, name: author === '' ? 'The author' : author, role: 'owner' };
}

export type CollabData = {
  novelId: string;
  project: JsonMap;
  me: Me;
  mark: ReviewMark | null;
  members: Member[];
  comments: Comment[];
  suggestions: Suggestion[];
  activity: Activity[];
  threads: (targetKey?: string | null) => Thread[];
  open: Suggestion[];
};

/** The review mark of the open novel, when it is a review copy; null for the person's own novel. */
export function useReviewMark(): ReviewMark | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  return useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    if (typeof id !== 'string') return null;
    const novel = lib.novels.novel(id);
    return novel === null ? null : ReviewMark.of(novel.raw);
  }, [lib, revision]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function readCollab(lib: Library, novelId: string): CollabData | null {
  const novel = lib.novels.novel(novelId);
  if (novel === null) return null;
  const comments = lib.novels.rowsIn(novelId, 'comments').map((r) => new Comment(r));
  const suggestions = lib.novels
    .rowsIn(novelId, 'suggestions')
    .map((r) => new Suggestion(r))
    .sort((a, b) => a.createdAt - b.createdAt);
  return {
    novelId,
    project: novel.raw,
    me: meIn(novel.raw),
    mark: ReviewMark.of(novel.raw),
    members: lib.novels
      .rowsIn(novelId, 'members')
      .map((r) => new Member(r))
      .sort((a, b) => a.createdAt - b.createdAt),
    comments,
    suggestions,
    activity: lib.novels
      .rowsIn(novelId, 'activity')
      .map((r) => new Activity(r))
      .sort((a, b) => b.at - a.at),
    threads: (targetKey) => threadsOf(comments, targetKey),
    open: suggestions.filter((s) => s.isOpen),
  };
}

/** The team's records of the open novel, refreshed after every change. */
export function useCollab(): CollabData | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  return useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    if (typeof id !== 'string' || !lib.novels.exists(id)) return null;
    return readCollab(lib, id);
  }, [lib, revision]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Words for why a change could not be made, or null when it is not one of the collaboration refusals. */
export function collabProblem(e: unknown): string | null {
  if (e instanceof PermissionError || e instanceof CollabError) return e.message;
  if (e instanceof Error && e.name === 'StaleWriteError') {
    return 'This was changed elsewhere in the meantime, so nothing was saved. Look again and retry.';
  }
  return null;
}

/** File names as the Flutter app makes them: no characters a file system refuses, spaces folded. */
const safe = (s: string): string =>
  s
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ');

/** Everything people do with conversations, suggestions, the team and the files that carry them. */
export class CollabActions {
  constructor(
    readonly lib: Library,
    readonly novelId: string,
  ) {}

  private get now(): number {
    return Date.now();
  }

  private data(): CollabData {
    const d = readCollab(this.lib, this.novelId);
    if (d === null) throw new CollabError('Open a novel first.');
    return d;
  }

  private write(writes: readonly CollabWrite[]): void {
    if (writes.length === 0) return;
    this.lib.novels.writeRows(
      this.novelId,
      writes.map((w) => (w.value === null ? deleteRow(w.collection, w.id, w.before) : putRow(w.collection, w.value, w.before))),
    );
  }

  /** A comment, a reaction or a feedback form about `target`. */
  comment(target: JsonMap, args: { targetLabel: string; body: string; kind?: string; ratings?: Record<string, number> }): void {
    const d = this.data();
    this.write(
      newComment(d.me, {
        projectId: d.novelId,
        target,
        targetLabel: args.targetLabel,
        body: args.body,
        kind: args.kind,
        ratings: args.ratings ?? null,
        now: this.now,
        newId,
        activity: d.activity,
      }),
    );
  }

  reply(root: Comment, body: string): void {
    const d = this.data();
    this.write(reply(d.me, root, { body, now: this.now, newId, activity: d.activity }));
  }

  setResolved(root: Comment, resolved: boolean): void {
    const d = this.data();
    this.write(setThreadStatus(d.me, root, { resolved, now: this.now, newId, activity: d.activity }));
  }

  remove(row: Comment): void {
    const d = this.data();
    this.write(removeComment(d.me, row, d.comments, this.now));
  }

  /** Keeps this person's suggested text for a chapter (or withdraws it, when the text is back as it was found). */
  saveText(args: { chapterId: string; chapterTitle: string; base: JsonMap; proposed: JsonMap }): void {
    const d = this.data();
    this.write(
      saveTextSuggestion(d.me, {
        projectId: d.novelId,
        chapterId: args.chapterId,
        chapterTitle: args.chapterTitle,
        base: args.base,
        proposed: args.proposed,
        existing: d.suggestions.filter((s) => s.targetId === args.chapterId),
        now: this.now,
        newId,
        activity: d.activity,
      }),
    );
  }

  suggestEntry(args: { entryId: string; entryName: string; changes: FieldChange[]; note?: string }): void {
    const d = this.data();
    this.write(
      suggestFields(d.me, {
        projectId: d.novelId,
        entryId: args.entryId,
        entryName: args.entryName,
        changes: args.changes,
        note: args.note,
        now: this.now,
        newId,
        activity: d.activity,
      }),
    );
  }

  withdraw(s: Suggestion): void {
    const d = this.data();
    this.write([withdrawSuggestion(d.me, s)]);
  }

  /** Accepts or rejects one change of a text suggestion. An accepted change is saved through the ordinary save, so the
   * text it replaces goes to version history; the change and its verdict are saved together, or neither. */
  decideText(s: Suggestion, hunkId: string, accept: boolean): void {
    const d = this.data();
    const content = this.lib.novels.row(d.novelId, 'chapterContents', s.targetId);
    const result = decideHunk(d.me, s, hunkId, {
      accept,
      currentDoc: content?.['doc'],
      now: this.now,
      newId,
      activity: d.activity,
    });
    this.lib.db.transaction(() => {
      if (result.doc !== null) {
        this.lib.manuscript.save(d.novelId, s.targetId, result.doc, {
          baseRev: Math.trunc(numOrNull(content?.['rev']) ?? 0),
          reason: 'suggestion',
          label: `Before accepting a change suggested by ${s.authorName}`,
        });
      }
      this.write(result.writes);
    });
  }

  decideEntry(s: Suggestion, accept: boolean): void {
    const d = this.data();
    this.write(
      decideFields(d.me, s, {
        accept,
        entry: this.lib.novels.row(d.novelId, 'loreEntries', s.targetId),
        now: this.now,
        newId,
        activity: d.activity,
      }),
    );
  }

  // ------------------------------------------------------------------------------------------------ the team (owner)

  addMember(args: { name: string; email: string; role: Role }): Member {
    const d = this.data();
    if (d.me.role !== 'owner') throw new PermissionError('Only the owner manages who is on the project.');
    const row = newMember({ projectId: d.novelId, name: args.name, email: args.email, role: args.role, now: this.now, id: newId() });
    this.lib.novels.writeRows(d.novelId, [putRow('members', row, null)]);
    return new Member(row);
  }

  updateMember(m: Member, changes: JsonMap): void {
    this.lib.novels.writeRows(this.novelId, [putRow('members', { ...m.toJson(), ...changes, updatedAt: this.now }, m.toJson())]);
  }

  /** A review copy for `m`: the file's name and text, to hand to wherever the author chooses. */
  reviewCopyFile(m: Member): { name: string; text: string } {
    const d = this.data();
    const novel = this.lib.novels.load(d.novelId);
    if (novel === null) throw new CollabError('The novel is no longer in the library.');
    const copy = makeReviewCopy(novel, m, { ownerName: d.me.name, now: this.now });
    const title = safe(str(d.project['title'])) === '' ? 'Untitled novel' : safe(str(d.project['title']));
    return {
      name: `${title} - review copy for ${safe(m.name)}.novel.json`,
      text: JSON.stringify(copy.toJson(this.now), null, 2),
    };
  }

  /** Reads a feedback file against the open novel. Nothing is written. */
  previewFeedback(text: string): FeedbackPreview {
    const d = this.data();
    if (d.me.role !== 'owner') throw new CollabError('Feedback comes back to the novel’s owner. This is a review copy.');
    return readFeedback(text, {
      novelId: d.novelId,
      members: d.members,
      stored: (collection, id) => this.lib.novels.row(d.novelId, collection, id),
    });
  }

  /** Takes in what a previewed feedback file holds, and notes when feedback last came from that person. */
  importFeedback(preview: FeedbackPreview): void {
    const d = this.data();
    const member = d.members.find((m) => m.id === preview.member.id);
    if (member === undefined) throw new CollabError('That person is no longer on the team.');
    this.lib.db.transaction(() => {
      this.write(preview.writes);
      this.lib.novels.writeRows(d.novelId, [
        putRow(
          'members',
          {
            ...member.toJson(),
            status: 'active',
            joinedAt: member.raw['joinedAt'] ?? this.now,
            lastSyncAt: this.now,
            updatedAt: this.now,
          },
          member.toJson(),
        ),
      ]);
    });
  }

  // ------------------------------------------------------------------------------ a review copy (the person reviewing)

  /** This review copy's feedback file: its name and text, to hand to wherever the person chooses. */
  feedbackFile(): { name: string; text: string } {
    const d = this.data();
    const copy = this.lib.novels.load(d.novelId);
    if (copy === null) throw new CollabError('The review copy is no longer here.');
    const mark = ReviewMark.of(copy.project);
    if (mark === null) throw new CollabError('This novel is not a review copy.');
    const title = safe(mark.title) === '' ? 'Untitled novel' : safe(mark.title);
    return {
      name: `${title} - feedback from ${safe(mark.memberName)}.json`,
      text: feedbackFileText(makeFeedback(copy, this.now)),
    };
  }
}

/** Brings a review copy into the library: a first one as it is; a newer one in place of the one held, keeping the
 * person's own changes not yet sent. Returns the review copy's id. */
export function openReviewCopy(lib: Library, incoming: NovelSnapshot): string {
  const held = lib.novels.load(incoming.projectId);
  lib.novels.putNovel(mergeReviewCopy(incoming, held));
  return incoming.projectId;
}

export function useCollabActions(novelId: string | null): CollabActions | null {
  const lib = useLibrary();
  return useMemo(() => (novelId === null ? null : new CollabActions(lib, novelId)), [lib, novelId]);
}
