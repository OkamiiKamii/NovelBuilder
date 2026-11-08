import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';
import 'app_theme.dart';

/// The app's looks: the three of the original app (matching the device, parchment, midnight) and System Monolith.
/// Stored on the device by name, so a choice made before System Monolith existed reads as it was.
enum ThemeChoice {
  auto('Match this device', ThemeMode.system),
  light('Light (parchment)', ThemeMode.light),
  dark('Dark (midnight)', ThemeMode.dark),
  monolith('System Monolith', ThemeMode.dark);

  const ThemeChoice(this.label, this.mode);

  final String label;
  final ThemeMode mode;

  /// What the look is like, for its preview in Settings.
  String? get description => switch (this) {
    ThemeChoice.monolith =>
      'A futuristic, high-contrast system interface inspired by advanced RPG status windows and premium digital '
          'workspaces.',
    _ => null,
  };

  /// The themes the app is given for this choice: System Monolith is its own, by day and by night; the others are
  /// parchment and midnight, as the device or the choice asks.
  ThemeData get dayTheme => this == ThemeChoice.monolith ? AppTheme.monolith() : AppTheme.light();
  ThemeData get nightTheme => this == ThemeChoice.monolith ? AppTheme.monolith() : AppTheme.dark();
}

const themeSettingKey = 'appearance.theme';

/// Remembered on this device, in the library's settings.
class ThemeChoiceNotifier extends Notifier<ThemeChoice> {
  @override
  ThemeChoice build() {
    final stored = ref.watch(settingsStoreProvider).read(themeSettingKey);
    return ThemeChoice.values.where((c) => c.name == stored).firstOrNull ?? ThemeChoice.auto;
  }

  void choose(ThemeChoice choice) {
    state = choice;
    final settings = ref.read(settingsStoreProvider);
    ref
        .read(saveControllerProvider)
        .saveNow('setting:$themeSettingKey', () => settings.write(themeSettingKey, choice.name));
  }
}

final themeChoiceProvider = NotifierProvider<ThemeChoiceNotifier, ThemeChoice>(ThemeChoiceNotifier.new);
