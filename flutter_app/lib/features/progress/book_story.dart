import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/background.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/book_story.dart';
import '../../shared/domain/analytics/progress.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/named_in.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';

/// YOUR BOOK SO FAR on screen (`shared/domain/analytics/book_story.dart` reads the facts): the novel told back as a
/// short story in pages, each a full screen of its own colour with one big thing on it, turned by a press on either
/// side or a swipe, each a press from sharing as a picture the shape of a story post (1080 by 1920). The last page
/// says what comes next, with Keep writing. It only reads.

/// A page's size, drawn three times over for the picture.
const storyPageSize = Size(360, 640);

/// The story's inputs from what is saved for [novelId].
StoryInputs storyInputsOf(NovelStore store, String novelId) {
  final novel = store.novel(novelId);
  final nodes = [for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)];
  final perDay = <String, int>{};
  for (final r in store.rowsIn(novelId, 'writingSessions')) {
    final s = WritingSession(r);
    if (s.day.isNotEmpty) perDay[s.day] = (perDay[s.day] ?? 0) + s.netWords;
  }
  final entries = [for (final r in store.rowsIn(novelId, 'loreEntries')) Entry(r)];
  final profiles = <String, CharacterProfile>{
    for (final r in store.rowsIn(novelId, 'characterProfiles')) str(r['entryId']): CharacterProfile(r),
  };
  final names = namesToFind(entries, profiles);
  return (
    title: novel?.title ?? '',
    target: novel?.targetWordCount,
    chapters: [
      for (final n in readingOrder(nodes))
        if (isDocument(n.kind)) (id: n.id, title: n.displayTitle, words: n.wordCount),
    ],
    days: [for (final MapEntry(key: day, value: words) in perDay.entries) (day: day, words: words)],
    people: [
      for (final e in entries)
        if (e.category == 'character' && e.name.trim().isNotEmpty)
          (id: e.id, name: e.name.trim(), names: names[e.id] ?? [e.name.trim()]),
    ],
  );
}

/// Opens the story of [novelId], full screen. [onKeepWriting] goes back to the writing, from its last page.
Future<void> showBookStory(BuildContext context, {required String novelId, VoidCallback? onKeepWriting}) =>
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        opaque: true,
        pageBuilder: (_, _, _) => BookStoryScreen(novelId: novelId, onKeepWriting: onKeepWriting),
        transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
      ),
    );

class BookStoryScreen extends ConsumerStatefulWidget {
  const BookStoryScreen({super.key, required this.novelId, this.onKeepWriting});

  final String novelId;
  final VoidCallback? onKeepWriting;

  @override
  ConsumerState<BookStoryScreen> createState() => _BookStoryScreenState();
}

