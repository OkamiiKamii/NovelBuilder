import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/book_faces.dart';
import '../../app/theme/novel_art.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../shared/data/novel_store.dart' show NovelStats;
import '../../shared/domain/records/novel.dart';
import '../characters/widgets/vault.dart';
import 'bookcase.dart';
import 'bookshelf.dart';
import 'idea_cards.dart';
import 'idea_draw.dart';
import 'idea_jot.dart';
import 'library_actions.dart';
import 'shelf_row.dart';

/// SHELVES BY STAGE: the library as a study, the books being written on the top shelf and the ideas below, then those
/// set aside and those finished, each shelf with a brass nameplate. When nothing is being written the top shelf is an
/// empty place that offers to draw one of the ideas (`idea_draw.dart`). Used when the whole library is shown (no
/// search, filter or archive); otherwise the books are one shelf as before.
enum ShelfStage {
  writing('Writing now'),
  ideas('Ideas'),
  aside('Set aside'),
  finished('Finished');

  const ShelfStage(this.label);
  final String label;
}

ShelfStage stageOf(NovelStatus status) => switch (status) {
  NovelStatus.drafting || NovelStatus.revising => ShelfStage.writing,
  NovelStatus.planning => ShelfStage.ideas,
  NovelStatus.onHold => ShelfStage.aside,
  NovelStatus.complete => ShelfStage.finished,
};

/// THE SHELVES SEE WHAT YOU WRITE: how long after it was last written in an idea still stands with the books being
/// written. A book begun from its title page, or written in straight from the Ideas shelf, keeps the label Planning
/// until the author changes it; the library went by the label alone, and said "Nothing being written" (and "0 In
/// progress") on the day the author wrote in it.
const writtenLately = Duration(days: 14);

/// Whether [novel] is marked an idea (Planning) but was written in within [writtenLately] of [now]: it is being
/// written, whatever its label says. Its label is left as it is: only the author changes it.
bool writtenInLately(Novel novel, NovelStats? stats, DateTime now) {
  final at = stats?.lastWrittenAt;
  return novel.status == NovelStatus.planning &&
      at != null &&
      now.millisecondsSinceEpoch - at <= writtenLately.inMilliseconds;
}

/// The shelf [novel] stands on: by its label, or with the books being written when it is an idea written in lately.
ShelfStage shelfOf(Novel novel, NovelStats? stats, DateTime now) =>
    writtenInLately(novel, stats, now) ? ShelfStage.writing : stageOf(novel.status);

/// "Written today", "Written yesterday", "Written 5 days ago": when an idea written in lately last was.
String lastWritten(num at, DateTime now) {
  final then = DateTime.fromMillisecondsSinceEpoch(at.toInt());
  final days = DateTime(now.year, now.month, now.day).difference(DateTime(then.year, then.month, then.day)).inDays;
  return switch (days) {
    <= 0 => 'Written today',
    1 => 'Written yesterday',
    _ => 'Written $days days ago',
  };
}

/// A book's line under its title: when an idea was written in lately (first, so a narrow card still shows it), its
/// label and its genres ("Written today · Planning · Fantasy").
String shelfLine(Novel novel, NovelStats? stats, DateTime now) {
  final genres = [novel.primaryGenre, ...novel.secondaryGenres].where((g) => g.isNotEmpty).join(', ');
  return [
    if (writtenInLately(novel, stats, now)) lastWritten(stats!.lastWrittenAt!, now),
    novel.status.label,
    if (genres.isNotEmpty) genres,
  ].join(' · ');
}

class StageShelves extends StatefulWidget {
  const StageShelves({super.key, required this.novels, required this.spines, this.stats = const {}, this.now});

  /// In the order chosen (pinned first); each shelf keeps it.
  final List<Novel> novels;
  final bool spines;

  /// What each novel holds and when it was last written in, by novel.
  final Map<String, NovelStats> stats;

  /// Today, for a test; the clock otherwise.
  final DateTime? now;

  /// On a phone, a shelf of more than this many is a row to swipe ([ShelfRow]), with "See all" for the full grid.
  static const swipedAfter = 2;

  @override
  State<StageShelves> createState() => _StageShelvesState();
}

class _StageShelvesState extends State<StageShelves> {
  /// The shelves opened out to every book (on a phone).
  final _all = <ShelfStage>{};

