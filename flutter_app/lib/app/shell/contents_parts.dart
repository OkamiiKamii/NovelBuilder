import 'package:flutter/material.dart';

import '../../features/characters/widgets/vault.dart';

/// THE PARTS OF THE CONTENTS: More holds a good deal now, so it is laid out as a printed book's contents are, in
/// parts, each with its heading: the day's, the polish before the book goes out, what it can be made into, and the
/// book's own areas. Under Search, a strip of the parts goes straight to any of them.

/// A part of the contents.
enum ContentsPart {
  today('One', 'Today', 'What the book gives you today, and what it is waiting for.'),
  polish('Two', 'Before it goes out', 'What a proofreader would mark, and what an agent asks for.'),
  keepsakes('Three', 'Made from the book', 'Everything it can be turned into, to keep or to share.'),
  book('Four', 'The book', 'Where its plans, pictures, checks and progress are kept.');

  const ContentsPart(this.ordinal, this.title, this.line);

  /// Its place, in words ("One").
  final String ordinal;
  final String title;

  /// What it holds, in a line.
  final String line;

  /// What the strip calls it, short.
  String get short => switch (this) {
    ContentsPart.today => 'Today',
    ContentsPart.polish => 'Polish',
    ContentsPart.keepsakes => 'Keepsakes',
    ContentsPart.book => 'The book',
  };
}

/// A part's heading, as a book sets one: "PART ONE" between rules, its title, and what it holds.
class PartHeading extends StatelessWidget {
  const PartHeading({super.key, required this.part});

  final ContentsPart part;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget rule() => Expanded(child: Container(height: 1, color: scheme.primary.withValues(alpha: 0.35)));
    return Semantics(
      header: true,
      label: 'Part ${part.ordinal.toLowerCase()}: ${part.title}. ${part.line}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 6),
        child: Column(
          children: [
            Row(
              children: [
                rule(),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text(
                    'PART ${part.ordinal.toUpperCase()}',
                    style: vaultHeading(
                      context,
                      size: 10,
                      color: scheme.primary,
                      weight: 700,
                    ).copyWith(letterSpacing: 3),
                  ),
                ),
                rule(),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              part.title,
              textAlign: TextAlign.center,
              style: vaultHeading(context, size: 18, color: scheme.onSurface, weight: 700),
            ),
            Text(
              part.line,
              textAlign: TextAlign.center,
              style: vaultText(context, size: 13.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/// The strip of parts under Search: one press to any of them.
class PartStrip extends StatelessWidget {
  const PartStrip({super.key, required this.parts, required this.onPart});

  /// The parts there are (a book with no words yet has only its areas).
  final List<ContentsPart> parts;
  final ValueChanged<ContentsPart> onPart;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Four even tabs that always fit: the part's number over its name.
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 2),
      child: Row(
        children: [
          for (final (i, p) in parts.indexed) ...[
            if (i > 0) const SizedBox(width: 6),
            Expanded(
              child: Tooltip(
                message: 'Part ${p.ordinal.toLowerCase()}: ${p.title}',
                child: Material(
                  color: scheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(10),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => onPart(p),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 4),
                      child: Column(
                        children: [
                          Text('${i + 1}', style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700)),
                          Text(
                            p.short,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: vaultText(context, size: 13.5, color: scheme.onSurface),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The strip held at the top of the contents as they scroll, so any part is a press away from anywhere in them. As
/// tall as its words need (they grow with the text size), on the sheet's own colour.
class PartStripHeader extends SliverPersistentHeaderDelegate {
  PartStripHeader({required this.strip, required this.height, required this.colour});

  final Widget strip;
  final double height;
  final Color colour;

  /// The height the strip needs at [scaler]'s text size.
  static double heightFor(TextScaler scaler) => 26 + scaler.scale(11) * 1.45 + scaler.scale(13.5) * 1.45;

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) =>
      Container(color: colour, alignment: Alignment.center, child: strip);

  @override
  bool shouldRebuild(PartStripHeader old) => old.height != height || old.colour != colour || old.strip != strip;
}
