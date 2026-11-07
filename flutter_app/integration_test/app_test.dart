import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:integration_test/integration_test.dart';
import 'package:novel_builder/app/app.dart';
import 'package:novel_builder/app/destinations.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/app/shell/app_shell.dart';
import 'package:novel_builder/app/theme/theme_choice.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/collab/collab_providers.dart';
import 'package:novel_builder/features/places/places_providers.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/review/review_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/module_library.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/settings_store.dart';
import 'package:novel_builder/shared/data/template_store.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/codex/world_presets.dart';
import 'package:novel_builder/shared/domain/collab/access.dart';
import 'package:novel_builder/shared/domain/collab/collab_changes.dart';
import 'package:novel_builder/shared/domain/collab/records.dart';
import 'package:novel_builder/shared/domain/collab/review_files.dart';
import 'package:novel_builder/shared/domain/ids.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/modules/module_changes.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/sharing/template_files.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/systems/system_changes.dart' show instantiateBlueprint;
import 'package:novel_builder/shared/domain/systems/system_presets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

/// Runs on a real device or simulator: `tool/local_mirror.sh test <device-id>`.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpWith(WidgetTester tester, AppDatabase db) async {
    // The app widget itself, without bootstrap(): its error handlers would replace the test framework's.
    await tester.pumpWidget(
      ProviderScope(
        key: UniqueKey(),
        overrides: [databaseProvider.overrideWithValue(db)],
        child: const NovelBuilderApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Goes to an area the way a person would: the rail on wide screens, the bottom bar (or More) on phones.
  Future<void> goTo(WidgetTester tester, Destination d) async {
    final rail = find.byType(NavigationRail);
    if (rail.evaluate().isNotEmpty) {
      await tester.tap(find.descendant(of: rail, matching: find.text(d.label)));
    } else if (AppShell.compactPrimary.contains(d)) {
      await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(d.label)));
    } else {
      await tester.tap(find.text('More'));
      await tester.pumpAndSettle();
      final item = find.descendant(of: find.byType(BottomSheet), matching: find.text(d.label));
      // On a short screen the area may be further down the sheet.
      await tester.scrollUntilVisible(
        item,
        100,
        scrollable: find.descendant(of: find.byType(BottomSheet), matching: find.byType(Scrollable)).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(item);
    }
    await tester.pumpAndSettle();
  }

  /// Chooses a view of Visualize from its View menu, scrolling the open menu to it: on a short window the menu opens
  /// scrolled to the view shown now, so one far up or down the list is out of sight until scrolled to.
  Future<void> chooseView(WidgetTester tester, String label) async {
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'View'));
    await tester.pumpAndSettle();
    final menu = find.byWidgetPredicate((w) => w.runtimeType.toString().startsWith('_DropdownMenu<'));
    final item = find.descendant(of: menu, matching: find.text(label));
    final list = find.descendant(of: menu, matching: find.byType(Scrollable)).first;
    for (final step in [const Offset(0, 120), const Offset(0, -120)]) {
      for (var i = 0; i < 12 && item.hitTestable().evaluate().isEmpty; i++) {
        await tester.drag(list, step);
        await tester.pumpAndSettle();
      }
    }
    await tester.tap(item.hitTestable().first);
    await tester.pumpAndSettle();
  }

  testWidgets('the app launches and every area can be reached', timeout: const Timeout(Duration(minutes: 2)), (
    tester,
  ) async {
    final db = AppDatabase.inMemory();
    await pumpWith(tester, db);
    expect(find.text('Begin chapter one'), findsOneWidget, reason: 'an empty library is a title page');

    for (final d in Destination.values) {
      await goTo(tester, d);
      expect(find.text(d.label), findsWidgets, reason: d.label);
    }
    db.close();
  });

  testWidgets(
    'a novel and a setting saved in the library file on this device survive a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}restart_test${Platform.pathSeparator}library.sqlite3';
      final file = File(path);
      if (file.parent.existsSync()) file.parent.deleteSync(recursive: true);

      // First run: a novel arrives and the dark theme is chosen.
      final first = AppDatabase.open(path);
      NovelStore(first).putNovel(
        NovelSnapshot(
          project: {'id': 'restart-test', 'title': 'The Survivor', 'status': 'drafting', 'unknownSetting': 'kept'},
          collections: {
            'chapters': [
              {
                'id': 'c1',
                'projectId': 'restart-test',
                'parentId': null,
                'kind': 'chapter',
                'title': 'One',
                'order': 0,
              },
            ],
          },
        ),
      );
      await pumpWith(tester, first);
      await goTo(tester, Destination.settings);
      await tester.ensureVisible(find.text(ThemeChoice.dark.label));
      await tester.tap(find.text(ThemeChoice.dark.label));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      first.close();

      // Second run: everything is still there.
      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      expect(find.text('The Survivor'), findsOneWidget);
      expect(Theme.of(tester.element(find.text('Library').first)).brightness, Brightness.dark);
      final stored = NovelStore(second).load('restart-test')!;
      expect(stored.project['unknownSetting'], 'kept');
      expect(stored.rows('chapters').single['title'], 'One');
      await tester.pumpWidget(const SizedBox());
      second.close();
      file.parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'managing novels: create through the form, duplicate, delete and undo',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final db = AppDatabase.inMemory();
      await pumpWith(tester, db);

      await tester.ensureVisible(find.text('More details'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('More details'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextFormField, 'Title *'), 'Device Novel');
      await tester.tap(find.text('Create novel'));
      await tester.pumpAndSettle();
      expect(find.text('Device Novel'), findsOneWidget);

      Future<void> menu(String title, String action) async {
        await tester.tap(find.byTooltip('More for $title'));
        await tester.pumpAndSettle();
        // A menu opened near the bottom of a small window scrolls; bring the item into view as a person would.
        await tester.ensureVisible(find.text(action).last);
        await tester.pumpAndSettle();
        await tester.tap(find.text(action).last);
        await tester.pumpAndSettle();
      }

      await menu('Device Novel', 'Duplicate');
      expect(find.text('Device Novel (Copy)'), findsOneWidget);

      await menu('Device Novel (Copy)', 'Delete…');
      await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
      await tester.pumpAndSettle();
      expect(find.text('Device Novel (Copy)'), findsNothing);
      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();
      expect(find.text('Device Novel (Copy)'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      db.close();
    },
  );

  testWidgets(
    'the title page on the device: a title typed, Begin, and the first words written in chapter one',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      BlinkController.indeterminateAnimationsEnabled = false;
      addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
      final db = AppDatabase.inMemory();
      await pumpWith(tester, db);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));

      await tester.enterText(find.widgetWithText(TextField, 'Your title'), 'First Light');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Begin chapter one'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Begin chapter one'));
      await tester.pumpAndSettle();
      final novel = container.read(libraryProvider).single;
      expect(novel.title, 'First Light');
      expect(container.read(routerProvider).routerDelegate.currentConfiguration.uri.toString(), '/write');

      final paragraph = SuperEditorInspector.findDocument()!.first;
      await tester.placeCaretInParagraph(paragraph.id, 0);
      await tester.typeImeText('It began here.');
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      final chapter = container.read(manuscriptServiceProvider).nodes(novel.id).single;
      expect(chapter.wordCount, 3);
      await tester.pumpWidget(const SizedBox());
      db.close();
    },
  );

  testWidgets(
    'writing on the device: type, find and replace, focus mode; it is saved and there after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      BlinkController.indeterminateAnimationsEnabled = false;
      addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}write_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Book'});
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      await goTo(tester, Destination.write);
      await tester.tap(find.text('Add chapter'));
      await tester.pumpAndSettle();
      final paragraph = SuperEditorInspector.findDocument()!.first;
      await tester.placeCaretInParagraph(paragraph.id, 0);
      await tester.typeImeText('Written on this device.');
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();

      // Find and replace on the device: finding changes nothing, Replace all does, and it is saved.
      await tester.tap(find.byTooltip('Find and replace (⌘F)'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Find'), 'device');
      await tester.pumpAndSettle();
      expect(find.text('1 of 1'), findsOneWidget);
      await tester.tap(find.byTooltip('Replace…'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Replace with'), 'phone');
      await tester.tap(find.text('Replace all'));
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Close find (Esc)'));
      await tester.pumpAndSettle();

      // Focus mode leaves only the text, and comes back.
      await tester.tap(find.byTooltip('Focus mode (⇧⌘F)'));
      await tester.pumpAndSettle();
      expect(find.text('Exit focus'), findsOneWidget);
      expect(find.byTooltip('Version history'), findsNothing);
      await tester.tap(find.text('Exit focus'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Version history'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final again = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final chapter = again.read(outlineProvider).single;
      final stored = NovelStore(second).row(novel.id, 'chapterContents', chapter.id)!;
      expect(blockTexts(stored['doc']), ['Written on this phone.']);
      expect(chapter.wordCount, 4);
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'characters on the device: create one, type on the profile, and it is there after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}character_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Cast'});
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      await goTo(tester, Destination.organize);
      await tester.tap(find.text('Create a character'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Name *'), 'Mira');
      await tester.tap(find.text('Add to the cast'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit profile'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Title or epithet'), 'The Cartographer');
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final entries = NovelStore(second).rowsIn(novel.id, 'loreEntries');
      expect([for (final e in entries) e['name']], ['Mira']);
      final profile = NovelStore(second).rowsIn(novel.id, 'characterProfiles').single;
      expect(profile['epithet'], 'The Cartographer');
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'the world on the device: a new place, a value typed on it, and both there after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}world_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device World'});
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      await goTo(tester, Destination.organize);
      await tester.tap(find.text('World'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('New entry'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Location').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Name'), 'The Keep');
      await tester.enterText(find.widgetWithText(TextField, 'Region'), 'The north');
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final place = NovelStore(second).rowsIn(novel.id, 'loreEntries').single;
      expect(place['name'], 'The Keep');
      expect([for (final f in maps(place['fields'])) f['value']], ['The north']);
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'the timeline on the device: an event dated, drawn along story time, and still there after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}timeline_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Timeline'});
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      await goTo(tester, Destination.plan);
      await tester.tap(find.text('New event').first);
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Event name'), 'The siege');
      await tester.tap(find.widgetWithText(ChoiceChip, 'Exact'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Year'), '1020');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      await goTo(tester, Destination.visualize);
      await chooseView(tester, 'Timeline');
      await tester.pumpAndSettle();
      expect(find.textContaining('Timeline of 1 dated event'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final event = NovelStore(second).rowsIn(novel.id, 'timelineEvents').single;
      expect([event['name'], mapOrNull(event['when'])?['year']], ['The siege', 1020]);
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'a saved view on the device: saved from Visualize, and still there to open after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}saved_view_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Views'});
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      await goTo(tester, Destination.visualize);
      await tester.tap(find.text('List'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Saved views (0)'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save view as…'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'Everyone, as a list');
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final view = NovelStore(second).rowsIn(novel.id, 'savedViews').single;
      expect([view['view'], view['name'], view['mode']], ['relationships', 'Everyone, as a list', 'list']);
      await goTo(tester, Destination.visualize);
      expect(find.text('Saved views (1)'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'plot threads and the scene board on the device: a thread named, a chapter moved, both there after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}plot_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Plot'});
      final ms = container.read(manuscriptServiceProvider);
      final gate = ms.create(novel.id, NodeKind.chapter, title: 'The Gate').id;
      final river = ms.create(novel.id, NodeKind.chapter, title: 'The River').id;
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      await goTo(tester, Destination.plan);
      await tester.tap(find.widgetWithText(ChoiceChip, 'Plot threads'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('New thread').first);
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Thread title'), 'The stolen key');
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Plot threads').first);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ChoiceChip, 'Scene board'));
      await tester.pumpAndSettle();
      final later = find.byTooltip('Move The Gate later');
      await tester.ensureVisible(later);
      await tester.pumpAndSettle();
      await tester.tap(later);
      await tester.pumpAndSettle();
      expect(find.text('Undo move of “The Gate”'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final store = NovelStore(second);
      expect(store.rowsIn(novel.id, 'plotThreads').single['title'], 'The stolen key');
      final order = [
        for (final r in [
          ...store.rowsIn(novel.id, 'chapters'),
        ]..sort((a, b) => (a['order']! as num).compareTo(b['order']! as num)))
          r['id'],
      ];
      expect(order, [river, gate]);
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'the knowledge graph on the device: drawn, a setting changed and saved with a view, kept after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}graph_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Graph'});
      final people = container.read(characterServiceProvider);
      final mira = people.change(novel.id, (x) => x.create(name: 'Mira')).id;
      final bren = people.change(novel.id, (x) => x.create(name: 'Bren')).id;
      people.change(novel.id, (x) => x.create(name: 'Corin'));
      people.change(
        novel.id,
        (x) => x.createConnection(
          from: EntityRef(EntityType.entry, mira),
          to: EntityRef(EntityType.entry, bren),
          type: 'allied-with',
        ),
      );
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      await goTo(tester, Destination.visualize);
      await chooseView(tester, 'Knowledge graph');
      await tester.pumpAndSettle();
      expect(find.text('Showing 2 of 3 records and 1 of 1 connections.'), findsOneWidget);
      final draw = find.text('Draw them');
      await tester.ensureVisible(draw);
      await tester.pumpAndSettle();
      await tester.tap(draw);
      await tester.pumpAndSettle();
      expect(find.text('Showing 3 of 3 records and 1 of 1 connections.'), findsOneWidget);
      final saved = find.text('Saved views (0)');
      await tester.ensureVisible(saved);
      await tester.pumpAndSettle();
      await tester.tap(saved);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save view as…'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'Everyone');
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final view = NovelStore(second).rowsIn(novel.id, 'savedViews').single;
      expect([view['view'], view['name'], mapOrNull(view['layout'])?['gall']], ['graph', 'Everyone', '1']);
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'kinds of record on the device: a template added, shown by kind, saved as a template, all kept after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}kinds_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Kinds'});
      final people = container.read(characterServiceProvider);
      people.change(novel.id, (x) => x.addKinds(worldPresets.firstWhere((p) => p.name == 'Detective Case').categories));
      final cases = people.change(novel.id, (x) => x.categories().firstWhere((c) => c.name == 'Cases')).key;
      people.change(novel.id, (x) => x.createEntry(cases, 'The Glass Key'));
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      await goTo(tester, Destination.visualize);
      await chooseView(tester, 'Records by kind');
      await tester.pumpAndSettle();
      expect(find.text('The Glass Key'), findsOneWidget);
      container.read(templatesProvider.notifier).save('Casework', 'One kind of record: Cases', [
        CodexChanges.kindTemplate(people.change(novel.id, (x) => x.category(cases))),
      ]);
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final names = [for (final r in NovelStore(second).rowsIn(novel.id, 'loreSchemas')) r['name']];
      expect(names, containsAll(['Clues', 'Cases']));
      expect(TemplateStore(SettingsStore(second)).list().single.name, 'Casework');
      // Templates belong to the author, not to a novel: test settings are left as they were found.
      TemplateStore(SettingsStore(second)).remove(TemplateStore(SettingsStore(second)).list().single.id);
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'progression on the device: a system from a preset, a sheet, a change recorded, all kept after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}growth_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Growth'});
      final mira = container.read(characterServiceProvider).change(novel.id, (x) => x.create(name: 'Mira')).id;
      final growth = container.read(progressionServiceProvider);
      growth.track(novel.id, (x) => x.addPreset('Level'));
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();

      // A system from a preset, and Mira put on it, the way a person would.
      container.read(routerProvider).go('/organize/systems');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Or start from a preset…'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(systemPresets.first.name).last);
      await tester.pumpAndSettle();
      final sheets = find.textContaining('Sheets (0)');
      await tester.ensureVisible(sheets);
      await tester.pumpAndSettle();
      await tester.tap(sheets);
      await tester.pumpAndSettle();
      final add = find.text('Add a character or entry…');
      await tester.ensureVisible(add);
      await tester.pumpAndSettle();
      await tester.tap(add);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mira').last);
      await tester.pumpAndSettle();

      // A change recorded on her Progression tab.
      container.read(routerProvider).go('/organize/character/$mira?tab=progression');
      await tester.pumpAndSettle();
      final value = find.widgetWithText(TextField, 'Set to');
      await tester.ensureVisible(value);
      await tester.pumpAndSettle();
      await tester.enterText(value, '12');
      await tester.pumpAndSettle();
      final record = find.text('Record the change');
      await tester.ensureVisible(record);
      await tester.pumpAndSettle();
      await tester.tap(record);
      await tester.pumpAndSettle();
      expect(find.text('12', findRichText: true), findsWidgets);
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final store = NovelStore(second);
      expect(store.rowsIn(novel.id, 'systems').single['name'], systemPresets.first.content['name']);
      expect(store.rowsIn(novel.id, 'systemSheets').single['entryId'], mira);
      final change = store.rowsIn(novel.id, 'progressChanges').single;
      expect([change['entryId'], change['value']], [mira, '12']);
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'places and journeys on the device: a place pinned on a map, a journey recorded, both kept after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}world_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device World'});
      final people = container.read(characterServiceProvider);
      final mira = people.change(novel.id, (x) => x.create(name: 'Mira')).id;
      final keep = people.change(novel.id, (x) => x.createEntry('location', 'Greykeep')).id;
      final port = people.change(novel.id, (x) => x.createEntry('location', 'Saltport')).id;
      final places = container.read(placesServiceProvider);
      final map = places.change(novel.id, (x) => x.saveMap(null, name: 'The Known World'));
      places.change(novel.id, (x) => x.pin(map.id, keep, 10, 20));
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();

      // A journey recorded the way a person would.
      container.read(routerProvider).go('/visualize/journeys');
      await tester.pumpAndSettle();
      Future<void> tap(Finder f) async {
        await tester.ensureVisible(f);
        await tester.pumpAndSettle();
        await tester.tap(f);
        await tester.pumpAndSettle();
      }

      await tap(find.text('Record a journey').last);
      await tap(find.widgetWithText(FilterChip, 'Mira'));
      await tap(find.widgetWithText(DropdownButtonFormField<String>, 'From'));
      await tap(find.text('Greykeep').last);
      await tap(find.widgetWithText(DropdownButtonFormField<String>, 'To'));
      await tap(find.text('Saltport').last);
      await tap(find.text('Save the journey'));
      expect(find.text('Mira: Greykeep to Saltport'), findsWidgets);
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final store = NovelStore(second);
      final journey = store.rowsIn(novel.id, 'journeys').single;
      expect(
        [journey['travellerIds'], journey['fromId'], journey['toId']],
        [
          [mira],
          keep,
          port,
        ],
      );
      final pin = store.rowsIn(novel.id, 'mapPins').single;
      expect([pin['entryId'], pin['x'], pin['y']], [keep, 10, 20]);
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'canon and continuity on the device: a statement set to Canon, a death tracked, a decision kept after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}canon_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Canon'});
      final mira = container.read(characterServiceProvider).change(novel.id, (x) => x.create(name: 'Mira')).id;
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      Future<void> tap(Finder f) async {
        await tester.ensureVisible(f);
        await tester.pumpAndSettle();
        await tester.tap(f);
        await tester.pumpAndSettle();
      }

      // A statement, made Canon the way a person would.
      container.read(routerProvider).go('/review/canon');
      await tester.pumpAndSettle();
      await tap(find.text('New statement').last);
      await tester.enterText(find.widgetWithText(TextField, 'Statement'), 'Two moons');
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      await tap(find.widgetWithText(ChoiceChip, 'Canon').last);
      // A death tracked, and the conflict-free review decided about.
      container.read(canonServiceProvider).rules(novel.id, (x) => x.createRule('status', {'entryId': mira}));
      container
          .read(canonServiceProvider)
          .canon(novel.id, (x) => x.create(subject: 'Weather', status: CanonStatus.conflicting));
      container.read(routerProvider).go('/review');
      await tester.pumpAndSettle();
      await tap(find.text('Intentional').last);
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final store = NovelStore(second);
      final facts = store.rowsIn(novel.id, 'canonFacts');
      expect(facts.firstWhere((f) => f['statement'] == 'Two moons')['status'], 'canon');
      expect(store.rowsIn(novel.id, 'continuityRules').single['entryId'], mira);
      expect(store.rowsIn(novel.id, 'continuityResolutions').single['kind'], 'intentional');
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );
  testWidgets(
    'progress and charts on the device: a target and a task set, the charts read, both kept after a restart',
    timeout: const Timeout(Duration(minutes: 2)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}${Platform.pathSeparator}progress_test${Platform.pathSeparator}library.sqlite3';
      if (File(path).parent.existsSync()) File(path).parent.deleteSync(recursive: true);

      final first = AppDatabase.open(path);
      await pumpWith(tester, first);
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Progress'});
      JsonMap chapter(String id, String title, int order, int words) => {
        'id': id,
        'projectId': novel.id,
        'parentId': null,
        'kind': 'chapter',
        'title': title,
        'order': order,
        'status': 'drafting',
        'wordCount': words,
        'createdAt': order,
        'updatedAt': 0,
      };
      container.read(novelStoreProvider).writeRows(novel.id, [
        RowWrite.put('chapters', chapter('c1', 'Dawn', 0, 1500)),
        RowWrite.put('chapters', chapter('c2', 'Dusk', 1, 2500)),
      ]);
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      Future<void> tap(Finder f) async {
        await tester.ensureVisible(f);
        await tester.pumpAndSettle();
        await tester.tap(f);
        await tester.pumpAndSettle();
      }

      // A weekly target and a task, set the way a person would.
      container.read(routerProvider).go('/progress');
      await tester.pumpAndSettle();
      expect(find.text('4,000'), findsWidgets);
      final weekly = find.widgetWithText(TextField, 'Words per week');
      await tester.ensureVisible(weekly);
      await tester.enterText(weekly, '3000');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      await tap(find.text('Add task').last);
      await tester.enterText(find.widgetWithText(TextField, 'Task name'), 'Outline book two');
      await tap(find.widgetWithText(FilledButton, 'Add task'));
      // The charts count what is recorded.
      container.read(routerProvider).go('/visualize/charts');
      await tester.pumpAndSettle();
      expect(find.text('2 chapters, 4,000 words in all; the most words: Ch 2: Dusk (2,500).'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      first.close();

      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final goals = NovelStore(second).rowsIn(novel.id, 'goals');
      expect(
        {for (final g in goals) g['kind']: g['kind'] == 'task' ? g['title'] : g['targetWords']},
        {'weekly': 3000, 'task': 'Outline book two'},
      );
      await tester.pumpWidget(const SizedBox());
      second.close();
      File(path).parent.deleteSync(recursive: true);
    },
  );

  testWidgets(
    'import and export on the device: a Word file and a PDF made, a manuscript imported, a picture of a view, kept after a restart',
    timeout: const Timeout(Duration(minutes: 3)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final root = '${dir.path}${Platform.pathSeparator}exchange_test';
      final path = '$root${Platform.pathSeparator}library.sqlite3';
      if (Directory(root).existsSync()) Directory(root).deleteSync(recursive: true);
      Directory(root).createSync(recursive: true);
      final files = _DiskFiles(root);

      final first = AppDatabase.open(path);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [databaseProvider.overrideWithValue(first), backupFilesProvider.overrideWithValue(files)],
          child: const NovelBuilderApp(),
        ),
      );
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Exchange'});
      final m = container.read(manuscriptServiceProvider);
      final chapter = m.create(novel.id, NodeKind.chapter, title: 'The Gate');
      m.save(novel.id, chapter.id, textToDoc('Rain fell on the “black gate”—and nobody came.'), baseRev: 0);
      container.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      Future<void> tap(Finder f) async {
        // On a phone the page's lower buttons are built only once scrolled to.
        if (f.evaluate().isEmpty) {
          await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).last);
        }
        await tester.ensureVisible(f);
        await tester.pumpAndSettle();
        await tester.tap(f);
        await tester.pumpAndSettle();
      }

      // The manuscript as a Word document and as a PDF, made on the device and written to its disk.
      container.read(routerProvider).go('/settings/import-export');
      await tester.pumpAndSettle();
      await tap(find.text('Export manuscript…'));
      await tap(find.widgetWithText(FilledButton, 'Export Word document'));
      final docx = File('$root${Platform.pathSeparator}Device Exchange.docx').readAsBytesSync();
      expect(docx.sublist(0, 2), [0x50, 0x4b]);
      await tap(find.text('PDF (.pdf)'));
      await tap(find.widgetWithText(FilledButton, 'Export PDF'));
      final pdf = File('$root${Platform.pathSeparator}Device Exchange.pdf').readAsBytesSync();
      expect(String.fromCharCodes(pdf.sublist(0, 5)), '%PDF-');
      await tap(find.text('Close'));

      // A Markdown manuscript imported: chapters and scenes found, seen first, then added.
      File(
        '$root${Platform.pathSeparator}book.md',
      ).writeAsStringSync('# Chapter 1\n\nMira **waited**.\n\n* * *\n\nThe second scene.\n\n# Chapter 2\n\nRain.\n');
      files.manuscript = 'book.md';
      await tap(find.text('Choose a file…'));
      expect(find.textContaining('Found 2 chapters, 2 scenes'), findsOneWidget);
      await tap(find.widgetWithText(FilledButton, 'Import'));
      expect(m.nodes(novel.id).map((n) => n.title), containsAll(['Chapter 1', 'Chapter 2', 'Scene 1', 'Scene 2']));

      // A picture of a view, drawn by the device.
      container.read(routerProvider).go('/visualize/structure');
      await tester.pumpAndSettle();
      await tap(find.byTooltip('Export this view'));
      await tap(find.widgetWithText(FilledButton, 'Export'));
      final png = Directory(root).listSync().whereType<File>().where((f) => f.path.endsWith('.png')).single;
      expect(png.readAsBytesSync().sublist(0, 4), [0x89, 0x50, 0x4e, 0x47]);
      await tap(find.text('Close'));
      await tester.pumpWidget(const SizedBox());
      first.close();

      // After a restart: the imported chapters are there, with their text; a backup of it comes back as a copy.
      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final store = NovelStore(second);
      final chapters = [for (final r in store.rowsIn(novel.id, 'chapters')) StoryNode(r)];
      final scene = chapters.firstWhere((n) => n.title == 'Scene 1');
      expect(blockTexts(store.row(novel.id, 'chapterContents', scene.id)!['doc']), ['Mira waited.']);
      final restarted = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final backups = restarted.read(backupServiceProvider);
      final copy = restarted
          .read(libraryServiceProvider)
          .importAsCopy(backups.previewImport(backups.exportBackup(novel.id)));
      expect(NovelStore(second).rowsIn(copy.id, 'chapters').length, chapters.length);
      await tester.pumpWidget(const SizedBox());
      second.close();
      Directory(root).deleteSync(recursive: true);
    },
  );

  testWidgets(
    'the reader on the device: pages measured with its own fonts, an ebook and a web serial written to disk, and the place kept after a restart',
    timeout: const Timeout(Duration(minutes: 3)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final root = '${dir.path}${Platform.pathSeparator}reader_test';
      final path = '$root${Platform.pathSeparator}library.sqlite3';
      if (Directory(root).existsSync()) Directory(root).deleteSync(recursive: true);
      Directory(root).createSync(recursive: true);
      final files = _DiskFiles(root);

      final first = AppDatabase.open(path);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [databaseProvider.overrideWithValue(first), backupFilesProvider.overrideWithValue(files)],
          child: const NovelBuilderApp(),
        ),
      );
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = container.read(libraryServiceProvider).create({'title': 'Device Reader'});
      final m = container.read(manuscriptServiceProvider);
      final one = m.create(novel.id, NodeKind.chapter, title: 'The Long Road');
      const paragraph = 'The road went on past the mill and the river, and Mira walked it without counting the miles. ';
      m.save(novel.id, one.id, textToDoc([for (var i = 0; i < 40; i++) paragraph * 3].join('\n\n')), baseRev: 0);
      final two = m.create(novel.id, NodeKind.chapter, title: 'Home');
      m.save(novel.id, two.id, textToDoc('The door was open.'), baseRev: 0);
      container.read(openNovelProvider.notifier).open(novel.id);
      container.read(routerProvider).go('/write/read');
      await tester.pumpAndSettle();
      final before = NovelStore(first).rowsIn(novel.id, 'chapterContents').toString();

      // The long chapter runs over several pages, measured with the device's own typefaces.
      Future<void> turn() async {
        await tester.tap(find.byTooltip('Next page').first);
        await tester.pumpAndSettle();
      }

      String footer() => tester
          .widgetList<Text>(find.textContaining('The Long Road'))
          .map((t) => t.data ?? '')
          .firstWhere((t) => t.contains('page '), orElse: () => '');
      for (var i = 0; i < 12 && footer().isEmpty; i++) {
        await turn();
      }
      expect(footer(), matches(RegExp(r'page 1 of [2-9]|page 1 of \d\d')));
      await turn();
      await turn();
      expect(footer(), contains('page 3 of'));
      await tester.pump(const Duration(seconds: 1));

      // An ebook and every chapter of a web serial, written to the device's disk.
      // On a phone, Publish is in the reader's menu; on a wider screen, in its toolbar.
      final menu = find.byTooltip('Book details and publishing');
      if (menu.evaluate().isNotEmpty) {
        await tester.tap(menu);
        await tester.pumpAndSettle();
      }
      await tester.tap(find.text('Publish…').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save…'));
      await tester.pumpAndSettle();
      final epub = File('$root${Platform.pathSeparator}Device Reader.epub').readAsBytesSync();
      expect(String.fromCharCodes(epub.sublist(30, 38)), 'mimetype');
      await tester.tap(find.text('Web serial: every chapter'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save…'));
      await tester.pumpAndSettle();
      expect(File('$root${Platform.pathSeparator}Device Reader - web serial.zip').existsSync(), isTrue);
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      expect(NovelStore(first).rowsIn(novel.id, 'chapterContents').toString(), before);
      await tester.pumpWidget(const SizedBox());
      first.close();

      // After a restart, the reader opens where it was left.
      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      final restarted = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      restarted.read(openNovelProvider.notifier).open(novel.id);
      restarted.read(routerProvider).go('/write/read');
      await tester.pumpAndSettle();
      expect(footer(), contains('page 3 of'));
      await tester.pumpWidget(const SizedBox());
      second.close();
      Directory(root).deleteSync(recursive: true);
    },
  );

  testWidgets(
    'review by file on the device: a review copy and a feedback file written to disk, a restart between, an accepted change in the book',
    timeout: const Timeout(Duration(minutes: 3)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final root = '${dir.path}${Platform.pathSeparator}review_test';
      final path = '$root${Platform.pathSeparator}library.sqlite3';
      if (Directory(root).existsSync()) Directory(root).deleteSync(recursive: true);
      Directory(root).createSync(recursive: true);
      final files = _DiskFiles(root);
      Future<ProviderContainer> start(AppDatabase db) async {
        await tester.pumpWidget(
          ProviderScope(
            key: UniqueKey(),
            overrides: [databaseProvider.overrideWithValue(db), backupFilesProvider.overrideWithValue(files)],
            child: const NovelBuilderApp(),
          ),
        );
        await tester.pumpAndSettle();
        return ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      }

      final first = AppDatabase.open(path);
      var c = await start(first);
      final novel = c.read(libraryServiceProvider).create({'title': 'Device Review'});
      final m = c.read(manuscriptServiceProvider);
      final chapter = m.create(novel.id, NodeKind.chapter, title: 'The Bridge');
      m.save(novel.id, chapter.id, textToDoc('First line.\nSecond line.\nThird line.'), baseRev: 0);
      c.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();

      // The owner adds Sam as an editor and makes a review copy: a file on the device's disk.
      final actions = c.read(collabActionsProvider);
      final sam = actions.addMember(name: 'Sam', email: '', role: Role.editor);
      await actions.sendReviewCopy(sam);
      final copyFile = File('$root${Platform.pathSeparator}Device Review - review copy for Sam.novel.json');
      expect(copyFile.existsSync(), isTrue);

      // Sam opens it (here on the same device, beside the owner's novel) and works in it.
      final store = c.read(novelStoreProvider);
      final local = openReviewCopy(
        store,
        c.read(backupServiceProvider).previewImport(copyFile.readAsStringSync()).snapshot,
      );
      c.read(openNovelProvider.notifier).open(local);
      c.read(routerProvider).go('/write');
      await tester.pumpAndSettle();
      expect(find.textContaining('Review copy of “Device Review”'), findsOneWidget);
      final base = store.row(local, 'chapterContents', chapter.id)!['doc']! as JsonMap;
      expect(
        () => store.writeRows(local, [
          RowWrite.put('chapterContents', {
            ...store.row(local, 'chapterContents', chapter.id)!,
            'doc': textToDoc('No.'),
          }),
        ]),
        throwsA(isA<PermissionException>()),
      );
      c.read(collabActionsProvider)
        ..comment({'kind': 'chapter', 'chapterId': chapter.id}, targetLabel: 'The Bridge', body: 'Lovely bridge.')
        ..saveText(
          chapterId: chapter.id,
          chapterTitle: 'The Bridge',
          base: base,
          proposed: docWithParagraphs(base, [
            (original: maps(base['content'])[0], text: null),
            (original: maps(base['content'])[1], text: 'A stronger second line.'),
            (original: maps(base['content'])[2], text: null),
          ]),
        );
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      first.close();

      // After a restart, Sam's work is still there, and goes out as a feedback file.
      final second = AppDatabase.open(path);
      c = await start(second);
      c.read(openNovelProvider.notifier).open(local);
      await tester.pumpAndSettle();
      expect(ReviewMark.of(NovelStore(second).novel(local)!.raw)!.changed, hasLength(4));
      await c.read(collabActionsProvider).sendFeedback();
      final feedback = File('$root${Platform.pathSeparator}Device Review - feedback from Sam.json');
      expect(feedback.existsSync(), isTrue);

      // The owner brings it in, and accepts the change: it is in the book, the earlier text in its history.
      c.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      final owner = c.read(collabActionsProvider);
      final preview = owner.previewFeedback(feedback.readAsStringSync());
      expect([preview.refused, preview.count('comments'), preview.count('suggestions')], [isEmpty, 1, 1]);
      owner.importFeedback(preview);
      final ownStore = NovelStore(second);
      final suggestion = Suggestion(ownStore.rowsIn(novel.id, 'suggestions').single);
      owner.decideText(suggestion, suggestion.openHunks.single.id, accept: true);
      expect(blockTexts(ownStore.row(novel.id, 'chapterContents', chapter.id)!['doc']), [
        'First line.',
        'A stronger second line.',
        'Third line.',
      ]);
      expect(ownStore.rowsIn(novel.id, 'chapterRevisions').where((r) => r['nodeId'] == chapter.id), isNotEmpty);
      c.read(routerProvider).go('/review/team');
      await tester.pumpAndSettle();
      expect(find.text('Team and feedback'), findsWidgets);
      await tester.pumpWidget(const SizedBox());
      second.close();
      Directory(root).deleteSync(recursive: true);
    },
  );

  testWidgets(
    'template files on the device: written to disk, read back through the checks, kept after a restart',
    timeout: const Timeout(Duration(minutes: 3)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final root = '${dir.path}${Platform.pathSeparator}template_test';
      final path = '$root${Platform.pathSeparator}library.sqlite3';
      if (Directory(root).existsSync()) Directory(root).deleteSync(recursive: true);
      Directory(root).createSync(recursive: true);
      final files = _DiskFiles(root);

      final first = AppDatabase.open(path);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [databaseProvider.overrideWithValue(first), backupFilesProvider.overrideWithValue(files)],
          child: const NovelBuilderApp(),
        ),
      );
      await tester.pumpAndSettle();
      var c = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = c.read(libraryServiceProvider).create({'title': 'Device Templates'});
      final store = NovelStore(first);
      final preset = systemPresets.first;
      store.writeRows(novel.id, [
        RowWrite.put('systems', {
          'id': 'sys-1',
          'projectId': novel.id,
          ...instantiateBlueprint(preset.content),
          'createdAt': 1,
          'updatedAt': 1,
        }, expect: null),
      ]);

      // A system and the novel's categories, each shared as a file on the device's disk.
      SharedTemplate share(TemplateKind kind, JsonMap content, String name) => makeSharedTemplate(
        kind: kind,
        id: 'tpl-$name',
        version: 1,
        name: name,
        description: '',
        author: 'Device',
        license: TemplateLicense.cc0,
        now: 1,
        content: content,
        newId: newId,
      );
      final system = share(TemplateKind.system, systemContent(store.rowsIn(novel.id, 'systems').single), 'Sys');
      final categories = share(TemplateKind.categories, {
        'categories': [for (final c in categoriesOf(store.load(novel.id)!).values) CodexChanges.kindTemplate(c)],
      }, 'Cats');
      for (final t in [system, categories]) {
        await files.saveFile(
          '${t.name}.novel-template.json',
          Uint8List.fromList(utf8.encode(t.toFileText())),
          kind: FileKind.json,
        );
      }

      // Read back from disk through the same checks a received file gets, and taken in.
      final sysRead = readTemplateFile(
        File('$root${Platform.pathSeparator}Sys.novel-template.json').readAsStringSync(),
        newId: newId,
      );
      final catRead = readTemplateFile(
        File('$root${Platform.pathSeparator}Cats.novel-template.json').readAsStringSync(),
        newId: newId,
      );
      expect([sysRead.leftOut, catRead.leftOut], [0, 0]);
      store.writeRows(novel.id, [
        RowWrite.put('systems', {
          'id': 'sys-2',
          'projectId': novel.id,
          ...instantiateBlueprint(sysRead.content),
          'shared': {'id': sysRead.id, 'version': sysRead.version},
          'createdAt': 2,
          'updatedAt': 2,
        }, expect: null),
      ]);
      c
          .read(templatesProvider.notifier)
          .saveShared(
            name: catRead.name,
            description: '',
            categories: [for (final x in maps(catRead.content['categories'])) x],
            shared: {'id': catRead.id, 'version': 1},
          );
      await tester.pumpWidget(const SizedBox());
      first.close();

      // After a restart, both are still there.
      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      c = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      expect(NovelStore(second).rowsIn(novel.id, 'systems').length, 2);
      expect(c.read(templatesProvider).map((t) => t.name), contains('Cats'));
      await tester.pumpWidget(const SizedBox());
      second.close();
      Directory(root).deleteSync(recursive: true);
    },
  );

  testWidgets(
    'genre modules on the device: turned on, used, exported to disk, imported, kept after a restart',
    timeout: const Timeout(Duration(minutes: 3)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final root = '${dir.path}${Platform.pathSeparator}module_test';
      final path = '$root${Platform.pathSeparator}library.sqlite3';
      if (Directory(root).existsSync()) Directory(root).deleteSync(recursive: true);
      Directory(root).createSync(recursive: true);
      final files = _DiskFiles(root);

      final first = AppDatabase.open(path);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [databaseProvider.overrideWithValue(first), backupFilesProvider.overrideWithValue(files)],
          child: const NovelBuilderApp(),
        ),
      );
      await tester.pumpAndSettle();
      var c = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = c.read(libraryServiceProvider).create({'title': 'Device Modules'});
      c.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
      Future<void> press(Finder f) async {
        await tester.ensureVisible(f.first);
        await tester.pumpAndSettle();
        await tester.tap(f.hitTestable().first);
        await tester.pumpAndSettle();
      }

      Finder inCard(String id, String text) =>
          find.descendant(of: find.byKey(ValueKey('module:$id')), matching: find.text(text));

      // Turned on from the manager: its categories come, and nothing else.
      c.read(routerProvider).go('/organize/modules');
      await tester.pumpAndSettle();
      await press(inCard('mystery', 'Enable module'));
      final store = NovelStore(first);
      expect(store.rowsIn(novel.id, 'projectModules').single['enabled'], true);
      expect(store.rowsIn(novel.id, 'loreEntries'), isEmpty);

      // A suspect added in its registry is an entry of the novel's own.
      c.read(routerProvider).go('/organize/modules/mystery?tool=people');
      await tester.pumpAndSettle();
      // Added from the keyboard's Done, as on a phone, where the keyboard covers the Add button.
      await tester.enterText(find.widgetWithText(TextField, 'New suspect'), 'The Butler');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(store.rowsIn(novel.id, 'loreEntries').map((e) => e['name']), ['The Butler']);

      // A module of the author's own, exported to the disk and read back in under a built-in module's id.
      final mine = ModuleChanges(store.load(novel.id)!, now: 1, createId: newId).buildFrom(
        name: 'Device rules',
        categoryKeys: [
          for (final k in store.rowsIn(novel.id, 'loreSchemas'))
            if (k['name'] == 'Suspects') str(k['key']),
        ],
      );
      c.read(availableModulesProvider.notifier).save(mine);
      c.read(routerProvider).go('/organize/modules');
      await tester.pumpAndSettle();
      await press(inCard(mine.id, 'Export'));
      final exported = File('$root${Platform.pathSeparator}Device rules.module.json');
      expect(exported.existsSync(), isTrue);
      final data = jsonDecode(exported.readAsStringSync()) as JsonMap;
      expect(jsonEncode(data), isNot(contains('The Butler')));
      File('$root${Platform.pathSeparator}claims.module.json').writeAsStringSync(
        jsonEncode({
          ...data,
          'module': {...mapOrNull(data['module'])!, 'id': 'mystery', 'name': 'Imported rules'},
        }),
        flush: true,
      );
      files.backup = 'claims.module.json';
      await press(find.text('Import a module…'));
      final library = c.read(availableModulesProvider);
      expect(library.where((m) => m.id == 'mystery').single.name, 'Mystery, Detective & Investigation');
      expect(library.where((m) => m.name == 'Imported rules').single.id, startsWith('custom-'));
      await tester.pumpWidget(const SizedBox());
      first.close();

      // After a restart, the module is still on, its suspect is there, and the author's modules are kept.
      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      c = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      expect(NovelStore(second).rowsIn(novel.id, 'projectModules').single['enabled'], true);
      expect(NovelStore(second).rowsIn(novel.id, 'loreEntries').map((e) => e['name']), ['The Butler']);
      expect(
        c.read(availableModulesProvider).where((m) => !m.builtin).map((m) => m.name),
        containsAll(['Device rules', 'Imported rules']),
      );
      await tester.pumpWidget(const SizedBox());
      second.close();
      Directory(root).deleteSync(recursive: true);
    },
  );

  testWidgets(
    'drafts, a cover and the tutorial on the device: a draft swapped in and out, a cover from the disk, kept after a restart',
    timeout: const Timeout(Duration(minutes: 3)),
    (tester) async {
      final dir = await getTemporaryDirectory();
      final root = '${dir.path}${Platform.pathSeparator}drafts_test';
      final path = '$root${Platform.pathSeparator}library.sqlite3';
      if (Directory(root).existsSync()) Directory(root).deleteSync(recursive: true);
      Directory(root).createSync(recursive: true);
      final files = _DiskFiles(root);
      final picture = img.Image(width: 900, height: 1350)..clear(img.ColorRgb8(150, 40, 30));
      File('$root${Platform.pathSeparator}cover.png').writeAsBytesSync(img.encodePng(picture), flush: true);
      files.image = 'cover.png';

      final first = AppDatabase.open(path);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [databaseProvider.overrideWithValue(first), backupFilesProvider.overrideWithValue(files)],
          child: const NovelBuilderApp(),
        ),
      );
      await tester.pumpAndSettle();
      var c = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final novel = c.read(libraryServiceProvider).create({'title': 'Device Drafts'});
      final m = c.read(manuscriptServiceProvider);
      final chapter = m.create(novel.id, NodeKind.chapter, title: 'The Gate');
      m.save(novel.id, chapter.id, textToDoc('The gate was open.'), baseRev: 0);
      await tester.pumpAndSettle();

      // A cover chosen from the device's disk, kept small.
      await tester.tap(find.byTooltip('More for Device Drafts'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit details').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Choose a picture…'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose a picture…'));
      for (var i = 0; i < 100 && find.text('Remove cover').evaluate().isEmpty; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await tester.ensureVisible(find.text('Save details'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save details'));
      await tester.pumpAndSettle();
      final cover = c.read(libraryProvider).single.cover;
      expect(cover, startsWith('data:image/jpeg;base64,'));

      // An alternate draft: started blank, written, and the first text put back.
      m.createDraft(novel.id, chapter.id, 'The gate stays shut', blank: true);
      m.save(novel.id, chapter.id, textToDoc('The gate was shut.'), baseRev: m.open(novel.id, chapter.id).rev);
      final main = m.alternateDrafts(novel.id, chapter.id).single;
      m.switchDraft(novel.id, chapter.id, str(main['id']));
      expect(blockTexts(m.open(novel.id, chapter.id).doc), ['The gate was open.']);

      // The tutorial opens on the page in view.
      c.read(openNovelProvider.notifier).open(novel.id);
      c.read(routerProvider).go('/organize/world');
      await tester.pumpAndSettle();
      final rail = find.byType(NavigationRail);
      if (rail.evaluate().isNotEmpty) {
        await tester.tap(find.byTooltip('Tutorial'));
      } else {
        await tester.tap(find.text('More'));
        await tester.pumpAndSettle();
        final sheet = find.descendant(of: find.byType(BottomSheet), matching: find.byType(Scrollable)).first;
        await tester.scrollUntilVisible(find.text('Tutorial'), 100, scrollable: sheet);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Tutorial'));
      }
      await tester.pumpAndSettle();
      expect(find.text('The world'), findsWidgets);
      await tester.tap(find.byTooltip('Close the tutorial'));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      first.close();

      // After a restart: the cover, both drafts, and which one is in the manuscript.
      final second = AppDatabase.open(path);
      await pumpWith(tester, second);
      c = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
      final store = NovelStore(second);
      expect(store.novel(novel.id)!.cover, cover);
      expect(str(store.row(novel.id, 'chapters', chapter.id)!['branchName']), 'Main draft');
      final kept = store.rowsIn(novel.id, 'chapterBranches').single;
      expect(
        [kept['name'], blockTexts(kept['doc'])],
        [
          'The gate stays shut',
          ['The gate was shut.'],
        ],
      );
      await tester.pumpWidget(const SizedBox());
      second.close();
      Directory(root).deleteSync(recursive: true);
    },
  );
}

/// Files on the device's own disk, standing in for the save dialog and the share sheet, which a test cannot press.
class _DiskFiles implements BackupFiles {
  _DiskFiles(this.root);
  final String root;
  String? manuscript;

  /// The file "chosen" when the app asks for one to open.
  String? backup;

  /// The picture "chosen" when the app asks for one.
  String? image;
  String _at(String name) => '$root${Platform.pathSeparator}$name';

  @override
  Future<String?> saveFile(String fileName, Uint8List bytes, {required FileKind kind, Rect? origin}) async {
    File(_at(fileName)).writeAsBytesSync(bytes, flush: true);
    return 'Saved $fileName';
  }

  @override
  Future<({String name, Uint8List bytes})?> pickManuscript() async =>
      manuscript == null ? null : (name: manuscript!, bytes: File(_at(manuscript!)).readAsBytesSync());

  @override
  Future<String?> saveBackup(String fileName, String text, {Rect? origin}) async {
    File(_at(fileName)).writeAsStringSync(text, flush: true);
    return 'Saved $fileName';
  }

  @override
  Future<String?> saveCsv(String fileName, String text, {Rect? origin}) => saveBackup(fileName, text);

  @override
  Future<({String name, String text})?> pickBackup() async =>
      backup == null ? null : (name: backup!, text: File(_at(backup!)).readAsStringSync());

  @override
  Future<({String name, Uint8List bytes})?> pickImage() async =>
      image == null ? null : (name: image!, bytes: File(_at(image!)).readAsBytesSync());
}
