import 'package:flutter/material.dart';

/// WHAT A THEME LOOKS LIKE BEYOND ITS COLOURS: its typefaces (headings, writing, and numbers), the binding the rail
/// and bottom bar are drawn as, and the ground the pages lie on. Every theme carries its own; widgets read it here
/// rather than naming a face, so a theme changes them all and the others keep theirs.
@immutable
class BookFaces extends ThemeExtension<BookFaces> {
  const BookFaces({
    required this.heading,
    required this.text,
    required this.numbers,
    required this.ground,
    required this.headingCaps,
  });

  /// Headings, buttons and labels: the book's capitals (Cinzel), or System Monolith's interface face (Outfit).
  final String heading;

  /// Writing and reading: the book face (EB Garamond), or Merriweather.
  final String text;

  /// Ranks, statistics, counts and system notices: the book face, or JetBrains Mono.
  final String numbers;

  /// The ground the pages lie on.
  final Ground ground;

  /// Whether headings set in [heading] are shown in capitals by the face itself (Cinzel is all capitals), so a theme
  /// whose face has lower case can still letter its labels in upper case where the design asks.
  final bool headingCaps;

  /// The book: parchment by day, midnight by night (the faces every theme had before System Monolith).
  static const book = BookFaces(
    heading: 'Cinzel',
    text: 'EB Garamond',
    numbers: 'EB Garamond',
    ground: Ground.paper,
    headingCaps: true,
  );

  /// System Monolith: a futuristic status window.
  static const monolith = BookFaces(
    heading: 'Outfit',
    text: 'Merriweather',
    numbers: 'JetBrains Mono',
    ground: Ground.grid,
    headingCaps: false,
  );

  static BookFaces of(BuildContext context) => Theme.of(context).extension<BookFaces>() ?? book;

  @override
  BookFaces copyWith({String? heading, String? text, String? numbers, Ground? ground, bool? headingCaps}) => BookFaces(
    heading: heading ?? this.heading,
    text: text ?? this.text,
    numbers: numbers ?? this.numbers,
    ground: ground ?? this.ground,
    headingCaps: headingCaps ?? this.headingCaps,
  );

  @override
  BookFaces lerp(BookFaces? other, double t) => t < 0.5 ? this : (other ?? this);
}

/// The ground under every page: paper (with lamplight by night), or System Monolith's dark field with a faint grid.
enum Ground { paper, grid }

/// A number, a rank or a statistic in [base]'s style: in System Monolith's monospaced face, as its status windows set
/// them; in the book's themes as [base] already is.
TextStyle numberStyle(BuildContext context, TextStyle base) {
  final f = BookFaces.of(context);
  return f.ground == Ground.grid ? base.copyWith(fontFamily: f.numbers, letterSpacing: 0) : base;
}
