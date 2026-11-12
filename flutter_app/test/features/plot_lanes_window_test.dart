import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/theme/app_theme.dart';
import 'package:novel_builder/features/plot/plot_lanes_page.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/plot/lanes.dart';

import '../helpers/large_novel.dart';

/// The lanes drawn into an image [width] × [height] by [painter], as RGBA bytes.
Future<List<int>> _draw(LanesPainter painter, int width, int height) async {
  final recorder = ui.PictureRecorder();
  painter.paint(Canvas(recorder), Size(width.toDouble(), height.toDouble()));
  final image = await recorder.endRecording().toImage(width, height);
  final bytes = await image.toByteData();
  image.dispose();
  return bytes!.buffer.asUint8List();
}

void main() {
  testWidgets('drawn only in its window, the lanes there are exactly the lanes drawn whole', (tester) async {
    final lanes = threadLanes(StoryModel.fromSnapshot(largeNovel(volumes: 3, chaptersPerVolume: 30)));
    expect(lanes.chapters.length, greaterThan(80));
    final scheme = AppTheme.light().colorScheme;
    final text = AppTheme.light().textTheme;
    const nameW = 180.0, colW = 48.0, headH = 34.0, rowH = 48.0;
    final width = (nameW + lanes.chapters.length * colW + 10).ceil();
    final height = (headH + lanes.lanes.length * rowH + 6).ceil();
    LanesPainter painter({int from = 0, int? to}) => LanesPainter(
      lanes: lanes,
      from: from,
      to: to,
      nameW: nameW,
      scheme: scheme,
      text: text,
      scale: TextScaler.noScaling,
      selectedThreadId: null,
      chosen: null,
      focus: null,
    );

    await tester.runAsync(() async {
      final whole = await _draw(painter(), width, height);
      for (final (from, to) in [(0, 32), (32, 64), (48, 80), (64, lanes.chapters.length)]) {
        final part = await _draw(painter(from: from, to: to), width, height);
        // Inside the window, a column in from each edge (where only the margin beyond the screen is), every pixel.
        final left = (nameW + (from + 1) * colW).ceil();
        final right = (nameW + (to - 1) * colW).floor();
        var differ = 0;
        for (var y = 0; y < height; y++) {
          for (var x = left; x < right; x++) {
            final i = (y * width + x) * 4;
            if (whole[i] != part[i] || whole[i + 1] != part[i + 1] || whole[i + 2] != part[i + 2]) differ++;
          }
        }
        expect(differ, 0, reason: 'columns $from–$to');
      }
      // And the comparison means something: beyond a window, the lanes drawn whole have marks the window leaves out.
      final first = await _draw(painter(to: 32), width, height);
      final beyond = (nameW + 34 * colW).ceil();
      var missing = 0;
      for (var y = 0; y < height; y++) {
        for (var x = beyond; x < beyond + 20 * colW; x++) {
          final i = (y * width + x) * 4;
          if (whole[i] != first[i] || whole[i + 1] != first[i + 1] || whole[i + 2] != first[i + 2]) missing++;
        }
      }
      expect(missing, greaterThan(1000));
    });
  });
}
