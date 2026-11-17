import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'motion.dart';

/// ARRIVING ONE AFTER ANOTHER (Motion's `stagger`, anime.js's `stagger`): a thing shown for the first time fades and
/// rises into place, [index] beats after the first of its row (twelve at most, so a long row never keeps anyone
/// waiting). Built again (the same thing, kept by its key), it does not arrive again. At once when the device asks for
/// less motion.
class Arrive extends StatefulWidget {
  const Arrive({super.key, required this.index, required this.child});

  final int index;
  final Widget child;

  @override
  State<Arrive> createState() => _ArriveState();
}

class _ArriveState extends State<Arrive> with SingleTickerProviderStateMixin {
  late final AnimationController _in;
  late final Animation<double> _fade;
  late final Animation<Offset> _rise;

  @override
  void initState() {
    super.initState();
    final delay = Motion.stagger * math.min(widget.index, 12);
    final total = delay + Motion.medium;
    final start = delay.inMicroseconds / total.inMicroseconds;
    _in = AnimationController(vsync: this, duration: total);
    _fade = CurvedAnimation(
      parent: _in,
      curve: Interval(start, 1, curve: Curves.easeOut),
    );
    _rise = Tween(begin: const Offset(0, 0.06), end: Offset.zero).animate(
      CurvedAnimation(
        parent: _in,
        curve: Interval(start, 1, curve: Motion.arrive),
      ),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_in.isAnimating || _in.isCompleted) return;
    if (Motion.reduced(context)) {
      _in.value = 1;
    } else {
      _in.forward();
    }
  }

  @override
  void dispose() {
    _in.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: _fade,
    child: SlideTransition(position: _rise, child: widget.child),
  );
}

/// A NUMBER THAT ROLLS (Motion's `animate` of a value): shown first, it counts up from nothing to [value]; changed, it
/// rolls from the old to the new. Written by [format]. A screen reader hears the number itself, not the rolling. At
/// once when the device asks for less motion.
class RollingNumber extends StatelessWidget {
  const RollingNumber({super.key, required this.value, required this.format, this.style});

  final int value;
  final String Function(int) format;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => Semantics(
    label: format(value),
    child: ExcludeSemantics(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: value.toDouble()),
        duration: Motion.of(context, Motion.long),
        curve: Curves.easeOutCubic,
        builder: (context, v, _) => Text(format(v.round()), style: style),
      ),
    ),
  );
}
