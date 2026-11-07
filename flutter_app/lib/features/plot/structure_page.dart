import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/board.dart' show buildTree, flattenTree;
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/structure/pacing.dart';
import '../../shared/domain/timeline/narrative.dart' show nodeLabel;
import '../characters/characters_providers.dart';
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import 'plot_providers.dart';

/// STRUCTURE AND PACING
/// How long each chapter or scene is, the parts it sits in, the author's structural markers, and words by the labels
/// the author gives: all read from what is recorded. These describe the manuscript; they do not measure it, and no
/// structure is expected of it.
class StructurePage extends ConsumerStatefulWidget {
  const StructurePage({super.key});

  @override
  ConsumerState<StructurePage> createState() => _StructurePageState();
}

class _StructurePageState extends ConsumerState<StructurePage> {
  bool _list = false;
  Grain _grain = Grain.chapters;
  String? _label;
  String? _partId;

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child) => VizFrame(
      view: 'structure',
      title: 'Structure and pacing',
      filters: false,
      config: () => {
        'mode': _list ? 'list' : 'visual',
        'layout': {'grain': _grain.name, 'label': ?_label, 'part': ?_partId},
      },
      onApply: (JsonMap c) {
        final layout = mapOrNull(c['layout']) ?? const {};
        setState(() {
          _list = c['mode'] == 'list';
          _grain = layout['grain'] == 'scenes' ? Grain.scenes : Grain.chapters;
          _label = strOrNull(layout['label']);
          _partId = strOrNull(layout['part']);
        });
      },
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.bar_chart), label: Text('Charts')),
            ButtonSegment(value: true, icon: Icon(Icons.table_rows_outlined), label: Text('List')),
          ],
          selected: {_list},
          showSelectedIcon: false,
          onSelectionChanged: (v) => setState(() => _list = v.first),
        ),
      ],
      child: child,
    );
    if (cast == null) return frame(const SizedBox.shrink());
    final model = cast.model;
    final theme = Theme.of(context);
    if (model.order.chapters.isEmpty) {
      return frame(
        const EmptyState(
          icon: Icons.bar_chart,
          title: 'No chapters yet',
          message: 'Add chapters in Write; their lengths, and the labels and markers you give them, appear here.',
        ),
      );
    }
    final actions = PlotActions(context, cast.novelId);
    final grain = _grain;
    final perWord = grain == Grain.chapters ? 'chapter' : 'bar';
    final parts = stableSorted(
      model.nodes.values.where((n) => n.kind?.isGroup == true),
      (a, b) => (model.order.position[a.id] ?? 0).compareTo(model.order.position[b.id] ?? 0),
    );
    final partId = parts.any((p) => p.id == _partId) ? _partId : null;
    final labels = usedLabels(model);
    final label = labels.where((l) => l.toLowerCase() == (_label ?? '').toLowerCase()).firstOrNull;
    final bars = lengthBars(model, grain: grain, partId: partId);
    final bands = partBands(bars, model);
    final facts = lengthFacts(bars);
    final picked = label == null
        ? bars
        : [
            for (final b in bars)
              if (b.labels.any((l) => l.toLowerCase() == label.toLowerCase())) b,
          ];
    final dist = labelDistribution(bars, model, grain);
    final markers = stableSorted([
      for (final r in cast.snapshot.rows('structureMarkers')) StructureMarker(r),
    ], (a, b) => a.createdAt.compareTo(b.createdAt));
    final placed = placeMarkers(markers, model);
    final onBars = <int, List<String>>{};
    for (final p in placed) {
      final i = barOf(p, bars, model);
      if (i >= 0) (onBars[i] ??= []).add(p.marker.kind);
    }
    String? partTitle(String? id) => id == null ? null : model.nodes[id]?.title;
    String barWords(LengthBar bar, int i) => [
      '${bar.label}: ${bar.words > 0 ? plural(bar.words, 'word') : 'no words yet'}',
      if (bar.labels.isNotEmpty) 'labels: ${bar.labels.join(', ')}',
      if (bar.partId != null) 'in ${partTitle(bar.partId)}',
      if (onBars[i]?.isNotEmpty ?? false) 'markers: ${onBars[i]!.join(', ')}',
    ].join('; ');
    final selectedId = viz.selection?.type == EntityType.node ? viz.selection!.id : null;
    void select(String id) => notifier.select(EntityRef(EntityType.node, id));

    final factLine = bars.isEmpty
        ? 'Nothing in this part of the book yet.'
        : [
            '${plural(facts.count, perWord)} · ${plural(facts.total, 'word')}',
            if (facts.average > 0)
              ' · average ${formatNumber(facts.average)} and median ${formatNumber(facts.median)} words, over the '
                  '${plural(facts.count - facts.empty, perWord)} with words',
            if (facts.longest != null && facts.shortest != null && facts.longest != facts.shortest)
              ' · longest ${facts.longest!.label} (${formatNumber(facts.longest!.words)}), shortest '
                  '${facts.shortest!.label} (${formatNumber(facts.shortest!.words)})',
            if (facts.empty > 0)
              ' · ${plural(facts.empty, grain == Grain.chapters ? 'chapter has' : 'bar has', grain == Grain.chapters ? 'chapters have' : 'bars have')} no words yet',
            ' · ${facts.labelled} of ${facts.count} labelled',
            if (label != null) ' · ${picked.length} with “$label”',
          ].join();
    final along = grain == Grain.chapters ? 'chapter by chapter' : 'scene by scene';
    Widget heading(String s) => Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 8),
      child: Semantics(header: true, child: Text(s, style: theme.textTheme.titleMedium)),
    );

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card.outlined(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: 'What these charts are. ', style: theme.textTheme.labelLarge),
                    const TextSpan(
                      text:
                          'Word counts the editor keeps, and the parts, labels and markers you record, laid out in '
                          'reading order. They describe the manuscript as it stands. They do not measure quality, how '
                          'a chapter reads, or whether a structure is right, and no storytelling formula is assumed: '
                          'the markers are only the ones you add.',
                    ),
                  ],
                ),
                style: theme.textTheme.bodySmall,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SegmentedButton<Grain>(
                segments: const [
                  ButtonSegment(value: Grain.chapters, label: Text('Chapters')),
                  ButtonSegment(value: Grain.scenes, label: Text('Scenes')),
                ],
                selected: {grain},
                showSelectedIcon: false,
                onSelectionChanged: (v) => setState(() => _grain = v.first),
              ),
              SizedBox(
                width: 220,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('label:$label'),
                  initialValue: label ?? '',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Pick out a label', isDense: true),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('No label picked out')),
                    for (final l in labels) DropdownMenuItem(value: l, child: Text(l)),
                  ],
                  onChanged: (v) => setState(() => _label = v == null || v.isEmpty ? null : v),
                ),
              ),
              if (parts.isNotEmpty)
                SizedBox(
                  width: 220,
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('part:$partId'),
                    initialValue: partId ?? '',
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Part of the book', isDense: true),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('The whole book')),
                      for (final p in parts)
                        DropdownMenuItem(
                          value: p.id,
                          child: Text(p.title.isEmpty ? 'Untitled' : p.title, overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (v) => setState(() => _partId = v == null || v.isEmpty ? null : v),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Semantics(liveRegion: true, child: Text(factLine)),
          if (facts.total == 0 && bars.isNotEmpty)
            Text('No words are written yet: the bars fill in as you write.', style: theme.textTheme.bodySmall),

          heading('Length, $along'),
          if (bars.isNotEmpty && !_list) ...[
            _LengthChart(
              bars: bars,
              bands: bands,
              markers: onBars,
              average: facts.average,
              label: label,
              selectedId: selectedId,
              onSelect: select,
              words: barWords,
            ),
            const SizedBox(height: 8),
            _ChartLegend(
              grain: grain,
              empty: bars.any((b) => b.words == 0),
              average: facts.average > 0,
              markers: onBars.isNotEmpty,
              bands: bands.isNotEmpty,
            ),
          ] else if (bars.isNotEmpty)
            _table(
              context,
              headers: [grain == Grain.chapters ? 'Chapter' : 'Chapter or scene', 'Part', 'Words', 'Labels', 'Markers'],
              rows: [
                for (final (i, bar) in bars.indexed)
                  [
                    TextButton(
                      onPressed: () => select(bar.nodeId),
                      style: bar.nodeId == selectedId
                          ? TextButton.styleFrom(backgroundColor: theme.colorScheme.secondaryContainer)
                          : null,
                      child: Text(bar.label),
                    ),
                    Text(partTitle(bar.partId) ?? '—'),
                    Text(bar.words > 0 ? formatNumber(bar.words) : 'No words yet'),
                    Text(bar.labels.isEmpty ? '—' : bar.labels.join(', ')),
                    Text(onBars[i]?.join(', ') ?? '—'),
                  ],
              ],
            ),

          heading('Words by label, $along'),
          const SizedBox(height: 8),
          if (dist.labels.isEmpty)
            const EmptyState(
              icon: Icons.label_outline,
              title: 'No labels yet',
              message:
                  'No chapter or scene has a label yet. Give some a label in their plan (Action, Dialogue, Quiet '
                  'moment, or your own), and this fills in.',
            )
          else if (!_list)
            _LabelGrid(bars: bars, dist: dist, picked: label)
          else
            _table(
              context,
              headers: ['Label', 'Words', grain == Grain.chapters ? 'Chapters with it' : 'Bars with it'],
              rows: [
                for (final t in dist.totals) [Text(t.label), Text(formatNumber(t.words)), Text('${t.bars}')],
                [const Text('No label'), Text(formatNumber(dist.unlabelled)), const Text('')],
              ],
            ),

          heading('Structural markers'),
          _Markers(model: model, placed: placed, actions: actions),
        ],
      ),
    );
  }

  Widget _table(BuildContext context, {required List<String> headers, required List<List<Widget>> rows}) =>
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowHeight: 40,
          dataRowMinHeight: 40,
          columns: [for (final h in headers) DataColumn(label: Text(h))],
          rows: [
            for (final r in rows) DataRow(cells: [for (final c in r) DataCell(c)]),
          ],
        ),
      );
}

