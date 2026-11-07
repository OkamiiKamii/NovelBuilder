import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/layout/breakpoints.dart';
import '../../../shared/domain/graph/knowledge.dart';
import '../../../shared/domain/integrity/rules.dart' show ConnectionStatus, statusOf;
import '../../../shared/domain/relationships/network.dart' show layoutGraph, radiusOf;
import '../../visualize/widgets/canon_badge.dart';

Color hexColor(String hex) {
  final h = hex.startsWith('#') ? hex.substring(1) : hex;
  return Color(int.tryParse(h.length == 6 ? 'ff$h' : h, radix: 16) ?? 0xff8a8276);
}

/// Each group of connections has a colour and a line of its own, so colour is never the only difference.
Color edgeColor(EdgeGroup g) => switch (g) {
  EdgeGroup.typed => const Color(0xff3f6fb5),
  EdgeGroup.relationship => const Color(0xffb4532a),
  EdgeGroup.field => const Color(0xff6b7a2b),
  EdgeGroup.timeline => const Color(0xffc08a1e),
  EdgeGroup.plot => const Color(0xff7a4fa3),
  EdgeGroup.manuscript => const Color(0xff64748b),
  EdgeGroup.system => const Color(0xff2b7a8c),
};

/// Dash and gap lengths for a group's line; empty for a solid line.
List<double> edgeDash(EdgeGroup g) => switch (g) {
  EdgeGroup.typed || EdgeGroup.relationship || EdgeGroup.system => const [],
  EdgeGroup.field => const [12, 5],
  EdgeGroup.timeline => const [6, 4],
  EdgeGroup.plot => const [9, 3, 2, 3],
  EdgeGroup.manuscript => const [2, 3],
};

double edgeWidth(EdgeGroup g) => g == EdgeGroup.system ? 1 : (g == EdgeGroup.relationship ? 3.5 : 1.8);

void dashedLine(Canvas canvas, Offset a, Offset b, List<double> dash, Paint paint) {
  final far = (b - a).distance;
  // A line too long to be real is drawn whole: dashing it would take no end of strokes.
  if (dash.isEmpty || !far.isFinite || far > 100000) {
    if (far.isFinite) canvas.drawLine(a, b, paint);
    return;
  }
  final length = (b - a).distance;
  if (length < 0.5) return;
  final dir = (b - a) / length;
  var at = 0.0;
  var i = 0;
  while (at < length) {
    final run = dash[i % dash.length];
    if (i.isEven) canvas.drawLine(a + dir * at, a + dir * math.min(at + run, length), paint);
    at += run;
    i++;
  }
}

/// A record's shape: circle, diamond (events), square (chapters, scenes, parts), triangle (threads, abilities).
Path shapePath(NodeShape shape, Offset c, double r) {
  final (x, y) = (c.dx, c.dy);
  return switch (shape) {
    NodeShape.diamond =>
      Path()
        ..moveTo(x, y - r - 2)
        ..lineTo(x + r + 2, y)
        ..lineTo(x, y + r + 2)
        ..lineTo(x - r - 2, y)
        ..close(),
    NodeShape.square =>
      Path()..addRRect(RRect.fromRectAndRadius(Rect.fromCircle(center: c, radius: r), const Radius.circular(4))),
    NodeShape.triangle =>
      Path()
        ..moveTo(x, y - r - 3)
        ..lineTo(x + r + 2, y + r)
        ..lineTo(x - r - 2, y + r)
        ..close(),
    NodeShape.circle => Path()..addOval(Rect.fromCircle(center: c, radius: r)),
  };
}

/// How many lines the graph labels at once; beyond it, only lit lines (or a closer zoom) show their words.
const _labelLimit = 80;

/// How far Shift and an arrow move a record.
const _nudge = 20.0;

String _clip(String s, int n) => s.length > n ? '${s.substring(0, n - 1)}…' : s;

