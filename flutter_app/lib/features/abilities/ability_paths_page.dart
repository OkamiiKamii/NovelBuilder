import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/abilities/paths.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/graph/knowledge.dart' show keyOf, refOf;
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/outline.dart' show isDocument;
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/model/story_order.dart' show readingOrder;
import '../../shared/domain/records/link.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/vault.dart';
import '../graph/widgets/graph_canvas.dart' show dashedLine, hexColor;
import '../progression/progression_providers.dart';
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';

/// Each kind of path by colour and by line, never by colour alone.
const _style = {
  PathRole.prerequisite: (color: null, dash: <double>[], width: 2.0, arrow: true),
  PathRole.alternative: (color: 0xff2b7a8c, dash: [6.0, 4.0], width: 2.0, arrow: true),
  PathRole.rule: (color: 0xff8a8276, dash: [1.0, 4.0], width: 2.2, arrow: true),
  PathRole.upgrade: (color: 0xff4f7a2b, dash: <double>[], width: 3.0, arrow: true),
  PathRole.evolution: (color: 0xff7a4fa3, dash: <double>[], width: 3.0, arrow: true),
  PathRole.fusion: (color: 0xffa3622b, dash: [10.0, 4.0], width: 3.0, arrow: true),
  PathRole.replacement: (color: 0xff4f5fa3, dash: [6.0, 2.0, 1.5, 2.0], width: 2.5, arrow: true),
  PathRole.branch: (color: 0xff8a8276, dash: <double>[], width: 1.3, arrow: true),
  PathRole.exclusive: (color: 0xffa8436b, dash: [3.0, 3.0], width: 2.0, arrow: false),
  PathRole.other: (color: 0xff6b7a2b, dash: [4.0, 2.0, 1.0, 2.0], width: 1.8, arrow: true),
};
const _w = 160.0;
const _h = 96.0;

/// The round node's size; its name is written beneath it.
const _circle = 48.0;

/// A box's height at the reader's text size: taller for larger text, never past the space between rows.
double _boxHeight(BuildContext context) => math.min(_h * MediaQuery.textScalerOf(context).scale(1), pathRow - 24);

/// A path in words, from one end: "Prerequisite for Iron Fortress", "Evolves from Squire".
String pathWords(PathEdge edge, {required bool fromSide, required String Function(String key) name}) {
  if (fromSide) return '${edge.label} ${name(edge.to)}';
  if (edge.role == PathRole.branch) return 'Branches from ${name(edge.from)}';
  if (edge.role == PathRole.rule) return 'Its requirement rule names ${name(edge.from)}';
  final inverse = connectionTypes.where((t) => t.label == edge.label).firstOrNull?.inverse;
  // A kind of the author's own reads one way only: said from the other end as it stands.
  if (inverse == null) {
    final l = edge.label;
    return '${name(edge.from)} ${l.isEmpty ? l : '${l[0].toLowerCase()}${l.substring(1)}'} this';
  }
  return '${inverse == ConnectionType.same ? edge.label : inverse} ${name(edge.from)}';
}

/// ABILITY PATHS
/// Abilities, skills, classes, techniques and the like, from every system and every kind of record set to show here,
/// with the paths the author records between them, drawn as a tree from what comes first. What does not add up is
/// listed, never fixed.
class AbilityPathsPage extends ConsumerStatefulWidget {
  const AbilityPathsPage({super.key});

  @override
  ConsumerState<AbilityPathsPage> createState() => _AbilityPathsPageState();
}

class _AbilityPathsPageState extends ConsumerState<AbilityPathsPage> {
  bool _list = false;
  Set<String> _hiddenSources = {};
  Set<String> _hiddenRoles = {};
  String? _focus;
  bool _all = false;

  /// The chapter or scene the tree is seen as of, for the chosen character; null for the end of the story.
  String? _at;

  JsonMap _layout() => {
    'aat': ?_at,
    if (_hiddenSources.isNotEmpty) 'asrc': _hiddenSources.join(','),
    if (_hiddenRoles.isNotEmpty) 'arole': _hiddenRoles.join(','),
    'afocus': ?_focus,
    if (_all) 'aall': '1',
  };

