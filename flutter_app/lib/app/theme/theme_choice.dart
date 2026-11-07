import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';

/// The app's colours, with the same three choices and wording as the original app.
enum ThemeChoice {
  auto('Match this device', ThemeMode.system),
  light('Light (parchment)', ThemeMode.light),
  dark('Dark (midnight)', ThemeMode.dark);

  const ThemeChoice(this.label, this.mode);

  final String label;
  final ThemeMode mode;
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
