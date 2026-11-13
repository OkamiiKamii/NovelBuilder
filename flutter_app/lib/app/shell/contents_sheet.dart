import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../features/characters/widgets/vault.dart';
import '../../features/progress/book_print_page.dart';
import '../../features/progress/book_story.dart';
import '../../features/progress/full_jacket.dart';
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
import 'loose_ends.dart';
import 'pinned_area.dart';
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
        // An area opened often from here, offered for the bar (`pinned_area.dart`).
        if (onGo != null) const PinOfferSlot(),
        // Where the author has just been in this book, a press from each (`trail.dart`).
        if (onGo != null)
          TrailRow(current: ref.read(routerProvider).routerDelegate.currentConfiguration.uri.toString(), onGo: onGo!),
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
        // The book told back as a story in pages (`features/progress/book_story.dart`), once there is some of it.
        if (novelId != null && novel != null && _wordsIn(store, novelId) > 0)
          _Keepsakes(
            title: novel.title,
            onStory: () =>
                showBookStory(context, novelId: novelId, onKeepWriting: onGo == null ? null : () => onGo!('/write')),
            onPrint: () => showBookPrint(context, novelId: novelId),
            onJacket: () => showFullJacket(context, novelId: novelId),
            onTrailer: () =>
                showTrailer(context, novelId: novelId, onKeepWriting: onGo == null ? null : () => onGo!('/write')),
          ),
        // What the story is waiting for, under Search (still reached first) and before the list of where things are.
        LooseEndsSlip(ends: ends, onGo: (e) => onGo?.call(e.path)),
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

/// THE KEEPSAKES, under Search: the book told back as a story in pages (`features/progress/book_story.dart`), and its
/// fingerprint, every paragraph a thread in the colour of whose it is (`features/progress/book_print_page.dart`). Two
/// tiles side by side, in their own colours.
class _Keepsakes extends StatelessWidget {
  const _Keepsakes({
    required this.title,
    required this.onStory,
    required this.onPrint,
    required this.onJacket,
    required this.onTrailer,
  });
  final String title;
  final VoidCallback onTrailer;
  final VoidCallback onStory;
  final VoidCallback onPrint;
  final VoidCallback onJacket;

  /// Each tile's width: two and a little of the third show on a phone, so the row says it goes on.
  static const _tile = 168.0;

  @override
  Widget build(BuildContext context) {
    final book = title.isEmpty ? 'your novel' : title;
    Widget tile(Widget child) => SizedBox(width: _tile, child: child);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            tile(
              _Keepsake(
                label: 'The trailer: $book as a film trailer, cut from its own lines',
                kicker: 'TRAILER',
                line: 'Your book as a film trailer, cut from its own lines.',
                icon: Icons.play_circle_outline,
                colours: const [Color(0xFF07070B), Color(0xFF2A0E12)],
                bars: true,
                onOpen: onTrailer,
              ),
            ),
            const SizedBox(width: 10),
            tile(
              _Keepsake(
                label: 'Your book so far: $book told as a story',
                kicker: 'SO FAR',
                line: 'Your words, days and people, told as a story.',
                icon: Icons.auto_stories_outlined,
                colours: const [Color(0xFF2B2350), Color(0xFF7A2E3A), Color(0xFF8A4B1C)],
                onOpen: onStory,
              ),
            ),
            const SizedBox(width: 10),
            tile(
              _Keepsake(
                label: 'Its fingerprint: $book as a print, every paragraph a thread',
                kicker: 'FINGERPRINT',
                line: 'Every paragraph a thread, in its character’s colour.',
                icon: Icons.fingerprint,
                colours: const [Color(0xFF14121A), Color(0xFF1F2B3A)],
                stripes: true,
                onOpen: onPrint,
              ),
            ),
            const SizedBox(width: 10),
            tile(
              _Keepsake(
                label: 'The full jacket: $book as a printed cover, back, spine and front',
                kicker: 'FULL JACKET',
                line: 'Back, spine and front, as a printer lays them out.',
                icon: Icons.menu_book_outlined,
                colours: const [Color(0xFF3A2A1C), Color(0xFF1A130D)],
                onOpen: onJacket,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Keepsake extends StatelessWidget {
  const _Keepsake({
    required this.label,
    required this.kicker,
    required this.line,
    required this.icon,
    required this.colours,
    required this.onOpen,
    this.stripes = false,
    this.bars = false,
  });

  final String label;
  final String kicker;
  final String line;
  final IconData icon;
  final List<Color> colours;
  final VoidCallback onOpen;

  /// A few threads of colour along its foot, as the print has.
  final bool stripes;

  /// Black bars above and below, as a film is shown on a wide screen.
  final bool bars;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFFF7F1E4);
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Material(
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: Ink(
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: colours, begin: Alignment.topLeft, end: Alignment.bottomRight),
          ),
          child: InkWell(
            onTap: onOpen,
            child: Container(
              foregroundDecoration: bars ? const _Letterbox() : null,
              padding: EdgeInsets.fromLTRB(14, bars ? 20 : 12, 12, bars ? 20 : 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          kicker,
                          style: vaultHeading(
                            context,
                            size: 10,
                            color: const Color(0xFFE8C46A),
                            weight: 700,
                          ).copyWith(letterSpacing: 2),
                        ),
                      ),
                      Icon(icon, color: ink, size: 20),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(line, style: vaultText(context, size: 14.5, color: ink)),
                  if (stripes) ...[
                    const Spacer(),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        for (final (i, c) in const [
                          Color(0xFF5B8DEF),
                          Color(0xFFE07A5F),
                          Color(0xFF81B29A),
                          Color(0xFFF2CC8F),
                          Color(0xFF9D7BD8),
                          Color(0xFF5B8DEF),
                          Color(0xFFE07A5F),
                        ].indexed)
                          Expanded(
                            child: Container(
                              height: 6.0 + (i * 7 % 11),
                              margin: const EdgeInsets.only(right: 2),
                              color: c.withValues(alpha: i.isEven ? 1 : 0.55),
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Black bars across the top and foot of a tile, as a film is shown on a wide screen.
class _Letterbox extends Decoration {
  const _Letterbox();

  @override
  BoxPainter createBoxPainter([VoidCallback? onChanged]) => _LetterboxPainter();
}

class _LetterboxPainter extends BoxPainter {
  @override
  void paint(Canvas canvas, Offset offset, ImageConfiguration configuration) {
    final size = configuration.size;
    if (size == null) return;
    final paint = Paint()..color = Colors.black;
    canvas
      ..drawRect(offset & Size(size.width, 9), paint)
      ..drawRect(Offset(offset.dx, offset.dy + size.height - 9) & Size(size.width, 9), paint);
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