  Set<String> _setOf(Object? v) => {
    for (final s in str(v).split(','))
      if (s.isNotEmpty) s,
  };

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child) => VizFrame(
      view: 'abilities',
      title: 'Ability paths',
      config: () => {'mode': _list ? 'list' : 'visual', 'layout': _layout()},
      onApply: (JsonMap c) => setState(() {
        final l = mapOrNull(c['layout']) ?? const {};
        _list = c['mode'] == 'list';
        _hiddenSources = _setOf(l['asrc']);
        _hiddenRoles = _setOf(l['arole']);
        _focus = str(l['afocus']).isEmpty ? null : str(l['afocus']);
        _all = l['aall'] == '1';
        _at = str(l['aat']).isEmpty ? null : str(l['aat']);
      }),
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.account_tree_outlined), label: Text('Tree')),
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
    final tree = abilityTree(model, snapshotsOf(cast.snapshot));
    final actions = ProgressionActions(context, cast.novelId);
    if (tree.nodes.isEmpty) {
      return frame(
        EmptyState(
          icon: Icons.account_tree_outlined,
          title: 'No abilities yet',
          message:
              'They come from your system blueprints (Organize → Systems) and from any kind of record you set to show '
              'here (World → Categories & fields → In the ability tree).',
          action: OutlinedButton(onPressed: () => actions.openSystems(), child: const Text('Open Systems')),
        ),
      );
    }
    final problems = pathProblems(tree, model);
    final byKey = {for (final n in tree.nodes) n.key: n};
    String name(String key) => byKey[key]?.name ?? 'something deleted';

    final focus = _focus != null && byKey.containsKey(_focus) ? _focus : null;
    final text = str(viz.filter['text']).trim().toLowerCase();
    final chosenId = strings(viz.filter['characters']).firstOrNull;
    final through = chosenId != null && model.entries[chosenId]?.category == 'character' ? chosenId : null;
    final documents = [
      for (final n in readingOrder(model.nodes.values))
        if (isDocument(n.kind)) n,
    ];
    final at = _at != null && documents.any((n) => n.id == _at) ? _at : null;
    final heldSet = through == null
        ? const <String>{}
        : heldBy(model, snapshotsOf(cast.snapshot), through, atNodeId: at);
    final standing = through == null ? null : standings(tree, heldSet);
    final whenWords = at == null ? 'at the end of the story' : 'as of ${model.nodes[at]!.displayTitle}';
    final sources = <String, String>{for (final n in tree.nodes) n.sourceKey: n.source};
    var nodes = [
      for (final n in tree.nodes)
        if (!_hiddenSources.contains(n.sourceKey)) n,
    ];
    if (focus != null) {
      final near = pathsOf(tree, focus);
      nodes = [
        for (final n in nodes)
          if (near.contains(n.key)) n,
      ];
    }
    final shown = {for (final n in nodes) n.key};
    var edges = [
      for (final e in tree.edges)
        if (!_hiddenRoles.contains(e.role.name) && shown.contains(e.from) && shown.contains(e.to)) e,
    ];
    if (text.isNotEmpty) {
      final hits = {
        for (final n in nodes)
          if (n.name.toLowerCase().contains(text)) n.key,
      };
      for (final e in [...edges]) {
        if (hits.contains(e.from) || hits.contains(e.to)) hits.addAll([e.from, e.to]);
      }
      nodes = [
        for (final n in nodes)
          if (hits.contains(n.key)) n,
      ];
      edges = [
        for (final e in edges)
          if (hits.contains(e.from) && hits.contains(e.to)) e,
      ];
    }
    final pathed = {
      for (final e in edges) ...[e.from, e.to],
    };
    final lone = nodes.where((n) => !pathed.contains(n.key)).length;
    if (!_all && edges.isNotEmpty && focus == null) {
      nodes = [
        for (final n in nodes)
          if (pathed.contains(n.key)) n,
      ];
    }
    final flagged = <String, String>{};
    for (final p in problems) {
      for (final k in p.nodes) {
        if (flagged[k] != 'problem') flagged[k] = p.severity;
      }
    }
    bool held(AbilityNode n) => heldSet.contains(n.key);
    final roles = [
      for (final r in PathRole.values)
        if (tree.edges.any((e) => e.role == r)) r,
    ];
    final selectedKey = viz.selection == null ? null : keyOf(viz.selection!);
    void pick(AbilityNode n) => notifier.select(n.ref);

    final left = [
      if (_hiddenSources.isNotEmpty)
        'Sources hidden: ${[for (final MapEntry(:key, :value) in sources.entries)
          if (_hiddenSources.contains(key)) value].join(', ')}.',
      if (_hiddenRoles.isNotEmpty)
        'Paths hidden: ${[for (final r in PathRole.values)
          if (_hiddenRoles.contains(r.name)) r.label].join(', ')}.',
      if (focus != null) 'Only the paths of ${name(focus)}.',
    ];

    final controls = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (focus != null)
              OutlinedButton(
                onPressed: () => setState(() => _focus = null),
                child: const Text('Show every path again'),
              ),
            if (focus == null && lone > 0 && edges.isNotEmpty)
              FilterChip(
                label: Text('Also draw the $lone with no paths'),
                selected: _all,
                onSelected: (on) => setState(() => _all = on),
              ),
          ],
        ),
        const SizedBox(height: 6),
        if (through != null)
          Wrap(
            spacing: 16,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 280,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('at:$at'),
                  initialValue: at ?? '',
                  isExpanded: true,
                  decoration: InputDecoration(labelText: 'For ${model.entries[through]!.name}, as of', isDense: true),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('The end of the story')),
                    for (final d in documents)
                      DropdownMenuItem(
                        value: d.id,
                        child: Text(d.displayTitle, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() => _at = v == null || v.isEmpty ? null : v),
                ),
              ),
              for (final st in Standing.values)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _NodeMark(standing: st, sourceColor: null, size: 22),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        '${st.label} (${standing!.values.where((x) => x == st).length})',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        if (sources.length > 1) ...[
          const SizedBox(height: 6),
          Semantics(
            container: true,
            label: 'Sources',
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final MapEntry(:key, :value) in sources.entries)
                  FilterChip(
                    label: Text(value),
                    selected: !_hiddenSources.contains(key),
                    onSelected: (on) => setState(() => _hiddenSources = {..._hiddenSources}..toggle(key, !on)),
                  ),
              ],
            ),
          ),
        ],
        if (roles.isNotEmpty) ...[
          const SizedBox(height: 6),
          Semantics(
            container: true,
            label: 'Kinds of path',
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final r in roles)
                  FilterChip(
                    avatar: _Swatch(role: r),
                    label: Text(r.label),
                    selected: !_hiddenRoles.contains(r.name),
                    onSelected: (on) => setState(() => _hiddenRoles = {..._hiddenRoles}..toggle(r.name, !on)),
                  ),
              ],
            ),
          ),
        ],
        if (left.isNotEmpty) ...[
          const SizedBox(height: 6),
          Semantics(liveRegion: true, child: Text(left.join(' '), style: theme.textTheme.bodySmall)),
        ],
      ],
    );

    final report = _Problems(problems: problems, tree: tree, name: name, onFocus: (k) => setState(() => _focus = k));
    final selectedNode = selectedKey == null ? null : byKey[selectedKey];
    final details = selectedNode == null
        ? null
        : _Details(
            model: model,
            tree: tree,
            node: selectedNode,
            name: name,
            actions: actions,
            standingLine: through == null || standing == null
                ? null
                : () {
                    final who = model.entries[through]!.name;
                    return switch (standing[selectedNode.key]!) {
                      Standing.held => '$who holds it $whenWords.',
                      Standing.available => '$who can gain it $whenWords: every prerequisite recorded for it is held.',
                      Standing.locked =>
                        'Locked for $who $whenWords. ${lockedBecause(tree, selectedNode.key, heldSet, name)}'.trim(),
                    };
                  }(),
            standing: standing?[selectedNode.key],
          );

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          controls,
          const SizedBox(height: 12),
          if (nodes.isEmpty)
            EmptyState(
              icon: Icons.filter_alt_off_outlined,
              title: 'Nothing shown',
              message: 'Nothing is shown with these sources, kinds of path and filters.',
              action: OutlinedButton(
                onPressed: () {
                  setState(() {
                    _hiddenSources = {};
                    _hiddenRoles = {};
                    _focus = null;
                  });
                  notifier.setFilter({});
                },
                child: const Text('Restore the full view'),
              ),
            )
          else if (_list)
            _PathList(
              nodes: nodes,
              edges: edges,
              name: name,
              selectedKey: selectedKey,
              held: held,
              standing: standing,
              flagged: flagged,
              onPick: pick,
            )
          else ...[
            LayoutBuilder(
              builder: (context, box) {
                final drawing = _Tree(
                  nodes: nodes,
                  edges: edges,
                  selectedKey: selectedKey,
                  standing: standing,
                  heldKeys: heldSet,
                  flagged: flagged,
                  name: name,
                  onPick: pick,
                  onFocus: (n) => setState(() => _focus = n.key),
                  onClear: () => notifier.select(null),
                );
                // The inspector beside the tree when there is room, as the design has it; beneath otherwise.
                if (details == null || box.maxWidth < 1100) return drawing;
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: drawing),
                    const SizedBox(width: 16),
                    SizedBox(width: 400, child: details),
                  ],
                );
              },
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 4,
              children: [
                for (final r in roles)
                  if (!_hiddenRoles.contains(r.name))
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _Swatch(role: r),
                        const SizedBox(width: 6),
                        Flexible(child: Text(r.label, style: theme.textTheme.bodySmall)),
                      ],
                    ),
              ],
            ),
          ],
          if (details != null && (_list || MediaQuery.sizeOf(context).width < 1100 + 260)) ...[
            const SizedBox(height: 16),
            details,
          ],
          const SizedBox(height: 16),
          report,
        ],
      ),
    );
  }
}

