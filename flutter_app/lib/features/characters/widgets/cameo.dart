import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../shared/domain/characters/cast.dart' show fieldNamed;
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/characters/likeness.dart';
import '../../../shared/domain/records/entry.dart';

/// How a character's cameo is drawn, from what is recorded of them. Nothing is guessed: what is not recorded is drawn
/// plainly.
enum CameoHair { short, shoulder, long }

typedef CameoLook = ({CameoHair hair, bool silver, bool pointedEars, bool gone, int seed, Likeness likeness});

/// From the profile: **Gender** sets the hair (a woman's falls long, a man's is cut short, anything else or nothing at
/// the shoulder), unless **Hair** says how it is worn; an **Age** of sixty or more, or one written as old or elderly,
/// turns it silver; a **Species** of elf or fae gives pointed ears; a **status** of dead, deceased or late shows them
/// in grey. And their likeness (`likeness.dart`): the colour of their hair, eyes and skin, curls, a beard, glasses, a
/// scar, a hood or a crown, as the Appearance fields say them. A small seed from the id keeps two alike from being the
/// same.
CameoLook cameoLookOf(Entry entry, CharacterProfile? profile) {
  final gender = fieldNamed(entry, 'Gender').toLowerCase();
  final age = fieldNamed(entry, 'Age').toLowerCase();
  final species = fieldNamed(entry, 'Species').toLowerCase();
  final status = (profile?.status ?? '').toLowerCase();
  bool word(String text, List<String> words) => words.any((w) => RegExp('\\b$w\\b').hasMatch(text));
  final likeness = likenessOf({for (final f in entry.fields) f.key.trim().toLowerCase(): f.value});
  final hair = switch (likeness.cut) {
    HairCut.long || HairCut.braid => CameoHair.long,
    HairCut.shoulder => CameoHair.shoulder,
    HairCut.short || HairCut.cropped || HairCut.bald => CameoHair.short,
    null =>
      word(gender, ['female', 'woman', 'girl', 'lady', 'she', 'f'])
          ? CameoHair.long
          : word(gender, ['male', 'man', 'boy', 'he', 'm'])
          ? CameoHair.short
          : CameoHair.shoulder,
  };
  final years = int.tryParse(RegExp(r'\d+').firstMatch(age)?[0] ?? '');
  final silver = (years != null && years >= 60) || word(age, ['old', 'elderly', 'aged', 'ancient', 'venerable']);
  final ears = word(species, ['elf', 'elves', 'elven', 'fae', 'faerie', 'fairy', 'sidhe']);
  final gone = word(status, ['dead', 'deceased', 'late', 'killed', 'fallen', 'departed']);
  var seed = 0;
  for (final c in entry.id.codeUnits) {
    seed = (seed * 31 + c) & 0x7fffffff;
  }
  return (hair: hair, silver: silver, pointedEars: ears, gone: gone, seed: seed, likeness: likeness);
}

/// The colours a likeness is painted in, by the family its words name.
const hairColours = <String, Color>{
  'black': Color(0xFF221D1B),
  'dark': Color(0xFF33261F),
  'brown': Color(0xFF5E3B22),
  'hazel': Color(0xFF6E4A26),
  'red': Color(0xFFA34528),
  'amber': Color(0xFFC08A35),
  'blond': Color(0xFFD9B46C),
  'grey': Color(0xFF8E9197),
  'silver': Color(0xFFC6CBD2),
  'white': Color(0xFFEAE8E2),
  'pale': Color(0xFFE2D7BE),
  'blue': Color(0xFF3F5FA6),
  'green': Color(0xFF3F7A4F),
  'violet': Color(0xFF7A4FA0),
};

const eyeColours = <String, Color>{
  'brown': Color(0xFF6B4226),
  'dark': Color(0xFF3A2A20),
  'black': Color(0xFF221D1B),
  'hazel': Color(0xFF8C6B2D),
  'amber': Color(0xFFC98B26),
  'blond': Color(0xFFC9A04A),
  'blue': Color(0xFF3D7BC8),
  'green': Color(0xFF3D8A57),
  'grey': Color(0xFF7D8896),
  'silver': Color(0xFFAEB7C2),
  'white': Color(0xFFD8DDE3),
  'pale': Color(0xFF9DB3C8),
  'red': Color(0xFFB0352B),
  'violet': Color(0xFF7D55B3),
};

