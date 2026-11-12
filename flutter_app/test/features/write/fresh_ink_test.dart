import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/fresh_ink.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

/// How many strokes of today's ink are in the margin.
int strokes(WidgetTester tester) {
  final paint = tester.widget<CustomPaint>(
    find.descendant(of: find.byType(FreshInkMargin), matching: find.byType(CustomPaint)),
  );
  return ((paint.painter! as dynamic).strokes as List).length;
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  final today = DateTime(2026, 11, 11);
  final yesterday = DateTime(2026, 11, 10, 22).millisecondsSinceEpoch;
  final todayNoon = DateTime(2026, 11, 11, 12).millisecondsSinceEpoch;

  test('the page as the day began: nothing if made today, the saved text if untouched, else its history', () {
    expect(textAtDayStart(node: {'createdAt': todayNoon}, saved: null, revisions: const [], dayStart: today), isEmpty);
    expect(
      textAtDayStart(
        node: {'createdAt': yesterday},
        saved: {'savedAt': yesterday, 'doc': textToDoc('Old.\nLines.')},
        revisions: const [],
        dayStart: today,
      ),
      ['Old.', 'Lines.'],
    );
    final history = [
      {'savedAt': yesterday - 1000, 'doc': textToDoc('Older.'), 'branchName': 'Main draft'},
      {'savedAt': yesterday, 'doc': textToDoc('Last night.'), 'branchName': 'Main draft'},
      {'savedAt': yesterday + 10, 'doc': textToDoc('Another draft.'), 'branchName': 'Dark ending'},
      {'savedAt': todayNoon, 'doc': textToDoc('This morning.'), 'branchName': 'Main draft'},
    ];
    expect(
      textAtDayStart(
        node: {'createdAt': yesterday - 5000},
        saved: {'savedAt': todayNoon, 'doc': textToDoc('Now.')},
        revisions: history,
        dayStart: today,
      ),
      ['Last night.'],
    );
    expect(
      textAtDayStart(
        node: {'createdAt': yesterday - 5000},
        saved: {'savedAt': todayNoon, 'doc': textToDoc('Now.')},
        revisions: const [],
        dayStart: today,
      ),
      isNull,
      reason: 'no copy from before today: unknown, so nothing is marked',
    );
  });

  test('fresh paragraphs: those with words not among the day’s first text, each earlier one matched once', () {
    expect(freshParagraphs(['A.', 'B changed.', '', 'C.'], ['A.', 'B.', 'C.']), {1});
    expect(freshParagraphs(['A.', 'A.'], ['A.']), {1});
    expect(freshParagraphs(['A.', '  '], const []), {0});
    expect(freshParagraphs(['A.'], null), isEmpty);
  });

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form today’s ink marks only what was written today, and inks up a paragraph as it changes', (
      tester,
    ) async {
      final w = await openWrite(tester, size: size, select: false);
      // The chapter as it was last night.
      final store = w.c.read(novelStoreProvider);
      final night = DateTime.now().subtract(const Duration(days: 1)).millisecondsSinceEpoch;
      store.writeRows(w.novel, [
        RowWrite.put('chapters', {...store.row(w.novel, 'chapters', w.chapter)!, 'createdAt': night}),
        RowWrite.put('chapterContents', {...store.row(w.novel, 'chapterContents', w.chapter)!, 'savedAt': night}),
      ]);
      w.c.read(selectedNodeProvider.notifier).select(w.chapter);
      await tester.pumpAndSettle();
      expect(strokes(tester), 0, reason: 'nothing written today yet');

      final last = SuperEditorInspector.findDocument()!.last;
      await tester.placeCaretInParagraph(last.id, 'Nobody guarded it.'.length);
      await tester.typeImeText(' Orrin came back at dusk.');
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(strokes(tester), 1);
      final ink = tester.widget<FreshInkMargin>(find.byType(FreshInkMargin)).ink;
      final doc = SuperEditorInspector.findDocument()!;
      expect(
        [for (final id in ink.fresh) (doc.getNodeById(id)! as TextNode).text.toPlainText()],
        ['Nobody guarded it. Orrin came back at dusk.'],
      );

      // Turned off in the writing settings: gone.
      w.c.read(freshInkProvider.notifier).set(false);
      await tester.pumpAndSettle();
      expect(find.byType(FreshInkMargin), findsNothing);
      expect(w.c.read(settingsStoreProvider).read(freshInkKey), false);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('a page made today is all today’s ink', (tester) async {
    await openWrite(tester, size: phone);
    await tester.pumpAndSettle();
    expect(strokes(tester), 2);
    expect(tester.takeException(), isNull);
  });
}
