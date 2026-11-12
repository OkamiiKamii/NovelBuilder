import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../features/characters/widgets/vault.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/domain/analytics/progress.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/records/thread.dart';
import '../destinations.dart';
import 'contents_sheet.dart' show roman;

/// One thing the story is waiting for: what it is, in a line, the area it is in, and the page that answers it.
typedef LooseEnd = ({Destination area, String text, String path});

/// A thread is quiet when the writing has gone this many chapters past where it last moved.
const quietAfterChapters = 3;

String _day(DateTime t) =>
    '${t.year.toString().padLeft(4, '0')}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';

/// LOOSE ENDS: what the open novel is waiting for, read from what is saved, at most [max], the most pressing first.
/// Only what can be counted, never a judgement of the writing:
///
/// 1. today's words, when there is a daily goal not yet met ("312 words to today's goal"), or a streak that today has
///    not kept yet ("Write today to keep a 4-day streak");
/// 2. the quietest plot thread: one still open that has not moved for [quietAfterChapters] chapters or more of the
///    writing ("The Guild's salvage has been quiet since chapter 4");
/// 3. the next chapter with no plan ("Chapter 10 has no plan yet");
/// 4. a character with no ties to anyone, when there are others to be tied to.
///
/// Each says which area answers it and opens the page that does. Read when More is opened, never while it is closed.
List<LooseEnd> looseEnds(NovelStore store, String novelId, {required DateTime now, int max = 3}) {
  final out = <LooseEnd>[];
  final nodes = [for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)];
  final order = StoryOrder.of(nodes);

  // 1. Today.
  final sessions = [for (final r in store.rowsIn(novelId, 'writingSessions')) WritingSession(r)];
  final daily = intOrNull(
    store.rowsIn(novelId, 'goals').where((g) => g['kind'] == 'daily').firstOrNull?['targetWords'],
  );
  final todayKey = _day(now);
  final today = sessions.where((s) => s.day == todayKey).fold(0, (a, s) => a + s.netWords);
  if (daily != null && daily > 0 && today < daily) {
    final left = daily - today;
    out.add((
      area: Destination.write,
      text: today <= 0
          ? 'Today’s ${plural(daily, 'word')} are still to write'
          : '${plural(left, 'word')} to today’s goal of ${formatNumber(daily)}',
      path: Destination.write.path,
    ));
  } else if (today <= 0) {
    final written = {
      for (final s in sessions)
        if (s.netWords > 0 || s.added > 0) s.day,
    };
    var streak = 0;
    for (
      var d = DateTime(now.year, now.month, now.day - 1);
      written.contains(_day(d));
      d = DateTime(d.year, d.month, d.day - 1)
    ) {
      streak++;
    }
    if (streak >= 2) {
      out.add((
        area: Destination.write,
        text: 'Write today to keep a $streak-day streak',
        path: Destination.write.path,
      ));
    }
  }

  // How far the writing has come: the last chapter with words in it (or in its scenes).
  var reached = 0;
  for (final n in nodes) {
    if (n.wordCount > 0) {
      final c = order.chapterNumber[n.id];
      if (c != null && c > reached) reached = c;
    }
  }

  // 2. The quietest open thread.
  ({String id, String title, int since})? quiet;
  for (final r in store.rowsIn(novelId, 'plotThreads')) {
    final t = PlotThread(r);
    if (t.raw['muted'] == true) continue;
    if (const [ThreadStatus.resolved, ThreadStatus.abandoned, ThreadStatus.retconned].contains(t.status)) continue;
    var last = 0;
    for (final b in t.beats) {
      final c = b.nodeId == null ? null : order.chapterNumber[b.nodeId];
      if (c != null && c > last) last = c;
    }
    if (reached - last >= quietAfterChapters && (quiet == null || last < quiet.since)) {
      quiet = (id: t.id, title: t.title.trim().isEmpty ? 'A thread' : t.title.trim(), since: last);
    }
  }
  if (quiet case final q?) {
    out.add((
      area: Destination.plan,
      text: q.since == 0 ? '“${q.title}” has not moved yet' : '“${q.title}” has been quiet since chapter ${q.since}',
      path: '/plan/thread/${q.id}',
    ));
  }

  // 3. The next chapter with no plan: the first not yet written, or else the first written.
  bool planned(String id) {
    final p = store.row(novelId, 'chapterPlans', id);
    return p != null && (str(p['objective']).trim().isNotEmpty || maps(p['beats']).isNotEmpty);
  }

  final chapters = order.chapters.where((c) => c.kind == NodeKind.chapter).toList();
  final unplanned =
      chapters.where((c) => c.wordCount == 0 && !planned(c.id)).firstOrNull ??
      chapters.where((c) => !planned(c.id)).firstOrNull;
  if (unplanned != null && chapters.length > 1) {
    final n = order.chapterNumber[unplanned.id];
    final name = unplanned.title.trim().isEmpty ? 'Chapter $n' : 'Chapter $n, “${unplanned.title.trim()}”,';
    out.add((area: Destination.plan, text: '$name has no plan yet', path: '/plan/chapter/${unplanned.id}'));
  }

  // 4. A character with no ties.
  final characters = [
    for (final e in store.rowsIn(novelId, 'loreEntries'))
      if (e['category'] == 'character') e,
  ];
  if (characters.length >= 2) {
    final tied = {
      for (final r in store.rowsIn(novelId, 'characterRelations')) ...[str(r['fromId']), str(r['toId'])],
    };
    final alone = characters.where((c) => !tied.contains(c['id'])).firstOrNull;
    if (alone != null) {
      final name = str(alone['name']).trim();
      out.add((
        area: Destination.visualize,
        text: '${name.isEmpty ? 'A character' : name} has no ties to anyone yet',
        path: Destination.visualize.path,
      ));
    }
  }
  return out.take(max).toList();
}

