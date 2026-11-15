import 'dart:math' as math;

import 'package:flutter/foundation.dart' show listEquals, setEquals;
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart' show SemanticsProperties;
import 'package:flutter/services.dart' show KeyDownEvent, KeyEvent, KeyRepeatEvent, LogicalKeyboardKey;

import '../../../shared/domain/analytics/progress.dart' show TrendPoint, grouped;

/// "1.2K", "15K": a number short enough for an axis or a column's top, as the original writes it.
String compactNumber(int n) {
  final abs = n.abs();
  if (abs < 1000) return '$n';
  final k = n / 1000;
  return '${k == k.roundToDouble() || abs >= 10000 ? (k + 0.5).floor() : k.toStringAsFixed(1)}K';
}

/// Rounds up to a clean axis value.
int niceCeil(int value) {
  if (value <= 0) return 0;
  final magnitude = math.pow(10, (math.log(value) / math.ln10).floor()).toDouble();
  for (final m in [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) {
    if (m * magnitude >= value) return (m * magnitude).round();
  }
  return value;
}

/// "−1,200": a minus sign, not a hyphen, as the original writes a cut.
String signed(int n) => '${n < 0 ? '−' : ''}${grouped(n.abs())}';

/// Colours for things told apart by kind (identity, not amount), in a fixed order that stays distinguishable with
/// colour-vision deficiencies when side by side; a set for light and one for dark surfaces. Always shown with names.
List<Color> seriesColors(Brightness brightness) => brightness == Brightness.dark
    ? const [Color(0xFF3987E5), Color(0xFFD95926), Color(0xFF199E70), Color(0xFFC98500), Color(0xFFD55181)]
    : const [Color(0xFF2A78D6), Color(0xFFEB6834), Color(0xFF1BAF7A), Color(0xFFEDA100), Color(0xFFE87BA4)];

/// A share of a whole as a filled track (0 to 1), drawn the same in every theme and never animated.
class Gauge extends StatelessWidget {
  const Gauge({super.key, required this.value, this.height = 8});
  final double value;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: Container(
        height: height,
        color: scheme.surfaceContainerHighest,
        alignment: AlignmentDirectional.centerStart,
        child: FractionallySizedBox(
          widthFactor: value.isFinite ? value.clamp(0, 1).toDouble() : 0,
          heightFactor: 1,
          child: ColoredBox(color: scheme.primary),
        ),
      ),
    );
  }
}

/// One column or bar: what it is, its value and more about it in words.
class BarDatum {
  const BarDatum({
    required this.key,
    required this.short,
    required this.label,
    required this.value,
    this.detail = '',
    this.current = false,
    this.selectable = false,
  });
  final String key;

  /// On the axis: "3", "Oct 24", "Mira".
  final String short;

  /// In full, for the details and a screen reader.
  final String label;
  final int value;
  final String detail;

  /// The period still under way, shown in the accent.
  final bool current;

  /// Whether it is a record that can be selected.
  final bool selectable;
}

/// What a tap shows about a column or bar, under the chart.
class _Said extends StatelessWidget {
  const _Said(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: Semantics(liveRegion: true, child: Text(text, style: Theme.of(context).textTheme.bodySmall)),
  );
}

/// Values as columns from a zero baseline, one series (the title names it, so no legend). The current period is in the
/// accent and earlier ones a quieter step of the same hue; values below zero (more cut than written) drop below the
/// line in neutral grey. Only the newest and the highest columns carry their number; a tap says any column's in full.
/// Many columns scroll sideways rather than shrink past reading.
class ColumnChart extends StatefulWidget {
  const ColumnChart({
    super.key,
    required this.label,
    required this.bars,
    required this.words,
    this.selectedKey,
    this.onSelect,
    this.labelEvery = 1,
    this.height = 160,
  });

  /// The chart in one sentence, for a screen reader.
  final String label;
  final List<BarDatum> bars;

  /// A value in words: "1,200 words".
  final String Function(int value) words;
  final String? selectedKey;
  final ValueChanged<BarDatum>? onSelect;

