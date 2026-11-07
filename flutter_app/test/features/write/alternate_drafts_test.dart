// Alternate drafts of a chapter or scene, ported from the original app's own tests of them
// (src/modules/manuscript/service.test.ts, "alternate drafts"), case for case.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/data/manuscript_service.dart';
import 'package:novel_builder/shared/data/backup_service.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/draft_store.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

void main() {
  late AppDatabase db;
  late NovelStore store;
  late ManuscriptService m;
  late DateTime now;
  const p = 'novel';

  setUp(() {
    now = DateTime(2026, 10, 27, 9);
    db = AppDatabase.inMemory();
    store = NovelStore(db, clock: () => now)
      ..putNovel(NovelSnapshot(project: {'id': p, 'title': 'T'}, collections: const {}));
    m = ManuscriptService(
      store,
      DraftStore(db, clock: () => now),
      BackupService(store, RestorePointStore(db, clock: () => now), clock: () => now),
      clock: () => now,
    );
  });
  tearDown(() => db.close());

  StoryNode node(String id) => StoryNode(store.row(p, 'chapters', id)!);
  int rev(String id) => m.open(p, id).rev;
  void write(String id, String text) {
    // Each save a moment after the last, as typing is.
    now = now.add(const Duration(seconds: 1));
    m.save(p, id, textToDoc(text), baseRev: rev(id));
  }

  List<String> text(String id) => blockTexts(m.open(p, id).doc);
  Map<String, Object> drafts(String id) => {
    'active': m.activeDraft(p, id),
    'others': [for (final b in m.alternateDrafts(p, id)) '${b['name']} (${b['wordCount']})'],
  };
  JsonMap named(String id, String name) => m.alternateDrafts(p, id).firstWhere((b) => b['name'] == name);
  String chapterWithText() {
    final ch = m.create(p, NodeKind.chapter);
    write(ch.id, 'the original ending of the chapter');
    return ch.id;
  }

  test('starts an alternate from a copy and keeps the original as its own draft', () {
    final ch = chapterWithText();
    expect(drafts(ch), {'active': 'Main draft', 'others': <String>[]});
    now = now.add(const Duration(seconds: 1));
    m.createDraft(p, ch, ' Alternate Ending A ');
    expect(drafts(ch), {
      'active': 'Alternate Ending A',
      'others': ['Main draft (6)'],
    });
    expect(text(ch), ['the original ending of the chapter'], reason: 'a copy to start from');
    expect(rev(ch), 1, reason: 'text untouched, so an open editor is not disturbed');

    write(ch, 'a much bleaker ending');
    expect(blockTexts(named(ch, 'Main draft')['doc']), ['the original ending of the chapter']);
    // Totals count the draft in the manuscript.
    expect(node(ch).wordCount, 4);
  });

  test('switching swaps the drafts without losing either, and totals follow', () {
    final ch = chapterWithText();
    now = now.add(const Duration(seconds: 1));
    m.createDraft(p, ch, 'Ending A');
    write(ch, 'ending A text here');
    now = now.add(const Duration(seconds: 1));
    m.createDraft(p, ch, 'Ending B', blank: true);
    expect(m.open(p, ch).doc, {
      'type': 'doc',
      'content': [
        {'type': 'paragraph'},
      ],
    });
    write(ch, 'B');
    expect(drafts(ch), {
      'active': 'Ending B',
      'others': ['Main draft (6)', 'Ending A (4)'],
    });

    final sessionsBefore = store.rowsIn(p, 'writingSessions').toString();
    now = now.add(const Duration(seconds: 1));
    m.switchDraft(p, ch, str(named(ch, 'Main draft')['id']));
    expect(drafts(ch), {
      'active': 'Main draft',
      'others': ['Ending B (1)', 'Ending A (4)'],
    });
    expect(text(ch), ['the original ending of the chapter']);
    expect(node(ch).wordCount, 6);
    expect(store.rowsIn(p, 'writingSessions').toString(), sessionsBefore, reason: 'swapping is not logged as writing');

    now = now.add(const Duration(seconds: 1));
    m.switchDraft(p, ch, str(named(ch, 'Ending A')['id']));
    expect(text(ch), ['ending A text here']);
    expect(
      [
        for (final b in m.alternateDrafts(p, ch)) [b['name'], blockTexts(b['doc'])],
      ],
      [
        [
          'Ending B',
          ['B'],
        ],
        [
          'Main draft',
          ['the original ending of the chapter'],
        ],
      ],
    );
  });

  test('a stale editor cannot overwrite the draft that was swapped in', () {
    final ch = chapterWithText();
    final editor = m.open(p, ch);
    m.createDraft(p, ch, 'Alt', blank: true);
    expect(() => m.save(p, ch, textToDoc('typed in a stale tab'), baseRev: editor.rev), throwsA(isA<SaveConflict>()));
    expect(text(ch), ['']);
  });

  test('renames drafts, refuses duplicate names, and deletes only alternates', () {
    final ch = chapterWithText();
    m.createDraft(p, ch, 'Ending A');
    final main = m.alternateDrafts(p, ch).single;
    Matcher refused(String words) => throwsA(isA<DraftRefused>().having((e) => e.message, 'message', contains(words)));
    expect(() => m.createDraft(p, ch, 'ending a'), refused('already has a draft'));
    expect(() => m.createDraft(p, ch, 'main draft'), refused('already has a draft'));
    expect(() => m.createDraft(p, ch, '  '), refused('name'));
    expect(() => m.renameDraft(p, ch, null, 'Main draft'), refused('already has a draft'));

    m.renameDraft(p, ch, str(main['id']), 'Original');
    m.renameDraft(p, ch, null, 'Bleak ending');
    expect(drafts(ch), {
      'active': 'Bleak ending',
      'others': ['Original (6)'],
    });

    m.deleteDraft(p, str(main['id']));
    expect(drafts(ch), {'active': 'Bleak ending', 'others': <String>[]});
    expect(text(ch), ['the original ending of the chapter']);
  });

  test('versions remember which draft they belong to', () {
    final ch = chapterWithText();
    now = now.add(const Duration(seconds: 1));
    m.saveVersion(p, ch, label: 'First');
    m.createDraft(p, ch, 'Alt');
    write(ch, 'alt text');
    now = now.add(const Duration(seconds: 1));
    m.saveVersion(p, ch, label: 'Second');
    expect(
      [
        for (final r in m.revisions(p, ch))
          if (str(r['label']).isNotEmpty) [r['label'], r['branchName']],
      ],
      [
        ['Second', 'Alt'],
        ['First', 'Main draft'],
      ],
    );
  });

  test('travel with the chapter when it is duplicated, and go when it is deleted', () {
    final ch = chapterWithText();
    m.createDraft(p, ch, 'Alt');
    final copy = m.duplicate(p, ch);
    expect(drafts(copy), {
      'active': 'Alt',
      'others': ['Main draft (6)'],
    });
    expect(m.alternateDrafts(p, copy).single['id'], isNot(m.alternateDrafts(p, ch).single['id']));
    final gone = m.alternateDrafts(p, ch).single['id'];
    m.delete(p, ch, title: 'Chapter');
    expect([for (final b in store.rowsIn(p, 'chapterBranches')) b['nodeId']], [copy]);
    expect(() => m.switchDraft(p, copy, str(gone)), throwsStateError);
    expect(isDocument(node(copy).kind), isTrue);
  });
}
