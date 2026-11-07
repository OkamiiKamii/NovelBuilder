import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/codex/capabilities.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/timeline/narrative.dart' show nodeLabel;
import '../../shared/domain/timeline/scale.dart' show ticksFor;
import '../../shared/domain/visualize/kinds.dart';
import '../../shared/domain/visualize/summaries.dart' show timelineRows;
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../graph/widgets/graph_canvas.dart' show hexColor;
import '../relationships/relationship_page.dart' show relate;
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';

/// What each drawing is called beside its list.
const _drawn = {
  KindView.timeline: 'Timeline',
  KindView.map: 'Map',
  KindView.rank: 'Ladder',
  KindView.ownership: 'Holders',
};

/// RECORDS BY KIND
/// One kind of record (the author's own kinds, and the built-in ones) as a table, or drawn the ways its category is
/// set up for under Categories & fields. A way it is not set up for says what is missing and shows the table.
class KindsViewPage extends ConsumerStatefulWidget {
  const KindsViewPage({super.key});

  @override
  ConsumerState<KindsViewPage> createState() => _KindsViewPageState();
}

class _KindsViewPageState extends ConsumerState<KindsViewPage> {
  bool _list = false;
  String? _kind;

  /// The way it is shown: null for the table.
  KindView? _show;

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child) => VizFrame(
      view: 'kinds',
      title: 'Records by kind',
      config: () => {
        'mode': _list ? 'list' : 'visual',
        'layout': {'kind': ?_kind, 'kshow': ?_show?.name},
      },
      onApply: (JsonMap c) {
        final layout = mapOrNull(c['layout']) ?? const {};
        setState(() {
          _list = c['mode'] == 'list';
          _kind = strOrNull(layout['kind']);
          _show = KindView.of(layout['kshow']);
        });
      },
      child: child,
    );
    if (cast == null) return frame(const SizedBox.shrink());
    final model = cast.model;
    final theme = Theme.of(context);
    final actions = CharacterActions(context, cast.novelId);
    final kinds = kindsOf(model);
    final key = kindKeyOf(model, _kind);
    final category = key == null ? null : model.categories[key];
    void openSettings() => actions.router.go(
      '/organize/world/kinds${category == null ? '' : '?kind=${Uri.encodeComponent(category.key)}'}',
    );
    if (category == null) {
      return frame(
        EmptyState(
          icon: Icons.category_outlined,
          title: 'No kinds of record yet',
          message: 'Add one under Organize → World → Categories & fields.',
          action: FilledButton(onPressed: openSettings, child: const Text('Open Categories & fields')),
        ),
      );
    }
    final show = _show;
    final ready = readyViews(category);
    final count = kinds.where((k) => k.category.key == category.key).firstOrNull?.count ?? 0;
    final table = kindTable(model, category.key);
    final missing = show == null ? const <String>[] : missingFor(category, show);
    final keepKeys = matchingKeys(model, viz.filter, [EntityType.entry]);
    bool keep(String id) => keepKeys == null || keepKeys.contains('entry:$id');
    final selectedId = viz.selection?.type == EntityType.entry ? viz.selection!.id : null;
    void pick(EntityRef ref) => notifier.select(ref);
    final part = _Part(model: model, category: category, list: _list, pick: pick, selectedId: selectedId, keep: keep);

    Widget body;
    if (count == 0) {
      body = EmptyState(
        icon: Icons.inbox_outlined,
        title: 'No ${category.name.toLowerCase()} yet',
        message: 'Add them under Organize → World.',
        action: OutlinedButton(
          onPressed: () => actions.router.go('/organize/world'),
          child: const Text('Open the world'),
        ),
      );
    } else if (!table.rows.any((r) => keep(r.entry.id))) {
      body = NoResultsState(onClear: () => notifier.setFilter({}));
    } else {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (missing.isNotEmpty) ...[
            Card.outlined(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('${category.name} can’t be shown ${show!.label.toLowerCase()} yet:'),
                    for (final m in missing) Text('• $m'),
                    const SizedBox(height: 4),
                    Text(
                      'Set it up under Categories & fields (${category.name} → Visualizations). Meanwhile, here is the '
                      'table.',
                      style: theme.textTheme.bodySmall,
                    ),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton(onPressed: openSettings, child: const Text('Open Categories & fields')),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          if (show == null || missing.isNotEmpty)
            part.table()
          else
            switch (show) {
              KindView.timeline => part.timeline(),
              KindView.map => part.map(),
              KindView.rank => part.ranks(),
              KindView.ownership => part.holders(),
            },
        ],
      );
    }

    final graphLabel = fieldOf(category, Slot.graphLabel, category.uses['graphLabel']);
    final links = category.uses['graphLinks'] is List ? strings(category.uses['graphLinks']) : null;
    final graphWords = category.raw['graph'] == false
        ? 'left out of the knowledge graph'
        : 'in the knowledge graph'
              '${graphLabel != null ? ', labelled by ${graphLabel.name}' : ''}'
              '${links != null ? ', drawing ${links.isEmpty ? 'none of its link fields' : [for (final f in category.fields)
                            if (links.contains(f.id)) f.name].join(', ')}' : ''}';
    final selectedEntry = selectedId == null ? null : model.entries[selectedId];

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 280,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('kind:${category.key}'),
                  initialValue: category.key,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Kind of record', isDense: true),
                  items: [
                    for (final k in kinds)
                      DropdownMenuItem(
                        value: k.category.key,
                        child: Text('${k.category.name} (${k.count})', overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() => _kind = v),
                ),
              ),
              OutlinedButton.icon(
                onPressed: count == 0 ? null : () => _download(context, table),
                icon: const Icon(Icons.download_outlined),
                label: const Text('Download the table (CSV)'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Semantics(
            container: true,
            label: 'Ways to show it',
            child: Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                for (final v in <KindView?>[null, ...KindView.values])
                  ChoiceChip(
                    label: Text(v == null ? 'Table' : '${v.label}${ready.contains(v) ? '' : ' · not set up'}'),
                    selected: v == show,
                    onSelected: (_) => setState(() => _show = v),
                  ),
              ],
            ),
          ),
          if (show != null && missing.isEmpty) ...[
            const SizedBox(height: 12),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: SegmentedButton<bool>(
                segments: [
                  ButtonSegment(value: false, label: Text(_drawn[show]!)),
                  const ButtonSegment(value: true, label: Text('List')),
                ],
                selected: {_list},
                showSelectedIcon: false,
                onSelectionChanged: (v) => setState(() => _list = v.first),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                '${category.name}: ${plural(count, 'record')}. Set up to be shown '
                '${ready.isEmpty ? 'only as a table' : ready.map((v) => v.label.toLowerCase()).join(', ')}; $graphWords.',
                style: theme.textTheme.bodySmall,
              ),
              TextButton(onPressed: openSettings, child: const Text('Change this in Categories & fields')),
            ],
          ),
          const SizedBox(height: 12),
          body,
          if (show == KindView.ownership &&
              missing.isEmpty &&
              selectedEntry != null &&
              selectedEntry.category == category.key) ...[
            const SizedBox(height: 16),
            _HolderEditor(
              key: ValueKey('holder:${selectedEntry.id}'),
              model: model,
              entry: selectedEntry,
              actions: actions,
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _download(BuildContext context, KindTable table) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    final files = ref.read(backupFilesProvider);
    final messenger = ScaffoldMessenger.of(context);
    final slug = table.category.name.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
    final name =
        '${slug.replaceAll(RegExp(r'^-+|-+$'), '').isEmpty ? 'records' : slug.replaceAll(RegExp(r'^-+|-+$'), '')}.csv';
    try {
      final said = await files.saveCsv(name, tableCsv(table), origin: origin);
      if (said != null) messenger.showSnackBar(SnackBar(content: Text('$said.')));
    } on Object catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('The table was not saved: $e')));
    }
  }
}

