import 'package:flutter/material.dart';

import '../../shared/domain/analytics/journal.dart';
import '../../shared/domain/analytics/progress.dart';
import '../characters/widgets/vault.dart';
import 'widgets/bars.dart';

String _days(int n) => '${grouped(n)} ${n == 1 ? 'day' : 'days'}';

/// The top of Progress: the run of days written, the manuscript against its target, and where the pace leads.
class JournalHero extends StatelessWidget {
  const JournalHero({super.key, required this.journal, required this.report});

  final Journal journal;
  final ProgressReport report;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant);
    final big = vaultHeading(context, size: 52, weight: 700, color: scheme.primary).copyWith(height: 1.05);

    final run = Semantics(
      container: true,
      label: '${_days(journal.currentRun)} in a row. Best: ${_days(journal.bestRun)}.',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${journal.currentRun}', style: big),
          Text(journal.currentRun == 1 ? 'day in a row' : 'days in a row', style: theme.textTheme.titleMedium),
          Text('Best: ${_days(journal.bestRun)}', style: muted),
        ],
      ),
    );

    final target = report.targetWords;
    final percent = report.percent;
    final manuscript = Semantics(
      container: true,
      label:
          '${grouped(report.totalWords)} words'
          '${target != null ? ' of ${grouped(target)}, $percent%' : ''}',
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _Page(fill: target == null ? null : (percent ?? 0) / 100),
          const SizedBox(width: 16),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(grouped(report.totalWords), style: big.copyWith(color: scheme.onSurface)),
                Text(
                  target != null ? 'of ${grouped(target)} words · $percent%' : 'words so far',
                  style: theme.textTheme.titleMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );

    final pace = journal.pacePerDay;
    final reached = target != null && report.totalWords >= target;
    final ahead = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (reached) ...[
          Icon(Icons.verified, color: scheme.primary, size: 32),
          const SizedBox(height: 6),
          Text('Target reached', style: theme.textTheme.titleMedium),
        ] else if (journal.finishDay != null) ...[
          Text('Finished around', style: muted),
          Text(
            mediumDay(journal.finishDay!),
            style: vaultHeading(context, size: 24, weight: 700, color: scheme.onSurface),
          ),
          Text('At your pace of the last 30 days: about ${grouped(pace!)} words a day', style: muted),
        ] else if (pace != null) ...[
          Text('About ${grouped(pace)} words a day', style: theme.textTheme.titleMedium),
          Text('over the last 30 days', style: muted),
        ] else
          Text('No words logged in the last 30 days', style: muted),
      ],
    );

    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: LayoutBuilder(
          builder: (context, box) {
            if (box.maxWidth < 720) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [run, const Divider(height: 32), manuscript, const Divider(height: 32), ahead],
              );
            }
            return IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    flex: 3,
                    child: Align(alignment: Alignment.centerLeft, child: run),
                  ),
                  const VerticalDivider(width: 40),
                  Expanded(
                    flex: 4,
                    child: Align(alignment: Alignment.centerLeft, child: manuscript),
                  ),
                  const VerticalDivider(width: 40),
                  Expanded(
                    flex: 4,
                    child: Align(alignment: Alignment.centerLeft, child: ahead),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// A sheet of manuscript, filling with ink from the bottom as the words reach the target ([fill], 0 to 1); just
/// lines when there is no target.
class _Page extends StatelessWidget {
  const _Page({required this.fill});

  final double? fill;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: 62,
      height: 82,
      child: CustomPaint(
        painter: _PagePainter(
          fill: fill,
          paper: scheme.surfaceContainerHighest,
          ink: scheme.primary,
          lines: scheme.onSurfaceVariant.withValues(alpha: 0.35),
          edge: scheme.outlineVariant,
        ),
      ),
    );
  }
}

class _PagePainter extends CustomPainter {
  _PagePainter({required this.fill, required this.paper, required this.ink, required this.lines, required this.edge});

  final double? fill;
  final Color paper;
  final Color ink;
  final Color lines;
  final Color edge;

