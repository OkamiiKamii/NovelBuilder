import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/library/bookshelf.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('the caret after the last lines blinks four times, half a second lit and half out, then stays lit; '
      'the screen is drawn only when it switches', (tester) async {
    final c = await pumpApp(tester, size: phone);
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    final m = c.read(manuscriptServiceProvider);
    final gate = m.create(novel, NodeKind.chapter, title: 'The Gate');
    m.save(novel, gate.id, textToDoc('The bell rang twice.'), baseRev: 0);
    c.read(openNovelProvider.notifier).open(novel);
    c.read(selectedNodeProvider.notifier).select(gate.id);
    c.read(openNovelProvider.notifier).close();
    await tester.pump();
    await tester.pump();

    double lit() => tester
        .widget<Opacity>(find.descendant(of: find.byType(ContinueWriting), matching: find.byType(Opacity)).last)
        .opacity;
    expect(lit(), 1, reason: 'lit as it appears');
    // Between switches nothing asks for a frame.
    await tester.pump(const Duration(milliseconds: 200));
    expect(tester.binding.hasScheduledFrame, isFalse);
    final seen = <double>[];
    for (var i = 0; i < 9; i++) {
      await tester.pump(const Duration(milliseconds: 500));
      seen.add(lit());
    }
    // At 0.7 s out, 1.2 s lit, … 3.7 s out, then 4.2 s and after: lit.
    expect(seen, [0, 1, 0, 1, 0, 1, 0, 1, 1]);
    await tester.pump(const Duration(seconds: 3));
    expect(lit(), 1, reason: 'stays lit');
    expect(tester.binding.hasScheduledFrame, isFalse);
  });

  testWidgets('with less motion asked for, the caret is lit from the start and never blinks', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    final c = await pumpApp(tester, size: phone);
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    final m = c.read(manuscriptServiceProvider);
    final gate = m.create(novel, NodeKind.chapter, title: 'The Gate');
    m.save(novel, gate.id, textToDoc('The bell rang twice.'), baseRev: 0);
    c.read(openNovelProvider.notifier).open(novel);
    c.read(selectedNodeProvider.notifier).select(gate.id);
    c.read(openNovelProvider.notifier).close();
    await tester.pumpAndSettle();
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 500));
      expect(
        tester
            .widget<Opacity>(find.descendant(of: find.byType(ContinueWriting), matching: find.byType(Opacity)).last)
            .opacity,
        1,
      );
    }
  });
}
