import 'package:flutter/material.dart';

import '../../app/theme/novel_art.dart';
import '../../shared/domain/records/novel.dart';
import 'bookshelf.dart' show ShelfBook;

/// A SHELF YOU SWIPE: on a phone, a stage's books stand in one row on a wooden ledge, a jacket's width apart, and the
/// row is swiped sideways, so every shelf of the library fits in about a screen however many books it holds. The
/// next book peeks in at the edge to say there is more. Each book is the same as on the full shelf (press, menu).
class ShelfRow extends StatelessWidget {
  const ShelfRow({super.key, required this.novels});

  final List<Novel> novels;

  /// A jacket's width on the swiped shelf.
  static const bookWidth = 124.0;

  @override
  Widget build(BuildContext context) {
    const gap = 16.0;
    const jacket = bookWidth * 1.5;
    return Stack(
      children: [
        // The ledge the books stand on: a strip of wood just under the jackets, the length of the row's window.
        const Positioned(left: 0, right: 0, top: jacket - 4, height: 8, child: _Ledge()),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final (i, n) in novels.indexed) ...[
                if (i > 0) const SizedBox(width: gap),
                ShelfBook(key: ValueKey(n.id), novel: n, width: bookWidth),
              ],
              const SizedBox(width: 8),
            ],
          ),
        ),
      ],
    );
  }
}

class _Ledge extends StatelessWidget {
  const _Ledge();

  @override
  Widget build(BuildContext context) {
    // Wood, or the system style's dark metal lit along its top edge (`novel_art.dart`).
    final art = NovelArt.of(context);
    return ExcludeSemantics(
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(2),
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: art.ledge),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 6, offset: const Offset(0, 4)),
          ],
        ),
        child: art.plankLight == null
            ? null
            : Align(
                alignment: Alignment.topCenter,
                child: Container(height: 1.5, color: art.plankLight),
              ),
      ),
    );
  }
}
