import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/theme/app_theme.dart';
import 'package:novel_builder/app/theme/theme_choice.dart';

import '../helpers/pump_app.dart';

/// WCAG relative-luminance contrast ratio.
double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final hi = la > lb ? la : lb;
  final lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  test('text and accent meet WCAG AA (4.5:1) on both themes', () {
    for (final p in [Palette.light, Palette.dark]) {
      expect(contrast(p.text, p.background), greaterThanOrEqualTo(4.5));
      expect(contrast(p.muted, p.background), greaterThanOrEqualTo(4.5));
      expect(contrast(p.muted, p.surface), greaterThanOrEqualTo(4.5));
      expect(contrast(p.accent, p.surface), greaterThanOrEqualTo(4.5));
      expect(contrast(p.onAccent, p.accent), greaterThanOrEqualTo(4.5));
    }
  });

  testWidgets('choosing a theme in Settings changes the whole app', (tester) async {
    final container = await pumpApp(tester, location: '/settings');
    MaterialApp app() => tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app().themeMode, ThemeMode.system);

    await tester.tap(find.text(ThemeChoice.dark.label));
    await tester.pumpAndSettle();
    expect(container.read(themeChoiceProvider), ThemeChoice.dark);
    expect(app().themeMode, ThemeMode.dark);
    expect(Theme.of(tester.element(find.text('Settings').first)).brightness, Brightness.dark);

    await tester.tap(find.text(ThemeChoice.light.label));
    await tester.pumpAndSettle();
    expect(app().themeMode, ThemeMode.light);
  });

  test('selected navigation icons use the accent, so they stand out from the indicator', () {
    for (final (theme, p) in [(AppTheme.light(), Palette.light), (AppTheme.dark(), Palette.dark)]) {
      final icon = theme.navigationBarTheme.iconTheme!.resolve({WidgetState.selected})!;
      expect(icon.color, p.accent);
      expect(contrast(p.accent, p.surface), greaterThanOrEqualTo(4.5));
    }
  });
}
