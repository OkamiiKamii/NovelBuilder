import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../characters/widgets/vault.dart';
import 'topics.dart';

/// Marks what the spotlight must not point at: the tutorial itself, and the spotlight's own card.
const tutorialMark = ValueKey('tutorial-not-the-page');

/// A stop of the tour: a step of the lesson, the button it names, and where that button is on the screen.
typedef TourStop = ({int step, String name, Rect at});

/// Where on the screen each of [names] is now, read from what is built: a Text reading the name (or beginning with it), or a
/// Tooltip with it as its message, shown on the screen (not scrolled away, not under the tutorial), and the button it
/// belongs to when it is the label of one. The first found of each name counts.
Map<String, Rect> findOnScreen(Iterable<String> names) {
  final wanted = names.toSet();
  final found = <String, Rect>{};
  final root = WidgetsBinding.instance.rootElement;
  if (root == null) return found;
  final view = WidgetsBinding.instance.platformDispatcher.views.firstOrNull;
  final screen = view == null ? Rect.largest : Offset.zero & (view.physicalSize / view.devicePixelRatio);

  void visit(Element e) {
    final w = e.widget;
    if (w.key == tutorialMark || w is Offstage && w.offstage) return;
    final label = switch (w) {
      Text(:final data?) => data,
      Tooltip(:final message?) => message,
      _ => null,
    };
    // The name exactly, or a label that begins with it and goes on ("Continue writing “Chapter 1”").
    final name = label == null
        ? null
        : wanted.contains(label)
        ? label
        : wanted.where((n) => label.startsWith('$n ')).firstOrNull;
    if (name != null && !found.containsKey(name)) {
      final at = _rectOf(_buttonAround(e) ?? e);
      if (at != null && at.width > 4 && at.height > 4 && screen.contains(at.center)) found[name] = at;
    }
    e.visitChildElements(visit);
  }

  root.visitChildElements(visit);
  return found;
}

Element? _buttonAround(Element e) {
  Element? button;
  var depth = 0;
  e.visitAncestorElements((a) {
    final w = a.widget;
    if (w is ButtonStyleButton || w is IconButton || w is InkWell || w is ListTile || w is RawChip) {
      button = a;
      return false;
    }
    return ++depth < 24;
  });
  return button;
}

Rect? _rectOf(Element e) {
  final box = e.findRenderObject();
  if (box is! RenderBox || !box.attached || !box.hasSize) return null;
  return box.localToGlobal(Offset.zero) & box.size;
}

/// The tour of [topic] on the page in view: each step, in order, that names a button shown on the screen (the first
/// one it names that is), at that button. Steps naming nothing on the screen are left out.
List<TourStop> tourOf(Topic topic) {
  final named = [
    for (final step in topic.steps)
      [
        for (final n in tutorialButtonNames)
          if (step.contains(n)) n,
      ],
  ];
  final at = findOnScreen(named.expand((n) => n));
  return [
    for (final (i, names) in named.indexed)
      // The name the step mentions first, of those on the screen.
      if ((names.where(at.containsKey).toList()
            ..sort((a, b) => topic.steps[i].indexOf(a).compareTo(topic.steps[i].indexOf(b))))
          case [final n, ...])
        (step: i, name: n, at: at[n]!),
  ];
}

/// SHOW ME ON THIS PAGE: the page dims, but for a lit window around each button the lesson names, one at a time, with
/// the step it belongs to on a card beside it: Next walks on, Back returns, Done (or Escape, or ×) ends it. The window
/// glides from button to button and breathes while it waits (still, with less motion asked for). It only points: a
/// press anywhere but the card's buttons does nothing, and nothing in the novel changes.
void showSpotlight(BuildContext context, Topic topic, List<TourStop> stops) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null || stops.isEmpty) return;
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _Spotlight(topic: topic, stops: stops, onDone: () => entry.remove()),
  );
  overlay.insert(entry);
}

class _Spotlight extends StatefulWidget {
  const _Spotlight({required this.topic, required this.stops, required this.onDone});
  final Topic topic;
  final List<TourStop> stops;
  final VoidCallback onDone;

  @override
  State<_Spotlight> createState() => _SpotlightState();
}

