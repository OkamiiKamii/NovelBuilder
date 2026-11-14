import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/background.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/named_in.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/manuscript/postcards.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import 'charts_page.dart' show fileSlug;

/// POSTCARDS FROM YOUR WORLD on screen (`postcards.dart` finds them): each place in the book as a postcard, swiped
/// through. The front is painted (the sky in the place's light, then what is there: hills or peaks, the sea, trees,
/// roofs, a tower) with "Greetings from" and the name in large letters; a tap turns it over to the back: the line the
/// book sets there, its chapter, a stamp and the book's postmark, addressed to a reader. **Send it** makes a
/// picture of the side showing (1500 by 1000); **Read it there** opens the chapter at the line. It only reads.

/// A postcard's size as it is drawn; the picture is this times [_pictureScale].
const postcardSize = Size(450, 300);
const _pictureScale = 1500 / 450;

/// The key of the [i]th postcard's card (the one a tap turns over).
ValueKey<String> postcardKey(int i) => ValueKey('postcard-$i');

/// Opens the postcards of [novelId], full screen. [onRead] opens a chapter at a line (it closes this first).
Future<void> showPostcards(
  BuildContext context, {
  required String novelId,
  void Function(String nodeId, String text, int block)? onRead,
}) => Navigator.of(context, rootNavigator: true).push(
  PageRouteBuilder<void>(
    pageBuilder: (_, _, _) => PostcardsScreen(novelId: novelId, onRead: onRead),
    transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
  ),
);

class PostcardsScreen extends ConsumerStatefulWidget {
  const PostcardsScreen({super.key, required this.novelId, this.onRead});

  final String novelId;
  final void Function(String nodeId, String text, int block)? onRead;

  @override
  ConsumerState<PostcardsScreen> createState() => _PostcardsScreenState();
}

