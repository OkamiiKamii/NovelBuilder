import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:super_editor/super_editor.dart';

import '../../shared/data/providers.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/prose.dart';
import 'data/manuscript_service.dart' show mainDraft;

/// Whether today's ink is shown, kept on this device (on unless turned off).
const freshInkKey = 'write.freshInk';

class FreshInkOn extends Notifier<bool> {
  @override
  bool build() => ref.watch(settingsStoreProvider).read(freshInkKey) != false;

  void set(bool on) {
    state = on;
    ref.read(settingsStoreProvider).write(freshInkKey, on);
  }
}

final freshInkProvider = NotifierProvider<FreshInkOn, bool>(FreshInkOn.new);

/// The chapter's paragraphs as they stood when today began, from what is stored: nothing, for a page made today; the
/// saved text, when it was last saved before today; else the newest copy in its history saved before today, of the
/// same draft. Null when that cannot be known (no copy from before today): then nothing is marked, rather than guessed.
List<String>? textAtDayStart({
  required JsonMap? node,
  required JsonMap? saved,
  required List<JsonMap> revisions,
  required DateTime dayStart,
}) {
  final start = dayStart.millisecondsSinceEpoch;
  final created = numOrNull(node?['createdAt']);
  if (created != null && created >= start) return const [];
  final savedAt = numOrNull(saved?['savedAt']) ?? numOrNull(node?['updatedAt']);
  if (saved != null && savedAt != null && savedAt < start) return blockTexts(saved['doc']);
  final draft = str(node?['branchName'], mainDraft);
  JsonMap? best;
  for (final r in revisions) {
    final at = numOrNull(r['savedAt']);
    if (at == null || at >= start || str(r['branchName'], mainDraft) != draft) continue;
    if (best == null || at > (numOrNull(best['savedAt']) ?? 0)) best = r;
  }
  return best == null ? null : blockTexts(best['doc']);
}

/// Which of [now]'s paragraphs (by index) were written or changed since [before]: those with words whose text is not
/// among [before]'s (each earlier paragraph matched once). With [before] unknown, none.
Set<int> freshParagraphs(List<String> now, List<String>? before) {
  if (before == null) return const {};
  final left = <String, int>{};
  for (final b in before) {
    final t = b.trim();
    if (t.isNotEmpty) left[t] = (left[t] ?? 0) + 1;
  }
  final out = <int>{};
  for (final (i, p) in now.indexed) {
    final t = p.trim();
    if (t.isEmpty) continue;
    final n = left[t] ?? 0;
    if (n > 0) {
      left[t] = n - 1;
    } else {
      out.add(i);
    }
  }
  return out;
}

/// TODAY'S INK: the paragraphs written or changed today, read against the chapter as it stood when the day began, and
/// again a moment after each pause in typing, so a new paragraph inks up as it is written. Read only; the marks are
/// drawn beside the text ([FreshInkMargin]) and on the chapter's spine, never in it.
class FreshInk extends ChangeNotifier {
  MutableDocument? _document;
  List<String>? _before;
  Timer? _again;
  Set<String> _fresh = const {};

  /// The paragraphs (by node id) in today's ink.
  Set<String> get fresh => _fresh;

  void attach(MutableDocument document, List<String>? before) {
    detach();
    _before = before;
    _document = document..addListener(_changed);
    _read();
  }

  void detach() {
    _again?.cancel();
    _document?.removeListener(_changed);
    _document = null;
    _fresh = const {};
  }

  void _changed(DocumentChangeLog _) {
    _again?.cancel();
    _again = Timer(const Duration(milliseconds: 350), _read);
  }

  void _read() {
    final document = _document;
    if (document == null) return;
    final ids = <String>[];
    final texts = <String>[];
    for (final node in document) {
      if (node is TextNode) {
        ids.add(node.id);
        texts.add(node.text.toPlainText());
      }
    }
    _fresh = {for (final i in freshParagraphs(texts, _before)) ids[i]};
    notifyListeners();
  }

  @override
  void dispose() {
    detach();
    super.dispose();
  }
}