  /// An axis label on every nth column, counting back from the newest.
  final int labelEvery;
  final double height;

  @override
  State<ColumnChart> createState() => _ColumnChartState();
}

class _ColumnChartState extends State<ColumnChart> {
  String? _told;
  bool _focused = false;

  void _tell(BarDatum b) {
    setState(() => _told = b.key);
    if (b.selectable) widget.onSelect?.call(b);
  }

  /// The arrow keys walk the columns (one stop for the whole chart, not one per column); Enter or Space selects.
  KeyEventResult _key(KeyEvent event, bool rtl) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
    final bars = widget.bars;
    if (bars.isEmpty) return KeyEventResult.ignored;
    final at = bars.indexWhere((b) => b.key == _told);
    final key = event.logicalKey;
    final forward = rtl ? LogicalKeyboardKey.arrowLeft : LogicalKeyboardKey.arrowRight;
    final back = rtl ? LogicalKeyboardKey.arrowRight : LogicalKeyboardKey.arrowLeft;
    int? next;
    if (key == forward) next = at < 0 ? bars.length - 1 : math.min(at + 1, bars.length - 1);
    if (key == back) next = at < 0 ? bars.length - 1 : math.max(at - 1, 0);
    if (key == LogicalKeyboardKey.home) next = 0;
    if (key == LogicalKeyboardKey.end) next = bars.length - 1;
    if (next != null) {
      setState(() => _told = bars[next!].key);
      return KeyEventResult.handled;
    }
    if ((key == LogicalKeyboardKey.enter || key == LogicalKeyboardKey.space) && at >= 0) {
      _tell(bars[at]);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final bars = widget.bars;
    final top = niceCeil(bars.fold(0, (m, b) => math.max(m, b.value)));
    final bottom = niceCeil(bars.fold(0, (m, b) => math.max(m, -b.value)));
    final range = math.max(top + bottom, 1);
    final h = widget.height;
    final zero = top / range * h;
    // Only a trend has a period under way: its earlier periods are the quieter step.
    final trend = bars.any((b) => b.current);
    BarDatum? peak;
    for (final b in bars) {
      if (peak == null || b.value > peak.value) peak = b;
    }
    final small = theme.textTheme.labelSmall!.copyWith(color: scheme.onSurfaceVariant);
    final told = bars.where((b) => b.key == _told).firstOrNull;
    String words(BarDatum b) => '${b.label}: ${widget.words(b.value)}${b.detail.isEmpty ? '' : '. ${b.detail}'}';
    final direction = Directionality.of(context);
    final rtl = direction == TextDirection.rtl;

    return Semantics(
      container: true,
      label: widget.label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ExcludeSemantics(
                child: SizedBox(
                  width: 40,
                  height: h,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Positioned(top: -7, right: 4, child: Text(compactNumber(top), style: small)),
                      if (top > 0)
                        Positioned(
                          top: zero - 7,
                          right: 4,
                          child: Text('0', style: small),
                        ),
                      if (bottom > 0)
                        Positioned(
                          top: h - 7,
                          right: 4,
                          child: Text('−${compactNumber(bottom)}', style: small),
                        ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, box) {
                    final width = math.max(box.maxWidth / math.max(bars.length, 1), 12.0);
                    // Axis labels never run into each other: every nth, by how wide the longest is.
                    final widest = bars.fold(0, (m, b) => math.max(m, b.short.length)) * 7.0 + 8;
                    final every = math.max(widget.labelEvery, (widest / width).ceil());
                    final all = width * bars.length;
                    double left(int i) => rtl ? all - (i + 1) * width : i * width;
                    int? indexAt(double x) {
                      final i = (rtl ? (all - x) / width : x / width).floor();
                      return i >= 0 && i < bars.length ? i : null;
                    }

                    // The columns are painted, not built: one picture for hundreds of chapters. Only the few numbers
                    // on them and under them are text.
                    final plot = SizedBox(
                      width: all,
                      height: h + 18,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned(
                            top: 0,
                            left: 0,
                            right: 0,
                            child: Divider(height: 1, color: scheme.outlineVariant),
                          ),
                          Positioned(
                            top: zero,
                            left: 0,
                            right: 0,
                            child: Container(height: 1, color: scheme.outline),
                          ),
                          Positioned.fill(
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTapUp: (d) {
                                if (indexAt(d.localPosition.dx) case final i?) _tell(bars[i]);
                              },
                              child: CustomPaint(
                                painter: ColumnsPainter(
                                  bars: bars,
                                  labels: [for (final b in bars) words(b)],
                                  width: width,
                                  height: h,
                                  zero: zero,
                                  range: range,
                                  rtl: rtl,
                                  direction: direction,
                                  quiet: trend,
                                  selectedKey: widget.selectedKey,
                                  told: _told,
                                  on: scheme.primary,
                                  cut: scheme.outline,
                                  edge: scheme.onSurface,
                                  onTap: (i) => _tell(bars[i]),
                                ),
                              ),
                            ),
                          ),
                          ExcludeSemantics(
                            child: Stack(
                              clipBehavior: Clip.none,
                              children: [
                                const SizedBox.shrink(),
                                for (final (i, b) in bars.indexed) ...[
                                  if (b.value != 0 && (b.current || b.key == peak?.key))
                                    Positioned(
                                      left: left(i) - 24,
                                      width: width + 48,
                                      top: b.value > 0
                                          ? zero - b.value.abs() / range * h - 15
                                          : zero + b.value.abs() / range * h + 1,
                                      child: IgnorePointer(
                                        child: Text(compactNumber(b.value), textAlign: TextAlign.center, style: small),
                                      ),
                                    ),
                                  if ((bars.length - 1 - i) % every == 0)
                                    // Under its column; at either end of the plot, kept inside it rather than cut.
                                    () {
                                      final centred = left(i) + width / 2 - 30;
                                      final start = centred.clamp(0.0, math.max(all - 60, 0.0)).toDouble();
                                      return Positioned(
                                        left: start,
                                        width: 60,
                                        top: h,
                                        height: 18,
                                        child: IgnorePointer(
                                          child: Text(
                                            b.short,
                                            style: small,
                                            maxLines: 1,
                                            textAlign: start > centred
                                                ? TextAlign.left
                                                : (start < centred ? TextAlign.right : TextAlign.center),
                                          ),
                                        ),
                                      );
                                    }(),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                    final framed = Focus(
                      onFocusChange: (f) => setState(() => _focused = f),
                      onKeyEvent: (_, e) => _key(e, rtl),
                      child: DecoratedBox(
                        position: DecorationPosition.foreground,
                        decoration: BoxDecoration(
                          border: _focused ? Border.all(color: scheme.primary, width: 2) : null,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: plot,
                      ),
                    );
                    return all > box.maxWidth + 0.5
                        ? SingleChildScrollView(scrollDirection: Axis.horizontal, reverse: true, child: framed)
                        : framed;
                  },
                ),
              ),
            ],
          ),
          if (told != null) _Said(words(told)),
        ],
      ),
    );
  }
}

/// A [ColumnChart]'s columns in one picture, each also a node of its own for a screen reader, said in full. A column/// wide enough to press (48 px, as for any button) is a button there too, choosing it as a tap does; a narrower one is/// said only, as its number is in the table under the chart.
class ColumnsPainter extends CustomPainter {
  ColumnsPainter({
    required this.bars,
    required this.labels,
    required this.width,
    required this.height,
    required this.zero,
    required this.range,
    required this.rtl,
    required this.direction,
    required this.quiet,
    required this.selectedKey,
    required this.told,
    required this.on,
    required this.cut,
    required this.edge,
    required this.onTap,
  });

