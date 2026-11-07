import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/format.dart';
import '../../../shared/domain/model/navigate.dart' show threadStatusName;
import '../../../shared/domain/plot/diagnostics.dart';
import '../../../shared/domain/plot/plot_changes.dart';
import '../../../shared/domain/records/thread.dart';
import '../../characters/characters_providers.dart';
import '../../characters/widgets/cast_card.dart' show castTone;
import '../../characters/widgets/parts.dart';
import '../../characters/widgets/vault.dart';

/// Where a thread's strand sits on the loom: the chapter of each placed development (with its role), the chapter it
/// should resolve in, and how its end is drawn. Worked out from the report only; nothing is stored.
class StrandPlan {
  StrandPlan._(this.knots, this.target, this.open, this.tied, this.faded, this.dashed, this.quiet, this.gap);

  factory StrandPlan.of(ThreadReport report, int? targetChapter) {
    final status = report.thread.statusKey;
    final knots = [
      for (final b in report.beats)
        if (b.chapter != null && !b.missing) (chapter: b.chapter!, role: b.beat.role),
    ];
    // The widest stretch between developments, where the report flags one (the same stretch it names).
    ({int from, int to})? gap;
    if (report.issues.any((i) => i.kind == 'gap')) {
      final chapters = {for (final k in knots) k.chapter}.toList()..sort();
      for (var i = 1; i < chapters.length; i++) {
        if (gap == null || chapters[i] - chapters[i - 1] > gap.to - gap.from) {
          gap = (from: chapters[i - 1], to: chapters[i]);
        }
      }
    }
    return StrandPlan._(
      knots,
      targetChapter,
      openStatuses.contains(status),
      status == 'resolved',
      status == 'abandoned' || status == 'retconned',
      status == 'paused' || status == 'planned',
      report.issues.any((i) => i.kind == 'quiet' || i.kind == 'paused'),
      gap,
    );
  }

  final List<({int chapter, BeatRole role})> knots;
  final int? target;

  /// Still being told (active, paused, planned): its strand runs on to the words written so far.
  final bool open;

  /// Resolved: the strand ends in a tied knot at its last development.
  final bool tied;

  /// Abandoned or retconned: drawn faint.
  final bool faded;

  /// Paused or planned: drawn in dashes.
  final bool dashed;

  /// Flagged as gone quiet (active, or paused for long): the loose end frays.
  final bool quiet;

  /// A long stretch without a development, flagged: bracketed over the strand.
  final ({int from, int to})? gap;

  int? get first => knots.isEmpty ? null : knots.map((k) => k.chapter).reduce(math.min);
  int? get last => knots.isEmpty ? null : knots.map((k) => k.chapter).reduce(math.max);

  /// The strand in words, for a screen reader (the drawing says nothing a word does not).
  String describe(int chapterCount, int frontier) {
    if (chapterCount == 0) return 'No chapters yet';
    final parts = <String>[
      if (knots.isEmpty)
        'No developments placed in chapters'
      else
        'Developments in chapter${knots.length == 1 ? '' : 's'} '
            '${{for (final k in knots) k.chapter}.join(', ')} of $chapterCount',
      if (tied) 'tied off at chapter $last',
      if (open && last != null && frontier > last!) 'loose since chapter $last, words written to chapter $frontier',
      if (quiet) 'gone quiet, worth a look',
      if (gap != null) 'a long gap between chapters ${gap!.from} and ${gap!.to}, worth a look',
      if (target != null) 'to resolve in chapter $target',
    ];
    return parts.join('; ');
  }
}

/// The marks used on the loom, said once above the threads.
class LoomLegend extends StatelessWidget {
  const LoomLegend({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final style = Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant);
    Widget item(_Mark mark, String text) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 18,
          height: 14,
          child: CustomPaint(painter: _MarkPainter(mark, scheme.onSurfaceVariant, scheme.error)),
        ),
        const SizedBox(width: 4),
        // Wraps rather than overflowing a phone at large text sizes.
        Flexible(child: Text(text, style: style)),
      ],
    );
    return Wrap(
      spacing: 14,
      runSpacing: 4,
      children: [
        item(_Mark.introduction, 'Introduced'),
        item(_Mark.development, 'Develops'),
        item(_Mark.intersection, 'Crosses another'),
        item(_Mark.resolution, 'Resolved'),
        item(_Mark.target, 'Meant to resolve'),
        item(_Mark.frontier, 'Written so far'),
        item(_Mark.fray, 'Gone quiet'),
        item(_Mark.gap, 'Long gap'),
      ],
    );
  }
}

