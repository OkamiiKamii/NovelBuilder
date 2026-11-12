import 'package:flutter/material.dart';

import 'app_theme.dart';

/// How a theme draws the novels themselves: their jackets, spines, the shelves they stand on, the plates naming the
/// shelves, the frames and the portraits. Every theme carries its own; the widgets that draw novels ask it, so
/// switching the theme changes every book at once and nothing of the old look stays behind.
///
/// THE TWO STYLES. **Bound** (parchment by day, midnight by night) is the book as it always was: a jacket in the
/// book's own colour, gilt lettering, wooden shelves, brass plates. **System** (System Monolith) is a status window:
/// near-black jackets and spines framed in gold with teal marks, dark metal shelves lit along their edge, plates of
/// dark glass.
///
/// WHAT STAYS THE AUTHOR'S. A book's colour (chosen in its details) and its cover picture belong to the author, never
/// the theme: the bound style makes the whole jacket of that colour; the system style keeps it as the band down the
/// spine edge and the glow behind the title. A cover picture is shown as it is, in either; only what is around it (the
/// frame, the shadow) is the theme's. Nothing here is stored: it is worked out from the theme each time it is drawn.
enum ArtStyle { bound, system }

/// What a bound thing (a jacket, a portrait, a volume) is drawn with, for one colour.
typedef BoundLook = ({
  List<Color> ground,
  Color ink,
  Color frame,
  Color motif,

  /// The author's colour as a band down the spine edge (the system style), or null (bound: the jacket is the colour).
  Color? band,
});

/// What a spine is drawn with, for one colour.
typedef SpineLook = ({List<Color> ground, Color ink, Color bands, Color emblem, Color? core});

@immutable
class NovelArt extends ThemeExtension<NovelArt> {
  const NovelArt._(this.style, this.dark);

  final ArtStyle style;
  final bool dark;

  static const parchment = NovelArt._(ArtStyle.bound, false);
  static const midnight = NovelArt._(ArtStyle.bound, true);
  static const monolith = NovelArt._(ArtStyle.system, true);

  static NovelArt of(BuildContext context) {
    final theme = Theme.of(context);
    return theme.extension<NovelArt>() ?? (theme.brightness == Brightness.dark ? midnight : parchment);
  }

  bool get system => style == ArtStyle.system;

  /// The dark ground of the system style's jackets and spines, top to foot.
  static const _systemGround = [Color(0xFF171B27), Color(0xFF07080B)];

  /// A jacket, a portrait or a volume in [colour]. [lift] and [sink] are how far the bound style lightens its top and
  /// darkens its foot (each caller keeps the gradient it always had).
  /// With [tinted], the system style's ground takes a little of [colour] at its top (for what has no band of its own: a
  /// portrait, a volume).
  BoundLook bound(Color colour, {double lift = 0.08, double sink = 0.35, bool tinted = false}) {
    if (system) {
      return (
        ground: tinted ? [Color.lerp(_systemGround[0], colour, 0.3)!, _systemGround[1]] : _systemGround,
        ink: MonolithTokens.textPrimary,
        frame: MonolithTokens.accentPrimary,
        motif: MonolithTokens.accentSecondary,
        band: colour,
      );
    }
    final ink = ThemeData.estimateBrightnessForColor(colour) == Brightness.dark
        ? const Color(0xFFFFF8EC)
        : const Color(0xFF1B140E);
    return (
      ground: [Color.lerp(colour, Colors.white, lift)!, Color.lerp(colour, Colors.black, sink)!],
      ink: ink,
      frame: ink.withValues(alpha: 0.55),
      motif: ink,
      band: null,
    );
  }

