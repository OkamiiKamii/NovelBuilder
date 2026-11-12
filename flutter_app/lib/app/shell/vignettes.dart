import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shared/data/novel_store.dart';
import '../../shared/domain/analytics/progress.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/records/thread.dart';
import '../destinations.dart';

/// A small picture of what an area holds, drawn from the open novel: the contents page illustrated.
sealed class Vignette {
  const Vignette();
}

/// Plan: each open thread a lane across the book's chapters, from where it starts to where it last moved, with a dot
/// at each chapter it moves in. Positions are 0–1 along the book.
class LanesVignette extends Vignette {
  const LanesVignette(this.lanes);
  final List<List<double>> lanes;
}

/// Visualize: the characters round a ring, the ties between them as lines. [ties] are index pairs into the ring.
class WebVignette extends Vignette {
  const WebVignette(this.people, this.ties);
  final int people;
  final List<(int, int)> ties;
}

/// Review: one mark for each canon fact (filled) and each continuity rule (open).
class LedgerVignette extends Vignette {
  const LedgerVignette(this.facts, this.rules);
  final int facts;
  final int rules;
}

/// Progress: the words of each of the last [days] days, oldest first; the last is today.
class DaysVignette extends Vignette {
  const DaysVignette(this.words);
  final List<int> words;
}

const vignetteDays = 14;
const _maxLanes = 5;
const _maxPeople = 14;
const _maxMarks = 24;

String _day(DateTime t) =>
    '${t.year.toString().padLeft(4, '0')}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';

/// The pictures for More's areas, read from what is saved when More is opened. An area with nothing to draw has none
/// (its words say what it is for).
Map<Destination, Vignette> areaVignettes(NovelStore store, String novelId, {required DateTime now}) {
  final out = <Destination, Vignette>{};

  // Plan: threads along the book.
  final nodes = [for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)];
  final order = StoryOrder.of(nodes);
  final chapters = order.chapters.where((c) => c.kind == NodeKind.chapter).length;
  if (chapters > 0) {
    final lanes = <List<double>>[];
    for (final r in store.rowsIn(novelId, 'plotThreads')) {
      final t = PlotThread(r);
      if (t.raw['muted'] == true || t.status == ThreadStatus.abandoned || t.status == ThreadStatus.retconned) continue;
      final at = <int>{for (final b in t.beats) ?order.chapterNumber[b.nodeId]}.toList()..sort();
      if (at.isEmpty) continue;
      // A chapter's place along the book: the first at the start, the last at the end.
      lanes.add([for (final c in at) chapters == 1 ? 0.5 : (c - 1) / (chapters - 1)]);
      if (lanes.length == _maxLanes) break;
    }
    if (lanes.isNotEmpty) out[Destination.plan] = LanesVignette(lanes);
  }

  // Visualize: who is tied to whom.
  final people = [
    for (final e in store.rowsIn(novelId, 'loreEntries'))
      if (e['category'] == 'character') str(e['id']),
  ].take(_maxPeople).toList();
  if (people.length >= 2) {
    final index = {for (final (i, id) in people.indexed) id: i};
    final ties = <(int, int)>[
      for (final r in store.rowsIn(novelId, 'characterRelations'))
        if ((index[str(r['fromId'])], index[str(r['toId'])]) case (final int a, final int b)) (a, b),
    ];
    out[Destination.visualize] = WebVignette(people.length, ties);
  }

  // Review: the ledger of what is canon.
  final facts = store.countIn(novelId, 'canonFacts');
  final rules = store.countIn(novelId, 'continuityRules');
  if (facts + rules > 0) out[Destination.review] = LedgerVignette(facts, rules);

  // Progress: the last fortnight.
  final byDay = <String, int>{};
  for (final r in store.rowsIn(novelId, 'writingSessions')) {
    final s = WritingSession(r);
    byDay[s.day] = (byDay[s.day] ?? 0) + math.max(0, s.netWords);
  }
  final words = [
    for (var i = vignetteDays - 1; i >= 0; i--) byDay[_day(DateTime(now.year, now.month, now.day - i))] ?? 0,
  ];
  if (words.any((w) => w > 0)) out[Destination.progress] = DaysVignette(words);
  return out;
}

/// Draws a [Vignette] in a strip as tall as what it shows needs (a lane a thread, a ring with room to be a ring), in the
/// page's ink.
class VignetteView extends StatelessWidget {
  const VignetteView(this.vignette, {super.key});

  final Vignette vignette;

