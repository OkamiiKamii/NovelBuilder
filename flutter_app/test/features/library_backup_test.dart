import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/theme/theme_choice.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/autosave.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';

import '../helpers/pump_app.dart';
import '../shared/domain/fixtures.dart';

String _fixtureText(String name) => jsonEncode(fixtureJson(name));

void main() {
  testWidgets('importing a backup: preview, confirm, then the novel is in the library', (tester) async {
    final files = FakeBackupFiles()..toPick = (name: 'qa.novel.json', text: _fixtureText('qa-sample'));
    final container = await pumpApp(tester, files: files);
    await tester.tap(find.text('Import backup'));
    await tester.pumpAndSettle();

    final title = (fixtureJson('qa-sample')! as JsonMap)['project']! as JsonMap;
    expect(find.text('Import “${title['title']}”?'), findsOneWidget);
    expect(find.textContaining('10 chapters, scenes and groups'), findsOneWidget);
    expect(find.textContaining('1 plot thread ·'), findsOneWidget, reason: 'one is singular');
    // Nothing is written before confirming.
    expect(container.read(libraryProvider), isEmpty);

    await tester.tap(find.widgetWithText(FilledButton, 'Import'));
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider), hasLength(1));
    expect(find.text(title['title']! as String), findsOneWidget);
    expect(find.text('Your library is empty'), findsNothing);

    // Opening it makes it the open novel and goes to Write.
    await tester.tap(find.text(title['title']! as String));
    await tester.pumpAndSettle();
    expect(container.read(openNovelProvider), title['id']);
    expect(currentLocation(container), '/write');
    expect(find.text('No novel open'), findsNothing);
  });

  testWidgets('a file that cannot be read is refused with its reason, and nothing changes', (tester) async {
    final files = FakeBackupFiles()..toPick = (name: 'notes.txt', text: 'Just some notes');
    final container = await pumpApp(tester, files: files);
    await tester.tap(find.text('Import backup'));
    await tester.pumpAndSettle();
    expect(find.text('This file cannot be imported'), findsOneWidget);
    expect(find.textContaining('not a JSON file'), findsOneWidget);
    expect(find.textContaining('Nothing was imported'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider), isEmpty);
  });

  testWidgets('importing over a stored novel asks first and keeps a restore point', (tester) async {
    final files = FakeBackupFiles()..toPick = (name: 'qa.novel.json', text: _fixtureText('qa-sample'));
    final container = await pumpApp(tester, files: files);
    for (var i = 0; i < 2; i++) {
      await tester.tap(find.text('Import backup'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(i == 0 ? 'Import' : 'Replace'));
      await tester.pumpAndSettle();
    }
    expect(container.read(libraryProvider), hasLength(1));
    expect(container.read(restorePointsProvider), hasLength(1));
  });

  testWidgets('exporting a backup hands the whole novel to the chosen place', (tester) async {
    final files = FakeBackupFiles();
    final container = await pumpApp(tester, files: files);
    container.read(novelStoreProvider).putNovel(loadFixture('qa-sample'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('More for ${loadFixture('qa-sample').project['title']}'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Export backup'));
    await tester.pumpAndSettle();
    final saved = files.saved.single;
    expect(saved.name, endsWith('.novel.json'));
    final json = jsonDecode(saved.text) as JsonMap;
    expect(((json['collections']! as JsonMap)['loreEntries']! as List), hasLength(13));
    expect(find.textContaining('Saved'), findsWidgets);
  });

  testWidgets('the theme choice survives a restart', (tester) async {
    final db = AppDatabase.inMemory();
    addTearDown(db.close);
    var container = await pumpApp(tester, db: db, location: '/settings');
    await tester.tap(find.text(ThemeChoice.dark.label));
    await tester.pumpAndSettle();
    container.dispose();

    // A new app on the same library.
    container = await pumpApp(tester, db: db, location: '/settings');
    expect(container.read(themeChoiceProvider), ThemeChoice.dark);
  });

  testWidgets('a failed save is visible until it is saved, with Retry', (tester) async {
    final container = await pumpApp(tester);
    var broken = true;
    container.read(saveControllerProvider).saveNow('test', () {
      if (broken) throw StateError('disk is full');
    });
    await tester.pump();
    expect(container.read(saveStatusProvider).state, SaveState.failed);
    expect(find.text('Not saved'), findsOneWidget);
    expect(find.text('Saved on this device'), findsNothing);

    broken = false;
    await tester.tap(find.text('Retry'));
    await tester.pump();
    expect(find.text('Not saved'), findsNothing);
    expect(find.text('Saved on this device'), findsOneWidget);
  });

  testWidgets('on a phone the save status takes no room while saved, and appears when it is not', (tester) async {
    final container = await pumpApp(tester, size: phone);
    expect(find.text('Saved on this device'), findsNothing);
    container.read(saveControllerProvider).schedule('x', () {});
    await tester.pump();
    expect(find.text('Unsaved changes'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Unsaved changes'), findsNothing);
  });

  testWidgets('a restore point can be restored from Settings, after confirming', (tester) async {
    final container = await pumpApp(tester, location: '/settings');
    final s = loadFixture('qa-sample');
    final store = container.read(novelStoreProvider)..putNovel(s);
    container.read(backupServiceProvider).keepRestorePoint(s.projectId, 'Before a test');
    store.putNovel(s.putRow('loreEntries', {...s.rows('loreEntries').first, 'name': 'Changed'}));
    await tester.pumpAndSettle();

    expect(find.textContaining('Before a test'), findsOneWidget);
    await tester.ensureVisible(find.widgetWithText(TextButton, 'Restore').first);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Restore').first);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Restore'));
    await tester.pumpAndSettle();
    expect(store.load(s.projectId)!.rows('loreEntries').first['name'], s.rows('loreEntries').first['name']);
  });
}
