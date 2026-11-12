import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/time_lapse.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form the time-lapse plays the chapter from its first copy to now, and changes nothing', (
      tester,
    ) async {
      final w = await openWrite(tester, size: size, select: false);
      final m = w.c.read(manuscriptServiceProvider);
      // A copy kept of the two lines, then a third written.
      m.saveVersion(w.novel, w.chapter, label: 'Two lines');
      final rev = intOrNull(w.c.read(novelStoreProvider).row(w.novel, 'chapterContents', w.chapter)!['rev'])!;
      m.save(w.novel, w.chapter, textToDoc('The gate was open.\nNobody guarded it.\nOrrin went in.'), baseRev: rev);
      w.c.read(selectedNodeProvider.notifier).select(w.chapter);
      await tester.pumpAndSettle();
      final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));

      if (size == phone) {
        await tester.tap(find.text('Desk'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Time-lapse'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Time-lapse'));
      } else {
        await tester.tap(find.byTooltip('Time-lapse: watch this chapter write itself'));
      }
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('How “The Gate” grew'), findsOneWidget);
      final frames = tester.widget<TimeLapseView>(find.byType(TimeLapseView)).frames;
      expect([for (final f in frames) f.words], [7, 10], reason: 'the copy kept, then now');
      expect(find.text('1 / 2'), findsOneWidget);
      expect(find.textContaining(' · 7 words'), findsOneWidget);
      expect(find.text('Orrin went in.'), findsNothing);

      // It plays on its own, to the end.
      await tester.pump(TimeLapseView.beat);
      await tester.pump(const Duration(milliseconds: 800));
      expect(find.text('2 / 2'), findsOneWidget);
      expect(find.text('Orrin went in.'), findsOneWidget);
      expect(find.textContaining('10 words · +3'), findsOneWidget);
      await tester.pump(TimeLapseView.beat);
      expect(find.byTooltip('Play'), findsOneWidget, reason: 'stopped at the end');

      // Dragged back to the start: the first copy.
      await tester.drag(find.byType(Slider), const Offset(-2000, 0));
      await tester.pumpAndSettle();
      expect(find.text('1 / 2'), findsOneWidget);
      expect(find.text('Orrin went in.'), findsNothing);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      expect(find.byType(TimeLapseView), findsNothing);
      expect(jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0)), before);
      expect(tester.takeException(), isNull);
    });
  }
}
