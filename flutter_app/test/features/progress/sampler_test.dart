import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/progress/sampler_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('from More, the sampler: the opening shown as pages, what is in it, and the PDF made to send', (
    tester,
  ) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    final tile = find.bySemanticsLabel(RegExp('^The sampler'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();

    expect(find.byType(SamplerScreen), findsOneWidget);
    // The title page: the title, who wrote it, the synopsis, and that it is a sample.
    expect(find.text('The Drowned Road'), findsWidgets);
    expect(find.text('by Novel Builder'), findsOneWidget);
    expect(find.textContaining('Once in a generation the sea goes out'), findsOneWidget);
    expect(find.text('A reader’s sample'), findsOneWidget);
    expect(find.text('By then nobody listened to me, and the sea had not gone out again.'), findsOneWidget);
    expect(
      find.textContaining(RegExp(r'^A title page, the first (chapter|\d chapters) · [\d,]+ words · about \d+')),
      findsOneWidget,
    );

    // On to the first chapter's page, numbered.
    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('^Page 2 of the sample')), findsOneWidget);

    await tester.runAsync(() async {
      await tester.tap(find.text('Make the PDF'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final pdf = files.savedFiles.single;
    expect((pdf.kind, pdf.name), (FileKind.pdf, 'the-drowned-road-sampler.pdf'));
    expect(String.fromCharCodes(pdf.bytes.take(5)), '%PDF-');
    expect(find.text('Saved the-drowned-road-sampler.pdf'), findsOneWidget);
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'it only reads');
  });

  testWidgets('a book with no words yet: nothing to sample, said so', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: const MaterialApp(home: SamplerScreen(novelId: 'no-chapters')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Nothing to sample yet'), findsOneWidget);
    expect(find.text('Make the PDF'), findsNothing);
  });
}