  final List<BarDatum> bars;
  final List<String> labels;

  /// Each column's width, the plot's height above the axis labels, and where zero is from the top.
  final double width;
  final double height;
  final double zero;
  final int range;
  final bool rtl;
  final TextDirection direction;

  /// Whether the periods before the current one are the quieter step.
  final bool quiet;
  final String? selectedKey;
  final String? told;
  final Color on;
  final Color cut;
  final Color edge;
  final void Function(int index) onTap;

  double _left(int i) => rtl ? bars.length * width - (i + 1) * width : i * width;

  /// Column [i]'s filled part, or null when it is zero.
  RRect? column(int i) {
    final b = bars[i];
    if (b.value == 0) return null;
    final size = b.value.abs() / range * height;
    final r = Radius.circular(math.min(4, width / 3));
    final rect = Rect.fromLTWH(_left(i) + 1, b.value > 0 ? zero - size : zero, width - 2, math.max(size, 1));
    return b.value > 0
        ? RRect.fromRectAndCorners(rect, topLeft: r, topRight: r)
        : RRect.fromRectAndCorners(rect, bottomLeft: r, bottomRight: r);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final fill = Paint();
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = edge;
    final earlier = on.withValues(alpha: 0.55);
    for (var i = 0; i < bars.length; i++) {
      final shape = column(i);
      if (shape == null) continue;
      final b = bars[i];
      fill.color = b.value < 0 ? cut : (b.current || !quiet ? on : earlier);
      canvas.drawRRect(shape, fill);
      if (b.key == selectedKey || b.key == told) canvas.drawRRect(shape.deflate(1), ring);
    }
  }

