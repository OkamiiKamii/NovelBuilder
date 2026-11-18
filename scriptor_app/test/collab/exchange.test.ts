// Review by file, end to end at the level of the library: the owner makes a review copy for a person and role, the
// person comments and suggests in it (and cannot change the book), their feedback file comes back, every change in it
// is judged by the role the owner gave them, and an accepted change lands on the chapter as it is now. A port of
// flutter_app/test/shared/domain/review_exchange_test.dart.

import { join } from 'node:path';

import { openLibrary } from '../../src/data/library';
import { type NovelStore, deleteRow, putRow } from '../../src/data/novelStore';
import { PermissionError, type Role } from '../../src/domain/collab/access';
import {
  CollabError,
  type CollabWrite,
  decideHunk,
  newComment,
  saveTextSuggestion,
} from '../../src/domain/collab/collabChanges';
import { Member, ownerId, Suggestion } from '../../src/domain/collab/records';
import {
  ReviewMark,
  makeFeedback,
  makeReviewCopy,
  mergeReviewCopy,
  newMember,
  readFeedback,
} from '../../src/domain/collab/reviewFiles';
import { type JsonMap, mapOrNull, str } from '../../src/domain/json';
import { blockTexts, textToDoc } from '../../src/domain/prose';
import { maps } from '../../src/domain/records/jsonRecord';
import { NovelSnapshot, SnapshotError, snapshotFormat } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';
import { memoryLibrary } from '../nodeSql';

const novelId = '70465ae9-f720-4346-8683-298ce006ed1a';
const chapterId = '4fee0c33-10ac-413e-a828-941049a681a0';

let clock = 1800000000000;
let ids = 0;
const id = () => `id-${ids++}`;
const now = () => (clock += 1000);

let owner: NovelStore;
let reviewer: NovelStore;

beforeEach(() => {
  owner = openLibrary(memoryLibrary(), () => clock).novels;
  reviewer = openLibrary(memoryLibrary(), () => clock).novels;
  owner.putNovel(NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, 'made-in-the-app.novel.json'))));
});

function write(store: NovelStore, project: string, writes: CollabWrite[]): void {
  store.writeRows(
    project,
    writes.map((w) => (w.value === null ? deleteRow(w.collection, w.id, w.before) : putRow(w.collection, w.value, w.before))),
  );
}

function addMember(name: string, role: Role): Member {
  const row = newMember({ projectId: novelId, name, email: '', role, now: now(), id: id() });
  owner.writeRows(novelId, [putRow('members', row, null)]);
  return new Member(row);
}

const copyFor = (m: Member) => makeReviewCopy(owner.load(novelId)!, m, { ownerName: 'The author', now: now() });

test('a review copy holds only what the role may see', () => {
  const full = owner.load(novelId)!;
  const reader = copyFor(addMember('Ria', 'reader'));
  const editor = copyFor(addMember('Sam', 'editor'));
  const viewer = copyFor(addMember('Vic', 'viewer'));
  // A beta reader gets the manuscript only: no codex, plans, secrets, team emails or private history.
  expect(reader.rows('chapters').length).toBe(full.rows('chapters').length);
  expect(reader.rows('chapterContents').length).toBe(full.rows('chapterContents').length);
  for (const c of ['loreEntries', 'chapterPlans', 'plotThreads', 'characterSecrets', 'chapterRevisions', 'goals']) {
    expect([c, reader.rows(c).length]).toEqual([c, 0]);
  }
  expect(reader.rows('chapters').every((r) => str(r['summary']) === '' && str(r['notes']) === '')).toBe(true);
  expect(reader.rows('members').map((m) => m['name'])).toEqual(['Ria']);
  // An editor sees the codex and plans, but never an entry's private notes or the secrets.
  expect(editor.rows('loreEntries').length).toBe(full.rows('loreEntries').length);
  expect(editor.rows('loreEntries').every((e) => str(e['notes']) === '')).toBe(true);
  expect(full.rows('loreEntries').some((e) => str(e['notes']) !== '')).toBe(true);
  expect(editor.rows('characterSecrets')).toHaveLength(0);
  expect(editor.rows('chapterPlans').length).toBeGreaterThan(0);
  expect(editor.rows('members').every((m) => str(m['email']) === '')).toBe(true);
  // A viewer reads only what is marked final or published: this novel has none yet.
  expect(viewer.rows('chapterContents')).toHaveLength(0);
  // Each is marked, has its own id, and is the standard backup format.
  expect(ReviewMark.of(reader.project)!.role).toBe('reader');
  expect(reader.projectId).not.toBe(novelId);
  expect(reader.toJson()['format']).toBe(snapshotFormat);
  expect(NovelSnapshot.fromJson(JSON.parse(JSON.stringify(reader.toJson()))).project['review']).toBeTruthy();
});

