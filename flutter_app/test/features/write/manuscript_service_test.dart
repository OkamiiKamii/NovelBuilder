import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/data/manuscript_service.dart';
import 'package:novel_builder/shared/data/backup_service.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/draft_store.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

JsonMap linked(String text, String entryId) => {
  'type': 'doc',
  'content': [
    {
      'type': 'paragraph',
      'attrs': {'textAlign': null},
      'content': [
        {
          'type': 'text',
          'text': text,
          'marks': [
            {
              'type': 'entityLink',
              'attrs': {'entryId': entryId},
            },
          ],
        },
      ],
    },
  ],
};

void main() {
  late AppDatabase db;
  late NovelStore store;
  late ManuscriptService m;
  late DraftStore drafts;
  late DateTime now;
  const p = 'novel';

  setUp(() {
    now = DateTime(2026, 10, 24, 9);
    db = AppDatabase.inMemory();
    store = NovelStore(db, clock: () => now)
      ..putNovel(NovelSnapshot(project: {'id': p, 'title': 'T'}, collections: const {}));
    drafts = DraftStore(db, clock: () => now);
    m = ManuscriptService(
      store,
      drafts,
      BackupService(store, RestorePointStore(db, clock: () => now), clock: () => now),
      clock: () => now,
    );
  });
  tearDown(() => db.close());

  StoryNode node(String id) => StoryNode(store.row(p, 'chapters', id)!);

  test('saving: revision goes up, counts and linked entries are stored, the crash copy is cleared', () {
    final c = m.create(p, NodeKind.chapter);
    m.saveDraft(p, c.id, textToDoc('typing'), 0);
    final rev = m.save(p, c.id, linked('Mira walks home', 'mira'), baseRev: 0);
    expect(rev, 1);
    expect(node(c.id).wordCount, 3);
    expect(node(c.id).mentions, ['mira']);
    expect(drafts.leftIn(p), isEmpty);
    expect(m.open(p, c.id).rev, 1);
    expect(store.novel(p)!.updatedAt, now.millisecondsSinceEpoch, reason: 'the novel shows as edited');
  });

  test('a save based on text that changed since it was opened is refused, and nothing is overwritten', () {
    final c = m.create(p, NodeKind.chapter);
    m.save(p, c.id, textToDoc('First window'), baseRev: 0);
    expect(() => m.save(p, c.id, textToDoc('Second window'), baseRev: 0), throwsA(isA<SaveConflict>()));
    expect(blockTexts(m.open(p, c.id).doc), ['First window']);
  });

  test('history keeps a copy at most every five minutes, and always when asked', () {
    final c = m.create(p, NodeKind.chapter);
    var rev = m.save(p, c.id, textToDoc('v1'), baseRev: 0);
    rev = m.save(p, c.id, textToDoc('v2'), baseRev: rev); // keeps v1
    now = now.add(const Duration(minutes: 1));
    rev = m.save(p, c.id, textToDoc('v3'), baseRev: rev); // too soon: v2 not kept
    expect([for (final r in m.revisions(p, c.id)) blockTexts(r['doc']).single], ['v1']);
    now = now.add(const Duration(minutes: 5));
    rev = m.save(p, c.id, textToDoc('v4'), baseRev: rev); // keeps v3
    m.saveVersion(p, c.id, label: 'Before the big edit'); // keeps v4, named
    final history = m.revisions(p, c.id);
    expect([for (final r in history) blockTexts(r['doc']).single], ['v4', 'v3', 'v1']);
    expect((history.first['reason'], history.first['label']), ('manual', 'Before the big edit'));
  });

  test('history keeps the last 50; automatic copies make room before the author\'s own', () {
    final c = m.create(p, NodeKind.chapter);
    var rev = m.save(p, c.id, textToDoc('start'), baseRev: 0);
    m.saveVersion(p, c.id, label: 'mine');
    for (var i = 0; i < 60; i++) {
      now = now.add(const Duration(minutes: 6));
      rev = m.save(p, c.id, textToDoc('v$i'), baseRev: rev);
    }
    final history = m.revisions(p, c.id);
    expect(history, hasLength(maxRevisions));
    expect(history.any((r) => r['label'] == 'mine'), isTrue);
  });

  test('restoring a version brings it back and keeps the replaced text in history', () {
    final c = m.create(p, NodeKind.chapter);
    var rev = m.save(p, c.id, textToDoc('old'), baseRev: 0);
    rev = m.save(p, c.id, textToDoc('new'), baseRev: rev);
    final old = m.revisions(p, c.id).single;
    rev = m.restoreRevision(p, c.id, str(old['id']), baseRev: rev);
    expect(blockTexts(m.open(p, c.id).doc), ['old']);
    expect(m.revisions(p, c.id).first['reason'], 'restore');
    expect(blockTexts(m.revisions(p, c.id).first['doc']), ['new']);
  });

  test('unsaved writing left by a crash is offered back, never applied on its own', () {
    final c = m.create(p, NodeKind.chapter);
    final rev = m.save(p, c.id, textToDoc('saved'), baseRev: 0);
    m.saveDraft(p, c.id, textToDoc('saved and more'), rev);
    final opened = m.open(p, c.id);
    expect(blockTexts(opened.doc), ['saved']);
    expect(blockTexts(opened.recovered!.doc), ['saved and more']);
  });

  test('a crash copy typed on top of an older save is kept in history, not offered over newer text', () {
    final c = m.create(p, NodeKind.chapter);
    final rev = m.save(p, c.id, textToDoc('one'), baseRev: 0);
    m.saveDraft(p, c.id, textToDoc('typed on rev 1'), rev);
    m.save(p, c.id, textToDoc('two'), baseRev: rev); // the draft is cleared by a save…
    m.saveDraft(p, c.id, textToDoc('stale'), rev); // …but one written on the old revision appears
    final opened = m.open(p, c.id);
    expect(opened.recovered, isNull);
    expect(m.revisions(p, c.id).where((r) => r['reason'] == 'recovery').map((r) => blockTexts(r['doc'])), [
      ['stale'],
    ]);
    expect(drafts.leftIn(p), isEmpty);
  });

  test('writing is logged per session and day; goals are the author\'s own', () {
    final c = m.create(p, NodeKind.chapter);
    var rev = m.save(p, c.id, textToDoc('one two three'), baseRev: 0);
    now = now.add(const Duration(minutes: 10));
    rev = m.save(p, c.id, textToDoc('one two three four five'), baseRev: rev);
    now = now.add(const Duration(hours: 2));
    rev = m.save(p, c.id, textToDoc('one two'), baseRev: rev); // a new session; words were cut
    final sessions = store.rowsIn(p, 'writingSessions');
    expect(sessions, hasLength(2));
    expect((sessions.first['netWords'], sessions.first['added'], sessions.first['saves']), (5, 5, 2));
    expect((sessions.last['netWords'], sessions.last['removed']), (-3, 3));
    expect(m.wordsWritten(p).today, 2);

    expect(m.wordGoals(p).daily, isNull);
    m.setWordGoal(p, 'daily', 500);
    m.setWordGoal(p, 'daily', 750);
    expect(m.wordGoals(p).daily, 750);
    expect(store.rowsIn(p, 'goals'), hasLength(1), reason: 'one daily goal');
    m.setWordGoal(p, 'daily', null);
    expect(m.wordGoals(p).daily, isNull);
  });

  test('deleting a chapter keeps a restore point, and Undo brings it back with its text', () {
    final c = m.create(p, NodeKind.chapter);
    m.save(p, c.id, textToDoc('Precious words'), baseRev: 0);
    final kept = m.delete(p, c.id, title: c.title);
    expect(m.nodes(p), isEmpty);
    m.undoDelete(kept);
    expect(blockTexts(m.open(p, c.id).doc), ['Precious words']);
  });

  test('split and merge keep both texts in history first', () {
    final c = m.create(p, NodeKind.chapter);
    m.save(p, c.id, textToDoc('Head.\nTail.'), baseRev: 0);
    final second = m.split(p, c.id, textToDoc('Head.'), textToDoc('Tail.'));
    expect(m.revisions(p, c.id).first['label'], 'Before splitting');
    expect(blockTexts(m.open(p, second).doc), ['Tail.']);
    m.merge(p, c.id);
    expect(blockTexts(m.open(p, c.id).doc), ['Head.', 'Tail.']);
    expect(m.revisions(p, c.id).first['label'], 'Before merging');
    expect(m.nodes(p), hasLength(1));
  });
}
