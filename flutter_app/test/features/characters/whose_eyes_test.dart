import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/whose_eyes.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('the Eyes view: the book as a ribbon of whose eyes, a chapter pressed for why, each one’s share, what it '
      'means, and read there', (tester) async {
    final c = await pumpApp(tester, size: const Size(1200, 4000), location: '/organize');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));

    await tester.tap(find.byIcon(Icons.visibility_outlined).first);
    await tester.pumpAndSettle();
    expect(c.read(castViewProvider), CastView.eyes);
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    expect(find.byType(WhoseEyes), findsOneWidget);

    // A band for every chapter with words.
    for (var n = 1; n <= 15; n++) {
      expect(find.byKey(ValueKey('eyes-$n')), findsOneWidget);
    }
    expect(find.text('Press a chapter to see why.'), findsOneWidget);

    // Each it is told through, and its share; first person and unclear on their own.
    expect(find.text('Wren Hollis'), findsWidgets);
    expect(find.text('8 chapters · 54% of the book'), findsOneWidget);
    expect(find.text('1 chapter · 5% of the book'), findsOneWidget);
    expect(find.text('In the first person'), findsOneWidget);
    expect(find.text('Chapter 13'), findsOneWidget);
    expect(find.textContaining('Chapters 5, 7, 10, 12, 14'), findsOneWidget);

    // What it means.
    expect(find.text('Chapters 1 to 3 are all through Wren Hollis: 3 in a row.'), findsOneWidget);
    expect(find.text('Tobiah Fenn has not been seen through for 11 chapters, since chapter 4.'), findsOneWidget);

    // A chapter pressed: through whom, and the sentence that shows it.
    await tester.tap(find.byKey(const ValueKey('eyes-4')));
    await tester.pumpAndSettle();
    expect(find.textContaining('through Tobiah Fenn'), findsOneWidget);
    expect(find.text('“Tobiah saw it first.”'), findsOneWidget);
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'it only reads');

    await tester.tap(find.text('Read it there'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/write');
    expect(c.read(selectedNodeProvider), isNotNull);
    await tester.pump(const Duration(seconds: 2));
  });
}
