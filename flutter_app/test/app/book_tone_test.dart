import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/theme/app_theme.dart';
import 'package:novel_builder/app/theme/book_tone.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../helpers/pump_app.dart';

void main() {
  // Every kind of cover: vivid and dull, light and dark, warm and cool, and the near-whites and near-blacks.
  const covers = [
    Color(0xFF2B7A8C), Color(0xFFB4532A), Color(0xFF1E8C3A), Color(0xFFC0392B), Color(0xFF8E44AD), //
    Color(0xFFF1C40F), Color(0xFF4F5561), Color(0xFF000000), Color(0xFFFFFFFF), Color(0xFF0B1F4D), //
    Color(0xFFFFB6C1), Color(0xFF7FFF00), Color(0xFF808080), Color(0xFF3D2B1F), Color(0xFF00CED1), //
  ];
  final themes = {
    'parchment': (Palette.light, Brightness.light),
    'midnight': (Palette.dark, Brightness.dark),
    'monolith': (MonolithPalette.monolith, Brightness.dark),
  };

  test('worn in any colour, every theme still reads at 4.5 : 1', () {
    for (final MapEntry(key: name, value: (p, b)) in themes.entries) {
      for (final c in covers) {
        final w = wearing(p, c, b);
        final why = '$name in $c';
        expect(contrastOf(w.accent, w.surface), greaterThanOrEqualTo(4.5), reason: '$why: accent on paper');
        expect(contrastOf(w.accent, w.background), greaterThanOrEqualTo(4.5), reason: '$why: accent on page');
        expect(contrastOf(w.onAccent, w.accent), greaterThanOrEqualTo(4.5), reason: '$why: on the accent');
        for (final (ground, was) in [(w.background, p.background), (w.surface, p.surface), (w.sunken, p.sunken)]) {
          expect(contrastOf(w.text, ground), greaterThanOrEqualTo(4.5), reason: '$why: text');
          expect(
            contrastOf(w.muted, ground),
            greaterThanOrEqualTo(contrastOf(p.muted, was) < 4.5 ? contrastOf(p.muted, was) : 4.5),
            reason: '$why: quieter text no worse than it was',
          );
        }
        expect((w.text, w.muted, w.danger), (p.text, p.muted, p.danger), reason: 'the inks stay the theme’s');
      }
    }
  });

  test('the book’s hue is kept; only how light it is moves, and only as far as it must', () {
    const teal = Color(0xFF2B7A8C);
    final day = wearing(Palette.light, teal, Brightness.light).accent;
    expect(HSLColor.fromColor(day).hue, closeTo(HSLColor.fromColor(teal).hue, 2));
    final night = wearing(Palette.dark, teal, Brightness.dark).accent;
    expect(HSLColor.fromColor(night).hue, closeTo(HSLColor.fromColor(teal).hue, 2));
    expect(
      HSLColor.fromColor(night).lightness,
      greaterThan(HSLColor.fromColor(teal).lightness),
      reason: 'lit at night',
    );
    // A colour that already reads is worn as it is.
    const deep = Color(0xFF0B1F4D);
    expect(wearing(Palette.light, deep, Brightness.light).accent, deep);
  });

  test('a grey, near-black or near-white cover is not worn: grey buttons would read as turned off', () {
    for (final grey in const [Color(0xFF4F5561), Color(0xFF808080), Color(0xFF050505), Color(0xFFFAFAFA)]) {
      expect(canWear(grey), isFalse, reason: '$grey');
      expect(wearing(Palette.light, grey, Brightness.light), same(Palette.light));
      expect(wearing(MonolithPalette.monolith, grey, Brightness.dark), same(MonolithPalette.monolith));
    }
    expect(canWear(const Color(0xFF2B7A8C)), isTrue);
  });

  testWidgets('a grey cover: Settings says so, and how to give the book a colour', (tester) async {
    final c = await pumpApp(tester, location: '/settings');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(libraryServiceProvider).updateDetails(novel.id, {'accent': '#4f5561'});
    final designed = tester.widget<MaterialApp>(find.byType(MaterialApp)).theme!.colorScheme.primary;
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    expect(tester.widget<MaterialApp>(find.byType(MaterialApp)).theme!.colorScheme.primary, designed);
    expect(find.textContaining('“The Drowned Road” is too grey to wear'), findsOneWidget);
  });

  test('a stored colour that cannot be read is the app’s rust', () {
    expect(colourOf('#2b7a8c'), const Color(0xFF2B7A8C));
    expect(colourOf(''), const Color(0xFFB4532A));
    expect(colourOf('#zz'), const Color(0xFFB4532A));
  });

  testWidgets('the app wears the open book: its colour, another book’s, none; and not when turned off', (tester) async {
    final c = await pumpApp(tester, location: '/settings');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    Color primary() => tester.widget<MaterialApp>(find.byType(MaterialApp)).theme!.colorScheme.primary;
    final designed = primary();
    double hue(Color c) => HSLColor.fromColor(c).hue;

    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    expect(hue(primary()), closeTo(hue(const Color(0xFF2B7A8C)), 2), reason: 'the sample’s teal');
    expect(find.textContaining('The app is in the colour of “The Drowned Road”'), findsOneWidget);

    // The book's colour changed in its details: the app follows.
    c.read(libraryServiceProvider).updateDetails(novel.id, {'accent': '#8e44ad'});
    await tester.pumpAndSettle();
    expect(hue(primary()), closeTo(hue(const Color(0xFF8E44AD)), 2));

    // Turned off: the theme as it was designed, and remembered.
    await tester.tap(find.text('Wear each book’s colour'));
    await tester.pumpAndSettle();
    expect(primary(), designed);
    expect(c.read(settingsStoreProvider).read(wearBookSettingKey), isFalse);
    expect(find.text('The app keeps its own colours, whichever book is open.'), findsOneWidget);

    // On again; then the book closed: the theme as it was.
    await tester.tap(find.text('Wear each book’s colour'));
    await tester.pumpAndSettle();
    expect(primary(), isNot(designed));
    c.read(openNovelProvider.notifier).close();
    await tester.pumpAndSettle();
    expect(primary(), designed);
  });
}