/// The parts of the view, for one kind of record.
class _Part {
  _Part({
    required this.model,
    required this.category,
    required this.list,
    required this.pick,
    required this.selectedId,
    required this.keep,
  });

  final StoryModel model;
  final Category category;
  final bool list;
  final void Function(EntityRef ref) pick;
  final String? selectedId;
  final bool Function(String id) keep;

  Widget name(Entry e) => _Name(entry: e, selected: selectedId == e.id, pick: pick);

  Widget notDrawn(List<Unplaced> items, String what) => _NotDrawn(items: items, what: what);

  /// Every record and its fields, each value as a reader sees it.
  Widget table() {
    final t = kindTable(model, category.key);
    String short(String s) => s.length > 120 ? '${s.substring(0, 119)}…' : s;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowHeight: 40,
        dataRowMinHeight: 40,
        dataRowMaxHeight: 72,
        columns: [
          const DataColumn(label: Text('Name')),
          for (final c in t.columns) DataColumn(label: Text(c.name)),
        ],
        rows: [
          for (final r in t.rows)
            if (keep(r.entry.id))
              DataRow(
                selected: selectedId == r.entry.id,
                cells: [
                  DataCell(name(r.entry)),
                  for (final cell in r.cells)
                    DataCell(
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 260),
                        child: Text(short(cell), maxLines: 3, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                ],
              ),
        ],
      ),
    );
  }

  /// On the story's timeline: one row a record, a dot for a moment, a bar from start to end.
  Widget timeline() {
    final t = kindTimeline(model, category.key);
    final placed = [
      for (final p in t.placed)
        if (keep(p.entry.id)) p,
    ];
    final unplaced = [
      for (final u in t.unplaced)
        if (keep(u.entry.id)) u,
    ];
    return Builder(
      builder: (context) {
        final theme = Theme.of(context);
        Widget rowWords(TimedRecord p) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            name(p.entry),
            Text(p.label, style: theme.textTheme.bodySmall),
            if (p.note != null) Text(p.note!, style: theme.textTheme.bodySmall),
          ],
        );
        if (list || placed.isEmpty) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (placed.isEmpty) const Text('None of the records shown has a date that can be placed.'),
              for (final p in placed) Padding(padding: const EdgeInsets.only(bottom: 8), child: rowWords(p)),
              notDrawn(unplaced, 'on the timeline'),
            ],
          );
        }
        final lo = placed.map((p) => p.lo).reduce(math.min);
        final hi = placed.map((p) => p.hi).reduce(math.max);
        final pad = math.max((hi - lo) * 0.04, 60.0 * 24 * 30);
        final window = (from: lo - pad, to: hi + pad);
        final colour = hexColor(category.color);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LayoutBuilder(
              builder: (context, c) {
                final narrow = c.maxWidth < 600;
                final nameW = narrow ? 0.0 : 220.0;
                final trackW = math.max(160.0, c.maxWidth - nameW - 8);
                double x(double t) => (t - window.from) / (window.to - window.from) * trackW;
                final ticks = ticksFor(window, trackW, model.calendar);
                Widget track(TimedRecord p) => SizedBox(
                  width: trackW,
                  height: 24,
                  child: CustomPaint(
                    painter: _TrackPainter(
                      ticks.map((t) => x(t.t)).toList(),
                      x(p.lo),
                      p.end == null ? null : x(p.hi),
                      colour,
                      theme.colorScheme.outlineVariant,
                    ),
                  ),
                );
                return Semantics(
                  container: true,
                  label: '${category.name} on the story’s timeline, in story order',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ExcludeSemantics(
                        child: Padding(
                          padding: EdgeInsetsDirectional.only(start: nameW + 8),
                          child: SizedBox(
                            height: 20,
                            child: Stack(
                              clipBehavior: Clip.hardEdge,
                              children: [
                                // A label that would run off the end is left out; its grid line stays.
                                for (final t in ticks)
                                  if (x(t.t) < trackW - 70)
                                    Positioned(
                                      left: x(t.t),
                                      child: Text(t.label, style: theme.textTheme.labelSmall),
                                    ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      for (final p in placed)
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          decoration: selectedId == p.entry.id
                              ? BoxDecoration(
                                  border: Border(left: BorderSide(color: theme.colorScheme.primary, width: 4)),
                                )
                              : null,
                          child: narrow
                              ? Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    rowWords(p),
                                    ExcludeSemantics(child: track(p)),
                                  ],
                                )
                              : Row(
                                  crossAxisAlignment: CrossAxisAlignment.center,
                                  children: [
                                    SizedBox(width: nameW, child: rowWords(p)),
                                    const SizedBox(width: 8),
                                    ExcludeSemantics(child: track(p)),
                                  ],
                                ),
                        ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
            ExcludeSemantics(
              child: Wrap(
                spacing: 16,
                children: [
                  if (placed.any((p) => p.end == null))
                    _LegendItem(Icon(Icons.circle, size: 12, color: colour), 'A moment: one date'),
                  if (placed.any((p) => p.end != null))
                    _LegendItem(
                      Container(width: 22, height: 6, color: colour),
                      'A stretch of time: from one date to another',
                    ),
                ],
              ),
            ),
            notDrawn(unplaced, 'on the timeline'),
          ],
        );
      },
    );
  }

  /// On a plane, by the two Number fields set as across and up; up is up.
  Widget map() {
    final m = kindMap(model, category.key);
    final points = [
      for (final p in m.points)
        if (keep(p.entry.id)) p,
    ];
    final unplaced = [
      for (final u in m.unplaced)
        if (keep(u.entry.id)) u,
    ];
    return Builder(
      builder: (context) {
        final theme = Theme.of(context);
        if (list || points.isEmpty) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (points.isEmpty) const Text('None of the records shown has both numbers.'),
              if (points.isNotEmpty)
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: [
                      const DataColumn(label: Text('Name')),
                      DataColumn(label: Text('${m.axes.x} (across)'), numeric: true),
                      DataColumn(label: Text('${m.axes.y} (up)'), numeric: true),
                    ],
                    rows: [
                      for (final p in points)
                        DataRow(
                          selected: selectedId == p.entry.id,
                          cells: [DataCell(name(p.entry)), DataCell(Text('${p.x}')), DataCell(Text('${p.y}'))],
                        ),
                    ],
                  ),
                ),
              notDrawn(unplaced, 'on the map'),
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _KindMap(
              points: points,
              axes: m.axes,
              color: hexColor(category.color),
              selectedId: selectedId,
              onSelect: (id) => pick(EntityRef(EntityType.entry, id)),
              what: points.length == 1 ? category.singular.toLowerCase() : category.name.toLowerCase(),
            ),
            const SizedBox(height: 8),
            Text(
              'Across: ${m.axes.x}. Up: ${m.axes.y}. One step across is the same length as one step up.',
              style: theme.textTheme.bodySmall,
            ),
            notDrawn(unplaced, 'on the map'),
          ],
        );
      },
    );
  }

  /// On a ladder of ranks, highest at the top.
  Widget ranks() {
    final r = kindRanks(model, category.key);
    final levels = [
      for (final l in r.levels)
        (
          label: l.label,
          entries: [
            for (final e in l.entries)
              if (keep(e.id)) e,
          ],
        ),
    ];
    final unplaced = [
      for (final u in r.unplaced)
        if (keep(u.entry.id)) u,
    ];
    final most = math.max(1, levels.fold(0, (n, l) => math.max(n, l.entries.length)));
    return Builder(
      builder: (context) {
        final theme = Theme.of(context);
        final colour = hexColor(category.color);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              container: true,
              label: '${category.name} by ${r.field}, highest first',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final l in levels)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              SizedBox(width: 120, child: Text(l.label, style: theme.textTheme.titleSmall)),
                              if (!list) ...[
                                Expanded(
                                  child: ExcludeSemantics(
                                    child: LinearProgressIndicator(
                                      value: l.entries.length / most,
                                      minHeight: 10,
                                      color: colour,
                                      backgroundColor: theme.colorScheme.surfaceContainerHighest,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              Text('${l.entries.length}', style: theme.textTheme.bodySmall),
                            ],
                          ),
                          Wrap(
                            spacing: 4,
                            children: [
                              if (l.entries.isEmpty) Text('none', style: theme.textTheme.bodySmall),
                              for (final e in l.entries) name(e),
                            ],
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            notDrawn(unplaced, 'ranked'),
          ],
        );
      },
    );
  }

  /// Who holds each record over the story: each holding in the order it began, then who the current-holder field
  /// names.
  Widget holders() {
    final held = kindHolders(model, category.key);
    final records = [
      for (final r in held.records)
        if (keep(r.entry.id)) r,
    ];
    return Builder(
      builder: (context) {
        final theme = Theme.of(context);
        return Semantics(
          container: true,
          label: '${category.name} and who holds them (${held.typeLabel})',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final r in records)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  shape: selectedId == r.entry.id
                      ? RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(color: theme.colorScheme.primary, width: 2),
                        )
                      : null,
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Align(alignment: AlignmentDirectional.centerStart, child: name(r.entry)),
                        if (list)
                          Text(
                            '${r.history.isEmpty ? 'no holding recorded' : r.history.map((h) => '${h.holderName} (${h.when})').join(', then ')}'
                            '${r.current != null ? '. ${held.field}: ${r.current!.name}' : ''}.',
                          )
                        else
                          Wrap(
                            spacing: 4,
                            runSpacing: 4,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              if (r.history.isEmpty) Text('No holding recorded', style: theme.textTheme.bodySmall),
                              for (final (i, h) in r.history.indexed) ...[
                                if (i > 0) const Icon(Icons.arrow_forward, size: 16),
                                ActionChip(label: Text('${h.holderName} · ${h.when}'), onPressed: () => pick(h.holder)),
                              ],
                              if (r.current != null)
                                ActionChip(
                                  avatar: const Icon(Icons.bookmark_outline, size: 16),
                                  label: Text('${held.field}: ${r.current!.name}'),
                                  onPressed: () => pick(EntityRef(EntityType.entry, r.current!.id)),
                                ),
                            ],
                          ),
                        if (r.note != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              r.note!,
                              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              Text('Select a record to record who holds it, beside the view.', style: theme.textTheme.bodySmall),
            ],
          ),
        );
      },
    );
  }
}

