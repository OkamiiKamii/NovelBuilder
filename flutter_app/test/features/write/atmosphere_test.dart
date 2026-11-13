import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/atmosphere.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_text_layout/super_text_layout.dart';

import 'title_ideas_test.dart' show openChapter;
import 'write_page_test.dart' show openWrite, storedText;

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  test('every weather draws, on any size, at any time', () {
    for (final kind in Atmosphere.values) {
      for (final size in const [Size.zero, Size(390, 844), Size(1400, 900)]) {
        for (final t in const [0.0, 1.7, 3600.0]) {
          final recorder = ui.PictureRecorder();
          AtmospherePainter(kind: kind, time: ValueNotifier(t), ink: Colors.black).paint(Canvas(recorder), size);
          recorder.endRecording();
        }
      }
    }
  });

  testWidgets('it moves, and holds still when the system asks for less motion', (tester) async {
    Widget layer({required bool still}) => MediaQuery(
      data: MediaQueryData(disableAnimations: still),
      child: const Directionality(
        textDirection: TextDirection.ltr,
        child: AtmosphereLayer(kind: Atmosphere.rain, ink: Colors.black),
      ),
    );
    await tester.pumpWidget(layer(still: false));
    expect(tester.hasRunningAnimations, isTrue);
    await tester.pumpWidget(layer(still: true));
    expect(tester.hasRunningAnimations, isFalse);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('chosen in the writing settings: remembered, and the page under it is the same page', (tester) async {
    final w = await openWrite(tester, text: 'The gate was open.\nNobody guarded it.');
    final editor = tester.state(find.byType(SuperEditor));
    await tester.tap(find.byTooltip('Writing settings'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Fireflies'), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('Fireflies'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(w.c.read(atmosphereProvider), Atmosphere.fireflies);
    expect(w.c.read(settingsStoreProvider).read(atmosphereKey), 'fireflies');
    expect(
      tester.widgetList<AtmosphereLayer>(find.byType(AtmosphereLayer)).where((l) => l.kind == Atmosphere.fireflies),
      hasLength(2),
      reason: 'on the desk, and faint on the paper',
    );
    expect(identical(tester.state(find.byType(SuperEditor)), editor), isTrue, reason: 'the editor was not rebuilt');
    expect(storedText(w.c, w.novel, w.chapter), 'The gate was open.\nNobody guarded it.');

    // Back to none: every layer still, so the screen settles (it would not, with weather still moving).
    w.c.read(atmosphereProvider.notifier).set(Atmosphere.none);
    await tester.pumpAndSettle();
    expect(
      tester.widgetList<AtmosphereLayer>(find.byType(AtmosphereLayer)).every((l) => l.kind == Atmosphere.none),
      isTrue,
    );
  });

  testWidgets('on a phone it is in the desk’s drawer', (tester) async {
    final w = await openChapter(tester, title: 'The Bell', text: 'The gate was open.');
    await tester.tap(find.text('Desk'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Atmosphere'), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('Atmosphere'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Candlelight'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(w.c.read(atmosphereProvider), Atmosphere.candle);
    w.c.read(atmosphereProvider.notifier).set(Atmosphere.none);
    await tester.pumpAndSettle();
  });
}
