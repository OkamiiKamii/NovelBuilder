import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../shared/domain/collation.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/progression/track.dart';
import '../../../shared/domain/records/progress.dart';

/// One line drawn: a value (or one named value) whose recorded settings are numbers, or steps of its own ladder.
class ChartSeries {
  ChartSeries(this.name, this.points, this.ladder);
  final String name;

  /// Each setting in the story's order: where it sits in the change log, the number drawn, and its words.
  final List<({int at, double y, String value, String when})> points;

  /// The category's steps, lowest first, when the values are read as steps; empty for plain numbers.
  final List<String> ladder;
}

/// What can be drawn of one character's progression: only values set more than once, and only when every setting
/// reads as a number, or as a step of the category's own ladder. Nothing is guessed from words.
List<ChartSeries> chartSeries(StoryModel model, String entryId) {
  final log = changeLog(model, entryId);
  final lines = <String, ({ProgressCategory category, String subject, List<(int, ProgressChange, String)> sets})>{};
  for (final (i, l) in log.indexed) {
    final category = l.category;
    if (category == null || l.change.action != 'set') continue;
    if (category.shape != 'value' && category.shape != 'named') continue;
    final subject = category.shape == 'named' ? l.change.subject.trim() : '';
    final key = '${category.id}|${subject.toLowerCase()}';
    (lines[key] ??= (category: category, subject: subject, sets: [])).sets.add((i, l.change, l.when));
  }
  final out = <ChartSeries>[];
  for (final line in lines.values) {
    if (line.sets.length < 2) continue;
    final ladder = line.category.ladder;
    final steps = {for (final (i, s) in ladder.indexed) s.trim().toLowerCase(): i};
    final asSteps = ladder.isNotEmpty && line.sets.every((s) => steps.containsKey(s.$2.value.trim().toLowerCase()));
    final numbers = [for (final s in line.sets) double.tryParse(s.$2.value.trim().replaceAll(',', ''))];
    if (!asSteps && numbers.any((n) => n == null)) continue;
    final name = line.subject.isEmpty ? line.category.name : '${line.category.name}: ${line.subject}';
    out.add(
      ChartSeries(name, [
        for (final (k, (at, change, said)) in line.sets.indexed)
          (
            at: at,
            y: asSteps ? steps[change.value.trim().toLowerCase()]!.toDouble() : numbers[k]!,
            value: change.value,
            when: said,
          ),
      ], asSteps ? ladder : const []),
    );
  }
  out.sort((a, b) => localeCompare(a.name, b.name));
  return out;
}

/// A value over the story, drawn as steps: each setting holds until the next. Tapping a point says what it is; the
/// change log beside it is the same in words.
class ProgressChart extends StatefulWidget {
  const ProgressChart({super.key, required this.series, required this.length});
  final List<ChartSeries> series;

  /// How many changes the log has: the chart's width runs along them.
  final int length;

  @override
  State<ProgressChart> createState() => _ProgressChartState();
}

class _ProgressChartState extends State<ProgressChart> {
  int _shown = 0;
  int? _point;

