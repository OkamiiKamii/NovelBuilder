import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/collab/review_workspace.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/collab/review_files.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import '../../helpers/pump_app.dart';
import '../../shared/domain/fixtures.dart';

const _novel = '70465ae9-f720-4346-8683-298ce006ed1a';
const _chapter = '4fee0c33-10ac-413e-a828-941049a681a0';

/// Taps [finder], scrolling the page to it first when needed.
Future<void> tap(WidgetTester tester, Finder finder) async {
  // Not built yet, or off screen: scroll each vertical list on the page until it is.
  for (final list in find.byType(Scrollable).evaluate().toList().reversed) {
    if (finder.hitTestable().evaluate().isNotEmpty) break;
    final state = (list as StatefulElement).state as ScrollableState;
    if (state.position.axis != Axis.vertical || !list.mounted) continue;
    try {
      await tester.scrollUntilVisible(
        finder,
        200,
        scrollable: find.byElementPredicate((e) => e == list),
        maxScrolls: 60,
      );
    } on StateError {
      // Not in this list.
    }
  }
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  await tester.tap(finder.hitTestable().first);
  await tester.pumpAndSettle();
}

Future<void> go(ProviderContainer c, WidgetTester tester, String to) async {
  c.read(routerProvider).go(to);
  await tester.pumpAndSettle();
}

/// The owner adds [name] with [role] on the Team page, and makes a review copy for them. Returns the file's text.
Future<String> makeCopy(
  WidgetTester tester,
  ProviderContainer c,
  FakeBackupFiles files,
  String name,
  String role,
) async {
  await go(c, tester, '/review/team');
  await tap(tester, find.text('Add a person…'));
  await tester.enterText(find.widgetWithText(TextField, 'Name'), name);
  await tap(tester, find.text(role));
  await tap(tester, find.widgetWithText(FilledButton, 'Add'));
  await tap(tester, find.text('Make a review copy…').last);
  final file = files.savedFiles.last;
  expect(file.name, contains('review copy for $name'));
  expect(file.kind, FileKind.json);
  return utf8.decode(file.bytes);
}

/// Opens a review copy through the ordinary backup import, as the person receiving it does.
Future<void> openCopy(WidgetTester tester, ProviderContainer c, FakeBackupFiles files, String text) async {
  files.toPick = (name: 'copy.novel.json', text: text);
  await go(c, tester, '/settings/import-export');
  await tap(tester, find.text('Import a backup…'));
  expect(find.textContaining('A review copy of'), findsOneWidget);
  await tap(tester, find.widgetWithText(FilledButton, 'Open it'));
  await go(c, tester, '/write');
}

Future<String?> prompt(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField).last, text);
  await tap(tester, find.widgetWithText(FilledButton, 'Add comment'));
  return null;
}

