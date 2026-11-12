import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../shared/domain/characters/cast.dart' show fieldNamed;
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/records/entry.dart';

/// How a character's cameo is drawn, from what is recorded of them. Nothing is guessed: what is not recorded is drawn
/// plainly.
enum CameoHair { short, shoulder, long }

typedef CameoLook = ({CameoHair hair, bool silver, bool pointedEars, bool gone, int seed});

/// From the profile: **Gender** sets the hair (a woman's falls long, a man's is cut short, anything else or nothing at
/// the shoulder); an **Age** of sixty or more, or one written as old or elderly, turns it silver; a **Species** of elf
/// or fae gives pointed ears; a **status** of dead, deceased or late shows them in grey. A small seed from the id
/// keeps two alike from being the same.
CameoLook cameoLookOf(Entry entry, CharacterProfile? profile) {
  final gender = fieldNamed(entry, 'Gender').toLowerCase();
  final age = fieldNamed(entry, 'Age').toLowerCase();
  final species = fieldNamed(entry, 'Species').toLowerCase();
  final status = (profile?.status ?? '').toLowerCase();
  bool word(String text, List<String> words) => words.any((w) => RegExp('\\b$w\\b').hasMatch(text));
  final hair = word(gender, ['female', 'woman', 'girl', 'lady', 'she', 'f'])
      ? CameoHair.long
      : word(gender, ['male', 'man', 'boy', 'he', 'm'])
      ? CameoHair.short
      : CameoHair.shoulder;
  final years = int.tryParse(RegExp(r'\d+').firstMatch(age)?[0] ?? '');
  final silver = (years != null && years >= 60) || word(age, ['old', 'elderly', 'aged', 'ancient', 'venerable']);
  final ears = word(species, ['elf', 'elves', 'elven', 'fae', 'faerie', 'fairy', 'sidhe']);
  final gone = word(status, ['dead', 'deceased', 'late', 'killed', 'fallen', 'departed']);
  var seed = 0;
  for (final c in entry.id.codeUnits) {
    seed = (seed * 31 + c) & 0x7fffffff;
  }
  return (hair: hair, silver: silver, pointedEars: ears, gone: gone, seed: seed);
}

/// A CAMEO: a character with no picture drawn as an old silhouette portrait, a bust in an oval on their own colour,
/// with the look [cameoLookOf] reads from their profile. [ground] is the two colours of the ground (light to dark),
/// [ink] the silhouette's.
class Cameo extends StatelessWidget {
  const Cameo({super.key, required this.look, required this.ground, required this.ink, this.frame, this.bare = false});

  final CameoLook look;
  final List<Color> ground;
  final Color ink;

  /// The ring round the oval; the ink's, faint, when not given.
  final Color? frame;

  /// The oval alone, filling the space, with nothing round it: for standing in a group (`cast_photo.dart`).
  final bool bare;

  @override
  Widget build(BuildContext context) {
    final picture = CustomPaint(
      painter: _CameoPainter(
        look: look,
        ground: ground,
        ink: ink,
        frame: frame ?? ink.withValues(alpha: 0.5),
        bare: bare,
      ),
      child: const SizedBox.expand(),
    );
    if (!look.gone) return picture;
    // The departed in grey, as in an old album.
    return ColorFiltered(
      colorFilter: const ColorFilter.matrix([
        0.33, 0.59, 0.11, 0, 0, //
        0.33, 0.59, 0.11, 0, 0, //
        0.33, 0.59, 0.11, 0, 0, //
        0, 0, 0, 1, 0,
      ]),
      child: picture,
    );
  }
}

class _CameoPainter extends CustomPainter {
  _CameoPainter({required this.look, required this.ground, required this.ink, required this.frame, this.bare = false});