extension on Set<String> {
  void toggle(String value, bool add) => add ? this.add(value) : remove(value);
}

Color _colorOf(PathRole role, ColorScheme scheme) {
  final c = _style[role]!.color;
  return c == null ? scheme.onSurface : Color(c);
}

class _Swatch extends StatelessWidget {
  const _Swatch({required this.role});
  final PathRole role;

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: const Size(26, 10),
    painter: _SwatchPainter(role, _colorOf(role, Theme.of(context).colorScheme)),
  );
}

class _SwatchPainter extends CustomPainter {
  _SwatchPainter(this.role, this.color);
  final PathRole role;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final s = _style[role]!;
    final paint = Paint()
      ..color = color
      ..strokeWidth = s.width
      ..strokeCap = StrokeCap.round;
    final a = Offset(0, size.height / 2);
    final b = Offset(size.width, size.height / 2);
    if (s.dash.isEmpty) {
      canvas.drawLine(a, b, paint);
    } else {
      dashedLine(canvas, a, b, s.dash, paint);
    }
  }

  @override
  bool shouldRepaint(_SwatchPainter old) => old.role != role || old.color != color;
}

// ---------------------------------------------------------------------------------------------------- the tree

class _Tree extends StatefulWidget {
  const _Tree({
    required this.nodes,
    required this.edges,
    required this.selectedKey,
    required this.standing,
    required this.heldKeys,
    required this.flagged,
    required this.name,
    required this.onPick,
    required this.onFocus,
    required this.onClear,
  });
  final List<AbilityNode> nodes;
  final List<PathEdge> edges;
  final String? selectedKey;

