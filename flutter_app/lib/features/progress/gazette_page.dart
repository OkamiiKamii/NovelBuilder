import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/background.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/named_in.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/gazette.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import 'charts_page.dart' show fileSlug;

/// THE GAZETTE on screen (`gazette.dart` sets it): each chapter as the front page of its world's newspaper, swiped
/// through edition by edition, opening on the latest. The page is newsprint: the masthead, the edition line, the
/// headline and its deck, the lead story in two columns, and at the foot what was said about town, the weather and who
/// is in the news. **Print it** makes a picture of the page; **Read it there** opens the chapter. On the last edition,
/// tomorrow's paper is blank: **Keep writing**. It only reads.

/// The front page's width as it is set; the picture is three times it.
const frontPageWidth = 400.0;

const _paper = Color(0xFFF1EBDD);
const _ink = Color(0xFF1D1A16);

/// Opens the gazette of [novelId], full screen, on the latest edition. [onRead] opens a chapter at a line;
/// [onKeepWriting] goes back to the writing (each closes this first).
Future<void> showGazette(
  BuildContext context, {
  required String novelId,
  void Function(String nodeId, String text, int block)? onRead,
  VoidCallback? onKeepWriting,
}) => Navigator.of(context, rootNavigator: true).push(
  PageRouteBuilder<void>(
    pageBuilder: (_, _, _) => GazetteScreen(novelId: novelId, onRead: onRead, onKeepWriting: onKeepWriting),
    transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
  ),
);

class GazetteScreen extends ConsumerStatefulWidget {
  const GazetteScreen({super.key, required this.novelId, this.onRead, this.onKeepWriting});

  final String novelId;
  final void Function(String nodeId, String text, int block)? onRead;
  final VoidCallback? onKeepWriting;

  @override
  ConsumerState<GazetteScreen> createState() => _GazetteScreenState();
}

