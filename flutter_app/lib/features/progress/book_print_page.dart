import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/background.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/book_print.dart';
import '../characters/widgets/cast_card.dart' show castTone;
import '../characters/widgets/vault.dart';
import 'book_story.dart' show storyInputsOf;

/// THE BOOK'S FINGERPRINT on screen (`shared/domain/analytics/book_print.dart` reads it): the novel as a print, a
/// column a chapter hanging from the top, as long as the chapter, a thread a paragraph in the colour of the character
/// it belongs to (their cast colour), bright where someone speaks and softer where the story tells, uncoloured where
/// no one is named yet. Under it, whose colours are whose. A press shares it, 1080 by 1350, as a print to post.

/// The print's size, drawn three times over for the picture.
const printSize = Size(360, 450);

const _paper = Color(0xFF14121A);
const _ink = Color(0xFFF4EEDF);

/// Opens the fingerprint of [novelId], full screen.
Future<void> showBookPrint(BuildContext context, {required String novelId}) =>
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        pageBuilder: (_, _, _) => BookPrintScreen(novelId: novelId),
        transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
      ),
    );

class BookPrintScreen extends ConsumerStatefulWidget {
  const BookPrintScreen({super.key, required this.novelId});
  final String novelId;

  @override
  ConsumerState<BookPrintScreen> createState() => _BookPrintScreenState();
}

class _BookPrintScreenState extends ConsumerState<BookPrintScreen> {
  final _key = GlobalKey();
  BookPrint? _print;
  String _title = '';
  Map<String, String> _names = const {};
  int _words = 0;
  bool _working = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final inputs = storyInputsOf(store, widget.novelId);
    _title = inputs.title;
    _names = {for (final p in inputs.people) p.id: p.name};
    _words = inputs.chapters.fold(0, (n, c) => n + c.words);
    ref
        .read(runAsideProvider)(
          bookPrintJob(
            [for (final c in inputs.chapters) (id: c.id, title: c.title)],
            store.rawJsonIn(widget.novelId, 'chapterContents'),
            {for (final p in inputs.people) p.id: p.names},
          ),
        )
        .then(
          (p) {
            if (mounted) setState(() => _print = p);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'progress')),
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
      final boundary = _key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final said = await ref
          .read(backupFilesProvider)
          .saveFile('book-fingerprint.png', png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final print = _print;
    return Scaffold(
      backgroundColor: _paper,
      body: SafeArea(
        child: Stack(
          children: [
            if (print == null)
              const Center(child: CircularProgressIndicator())
            else
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 56, 12, 120),
                child: Center(
                  child: FittedBox(
                    child: RepaintBoundary(
                      key: _key,
                      child: BookPrintPoster(print: print, title: _title, words: _words, names: _names),
                    ),
                  ),
                ),
              ),
            Positioned(
              left: 16,
              top: 12,
              right: 56,
              child: Text('Your book’s fingerprint', style: vaultHeading(context, size: 18, color: _ink, weight: 700)),
            ),
            Positioned(
              right: 4,
              top: 4,
              child: IconButton(
                tooltip: 'Close',
                color: _ink,
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
                  Text(
                    'Every paragraph a thread, in the colour of whose it is; bright where someone speaks.',
                    textAlign: TextAlign.center,
                    style: vaultText(context, size: 14, color: _ink.withValues(alpha: 0.75)),
                  ),
                  if (_message != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        _message!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: _ink),
                      ),
                    ),
                  const SizedBox(height: 8),
                  FilledButton.tonalIcon(
                    onPressed: print == null || _working ? null : _share,
                    icon: const Icon(Icons.ios_share),
                    label: const Text('Share the print'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The print: the book's title, its threads, and whose colours are whose.
class BookPrintPoster extends StatelessWidget {
  const BookPrintPoster({
    super.key,
    required this.print,
    required this.title,
    required this.words,
    required this.names,
  });

  final BookPrint print;
  final String title;
  final int words;

  /// Each character's name, by id.
  final Map<String, String> names;

  @override
  Widget build(BuildContext context) {
    final most = (print.shares.entries.toList()..sort((a, b) => b.value - a.value)).take(5).toList();
    return SizedBox.fromSize(
      size: printSize,
      child: ColoredBox(
        color: _paper,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                (title.isEmpty ? 'Your novel' : title).toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: vaultHeading(context, size: 15, color: _ink, weight: 700).copyWith(letterSpacing: 3),
              ),
              const SizedBox(height: 2),
              Text(
                '${plural(print.chapters.length, 'chapter')} · ${plural(words, 'word')}',
                textAlign: TextAlign.center,
                style: vaultText(context, size: 11, color: _ink.withValues(alpha: 0.6)),
              ),
              const SizedBox(height: 14),
              Expanded(
                child: Semantics(
                  label:
                      'The book’s fingerprint: ${plural(print.chapters.length, 'chapter')}, each paragraph coloured '
                      'by the character it is about',
                  child: CustomPaint(painter: _PrintPainter(print), size: Size.infinite),
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 12,
                runSpacing: 4,
                children: [
                  for (final MapEntry(key: id) in most)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(color: castTone(id), shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 4),
                        Text(names[id] ?? '', style: vaultText(context, size: 10.5, color: _ink)),
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'NOVEL BUILDER',
                textAlign: TextAlign.center,
                style: vaultHeading(
                  context,
                  size: 6.5,
                  color: _ink.withValues(alpha: 0.4),
                ).copyWith(letterSpacing: 2.2),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PrintPainter extends CustomPainter {
  _PrintPainter(this.print);
  final BookPrint print;

  @override
  void paint(Canvas canvas, Size size) {
    final chapters = print.chapters;
    if (chapters.isEmpty || size.isEmpty) return;
    final longest = chapters.fold(0, (m, c) => math.max(m, c.lines.fold(0, (n, l) => n + l.words)));
    if (longest == 0) return;
    final n = chapters.length;
    final gap = n > 60 ? 1.0 : (n > 24 ? 2.0 : 4.0);
    final width = (size.width - gap * (n - 1)) / n;
    final paint = Paint();
    // A hairline across the top: the column hangs from it.
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, 0.8), Paint()..color = _ink.withValues(alpha: 0.35));
    for (final (i, c) in chapters.indexed) {
      final x = i * (width + gap);
      var y = 3.0;
      for (final l in c.lines) {
        final h = math.max(0.6, l.words / longest * (size.height - 3));
        final tone = l.who == null ? _ink : castTone(l.who!);
        final alpha = l.who == null ? (l.spoken ? 0.28 : 0.12) : (l.spoken ? 1.0 : 0.5);
        paint.color = tone.withValues(alpha: alpha);
        // A hair of paper between threads, where there is room for one.
        canvas.drawRect(Rect.fromLTWH(x, y, width, h > 2 ? h - 0.4 : h), paint);
        y += h;
      }
    }
  }

  @override
  bool shouldRepaint(_PrintPainter old) => old.print != print;
}