class _PostcardsScreenState extends ConsumerState<PostcardsScreen> {
  List<Postcard>? _cards;
  final _pages = PageController(viewportFraction: 0.9);
  final _turned = <int>{};
  final _fronts = <int, GlobalKey>{};
  final _backs = <int, GlobalKey>{};
  int _at = 0;
  bool _working = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final nodes = [
      for (final n in readingOrder([for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n,
    ];
    final entries = [for (final r in store.rowsIn(widget.novelId, 'loreEntries')) Entry(r)];
    final names = namesToFind(entries, const <String, CharacterProfile>{});
    ref
        .read(runAsideProvider)(
          postcardsJob(
            store.rawJsonIn(widget.novelId, 'chapterContents'),
            [for (final n in nodes) n.id],
            {for (final n in nodes) n.id: n.title},
            [
              for (final e in entries)
                if (e.category == 'location' && (names[e.id] ?? const []).isNotEmpty)
                  (names: names[e.id]!, about: '${e.summary} ${e.description}'),
            ],
          ),
        )
        .then(
          (cards) {
            if (mounted) setState(() => _cards = cards);
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

  void _turn(int i) => setState(() => _turned.contains(i) ? _turned.remove(i) : _turned.add(i));

  Future<void> _send(Postcard card) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    final back = _turned.contains(_at);
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final key = (back ? _backs : _fronts)[_at]!;
      final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: _pictureScale);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final name = 'postcard-from-${fileSlug(card.place).toLowerCase()}${back ? '-back' : ''}.png';
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

  @override
  Widget build(BuildContext context) {
    final novel = ref.watch(novelStoreProvider).novel(widget.novelId);
    final title = (novel?.title.trim().isEmpty ?? true) ? 'your book' : novel!.title.trim();
    final cards = _cards;
    const ink = Color(0xFFF3EBDD);
    return Scaffold(
      backgroundColor: const Color(0xFF231D19),
      body: SafeArea(
        child: Column(
          children: [
            Row(
              children: [
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    'Postcards',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: vaultHeading(context, size: 18, color: ink, weight: 700),
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
                  color: ink,
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Text(
                'Greetings from the places in $title. Tap a postcard to turn it over.',
                style: vaultText(context, size: 14, color: ink.withValues(alpha: 0.72)),
              ),
            ),
            Expanded(
              child: cards == null
                  ? const Center(child: CircularProgressIndicator())
                  : cards.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          'No postcards yet. When your pages name a place (the Mimir Forest, the Grey Tower) or your '
                          'world keeps one, its postcard is drawn here.',
                          textAlign: TextAlign.center,
                          style: vaultText(context, size: 17, color: ink.withValues(alpha: 0.8)),
                        ),
                      ),
                    )
                  : PageView.builder(
                      controller: _pages,
                      itemCount: cards.length,
                      onPageChanged: (i) => setState(() {
                        _at = i;
                        _message = null;
                      }),
                      itemBuilder: (context, i) => Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          child: GestureDetector(
                            key: postcardKey(i),
                            onTap: () => _turn(i),
                            child: FittedBox(
                              child: _Turning(
                                turned: _turned.contains(i),
                                front: RepaintBoundary(
                                  key: _fronts.putIfAbsent(i, GlobalKey.new),
                                  child: PostcardFront(card: cards[i], book: title),
                                ),
                                back: RepaintBoundary(
                                  key: _backs.putIfAbsent(i, GlobalKey.new),
                                  child: PostcardBack(card: cards[i], book: title, author: novel?.author.trim() ?? ''),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
            ),
            if (cards != null && cards.isNotEmpty) ...[
              Text(
                '${_at + 1} of ${cards.length} · ${cards[_at].place}',
                style: vaultText(context, size: 14, color: ink.withValues(alpha: 0.8)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: ink,
                          side: BorderSide(color: ink.withValues(alpha: 0.4)),
                          minimumSize: const Size.fromHeight(46),
                        ),
                        onPressed: () => _turn(_at),
                        icon: const Icon(Icons.flip),
                        label: const Text('Turn it over'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFFE8C46A),
                          foregroundColor: const Color(0xFF231D19),
                          minimumSize: const Size.fromHeight(46),
                        ),
                        onPressed: _working ? null : () => _send(cards[_at]),
                        icon: _working
                            ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.send_outlined),
                        label: const Text('Send it'),
                      ),
                    ),
                  ],
                ),
              ),
              if (widget.onRead != null)
                TextButton.icon(
                  style: TextButton.styleFrom(foregroundColor: ink),
                  onPressed: () {
                    final c = cards[_at];
                    Navigator.of(context).pop();
                    widget.onRead!(c.nodeId, c.line, c.block);
                  },
                  icon: const Icon(Icons.menu_book_outlined, size: 18),
                  label: const Text('Read it there'),
                ),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text(
                    _message!,
                    textAlign: TextAlign.center,
                    style: vaultText(context, size: 13, color: ink.withValues(alpha: 0.8)),
                  ),
                ),
              const SizedBox(height: 8),
            ],
          ],
        ),
      ),
    );
  }
}

/// A card that turns over, about its upright middle.
class _Turning extends StatelessWidget {
  const _Turning({required this.turned, required this.front, required this.back});

  final bool turned;
  final Widget front;
  final Widget back;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(end: turned ? 1 : 0),
    duration: const Duration(milliseconds: 450),
    curve: Curves.easeInOut,
    builder: (context, t, _) {
      final showBack = t >= 0.5;
      final angle = t * pi + (showBack ? pi : 0);
      return Transform(
        alignment: Alignment.center,
        transform: Matrix4.identity()
          ..setEntry(3, 2, 0.0012)
          ..rotateY(angle),
        child: Semantics(
          label: showBack ? 'The back of the postcard' : 'The front of the postcard',
          child: showBack ? back : front,
        ),
      );
    },
  );
}

/// The colours of a light: the sky from the top down, the sun (none in a storm), the far land, the near land, the
/// water.
typedef _Light = ({Color skyTop, Color skyLow, Color? sun, Color far, Color near, Color water});

