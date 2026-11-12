import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/prose.dart';
import '../../shared/domain/manuscript/time_lapse.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import 'data/manuscript_service.dart';

/// The frames of a chapter's time-lapse: its saved copies in history (of the draft in the manuscript) and its text as
/// saved now.
List<LapseFrame> lapseFramesOf(ManuscriptService service, String novelId, StoryNode node, JsonMap? saved) {
  final draft = str(node.raw['branchName'], mainDraft);
  return timeLapse([
    for (final r in service.revisions(novelId, node.id))
      if (str(r['branchName'], mainDraft) == draft)
        (at: (numOrNull(r['savedAt']) ?? numOrNull(r['capturedAt']) ?? 0).toInt(), paragraphs: blockTexts(r['doc'])),
    if (saved != null)
      (
        at: (numOrNull(saved['savedAt']) ?? DateTime.now().millisecondsSinceEpoch).toInt(),
        paragraphs: blockTexts(saved['doc']),
      ),
  ]);
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "Nov 9, 8:14 PM".
String lapseWhen(BuildContext context, int millis) {
  final d = DateTime.fromMillisecondsSinceEpoch(millis);
  final time = MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(d));
  return '${_months[d.month - 1]} ${d.day}, $time';
}

/// Opens the time-lapse of [node]: the whole screen on a phone, a large window elsewhere.
Future<void> showTimeLapse(BuildContext context, {required List<LapseFrame> frames, required String title}) {
  final body = TimeLapseView(frames: frames, title: title);
  return showDialog<void>(
    context: context,
    builder: (context) => WindowSize.of(context) == WindowSize.compact
        ? Dialog.fullscreen(child: body)
        : Dialog(
            child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 760, maxHeight: 820), child: body),
          ),
  );
}

/// TIME-LAPSE: the chapter writing itself, from its first saved copy to now. Frame by frame (on its own, or dragged
/// through), the page as it stood then, the paragraphs that frame added inked in gold and brought into view; over it,
/// when, how long, and how much that frame added; under it, the chapter's growth as a line. Reads history only.
class TimeLapseView extends StatefulWidget {
  const TimeLapseView({super.key, required this.frames, required this.title});

  final List<LapseFrame> frames;
  final String title;

  /// How long each frame stays while playing.
  static const beat = Duration(milliseconds: 1100);

  @override
  State<TimeLapseView> createState() => _TimeLapseViewState();
}

class _TimeLapseViewState extends State<TimeLapseView> {
  int _at = 0;
  Timer? _play;
  final _keys = <int, GlobalKey>{};
  final _scroll = ScrollController();

  List<LapseFrame> get frames => widget.frames;