const _axisW = 58.0;
const _barW = 48.0;
const _top = 46.0;
const _plotH = 190.0;
const _bottom = 26.0;

/// A round number at or above [n], for the top of the scale.
double _niceMax(int n) {
  if (n <= 0) return 100;
  final step = math.pow(10, (math.log(n) / math.ln10).floor()).toDouble();
  return (n / step).ceil() * step;
}

/// The short name of a bar under the chart: the chapter's number, and the scene's after a point when a chapter has
/// several bars.
String _short(List<LengthBar> bars, int i) {
  final mine = bars.where((b) => b.chapterId == bars[i].chapterId).length;
  if (mine <= 1) return '${bars[i].chapterNumber}';
  final n = bars.take(i + 1).where((b) => b.chapterId == bars[i].chapterId).length;
  return '${bars[i].chapterNumber}.$n';
}

/// Words per chapter (or scene), in reading order: a bar for each, the volumes, acts and arcs they sit in as bands
/// behind them, and the author's markers as flags. A chapter with no words yet has an empty, outlined bar. One stop
/// in the tab order: the arrow keys move between bars, Enter selects one.
class _LengthChart extends StatefulWidget {
  const _LengthChart({
    required this.bars,
    required this.bands,
    required this.markers,
    required this.average,
    required this.label,
    required this.selectedId,
    required this.onSelect,
    required this.words,
  });

