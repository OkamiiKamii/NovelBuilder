import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/write/todays_page.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  test('a line to quote: the first sentence, cut at a word when long', () {
    expect(firstSentence('The gate was open. Nobody guarded it.'), 'The gate was open.');
    expect(firstSentence('“Go,” she said. Then she left.'), '“Go,” she said.');
    expect(firstSentence('No end mark here'), 'No end mark here');
    final long = firstSentence('${List.filled(40, 'word').join(' ')}.', max: 60);
    expect(long.length, lessThanOrEqualTo(60));
    expect(long, endsWith('word…'));
  });

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form today’s page is shared from the day book as a portrait picture, quoting only if asked', (
      tester,
    ) async {
      final files = FakeBackupFiles();
      final w = await openWrite(tester, size: size, select: false, files: files);
      final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));
      await tester.tap(find.text('Share today’s page'));
      await tester.pumpAndSettle();
      expect(find.text('TODAY AT THE DESK'), findsOneWidget);
      Finder card(String text) => find.descendant(of: find.byType(TodaysPageCard), matching: find.text(text));
      expect(card('7'), findsOneWidget, reason: 'the words written today');
      expect(card('words today'), findsOneWidget);
      expect(card('Written today'), findsOneWidget);
      expect(card('Ash'), findsOneWidget);
      expect(find.textContaining('The Gate · 7 words so far'), findsOneWidget);
      expect(find.textContaining('The gate was open'), findsNothing, reason: 'no prose unless asked');
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

      await tester.tap(find.text('Include a line I wrote today'));
      await tester.pumpAndSettle();
      expect(find.text('“Nobody guarded it.”'), findsOneWidget, reason: 'the last paragraph written today');

      await tester.runAsync(() async {
        await tester.tap(find.text('Share'));
        for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 50));
          await tester.pump();
        }
      });
      await tester.pumpAndSettle();
      final png = files.savedFiles.single;
      expect(png.kind, FileKind.png);
      expect(png.name, matches(RegExp(r'^todays-page-\d{4}-\d\d-\d\d\.png$')));
      final picture = img.decodePng(png.bytes)!;
      expect((picture.width, picture.height), (1080, 1350));
      expect(find.textContaining('Saved todays-page'), findsOneWidget);
      expect(jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0)), before);
      expect(tester.takeException(), isNull);
    });
  }
}