/// A thread on the loom: its name in the vault's capitals with its kind and status, its premise in the book face, its
/// strand across every chapter of the book, then who it follows, where it should end, its developments and anything
/// worth a look. The whole card opens the thread.
class ThreadStrandCard extends StatelessWidget {
  const ThreadStrandCard({
    super.key,
    required this.report,
    required this.cast,
    required this.frontier,
    required this.chapterCount,
    required this.onOpen,
  });

  final ThreadReport report;
  final CastData cast;
  final int frontier;
  final int chapterCount;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final thread = report.thread;
    final model = cast.model;
    final tone = castTone(thread.id);
    final people = [for (final id in thread.characterIds) ?model.entries[id]?.name];
    final targetTitle = model.nodes[thread.targetNodeId]?.title ?? '';
    final target = targetTitle.isNotEmpty ? targetTitle : '${thread.raw['targetNote'] ?? ''}'.trim();
    final plan = StrandPlan.of(
      report,
      thread.targetNodeId == null ? null : model.order.chapterNumber[thread.targetNodeId],
    );
    final status = threadStatusName(thread) ?? thread.statusKey;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: scheme.surfaceContainerLow,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
        ),
        child: InkWell(
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 10,
                  runSpacing: 2,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      thread.title.isEmpty ? 'Untitled thread' : thread.title,
                      style: vaultHeading(context, size: 16, weight: 700, color: scheme.onSurface),
                    ),
                    Text(
                      '${categoryName(thread)} · $status',
                      style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
                if (thread.premise.trim().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(thread.premise, style: vaultText(context, size: 16)),
                  ),
                const SizedBox(height: 10),
                if (chapterCount == 0)
                  const NotRecorded('No chapters yet: the strand is drawn across them once there are some.')
                else
                  Semantics(
                    label: plan.describe(chapterCount, frontier),
                    image: true,
                    excludeSemantics: true,
                    child: SizedBox(
                      height: 30,
                      width: double.infinity,
                      child: CustomPaint(
                        painter: _StrandPainter(
                          plan: plan,
                          chapterCount: chapterCount,
                          frontier: frontier,
                          tone: tone,
                          track: scheme.outlineVariant,
                          ink: scheme.onSurfaceVariant,
                          fray: scheme.error,
                        ),
                      ),
                    ),
                  ),
                if (chapterCount > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      _span(plan, frontier),
                      style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ),
                if (people.isNotEmpty || target.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    [if (people.isNotEmpty) people.join(', '), if (target.isNotEmpty) 'Resolves: $target'].join(' · '),
                    style: theme.textTheme.bodySmall,
                  ),
                ],
                const SizedBox(height: 6),
                if (report.beats.isEmpty)
                  const NotRecorded('No developments recorded yet.')
                else
                  for (final placed in report.beats)
                    Text(
                      '${beatPlace(placed)} · ${placed.beat.title.isEmpty ? '(appears)' : placed.beat.title}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        decoration: placed.missing ? TextDecoration.lineThrough : null,
                      ),
                    ),
                for (final issue in report.issues)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.error_outline, size: 16, color: scheme.error),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(issue.message, style: theme.textTheme.bodySmall?.copyWith(color: scheme.error)),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// The strand's reach in words: "Chapters 2–9 · tied off", "Chapters 3–5 · loose for 6 chapters".
  String _span(StrandPlan plan, int frontier) {
    final first = plan.first;
    final last = plan.last;
    if (first == null || last == null) return 'Not placed in any chapter yet';
    final reach = first == last ? 'Chapter $first' : 'Chapters $first–$last';
    if (plan.tied) return '$reach · tied off';
    if (plan.open && frontier > last) return '$reach · loose for ${plural(frontier - last, 'chapter')}';
    return reach;
  }
}