class _Name extends StatelessWidget {
  const _Name({required this.entry, required this.selected, required this.pick});
  final Entry entry;
  final bool selected;
  final void Function(EntityRef ref) pick;

  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    child: TextButton(
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        // A full-size target for a finger, however small the name.
        minimumSize: const Size(48, 48),
        alignment: AlignmentDirectional.centerStart,
      ),
      onPressed: () => pick(EntityRef(EntityType.entry, entry.id)),
      child: Text(entry.name.isEmpty ? 'Untitled' : entry.name),
    ),
  );
}

/// The records a view could not draw, each with the reason.
class _NotDrawn extends StatelessWidget {
  const _NotDrawn({required this.items, required this.what});
  final List<Unplaced> items;
  final String what;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Semantics(
        container: true,
        label: 'Not $what',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Not $what (${items.length})', style: theme.textTheme.titleSmall),
            for (final u in items)
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: u.entry.name,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(text: ': ${u.reason}'),
                  ],
                ),
                style: theme.textTheme.bodySmall,
              ),
          ],
        ),
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  const _LegendItem(this.swatch, this.label);
  final Widget swatch;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      swatch,
      const SizedBox(width: 6),
      Text(label, style: Theme.of(context).textTheme.bodySmall),
    ],
  );
}

class _TrackPainter extends CustomPainter {
  _TrackPainter(this.ticks, this.start, this.end, this.colour, this.grid);
  final List<double> ticks;
  final double start;
  final double? end;
  final Color colour;
  final Color grid;

