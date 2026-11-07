import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/graph/knowledge.dart';
import '../../shared/domain/integrity/rules.dart' show ConnectionStatus;
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/story_model.dart';
import '../characters/characters_providers.dart';
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import '../visualize/widgets/canon_badge.dart';
import 'widgets/graph_canvas.dart';

/// Where each connection is kept, in words.
const _sourceWords = {
  'loreLinks': 'a connection you recorded',
  'characterRelations': 'a character relationship',
  'loreEntries': 'a field of the entry',
  'chapters': 'the manuscript',
  'chapterPlans': 'a chapter’s plan',
  'timelineEvents': 'a timeline event',
  'plotThreads': 'a plot thread',
  'systemSheets': 'a system sheet',
  'systems': 'a system blueprint',
};

String keptIn(GraphEdge e) => _sourceWords[e.connection.source.collection] ?? e.connection.source.collection;

String _statusWords(String key) => ConnectionStatus.values.where((s) => s.name == key).firstOrNull?.label ?? key;

/// The view's own settings, as the original keeps them in a saved view (each a string).
class GraphSettings {
  const GraphSettings({
    this.hiddenNodes = const {},
    this.hiddenEdges = const {},
    this.hiddenStatuses = const {},
    this.focus,
    this.depth = 1,
    this.isolated = false,
    this.collapsed = const {},
    this.fold = false,
    this.limit = drawLimit,
    this.path,
  });

  final Set<String> hiddenNodes;
  final Set<String> hiddenEdges;
  final Set<String> hiddenStatuses;
  final String? focus;
  final int depth;
  final bool isolated;
  final Set<String> collapsed;
  final bool fold;

  /// How many records to draw at most; infinity for all.
  final num limit;

  /// The record to show the path to, from the selection. Not kept in a saved view.
  final String? path;

  static Set<String> _list(Object? v) => {
    for (final s in str(v).split(','))
      if (s.isNotEmpty) s,
  };

  factory GraphSettings.of(JsonMap layout) {
    final limit = str(layout['glimit']);
    return GraphSettings(
      hiddenNodes: _list(layout['ghide']),
      hiddenEdges: _list(layout['gedges']),
      hiddenStatuses: _list(layout['gstatus']),
      focus: strOrNull(layout['gfocus']),
      depth: layout['gdepth'] == '2' ? 2 : 1,
      isolated: layout['gall'] == '1',
      collapsed: _list(layout['gcollapse']),
      fold: layout['gfold'] == '1',
      limit: limit == 'all' ? double.infinity : ((num.tryParse(limit) ?? 0) > drawLimit ? num.parse(limit) : drawLimit),
    );
  }

  JsonMap toLayout() => {
    if (hiddenNodes.isNotEmpty) 'ghide': hiddenNodes.join(','),
    if (hiddenEdges.isNotEmpty) 'gedges': hiddenEdges.join(','),
    if (hiddenStatuses.isNotEmpty) 'gstatus': hiddenStatuses.join(','),
    'gfocus': ?focus,
    if (depth == 2) 'gdepth': '2',
    if (isolated) 'gall': '1',
    if (collapsed.isNotEmpty) 'gcollapse': collapsed.join(','),
    if (fold) 'gfold': '1',
    if (limit != drawLimit) 'glimit': limit.isInfinite ? 'all' : '${limit.toInt()}',
  };

  GraphSettings copyWith({
    Set<String>? hiddenNodes,
    Set<String>? hiddenEdges,
    Set<String>? hiddenStatuses,
    String? Function()? focus,
    int? depth,
    bool? isolated,
    Set<String>? collapsed,
    bool? fold,
    num? limit,
    String? Function()? path,
  }) => GraphSettings(
    hiddenNodes: hiddenNodes ?? this.hiddenNodes,
    hiddenEdges: hiddenEdges ?? this.hiddenEdges,
    hiddenStatuses: hiddenStatuses ?? this.hiddenStatuses,
    focus: focus == null ? this.focus : focus(),
    depth: depth ?? this.depth,
    isolated: isolated ?? this.isolated,
    collapsed: collapsed ?? this.collapsed,
    fold: fold ?? this.fold,
    limit: limit ?? this.limit,
    path: path == null ? this.path : path(),
  );
}