class _BookStoryScreenState extends ConsumerState<BookStoryScreen> {
  BookStory? _story;
  final _pages = PageController();
  int _at = 0;
  final _keys = <int, GlobalKey>{};
  bool _working = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final inputs = storyInputsOf(store, widget.novelId);
    ref.read(runAsideProvider)(bookStoryJob(inputs, store.rawJsonIn(widget.novelId, 'chapterContents'))).then(
      (story) {
        if (mounted) setState(() => _story = story);
      },
      onError: (Object e, StackTrace s) =>
          FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'progress')),
    );
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _go(int to, int count) {
    if (to < 0 || to >= count) return;
    _pages.animateToPage(
      to,
      duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _share() async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final boundary = _keys[_at]!.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final said = await ref
          .read(backupFilesProvider)
          .saveFile('book-so-far-${_at + 1}.png', png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final story = _story;
    if (story == null) {
      return const Scaffold(
        backgroundColor: Color(0xFF15131C),
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final pages = storyPages(context, story);
    final palette = _palette[_at % _palette.length];
    return Scaffold(
      backgroundColor: palette.last,
      body: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: _pages,
              itemCount: pages.length,
              onPageChanged: (i) => setState(() {
                _at = i;
                _message = null;
              }),
              itemBuilder: (context, i) => GestureDetector(
                behavior: HitTestBehavior.opaque,
                // A press on the left goes back, on the right on, as a story's pages turn.
                onTapUp: (d) {
                  final width = MediaQuery.sizeOf(context).width;
                  _go(d.localPosition.dx < width / 3 ? i - 1 : i + 1, pages.length);
                },
                child: Center(
                  child: FittedBox(
                    child: RepaintBoundary(
                      key: _keys.putIfAbsent(i, GlobalKey.new),
                      child: _StoryPage(index: i, count: pages.length, child: pages[i]),
                    ),
                  ),
                ),
              ),
            ),
            // How far through: a bar for each page, as a story shows it.
            Positioned(
              left: 12,
              right: 12,
              top: 8,
              child: Row(
                children: [
                  for (var i = 0; i < pages.length; i++)
                    Expanded(
                      child: Container(
                        height: 3,
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: i <= _at ? 0.9 : 0.28),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Positioned(
              right: 4,
              top: 16,
              child: IconButton(
                tooltip: 'Close',
                color: Colors.white,
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 12,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_message != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        _message!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 10,
                    runSpacing: 8,
                    children: [
                      // On the last page, back to the writing (outside the page, so never in its picture).
                      if (_at == pages.length - 1 && widget.onKeepWriting != null)
                        FilledButton.icon(
                          style: FilledButton.styleFrom(
                            backgroundColor: _gold,
                            foregroundColor: const Color(0xFF1E1606),
                          ),
                          onPressed: _keepWriting,
                          icon: const Icon(Icons.edit_note),
                          label: const Text('Keep writing'),
                        ),
                      FilledButton.tonalIcon(
                        onPressed: _working ? null : _share,
                        icon: const Icon(Icons.ios_share),
                        label: const Text('Share this page'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _keepWriting() {
    Navigator.of(context).pop();
    widget.onKeepWriting?.call();
  }
}

/// Deep colours, a page each, light ink on all of them.
const _palette = <List<Color>>[
  [Color(0xFF2B2350), Color(0xFF120F24)],
  [Color(0xFF7A2E3A), Color(0xFF2A0F16)],
  [Color(0xFF1F5A4C), Color(0xFF0B231D)],
  [Color(0xFF8A4B1C), Color(0xFF2E1708)],
  [Color(0xFF1D4E78), Color(0xFF0A1C2D)],
  [Color(0xFF5B2A6E), Color(0xFF1E0D26)],
  [Color(0xFF3F5A1E), Color(0xFF151F08)],
  [Color(0xFF6E2A1E), Color(0xFF250C07)],
  [Color(0xFF253A5E), Color(0xFF0C1322)],
];

const _ink = Color(0xFFF7F1E4);
const _gold = Color(0xFFE8C46A);

/// One page at its own size, on its colour, with the book's mark at the foot.
class _StoryPage extends StatelessWidget {
  const _StoryPage({required this.index, required this.count, required this.child});
  final int index;
  final int count;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colours = _palette[index % _palette.length];
    return SizedBox.fromSize(
      size: storyPageSize,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: colours, begin: Alignment.topLeft, end: Alignment.bottomRight),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(30, 56, 30, 70),
          child: DefaultTextStyle(
            style: vaultText(context, size: 18, color: _ink),
            textAlign: TextAlign.center,
            child: Column(
              children: [
                Expanded(child: Center(child: child)),
                Text(
                  'NOVEL BUILDER  ·  ${index + 1} / $count',
                  style: vaultHeading(
                    context,
                    size: 8,
                    color: _ink.withValues(alpha: 0.5),
                  ).copyWith(letterSpacing: 2.4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The pages of [story], those it has something for.
List<Widget> storyPages(BuildContext context, BookStory story) {
  TextStyle big(double size) => vaultHeading(context, size: size, color: _ink, weight: 700);
  TextStyle kicker() => vaultHeading(context, size: 11, color: _gold, weight: 700).copyWith(letterSpacing: 3);
  TextStyle small() => vaultText(context, size: 16, color: _ink.withValues(alpha: 0.82));
  TextStyle quote() => vaultText(context, size: 20, color: _ink, style: FontStyle.italic);
  Widget column(List<Widget> children) =>
      Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.center, children: children);
  const gap = SizedBox(height: 14);
  String day(String key) => mediumDay(key);

  return [
    column([
      Text('YOUR BOOK SO FAR', style: kicker()),
      gap,
      Text(story.title.isEmpty ? 'Your novel' : story.title, style: big(36)),
      gap,
      Text('A story in pages, read from your own.', style: small()),
    ]),
    column([
      Text('YOU HAVE WRITTEN', style: kicker()),
      gap,
      Text(formatNumber(story.words), style: big(64)),
      Text('words', style: small()),
      gap,
      Text(
        '${plural(story.pages, 'page')} · a ${formatNumber(story.minutes)}-minute read · '
        '${plural(story.chapters, 'chapter')}',
        style: small(),
      ),
    ]),
    if (story.daysWritten > 0)
      column([
        Text('DAYS AT THE DESK', style: kicker()),
        gap,
        Text(formatNumber(story.daysWritten), style: big(64)),
        Text(
          story.firstDay == null ? 'days of writing' : 'days of writing since ${day(story.firstDay!)}',
          style: small(),
        ),
        gap,
        if (story.longestRun > 1) Text('Your longest run: ${story.longestRun} days in a row', style: small()),
        if (story.bestDay case final best?)
          Text('Your best day: ${day(best.day)}, ${plural(best.words, 'word')}', style: small()),
      ]),
    if (story.biggest case final biggest?)
      column([
        Text('YOUR BIGGEST CHAPTER', style: kicker()),
        gap,
        Text(biggest.title, style: big(34)),
        gap,
        Text(plural(biggest.words, 'word'), style: small()),
      ]),
    if (story.lead case final lead?)
      column([
        Text('YOUR BOOK IS ABOUT', style: kicker()),
        gap,
        Text(lead.name, style: big(40)),
        gap,
        Text('named ${plural(lead.mentions, 'time')} in your pages', style: small()),
      ]),
    if (story.talker case final talker?)
      column([
        Text('WHO TALKS MOST', style: kicker()),
        gap,
        Text(talker.name, style: big(34)),
        Text(plural(talker.lines, 'line'), style: small()),
        const SizedBox(height: 24),
        Text('“${talker.line}”', style: quote(), maxLines: 4, overflow: TextOverflow.ellipsis),
      ]),
    if (story.leanWords.isNotEmpty)
      column([
        Text('THE WORDS YOU LEAN ON', style: kicker()),
        gap,
        for (final (i, w) in story.leanWords.indexed)
          Text(
            w.word,
            style: big(
              40 - i * 4.0,
            ).copyWith(color: i.isEven ? _ink : _gold, fontWeight: i == 0 ? FontWeight.w800 : FontWeight.w600),
          ),
        gap,
        Text('“${story.leanWords.first.word}”, ${plural(story.leanWords.first.count, 'time')}', style: small()),
      ]),
    if (story.opening.isNotEmpty)
      column([
        Text('IT BEGINS', style: kicker()),
        gap,
        Text(story.opening, style: quote(), maxLines: 5, overflow: TextOverflow.ellipsis),
        if (story.latest.isNotEmpty && story.latest != story.opening) ...[
          const SizedBox(height: 30),
          Text('AND IT STANDS', style: kicker()),
          gap,
          Text(story.latest, style: quote(), maxLines: 5, overflow: TextOverflow.ellipsis),
        ],
      ]),
    column([
      Text('NEXT STOP', style: kicker()),
      gap,
      if (story.next case final next?) ...[
        Text(next.name, style: big(32)),
        gap,
        Text('${plural(next.words, 'word')} to go', style: small()),
      ] else
        Text('The whole draft. Written.', style: big(32)),
    ]),
  ];
}
