import 'package:flutter/material.dart';

import '../motion/motion.dart';

/// IRIDESCENT FOIL (dqnamo's Kitchen): a book's jacket catches the light as foil does. A band of colours (rose, cyan,
/// gold, violet) lies faintly on the jacket itself (not around it), and shifts as the page is scrolled or the pointer
/// moves over it, the jacket tilting a little towards the pointer. Drawn again only when one of those moves; still
/// when the device asks for less motion.
class Foil extends StatefulWidget {
  const Foil({super.key, required this.child});
  final Widget child;

  @override
  State<Foil> createState() => _FoilState();
}

class _FoilState extends State<Foil> {
  /// Where the light falls along the jacket: 0 its leading edge, 1 its trailing.
  final _light = ValueNotifier<double>(0.3);

  /// The pointer's place over the jacket (-1 to 1 each way), or null when it is not over it.
  Offset? _tilt;
  ScrollPosition? _scroll;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _scroll?.removeListener(_scrolled);
    _scroll = Motion.reduced(context) ? null : Scrollable.maybeOf(context)?.position;
    _scroll?.addListener(_scrolled);
  }

  void _scrolled() {
    final s = _scroll;
    if (s == null || !s.hasPixels) return;
    _light.value = 0.3 + (s.pixels / 600) % 1;
  }

  @override
  void dispose() {
    _scroll?.removeListener(_scrolled);
    _light.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final still = Motion.reduced(context);
    final tilt = still ? null : _tilt;
    // A layer of its own, so the sheen falls only on what the jacket painted (not the page behind it).
    final jacket = RepaintBoundary(
      child: CustomPaint(foregroundPainter: _Sheen(_light), child: widget.child),
    );
    return MouseRegion(
      onHover: still
          ? null
          : (e) {
              final size = context.size;
              if (size == null || size.isEmpty) return;
              final x = (e.localPosition.dx / size.width).clamp(0.0, 1.0);
              final y = (e.localPosition.dy / size.height).clamp(0.0, 1.0);
              _light.value = 0.15 + x * 0.7;
              setState(() => _tilt = Offset(x * 2 - 1, y * 2 - 1));
            },
      onExit: still ? null : (_) => setState(() => _tilt = null),
      child: TweenAnimationBuilder<Offset>(
        tween: Tween(end: tilt ?? Offset.zero),
        duration: Motion.of(context, Motion.short),
        curve: Curves.easeOut,
        builder: (context, t, child) => Transform(
          alignment: Alignment.center,
          transform: Matrix4.identity()
            ..setEntry(3, 2, 0.0012)
            ..rotateY(t.dx * 0.10)
            ..rotateX(-t.dy * 0.08),
          child: child,
        ),
        child: jacket,
      ),
    );
  }
}

/// The band of foil colours, laid only where the jacket is (over its own paint, not its shadow or the page).
class _Sheen extends CustomPainter {
  _Sheen(this.light) : super(repaint: light);
  final ValueNotifier<double> light;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final at = light.value % 1.3 - 0.15;
    final shader = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: const [
        Color(0x00FFFFFF),
        Color(0x33FF7AB6),
        Color(0x4D7AE7FF),
        Color(0x40FFE27A),
        Color(0x33B78CFF),
        Color(0x00FFFFFF),
      ],
      stops: [
        (at - 0.30).clamp(0.0, 1.0),
        (at - 0.18).clamp(0.0, 1.0),
        (at - 0.06).clamp(0.0, 1.0),
        (at + 0.06).clamp(0.0, 1.0),
        (at + 0.18).clamp(0.0, 1.0),
        (at + 0.30).clamp(0.0, 1.0),
      ],
    ).createShader(rect);
    canvas.drawRect(
      rect,
      Paint()
        ..shader = shader
        ..blendMode = BlendMode.srcATop,
    );
  }

  @override
  bool shouldRepaint(_Sheen old) => old.light != light;
}
