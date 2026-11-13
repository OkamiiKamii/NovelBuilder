import 'dart:math' as math;
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
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/manuscript/trailer.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import '../library/bookshelf.dart' show accentOf;

/// THE TRAILER on screen (`shared/domain/manuscript/trailer.dart` cuts it): the novel played as a film trailer, between
/// black bars, a shot at a time, each fading up out of the dark in the book's own colour and drifting closer: who it is
/// from, lines from the book, the names it is about spaced wide, the line that lands hardest, and the title with a
/// streak of light through it. A press cuts to the next shot. It ends on the poster (the title, that line, the names,
/// COMING SOON), a press from sharing as a picture the shape of a story post (1080 by 1920). It only reads.

/// The poster's size, drawn three times over for the picture.
const posterSize = Size(360, 640);

const _gold = Color(0xFFE8C46A);
const _ink = Color(0xFFF7F1E4);

/// How long [shot] holds the screen: a line long enough to read twice.
Duration shotLength(Shot shot) => switch (shot.kind) {
  ShotKind.from => const Duration(milliseconds: 2600),
  ShotKind.name => const Duration(milliseconds: 2400),
  ShotKind.title => const Duration(milliseconds: 4000),
  ShotKind.line => Duration(milliseconds: (1400 + 300 * shot.text.split(RegExp(r'\s+')).length).clamp(3000, 6000)),
};

/// Opens the trailer of [novelId], full screen. [onKeepWriting] goes back to the writing, from the poster.
Future<void> showTrailer(BuildContext context, {required String novelId, VoidCallback? onKeepWriting}) =>
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        opaque: true,
        pageBuilder: (_, _, _) => TrailerScreen(novelId: novelId, onKeepWriting: onKeepWriting),
        transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
      ),
    );

class TrailerScreen extends ConsumerStatefulWidget {
  const TrailerScreen({super.key, required this.novelId, this.onKeepWriting});

  final String novelId;
  final VoidCallback? onKeepWriting;

  @override
  ConsumerState<TrailerScreen> createState() => _TrailerScreenState();
}

class _TrailerScreenState extends ConsumerState<TrailerScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _clock = AnimationController(vsync: this)..addStatusListener(_onStatus);
  final _poster = GlobalKey();
  Trailer? _trailer;
  int _at = 0;
  bool _done = false;
  bool _working = false;
  String? _message;
  int _words = 0;
  int _chapters = 0;

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final novel = store.novel(widget.novelId);
    final nodes = [for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)];
    final order = [
      for (final n in readingOrder(nodes))
        if (isDocument(n.kind)) n,
    ];
    _words = order.fold(0, (n, c) => n + c.wordCount);
    _chapters = order.length;
    final entries = [for (final r in store.rowsIn(widget.novelId, 'loreEntries')) Entry(r)];
    final profiles = <String, CharacterProfile>{
      for (final r in store.rowsIn(widget.novelId, 'characterProfiles')) str(r['entryId']): CharacterProfile(r),
    };
    final names = namesToFind(entries, profiles);
    final cast = <TrailerPerson>[
      for (final e in entries)
        if (e.category == 'character' && e.name.trim().isNotEmpty)
          (name: e.name.trim(), names: names[e.id] ?? [e.name.trim()]),
    ];
    ref
        .read(runAsideProvider)(
          trailerJob(
            store.rawJsonIn(widget.novelId, 'chapterContents'),
            [for (final n in order) n.id],
            title: novel?.title ?? '',
            author: novel?.author ?? '',
            cast: cast,
          ),
        )
        .then(
          (trailer) {
            if (!mounted) return;
            setState(() => _trailer = trailer);
            _play(0);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'progress')),
        );
  }

  @override
  void dispose() {
    _clock.dispose();
    super.dispose();
  }

  void _play(int at) {
    final shots = _trailer!.shots;
    setState(() {
      _at = at;
      _done = false;
    });
    _clock
      ..duration = shotLength(shots[at])
      ..forward(from: 0);
  }

  void _onStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed || _trailer == null || _done) return;
    _next();
  }

  void _next() {
    final shots = _trailer!.shots;
    if (_at < shots.length - 1) {
      _play(_at + 1);
    } else {
      _end();
    }
  }

  void _end() {
    _clock.stop();
    setState(() => _done = true);
  }

  Future<void> _share() async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final boundary = _poster.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final said = await ref
          .read(backupFilesProvider)
          .saveFile('book-trailer-poster.png', png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  void _keepWriting() {
    Navigator.of(context).pop();
    widget.onKeepWriting?.call();
  }

  @override
  Widget build(BuildContext context) {
    final novel = ref.watch(novelStoreProvider).novel(widget.novelId);
    final trailer = _trailer;
    final accent = novel == null ? _gold : accentOf(novel);
    final still = MediaQuery.disableAnimationsOf(context);
    final bar = MediaQuery.sizeOf(context).height * 0.1;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (trailer == null || novel == null)
            const Center(child: CircularProgressIndicator(color: _gold))
          else if (_done)
            _PosterStage(
              posterKey: _poster,
              poster: TrailerPoster(novel: novel, trailer: trailer, words: _words, chapters: _chapters),
              message: _message,
              working: _working,
              onShare: _share,
              onAgain: () => _play(0),
              onKeepWriting: widget.onKeepWriting == null ? null : _keepWriting,
            )
          else ...[
            // The stage: a press cuts to the next shot.
            Semantics(
              button: true,
              label: 'Next shot',
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _next,
                child: AnimatedBuilder(
                  animation: _clock,
                  builder: (context, _) =>
                      _ShotView(shot: trailer.shots[_at], t: _clock.value, accent: accent, still: still, bar: bar),
                ),
              ),
            ),
            // The bars, as a film is shown on a wide screen.
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              height: bar,
              child: const ColoredBox(color: Colors.black),
            ),
            // The foot's bar runs under the phone's own buttons, and what is on it sits above them.
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: bar + MediaQuery.paddingOf(context).bottom,
              child: Container(
                color: Colors.black,
                padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    ExcludeSemantics(
                      child: AnimatedBuilder(
                        animation: _clock,
                        builder: (context, _) => Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 48),
                          child: LinearProgressIndicator(
                            value: (_at + _clock.value) / trailer.shots.length,
                            minHeight: 2,
                            color: _gold.withValues(alpha: 0.8),
                            backgroundColor: Colors.white12,
                          ),
                        ),
                      ),
                    ),
                    TextButton(
                      style: TextButton.styleFrom(foregroundColor: _ink.withValues(alpha: 0.7)),
                      onPressed: _end,
                      child: const Text('Skip to the poster'),
                    ),
                  ],
                ),
              ),
            ),
          ],
          Positioned(
            right: 4,
            top: MediaQuery.paddingOf(context).top + 4,
            child: IconButton(
              tooltip: 'Close',
              color: _ink,
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close),
            ),
          ),
        ],
      ),
    );
  }
}