const _lights = <_Light>[
  // Dawn.
  (
    skyTop: Color(0xFFE9A28E),
    skyLow: Color(0xFFFCE3C0),
    sun: Color(0xFFFFF4D8),
    far: Color(0xFFB98A86),
    near: Color(0xFF7C5B63),
    water: Color(0xFF9DB3C4),
  ),
  // Noon.
  (
    skyTop: Color(0xFF5FA6D8),
    skyLow: Color(0xFFCFE8F6),
    sun: Color(0xFFFFF5C4),
    far: Color(0xFF86AE9A),
    near: Color(0xFF4A7A57),
    water: Color(0xFF3A82B4),
  ),
  // Dusk.
  (
    skyTop: Color(0xFF3B2A5C),
    skyLow: Color(0xFFE88E5A),
    sun: Color(0xFFFFC66E),
    far: Color(0xFF6B3F5E),
    near: Color(0xFF35213D),
    water: Color(0xFF594877),
  ),
  // Night.
  (
    skyTop: Color(0xFF0D1530),
    skyLow: Color(0xFF2F4272),
    sun: Color(0xFFF2EBD3),
    far: Color(0xFF26355A),
    near: Color(0xFF111934),
    water: Color(0xFF1C2B52),
  ),
  // Storm.
  (
    skyTop: Color(0xFF46515C),
    skyLow: Color(0xFFA0ABB2),
    sun: null,
    far: Color(0xFF5D6A70),
    near: Color(0xFF384347),
    water: Color(0xFF52626B),
  ),
];

/// The painted side: the scene, "Greetings from", the place in large letters, the book at the foot.
class PostcardFront extends StatelessWidget {
  const PostcardFront({super.key, required this.card, required this.book});

  final Postcard card;
  final String book;

