import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/day_book.dart';
import '../../shared/domain/analytics/progress.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import 'goal_pledge.dart';
import 'next_note.dart';
import 'todays_page.dart';
import 'write_providers.dart';

/// The chapter or scene to carry on in: the one last open here, else the last with words in it, else the first.
StoryNode? carryOnNode(List<StoryNode> nodes, Object? remembered) {
  final documents = [
    for (final n in readingOrder(nodes))
      if (isDocument(n.kind)) n,
  ];
  return documents.where((n) => n.id == remembered).firstOrNull ??
      documents.lastWhere((n) => n.wordCount > 0, orElse: () => documents.first);
}

/// THE DAY BOOK, at the head of the contents: five weeks of writing as ink on the page, a mark for every day written
/// (fuller and darker the more words), today a ring that closes on the day's goal; the days written in a row; and one
/// press back into the chapter being written, the caret after its last word. It reads the writing log and nothing
/// else; only the goal (when the author sets one) is written, as the meter's goal is.
class DayBookCard extends ConsumerWidget {
  const DayBookCard({super.key, required this.novelId});
  final String novelId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nodes = ref.watch(outlineProvider); // Read again after every save, with the outline.
    final store = ref.read(novelStoreProvider);
    final service = ref.read(manuscriptServiceProvider);
    final book = dayBookOf([
      for (final r in store.rowsIn(novelId, 'writingSessions')) WritingSession(r),
    ], DateTime.now());
    final goal = service.wordGoals(novelId).daily;
    final notes = ref.watch(nextNotesProvider);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = vaultText(context, size: 15, color: scheme.onSurfaceVariant);
    final next = nodes.any((n) => isDocument(n.kind))
        ? carryOnNode(nodes, ref.read(settingsStoreProvider).read('write.lastNode.$novelId'))
        : null;

    final headline = switch ((book.streak, book.keptToday)) {
      (0, _) => 'Every day you write leaves a mark',
      (1, true) => 'Written today',
      (final n, true) => '$n days in a row',
      (final n, false) => '$n ${n == 1 ? 'day' : 'days in a row'} · write today to keep it',
    };
    final today = goal != null && goal > 0
        ? 'Today: ${formatNumber(book.today)} of ${formatNumber(goal)} words'
        : 'Today: ${plural(book.today, 'word')}';

    void carryOn() {
      ref.read(selectedNodeProvider.notifier).select(next!.id);
      ref.read(pendingCaretEndProvider.notifier).request(next.id);
    }

