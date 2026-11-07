import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/outline_panel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/features/write/writing_prefs.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

/// A novel with one chapter holding [text], open in the workspace, at /write.
Future<({ProviderContainer c, String novel, String chapter})> openWrite(
  WidgetTester tester, {
  String text = 'The gate was open.\nNobody guarded it.',
  Size size = desktop,
  FakeBackupFiles? files,
  bool select = true,
}) async {
  final c = await pumpApp(tester, size: size, location: '/write', files: files);
  final novel = c.read(libraryServiceProvider).create({'title': 'Ash'});
  final m = c.read(manuscriptServiceProvider);
  final chapter = m.create(novel.id, NodeKind.chapter, title: 'The Gate');
  m.save(novel.id, chapter.id, textToDoc(text), baseRev: 0);
  c.read(openNovelProvider.notifier).open(novel.id);
  if (select) c.read(selectedNodeProvider.notifier).select(chapter.id);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id, chapter: chapter.id);
}

String storedText(ProviderContainer c, String novel, String chapter) =>
    blockTexts(c.read(novelStoreProvider).row(novel, 'chapterContents', chapter)!['doc']).join('\n');

void main() {
  // The caret blinks forever; tests wait for the screen to settle, so it holds still here.
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('with no novel open, Write says so', (tester) async {
    await pumpApp(tester, location: '/write');
    expect(find.text('No novel open'), findsOneWidget);
  });

  testWidgets('the outline lists the chapter; its text opens in the editor', (tester) async {
    await openWrite(tester);
    expect(find.text('The Gate'), findsWidgets);
    final doc = SuperEditorInspector.findDocument()!;
    expect([for (final n in doc) (n as TextNode).text.toPlainText()], ['The gate was open.', 'Nobody guarded it.']);
    expect(find.textContaining('7 words · 1 min read'), findsOneWidget);
  });

  testWidgets('typing is saved shortly after it stops, with the new word count', (tester) async {
    final w = await openWrite(tester);
    final last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 'Nobody guarded it.'.length);
    await tester.typeImeText(' Not even Orrin.');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), 'The gate was open.\nNobody guarded it. Not even Orrin.');
    expect(StoryNode(w.c.read(novelStoreProvider).row(w.novel, 'chapters', w.chapter)!).wordCount, 10);
    expect(find.textContaining('10 words · 1 min read'), findsOneWidget);
  });

  testWidgets('the writing desk: the page is headed like a book\'s, titled on the page, and counts the sitting', (
    tester,
  ) async {
    final w = await openWrite(tester);
    expect(find.text('CHAPTER 1'), findsOneWidget);

    // The title is typed on the page itself.
    await tester.enterText(find.widgetWithText(TextField, 'The Gate'), 'The Iron Gate');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    final m = w.c.read(manuscriptServiceProvider);
    expect(m.nodes(w.novel).single.title, 'The Iron Gate');

    // Words added since the chapter was opened.
    expect(find.textContaining('this session'), findsNothing);
    final last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 'Nobody guarded it.'.length);
    await tester.typeImeText(' Not even Orrin.');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('+3 this session'), findsOneWidget);

    // Today's goal, met: the ring closes and says so.
    m.setWordGoal(w.novel, 'daily', 1);
    w.c.read(selectedNodeProvider.notifier).select(null);
    await tester.pumpAndSettle();
    w.c.read(selectedNodeProvider.notifier).select(w.chapter);
    await tester.pumpAndSettle();
    expect(find.textContaining('· goal reached'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
  });

  testWidgets('text is saved exactly as typed: no Markdown shortcuts, dashes or links made for you', (tester) async {
    final w = await openWrite(tester, text: '');
    final first = SuperEditorInspector.findDocument()!.first;
    await tester.placeCaretInParagraph(first.id, 0);
    await tester.typeImeText('# Not a heading -- and > not a quote, see http://example.com');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), '# Not a heading -- and > not a quote, see http://example.com');
    final stored = w.c.read(novelStoreProvider).row(w.novel, 'chapterContents', w.chapter)!['doc']! as JsonMap;
    expect((stored['content']! as List).single, containsPair('type', 'paragraph'));
    expect(stored.toString(), isNot(contains('marks')), reason: 'nothing was formatted or linked');
  });

  testWidgets('unsaved writing left by a crash is offered back: keep it or keep the saved text', (tester) async {
    final w = await openWrite(tester, select: false);
    w.c.read(manuscriptServiceProvider).saveDraft(w.novel, w.chapter, textToDoc('The gate was open, and burning.'), 1);
    w.c.read(selectedNodeProvider.notifier).select(w.chapter);
    await tester.pumpAndSettle();
    expect(find.textContaining('was recovered'), findsOneWidget);
    expect(
      storedText(w.c, w.novel, w.chapter),
      'The gate was open.\nNobody guarded it.',
      reason: 'not applied on its own',
    );
    await tester.tap(find.text('Keep the recovered writing'));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), 'The gate was open, and burning.');
  });

  testWidgets('a chapter the editor cannot reproduce exactly opens read-only, with the reason', (tester) async {
    final w = await openWrite(tester, select: false);
    // A stored text from elsewhere with an image in it.
    w.c.read(novelStoreProvider).writeRows(w.novel, [
      RowWrite.put('chapterContents', {
        'id': w.chapter,
        'projectId': w.novel,
        'rev': 2,
        'doc': {
          'type': 'doc',
          'content': [
            {
              'type': 'image',
              'attrs': {'src': 'map.png'},
            },
            {
              'type': 'paragraph',
              'content': [
                {'type': 'text', 'text': 'Below the map.'},
              ],
            },
          ],
        },
      }),
    ]);
    w.c.read(selectedNodeProvider.notifier).select(w.chapter);
    await tester.pumpAndSettle();
    expect(find.textContaining('Shown read-only so nothing is lost'), findsOneWidget);
    expect(find.text('Below the map.'), findsOneWidget);
    expect(find.byType(SuperEditor), findsNothing);
  });

  testWidgets('adding a chapter from an empty outline opens it for writing', (tester) async {
    final c = await pumpApp(tester, location: '/write');
    final novel = c.read(libraryServiceProvider).create({'title': 'Empty'});
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    expect(find.text('No chapters yet'), findsOneWidget);
    await tester.tap(find.text('Add chapter'));
    await tester.pumpAndSettle();
    expect(find.text('Chapter 1'), findsWidgets);
    expect(find.byType(SuperEditor), findsOneWidget);
  });

  testWidgets('outline: rename, move down, delete with Undo', (tester) async {
    final w = await openWrite(tester);
    final m = w.c.read(manuscriptServiceProvider);
    m.create(w.novel, NodeKind.chapter, title: 'The Road');
    await tester.pumpAndSettle();

    Future<void> menu(String title, String action) async {
      await tester.tap(find.byTooltip('More for $title'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text(action).last);
      await tester.pumpAndSettle();
      await tester.tap(find.text(action).last);
      await tester.pumpAndSettle();
    }

    await menu('The Road', 'Rename…');
    await tester.enterText(find.widgetWithText(TextField, 'Title'), 'The Long Road');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(m.nodes(w.novel).map((n) => n.title), containsAll(['The Gate', 'The Long Road']));

    await menu('The Gate', 'Move down');
    expect(
      tester.getTopLeft(find.text('The Long Road').first).dy,
      lessThan(tester.getTopLeft(find.text('The Gate').first).dy),
    );

    await menu('The Long Road', 'Delete…');
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(m.nodes(w.novel).map((n) => n.title), ['The Gate']);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(m.nodes(w.novel), hasLength(2));
  });

  testWidgets('split here: the paragraph with the cursor starts a new chapter', (tester) async {
    final w = await openWrite(tester);
    final second = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(second.id, 0);
    await tester.tap(find.byTooltip('Split here: the paragraph with the cursor starts a new part'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Split'));
    await tester.pumpAndSettle();
    final nodes = w.c.read(manuscriptServiceProvider).nodes(w.novel);
    expect(nodes.map((n) => n.title), containsAll(['The Gate', 'The Gate (continued)']));
    expect(storedText(w.c, w.novel, w.chapter), 'The gate was open.');
  });

  testWidgets('version history compares a version with the text now, and restores it', (tester) async {
    final w = await openWrite(tester, select: false);
    final m = w.c.read(manuscriptServiceProvider);
    m.saveVersion(w.novel, w.chapter, label: 'First draft');
    m.save(w.novel, w.chapter, textToDoc('The gate was shut.'), baseRev: 1);
    w.c.read(selectedNodeProvider.notifier).select(w.chapter);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Version history'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('First draft'));
    await tester.pumpAndSettle();
    expect(find.textContaining('paragraphs changed since this version'), findsOneWidget);
    await tester.tap(find.text('Restore this version'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Restore'));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), 'The gate was open.\nNobody guarded it.');
  });

  testWidgets('export the manuscript in a standard format, and import a manuscript file', (tester) async {
    final files = FakeBackupFiles()
      ..manuscriptToPick = (
        name: 'Chapter Two.txt',
        bytes: Uint8List.fromList(utf8.encode('Line one.\n\nLine three.')),
      );
    final w = await openWrite(tester, files: files);
    await tester.tap(find.byTooltip('Import and export'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Export manuscript…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Markdown (.md)'));
    await tester.pumpAndSettle();
    expect(find.textContaining('1 chapter'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Export Markdown'));
    await tester.pumpAndSettle();
    expect(files.savedFiles.single.name, 'Ash.md');
    expect(
      utf8.decode(files.savedFiles.single.bytes),
      contains('## The Gate\n\nThe gate was open.\n\nNobody guarded it.'),
    );
    expect(find.textContaining('Nothing in the novel changed'), findsOneWidget);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Import and export'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Import a manuscript…'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Found 1 chapter · 4 words.'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Import'));
    await tester.pumpAndSettle();
    final imported = w.c.read(manuscriptServiceProvider).nodes(w.novel).firstWhere((n) => n.title == 'Chapter Two');
    // Blank lines between paragraphs are not paragraphs of their own, as the original app reads a text file.
    expect(blockTexts(w.c.read(novelStoreProvider).row(w.novel, 'chapterContents', imported.id)!['doc']), [
      'Line one.',
      'Line three.',
    ]);
    expect(find.textContaining('Imported “Chapter Two.txt”: 1 item added'), findsOneWidget);
  });

  testWidgets('writing goals are the author\'s own, shown against today\'s words', (tester) async {
    await openWrite(tester);
    await tester.tap(find.textContaining('Set a goal'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Each day'), '500');
    await tester.tap(find.text('Save goals'));
    await tester.pumpAndSettle();
    expect(find.textContaining('of 500 words'), findsOneWidget);
  });

  testWidgets('on a phone: the outline first, the chapter full screen, and back', (tester) async {
    final w = await openWrite(tester, size: phone, select: false);
    expect(find.byType(SuperEditor), findsNothing);
    await tester.tap(find.text('The Gate'));
    await tester.pumpAndSettle();
    expect(find.byType(SuperEditor), findsOneWidget);
    await tester.tap(find.byTooltip('Back to the outline'));
    await tester.pumpAndSettle();
    expect(find.byType(SuperEditor), findsNothing);
    expect(w.c.read(selectedNodeProvider), isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('writing settings: the page changes at once and is remembered after a restart', (tester) async {
    final db = AppDatabase.inMemory();
    addTearDown(db.close);
    final c = await pumpApp(tester, db: db, location: '/write');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'});
    final chapter = c.read(manuscriptServiceProvider).create(novel.id, NodeKind.chapter);
    c.read(openNovelProvider.notifier).open(novel.id);
    c.read(selectedNodeProvider.notifier).select(chapter.id);
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Writing settings'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('for this tablet'),
      findsOneWidget,
      reason: 'tests run as Android; a large window is a tablet',
    );
    await tester.tap(find.widgetWithText(ChoiceChip, 'Mono'));
    await tester.tap(find.widgetWithText(ChoiceChip, 'Sepia'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    final page = pageColors(WritingPage.sepia)!.background;
    expect(find.byWidgetPredicate((w) => w is ColoredBox && w.color == page), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    c.dispose();

    final again = await pumpApp(tester, db: db, location: '/write');
    final prefs = again.read(writingPrefsProvider)[DeviceForm.tablet]!;
    expect((prefs.font, prefs.page), (WritingFont.mono, WritingPage.sepia));
  });

  testWidgets('focus mode leaves only the text, and Exit focus brings everything back', (tester) async {
    await openWrite(tester);
    await tester.tap(find.byTooltip('Focus mode (⇧⌘F)'));
    await tester.pumpAndSettle();
    expect(find.byType(OutlinePanel), findsNothing);
    expect(find.byType(NavigationRail), findsNothing);
    expect(find.byTooltip('Bold (⌘B)'), findsNothing);
    expect(find.byType(SuperEditor), findsOneWidget);
    await tester.tap(find.text('Exit focus'));
    await tester.pumpAndSettle();
    expect(find.byType(OutlinePanel), findsOneWidget);
    expect(find.byType(NavigationRail), findsOneWidget);
  });

  testWidgets('find and replace changes the text only when asked, and it is saved', (tester) async {
    final w = await openWrite(tester, text: 'The gate was open.\nThe gate keeper slept.');
    await tester.tap(find.byTooltip('Find and replace (⌘F)'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Find'), 'gate');
    await tester.pumpAndSettle();
    expect(find.text('1 of 2'), findsOneWidget);
    expect(
      storedText(w.c, w.novel, w.chapter),
      'The gate was open.\nThe gate keeper slept.',
      reason: 'finding changes nothing',
    );
    await tester.tap(find.byTooltip('Replace…'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Replace with'), 'door');
    await tester.tap(find.text('Replace all'));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), 'The door was open.\nThe door keeper slept.');
    expect(find.text('Replaced 2 places.'), findsOneWidget);
  });

  testWidgets('Settings has the writing settings too', (tester) async {
    await pumpApp(tester, location: '/settings');
    expect(find.text('Writing'), findsWidgets);
    expect(find.text('Text size'), findsOneWidget);
  });

  testWidgets('the writing settings work on a phone at 200% text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await openWrite(tester, size: phone);
    await tester.tap(find.byTooltip('Writing settings'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.textContaining('for this phone'), findsOneWidget);
  });
}