  /// Whether the columns are wide enough to be buttons to a screen reader.
  bool get pressable => width >= kMinInteractiveDimension;

  @override
  SemanticsBuilderCallback get semanticsBuilder =>
      (size) => [
        for (var i = 0; i < bars.length; i++)
          CustomPainterSemantics(
            key: ValueKey<String>(bars[i].key),
            rect: Rect.fromLTWH(_left(i), 0, width, size.height),
            properties: SemanticsProperties(
              label: labels[i],
              textDirection: direction,
              button: pressable,
              selected: bars[i].key == selectedKey,
              onTap: pressable ? () => onTap(i) : null,
            ),
          ),
      ];

  bool _same(ColumnsPainter o) =>
      o.width == width &&
      o.height == height &&
      o.zero == zero &&
      o.range == range &&
      o.rtl == rtl &&
      o.quiet == quiet &&
      o.selectedKey == selectedKey &&
      o.told == told &&
      o.on == on &&
      o.cut == cut &&
      o.edge == edge &&
      listEquals(o.labels, labels) &&
      o.bars.length == bars.length &&
      Iterable<int>.generate(bars.length).every((i) {
        final (a, b) = (o.bars[i], bars[i]);
        return a.key == b.key && a.value == b.value && a.current == b.current && a.selectable == b.selectable;
      });

  @override
  bool shouldRepaint(ColumnsPainter oldDelegate) => !_same(oldDelegate);

  @override
  bool shouldRebuildSemantics(ColumnsPainter oldDelegate) => !_same(oldDelegate) || oldDelegate.direction != direction;
}

/// Values as bars for things that have names, longest first as given, each named beside its bar with its number, so
/// nothing is told by length alone.
class BarList extends StatefulWidget {
  const BarList({
    super.key,
    required this.label,
    required this.bars,
    required this.words,
    this.selectedKey,
    this.onSelect,
  });
  final String label;
  final List<BarDatum> bars;
  final String Function(int value) words;
  final String? selectedKey;
  final ValueChanged<BarDatum>? onSelect;

