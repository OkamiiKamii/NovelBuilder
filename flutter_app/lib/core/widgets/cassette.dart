import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../motion/motion.dart';

/// A CASSETTE (dqnamo's Kitchen's Cassette Audio Player): the sign of reading aloud, a small cassette whose reels turn
/// as it reads: a third of a turn as each sentence begins ([sentence]), the tape winding from the left reel onto the
/// right as the page is read ([wound], 0 to 1). It moves only when a sentence begins (never on its own, so the screen
/// is still between them), and at once when the device asks for less motion.
class Cassette extends StatelessWidget {
  const Cassette({super.key, required this.sentence, required this.wound, required this.color});

  final int sentence;
  final double wound;
  final Color color;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: TweenAnimationBuilder<double>(
      tween: Tween(end: sentence / 3),
      duration: Motion.of(context, const Duration(milliseconds: 700)),
      curve: Curves.easeOutCubic,
      builder: (context, turns, _) =>
          SizedBox(width: 30, height: 20, child: CustomPaint(painter: _Tape(turns, wound.clamp(0.0, 1.0), color))),
    ),
  );
}

class _Tape extends CustomPainter {
  _Tape(this.turns, this.wound, this.color);
  final double turns;
  final double wound;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final line = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    // The shell, and its window.
    canvas.drawRRect(RRect.fromRectAndRadius((Offset.zero & size).deflate(0.7), const Radius.circular(3)), line);
    final window = Rect.fromLTWH(size.width * 0.18, size.height * 0.26, size.width * 0.64, size.height * 0.44);
    canvas.drawRRect(RRect.fromRectAndRadius(window, const Radius.circular(2)), line..strokeWidth = 1);
    // The two reels, turning; the tape wound round each (the read on the right).
    final hub = size.height * 0.1;
    final full = window.height * 0.48;
    final tape = Paint()..color = color.withValues(alpha: 0.35);
    for (final (right, x) in [(false, window.left + full), (true, window.right - full)]) {
      final c = Offset(x, window.center.dy);
      final share = right ? wound : 1 - wound;
      canvas.drawCircle(c, hub + (full - hub) * share, tape);
      canvas.drawCircle(c, hub, line);
      for (var k = 0; k < 3; k++) {
        final a = turns * 2 * math.pi + k * 2 * math.pi / 3;
        canvas.drawLine(c, c + Offset(math.cos(a), math.sin(a)) * hub, line);
      }
    }
  }

  @override
  bool shouldRepaint(_Tape old) => old.turns != turns || old.wound != wound || old.color != color;
}