  final List<LengthBar> bars;
  final List<PartBand> bands;
  final Map<int, List<String>> markers;
  final int average;
  final String? label;
  final String? selectedId;
  final ValueChanged<String> onSelect;
  final String Function(LengthBar bar, int i) words;

  @override
  State<_LengthChart> createState() => _LengthChartState();
}

class _LengthChartState extends State<_LengthChart> {
  final _scroll = ScrollController();
  final _node = FocusNode(debugLabel: 'Length chart');
  int _focus = 0;
  bool _focused = false;

  @override
  void dispose() {
    _scroll.dispose();
    _node.dispose();
    super.dispose();
  }

  void _move(int i) {
    final next = i.clamp(0, widget.bars.length - 1);
    setState(() => _focus = next);
    if (!_scroll.hasClients) return;
    final left = _axisW + next * _barW;
    final view = _scroll.position.viewportDimension;
    if (left < _scroll.offset) _scroll.jumpTo(math.max(0, left - _axisW));
    if (left + _barW > _scroll.offset + view) {
      _scroll.jumpTo(math.min(_scroll.position.maxScrollExtent, left + _barW - view));
    }
  }

  KeyEventResult _key(KeyEvent e) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent) return KeyEventResult.ignored;
    final at = _focus.clamp(0, widget.bars.length - 1);
    switch (e.logicalKey) {
      case LogicalKeyboardKey.arrowRight:
        _move(at + 1);
      case LogicalKeyboardKey.arrowLeft:
        _move(at - 1);
      case LogicalKeyboardKey.home:
        _move(0);
      case LogicalKeyboardKey.end:
        _move(widget.bars.length - 1);
      case LogicalKeyboardKey.enter || LogicalKeyboardKey.space:
        widget.onSelect(widget.bars[at].nodeId);
      default:
        return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final bars = widget.bars;
    final tallest = bars.fold(0, (n, b) => math.max(n, b.words));
    final width = _axisW + bars.length * _barW + 16;
    const height = _top + _plotH + _bottom;
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      label:
          'Length chart: ${plural(bars.length, 'bar')} in reading order, the tallest ${formatNumber(tallest)} words. '
          'Arrow keys move between bars, Enter selects one.',
      child: Focus(
        focusNode: _node,
        onFocusChange: (f) => setState(() => _focused = f),
        onKeyEvent: (_, e) => _key(e),
        child: Scrollbar(
          controller: _scroll,
          thumbVisibility: true,
          child: SingleChildScrollView(
            controller: _scroll,
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.only(bottom: 12),
            child: SizedBox(
              width: width,
              height: height,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: CustomPaint(
                      painter: _LengthPainter(
                        bars: bars,
                        bands: widget.bands,
                        markers: widget.markers,
                        average: widget.average,
                        label: widget.label,
                        selectedId: widget.selectedId,
                        focus: _focused ? _focus : null,
                        max: _niceMax(tallest),
                        scheme: theme.colorScheme,
                        text: theme.textTheme,
                        scale: MediaQuery.textScalerOf(context),
                      ),
                    ),
                  ),
                  for (final (i, bar) in bars.indexed)
                    Positioned(
                      left: _axisW + i * _barW,
                      top: _top - 4,
                      width: _barW,
                      height: _plotH + 4 + _bottom,
                      child: Semantics(
                        button: true,
                        selected: bar.nodeId == widget.selectedId,
                        label: widget.words(bar, i),
                        onTap: () => widget.onSelect(bar.nodeId),
                        excludeSemantics: true,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            setState(() => _focus = i);
                            _node.requestFocus();
                            widget.onSelect(bar.nodeId);
                          },
                          child: Tooltip(
                            message: widget.words(bar, i),
                            excludeFromSemantics: true,
                            child: const SizedBox.expand(),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LengthPainter extends CustomPainter {
  _LengthPainter({
    required this.bars,
    required this.bands,
    required this.markers,
    required this.average,
    required this.label,
    required this.selectedId,
    required this.focus,
    required this.max,
    required this.scheme,
    required this.text,
    required this.scale,
  });

  final List<LengthBar> bars;
  final List<PartBand> bands;
  final Map<int, List<String>> markers;
  final int average;
  final String? label;
  final String? selectedId;
  final int? focus;
  final double max;
  final ColorScheme scheme;
  final TextTheme text;
  final TextScaler scale;

  double x(int i) => _axisW + i * _barW;
  double y(num w) => _top + _plotH - (w / max) * _plotH;

  void _text(Canvas c, String s, Offset at, TextStyle? style, {double? maxWidth, TextAlign align = TextAlign.left}) {
    final p = TextPainter(
      text: TextSpan(text: s, style: style),
      textDirection: TextDirection.ltr,
      textScaler: scale,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: maxWidth ?? double.infinity);
    final dx = switch (align) {
      TextAlign.right => p.width,
      TextAlign.center => p.width / 2,
      _ => 0.0,
    };
    p.paint(c, at - Offset(dx, p.height / 2));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final small = text.labelSmall?.copyWith(color: scheme.onSurfaceVariant);
    for (final (i, band) in bands.indexed) {
      final w = (band.to - band.from + 1) * _barW;
      canvas.drawRect(
        Rect.fromLTWH(x(band.from), _top - 4, w, _plotH + 4),
        Paint()..color = i.isOdd ? scheme.surfaceContainerHigh : scheme.surfaceContainer,
      );
      _text(canvas, band.title, Offset(x(band.from) + 4, _top - 32), small, maxWidth: math.max(28, w - 6));
    }
    final grid = Paint()
      ..color = scheme.outlineVariant
      ..strokeWidth = 1;
    for (final tick in [0, max / 2, max]) {
      canvas.drawLine(Offset(_axisW - 4, y(tick)), Offset(size.width - 8, y(tick)), grid);
      _text(canvas, formatNumber((tick + 0.5).floor()), Offset(_axisW - 8, y(tick)), small, align: TextAlign.right);
    }
    for (final (i, bar) in bars.indexed) {
      final dim = label != null && !bar.labels.any((l) => l.toLowerCase() == label!.toLowerCase());
      final selected = bar.nodeId == selectedId;
      if (selected) {
        canvas.drawRect(Rect.fromLTWH(x(i), _top - 4, _barW, _plotH + 4), Paint()..color = scheme.secondaryContainer);
      }
      final colour = (selected ? scheme.secondary : scheme.primary).withValues(alpha: dim ? 0.3 : 1);
      if (bar.words > 0) {
        final h = math.max(0.0, _top + _plotH - y(bar.words));
        canvas.drawRect(Rect.fromLTWH(x(i) + 4, _top + _plotH - h, _barW - 8, h), Paint()..color = colour);
      } else {
        canvas.drawRect(
          Rect.fromLTWH(x(i) + 4, _top + _plotH - 8, _barW - 8, 8),
          Paint()
            ..style = PaintingStyle.stroke
            ..color = scheme.outline,
        );
      }
      _text(canvas, _short(bars, i), Offset(x(i) + _barW / 2, _top + _plotH + 14), small, align: TextAlign.center);
      if (focus == i) {
        canvas.drawRect(
          Rect.fromLTWH(x(i) + 1, _top - 3, _barW - 2, _plotH + _bottom),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2.5
            ..color = scheme.primary,
        );
      }
    }
    if (average > 0) {
      final line = Paint()
        ..color = scheme.onSurface
        ..strokeWidth = 1.5;
      for (var a = _axisW; a < size.width - 8; a += 10) {
        canvas.drawLine(Offset(a, y(average)), Offset(math.min(a + 5, size.width - 8), y(average)), line);
      }
      _text(
        canvas,
        'average ${formatNumber(average)}',
        Offset(size.width - 10, y(average) - 10),
        small?.copyWith(color: scheme.onSurface),
        align: TextAlign.right,
      );
    }
    final flag = Paint()..color = scheme.tertiary;
    final flagged = markers.keys.toList()..sort();
    for (final MapEntry(key: i, value: kinds) in markers.entries) {
      final cx = x(i) + _barW / 2;
      canvas.drawLine(
        Offset(cx, _top - 14),
        Offset(cx, _top + _plotH),
        Paint()
          ..color = scheme.tertiary
          ..strokeWidth = 1.5,
      );
      canvas.drawPath(
        Path()
          ..moveTo(cx, _top - 18)
          ..relativeLineTo(8, 4)
          ..relativeLineTo(-8, 4)
          ..close(),
        flag,
      );
      // Up to the next flag, so names never run into each other; too close, the flag alone. The bar's own words, and
      // the list of markers below, say them in full.
      final next = flagged.where((j) => j > i).firstOrNull;
      final room = next == null ? 130.0 : math.min(130.0, (next - i) * _barW - 14);
      if (room < 24) continue;
      _text(
        canvas,
        kinds.join(', '),
        Offset(cx + 10, _top - 14),
        small?.copyWith(color: scheme.tertiary),
        maxWidth: room,
      );
    }
  }

  @override
  bool shouldRepaint(_LengthPainter old) => true;
}

class _ChartLegend extends StatelessWidget {
  const _ChartLegend({
    required this.grain,
    required this.empty,
    required this.average,
    required this.markers,
    required this.bands,
  });
  final Grain grain;
  final bool empty;
  final bool average;
  final bool markers;
  final bool bands;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = theme.colorScheme;
    Widget item(Widget swatch, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        swatch,
        const SizedBox(width: 6),
        Flexible(child: Text(label, style: theme.textTheme.bodySmall)),
      ],
    );
    Widget box(Color? fill, {Color? border}) => Container(
      width: 14,
      height: 14,
      decoration: BoxDecoration(
        color: fill,
        border: border == null ? null : Border.all(color: border),
      ),
    );
    return ExcludeSemantics(
      child: Wrap(
        spacing: 16,
        runSpacing: 6,
        children: [
          Text('What the chart shows', style: theme.textTheme.labelLarge),
          item(box(s.primary), 'Words in each ${grain == Grain.chapters ? 'chapter' : 'scene'}'),
          if (empty) item(box(null, border: s.outline), 'Nothing written yet'),
          if (average) item(Text('- - -', style: TextStyle(color: s.onSurface)), 'The average length'),
          if (markers) item(Icon(Icons.flag, size: 16, color: s.tertiary), 'A structural marker you placed'),
          if (bands)
            item(box(s.surfaceContainerHigh), 'A part of the book (volume, act or arc), shaded behind its chapters'),
        ],
      ),
    );
  }
}

/// Words by label, a column for each bar: the more words, the stronger the shade, and the number in words beside it.
class _LabelGrid extends StatelessWidget {
  const _LabelGrid({required this.bars, required this.dist, required this.picked});
  final List<LengthBar> bars;
  final ({
    List<String> labels,
    List<LabelCell> cells,
    List<({String label, int words, int bars})> totals,
    int unlabelled,
  })
  dist;
  final String? picked;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = theme.colorScheme;
    final most = math.max(
      1,
      [
        for (final c in dist.cells) ...[...c.words.values, c.unlabelled],
      ].fold(0, math.max),
    );
    final small = theme.textTheme.labelSmall;
    Widget cell(String text, {double shade = 0, String? tip, bool bold = false}) => Tooltip(
      message: tip ?? '',
      excludeFromSemantics: tip == null,
      child: Container(
        width: 52,
        height: 32,
        alignment: Alignment.center,
        color: shade > 0 ? s.primary.withValues(alpha: 0.12 + 0.6 * shade) : null,
        child: Text(
          text,
          style: (bold ? theme.textTheme.labelMedium : small)?.copyWith(color: shade > 0.6 ? s.onPrimary : null),
        ),
      ),
    );
    final rows = [...dist.labels, null];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const SizedBox(width: 140, child: Text('Label')),
              for (final (i, b) in bars.indexed) cell(_short(bars, i), tip: b.label),
              cell('All', bold: true),
            ],
          ),
          for (final l in rows)
            Container(
              color: picked != null && l?.toLowerCase() == picked!.toLowerCase() ? s.secondaryContainer : null,
              child: Row(
                children: [
                  SizedBox(width: 140, child: Text(l ?? 'No label', overflow: TextOverflow.ellipsis)),
                  for (final (i, c) in dist.cells.indexed)
                    () {
                      final w = l == null ? c.unlabelled : (c.words[l] ?? 0);
                      final has = l == null ? c.unlabelled > 0 : c.words.containsKey(l);
                      return cell(
                        has ? formatNumber(w) : '',
                        shade: has ? w / most : 0,
                        tip: '${bars[i].label}: ${l ?? 'no label'}, ${plural(w, 'word')}',
                      );
                    }(),
                  cell(
                    formatNumber(l == null ? dist.unlabelled : dist.totals.firstWhere((t) => t.label == l).words),
                    bold: true,
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// The author's structural markers, in reading order, and a form to add one. None is required.
class _Markers extends StatefulWidget {
  const _Markers({required this.model, required this.placed, required this.actions});
  final StoryModel model;
  final List<PlacedMarker> placed;
  final PlotActions actions;

  @override
  State<_Markers> createState() => _MarkersState();
}

class _MarkersState extends State<_Markers> {
  final _kind = TextEditingController();
  final _title = TextEditingController();
  final _note = TextEditingController();
  String _nodeId = '';
  String _eventId = '';

  @override
  void dispose() {
    _kind.dispose();
    _title.dispose();
    _note.dispose();
    super.dispose();
  }

  void _add() {
    if (_kind.text.trim().isEmpty) return;
    final made = widget.actions.editMarkers(
      (x) => x.save(null, {
        'kind': _kind.text,
        'title': _title.text,
        'nodeId': _nodeId.isEmpty ? null : _nodeId,
        'eventId': _eventId.isEmpty ? null : _eventId,
        'note': _note.text,
      }),
    );
    // Kept on a refusal, so nothing typed is lost.
    if (made != null) {
      setState(() {
        _kind.clear();
        _title.clear();
        _note.clear();
        _nodeId = '';
        _eventId = '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final model = widget.model;
    final placed = widget.placed;
    final documents = [
      for (final t in flattenTree(buildTree([...model.nodes.values])))
        if (t.node.kind == NodeKind.chapter || t.node.kind == NodeKind.scene) t,
    ];
    final events = stableSorted(model.events.values, (a, b) => localeCompare(a.name, b.name));
    final kinds = {...suggestedMarkers, for (final p in placed) p.marker.kind}.toList();
    String where(String? nodeId) => nodeId == null ? 'Not placed' : nodeLabel(model, nodeId);
    Widget box(double w, Widget child) => SizedBox(width: w, child: child);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        if (placed.isEmpty)
          const Text('No markers yet.')
        else
          for (final p in placed)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.flag, color: theme.colorScheme.tertiary),
              title: Text('${p.marker.kind}${p.marker.title.isEmpty ? '' : ' — ${p.marker.title}'}'),
              subtitle: Text(
                [
                  p.missing && p.nodeId == null ? 'Its chapter was removed' : where(p.nodeId),
                  if (p.via == 'event') '(where “${model.events[p.marker.eventId]?.name}” is told)',
                  if (p.marker.eventId != null && p.via != 'event' && model.events.containsKey(p.marker.eventId))
                    '· at “${model.events[p.marker.eventId]!.name}”',
                  if (p.marker.note.isNotEmpty) '· ${p.marker.note}',
                ].join(' '),
              ),
              trailing: IconButton(
                tooltip: 'Remove the marker ${p.marker.kind}${p.marker.title.isEmpty ? '' : ': ${p.marker.title}'}',
                icon: const Icon(Icons.close),
                onPressed: () => widget.actions.editMarkers((x) => x.removeMarker(p.marker.id)),
              ),
            ),
        const SizedBox(height: 12),
        Text('Add a structural marker', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            box(
              240,
              TextField(
                controller: _kind,
                decoration: InputDecoration(
                  labelText: 'Kind of marker',
                  hintText: 'Turning point, Climax, your own…',
                  suffixIcon: PopupMenuButton<String>(
                    tooltip: 'Choose a kind of marker',
                    icon: const Icon(Icons.arrow_drop_down),
                    itemBuilder: (_) => [for (final k in kinds) PopupMenuItem(value: k, child: Text(k))],
                    onSelected: (k) => setState(() => _kind.text = k),
                  ),
                ),
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _add(),
              ),
            ),
            box(
              240,
              TextField(
                controller: _title,
                decoration: const InputDecoration(labelText: 'Its own words', hintText: 'Optional: the bridge falls'),
              ),
            ),
            box(
              240,
              DropdownButtonFormField<String>(
                key: ValueKey('mnode:$_nodeId'),
                initialValue: _nodeId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Chapter or scene'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Not said')),
                  for (final t in documents)
                    DropdownMenuItem(
                      value: t.node.id,
                      child: Text(
                        '${'  ' * t.depth}${t.node.title.isEmpty ? 'Untitled' : t.node.title}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (v) => setState(() => _nodeId = v ?? ''),
              ),
            ),
            if (events.isNotEmpty)
              box(
                240,
                DropdownButtonFormField<String>(
                  key: ValueKey('mevent:$_eventId'),
                  initialValue: _eventId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Event'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('Not said')),
                    for (final e in events)
                      DropdownMenuItem(
                        value: e.id,
                        child: Text(e.name, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() => _eventId = v ?? ''),
                ),
              ),
            box(
              360,
              TextField(
                controller: _note,
                decoration: const InputDecoration(labelText: 'Note', hintText: 'Optional'),
              ),
            ),
            FilledButton.tonal(onPressed: _kind.text.trim().isEmpty ? null : _add, child: const Text('Add marker')),
          ],
        ),
      ],
    );
  }
}
