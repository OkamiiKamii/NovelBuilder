import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:novel_builder/app/app.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:path_provider/path_provider.dart';

import '../test/helpers/large_novel.dart';

/// The plot lanes and the factions map on a large novel, on a device in profile mode: opened again and again, scrolled
/// both ways, the map panned and zoomed, cells and factions tapped, and both views returned to after a change. Frame
/// timings and memory are written to `build/integration_response_data.json`. The novel is generated test content in a
/// library of its own in the app's temporary folder, deleted afterwards; nothing else is read or written.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('the lanes and the factions map, used', timeout: const Timeout(Duration(minutes: 20)), (tester) async {
    final results = <String, Object>{};
    // On a phone the results are also written, after every step, to the app's own folder on its shared storage
    // (`adb pull /sdcard/Android/data/<app>/files/views_results.json`): this device lets no tool read the app's log,
    // which is how `flutter drive` finds the app to collect them.
    // Run without `flutter drive` (the app started directly), elsewhere it is written to the temporary folder, as
    // views_test_results.json.
    final shared = Platform.isAndroid ? await getExternalStorageDirectory() : await getTemporaryDirectory();
    void save({bool done = false}) {
      if (shared == null) return;
      final name = Platform.isAndroid ? 'views_results.json' : 'views_test_results.json';
      File('${shared.path}${Platform.pathSeparator}$name').writeAsStringSync(
        jsonEncode({
          'views': results,
          'done': done,
          'platform': Platform.operatingSystem,
          // Whether the accessibility tree was being built (it is under `flutter drive`, and with a screen reader on):
          // the views' many tap targets each carry one, so it changes what a frame costs.
          'semantics on': RendererBinding.instance.semanticsEnabled,
        }),
      );
    }

    final rss = <String, int>{};
    void memory(String at) {
      rss[at] = ProcessInfo.currentRss ~/ (1024 * 1024);
      results['memory (MB, resident)'] = rss;
      save();
    }

    final dir = await getTemporaryDirectory();
    final root = '${dir.path}${Platform.pathSeparator}views_test';
    if (Directory(root).existsSync()) Directory(root).deleteSync(recursive: true);
    Directory(root).createSync(recursive: true);
    final db = AppDatabase.open('$root${Platform.pathSeparator}library.sqlite3');
    await tester.pumpWidget(
      ProviderScope(overrides: [databaseProvider.overrideWithValue(db)], child: const NovelBuilderApp()),
    );
    await tester.pumpAndSettle();
    final c = ProviderScope.containerOf(tester.element(find.byType(NovelBuilderApp)));
    memory('started');
    final novel = largeNovel();
    c.read(novelStoreProvider).putNovel(novel);
    c.read(openNovelProvider.notifier).open(novel.projectId);
    await tester.pumpAndSettle();
    memory('large novel open');

    // Frame timings arrive in batches about once a second: each stretch is waited out on both sides.
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

    void record(String name, List<FrameTiming> frames, {int? wall}) {
      if (frames.isEmpty) return;
      int worst(Iterable<int> v) => v.reduce((a, b) => a > b ? a : b);
      int p90(List<int> v) => (v..sort())[((v.length - 1) * 0.9).round()];
      final build = [for (final f in frames) f.buildDuration.inMicroseconds];
      final raster = [for (final f in frames) f.rasterDuration.inMicroseconds];
      results[name] = {
        'frames': frames.length,
        'build p90 µs': p90([...build]),
        'build worst µs': worst(build),
        'raster p90 µs': p90([...raster]),
        'raster worst µs': worst(raster),
        'over 16.7 ms (build+raster)': frames
            .where((f) => f.buildDuration.inMicroseconds + f.rasterDuration.inMicroseconds > 16667)
            .length,
        'wall ms': ?wall,
      };
      debugPrint('VIEWS $name: ${results[name]}');
      save();
    }

    Future<void> open(String name, String path) async {
      c.read(routerProvider).go('/settings');
      await tester.pumpAndSettle();
      final watch = Stopwatch();
      final frames = await timed(() async {
        watch.start();
        c.read(routerProvider).go(path);
        await tester.pumpAndSettle();
        watch.stop();
      });
      record(name, frames, wall: watch.elapsedMilliseconds);
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

    Finder labelled(bool Function(String label) test, {bool? selected}) => find.byWidgetPredicate(
      (w) =>
          w is Semantics &&
          w.properties.label != null &&
          test(w.properties.label!) &&
          (selected == null || w.properties.selected == selected),
    );

    // THE PLOT LANES.
    for (var i = 1; i <= 5; i++) {
      await open('lanes: opening $i', '/visualize/plot');
    }
    memory('lanes opened five times');
    // The lanes' own scroll (across the chapters): the sideways scroll that goes furthest. Not the page's (down it), nor
    // the row of tabs at its head (sideways too, but short).
    final lanesState = tester
        .stateList<ScrollableState>(find.byType(Scrollable))
        .where((s) => s.position.axis == Axis.horizontal)
        .reduce((a, b) => a.position.maxScrollExtent >= b.position.maxScrollExtent ? a : b);
    final lanes = find.byElementPredicate((e) => identical(e, lanesState.context));
    double across() => lanesState.position.pixels;
    record(
      'lanes: scroll right',
      await timed(() async {
        for (var i = 0; i < 4; i++) {
          await flingOn(lanes, const Offset(-500, 0));
          await tester.pumpAndSettle();
        }
      }),
    );
    final along = across();
    results['lanes: scrolled to (px)'] = along.round();
    expect(along, greaterThan(1000), reason: 'the flings moved the lanes along the chapters');
    // A cell far along, tapped where it is on the screen: the card says what that cell holds.
    final screen = tester.view.physicalSize / tester.view.devicePixelRatio;
    final cells = labelled(RegExp(r', Ch \d+: ').hasMatch).hitTestable();
    Element? target;
    for (final e in cells.evaluate()) {
      final box = e.findRenderObject()! as RenderBox;
      final centre = box.localToGlobal(box.size.center(Offset.zero));
      final label = (e.widget as Semantics).properties.label!;
      if (centre.dx > screen.width * 0.3 && centre.dx < screen.width * 0.7 && !label.contains('Select the thread')) {
        target = e;
        break;
      }
    }
    expect(target, isNotNull, reason: 'a cell on screen after scrolling');
    final box = target!.findRenderObject()! as RenderBox;
    final label = (target.widget as Semantics).properties.label!;
    await tester.tapAt(box.localToGlobal(box.size.center(Offset.zero)));
    await tester.pumpAndSettle();
    expect(find.text(label), findsWidgets, reason: 'the card describes the cell tapped');
    results['lanes: tapped cell described'] = label;
    final chapter = int.parse(RegExp(r', Ch (\d+): ').firstMatch(label)!.group(1)!);
    expect(chapter, greaterThan(20), reason: 'a cell far along, beyond the columns drawn at first');
    record(
      'lanes: scroll left',
      await timed(() async {
        for (var i = 0; i < 4; i++) {
          await flingOn(lanes, const Offset(500, 0));
          await tester.pumpAndSettle();
        }
      }),
    );
    expect(across(), lessThan(along), reason: 'and back');
    results['lanes: scrolled back to (px)'] = across().round();
    memory('lanes scrolled both ways');

    // THE FACTIONS MAP.
    for (var i = 1; i <= 5; i++) {
      await open('factions: opening $i', '/visualize/factions');
    }
    memory('factions opened five times');
    final map = find.byType(InteractiveViewer);
    expect(map, findsOneWidget);
    final centre = tester.getCenter(map);
    record(
      'factions: pan both ways',
      await timed(() async {
        for (final by in const [Offset(-300, 0), Offset(300, 0), Offset(0, -200), Offset(0, 200)]) {
          await tester.dragFrom(centre, by);
          await tester.pumpAndSettle();
        }
      }),
    );
    record(
      'factions: zoom in and out',
      await timed(() async {
        for (final spread in const [80.0, -80.0]) {
          final a = await tester.startGesture(centre - const Offset(40, 0), pointer: 7);
          final b = await tester.startGesture(centre + const Offset(40, 0), pointer: 8);
          for (var s = 1; s <= 10; s++) {
            await a.moveBy(Offset(-spread / 20, 0));
            await b.moveBy(Offset(spread / 20, 0));
            await tester.pump(const Duration(milliseconds: 16));
          }
          await a.up();
          await b.up();
          await tester.pumpAndSettle();
        }
      }),
    );
    // A faction tapped where it is drawn: it is the one selected.
    final factions = labelled((l) => l.endsWith(', a faction'), selected: false).hitTestable();
    expect(factions, findsWidgets);
    final faction = factions.first;
    final name = (tester.widget<Semantics>(faction).properties.label!).replaceAll(', a faction', '');
    await tester.tap(faction);
    await tester.pumpAndSettle();
    expect(labelled((l) => l == '$name, a faction', selected: true), findsOneWidget, reason: 'the faction tapped');
    results['factions: tapped faction selected'] = name;
    memory('factions panned, zoomed, tapped');

    // RETURNING AFTER A CHANGE: a thread and a tie added; each view says so when returned to.
    int counted(RegExp pattern) {
      final l = labelled(pattern.hasMatch).evaluate().map((e) => (e.widget as Semantics).properties.label!).first;
      return int.parse(pattern.firstMatch(l)!.group(1)!);
    }

    final store = c.read(novelStoreProvider);
    final ties = RegExp(r'and (\d+) ties? holding');
    final before = counted(ties);
    final two = [
      for (final r in store.rowsIn(novel.projectId, 'loreEntries'))
        if (r['category'] == 'faction') r['id']! as String,
    ];
    c.read(routerProvider).go('/settings');
    await tester.pumpAndSettle();
    store.writeRows(novel.projectId, [
      RowWrite.put('loreLinks', {
        'id': 'views-test-tie',
        'projectId': novel.projectId,
        'fromId': two[0],
        'toId': two[two.length - 1],
        'type': 'allied-with',
        'createdAt': 1,
      }),
    ]);
    await open('factions: opening after a change', '/visualize/factions');
    expect(counted(ties), before + 1, reason: 'the new tie is on the map');

    final threads = RegExp(r'Plot-thread lanes: (\d+) threads?');
    c.read(routerProvider).go('/visualize/plot');
    await tester.pumpAndSettle();
    final threadsBefore = counted(threads);
    final thread = store.rowsIn(novel.projectId, 'plotThreads').first;
    c.read(routerProvider).go('/settings');
    await tester.pumpAndSettle();
    store.writeRows(novel.projectId, [
      RowWrite.put('plotThreads', {...thread, 'id': 'views-test-thread', 'title': 'A thread added by the test'}),
    ]);
    await open('lanes: opening after a change', '/visualize/plot');
    expect(counted(threads), threadsBefore + 1, reason: 'the new thread has its lane');
    memory('after the changes');

    results['memory (MB, resident)'] = rss;
    binding.reportData = {'views': results, 'platform': Platform.operatingSystem};
    save(done: true);
    await tester.pumpWidget(const SizedBox());
    db.close();
    Directory(root).deleteSync(recursive: true);
  });
}
