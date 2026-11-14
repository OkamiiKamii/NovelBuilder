import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/background.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/manuscript/best_lines.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import '../library/bookshelf.dart' show accentOf;

/// THE BEST LINES on screen (`best_lines.dart` chooses them): the book's most quotable sentences as cards, a page each,
/// swiped through: the line set large, who wrote it and the book beneath. Three dresses (ink on paper, night, the book's
/// own colour), chosen below. **Share this line** makes a square picture of the card (1080 by 1080), the way authors
/// post their lines; **Read it there** opens the chapter at it. It only reads.

/// A card's size, drawn three times over for the picture.
const quoteCardSize = Size(360, 360);

/// How a card is dressed.
enum QuoteDress { paper, night, book }

/// Opens the best lines of [novelId], full screen. [onRead] opens a chapter at a line (it closes this first).
Future<void> showBestLines(
  BuildContext context, {
  required String novelId,
  void Function(String nodeId, String text, int block)? onRead,
}) => Navigator.of(context, rootNavigator: true).push(
  PageRouteBuilder<void>(
    pageBuilder: (_, _, _) => BestLinesScreen(novelId: novelId, onRead: onRead),
    transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
  ),
);

class BestLinesScreen extends ConsumerStatefulWidget {
  const BestLinesScreen({super.key, required this.novelId, this.onRead});

  final String novelId;
  final void Function(String nodeId, String text, int block)? onRead;

  @override
  ConsumerState<BestLinesScreen> createState() => _BestLinesScreenState();
}

