import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:novel_builder/app/app.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/exchange/exchange_service.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/exchange/compile.dart';
import 'package:path_provider/path_provider.dart';
import 'package:super_editor/super_editor.dart' show SuperEditor;
import 'package:super_text_layout/super_text_layout.dart' show BlinkController;

import '../test/helpers/large_novel.dart';
import '../test/perf/large_project_test.dart' show screens;

/// Measures the app on a large novel, on a real device in profile mode:
/// `flutter drive --profile --driver=test_driver/integration_test.dart --target=integration_test/perf_test.dart -d <device>`.
/// The timings (milliseconds) are written to `build/integration_response_data.json`. The novel is generated test
/// content in a library of its own in the temporary folder, deleted afterwards.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('a large novel, measured', timeout: const Timeout(Duration(minutes: 20)), (tester) async {
    final timings = <String, int>{};
    Future<T> time<T>(String name, Future<T> Function() work) async {
      final watch = Stopwatch()..start();
      final result = await work();
      timings[name] = watch.elapsedMilliseconds;
      debugPrint('PERF $name: ${watch.elapsedMilliseconds} ms');
      return result;
    }

    final dir = await getTemporaryDirectory();
    final root = '${dir.path}${Platform.pathSeparator}perf_test';
    final path = '$root${Platform.pathSeparator}library.sqlite3';
    if (Directory(root).existsSync()) Directory(root).deleteSync(recursive: true);
    Directory(root).createSync(recursive: true);

    final first = AppDatabase.open(path);
    await tester.pumpWidget(
      ProviderScope(
        key: UniqueKey(),
        overrides: [databaseProvider.overrideWithValue(first)],
        child: const NovelBuilderApp(),
      ),
    );
    await tester.pumpAndSettle();
    final c = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));

    // A backup of the large novel, read and imported as the author would.
    final text = jsonEncode(largeNovel().toJson());
    timings['backup file size (KB)'] = text.length ~/ 1024;
    final backups = c.read(backupServiceProvider);
    final preview = await time('read a backup file (preview)', () async => backups.previewImport(text));
    final novel = await time(
      'import it into the library',
      () async => c.read(libraryServiceProvider).importAsCopy(preview),
    );
    await tester.pumpAndSettle();
    await time('export a backup', () async => backups.exportBackup(novel.id));

    await time('open the novel', () async {
      c.read(openNovelProvider.notifier).open(novel.id);
      await tester.pumpAndSettle();
    });
    for (final screen in screens) {
      await time('screen $screen', () async {
        c.read(routerProvider).go(screen);
        await tester.pumpAndSettle();
      });
    }

    // The editor on a scene in the last volume, and a save of it.
    c.read(routerProvider).go('/write');
    await tester.pumpAndSettle();
    final store = NovelStore(first);
    final scene = store.rowsIn(novel.id, 'chapters').lastWhere((r) => r['kind'] == 'scene');
    // The caret blinks for ever, so waiting for the screen to be still would never end: blinking is off here, as
    // in the other device tests, and the time is to the editor shown with the scene in it.
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    await time('open a scene in the editor', () async {
      c.read(selectedNodeProvider.notifier).select(scene['id']! as String);
      await tester.pump();
      while (find.byType(SuperEditor).evaluate().isEmpty) {
        await tester.pump(const Duration(milliseconds: 16));
      }
      await tester.pumpAndSettle();
    });

    final exchange = c.read(exchangeServiceProvider);
    final compiled = await time('compile the manuscript', () async => exchange.compile(novel.id, ExportOptions.reader));
    await time('export the manuscript as Word', () => exchange.render(compiled, ExportFormat.docx));
    await time('export the manuscript as a web page', () => exchange.render(compiled, ExportFormat.html));
    await time('export the manuscript as PDF', () => exchange.render(compiled, ExportFormat.pdf));

    await tester.pumpWidget(const SizedBox());
    first.close();

    // A restart: the library file opened again and the app shown with the novel open.
    late AppDatabase second;
    await time('restart: open the library and show it', () async {
      second = AppDatabase.open(path);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [databaseProvider.overrideWithValue(second)],
          child: const NovelBuilderApp(),
        ),
      );
      await tester.pumpAndSettle();
    });
    await tester.pumpWidget(const SizedBox());
    second.close();

    timings['library file size (KB)'] = File(path).lengthSync() ~/ 1024;
    binding.reportData = {'timings': timings, 'platform': Platform.operatingSystem};
    Directory(root).deleteSync(recursive: true);
  });
}