  /// A spine in [colour]: rounded and gilt (bound), or dark with gold rules, a teal emblem and the author's colour as
  /// a thin core of light down its middle (system).
  SpineLook spine(Color colour) {
    if (system) {
      return (
        ground: const [Color(0xFF07080B), Color(0xFF1A1F2C), Color(0xFF131722), Color(0xFF050608)],
        ink: MonolithTokens.textPrimary,
        bands: MonolithTokens.accentPrimary,
        emblem: MonolithTokens.accentSecondary,
        core: colour,
      );
    }
    final ink = ThemeData.estimateBrightnessForColor(colour) == Brightness.dark
        ? const Color(0xFFF6E7BF)
        : const Color(0xFF1B140E);
    return (
      ground: [
        Color.lerp(colour, Colors.black, 0.45)!,
        Color.lerp(colour, Colors.white, 0.12)!,
        colour,
        Color.lerp(colour, Colors.black, 0.5)!,
      ],
      ink: ink,
      bands: ink.withValues(alpha: 0.7),
      emblem: ink,
      core: null,
    );
  }

  /// The back of the bookcase behind the books.
  Color get shelfBack => system
      ? MonolithTokens.backgroundSecondary
      : dark
      ? const Color(0xFF1E1712)
      : const Color(0xFFE9DFD0);

  /// The plank the books stand on: wood (bound), dark metal (system).
  Color get plank => system
      ? const Color(0xFF232838)
      : dark
      ? const Color(0xFF4A3322)
      : const Color(0xFF9C6B43);

  /// A line of light along the plank's front edge (the system style's), or null.
  Color? get plankLight => system ? MonolithTokens.accentSecondary : null;

  /// The ledge under a row of jackets on a phone: three tones top to foot.
  List<Color> get ledge => system
      ? const [Color(0xFF2A3042), Color(0xFF1A1F2C), Color(0xFF0E1118)]
      : const [Color(0xFF7A5230), Color(0xFF5A3A1E), Color(0xFF3E2712)];

  /// The plate naming a shelf: brass (bound), dark glass edged in gold (system).
  ({List<Color> ground, Color border, Color ink, Color screw, Color screwRim}) get plate => system
      ? (
          ground: const [Color(0xFF1C2130), Color(0xFF11141C), Color(0xFF161A25)],
          border: MonolithTokens.accentPrimary,
          ink: MonolithTokens.accentPrimary,
          screw: MonolithTokens.accentSecondary,
          screwRim: const Color(0xFF0B5E7E),
        )
      : (
          ground: const [Color(0xFFE6C886), Color(0xFFC49A4C), Color(0xFFD9B66E)],
          border: const Color(0xFF8A6326),
          ink: const Color(0xFF2A1C08),
          screw: const Color(0xFF9C7433),
          screwRim: const Color(0xFF6E4E1C),
        );

  @override
  NovelArt copyWith({ArtStyle? style, bool? dark}) => NovelArt._(style ?? this.style, dark ?? this.dark);

  @override
  NovelArt lerp(NovelArt? other, double t) => t < 0.5 ? this : (other ?? this);
}

/// The system style's corner marks: an L of [colour] at each corner of [rect], [arm] long.
void paintBrackets(Canvas canvas, Rect rect, Color colour, {double arm = 10, double width = 1.6}) {
  final p = Paint()
    ..color = colour
    ..strokeWidth = width
    ..style = PaintingStyle.stroke
    ..strokeCap = StrokeCap.square;
  final r = rect;
  for (final (corner, dx, dy) in [
    (r.topLeft, 1.0, 1.0),
    (r.topRight, -1.0, 1.0),
    (r.bottomLeft, 1.0, -1.0),
    (r.bottomRight, -1.0, -1.0),
  ]) {
    canvas
      ..drawLine(corner, corner + Offset(arm * dx, 0), p)
      ..drawLine(corner, corner + Offset(0, arm * dy), p);
  }
}

/// [paintBrackets] as a painter, over a child.
class BracketsPainter extends CustomPainter {
  const BracketsPainter(this.colour, {this.inset = 0, this.arm = 10});
  final Color colour;
  final double inset;
  final double arm;

  @override
  void paint(Canvas canvas, Size size) => paintBrackets(canvas, (Offset.zero & size).deflate(inset), colour, arm: arm);

  @override
  bool shouldRepaint(BracketsPainter old) => old.colour != colour || old.inset != inset || old.arm != arm;
}
