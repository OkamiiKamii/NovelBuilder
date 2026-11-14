import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/progress/sampler_page.dart';
import 'package:novel_builder/features/progress/submission_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('from More, the submission kit: how much is ready, the checklist, the query letter copied and saved', (
    tester,
  ) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pumpAndSettle();
    // The sample: titled, by someone, a fantasy, clean, but short of a fantasy's length and of a page of synopsis.
    final card = find.text('Submission kit: 4 of 6 ready');
    expect(card, findsOneWidget);
    expect(find.text('Next: a length the genre expects'), findsOneWidget);
    await tester.ensureVisible(card);
    await tester.pumpAndSettle();
    await tester.tap(card);
    await tester.pumpAndSettle();

    expect(find.byType(SubmissionScreen), findsOneWidget);
    expect(find.textContaining('4 of 6 ready'), findsOneWidget);
    expect(
      find.text('9,645 words. Fantasy and science fiction usually runs 90,000 to 120,000, when the draft is done.'),
      findsOneWidget,
    );
    expect(find.textContaining('A page is about 300 to 600'), findsOneWidget);
    expect(find.text('Edit the book’s details'), findsOneWidget, reason: 'only where something is missing');

    // The letter: the book's own details, its gaps the author's.
    final letter = find.byType(QueryLetterPage);
    await tester.scrollUntilVisible(
      letter,
      300,
      scrollable: find.descendant(of: find.byType(SubmissionScreen), matching: find.byType(Scrollable)).first,
    );
    await tester.pumpAndSettle();
    final text = tester.widget<QueryLetterPage>(letter).letter;
    expect(text, contains('I am seeking representation for THE DROWNED ROAD, a fantasy novel with elements of'));
    expect(text, contains('complete at [[its length]] words'), reason: 'the draft is not done');
    expect(text, contains('Once in a generation the sea goes out of the bay of Vell'));

    await tester.ensureVisible(find.text('Copy the letter'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Copy the letter'));
    await tester.pumpAndSettle();
    expect(copied, text);
    expect(find.text('The letter is copied, gaps and all.'), findsOneWidget);

    await tester.tap(find.text('Save it'));
    await tester.pumpAndSettle();
    final saved = files.savedFiles.single;
    expect((saved.kind, saved.name), (FileKind.text, 'query-letter-the-drowned-road.txt'));
    expect(utf8.decode(saved.bytes), text);

    // The opening is clean: the next thing is the sample pages.
    await tester.ensureVisible(find.text('Make the sample pages'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make the sample pages'));
    await tester.pumpAndSettle();
    expect(find.byType(SamplerScreen), findsOneWidget);
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'it only reads');
  });
}
