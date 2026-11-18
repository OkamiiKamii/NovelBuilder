// Review by file all the way round, through what the screens run (src/ui/collab/useCollab.ts's CollabActions and
// openReviewCopy, the Library's import preview): the owner adds Sam and makes a review copy; Sam opens it through the
// ordinary import, comments on a paragraph, reacts, fills in the feedback form and suggests a change; the author's
// book is untouched; the owner brings the feedback in (seeing what it holds), replies, and accepts the change, which
// lands on the chapter with the earlier text in its version history; Sam is then active. The logic of
// flutter_app/test/features/collab/collab_screens_test.dart; and the review gate's pages.

import { join } from 'node:path';

import { openLibrary } from '../../src/data/library';
import { openNovelSettingKey } from '../../src/data/settingsStore';
import { PermissionError } from '../../src/domain/collab/access';
import { docWithParagraphs, paragraphTexts } from '../../src/domain/collab/collabChanges';
import { Comment, Member, Suggestion } from '../../src/domain/collab/records';
import { ReviewMark, reviewPageAllowed } from '../../src/domain/collab/reviewFiles';
import { type JsonMap, mapOrNull } from '../../src/domain/json';
import { blockTexts } from '../../src/domain/prose';
import { maps } from '../../src/domain/records/jsonRecord';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { CollabActions, meIn, openReviewCopy, readCollab } from '../../src/ui/collab/useCollab';
import { flutterFixturesDir, readJson } from '../fixtures';
import { memoryLibrary } from '../nodeSql';

const novelId = '70465ae9-f720-4346-8683-298ce006ed1a';
const chapterId = '4fee0c33-10ac-413e-a828-941049a681a0';

test('review by file, all the way round: copy, comments and suggestions, feedback, accepted changes', () => {
  const owner = openLibrary(memoryLibrary());
  const reviewer = openLibrary(memoryLibrary());
  owner.novels.putNovel(NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, 'made-in-the-app.novel.json'))));
  const before = JSON.stringify(owner.novels.row(novelId, 'chapterContents', chapterId));
  const ownerActions = new CollabActions(owner, novelId);

  const sam = ownerActions.addMember({ name: 'Sam', email: '', role: 'editor' });
  const file = ownerActions.reviewCopyFile(sam);
  expect(file.name).toContain('review copy for Sam');
  const copy = JSON.parse(file.text) as JsonMap;
  expect(mapOrNull(mapOrNull(copy['project'])?.['review'])?.['role']).toBe('editor');
  expect(mapOrNull(copy['collections'])?.['characterSecrets']).toEqual([]);

  // Sam opens it through the ordinary import: it is a review copy, opened as one.
  const preview = reviewer.backups.previewImport(file.text);
  const mark = ReviewMark.of(preview.snapshot.project)!;
  expect(mark.ownerName).toBe('The author');
  const local = openReviewCopy(reviewer, preview.snapshot);
  reviewer.settings.write(openNovelSettingKey, local);
  const samActions = new CollabActions(reviewer, local);
  expect(meIn(reviewer.novels.novel(local)!.raw)).toEqual({ id: sam.id, name: 'Sam', role: 'editor' });

  // A comment on the second paragraph, a reaction, and a feedback form.
  const doc = reviewer.novels.row(local, 'chapterContents', chapterId)!['doc'] as JsonMap;
  const texts = paragraphTexts(doc);
  samActions.comment({ kind: 'text', chapterId, quote: texts[1], block: 1, offset: 0 }, { targetLabel: 'Chapter 1', body: 'This line sings.' });
  samActions.comment({ kind: 'chapter', chapterId }, { targetLabel: 'Chapter 1', body: 'Loved this', kind: 'reaction' });
  samActions.comment({ kind: 'chapter', chapterId }, { targetLabel: 'Chapter 1', body: '', kind: 'feedback', ratings: { pacing: 3, clarity: 3, engagement: 3 } });
  // A suggested change to the second paragraph.
  const blocks = maps(doc['content']);
  const proposed = docWithParagraphs(
    doc,
    blocks.map((b, i) => ({ original: b, text: i === 1 ? 'A sharper second paragraph.' : null })),
  );
  samActions.saveText({ chapterId, chapterTitle: 'Chapter 1', base: doc, proposed });
  expect(ReviewMark.of(reviewer.novels.novel(local)!.raw)!.changed.length).toBeGreaterThan(0);
  // The copy's book itself cannot be changed.
  expect(() =>
    reviewer.manuscript.save(local, chapterId, proposed, { baseRev: Number(reviewer.novels.row(local, 'chapterContents', chapterId)!['rev'] ?? 0) }),
  ).toThrow(PermissionError);
  const feedback = samActions.feedbackFile();
  expect(feedback.name).toBe('Made in the App - feedback from Sam.json');
  // The author's book is untouched by all of it.
  expect(JSON.stringify(owner.novels.row(novelId, 'chapterContents', chapterId))).toBe(before);

  // The owner brings it in.
  const incoming = ownerActions.previewFeedback(feedback.text);
  expect(incoming.member.name).toBe('Sam');
  expect(incoming.count('comments', (r) => r['kind'] === 'comment' && r['parentId'] === null)).toBe(1);
  expect(incoming.count('comments', (r) => r['kind'] === 'reaction')).toBe(1);
  expect(incoming.count('comments', (r) => r['kind'] === 'feedback')).toBe(1);
  expect(incoming.count('suggestions')).toBe(1);
  ownerActions.importFeedback(incoming);
  expect(JSON.stringify(owner.novels.row(novelId, 'chapterContents', chapterId))).toBe(before);

  // A reply to Sam's comment.
  const data = readCollab(owner, novelId)!;
  const root = data.threads().find((t) => t.root.body === 'This line sings.')!.root;
  ownerActions.reply(root, 'Thank you!');
  expect(readCollab(owner, novelId)!.comments.some((c: Comment) => c.body === 'Thank you!')).toBe(true);

  // The suggested change, accepted: it lands on the chapter, the earlier text kept in its history.
  const s = readCollab(owner, novelId)!.open.find((x: Suggestion) => x.isText)!;
  ownerActions.decideText(s, s.openHunks[0].id, true);
  const now = owner.novels.row(novelId, 'chapterContents', chapterId)!;
  expect(blockTexts(now['doc'])[1]).toBe('A sharper second paragraph.');
  expect(owner.novels.rowsIn(novelId, 'chapterRevisions').some((r) => r['nodeId'] === chapterId)).toBe(true);
  expect(readCollab(owner, novelId)!.open).toHaveLength(0);
  // Sam is now active, with the time of the feedback.
  const member = new Member(owner.novels.row(novelId, 'members', sam.id)!);
  expect(member.status).toBe('active');
  expect(member.lastSyncAt).not.toBeNull();
  // A review copy's feedback comes back to the owner only.
  expect(() => samActions.previewFeedback(feedback.text)).toThrow(/review copy/);
});

test('a review copy opens only on the review’s own pages', () => {
  for (const path of ['/', '/write', '/write/read', '/review/team', '/settings']) expect([path, reviewPageAllowed(path)]).toEqual([path, true]);
  for (const path of ['/organize', '/organize/kinds', '/plan/board', '/visualize/graph', '/analytics', '/write/book']) {
    expect([path, reviewPageAllowed(path)]).toEqual([path, false]);
  }
});