/// One shot at [t] (0 to 1) through it: up out of the dark, closer, and down again; the light drifting across.
class _ShotView extends StatelessWidget {
  const _ShotView({required this.shot, required this.t, required this.accent, required this.still, required this.bar});

  final Shot shot;
  final double t;
  final Color accent;
  final bool still;
  final double bar;

  @override
  Widget build(BuildContext context) {
    // The title does not fade: the poster follows it.
    final fadeOut = shot.kind == ShotKind.title ? 1.0 : ((1 - t) / 0.16).clamp(0.0, 1.0);
    final opacity = math.min((t / 0.16).clamp(0.0, 1.0), fadeOut);
    final drift = still ? 0.0 : -0.5 + t;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(drift, -0.05),
          radius: 0.9,
          colors: [
            accent.withValues(alpha: 0.32 * opacity),
            Color.lerp(accent, Colors.black, 0.85)!.withValues(alpha: 0.5 * opacity),
            Colors.black,
          ],
          stops: const [0, 0.55, 1],
        ),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(28, bar, 28, bar),
        child: Center(
          child: Opacity(
            opacity: opacity,
            child: Transform.scale(scale: still ? 1 : 0.96 + 0.07 * t, child: _words(context)),
          ),
        ),
      ),
    );
  }

  Widget _words(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    return switch (shot.kind) {
      ShotKind.from => Text(
        shot.text.toUpperCase(),
        textAlign: TextAlign.center,
        style: vaultHeading(
          context,
          size: 15,
          color: _ink.withValues(alpha: 0.85),
          weight: 600,
        ).copyWith(letterSpacing: 4 + 3 * t),
      ),
      ShotKind.line => ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Text(
          shot.text,
          textAlign: TextAlign.center,
          style: vaultText(context, size: width < 420 ? 28 : 34, color: _ink).copyWith(height: 1.3),
        ),
      ),
      ShotKind.name => FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          shot.text.toUpperCase(),
          style: vaultHeading(context, size: 34, color: _gold, weight: 700).copyWith(letterSpacing: 4 + 8 * t),
        ),
      ),
      ShotKind.title => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Flare(colour: accent, reach: still ? 1 : (t * 1.6).clamp(0.0, 1.0)),
          const SizedBox(height: 18),
          Text(
            shot.text.toUpperCase(),
            textAlign: TextAlign.center,
            style: vaultHeading(
              context,
              size: width < 420 ? 36 : 48,
              color: _ink,
              weight: 700,
            ).copyWith(letterSpacing: 5, height: 1.15),
          ),
          const SizedBox(height: 18),
          _Flare(colour: accent, reach: still ? 1 : (t * 1.6).clamp(0.0, 1.0)),
        ],
      ),
    };
  }
}

/// A streak of light, as through a wide lens: [reach] of its length drawn, from the middle out.
class _Flare extends StatelessWidget {
  const _Flare({required this.colour, required this.reach});
  final Color colour;
  final double reach;

