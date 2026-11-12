import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/app_theme.dart';
import '../../app/theme/novel_art.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/relationships/network.dart';
import '../../shared/domain/relationships/relation_types.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import '../visualize/widgets/canon_badge.dart';
import 'first_tie.dart';
import 'relationship_page.dart';

/// Each group's colour and line pattern: never told by colour alone.
({Color color, List<double> dash, double width, String pattern}) edgeStyle(RelationCategory? c) => switch (c) {
  RelationCategory.family => (color: const Color(0xFF8E4A2E), dash: const [], width: 3.0, pattern: 'solid, heavier'),
  RelationCategory.social => (color: const Color(0xFF3D5FA8), dash: const [12, 6], width: 2.0, pattern: 'long dashes'),
  RelationCategory.mentorship => (color: const Color(0xFF3F7D4E), dash: const [2, 5], width: 2.2, pattern: 'dotted'),
  RelationCategory.romance => (
    color: const Color(0xFFA8436B),
    dash: const [10, 4, 2, 4],
    width: 2.0,
    pattern: 'dash-dot',
  ),
  RelationCategory.hierarchy => (
    color: const Color(0xFF7A4FA3),
    dash: const [5, 4],
    width: 2.0,
    pattern: 'short dashes',
  ),
  RelationCategory.custom => (color: const Color(0xFF5C6370), dash: const [], width: 1.2, pattern: 'thin'),
  null => (color: const Color(0xFF9A9A9A), dash: const [], width: 1.0, pattern: 'thin, grey'),
};

enum _WhenKind { now, at, across, ever }

/// THE RELATIONSHIP MAP: characters and their relationships, drawn from the shared records, with filters that only
/// choose what is shown. Selecting a character or a line opens the right record. The list shows the same as a table.
class RelationshipMapPage extends ConsumerStatefulWidget {
  const RelationshipMapPage({super.key});

  @override
  ConsumerState<RelationshipMapPage> createState() => _RelationshipMapPageState();
}

class _RelationshipMapPageState extends ConsumerState<RelationshipMapPage> {
  _WhenKind _when = _WhenKind.now;
  String? _at;
  String? _from;
  String? _to;
  String? _type;
  String? _faction;
  String? _focus;
  int _depth = 1;
  final Set<Layer> _hidden = {};
  bool _isolated = false;
  bool _list = false;
  bool? _showFilters;

  /// A connection line selected: it is not a record of its own, so it is not the workspace's selection.
  String? _selectedLink;
  final _view = TransformationController();

  @override
  void dispose() {
    _view.dispose();
    super.dispose();
  }

  When get _whenFilter => switch (_when) {
    _WhenKind.now => const Now(),
    _WhenKind.at => _at == null ? const Now() : AsOf(_at!),
    _WhenKind.across => Across(_from, _to),
    _WhenKind.ever => const Ever(),
  };

  void _clear() => setState(() {
    _when = _WhenKind.now;
    _type = null;
    _faction = null;
    _focus = null;
    _hidden.clear();
    _isolated = false;
  });

  /// What a saved view of the map keeps: its own choices, besides the shared filters.
  JsonMap _config() => {
    'mode': _list ? 'list' : 'visual',
    'layers': [for (final l in _hidden) l.name],
    'layout': {
      'when': _when.name,
      'at': ?_at,
      'from': ?_from,
      'to': ?_to,
      'type': ?_type,
      'faction': ?_faction,
      'focus': ?_focus,
      'depth': _depth,
      'isolated': _isolated,
    },
  };

