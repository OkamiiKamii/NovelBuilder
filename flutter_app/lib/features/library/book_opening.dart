import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/domain/records/novel.dart';
import '../characters/widgets/vault.dart';
import '../write/writing_prefs.dart';
import 'bookshelf.dart';

/// THE BOOK OPENS: going from the library into a novel, its jacket lifts from where it was pressed (a cover, a spine,
/// the book waiting at the top), comes to the middle of the screen, and its cover swings open on the spine to the
/// first page: the paper the author writes on, headed with the book and the chapter it opens at. The page then fills
/// the screen, [go] runs underneath (the writing desk, on the same paper), and the page fades away over it.
///
/// Under a second. Skipped, and [go] run at once, when the device asks for less motion or the place pressed cannot
/// be found. Reads nothing and changes nothing: it only draws.
void openWithBook(
  BuildContext context,
  WidgetRef ref,
  Novel novel, {
  required GlobalKey from,
  String? chapter,
  required VoidCallback go,
}) {
  // Only while the page that asked is still there: its flows read from it.
  void run() {
    if (context.mounted) go();
  }

  final box = from.currentContext?.findRenderObject();
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (MediaQuery.disableAnimationsOf(context) || box is! RenderBox || !box.attached || overlay == null) {
    run();
    return;
  }
  final start = box.localToGlobal(Offset.zero) & box.size;
  final prefs = ref.read(writingPrefsProvider)[deviceFormOf(context)]!;
  final colours = pageColors(prefs.page);
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _Opening(
      novel: novel,
      start: start,
      chapter: chapter,
      paper: colours?.background,
      ink: colours?.text,
      onOpen: run,
      onDone: () => entry.remove(),
    ),
  );
  overlay.insert(entry);
}

class _Opening extends StatefulWidget {
  const _Opening({
    required this.novel,
    required this.start,
    required this.chapter,
    required this.paper,
    required this.ink,
    required this.onOpen,
    required this.onDone,
  });

  final Novel novel;
  final Rect start;
  final String? chapter;
  final Color? paper;
  final Color? ink;
  final VoidCallback onOpen;
  final VoidCallback onDone;

  @override
  State<_Opening> createState() => _OpeningState();
}

class _OpeningState extends State<_Opening> with TickerProviderStateMixin {
  late final _open = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  late final _fade = AnimationController(vsync: this, duration: const Duration(milliseconds: 260));

  @override
  void initState() {
    super.initState();
    _open.forward().whenComplete(() {
      if (!mounted) return;
      // The desk is built under the page, on the same paper; then the page lifts away.
      widget.onOpen();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _fade.forward().whenComplete(widget.onDone);
      });
    });
  }

  @override
  void dispose() {
    _open.dispose();
    _fade.dispose();
    super.dispose();
  }

  /// [t] mapped onto [from]–[to] of the whole, eased; 0 before and 1 after.
  double _span(double t, double from, double to, [Curve curve = Curves.easeInOutCubic]) =>
      curve.transform(((t - from) / (to - from)).clamp(0.0, 1.0));

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final screen = MediaQuery.sizeOf(context);
    final paper = widget.paper ?? (dark ? scheme.surfaceContainerHigh : scheme.surfaceContainerLowest);
    final ink = widget.ink ?? scheme.onSurface;
    // The book at the middle: as tall as fits, 2 : 3.
    final height = math.min(screen.height * 0.62, (screen.width * 0.6) * 1.5).clamp(180.0, 560.0);
    final middle = Rect.fromCenter(center: screen.center(Offset.zero), width: height / 1.5, height: height);
    // A spine is narrow: the jacket grows out of it at its own height.
    final from = widget.start.width < widget.start.height / 2.2
        ? Rect.fromCenter(center: widget.start.center, width: widget.start.height / 1.5, height: widget.start.height)
        : widget.start;

    return IgnorePointer(
      child: AnimatedBuilder(
        animation: Listenable.merge([_open, _fade]),
        builder: (context, _) {
          final t = _open.value;
          final lift = _span(t, 0, 0.42);
          final swing = _span(t, 0.3, 0.8);
          final fill = _span(t, 0.72, 1, Curves.easeInCubic);
          final rect = Rect.lerp(Rect.lerp(from, middle, lift), Offset.zero & screen, fill)!;
          final title = widget.novel.title.isEmpty ? 'Untitled novel' : widget.novel.title;
          final page = DecoratedBox(
            decoration: BoxDecoration(
              color: paper,
              borderRadius: BorderRadius.circular(6 * (1 - fill)),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3 * (1 - fill)), blurRadius: 18)],
            ),
            child: Opacity(
              opacity: 1 - fill,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(title.toUpperCase(), style: vaultHeading(context, size: 13, color: ink, weight: 600)),
                        const SizedBox(height: 10),
                        Container(width: 40, height: 1, color: ink.withValues(alpha: 0.5)),
                        if (widget.chapter != null) ...[
                          const SizedBox(height: 10),
                          Text(
                            widget.chapter!,
                            style: vaultText(context, size: 15, color: ink, style: FontStyle.italic),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
          return Opacity(
            opacity: 1 - _fade.value,
            child: Stack(
              children: [
                // The room dims a little while the book is held up.
                Positioned.fill(
                  child: ColoredBox(color: Colors.black.withValues(alpha: 0.35 * lift * (1 - fill))),
                ),
                Positioned.fromRect(
                  rect: rect,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      page,
                      // The cover, hinged on its spine (the left edge), turning towards the reader and away.
                      if (swing < 1)
                        Transform(
                          alignment: Alignment.centerLeft,
                          transform: Matrix4.identity()
                            ..setEntry(3, 2, 0.0012)
                            ..rotateY(-swing * math.pi * 0.5),
                          child: FittedBox(
                            fit: BoxFit.fill,
                            child: BookJacket(novel: widget.novel, width: 200),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
