import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/next_note.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

/// The note's field in the sheet (the chapter's title is a field too).
final noteField = find.byWidgetPredicate((w) => w is TextField && w.maxLength == 280);

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  String library(ProviderContainer c, String novel) =>
      jsonEncode(c.read(novelStoreProvider).load(novel)!.toJson(exportedAt: 0));

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form a note for next time is left under the page, pinned, kept, and put away', (tester) async {
      final w = await openWrite(tester, size: size);
      final before = library(w.c, w.novel);
      await tester.ensureVisible(find.text('Leave a note for next time'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Leave a note for next time'));
      await tester.pumpAndSettle();
      expect(find.text('A note for next time'), findsOneWidget);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      expect(
        tester
            .widget<FilledButton>(
              find.ancestor(of: find.text('Pin the note'), matching: find.byWidgetPredicate((w) => w is FilledButton)),
            )
            .onPressed,
        isNull,
        reason: 'nothing to pin yet',
      );
      await tester.tap(find.text('Next,'));
      await tester.pumpAndSettle();
      await tester.enterText(noteField, 'Next, Orrin finds the gate unguarded.');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pin the note'));
      await tester.pumpAndSettle();
      // Under the page; on a computer the contents beside it show it in the day book too.
      final pinned = size == phone ? 1 : 2;
      expect(find.text('Next, Orrin finds the gate unguarded.'), findsNWidgets(pinned));
      expect(find.textContaining('YOUR NOTE FOR NEXT TIME'), findsNWidgets(pinned));
      expect(w.c.read(nextNotesProvider)[w.chapter]!.text, 'Next, Orrin finds the gate unguarded.');
      // Kept on this device, never in the novel.
      expect(library(w.c, w.novel), before);
      expect(storedText(w.c, w.novel, w.chapter), 'The gate was open.\nNobody guarded it.');
      final kept = w.c.read(settingsStoreProvider).read('write.nextNotes.${w.novel}');
      expect((kept! as Map)[w.chapter]['text'], 'Next, Orrin finds the gate unguarded.');

      // Read again from the device as the novel reopens.
      w.c.invalidate(nextNotesProvider);
      expect(w.c.read(nextNotesProvider)[w.chapter]!.text, 'Next, Orrin finds the gate unguarded.');

      await tester.tap(find.text('Done with it'));
      await tester.pumpAndSettle();
      expect(find.textContaining('YOUR NOTE FOR NEXT TIME'), findsNothing);
      expect(find.text('Leave a note for next time'), findsOneWidget);
      expect(w.c.read(nextNotesProvider), isEmpty);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('on a phone, leaving after a real sitting offers a note; it then waits in the day book', (tester) async {
    final w = await openWrite(tester, size: phone);
    // A few words: back goes straight back.
    final last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 'Nobody guarded it.'.length);
    await tester.typeImeText(' Not even Orrin.');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Back to the outline'));
    await tester.pumpAndSettle();
    expect(find.text('Before you go'), findsNothing);
    expect(w.c.read(selectedNodeProvider), isNull);

    // A hundred words and more: the offer, and leaving without one is one press.
    await tester.tap(find.text('The Gate'));
    await tester.pumpAndSettle();
    final end = SuperEditorInspector.findDocument()!.last as TextNode;
    await tester.placeCaretInParagraph(end.id, end.text.length);
    await tester.typeImeText(' ${List.filled(110, 'word').join(' ')}');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Back to the outline'));
    await tester.pumpAndSettle();
    expect(find.text('Before you go'), findsOneWidget);
    await tester.tap(find.text('Leave without one'));
    await tester.pumpAndSettle();
    expect(w.c.read(selectedNodeProvider), isNull);
    expect(w.c.read(nextNotesProvider), isEmpty);

    // Again, with a note: it waits in the day book above the way back in.
    await tester.tap(find.text('The Gate'));
    await tester.pumpAndSettle();
    final again = SuperEditorInspector.findDocument()!.last as TextNode;
    // Its end is off the screen now: written at its start.
    await tester.placeCaretInParagraph(again.id, 0);
    await tester.typeImeText('${List.filled(110, 'more').join(' ')} ');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Back to the outline'));
    await tester.pumpAndSettle();
    await tester.enterText(noteField, 'The guard comes back drunk.');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pin the note'));
    await tester.pumpAndSettle();
    expect(w.c.read(selectedNodeProvider), isNull);
    expect(find.text('THE DAY BOOK'), findsOneWidget);
    expect(find.text('The guard comes back drunk.'), findsOneWidget);
    expect(find.text('Carry on in “The Gate”'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