  @override
  Widget build(BuildContext context) {
    final light = Color.lerp(colour, Colors.white, 0.55)!;
    return SizedBox(
      width: 260 * reach,
      height: 2,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [light.withValues(alpha: 0), light, light.withValues(alpha: 0)]),
          boxShadow: [BoxShadow(color: light.withValues(alpha: 0.5), blurRadius: 8)],
        ),
      ),
    );
  }
}

/// Where the trailer ends: its poster, and what to do with it.
class _PosterStage extends StatelessWidget {
  const _PosterStage({
    required this.posterKey,
    required this.poster,
    required this.message,
    required this.working,
    required this.onShare,
    required this.onAgain,
    required this.onKeepWriting,
  });

  final GlobalKey posterKey;
  final Widget poster;
  final String? message;
  final bool working;
  final VoidCallback onShare;
  final VoidCallback onAgain;
  final VoidCallback? onKeepWriting;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Column(
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 48, 16, 12),
            child: Center(
              child: FittedBox(
                child: RepaintBoundary(key: posterKey, child: poster),
              ),
            ),
          ),
        ),
        if (message != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              message!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: _ink),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 10,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: _ink,
                  side: const BorderSide(color: Colors.white38),
                ),
                onPressed: onAgain,
                icon: const Icon(Icons.replay),
                label: const Text('Play again'),
              ),
              FilledButton.tonalIcon(
                onPressed: working ? null : onShare,
                icon: const Icon(Icons.ios_share),
                label: const Text('Share the poster'),
              ),
              if (onKeepWriting != null)
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: const Color(0xFF1E1606)),
                  onPressed: onKeepWriting,
                  icon: const Icon(Icons.edit_note),
                  label: const Text('Keep writing'),
                ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// The poster, as a film's is: the names above, the line that lands hardest, the title between two streaks of light,
/// who wrote it, COMING SOON, and the block of small print at the foot.
class TrailerPoster extends StatelessWidget {
  const TrailerPoster({
    super.key,
    required this.novel,
    required this.trailer,
    required this.words,
    required this.chapters,
  });

  final Novel novel;
  final Trailer trailer;
  final int words;
  final int chapters;

  @override
  Widget build(BuildContext context) {
    final accent = accentOf(novel);
    final author = novel.author.trim();
    final title = novel.title.trim().isEmpty ? 'Untitled' : novel.title.trim();
    final billing = [
      if (author.isNotEmpty) 'WRITTEN BY ${author.toUpperCase()}',
      if (trailer.cast.isNotEmpty) 'STARRING ${trailer.cast.map((n) => n.toUpperCase()).join('  ')}',
      plural(chapters, 'chapter').toUpperCase(),
      '${formatNumber(words)} WORDS AND COUNTING',
      'MADE WITH NOVEL BUILDER',
    ].join('   ');
    return SizedBox.fromSize(
      size: posterSize,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: const Alignment(0, -0.15),
            radius: 1.0,
            colors: [accent.withValues(alpha: 0.55), Color.lerp(accent, Colors.black, 0.88)!, Colors.black],
            stops: const [0, 0.55, 1],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(26, 30, 26, 22),
          child: Column(
            children: [
              Text(
                trailer.cast.isNotEmpty
                    ? trailer.cast.map((n) => n.toUpperCase()).join('    ')
                    : (author.isEmpty ? '' : author.toUpperCase()),
                textAlign: TextAlign.center,
                maxLines: 2,
                style: vaultHeading(
                  context,
                  size: 12,
                  color: _ink.withValues(alpha: 0.85),
                  weight: 600,
                ).copyWith(letterSpacing: 3),
              ),
              const Spacer(flex: 3),
              if (trailer.sting.isNotEmpty)
                Text(
                  trailer.sting,
                  textAlign: TextAlign.center,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: vaultText(context, size: 21, color: _ink, style: FontStyle.italic).copyWith(height: 1.3),
                ),
              const Spacer(flex: 2),
              _Flare(colour: accent, reach: 1),
              const SizedBox(height: 14),
              Text(
                title.toUpperCase(),
                textAlign: TextAlign.center,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: vaultHeading(
                  context,
                  size: 34,
                  color: _ink,
                  weight: 700,
                ).copyWith(letterSpacing: 4, height: 1.15),
              ),
              const SizedBox(height: 14),
              _Flare(colour: accent, reach: 1),
              if (author.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  'A NOVEL BY ${author.toUpperCase()}',
                  textAlign: TextAlign.center,
                  style: vaultHeading(
                    context,
                    size: 11,
                    color: _ink.withValues(alpha: 0.8),
                    weight: 600,
                  ).copyWith(letterSpacing: 3),
                ),
              ],
              const Spacer(flex: 3),
              Text(
                'COMING SOON',
                style: vaultHeading(context, size: 15, color: _gold, weight: 700).copyWith(letterSpacing: 6),
              ),
              const SizedBox(height: 12),
              Text(
                billing,
                textAlign: TextAlign.center,
                maxLines: 3,
                style: vaultHeading(
                  context,
                  size: 8,
                  color: _ink.withValues(alpha: 0.55),
                  weight: 500,
                ).copyWith(letterSpacing: 0.4, height: 1.3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
