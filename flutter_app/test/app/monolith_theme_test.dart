import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/theme/app_theme.dart';
import 'package:novel_builder/app/theme/book_faces.dart';
import 'package:novel_builder/app/theme/theme_choice.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

double _luminance(Color c) => c.computeLuminance();
double contrast(Color a, Color b) {
  final (hi, lo) = _luminance(a) > _luminance(b) ? (a, b) : (b, a);
  return (_luminance(hi) + 0.05) / (_luminance(lo) + 0.05);
}

void main() {
  test('System Monolith’s tokens are its own, and read at WCAG AA', () {
    const p = MonolithPalette.monolith;
    expect(p.background, const Color(0xFF0A0B0E));
    expect(p.surface, const Color(0xFF13161F));
    expect(p.sunken, const Color(0xFF1C202D));
    expect(p.accent, const Color(0xFFF3B63A));
    expect(p.text, const Color(0xFFF8FAFC));
    expect(p.muted, const Color(0xFF94A3B8));
    expect(p.border, const Color(0xFF272E40));
    for (final ground in [p.background, p.surface, p.sunken]) {
      expect(contrast(p.text, ground), greaterThanOrEqualTo(4.5));
      expect(contrast(p.muted, ground), greaterThanOrEqualTo(4.5));
      expect(contrast(p.accent, ground), greaterThanOrEqualTo(4.5));
      expect(contrast(MonolithTokens.accentSecondary, ground), greaterThanOrEqualTo(4.5));
    }
    expect(contrast(p.onAccent, p.accent), greaterThanOrEqualTo(4.5));
    final t = AppTheme.monolith();
    expect(t.extension<BookFaces>(), BookFaces.monolith);
    expect(t.textTheme.titleLarge!.fontFamily, 'Outfit');
    expect(t.colorScheme.tertiary, MonolithTokens.accentSecondary);
  });

  test('the book’s themes are as they were: their own faces, colours and no teal', () {
    for (final (t, p) in [(AppTheme.light(), Palette.light), (AppTheme.dark(), Palette.dark)]) {
      expect(t.extension<BookFaces>(), BookFaces.book);
      expect(t.textTheme.titleLarge!.fontFamily, 'Cinzel');
      expect(t.colorScheme.primary, p.accent);
      expect(t.scaffoldBackgroundColor, p.background);
      expect(t.colorScheme.tertiary, isNot(MonolithTokens.accentSecondary));
    }
  });

  testWidgets('chosen in Settings, System Monolith dresses the app at once, and is there after a restart', (
    tester,
  ) async {
    final db = AppDatabase.inMemory();
    addTearDown(db.close);
    final first = await pumpApp(tester, db: db, location: '/settings');
    expect(find.bySemanticsLabel('System Monolith'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('System Monolith'));
    await tester.pumpAndSettle();
    expect(first.read(themeChoiceProvider), ThemeChoice.monolith);
    final shown = Theme.of(tester.element(find.text('Settings').first));
    expect(shown.scaffoldBackgroundColor, MonolithTokens.backgroundPrimary);
    expect(shown.colorScheme.primary, MonolithTokens.accentPrimary);
    await tester.pump(const Duration(seconds: 1));
    first.dispose();

    // The app starts again on the same device.
    final again = await pumpApp(tester, db: db, location: '/');
    expect(again.read(themeChoiceProvider), ThemeChoice.monolith);
    expect(again.read(settingsStoreProvider).read(themeSettingKey), 'monolith');

    // And back to the book's midnight: nothing else changed.
    again.read(themeChoiceProvider.notifier).choose(ThemeChoice.dark);
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('Library').first)).extension<BookFaces>(), BookFaces.book);
  });

  test('a choice stored before System Monolith existed reads as it was', () {
    for (final c in ['auto', 'light', 'dark']) {
      expect(ThemeChoice.values.where((v) => v.name == c), hasLength(1), reason: c);
    }
  });
}
