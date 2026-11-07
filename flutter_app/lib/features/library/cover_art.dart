import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shared/domain/records/novel.dart';

/// COVER ART: a designed jacket (one without an uploaded picture) is drawn with a motif of its own, so a shelf of
/// books reads as different books, not one jacket repeated. The motif follows the book's genre (stars for fantasy,
/// rings for science fiction, vines for romance, a sunburst for mystery, waves for adventure, a crescent for horror),
/// and the book's id where no genre says; its details (where the stars fall, how the vines turn) come from the id too,
/// so no two books are drawn alike and each always looks the same. Drawn in the jacket's own ink, faintly, around the
/// lettering. Nothing is stored: it is worked out from the book each time.
enum CoverMotif { sunburst, stars, vines, rings, waves, shapes, crescent }

/// The words of a genre that choose a motif, checked in this order.
const _byGenre = <(String, CoverMotif)>[
  ('horror', CoverMotif.crescent),
  ('gothic', CoverMotif.crescent),
  ('sci', CoverMotif.rings),
  ('space', CoverMotif.rings),
  ('dystop', CoverMotif.rings),
  ('cyber', CoverMotif.rings),
  ('fantasy', CoverMotif.stars),
  ('litrpg', CoverMotif.stars),
  ('cultivation', CoverMotif.stars),
  ('myth', CoverMotif.stars),
  ('romance', CoverMotif.vines),
  ('love', CoverMotif.vines),
  ('slice of life', CoverMotif.vines),
  ('mystery', CoverMotif.sunburst),
  ('thriller', CoverMotif.sunburst),
  ('crime', CoverMotif.sunburst),
  ('noir', CoverMotif.sunburst),
  ('historical', CoverMotif.sunburst),
  ('adventure', CoverMotif.waves),
  ('action', CoverMotif.waves),
  ('sea', CoverMotif.waves),
];