/// The knowledge graph drawn: each record a shape (by its kind) in its type's colour, each pair of connected records
/// one line (styled by the strongest kind of connection between them, an arrow when it reads one way). Pinch or
/// scroll to zoom, drag to pan; tap a record to select it and light up its connections, tap a line to see what it
/// stands for; long-press a record to show the path to it, or long-press and drag to move it. One stop in the tab
/// order: the arrow keys move between records, Enter selects, F focuses on one, P shows the path to it, Shift and an
/// arrow move it.
class GraphCanvas extends StatefulWidget {
  const GraphCanvas({
    super.key,
    required this.nodes,
    required this.pairs,
    required this.selectedKey,
    required this.pairKey,
    required this.path,
    required this.onSelect,
    required this.onPair,
    required this.onFocus,
    required this.onPath,
    required this.pairWords,
    required this.typeName,
    required this.typeCode,
    this.badges,
  });

  final List<GraphNode> nodes;
  final List<Pair> pairs;
  final String? selectedKey;
  final String? pairKey;

  /// Canon and continuity badges, by record key; null while the marks are off.
  final Map<String, CanonBadge>? badges;

  /// Edges on a path being shown: lit, and everything else dimmed.
  final Set<String>? path;
  final ValueChanged<GraphNode> onSelect;
  final ValueChanged<Pair> onPair;
  final ValueChanged<GraphNode> onFocus;
  final ValueChanged<GraphNode> onPath;
  final String Function(Pair pair) pairWords;
  final String Function(String type) typeName;
  final String? Function(String type) typeCode;

  @override
  State<GraphCanvas> createState() => _GraphCanvasState();
}

class _GraphCanvasState extends State<GraphCanvas> {
  final _controller = TransformationController();
  final _focus = FocusNode(debugLabel: 'Knowledge graph');
  String? _layoutKey;
  Map<String, Offset> _layout = const {};
  final _moved = <String, Offset>{};
  String? _fittedFor;
  int _current = 0;
  bool _focused = false;
  ({String key, Offset start, Offset at, double moved})? _drag;

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// Laid out again only when the records or lines drawn change; the same graph is always drawn the same way.
  void _relayout() {
    final key = '${widget.nodes.map((n) => n.key).join(',')}|${widget.pairs.map((p) => p.key).join(',')}';
    if (key == _layoutKey) return;
    _layoutKey = key;
    _moved.clear();
    _fittedFor = null;
    final placed = layoutGraph(
      [for (final n in widget.nodes) (id: n.key, degree: n.degree)],
      [for (final p in widget.pairs) (from: p.a, to: p.b)],
    );
    _layout = {for (final e in placed.entries) e.key: Offset(e.value.x, e.value.y)};
    _current = _current.clamp(0, math.max(0, widget.nodes.length - 1));
  }

  Offset _raw(String key) => _moved[key] ?? _layout[key] ?? Offset.zero;

  ({Offset origin, Size size}) _bounds() {
    final points = [for (final n in widget.nodes) _raw(n.key)];
    if (points.isEmpty) return (origin: Offset.zero, size: const Size(300, 300));
    final minX = points.map((p) => p.dx).reduce(math.min) - 70;
    final minY = points.map((p) => p.dy).reduce(math.min) - 60;
    final maxX = points.map((p) => p.dx).reduce(math.max) + 70;
    final maxY = points.map((p) => p.dy).reduce(math.max) + 70;
    return (origin: Offset(minX, minY), size: Size(math.max(maxX - minX, 300), math.max(maxY - minY, 300)));
  }

  Map<String, int> _shownDegree() {
    final d = <String, int>{};
    for (final p in widget.pairs) {
      for (final k in [p.a, p.b]) {
        d[k] = (d[k] ?? 0) + 1;
      }
    }
    return d;
  }

  /// Scales the drawing down (never up) so all of it shows, centred in the box.
  void _fit(Size box, Size drawing) {
    final scale = math.min(1.0, math.min(box.width / drawing.width, box.height / drawing.height)).clamp(0.1, 1.0);
    _controller.value = Matrix4.diagonal3Values(scale, scale, 1)
      ..setTranslationRaw((box.width - drawing.width * scale) / 2, (box.height - drawing.height * scale) / 2, 0);
  }

  void _moveTo(int index) {
    if (widget.nodes.isEmpty) return;
    setState(() => _current = (index + widget.nodes.length) % widget.nodes.length);
  }

