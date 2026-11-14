import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../features/characters/widgets/vault.dart';
import '../../features/progress/best_lines_page.dart';
import '../../features/progress/book_print_page.dart';
import '../../features/progress/book_quiz_page.dart';
import '../../features/progress/book_story.dart';
import '../../features/progress/full_jacket.dart';
import '../../features/progress/gazette_page.dart';
import '../../features/progress/postcards_page.dart';
import '../../features/progress/sampler_page.dart';
import '../../features/progress/trailer.dart';
import '../../features/search/book_index_page.dart';
import '../../features/workspace/open_novel.dart';
import '../../features/write/write_providers.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/progress.dart';
import '../../shared/domain/records/story_node.dart';
import '../destinations.dart';
import '../router.dart';
import 'contents_parts.dart';
import 'keepsakes.dart';
import 'loose_ends.dart';
import 'pinned_area.dart';
import 'proof_card.dart';
import 'today_from_your_book.dart';
import 'trail.dart';
import 'vignettes.dart';

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
    this.onGo,
  });

  final List<Destination> areas;
  final Destination? current;
  final ValueChanged<Destination> onArea;

  /// Opens a page by its path: where a loose end leads (`loose_ends.dart`). Without it, no loose ends are shown.
  final ValueChanged<String>? onGo;

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
    // A line in the book, opened where it is: the chapter, with find on the line, at its paragraph.
    final void Function(String nodeId, String text, int block)? readAt = onGo == null
        ? null
        : (nodeId, text, block) {
            ref.read(pendingFindProvider.notifier).request((
              nodeId: nodeId,
              term: text.replaceAll(RegExp(r'^[“"]|[”"]$'), ''),
              block: block,
            ));
            ref.read(selectedNodeProvider.notifier).select(nodeId);
            onGo!('/write');
          };
    final glimpses = novelId == null || novel == null
        ? const <Destination, Glimpse>{}
        : areaGlimpses(store, novelId, now: DateTime.now().millisecondsSinceEpoch);
    final ends = novelId == null || novel == null || onGo == null
        ? const <LooseEnd>[]
        : looseEnds(store, novelId, now: DateTime.now());
    final pictures = novelId == null || novel == null
        ? const <Destination, Vignette>{}
        : areaVignettes(store, novelId, now: DateTime.now());
    final pinned = ref.watch(pinnedAreaProvider);
    final hasWords = novelId != null && novel != null && _wordsIn(store, novelId) > 0;
    // Where each part's heading is, for the strip of parts to go to.
    final partKeys = {for (final p in ContentsPart.values) p: GlobalKey()};
    final stripHeight = PartStripHeader.heightFor(MediaQuery.textScalerOf(context));
    // The contents scroll as a whole, sized to what they hold. Each run of them is one box, built in full as the sheet
    // opens (a list that shrinks to fit builds only what shows), so a screen reader reaches every part; between the
    // first run and the parts, the strip of parts is held at the top.
    return CustomScrollView(
      shrinkWrap: true,
      slivers: [
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
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
              // An area opened often from here, offered for the bar (`pinned_area.dart`).
              if (onGo != null) const PinOfferSlot(),
              // Where the author has just been in this book, a press from each (`trail.dart`).
              if (onGo != null)
                TrailRow(
                  current: ref.read(routerProvider).routerDelegate.currentConfiguration.uri.toString(),
                  onGo: onGo!,
                ),
              search,
              // The index at the back of the book (`features/search/book_index_page.dart`): every name, A to Z.
              if (novelId != null && novel != null && onGo != null && _wordsIn(store, novelId) > 0)
                ListTile(
                  leading: const Icon(Icons.format_list_bulleted),
                  title: const Text('The index'),
                  subtitle: const Text('Every name in the book, A to Z', maxLines: 1, overflow: TextOverflow.ellipsis),
                  onTap: () => showBookIndex(
                    context,
                    novelId: novelId,
                    onOpen: (nodeId, term, block) {
                      // The chapter opens with find on the name, at the paragraph it is in.
                      ref.read(pendingFindProvider.notifier).request((nodeId: nodeId, term: term, block: block));
                      ref.read(selectedNodeProvider.notifier).select(nodeId);
                      onGo!('/write');
                    },
                  ),
                ),
            ],
          ),
        ),
        // The parts of the contents, one press to each (`contents_parts.dart`), once there is more than the areas: held
        // at the top as the contents scroll.
        if (hasWords)
          SliverPersistentHeader(
            pinned: true,
            delegate: PartStripHeader(
              height: stripHeight,
              colour: Theme.of(context).bottomSheetTheme.backgroundColor ?? scheme.surfaceContainerLow,
              strip: PartStrip(
                parts: ContentsPart.values,
                onPart: (p) {
                  // The part's heading at the top, just under the strip held there.
                  final at = partKeys[p]!.currentContext?.findRenderObject();
                  if (at == null) return;
                  final viewport = RenderAbstractViewport.of(at);
                  final position = Scrollable.of(partKeys[p]!.currentContext!).position;
                  final to = (viewport.getOffsetToReveal(at, 0).offset - stripHeight).clamp(
                    position.minScrollExtent,
                    position.maxScrollExtent,
                  );
                  position.animateTo(to, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
                },
              ),
            ),
          ),
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // PART ONE, today: a card made from the book, new each day (`today_from_your_book.dart`), and what the story
              // is waiting for.
              if (hasWords || ends.isNotEmpty) PartHeading(key: partKeys[ContentsPart.today], part: ContentsPart.today),
              if (novelId != null && novel != null && hasWords)
                TodayFromYourBook(
                  key: ValueKey((novelId, dayNumber(DateTime.now()))),
                  novelId: novelId,
                  day: dayNumber(DateTime.now()),
                  onRead: readAt,
                  onLines: () => showBestLines(context, novelId: novelId, onRead: readAt),
                  onQuiz: () => showBookQuiz(context, novelId: novelId, onRead: readAt),
                  onStory: () => showBookStory(
                    context,
                    novelId: novelId,
                    onKeepWriting: onGo == null ? null : () => onGo!('/write'),
                  ),
                ),
              LooseEndsSlip(ends: ends, onGo: (e) => onGo?.call(e.path)),
              // PART TWO, before it goes out: what a proofreader would mark (`proof_card.dart`), and the submission kit.
              if (hasWords) PartHeading(key: partKeys[ContentsPart.polish], part: ContentsPart.polish),
              if (novelId != null && novel != null && hasWords)
                ProofCard(
                  key: ValueKey(('proof', novelId)),
                  novelId: novelId,
                  title: novel.title,
                  onRead: readAt,
                  onChapter: onGo == null
                      ? null
                      : (nodeId) {
                          ref.read(selectedNodeProvider.notifier).select(nodeId);
                          onGo!('/write');
                        },
                ),
              // PART THREE, made from the book: everything it can be made into (`keepsakes.dart`), a row and the shelf.
              if (hasWords) PartHeading(key: partKeys[ContentsPart.keepsakes], part: ContentsPart.keepsakes),
              if (novelId != null && novel != null && hasWords)
                KeepsakeRow(
                  keepsakes: keepsakesOf(
                    title: novel.title,
                    gazette: () => showGazette(
                      context,
                      novelId: novelId,
                      onRead: readAt,
                      onKeepWriting: onGo == null ? null : () => onGo!('/write'),
                    ),
                    quiz: () => showBookQuiz(context, novelId: novelId, onRead: readAt),
                    postcards: () => showPostcards(context, novelId: novelId, onRead: readAt),
                    trailer: () => showTrailer(
                      context,
                      novelId: novelId,
                      onKeepWriting: onGo == null ? null : () => onGo!('/write'),
                    ),
                    lines: () => showBestLines(context, novelId: novelId, onRead: readAt),
                    sampler: () => showSampler(context, novelId: novelId),
                    story: () => showBookStory(
                      context,
                      novelId: novelId,
                      onKeepWriting: onGo == null ? null : () => onGo!('/write'),
                    ),
                    print: () => showBookPrint(context, novelId: novelId),
                    jacket: () => showFullJacket(context, novelId: novelId),
                  ),
                ),
              // PART FOUR, the book: its areas, each with what it holds now. (Alone, with no words yet, they need no heading.)
              if (hasWords) PartHeading(key: partKeys[ContentsPart.book], part: ContentsPart.book),
              for (final d in areas)
                _ContentsLine(
                  area: d,
                  glimpse: glimpses[d],
                  picture: pictures[d],
                  selected: d == current,
                  onTap: () => onArea(d),
                  // On a phone's More, each area can be kept on the bar; the one kept says so, and its pin takes it off.
                  pinned: onGo == null || !pinnableAreas.contains(d) ? null : pinned == d,
                  onPin: () {
                    final was = pinned;
                    ref.read(pinnedAreaProvider.notifier).pin(pinned == d ? null : d);
                    final messenger = ScaffoldMessenger.maybeOf(context);
                    messenger?.hideCurrentSnackBar();
                    messenger?.showSnackBar(
                      SnackBar(
                        content: Text(
                          pinned == d
                              ? '${d.label} is off the bar; it is here under More.'
                              : was == null
                              ? '${d.label} is on the bar, one press away.'
                              : '${d.label} is on the bar, in place of ${was.label}.',
                        ),
                      ),
                    );
                  },
                ),
              if (extras.isNotEmpty) ...[
                const Padding(padding: EdgeInsets.symmetric(horizontal: 72), child: VaultRule()),
                ...extras,
              ],
            ],
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 12)),
      ],
    );
  }
}

class _ContentsLine extends StatelessWidget {
  const _ContentsLine({
    required this.area,
    required this.glimpse,
    required this.selected,
    required this.onTap,
    this.picture,
    this.pinned,
    this.onPin,
  });

  final Destination area;
  final Glimpse? glimpse;

  /// Whether the area is kept on the bar (null: it cannot be, here), and the pin that keeps it or takes it off.
  final bool? pinned;
  final VoidCallback? onPin;

  /// What the area holds, drawn small under its words (`vignettes.dart`).
  final Vignette? picture;
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
                        if (picture case final p?) ...[const SizedBox(height: 6), VignetteView(p)],
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
                if (pinned case final on?)
                  IconButton(
                    tooltip: on ? 'Take ${area.label} off the bar' : 'Keep ${area.label} on the bar',
                    isSelected: on,
                    color: on ? scheme.primary : scheme.onSurfaceVariant,
                    onPressed: onPin,
                    icon: const Icon(Icons.push_pin_outlined),
                    selectedIcon: const Icon(Icons.push_pin),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

int _wordsIn(NovelStore store, String novelId) =>
    store.rowsIn(novelId, 'chapters').fold(0, (n, r) => n + StoryNode(r).wordCount);

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
