import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/states.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/charts.dart';
import '../../shared/domain/analytics/progress.dart' show grouped;
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/characters_providers.dart';
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import 'widgets/bars.dart';

/// A title as a file name: letters and digits, the rest as dashes, as the original names its downloads.
String fileSlug(String title) {
  final s = title.replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), '-').replaceAll(RegExp(r'^-|-$'), '');
  return s.isEmpty ? 'untitled' : s;
}

/// CHARTS
/// Counts and distributions of what the author records: words per chapter and scene, how long chapters are, character
/// appearances, plot-thread presence, events over story time, points of view and the author's own categories. One set
/// of filters scopes every chart. Each chart says what it uses, says what it leaves out, and is a table and a file as
/// well. Nothing is judged: no quality, impact or genre.
class ChartsPage extends ConsumerStatefulWidget {
  const ChartsPage({super.key});

  @override
  ConsumerState<ChartsPage> createState() => _ChartsPageState();
}

class _ChartsPageState extends ConsumerState<ChartsPage> {
  bool _list = false;
  JsonMap _layout = {};
  final _yearFrom = TextEditingController();
  final _yearTo = TextEditingController();

  @override
  void dispose() {
    _yearFrom.dispose();
    _yearTo.dispose();
    super.dispose();
  }

  void _set(JsonMap changes) => setState(() {
    final next = {..._layout};
    for (final MapEntry(:key, :value) in changes.entries) {
      if (value == null || value == '') {
        next.remove(key);
      } else {
        next[key] = value;
      }
    }
    _layout = next;
  });

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    Widget frame(Widget child) => VizFrame(
      view: 'charts',
      title: 'Charts',
      filters: false,
      config: () => {'mode': _list ? 'list' : 'visual', 'layout': _layout},
      onApply: (JsonMap c) => setState(() {
        _list = c['mode'] == 'list';
        _layout = {...?mapOrNull(c['layout'])};
        _yearFrom.text = str(_layout['cyfrom']);
        _yearTo.text = str(_layout['cyto']);
      }),
      child: child,
    );
    if (cast == null) return frame(const SizedBox.shrink());
    final model = cast.model;
    final theme = Theme.of(context);
    final filter = ChartFilter.of(_layout, model);
    final charts = analyticsCharts(model, filter);
    final chapters = model.order.chapters;
    final characters = stableSorted(
      model.entries.values.where((e) => e.category == 'character'),
      (a, b) => localeCompare(a.name, b.name),
    );
    final threads = stableSorted(model.threads.values, (a, b) => localeCompare(a.title, b.title));
    final labels = stableSorted(
      {
        for (final p in model.plans.values)
          for (final l in p.labels) l.toLowerCase(): l,
      }.values,
      localeCompare,
    );

    final compact = MediaQuery.sizeOf(context).width < 600;
    Widget menu(String label, String? value, String none, List<(String, String)> options, String key) => SizedBox(
      width: compact ? double.infinity : 240,
      child: DropdownButtonFormField<String>(
        key: ValueKey('$key:$value'),
        initialValue: value ?? '',
        isExpanded: true,
        decoration: InputDecoration(labelText: label, isDense: true),
        items: [
          DropdownMenuItem(value: '', child: Text(none)),
          for (final (id, words) in options)
            DropdownMenuItem(
              value: id,
              child: Text(words, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (v) => _set({key: v}),
      ),
    );
    Widget year(String label, TextEditingController controller, String key) => SizedBox(
      width: compact ? double.infinity : 180,
      child: TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(signed: true),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^-?\d*'))],
        decoration: InputDecoration(labelText: label, isDense: true),
        onChanged: (v) => _set({key: v.trim()}),
      ),
    );
    final chapterOptions = [
      for (final (i, c) in chapters.indexed)
        (c.id, '${i + 1}. ${c.title.trim().isEmpty ? 'Untitled chapter' : c.title}'),
    ];

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Charts')),
                ButtonSegment(value: true, label: Text('List')),
              ],
              selected: {_list},
              showSelectedIcon: false,
              onSelectionChanged: (v) => setState(() => _list = v.first),
            ),
          ),
          const SizedBox(height: 12),
          Card.outlined(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Semantics(header: true, child: Text('Which part of the novel', style: theme.textTheme.titleSmall)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      menu('From chapter', filter.from, 'The first', chapterOptions, 'cfrom'),
                      menu('To chapter', filter.to, 'The last', chapterOptions, 'cto'),
                      menu('Plot thread', filter.threadId, 'Any, or none', [
                        for (final t in threads) (t.id, t.title),
                      ], 'cthread'),
                      menu('Point of view', filter.povId, 'Anyone’s, or none recorded', [
                        for (final c in characters) (c.id, c.name),
                      ], 'cpov'),
                      menu(
                        'Scene category',
                        labels.where((l) => l.toLowerCase() == filter.label?.toLowerCase()).firstOrNull,
                        'Any, or none',
                        [for (final l in labels) (l, l)],
                        'clabel',
                      ),
                      year('Story years from', _yearFrom, 'cyfrom'),
                      year('Story years to', _yearTo, 'cyto'),
                    ],
                  ),
                  if (filter.filtered)
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton(
                        onPressed: () {
                          _yearFrom.clear();
                          _yearTo.clear();
                          _set({
                            for (final k in ['cfrom', 'cto', 'cthread', 'cpov', 'clabel', 'cyfrom', 'cyto']) k: null,
                          });
                        },
                        child: const Text('Clear filters'),
                      ),
                    ),
                ],
              ),
            ),
          ),
          for (final chart in charts) ...[
            const SizedBox(height: 16),
            _ChartCard(
              chart: chart,
              list: _list,
              layout: _layout,
              set: _set,
              selectedId: viz.selection?.id,
              model: model,
              file: '${fileSlug(str(cast.snapshot.project['title'])).toLowerCase()}-${chart.key}.csv',
            ),
          ],
        ],
      ),
    );
  }
}

