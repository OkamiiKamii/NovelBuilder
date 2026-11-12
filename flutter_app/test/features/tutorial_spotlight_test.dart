import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/tutorial/spotlight.dart';
import 'package:novel_builder/features/tutorial/topics.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('Show me on this page lights each button the lesson names, one at a time, and changes nothing', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/');
    c.read(libraryServiceProvider).create({'title': 'Ash'});
    await tester.pumpAndSettle();

    final library = tutorialTopics.firstWhere((t) => t.id == 'library');
    final tour = tourOf(library);
    expect(tour.map((s) => s.name), contains('New novel'));
    expect(tour.first.step, 0, reason: 'step 1 names New novel, on the shelf');
    expect(tour.map((s) => s.name), contains('Covers'));

    await tester.tap(find.byTooltip('Tutorial'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Show me on this page'));
    await tester.pumpAndSettle();
    expect(find.text('How to use it'), findsNothing, reason: 'the tutorial steps aside');
    expect(find.text('THE LIBRARY · STEP 1'), findsOneWidget);
    expect(find.text('1 of ${tour.length}'), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    // A press on the dimmed page does nothing.
    await tester.tapAt(const Offset(20, 800));
    await tester.pumpAndSettle();
    expect(find.text('1 of ${tour.length}'), findsOneWidget);

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('2 of ${tour.length}'), findsOneWidget);
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(find.text('1 of ${tour.length}'), findsOneWidget);
    await tester.tap(find.byTooltip('End the tour'));
    await tester.pumpAndSettle();
    expect(find.text('THE LIBRARY · STEP 1'), findsNothing);
    expect(c.read(libraryProvider).length, 1, reason: 'pointing made nothing');
  });

  testWidgets('the tour skips what is not on the screen', (tester) async {
    await pumpApp(tester, size: phone, location: '/');
    final threads = tutorialTopics.firstWhere((t) => t.id == 'threads');
    expect(tourOf(threads), isEmpty, reason: 'the shelf has none of the threads’ buttons');
  });
}