  void _apply(JsonMap c) {
    final layout = mapOrNull(c['layout']) ?? const {};
    setState(() {
      _list = c['mode'] == 'list';
      _hidden
        ..clear()
        ..addAll([for (final l in strings(c['layers'])) ?Layer.values.where((x) => x.name == l).firstOrNull]);
      _when = _WhenKind.values.where((w) => w.name == layout['when']).firstOrNull ?? _WhenKind.now;
      _at = strOrNull(layout['at']);
      _from = strOrNull(layout['from']);
      _to = strOrNull(layout['to']);
      _type = strOrNull(layout['type']);
      _faction = strOrNull(layout['faction']);
      _focus = strOrNull(layout['focus']);
      _depth = layout['depth'] == 2 ? 2 : 1;
      _isolated = layout['isolated'] == true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child, {List<Widget> actions = const []}) => VizFrame(
      view: 'relationships',
      title: 'Relationship map',
      subtitle: cast?.novelTitle,
      actions: actions,
      config: _config,
      onApply: _apply,
      child: child,
    );
    if (cast == null) return frame(const SizedBox.shrink());
    final model = cast.model;
    // The shared filters keep a relationship when it matches, as the original's map reads them.
    final keep = matchingKeys(model, viz.filter, [EntityType.relation]);
    final selectedNode = viz.selection?.type == EntityType.entry ? viz.selection!.id : null;
    final selectedEdge = viz.selection?.type == EntityType.relation ? viz.selection!.id : _selectedLink;
    final net = relationNetwork(
      model,
      NetworkFilter(
        when: _whenFilter,
        type: _type,
        factionId: _faction,
        focus: _focus == null ? null : (id: _focus!, depth: _depth),
        hidden: _hidden,
        isolated: _isolated,
        keep: keep == null ? null : (id) => keep.contains('relation:$id'),
      ),
    );
    final actions = CharacterActions(context, cast.novelId);
    final connections = net.edges.where((e) => e.kind == EdgeKind.connection).length;
    final relationships = net.edges.length - connections;
    final count =
        'Showing ${plural(net.nodes.length, 'character')} and ${formatNumber(relationships)} of '
        '${plural(net.total, 'relationship')}${connections > 0 ? ', with ${plural(connections, 'other connection')}' : ''}.';
    final filtered =
        _when != _WhenKind.now ||
        _type != null ||
        _faction != null ||
        _focus != null ||
        _hidden.isNotEmpty ||
        _isolated;
    final compact = WindowSize.of(context) == WindowSize.compact;
    final showFilters = _showFilters ?? !compact;

    return frame(
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.hub_outlined), label: Text('Map')),
            ButtonSegment(value: true, icon: Icon(Icons.table_rows_outlined), label: Text('List')),
          ],
          selected: {_list},
          showSelectedIcon: false,
          onSelectionChanged: (v) => setState(() => _list = v.first),
        ),
      ],
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (compact)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () => setState(() => _showFilters = !showFilters),
                icon: Icon(showFilters ? Icons.expand_less : Icons.tune),
                label: Text(
                  showFilters
                      ? 'Hide filters'
                      : filtered
                      ? 'Filters (some on)'
                      : 'Filters',
                ),
              ),
            ),
          if (showFilters) _filters(context, cast, compact),
          const SizedBox(height: 8),
          Semantics(liveRegion: true, child: Text(count, style: Theme.of(context).textTheme.bodySmall)),
          const SizedBox(height: 8),
          if (net.edges.isEmpty && net.nodes.isEmpty)
            filtered ? NoResultsState(onClear: _clear) : FirstTie(cast: cast)
          else if (_list)
            _ListView(cast: cast, net: net, actions: actions)
          else ...[
            SizedBox(
              height: compact ? 460 : 620,
              child: _MapView(
                badges: ref.watch(canonBadgesProvider),
                net: net,
                controller: _view,
                selectedNode: selectedNode,
                selectedEdge: selectedEdge,
                onNode: (id) {
                  setState(() => _selectedLink = null);
                  notifier.select(id == null ? null : EntityRef(EntityType.entry, id));
                },
                onEdge: (id) {
                  final relation = id != null && model.relations.containsKey(id);
                  setState(() => _selectedLink = relation ? null : id);
                  notifier.select(relation ? EntityRef(EntityType.relation, id) : null);
                },
              ),
            ),
            const SizedBox(height: 8),
            _selection(context, cast, net, actions, selectedNode, selectedEdge),
            const SizedBox(height: 8),
            const _Legend(),
          ],
        ],
      ),
    );
  }

  Widget _selection(
    BuildContext context,
    CastData cast,
    Network net,
    CharacterActions actions,
    String? selectedNode,
    String? selectedEdge,
  ) {
    final node = net.nodes.where((n) => n.id == selectedNode).firstOrNull;
    final edge = net.edges.where((e) => e.id == selectedEdge).firstOrNull;
    String name(String id) => cast.model.entries[id]?.name ?? '?';
    // A character or a relationship has its details in the workspace's panel; the map adds what only it can do.
    if (node != null) {
      return Wrap(
        spacing: 8,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text('${node.name}: ${plural(node.degree, 'tie')} shown on the map.'),
          OutlinedButton(
            onPressed: () => setState(() => _focus = node.id),
            child: Text('Focus the map on ${node.name}'),
          ),
        ],
      );
    }
    if (edge != null && edge.kind == EdgeKind.relationship) {
      return Text(
        edge.range.isEmpty ? 'Shown as “${edge.label}”.' : 'Shown as “${edge.label}”, which applies ${edge.range}.',
      );
    }
    if (edge != null) {
      final direction = edge.directed
          ? '${name(edge.from)} (${edge.fromRole}) → ${name(edge.to)} (${edge.toRole})'
          : '${name(edge.from)} and ${name(edge.to)}';
      return ProfileBox(
        title: edge.label,
        children: [
          Text('Direction: $direction'),
          if (edge.affinity != null) Text('Feeling: ${edge.affinity!.label}'),
          if (edge.range.isNotEmpty) Text('Applies: ${edge.range}'),
          if (edge.kind == EdgeKind.connection) const Text('A connection you recorded; it has no history of its own.'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              if (edge.kind == EdgeKind.relationship)
                FilledButton(
                  onPressed: () => actions.router.go(relationshipPath(edge.id)),
                  child: const Text('Open the relationship'),
                ),
              TextButton(onPressed: () => actions.openCharacter(edge.from), child: Text('Open ${name(edge.from)}')),
              TextButton(onPressed: () => actions.openCharacter(edge.to), child: Text('Open ${name(edge.to)}')),
            ],
          ),
        ],
      );
    }
    return Text(
      'Select a character or a line for its details. Drag to move around; pinch or scroll to zoom.',
      style: Theme.of(context).textTheme.bodySmall,
    );
  }

  Widget _filters(BuildContext context, CastData cast, bool compact) {
    final model = cast.model;
    final chapters = model.order.chapters;
    final types = stableSorted(
      {
        for (final r in model.relations.values)
          for (final s in r.stages) s.preset,
      }.map((k) => typeFor(k, RelationSettings(cast.snapshot.rows('relationSettings').firstOrNull).types)),
      (a, b) => localeCompare(a.label, b.label),
    );
    final factions = stableSorted([
      for (final e in model.entries.values)
        if (e.category == 'faction') e,
    ], (a, b) => localeCompare(a.name, b.name));
    final people = cast.characters();
    Widget box(double width, Widget child) => SizedBox(width: compact ? double.infinity : width, child: child);
    DropdownMenuItem<String?> chapterItem(String id, String label) => DropdownMenuItem<String?>(
      value: id,
      child: Text(label, overflow: TextOverflow.ellipsis),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            box(
              200,
              DropdownButtonFormField<_WhenKind>(
                initialValue: _when,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'When'),
                items: const [
                  DropdownMenuItem(value: _WhenKind.now, child: Text('Now (end of the story)')),
                  DropdownMenuItem(value: _WhenKind.at, child: Text('As of a chapter')),
                  DropdownMenuItem(value: _WhenKind.across, child: Text('Across chapters')),
                  DropdownMenuItem(value: _WhenKind.ever, child: Text('At any time')),
                ],
                onChanged: (v) => setState(() => _when = v ?? _when),
              ),
            ),
            if (_when == _WhenKind.at)
              box(
                220,
                DropdownButtonFormField<String?>(
                  initialValue: _at,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Chapter'),
                  items: [for (final c in chapters) chapterItem(c.id, c.displayTitle)],
                  onChanged: (v) => setState(() => _at = v),
                ),
              ),
            if (_when == _WhenKind.across) ...[
              box(
                200,
                DropdownButtonFormField<String?>(
                  initialValue: _from,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'From'),
                  items: [
                    const DropdownMenuItem<String?>(child: Text('The start')),
                    for (final c in chapters) chapterItem(c.id, c.displayTitle),
                  ],
                  onChanged: (v) => setState(() => _from = v),
                ),
              ),
              box(
                200,
                DropdownButtonFormField<String?>(
                  initialValue: _to,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'To'),
                  items: [
                    const DropdownMenuItem<String?>(child: Text('The end')),
                    for (final c in chapters) chapterItem(c.id, c.displayTitle),
                  ],
                  onChanged: (v) => setState(() => _to = v),
                ),
              ),
            ],
            box(
              220,
              DropdownButtonFormField<String?>(
                initialValue: _type,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Type'),
                items: [
                  const DropdownMenuItem<String?>(child: Text('Any type')),
                  for (final t in types)
                    DropdownMenuItem<String?>(
                      value: t.key,
                      child: Text(t.label, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _type = v),
              ),
            ),
            if (factions.isNotEmpty)
              box(
                220,
                DropdownButtonFormField<String?>(
                  initialValue: _faction,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Faction'),
                  items: [
                    const DropdownMenuItem<String?>(child: Text('Any faction')),
                    for (final f in factions)
                      DropdownMenuItem<String?>(
                        value: f.id,
                        child: Text(f.name, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() => _faction = v),
                ),
              ),
            box(
              220,
              DropdownButtonFormField<String?>(
                key: ValueKey('focus:$_focus'),
                initialValue: _focus,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Focus on'),
                items: [
                  const DropdownMenuItem<String?>(child: Text('Everyone')),
                  for (final p in people)
                    DropdownMenuItem<String?>(
                      value: p.id,
                      child: Text(p.name, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _focus = v),
              ),
            ),
            if (_focus != null)
              FilterChip(
                label: const Text('and their ties’ ties'),
                selected: _depth == 2,
                onSelected: (on) => setState(() => _depth = on ? 2 : 1),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text('Show:', style: Theme.of(context).textTheme.labelLarge),
            for (final layer in Layer.values)
              FilterChip(
                label: Text(switch (layer) {
                  Layer.connection => 'Other connections',
                  Layer.labels => 'Labels on lines',
                  _ => RelationCategory.of(layer.name).label,
                }),
                selected: !_hidden.contains(layer),
                onSelected: (on) => setState(() => on ? _hidden.remove(layer) : _hidden.add(layer)),
              ),
            FilterChip(
              label: const Text('Characters with no ties'),
              selected: _isolated,
              onSelected: (on) => setState(() => _isolated = on),
            ),
            if (_focus != null ||
                _type != null ||
                _faction != null ||
                _hidden.isNotEmpty ||
                _isolated ||
                _when != _WhenKind.now)
              TextButton(onPressed: _clear, child: const Text('Clear filters')),
          ],
        ),
      ],
    );
  }
}

class _MapView extends StatefulWidget {
  const _MapView({
    required this.net,
    required this.controller,
    required this.selectedNode,
    required this.selectedEdge,
    required this.onNode,
    required this.onEdge,
    this.badges,
  });

  /// Canon and continuity badges, by record key; null while the marks are off.
  final Map<String, CanonBadge>? badges;
  final Network net;
  final TransformationController controller;
  final String? selectedNode;
  final String? selectedEdge;
  final ValueChanged<String?> onNode;
  final ValueChanged<String?> onEdge;

  @override
  State<_MapView> createState() => _MapViewState();
}

class _MapViewState extends State<_MapView> {
  String? _fittedFor;
  final _focus = FocusNode(debugLabel: 'relationship map');

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  /// From the keyboard: the arrows move from one character to the next, by name; Escape lets go.
  KeyEventResult _key(KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
    final people = [...widget.net.nodes]..sort((a, b) => localeCompare(a.name, b.name));
    if (people.isEmpty) return KeyEventResult.ignored;
    final at = people.indexWhere((n) => n.id == widget.selectedNode);
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.escape && (widget.selectedNode != null || widget.selectedEdge != null)) {
      widget.onNode(null);
      return KeyEventResult.handled;
    }
    final next = switch (key) {
      LogicalKeyboardKey.arrowRight || LogicalKeyboardKey.arrowDown => at + 1,
      LogicalKeyboardKey.arrowLeft || LogicalKeyboardKey.arrowUp => at < 0 ? people.length - 1 : at - 1,
      LogicalKeyboardKey.home => 0,
      LogicalKeyboardKey.end => people.length - 1,
      _ => null,
    };
    if (next == null) return KeyEventResult.ignored;
    widget.onNode(people[next.clamp(0, people.length - 1)].id);
    return KeyEventResult.handled;
  }

  /// Scales the drawing down (never up) so all of it shows, centred in the box.
  void _fit(Size box, Size drawing) {
    final scale = math.min(1.0, math.min(box.width / drawing.width, box.height / drawing.height)).clamp(0.2, 1.0);
    widget.controller.value = Matrix4.diagonal3Values(scale, scale, 1)
      ..setTranslationRaw((box.width - drawing.width * scale) / 2, (box.height - drawing.height * scale) / 2, 0);
  }

  @override
  Widget build(BuildContext context) {
    final net = widget.net;
    final selectedNode = widget.selectedNode;
    final selectedEdge = widget.selectedEdge;
    final placed = layoutNetwork(net.nodes, net.edges);
    final xs = placed.values.map((p) => p.x);
    final ys = placed.values.map((p) => p.y);
    const pad = 90.0;
    final minX = (xs.isEmpty ? 0.0 : xs.reduce(math.min)) - pad;
    final minY = (ys.isEmpty ? 0.0 : ys.reduce(math.min)) - pad;
    final width = (xs.isEmpty ? 0.0 : xs.reduce(math.max)) + pad - minX;
    final height = (ys.isEmpty ? 0.0 : ys.reduce(math.max)) + pad - minY;
    final at = {for (final e in placed.entries) e.key: Offset(e.value.x - minX, e.value.y - minY)};
    final theme = Theme.of(context);
    final labels = net.edges.length <= 60 || selectedEdge != null || selectedNode != null;
    final described = [
      for (final e in net.edges.take(40))
        '${net.nodes.where((n) => n.id == e.from).firstOrNull?.name} ${e.label} ${net.nodes.where((n) => n.id == e.to).firstOrNull?.name}',
    ].join('; ');
    final drawing = Size(math.max(width, 300), math.max(height, 300));
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final box = constraints.biggest;
            // Fit again whenever what is drawn, or the room for it, changes.
            final key = '${placed.keys.join(',')}|${box.width.round()}x${box.height.round()}';
            if (_fittedFor != key) {
              _fittedFor = key;
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) _fit(box, drawing);
              });
            }
            return Stack(
              children: [
                Positioned.fill(child: _viewer(net, at, drawing, theme, labels, described)),
                PositionedDirectional(
                  top: 4,
                  end: 4,
                  child: IconButton.filledTonal(
                    tooltip: 'Fit to view',
                    onPressed: () => _fit(box, drawing),
                    icon: const Icon(Icons.fit_screen_outlined),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _viewer(Network net, Map<String, Offset> at, Size drawing, ThemeData theme, bool labels, String described) {
    final selectedNode = widget.selectedNode;
    final selectedEdge = widget.selectedEdge;
    final onNode = widget.onNode;
    final onEdge = widget.onEdge;
    final chosen = net.nodes.where((n) => n.id == selectedNode).firstOrNull;
    return Focus(
      focusNode: _focus,
      onKeyEvent: (_, event) => _key(event),
      child: Semantics(
        label:
            'Relationship map. $described. Use the arrow keys to move from one character to the next. The List view shows the same as a table.',
        value: chosen == null
            ? null
            : 'Selected: ${chosen.name}, ${chosen.degree} ${chosen.degree == 1 ? 'tie' : 'ties'}',
        child: InteractiveViewer(
          transformationController: widget.controller,
          constrained: false,
          boundaryMargin: const EdgeInsets.all(400),
          minScale: 0.2,
          maxScale: 4,
          child: GestureDetector(
            onTapUp: (d) {
              _focus.requestFocus();
              final p = d.localPosition;
              for (final n in net.nodes) {
                final c = at[n.id]!;
                if ((c - p).distance <= radiusOf(n.degree) + 4) return onNode(n.id);
              }
              for (final e in net.edges) {
                if (_distanceToSegment(p, at[e.from]!, at[e.to]!) <= 8) return onEdge(e.id);
              }
              onNode(null);
            },
            child: CustomPaint(
              size: drawing,
              painter: _MapPainter(
                net: net,
                at: at,
                selectedNode: selectedNode,
                selectedEdge: selectedEdge,
                labels: labels,
                text: theme.colorScheme.onSurface,
                surface: theme.colorScheme.surface,
                accent: theme.colorScheme.primary,
                // The people as the theme draws them (`novel_art.dart`): rust with white letters, or teal with dark ones.
                node: NovelArt.of(context).system ? MonolithTokens.accentSecondary : const Color(0xFFB4532A),
                nodeInk: NovelArt.of(context).system ? MonolithTokens.backgroundPrimary : Colors.white,
                badges: widget.badges,
                scheme: theme.colorScheme,
              ),
            ),
          ),
        ),
      ),
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

class _MapPainter extends CustomPainter {
  _MapPainter({
    required this.net,
    required this.at,
    required this.selectedNode,
    required this.selectedEdge,
    required this.labels,
    required this.text,
    required this.surface,
    required this.accent,
    this.node = const Color(0xFFB4532A),
    this.nodeInk = Colors.white,
    this.badges,
    this.scheme,
  });

  /// A person's circle (the one in focus is in [accent]) and the letter on it.
  final Color node;
  final Color nodeInk;

  final Map<String, CanonBadge>? badges;
  final ColorScheme? scheme;
  final Network net;
  final Map<String, Offset> at;
  final String? selectedNode;
  final String? selectedEdge;
  final bool labels;
  final Color text;
  final Color surface;
  final Color accent;

  bool _lit(String from, String to, String id) =>
      selectedNode == null && selectedEdge == null || selectedEdge == id || selectedNode == from || selectedNode == to;

  @override
  void paint(Canvas canvas, Size size) {
    for (final e in net.edges) {
      final a = at[e.from]!;
      final b = at[e.to]!;
      final style = edgeStyle(e.category);
      final lit = _lit(e.from, e.to, e.id);
      final paint = Paint()
        ..color = style.color.withValues(alpha: lit ? 1 : 0.18)
        ..strokeWidth = e.id == selectedEdge ? style.width + 2 : style.width
        ..style = PaintingStyle.stroke;
      _line(canvas, a, b, style.dash, paint);
      if (e.directed) {
        final rTo = radiusOf(net.nodes.firstWhere((n) => n.id == e.to).degree);
        final dir = (b - a) / math.max((b - a).distance, 1);
        final tip = b - dir * (rTo + 3);
        final side = Offset(-dir.dy, dir.dx);
        final head = Path()
          ..moveTo(tip.dx, tip.dy)
          ..lineTo((tip - dir * 10 + side * 5).dx, (tip - dir * 10 + side * 5).dy)
          ..lineTo((tip - dir * 10 - side * 5).dx, (tip - dir * 10 - side * 5).dy)
          ..close();
        canvas.drawPath(head, Paint()..color = paint.color);
      }
      if (labels && lit && !(selectedNode == null && selectedEdge == null && net.edges.length > 60)) {
        _text(canvas, e.label, (a + b) / 2, 11, text.withValues(alpha: 0.85), background: surface);
      }
      if ((badges?['relation:${e.id}'] ?? badges?['link:${e.id}']) case final badge? when scheme != null) {
        paintCanonBadge(canvas, (a + b) / 2 + const Offset(6, 8), badge, scheme!);
      }
    }
    for (final n in net.nodes) {
      final c = at[n.id]!;
      final r = radiusOf(n.degree);
      final lit =
          selectedNode == null && selectedEdge == null ||
          selectedNode == n.id ||
          net.edges.any(
            (e) =>
                (e.from == n.id || e.to == n.id) &&
                (e.from == selectedNode || e.to == selectedNode || e.id == selectedEdge),
          );
      canvas.drawCircle(c, r, Paint()..color = (n.focus ? accent : node).withValues(alpha: lit ? 1 : 0.25));
      if (n.id == selectedNode) {
        canvas.drawCircle(
          c,
          r + 4,
          Paint()
            ..color = accent
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3,
        );
      }
      _text(canvas, n.name.trim().isEmpty ? '?' : n.name.trim().characters.first.toUpperCase(), c, r * 0.9, nodeInk);
      _text(canvas, n.name, c + Offset(0, r + 12), 12, text.withValues(alpha: lit ? 1 : 0.35), background: surface);
      if (badges?['entry:${n.id}'] case final badge? when scheme != null) {
        paintCanonBadge(canvas, c + Offset(r * 0.7, -r - 8), badge, scheme!);
      }
    }
  }

  void _line(Canvas canvas, Offset a, Offset b, List<double> dash, Paint paint) {
    if (dash.isEmpty) {
      canvas.drawLine(a, b, paint);
      return;
    }
    final total = (b - a).distance;
    final dir = (b - a) / math.max(total, 1);
    var d = 0.0;
    var i = 0;
    while (d < total) {
      final len = dash[i % dash.length];
      if (i.isEven) canvas.drawLine(a + dir * d, a + dir * math.min(d + len, total), paint);
      d += len;
      i++;
    }
  }

  void _text(Canvas canvas, String s, Offset centre, double size, Color color, {Color? background}) {
    final p = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(fontSize: size, color: color, fontWeight: FontWeight.w600),
      ),
      textDirection: ui.TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: 160);
    final topLeft = centre - Offset(p.width / 2, p.height / 2);
    if (background != null) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(topLeft.dx - 3, topLeft.dy - 1, p.width + 6, p.height + 2),
          const Radius.circular(3),
        ),
        Paint()..color = background.withValues(alpha: 0.8),
      );
    }
    p.paint(canvas, topLeft);
  }

  @override
  bool shouldRepaint(_MapPainter old) =>
      old.net != net ||
      old.selectedNode != selectedNode ||
      old.selectedEdge != selectedEdge ||
      old.labels != labels ||
      // A new theme repaints it at once, in its own colours.
      old.accent != accent ||
      old.node != node ||
      old.nodeInk != nodeInk ||
      old.text != text ||
      old.surface != surface;
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 16,
    runSpacing: 6,
    children: [
      for (final c in [...RelationCategory.values, null])
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CustomPaint(size: const Size(36, 10), painter: _LegendLine(c)),
            const SizedBox(width: 6),
            // Wraps under large text instead of running off the screen.
            Flexible(
              child: Text(
                '${c?.label ?? 'Other connections'} (${edgeStyle(c).pattern})',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      Text('Arrows: one-way, from the first role to the second.', style: Theme.of(context).textTheme.bodySmall),
    ],
  );
}

class _LegendLine extends CustomPainter {
  _LegendLine(this.category);
  final RelationCategory? category;

  @override
  void paint(Canvas canvas, Size size) {
    final s = edgeStyle(category);
    final paint = Paint()
      ..color = s.color
      ..strokeWidth = s.width;
    final y = size.height / 2;
    if (s.dash.isEmpty) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      return;
    }
    var x = 0.0;
    var i = 0;
    while (x < size.width) {
      final len = s.dash[i % s.dash.length];
      if (i.isEven) canvas.drawLine(Offset(x, y), Offset(math.min(x + len, size.width), y), paint);
      x += len;
      i++;
    }
  }

  @override
  bool shouldRepaint(_LegendLine old) => old.category != category;
}

class _ListView extends StatelessWidget {
  const _ListView({required this.cast, required this.net, required this.actions});

  final CastData cast;
  final Network net;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    String name(String id) => cast.model.entries[id]?.name ?? '?';
    return Card(
      child: Column(
        children: [
          for (final (i, e) in net.edges.indexed) ...[
            if (i > 0) const Divider(height: 1),
            ListTile(
              title: Text(
                '${name(e.from)}${e.fromRole.isNotEmpty && e.directed ? ' (${e.fromRole})' : ''} · ${e.label} · '
                '${name(e.to)}${e.toRole.isNotEmpty && e.directed ? ' (${e.toRole})' : ''}',
              ),
              subtitle: Text(
                [
                  if (e.affinity != null) e.affinity!.label,
                  if (e.range.isNotEmpty) e.range,
                  e.kind == EdgeKind.connection ? 'a connection you recorded' : (e.category?.label ?? ''),
                ].join(' · '),
              ),
              trailing: e.kind == EdgeKind.relationship ? const Icon(Icons.chevron_right) : null,
              onTap: e.kind == EdgeKind.relationship ? () => actions.router.go(relationshipPath(e.id)) : null,
            ),
          ],
          if (net.edges.isEmpty) const Padding(padding: EdgeInsets.all(16), child: NotRecorded('Nothing to list.')),
        ],
      ),
    );
  }
}
