import 'package:flutter/physics.dart';
import 'package:flutter/widgets.dart';

/// THE APP'S MOTION: one set of springs and timings for everything that moves, after Motion's springs
/// (motion.dev: `type: "spring"`, stiffness and damping) and anime.js's spring easing. Nothing here moves when the
/// device asks for less motion ([Motion.reduced]): the change is shown at once.
abstract final class Motion {
  /// Whether the device asks for less motion (Android's "Remove animations", the system's reduce motion).
  static bool reduced(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  /// [duration], or none when motion is reduced.
  static Duration of(BuildContext context, Duration duration) => reduced(context) ? Duration.zero : duration;

  /// A size or a place settling: quick, a touch of give, no wobble.
  static const settle = SpringCurve(stiffness: 380, damping: 30);

  /// Something arriving: lands with a small overshoot, as Motion's default spring does.
  static const arrive = SpringCurve(stiffness: 300, damping: 20);

  static const short = Duration(milliseconds: 220);
  static const medium = Duration(milliseconds: 360);
  static const long = Duration(milliseconds: 600);

  /// The gap between items of a list arriving one after another (Motion's and anime.js's `stagger`).
  static const stagger = Duration(milliseconds: 40);
}

/// A spring as a curve over a fixed duration: the spring of unit mass with [stiffness] and [damping], from 0 to 1,
/// read over the time it takes to come to rest, so it fits any implicit animation (`AnimatedSize`, `AnimatedSlide`…).
/// It may pass 1 on the way (the overshoot): for sizes, places and scales, never for opacity.
class SpringCurve extends Curve {
  const SpringCurve({required this.stiffness, required this.damping});

  final double stiffness;
  final double damping;

  static final _settled = <(double, double), double>{};

  /// How long (in the spring's own seconds) it takes to come within a thousandth of rest.
  double get _restTime => _settled.putIfAbsent((stiffness, damping), () {
    final sim = _simulation;
    var t = 0.0;
    var still = 0.0;
    while (t < 10) {
      t += 1 / 240;
      if ((sim.x(t) - 1).abs() < 0.001 && sim.dx(t).abs() < 0.01) {
        still += 1 / 240;
        if (still > 0.05) return t;
      } else {
        still = 0;
      }
    }
    return t;
  });

  SpringSimulation get _simulation => SpringSimulation(
    SpringDescription(mass: 1, stiffness: stiffness, damping: damping),
    0,
    1,
    0,
    tolerance: const Tolerance(distance: 0.0005, velocity: 0.005),
  );

  @override
  double transformInternal(double t) => _simulation.x(t * _restTime);
}
