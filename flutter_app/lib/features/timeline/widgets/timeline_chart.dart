import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import '../../../shared/domain/records/calendar.dart';
import '../../../shared/domain/timeline/axis.dart';
import '../../../shared/domain/timeline/scale.dart';
import '../../../shared/domain/timeline/tracks.dart';
import '../../visualize/widgets/canon_badge.dart';

/// One band of the drawing: a track and its marks, laid out once for the whole story so a mark never changes row
/// while zooming.
class ChartTrack {
  const ChartTrack(this.track, this.axis);
  final Track track;
  final TimeAxis axis;
}

/// What a mark is, said aloud.
String markWords(AxisMark m) {
  final rough = m.startFuzz != null || m.endFuzz != null;
  return switch (m.kind) {
    MarkKind.moment => '${m.title}, ${m.when}, an exact moment',
    MarkKind.uncertain => '${m.title}, ${m.when}, somewhere in that stretch of time',
    MarkKind.lasting =>
      '${m.title}, ${m.when}, lasting a while${rough ? '; its start and end are known only roughly' : ''}',
    MarkKind.ongoing => '${m.title}, ${m.when}',
    MarkKind.unended => '${m.title}, ${m.when}, lasting a while',
  };
}

const _laneHeight = 36.0;
const _header = 28.0;
const _folded = 30.0;
const _ticks = 28.0;
const _labelWidth = 150.0;

double chartHeight(List<ChartTrack> tracks) =>
    _ticks +
    tracks.fold(
      0.0,
      (sum, t) => sum + (t.track.folded ? _folded : _header + math.max(1, t.axis.lanes) * _laneHeight + 8),
    );

/// The drawn timeline: one band per track, the same stretch of story time across all of them. Drag to move along it,
/// pinch or scroll the wheel to zoom about a point; the keys do the same when it has focus.
class TimelineChart extends StatefulWidget {
  const TimelineChart({
    super.key,
    required this.tracks,
    required this.window,
    required this.all,
    required this.calendar,
    required this.selected,
    required this.onSelect,
    required this.onWindow,
    this.badges,
  });

  /// Canon and continuity badges, by record key (`event:<id>`); null while the marks are off.
  final Map<String, CanonBadge>? badges;
  final List<ChartTrack> tracks;

  /// The stretch of story time on screen.
  final TimeWindow window;

  /// Every dated event's stretch, for the zoom limits.
  final TimeWindow all;
  final Calendar calendar;
  final String? selected;
  final ValueChanged<String?> onSelect;
  final ValueChanged<TimeWindow> onWindow;

  @override
  State<TimelineChart> createState() => _TimelineChartState();
}

class _TimelineChartState extends State<TimelineChart> {
  TimeWindow? _startWindow;
  double _startFocal = 0;
  final _focus = FocusNode(debugLabel: 'timeline drawing');

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  double _timeAt(double x, double width) => widget.window.from + x / width * (widget.window.to - widget.window.from);

