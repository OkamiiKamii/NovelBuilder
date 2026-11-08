import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../features/characters/widgets/vault.dart';
import '../../features/workspace/open_novel.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/progress.dart';
import '../../shared/domain/records/story_node.dart';
import '../destinations.dart';

/// A line of the contents: what an area holds now, said in a few words, and for Progress how far the draft has come
/// (0–1, when the novel has a target).
typedef Glimpse = ({String text, double? share});

/// Roman numerals for the areas' places in the book (I is the Library, VIII is Settings).
String roman(int n) {
  const values = [(10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')];
  final out = StringBuffer();
  var left = n;
  for (final (v, s) in values) {
    while (left >= v) {
      out.write(s);
      left -= v;
    }
  }
  return out.toString();
}

/// What the areas under More hold in the open novel, read from what is saved when the contents are opened. Nothing is
/// worked out while the sheet is closed.
Map<Destination, Glimpse> areaGlimpses(NovelStore store, String novelId, {required int now}) {
  int count(String collection) => store.rowsIn(novelId, collection).length;
  final novel = store.novel(novelId);
  final nodes = [for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)];
  final report = computeProgress(
    targetWordCount: novel?.targetWordCount,
    nodes: nodes,
    sessions: [for (final r in store.rowsIn(novelId, 'writingSessions')) WritingSession(r)],
    goals: [for (final r in store.rowsIn(novelId, 'goals')) Goal(r)],
    now: now,
  );
  final threads = count('plotThreads');
  final characters = store.rowsIn(novelId, 'loreEntries').where((r) => r['category'] == 'character').length;
  final ties = count('characterRelations');
  final facts = count('canonFacts');
  final rules = count('continuityRules');
  final target = report.targetWords;
  final words = formatNumber(report.totalWords);
  final today = report.today.net;
  return {
    Destination.plan: (
      text: threads == 0 ? 'Threads, structure and the board' : plural(threads, 'plot thread'),
      share: null,
    ),
    Destination.visualize: (
      text: characters == 0
          ? 'Webs, maps and timelines'
          : '${plural(characters, 'character')}${ties == 0 ? '' : ' · ${plural(ties, 'tie')}'}',
      share: null,
    ),
    Destination.review: (
      text: facts + rules == 0
          ? 'Canon and continuity'
          : [if (facts > 0) plural(facts, 'canon fact'), if (rules > 0) plural(rules, 'rule')].join(' · '),
      share: null,
    ),
    Destination.progress: (
      text: [
        target != null && target > 0 ? '$words of ${formatNumber(target)} words' : '$words words',
        if (today > 0) '+${formatNumber(today)} today',
      ].join(' · '),
      share: target != null && target > 0 ? (report.totalWords / target).clamp(0.0, 1.0) : null,
    ),
  };
}

/// MORE, AS THE BOOK'S CONTENTS: the areas not in the bottom bar as the lines of a contents page, each with its place
/// in the book in Roman numerals, its name in the vault's capitals, a dotted leader and what it holds now ("3 plot
/// threads", "11,380 of 80,000 words" with a hairline of how far). Search comes first; the tutorial follows.
class ContentsSheet extends ConsumerWidget {
  const ContentsSheet({
    super.key,
    required this.areas,
    required this.current,
    required this.onArea,
    required this.search,
    required this.extras,
  });

  final List<Destination> areas;
  final Destination? current;
  final ValueChanged<Destination> onArea;

  /// Searching the novel: first, under the heading, as it is what is reached for most.
  final Widget search;

  /// The tutorial: shown after the contents.
  final List<Widget> extras;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final novelId = ref.watch(openNovelProvider);
    final store = ref.watch(novelStoreProvider);
    final novel = novelId == null ? null : store.novel(novelId);
    final glimpses = novelId == null || novel == null
        ? const <Destination, Glimpse>{}
        : areaGlimpses(store, novelId, now: DateTime.now().millisecondsSinceEpoch);
    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(0, 0, 0, 12),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 4),
          child: Column(
            children: [
              Text('Contents', textAlign: TextAlign.center, style: vaultHeading(context, size: 20, weight: 700)),
              if (novel != null && novel.title.isNotEmpty)
                Text(
                  novel.title,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: vaultText(context, size: 16, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                ),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 48), child: VaultRule()),
            ],
          ),
        ),
        search,
        for (final d in areas)
          _ContentsLine(area: d, glimpse: glimpses[d], selected: d == current, onTap: () => onArea(d)),
        if (extras.isNotEmpty) ...[
          const Padding(padding: EdgeInsets.symmetric(horizontal: 72), child: VaultRule()),
          ...extras,
        ],
      ],
    );
  }
}

class _ContentsLine extends StatelessWidget {
  const _ContentsLine({required this.area, required this.glimpse, required this.selected, required this.onTap});

  final Destination area;
  final Glimpse? glimpse;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ink = selected ? scheme.primary : scheme.onSurface;
    final g = glimpse;
    return Semantics(
      selected: selected,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 10, 24, 10),
            child: Row(
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(minWidth: 44),
                  child: ExcludeSemantics(
                    child: Text(
                      roman(area.index + 1),
                      style: vaultText(context, size: 17, style: FontStyle.italic, color: scheme.primary),
                    ),
                  ),
                ),
                Icon(selected ? area.selectedIcon : area.icon, size: 22, color: ink),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      LayoutBuilder(
                        builder: (context, box) {
                          final style = vaultHeading(context, size: 15, weight: 700, color: ink);
                          final label = TextPainter(
                            text: TextSpan(text: area.label, style: style),
                            textDirection: Directionality.of(context),
                            textScaler: MediaQuery.textScalerOf(context),
                          )..layout();
                          final fits = label.width + 32 <= box.maxWidth;
                          label.dispose();
                          // The leader runs to the line's end, as from a chapter to its page; a name too long for
                          // one (very large text) wraps on its own.
                          return fits
                              ? Row(
                                  children: [
                                    Text(area.label, style: style),
                                    const Expanded(child: ExcludeSemantics(child: _Leader())),
                                  ],
                                )
                              : Text(area.label, style: style);
                        },
                      ),
                      if (g != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          g.text,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: vaultText(
                            context,
                            size: 15.5,
                            style: FontStyle.italic,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                        if (g.share case final share?) ...[
                          const SizedBox(height: 6),
                          ExcludeSemantics(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(2),
                              child: LinearProgressIndicator(
                                value: share,
                                minHeight: 3,
                                color: scheme.primary,
                                backgroundColor: scheme.outlineVariant.withValues(alpha: 0.5),
                              ),
                            ),
                          ),
                        ],
                      ],
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
}

/// The dotted leader of a contents line.
class _Leader extends StatelessWidget {
  const _Leader();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 8, top: 6),
    child: CustomPaint(
      size: const Size.fromHeight(4),
      painter: _Dots(Theme.of(context).colorScheme.outline.withValues(alpha: 0.7)),
    ),
  );
}

class _Dots extends CustomPainter {
  _Dots(this.colour);
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = colour;
    for (var x = 1.5; x < size.width; x += 6) {
      canvas.drawCircle(Offset(x, size.height / 2), 1, paint);
    }
  }

  @override
  bool shouldRepaint(_Dots old) => old.colour != colour;
}
