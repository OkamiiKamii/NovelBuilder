import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../characters/widgets/vault.dart';

/// One check the review ran, said as on a certificate: its name, what it looks at, and (for the manuscript) how much it
/// read.
typedef CheckLine = ({String label, String what, String? extra});

/// IN GOOD ORDER: when no check has raised anything, Review shows a certificate in place of an empty list under a wall
/// of filters: a seal, "In good order", what was looked at (so many chapters and scenes, characters, entries, events),
/// and each check with a tick and what it looks at. It says plainly that it judges only from what is recorded and has
/// changed nothing.
class AllClear extends StatelessWidget {
  const AllClear({super.key, required this.looked, required this.checks});

  /// What the checks read: "4 chapters and scenes", "2 characters"…
  final List<String> looked;
  final List<CheckLine> checks;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final faint = scheme.onSurfaceVariant;
    return VaultFrame(
      padding: const EdgeInsets.fromLTRB(24, 28, 24, 22),
      child: Column(
        children: [
          const ExcludeSemantics(child: _Seal()),
          const SizedBox(height: 14),
          Semantics(
            header: true,
            child: Text(
              'In good order',
              textAlign: TextAlign.center,
              style: vaultHeading(context, size: 22, weight: 700),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            looked.isEmpty
                ? 'Nothing is recorded yet for the checks to compare.'
                : 'Every check read ${_list(looked)}, and none found anything to look at.',
            textAlign: TextAlign.center,
            style: vaultText(context, size: 17, style: FontStyle.italic),
          ),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 32), child: VaultRule()),
          for (final c in checks)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 1),
                    child: Icon(Icons.check_circle_outline, size: 20, color: scheme.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.label, style: vaultHeading(context, size: 12.5, weight: 700, color: scheme.onSurface)),
                        Text(
                          c.extra == null ? _sentence(c.what) : '${_sentence(c.what)} ${c.extra}',
                          style: vaultText(context, size: 15.5, color: faint),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 10),
          Text(
            'Judged only from what is recorded; nothing was changed. As records grow, this page lists anything that '
            'disagrees.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: faint),
          ),
        ],
      ),
    );
  }

  static String _sentence(String what) => '${what[0].toUpperCase()}${what.substring(1)}.';

  static String _list(List<String> items) => switch (items.length) {
    1 => items.first,
    2 => '${items.first} and ${items.last}',
    _ => '${items.sublist(0, items.length - 1).join(', ')} and ${items.last}',
  };
}

/// A wax seal in the accent: a scalloped disc, a ring pressed into it, and a tick.
class _Seal extends StatelessWidget {
  const _Seal();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: 84,
      height: 84,
      child: CustomPaint(
        painter: _SealPainter(wax: scheme.primary, pressed: scheme.onPrimary.withValues(alpha: 0.55)),
        child: Center(child: Icon(Icons.check, size: 38, color: scheme.onPrimary)),
      ),
    );
  }
}

class _SealPainter extends CustomPainter {
  _SealPainter({required this.wax, required this.pressed});
  final Color wax;
  final Color pressed;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2;
    final edge = Path();
    const bumps = 18;
    for (var i = 0; i <= bumps * 8; i++) {
      final a = i / (bumps * 8) * 2 * math.pi;
      final rr = r * (0.92 + 0.08 * math.cos(a * bumps));
      final p = c + Offset(math.cos(a), math.sin(a)) * rr;
      i == 0 ? edge.moveTo(p.dx, p.dy) : edge.lineTo(p.dx, p.dy);
    }
    edge.close();
    canvas.drawPath(edge, Paint()..color = wax);
    canvas.drawCircle(
      c,
      r * 0.68,
      Paint()
        ..color = pressed
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
  }

  @override
  bool shouldRepaint(_SealPainter old) => old.wax != wax || old.pressed != pressed;
}
