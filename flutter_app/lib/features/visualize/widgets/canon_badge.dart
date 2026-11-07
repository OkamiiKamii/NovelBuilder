import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/domain/canon/overlay.dart';
import '../../../shared/domain/continuity/rules.dart';
import '../../review/review_providers.dart';
import '../visualize_providers.dart';

/// A record's canon and continuity badge, as a drawing shows it: its marks (a status glyph, ! and how many to check) and
/// the tone of the worst finding (null for a status alone).
typedef CanonBadge = ({String glyph, Severity? tone});

/// The badges of the records a view draws, keyed as the overlay keys them (`event:<id>`, `entry:<id>`…); null while the
/// marks are off.
final canonBadgesProvider = Provider.autoDispose<Map<String, CanonBadge>?>((ref) {
  if (!ref.watch(canonMarksProvider)) return null;
  final data = ref.watch(reviewDataProvider);
  if (data == null) return null;
  return {for (final MapEntry(:key, :value) in data.overlay.entries) key: ?badgeOf(value)};
});

/// The overlay marks themselves, for words and details; null while the marks are off.
final canonMarksOfProvider = Provider.autoDispose<Map<String, OverlayMark>?>((ref) {
  if (!ref.watch(canonMarksProvider)) return null;
  return ref.watch(reviewDataProvider)?.overlay;
});

/// Paints a badge with its top-left corner near [at]: a small rounded tag, filled by tone, with its glyphs.
/// With [anchorRight], [at] is the badge's top-right corner instead, so it can sit before what it marks.
void paintCanonBadge(
  Canvas canvas,
  Offset at,
  CanonBadge badge,
  ColorScheme scheme, {
  double size = 11,
  bool anchorRight = false,
}) {
  final (bg, fg) = switch (badge.tone) {
    Severity.critical => (scheme.error, scheme.onError),
    Severity.warning => (scheme.errorContainer, scheme.onErrorContainer),
    Severity.info => (scheme.surfaceContainerHighest, scheme.onSurface),
    null => (scheme.secondaryContainer, scheme.onSecondaryContainer),
  };
  final text = TextPainter(
    text: TextSpan(
      text: badge.glyph,
      style: TextStyle(fontSize: size, color: fg, fontWeight: FontWeight.w700),
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  final left = anchorRight ? at.dx - text.width - 8 : at.dx;
  final rect = RRect.fromRectAndRadius(
    Rect.fromLTWH(left, at.dy, text.width + 8, text.height + 2),
    const Radius.circular(5),
  );
  canvas.drawRRect(rect, Paint()..color = bg);
  canvas.drawRRect(
    rect,
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = fg.withValues(alpha: 0.6),
  );
  text.paint(canvas, Offset(left + 4, at.dy + 1));
}

/// The same badge as a widget, for lists and cards.
class CanonBadgeChip extends StatelessWidget {
  const CanonBadgeChip(this.badge, {super.key, this.words = ''});
  final CanonBadge badge;

  /// What it says, for a screen reader.
  final String words;

  @override
  Widget build(BuildContext context) => Semantics(
    label: words,
    excludeSemantics: words.isNotEmpty,
    child: CustomPaint(
      size: Size(badge.glyph.length * 8.0 + 10, 16),
      painter: _BadgePainter(badge, Theme.of(context).colorScheme),
    ),
  );
}

class _BadgePainter extends CustomPainter {
  _BadgePainter(this.badge, this.scheme);
  final CanonBadge badge;
  final ColorScheme scheme;

  @override
  void paint(Canvas canvas, Size size) => paintCanonBadge(canvas, Offset.zero, badge, scheme);

  @override
  bool shouldRepaint(_BadgePainter old) => old.badge != badge || old.scheme != scheme;
}
