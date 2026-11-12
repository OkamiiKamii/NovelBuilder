import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/listen.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/speech.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

/// A voice for tests: keeps what it was asked to say, and says it when [finish] is called.
class FakeSpeaker implements Speaker {
  FakeSpeaker({this.there = true});
  final bool there;
  final said = <(String, double)>[];
  Completer<bool>? _now;

  void finish() => _now?.complete(true);

  @override
  Future<bool> available() async => there;

  @override
  Future<bool> say(String text, {double rate = 1}) {
    said.add((text, rate));
    return (_now = Completer<bool>()).future;
  }

  @override
  Future<void> stop() async {
    if (_now?.isCompleted == false) _now!.complete(true);
  }
}

/// The background of the page's text where the line being read is lit.
List<String> lit(WidgetTester tester) => [
  for (final rich in tester.widgetList<RichText>(
    find.descendant(of: find.byType(SuperEditor), matching: find.byWidgetPredicate((w) => w is RichText)),
  ))
    for (final span in [rich.text, if (rich.text is TextSpan) ...?(rich.text as TextSpan).children])
      if (span is TextSpan && span.style?.backgroundColor != null && (span.text ?? '').isNotEmpty) span.text!,
];

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  const text = 'The gate was open. Nobody guarded it.\nOrrin went in.';

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form Listen reads the chapter aloud a sentence at a time, the one being read lit', (tester) async {
      final voice = FakeSpeaker();
      final w = await openWrite(tester, size: size, text: text, speaker: voice);
      final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));
      if (size == phone) {
        await tester.tap(find.text('Desk'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Listen'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Listen'));
      } else {
        await tester.tap(find.byTooltip('Listen: hear this chapter read aloud'));
      }
      await tester.pumpAndSettle();
      expect(find.text('Reading\n1 of 3'), findsOneWidget);
      expect(voice.said, [('The gate was open.', 1.0)]);
      expect(lit(tester), ['The gate was open.']);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

      voice.finish();
      await tester.pumpAndSettle();
      expect(find.text('Reading\n2 of 3'), findsOneWidget);
      expect(voice.said.last.$1, 'Nobody guarded it.');
      expect(lit(tester), ['Nobody guarded it.']);

      // Faster: the sentence starts again at the new pace.
      await tester.tap(find.text('1×'));
      await tester.pumpAndSettle();
      expect(voice.said.last, ('Nobody guarded it.', 1.25));

      // On a sentence, then paused.
      await tester.tap(find.byTooltip('On a sentence'));
      await tester.pumpAndSettle();
      expect(voice.said.last.$1, 'Orrin went in.');
      await tester.tap(find.byTooltip('Pause'));
      await tester.pumpAndSettle();
      expect(find.text('Paused\n3 of 3'), findsOneWidget);

      // Put away: nothing lit, and nothing was ever written.
      await tester.tap(find.byTooltip('Stop listening'));
      await tester.pumpAndSettle();
      expect(find.byType(ListenBar), findsNothing);
      expect(lit(tester), isEmpty);
      expect(jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0)), before);
      expect(storedText(w.c, w.novel, w.chapter), text);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('it starts at the sentence the caret is in, and a key stops it', (tester) async {
    final voice = FakeSpeaker();
    final w = await openWrite(tester, text: text, speaker: voice);
    final last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 3);
    w.c.read(listenProvider.notifier).set(true);
    await tester.pumpAndSettle();
    expect(voice.said.single.$1, 'Orrin went in.');
    expect(find.text('Reading\n3 of 3'), findsOneWidget);

    await tester.placeCaretInParagraph(last.id, 'Orrin went in.'.length);
    await tester.typeImeText(' Yes.');
    await tester.pumpAndSettle();
    expect(find.textContaining('Paused'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), '$text Yes.');
    expect(tester.takeException(), isNull);
  });

  testWidgets('a device with no voice says so, and offers nothing to press', (tester) async {
    await openWrite(tester, size: phone, text: text, speaker: FakeSpeaker(there: false));
    await tester.tap(find.text('Desk'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Listen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Listen'));
    await tester.pumpAndSettle();
    expect(find.text('This device has no voice to read with'), findsOneWidget);
    expect(find.byTooltip('Read aloud'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