test('in a review copy the book cannot be changed; comments and (for an editor) suggestions can', () => {
  const ria = addMember('Ria', 'reader');
  const copy = copyFor(ria);
  reviewer.putNovel(copy);
  const local = copy.projectId;
  const text = reviewer.row(local, 'chapterContents', chapterId)!;
  expect(() => reviewer.writeRows(local, [putRow('chapterContents', { ...text, doc: textToDoc('Mine now.') })])).toThrow(
    PermissionError,
  );
  expect(reviewer.row(local, 'chapterContents', chapterId)).toEqual(text);
  const chapter = reviewer.row(local, 'chapters', chapterId)!;
  expect(() => reviewer.writeRows(local, [putRow('chapters', { ...chapter, title: 'Renamed' })])).toThrow(PermissionError);
  // The whole-novel save path refuses the same.
  const before = reviewer.loadPart(local, ['chapters'])!;
  expect(() => reviewer.saveChanges(before, before.putRow('chapters', { ...chapter, title: 'Renamed' }))).toThrow(PermissionError);
  const me = ReviewMark.of(copy.project)!.me;
  write(
    reviewer,
    local,
    newComment(me, {
      projectId: local,
      target: { kind: 'text', chapterId, quote: 'x', block: 0, offset: 0 },
      targetLabel: 'One',
      body: 'Lovely.',
      now: now(),
      newId: id,
    }),
  );
  expect(ReviewMark.of(reviewer.novel(local)!.raw)!.changed).toHaveLength(2);
  // A reader does not suggest.
  expect(() =>
    saveTextSuggestion(me, {
      projectId: local,
      chapterId,
      chapterTitle: 'One',
      base: textToDoc('a'),
      proposed: textToDoc('b'),
      existing: [],
      now: now(),
      newId: id,
    }),
  ).toThrow(PermissionError);
  // The novel's own details cannot be changed either; what the person keeps for themselves can.
  expect(() => reviewer.putNovelDetails({ ...reviewer.novel(local)!.raw, title: 'Mine' })).toThrow(PermissionError);
  reviewer.putNovelDetails({ ...reviewer.novel(local)!.raw, pinned: true });
});

test("feedback comes back: the person's changes are taken in, anything their role may not do is refused", () => {
  const sam = addMember('Sam', 'editor');
  const copy = copyFor(sam);
  reviewer.putNovel(copy);
  const local = copy.projectId;
  const me = ReviewMark.of(copy.project)!.me;
  const base = reviewer.row(local, 'chapterContents', chapterId)!['doc'] as JsonMap;
  const paragraphs = maps(base['content']);
  const proposed = { ...base, content: [paragraphs[0], maps(textToDoc('A better middle.')['content'])[0], ...paragraphs.slice(2)] };
  write(
    reviewer,
    local,
    saveTextSuggestion(me, {
      projectId: local,
      chapterId,
      chapterTitle: 'The chapter',
      base,
      proposed,
      existing: [],
      now: now(),
      newId: id,
    }),
  );
  write(
    reviewer,
    local,
    newComment(me, {
      projectId: local,
      target: { kind: 'chapter', chapterId },
      targetLabel: 'The chapter',
      body: 'Strong ending.',
      now: now(),
      newId: id,
    }),
  );
  const feedback = makeFeedback(reviewer.load(local)!, now());
  // Tampering with the file by hand: a change to the text itself, a comment signed as the owner, and a suggestion
  // already marked accepted. Each is refused; the honest changes still come in.
  const changes: JsonMap[] = [...maps(feedback['changes'])];
  const text = owner.row(novelId, 'chapterContents', chapterId)!;
  const commentRow = mapOrNull(changes.find((c) => c['collection'] === 'comments')!['row'])!;
  const suggestionRow = mapOrNull(changes.find((c) => c['collection'] === 'suggestions')!['row'])!;
  changes.push(
    { collection: 'chapterContents', id: chapterId, row: { ...text, doc: textToDoc('Hacked.') } },
    {
      collection: 'comments',
      id: 'forged',
      row: { ...commentRow, id: 'forged', threadId: 'forged', authorId: ownerId, threadAuthorId: ownerId },
    },
    { collection: 'suggestions', id: 'pre-accepted', row: { ...suggestionRow, id: 'pre-accepted', status: 'accepted' } },
  );
  const preview = readFeedback(JSON.stringify({ ...feedback, changes }), {
    novelId,
    members: owner.rowsIn(novelId, 'members').map((r) => new Member(r)),
    stored: (c, i) => owner.row(novelId, c, i),
  });
  expect(preview.member.name).toBe('Sam');
  expect(preview.count('comments')).toBe(1);
  expect(preview.count('suggestions')).toBe(1);
  expect(preview.refused.map((r) => r.reason)).toEqual([
    'Only conversations, suggestions and the activity record come back in feedback.',
    'A comment is signed by whoever wrote it.',
    'A suggestion starts out pending, in its writer’s name.',
  ]);
  expect(owner.row(novelId, 'chapterContents', chapterId)).toEqual(text);
  write(owner, novelId, [...preview.writes]);
  expect(owner.row(novelId, 'chapterContents', chapterId)).toEqual(text);

  // The owner accepts the change: it lands on the chapter as it is now.
  const owned = { id: ownerId, name: 'The author', role: 'owner' as const };
  const suggestion = new Suggestion(owner.rowsIn(novelId, 'suggestions').find((s) => s['authorId'] === sam.id)!);
  const hunk = suggestion.openHunks;
  expect(hunk).toHaveLength(1);
  const decided = decideHunk(owned, suggestion, hunk[0].id, {
    accept: true,
    currentDoc: owner.row(novelId, 'chapterContents', chapterId)!['doc'],
    now: now(),
    newId: id,
  });
  expect(blockTexts(decided.doc)[1]).toBe('A better middle.');
  expect(new Suggestion(decided.writes[0].value!).status).toBe('accepted');
});

