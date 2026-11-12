import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets(
    'on a phone the cast has one catalogue bar: search, a row of views, order and roles; Arrange in a sheet',
    (tester) async {
      final c = await pumpApp(tester, size: phone, location: '/organize');
      final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
      c.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();

      expect(find.text('Search the cast'), findsOneWidget);
      expect(find.text('Sort by'), findsNothing, reason: 'no sort menu cut short');
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

      // The order, in the sheet: the chip in the row says which it is.
      await tester.ensureVisible(find.byTooltip('Arrange the cast'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Arrange the cast'));
      await tester.pumpAndSettle();
      expect(find.text('Arrange the cast'), findsOneWidget);
      await tester.tap(find.text('Most appearances'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(ActionChip, 'Most appearances'), findsOneWidget);
      // Wren, in all fifteen chapters, comes first: above, or beside and before, every other card.
      final wren = tester.getTopLeft(find.text('Wren Hollis'));
      final jory = tester.getTopLeft(find.text('Jory'));
      expect(wren.dy < jory.dy || (wren.dy == jory.dy && wren.dx < jory.dx), isTrue);

      // A role from the row.
      await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'Antagonists'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ChoiceChip, 'Antagonists'));
      await tester.pumpAndSettle();
      expect(find.text('Aldous Crane'), findsOneWidget);
      expect(find.text('Ilse Marrow'), findsNothing, reason: 'only the antagonists');
    },
  );
}
