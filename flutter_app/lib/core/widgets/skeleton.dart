import 'package:flutter/material.dart';

import '../motion/motion.dart';

/// A SKELETON (shadcn/ui's Skeleton): while something is read (a book, its index, its lines), the page shows where its
/// words will stand, as soft bars of their lengths with a light passing over them, in place of a spinner. [label] is
/// what is being done, said to a screen reader (and, with [caption], under the bars). The light holds still when the
/// device asks for less motion.
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.label = 'Loading…', this.lines = 4, this.caption = false, this.heading = true});

  final String label;

  /// How many lines of text to stand for.
  final int lines;

  /// Whether [label] is written under the bars.
  final bool caption;

  /// Whether a heading's bar stands above the lines.
  final bool heading;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final _light = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (Motion.reduced(context)) {
      _light
        ..stop()
        ..value = 0.5;
    } else if (!_light.isAnimating) {
      _light.repeat();
    }
  }

  @override
  void dispose() {
    _light.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final base = scheme.onSurface.withValues(alpha: 0.07);
    final shine = scheme.onSurface.withValues(alpha: 0.16);
    // The lengths of lines of prose: most full, the last of a paragraph short.
    const lengths = [1.0, 0.94, 0.97, 0.62, 1.0, 0.9, 0.78, 0.98, 0.55];
    Widget bar(double widthFactor, double height) => FractionallySizedBox(
      alignment: AlignmentDirectional.centerStart,
      widthFactor: widthFactor,
      child: Container(
        height: height,
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(height / 2)),
      ),
    );
    return Semantics(
      liveRegion: true,
      label: widget.label,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            ExcludeSemantics(
              child: AnimatedBuilder(
                animation: _light,
                builder: (context, child) => ShaderMask(
                  blendMode: BlendMode.srcIn,
                  // The light passes from the leading edge to the trailing one.
                  shaderCallback: (rect) => LinearGradient(
                    colors: [base, shine, base],
                    stops: const [0.35, 0.5, 0.65],
                    transform: _Slide(_light.value * 2 - 1),
                  ).createShader(rect),
                  child: child,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (widget.heading) ...[bar(0.45, 18), const SizedBox(height: 18)],
                    for (var i = 0; i < widget.lines; i++) ...[
                      bar(lengths[i % lengths.length], 11),
                      const SizedBox(height: 12),
                    ],
                  ],
                ),
              ),
            ),
            if (widget.caption) ...[
              const SizedBox(height: 4),
              ExcludeSemantics(
                child: Text(
                  widget.label,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Moves a gradient along its width by [by] (−1: a width back, 1: a width on).
class _Slide extends GradientTransform {
  const _Slide(this.by);
  final double by;

  @override
  Matrix4? transform(Rect bounds, {TextDirection? textDirection}) {
    final dx = (textDirection == TextDirection.rtl ? -by : by) * bounds.width;
    return Matrix4.translationValues(dx, 0, 0);
  }
}