  final CameoLook look;
  final List<Color> ground;
  final Color ink;
  final Color frame;
  final bool bare;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final rect = Offset.zero & size;
    if (!bare) {
      canvas.drawRect(
        rect,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: ground,
          ).createShader(rect),
      );
    }

    // The oval: a paler inlay of the ground, ringed; bare, the whole space, on the ground's own colours.
    final ow = bare ? w - 2 : w * 0.66;
    final oh = bare ? h - 2 : h * 0.82;
    final oval = Rect.fromCenter(center: Offset(w / 2, h / 2), width: ow, height: oh);
    if (bare) {
      canvas.drawOval(
        oval,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color.lerp(ground.first, ink, 0.1)!, ground.last],
          ).createShader(oval),
      );
    } else {
      canvas.drawOval(oval, Paint()..color = Color.lerp(ground.first, ink, 0.14)!);
    }
    canvas.save();
    canvas.clipPath(Path()..addOval(oval));

    final rnd = math.Random(look.seed);
    final cx = oval.center.dx;
    final top = oval.top;
    final shoulders = 0.40 + rnd.nextDouble() * 0.06; // half-width, as a share of the oval's width
    final headRx = ow * (0.16 + rnd.nextDouble() * 0.015);
    final headRy = oh * 0.19;
    final headCy = top + oh * 0.40;
    // Carved, as a cameo is: lit from the top left, a little shade below.
    final bust = Rect.fromLTRB(oval.left, top + oh * 0.2, oval.right, oval.bottom);
    final body = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [ink, Color.lerp(ink, ground.last, 0.16)!],
      ).createShader(bust);
    // The hair a shade into the ground, so it reads against the face; silver when they are old.
    final hairInk = look.silver ? const Color(0xFFCDD2D9) : Color.lerp(ink, ground.last, 0.34)!;
    final hair = Paint()..color = hairInk;
    final head = Rect.fromCenter(center: Offset(cx, headCy), width: headRx * 2, height: headRy * 2);
    final part = rnd.nextBool() ? 1.0 : -1.0;

    // Behind the head: hair that falls to the jaw, or long over the shoulders, flaring as it falls.
    if (look.hair != CameoHair.short) {
      final long = look.hair == CameoHair.long;
      final end = headCy + (long ? oh * 0.4 : headRy * 1.05);
      final flare = long ? 1.75 : 1.32;
      final back = Path()..moveTo(cx - headRx * 1.12, headCy - headRy * 0.2);
      back
        ..cubicTo(
          cx - headRx * 1.25,
          headCy + headRy * 0.6,
          cx - headRx * flare,
          end - oh * 0.08,
          cx - headRx * (flare - 0.1),
          end,
        )
        ..quadraticBezierTo(cx, end + oh * (long ? 0.03 : 0.015), cx + headRx * (flare - 0.1), end)
        ..cubicTo(
          cx + headRx * flare,
          end - oh * 0.08,
          cx + headRx * 1.25,
          headCy + headRy * 0.6,
          cx + headRx * 1.12,
          headCy - headRy * 0.2,
        )
        ..close();
      canvas.drawPath(back, hair);
    }

    // Shoulders and neck.
    final bottom = oval.bottom + 2;
    final neckTop = headCy + headRy * 0.7;
    final shoulder = Path()
      ..moveTo(cx - ow * shoulders, bottom)
      ..quadraticBezierTo(cx - ow * shoulders * 0.96, top + oh * 0.72, cx - ow * 0.13, top + oh * 0.67)
      ..lineTo(cx - ow * 0.075, neckTop)
      ..lineTo(cx + ow * 0.075, neckTop)
      ..lineTo(cx + ow * 0.13, top + oh * 0.67)
      ..quadraticBezierTo(cx + ow * shoulders * 0.96, top + oh * 0.72, cx + ow * shoulders, bottom)
      ..close();
    canvas.drawPath(shoulder, body);

    // Pointed ears, under the head's edge.
    if (look.pointedEars) {
      for (final side in [-1.0, 1.0]) {
        final ear = Path()
          ..moveTo(cx + side * headRx * 0.85, headCy - headRy * 0.05)
          ..lineTo(cx + side * headRx * 1.55, headCy - headRy * 0.55)
          ..lineTo(cx + side * headRx * 0.9, headCy + headRy * 0.25)
          ..close();
        canvas.drawPath(ear, body);
      }
    }

    // The head.
    canvas.drawOval(head, body);

    // Over the head: the crown, and a fringe swept from a parting to one side.
    final temple = headCy - headRy * (look.hair == CameoHair.short ? 0.25 : 0.05);
    final left = Offset(cx - headRx * 1.08, temple);
    final right = Offset(cx + headRx * 1.08, temple);
    final parting = Offset(cx + part * headRx * 0.35, headCy - headRy * 0.62);
    final crown = Path()
      ..moveTo(left.dx, left.dy)
      ..cubicTo(
        cx - headRx * 1.18,
        headCy - headRy * 1.5,
        cx + headRx * 1.18,
        headCy - headRy * 1.5,
        right.dx,
        right.dy,
      )
      // The fringe comes back from the far temple to the parting, then sweeps down across the brow.
      ..quadraticBezierTo(cx + part * headRx * 0.95, headCy - headRy * 0.55, parting.dx, parting.dy)
      ..quadraticBezierTo(cx - part * headRx * 0.55, headCy - headRy * 0.35, part > 0 ? left.dx : left.dx, left.dy)
      ..close();
    canvas.drawPath(crown, hair);
    canvas.restore();

    // The ring, and a finer one inside it.
    canvas.drawOval(
      oval,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(1.5, w * 0.012)
        ..color = frame,
    );
    canvas.drawOval(
      oval.deflate(w * 0.025),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..color = frame.withValues(alpha: frame.a * 0.6),
    );
  }

  @override
  bool shouldRepaint(_CameoPainter old) =>
      old.look != look || old.ink != ink || old.frame != frame || old.ground.first != ground.first || old.bare != bare;
}