    Future<void> setGoal() => showDialog<void>(
      context: context,
      builder: (_) => GoalPledge(
        service: service,
        novelId: novelId,
        words: nodes.fold(0, (a, n) => a + n.wordCount),
        target: store.novel(novelId)?.targetWordCount,
      ),
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Color.alphaBlend(scheme.primary.withValues(alpha: 0.05), scheme.surfaceContainerLow),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('THE DAY BOOK', style: vaultHeading(context, size: 11.5, color: scheme.primary, weight: 700)),
              const SizedBox(height: 4),
              Semantics(
                header: true,
                child: Text(headline, style: vaultHeading(context, size: 16, color: scheme.onSurface, weight: 700)),
              ),
              const SizedBox(height: 2),
              Text('$today · this week ${formatNumber(book.thisWeek)}', style: muted),
              const SizedBox(height: 10),
              _Weeks(book: book, goal: goal),
              const SizedBox(height: 10),
              // What the author said comes next, left at the end of the last sitting.
              if (next != null && notes[next.id] != null) ...[
                PinnedNote(note: notes[next.id]!),
                const SizedBox(height: 14),
              ],
              if (next != null)
                FilledButton.icon(
                  onPressed: carryOn,
                  icon: const Icon(Icons.edit_note),
                  label: Text('Carry on in “${next.displayTitle}”', maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
              Wrap(
                spacing: 4,
                children: [
                  if (goal == null || goal <= 0)
                    TextButton.icon(
                      onPressed: setGoal,
                      icon: const Icon(Icons.flag_outlined, size: 18),
                      label: const Text('Set a daily goal'),
                    ),
                  // The day as a card to post, as writers share their counts (`todays_page.dart`).
                  if (book.today > 0 || book.streak > 0)
                    TextButton.icon(
                      onPressed: () => showTodaysPage(context, ref, novelId),
                      icon: const Icon(Icons.ios_share, size: 18),
                      label: const Text('Share today’s page'),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The weeks, a row each from Monday, under the days' initials.
class _Weeks extends StatelessWidget {
  const _Weeks({required this.book, required this.goal});
  final DayBook book;
  final int? goal;

  static const _initials = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final small = Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant);
    return LayoutBuilder(
      builder: (context, box) {
        final cell = math.min(box.maxWidth / 7, 40.0);
        Widget row(List<Widget> cells) => Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [for (final c in cells) SizedBox(width: cell, child: c)],
        );
        return Column(
          children: [
            ExcludeSemantics(
              child: row([for (final d in _initials) Center(child: Text(d, style: small))]),
            ),
            const SizedBox(height: 2),
            for (var w = 0; w < book.days.length ~/ 7; w++)
              row([
                for (final d in book.days.skip(w * 7).take(7))
                  Semantics(
                    label: d.ahead
                        ? null
                        : '${shortDay(d.key)}${d.today ? ', today' : ''}: '
                              '${d.written ? plural(d.words, 'word') : 'nothing written'}',
                    // Rows set close, as lines in a diary: the card stays short above the contents.
                    child: SizedBox(
                      width: cell,
                      height: math.min(cell, 32),
                      child: CustomPaint(
                        painter: _DayMark(
                          day: d,
                          most: book.most,
                          goal: goal,
                          ink: scheme.primary,
                          faint: scheme.outlineVariant,
                        ),
                      ),
                    ),
                  ),
              ]),
          ],
        );
      },
    );
  }
}

/// One day: nothing for a day to come; a faint ring for a day not written; an ink mark for a day written, fuller and
/// darker with its words, with a splash of droplets on the biggest days; and today ringed, the ring closing on the goal.
class _DayMark extends CustomPainter {
  _DayMark({required this.day, required this.most, required this.goal, required this.ink, required this.faint});
  final BookDay day;
  final int most;
  final int? goal;
  final Color ink;
  final Color faint;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2 - 3;
    if (day.ahead) {
      canvas.drawCircle(c, 1.2, Paint()..color = faint);
      return;
    }
    if (day.written) {
      final share = math.sqrt(day.words / most).clamp(0.0, 1.0);
      final paint = Paint()..color = ink.withValues(alpha: 0.4 + 0.6 * share);
      final blot = r * (0.42 + 0.48 * share);
      canvas.drawCircle(c, blot, paint);
      if (share > 0.6) {
        // Droplets around the mark, the same for the same day every time.
        final rnd = math.Random(day.key.hashCode);
        for (var i = 0; i < 3; i++) {
          final a = rnd.nextDouble() * math.pi * 2;
          final d = blot + 1.5 + rnd.nextDouble() * 2;
          canvas.drawCircle(c + Offset(math.cos(a) * d, math.sin(a) * d), 0.8 + rnd.nextDouble() * 0.9, paint);
        }
      }
    } else {
      canvas.drawCircle(
        c,
        r * 0.32,
        Paint()
          ..color = faint
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );
    }
    if (day.today) {
      final ring = Rect.fromCircle(center: c, radius: r + 1);
      canvas.drawCircle(
        c,
        r + 1,
        Paint()
          ..color = faint
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      final g = goal;
      final part = g == null || g <= 0 ? (day.written ? 1.0 : 0.0) : (day.words / g).clamp(0.0, 1.0);
      if (part > 0) {
        canvas.drawArc(
          ring,
          -math.pi / 2,
          math.pi * 2 * part,
          false,
          Paint()
            ..color = ink
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2.4
            ..strokeCap = StrokeCap.round,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_DayMark old) =>
      old.day != day || old.most != most || old.goal != goal || old.ink != ink || old.faint != faint;
}
