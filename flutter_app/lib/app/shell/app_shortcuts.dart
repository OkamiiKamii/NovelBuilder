import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../destinations.dart';

/// Moves to one of the main areas.
class GoToDestinationIntent extends Intent {
  const GoToDestinationIntent(this.destination);

  final Destination destination;
}

/// Opens search across the whole novel.
class SearchNovelIntent extends Intent {
  const SearchNovelIntent();
}

bool get _usesCommandKey =>
    defaultTargetPlatform == TargetPlatform.macOS || defaultTargetPlatform == TargetPlatform.iOS;

/// The modifier the platform expects: Command on Apple devices, Control elsewhere.
SingleActivator primaryShortcut(LogicalKeyboardKey key) =>
    _usesCommandKey ? SingleActivator(key, meta: true) : SingleActivator(key, control: true);

/// How the platform's modifier is written in help text.
String get primaryModifierLabel => _usesCommandKey ? '⌘' : 'Ctrl+';

const _digits = [
  LogicalKeyboardKey.digit1,
  LogicalKeyboardKey.digit2,
  LogicalKeyboardKey.digit3,
  LogicalKeyboardKey.digit4,
  LogicalKeyboardKey.digit5,
  LogicalKeyboardKey.digit6,
  LogicalKeyboardKey.digit7,
  LogicalKeyboardKey.digit8,
];

/// Cmd/Ctrl+1–8 go to the main areas in order; Cmd/Ctrl+, opens Settings, as on most desktop apps.
Map<ShortcutActivator, Intent> destinationShortcuts() => {
  for (var i = 0; i < Destination.values.length && i < _digits.length; i++)
    primaryShortcut(_digits[i]): GoToDestinationIntent(Destination.values[i]),
  primaryShortcut(LogicalKeyboardKey.comma): const GoToDestinationIntent(Destination.settings),
  // As in the original app: Cmd/Ctrl+K searches the novel.
  primaryShortcut(LogicalKeyboardKey.keyK): const SearchNovelIntent(),
};

/// The help text for a destination's shortcut, e.g. `⌘1`.
String shortcutLabel(Destination destination) => '$primaryModifierLabel${destination.index + 1}';