/// The loose ends on a slip at the top of More's contents: each a line in the book's italic with a small knot of
/// thread before it and, after it, the place in the book that answers it (its Roman numeral and name). A press opens
/// that page. Nothing is shown when nothing is waiting.
class LooseEndsSlip extends StatelessWidget {
  const LooseEndsSlip({super.key, required this.ends, required this.onGo});

  final List<LooseEnd> ends;
  final ValueChanged<LooseEnd> onGo;

  @override
  Widget build(BuildContext context) {
    if (ends.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: scheme.primaryContainer.withValues(alpha: 0.35),
          border: Border(left: BorderSide(color: scheme.primary, width: 3)),
          borderRadius: const BorderRadius.horizontal(right: Radius.circular(6)),
        ),
        child: Semantics(
          container: true,
          label: 'Loose ends',
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 10, 4, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.only(left: 8, bottom: 2),
                  child: Semantics(
                    header: true,
                    child: Text(
                      'Loose ends',
                      style: vaultHeading(context, size: 13, weight: 700, color: scheme.primary),
                    ),
                  ),
                ),
                for (final end in ends)
                  InkWell(
                    borderRadius: BorderRadius.circular(6),
                    onTap: () => onGo(end),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 48),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                        child: Row(
                          children: [
                            ExcludeSemantics(
                              child: CustomPaint(size: const Size(18, 18), painter: _Knot(scheme.primary)),
                            ),
                            const SizedBox(width: 10),
                            // The place in the book under the line, so both fit at any text size.
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    end.text,
                                    style: vaultText(
                                      context,
                                      size: 16,
                                      style: FontStyle.italic,
                                      color: scheme.onSurface,
                                    ),
                                  ),
                                  Text(
                                    '${roman(end.area.index + 1)} · ${end.area.label}',
                                    semanticsLabel: 'in ${end.area.label}',
                                    style: vaultText(context, size: 14, color: scheme.primary),
                                  ),
                                ],
                              ),
                            ),
                            Icon(Icons.chevron_right, size: 18, color: scheme.primary),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A loose thread with a loop in it.
class _Knot extends CustomPainter {
  _Knot(this.colour);
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final paint = Paint()
      ..color = colour
      ..strokeWidth = 1.6
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(0, h * 0.75)
      ..cubicTo(w * 0.25, h * 0.75, w * 0.3, h * 0.2, w * 0.55, h * 0.2)
      ..cubicTo(w * 0.85, h * 0.2, w * 0.8, h * 0.65, w * 0.55, h * 0.65)
      ..cubicTo(w * 0.35, h * 0.65, w * 0.45, h * 0.95, w, h * 0.9);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_Knot old) => old.colour != colour;
}