  @override
  Widget build(BuildContext context) {
    final byStage = {for (final s in ShelfStage.values) s: <Novel>[]};
    final now = widget.now ?? DateTime.now();
    final unlabelled = <Novel>[];
    for (final n in widget.novels) {
      byStage[shelfOf(n, widget.stats[n.id], now)]!.add(n);
      if (writtenInLately(n, widget.stats[n.id], now)) unlabelled.add(n);
    }
    final phone = WindowSize.of(context) == WindowSize.compact;
    Widget shelf(ShelfStage stage) {
      final books = byStage[stage]!;
      if (widget.spines) return Bookcase(novels: books);
      if (!phone || books.length <= StageShelves.swipedAfter) return Bookshelf(novels: books);
      final all = _all.contains(stage);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (all) Bookshelf(novels: books) else ShelfRow(novels: books),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton.icon(
              onPressed: () => setState(() => all ? _all.remove(stage) : _all.add(stage)),
              icon: Icon(all ? Icons.view_carousel_outlined : Icons.grid_view),
              label: Text(all ? 'Back to the shelf' : 'See all ${formatNumber(books.length)}'),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final stage in ShelfStage.values)
          // The Ideas shelf always stands, so there is always a line to jot an idea on.
          if (byStage[stage]!.isNotEmpty ||
              stage == ShelfStage.ideas ||
              (stage == ShelfStage.writing && byStage[ShelfStage.ideas]!.isNotEmpty)) ...[
            Nameplate(label: stage.label, count: byStage[stage]!.length),
            const SizedBox(height: 10),
            // Ideas written in lately stand here; a line offers to give them the label they have earned.
            if (stage == ShelfStage.writing && unlabelled.isNotEmpty) ...[
              StillMarkedIdeas(novels: unlabelled),
              const SizedBox(height: 12),
            ],
            // Ideas without a premise: a note offering to give each a line (`idea_cards.dart`).
            if (stage == ShelfStage.ideas) ...[const IdeaJot(), IdeaCardsNote(ideas: byStage[stage]!)],
            if (byStage[stage]!.isNotEmpty)
              shelf(stage)
            else if (stage == ShelfStage.writing)
              IdeaDraw(ideas: byStage[ShelfStage.ideas]!),
            const SizedBox(height: 26),
          ],
      ],
    );
  }
}

/// On the Writing now shelf, over the ideas that stand there because they were written in lately: why they are there,
/// and one press to label them Drafting (Undo puts them back). Nothing changes until it is pressed.
class StillMarkedIdeas extends ConsumerWidget {
  const StillMarkedIdeas({super.key, required this.novels});

  final List<Novel> novels;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    String title(Novel n) => '“${n.title.isEmpty ? 'Untitled novel' : n.title}”';
    final one = novels.length == 1;
    final names = novels.length <= 3
        ? novels.map(title).join(novels.length == 2 ? ' and ' : ', ')
        : '${novels.take(2).map(title).join(', ')} and ${formatNumber(novels.length - 2)} more';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.55)),
        color: scheme.surface,
      ),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.end,
        spacing: 8,
        children: [
          Row(
            children: [
              Icon(Icons.edit_note, color: scheme.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  one
                      ? 'You have been writing $names, so it stands here. It is still marked Planning.'
                      : 'You have been writing $names, so they stand here. They are still marked Planning.',
                  style: vaultText(context, size: 16),
                ),
              ),
            ],
          ),
          TextButton(
            onPressed: () => markDraftingFlow(context, ref, novels),
            child: Text(one ? 'Mark it Drafting' : 'Mark them Drafting'),
          ),
        ],
      ),
    );
  }
}

/// A plate (brass, or dark glass in System Monolith) with the shelf's name in the vault's capitals and how many books stand on it.
class Nameplate extends StatelessWidget {
  const Nameplate({super.key, required this.label, required this.count});
  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    // Brass, or the system style's dark glass edged in gold (`novel_art.dart`).
    final plate = NovelArt.of(context).plate;
    final ink = plate.ink;
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Semantics(
        header: true,
        label: '$label, ${plural(count, 'book')}',
        excludeSemantics: true,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(3),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: plate.ground,
              stops: const [0, 0.55, 1],
            ),
            border: Border.all(color: plate.border),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 3, offset: const Offset(0, 1)),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 5, 12, 5),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // A screw head at each end, as on a fixed plate.
                const _Screw(),
                const SizedBox(width: 10),
                Flexible(
                  child: Text(label, style: vaultHeading(context, size: 13, weight: 700, color: ink)),
                ),
                const SizedBox(width: 10),
                Text(
                  formatNumber(count),
                  style: numberStyle(context, vaultText(context, size: 15, color: ink, style: FontStyle.italic)),
                ),
                const SizedBox(width: 10),
                const _Screw(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Screw extends StatelessWidget {
  const _Screw();

  @override
  Widget build(BuildContext context) {
    final plate = NovelArt.of(context).plate;
    return Container(
      width: 6,
      height: 6,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: plate.screw,
        border: Border.all(color: plate.screwRim, width: 0.8),
      ),
    );
  }
}
