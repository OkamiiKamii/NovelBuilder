import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/write/in_chapter.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form the chapter’s company stands under its heading, and opens their page', (tester) async {
      final w = await openWrite(
        tester,
        size: size,
        select: false,
        text: 'Orrin opened the gate.\nNobody guarded it, so Orrin went in. Nan followed.',
      );
      final characters = w.c.read(characterServiceProvider);
      final orrin = characters.change(w.novel, (x) => x.create(name: 'Orrin')).id;
      characters.change(w.novel, (x) => x.create(name: 'Nan'));
      characters.change(w.novel, (x) => x.create(name: 'Absent Friend'));
      final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));
      await tester.tap(find.text('The Gate').last);
      await tester.pumpAndSettle();

      expect(find.text('IN THIS CHAPTER'), findsOneWidget);
      expect(find.text('×2'), findsOneWidget, reason: 'Orrin, twice');
      expect(find.text('×1'), findsOneWidget, reason: 'Nan, once');
      expect(find.text('Absent Friend'), findsNothing, reason: 'only who the page names');
      expect(find.bySemanticsLabel('Orrin, character, named 2 times in this chapter'), findsOneWidget);
      final strip = find.byType(InChapterStrip);
      expect(
        tester.getTopLeft(find.text('Orrin').last).dx,
        lessThan(tester.getTopLeft(find.descendant(of: strip, matching: find.text('Nan'))).dx),
        reason: 'most mentioned first',
      );
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

      // Writing a name in: they join, a moment after typing stops.
      final last = SuperEditorInspector.findDocument()!.last;
      await tester.placeCaretInParagraph(last.id, 0);
      await tester.typeImeText('Absent Friend waved. ');
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(find.descendant(of: strip, matching: find.text('Absent Friend')), findsOneWidget);
      expect(storedText(w.c, w.novel, w.chapter), contains('Absent Friend waved.'));
      expect(before, isNotEmpty);

      // A press opens their page.
      await tester.tap(find.bySemanticsLabel('Orrin, character, named 2 times in this chapter'));
      await tester.pumpAndSettle();
      expect(currentLocation(w.c), contains(orrin));
      expect(tester.takeException(), isNull);
    });
  }
}