test('a change to a passage rewritten since is not applied, and says so', () => {
  const sam = addMember('Sam', 'editor');
  const me = { id: sam.id, name: 'Sam', role: 'editor' as const };
  const base = owner.row(novelId, 'chapterContents', chapterId)!['doc'] as JsonMap;
  const proposed = { ...base, content: [maps(textToDoc('Changed first.')['content'])[0], ...maps(base['content']).slice(1)] };
  const s = new Suggestion(
    saveTextSuggestion(me, {
      projectId: novelId,
      chapterId,
      chapterTitle: 'X',
      base,
      proposed,
      existing: [],
      now: now(),
      newId: id,
    })[0].value!,
  );
  const rewritten = {
    ...base,
    content: [maps(textToDoc('The author rewrote this.')['content'])[0], ...maps(base['content']).slice(1)],
  };
  const author = { id: ownerId, name: 'A', role: 'owner' as const };
  expect(() =>
    decideHunk(author, s, s.openHunks[0].id, { accept: true, currentDoc: rewritten, now: now(), newId: id }),
  ).toThrow(/rewritten since/);
  // Rejecting is always possible.
  const rejected = decideHunk(author, s, s.openHunks[0].id, { accept: false, currentDoc: rewritten, now: now(), newId: id });
  expect(rejected.doc).toBeNull();
  expect(new Suggestion(rejected.writes[0].value!).status).toBe('rejected');
});

test('feedback from someone removed from the team, or about another novel, changes nothing', () => {
  const ria = addMember('Ria', 'reader');
  const copy = copyFor(ria);
  reviewer.putNovel(copy);
  const feedback = JSON.stringify(makeFeedback(copy, now()));
  const row = owner.row(novelId, 'members', ria.id)!;
  owner.writeRows(novelId, [putRow('members', { ...row, status: 'revoked' }, row)]);
  const members = owner.rowsIn(novelId, 'members').map((r) => new Member(r));
  expect(() => readFeedback(feedback, { novelId, members, stored: (c, i) => owner.row(novelId, c, i) })).toThrow(/removed/);
  expect(() => readFeedback(feedback, { novelId: 'another', members, stored: () => null })).toThrow(/another novel/);
  expect(() => readFeedback('{"format":"novel-builder/project"}', { novelId, members, stored: () => null })).toThrow(CollabError);
  expect(() => makeReviewCopy(owner.load(novelId)!, new Member({ ...row, status: 'revoked' }), { ownerName: 'A', now: 1 })).toThrow(
    PermissionError,
  );
});

test("a newer review copy keeps the person's unsent work; an older one is refused", () => {
  const ria = addMember('Ria', 'reader');
  const first = copyFor(ria);
  reviewer.putNovel(first);
  const local = first.projectId;
  const me = ReviewMark.of(first.project)!.me;
  write(
    reviewer,
    local,
    newComment(me, {
      projectId: local,
      target: { kind: 'chapter', chapterId },
      targetLabel: 'One',
      body: 'Not sent yet.',
      now: now(),
      newId: id,
    }),
  );
  const second = copyFor(ria);
  const merged = mergeReviewCopy(second, reviewer.load(local));
  expect(merged.rows('comments').map((c) => c['body'])).toContain('Not sent yet.');
  expect(ReviewMark.of(merged.project)!.changed).toHaveLength(2);
  expect(() => mergeReviewCopy(first, merged)).toThrow(SnapshotError);
});