  @override
  State<BarList> createState() => _BarListState();
}

class _BarListState extends State<BarList> {
  String? _told;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final most = widget.bars.fold(1, (m, b) => math.max(m, b.value));
    final told = widget.bars.where((b) => b.key == _told).firstOrNull;
    String words(BarDatum b) => '${b.label}: ${widget.words(b.value)}${b.detail.isEmpty ? '' : '. ${b.detail}'}';
    return Semantics(
      container: true,
      label: widget.label,
      child: LayoutBuilder(
        builder: (context, box) {
          final name = math.min(180.0, box.maxWidth * 0.35);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final b in widget.bars)
                Semantics(
                  container: true,
                  button: true,
                  selected: b.key == widget.selectedKey,
                  label: words(b),
                  excludeSemantics: true,
                  child: InkWell(
                    onTap: () {
                      setState(() => _told = b.key);
                      if (b.selectable) widget.onSelect?.call(b);
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        children: [
                          SizedBox(
                            width: name,
                            child: Text(
                              b.short,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: b.key == widget.selectedKey ? const TextStyle(fontWeight: FontWeight.w700) : null,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: FractionallySizedBox(
                                widthFactor: math.max(b.value / most, 0.01),
                                child: Container(
                                  height: 14,
                                  decoration: BoxDecoration(
                                    color: scheme.primary,
                                    border: b.key == widget.selectedKey || b.key == _told
                                        ? Border.all(color: scheme.onSurface, width: 2)
                                        : null,
                                    borderRadius: const BorderRadius.horizontal(right: Radius.circular(4)),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(grouped(b.value), style: theme.textTheme.labelLarge),
                        ],
                      ),
                    ),
                  ),
                ),
              if (told != null) _Said(words(told)),
            ],
          );
        },
      ),
    );
  }
}

/// A table of the same numbers: the chart for anyone who would rather read than look, and for a screen reader.
class NumbersTable extends StatelessWidget {
  const NumbersTable({super.key, required this.label, required this.columns, required this.rows});
  final String label;
  final List<String> columns;
  final List<List<Object>> rows;

  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    label: label,
    child: SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columnSpacing: 24,
        headingRowHeight: 40,
        dataRowMinHeight: 36,
        dataRowMaxHeight: double.infinity,
        columns: [for (final c in columns) DataColumn(label: Text(c))],
        rows: [
          for (final r in rows)
            DataRow(
              cells: [
                for (final cell in r)
                  DataCell(
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 360),
                      child: Text(cell is int ? grouped(cell) : '$cell'),
                    ),
                  ),
              ],
            ),
        ],
      ),
    ),
  );
}

