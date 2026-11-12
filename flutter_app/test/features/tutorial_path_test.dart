import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/tutorial/topics.dart';
import 'package:novel_builder/features/tutorial/your_path.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

void main() {
  test('every lesson on the path is a lesson of the tutorial, once', () {
    final ids = {for (final t in tutorialTopics) t.id};
    expect(yourPathOrder.toSet().length, yourPathOrder.length);
    for (final id in yourPathOrder) {
      expect(ids, contains(id), reason: id);
    }
  });

  testWidgets('the tutorial reads what the books hold: lessons tried are ticked, and the next is one press away', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mira'));
    c.read(settingsStoreProvider).write('ribbons.$novel', [
      {'path': '/plan', 'label': 'Plan', 'silk': 0},
    ]);

    final path = yourPath(
      store: c.read(novelStoreProvider),
      settings: c.read(settingsStoreProvider),
      novelIds: [novel],
    );
    expect(path.tried, containsAll(['library', 'characters', 'ribbons']));
    expect(path.tried, isNot(contains('timeline')));
    expect(path.tried, isNot(contains('threads')));

    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    final sheet = find.descendant(of: find.byType(BottomSheet), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.text('Tutorial'), 100, scrollable: sheet);
    await tester.tap(find.text('Tutorial'));
    await tester.pumpAndSettle();
    expect(find.text('You have tried this already'), findsOneWidget, reason: 'Characters, with Mira in the cast');

    await tester.tap(find.text('All topics'));
    await tester.pumpAndSettle();
    expect(find.text('Your path'), findsOneWidget);
    final count = path.counted.where(path.tried.contains).length;
    expect(find.text('$count of ${path.counted.length} lessons tried in your books'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle), findsWidgets);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    await tester.tap(find.text('Show me'));
    await tester.pumpAndSettle();
    expect(find.text(path.next!.title), findsWidgets);
    expect(find.text('Next on your path'), findsOneWidget);
    expect(c.read(libraryProvider).single.title, 'Ash', reason: 'nothing changed by reading');
  });
}
