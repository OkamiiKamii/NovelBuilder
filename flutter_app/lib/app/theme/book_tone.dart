import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/workspace/open_novel.dart';
import '../../shared/data/providers.dart';
import 'app_theme.dart';

/// THE APP WEARS THE BOOK: while a novel is open, the whole app takes its cover colour, as a room takes the colour of
/// the lamp in it. Every button, tab, rule, chip and heading in the accent is in the book's colour, the paper takes a
/// breath of it, and going from one book to another the room changes with it, slowly. A green book makes a green room,
/// a crimson one a crimson room; the same app, never the same twice.
///
/// THE COLOUR IS THE AUTHOR'S, MADE READABLE. Its hue and how vivid it is are kept; only how light it is moves, as far
/// as it must for the accent to read at 4.5 : 1 against the paper and the page (darker on parchment, lighter at
/// midnight and in System Monolith), and what is written on it is white or ink, whichever reads better. Danger stays
/// red; the text stays the theme's.
///
/// Turned off in Settings, Appearance ("Wear each book's colour"): the themes are as they were. Remembered on this
/// device. Nothing is stored in the novel.

/// The contrast between two colours, as the accessibility guidelines measure it (1 to 21).
double contrastOf(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  return (la > lb ? la + 0.05 : lb + 0.05) / (la > lb ? lb + 0.05 : la + 0.05);
}

/// The least contrast the worn accent keeps against the paper and the page.
const wornContrast = 4.5;

/// Whether [book] is a colour to wear: one with colour in it. A grey, a near-black or a near-white cover would make
/// every button and link grey, and grey reads as "not now", so the theme keeps its own.
bool canWear(Color book) {
  final hsl = HSLColor.fromColor(book);
  return hsl.saturation >= 0.2 && hsl.lightness >= 0.08 && hsl.lightness <= 0.92;
}

/// [p] worn in [book]'s colour, for a theme of [brightness]; [p] itself when [book] is not one to wear.
Palette wearing(Palette p, Color book, Brightness brightness) {
  if (!canWear(book)) return p;
  final dark = brightness == Brightness.dark;
  final hsl = HSLColor.fromColor(book);
  // A breath of the book in the paper: its colour at the paper's own lightness, a few parts in a hundred; never so
  // much that the text or the quieter text reads less well than it did (or under 4.5 : 1).
  Color tint(Color ground, double share) {
    final own = HSLColor.fromColor(ground);
    final toward = HSLColor.fromAHSL(1, hsl.hue, hsl.saturation, own.lightness).toColor();
    for (var s = share; s > 0.002; s /= 2) {
      final t = Color.lerp(ground, toward, s)!;
      final keeps = [
        p.text,
        p.muted,
      ].every((ink) => contrastOf(ink, t) >= math.min(wornContrast, contrastOf(ink, ground)));
      if (keeps) return t;
    }
    return ground;
  }

  final background = tint(p.background, dark ? 0.10 : 0.12);
  final surface = tint(p.surface, dark ? 0.08 : 0.10);
  final sunken = tint(p.sunken, dark ? 0.12 : 0.14);
  bool reads(Color c) => contrastOf(c, surface) >= wornContrast && contrastOf(c, background) >= wornContrast;
  // As little change as reads: lighter at night, darker by day, a step at a time.
  var accent = book;
  var l = hsl.lightness;
  while (!reads(accent)) {
    l += dark ? 0.01 : -0.01;
    if (l <= 0 || l >= 1) {
      accent = dark ? Colors.white : Colors.black;
      break;
    }
    accent = hsl.withLightness(l).toColor();
  }
  final ink = dark ? p.background : const Color(0xFF15120E);
  final onAccent = contrastOf(Colors.white, accent) >= contrastOf(ink, accent) ? Colors.white : ink;
  return Palette(
    background: background,
    surface: surface,
    sunken: sunken,
    border: Color.lerp(p.border, accent, dark ? 0.14 : 0.12)!,
    text: p.text,
    muted: p.muted,
    accent: accent,
    onAccent: onAccent,
    danger: p.danger,
  );
}

const wearBookSettingKey = 'appearance.wearBook';

/// Whether the app wears the open book's colour: on unless turned off. Remembered on this device.
class WearBookNotifier extends Notifier<bool> {
  @override
  bool build() => ref.watch(settingsStoreProvider).read(wearBookSettingKey) != false;

  void set(bool on) {
    state = on;
    final settings = ref.read(settingsStoreProvider);
    ref
        .read(saveControllerProvider)
        .saveNow('setting:$wearBookSettingKey', () => settings.write(wearBookSettingKey, on));
  }
}

final wearBookProvider = NotifierProvider<WearBookNotifier, bool>(WearBookNotifier.new);

/// The colour the app wears now: the open novel's, while one is open and the app wears books; else none.
final wornColourProvider = Provider<Color?>((ref) {
  if (!ref.watch(wearBookProvider)) return null;
  final id = ref.watch(openNovelProvider);
  if (id == null) return null;
  // Only its colour is watched: the theme is not rebuilt as the book is written in.
  final novel = ref.watch(libraryProvider.select((novels) => novels.where((n) => n.id == id).firstOrNull?.accent));
  return novel == null ? null : colourOf(novel);
});

/// A stored `#rrggbb` as a colour (the app's rust when it cannot be read), as `accentOf` reads a novel's.
Color colourOf(String stored) {
  try {
    return Color(int.parse(stored.substring(1), radix: 16) | 0xFF000000);
  } on FormatException {
    return const Color(0xFFB4532A);
  } on RangeError {
    return const Color(0xFFB4532A);
  }
}
