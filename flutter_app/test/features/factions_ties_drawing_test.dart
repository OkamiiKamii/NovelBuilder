import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/places/factions_page.dart';
import 'package:novel_builder/shared/domain/factions/ties.dart';

/// THE TIES AS THEY WERE DRAWN before 2026-11-09 (a separate line for every dash), kept as the reference the new
/// drawing must match. The styles are the page's (`_tieStyle`).
const _styles = {
  TieRole.ally: (color: 0xff6b7a2b, dash: <double>[]),
  TieRole.rival: (color: 0xffa8436b, dash: [6.0, 4.0]),
  TieRole.influence: (color: 0xff4f5fa3, dash: <double>[]),
  TieRole.territory: (color: 0xff8a8276, dash: [1.0, 4.0]),
  TieRole.other: (color: 0xffa3622b, dash: [4.0, 2.0, 1.0, 2.0]),
};

void _reference(Canvas canvas, List<({Offset from, Offset to, TieRole role})> lines) {
  for (final l in lines) {
    final style = _styles[l.role] ?? _styles[TieRole.other]!;
    final paint = Paint()
      ..color = Color(style.color)
      ..strokeWidth = l.role == TieRole.territory ? 2 : 3
      ..strokeCap = StrokeCap.round;
    final (a, b) = (l.from, l.to);
    final d = b - a;
    final len = d.distance;
    if (len == 0) continue;
    if (style.dash.isEmpty) {
      canvas.drawLine(a, b, paint);
    } else {
      var at = 0.0;
      var i = 0;
      final u = d / len;
      while (at < len) {
        final step = style.dash[i % style.dash.length];
        if (i.isEven) canvas.drawLine(a + u * at, a + u * math.min(at + step, len), paint);
        at += step;
        i++;
      }
    }
    if (l.role == TieRole.influence) {
      final u = d / len;
      final n = Offset(-u.dy, u.dx);
      final tip = b - u * 24;
      canvas.drawPath(
        Path()
          ..moveTo(tip.dx, tip.dy)
          ..lineTo(tip.dx - u.dx * 10 + n.dx * 5, tip.dy - u.dy * 10 + n.dy * 5)
          ..lineTo(tip.dx - u.dx * 10 - n.dx * 5, tip.dy - u.dy * 10 - n.dy * 5)
          ..close(),
        Paint()..color = Color(style.color),
      );
    }
  }
}

Future<Uint8List> _image(void Function(Canvas canvas) draw, int size) async {
  final recorder = ui.PictureRecorder();
  draw(Canvas(recorder));
  final image = await recorder.endRecording().toImage(size, size);
  final bytes = await image.toByteData();
  image.dispose();
  return bytes!.buffer.asUint8List();
}

void main() {
  testWidgets('ties drawn as one path per run look as they did drawn dash by dash', (tester) async {
    // Every kind of tie, at many angles and lengths, in runs of a kind and mixed, none crossing another.
    const size = 900;
    final lines = <({Offset from, Offset to, TieRole role})>[
      for (var i = 0; i < 40; i++)
        (
          from: Offset(40.0 + (i % 8) * 105, 40.0 + (i ~/ 8) * 170),
          to: Offset(
            40.0 + (i % 8) * 105 + 90 * math.cos(i * 0.7),
            40.0 + (i ~/ 8) * 170 + 140 * math.sin(i * 0.7).abs(),
          ),
          role: TieRole.values[(i ~/ 3) % TieRole.values.length],
        ),
    ];
    await tester.runAsync(() async {
      final before = await _image((c) => _reference(c, lines), size);
      final now = await _image((c) => TiesPainter(lines).paint(c, const Size(900, 900)), size);
      var differ = 0, inked = 0;
      for (var i = 0; i < before.length; i += 4) {
        if (before[i + 3] != 0) inked++;
        final d = [for (var k = 0; k < 3; k++) (before[i + k] - now[i + k]).abs()].reduce(math.max);
        // Anti-aliasing at a dash's ends may round a step apart; anything more is a different drawing.
        if (d > 24) differ++;
      }
      expect(inked, greaterThan(5000), reason: 'the drawing has ties in it');
      expect(differ / inked, lessThan(0.005), reason: '$differ of $inked inked pixels differ');
    });
  });
}
