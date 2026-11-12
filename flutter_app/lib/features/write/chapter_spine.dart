import 'package:flutter/material.dart';
import 'package:super_editor/super_editor.dart';

/// One paragraph of the chapter as the spine draws it: its length in letters, and whether it is a heading.
typedef SpineMark = ({int length, bool heading, bool fresh});

/// The chapter as marks: every paragraph, heading or list item, in order.
List<SpineMark> spineOf(Document? document, {Set<String> fresh = const {}}) => [
  if (document != null)
    for (final node in document)
      if (node is TextNode)
        (
          length: node.text.toPlainText().length,
          heading: switch (node.getMetadataValue('blockType')) {
            final NamedAttribution a => a.id.startsWith('header'),
            _ => false,
          },
          fresh: fresh.contains(node.id),
        ),
];

/// THE CHAPTER'S SPINE: a slim strip down the right edge of the page drawing the whole chapter as a column of marks,
/// one to a paragraph, each as long as the paragraph is, headings in the accent; a lit window over the part on screen.
/// A press or a drag on it moves the page there. Shown only when the chapter runs past the screen, so a short one has
/// the page to itself. Screen readers scroll the page as before; the strip is a picture for the eye.
class ChapterSpine extends StatefulWidget {
  const ChapterSpine({super.key, required this.document, required this.scroll, this.fresh = const {}});

  final Document? document;
  final ScrollController scroll;

  /// The paragraphs in today's ink (`fresh_ink.dart`), drawn in the accent.
  final Set<String> fresh;

  /// Paragraphs before the spine is worth drawing.
  static const fewest = 12;

  @override
  State<ChapterSpine> createState() => _ChapterSpineState();
}

class _ChapterSpineState extends State<ChapterSpine> {
  ScrollController get scroll => widget.scroll;

  // The page is measured only once it is laid out: look again after each frame it was not.
  void _later() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (mounted) setState(() {});
  });

  void _go(double fraction) {
    if (!scroll.hasClients) return;
    final p = scroll.position;
    final total = p.maxScrollExtent + p.viewportDimension;
    scroll.jumpTo((fraction * total - p.viewportDimension / 2).clamp(0.0, p.maxScrollExtent));
  }

  @override
  Widget build(BuildContext context) {
    final marks = spineOf(widget.document, fresh: widget.fresh);
    // Counted in paragraphs with words in them: the blank lines between them are not the chapter's length.
    if (marks.where((m) => m.length > 0).length < ChapterSpine.fewest) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return ExcludeSemantics(
      child: ListenableBuilder(
        listenable: scroll,
        builder: (context, _) {
          if (!scroll.hasClients || !scroll.position.hasContentDimensions) {
            _later();
            return const SizedBox.shrink();
          }
          final p = scroll.position;
          // A chapter of under two screens needs no map of itself.
          if (p.maxScrollExtent < p.viewportDimension) return const SizedBox.shrink();
          final total = p.maxScrollExtent + p.viewportDimension;
          return LayoutBuilder(
            builder: (context, box) => GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (d) => _go(d.localPosition.dy / box.maxHeight),
              onVerticalDragUpdate: (d) => _go(d.localPosition.dy / box.maxHeight),
              child: CustomPaint(
                size: Size(box.maxWidth, box.maxHeight),
                painter: _SpinePainter(
                  marks: marks,
                  top: p.pixels / total,
                  shown: p.viewportDimension / total,
                  ink: scheme.onSurfaceVariant.withValues(alpha: 0.45),
                  accent: scheme.primary,
                  window: scheme.primary.withValues(alpha: 0.14),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SpinePainter extends CustomPainter {
  _SpinePainter({
    required this.marks,
    required this.top,
    required this.shown,
    required this.ink,
    required this.accent,
    required this.window,
  });

  final List<SpineMark> marks;
  final double top;
  final double shown;
  final Color ink;
  final Color accent;
  final Color window;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 6.0;
    final h = size.height - pad * 2;
    // The lit window over what is on screen, with an accent edge on its side.
    final win = Rect.fromLTWH(2, pad + top * h, size.width - 4, (shown * h).clamp(10.0, h));
    canvas.drawRRect(RRect.fromRectAndRadius(win, const Radius.circular(3)), Paint()..color = window);
    canvas.drawRect(Rect.fromLTWH(size.width - 3, win.top, 2, win.height), Paint()..color = accent);

    // The paragraphs, each its share of the height (an empty line keeps a sliver), as marks across the strip.
    final weights = [for (final m in marks) m.heading ? 60.0 : (m.length + 20).toDouble()];
    final sum = weights.fold(0.0, (a, b) => a + b);
    var y = pad;
    final maxLength = marks.fold(1, (a, m) => m.length > a ? m.length : a);
    for (final (i, m) in marks.indexed) {
      final share = weights[i] / sum * h;
      final width = m.heading
          ? size.width - 8
          : (4 + (size.width - 12) * (m.length / maxLength).clamp(0.15, 1.0)).toDouble();
      final paint = Paint()
        ..color = m.heading || m.fresh ? accent : ink
        ..strokeWidth = m.heading || m.fresh ? 2 : 1.2
        ..strokeCap = StrokeCap.round;
      final at = y + share / 2;
      canvas.drawLine(Offset(4, at), Offset(4 + width, at), paint);
      y += share;
    }
  }

  @override
  bool shouldRepaint(_SpinePainter old) =>
      old.top != top ||
      old.shown != shown ||
      old.marks.length != marks.length ||
      old.marks.where((m) => m.fresh).length != marks.where((m) => m.fresh).length ||
      old.ink != ink ||
      old.accent != accent;
}