const skinColours = <SkinTone, Color>{
  SkinTone.fair: Color(0xFFF1D7C6),
  SkinTone.light: Color(0xFFE6BD9E),
  SkinTone.olive: Color(0xFFC79A6C),
  SkinTone.brown: Color(0xFF99633F),
  SkinTone.deep: Color(0xFF5C3925),
};

/// A creature's skin, by its colour's family.
const creatureSkins = <String, Color>{
  'green': Color(0xFF8DB07A),
  'blue': Color(0xFF8FA8D2),
  'grey': Color(0xFFA6ABB2),
  'silver': Color(0xFFC6CBD1),
  'violet': Color(0xFFA990C6),
  'amber': Color(0xFFD7AE6D),
  'blond': Color(0xFFE3C68E),
  'hazel': Color(0xFFB08A55),
  'white': Color(0xFFECEAE4),
  'red': Color(0xFFC8765C),
  'black': Color(0xFF3B3836),
  'pale': Color(0xFFE6DCCB),
};

/// A CAMEO: a character with no picture drawn as an old silhouette portrait, a bust in an oval on their own colour,
/// with the look [cameoLookOf] reads from their profile. [ground] is the two colours of the ground (light to dark),
/// [ink] the silhouette's.
///
/// PAINTED, when the profile describes them: the bust is still carved, but the hair is in its colour and cut (curled,
/// braided, cropped, or none), the face has eyes of their colour, brows and a mouth, the skin its tone when it is
/// written, and what they wear on their face or head (a beard, glasses, a scar, an eyepatch, freckles, a hood, a
/// crown). Whatever is not written stays the carving's ivory.
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
    final l = look.likeness;
    final paintedFace = painted(l);
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
    final build = l.broad ? 0.05 : (l.slight ? -0.045 : 0.0);
    final shoulders = 0.40 + rnd.nextDouble() * 0.06 + build; // half-width, as a share of the oval's width
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
    // The skin, when it is written: the face, the neck and the ears in it, lit the same way.
    final skinColour = l.skin != null
        ? skinColours[l.skin]
        : (l.skinFamily == null ? null : creatureSkins[l.skinFamily]);
    final head = Rect.fromCenter(center: Offset(cx, headCy), width: headRx * 2, height: headRy * 2);
    final face = skinColour == null
        ? body
        : (Paint()
            ..shader = RadialGradient(
              center: const Alignment(-0.35, -0.4),
              radius: 1.1,
              colors: [Color.lerp(skinColour, Colors.white, 0.12)!, Color.lerp(skinColour, Colors.black, 0.18)!],
            ).createShader(head.inflate(headRx * 0.3)));
    // The hair: its colour when written; silver when they are old; else a shade into the ground, against the face.
    final hairInk =
        hairColours[l.hair] ?? (look.silver ? const Color(0xFFCDD2D9) : Color.lerp(ink, ground.last, 0.34)!);
    final hair = Paint()..color = hairInk;
    final hairShine = Paint()..color = Color.lerp(hairInk, Colors.white, 0.22)!;
    final part = rnd.nextBool() ? 1.0 : -1.0;
    final bald = l.cut == HairCut.bald;
    final cropped = l.cut == HairCut.cropped;
    // What is worn over the head: a hood, the cloth a shade into the ground.
    final cloth = Paint()..color = Color.lerp(ink, ground.last, 0.62)!;

    // A hood: behind the head, falling to the shoulders.
    if (l.hood) {
      final hood = Path()
        ..moveTo(cx - headRx * 1.75, top + oh * 0.78)
        ..cubicTo(
          cx - headRx * 1.9,
          headCy - headRy * 0.6,
          cx - headRx * 1.25,
          headCy - headRy * 1.75,
          cx,
          headCy - headRy * 1.72,
        )
        ..cubicTo(
          cx + headRx * 1.25,
          headCy - headRy * 1.75,
          cx + headRx * 1.9,
          headCy - headRy * 0.6,
          cx + headRx * 1.75,
          top + oh * 0.78,
        )
        ..close();
      canvas.drawPath(hood, cloth);
    }

    // Behind the head: hair that falls to the jaw, or long over the shoulders, flaring as it falls.
    if (!bald && !cropped && !l.hood && look.hair != CameoHair.short) {
      final long = look.hair == CameoHair.long && l.cut != HairCut.braid;
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
      if (l.curly) {
        // Curls along the fall of it.
        for (var i = 0; i <= 6; i++) {
          final t = i / 6;
          final y = headCy - headRy * 0.1 + (end - headCy) * t;
          final spread = headRx * (1.15 + (flare - 1.15) * t);
          for (final side in [-1.0, 1.0]) {
            canvas.drawCircle(Offset(cx + side * spread, y), headRx * 0.24, hair);
          }
        }
      }
    }

    // Shoulders and neck: the neck in the skin, when it is written.
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
    if (skinColour != null) {
      final neck = Path()
        ..moveTo(cx - ow * 0.075, neckTop)
        ..lineTo(cx + ow * 0.075, neckTop)
        ..lineTo(cx + ow * 0.095, top + oh * 0.68)
        ..quadraticBezierTo(cx, top + oh * 0.73, cx - ow * 0.095, top + oh * 0.68)
        ..close();
      canvas.drawPath(neck, face);
    }

    // Pointed ears, under the head's edge.
    if (look.pointedEars) {
      for (final side in [-1.0, 1.0]) {
        final ear = Path()
          ..moveTo(cx + side * headRx * 0.85, headCy - headRy * 0.05)
          ..lineTo(cx + side * headRx * 1.55, headCy - headRy * 0.55)
          ..lineTo(cx + side * headRx * 0.9, headCy + headRy * 0.25)
          ..close();
        canvas.drawPath(ear, face);
      }
    }

    // The head.
    canvas.drawOval(head, face);

    // A braid over one shoulder.
    if (l.cut == HairCut.braid && !l.hood) {
      final side = -part;
      var y = headCy + headRy * 0.35;
      for (var i = 0; i < 6; i++) {
        final x = cx + side * (headRx * 1.0 + i * headRx * 0.06);
        canvas.drawOval(Rect.fromCenter(center: Offset(x, y), width: headRx * 0.42, height: headRy * 0.34), hair);
        canvas.drawOval(
          Rect.fromCenter(
            center: Offset(x - headRx * 0.06, y - headRy * 0.05),
            width: headRx * 0.16,
            height: headRy * 0.1,
          ),
          hairShine,
        );
        y += headRy * 0.3;
      }
    }

    // The face, when there is something to paint: eyes of their colour (or the carving's shade), brows in the hair's,
    // a line of a nose, a mouth.
    final shade = skinColour == null ? Color.lerp(ink, ground.last, 0.6)! : Color.lerp(skinColour, Colors.black, 0.55)!;
    final eyeY = headCy + headRy * 0.02;
    final eyeDx = headRx * 0.42;
    final eyeW = headRx * 0.34;
    final eyeH = headRy * 0.13;
    if (paintedFace) {
      final iris = eyeColours[l.eyes] ?? shade;
      for (final side in [-1.0, 1.0]) {
        final at = Offset(cx + side * eyeDx, eyeY);
        if (l.eyepatch && side == part) continue;
        canvas.drawOval(
          Rect.fromCenter(center: at, width: eyeW, height: eyeH),
          Paint()..color = Color.lerp(skinColour ?? ink, Colors.white, 0.7)!,
        );
        canvas.drawCircle(at, eyeH * 0.48, Paint()..color = iris);
        canvas.drawCircle(at, eyeH * 0.2, Paint()..color = const Color(0xFF15110E));
        canvas.drawCircle(at.translate(-eyeH * 0.12, -eyeH * 0.14), eyeH * 0.09, Paint()..color = Colors.white);
        // The brow.
        canvas.drawPath(
          Path()
            ..moveTo(at.dx - eyeW * 0.6, at.dy - eyeH * 1.25)
            ..quadraticBezierTo(at.dx, at.dy - eyeH * 1.9, at.dx + eyeW * 0.6, at.dy - eyeH * 1.3),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = math.max(0.8, headRy * 0.06)
            ..strokeCap = StrokeCap.round
            ..color = l.hair != null && !bald ? hairInk : shade,
        );
      }
      final line = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(0.6, headRy * 0.035)
        ..strokeCap = StrokeCap.round
        ..color = shade.withValues(alpha: 0.7);
      // The nose, a stroke and its foot; the mouth.
      canvas.drawPath(
        Path()
          ..moveTo(cx + part * headRx * 0.04, eyeY + eyeH * 0.6)
          ..quadraticBezierTo(
            cx - part * headRx * 0.1,
            headCy + headRy * 0.32,
            cx + part * headRx * 0.06,
            headCy + headRy * 0.36,
          ),
        line,
      );
      canvas.drawPath(
        Path()
          ..moveTo(cx - headRx * 0.22, headCy + headRy * 0.56)
          ..quadraticBezierTo(cx, headCy + headRy * 0.64, cx + headRx * 0.22, headCy + headRy * 0.56),
        line
          ..color = Color.lerp(shade, const Color(0xFF9C3B33), skinColour == null ? 0 : 0.45)!.withValues(alpha: 0.85),
      );
      if (l.freckles) {
        final dot = Paint()..color = Color.lerp(skinColour ?? ink, const Color(0xFF7A4A2A), 0.5)!;
        final r = math.Random(look.seed + 7);
        for (final side in [-1.0, 1.0]) {
          for (var i = 0; i < 5; i++) {
            canvas.drawCircle(
              Offset(
                cx + side * (headRx * 0.32 + r.nextDouble() * headRx * 0.3),
                headCy + headRy * (0.2 + r.nextDouble() * 0.18),
              ),
              math.max(0.5, headRx * 0.035),
              dot,
            );
          }
        }
      }
    }

    // A beard along the jaw; a moustache over the mouth.
    if (l.beard) {
      final beard = Path()
        ..moveTo(cx - headRx * 0.98, headCy + headRy * 0.05)
        ..quadraticBezierTo(cx - headRx * 0.95, headCy + headRy * 1.15, cx, headCy + headRy * 1.28)
        ..quadraticBezierTo(cx + headRx * 0.95, headCy + headRy * 1.15, cx + headRx * 0.98, headCy + headRy * 0.05)
        ..quadraticBezierTo(cx + headRx * 0.7, headCy + headRy * 0.6, cx + headRx * 0.32, headCy + headRy * 0.66)
        ..quadraticBezierTo(cx, headCy + headRy * 0.78, cx - headRx * 0.32, headCy + headRy * 0.66)
        ..quadraticBezierTo(cx - headRx * 0.7, headCy + headRy * 0.6, cx - headRx * 0.98, headCy + headRy * 0.05)
        ..close();
      canvas.drawPath(beard, hair);
    }
    if (l.moustache || l.beard) {
      final m = Path()
        ..moveTo(cx - headRx * 0.36, headCy + headRy * 0.55)
        ..quadraticBezierTo(cx - headRx * 0.1, headCy + headRy * 0.36, cx, headCy + headRy * 0.44)
        ..quadraticBezierTo(cx + headRx * 0.1, headCy + headRy * 0.36, cx + headRx * 0.36, headCy + headRy * 0.55)
        ..quadraticBezierTo(cx, headCy + headRy * 0.5, cx - headRx * 0.36, headCy + headRy * 0.55)
        ..close();
      canvas.drawPath(m, hair);
    }

    // Over the head: the crown of the hair, and a fringe swept from a parting to one side (none when bald; close
    // to the head when cropped; under the hood, only the fringe).
    if (!bald) {
      final temple = headCy - headRy * (look.hair == CameoHair.short ? 0.25 : 0.05) - (cropped ? headRy * 0.12 : 0);
      final lift = cropped ? 1.28 : 1.5;
      final left = Offset(cx - headRx * (cropped ? 1.02 : 1.08), temple);
      final right = Offset(cx + headRx * (cropped ? 1.02 : 1.08), temple);
      final parting = Offset(cx + part * headRx * 0.35, headCy - headRy * (cropped ? 0.75 : 0.62));
      final crown = Path()
        ..moveTo(left.dx, left.dy)
        ..cubicTo(
          cx - headRx * 1.18,
          headCy - headRy * lift,
          cx + headRx * 1.18,
          headCy - headRy * lift,
          right.dx,
          right.dy,
        )
        // The fringe comes back from the far temple to the parting, then sweeps down across the brow.
        ..quadraticBezierTo(cx + part * headRx * 0.95, headCy - headRy * 0.55, parting.dx, parting.dy)
        ..quadraticBezierTo(cx - part * headRx * 0.55, headCy - headRy * 0.35, left.dx, left.dy)
        ..close();
      canvas.drawPath(crown, hair);
      if (l.curly && !l.hood) {
        // Curls round the crown.
        for (var i = 0; i <= 8; i++) {
          final a = math.pi * (1.08 + 0.84 * i / 8);
          canvas.drawCircle(
            Offset(cx + math.cos(a) * headRx * 1.0, headCy + math.sin(a) * headRy * 1.0 - headRy * 0.05),
            headRx * 0.22,
            hair,
          );
        }
      } else if (l.hair != null) {
        // A light along the hair, as on a painted miniature.
        canvas.drawPath(
          Path()
            ..moveTo(cx - headRx * 0.7, headCy - headRy * 0.85)
            ..quadraticBezierTo(cx - headRx * 0.2, headCy - headRy * 1.12, cx + headRx * 0.3, headCy - headRy * 0.98),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = math.max(0.8, headRy * 0.07)
            ..strokeCap = StrokeCap.round
            ..color = hairShine.color.withValues(alpha: 0.7),
        );
      }
    }

    // The hood's rim over the brow.
    if (l.hood) {
      canvas.drawPath(
        Path()
          ..moveTo(cx - headRx * 1.25, headCy + headRy * 0.2)
          ..quadraticBezierTo(cx - headRx * 1.3, headCy - headRy * 1.45, cx, headCy - headRy * 1.38)
          ..quadraticBezierTo(cx + headRx * 1.3, headCy - headRy * 1.45, cx + headRx * 1.25, headCy + headRy * 0.2)
          ..lineTo(cx + headRx * 1.05, headCy + headRy * 0.2)
          ..quadraticBezierTo(cx + headRx * 1.1, headCy - headRy * 1.12, cx, headCy - headRy * 1.1)
          ..quadraticBezierTo(cx - headRx * 1.1, headCy - headRy * 1.12, cx - headRx * 1.05, headCy + headRy * 0.2)
          ..close(),
        cloth,
      );
    }

    // Glasses: two rims and a bridge.
    if (l.glasses) {
      final rim = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(0.8, headRy * 0.05)
        ..color = const Color(0xFF2A2420);
      for (final side in [-1.0, 1.0]) {
        canvas.drawCircle(Offset(cx + side * eyeDx, eyeY), eyeW * 0.62, rim);
      }
      canvas.drawLine(Offset(cx - eyeDx + eyeW * 0.62, eyeY), Offset(cx + eyeDx - eyeW * 0.62, eyeY), rim);
    }

    // An eyepatch, over the eye on the parting's side, and its strap.
    if (l.eyepatch) {
      final at = Offset(cx + part * eyeDx, eyeY);
      final dark = Paint()..color = const Color(0xFF1E1A17);
      canvas.drawLine(
        Offset(cx - part * headRx * 1.0, eyeY - headRy * 0.55),
        Offset(cx + part * headRx * 1.0, eyeY + headRy * 0.15),
        dark
          ..strokeWidth = math.max(0.8, headRy * 0.05)
          ..style = PaintingStyle.stroke,
      );
      canvas.drawOval(
        Rect.fromCenter(center: at, width: eyeW * 1.15, height: eyeH * 2.3),
        Paint()..color = const Color(0xFF1E1A17),
      );
    }

    // A scar across the eye away from the parting.
    if (l.scar) {
      final at = Offset(cx - part * eyeDx, eyeY);
      canvas.drawLine(
        at.translate(-part * eyeW * 0.2, -eyeH * 2.4),
        at.translate(part * eyeW * 0.35, eyeH * 2.6),
        Paint()
          ..strokeWidth = math.max(0.8, headRy * 0.045)
          ..strokeCap = StrokeCap.round
          ..color = const Color(0xFFB4473F).withValues(alpha: 0.85),
      );
    }

    // A crown on the head, gold.
    if (l.crown) {
      final gold = Paint()..color = const Color(0xFFE2B84A);
      final y = headCy - headRy * (l.hood ? 1.32 : 1.02);
      final band = Rect.fromCenter(center: Offset(cx, y), width: headRx * 1.5, height: headRy * 0.16);
      final points = Path()..moveTo(band.left, band.top);
      for (var i = 0; i < 5; i++) {
        final x0 = band.left + band.width * i / 4;
        if (i > 0) points.lineTo(x0 - band.width / 8, band.top);
        points.lineTo(x0, band.top - headRy * (i.isEven ? 0.32 : 0.22));
      }
      points
        ..lineTo(band.right, band.top)
        ..close();
      canvas.drawPath(points, gold);
      canvas.drawRect(band, gold);
      canvas.drawCircle(Offset(cx, band.center.dy), headRy * 0.05, Paint()..color = const Color(0xFFB0302A));
    }
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