class _BestLinesScreenState extends ConsumerState<BestLinesScreen> {
  List<BestLine>? _lines;
  final _pages = PageController(viewportFraction: 0.88);
  final _keys = <int, GlobalKey>{};
  int _at = 0;
  var _dress = QuoteDress.paper;
  bool _working = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final order = [
      for (final n in readingOrder([for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n.id,
    ];
    ref.read(runAsideProvider)(bestLinesJob(store.rawJsonIn(widget.novelId, 'chapterContents'), order)).then(
      (lines) {
        if (mounted) setState(() => _lines = lines);
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
          .saveFile('a-line-from-the-book.png', png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final novel = ref.watch(novelStoreProvider).novel(widget.novelId);
    final lines = _lines;
    const ink = Color(0xFFF4EEDF);
    return Scaffold(
      backgroundColor: const Color(0xFF15120F),
      body: SafeArea(
        child: Column(
          children: [
            Row(
              children: [
                const SizedBox(width: 16),
                Expanded(
                  child: Text('Your best lines', style: vaultHeading(context, size: 18, color: ink, weight: 700)),
                ),
                IconButton(
                  tooltip: 'Close',
                  color: ink,
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Expanded(
              child: lines == null || novel == null
                  ? const Center(child: CircularProgressIndicator())
                  : lines.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          'No line to quote yet. As your chapters grow, the sentences worth underlining gather here.',
                          textAlign: TextAlign.center,
                          style: vaultText(context, size: 17, color: ink.withValues(alpha: 0.8)),
                        ),
                      ),
                    )
                  : PageView.builder(
                      controller: _pages,
                      itemCount: lines.length,
                      onPageChanged: (i) => setState(() {
                        _at = i;
                        _message = null;
                      }),
                      itemBuilder: (context, i) => Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          child: FittedBox(
                            child: RepaintBoundary(
                              key: _keys.putIfAbsent(i, GlobalKey.new),
                              child: QuoteCard(line: lines[i], novel: novel, dress: _dress),
                            ),
                          ),
                        ),
                      ),
                    ),
            ),
            if (lines != null && lines.isNotEmpty) ...[
              Text(
                '${_at + 1} of ${lines.length} · chapter ${lines[_at].chapter}',
                style: vaultText(context, size: 14, color: ink.withValues(alpha: 0.7)),
              ),
              const SizedBox(height: 8),
              SegmentedButton<QuoteDress>(
                showSelectedIcon: false,
                style: SegmentedButton.styleFrom(
                  foregroundColor: ink,
                  selectedForegroundColor: const Color(0xFF15120F),
                ),
                segments: const [
                  ButtonSegment(value: QuoteDress.paper, label: Text('Paper')),
                  ButtonSegment(value: QuoteDress.night, label: Text('Night')),
                  ButtonSegment(value: QuoteDress.book, label: Text('The book')),
                ],
                selected: {_dress},
                onSelectionChanged: (s) => setState(() => _dress = s.single),
              ),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                  child: Text(
                    _message!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: ink),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 10,
                  runSpacing: 8,
                  children: [
                    if (widget.onRead != null)
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: ink,
                          side: const BorderSide(color: Colors.white38),
                        ),
                        onPressed: () {
                          final l = lines[_at];
                          Navigator.of(context).pop();
                          widget.onRead!(l.nodeId, l.text, l.block);
                        },
                        icon: const Icon(Icons.menu_book_outlined),
                        label: const Text('Read it there'),
                      ),
                    FilledButton.tonalIcon(
                      onPressed: _working ? null : _share,
                      icon: const Icon(Icons.ios_share),
                      label: const Text('Share this line'),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// One line as a card: set large in the book's type, a rule, the author and the book beneath, and the smallest mark of
/// where it was made.
class QuoteCard extends StatelessWidget {
  const QuoteCard({super.key, required this.line, required this.novel, required this.dress});

  final BestLine line;
  final Novel novel;
  final QuoteDress dress;

  @override
  Widget build(BuildContext context) {
    final accent = accentOf(novel);
    final (ground, ink, mark) = switch (dress) {
      QuoteDress.paper => (
        const [Color(0xFFF7F1E4), Color(0xFFEDE3CF)],
        const Color(0xFF2A221B),
        Color.lerp(accent, Colors.black, 0.2)!,
      ),
      QuoteDress.night => (
        const [Color(0xFF1C2230), Color(0xFF0B0E15)],
        const Color(0xFFEDE7DA),
        const Color(0xFFE8C46A),
      ),
      QuoteDress.book => (
        [Color.lerp(accent, Colors.white, 0.08)!, Color.lerp(accent, Colors.black, 0.45)!],
        const Color(0xFFFFFBF2),
        const Color(0xFFFFE7A8),
      ),
    };
    final title = novel.title.trim().isEmpty ? 'Untitled' : novel.title.trim();
    final author = novel.author.trim();
    final words = line.text.split(RegExp(r'\s+')).length;
    return SizedBox.fromSize(
      size: quoteCardSize,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: ground),
          borderRadius: BorderRadius.circular(4),
          boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 20, offset: Offset(0, 10))],
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(30, 28, 30, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('“', style: vaultText(context, size: 64, color: mark).copyWith(height: 0.9)),
              Expanded(
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    line.text.replaceAll(RegExp(r'^[“"]|[”"]$'), ''),
                    style: vaultText(
                      context,
                      size: words <= 10 ? 26 : (words <= 16 ? 22 : 19),
                      color: ink,
                      style: FontStyle.italic,
                    ).copyWith(height: 1.3),
                  ),
                ),
              ),
              Container(width: 36, height: 2, color: mark),
              const SizedBox(height: 8),
              Text(
                author.isEmpty ? title.toUpperCase() : '${author.toUpperCase()} · ${title.toUpperCase()}',
                maxLines: 2,
                style: vaultHeading(
                  context,
                  size: 11,
                  color: ink.withValues(alpha: 0.85),
                  weight: 700,
                ).copyWith(letterSpacing: 1.6),
              ),
              const SizedBox(height: 4),
              Text('Made with Novel Builder', style: vaultText(context, size: 9.5, color: ink.withValues(alpha: 0.45))),
            ],
          ),
        ),
      ),
    );
  }
}