  @override
  void initState() {
    super.initState();
    // Starts at once, from the first copy, unless there is only one.
    if (frames.length > 1) WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    _play?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  bool get _playing => _play != null;

  void _start() {
    if (!mounted) return;
    if (_at >= frames.length - 1) _go(0);
    _play?.cancel();
    _play = Timer.periodic(TimeLapseView.beat, (_) {
      if (_at >= frames.length - 1) {
        _stop();
      } else {
        _go(_at + 1);
      }
    });
    setState(() {});
  }

  void _stop() {
    _play?.cancel();
    _play = null;
    if (mounted) setState(() {});
  }

  void _go(int i) {
    setState(() => _at = i.clamp(0, frames.length - 1));
    // The first paragraph the frame added, brought into view once it is laid out.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final fresh = frames[_at].fresh;
      if (fresh.isEmpty || !mounted) return;
      final first = fresh.reduce(math.min);
      final target = _keys[first]?.currentContext;
      if (target != null) {
        Scrollable.ensureVisible(
          target,
          alignment: 0.25,
          duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 380),
          curve: Curves.easeOutCubic,
        );
      } else if (_scroll.hasClients) {
        // Not built yet (far down a long chapter): near enough, by its place in the text, then exactly.
        final p = _scroll.position;
        _scroll.jumpTo(
          (p.maxScrollExtent * first / math.max(1, frames[_at].paragraphs.length)).clamp(0, p.maxScrollExtent),
        );
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final again = _keys[first]?.currentContext;
          if (again != null && mounted) Scrollable.ensureVisible(again, alignment: 0.25);
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = vaultText(context, size: 15, color: scheme.onSurfaceVariant);
    if (frames.isEmpty) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Head(title: widget.title, line: 'Nothing has been saved here yet.'),
          const Padding(padding: EdgeInsets.all(24), child: Text('Write a little, and its story starts here.')),
        ],
      );
    }
    final frame = frames[_at];
    final before = _at == 0 ? 0 : frames[_at - 1].words;
    final added = frame.words - before;
    final line = [
      lapseWhen(context, frame.at),
      plural(frame.words, 'word'),
      if (_at > 0) '${added >= 0 ? '+' : '−'}${formatNumber(added.abs())}',
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Head(title: widget.title, line: line),
        const Divider(height: 1),
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
            itemCount: frame.paragraphs.length,
            itemBuilder: (context, i) {
              final fresh = frame.fresh.contains(i);
              return Padding(
                key: _keys.putIfAbsent(i, GlobalKey.new),
                padding: const EdgeInsets.only(bottom: 12),
                child: TweenAnimationBuilder<double>(
                  // A new frame inks its paragraphs afresh; the rest stand as they were.
                  key: ValueKey(fresh ? 'fresh-$_at-$i' : 'kept-$i'),
                  tween: Tween(begin: fresh ? 0 : 1, end: 1),
                  duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 320),
                  builder: (context, t, child) => DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border(left: BorderSide(color: fresh ? scheme.primary : Colors.transparent, width: 3)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Opacity(opacity: 0.5 + 0.5 * t, child: child),
                    ),
                  ),
                  child: Text(
                    frame.paragraphs[i],
                    style: vaultText(
                      context,
                      size: 17,
                      color: fresh ? Color.lerp(scheme.onSurface, scheme.primary, 0.35) : scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Column(
            children: [
              SizedBox(
                height: 42,
                child: ExcludeSemantics(
                  child: CustomPaint(
                    size: Size.infinite,
                    painter: _Growth(frames: frames, at: _at, ink: scheme.primary, faint: scheme.outlineVariant),
                  ),
                ),
              ),
              Row(
                children: [
                  IconButton.filled(
                    tooltip: _playing ? 'Pause' : 'Play',
                    onPressed: frames.length < 2 ? null : (_playing ? _stop : _start),
                    icon: Icon(_playing ? Icons.pause : Icons.play_arrow),
                  ),
                  Expanded(
                    child: Slider(
                      value: _at.toDouble(),
                      max: math.max(1, frames.length - 1).toDouble(),
                      divisions: math.max(1, frames.length - 1),
                      label: lapseWhen(context, frame.at),
                      semanticFormatterCallback: (_) => 'Copy ${_at + 1} of ${frames.length}, $line',
                      onChanged: frames.length < 2
                          ? null
                          : (v) {
                              _stop();
                              _go(v.round());
                            },
                    ),
                  ),
                  Text('${_at + 1} / ${frames.length}', style: muted),
                  const SizedBox(width: 4),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Head extends StatelessWidget {
  const _Head({required this.title, required this.line});
  final String title;
  final String line;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 8, 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('TIME-LAPSE', style: vaultHeading(context, size: 11.5, color: scheme.primary, weight: 700)),
                Semantics(
                  header: true,
                  child: Text('How “$title” grew', style: vaultHeading(context, size: 18, weight: 700)),
                ),
                const SizedBox(height: 2),
                Semantics(
                  liveRegion: true,
                  child: Text(line, style: vaultText(context, size: 15, color: scheme.onSurfaceVariant)),
                ),
              ],
            ),
          ),
          IconButton(tooltip: 'Close', onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
        ],
      ),
    );
  }
}

/// The chapter's words over its copies, as a line rising across the strip, the frame shown marked.
class _Growth extends CustomPainter {
  _Growth({required this.frames, required this.at, required this.ink, required this.faint});
  final List<LapseFrame> frames;
  final int at;
  final Color ink;
  final Color faint;

  @override
  void paint(Canvas canvas, Size size) {
    if (frames.isEmpty) return;
    final most = math.max(1, frames.fold(0, (m, f) => math.max(m, f.words)));
    const pad = 6.0;
    Offset point(int i) => Offset(
      pad + (size.width - pad * 2) * (frames.length == 1 ? 1 : i / (frames.length - 1)),
      size.height - pad - (size.height - pad * 2) * frames[i].words / most,
    );
    final path = Path()..moveTo(point(0).dx, point(0).dy);
    for (var i = 1; i < frames.length; i++) {
      path.lineTo(point(i).dx, point(i).dy);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = faint
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    final come = Path()..moveTo(point(0).dx, point(0).dy);
    for (var i = 1; i <= at; i++) {
      come.lineTo(point(i).dx, point(i).dy);
    }
    canvas.drawPath(
      come,
      Paint()
        ..color = ink
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(point(at), 4.5, Paint()..color = ink);
  }

  @override
  bool shouldRepaint(_Growth old) => old.at != at || old.frames != frames || old.ink != ink;
}