  @override
  void didUpdateWidget(ProgressChart old) {
    super.didUpdateWidget(old);
    if (_shown >= widget.series.length) _shown = 0;
    if (_point != null && _point! >= widget.series[_shown].points.length) _point = null;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final series = widget.series[_shown];
    final point = _point == null ? null : series.points[_point!];
    String words(({int at, double y, String value, String when}) p) => '${p.value} (${p.when})';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.series.length > 1)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final (i, s) in widget.series.indexed)
                ChoiceChip(
                  label: Text(s.name),
                  selected: i == _shown,
                  onSelected: (_) => setState(() {
                    _shown = i;
                    _point = null;
                  }),
                ),
            ],
          ),
        const SizedBox(height: 8),
        Semantics(
          container: true,
          label:
              '${series.name} over the story, ${series.points.length} settings: '
              '${series.points.map(words).join('; ')}.',
          child: SizedBox(
            height: 180,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final painter = _ChartPainter(
                  series: series,
                  length: math.max(widget.length, 1),
                  selected: _point,
                  color: theme.colorScheme.primary,
                  ink: theme.colorScheme.onSurfaceVariant,
                  grid: theme.colorScheme.outlineVariant,
                  labelStyle: theme.textTheme.labelSmall!,
                );
                return GestureDetector(
                  onTapUp: (d) {
                    final size = constraints.biggest;
                    var best = -1;
                    var far = double.infinity;
                    for (final (i, p) in series.points.indexed) {
                      final o = painter.offsetOf(p, size);
                      final dist = (o - d.localPosition).distance;
                      if (dist < far) {
                        far = dist;
                        best = i;
                      }
                    }
                    setState(() => _point = far <= 40 ? best : null);
                  },
                  child: CustomPaint(size: constraints.biggest, painter: painter),
                );
              },
            ),
          ),
        ),
        Text(
          point == null ? 'Tap a point to see when it was set.' : '${series.name}: ${words(point)}',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _ChartPainter extends CustomPainter {
  _ChartPainter({
    required this.series,
    required this.length,
    required this.selected,
    required this.color,
    required this.ink,
    required this.grid,
    required this.labelStyle,
  });
  final ChartSeries series;
  final int length;
  final int? selected;
  final Color color;
  final Color ink;
  final Color grid;
  final TextStyle labelStyle;

  static const _left = 72.0;
  static const _pad = 12.0;

  ({double low, double high}) get _range {
    if (series.ladder.isNotEmpty) return (low: 0, high: math.max(1, series.ladder.length - 1).toDouble());
    final ys = series.points.map((p) => p.y);
    var low = ys.reduce(math.min);
    var high = ys.reduce(math.max);
    if (low == high) {
      low -= 1;
      high += 1;
    }
    return (low: low, high: high);
  }

  Offset offsetOf(({int at, double y, String value, String when}) p, Size size) {
    final (:low, :high) = _range;
    final w = size.width - _left - _pad;
    final h = size.height - _pad * 2;
    final x = _left + (length <= 1 ? w / 2 : p.at / (length - 1) * w);
    final y = _pad + h - (p.y - low) / (high - low) * h;
    return Offset(x, y);
  }

  void _label(Canvas canvas, String text, Offset at) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: labelStyle.copyWith(color: ink),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: _left - 8);
    tp.paint(canvas, Offset(_left - 8 - tp.width, at.dy - tp.height / 2));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final (:low, :high) = _range;
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    // The scale: the ladder's own steps, or the lowest, middle and highest values.
    final marks = series.ladder.isNotEmpty
        ? [for (final (i, s) in series.ladder.indexed) (i.toDouble(), s)]
        : [
            for (final v in [low, (low + high) / 2, high]) (v, _number(v)),
          ];
    final step = series.ladder.length > 8 ? (series.ladder.length / 8).ceil() : 1;
    for (final (i, (v, text)) in marks.indexed) {
      final y = offsetOf((at: 0, y: v, value: '', when: ''), size).dy;
      canvas.drawLine(Offset(_left, y), Offset(size.width - _pad, y), gridPaint);
      if (i % step == 0 || i == marks.length - 1) _label(canvas, text, Offset(0, y));
    }
    final line = Paint()
      ..color = color
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke;
    final path = Path();
    for (final (i, p) in series.points.indexed) {
      final o = offsetOf(p, size);
      if (i == 0) {
        path.moveTo(o.dx, o.dy);
      } else {
        // Held until the next setting: across, then up or down.
        final before = offsetOf(series.points[i - 1], size);
        path
          ..lineTo(o.dx, before.dy)
          ..lineTo(o.dx, o.dy);
      }
    }
    canvas.drawPath(path, line);
    for (final (i, p) in series.points.indexed) {
      final o = offsetOf(p, size);
      canvas.drawCircle(o, i == selected ? 7 : 4.5, Paint()..color = color);
      if (i == selected) {
        canvas.drawCircle(
          o,
          10,
          Paint()
            ..color = color
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      }
    }
  }

  static String _number(double v) => v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1);

  @override
  bool shouldRepaint(_ChartPainter old) =>
      old.series != series || old.selected != selected || old.length != length || old.color != color;
}