  @override
  void paint(Canvas canvas, Size size) {
    final g = Paint()..color = grid;
    for (final t in ticks) {
      canvas.drawLine(Offset(t, 0), Offset(t, size.height), g);
    }
    final y = size.height / 2;
    if (end == null) {
      canvas.drawCircle(Offset(start, y), 6, Paint()..color = colour);
    } else {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTRB(start, y - 4, math.max(end!, start + 4), y + 4),
          const Radius.circular(4),
        ),
        Paint()..color = colour,
      );
    }
  }

  @override
  bool shouldRepaint(_TrackPainter old) => true;
}

/// The map drawn: one scale for both directions, so distances keep their proportions; up is up. Pinch or scroll to
/// zoom, drag to pan. One keyboard stop: the arrow keys move to the nearest point that way, Enter selects.
class _KindMap extends StatefulWidget {
  const _KindMap({
    required this.points,
    required this.axes,
    required this.color,
    required this.selectedId,
    required this.onSelect,
    required this.what,
  });

  final List<MapPoint> points;
  final ({String x, String y}) axes;
  final Color color;
  final String? selectedId;
  final ValueChanged<String> onSelect;
  final String what;

  @override
  State<_KindMap> createState() => _KindMapState();
}

class _KindMapState extends State<_KindMap> {
  final _controller = TransformationController();
  final _focus = FocusNode(debugLabel: 'Kind map');
  String? _current;
  bool _focused = false;
  String? _fittedFor;

