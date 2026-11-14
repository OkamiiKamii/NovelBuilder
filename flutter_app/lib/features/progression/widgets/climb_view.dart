import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/systems/climb.dart';
import '../../characters/widgets/vault.dart';

/// THE CLIMB, on Systems (`climb.dart` works it out): for a character whose sheet has experience logged, their level
/// chapter by chapter as a line that steps up where they rise, carried on dashed at the pace so far, with the cap ruled
/// across the top; and what it says ("At this pace (350 XP a chapter), Level 14 by the end of chapter 30…"). A row of
/// names when more than one has climbed. Nothing to show with no experience logged. It only reads.
class ClimbView extends StatefulWidget {
  const ClimbView({super.key, required this.model, required this.system});

  final StoryModel model;
  final SystemBlueprint system;

  @override
  State<ClimbView> createState() => _ClimbViewState();
}

class _ClimbViewState extends State<ClimbView> {
  String? _sheetId;

  @override
  Widget build(BuildContext context) {
    final model = widget.model;
    final chapters = model.order.chapters.length;
    final chapterOf = model.order.chapterNumber;
    final climbing = [
      for (final s in model.sheets)
        if (s.systemId == widget.system.id && model.entries.containsKey(s.entryId))
          (
            sheet: s,
            name: model.entries[s.entryId]!.name.trim(),
            climbs: climbsOf(
              widget.system,
              s,
              chapterOf: chapterOf,
              chapters: chapters,
              who: model.entries[s.entryId]!.name.trim(),
            ),
          ),
    ].where((c) => c.climbs.isNotEmpty).toList();
    if (climbing.isEmpty) return const SizedBox.shrink();
    final shown = climbing.where((c) => c.sheet.id == _sheetId).firstOrNull ?? climbing.first;
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.trending_up, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    'THE CLIMB',
                    style: vaultHeading(
                      context,
                      size: 11,
                      color: scheme.primary,
                      weight: 700,
                    ).copyWith(letterSpacing: 2),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'How fast ${shown.name.isEmpty ? 'they' : shown.name} rises, chapter by chapter, and where the pace leads.',
            style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
          if (climbing.length > 1) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final c in climbing)
                  ChoiceChip(
                    label: Text(c.name),
                    selected: c.sheet.id == shown.sheet.id,
                    onSelected: (_) => setState(() => _sheetId = c.sheet.id),
                  ),
              ],
            ),
          ],
          for (final climb in shown.climbs) ...[
            const SizedBox(height: 10),
            Semantics(
              label:
                  '${climb.track} by chapter: '
                  '${[for (final p in climb.actual) 'chapter ${p.$1}, ${p.$2}'].join('; ')}',
              excludeSemantics: true,
              child: SizedBox(
                height: 160,
                child: CustomPaint(
                  painter: _ClimbPainter(
                    climb: climb,
                    line: scheme.primary,
                    grid: scheme.outlineVariant,
                    ink: scheme.onSurfaceVariant,
                    cap: scheme.error,
                    face: vaultText(context).fontFamily,
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
            const SizedBox(height: 8),
            for (final s in climb.says)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 6, right: 8),
                      child: Icon(Icons.circle, size: 6, color: scheme.primary),
                    ),
                    Expanded(
                      child: Text(s, style: vaultText(context, size: 15, color: scheme.onSurface)),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// The climb drawn: chapters across, levels up; the steps taken solid, the pace dashed, the cap ruled when it is near.
class _ClimbPainter extends CustomPainter {
  _ClimbPainter({
    required this.climb,
    required this.line,
    required this.grid,
    required this.ink,
    required this.cap,
    this.face,
  });

  /// The labels' type: the book's own.
  final String? face;

  final Climb climb;
  final Color line;
  final Color grid;
  final Color ink;
  final Color cap;

  @override
  void paint(Canvas canvas, Size size) {
    const left = 30.0;
    const bottom = 18.0;
    final all = [...climb.actual, ...climb.projected];
    final maxChapter = math.max(1, all.last.$1);
    final minLevel = climb.actual.first.$2;
    var maxLevel = all.fold(minLevel, (n, p) => math.max(n, p.$2));
    if (maxLevel == minLevel) maxLevel = minLevel + 1;
    final w = size.width - left - 4;
    final h = size.height - bottom - 6;
    Offset at(int chapter, num level) =>
        Offset(left + w * chapter / maxChapter, 6 + h * (1 - (level - minLevel) / (maxLevel - minLevel)));

    final text = TextStyle(fontSize: 10, color: ink, fontFamily: face);
    void label(String s, Offset o, {bool right = false}) {
      final tp = TextPainter(
        text: TextSpan(text: s, style: text),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, right ? o - Offset(tp.width, tp.height / 2) : o);
      tp.dispose();
    }

    // The axes: the lowest and highest level up the side, the first and last chapter along the foot.
    final axis = Paint()
      ..color = grid
      ..strokeWidth = 1;
    canvas.drawLine(const Offset(left, 6), Offset(left, 6 + h), axis);
    canvas.drawLine(Offset(left, 6 + h), Offset(left + w, 6 + h), axis);
    label('$maxLevel', const Offset(left - 4, 6), right: true);
    label('$minLevel', Offset(left - 4, 6 + h), right: true);
    label('Ch. 0', Offset(left, 6 + h + 3));
    final end = 'Ch. $maxChapter';
    final tp = TextPainter(
      text: TextSpan(text: end, style: text),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(left + w - tp.width, 6 + h + 3));
    tp.dispose();

    // The cap, when it is on the chart.
    if (climb.cap > 0 && climb.cap <= maxLevel) {
      final y = at(0, climb.cap).dy;
      for (var x = left; x < left + w; x += 8) {
        canvas.drawLine(
          Offset(x, y),
          Offset(math.min(x + 4, left + w), y),
          Paint()..color = cap.withValues(alpha: 0.7),
        );
      }
    }

    // The steps taken.
    Path steps(List<(int, int)> points, Offset from) {
      final p = Path()..moveTo(from.dx, from.dy);
      var last = from;
      for (final (c, l) in points) {
        final next = at(c, l);
        p
          ..lineTo(next.dx, last.dy)
          ..lineTo(next.dx, next.dy);
        last = next;
      }
      return p;
    }

    final solid = Paint()
      ..color = line
      ..strokeWidth = 2.4
      ..style = PaintingStyle.stroke
      ..strokeJoin = StrokeJoin.round;
    final start = at(climb.actual.first.$1, climb.actual.first.$2);
    canvas.drawPath(steps(climb.actual.skip(1).toList(), start), solid);
    final here = at(climb.actual.last.$1, climb.actual.last.$2);
    canvas.drawCircle(here, 4, Paint()..color = line);

    // The pace, dashed.
    if (climb.projected.isNotEmpty) {
      final path = steps(climb.projected, here);
      final dash = Paint()
        ..color = line.withValues(alpha: 0.55)
        ..strokeWidth = 1.6
        ..style = PaintingStyle.stroke;
      for (final metric in path.computeMetrics()) {
        for (var d = 0.0; d < metric.length; d += 9) {
          canvas.drawPath(metric.extractPath(d, math.min(d + 5, metric.length)), dash);
        }
      }
    }
  }

  @override
  bool shouldRepaint(_ClimbPainter old) => old.climb != climb || old.line != line;
}
