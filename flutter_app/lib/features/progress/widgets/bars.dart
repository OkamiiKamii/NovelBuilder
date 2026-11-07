import 'dart:math' as math;

import 'package:flutter/material.dart';

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

    Widget column(int i, BarDatum b, double width, int every) {
      final size = b.value.abs() / range * h;
      final selected = b.key == widget.selectedKey || b.key == _told;
      final fill = b.value < 0
          ? scheme.outline
          : (b.current || !trend ? scheme.primary : scheme.primary.withValues(alpha: 0.55));
      final labelled = b.value != 0 && (b.current || b.key == peak?.key);
      final radius = Radius.circular(math.min(4, width / 3));
      return Semantics(
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
          child: SizedBox(
            width: width,
            child: Column(
              children: [
                SizedBox(
                  height: h,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      if (b.value != 0)
                        Positioned(
                          left: 1,
                          right: 1,
                          top: b.value > 0 ? zero - size : zero,
                          height: math.max(size, 1),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: fill,
                              border: selected ? Border.all(color: scheme.onSurface, width: 2) : null,
                              borderRadius: b.value > 0
                                  ? BorderRadius.vertical(top: radius)
                                  : BorderRadius.vertical(bottom: radius),
                            ),
                          ),
                        ),
                      if (labelled)
                        Positioned(
                          left: -24,
                          right: -24,
                          top: b.value > 0 ? zero - size - 15 : zero + size + 1,
                          child: Text(compactNumber(b.value), textAlign: TextAlign.center, style: small),
                        ),
                    ],
                  ),
                ),
                SizedBox(
                  height: 18,
                  child: (bars.length - 1 - i) % every == 0
                      ? OverflowBox(
                          maxWidth: 60,
                          child: Text(b.short, style: small, maxLines: 1, textAlign: TextAlign.center),
                        )
                      : null,
                ),
              ],
            ),
          ),
        ),
      );
    }

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
                    final plot = SizedBox(
                      width: width * bars.length,
                      child: Stack(
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
                          Row(children: [for (final (i, b) in bars.indexed) column(i, b, width, every)]),
                        ],
                      ),
                    );
                    return width * bars.length > box.maxWidth + 0.5
                        ? SingleChildScrollView(scrollDirection: Axis.horizontal, reverse: true, child: plot)
                        : plot;
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

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final filled = chapters.toSet();
    return Semantics(
      image: true,
      label: label,
      child: SizedBox(
        height: 12,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 1; i <= math.max(total, 1); i++)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(right: 1),
                  child: ColoredBox(color: filled.contains(i) ? scheme.primary : scheme.outlineVariant),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