  double get height => switch (vignette) {
    LanesVignette(:final lanes) => 8.0 * lanes.length + 8,
    WebVignette() => 40,
    LedgerVignette() => 12,
    DaysVignette() => 26,
  };

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ExcludeSemantics(
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(
          painter: _VignettePainter(vignette, ink: scheme.primary, faint: scheme.outlineVariant),
        ),
      ),
    );
  }
}

class _VignettePainter extends CustomPainter {
  _VignettePainter(this.vignette, {required this.ink, required this.faint});

  final Vignette vignette;
  final Color ink;
  final Color faint;

  @override
  void paint(Canvas canvas, Size size) {
    switch (vignette) {
      case LanesVignette(:final lanes):
        _lanes(canvas, size, lanes);
      case WebVignette(:final people, :final ties):
        _web(canvas, size, people, ties);
      case LedgerVignette(:final facts, :final rules):
        _ledger(canvas, size, facts, rules);
      case DaysVignette(:final words):
        _days(canvas, size, words);
    }
  }

  void _lanes(Canvas canvas, Size size, List<List<double>> lanes) {
    final gap = size.height / (lanes.length + 1);
    final line = Paint()
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    final dot = Paint()..color = ink;
    // The book from end to end, faintly, under every lane.
    for (final (i, lane) in lanes.indexed) {
      final y = gap * (i + 1);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), line..color = faint.withValues(alpha: 0.6));
      final from = lane.first * size.width;
      final to = lane.last * size.width;
      canvas.drawLine(Offset(from, y), Offset(to, y), line..color = ink.withValues(alpha: 0.75));
      for (final at in lane) {
        canvas.drawCircle(Offset(at * size.width, y), 2.4, dot);
      }
    }
  }

  void _web(Canvas canvas, Size size, int people, List<(int, int)> ties) {
    // A wide ring, as wide as the strip allows.
    final centre = Offset(size.width / 2, size.height / 2);
    final rx = math.min(size.width / 2 - 4, size.height * 3);
    final ry = size.height / 2 - 3;
    Offset at(int i) {
      final a = -math.pi / 2 + 2 * math.pi * i / people;
      return centre + Offset(math.cos(a) * rx, math.sin(a) * ry);
    }

    final line = Paint()
      ..color = ink.withValues(alpha: 0.45)
      ..strokeWidth = 1.1;
    for (final (a, b) in ties) {
      canvas.drawLine(at(a), at(b), line);
    }
    final degree = List.filled(people, 0);
    for (final (a, b) in ties) {
      degree[a]++;
      degree[b]++;
    }
    for (var i = 0; i < people; i++) {
      final tied = degree[i] > 0;
      canvas.drawCircle(
        at(i),
        tied ? 2.2 + math.min(degree[i], 4) * 0.5 : 2.2,
        Paint()
          ..color = tied ? ink : faint
          ..style = tied ? PaintingStyle.fill : PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );
    }
  }

  void _ledger(Canvas canvas, Size size, int facts, int rules) {
    const side = 7.0;
    const step = 11.0;
    final y = (size.height - side) / 2;
    final fill = Paint()..color = ink;
    final open = Paint()
      ..color = ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    var x = 0.0;
    var shown = 0;
    for (var i = 0; i < facts && shown < _maxMarks && x + side <= size.width; i++, shown++, x += step) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, y, side, side), const Radius.circular(1.5)), fill);
    }
    if (facts > 0 && rules > 0) x += step / 2;
    for (var i = 0; i < rules && shown < _maxMarks && x + side <= size.width; i++, shown++, x += step) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(x + 0.6, y + 0.6, side - 1.2, side - 1.2), const Radius.circular(1.5)),
        open,
      );
    }
  }

  void _days(Canvas canvas, Size size, List<int> words) {
    final most = words.fold(1, math.max);
    final slot = size.width / words.length;
    final bar = math.min(slot * 0.62, 14.0);
    for (final (i, w) in words.indexed) {
      final today = i == words.length - 1;
      final x = slot * i + (slot - bar) / 2;
      // A day with no words is a short tick on the line, so the fortnight still reads as fourteen days.
      final h = w == 0 ? 1.5 : math.max(3.0, (size.height - 2) * w / most);
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(x, size.height - h, bar, h), const Radius.circular(1.5)),
        Paint()..color = w == 0 ? faint : (today ? ink : ink.withValues(alpha: 0.55)),
      );
    }
  }

  @override
  bool shouldRepaint(_VignettePainter old) => old.vignette != vignette || old.ink != ink || old.faint != faint;
}
