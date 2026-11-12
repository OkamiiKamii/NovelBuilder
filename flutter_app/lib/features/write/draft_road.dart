import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/milestones.dart';
import '../characters/widgets/vault.dart';
import 'goal_pledge.dart' show pagesOf;
import 'write_providers.dart';

/// THE ROAD TO THE DRAFT, in the contents: the manuscript's length as a road from its first words to its target, the
/// lengths fiction is measured by along it (the first thousand, a short story, a novelette, a novella, the whole
/// draft) as marks, those passed inked in; the ink run as far as the words have come, with a nib where it stops; and
/// the next mark named, with how far to it. It reads the counts and changes nothing.
class DraftRoad extends ConsumerWidget {
  const DraftRoad({super.key, required this.novelId});
  final String novelId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final words = math.max(0, ref.watch(outlineProvider).fold(0, (a, n) => a + n.wordCount));
    final target = ref.read(novelStoreProvider).novel(novelId)?.targetWordCount;
    final road = milestonesFor(target);
    final at = whereOnRoad(words, road);
    final scheme = Theme.of(context).colorScheme;
    final muted = vaultText(context, size: 15, color: scheme.onSurfaceVariant);
    final next = at.next;
    final ahead = next == null
        ? 'The whole draft is written. ${formatNumber(words)} words.'
        : '${plural(next.words - words, 'word')} to ${next.name}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Semantics(
        container: true,
        label:
            'The road to the draft: ${formatNumber(words)} of ${formatNumber(road.last.words)} words. '
            '${at.passed == null ? '' : 'Passed ${at.passed!.name}. '}$ahead.',
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // The name and the count on one line where they fit, the count under the name where they do not
                // (a narrow column, a large text size, a very long count).
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.end,
                  spacing: 8,
                  children: [
                    Text(
                      'THE ROAD TO THE DRAFT',
                      style: vaultHeading(context, size: 11.5, color: scheme.primary, weight: 700),
                    ),
                    Text(
                      '${formatNumber(words)} of ${formatNumber(road.last.words)}',
                      style: vaultText(context, size: 14, color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                SizedBox(
                  height: 48,
                  child: CustomPaint(
                    painter: _Road(
                      words: words,
                      road: road,
                      ink: scheme.primary,
                      track: scheme.outlineVariant,
                      label: Theme.of(context).textTheme.labelSmall!.copyWith(color: scheme.onSurfaceVariant),
                      reached: Theme.of(
                        context,
                      ).textTheme.labelSmall!.copyWith(color: scheme.primary, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                Text(next == null ? ahead : '$ahead · ${pagesOf(next.words - words).toLowerCase()}', style: muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Road extends CustomPainter {
  _Road({
    required this.words,
    required this.road,
    required this.ink,
    required this.track,
    required this.label,
    required this.reached,
  });

  final int words;
  final List<Milestone> road;
  final Color ink;
  final Color track;
  final TextStyle label;
  final TextStyle reached;

  @override
  void paint(Canvas canvas, Size size) {
    const y = 16.0;
    const left = 6.0;
    final right = size.width - 10;
    final span = right - left;
    final end = road.last.words;
    double xOf(int w) => left + span * roadPosition(w, end);

    // The road ahead, dashed; the way come, inked.
    final dash = Paint()
      ..color = track
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    for (var x = left; x < right; x += 7) {
      canvas.drawLine(Offset(x, y), Offset(math.min(x + 3.5, right), y), dash);
    }
    final here = xOf(words);
    if (words > 0) {
      canvas.drawLine(
        const Offset(left, y),
        Offset(here, y),
        Paint()
          ..color = ink
          ..strokeWidth = 3.5
          ..strokeCap = StrokeCap.round,
      );
    }

    // The marks, as diamonds: inked once passed. Their lengths under them, kept from running into each other.
    var lastLabelEnd = -double.infinity;
    for (final (i, m) in road.indexed) {
      final x = xOf(m.words);
      final passed = words >= m.words;
      final r = i == road.length - 1 ? 6.0 : 4.5;
      final diamond = Path()
        ..moveTo(x, y - r)
        ..lineTo(x + r, y)
        ..lineTo(x, y + r)
        ..lineTo(x - r, y)
        ..close();
      canvas.drawPath(diamond, Paint()..color = passed ? ink : const Color(0x00000000));
      canvas.drawPath(
        diamond,
        Paint()
          ..color = passed ? ink : track
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
      final tp = TextPainter(
        text: TextSpan(text: m.short, style: passed ? reached : label),
        textDirection: TextDirection.ltr,
      )..layout();
      final lx = (x - tp.width / 2).clamp(0.0, size.width - tp.width);
      if (lx > lastLabelEnd + 4) {
        tp.paint(canvas, Offset(lx, y + 10));
        lastLabelEnd = lx + tp.width;
      }
    }

    // The nib where the writing has reached.
    if (words > 0) {
      final nib = Path()
        ..moveTo(here, y + 1)
        ..lineTo(here - 5, y - 10)
        ..quadraticBezierTo(here, y - 15, here + 5, y - 10)
        ..close();
      canvas.drawPath(nib, Paint()..color = ink);
      canvas.drawCircle(Offset(here, y - 8), 1.3, Paint()..color = const Color(0xFF14161F));
    }
  }

  @override
  bool shouldRepaint(_Road old) =>
      old.words != words || old.road != road || old.ink != ink || old.track != track || old.label != label;
}
