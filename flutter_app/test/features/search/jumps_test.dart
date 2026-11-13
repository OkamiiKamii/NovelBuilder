import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/app/theme/theme_choice.dart';
import 'package:novel_builder/features/progress/trailer.dart';
import 'package:novel_builder/features/search/jumps.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

Jump _j(String title, {String kind = 'Page', List<String> words = const []}) =>
    (title: title, kind: kind, icon: Icons.circle, words: words, go: (_, _) {});

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  test('a place answers its name begun, its words begun, what it is known by, or its letters in order', () {
    final lanes = _j('Plot lanes', kind: 'Visualize', words: ['threads', 'arcs']);
    expect(jumpScore(lanes, 'plot lanes'), 100);
    expect(jumpScore(lanes, 'Plo'), 80);
    expect(jumpScore(lanes, 'lan'), 60);
    expect(jumpScore(lanes, 'arcs'), 40, reason: 'known by');
    expect(jumpScore(lanes, 'pltln'), 10, reason: 'its letters in order');
    expect(jumpScore(lanes, 'pl'), 80);
    expect(jumpScore(lanes, 'pz'), 0);
    expect(jumpScore(lanes, '   '), 0);
  });

  test('the best first, in the given order between equals, at most six', () {
    final all = [_j('Plan'), _j('Plot lanes'), _j('Places'), for (var i = 0; i < 9; i++) _j('Pl$i')];
    final found = jumpsFor('pla', all);
    expect([for (final j in found) j.title], ['Plan', 'Places', 'Plot lanes'], reason: 'its letters in order, last');
    expect(jumpsFor('p', all), hasLength(jumpsShown));
    expect(jumpsFor('plan', all).first.title, 'Plan');
  });

  Future<({ProviderContainer c, Novel novel})> start(WidgetTester tester) async {
    final c = await pumpApp(tester, location: '/organize');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    return (c: c, novel: novel);
  }

  Future<void> openSearch(WidgetTester tester) async {
    await tester.sendKeyDownEvent(LogicalKeyboardKey.control);
    await tester.sendKeyEvent(LogicalKeyboardKey.keyK);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.control);
    await tester.pumpAndSettle();
  }

  Future<void> type(WidgetTester tester, String query) async {
    await tester.enterText(find.widgetWithText(TextField, 'Search the whole novel'), query);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
  }

  testWidgets('search goes anywhere: a view, a character, a chapter, a look; Return to the first', (tester) async {
    final s = await start(tester);
    final c = s.c;
    final store = c.read(novelStoreProvider);
    final novelId = s.novel.id;

    // A view, by what it is known by.
    await openSearch(tester);
    await type(tester, 'stats');
    expect(find.text('Go to'), findsOneWidget);
    await tester.tap(find.text('Analytics'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/progress/analytics');

    // A character, by the start of a name.
    await openSearch(tester);
    await type(tester, 'wren');
    final wren = store.rowsIn(novelId, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis');
    await tester.tap(find.descendant(of: find.byType(ListTile), matching: find.text('Wren Hollis')).first);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/character/${wren['id']}');

    // With nothing typed: where you were.
    await openSearch(tester);
    expect(find.text('Where you were'), findsOneWidget);
    expect(find.text('Analytics'), findsOneWidget);
    await tester.tap(find.byTooltip('Close search'));
    await tester.pumpAndSettle();

    // A chapter by its number, with Return.
    await openSearch(tester);
    await type(tester, 'chapter 2');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/write');
    final chapters = [
      for (final n in readingOrder([for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n.id,
    ];
    expect(c.read(selectedNodeProvider), chapters[1], reason: 'the second chapter');
    await tester.pump(const Duration(seconds: 2));

    // A look: chosen in a press.
    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    await openSearch(tester);
    await type(tester, 'monolith');
    await tester.tap(find.text(ThemeChoice.monolith.label));
    await tester.pumpAndSettle();
    expect(c.read(themeChoiceProvider), ThemeChoice.monolith);

    // A keepsake: the trailer plays.
    await openSearch(tester);
    await type(tester, 'movie');
    await tester.tap(find.text('Trailer'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(TrailerScreen), findsOneWidget);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(str(store.novel(novelId)?.title), 'The Drowned Road', reason: 'nothing in the book changed');
  });
}