  /// Where each ability stands for the character the tree is seen through; null when it is seen through no one.
  final Map<String, Standing>? standing;
  final Set<String> heldKeys;
  final Map<String, String> flagged;
  final String Function(String key) name;
  final ValueChanged<AbilityNode> onPick;
  final ValueChanged<AbilityNode> onFocus;
  final VoidCallback onClear;

  @override
  State<_Tree> createState() => _TreeState();
}

class _TreeState extends State<_Tree> {
  final _controller = TransformationController();
  final _keys = FocusNode(debugLabel: 'Ability tree');
  String? _fittedFor;
  Size _viewport = Size.zero;

  @override
  void dispose() {
    _controller.dispose();
    _keys.dispose();
    super.dispose();
  }

  /// Whether "Fit to view" was asked for: the whole drawing in view, however small. Otherwise the drawing is fitted to
  /// the width, never below [_readable], and what is left over is panned to.
  bool _whole = false;

  static const _readable = 0.6;

  /// The scale the drawing opens at for a view [width] wide.
  static double _opening(double width, Size drawing) => math.min(1.0, width / drawing.width).clamp(_readable, 1.0);

  void _fit(Size box, Size drawing) {
    final scale = _whole
        ? math.min(1.0, math.min(box.width / drawing.width, box.height / drawing.height)).clamp(0.2, 1.0)
        : _opening(box.width, drawing);
    _controller.value = Matrix4.diagonal3Values(scale, scale, 1)
      ..setTranslationRaw(math.max(0, (box.width - drawing.width * scale) / 2), 8, 0);
  }

