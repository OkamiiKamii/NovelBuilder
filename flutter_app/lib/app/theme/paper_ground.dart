import 'dart:math' as math;

import 'package:flutter/material.dart';

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
      painter: _Ground(base: theme.scaffoldBackgroundColor, warm: theme.colorScheme.primary, dark: dark),
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
