import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/plot/plot_providers.dart';
import 'package:novel_builder/features/write/margin.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

/// A wide window: the page and the margin side by side beside the outline.
const wide = Size(1700, 1000);

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('the margin shows how the chapter before ends, the plan, who is on the page and the threads here', (
    tester,
  ) async {
    final w = await openWrite(tester, size: wide, text: 'The gate was open.\nNobody guarded it.', select: false);
    final m = w.c.read(manuscriptServiceProvider);
    final two = m.create(w.novel, NodeKind.chapter, title: 'The River');
    final s = w.c.read(characterServiceProvider);
    final mira = s.change(w.novel, (x) => x.create(name: 'Mira Vance')).id;
    final kai = s.change(w.novel, (x) => x.create(name: 'Kai')).id;
    final orrin = s.change(w.novel, (x) => x.create(name: 'Orrin')).id;
    w.c.read(novelStoreProvider).writeRows(w.novel, [
      RowWrite.put('chapters', {
        ...w.c.read(novelStoreProvider).row(w.novel, 'chapters', two.id)!,
        'summary': 'They cross.',
      }),
    ]);
    w.c.read(plotServiceProvider).change(w.novel, (x) {
      x.updatePlan(
        two.id,
        (stored) => {
          ...stored,
          'objective': 'Get across before dawn',
          'beats': [
            {'id': 'b1', 'text': 'The ford is gone'},
            {'id': 'b2', 'text': 'Kai goes under'},
          ],
          'povIds': [mira],
          'appearIds': [kai],
          'mentionIds': [orrin],
        },
      );
      final crown = x.createThread('The stolen crown');
      x.addBeat(crown, title: 'A false lead', nodeId: two.id);
      return crown;
    });
    final before = jsonEncode(w.c.read(novelStoreProvider).rowsIn(w.novel, 'chapterPlans'));
    w.c.read(selectedNodeProvider.notifier).select(two.id);
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel(RegExp('^Notes for this chapter')), findsOneWidget);
    for (final text in [
      'Last time',
      'The Gate',
      'The gate was open.\n\nNobody guarded it.',
      'They cross.',
      'Beats',
      'The ford is gone',
      'Kai goes under',
      'On the page',
      'Mira Vance',
      'Point of view',
      'Kai',
      'Mentioned: Orrin',
      'Threads here',
      'The stolen crown',
      'A false lead',
    ]) {
      expect(find.text(text), findsWidgets, reason: text);
    }
    expect(find.textContaining('Get across before dawn'), findsOneWidget);
    expect(jsonEncode(w.c.read(novelStoreProvider).rowsIn(w.novel, 'chapterPlans')), before, reason: 'reads only');

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    // Hidden and shown again, kept on this device.
    await tester.tap(find.byTooltip('Hide the notes beside the page'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('^Notes for this chapter')), findsNothing);
    expect(w.c.read(settingsStoreProvider).read(marginKey), false);
    await tester.tap(find.byTooltip('Show the notes beside the page'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('^Notes for this chapter')), findsOneWidget);

    // The plan opens from the margin.
    await tester.tap(find.byTooltip('Open the chapter\'s plan'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), chapterPlanPath(two.id));
  });

  testWidgets('a chapter with no plan offers to plan it; the margin keeps up with the plan as it changes', (
    tester,
  ) async {
    final w = await openWrite(tester, size: wide);
    expect(find.text('No plan yet.'), findsOneWidget);
    expect(find.text('Plan this chapter'), findsOneWidget);
    w.c.read(plotServiceProvider).change(w.novel, (x) {
      x.updatePlan(
        w.chapter,
        (stored) => {
          ...stored,
          'beats': [
            {'id': 'b1', 'text': 'Someone opens the gate'},
          ],
        },
      );
      return null;
    });
    await tester.pumpAndSettle();
    expect(find.text('Someone opens the gate'), findsOneWidget);
    expect(find.text('No plan yet.'), findsNothing);
  });

  testWidgets('where there is no room beside the page, the notes open as a sheet', (tester) async {
    await openWrite(tester, size: phone);
    expect(find.bySemanticsLabel(RegExp('^Notes for this chapter')), findsNothing);
    await tester.tap(find.text('Desk'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Notes for this chapter'));
    await tester.pumpAndSettle();
    expect(find.text('Plan this chapter'), findsOneWidget);
    await tester.tap(find.text('Plan this chapter'));
    await tester.pumpAndSettle();
    expect(find.text('Plan this chapter'), findsNothing, reason: 'the sheet closes on the way to the plan');
    expect(tester.takeException(), isNull);
  });
}