  @override
  Widget build(BuildContext context) {
    final light = _lights[card.light];
    final letters = Color.lerp(light.skyLow, Colors.white, 0.75)!;
    final shadow = Color.lerp(light.near, Colors.black, 0.35)!;
    return Container(
      width: postcardSize.width,
      height: postcardSize.height,
      decoration: BoxDecoration(
        color: const Color(0xFFF8F1E2),
        borderRadius: BorderRadius.circular(6),
        boxShadow: const [BoxShadow(color: Color(0x88000000), blurRadius: 16, offset: Offset(0, 8))],
      ),
      padding: const EdgeInsets.all(10),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(3),
        child: Stack(
          fit: StackFit.expand,
          children: [
            CustomPaint(painter: PostcardScene(card: card)),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Greetings from',
                    style: vaultText(context, size: 22, color: letters).copyWith(
                      fontStyle: FontStyle.italic,
                      shadows: [Shadow(color: shadow, offset: const Offset(1.5, 1.5), blurRadius: 1)],
                    ),
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        card.place.toUpperCase(),
                        style: vaultHeading(context, size: 46, color: letters, weight: 800).copyWith(
                          letterSpacing: 1.5,
                          height: 1.05,
                          shadows: [
                            Shadow(color: shadow, offset: const Offset(3, 3)),
                            Shadow(color: shadow.withValues(alpha: 0.5), offset: const Offset(5, 5), blurRadius: 4),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const Spacer(),
                  Align(
                    alignment: Alignment.bottomRight,
                    child: Text(
                      book,
                      style: vaultText(context, size: 11, color: letters.withValues(alpha: 0.9)).copyWith(
                        fontStyle: FontStyle.italic,
                        shadows: [Shadow(color: shadow, offset: const Offset(1, 1))],
                      ),
                    ),
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

/// The painting on a postcard's front (and, small, on its stamp).
class PostcardScene extends CustomPainter {
  PostcardScene({required this.card});

  final Postcard card;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final light = _lights[card.light];
    final s = card.scenery;
    final seed = card.place.codeUnits.fold(3, (a, c) => (a * 17 + c) & 0x7fffffff);
    final random = Random(seed);
    final rect = Offset.zero & size;
    // Nothing past the frame, on the card or on the stamp.
    canvas.clipRect(rect);

    // The sky, and the sun or moon (or stars by night).
    canvas.drawRect(
      rect,
      Paint()..shader = ui.Gradient.linear(Offset.zero, Offset(0, h * 0.7), [light.skyTop, light.skyLow]),
    );
    if (card.light == 3) {
      final star = Paint()..color = const Color(0xCCFFFFFF);
      for (var i = 0; i < 26; i++) {
        canvas.drawCircle(
          Offset(random.nextDouble() * w, random.nextDouble() * h * 0.5),
          0.6 + random.nextDouble(),
          star,
        );
      }
    }
    final horizon = h * (s.water ? 0.6 : 0.66);
    if (light.sun != null) {
      // Low, near the horizon, under the letters.
      final sun = Offset(w * (0.6 + random.nextDouble() * 0.25), horizon - h * (0.07 + random.nextDouble() * 0.06));
      canvas.drawCircle(sun, h * 0.16, Paint()..color = light.sun!.withValues(alpha: 0.18));
      canvas.drawCircle(sun, h * 0.075, Paint()..color = light.sun!);
    }

    // The far land: peaks, or long hills.
    final far = Path()..moveTo(0, horizon);
    if (s.peaks) {
      var x = 0.0;
      while (x < w) {
        final step = w * (0.12 + random.nextDouble() * 0.14);
        far
          ..lineTo(x + step / 2, horizon - h * (0.2 + random.nextDouble() * 0.22))
          ..lineTo(x + step, horizon - h * 0.04);
        x += step;
      }
    } else {
      for (final x in [for (var i = 0; i <= 24; i++) w * i / 24]) {
        far.lineTo(x, horizon - h * (0.06 + 0.04 * sin(x / w * pi * 3 + seed % 7)));
      }
    }
    far
      ..lineTo(w, horizon + 2)
      ..lineTo(0, horizon + 2)
      ..close();
    canvas.drawPath(far, Paint()..color = light.far);
    if (s.peaks && card.light != 2) {
      // Snow on the tops.
      canvas.save();
      canvas.clipPath(far);
      canvas.drawRect(Rect.fromLTWH(0, 0, w, horizon - h * 0.3), Paint()..color = Colors.white.withValues(alpha: 0.75));
      canvas.restore();
    }

    // The near ground: water with a shore, dunes, or hills.
    final ground = Color.lerp(light.near, light.far, 0.15)!;
    if (s.water) {
      canvas.drawRect(Rect.fromLTRB(0, horizon, w, h), Paint()..color = light.water);
      final glint = Paint()
        ..color = Colors.white.withValues(alpha: 0.35)
        ..strokeWidth = 1.4
        ..strokeCap = StrokeCap.round;
      for (var i = 0; i < 18; i++) {
        final y = horizon + 6 + random.nextDouble() * (h - horizon - 8);
        final x = random.nextDouble() * w;
        canvas.drawLine(Offset(x, y), Offset(x + 8 + random.nextDouble() * 18, y), glint);
      }
      final shore = Path()
        ..moveTo(0, horizon + h * 0.08)
        ..quadraticBezierTo(w * 0.25, horizon + h * 0.04, w * 0.42, h * 0.86)
        ..lineTo(w * 0.5, h)
        ..lineTo(0, h)
        ..close();
      canvas.drawPath(shore, Paint()..color = ground);
    } else if (s.dunes) {
      const sand = [Color(0xFFE2BD7A), Color(0xFFC99B56), Color(0xFFAF7F42)];
      for (final (i, colour) in sand.indexed) {
        final y = horizon + i * h * 0.1;
        final dune = Path()..moveTo(0, y);
        for (final x in [for (var i = 0; i <= 20; i++) w * i / 20]) {
          dune.lineTo(x, y + h * 0.04 * sin(x / w * pi * 2 + i * 1.7 + seed % 5));
        }
        dune
          ..lineTo(w, h)
          ..lineTo(0, h)
          ..close();
        canvas.drawPath(dune, Paint()..color = card.light >= 3 ? Color.lerp(colour, light.near, 0.6)! : colour);
      }
    } else {
      final hill = Path()..moveTo(0, horizon + h * 0.04);
      for (final x in [for (var i = 0; i <= 24; i++) w * i / 24]) {
        hill.lineTo(x, horizon + h * (0.05 + 0.035 * sin(x / w * pi * 2.2 + seed % 3)));
      }
      hill
        ..lineTo(w, h)
        ..lineTo(0, h)
        ..close();
      canvas.drawPath(hill, Paint()..color = ground);
    }

    final dark = Paint()..color = Color.lerp(light.near, Colors.black, 0.25)!;
    // Trees: a dark line of pines along the ground.
    if (s.trees) {
      final base = s.water ? h * 0.9 : horizon + h * 0.1;
      final end = s.water ? w * 0.4 : w;
      for (var x = -w * 0.01; x < end; x += w * (0.02 + random.nextDouble() * 0.016)) {
        final tall = h * (0.12 + random.nextDouble() * 0.12);
        canvas.drawPath(
          Path()
            ..moveTo(x, base)
            ..lineTo(x + w * 0.016, base - tall)
            ..lineTo(x + w * 0.032, base)
            ..close(),
          dark,
        );
      }
    }
    // A tower, behind any houses: a lighthouse with its lamp and beam, else a keep with its battlements.
    if (s.tower) {
      final x = s.water ? (s.roofs ? w * 0.22 : w * 0.3) : w * 0.78;
      final base = s.water ? h * 0.9 : horizon + h * 0.08;
      final tall = h * 0.42;
      final wide = w * 0.055;
      canvas.drawRect(Rect.fromLTWH(x - wide / 2, base - tall, wide, tall), dark);
      if (s.beacon) {
        final lamp = Offset(x, base - tall - 5);
        canvas.drawPath(
          Path()
            ..moveTo(lamp.dx, lamp.dy)
            ..lineTo(w, lamp.dy - h * 0.12)
            ..lineTo(w, lamp.dy + h * 0.06)
            ..close(),
          Paint()..color = (light.sun ?? const Color(0xFFFFF4D8)).withValues(alpha: 0.28),
        );
        canvas.drawCircle(lamp, 5, Paint()..color = light.sun ?? const Color(0xFFFFF4D8));
        canvas.drawPath(
          Path()
            ..moveTo(x - wide * 0.7, base - tall)
            ..lineTo(x, base - tall - 14)
            ..lineTo(x + wide * 0.7, base - tall)
            ..close(),
          dark,
        );
      } else {
        for (var i = 0; i < 3; i++) {
          canvas.drawRect(Rect.fromLTWH(x - wide / 2 + i * wide * 0.4, base - tall - 6, wide * 0.22, 6), dark);
        }
      }
    }
    // Roofs: a huddle of houses.
    if (s.roofs) {
      final base = s.water ? h * 0.95 : h * 0.97;
      var x = s.water ? w * 0.02 : w * 0.06;
      final end = s.water ? w * 0.4 : w * 0.7;
      final house = Paint()..color = Color.lerp(light.near, light.skyLow, 0.12)!;
      final window = Paint()..color = (light.sun ?? light.skyLow).withValues(alpha: card.light >= 2 ? 0.9 : 0.5);
      while (x < end) {
        final wide = w * (0.05 + random.nextDouble() * 0.04);
        final high = h * (0.1 + random.nextDouble() * 0.12);
        canvas.drawRect(Rect.fromLTWH(x, base - high, wide, high), house);
        canvas.drawPath(
          Path()
            ..moveTo(x - 2, base - high)
            ..lineTo(x + wide / 2, base - high - h * 0.06)
            ..lineTo(x + wide + 2, base - high)
            ..close(),
          dark,
        );
        canvas.drawRect(Rect.fromLTWH(x + wide * 0.35, base - high * 0.7, wide * 0.3, high * 0.22), window);
        x += wide + 2;
      }
    }
  }

  @override
  bool shouldRepaint(PostcardScene old) => old.card != card;
}

/// The back: the line, its chapter, the stamp and the postmark, and a reader's address.
class PostcardBack extends StatelessWidget {
  const PostcardBack({super.key, required this.card, required this.book, required this.author});

  final Postcard card;
  final String book;
  final String author;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF2B2219);
    const faint = Color(0x552B2219);
    final chapter = card.chapterTitle.trim().isEmpty
        ? 'Chapter ${card.chapter}'
        : 'Chapter ${card.chapter} · ${card.chapterTitle.trim()}';
    return Container(
      width: postcardSize.width,
      height: postcardSize.height,
      decoration: BoxDecoration(
        color: const Color(0xFFF8F1E2),
        borderRadius: BorderRadius.circular(6),
        boxShadow: const [BoxShadow(color: Color(0x88000000), blurRadius: 16, offset: Offset(0, 8))],
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 18, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            flex: 11,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Greetings from ${card.place},',
                  style: vaultText(context, size: 12, color: ink.withValues(alpha: 0.7)),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: Text(
                    card.line,
                    overflow: TextOverflow.fade,
                    style: vaultText(context, size: 17, color: ink).copyWith(fontStyle: FontStyle.italic, height: 1.35),
                  ),
                ),
                const SizedBox(height: 6),
                Text(chapter, style: vaultText(context, size: 11, color: ink.withValues(alpha: 0.7))),
                Text(
                  author.isEmpty || author.toLowerCase() == 'novel builder' ? book : '$book, by $author',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: vaultText(context, size: 11, color: ink.withValues(alpha: 0.7)),
                ),
              ],
            ),
          ),
          Container(width: 1, margin: const EdgeInsets.symmetric(horizontal: 14), color: faint),
          Expanded(
            flex: 8,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 92,
                  child: Stack(
                    children: [
                      Positioned(right: 0, top: 0, child: _Stamp(card: card)),
                      Positioned(
                        left: 0,
                        top: 22,
                        child: _Postmark(book: book, chapter: card.chapter),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                for (final (i, line) in ['A reader', 'of $book', ''].indexed)
                  Container(
                    height: 26,
                    alignment: Alignment.bottomLeft,
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: faint)),
                    ),
                    child: Text(
                      line,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: vaultText(
                        context,
                        size: i == 0 ? 14 : 12,
                        color: ink.withValues(alpha: 0.85),
                      ).copyWith(fontStyle: FontStyle.italic),
                    ),
                  ),
                const SizedBox(height: 6),
                Text(
                  'MADE WITH NOVEL BUILDER',
                  textAlign: TextAlign.right,
                  style: vaultHeading(
                    context,
                    size: 6.5,
                    color: ink.withValues(alpha: 0.5),
                  ).copyWith(letterSpacing: 1.2),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The stamp: the place's painting small, inside a perforated edge.
class _Stamp extends StatelessWidget {
  const _Stamp({required this.card});

  final Postcard card;

  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _Perforated(),
    child: Container(
      width: 64,
      height: 76,
      padding: const EdgeInsets.all(6),
      child: Column(
        children: [
          Expanded(
            child: CustomPaint(
              painter: PostcardScene(card: card),
              size: Size.infinite,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            card.place.split(' ').last.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.clip,
            style: vaultHeading(
              context,
              size: 6,
              color: const Color(0xFF7A2E3A),
              weight: 700,
            ).copyWith(letterSpacing: 1),
          ),
        ],
      ),
    ),
  );
}

class _Perforated extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const r = 2.6;
    final paper = Paint()..color = Colors.white;
    canvas.drawRect(Offset.zero & size, paper);
    final hole = Paint()..color = const Color(0xFFF8F1E2);
    for (var x = r; x < size.width; x += r * 2.6) {
      canvas
        ..drawCircle(Offset(x, 0), r, hole)
        ..drawCircle(Offset(x, size.height), r, hole);
    }
    for (var y = r; y < size.height; y += r * 2.6) {
      canvas
        ..drawCircle(Offset(0, y), r, hole)
        ..drawCircle(Offset(size.width, y), r, hole);
    }
    canvas.drawRect(
      (Offset.zero & size).deflate(r + 1),
      Paint()
        ..color = const Color(0x22000000)
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(_Perforated old) => false;
}

/// The postmark: two rings with the book's name and the chapter, and the wavy lines after them.
class _Postmark extends StatelessWidget {
  const _Postmark({required this.book, required this.chapter});

  final String book;
  final int chapter;

  @override
  Widget build(BuildContext context) {
    const colour = Color(0x993B4A6B);
    return Transform.rotate(
      angle: -0.18,
      child: SizedBox(
        width: 120,
        height: 64,
        child: CustomPaint(
          painter: _Waves(colour),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Container(
              width: 62,
              height: 62,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: colour, width: 1.4),
              ),
              padding: const EdgeInsets.all(5),
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: colour, width: 0.8),
                ),
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      book.toUpperCase(),
                      maxLines: 2,
                      textAlign: TextAlign.center,
                      overflow: TextOverflow.clip,
                      style: vaultHeading(context, size: 5.5, color: colour, weight: 700).copyWith(height: 1.1),
                    ),
                    Text('CH. $chapter', style: vaultHeading(context, size: 7, color: colour, weight: 700)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Waves extends CustomPainter {
  _Waves(this.colour);

  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = colour
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    for (var i = 0; i < 4; i++) {
      final y = size.height * (0.28 + i * 0.15);
      final path = Path()..moveTo(66, y);
      for (var x = 66.0; x <= size.width; x += 2) {
        path.lineTo(x, y + 2.5 * sin((x - 66) / 6));
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(_Waves old) => old.colour != colour;
}