class _GazetteScreenState extends ConsumerState<GazetteScreen> {
  Gazette? _paperOf;
  PageController? _pages;
  final _keys = <int, GlobalKey>{};
  int _at = 0;
  bool _working = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final novel = store.novel(widget.novelId);
    final nodes = [
      for (final n in readingOrder([for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n,
    ];
    final entries = [for (final r in store.rowsIn(widget.novelId, 'loreEntries')) Entry(r)];
    final profiles = <String, CharacterProfile>{
      for (final r in [
        ...store.rowsIn(widget.novelId, 'characterProfiles'),
      ]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
        str(r['entryId']): CharacterProfile(r),
    };
    final names = namesToFind(entries, profiles);
    ref
        .read(runAsideProvider)(
          gazetteJob(
            novel?.title ?? '',
            store.rawJsonIn(widget.novelId, 'chapterContents'),
            [for (final n in nodes) n.id],
            {for (final n in nodes) n.id: n.title},
            [
              for (final e in entries)
                if (e.category == 'character' && !(profiles[e.id]?.archived ?? false) && (names[e.id] ?? []).isNotEmpty)
                  (name: e.name.trim(), names: names[e.id]!),
            ],
            [
              for (final e in entries)
                if (e.category == 'location' && (names[e.id] ?? []).isNotEmpty) names[e.id]!,
            ],
          ),
        )
        .then(
          (paper) {
            if (!mounted) return;
            setState(() {
              _paperOf = paper;
              _at = paper.editions.isEmpty ? 0 : paper.editions.length - 1;
              _pages = PageController(initialPage: _at);
            });
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'progress')),
        );
  }

  @override
  void dispose() {
    _pages?.dispose();
    super.dispose();
  }

  Future<void> _print(Gazette paper) async {
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
      final name = '${fileSlug(paper.name).toLowerCase()}-chapter-${paper.editions[_at].chapter}.png';
      final said = await ref
          .read(backupFilesProvider)
          .saveFile(name, png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  void _go(int to) => _pages?.animateToPage(to, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);

  @override
  Widget build(BuildContext context) {
    final novel = ref.watch(novelStoreProvider).novel(widget.novelId);
    final paper = _paperOf;
    const light = Color(0xFFF3EBDD);
    final editions = paper?.editions ?? const <Edition>[];
    final last = editions.isNotEmpty && _at == editions.length - 1;
    return Scaffold(
      backgroundColor: const Color(0xFF2A241F),
      body: SafeArea(
        child: Column(
          children: [
            Row(
              children: [
                const SizedBox(width: 16),
                Expanded(
                  child: Text('The Gazette', style: vaultHeading(context, size: 18, color: light, weight: 700)),
                ),
                IconButton(
                  tooltip: 'Close',
                  color: light,
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              child: Text(
                'Every chapter the front page of its world’s newspaper.',
                style: vaultText(context, size: 14, color: light.withValues(alpha: 0.72)),
              ),
            ),
            Expanded(
              child: paper == null
                  ? const Center(child: CircularProgressIndicator())
                  : editions.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          'No news yet. Once a chapter has words, it is set here as a front page.',
                          textAlign: TextAlign.center,
                          style: vaultText(context, size: 17, color: light.withValues(alpha: 0.8)),
                        ),
                      ),
                    )
                  : PageView.builder(
                      controller: _pages,
                      itemCount: editions.length,
                      onPageChanged: (i) => setState(() {
                        _at = i;
                        _message = null;
                      }),
                      itemBuilder: (context, i) => SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        child: Column(
                          children: [
                            FittedBox(
                              child: RepaintBoundary(
                                key: _keys.putIfAbsent(i, GlobalKey.new),
                                child: FrontPage(
                                  name: paper.name,
                                  book: novel?.title.trim() ?? '',
                                  edition: editions[i],
                                ),
                              ),
                            ),
                            // The last edition looks ahead: tomorrow's paper is not written yet.
                            if (i == editions.length - 1 && widget.onKeepWriting != null)
                              _Tomorrow(
                                chapter: editions[i].chapter + 1,
                                onKeepWriting: () {
                                  Navigator.of(context).pop();
                                  widget.onKeepWriting!();
                                },
                              ),
                          ],
                        ),
                      ),
                    ),
            ),
            if (editions.isNotEmpty) ...[
              Row(
                children: [
                  IconButton(
                    tooltip: 'Earlier edition',
                    color: light,
                    onPressed: _at == 0 ? null : () => _go(_at - 1),
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Expanded(
                    child: Text(
                      'Chapter ${editions[_at].chapter} edition · ${_at + 1} of ${editions.length}',
                      textAlign: TextAlign.center,
                      style: vaultText(context, size: 14, color: light.withValues(alpha: 0.85)),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Later edition',
                    color: light,
                    onPressed: last ? null : () => _go(_at + 1),
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                child: Row(
                  children: [
                    if (widget.onRead != null) ...[
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: light,
                            side: BorderSide(color: light.withValues(alpha: 0.4)),
                            minimumSize: const Size.fromHeight(46),
                          ),
                          onPressed: () {
                            final e = editions[_at];
                            final first = e.lead.isEmpty ? '' : e.lead.first.split(RegExp(r'(?<=[.!?…])\s')).first;
                            Navigator.of(context).pop();
                            widget.onRead!(e.nodeId, first, 0);
                          },
                          icon: const Icon(Icons.menu_book_outlined, size: 18),
                          label: const Text('Read it there'),
                        ),
                      ),
                      const SizedBox(width: 10),
                    ],
                    Expanded(
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFFE8C46A),
                          foregroundColor: const Color(0xFF2A241F),
                          minimumSize: const Size.fromHeight(46),
                        ),
                        onPressed: _working ? null : () => _print(paper!),
                        icon: _working
                            ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.newspaper),
                        label: const Text('Print it'),
                      ),
                    ),
                  ],
                ),
              ),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                  child: Text(
                    _message!,
                    textAlign: TextAlign.center,
                    style: vaultText(context, size: 13, color: light.withValues(alpha: 0.8)),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Under the last edition: tomorrow's paper is blank, and the way to fill it.
class _Tomorrow extends StatelessWidget {
  const _Tomorrow({required this.chapter, required this.onKeepWriting});

  final int chapter;
  final VoidCallback onKeepWriting;

  @override
  Widget build(BuildContext context) {
    const light = Color(0xFFF3EBDD);
    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: light.withValues(alpha: 0.35), style: BorderStyle.solid),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TOMORROW’S EDITION',
            style: vaultHeading(
              context,
              size: 11,
              color: const Color(0xFFE8C46A),
              weight: 700,
            ).copyWith(letterSpacing: 2),
          ),
          const SizedBox(height: 6),
          Text(
            'The presses are waiting. Chapter $chapter has not happened yet, and nobody in town knows what it holds.',
            style: vaultText(context, size: 15, color: light),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: const Color(0xFFE8C46A)),
              onPressed: onKeepWriting,
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Keep writing'),
            ),
          ),
        ],
      ),
    );
  }
}