  @override
  void paint(Canvas canvas, Size size) {
    const fold = 14.0;
    final sheet = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width - fold, 0)
      ..lineTo(size.width, fold)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(sheet, Paint()..color = paper);
    if (fill != null && fill! > 0) {
      canvas.save();
      canvas.clipPath(sheet);
      final top = size.height * (1 - fill!.clamp(0.0, 1.0));
      canvas.drawRect(Rect.fromLTRB(0, top, size.width, size.height), Paint()..color = ink.withValues(alpha: 0.85));
      canvas.restore();
    }
    final line = Paint()
      ..color = lines
      ..strokeWidth = 1.5;
    for (var y = 22.0; y < size.height - 8; y += 9) {
      canvas.drawLine(Offset(9, y), Offset(size.width - 9, y), line);
    }
    canvas.drawPath(
      sheet,
      Paint()
        ..color = edge
        ..style = PaintingStyle.stroke,
    );
    canvas.drawPath(
      Path()
        ..moveTo(size.width - fold, 0)
        ..lineTo(size.width - fold, fold)
        ..lineTo(size.width, fold),
      Paint()
        ..color = edge
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(_PagePainter old) =>
      old.fill != fill || old.paper != paper || old.ink != ink || old.lines != lines || old.edge != edge;
}

/// A YEAR OF WRITING: the last 53 weeks, a square a day, shaded by the words written against the author's own days.
/// Pointing at or tapping a day says what was written; the same days are in the table under it.
class YearOfWriting extends StatefulWidget {
  const YearOfWriting({super.key, required this.journal});

  final Journal journal;

  @override
  State<YearOfWriting> createState() => _YearOfWritingState();
}

class _YearOfWritingState extends State<YearOfWriting> {
  String? _pointed;

  static const _weeks = 53;
  static const _labels = 30.0;
  static const _months = 18.0;

  String get _first => addDays(weekStart(widget.journal.today), -(_weeks - 1) * 7);

  String? _dayAt(Offset p, double step) {
    final col = ((p.dx - _labels) / step).floor();
    final row = ((p.dy - _months) / step).floor();
    if (col < 0 || col >= _weeks || row < 0 || row > 6) return null;
    final day = addDays(_first, col * 7 + row);
    return day.compareTo(widget.journal.today) > 0 ? null : day;
  }

  String _describe(String day) {
    final d = widget.journal.days[day];
    final when = '${weekdayDay(day)}, ${parseDay(day).year}';
    if (d == null) return '$when: nothing logged';
    final net = d.net > 0 ? '+${grouped(d.net)} words' : '${signed(d.net)} words, revising';
    return '$when: $net in ${d.sessions == 1 ? '1 session' : '${d.sessions} sessions'}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final j = widget.journal;
    final shades = [
      scheme.surfaceContainerHighest,
      for (final t in const [0.3, 0.55, 0.8, 1.0]) Color.lerp(scheme.surfaceContainerHighest, scheme.primary, t)!,
    ];
    final muted = theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant);
    final written = [
      for (final d in j.days.keys)
        if (d.compareTo(_first) >= 0 && d.compareTo(j.today) <= 0) d,
    ]..sort((a, b) => b.compareTo(a));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(
          builder: (context, box) {
            final step = ((box.maxWidth - _labels) / _weeks).clamp(14.0, 22.0);
            final width = _labels + step * _weeks;
            final height = _months + step * 7;
            final grid = Semantics(
              container: true,
              label: 'A year of writing: ${_days(written.length)} written',
              excludeSemantics: true,
              child: MouseRegion(
                onHover: (e) => setState(() => _pointed = _dayAt(e.localPosition, step)),
                onExit: (_) => setState(() => _pointed = null),
                child: GestureDetector(
                  onTapDown: (e) => setState(() => _pointed = _dayAt(e.localPosition, step)),
                  child: CustomPaint(
                    size: Size(width, height),
                    painter: _YearPainter(
                      journal: j,
                      first: _first,
                      step: step,
                      shades: shades,
                      text: muted ?? const TextStyle(fontSize: 11),
                      today: scheme.onSurface,
                      pointed: _pointed,
                    ),
                  ),
                ),
              ),
            );
            if (width <= box.maxWidth) return grid;
            // Too narrow for the year: it scrolls, starting at this week.
            return SingleChildScrollView(scrollDirection: Axis.horizontal, reverse: true, child: grid);
          },
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 16,
          runSpacing: 6,
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(_describe(_pointed ?? j.today), style: theme.textTheme.bodyMedium),
            ExcludeSemantics(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Less', style: muted),
                  const SizedBox(width: 6),
                  for (final c in shades)
                    Container(
                      width: 12,
                      height: 12,
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3)),
                    ),
                  const SizedBox(width: 6),
                  Text('More', style: muted),
                ],
              ),
            ),
          ],
        ),
        TableFold(
          child: NumbersTable(
            label: 'A year of writing, as a table',
            columns: const ['Day', 'Net words', 'Sessions'],
            rows: [
              for (final d in written)
                ['${weekdayDay(d)}, ${parseDay(d).year}', signed(j.days[d]!.net), j.days[d]!.sessions],
            ],
          ),
        ),
      ],
    );
  }
}

