import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/widgets/cameo.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart' show fieldNamed;
import 'package:novel_builder/shared/domain/characters/likeness.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('Draw their face: chosen in presses, kept as words in their profile, and their cameo painted', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final row = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis');
    Entry wren() => Entry(store.row(novel.id, 'loreEntries', row['id'] as String)!);
    expect(painted(cameoLookOf(wren(), null).likeness), isFalse, reason: 'nothing described: the plain cameo');

    c.read(routerProvider).go('/organize/character/${row['id']}');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Draw their face'));
    await tester.tap(find.text('Draw their face'));
    await tester.pumpAndSettle();
    expect(find.text('Keep this face'), findsOneWidget);
    expect(
      tester
          .widget<ButtonStyleButton>(
            find.ancestor(of: find.text('Keep this face'), matching: find.bySubtype<ButtonStyleButton>()),
          )
          .onPressed,
      isNull,
      reason: 'nothing chosen yet',
    );

    Future<void> press(String label, {int at = 0}) async {
      final chip = find.descendant(of: find.byType(BottomSheet), matching: find.text(label)).at(at);
      await tester.ensureVisible(chip);
      await tester.pumpAndSettle();
      await tester.tap(chip);
      await tester.pumpAndSettle();
    }

    await press('Red');
    await press('Braided');
    await press('Green', at: 1); // the eyes' green, after the hair's
    await press('Olive');
    await press('Freckles');
    // The cameo in the sheet follows.
    final drawn = tester.widget<Cameo>(find.descendant(of: find.byType(BottomSheet), matching: find.byType(Cameo)));
    expect(
      (drawn.look.likeness.hair, drawn.look.likeness.cut, drawn.look.likeness.freckles),
      ('red', HairCut.braid, true),
    );

    await tester.ensureVisible(find.text('Keep this face'));
    await tester.tap(find.text('Keep this face'));
    await tester.pumpAndSettle();
    expect(find.text('Wren Hollis’s face is in their profile, under Appearance.'), findsOneWidget);
    expect(fieldNamed(wren(), 'Hair'), 'Braided red');
    expect(fieldNamed(wren(), 'Eyes'), 'Green');
    expect(fieldNamed(wren(), 'Skin'), 'Olive');
    expect(fieldNamed(wren(), 'Distinguishing Features'), 'Freckles.');
    final look = cameoLookOf(wren(), null).likeness;
    expect(
      (look.hair, look.cut, look.eyes, look.skin, look.freckles),
      ('red', HairCut.braid, 'green', SkinTone.olive, true),
    );

    // Again, at once (the slip is put away so it does not cover Keep): what is written stays; a new mark is added
    // after it, only what changed rewritten.
    await tester.tap(find.text('Draw their face'));
    await tester.pumpAndSettle();
    final freckles = tester.widget<FilterChip>(
      find.descendant(of: find.byType(BottomSheet), matching: find.widgetWithText(FilterChip, 'Freckles')),
    );
    expect(freckles.selected, isTrue);
    expect(freckles.onSelected, isNull, reason: 'written: kept');
    await press('Glasses');
    await tester.ensureVisible(find.text('Keep this face'));
    await tester.tap(find.text('Keep this face'));
    await tester.pumpAndSettle();
    expect(fieldNamed(wren(), 'Distinguishing Features'), 'Freckles; glasses.');
    expect(fieldNamed(wren(), 'Hair'), 'Braided red');
    expect(store.rowsIn(novel.id, 'loreEntries').length, greaterThan(1), reason: 'the rest of the book is as it was');
  });
}
