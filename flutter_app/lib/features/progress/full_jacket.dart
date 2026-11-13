import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/novel_art.dart';
import '../../shared/data/background.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/manuscript/jacket_copy.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import '../library/bookshelf.dart' show BookJacket, accentOf;

/// THE FULL JACKET: the novel's cover as a printer lays it out, flat: the back, the spine and the front. The front is
/// the book's own jacket, as the Library shows it; the spine is as thick as the book's pages, its title running down
/// it; the back sets a line from the book large (`jacket_copy.dart` chooses it), the synopsis or the book's own
/// opening, what kind of novel it is, the author, and a barcode. A press shares it as a picture. It only reads.

/// The spread's size, drawn three times over for the picture.
const jacketSize = Size(480, 330);

const _backdrop = [Color(0xFF2A2420), Color(0xFF14110F)];

/// How thick the spine is for [words]: a page a 250 words, as a printed page holds, a little over a tenth of a point
/// a page, between a pamphlet's and a doorstop's.
double spineWidth(int words) => (8 + words / 250 * 0.09).clamp(10.0, 46.0);

/// Opens the full jacket of [novelId], full screen.
Future<void> showFullJacket(BuildContext context, {required String novelId}) =>
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        pageBuilder: (_, _, _) => FullJacketScreen(novelId: novelId),
        transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
      ),
    );

class FullJacketScreen extends ConsumerStatefulWidget {
  const FullJacketScreen({super.key, required this.novelId});
  final String novelId;

  @override
  ConsumerState<FullJacketScreen> createState() => _FullJacketScreenState();
}

