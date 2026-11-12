import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
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

    // FRAMES WHILE SCROLLING: how long each frame took to build (the app's code) and to draw (the engine), from the
    // engine's own frame timings, for a fling through some of the heaviest views of the large novel. A frame over
    // 16.7 ms misses a 60 Hz screen's next refresh.
    //
    // The engine reports timings in batches, about once a second, so each stretch is waited out before the next: the
    // frames that open the view are counted apart from the frames of the scroll (counted together, a view's first
    // paint once read as a "first-scroll hitch").
    Future<List<FrameTiming>> timed(Future<void> Function() work) async {
      await Future<void>.delayed(const Duration(milliseconds: 1500));
      await tester.pump();
      final got = <FrameTiming>[];
      void take(List<FrameTiming> t) => got.addAll(t);
      SchedulerBinding.instance.addTimingsCallback(take);
      await work();
      await tester.pumpAndSettle();
      await Future<void>.delayed(const Duration(milliseconds: 1500));
      await tester.pump();
      SchedulerBinding.instance.removeTimingsCallback(take);
      return got;
    }

    Future<void> frames(String name, String screen, Future<void> Function() scroll) async {
      // Somewhere else first, so the view is opened anew.
      c.read(routerProvider).go('/settings');
      await tester.pumpAndSettle();
      final opening = await timed(() async {
        c.read(routerProvider).go(screen);
        await tester.pumpAndSettle();
      });
      if (opening.isNotEmpty) {
        timings['frames $name: opening, raster worst (µs)'] = opening
            .map((f) => f.rasterDuration.inMicroseconds)
            .reduce((a, b) => a > b ? a : b);
        timings['frames $name: opening, build worst (µs)'] = opening
            .map((f) => f.buildDuration.inMicroseconds)
            .reduce((a, b) => a > b ? a : b);
      }
      final got = await timed(scroll);
      if (got.isEmpty) return;
      int p90(List<int> v) => (v..sort())[((v.length - 1) * 0.9).round()];
      final build = [for (final f in got) f.buildDuration.inMicroseconds];
      final raster = [for (final f in got) f.rasterDuration.inMicroseconds];
      timings['frames $name: count'] = got.length;
      timings['frames $name: build p90 (µs)'] = p90([...build]);
      timings['frames $name: build worst (µs)'] = build.reduce((a, b) => a > b ? a : b);
      timings['frames $name: raster p90 (µs)'] = p90([...raster]);
      final worst = raster.reduce((a, b) => a > b ? a : b);
      timings['frames $name: raster worst (µs)'] = worst;
      // Where the worst frame fell (0: the first frame of the scroll), and the next worst, to tell a one-off from a
      // pattern.
      timings['frames $name: raster worst at frame'] = raster.indexOf(worst);
      timings['frames $name: raster second worst (µs)'] = ([...raster]..sort()).reversed.elementAt(1);
      timings['frames $name: over 16.7 ms'] = got.where((f) => f.totalSpan.inMicroseconds > 16667).length;
      debugPrint('PERF frames $name: ${got.length} frames; raster: ${raster.take(12).join(' ')} …');
    }

    // A fling on [target] from a point of it on the screen (near its head: a tall view's middle may be below the fold).
    Future<void> flingOn(Finder target, Offset by) async {
      await tester.ensureVisible(target);
      await tester.pumpAndSettle();
      final rect = tester.getRect(target);
      final size = tester.view.physicalSize / tester.view.devicePixelRatio;
      final y = (rect.top + 90).clamp(rect.top + 1, size.height - 90).toDouble();
      final x = rect.center.dx.clamp(60.0, size.width - 60);
      await tester.flingFrom(Offset(x, y), by, 2500);
    }

    // Flings the scroll of the view that goes furthest in the direction of [by] (a sideways fling, the plot lanes', not
    // the tabs' or the page's: flung at the first scroll found, the lanes never moved and their "scrolling" was timed
    // standing still), four times, and records how far it moved.
    Future<void> fling(Offset by, {String? name}) async {
      final axis = by.dx != 0 ? Axis.horizontal : Axis.vertical;
      final state = tester
          .stateList<ScrollableState>(find.byType(Scrollable))
          .where((s) => s.position.axis == axis)
          .reduce((a, b) => a.position.maxScrollExtent >= b.position.maxScrollExtent ? a : b);
      final from = state.position.pixels;
      for (var i = 0; i < 4; i++) {
        await flingOn(find.byElementPredicate((e) => identical(e, state.context)), by);
        await tester.pumpAndSettle();
      }
      if (name != null) timings['frames $name: moved (px)'] = (state.position.pixels - from).abs().round();
    }

    await frames('library', '/', () => fling(const Offset(0, -500), name: 'library'));
    await frames('plot lanes', '/visualize/plot', () => fling(const Offset(-500, 0), name: 'plot lanes'));
    // The same view opened again: whether its first paint is slow every time it is opened, or only the first time.
    await frames('plot lanes again', '/visualize/plot', () => fling(const Offset(-500, 0), name: 'plot lanes again'));
    await frames('threads', '/plan/threads', () => fling(const Offset(0, -500), name: 'threads'));
    // Other heavy views, opened: whether a slow first paint is particular to the lanes.
    await frames('structure', '/visualize/structure', () => fling(const Offset(0, -500), name: 'structure'));
    await frames('factions', '/visualize/factions', () => fling(const Offset(0, -500), name: 'factions'));
    await frames('graph', '/visualize/graph', () async {});

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
    final restart = Stopwatch()..start();
    await time('restart: open the library and show it', () async {
      second = AppDatabase.open(path);
      timings['restart: library file opened'] = restart.elapsedMilliseconds;
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [databaseProvider.overrideWithValue(second)],
          child: const NovelBuilderApp(),
        ),
      );
      timings['restart: first frame built'] = restart.elapsedMilliseconds;
      // Settled includes the Library's caret blinking four times (by design), not work.
      await tester.pumpAndSettle();
    });
    await tester.pumpWidget(const SizedBox());
    second.close();

    timings['library file size (KB)'] = File(path).lengthSync() ~/ 1024;
    binding.reportData = {'timings': timings, 'platform': Platform.operatingSystem};
    Directory(root).deleteSync(recursive: true);
  });
}