/// A front page, set as newsprint.
class FrontPage extends StatelessWidget {
  const FrontPage({super.key, required this.name, required this.book, required this.edition});

  /// The paper's name.
  final String name;

  /// The book's title.
  final String book;
  final Edition edition;

  @override
  Widget build(BuildContext context) {
    final e = edition;
    TextStyle text(double size, {bool italic = false, double alpha = 1}) => vaultText(
      context,
      size: size,
      color: _ink.withValues(alpha: alpha),
    ).copyWith(fontStyle: italic ? FontStyle.italic : null, height: 1.3);
    TextStyle caps(double size, {double weight = 700}) =>
        vaultHeading(context, size: size, color: _ink, weight: weight).copyWith(letterSpacing: 1.2);
    Widget rule({double thick = 0.8, double gap = 6}) => Padding(
      padding: EdgeInsets.symmetric(vertical: gap),
      child: Container(height: thick, color: _ink),
    );
    final columns = _twoColumns(e.lead);
    // The press is the town's: "The Old Merrow Gazette" is printed by the Old Merrow Press.
    final town = (name.replaceFirst(RegExp(r'^The\s+'), '').split(' ')..removeLast()).join(' ');
    return Container(
      width: frontPageWidth,
      color: _paper,
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('No. ${e.chapter}', style: caps(8)),
              const Spacer(),
              Text('ONE COPPER', style: caps(8)),
            ],
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(name.toUpperCase(), style: caps(34, weight: 800).copyWith(letterSpacing: 0.5, height: 1)),
          ),
          rule(thick: 2.2, gap: 5),
          Row(
            children: [
              Text('CHAPTER ${e.chapter} EDITION', style: caps(8)),
              // The book in the middle, cut short when its title is long.
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    book.toUpperCase(),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: caps(8, weight: 600),
                  ),
                ),
              ),
              Text('${formatNumber(e.words)} WORDS', style: caps(8)),
            ],
          ),
          Container(height: 0.8, margin: const EdgeInsets.only(top: 4), color: _ink),
          const SizedBox(height: 10),
          Text(
            e.headline.toUpperCase(),
            textAlign: TextAlign.center,
            style: caps(26, weight: 800).copyWith(height: 1.08, letterSpacing: 0.4),
          ),
          if (e.deck.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(e.deck, textAlign: TextAlign.center, style: text(13.5, italic: true)),
          ],
          rule(gap: 9),
          // The lead story, in two columns, its first words in capitals.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _Column(paragraphs: columns.$1, first: true)),
              const SizedBox(width: 10),
              Expanded(
                // The rule between the columns, down the second's edge.
                child: Container(
                  padding: const EdgeInsets.only(left: 10),
                  decoration: const BoxDecoration(
                    border: Border(left: BorderSide(color: _ink, width: 0.6)),
                  ),
                  child: _Column(
                    paragraphs: [...columns.$2, if (e.continues) '→ Continued in chapter ${e.chapter}.'],
                    first: false,
                  ),
                ),
              ),
            ],
          ),
          rule(thick: 1.4, gap: 9),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('SAID ABOUT TOWN', style: caps(9)),
                      const SizedBox(height: 4),
                      if (e.said.isEmpty) Text('Not a word was said.', style: text(10.5, italic: true, alpha: 0.7)),
                      for (final s in e.said)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 5),
                          child: Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: '“${s.words.replaceFirst(RegExp(r'[,;:]$'), '')}” '),
                                TextSpan(
                                  text: '— ${s.speaker}',
                                  style: const TextStyle(fontStyle: FontStyle.normal, fontWeight: FontWeight.w700),
                                ),
                              ],
                            ),
                            style: text(10.5, italic: true),
                          ),
                        ),
                    ],
                  ),
                ),
                Container(width: 0.6, color: _ink, margin: const EdgeInsets.symmetric(horizontal: 10)),
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('WEATHER', style: caps(9)),
                      const SizedBox(height: 4),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(_weatherIcon(e.weather), size: 18, color: _ink),
                          const SizedBox(width: 6),
                          Expanded(child: Text(e.weather.forecast, style: text(10.5))),
                        ],
                      ),
                      if (e.weatherCount > 0)
                        Text(
                          '“${e.weatherWord}”, ${e.weatherCount} times in the chapter',
                          style: text(8.5, italic: true, alpha: 0.7),
                        ),
                      Container(height: 0.6, color: _ink, margin: const EdgeInsets.symmetric(vertical: 7)),
                      Text('IN THE NEWS', style: caps(9)),
                      const SizedBox(height: 4),
                      if (e.inTheNews.isEmpty) Text('A quiet day.', style: text(10.5, italic: true, alpha: 0.7)),
                      for (final n in e.inTheNews)
                        Row(
                          children: [
                            Expanded(
                              child: Text(n.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: text(10.5)),
                            ),
                            Text('${n.count}', style: caps(9)),
                          ],
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          rule(thick: 2.2, gap: 8),
          Text(
            'PRINTED BY THE ${town.isEmpty ? 'TOWN' : town.toUpperCase()} PRESS · MADE WITH NOVEL BUILDER',
            textAlign: TextAlign.center,
            style: caps(6.5, weight: 600).copyWith(color: _ink.withValues(alpha: 0.6)),
          ),
        ],
      ),
    );
  }
}

