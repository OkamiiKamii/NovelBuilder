import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/draft_road.dart';
import 'package:novel_builder/shared/domain/analytics/milestones.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  test('the marks on the road: the lengths fiction is measured by, up to the novel’s own target', () {
    expect([for (final m in milestonesFor(null)) m.words], [1000, 7500, 17500, 40000, 80000]);
    expect([for (final m in milestonesFor(30000)) m.words], [1000, 7500, 17500, 30000]);
    expect(milestonesFor(120000).last, (words: 120000, name: 'the whole draft', short: '120k'));
    expect([shortCount(950), shortCount(7500), shortCount(80000), shortCount(92500)], ['950', '7.5k', '80k', '92.5k']);
  });

  test('where the words stand: by orders of magnitude, the next mark and the last passed', () {
    expect(roadPosition(0, 80000), 0);
    expect(roadPosition(1000, 80000), closeTo(0.344, 0.001));
    expect(roadPosition(80000, 80000), 1);
    expect(roadPosition(200000, 80000), 1);
    final road = milestonesFor(null);
    expect(whereOnRoad(766, road), (passed: null, next: road[0]));
    expect(whereOnRoad(8000, road), (passed: road[1], next: road[2]));
    expect(whereOnRoad(90000, road), (passed: road.last, next: null));
  });

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form the road to the draft is in the contents, with the next mark and how far', (tester) async {
      await openWrite(tester, size: size, select: false);
      expect(find.text('THE ROAD TO THE DRAFT'), findsOneWidget);
      expect(find.text('7 of 80,000'), findsOneWidget);
      expect(find.text('993 words to the first thousand · about 4 pages'), findsOneWidget);
      expect(
        find.bySemanticsLabel(RegExp(r'^The road to the draft: 7 of 80,000 words\. 993 words to the first thousand')),
        findsOneWidget,
      );
      // Under the day book, over the chapters.
      final road = tester.getTopLeft(find.byType(DraftRoad)).dy;
      expect(road, greaterThan(tester.getTopLeft(find.text('THE DAY BOOK')).dy));
      expect(road, lessThan(tester.getTopLeft(find.text('The Gate')).dy));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('on a computer, beside a chapter being written, the chapters come first and the desk after', (
    tester,
  ) async {
    await openWrite(tester, size: desktop);
    final chapter = tester.getTopLeft(find.text('The Gate').first).dy;
    expect(tester.getTopLeft(find.byType(DraftRoad)).dy, greaterThan(chapter));
    expect(tester.getTopLeft(find.text('THE DAY BOOK')).dy, greaterThan(chapter));
    expect(tester.takeException(), isNull);
  });
}