enum _Mark { introduction, development, intersection, resolution, appears, target, frontier, fray, gap }

/// Draws one mark of the loom centred in its box, as the legend shows it.
class _MarkPainter extends CustomPainter {
  _MarkPainter(this.mark, this.ink, this.fray);

  final _Mark mark;
  final Color ink;
  final Color fray;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    switch (mark) {
      case _Mark.frontier:
        canvas.drawLine(
          Offset(c.dx, 0),
          Offset(c.dx, size.height),
          Paint()
            ..color = ink
            ..strokeWidth = 1.5,
        );
      case _Mark.fray:
        _drawFray(canvas, Offset(c.dx - 5, c.dy), fray);
      case _Mark.gap:
        canvas.drawPath(
          Path()
            ..moveTo(1, c.dy + 4)
            ..lineTo(1, c.dy - 3)
            ..lineTo(size.width - 1, c.dy - 3)
            ..lineTo(size.width - 1, c.dy + 4),
          Paint()
            ..color = fray
            ..strokeWidth = 1.5
            ..style = PaintingStyle.stroke,
        );
      default:
        _drawKnot(canvas, c, mark, ink, ink);
    }
  }

  @override
  bool shouldRepaint(_MarkPainter old) => old.mark != mark || old.ink != ink || old.fray != fray;
}

_Mark _markOf(BeatRole role) => switch (role) {
  BeatRole.introduction => _Mark.introduction,
  BeatRole.development => _Mark.development,
  BeatRole.intersection => _Mark.intersection,
  BeatRole.resolution => _Mark.resolution,
  BeatRole.appears => _Mark.appears,
};

void _drawKnot(Canvas canvas, Offset c, _Mark mark, Color tone, Color ring) {
  final fill = Paint()..color = tone;
  final line = Paint()
    ..color = ring
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2;
  switch (mark) {
    case _Mark.introduction:
      canvas.drawCircle(c, 6, Paint()..color = tone.withValues(alpha: 0.2));
      canvas.drawCircle(c, 6, line..color = tone);
      canvas.drawCircle(c, 2.5, fill);
    case _Mark.development:
      canvas.drawCircle(c, 4.5, fill);
    case _Mark.intersection:
      canvas.drawCircle(c, 4, fill);
      canvas.drawCircle(c, 7, line..strokeWidth = 1.2);
    case _Mark.resolution:
      canvas.drawPath(_diamond(c, 6.5), fill);
    case _Mark.appears:
      canvas.drawCircle(c, 3, line..strokeWidth = 1.5);
    case _Mark.target:
      canvas.drawPath(
        _diamond(c, 6),
        line
          ..strokeWidth = 1.2
          ..color = tone.withValues(alpha: 0.8),
      );
    case _Mark.frontier || _Mark.fray || _Mark.gap:
      break;
  }
}

Path _diamond(Offset c, double r) => Path()
  ..moveTo(c.dx, c.dy - r)
  ..lineTo(c.dx + r, c.dy)
  ..lineTo(c.dx, c.dy + r)
  ..lineTo(c.dx - r, c.dy)
  ..close();

/// A frayed end: the strand coming apart to the right of [at] into loose fibres of uneven length, each curling away.
void _drawFray(Canvas canvas, Offset at, Color color) {
  final p = Paint()
    ..color = color
    ..strokeWidth = 1.4
    ..strokeCap = StrokeCap.round
    ..style = PaintingStyle.stroke;
  for (final (dy, reach) in [(-6.0, 9.0), (-2.0, 11.0), (2.5, 8.0), (6.0, 10.0)]) {
    canvas.drawPath(
      Path()
        ..moveTo(at.dx, at.dy)
        ..quadraticBezierTo(at.dx + reach * 0.5, at.dy + dy * 0.2, at.dx + reach, at.dy + dy),
      p,
    );
  }
}

class _StrandPainter extends CustomPainter {
  _StrandPainter({
    required this.plan,
    required this.chapterCount,
    required this.frontier,
    required this.tone,
    required this.track,
    required this.ink,
    required this.fray,
  });

