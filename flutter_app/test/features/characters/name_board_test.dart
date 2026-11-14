import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/name_board.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('the Names view: the alphabet board, a letter pressed for its names, the look-alikes, the free letters', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: const Size(1200, 4000), location: '/organize');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));

    await tester.tap(find.byIcon(Icons.sort_by_alpha).first);
    await tester.pumpAndSettle();
    expect(c.read(castViewProvider), CastView.names);
    expect(find.byType(NameBoard), findsOneWidget);

    // A tile a letter.
    for (final l in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
      expect(find.byKey(ValueKey('letter-$l')), findsOneWidget);
    }
    String said(String letter) => tester.getSemantics(find.byKey(ValueKey('letter-$letter'))).label;
    expect(said('W'), 'W: The Wardens’ Tower, Wren Hollis');
    expect(said('S'), endsWith(', crowded'));
    expect(said('C'), 'C: no names');

    // A letter pressed: its names, each a press from its page.
    await tester.tap(find.byKey(const ValueKey('letter-W')));
    await tester.pumpAndSettle();
    expect(find.text('2 names under W'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'Wren Hollis'), findsOneWidget);

    // The look-alikes, and why.
    expect(find.textContaining('one letter apart', findRichText: true), findsWidgets);
    expect(find.text('Ilse Marrow, Kit Marrow  and  Old Merrow, Merrow’s Bell Tower'), findsOneWidget);
    expect(find.textContaining('Ferry  ·  Ferrymen', findRichText: true), findsNothing, reason: 'kin, not look-alikes');

    // The free letters, and the forge.
    expect(find.textContaining('No name begins with these 10 yet'), findsOneWidget);
    expect(find.text('Forge a name'), findsOneWidget);

    // Pressing a name opens its page.
    await tester.tap(find.widgetWithText(ActionChip, 'Wren Hollis'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), startsWith('/organize/character/'));
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'it only reads');
  });
}
