import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'book_faces.dart';

/// THE GROUND THE PAGES LIE ON: in place of a flat colour, a surface. By day, paper: faint fibres laid in it and its
/// edges a shade deeper, as a sheet is. By night, lamplight: a warm glow from the head of the page, falling away
/// into the dark at the edges, as at a desk at night. Painted once for each size behind every page of the app, and
/// kept faint enough that no text on it changes its contrast.
class PaperGround extends StatelessWidget {
  const PaperGround({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    return CustomPaint(
      painter: BookFaces.of(context).ground == Ground.grid
          ? _Grid(
              base: theme.scaffoldBackgroundColor,
              gold: theme.colorScheme.primary,
              line: theme.colorScheme.outlineVariant,
            )
          : _Ground(base: theme.scaffoldBackgroundColor, warm: theme.colorScheme.primary, dark: dark),
      // Painted once and kept: the page over it repaints on its own.
      isComplex: true,
      willChange: false,
      child: child,
    );
  }
}

class _Ground extends CustomPainter {
  _Ground({required this.base, required this.warm, required this.dark});

  final Color base;
  final Color warm;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final rect = Offset.zero & size;
    canvas.drawRect(rect, Paint()..color = base);

    if (dark) {
      // The lamp: a warm pool of light at the head of the page.
      canvas.drawRect(
        rect,
        Paint()
          ..shader = RadialGradient(
            center: const Alignment(0, -1.15),
            radius: 1.25,
            colors: [warm.withValues(alpha: 0.075), warm.withValues(alpha: 0.025), Colors.transparent],
            stops: const [0, 0.45, 1],
          ).createShader(rect),
      );
    }

    // By night the edges fall away into the dark (which only deepens the contrast of the light ink on it). By day
    // the paper stays even to its edges, so the muted ink keeps its contrast everywhere.
    if (dark) {
      canvas.drawRect(
        rect,
        Paint()
          ..shader = RadialGradient(
            radius: 1.1,
            colors: [Colors.transparent, Colors.black.withValues(alpha: 0.16)],
            stops: const [0.62, 1],
          ).createShader(rect),
      );
    }

    // Fibres laid in the paper: short, faint, every way, the same on every run (seeded), about one to each 2,500
    // square pixels.
    final random = math.Random(7);
    final fibre = Paint()
      ..strokeWidth = 0.8
      ..strokeCap = StrokeCap.round
      ..color = dark ? Colors.white.withValues(alpha: 0.018) : const Color(0xFF6B4E2E).withValues(alpha: 0.045);
    final count = (size.width * size.height / 2500).clamp(0, 2400).toInt();
    for (var i = 0; i < count; i++) {
      final at = Offset(random.nextDouble() * size.width, random.nextDouble() * size.height);
      final angle = random.nextDouble() * math.pi;
      final length = 3 + random.nextDouble() * 9;
      final along = Offset(math.cos(angle), math.sin(angle)) * length;
      canvas.drawLine(at, at + along, fibre);
    }
  }

  @override
  bool shouldRepaint(_Ground old) => old.base != base || old.warm != warm || old.dark != dark;
}

/// System Monolith's field: near-black with a faint geometric grid, a soft gold light at the head of the page and a
/// cooler one at its foot, as a status window lit from within. Kept faint enough that no text changes its contrast.
class _Grid extends CustomPainter {
  _Grid({required this.base, required this.gold, required this.line});

  final Color base;
  final Color gold;
  final Color line;

  static const _teal = Color(0xFF38BDF8);

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final rect = Offset.zero & size;
    canvas.drawRect(rect, Paint()..color = base);
    canvas.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(0, -1.2),
          radius: 1.1,
          colors: [gold.withValues(alpha: 0.06), Colors.transparent],
        ).createShader(rect),
    );
    canvas.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(1, 1.2),
          radius: 1.0,
          colors: [_teal.withValues(alpha: 0.035), Colors.transparent],
        ).createShader(rect),
    );
    final grid = Paint()
      ..color = line.withValues(alpha: 0.35)
      ..strokeWidth = 0.5;
    const step = 48.0;
    for (var x = step; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (var y = step; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
  }

  @override
  bool shouldRepaint(_Grid old) => old.base != base || old.gold != gold || old.line != line;
}