  /// Scales the map down (never up) so all of it shows, centred in the box.
  void _fit(Size box, Size drawing) {
    final scale = math.min(1.0, math.min(box.width / drawing.width, box.height / drawing.height)).clamp(0.2, 1.0);
    _controller.value = Matrix4.diagonal3Values(scale, scale, 1)
      ..setTranslationRaw((box.width - drawing.width * scale) / 2, (box.height - drawing.height * scale) / 2, 0);
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final points = widget.points;
    final xs = points.map((p) => p.x.toDouble());
    final ys = points.map((p) => p.y.toDouble());
    final minX = xs.reduce(math.min), maxX = xs.reduce(math.max);
    final minY = ys.reduce(math.min), maxY = ys.reduce(math.max);
    // About 600 units across the larger spread.
    final scale = 600 / math.max(math.max(maxX - minX, maxY - minY), 1e-9);
    const left = 70.0, top = 40.0;
    double sx(num x) => left + (x - minX) * scale;
    double sy(num y) => top + (maxY - y) * scale;
    final size = Size(sx(maxX) + 160, sy(minY) + 60);
    final marks = {for (final p in points) p.entry.id: Offset(sx(p.x), sy(p.y))};
    final current = marks.containsKey(_current) ? _current! : points.first.entry.id;
    MapPoint pointOf(String id) => points.firstWhere((p) => p.entry.id == id);
    String words(MapPoint p) => '${p.entry.name}: ${widget.axes.x} ${p.x}, ${widget.axes.y} ${p.y}';

    KeyEventResult key(KeyEvent e) {
      if (e is! KeyDownEvent && e is! KeyRepeatEvent) return KeyEventResult.ignored;
      if (e.logicalKey == LogicalKeyboardKey.enter || e.logicalKey == LogicalKeyboardKey.space) {
        widget.onSelect(current);
        return KeyEventResult.handled;
      }
      final dir = switch (e.logicalKey) {
        LogicalKeyboardKey.arrowRight => const Offset(1, 0),
        LogicalKeyboardKey.arrowLeft => const Offset(-1, 0),
        LogicalKeyboardKey.arrowUp => const Offset(0, -1),
        LogicalKeyboardKey.arrowDown => const Offset(0, 1),
        _ => null,
      };
      if (dir == null) return KeyEventResult.ignored;
      final from = marks[current]!;
      // The nearest point that way: ahead along the arrow more than to the side.
      String? best;
      var bestD = double.infinity;
      for (final MapEntry(key: id, value: at) in marks.entries) {
        if (id == current) continue;
        final d = at - from;
        final along = d.dx * dir.dx + d.dy * dir.dy;
        final side = (d.dx * dir.dy - d.dy * dir.dx).abs();
        if (along <= 0 || side > along) continue;
        if (d.distance < bestD) {
          bestD = d.distance;
          best = id;
        }
      }
      if (best != null) setState(() => _current = best);
      return KeyEventResult.handled;
    }

    return SizedBox(
      height: 460,
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
              final fitKey = '${points.length}|${size.width.round()}x${size.height.round()}|${box.width.round()}';
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
                      onKeyEvent: (_, e) => key(e),
                      child: Semantics(
                        label:
                            'Map of ${points.length} ${widget.what}: ${widget.axes.x} across, ${widget.axes.y} up. Arrow keys '
                            'move between them, Enter selects.',
                        value: words(pointOf(current)),
                        child: InteractiveViewer(
                          transformationController: _controller,
                          constrained: false,
                          boundaryMargin: const EdgeInsets.all(400),
                          minScale: 0.2,
                          maxScale: 6,
                          child: GestureDetector(
                            onTapUp: (d) {
                              _focus.requestFocus();
                              for (final MapEntry(key: id, value: at) in marks.entries) {
                                if ((at - d.localPosition).distance <= 12) {
                                  setState(() => _current = id);
                                  return widget.onSelect(id);
                                }
                              }
                            },
                            child: CustomPaint(
                              size: size,
                              painter: _MapPainter(
                                points: points,
                                marks: marks,
                                gridX: [for (final t in niceTicks(minX, maxX)) (sx(t), '$t')],
                                gridY: [for (final t in niceTicks(minY, maxY)) (sy(t), '$t')],
                                bottom: sy(minY),
                                right: sx(maxX),
                                color: widget.color,
                                selectedId: widget.selectedId,
                                focusId: _focused ? current : null,
                                scheme: theme.colorScheme,
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
    );
  }
}

class _MapPainter extends CustomPainter {
  _MapPainter({
    required this.points,
    required this.marks,
    required this.gridX,
    required this.gridY,
    required this.bottom,
    required this.right,
    required this.color,
    required this.selectedId,
    required this.focusId,
    required this.scheme,
  });

  final List<MapPoint> points;
  final Map<String, Offset> marks;
  final List<(double, String)> gridX;
  final List<(double, String)> gridY;
  final double bottom;
  final double right;
  final Color color;
  final String? selectedId;
  final String? focusId;
  final ColorScheme scheme;

  void _text(Canvas c, String s, Offset at, {bool right = false, bool centre = false, bool bold = false}) {
    final p = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(fontSize: 11, color: scheme.onSurface, fontWeight: bold ? FontWeight.w600 : null),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: 160);
    p.paint(c, at - Offset(right ? p.width : (centre ? p.width / 2 : 0), p.height / 2));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()..color = scheme.outlineVariant;
    for (final (x, label) in gridX) {
      canvas.drawLine(Offset(x, 20), Offset(x, bottom + 20), grid);
      _text(canvas, label, Offset(x, bottom + 34), centre: true);
    }
    for (final (y, label) in gridY) {
      canvas.drawLine(Offset(50, y), Offset(right + 20, y), grid);
      _text(canvas, label, Offset(44, y), right: true);
    }
    for (final p in points) {
      final at = marks[p.entry.id]!;
      final selected = p.entry.id == selectedId;
      canvas.drawCircle(at, 7, Paint()..color = color);
      if (selected) {
        canvas.drawCircle(
          at,
          11,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3
            ..color = scheme.primary,
        );
      }
      if (p.entry.id == focusId) {
        canvas.drawCircle(
          at,
          15,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = scheme.tertiary,
        );
      }
      final label = p.entry.name.length > 24 ? '${p.entry.name.substring(0, 23)}…' : p.entry.name;
      _text(canvas, label, at + const Offset(12, 0), bold: selected);
    }
  }

  @override
  bool shouldRepaint(_MapPainter old) => true;
}

/// Recording who holds a record, beside the view: a first holder, a new holder from a point in the story (the holding
/// before it ends there and is kept, as history), or that nobody holds it from then on.
class _HolderEditor extends StatefulWidget {
  const _HolderEditor({super.key, required this.model, required this.entry, required this.actions});
  final StoryModel model;
  final Entry entry;
  final CharacterActions actions;

  @override
  State<_HolderEditor> createState() => _HolderEditorState();
}

class _HolderEditorState extends State<_HolderEditor> {
  String _holder = '';
  String _when = '';

  JsonMap? _anchor() {
    if (_when.startsWith('n:')) return {'kind': 'node', 'nodeId': _when.substring(2)};
    if (_when.startsWith('e:')) return {'kind': 'event', 'eventId': _when.substring(2)};
    return null;
  }

  String? _record(List<Holding> open) {
    final model = widget.model;
    final entry = widget.entry;
    final category = model.categories[entry.category]!;
    final type = str(mapOrNull(category.uses['ownership'])?['type']);
    final at = _anchor();
    if (_holder == 'nobody') {
      if (open.isEmpty) throw StateError('Nobody is recorded as holding ${entry.name} now.');
      if (at == null) throw StateError('Choose when it stops being held.');
      final ok = relate(widget.actions, (r) {
        for (final h in open) {
          r.endConnection(h.connection.source.id, at);
        }
        return true;
      });
      return ok == null ? null : 'Recorded: nobody holds ${entry.name} from then on.';
    }
    final name = model.entries[_holder]?.name ?? 'They';
    if (open.length == 1) {
      if (at == null) throw StateError('Choose when it passes to them: ${open.first.holderName} holds it until then.');
      final ok = relate(
        widget.actions,
        (r) => r.changeConnection(open.first.connection.source.id, at, fromId: _holder),
      );
      return ok == null ? null : 'Recorded: $name holds ${entry.name} from then on.';
    }
    final ok = relate(widget.actions, (r) {
      final link = r.createConnection(
        from: EntityRef(EntityType.entry, _holder),
        to: EntityRef(EntityType.entry, entry.id),
        type: type,
      );
      if (at != null) r.startConnectionAt(link.id, at);
      return link;
    });
    return ok == null ? null : 'Recorded: $name holds ${entry.name}${at != null ? ' from then on' : ''}.';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final model = widget.model;
    final entry = widget.entry;
    final category = model.categories[entry.category];
    if (category == null || missingFor(category, KindView.ownership).isNotEmpty) return const SizedBox.shrink();
    final open = [
      for (final h in kindHolders(
        model,
        category.key,
      ).records.where((r) => r.entry.id == entry.id).expand((r) => r.history))
        if (h.connection.validity?.until == null) h,
    ];
    final chapters = stableSorted(
      model.nodes.values.where((n) => model.order.position.containsKey(n.id)),
      (a, b) => model.order.position[a.id]!.compareTo(model.order.position[b.id]!),
    );
    final events = timelineRows(model);
    final others = stableSorted(
      model.entries.values.where((e) => e.id != entry.id),
      (a, b) => localeCompare(a.name, b.name),
    );
    return Semantics(
      container: true,
      label: 'Record who holds ${entry.name}',
      child: Card.outlined(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Record who holds ${entry.name}', style: theme.textTheme.titleMedium),
              Text(
                open.isNotEmpty
                    ? 'Held now by ${open.map((h) => h.holderName).join(' and ')}. A new holder takes over from the point '
                          'you choose; the earlier holding is kept as history.'
                    : 'Nobody is recorded as holding it now.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SizedBox(
                    width: 260,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('holder:$_holder'),
                      initialValue: _holder,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Holder'),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('Choose…')),
                        if (open.isNotEmpty)
                          const DropdownMenuItem(value: 'nobody', child: Text('Nobody: it stops being held')),
                        for (final e in others)
                          DropdownMenuItem(
                            value: e.id,
                            child: Text(e.name, overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) => setState(() => _holder = v ?? ''),
                    ),
                  ),
                  SizedBox(
                    width: 260,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('when:$_when'),
                      initialValue: _when,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'From'),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('The start of the story')),
                        for (final n in chapters)
                          DropdownMenuItem(
                            value: 'n:${n.id}',
                            child: Text(nodeLabel(model, n.id), overflow: TextOverflow.ellipsis),
                          ),
                        for (final ev in events)
                          DropdownMenuItem(
                            value: 'e:${ev.id}',
                            child: Text('Event: ${ev.title}', overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) => setState(() => _when = v ?? ''),
                    ),
                  ),
                  FilledButton.tonal(
                    onPressed: _holder.isEmpty
                        ? null
                        : () {
                            try {
                              final said = _record(open);
                              if (said == null) return;
                              setState(() {
                                _holder = '';
                                _when = '';
                              });
                              widget.actions.tell(said);
                            } on StateError catch (e) {
                              widget.actions.tell(e.message);
                            }
                          },
                    child: const Text('Record it'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