class _YearPainter extends CustomPainter {
  _YearPainter({
    required this.journal,
    required this.first,
    required this.step,
    required this.shades,
    required this.text,
    required this.today,
    required this.pointed,
  });

  final Journal journal;
  final String first;
  final double step;
  final List<Color> shades;
  final TextStyle text;
  final Color today;
  final String? pointed;

  static const _monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  void _label(Canvas canvas, String s, Offset at) {
    final p = TextPainter(
      text: TextSpan(text: s, style: text),
      textDirection: TextDirection.ltr,
    )..layout();
    p.paint(canvas, at);
  }

  @override
  void paint(Canvas canvas, Size size) {
    const left = _YearOfWritingState._labels;
    const top = _YearOfWritingState._months;
    final cell = step - 3;
    for (final (row, name) in const [(0, 'Mon'), (2, 'Wed'), (4, 'Fri')]) {
      _label(canvas, name, Offset(0, top + row * step + cell / 2 - 7));
    }
    int? lastMonth;
    for (var col = 0; col < _YearOfWritingState._weeks; col++) {
      final monday = addDays(first, col * 7);
      final month = parseDay(monday).month;
      if (month != lastMonth && col < _YearOfWritingState._weeks - 1) {
        if (lastMonth != null || parseDay(monday).day <= 7) {
          _label(canvas, _monthNames[month - 1], Offset(left + col * step, 0));
        }
        lastMonth = month;
      }
      for (var row = 0; row < 7; row++) {
        final day = addDays(monday, row);
        if (day.compareTo(journal.today) > 0) break;
        final r = RRect.fromRectAndRadius(
          Rect.fromLTWH(left + col * step, top + row * step, cell, cell),
          const Radius.circular(3),
        );
        canvas.drawRRect(r, Paint()..color = shades[journal.level(day)]);
        if (day == journal.today || day == pointed) {
          canvas.drawRRect(
            r.inflate(1),
            Paint()
              ..color = today
              ..style = PaintingStyle.stroke
              ..strokeWidth = day == pointed ? 2 : 1.25,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(_YearPainter old) =>
      old.journal != journal || old.step != step || old.pointed != pointed || old.shades != shades;
}

/// MILESTONES: words, days in a row and chapters, each a seal that fills when it is passed; the next one of each kind
/// says how far away it is.
class Milestones extends StatelessWidget {
  const Milestones({super.key, required this.journal});

  final Journal journal;

  @override
  Widget build(BuildContext context) =>
      Wrap(spacing: 8, runSpacing: 16, children: [for (final m in journal.milestones) _Seal(milestone: m)]);
}

class _Seal extends StatelessWidget {
  const _Seal({required this.milestone});

  final Milestone milestone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final m = milestone;
    final icon = switch (m.kind) {
      'run' => Icons.local_fire_department,
      'chapters' => Icons.bookmark_added,
      _ => Icons.history_edu,
    };
    return Semantics(
      container: true,
      label:
          '${m.label}, ${m.reached
              ? 'reached'
              : m.toGo != null
              ? 'not yet: ${m.toGo}'
              : 'not yet'}',
      excludeSemantics: true,
      child: SizedBox(
        width: 92,
        child: Column(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: m.reached ? scheme.primary : Colors.transparent,
                border: Border.all(
                  color: m.reached ? scheme.primary : scheme.outlineVariant,
                  width: m.toGo != null ? 2 : 1.25,
                ),
                boxShadow: m.reached
                    ? [BoxShadow(color: scheme.primary.withValues(alpha: 0.35), blurRadius: 12)]
                    : null,
              ),
              child: Icon(
                icon,
                size: 26,
                color: m.reached ? scheme.onPrimary : scheme.onSurfaceVariant.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              m.label,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: m.reached ? FontWeight.w700 : FontWeight.w400,
                color: m.reached ? scheme.onSurface : scheme.onSurfaceVariant,
              ),
            ),
            if (m.toGo != null)
              Text(
                m.toGo!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(color: scheme.primary),
              ),
          ],
        ),
      ),
    );
  }
}