  KeyEventResult _key(FocusNode node, KeyEvent event, double width) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
    final w = widget.window;
    final middle = (w.from + w.to) / 2;
    final key = event.logicalKey;
    // With an event selected, the arrows move along the line from one event to the next, in story order, bringing it
    // into view; Escape lets go of it.
    final marks = <String, AxisMark>{};
    for (final t in widget.tracks) {
      if (t.track.folded) continue;
      for (final m in t.axis.marks) {
        marks.putIfAbsent(m.id, () => m);
      }
    }
    final ordered = marks.values.toList()
      ..sort((a, b) {
        final byStart = a.start.compareTo(b.start);
        return byStart != 0 ? byStart : a.title.compareTo(b.title);
      });
    final at = ordered.indexWhere((m) => m.id == widget.selected);
    if (at >= 0) {
      if (key == LogicalKeyboardKey.escape) {
        widget.onSelect(null);
        return KeyEventResult.handled;
      }
      final to = switch (key) {
        LogicalKeyboardKey.arrowLeft => at - 1,
        LogicalKeyboardKey.arrowRight => at + 1,
        LogicalKeyboardKey.home => 0,
        LogicalKeyboardKey.end => ordered.length - 1,
        _ => null,
      };
      if (to != null) {
        if (to >= 0 && to < ordered.length) {
          final mark = ordered[to];
          widget.onSelect(mark.id);
          if (mark.start < w.from || mark.start > w.to) widget.onWindow(centreOn(w, mark.start));
        }
        return KeyEventResult.handled;
      }
    }
    TimeWindow? next;
    if (key == LogicalKeyboardKey.arrowLeft) next = panWindow(w, -0.25);
    if (key == LogicalKeyboardKey.arrowRight) next = panWindow(w, 0.25);
    if (key == LogicalKeyboardKey.equal || key == LogicalKeyboardKey.add || key == LogicalKeyboardKey.numpadAdd) {
      next = zoomWindow(w, 1.5, middle, widget.all);
    }
    if (key == LogicalKeyboardKey.minus || key == LogicalKeyboardKey.numpadSubtract) {
      next = zoomWindow(w, 1 / 1.5, middle, widget.all);
    }
    if (key == LogicalKeyboardKey.digit0 || key == LogicalKeyboardKey.numpad0) next = widget.all;
    if (next == null) return KeyEventResult.ignored;
    widget.onWindow(next);
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final painter = _ChartPainter(
          tracks: widget.tracks,
          window: widget.window,
          calendar: widget.calendar,
          selected: widget.selected,
          scheme: theme.colorScheme,
          text: theme.textTheme,
          direction: Directionality.of(context),
          onSelect: widget.onSelect,
          badges: widget.badges,
        );
        final height = chartHeight(widget.tracks);
        return Semantics(
          container: true,
          label:
              'Timeline drawing. Tap an event to choose it; with one chosen, the arrow keys move between events. '
              'Otherwise the arrow keys move along time, plus and minus zoom, and 0 shows all of it.',
          child: Focus(
            focusNode: _focus,
            onKeyEvent: (node, event) => _key(node, event, width),
            child: Listener(
              onPointerSignal: (signal) {
                if (signal is PointerScrollEvent) {
                  final at = _timeAt(signal.localPosition.dx, width);
                  final factor = signal.scrollDelta.dy < 0 ? 1.2 : 1 / 1.2;
                  widget.onWindow(zoomWindow(widget.window, factor, at, widget.all));
                }
              },
              child: GestureDetector(
                onTapUp: (d) {
                  _focus.requestFocus();
                  widget.onSelect(painter.hit(d.localPosition, width));
                },
                onScaleStart: (d) {
                  _startWindow = widget.window;
                  _startFocal = d.localFocalPoint.dx;
                },
                onScaleUpdate: (d) {
                  final start = _startWindow;
                  if (start == null) return;
                  final span = start.to - start.from;
                  // The moment that was under the fingers stays under them: zoom about it, then follow the drag.
                  final anchor = start.from + _startFocal / width * span;
                  final zoomed = zoomWindow(start, d.scale, anchor, widget.all);
                  final shift = (d.localFocalPoint.dx - _startFocal) / width * (zoomed.to - zoomed.from);
                  widget.onWindow((from: zoomed.from - shift, to: zoomed.to - shift));
                },
                onScaleEnd: (_) => _startWindow = null,
                child: ClipRect(
                  child: CustomPaint(size: Size(width, height), painter: painter),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ChartPainter extends CustomPainter {
  _ChartPainter({
    required this.tracks,
    required this.window,
    required this.calendar,
    required this.selected,
    required this.scheme,
    required this.text,
    required this.direction,
    required this.onSelect,
    this.badges,
  });

  final Map<String, CanonBadge>? badges;
  final List<ChartTrack> tracks;
  final TimeWindow window;
  final Calendar calendar;
  final String? selected;
  final ColorScheme scheme;
  final TextTheme text;
  final TextDirection direction;
  final ValueChanged<String?> onSelect;

  /// Where each mark was drawn, for taps and for screen readers.
  final _hits = <({Rect rect, AxisMark mark, String track})>[];

  double _x(double t, double width) => (t - window.from) / (window.to - window.from) * width;

  String? hit(Offset p, double width) {
    if (_hits.isEmpty) _layout(width);
    for (final h in _hits.reversed) {
      if (h.rect.inflate(4).contains(p)) return h.mark.id;
    }
    return null;
  }

  void _layout(double width) {
    _hits.clear();
    var top = _ticks;
    for (final t in tracks) {
      if (t.track.folded) {
        top += _folded;
        continue;
      }
      for (final m in t.axis.marks) {
        final left = _x(m.start, width);
        final right = m.kind == MarkKind.ongoing ? width : math.max(_x(m.end, width), left);
        final y = top + _header + m.lane * _laneHeight;
        _hits.add((
          rect: Rect.fromLTRB(left - 6, y + 2, math.max(right, left + _labelWidth), y + _laneHeight - 2),
          mark: m,
          track: t.track.label,
        ));
      }
      top += _header + math.max(1, t.axis.lanes) * _laneHeight + 8;
    }
  }

  TextPainter _label(String s, TextStyle? style, double max) => TextPainter(
    text: TextSpan(text: s, style: style),
    textDirection: direction,
    maxLines: 1,
    ellipsis: '…',
  )..layout(maxWidth: math.max(0, max));

  @override
  void paint(Canvas canvas, Size size) {
    final width = size.width;
    _layout(width);
    final grid = Paint()
      ..color = scheme.outlineVariant
      ..strokeWidth = 1;
    final small = text.labelSmall?.copyWith(color: scheme.onSurfaceVariant);
    for (final tick in ticksFor(window, width, calendar)) {
      final x = _x(tick.t, width);
      canvas.drawLine(Offset(x, _ticks - 6), Offset(x, size.height), grid);
      _label(tick.label, small, 120).paint(canvas, Offset(x + 3, 4));
    }
    var top = _ticks;
    final accent = scheme.primary;
    for (final t in tracks) {
      final band = t.track.folded ? _folded : _header + math.max(1, t.axis.lanes) * _laneHeight + 8;
      canvas.drawLine(Offset(0, top), Offset(width, top), grid..color = scheme.outline.withValues(alpha: 0.5));
      final heading = t.track.folded
          ? '${t.track.label} — folded, ${t.track.eventIds.length} ${t.track.eventIds.length == 1 ? 'event' : 'events'}'
          : t.track.label;
      _label(heading, text.labelLarge?.copyWith(color: scheme.onSurface), width - 8).paint(canvas, Offset(4, top + 5));
      if (!t.track.folded) {
        for (final m in t.axis.marks) {
          _mark(canvas, m, top + _header + m.lane * _laneHeight + _laneHeight / 2, width, accent);
        }
      }
      top += band;
    }
  }

  void _mark(Canvas canvas, AxisMark m, double centre, double width, Color color) {
    var y = centre;
    final left = _x(m.start, width);
    final right = m.kind == MarkKind.ongoing ? width : math.max(_x(m.end, width), left);
    final isSelected = m.id == selected;
    final fill = Paint()..color = color;
    final outline = Paint()
      ..color = scheme.onSurface
      ..style = PaintingStyle.stroke
      ..strokeWidth = isSelected ? 3 : 0;
    const h = 10.0;
    var labelAt = left + 8;
    final bar =
        m.kind == MarkKind.lasting ||
        m.kind == MarkKind.ongoing ||
        (m.kind == MarkKind.uncertain && math.max(_x(m.end, width), left) - left >= 14);
    // A bar sits low in its row, its name above it; every other mark has its name beside it.
    if (bar) y += 8;
    if (badges?['event:${m.id}'] case final badge?) {
      paintCanonBadge(canvas, Offset(left - 8, y - 8), badge, scheme, anchorRight: true);
    }
    switch (m.kind) {
      case MarkKind.moment:
        canvas.drawCircle(Offset(left, y), 5, fill);
        if (isSelected) canvas.drawCircle(Offset(left, y), 8, outline);
      case MarkKind.uncertain:
        // Too short to show as a band at this zoom: a dashed ring round its middle says the same.
        final middle = (left + right) / 2;
        final rect = right - left < 14
            ? RRect.fromRectAndRadius(Rect.fromCircle(center: Offset(middle, y), radius: 7), const Radius.circular(7))
            : RRect.fromRectAndRadius(Rect.fromLTRB(left, y - h / 2, right, y + h / 2), const Radius.circular(5));
        canvas.drawRRect(rect, Paint()..color = color.withValues(alpha: 0.18));
        _dashedRRect(
          canvas,
          rect,
          Paint()
            ..color = color
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.5,
        );
        canvas.drawCircle(Offset(middle, y), 3.5, fill);
        if (isSelected) canvas.drawRRect(rect.inflate(3), outline);
        labelAt = math.max(right, middle + 7) + 6;
      case MarkKind.lasting || MarkKind.ongoing:
        final solidFrom = m.startFuzz == null ? left : _x(m.startFuzz!.hi, width);
        final solidTo = m.endFuzz == null ? right : _x(m.endFuzz!.lo, width);
        if (m.startFuzz != null) {
          _hatched(canvas, Rect.fromLTRB(left, y - h / 2, math.max(left, solidFrom), y + h / 2), color);
        }
        if (m.endFuzz != null) {
          _hatched(canvas, Rect.fromLTRB(math.min(right, solidTo), y - h / 2, right, y + h / 2), color);
        }
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTRB(solidFrom, y - h / 2, math.max(solidTo, solidFrom + 2), y + h / 2),
            const Radius.circular(3),
          ),
          fill,
        );
        if (m.kind == MarkKind.ongoing) {
          final path = Path()
            ..moveTo(width - 10, y - 8)
            ..lineTo(width, y)
            ..lineTo(width - 10, y + 8)
            ..close();
          canvas.drawPath(path, fill);
        }
        if (isSelected) canvas.drawRect(Rect.fromLTRB(left, y - h / 2, right, y + h / 2).inflate(3), outline);
      case MarkKind.unended:
        // It lasts, but its end is not given: a short bar fading out, never claiming an end.
        final rect = Rect.fromLTWH(left, y - h / 2, 48, h);
        canvas.drawRect(
          rect,
          Paint()..shader = ui.Gradient.linear(rect.centerLeft, rect.centerRight, [color, color.withValues(alpha: 0)]),
        );
        _label(
          '?',
          text.labelLarge?.copyWith(color: color, fontWeight: FontWeight.w700),
          20,
        ).paint(canvas, Offset(left + 50, y - 9));
        if (isSelected) canvas.drawRect(rect.inflate(3), outline);
        labelAt = left + 62;
    }
    final style = (text.bodySmall ?? const TextStyle()).copyWith(
      color: scheme.onSurface,
      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w400,
    );
    final label = _label(m.title.isEmpty ? 'Untitled event' : m.title, style, _labelWidth - 10);
    label.paint(
      canvas,
      bar ? Offset(math.max(2, left + 2), y - h / 2 - label.height - 1) : Offset(labelAt, y - label.height / 2),
    );
  }

  void _hatched(Canvas canvas, Rect rect, Color color) {
    if (rect.width <= 0) return;
    canvas.save();
    canvas.clipRect(rect);
    canvas.drawRect(rect, Paint()..color = color.withValues(alpha: 0.2));
    final line = Paint()
      ..color = color
      ..strokeWidth = 1.2;
    for (var x = rect.left - rect.height; x < rect.right; x += 5) {
      canvas.drawLine(Offset(x, rect.bottom), Offset(x + rect.height, rect.top), line);
    }
    canvas.restore();
  }

  void _dashedRRect(Canvas canvas, RRect rrect, Paint paint) {
    final path = Path()..addRRect(rrect);
    for (final metric in path.computeMetrics()) {
      for (var d = 0.0; d < metric.length; d += 8) {
        canvas.drawPath(metric.extractPath(d, math.min(d + 4, metric.length)), paint);
      }
    }
  }

  @override
  SemanticsBuilderCallback get semanticsBuilder => (size) {
    _layout(size.width);
    return [
      for (final h in _hits)
        if (h.rect.right >= 0 && h.rect.left <= size.width)
          CustomPainterSemantics(
            // At least 48 high for a finger or a switch, centred on the bar; the bar itself stays as drawn.
            rect: Rect.fromCenter(
              center: h.rect.center,
              width: h.rect.width,
              height: math.max(h.rect.height, 48),
            ).intersect(Offset.zero & size),
            properties: SemanticsProperties(
              label: '${markWords(h.mark)}, on the ${h.track} track',
              button: true,
              selected: h.mark.id == selected,
              textDirection: direction,
              onTap: () => onSelect(h.mark.id),
            ),
          ),
    ];
  };

  @override
  bool shouldRepaint(_ChartPainter old) =>
      old.tracks != tracks || old.window != window || old.selected != selected || old.scheme != scheme;

  @override
  bool shouldRebuildSemantics(_ChartPainter old) => shouldRepaint(old);
}

/// The legend: every kind of mark as a shape and in words, never colour alone.
class TimelineLegend extends StatelessWidget {
  const TimelineLegend({super.key});

  static const _items = [
    (MarkKind.moment, 'Exact moment: a dot'),
    (MarkKind.uncertain, 'Somewhere in this stretch: a dashed band, with a dot at its middle'),
    (MarkKind.lasting, 'Lasts a while: a bar; hatched where its start or end is known only roughly'),
    (MarkKind.ongoing, 'Still going on: a bar to the edge, with an arrow'),
    (MarkKind.unended, 'End not given: a bar fading out, with “?”'),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Wrap(
      spacing: 16,
      runSpacing: 6,
      children: [
        for (final (kind, words) in _items)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(width: 40, height: 16, child: CustomPaint(painter: _Swatch(kind, theme.colorScheme.primary))),
              const SizedBox(width: 6),
              Flexible(child: Text(words, style: theme.textTheme.bodySmall)),
            ],
          ),
      ],
    );
  }
}

class _Swatch extends CustomPainter {
  _Swatch(this.kind, this.color);
  final MarkKind kind;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height / 2;
    final fill = Paint()..color = color;
    switch (kind) {
      case MarkKind.moment:
        canvas.drawCircle(Offset(size.width / 2, y), 5, fill);
      case MarkKind.uncertain:
        final rect = RRect.fromRectAndRadius(Rect.fromLTWH(2, y - 5, size.width - 4, 10), const Radius.circular(5));
        canvas.drawRRect(rect, Paint()..color = color.withValues(alpha: 0.2));
        canvas.drawCircle(Offset(size.width / 2, y), 3.5, fill);
      case MarkKind.lasting:
        canvas.drawRect(Rect.fromLTWH(2, y - 5, size.width - 4, 10), fill);
      case MarkKind.ongoing:
        canvas.drawRect(Rect.fromLTWH(2, y - 5, size.width - 12, 10), fill);
        canvas.drawPath(
          Path()
            ..moveTo(size.width - 10, y - 7)
            ..lineTo(size.width, y)
            ..lineTo(size.width - 10, y + 7)
            ..close(),
          fill,
        );
      case MarkKind.unended:
        final rect = Rect.fromLTWH(2, y - 5, size.width - 4, 10);
        canvas.drawRect(
          rect,
          Paint()..shader = ui.Gradient.linear(rect.centerLeft, rect.centerRight, [color, color.withValues(alpha: 0)]),
        );
    }
  }

  @override
  bool shouldRepaint(_Swatch old) => old.kind != kind || old.color != color;
}