  /// Zooms about the middle of the view, within the limits the view allows.
  void _zoom(double by) {
    final now = _controller.value.getMaxScaleOnAxis();
    final next = (now * by).clamp(0.2, 3.0);
    final f = next / now;
    final c = Offset(_viewport.width / 2, _viewport.height / 2);
    _controller.value = Matrix4.identity()
      ..translateByDouble(c.dx, c.dy, 0, 1)
      ..scaleByDouble(f, f, 1, 1)
      ..translateByDouble(-c.dx, -c.dy, 0, 1)
      ..multiply(_controller.value);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final layout = treeLayout([for (final n in widget.nodes) n.key], widget.edges);
    // The drawing's own space: every node whole, with room to bend paths back on the right.
    const pad = 24.0;
    final h = _boxHeight(context);
    final origin = Offset(_w / 2 + pad, h / 2 + pad);
    final size = Size(layout.width + pad * 2 + 80, layout.height + pad);
    Offset at(String key) {
      final p = layout.at[key]!;
      return Offset(p.x, p.y) + origin;
    }

    final compact = WindowSize.of(context) == WindowSize.compact;
    final pathCount = widget.edges.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(
          builder: (context, outer) => SizedBox(
            // As tall as the drawing at its opening scale, within limits: no empty frame beneath a short tree.
            height: (size.height * _opening(outer.maxWidth, size) + 16).clamp(260.0, compact ? 440.0 : 560.0),
            child: VaultFrame(
              padding: EdgeInsets.zero,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final box = constraints.biggest;
                    _viewport = box;
                    final key = '${widget.nodes.map((n) => n.key).join(',')}|$pathCount|${box.width.round()}';
                    if (_fittedFor != key) {
                      _fittedFor = key;
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted) _fit(box, size);
                      });
                    }
                    return CallbackShortcuts(
                      bindings: {
                        const SingleActivator(LogicalKeyboardKey.equal): () => _zoom(1.25),
                        const SingleActivator(LogicalKeyboardKey.equal, shift: true): () => _zoom(1.25),
                        const SingleActivator(LogicalKeyboardKey.numpadAdd): () => _zoom(1.25),
                        const SingleActivator(LogicalKeyboardKey.minus): () => _zoom(0.8),
                        const SingleActivator(LogicalKeyboardKey.numpadSubtract): () => _zoom(0.8),
                        const SingleActivator(LogicalKeyboardKey.digit0): () => setState(() {
                          _whole = true;
                          _fittedFor = null;
                        }),
                        const SingleActivator(LogicalKeyboardKey.escape): widget.onClear,
                      },
                      child: Focus(
                        // The drawing takes the keyboard when clicked or tabbed to, with a ring to show it.
                        focusNode: _keys,
                        onFocusChange: (_) => setState(() {}),
                        child: Listener(
                          onPointerDown: (_) => _keys.requestFocus(),
                          child: DecoratedBox(
                            position: DecorationPosition.foreground,
                            decoration: BoxDecoration(
                              border: _keys.hasFocus ? Border.all(color: theme.colorScheme.primary, width: 2) : null,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Semantics(
                              container: true,
                              label:
                                  'Ability paths: ${widget.nodes.length} ${widget.nodes.length == 1 ? 'ability' : 'abilities'} '
                                  'and $pathCount ${pathCount == 1 ? 'path' : 'paths'}, from what comes first at the top. '
                                  'The List view gives every path in words.',
                              child: InteractiveViewer(
                                transformationController: _controller,
                                constrained: false,
                                boundaryMargin: const EdgeInsets.all(400),
                                minScale: 0.2,
                                maxScale: 3,
                                child: SizedBox.fromSize(
                                  size: size,
                                  child: Stack(
                                    children: [
                                      Positioned.fill(
                                        child: CustomPaint(
                                          painter: _PathsPainter(
                                            edges: widget.edges,
                                            at: at,
                                            layout: layout,
                                            scheme: theme.colorScheme,
                                            selectedKey: widget.selectedKey,
                                            boxHeight: h,
                                            held: widget.standing == null ? const {} : widget.heldKeys,
                                          ),
                                        ),
                                      ),
                                      for (final n in widget.nodes)
                                        Positioned(
                                          left: at(n.key).dx - _w / 2,
                                          top: at(n.key).dy - h / 2,
                                          width: _w,
                                          height: h,
                                          child: _Node(
                                            node: n,
                                            selected: n.key == widget.selectedKey,
                                            standing: widget.standing?[n.key],
                                            flag: widget.flagged[n.key],
                                            onTap: () => widget.onPick(n),
                                            onFocus: () => widget.onFocus(n),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        ),
        Wrap(
          alignment: WrapAlignment.end,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              compact ? 'Drag to move; pinch to zoom.' : 'Drag to move; + and − to zoom; 0 to fit; Esc to deselect.',
              style: theme.textTheme.bodySmall,
            ),
            IconButton(tooltip: 'Zoom out', onPressed: () => _zoom(0.8), icon: const Icon(Icons.zoom_out)),
            IconButton(tooltip: 'Zoom in', onPressed: () => _zoom(1.25), icon: const Icon(Icons.zoom_in)),
            TextButton.icon(
              onPressed: () => setState(() {
                _whole = true;
                _fittedFor = null;
              }),
              icon: const Icon(Icons.fit_screen_outlined),
              label: const Text('Fit to view'),
            ),
          ],
        ),
      ],
    );
  }
}

/// The round mark of an ability: glowing in the accent when held, outlined when it can be gained, dark with a padlock
/// when locked. Seen through no one, it is ringed in its source's colour. Each state has its own shape and icon too,
/// so none is told by colour alone.
class _NodeMark extends StatelessWidget {
  const _NodeMark({required this.standing, required this.sourceColor, this.size = _circle, this.selected = false});
  final Standing? standing;
  final Color? sourceColor;
  final double size;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (fill, ring, ringWidth, icon, ink, glow) = switch (standing) {
      Standing.held => (scheme.primary, scheme.primary, 2.0, Icons.auto_awesome, scheme.onPrimary, true),
      Standing.available => (
        scheme.surface,
        scheme.onSurfaceVariant,
        2.0,
        Icons.auto_awesome_outlined,
        scheme.onSurfaceVariant,
        false,
      ),
      Standing.locked => (
        scheme.surfaceContainerHighest,
        scheme.outlineVariant,
        1.5,
        Icons.lock_outline,
        scheme.onSurfaceVariant,
        false,
      ),
      null => (
        scheme.surfaceContainerLow,
        sourceColor ?? scheme.primary,
        2.0,
        Icons.auto_awesome_outlined,
        scheme.onSurface,
        false,
      ),
    };
    final mark = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: fill,
        border: Border.all(color: ring, width: ringWidth),
        boxShadow: glow
            ? [BoxShadow(color: scheme.primary.withValues(alpha: 0.55), blurRadius: size * 0.35, spreadRadius: 1)]
            : null,
      ),
      child: Icon(icon, size: size * 0.5, color: ink),
    );
    if (!selected) return mark;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: scheme.primary, width: 2.5),
      ),
      child: mark,
    );
  }
}

class _Node extends StatelessWidget {
  const _Node({
    required this.node,
    required this.selected,
    required this.standing,
    required this.flag,
    required this.onTap,
    required this.onFocus,
  });
  final AbilityNode node;
  final bool selected;
  final Standing? standing;
  final String? flag;
  final VoidCallback onTap;
  final VoidCallback onFocus;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      selected: selected,
      label:
          '${node.name}, ${node.source}${node.rank != null ? ', rank ${node.rank}' : ''}'
          '${standing != null ? ', ${standing!.label.toLowerCase()}' : ''}'
          '${flag == 'problem' ? ', something does not add up' : ''}',
      onLongPressHint: 'Show only its paths',
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          onLongPress: onFocus,
          child: Column(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  _NodeMark(standing: standing, sourceColor: hexColor(node.color), selected: selected),
                  if (flag != null)
                    Positioned(
                      right: -4,
                      top: -4,
                      child: Container(
                        width: 18,
                        height: 18,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: flag == 'problem' ? scheme.error : scheme.secondaryContainer,
                        ),
                        child: Text(
                          flag == 'problem' ? '!' : '•',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: flag == 'problem' ? scheme.onError : scheme.onSecondaryContainer,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Flexible(
                child: Text(
                  node.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: vaultText(context, size: 14),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PathsPainter extends CustomPainter {
  _PathsPainter({
    required this.edges,
    required this.at,
    required this.layout,
    required this.scheme,
    required this.selectedKey,
    required this.boxHeight,
    required this.held,
  });
  final List<PathEdge> edges;
  final Offset Function(String key) at;
  final TreeLayout layout;
  final ColorScheme scheme;
  final String? selectedKey;
  final double boxHeight;

  /// Abilities held by the character the tree is seen through: the paths between two of them glow.
  final Set<String> held;

  @override
  void paint(Canvas canvas, Size size) {
    // The middle of a node's round mark, at the top of its place.
    Offset centre(String key) => at(key) + Offset(0, -boxHeight / 2 + _circle / 2);
    for (final e in edges) {
      final s = _style[e.role]!;
      final dim = selectedKey != null && e.from != selectedKey && e.to != selectedKey;
      final paint = Paint()
        ..color = _colorOf(e.role, scheme).withValues(alpha: dim ? 0.25 : 1)
        ..strokeWidth = s.width
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round;
      final a = centre(e.from);
      final b = centre(e.to);
      final la = layout.at[e.from]!.layer;
      final lb = layout.at[e.to]!.layer;
      final path = Path();
      Offset end;
      Offset towards;
      if (e.role == PathRole.exclusive) {
        path
          ..moveTo(a.dx, a.dy)
          ..lineTo(b.dx, b.dy);
        end = b;
        towards = a;
      } else if (layout.back.contains(e.id) || lb <= la) {
        final bow = 70 + (b.dy - a.dy).abs() * 0.15;
        final p0 = a + const Offset(_circle / 2, 0);
        final p3 = b + const Offset(_circle / 2, 0);
        path
          ..moveTo(p0.dx, p0.dy)
          ..cubicTo(p0.dx + bow, p0.dy, p3.dx + bow, p3.dy, p3.dx, p3.dy);
        end = p3;
        towards = p3 + Offset(bow, 0);
      } else {
        final y1 = a.dy + _circle / 2;
        final y2 = b.dy - _circle / 2;
        final dy = math.max(30.0, (y2 - y1) / 2);
        path
          ..moveTo(a.dx, y1)
          ..cubicTo(a.dx, y1 + dy, b.dx, y2 - dy, b.dx, y2);
        end = Offset(b.dx, y2);
        towards = Offset(b.dx, y2 - dy);
      }
      // Between two held abilities, a glow in the accent beneath the path's own line.
      // (Holding both ends of an exclusion is a problem, not a path: it never glows.)
      if (e.role != PathRole.exclusive && held.contains(e.from) && held.contains(e.to)) {
        canvas.drawPath(
          path,
          Paint()
            ..color = scheme.primary.withValues(alpha: dim ? 0.2 : 0.55)
            ..strokeWidth = s.width + 7
            ..style = PaintingStyle.stroke
            ..strokeCap = StrokeCap.round
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
        );
      }
      if (s.dash.isEmpty) {
        canvas.drawPath(path, paint);
      } else {
        _dashedPath(canvas, path, s.dash, paint);
      }
      if (s.arrow) {
        final dir = end - towards;
        final len = dir.distance;
        if (len > 0) {
          final u = dir / len;
          final n = Offset(-u.dy, u.dx);
          final head = Path()
            ..moveTo(end.dx, end.dy)
            ..lineTo(end.dx - u.dx * 10 + n.dx * 5, end.dy - u.dy * 10 + n.dy * 5)
            ..lineTo(end.dx - u.dx * 10 - n.dx * 5, end.dy - u.dy * 10 - n.dy * 5)
            ..close();
          canvas.drawPath(head, Paint()..color = paint.color);
        }
      }
      if (e.role == PathRole.other) {
        final mid = Offset((a.dx + b.dx) / 2, (a.dy + b.dy) / 2);
        final tp = TextPainter(
          text: TextSpan(
            text: e.label,
            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
          ),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: 140);
        tp.paint(canvas, mid - Offset(tp.width / 2, tp.height / 2));
      }
    }
  }

  void _dashedPath(Canvas canvas, Path path, List<double> dash, Paint paint) {
    for (final metric in path.computeMetrics()) {
      var d = 0.0;
      var i = 0;
      while (d < metric.length) {
        final len = dash[i % dash.length];
        if (i.isEven) canvas.drawPath(metric.extractPath(d, math.min(d + len, metric.length)), paint);
        d += len;
        i++;
      }
    }
  }

  @override
  bool shouldRepaint(_PathsPainter old) =>
      old.edges != edges ||
      old.layout != layout ||
      old.scheme != scheme ||
      old.selectedKey != selectedKey ||
      old.boxHeight != boxHeight ||
      old.held != held;
}

// ---------------------------------------------------------------------------------------------------- the list

class _PathList extends StatelessWidget {
  const _PathList({
    required this.nodes,
    required this.edges,
    required this.name,
    required this.selectedKey,
    required this.held,
    required this.standing,
    required this.flagged,
    required this.onPick,
  });
  final List<AbilityNode> nodes;
  final List<PathEdge> edges;
  final String Function(String key) name;
  final String? selectedKey;
  final bool Function(AbilityNode n) held;
  final Map<String, Standing>? standing;
  final Map<String, String> flagged;
  final ValueChanged<AbilityNode> onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final groups = <String>{for (final n in nodes) n.source}.toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final source in groups) ...[
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 4),
            child: Semantics(header: true, child: Text(source, style: theme.textTheme.titleMedium)),
          ),
          for (final n in nodes.where((n) => n.source == source))
            Builder(
              builder: (context) {
                final into = edges.where((e) => e.to == n.key && e.role != PathRole.exclusive);
                final out = edges.where((e) => e.from == n.key && e.role != PathRole.exclusive);
                final excl = [
                  for (final e in edges)
                    if (e.role == PathRole.exclusive && (e.from == n.key || e.to == n.key))
                      name(e.from == n.key ? e.to : e.from),
                ];
                final lines = [
                  for (final e in into) pathWords(e, fromSide: false, name: name),
                  for (final e in out) pathWords(e, fromSide: true, name: name),
                  if (excl.isNotEmpty) 'Mutually exclusive with ${excl.join(', ')}',
                  if (n.holders.isNotEmpty) 'Held by ${n.holders.map((h) => '${h.name} (${h.how})').join(', ')}',
                ];
                return ListTile(
                  selected: n.key == selectedKey,
                  contentPadding: EdgeInsets.zero,
                  onTap: () => onPick(n),
                  title: Text(
                    [
                      n.name,
                      if (n.rank != null) n.rank!,
                      if (standing?[n.key] case final st?) st.label.toLowerCase() else if (held(n)) 'held',
                      if (flagged[n.key] == 'problem') 'see what does not add up',
                    ].join(' · '),
                  ),
                  subtitle: lines.isEmpty ? null : Text(lines.join('\n')),
                );
              },
            ),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------------------------------- problems

class _Problems extends StatelessWidget {
  const _Problems({required this.problems, required this.tree, required this.name, required this.onFocus});
  final List<PathProblem> problems;
  final AbilityTree tree;
  final String Function(String key) name;
  final ValueChanged<String> onFocus;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(header: true, child: Text('What does not add up', style: theme.textTheme.titleMedium)),
        const SizedBox(height: 6),
        if (problems.isEmpty) const Text('Nothing.'),
        for (final p in problems)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Wrap(
              spacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Chip(
                  visualDensity: VisualDensity.compact,
                  label: Text(p.severity == 'problem' ? 'Problem' : 'Note'),
                  backgroundColor: p.severity == 'problem' ? theme.colorScheme.errorContainer : null,
                  labelStyle: p.severity == 'problem' ? TextStyle(color: theme.colorScheme.onErrorContainer) : null,
                ),
                Text(p.message),
                if (p.nodes.isNotEmpty)
                  TextButton(
                    onPressed: () => onFocus(p.nodes.first),
                    child: Text('Show ${name(p.nodes.first)}’s paths'),
                  ),
              ],
            ),
          ),
        if (tree.notDrawn.isNotEmpty)
          Text(
            'Not drawn: ${tree.notDrawn.map((x) => 'a “${x.connection.label}” connection (${x.reason})').join('; ')}.',
            style: theme.textTheme.bodySmall,
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------------------------------- details

/// For a selected ability: its rank, requirements and limits, who holds it and how they came by it, every path, and
/// adding or removing a path. A path is a typed connection, saved like any other.
class _Details extends StatefulWidget {
  const _Details({
    required this.model,
    required this.tree,
    required this.node,
    required this.name,
    required this.actions,
    this.standingLine,
    this.standing,
  });
  final StoryModel model;
  final AbilityTree tree;
  final AbilityNode node;
  final String Function(String key) name;
  final CharacterActions actions;

  /// Where it stands for the character the tree is seen through, in words.
  final String? standingLine;
  final Standing? standing;

  @override
  State<_Details> createState() => _DetailsState();
}

class _DetailsState extends State<_Details> {
  String _type = 'prerequisite-for';
  final _own = TextEditingController();
  String? _other;
  bool _out = true;

  @override
  void didUpdateWidget(_Details old) {
    super.didUpdateWidget(old);
    if (old.node.key != widget.node.key) _other = null;
  }

  @override
  void dispose() {
    _own.dispose();
    super.dispose();
  }

  void _add() {
    final target = _other == null ? null : refOf(_other!);
    if (target == null) return;
    final kind = _type == 'own' ? _own.text.trim() : _type;
    if (kind.isEmpty) {
      widget.actions.tell('Name your own kind of path.');
      return;
    }
    final (from, to) = _out ? (widget.node.ref, target) : (target, widget.node.ref);
    final made = widget.actions.now((c) => c.createConnection(from: from, to: to, type: kind));
    if (made != null) {
      setState(() => _other = null);
      widget.actions.tell('Path added.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final node = widget.node;
    final key = node.key;
    final name = widget.name;
    final mine = [
      for (final e in widget.tree.edges)
        if (e.from == key || e.to == key) e,
    ];
    final others = stableSorted([
      for (final n in widget.tree.nodes)
        if (n.key != key) n,
    ], (a, b) => localeCompare(a.name, b.name));
    return VaultFrame(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _NodeMark(standing: widget.standing, sourceColor: hexColor(node.color), size: 40),
              const SizedBox(width: 12),
              Expanded(child: VaultHeading(node.name, size: 20)),
            ],
          ),
          const VaultRule(),
          Text('${node.source}${node.rank != null ? ' · rank ${node.rank}' : ''}', style: theme.textTheme.bodySmall),
          if (widget.standingLine case final line?)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(line, style: vaultText(context, size: 17)),
            ),
          if (node.requires.isNotEmpty) Text('Requirement rule: “${node.requires}”'),
          if (node.limits.isNotEmpty) Text('Limits: ${node.limits.join(' · ')}'),
          const SizedBox(height: 4),
          Text(
            node.holders.isEmpty
                ? 'Nobody is recorded as holding it.'
                : 'Held by ${node.holders.map((h) => '${h.name} (${h.how})').join(', ')}.',
          ),
          for (final a in node.acquired)
            Text(
              '${a.name}: ${switch (a.action) {
                'gain' => 'gained',
                'lose' => 'lost',
                'happen' => 'named in a moment',
                _ => 'held',
              }} ${a.action == 'snapshot' ? a.when : '(${a.when})'}',
              style: theme.textTheme.bodySmall,
            ),
          const SizedBox(height: 8),
          Text('Every path', style: theme.textTheme.labelLarge),
          if (mine.isEmpty) Text('No paths yet.', style: theme.textTheme.bodySmall),
          for (final e in mine)
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${pathWords(e, fromSide: e.from == key, name: name)}${e.linkId == null ? ' (from a blueprint)' : ''}',
                  ),
                ),
                if (e.linkId case final id?)
                  TextButton(
                    onPressed: () {
                      final done = widget.actions.now((c) {
                        c.removeConnection(id);
                        return true;
                      });
                      if (done == true) widget.actions.tell('Path removed.');
                    },
                    child: Text(
                      'Remove',
                      semanticsLabel: 'Remove the path: ${pathWords(e, fromSide: e.from == key, name: name)}',
                    ),
                  ),
              ],
            ),
          const SizedBox(height: 12),
          Text('Add a path', style: theme.textTheme.labelLarge),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 220,
                child: DropdownButtonFormField<bool>(
                  key: ValueKey('way:$key:$_out'),
                  initialValue: _out,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Which way', isDense: true),
                  items: [
                    DropdownMenuItem(
                      value: true,
                      child: Text('From ${node.name} to…', overflow: TextOverflow.ellipsis),
                    ),
                    DropdownMenuItem(
                      value: false,
                      child: Text('To ${node.name} from…', overflow: TextOverflow.ellipsis),
                    ),
                  ],
                  onChanged: (v) => setState(() => _out = v ?? true),
                ),
              ),
              SizedBox(
                width: 240,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('kind:$key:$_type'),
                  initialValue: _type,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Kind of path', isDense: true),
                  items: [
                    for (final t in connectionTypes)
                      if (pathTypes.containsKey(t.key)) DropdownMenuItem(value: t.key, child: Text(t.label)),
                    const DropdownMenuItem(value: 'own', child: Text('Your own…')),
                  ],
                  onChanged: (v) => setState(() => _type = v ?? 'prerequisite-for'),
                ),
              ),
              if (_type == 'own')
                SizedBox(
                  width: 220,
                  child: TextField(
                    controller: _own,
                    decoration: const InputDecoration(
                      labelText: 'Your own kind of path',
                      hintText: 'Unlocks, Teaches, Corrupts into…',
                      isDense: true,
                    ),
                  ),
                ),
              SizedBox(
                width: 260,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('other:$key:$_other'),
                  initialValue: _other,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'The other ability', isDense: true),
                  items: [
                    for (final n in others)
                      DropdownMenuItem(
                        value: n.key,
                        child: Text('${n.name} (${n.source})', overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() => _other = v),
                ),
              ),
              FilledButton.tonal(onPressed: _other == null ? null : _add, child: const Text('Add the path')),
            ],
          ),
        ],
      ),
    );
  }
}
