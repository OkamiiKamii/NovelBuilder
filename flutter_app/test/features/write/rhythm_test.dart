import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/rhythm.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  String of(int n) => '${List.filled(n, 'word').join(' ')}.';

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form the rhythm draws the sentences, finds a run of one beat, and goes to it', (tester) async {
      final w = await openWrite(
        tester,
        size: size,
        text: 'It began.\n${[of(8), of(9), of(10), of(8), of(9)].join(' ')}\n“Run,” she said.',
      );
      final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));
      if (size == phone) {
        await tester.tap(find.text('Desk'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Rhythm'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Rhythm'));
      } else {
        await tester.tap(find.byTooltip('Rhythm: your sentences as a waveform'));
      }
      await tester.pumpAndSettle();
      expect(find.text('How “The Gate” runs'), findsOneWidget);
      expect(find.text('7 sentences · 2–10 words, most about 8 · 1 run keeping one beat'), findsOneWidget);
      expect(find.byType(RhythmView), findsOneWidget);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

      // The run's chip goes to its first sentence, selected.
      await tester.ensureVisible(find.text('5 at about 8 words · paragraph 2'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('5 at about 8 words · paragraph 2'));
      await tester.pumpAndSettle();
      expect(find.byType(RhythmView), findsNothing);
      final s = SuperEditorInspector.findDocumentSelection()!;
      final node = SuperEditorInspector.findDocument()!.getNodeById(s.base.nodeId)! as TextNode;
      expect(
        node.text.toPlainText().substring(
          (s.base.nodePosition as TextNodePosition).offset,
          (s.extent.nodePosition as TextNodePosition).offset,
        ),
        of(8),
      );
      expect(jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0)), before);
      expect(tester.takeException(), isNull);
    });
  }
}
