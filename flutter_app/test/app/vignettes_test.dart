import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/destinations.dart';
import 'package:novel_builder/app/shell/vignettes.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../helpers/pump_app.dart';

final _now = DateTime(2026, 11, 9, 15);

String _day(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

void main() {
  testWidgets('the sample novel’s pictures: its threads along the book, and its web of ties', (tester) async {
    final c = await pumpApp(tester, size: phone);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: _now.millisecondsSinceEpoch);
    final pictures = areaVignettes(store, novel.id, now: _now);

    final lanes = (pictures[Destination.plan]! as LanesVignette).lanes;
    expect(lanes, hasLength(5));
    // "Charting the Drowned Road": chapters 1, 4, 6, 7, 12 and 15 of 15, from the start to the very end.
    expect(lanes.first, [0, 3 / 14, 5 / 14, 6 / 14, 11 / 14, 1]);
    for (final lane in lanes) {
      expect(lane, orderedEquals([...lane]..sort()));
      expect(lane.every((x) => x >= 0 && x <= 1), isTrue);
    }

    final web = pictures[Destination.visualize]! as WebVignette;
    expect(web.people, 8);
    expect(web.ties, hasLength(6));

    expect(pictures[Destination.review], isNull, reason: 'no canon facts or rules yet');
    expect(pictures[Destination.progress], isNull, reason: 'the sample is nobody’s writing');
  });

  testWidgets('the last fortnight of writing, today last; canon facts and rules as marks', (tester) async {
    final c = await pumpApp(tester, size: phone);
    final store = c.read(novelStoreProvider);
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road'}).id;
    store.writeRows(novel, [
      for (final (ago, words) in [(0, 120), (1, 300), (13, 50), (20, 999)])
        RowWrite.put('writingSessions', {
          'id': 'w$ago',
          'projectId': novel,
          'day': _day(DateTime(_now.year, _now.month, _now.day - ago)),
          'netWords': words,
          'added': words,
          'removed': 0,
        }),
      for (var i = 0; i < 3; i++) RowWrite.put('canonFacts', {'id': 'f$i', 'projectId': novel}),
      RowWrite.put('continuityRules', {'id': 'r0', 'projectId': novel}),
    ]);
    final pictures = areaVignettes(store, novel, now: _now);
    final days = (pictures[Destination.progress]! as DaysVignette).words;
    expect(days, hasLength(vignetteDays));
    expect(days.first, 50, reason: 'thirteen days ago');
    expect(days.last, 120, reason: 'today');
    expect(days[vignetteDays - 2], 300);
    expect(days.fold(0, (a, b) => a + b), 470, reason: 'twenty days ago is out of the fortnight');
    final ledger = pictures[Destination.review]! as LedgerVignette;
    expect((ledger.facts, ledger.rules), (3, 1));
    expect(pictures[Destination.plan], isNull, reason: 'no chapters, no threads');
    expect(pictures[Destination.visualize], isNull, reason: 'no one yet');
  });

  testWidgets('More draws them under each area’s words, and they say nothing to a screen reader', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/write');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: _now.millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    final sheet = find.byType(BottomSheet);
    // The areas, under the card of the day and the keepsakes.
    await tester.scrollUntilVisible(
      find.descendant(of: sheet, matching: find.text('Visualize')),
      200,
      scrollable: find.descendant(of: sheet, matching: find.byType(Scrollable)).first,
    );
    await tester.pumpAndSettle();
    expect(find.descendant(of: sheet, matching: find.byType(VignetteView)), findsNWidgets(2));
    final plan = tester.getRect(find.descendant(of: sheet, matching: find.text('Plan')));
    final first = tester.getRect(find.descendant(of: sheet, matching: find.byType(VignetteView)).first);
    expect(first.top, greaterThan(plan.bottom), reason: 'under the words');
    expect(first.right, lessThanOrEqualTo(tester.getRect(sheet).right));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    expect(tester.takeException(), isNull);
  });
}