  KeyEventResult _key(KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
    if (widget.nodes.isEmpty) return KeyEventResult.ignored;
    final node = widget.nodes[_current.clamp(0, widget.nodes.length - 1)];
    final key = event.logicalKey;
    final shift = HardwareKeyboard.instance.isShiftPressed;
    final nudge = switch (key) {
      LogicalKeyboardKey.arrowLeft => const Offset(-_nudge, 0),
      LogicalKeyboardKey.arrowRight => const Offset(_nudge, 0),
      LogicalKeyboardKey.arrowUp => const Offset(0, -_nudge),
      LogicalKeyboardKey.arrowDown => const Offset(0, _nudge),
      _ => null,
    };
    // Shift and an arrow move the record, as dragging does.
    if (shift && nudge != null) {
      setState(() => _moved[node.key] = _raw(node.key) + nudge);
      return KeyEventResult.handled;
    }
    switch (key) {
      case LogicalKeyboardKey.arrowRight || LogicalKeyboardKey.arrowDown:
        _moveTo(_current + 1);
      case LogicalKeyboardKey.arrowLeft || LogicalKeyboardKey.arrowUp:
        _moveTo(_current - 1);
      case LogicalKeyboardKey.home:
        _moveTo(0);
      case LogicalKeyboardKey.end:
        _moveTo(widget.nodes.length - 1);
      case LogicalKeyboardKey.enter || LogicalKeyboardKey.space:
        widget.onSelect(node);
      case LogicalKeyboardKey.keyF:
        widget.onFocus(node);
      case LogicalKeyboardKey.keyP when !node.isGroup:
        widget.onPath(node);
      default:
        return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  String _nodeWords(GraphNode node, Map<String, int> shown) {
    final n = shown[node.key] ?? 0;
    final c = '$n ${n == 1 ? 'connection' : 'connections'} shown';
    return node.isGroup
        ? '${node.label}, folded together, $c. Enter opens the group.'
        : '${node.label}, $c (${widget.typeName(node.type)})';
  }

  GraphNode? _nodeAt(Offset p, Offset origin, Map<String, int> shown) {
    for (final n in widget.nodes.reversed) {
      final r = radiusOf(shown[n.key] ?? 0) - 2;
      if ((_raw(n.key) - origin - p).distance <= r + 6) return n;
    }
    return null;
  }

  Pair? _pairAt(Offset p, Offset origin) {
    for (final pair in widget.pairs) {
      if (_distanceToSegment(p, _raw(pair.a) - origin, _raw(pair.b) - origin) <= 7) return pair;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    _relayout();
    final theme = Theme.of(context);
    final shown = _shownDegree();
    final (:origin, :size) = _bounds();
    final current = widget.nodes.isEmpty ? null : widget.nodes[_current.clamp(0, widget.nodes.length - 1)];
    final edges = widget.pairs.fold(0, (n, p) => n + p.edges.length);
    final compact = WindowSize.of(context) == WindowSize.compact;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_moved.isNotEmpty)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: () => setState(_moved.clear),
              child: const Text('Put everything back where the layout placed it'),
            ),
          ),
        SizedBox(
          height: compact ? 460 : 620,
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(12),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final box = constraints.biggest;
                  final fitKey = '$_layoutKey|${box.width.round()}x${box.height.round()}';
                  if (_fittedFor != fitKey) {
                    _fittedFor = fitKey;
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) _fit(box, size);
                    });
                  }
                  return Stack(
                    children: [
                      Positioned.fill(
                        child: Focus(
                          focusNode: _focus,
                          onFocusChange: (f) => setState(() => _focused = f),
                          onKeyEvent: (_, e) => _key(e),
                          child: Semantics(
                            label:
                                'Knowledge graph of ${widget.nodes.length} ${widget.nodes.length == 1 ? 'record' : 'records'} '
                                'and $edges ${edges == 1 ? 'connection' : 'connections'}. Arrow keys move between '
                                'records, Enter selects, F focuses on one, P shows the path to it from the selected '
                                'record, Shift and an arrow move it. The List view shows every connection in words.',
                            value: current == null ? null : _nodeWords(current, shown),
                            child: InteractiveViewer(
                              transformationController: _controller,
                              constrained: false,
                              boundaryMargin: const EdgeInsets.all(600),
                              minScale: 0.1,
                              maxScale: 4,
                              child: GestureDetector(
                                onTapUp: (d) {
                                  _focus.requestFocus();
                                  final node = _nodeAt(d.localPosition, origin, shown);
                                  if (node != null) {
                                    setState(() => _current = widget.nodes.indexOf(node));
                                    return widget.onSelect(node);
                                  }
                                  final pair = _pairAt(d.localPosition, origin);
                                  if (pair != null) widget.onPair(pair);
                                },
                                onLongPressStart: (d) {
                                  final node = _nodeAt(d.localPosition, origin, shown);
                                  if (node != null) {
                                    _drag = (key: node.key, start: _raw(node.key), at: d.localPosition, moved: 0);
                                  }
                                },
                                onLongPressMoveUpdate: (d) {
                                  final drag = _drag;
                                  if (drag == null) return;
                                  final delta = d.localPosition - drag.at;
                                  _drag = (
                                    key: drag.key,
                                    start: drag.start,
                                    at: drag.at,
                                    moved: math.max(drag.moved, delta.distance),
                                  );
                                  if (_drag!.moved >= 4) setState(() => _moved[drag.key] = drag.start + delta);
                                },
                                onLongPressEnd: (_) {
                                  final drag = _drag;
                                  _drag = null;
                                  if (drag == null || drag.moved >= 4) return;
                                  final node = widget.nodes.where((n) => n.key == drag.key).firstOrNull;
                                  if (node != null && !node.isGroup) widget.onPath(node);
                                },
                                child: AnimatedBuilder(
                                  animation: _controller,
                                  builder: (context, _) => CustomPaint(
                                    size: size,
                                    painter: _GraphPainter(
                                      nodes: widget.nodes,
                                      pairs: widget.pairs,
                                      at: (k) => _raw(k) - origin,
                                      shown: shown,
                                      selectedKey: widget.selectedKey,
                                      pairKey: widget.pairKey,
                                      path: widget.path,
                                      focusKey: _focused ? current?.key : null,
                                      scale: _controller.value.getMaxScaleOnAxis(),
                                      scheme: theme.colorScheme,
                                      text: theme.textTheme,
                                      typeCode: widget.typeCode,
                                      badges: widget.badges,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      PositionedDirectional(
                        top: 4,
                        end: 4,
                        child: IconButton.filledTonal(
                          tooltip: 'Fit to view',
                          onPressed: () => _fit(box, size),
                          icon: const Icon(Icons.fit_screen_outlined),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ],
    );
  }
}

double _distanceToSegment(Offset p, Offset a, Offset b) {
  final ab = b - a;
  final len2 = ab.dx * ab.dx + ab.dy * ab.dy;
  if (len2 == 0) return (p - a).distance;
  final t = (((p - a).dx * ab.dx + (p - a).dy * ab.dy) / len2).clamp(0.0, 1.0);
  return (p - (a + ab * t)).distance;
}

class _GraphPainter extends CustomPainter {
  _GraphPainter({
    required this.nodes,
    required this.pairs,
    required this.at,
    required this.shown,
    required this.selectedKey,
    required this.pairKey,
    required this.path,
    required this.focusKey,
    required this.scale,
    required this.scheme,
    required this.text,
    required this.typeCode,
    this.badges,
  });

  final Map<String, CanonBadge>? badges;
  final List<GraphNode> nodes;
  final List<Pair> pairs;
  final Offset Function(String key) at;
  final Map<String, int> shown;
  final String? selectedKey;
  final String? pairKey;
  final Set<String>? path;
  final String? focusKey;
  final double scale;
  final ColorScheme scheme;
  final TextTheme text;
  final String? Function(String type) typeCode;

  double _radius(String key) => radiusOf(shown[key] ?? 0) - 2;

  /// What is lit: a path's records and lines, or the selection (a record or a line) and what it touches.
  ({Set<String> nodes, Set<String> pairs})? _lit() {
    final p = path;
    if (p != null) {
      final keys = <String>{};
      final lines = <String>{};
      for (final pair in pairs) {
        if (pair.edges.any((e) => p.contains(e.id))) {
          lines.add(pair.key);
          keys
            ..add(pair.a)
            ..add(pair.b);
        }
      }
      return (nodes: keys, pairs: lines);
    }
    if (selectedKey == null && pairKey == null) return null;
    final keys = <String>{?selectedKey};
    final lines = <String>{};
    for (final pair in pairs) {
      if (pair.key == pairKey || pair.a == selectedKey || pair.b == selectedKey) {
        lines.add(pair.key);
        keys
          ..add(pair.a)
          ..add(pair.b);
      }
    }
    return (nodes: keys, pairs: lines);
  }

  void _label(Canvas canvas, String s, Offset centre, double size, Color colour, {Color? background}) {
    final p = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(
          fontSize: size,
          color: colour,
          background: background == null ? null : (Paint()..color = background),
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();
    p.paint(canvas, centre - Offset(p.width / 2, p.height / 2));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final lit = _lit();
    final crowded = pairs.length > _labelLimit;
    final textSize = 1 / math.max(scale, 0.6);
    for (final pair in pairs) {
      final a = at(pair.a), b = at(pair.b);
      final length = math.max((b - a).distance, 1.0);
      final dir = (b - a) / length;
      final x1 = a + dir * (_radius(pair.a) + 4), x2 = b - dir * (_radius(pair.b) + 6);
      final group = pair.group;
      // One way when every connection here reads one way, the same way.
      final forward = pair.edges.every((e) => e.directed && e.from == pair.a);
      final backward = pair.edges.every((e) => e.directed && e.from == pair.b);
      final isLit = lit?.pairs.contains(pair.key) ?? false;
      final dim = lit != null && !isLit;
      // A stored connection's status shows on its line: dashed while provisional, red when disputed, faded when invalid.
      final status = group == EdgeGroup.typed
          ? statusOf(pair.edges.firstWhere((e) => e.kind.key == 'link').connection)
          : null;
      var colour = edgeColor(group);
      if (status == ConnectionStatus.disputed) colour = scheme.error;
      final alpha = dim ? 0.15 : (status == ConnectionStatus.invalid ? 0.35 : 1.0);
      final paint = Paint()
        ..color = colour.withValues(alpha: alpha)
        ..strokeWidth = edgeWidth(group) + (pair.key == pairKey || (path != null && isLit) ? 2 : 0)
        ..style = PaintingStyle.stroke;
      dashedLine(canvas, x1, x2, status == ConnectionStatus.provisional ? const [5, 4] : edgeDash(group), paint);
      if (group == EdgeGroup.relationship) {
        canvas.drawLine(
          x1,
          x2,
          Paint()
            ..color = scheme.surface.withValues(alpha: alpha)
            ..strokeWidth = 1.2,
        );
      }
      if (forward || backward) {
        final tip = forward ? x2 : x1;
        final d = forward ? dir : -dir;
        final side = Offset(-d.dy, d.dx);
        canvas.drawPath(
          Path()
            ..moveTo(tip.dx, tip.dy)
            ..lineTo((tip - d * 9 + side * 4.5).dx, (tip - d * 9 + side * 4.5).dy)
            ..lineTo((tip - d * 9 - side * 4.5).dx, (tip - d * 9 - side * 4.5).dy)
            ..close(),
          Paint()..color = paint.color,
        );
      }
      if (!crowded || scale >= 1.4 || isLit) {
        final words = pair.edges.length > 1
            ? '${pair.edges.first.label} +${pair.edges.length - 1}'
            : pair.edges.first.label;
        _label(
          canvas,
          _clip(words, 24),
          (x1 + x2) / 2 - const Offset(0, 6),
          10.5 * textSize,
          scheme.onSurfaceVariant.withValues(alpha: dim ? 0.3 : 1),
          background: scheme.surface.withValues(alpha: 0.75),
        );
      }
    }
    for (final node in nodes) {
      final c = at(node.key);
      final r = _radius(node.key);
      final dim = lit != null && !lit.nodes.contains(node.key);
      final colour = hexColor(node.color).withValues(alpha: dim ? 0.25 : 1);
      if (node.isGroup) {
        canvas.drawCircle(
          c,
          r + 6,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = colour,
        );
      }
      final body = shapePath(shapeOf(node.type), c, r);
      canvas.drawPath(body, Paint()..color = colour);
      canvas.drawPath(
        body,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..color = scheme.surface.withValues(alpha: dim ? 0.3 : 1),
      );
      if (node.key == selectedKey) {
        canvas.drawPath(
          shapePath(shapeOf(node.type), c, r + 5),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3
            ..color = scheme.primary,
        );
      }
      if (node.key == focusKey) {
        canvas.drawCircle(
          c,
          r + 10,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = scheme.tertiary,
        );
      }
      final code = typeCode(node.type);
      if (code != null) {
        _label(canvas, code, c, math.max(7, math.min(11, r)), Colors.white.withValues(alpha: dim ? 0.4 : 1));
      }
      if (badges?[node.key] case final badge?) paintCanonBadge(canvas, c + Offset(r * 0.7, -r - 8), badge, scheme);
      _label(
        canvas,
        _clip(node.label, 22),
        c + Offset(0, r + 10),
        11.5 * textSize,
        scheme.onSurface.withValues(alpha: dim ? 0.3 : 1),
        background: scheme.surface.withValues(alpha: 0.6),
      );
    }
  }

  @override
  bool shouldRepaint(_GraphPainter old) => true;
}

/// What the shapes, colours and lines mean: the kinds of record and connection drawn now.
class GraphLegend extends StatelessWidget {
  const GraphLegend({super.key, required this.nodes, required this.pairs, required this.typeName, required this.codes});

  final List<GraphNode> nodes;
  final List<Pair> pairs;
  final String Function(String type) typeName;
  final Map<String, String> codes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final types = <String, GraphNode>{};
    for (final n in nodes) {
      types.putIfAbsent(n.type, () => n);
    }
    final groups = [
      for (final g in EdgeGroup.values)
        if (pairs.any((p) => p.edges.any((e) => groupOf(e.kind) == g))) g,
    ];
    final statuses = {
      for (final p in pairs)
        for (final e in p.edges) ?statusOf(e.connection),
    }..remove(ConnectionStatus.confirmed);
    Widget item(CustomPainter painter, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(width: 30, height: 20, child: CustomPaint(painter: painter)),
        const SizedBox(width: 6),
        Flexible(child: Text(label, style: theme.textTheme.bodySmall)),
      ],
    );
    Widget block(String title, List<Widget> items) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Wrap(
        spacing: 16,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(title, style: theme.textTheme.labelLarge),
          ...items,
        ],
      ),
    );
    return ExcludeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          block('Records', [
            for (final MapEntry(key: t, value: n) in types.entries)
              item(_ShapeSwatch(shapeOf(t), hexColor(n.color), codes[t]), typeName(t)),
          ]),
          if (groups.isNotEmpty)
            block('Connections', [
              for (final g in groups) item(_LineSwatch(edgeColor(g), edgeDash(g), edgeWidth(g)), g.label),
            ]),
          if (statuses.isNotEmpty)
            block('Status of a connection you recorded', [
              for (final s in statuses)
                item(
                  _LineSwatch(
                    s == ConnectionStatus.disputed
                        ? theme.colorScheme.error
                        : edgeColor(EdgeGroup.typed).withValues(alpha: s == ConnectionStatus.invalid ? 0.35 : 1),
                    s == ConnectionStatus.provisional ? const [5, 4] : const [],
                    1.8,
                  ),
                  s.label,
                ),
            ]),
        ],
      ),
    );
  }
}

class _ShapeSwatch extends CustomPainter {
  _ShapeSwatch(this.shape, this.colour, this.code);
  final NodeShape shape;
  final Color colour;
  final String? code;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    canvas.drawPath(shapePath(shape, c, 7), Paint()..color = colour);
    if (code != null) {
      final p = TextPainter(
        text: TextSpan(
          text: code,
          style: const TextStyle(fontSize: 7, color: Colors.white),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      p.paint(canvas, c - Offset(p.width / 2, p.height / 2));
    }
  }

  @override
  bool shouldRepaint(_ShapeSwatch old) => false;
}

class _LineSwatch extends CustomPainter {
  _LineSwatch(this.colour, this.dash, this.width);
  final Color colour;
  final List<double> dash;
  final double width;

  @override
  void paint(Canvas canvas, Size size) => dashedLine(
    canvas,
    Offset(0, size.height / 2),
    Offset(size.width, size.height / 2),
    dash,
    Paint()
      ..color = colour
      ..strokeWidth = width,
  );

  @override
  bool shouldRepaint(_LineSwatch old) => false;
}
