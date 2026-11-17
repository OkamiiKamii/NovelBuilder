import 'dart:math' as math;

import 'package:flutter/material.dart';

/// A STAMP (dqnamo's Kitchen): a picture set in a postage stamp, its paper edge perforated all round, its picture
/// inside a thin frame, the whole set on the card a little askew, as a stamp stuck on by hand.
class Stamp extends StatelessWidget {
  const Stamp({
    super.key,
    required this.child,
    required this.paper,
    required this.frame,
    this.size = 140,
    this.tilt = -0.035,
  });

  final Widget child;

  /// The stamp's paper, and the thin frame round its picture.
  final Color paper;
  final Color frame;

  /// Its width and height, perforations included.
  final double size;

  /// How far it is turned, in radians.
  final double tilt;

  @override
  Widget build(BuildContext context) => Transform.rotate(
    angle: tilt,
    child: SizedBox.square(
      dimension: size,
      child: PhysicalShape(
        clipper: const _Perforated(),
        color: paper,
        elevation: 2,
        shadowColor: Colors.black54,
        child: Padding(
          padding: EdgeInsets.all(size * 0.08),
          child: DecoratedBox(
            position: DecorationPosition.foreground,
            decoration: BoxDecoration(border: Border.all(color: frame, width: 1.2)),
            child: ClipRect(child: SizedBox.expand(child: child)),
          ),
        ),
      ),
    ),
  );
}

/// A square with round bites taken out all along its edges, as a sheet of stamps is torn.
class _Perforated extends CustomClipper<Path> {
  const _Perforated();

  @override
  Path getClip(Size size) {
    final hole = size.width / 34;
    final edge = Path()..addRect(Offset.zero & size);
    final bites = Path();
    void along(Offset from, Offset to) {
      final length = (to - from).distance;
      final n = math.max(4, (length / (hole * 3)).round());
      for (var i = 0; i <= n; i++) {
        bites.addOval(Rect.fromCircle(center: Offset.lerp(from, to, i / n)!, radius: hole));
      }
    }

    along(Offset.zero, Offset(size.width, 0));
    along(Offset(size.width, 0), Offset(size.width, size.height));
    along(Offset(0, size.height), Offset(size.width, size.height));
    along(Offset.zero, Offset(0, size.height));
    return Path.combine(PathOperation.difference, edge, bites);
  }

  @override
  bool shouldReclip(_Perforated old) => false;
}