/// "Show as table", folded away under a chart.
class TableFold extends StatelessWidget {
  const TableFold({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Theme(
    data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
    child: ExpansionTile(
      title: const Text('Show as table'),
      tilePadding: EdgeInsets.zero,
      childrenPadding: EdgeInsets.zero,
      expandedCrossAxisAlignment: CrossAxisAlignment.start,
      children: [child],
    ),
  );
}

/// Net words per period, as the progress pages show them, with the same numbers as a table.
class TrendChart extends StatelessWidget {
  const TrendChart({
    super.key,
    required this.title,
    required this.periodLabel,
    required this.points,
    this.labelEvery = 1,
  });
  final String title;

  /// How a period is described: "Week of", "On".
  final String periodLabel;
  final List<TrendPoint> points;
  final int labelEvery;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    String words(int n) => '${signed(n)} ${n.abs() == 1 ? 'word' : 'words'}';
    final empty = points.every((p) => p.net == 0);
    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(header: true, child: Text(title, style: theme.textTheme.titleSmall)),
            if (empty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'Nothing logged in this period yet. It fills in as you write.',
                  style: theme.textTheme.bodySmall,
                ),
              )
            else
              ColumnChart(
                label: title,
                words: words,
                labelEvery: labelEvery,
                bars: [
                  for (final p in points)
                    BarDatum(
                      key: p.key,
                      short: p.label,
                      label: '${periodLabel.isEmpty ? '' : '$periodLabel '}${p.label}${p.current ? ' (so far)' : ''}',
                      value: p.net,
                      current: p.current,
                    ),
                ],
              ),
            TableFold(
              child: NumbersTable(
                label: '$title, as a table',
                columns: [periodLabel.isEmpty ? 'Day' : periodLabel, 'Net words'],
                rows: [
                  for (final p in points) [p.label, p.net],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Parts of a whole as one bar, with every part named and counted beside it so colour is never the only cue.
class PartsBar extends StatelessWidget {
  const PartsBar({super.key, required this.label, required this.parts, required this.colors});
  final String label;
  final List<({String key, String label, int count})> parts;

  /// One colour for each part, in order.
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final total = parts.fold(0, (n, p) => n + p.count);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          label: '$label: ${parts.map((p) => '${p.label} ${p.count}').join(', ')}',
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: SizedBox(
              height: 14,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (total == 0) Expanded(child: ColoredBox(color: theme.colorScheme.surfaceContainerHighest)),
                  for (final (i, p) in parts.indexed)
                    if (p.count > 0)
                      Expanded(
                        flex: p.count,
                        child: Padding(
                          padding: const EdgeInsets.only(right: 2),
                          child: ColoredBox(color: colors[i % colors.length]),
                        ),
                      ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        ExcludeSemantics(
          child: Wrap(
            spacing: 16,
            runSpacing: 4,
            children: [
              for (final (i, p) in parts.indexed)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(color: colors[i % colors.length], shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text.rich(
                        TextSpan(
                          text: '${p.label} ',
                          children: [
                            TextSpan(
                              text: '${p.count}',
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// One cell per chapter, filled where something is present: where in the book, at a glance.
class ChapterStrip extends StatelessWidget {
  const ChapterStrip({super.key, required this.total, required this.chapters, required this.label});
  final int total;
  final List<int> chapters;
  final String label;

  /// Narrower than this, a chapter's cell has no gap after it: the chapters are painted as runs instead.
  static const gapFrom = 4.0;

  /// The least a chapter that is filled is painted, so one chapter in hundreds is still seen.
  static const least = 2.0;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      image: true,
      label: label,
      // Painted, not built: one strip, however many chapters (a long book's strips were thousands of boxes each).
      child: SizedBox(
        height: 12,
        width: double.infinity,
        child: CustomPaint(
          painter: StripPainter(
            total: math.max(total, 1),
            filled: chapters.toSet(),
            on: scheme.primary,
            off: scheme.outlineVariant,
            rtl: Directionality.maybeOf(context) == TextDirection.rtl,
          ),
        ),
      ),
    );
  }
}

/// A [ChapterStrip]'s cells: one per chapter with a gap after each while there is room; on a long book, where cells
/// would be narrower than their gap, the track whole and the filled chapters on it as runs, each at least [least] wide.
class StripPainter extends CustomPainter {
  StripPainter({required this.total, required this.filled, required this.on, required this.off, this.rtl = false});

  final int total;
  final Set<int> filled;
  final Color on;
  final Color off;
  final bool rtl;

  @override
  void paint(Canvas canvas, Size size) {
    final cell = size.width / total;
    final h = size.height;
    // The cell for chapter [i] (from 1), [width] wide, from the start of the line.
    Rect at(int i, double width) {
      final start = (i - 1) * cell;
      return Rect.fromLTWH(rtl ? size.width - start - cell : start, 0, width, h);
    }

    final paint = Paint();
    if (cell >= ChapterStrip.gapFrom) {
      for (var i = 1; i <= total; i++) {
        canvas.drawRect(at(i, cell - 1), paint..color = filled.contains(i) ? on : off);
      }
      return;
    }
    canvas.drawRect(Offset.zero & size, paint..color = off);
    paint.color = on;
    final numbers = [
      for (final n in filled)
        if (n >= 1 && n <= total) n,
    ]..sort();
    for (var k = 0; k < numbers.length;) {
      final first = numbers[k];
      var last = first;
      while (++k < numbers.length && numbers[k] == last + 1) {
        last = numbers[k];
      }
      final width = math.max((last - first + 1) * cell, ChapterStrip.least);
      final start = math.min((first - 1) * cell, size.width - width);
      canvas.drawRect(Rect.fromLTWH(rtl ? size.width - start - width : start, 0, width, h), paint);
    }
  }

  @override
  bool shouldRepaint(StripPainter oldDelegate) =>
      oldDelegate.total != total ||
      oldDelegate.on != on ||
      oldDelegate.off != off ||
      oldDelegate.rtl != rtl ||
      !setEquals(oldDelegate.filled, filled);
}