IconData _weatherIcon(Weather w) => switch (w) {
  Weather.storm => Icons.thunderstorm_outlined,
  Weather.rain => Icons.umbrella_outlined,
  Weather.snow => Icons.ac_unit,
  Weather.fog => Icons.foggy,
  Weather.wind => Icons.air,
  Weather.sun => Icons.wb_sunny_outlined,
  Weather.night => Icons.nightlight_outlined,
  Weather.fair => Icons.wb_cloudy_outlined,
};

/// The lead story split in two columns of about the same length, at a paragraph, or within one at a sentence.
(List<String>, List<String>) _twoColumns(List<String> lead) {
  final sentences = <({String text, bool starts})>[];
  for (final p in lead) {
    final parts = RegExp(r'[^.!?…]+[.!?…]+["”’]*\s*|[^.!?…]+$').allMatches(p).map((m) => m[0]!).toList();
    for (final (i, s) in parts.indexed) {
      sentences.add((text: s, starts: i == 0));
    }
  }
  final total = sentences.fold(0, (n, s) => n + s.text.length);
  var running = 0;
  var cut = sentences.length;
  for (final (i, s) in sentences.indexed) {
    running += s.text.length;
    if (running >= total / 2) {
      cut = i + 1;
      break;
    }
  }
  List<String> join(Iterable<({String text, bool starts})> part) {
    final out = <String>[];
    for (final s in part) {
      if (s.starts || out.isEmpty) {
        out.add(s.text.trim());
      } else {
        out[out.length - 1] = '${out.last} ${s.text.trim()}';
      }
    }
    return out;
  }

  return (join(sentences.take(cut)), join(sentences.skip(cut)));
}

/// A column of the lead story: justified, each paragraph indented, the story's first words in capitals.
class _Column extends StatelessWidget {
  const _Column({required this.paragraphs, required this.first});

  final List<String> paragraphs;
  final bool first;

  @override
  Widget build(BuildContext context) {
    final style = vaultText(context, size: 10.5, color: _ink).copyWith(height: 1.35);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, p) in paragraphs.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: first && i == 0
                ? Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: p.split(' ').take(3).join(' ').toUpperCase(),
                          style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.4),
                        ),
                        TextSpan(text: ' ${p.split(' ').skip(3).join(' ')}'),
                      ],
                    ),
                    textAlign: TextAlign.justify,
                    style: style,
                  )
                : Text.rich(
                    TextSpan(
                      children: [
                        if (p.startsWith('→'))
                          TextSpan(
                            text: p,
                            style: const TextStyle(fontStyle: FontStyle.italic),
                          )
                        else ...[
                          const WidgetSpan(child: SizedBox(width: 10)),
                          TextSpan(text: p),
                        ],
                      ],
                    ),
                    textAlign: TextAlign.justify,
                    style: style,
                  ),
          ),
      ],
    );
  }
}
