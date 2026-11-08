import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../shared/domain/records/novel.dart';
import '../characters/widgets/vault.dart';
import 'bookcase.dart';
import 'bookshelf.dart';
import 'idea_draw.dart';

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

class StageShelves extends StatelessWidget {
  const StageShelves({super.key, required this.novels, required this.spines});

  /// In the order chosen (pinned first); each shelf keeps it.
  final List<Novel> novels;
  final bool spines;

  @override
  Widget build(BuildContext context) {
    final byStage = {for (final s in ShelfStage.values) s: <Novel>[]};
    for (final n in novels) {
      byStage[stageOf(n.status)]!.add(n);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final stage in ShelfStage.values)
          if (byStage[stage]!.isNotEmpty || (stage == ShelfStage.writing && byStage[ShelfStage.ideas]!.isNotEmpty)) ...[
            Nameplate(label: stage.label, count: byStage[stage]!.length),
            const SizedBox(height: 10),
            if (byStage[stage]!.isEmpty)
              IdeaDraw(ideas: byStage[ShelfStage.ideas]!)
            else if (spines)
              Bookcase(novels: byStage[stage]!)
            else
              Bookshelf(novels: byStage[stage]!),
            const SizedBox(height: 26),
          ],
      ],
    );
  }
}

/// A brass plate with the shelf's name in the vault's capitals and how many books stand on it.
class Nameplate extends StatelessWidget {
  const Nameplate({super.key, required this.label, required this.count});
  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF2A1C08);
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Semantics(
        header: true,
        label: '$label, ${plural(count, 'book')}',
        excludeSemantics: true,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(3),
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFE6C886), Color(0xFFC49A4C), Color(0xFFD9B66E)],
              stops: [0, 0.55, 1],
            ),
            border: Border.all(color: const Color(0xFF8A6326)),
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
                  style: vaultText(context, size: 15, color: ink, style: FontStyle.italic),
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
  Widget build(BuildContext context) => Container(
    width: 6,
    height: 6,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: const Color(0xFF9C7433),
      border: Border.all(color: const Color(0xFF6E4E1C), width: 0.8),
    ),
  );
}