/// The ink beside the text: a stroke down the page's left margin beside every paragraph in today's ink, measured from
/// the editor's own layout and kept in step as the page scrolls and the text moves. A picture only: it takes no
/// presses and says nothing to a screen reader.
class FreshInkMargin extends StatefulWidget {
  const FreshInkMargin({
    super.key,
    required this.ink,
    required this.document,
    required this.layout,
    required this.scroll,
  });

  final FreshInk ink;
  final Document document;
  final GlobalKey layout;
  final ScrollController scroll;

  @override
  State<FreshInkMargin> createState() => _FreshInkMarginState();
}

class _FreshInkMarginState extends State<FreshInkMargin> {
  List<(double, double)> _strokes = const [];
  bool _pending = false;

  @override
  void initState() {
    super.initState();
    widget.ink.addListener(_measureSoon);
    widget.scroll.addListener(_measureSoon);
    _measureSoon();
  }

  @override
  void didUpdateWidget(FreshInkMargin old) {
    super.didUpdateWidget(old);
    if (!identical(old.ink, widget.ink)) {
      old.ink.removeListener(_measureSoon);
      widget.ink.addListener(_measureSoon);
    }
    if (!identical(old.scroll, widget.scroll)) {
      old.scroll.removeListener(_measureSoon);
      widget.scroll.addListener(_measureSoon);
    }
    _measureSoon();
  }

  @override
  void dispose() {
    widget.ink.removeListener(_measureSoon);
    widget.scroll.removeListener(_measureSoon);
    super.dispose();
  }

  // Measured once the frame is laid out, never in the middle of it.
  void _measureSoon() {
    if (_pending) return;
    _pending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _pending = false;
      if (mounted) _measure();
    });
  }

  void _measure() {
    final Object? layout = widget.layout.currentState;
    final box = context.findRenderObject();
    final strokes = <(double, double)>[];
    if (layout is DocumentLayout && box is RenderBox && box.hasSize) {
      for (final id in widget.ink.fresh) {
        final node = widget.document.getNodeById(id);
        if (node is! TextNode) continue;
        final rect = layout.getRectForSelection(
          DocumentPosition(nodeId: id, nodePosition: const TextNodePosition(offset: 0)),
          DocumentPosition(
            nodeId: id,
            nodePosition: TextNodePosition(offset: node.text.length),
          ),
        );
        if (rect == null) continue;
        final top = box.globalToLocal(layout.getGlobalOffsetFromDocumentOffset(rect.topLeft)).dy;
        final bottom = box.globalToLocal(layout.getGlobalOffsetFromDocumentOffset(rect.bottomLeft)).dy;
        if (bottom < 0 || top > box.size.height) continue;
        // Only the part on the page: a paragraph running off its top or foot is drawn to the edge, never past it.
        strokes.add((top.clamp(0.0, box.size.height), bottom.clamp(0.0, box.size.height)));
      }
    }
    if (!_same(strokes, _strokes)) setState(() => _strokes = strokes);
  }

  static bool _same(List<(double, double)> a, List<(double, double)> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if ((a[i].$1 - b[i].$1).abs() > 0.5 || (a[i].$2 - b[i].$2).abs() > 0.5) return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: ExcludeSemantics(
      child: ClipRect(
        child: CustomPaint(
          painter: _InkPainter(_strokes, Theme.of(context).colorScheme.primary),
          child: const SizedBox.expand(),
        ),
      ),
    ),
  );
}

class _InkPainter extends CustomPainter {
  _InkPainter(this.strokes, this.ink);
  final List<(double, double)> strokes;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    final x = size.width / 2;
    final glow = Paint()
      ..color = ink.withValues(alpha: 0.16)
      ..strokeWidth = 7
      ..strokeCap = StrokeCap.round;
    final line = Paint()
      ..color = ink.withValues(alpha: 0.85)
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    for (final (top, bottom) in strokes) {
      final a = Offset(x, top + 3);
      final b = Offset(x, bottom - 3);
      canvas.drawLine(a, b, glow);
      canvas.drawLine(a, b, line);
      // A drop at the head of the stroke, as a nib leaves (not where the paragraph runs on above the page).
      if (top > 0.5) canvas.drawCircle(a, 2.6, Paint()..color = ink);
    }
  }

  @override
  bool shouldRepaint(_InkPainter old) => old.ink != ink || !_FreshInkMarginState._same(old.strokes, strokes);
}
