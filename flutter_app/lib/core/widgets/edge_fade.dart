import 'package:flutter/material.dart';

import '../motion/motion.dart';

/// A SCROLL FADE LIST (dqnamo's Kitchen): a list fades out softly at an edge where more of it lies beyond, and is cut
/// clean where it ends, so the edge itself says "more this way". The fade comes and goes as the list is scrolled
/// (eased; at once with less motion asked for). Only the list's own scrolling is read (not lists inside it).
class EdgeFade extends StatefulWidget {
  const EdgeFade({super.key, required this.child, this.extent = 28});

  /// The scrolling list.
  final Widget child;

  /// How far into the list the fade reaches, in pixels.
  final double extent;

  @override
  State<EdgeFade> createState() => EdgeFadeState();
}

class EdgeFadeState extends State<EdgeFade> {
  bool _before = false;
  bool _after = false;
  Axis _axis = Axis.vertical;

  /// Which edges fade now: where more of the list lies before and after what shows.
  @visibleForTesting
  ({bool before, bool after}) get fading => (before: _before, after: _after);

  bool _read(ScrollMetrics m) {
    final before = m.extentBefore > 0.5;
    final after = m.extentAfter > 0.5;
    if (before != _before || after != _after || m.axis != _axis) {
      setState(() {
        _before = before;
        _after = after;
        _axis = m.axis;
      });
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final duration = Motion.of(context, Motion.short);
    return NotificationListener<ScrollMetricsNotification>(
      onNotification: (n) => n.depth == 0 && _read(n.metrics),
      child: NotificationListener<ScrollUpdateNotification>(
        onNotification: (n) => n.depth == 0 && _read(n.metrics),
        child: TweenAnimationBuilder<double>(
          tween: Tween(end: _before ? 1 : 0),
          duration: duration,
          curve: Curves.easeOut,
          builder: (context, before, _) => TweenAnimationBuilder<double>(
            tween: Tween(end: _after ? 1 : 0),
            duration: duration,
            curve: Curves.easeOut,
            builder: (context, after, child) => ShaderMask(
              blendMode: BlendMode.dstIn,
              shaderCallback: (rect) {
                final length = _axis == Axis.vertical ? rect.height : rect.width;
                final reach = length <= 0 ? 0.0 : (widget.extent / length).clamp(0.0, 0.5);
                return LinearGradient(
                  begin: _axis == Axis.vertical ? Alignment.topCenter : Alignment.centerLeft,
                  end: _axis == Axis.vertical ? Alignment.bottomCenter : Alignment.centerRight,
                  colors: [
                    Colors.black.withValues(alpha: 1 - before),
                    Colors.black,
                    Colors.black,
                    Colors.black.withValues(alpha: 1 - after),
                  ],
                  stops: [0, reach, 1 - reach, 1],
                ).createShader(rect);
              },
              child: child,
            ),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}