/// A whole number from the book's id, the same every time.
int coverSeed(String id) {
  var h = 0;
  for (final c in id.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return h;
}

CoverMotif motifOf(Novel novel) {
  for (final genre in [novel.primaryGenre, ...novel.secondaryGenres]) {
    final g = genre.toLowerCase();
    for (final (word, motif) in _byGenre) {
      if (g.contains(word)) return motif;
    }
  }
  return CoverMotif.values[coverSeed(novel.id) % CoverMotif.values.length];
}

/// The motif drawn over a whole jacket, behind its lettering.
class CoverArtPainter extends CustomPainter {
  CoverArtPainter({required this.motif, required this.seed, required this.ink});
  final CoverMotif motif;
  final int seed;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final rnd = math.Random(seed);
    final line = Paint()
      ..color = ink.withValues(alpha: 0.24)
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(0.6, w * 0.006)
      ..strokeCap = StrokeCap.round;
    final fill = Paint()..color = ink.withValues(alpha: 0.19);
    switch (motif) {
      case CoverMotif.sunburst:
        // Rays fanning up from the foot, stepped arcs over the head: an Art Deco jacket.
        final foot = Offset(w / 2, h * 1.02);
        final rays = 13 + rnd.nextInt(6);
        for (var i = 0; i <= rays; i++) {
          final a = math.pi + math.pi * i / rays;
          canvas.drawLine(
            foot + Offset(math.cos(a), math.sin(a)) * h * 0.08,
            foot + Offset(math.cos(a), math.sin(a)) * h * 0.36,
            line,
          );
        }
        for (var i = 0; i < 3; i++) {
          canvas.drawArc(
            Rect.fromCenter(
              center: Offset(w / 2, h * 0.16),
              width: w * (0.34 + i * 0.16),
              height: h * (0.12 + i * 0.08),
            ),
            math.pi,
            math.pi,
            false,
            line,
          );
        }
        _diamond(canvas, Offset(w / 2, h * 0.1), w * 0.035, fill);
      case CoverMotif.stars:
        // A night sky: scattered stars, one constellation joined up, a crescent moon.
        final points = [
          for (var i = 0; i < 26; i++) Offset(rnd.nextDouble() * w, rnd.nextDouble() * h),
        ].where((p) => p.dy < h * 0.3 || p.dy > h * 0.72).toList();
        for (final p in points) {
          canvas.drawCircle(p, w * (0.006 + rnd.nextDouble() * 0.01), fill);
        }
        final shape = [for (var i = 0; i < 5; i++) Offset(w * (0.12 + i * 0.17), h * (0.08 + rnd.nextDouble() * 0.16))];
        for (var i = 1; i < shape.length; i++) {
          canvas.drawLine(shape[i - 1], shape[i], line);
        }
        for (final p in shape) {
          _star(canvas, p, w * 0.03, fill);
        }
        // In the foot corner, clear of the author's name.
        final moon = Offset(w * 0.16, h * 0.93);
        canvas.drawPath(
          Path.combine(
            PathOperation.difference,
            Path()..addOval(Rect.fromCircle(center: moon, radius: w * 0.065)),
            Path()..addOval(Rect.fromCircle(center: moon + Offset(w * 0.03, -w * 0.02), radius: w * 0.058)),
          ),
          fill,
        );
      case CoverMotif.vines:
        // Vines climbing both edges, leaves on alternate sides.
        for (final side in [0.1, 0.9]) {
          final path = Path()..moveTo(w * side, h);
          final leaves = <(Offset, double)>[];
          for (var i = 1; i <= 6; i++) {
            final y = h * (1 - i / 6);
            final x = w * side + (i.isEven ? 1 : -1) * w * (0.04 + rnd.nextDouble() * 0.03) * (side < 0.5 ? 1 : -1);
            path.quadraticBezierTo(w * side, y + h / 12, x, y);
            leaves.add((Offset(x, y), i.isEven ? 0.7 : -0.7));
          }
          canvas.drawPath(path, line);
          for (final (at, tilt) in leaves) {
            canvas.save();
            canvas.translate(at.dx, at.dy);
            canvas.rotate(tilt * (side < 0.5 ? 1 : -1));
            canvas.drawOval(Rect.fromCenter(center: Offset(w * 0.05, 0), width: w * 0.1, height: w * 0.045), fill);
            canvas.restore();
          }
        }
      case CoverMotif.rings:
        // A planet in its rings over the head, moons on the orbits, a few points of light below.
        final c = Offset(w / 2, h * 0.17);
        for (var i = 0; i < 3; i++) {
          canvas.drawOval(
            Rect.fromCenter(center: c, width: w * (0.5 + i * 0.22), height: h * (0.07 + i * 0.035)),
            line,
          );
        }
        canvas.drawCircle(c, w * 0.07, fill);
        for (var i = 0; i < 3; i++) {
          final a = rnd.nextDouble() * math.pi * 2;
          canvas.drawCircle(
            c + Offset(math.cos(a) * w * (0.25 + i * 0.11), math.sin(a) * h * (0.035 + i * 0.0175)),
            w * 0.014,
            fill,
          );
        }
        for (var i = 0; i < 9; i++) {
          canvas.drawCircle(Offset(rnd.nextDouble() * w, h * (0.74 + rnd.nextDouble() * 0.24)), w * 0.007, fill);
        }
      case CoverMotif.waves:
        // Woodcut waves rising at the foot under a low sun.
        for (var row = 0; row < 5; row++) {
          final y = h * (0.78 + row * 0.05);
          final path = Path()..moveTo(0, y);
          final phase = rnd.nextDouble() * w * 0.2;
          for (var x = 0.0; x <= w + 1; x += w / 24) {
            path.lineTo(x, y + math.sin((x + phase) / w * math.pi * 5) * h * 0.012);
          }
          canvas.drawPath(path, line);
        }
        canvas.drawCircle(Offset(w * (0.25 + rnd.nextDouble() * 0.5), h * 0.17), w * 0.1, fill);
      case CoverMotif.shapes:
        // Bauhaus: a circle, a half circle and a bar, placed by the book.
        canvas.drawCircle(Offset(w * (0.2 + rnd.nextDouble() * 0.1), h * 0.16), w * 0.13, fill);
        canvas.drawArc(
          Rect.fromCircle(center: Offset(w * 0.86, h * 0.99), radius: w * 0.15),
          math.pi,
          math.pi,
          true,
          fill,
        );
        canvas.drawRect(Rect.fromLTWH(w * 0.62, h * 0.1, w * 0.05, h * 0.16), fill);
        canvas.drawLine(Offset(w * 0.12, h * 0.8), Offset(w * 0.5, h * 0.8), line);
      case CoverMotif.crescent:
        // A large dim crescent and thorned lines: a darker jacket.
        final moon = Offset(w * 0.5, h * 0.17);
        canvas.drawPath(
          Path.combine(
            PathOperation.difference,
            Path()..addOval(Rect.fromCircle(center: moon, radius: w * 0.15)),
            Path()..addOval(Rect.fromCircle(center: moon + Offset(w * 0.07, -w * 0.02), radius: w * 0.14)),
          ),
          fill,
        );
        for (final side in [0.14, 0.86]) {
          canvas.drawLine(Offset(w * side, h * 0.7), Offset(w * side, h * 0.96), line);
          for (var i = 0; i < 4; i++) {
            final y = h * (0.73 + i * 0.06);
            canvas.drawLine(
              Offset(w * side, y),
              Offset(w * side + (i.isEven ? 1 : -1) * w * 0.035, y - h * 0.02),
              line,
            );
          }
        }
    }
  }

  void _diamond(Canvas canvas, Offset c, double r, Paint paint) => canvas.drawPath(
    Path()
      ..moveTo(c.dx, c.dy - r)
      ..lineTo(c.dx + r, c.dy)
      ..lineTo(c.dx, c.dy + r)
      ..lineTo(c.dx - r, c.dy)
      ..close(),
    paint,
  );

  void _star(Canvas canvas, Offset c, double r, Paint paint) {
    final path = Path();
    for (var i = 0; i < 8; i++) {
      final a = -math.pi / 2 + i * math.pi / 4;
      final d = i.isEven ? r : r * 0.35;
      final p = c + Offset(math.cos(a), math.sin(a)) * d;
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(path..close(), paint);
  }

  @override
  bool shouldRepaint(CoverArtPainter old) => old.motif != motif || old.seed != seed || old.ink != ink;
}

/// The motif's emblem, small, for a spine: one star, a ring, a leaf, a ray fan, a wave, a circle or a crescent.
class SpineEmblemPainter extends CustomPainter {
  SpineEmblemPainter({required this.motif, required this.ink});
  final CoverMotif motif;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2;
    final fill = Paint()..color = ink.withValues(alpha: 0.8);
    final line = Paint()
      ..color = ink.withValues(alpha: 0.8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..strokeCap = StrokeCap.round;
    switch (motif) {
      case CoverMotif.stars:
        final path = Path();
        for (var i = 0; i < 8; i++) {
          final a = -math.pi / 2 + i * math.pi / 4;
          final p = c + Offset(math.cos(a), math.sin(a)) * (i.isEven ? r : r * 0.35);
          i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
        }
        canvas.drawPath(path..close(), fill);
      case CoverMotif.rings:
        canvas.drawCircle(c, r * 0.4, fill);
        canvas.drawOval(Rect.fromCenter(center: c, width: r * 2, height: r * 0.7), line);
      case CoverMotif.vines:
        canvas.save();
        canvas.translate(c.dx, c.dy);
        canvas.rotate(-0.7);
        canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: r * 2, height: r * 0.9), fill);
        canvas.restore();
      case CoverMotif.sunburst:
        for (var i = 0; i <= 4; i++) {
          final a = math.pi + math.pi * i / 4;
          final foot = c + Offset(0, r * 0.6);
          canvas.drawLine(foot, foot + Offset(math.cos(a), math.sin(a)) * r * 1.3, line);
        }
      case CoverMotif.waves:
        for (var row = 0; row < 2; row++) {
          final y = c.dy - r * 0.3 + row * r * 0.7;
          final path = Path()..moveTo(c.dx - r, y);
          path.quadraticBezierTo(c.dx - r / 2, y - r * 0.45, c.dx, y);
          path.quadraticBezierTo(c.dx + r / 2, y + r * 0.45, c.dx + r, y);
          canvas.drawPath(path, line);
        }
      case CoverMotif.shapes:
        canvas.drawCircle(c, r * 0.8, line);
        canvas.drawCircle(c, r * 0.3, fill);
      case CoverMotif.crescent:
        canvas.drawPath(
          Path.combine(
            PathOperation.difference,
            Path()..addOval(Rect.fromCircle(center: c, radius: r * 0.85)),
            Path()..addOval(Rect.fromCircle(center: c + Offset(r * 0.4, -r * 0.15), radius: r * 0.75)),
          ),
          fill,
        );
    }
  }

  @override
  bool shouldRepaint(SpineEmblemPainter old) => old.motif != motif || old.ink != ink;
}