class _ChartCard extends ConsumerWidget {
  const _ChartCard({
    required this.chart,
    required this.list,
    required this.layout,
    required this.set,
    required this.selectedId,
    required this.model,
    required this.file,
  });

  final Chart chart;
  final bool list;
  final JsonMap layout;
  final void Function(JsonMap changes) set;
  final String? selectedId;
  final StoryModel model;
  final String file;

  Future<void> _download(BuildContext context, WidgetRef ref) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    final messenger = ScaffoldMessenger.of(context);
    try {
      // A byte-order mark, so a spreadsheet reads names in any script.
      final said = await ref
          .read(backupFilesProvider)
          .saveCsv(file, '﻿${toCsv(chart.columns, chart.rows)}', origin: origin);
      if (said != null) messenger.showSnackBar(SnackBar(content: Text('$said.')));
    } on Object catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('The data was not saved: $e')));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final small = theme.textTheme.bodySmall;
    String words(int n) => '${grouped(n)} ${n == 1 ? chart.units.$1 : chart.units.$2}';
    final bars = [
      for (final b in chart.bars)
        BarDatum(
          key: b.key,
          short: b.short,
          label: b.label,
          value: b.value,
          detail: b.detail,
          selectable: b.ref != null,
        ),
    ];
    final selectedKey = chart.bars.where((b) => b.ref != null && b.ref!.id == selectedId).firstOrNull?.key;
    void onSelect(BarDatum d) {
      final r = chart.bars.where((b) => b.key == d.key).firstOrNull?.ref;
      if (r != null) ref.read(vizStateProvider.notifier).select(r);
    }

    final table = NumbersTable(label: '${chart.title}, as a table', columns: chart.columns, rows: chart.rows);
    final label = '${chart.title}. ${chart.summary}';
    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 16,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Semantics(header: true, child: Text(chart.title, style: theme.textTheme.titleMedium)),
                if (chart.key == 'words')
                  SizedBox(
                    width: 240,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('grain:${layout['cgrain']}'),
                      initialValue: layout['cgrain'] == 'scenes' ? 'scenes' : 'chapters',
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Bars for', isDense: true),
                      items: const [
                        DropdownMenuItem(value: 'chapters', child: Text('Each chapter')),
                        DropdownMenuItem(value: 'scenes', child: Text('Each chapter and scene')),
                      ],
                      onChanged: (v) => set({'cgrain': v == 'scenes' ? 'scenes' : null}),
                    ),
                  ),
                if (chart.key == 'appearances')
                  SizedBox(
                    width: 280,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('count:${layout['ccount']}'),
                      initialValue: layout['ccount'] == 'page' ? 'page' : 'any',
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Counted from', isDense: true),
                      items: const [
                        DropdownMenuItem(value: 'any', child: Text('Any record of them')),
                        DropdownMenuItem(value: 'page', child: Text('Appearance records: on the page')),
                      ],
                      onChanged: (v) => set({'ccount': v == 'page' ? 'page' : null}),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text.rich(
              TextSpan(
                children: [
                  const TextSpan(
                    text: 'Uses: ',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(text: chart.uses),
                ],
              ),
              style: small,
            ),
            const SizedBox(height: 8),
            if (chart.empty != null)
              EmptyState(icon: Icons.bar_chart, title: 'Nothing to chart yet', message: chart.empty!)
            else if (!list) ...[
              if (chart.shape == 'columns')
                ColumnChart(
                  label: label,
                  bars: bars,
                  words: words,
                  selectedKey: selectedKey,
                  onSelect: onSelect,
                  labelEvery: (bars.length / 16).ceil().clamp(1, 1000),
                )
              else
                BarList(label: label, bars: bars, words: words, selectedKey: selectedKey, onSelect: onSelect),
              const SizedBox(height: 8),
              Text(chart.summary),
              TableFold(child: table),
            ] else ...[
              Text(chart.summary),
              const SizedBox(height: 8),
              table,
            ],
            for (final note in chart.notes)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(note, style: small),
              ),
            if (chart.empty == null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Builder(
                  builder: (context) => TextButton.icon(
                    onPressed: () => _download(context, ref),
                    icon: const Icon(Icons.download_outlined),
                    label: Semantics(
                      label: 'Download the data of “${chart.title}” as a CSV file',
                      excludeSemantics: true,
                      child: const Text('Download the data (CSV)'),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