class _SpotlightState extends State<_Spotlight> with SingleTickerProviderStateMixin {
  var _at = 0;
  var _started = false;
  late final _breath = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
  final _focus = FocusNode();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _breath.stop();
    } else if (!_started) {
      _started = true;
      _breathe();
    }
  }

  @override
  void dispose() {
    _breath.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// A few breaths at each stop, then still: enough to draw the eye, not to keep tugging at it.
  void _breathe() {
    if (MediaQuery.disableAnimationsOf(context)) return;
    _breath
      ..reset()
      ..repeat(reverse: true, count: 4);
  }

  void _go(int to) {
    setState(() => _at = to);
    _breathe();
  }

  @override
  Widget build(BuildContext context) {
    final stop = widget.stops[_at];
    final last = _at == widget.stops.length - 1;
    final size = MediaQuery.sizeOf(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final still = MediaQuery.disableAnimationsOf(context);
    final hole = stop.at.inflate(8);
    // The card goes on the side of the window with more room, clear of the phone's own bars, and scrolls if it must.
    final pad = MediaQuery.paddingOf(context);
    final roomBelow = size.height - pad.bottom - hole.bottom - 30;
    final roomAbove = hole.top - pad.top - 30;
    final below = roomBelow >= roomAbove;
    final room = (below ? roomBelow : roomAbove).clamp(120.0, size.height);
    final width = size.width < 420 ? size.width - 32 : 380.0;
    final left = (hole.center.dx - width / 2).clamp(16.0, size.width - width - 16);

    final card = KeyedSubtree(
      key: tutorialMark,
      child: Material(
        color: scheme.surface,
        elevation: 10,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 8, 10),
          child: Semantics(
            liveRegion: true,
            container: true,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${widget.topic.title.toUpperCase()} · STEP ${stop.step + 1}',
                        style: vaultHeading(context, size: 12, color: scheme.onSurfaceVariant),
                      ),
                    ),
                    IconButton(tooltip: 'End the tour', onPressed: widget.onDone, icon: const Icon(Icons.close)),
                  ],
                ),
                Text(stop.name, style: vaultHeading(context, size: 18, weight: 700)),
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: Text(widget.topic.steps[stop.step], style: vaultText(context, size: 16)),
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: Row(
                    children: [
                      Text('${_at + 1} of ${widget.stops.length}', style: theme.textTheme.bodySmall),
                      const Spacer(),
                      if (_at > 0) TextButton(onPressed: () => _go(_at - 1), child: const Text('Back')),
                      const SizedBox(width: 4),
                      FilledButton(
                        onPressed: last ? widget.onDone : () => _go(_at + 1),
                        child: Text(last ? 'Done' : 'Next'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    return Focus(
      focusNode: _focus,
      autofocus: true,
      onKeyEvent: (_, event) {
        if (event is KeyDownEvent && event.logicalKey == LogicalKeyboardKey.escape) {
          widget.onDone();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: Stack(
        children: [
          // The dimmed page with its window, gliding to each button in turn. Presses on it do nothing.
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {},
              child: ExcludeSemantics(
                child: TweenAnimationBuilder<Rect?>(
                  tween: RectTween(end: hole),
                  duration: still ? Duration.zero : const Duration(milliseconds: 380),
                  curve: Curves.easeInOutCubic,
                  builder: (context, rect, _) => AnimatedBuilder(
                    animation: _breath,
                    builder: (context, _) => CustomPaint(
                      painter: _Dim(hole: rect ?? hole, ring: scheme.onSurface, breath: still ? 0.5 : _breath.value),
                    ),
                  ),
                ),
              ),
            ),
          ),
          AnimatedPositioned(
            duration: still ? Duration.zero : const Duration(milliseconds: 380),
            curve: Curves.easeInOutCubic,
            left: left,
            width: width,
            top: below ? hole.bottom + 14 : null,
            bottom: below ? null : size.height - hole.top + 14,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: room),
              child: SingleChildScrollView(child: card),
            ),
          ),
        ],
      ),
    );
  }
}

/// The dim over the page, with a rounded window cut at [hole] and a ring around it (in the page's ink, so it shows on a
/// button of any colour) that swells a little with [breath].
class _Dim extends CustomPainter {
  const _Dim({required this.hole, required this.ring, required this.breath});
  final Rect hole;
  final Color ring;
  final double breath;

  @override
  void paint(Canvas canvas, Size size) {
    final window = RRect.fromRectAndRadius(hole, const Radius.circular(12));
    canvas.drawPath(
      Path.combine(PathOperation.difference, Path()..addRect(Offset.zero & size), Path()..addRRect(window)),
      Paint()..color = Colors.black.withValues(alpha: 0.62),
    );
    canvas.drawRRect(
      window.inflate(2 + 4 * breath),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = ring.withValues(alpha: 0.95 - 0.45 * breath),
    );
    canvas.drawRRect(
      window,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = ring,
    );
  }

  @override
  bool shouldRepaint(_Dim old) => old.hole != hole || old.breath != breath || old.ring != ring;
}
