import 'dart:ui';

import 'package:flutter/material.dart';

import '../motion/motion.dart';

/// AN ANIMATED SIGNATURE (dqnamo's Kitchen; the line drawn as anime.js's `createDrawable` draws one): the author's name
/// signs itself, written out from its first letter as by a pen, and a flourish is drawn under it. It signs when it
/// comes into view (not unseen, below the page); signed, it stays. Signed at once when the device asks for less motion.
class Signature extends StatefulWidget {
  const Signature({super.key, required this.name, required this.style, required this.ink});

  final String name;
  final TextStyle style;
  final Color ink;

  @override
  State<Signature> createState() => _SignatureState();
}

class _SignatureState extends State<Signature> with SingleTickerProviderStateMixin {
  late final _pen = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600));
  ScrollPosition? _scroll;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (Motion.reduced(context)) {
      _pen.value = 1;
      return;
    }
    if (_pen.value > 0) return;
    _scroll?.removeListener(_look);
    _scroll = Scrollable.maybeOf(context)?.position;
    _scroll?.addListener(_look);
    WidgetsBinding.instance.addPostFrameCallback((_) => _look());
  }

  /// Signs once it is on the screen.
  void _look() {
    if (!mounted || _pen.isAnimating || _pen.value > 0) return;
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize || !box.attached) return;
    final top = box.localToGlobal(Offset.zero).dy;
    final screen = MediaQuery.sizeOf(context).height;
    if (top < screen - 24 && top + box.size.height > 0) {
      _scroll?.removeListener(_look);
      _pen.forward();
    }
  }

  @override
  void dispose() {
    _scroll?.removeListener(_look);
    _pen.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Signed, ${widget.name}',
    child: ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _pen,
        builder: (context, _) {
          // The name written out over the first three quarters; the flourish drawn over the last half.
          final written = Curves.easeInOut.transform((_pen.value / 0.75).clamp(0, 1));
          final drawn = Curves.easeOut.transform(((_pen.value - 0.5) / 0.5).clamp(0, 1));
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ClipRect(
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  widthFactor: written,
                  child: Text(widget.name, style: widget.style.copyWith(color: widget.ink)),
                ),
              ),
              SizedBox(width: 180, height: 18, child: CustomPaint(painter: _Flourish(drawn, widget.ink))),
            ],
          );
        },
      ),
    ),
  );
}

/// A pen's flourish, drawn as far as [drawn] (0 to 1) along its length.
class _Flourish extends CustomPainter {
  _Flourish(this.drawn, this.ink);
  final double drawn;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    if (drawn <= 0) return;
    final w = size.width;
    final h = size.height;
    final path = Path()
      ..moveTo(w * 0.02, h * 0.55)
      ..cubicTo(w * 0.25, h * 0.05, w * 0.45, h * 0.95, w * 0.62, h * 0.45)
      ..cubicTo(w * 0.72, h * 0.15, w * 0.86, h * 0.2, w * 0.98, h * 0.4);
    final paint = Paint()
      ..color = ink.withValues(alpha: 0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round;
    for (final PathMetric m in path.computeMetrics()) {
      canvas.drawPath(m.extractPath(0, m.length * drawn), paint);
    }
  }

  @override
  bool shouldRepaint(_Flourish old) => old.drawn != drawn || old.ink != ink;
}