/// THE KNOWLEDGE GRAPH
/// Every record and every connection the novel holds, drawn or listed. The graph is read from the records each time:
/// there are no graph-only records. Against clutter: layers, focus, search, folding records together, and a limit on
/// how many are drawn at once; whenever any of these leaves part of the story out, the view says so, with a way back.
class GraphPage extends ConsumerStatefulWidget {
  const GraphPage({super.key});

  @override
  ConsumerState<GraphPage> createState() => _GraphPageState();
}

class _GraphPageState extends ConsumerState<GraphPage> {
  bool _list = false;
  var _s = const GraphSettings();
  String? _pairKey;

  // The whole graph, read again only when the records change.
  StoryModel? _model;
  KnowledgeGraph? _full;

  KnowledgeGraph _graphOf(StoryModel model) {
    if (!identical(model, _model)) {
      _model = model;
      _full = knowledgeGraph(model);
    }
    return _full!;
  }

  void _set(GraphSettings s) => setState(() {
    _s = s;
    _pairKey = null;
  });

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child) => VizFrame(
      view: 'graph',
      title: 'Knowledge graph',
      config: () => {'mode': _list ? 'list' : 'visual', 'layout': _s.toLayout()},
      onApply: (JsonMap c) => setState(() {
        _list = c['mode'] == 'list';
        _s = GraphSettings.of(mapOrNull(c['layout']) ?? const {});
        _pairKey = null;
      }),
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.account_tree_outlined), label: Text('Graph')),
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
    final full = _graphOf(model);
    if (full.nodes.isEmpty) {
      return frame(
        const EmptyState(
          icon: Icons.account_tree_outlined,
          title: 'Nothing recorded yet',
          message:
              'Characters, places, events, chapters, plot threads and every connection between them show up here as '
              'you add them.',
        ),
      );
    }
    final s = _s;
    final byKey = {for (final n in full.nodes) n.key: n};
    final text = str(viz.filter['text']);
    final asked = strings(viz.filter['characters']).firstOrNull;
    final focusKey = byKey.containsKey(s.focus)
        ? s.focus
        : (asked != null && byKey.containsKey('entry:$asked') ? 'entry:$asked' : null);
    final focus = focusKey == null ? null : (key: focusKey, depth: s.depth);

    // 1. Layers, words and focus.
    GraphQuery query({required bool isolated}) => GraphQuery(
      hiddenNodes: s.hiddenNodes,
      hiddenEdges: s.hiddenEdges,
      hiddenStatuses: s.hiddenStatuses,
      text: text,
      focus: focus,
      isolated: isolated,
    );
    final filtered = queryGraph(full, query(isolated: s.isolated));
    // The same, with records that have no connection shown: the difference is what that leaves out.
    final withIsolated = s.isolated ? filtered.nodes.length : queryGraph(full, query(isolated: true)).nodes.length;

    // 2. Folding: scenes into their chapters, kinds of record into one group each.
    String? folder(String key) {
      final ref = refOf(key);
      final node = ref?.type == EntityType.node ? model.nodes[ref!.id] : null;
      return node?.kindKey == 'scene' && node!.parentId != null && model.nodes[node.parentId]?.kindKey == 'chapter'
          ? 'node:${node.parentId}'
          : null;
    }

    final collapsed = collapseGraph(
      filtered,
      types: s.collapsed,
      fold: s.fold ? folder : null,
      groupLabel: (type, count) => '$count ${nodeTypeLabel(type, model).toLowerCase()}',
    );
    final selection = viz.selection;
    final selected = selection == null ? null : byKey[keyOf(selection)];
    final pathTo = byKey.containsKey(s.path) ? s.path : null;
    final path = selected != null && pathTo != null ? pathBetween(filtered.edges, selected.key, pathTo) : null;
    final hiddenPath = selected != null && pathTo != null && path == null
        ? pathBetween(full.edges, selected.key, pathTo)
        : null;
    String mapped(String key) => collapsed.into[key] ?? key;

    // 3. The limit, always keeping the selection, the focus and a path in.
    final keep = {
      if (selected != null) mapped(selected.key),
      if (focusKey != null) mapped(focusKey),
      for (final e in path ?? const <GraphEdge>[]) ...[mapped(e.from), mapped(e.to)],
    };
    final limited = limitGraph(collapsed.graph, s.limit, keep);
    final drawn = limited.graph;
    final counts = typeCounts(full);
    // Kinds of record that share a shape carry a letter code, worked out from every kind in the novel so a filter
    // never changes it.
    final codes = typeCodes([for (final n in full.nodes) n.type], (t) => nodeTypeLabel(t, model));
    final drawnByKey = {for (final n in drawn.nodes) n.key: n};
    String labelOf(String key) => byKey[key]?.label ?? drawnByKey[key]?.label ?? 'Something deleted';
    String typeName(String t) => nodeTypeLabel(t, model);
    final pairs = pairsOf(drawn.edges);
    final pair = pairs.where((p) => p.key == _pairKey).firstOrNull;
    String pairWords(Pair p) => p.edges.map((e) => edgeWords(e, labelOf)).join('; ');

    void toggleFold(String type) {
      final next = {...s.collapsed};
      if (!next.remove(type)) next.add(type);
      _set(s.copyWith(collapsed: next));
    }

    void select(GraphNode node) {
      setState(() => _pairKey = null);
      if (node.isGroup) return toggleFold(node.type);
      notifier.select(node.ref);
    }

    void focusOn(GraphNode node) {
      if (node.ref != null) _set(s.copyWith(focus: () => node.key));
    }

    void onPath(GraphNode node) {
      if (selected != null && node.key != selected.key && !node.isGroup) {
        _set(s.copyWith(path: () => node.key));
      } else {
        select(node);
      }
    }

    void dropFocus() {
      _set(s.copyWith(focus: () => null, depth: 1));
      if (asked != null) notifier.setFilter({...viz.filter}..remove('characters'));
    }

    void restore() {
      setState(() {
        _s = const GraphSettings();
        _pairKey = null;
      });
      notifier.setFilter({});
    }

    final records = drawn.nodes.fold(0, (n, x) => n + (x.isGroup ? x.members!.length : 1));
    final groupCount = drawn.nodes.where((n) => n.isGroup).length;
    final status =
        'Showing ${formatNumber(records)} of ${formatNumber(full.nodes.length)} records and '
        '${formatNumber(drawn.edges.length)} of ${formatNumber(full.edges.length)} connections'
        '${focusKey != null ? ', around ${labelOf(focusKey)}' : ''}'
        '${groupCount > 0 ? ', $groupCount ${groupCount == 1 ? 'group' : 'groups'} folded together' : ''}.'
        '${full.dangling > 0 ? ' ${full.dangling} ${full.dangling == 1 ? 'connection points' : 'connections point'} at something deleted, and ${full.dangling == 1 ? 'is' : 'are'} left out.' : ''}';
    final unconnected = withIsolated - filtered.nodes.length;
    String names(Set<String> types, String Function(String t) label) => types.map(label).join(', ');

    // Everything that leaves part of the story out, each with its way back.
    final partial = <({String key, String text, List<(String, VoidCallback)> undo})>[
      if (limited.cut > 0)
        (
          key: 'limit',
          text:
              'Only the ${formatNumber(drawn.nodes.length)} most connected of ${formatNumber(limited.total)} records '
              'and groups are drawn, so the graph stays readable and quick; ${formatNumber(limited.cut)} more are left out.',
          undo: [
            (
              'Draw ${formatNumber(limited.cut < drawStep ? limited.cut : drawStep)} more',
              () => _set(s.copyWith(limit: drawn.nodes.length + drawStep)),
            ),
            ('Draw all ${formatNumber(limited.total)} (may be slow)', () => _set(s.copyWith(limit: double.infinity))),
          ],
        ),
      if (s.hiddenNodes.isNotEmpty)
        (
          key: 'nodes',
          text: 'Hidden kinds of record: ${names(s.hiddenNodes, typeName)}.',
          undo: [('Show them', () => _set(s.copyWith(hiddenNodes: {})))],
        ),
      if (full.excluded?.isNotEmpty ?? false)
        (
          key: 'excluded',
          text:
              'Set, under World → Categories & fields, not to appear in the graph: '
              '${full.excluded!.map((x) => '${typeName('entry:${x.category}')} (${x.count})').join(', ')}, '
              '${plural(full.excluded!.fold(0, (n, x) => n + x.count), 'record')} in all.',
          undo: const [],
        ),
      if (full.undrawn?.isNotEmpty ?? false)
        (
          key: 'undrawn',
          text:
              'Link fields set, under World → Categories & fields, not to be drawn: '
              '${full.undrawn!.map((x) => '${typeName('entry:${x.category}')}: ${x.field} (${x.count})').join(', ')}, '
              '${plural(full.undrawn!.fold(0, (n, x) => n + x.count), 'connection')} in all.',
          undo: const [],
        ),
      if (s.hiddenStatuses.isNotEmpty)
        (
          key: 'statuses',
          text: 'Connections hidden by status: ${names(s.hiddenStatuses, _statusWords)}.',
          undo: [('Show them', () => _set(s.copyWith(hiddenStatuses: {})))],
        ),
      if (s.hiddenEdges.isNotEmpty)
        (
          key: 'edges',
          text: 'Hidden kinds of connection: ${names(s.hiddenEdges, edgeTypeLabel)}.',
          undo: [('Show them', () => _set(s.copyWith(hiddenEdges: {})))],
        ),
      if (focusKey != null)
        (
          key: 'focus',
          text: 'Only what is within ${s.depth == 1 ? 'one step' : 'two steps'} of ${labelOf(focusKey)}.',
          undo: [('Drop the focus', dropFocus)],
        ),
      if (text.trim().isNotEmpty)
        (
          key: 'text',
          text: 'Only records named “${text.trim()}”, and what they are connected to.',
          undo: [
            ('Clear the search', () => notifier.setFilter({...viz.filter}..remove('text'))),
          ],
        ),
      if (s.collapsed.isNotEmpty)
        (
          key: 'groups',
          text:
              'Folded together, one node each: ${names(s.collapsed, typeName)}. Connections inside a group are not drawn.',
          undo: [('Open them', () => _set(s.copyWith(collapsed: {})))],
        ),
      if (s.fold)
        (
          key: 'fold',
          text: 'Scenes are folded into their chapters: a scene’s connections are drawn on its chapter.',
          undo: [('Unfold them', () => _set(s.copyWith(fold: false)))],
        ),
      if (!s.isolated && unconnected > 0)
        (
          key: 'isolated',
          text:
              '${formatNumber(unconnected)} ${unconnected == 1 ? 'record has' : 'records have'} no connection shown, '
              'and ${unconnected == 1 ? 'is' : 'are'} not drawn.',
          undo: [('Draw them', () => _set(s.copyWith(isolated: true)))],
        ),
    ];
    final restorable =
        partial.any((p) => p.key != 'limit' && p.key != 'isolated') || s.limit != drawLimit || s.isolated;

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _Check(
                label: 'Show records with no connection shown',
                value: s.isolated,
                onChanged: (v) => _set(s.copyWith(isolated: v)),
              ),
              _Check(
                label: 'Fold scenes into their chapters',
                value: s.fold,
                onChanged: (v) => _set(s.copyWith(fold: v)),
              ),
              if (focusKey != null) ...[
                SizedBox(
                  width: 240,
                  child: DropdownButtonFormField<int>(
                    key: ValueKey('depth:${s.depth}'),
                    initialValue: s.depth,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: 'Around ${labelOf(focusKey)}', isDense: true),
                    items: const [
                      DropdownMenuItem(value: 1, child: Text('One step')),
                      DropdownMenuItem(value: 2, child: Text('Two steps')),
                    ],
                    onChanged: (v) => _set(s.copyWith(depth: v ?? 1)),
                  ),
                ),
                TextButton(onPressed: dropFocus, child: const Text('Show the whole graph')),
              ],
            ],
          ),
          _Layers(counts: counts, settings: s, typeName: typeName, onChanged: _set, onFold: toggleFold),
          const SizedBox(height: 8),
          Semantics(liveRegion: true, child: Text(status)),
          if (partial.isNotEmpty) ...[
            const SizedBox(height: 8),
            Semantics(
              container: true,
              label: 'What this view leaves out',
              child: Card.outlined(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('This is part of the story, not all of it.', style: theme.textTheme.titleSmall),
                      for (final p in partial)
                        Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text('• ${p.text}'),
                            for (final (label, run) in p.undo) TextButton(onPressed: run, child: Text(label)),
                          ],
                        ),
                      if (restorable)
                        Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: OutlinedButton(onPressed: restore, child: const Text('Restore the full view')),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          if (drawn.nodes.isEmpty)
            EmptyState(
              icon: Icons.filter_alt_off_outlined,
              title: 'Nothing shown',
              message: 'Nothing is shown with these layers and filters.',
              action: OutlinedButton(onPressed: restore, child: const Text('Restore the full view')),
            )
          else if (!_list) ...[
            GraphCanvas(
              badges: ref.watch(canonBadgesProvider),
              nodes: drawn.nodes,
              pairs: pairs,
              selectedKey: selected == null ? null : mapped(selected.key),
              pairKey: _pairKey,
              path: path == null ? null : {for (final e in path) e.id},
              onSelect: select,
              onPair: (p) => setState(() => _pairKey = p.key),
              onFocus: focusOn,
              onPath: onPath,
              pairWords: pairWords,
              typeName: typeName,
              typeCode: (t) => codes[t],
            ),
            const SizedBox(height: 8),
            GraphLegend(nodes: drawn.nodes, pairs: pairs, typeName: typeName, codes: codes),
          ] else
            _EdgeList(drawn: drawn, selected: selected, labelOf: labelOf, onSelect: select),
          if (pair != null) ...[
            const SizedBox(height: 12),
            _PairPanel(
              pair: pair,
              labelOf: labelOf,
              nodeOf: (k) => drawnByKey[k],
              onSelect: select,
              onRelation: (id) => notifier.select(EntityRef(EntityType.relation, id)),
              onClose: () => setState(() => _pairKey = null),
            ),
          ],
          if (selected != null) ...[
            const SizedBox(height: 12),
            _PathPanel(
              selected: selected,
              others: [
                for (final n in full.nodes)
                  if (n.key != selected.key) n,
              ],
              typeName: typeName,
              pathTo: pathTo,
              path: path,
              hiddenPath: hiddenPath,
              labelOf: labelOf,
              onPathTo: (k) => _set(s.copyWith(path: () => k)),
              onFocus: () => focusOn(selected),
              onRestore: () {
                setState(() => _s = GraphSettings(path: pathTo));
                notifier.setFilter({});
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _Check extends StatelessWidget {
  const _Check({required this.label, required this.value, required this.onChanged});
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  /// One control for screen readers: the box and its name together, checked or not.
  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    checked: value,
    label: label,
    onTap: () => onChanged(!value),
    excludeSemantics: true,
    child: InkWell(
      onTap: () => onChanged(!value),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Checkbox(value: value, onChanged: (v) => onChanged(v ?? false)),
          Flexible(child: Text(label)),
          const SizedBox(width: 8),
        ],
      ),
    ),
  );
}

/// What is shown, and what is folded together: each kind of record and connection, with its count.
class _Layers extends StatelessWidget {
  const _Layers({
    required this.counts,
    required this.settings,
    required this.typeName,
    required this.onChanged,
    required this.onFold,
  });

  final ({List<TypeCount> nodes, List<TypeCount> edges, List<TypeCount> statuses}) counts;
  final GraphSettings settings;
  final String Function(String type) typeName;
  final ValueChanged<GraphSettings> onChanged;
  final ValueChanged<String> onFold;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = settings;
    Set<String> toggled(Set<String> hidden, String type, bool on) =>
        on ? ({...hidden}..remove(type)) : {...hidden, type};
    Widget group(
      String title,
      List<TypeCount> types,
      Set<String> hidden,
      String Function(String) name,
      void Function(Set<String>) set, {
      bool folds = false,
    }) => SizedBox(
      width: 320,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: theme.textTheme.titleSmall),
          for (final (type, count) in types)
            Row(
              children: [
                Expanded(
                  child: CheckboxListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: !hidden.contains(type),
                    onChanged: (v) => set(toggled(hidden, type, v ?? false)),
                    title: Text('${name(type)}  $count'),
                  ),
                ),
                if (folds && !hidden.contains(type) && count > 1)
                  TextButton(
                    onPressed: () => onFold(type),
                    child: Text(
                      s.collapsed.contains(type) ? 'Open' : 'Fold together',
                      semanticsLabel: '${s.collapsed.contains(type) ? 'Open' : 'Fold together'} ${name(type)}',
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      initiallyExpanded:
          s.hiddenNodes.isNotEmpty || s.hiddenEdges.isNotEmpty || s.hiddenStatuses.isNotEmpty || s.collapsed.isNotEmpty,
      title: const Text('Layers: what is shown, and what is folded together'),
      children: [
        Wrap(
          spacing: 24,
          runSpacing: 12,
          children: [
            group(
              'Records',
              counts.nodes,
              s.hiddenNodes,
              typeName,
              (h) => onChanged(s.copyWith(hiddenNodes: h)),
              folds: true,
            ),
            group(
              'Connections',
              counts.edges,
              s.hiddenEdges,
              edgeTypeLabel,
              (h) => onChanged(s.copyWith(hiddenEdges: h)),
            ),
            if (counts.statuses.isNotEmpty)
              group(
                'Connection status',
                counts.statuses,
                s.hiddenStatuses,
                _statusWords,
                (h) => onChanged(s.copyWith(hiddenStatuses: h)),
              ),
          ],
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

/// The list form: every connection shown, from, how, to, and where it is kept.
class _EdgeList extends StatelessWidget {
  const _EdgeList({required this.drawn, required this.selected, required this.labelOf, required this.onSelect});
  final KnowledgeGraph drawn;
  final GraphNode? selected;
  final String Function(String key) labelOf;
  final ValueChanged<GraphNode> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final byKey = {for (final n in drawn.nodes) n.key: n};
    Widget end(String key) {
      final node = byKey[key];
      return node == null
          ? Text(labelOf(key))
          : TextButton(
              style: TextButton.styleFrom(padding: EdgeInsets.zero, alignment: AlignmentDirectional.centerStart),
              onPressed: () => onSelect(node),
              child: Text(labelOf(key)),
            );
    }

    final alone = [
      for (final n in drawn.nodes)
        if (!drawn.edges.any((e) => e.from == n.key || e.to == n.key)) n.label,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final e in drawn.edges)
          Card(
            margin: const EdgeInsets.only(bottom: 6),
            color: selected != null && (e.from == selected!.key || e.to == selected!.key)
                ? theme.colorScheme.secondaryContainer
                : null,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Wrap(
                spacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  end(e.from),
                  Text(
                    '${e.label}${e.label != edgeTypeLabel(e.type) ? ' · ${edgeTypeLabel(e.type)}' : ''}${e.directed ? ' →' : ''}',
                    style: theme.textTheme.labelLarge,
                  ),
                  end(e.to),
                  Text('kept in ${keptIn(e)}', style: theme.textTheme.bodySmall),
                ],
              ),
            ),
          ),
        if (alone.isNotEmpty) Text('With no connection shown: ${alone.join(', ')}.', style: theme.textTheme.bodySmall),
      ],
    );
  }
}

/// The connections between two records, as one line on the graph stands for them.
class _PairPanel extends StatelessWidget {
  const _PairPanel({
    required this.pair,
    required this.labelOf,
    required this.nodeOf,
    required this.onSelect,
    required this.onRelation,
    required this.onClose,
  });
  final Pair pair;
  final String Function(String key) labelOf;
  final GraphNode? Function(String key) nodeOf;
  final ValueChanged<GraphNode> onSelect;
  final ValueChanged<String> onRelation;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      label: 'Connections between ${labelOf(pair.a)} and ${labelOf(pair.b)}',
      child: Card.outlined(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('${labelOf(pair.a)} and ${labelOf(pair.b)}', style: theme.textTheme.titleMedium),
              for (final e in pair.edges)
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text('• ${edgeWords(e, labelOf)} '),
                    Text('· ${edgeTypeLabel(e.type)}, kept in ${keptIn(e)}', style: theme.textTheme.bodySmall),
                    if (e.kind.key == 'relationship')
                      TextButton(
                        onPressed: () => onRelation(e.connection.source.id),
                        child: const Text('Open the relationship'),
                      ),
                  ],
                ),
              Wrap(
                spacing: 8,
                children: [
                  for (final k in [pair.a, pair.b])
                    if (nodeOf(k) case final node?)
                      TextButton(
                        onPressed: () => onSelect(node),
                        child: Text(node.isGroup ? 'Open ${labelOf(k)}' : 'Show ${labelOf(k)}'),
                      ),
                  TextButton(onPressed: onClose, child: const Text('Close')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// How the selected record is connected to another: the shortest chain of connections.
class _PathPanel extends StatelessWidget {
  const _PathPanel({
    required this.selected,
    required this.others,
    required this.typeName,
    required this.pathTo,
    required this.path,
    required this.hiddenPath,
    required this.labelOf,
    required this.onPathTo,
    required this.onFocus,
    required this.onRestore,
  });

  final GraphNode selected;
  final List<GraphNode> others;
  final String Function(String type) typeName;
  final String? pathTo;
  final List<GraphEdge>? path;
  final List<GraphEdge>? hiddenPath;
  final String Function(String key) labelOf;
  final ValueChanged<String?> onPathTo;
  final VoidCallback onFocus;
  final VoidCallback onRestore;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      label: 'How they are connected',
      child: Card.outlined(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text('How is ${selected.label} connected to…', style: theme.textTheme.titleMedium),
                  TextButton.icon(
                    onPressed: onFocus,
                    icon: const Icon(Icons.center_focus_strong_outlined),
                    label: Text('Focus on ${selected.label}'),
                  ),
                ],
              ),
              Text(
                'Choose a record here, or long-press it on the graph (or press P on it).',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              LayoutBuilder(
                builder: (context, c) => DropdownMenu<String>(
                  key: ValueKey('path:${selected.key}:$pathTo'),
                  width: c.maxWidth.clamp(0, 420),
                  label: const Text('Another record'),
                  initialSelection: pathTo,
                  enableFilter: true,
                  requestFocusOnTap: true,
                  menuHeight: 320,
                  dropdownMenuEntries: [
                    for (final n in others) DropdownMenuEntry(value: n.key, label: '${n.label} (${typeName(n.type)})'),
                  ],
                  onSelected: onPathTo,
                ),
              ),
              if (pathTo != null) ...[
                const SizedBox(height: 8),
                if (path != null)
                  Semantics(
                    container: true,
                    label: 'The chain of connections',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [for (final (i, e) in path!.indexed) Text('${i + 1}. ${edgeWords(e, labelOf)}')],
                    ),
                  )
                else if (hiddenPath != null)
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        'Connected only through what this view hides '
                        '(${hiddenPath!.length} ${hiddenPath!.length == 1 ? 'step' : 'steps'}).',
                      ),
                      TextButton(onPressed: onRestore, child: const Text('Restore the full view to see it')),
                    ],
                  )
                else
                  const Text('Not connected within eight steps.'),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