class _FullJacketScreenState extends ConsumerState<FullJacketScreen> {
  final _key = GlobalKey();
  JacketCopy? _copy;
  bool _working = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final nodes = [for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)];
    final order = [
      for (final n in readingOrder(nodes))
        if (isDocument(n.kind)) n.id,
    ];
    final synopsis = store.novel(widget.novelId)?.synopsis ?? '';
    ref.read(runAsideProvider)(jacketCopyJob(store.rawJsonIn(widget.novelId, 'chapterContents'), order, synopsis)).then(
      (copy) {
        if (mounted) setState(() => _copy = copy);
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
          .saveFile('book-jacket.png', png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = ref.watch(novelStoreProvider);
    final novel = store.novel(widget.novelId);
    final words = store.rowsIn(widget.novelId, 'chapters').fold(0, (n, r) => n + StoryNode(r).wordCount);
    final copy = _copy;
    const ink = Color(0xFFF4EEDF);
    return Scaffold(
      backgroundColor: _backdrop.last,
      body: SafeArea(
        child: Stack(
          children: [
            if (novel == null || copy == null)
              const Center(child: CircularProgressIndicator())
            else
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 56, 8, 120),
                child: Center(
                  child: FittedBox(
                    child: RepaintBoundary(
                      key: _key,
                      child: FullJacket(novel: novel, words: words, copy: copy),
                    ),
                  ),
                ),
              ),
            Positioned(
              left: 16,
              top: 12,
              right: 56,
              child: Text('The full jacket', style: vaultHeading(context, size: 18, color: ink, weight: 700)),
            ),
            Positioned(
              right: 4,
              top: 4,
              child: IconButton(
                tooltip: 'Close',
                color: ink,
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
                    'The back, the spine and the front, as a printer lays them out. The spine is as thick as your '
                    'pages.',
                    textAlign: TextAlign.center,
                    style: vaultText(context, size: 14, color: ink.withValues(alpha: 0.75)),
                  ),
                  if (_message != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        _message!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: ink),
                      ),
                    ),
                  const SizedBox(height: 8),
                  FilledButton.tonalIcon(
                    onPressed: copy == null || _working ? null : _share,
                    icon: const Icon(Icons.ios_share),
                    label: const Text('Share the jacket'),
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

/// The spread: the back, the spine and the front, on a dark ground with the light falling on it.
class FullJacket extends StatelessWidget {
  const FullJacket({super.key, required this.novel, required this.words, required this.copy});

  final Novel novel;
  final int words;
  final JacketCopy copy;

  static const _book = 156.0;

  @override
  Widget build(BuildContext context) {
    final look = NovelArt.of(context).bound(accentOf(novel));
    final spine = spineWidth(words);
    return SizedBox.fromSize(
      size: jacketSize,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(center: Alignment(0, -0.4), radius: 1.1, colors: _backdrop),
        ),
        child: Center(
          child: DecoratedBox(
            decoration: BoxDecoration(
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.55), blurRadius: 24, offset: const Offset(0, 14)),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _Back(novel: novel, words: words, copy: copy, look: look, width: _book),
                _Spine(novel: novel, look: look, width: spine, height: _book * 1.5),
                BookJacket(novel: novel, width: _book),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Spine extends StatelessWidget {
  const _Spine({required this.novel, required this.look, required this.width, required this.height});
  final Novel novel;
  final BoundLook look;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    final title = novel.title.isEmpty ? 'Untitled novel' : novel.title;
    final size = math.min(width * 0.42, 11.0);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Color.lerp(look.ground.first, Colors.black, 0.25)!, look.ground.first, look.ground.last],
          stops: const [0, 0.5, 1],
        ),
      ),
      padding: EdgeInsets.symmetric(vertical: width * 0.5),
      child: Column(
        children: [
          // Down the spine, top to bottom, as an English book's title runs.
          Expanded(
            child: RotatedBox(
              quarterTurns: 1,
              child: Center(
                child: Text(
                  title.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: vaultHeading(context, size: size, color: look.ink, weight: 700).copyWith(letterSpacing: 1.6),
                ),
              ),
            ),
          ),
          if (novel.author.trim().isNotEmpty) ...[
            SizedBox(height: width * 0.4),
            RotatedBox(
              quarterTurns: 1,
              child: Text(
                novel.author.trim(),
                maxLines: 1,
                style: vaultText(context, size: size * 0.85, color: look.ink.withValues(alpha: 0.85)),
              ),
            ),
          ],
          SizedBox(height: width * 0.5),
          // The imprint's mark: a diamond.
          Transform.rotate(
            angle: math.pi / 4,
            child: Container(width: width * 0.22, height: width * 0.22, color: look.frame),
          ),
        ],
      ),
    );
  }
}

class _Back extends StatelessWidget {
  const _Back({required this.novel, required this.words, required this.copy, required this.look, required this.width});
  final Novel novel;
  final int words;
  final JacketCopy copy;
  final BoundLook look;
  final double width;

  @override
  Widget build(BuildContext context) {
    final kind = [
      'A NOVEL',
      if (novel.primaryGenre.trim().isNotEmpty) novel.primaryGenre.trim().toUpperCase(),
    ].join('  ·  ');
    return Container(
      width: width,
      height: width * 1.5,
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topRight, end: Alignment.bottomLeft, colors: look.ground),
        borderRadius: const BorderRadius.horizontal(left: Radius.circular(3)),
      ),
      padding: EdgeInsets.all(width * 0.07),
      child: DecoratedBox(
        decoration: BoxDecoration(border: Border.all(color: look.frame.withValues(alpha: 0.55), width: 0.6)),
        child: Padding(
          padding: EdgeInsets.all(width * 0.06),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (copy.quote.isNotEmpty)
                Text(
                  '“${copy.quote}”',
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: vaultText(context, size: 9.5, color: look.ink, style: FontStyle.italic).copyWith(height: 1.25),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Center(child: Container(width: 24, height: 0.6, color: look.frame)),
              ),
              Expanded(
                child: Text(
                  copy.blurb,
                  overflow: TextOverflow.fade,
                  style: vaultText(context, size: 6.6, color: look.ink.withValues(alpha: 0.88)).copyWith(height: 1.35),
                ),
              ),
              const SizedBox(height: 4),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          kind,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: vaultHeading(
                            context,
                            size: 5,
                            color: look.frame,
                            weight: 700,
                          ).copyWith(letterSpacing: 1),
                        ),
                        if (novel.author.trim().isNotEmpty)
                          Text(
                            novel.author.trim(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: vaultText(context, size: 7, color: look.ink),
                          ),
                      ],
                    ),
                  ),
                  _Barcode(seed: novel.id.hashCode ^ words),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A barcode, as the back of a book has: bars from the book itself, in a white box.
class _Barcode extends StatelessWidget {
  const _Barcode({required this.seed});
  final int seed;

  @override
  Widget build(BuildContext context) => Container(
    width: 34,
    height: 20,
    color: Colors.white,
    padding: const EdgeInsets.fromLTRB(2, 2, 2, 2),
    child: CustomPaint(painter: _BarsPainter(seed)),
  );
}

class _BarsPainter extends CustomPainter {
  _BarsPainter(this.seed);
  final int seed;

  @override
  void paint(Canvas canvas, Size size) {
    final random = math.Random(seed);
    final paint = Paint()..color = Colors.black;
    var x = 0.0;
    while (x < size.width) {
      final w = 0.4 + random.nextInt(3) * 0.4;
      if (random.nextBool()) canvas.drawRect(Rect.fromLTWH(x, 0, w, size.height), paint);
      x += w + 0.35;
    }
  }

  @override
  bool shouldRepaint(_BarsPainter old) => old.seed != seed;
}
