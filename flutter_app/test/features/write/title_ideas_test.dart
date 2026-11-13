import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

/// A chapter of some length, about a lamp, ending on the way to the Inn.
final _text = [
  for (var i = 0; i < 8; i++) 'Mira lit the lamp and held the lamp over the old chart while the rain came down hard.',
  'She put out the lamp at last and walked towards the Inn.',
].join('\n');

Future<({ProviderContainer c, String novel, String chapter})> openChapter(
  WidgetTester tester, {
  String title = 'Chapter 1',
  String text = '',
}) async {
  final c = await pumpApp(tester, size: phone, location: '/write');
  final novel = c.read(libraryServiceProvider).create({'title': 'Ash'});
  final m = c.read(manuscriptServiceProvider);
  final chapter = m.create(novel.id, NodeKind.chapter, title: title);
  m.save(novel.id, chapter.id, textToDoc(text.isEmpty ? _text : text), baseRev: 0);
  c.read(openNovelProvider.notifier).open(novel.id);
  c.read(selectedNodeProvider.notifier).select(chapter.id);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id, chapter: chapter.id);
}

String titleOf(ProviderContainer c, String novel, String chapter) =>
    c.read(novelStoreProvider).row(novel, 'chapters', chapter)!['title']! as String;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('a chapter called “Chapter 1” is offered names from its pages; one press names it', (tester) async {
    final w = await openChapter(tester);
    expect(find.text('NAME THIS CHAPTER'), findsOneWidget);
    expect(find.text('The Lamp'), findsOneWidget);
    expect(find.text('Towards the Inn'), findsOneWidget);
    expect(titleOf(w.c, w.novel, w.chapter), 'Chapter 1', reason: 'nothing named until one is picked');

    await tester.tap(find.text('Towards the Inn'));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(titleOf(w.c, w.novel, w.chapter), 'Towards the Inn');
    expect(find.text('NAME THIS CHAPTER'), findsNothing);
  });

  testWidgets('Keep “Chapter 1” puts the ideas away for good', (tester) async {
    final w = await openChapter(tester);
    await tester.tap(find.text('Keep “Chapter 1”'));
    await tester.pumpAndSettle();
    expect(find.text('NAME THIS CHAPTER'), findsNothing);
    expect(titleOf(w.c, w.novel, w.chapter), 'Chapter 1');

    // Opened again: still kept.
    w.c.read(selectedNodeProvider.notifier).select(null);
    await tester.pumpAndSettle();
    w.c.read(selectedNodeProvider.notifier).select(w.chapter);
    await tester.pumpAndSettle();
    expect(find.text('NAME THIS CHAPTER'), findsNothing);
  });

  testWidgets('no ideas for a chapter with a name, or with too little written to name', (tester) async {
    await openChapter(tester, title: 'The Bell');
    expect(find.text('NAME THIS CHAPTER'), findsNothing);
  });

  testWidgets('too little written', (tester) async {
    await openChapter(tester, text: 'She lit the lamp. The lamp went out by the Inn.');
    expect(find.text('NAME THIS CHAPTER'), findsNothing);
  });
}
