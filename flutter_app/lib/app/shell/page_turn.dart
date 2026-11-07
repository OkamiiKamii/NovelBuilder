import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// THE PAGE TURN: going from one area to another (the rail, the bottom bar, a shortcut), the page being left is a
/// leaf of the book: a picture of it is taken at that moment, the new area is opened under it, and the leaf turns away
/// on its spine, in perspective, shading as it goes. Forward through the areas it turns to the left, from the edge by
/// the binding; back, to the right. It only draws over the new page (which is already live and takes presses) and
/// lasts under half a second; with less motion asked for, or if the picture cannot be taken, the area just opens.
class PageTurner extends StatefulWidget {
  const PageTurner({super.key, required this.builder});

  /// Builds the frame; [bind] wraps the page the turn takes its picture of.
  final Widget Function(BuildContext context, Widget Function(Widget page) bind) builder;

  /// The turner around [context], when there is one.
  static PageTurnerState? of(BuildContext context) => context.findAncestorStateOfType<PageTurnerState>();

  @override
  State<PageTurner> createState() => PageTurnerState();
}

class PageTurnerState extends State<PageTurner> {
  final _page = GlobalKey();
  OverlayEntry? _turning;

  /// Runs [go] (which opens the other area) with the page being left turning away over it.
  void turn({required bool forward, required VoidCallback go}) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    final box = _page.currentContext?.findRenderObject();
    if (_turning != null ||
        overlay == null ||
        MediaQuery.disableAnimationsOf(context) ||
        box is! RenderRepaintBoundary) {
      go();
      return;
    }
    ui.Image? leaf;
    try {
      leaf = box.toImageSync(pixelRatio: MediaQuery.devicePixelRatioOf(context));
    } on Object {
      leaf = null;
    }
    if (leaf == null || !box.hasSize) {
      leaf?.dispose();
      go();
      return;
    }
    final at = box.localToGlobal(Offset.zero) & box.size;
    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => _TurningLeaf(
        image: leaf!,
        at: at,
        forward: forward,
        onDone: () {
          entry.remove();
          leaf!.dispose();
          if (identical(_turning, entry)) _turning = null;
        },
      ),
    );
    _turning = entry;
    overlay.insert(entry);
    go();
  }

  @override
  void dispose() {
    _turning?.remove();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, (page) => RepaintBoundary(key: _page, child: page));
}

class _TurningLeaf extends StatefulWidget {
  const _TurningLeaf({required this.image, required this.at, required this.forward, required this.onDone});
  final ui.Image image;
  final Rect at;
  final bool forward;
  final VoidCallback onDone;

  @override
  State<_TurningLeaf> createState() => _TurningLeafState();
}

class _TurningLeafState extends State<_TurningLeaf> with SingleTickerProviderStateMixin {
  late final _turn = AnimationController(vsync: this, duration: const Duration(milliseconds: 460))
    ..forward().whenComplete(widget.onDone);

  @override
  void dispose() {
    _turn.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Positioned.fromRect(
    rect: widget.at,
    child: IgnorePointer(
      child: ExcludeSemantics(
        child: AnimatedBuilder(
          animation: _turn,
          builder: (context, _) {
            final t = Curves.easeInCubic.transform(_turn.value);
            final hinge = widget.forward ? Alignment.centerLeft : Alignment.centerRight;
            return Stack(
              fit: StackFit.expand,
              children: [
                // The shadow the lifting leaf casts on the page beneath, deepest by the spine.
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: widget.forward ? Alignment.centerLeft : Alignment.centerRight,
                      end: widget.forward ? Alignment.centerRight : Alignment.centerLeft,
                      colors: [
                        Colors.black.withValues(alpha: 0.28 * (1 - t)),
                        Colors.black.withValues(alpha: 0),
                      ],
                      stops: [0, 0.15 + 0.6 * (1 - t)],
                    ),
                  ),
                ),
                Transform(
                  alignment: hinge,
                  transform: Matrix4.identity()
                    ..setEntry(3, 2, 0.0011)
                    ..rotateY((widget.forward ? -1 : 1) * t * math.pi / 2),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      // The page's paper under its picture: the picture holds only what is drawn on it.
                      ColoredBox(color: Theme.of(context).scaffoldBackgroundColor),
                      RawImage(image: widget.image, fit: BoxFit.fill),
                      // The leaf darkens as it turns from the light.
                      ColoredBox(color: Colors.black.withValues(alpha: 0.35 * t)),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    ),
  );
}
