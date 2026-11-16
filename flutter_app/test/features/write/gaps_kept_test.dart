import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/gaps.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/background.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

/// The gaps of a book are kept chapter by chapter: a save reads again only the chapter written, on the spot; the book
/// is read whole, away from the screen, only the first time and when it is stored anew.
void main() {
  late ProviderContainer c;
  late NovelStore store;
  var jobs = 0;

  setUp(() {
    jobs = 0;
    final db = AppDatabase.inMemory();
    addTearDown(db.close);
    c = ProviderContainer(
      overrides: [
        databaseProvider.overrideWithValue(db),
        runAsideProvider.overrideWithValue(<R>(R Function() job) async {
          jobs++;
          return job();
        }),
      ],
    );
    addTearDown(c.dispose);
    store = c.read(novelStoreProvider);
  });

  Future<void> settle() async {
    for (var i = 0; i < 5; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  test('the store counts the writes to each record, and reads only the records asked for', () {
    final id = c.read(libraryServiceProvider).create({'title': 'Counts'}).id;
    store.writeRows(id, [
      RowWrite.put('chapterContents', {'id': 'a', 'projectId': id, 'doc': textToDoc('One.')}),
      RowWrite.put('chapterContents', {'id': 'b', 'projectId': id, 'doc': textToDoc('Two.')}),
    ]);
    store.writeRows(id, [
      RowWrite.put('chapterContents', {'id': 'a', 'projectId': id, 'doc': textToDoc('Uno.')}),
    ]);
    store.writeRows(id, [const RowWrite.delete('chapterContents', 'b')]);
    expect(store.rowVersionsIn(id, 'chapterContents'), {'a': 2, 'b': 2});
    expect(store.rowVersionsIn(id, 'chapters'), isEmpty);
    final whole = store.wholeVersionOf(id);
    store.putNovel(store.load(id)!);
    expect(store.wholeVersionOf(id), whole + 1, reason: 'stored anew');

    final many = [
      for (var i = 0; i < 950; i++) RowWrite.put('loreEntries', {'id': 'e$i', 'projectId': id}),
    ];
    store.writeRows(id, many);
    expect(store.rawJsonOf(id, 'chapterContents', ['a']), hasLength(1));
    expect(store.rawJsonOf(id, 'chapterContents', ['b']), isEmpty, reason: 'removed');
    expect(store.rawJsonOf(id, 'loreEntries', [for (var i = 0; i < 950; i++) 'e$i']), hasLength(950));
    expect(store.rawJsonOf(id, 'loreEntries', const []), isEmpty);
  });

  test('a save reads again only its chapter; the book is read whole the first time and when stored anew', () async {
    final id = c.read(libraryServiceProvider).create({'title': 'Gaps'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(id, NodeKind.chapter, title: 'One').id;
    final two = m.create(id, NodeKind.chapter, title: 'Two').id;
    final three = m.create(id, NodeKind.chapter, title: 'Three').id;
    void write(String node, String text) => m.save(id, node, textToDoc(text), baseRev: m.open(id, node).rev);
    write(one, 'Once there was TK in the hall.');
    write(two, 'No gap here at all.');
    write(three, 'The [[name of the pass]] was high.');
    c.read(openNovelProvider.notifier).open(id);
    final sub = c.listen(gapsProvider, (_, _) {});
    addTearDown(sub.close);
    await settle();
    List<(String, String)> gaps() => [for (final g in c.read(gapsProvider)) (g.nodeId, g.written)];
    expect(gaps(), [(one, 'TK'), (three, '[[name of the pass]]')]);
    expect(jobs, 1, reason: 'the first reading: the whole book, away from the screen');

    write(two, 'Now there is a gap: TK.');
    await settle();
    expect(gaps(), [(one, 'TK'), (two, 'TK'), (three, '[[name of the pass]]')], reason: 'in reading order');
    write(one, 'Once there was a lamp in the hall.');
    await settle();
    expect(gaps(), [(two, 'TK'), (three, '[[name of the pass]]')]);
    m.delete(id, three, title: 'Three');
    await settle();
    expect(gaps(), [(two, 'TK')], reason: 'a chapter deleted: its gaps go with it');
    m.move(id, two, null);
    await settle();
    expect(gaps(), [(two, 'TK')]);
    expect(jobs, 1, reason: 'four changes, not one reading of the book');

    store.putNovel(store.load(id)!);
    await settle();
    expect(gaps(), [(two, 'TK')]);
    expect(jobs, 2, reason: 'the book stored anew: read whole again');
  });
}