  final StrandPlan plan;
  final int chapterCount;
  final int frontier;
  final Color tone;
  final Color track;
  final Color ink;
  final Color fray;

  @override
  void paint(Canvas canvas, Size size) {
    if (chapterCount == 0) return;
    const inset = 10.0;
    final width = size.width - inset * 2 - 10;
    final y = size.height / 2;
    double x(int chapter) => inset + width * (chapter - 0.5) / chapterCount;
    final color = plan.faded ? tone.withValues(alpha: 0.5) : tone;

    // The book: a faint warp thread with a tick per chapter (or per tenth chapter in a long book).
    final warp = Paint()
      ..color = track.withValues(alpha: 0.7)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(inset, y), Offset(inset + width, y), warp);
    final every = chapterCount > 60 ? 10 : (chapterCount > 24 ? 5 : 1);
    for (var n = 1; n <= chapterCount; n++) {
      if (n % every != 0 && n != 1) continue;
      canvas.drawLine(Offset(x(n), y - 3), Offset(x(n), y + 3), warp);
    }

    // How far the words go.
    if (frontier > 0 && frontier <= chapterCount) {
      final fx = x(frontier) + width / chapterCount / 2;
      canvas.drawLine(
        Offset(fx, 1),
        Offset(fx, size.height - 1),
        Paint()
          ..color = ink.withValues(alpha: 0.6)
          ..strokeWidth = 1.5,
      );
    }

    if (plan.target != null && plan.target! >= 1 && plan.target! <= chapterCount) {
      _drawKnot(canvas, Offset(x(plan.target!), y), _Mark.target, color, color);
    }

    final first = plan.first;
    final last = plan.last;
    if (first == null || last == null) return;

    // The strand between its first and last developments.
    final strand = Paint()
      ..color = color
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    if (plan.dashed) {
      _dashes(canvas, Offset(x(first), y), Offset(x(last), y), strand, 6, 4);
    } else if (last > first) {
      canvas.drawLine(Offset(x(first), y), Offset(x(last), y), strand);
    }

    // A thread still being told runs loose to where the words stop; one to check frays there.
    if (plan.open && frontier > last && frontier <= chapterCount) {
      // Up to the "written so far" line, leaving room for the fray to reach it.
      final end = x(frontier) + width / chapterCount / 2 - (plan.quiet ? 11 : 0);
      _dashes(
        canvas,
        Offset(x(last), y),
        Offset(end, y),
        Paint()
          ..color = color.withValues(alpha: 0.45)
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round,
        3,
        4,
      );
      if (plan.quiet) _drawFray(canvas, Offset(end, y), fray);
    }

    // A flagged gap: a bracket over the stretch, in the warning colour.
    if (plan.gap case final gap?) {
      final a = x(gap.from) + 8;
      final b = x(gap.to) - 8;
      if (b > a) {
        final top = y - 9;
        final p = Paint()
          ..color = fray
          ..strokeWidth = 1.5
          ..style = PaintingStyle.stroke;
        canvas.drawPath(
          Path()
            ..moveTo(a, y - 4)
            ..lineTo(a, top)
            ..lineTo(b, top)
            ..lineTo(b, y - 4),
          p,
        );
      }
    }

    for (final k in plan.knots) {
      _drawKnot(canvas, Offset(x(k.chapter), y), _markOf(k.role), color, color);
    }
    if (plan.tied && plan.knots.every((k) => k.chapter != last || k.role != BeatRole.resolution)) {
      _drawKnot(canvas, Offset(x(last), y), _Mark.resolution, color, color);
    }
  }

  void _dashes(Canvas canvas, Offset a, Offset b, Paint paint, double on, double off) {
    final length = (b - a).distance;
    if (length <= 0) return;
    final step = (b - a) / length;
    for (var d = 0.0; d < length; d += on + off) {
      canvas.drawLine(a + step * d, a + step * math.min(d + on, length), paint);
    }
  }

  @override
  bool shouldRepaint(_StrandPainter old) =>
      old.plan != plan ||
      old.chapterCount != chapterCount ||
      old.frontier != frontier ||
      old.tone != tone ||
      old.track != track ||
      old.ink != ink ||
      old.fray != fray;
}