void main() {
  Future<({ProviderContainer c, FakeBackupFiles files})> start(
    WidgetTester tester, {
    Size size = const Size(1400, 2600),
  }) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: size, files: files);
    c.read(novelStoreProvider).putNovel(loadFixture('made-in-the-app'));
    c.read(openNovelProvider.notifier).open(_novel);
    await tester.pumpAndSettle();
    return (c: c, files: files);
  }

  testWidgets('review by file, all the way round: copy, comments and suggestions, feedback, accepted changes', (
    tester,
  ) async {
    final w = await start(tester);
    final store = w.c.read(novelStoreProvider);
    final before = jsonEncode(store.row(_novel, 'chapterContents', _chapter));
    final copyText = await makeCopy(tester, w.c, w.files, 'Sam', 'Editor');
    final copy = jsonDecode(copyText) as JsonMap;
    expect(mapOrNull(mapOrNull(copy['project'])?['review'])?['role'], 'editor');
    expect(mapOrNull(copy['collections'])?['characterSecrets'], isEmpty, reason: 'secrets never leave');
    expect(loadFixture('made-in-the-app').rows('characterSecrets'), isNotEmpty);

    // Sam opens it: the review workspace, never the editor.
    await openCopy(tester, w.c, w.files, copyText);
    expect(find.textContaining('Review copy of “Made in the App” from The author'), findsOneWidget);
    expect(find.textContaining('Nothing you do here changes the author’s book'), findsOneWidget);
    await tap(tester, find.text('Chapter 1').first);
    // A comment on the second paragraph, a reaction, and a feedback form.
    await tap(tester, find.byTooltip('Comment on paragraph 2'));
    await prompt(tester, 'This line sings.');
    await tap(tester, find.text('Loved this'));
    await tap(tester, find.text('Feedback form…'));
    await tap(tester, find.widgetWithText(FilledButton, 'Add feedback'));
    // A suggested change to the second paragraph.
    await tap(tester, find.text('Suggest changes'));
    await tester.enterText(find.widgetWithText(TextField, 'Paragraph 2'), 'A sharper second paragraph.');
    await tap(tester, find.text('Keep my suggested changes'));
    expect(find.textContaining('changes in your feedback'), findsOneWidget);
    await tap(tester, find.text('Send feedback…'));
    final feedback = w.files.savedFiles.last;
    expect(feedback.name, 'Made in the App - feedback from Sam.json');

    // The author's book is untouched by all of it.
    expect(jsonEncode(store.row(_novel, 'chapterContents', _chapter)), before);

    // The owner brings it in.
    w.c.read(openNovelProvider.notifier).open(_novel);
    await tester.pumpAndSettle();
    w.files.toPick = (name: feedback.name, text: utf8.decode(feedback.bytes));
    await go(w.c, tester, '/review/team');
    await tap(tester, find.text('Bring in feedback…'));
    expect(find.text('Feedback from Sam'), findsOneWidget);
    expect(find.textContaining('1 new comment'), findsOneWidget);
    expect(find.textContaining('1 reaction'), findsOneWidget);
    expect(find.textContaining('1 feedback form'), findsOneWidget);
    expect(find.textContaining('1 suggestion'), findsOneWidget);
    await tap(tester, find.text('Take it in'));
    expect(jsonEncode(store.row(_novel, 'chapterContents', _chapter)), before, reason: 'taking it in changes nothing');

    // A reply to Sam's comment.
    await tap(tester, find.textContaining('Conversations ('));
    expect(find.text('This line sings.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Reply').first, 'Thank you!');
    await tap(tester, find.text('Send reply').first);
    expect(find.text('Thank you!'), findsOneWidget);

    // The suggested change, accepted: it lands on the chapter, the earlier text kept in its history.
    await tap(tester, find.textContaining('Suggestions ('));
    expect(find.textContaining('A sharper second paragraph.', findRichText: true), findsOneWidget);
    await tap(tester, find.widgetWithText(FilledButton, 'Accept'));
    final now = store.row(_novel, 'chapterContents', _chapter)!;
    expect(blockTexts(now['doc'])[1], 'A sharper second paragraph.');
    expect(store.rowsIn(_novel, 'chapterRevisions').any((r) => r['nodeId'] == _chapter), isTrue);
    expect(find.text('No suggestions waiting.'), findsOneWidget);

    // Sam is now active, with the time of the feedback.
    await tap(tester, find.textContaining('People ('));
    expect(find.textContaining('Feedback last brought in'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a review copy shows only the review: other areas explain, the reader does not publish', (tester) async {
    final w = await start(tester);
    final copy = await makeCopy(tester, w.c, w.files, 'Ria', 'Beta Reader / Proofreader');
    await openCopy(tester, w.c, w.files, copy);
    expect(find.textContaining('read the manuscript, comment on it'), findsOneWidget);
    expect(find.text('Codex'), findsNothing, reason: 'a beta reader sees no codex');
    await go(w.c, tester, '/organize');
    expect(find.text('Not part of a review copy'), findsOneWidget);
    await tap(tester, find.text('Go to the review'));
    expect(currentLocation(w.c), '/write');
    await go(w.c, tester, '/write/read');
    expect(find.text('Publish…'), findsNothing);
    expect(find.text('Book details'), findsNothing);
    // The store refuses a change to the book whatever the screens offer.
    final store = w.c.read(novelStoreProvider);
    final id = reviewCopyId(_novel, store.rowsIn(_novel, 'members').last['id']! as String);
    final text = store.row(id, 'chapterContents', _chapter)!;
    expect(
      () => store.writeRows(id, [
        RowWrite.put('chapterContents', {...text, 'doc': textToDoc('x')}),
      ]),
      throwsA(isA<Exception>()),
    );
    // The library marks it.
    await go(w.c, tester, '/');
    expect(find.text('Review copy'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a viewer reads only, and the workspace says so', (tester) async {
    final w = await start(tester);
    final copy = await makeCopy(tester, w.c, w.files, 'Vic', 'Viewer');
    await openCopy(tester, w.c, w.files, copy);
    expect(find.textContaining('read the chapters marked final or published'), findsOneWidget);
    expect(find.text('No chapters to read in this copy'), findsOneWidget);
    expect(find.text('Send feedback…'), findsNothing);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('on a phone at twice the text size, the team page and the review workspace fit', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await start(tester, size: phone);
    final copy = await makeCopy(tester, w.c, w.files, 'Sam', 'Editor');
    expect(tester.takeException(), isNull);
    await openCopy(tester, w.c, w.files, copy);
    expect(tester.takeException(), isNull);
    final workspace = find.descendant(of: find.byType(ReviewWorkspace), matching: find.byType(Scrollable)).first;
    // The first chapter in the list, scrolled clear of the bottom bar.
    await tester.scrollUntilVisible(find.text('One'), 300, scrollable: workspace);
    await tester.drag(workspace, const Offset(0, -120));
    await tester.pumpAndSettle();
    await tester.tap(find.text('One').hitTestable().first);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tap(tester, find.text('Suggest changes'));
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(seconds: 2));
  });
}
