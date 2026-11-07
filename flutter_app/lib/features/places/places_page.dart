import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/navigate.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/places/explore.dart';
import '../../shared/domain/places/places.dart';
import '../../shared/domain/records/entry.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/portrait.dart' show uploadedImageBytes;
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import 'places_providers.dart';
import 'widgets/place_panels.dart';

/// THE PLACE EXPLORER
/// Every place as a tree, inside what it is located in, at its level, with how much of the story it holds; and, when
/// the novel has one, a map with the places the author has pinned on it. The tree needs no map: a place with no
/// coordinates is as usable as one with them, and a map lists the places it covers that are not on it.
class PlacesPage extends ConsumerStatefulWidget {
  const PlacesPage({super.key});

  @override
  ConsumerState<PlacesPage> createState() => _PlacesPageState();
}

class _PlacesPageState extends ConsumerState<PlacesPage> {
  bool _list = false;
  String? _mapId;
  String? _inside;

  /// The place being put on the map by a tap.
  String? _putting;

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    final data = cast == null ? null : PlaceData(cast.snapshot);
    Widget frame(Widget child) => VizFrame(
      view: 'places',
      title: 'Places',
      config: () => {
        'mode': _list ? 'list' : 'visual',
        'layout': {'pmap': ?_mapId, 'pplace': ?_inside},
      },
      onApply: (JsonMap c) => setState(() {
        final l = mapOrNull(c['layout']) ?? const {};
        _list = c['mode'] == 'list';
        _mapId = strOrNull(l['pmap']);
        _inside = strOrNull(l['pplace']);
      }),
      actions: [
        if (data != null && data.maps.isNotEmpty)
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, icon: Icon(Icons.map_outlined), label: Text('Map')),
              ButtonSegment(value: true, icon: Icon(Icons.account_tree_outlined), label: Text('Tree')),
            ],
            selected: {_list},
            showSelectedIcon: false,
            onSelectionChanged: (v) => setState(() => _list = v.first),
          ),
      ],
      child: child,
    );
    if (cast == null || data == null) return frame(const SizedBox.shrink());
    final model = cast.model;
    final theme = Theme.of(context);
    final actions = PlaceActions(context, cast.novelId);
    final rows = placeTree(model, settings: data.settings, pins: data.pins);
    final tools = Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        OutlinedButton.icon(
          onPressed: () => showDialog<void>(
            context: context,
            builder: (_) => LevelsDialog(actions: actions),
          ),
          icon: const Icon(Icons.layers_outlined),
          label: const Text('Levels of place…'),
        ),
        OutlinedButton.icon(
          onPressed: () => showDialog<void>(
            context: context,
            builder: (_) => MapsDialog(actions: actions),
          ),
          icon: const Icon(Icons.map_outlined),
          label: const Text('Maps…'),
        ),
      ],
    );
    if (rows.isEmpty) {
      return frame(
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            tools,
            const SizedBox(height: 12),
            const EmptyState(
              icon: Icons.place_outlined,
              title: 'No places yet',
              message: 'Add locations under Organize → World; places inside other places are nested here.',
            ),
          ],
        ),
      );
    }
    final byId = {for (final r in rows) r.entry.id: r};
    final inside = byId.containsKey(_inside) ? _inside : null;
    final scoped = inside == null
        ? rows
        : [
            for (final r in rows)
              if (r.entry.id == inside || placesWithin(rows, inside).contains(r.entry.id)) r,
          ];
    final trail = <PlaceRow>[];
    for (
      var at = inside == null ? null : byId[inside];
      at != null;
      at = at.parentId == null ? null : byId[at.parentId]
    ) {
      trail.insert(0, at);
    }
    final keep = matchingKeys(model, viz.filter, [EntityType.entry]);
    final shown = [
      for (final r in scoped)
        if (keep == null || keep.contains('entry:${r.entry.id}')) r,
    ];
    final map = data.maps.where((m) => m.id == _mapId).firstOrNull ?? data.maps.firstOrNull;
    final baseDepth = inside == null ? 0 : byId[inside]!.depth;
    final mapName = {for (final m in data.maps) m.id: m.name};
    final related = viz.selection == null ? null : relatedIds(model, viz.selection!);
    final selected = viz.selection?.type == EntityType.entry && byId.containsKey(viz.selection!.id)
        ? viz.selection!.id
        : null;
    void pick(String id) => notifier.select(EntityRef(EntityType.entry, id));

    final tree = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final r in shown)
          Padding(
            padding: EdgeInsetsDirectional.only(start: 16.0 * (keep == null ? r.depth - baseDepth : 0)),
            child: Card(
              margin: const EdgeInsets.only(bottom: 6),
              color: switch (selectionWords(viz, related, r.entry.id)) {
                'Selected' => theme.colorScheme.secondaryContainer,
                null => null,
                _ => theme.colorScheme.surfaceContainerHighest,
              },
              child: ListTile(
                selected: selected == r.entry.id,
                onTap: () => pick(r.entry.id),
                title: Text(r.entry.name),
                subtitle: Text(
                  [
                    [
                      if (r.levelWords.isNotEmpty) r.levelWords,
                      r.events > 0 ? '${plural(r.events, 'event')} here' : 'no events here yet',
                      if (r.eventsWithin > 0) '${plural(r.eventsWithin, 'event')} within',
                      if (r.characters > 0) plural(r.characters, 'character'),
                      if (r.factions > 0) plural(r.factions, 'faction'),
                      if (r.chapters > 0) plural(r.chapters, 'chapter or scene', 'chapters and scenes'),
                      if (data.maps.isNotEmpty)
                        r.maps.isNotEmpty ? 'on ${r.maps.map((id) => mapName[id]).join(', ')}' : 'no coordinates',
                      ?selectionWords(viz, related, r.entry.id),
                    ].join(' · '),
                    ...r.notes,
                  ].join('\n'),
                ),
              ),
            ),
          ),
      ],
    );

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (data.maps.length > 1 && !_list)
                SizedBox(
                  width: 260,
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('map:${map?.id}'),
                    initialValue: map?.id,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Map shown', isDense: true),
                    items: [for (final m in data.maps) DropdownMenuItem(value: m.id, child: Text(m.name))],
                    onChanged: (v) => setState(() => _mapId = v),
                  ),
                ),
              tools,
            ],
          ),
          if (inside != null) ...[
            const SizedBox(height: 8),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 4,
              children: [
                for (final (i, r) in trail.indexed) ...[
                  if (i > 0) const Text('›'),
                  if (i == trail.length - 1)
                    Text(r.entry.name, style: const TextStyle(fontWeight: FontWeight.w600))
                  else
                    TextButton(onPressed: () => setState(() => _inside = r.entry.id), child: Text(r.entry.name)),
                ],
                OutlinedButton(onPressed: () => setState(() => _inside = null), child: const Text('Show every place')),
              ],
            ),
          ],
          const SizedBox(height: 12),
          if (!_list && map != null) ...[
            PlaceMap(
              model: model,
              rows: scoped,
              map: map,
              pins: data.pins,
              keep: (id) => keep == null || keep.contains('entry:$id'),
              selectedId: selected,
              putting: _putting,
              onPick: pick,
              onPut: (x, y) {
                final id = _putting;
                if (id == null) return;
                final done = actions.places((c) => c.pin(map.id, id, x, y));
                if (done != null) setState(() => _putting = null);
              },
              onCancelPut: () => setState(() => _putting = null),
            ),
            const SizedBox(height: 12),
          ],
          if (shown.isEmpty) NoResultsState(onClear: () => notifier.setFilter({})) else tree,
          if (selected != null) ...[
            const SizedBox(height: 12),
            PlaceDetails(
              model: model,
              data: data,
              entryId: selected,
              actions: actions,
              onExplore: () => setState(() => _inside = selected),
              onPutOnMap: (mapId) => setState(() {
                _mapId = mapId;
                _list = false;
                _putting = selected;
              }),
            ),
          ],
        ],
      ),
    );
  }
}

/// One map: its grid or image, the places pinned on it, and the places it covers that are not on it.
class PlaceMap extends StatefulWidget {
  const PlaceMap({
    super.key,
    required this.model,
    required this.rows,
    required this.map,
    required this.pins,
    required this.keep,
    required this.selectedId,
    required this.putting,
    required this.onPick,
    required this.onPut,
    required this.onCancelPut,
  });
  final StoryModel model;
  final List<PlaceRow> rows;
  final WorldMap map;
  final List<MapPin> pins;
  final bool Function(String id) keep;
  final String? selectedId;
  final String? putting;
  final ValueChanged<String> onPick;
  final void Function(double x, double y) onPut;
  final VoidCallback onCancelPut;

  @override
  State<PlaceMap> createState() => _PlaceMapState();
}

/// About this many drawing units across the larger side of a map, so pins and labels read the same on any map.
const _drawn = 800.0;

class _PlaceMapState extends State<PlaceMap> {
  final _controller = TransformationController();
  String? _fittedFor;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _fit(Size box, Size drawing) {
    final scale = math.min(box.width / drawing.width, box.height / drawing.height).clamp(0.05, 4.0);
    _controller.value = Matrix4.diagonal3Values(scale, scale, 1)
      ..setTranslationRaw((box.width - drawing.width * scale) / 2, (box.height - drawing.height * scale) / 2, 0);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final map = widget.map;
    final on = mapPlaces(widget.rows, map, widget.pins);
    final pinned = [
      for (final p in on.pinned)
        if (widget.keep(p.entry.id)) p,
    ];
    final s = _drawn / math.max(map.width, map.height);
    const pad = 40.0;
    final w = map.width * s;
    final h = map.height * s;
    final size = Size(w + pad * 2, h + pad * 2);
    final image = uploadedImageBytes(map.image);
    final gridLines = map.grid > 0 && map.width / map.grid <= 200 && map.height / map.grid <= 200;
    final compact = WindowSize.of(context) == WindowSize.compact;
    final putting = widget.putting == null ? null : widget.model.entries[widget.putting];
    String words(({Entry entry, MapPin pin, bool outside}) p) =>
        '${p.entry.name}: ${_n(p.pin.x)} across, ${_n(p.pin.y)} down${map.unit.isNotEmpty ? ' ${map.unit}' : ''}'
        '${p.outside ? ', outside the map’s edges' : ''}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (putting != null)
          Card(
            color: theme.colorScheme.tertiaryContainer,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Semantics(liveRegion: true, child: Text('Tap where ${putting.name} is on ${map.name}.')),
                  ),
                  TextButton(onPressed: widget.onCancelPut, child: const Text('Cancel')),
                ],
              ),
            ),
          ),
        SizedBox(
          height: compact ? 380 : 520,
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
                  final key = '${map.id}|${map.width}x${map.height}|${box.width.round()}';
                  if (_fittedFor != key) {
                    _fittedFor = key;
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) _fit(box, size);
                    });
                  }
                  return Semantics(
                    container: true,
                    label:
                        '${map.name}: ${plural(pinned.length, 'place')} placed on it'
                        '${map.unit.isNotEmpty ? ', ${_n(map.width)} by ${_n(map.height)} ${map.unit}' : ''}. '
                        'The tree below lists every place in words.',
                    child: InteractiveViewer(
                      transformationController: _controller,
                      constrained: false,
                      boundaryMargin: const EdgeInsets.all(400),
                      minScale: 0.05,
                      maxScale: 6,
                      child: GestureDetector(
                        onTapUp: putting == null
                            ? null
                            : (d) {
                                double round(double v) => (v * 100).roundToDouble() / 100;
                                widget.onPut(
                                  round((d.localPosition.dx - pad) / s),
                                  round((d.localPosition.dy - pad) / s),
                                );
                              },
                        child: SizedBox.fromSize(
                          size: size,
                          child: Stack(
                            children: [
                              Positioned(
                                left: pad,
                                top: pad,
                                width: w,
                                height: h,
                                child: image != null
                                    ? Image.memory(image, fit: BoxFit.fill, gaplessPlayback: true)
                                    : ColoredBox(color: theme.colorScheme.surfaceContainerLow),
                              ),
                              Positioned.fill(
                                child: IgnorePointer(
                                  child: CustomPaint(
                                    painter: _GridPainter(
                                      origin: const Offset(pad, pad),
                                      width: w,
                                      height: h,
                                      step: gridLines ? map.grid * s : 0,
                                      line: theme.colorScheme.outlineVariant,
                                      edge: theme.colorScheme.outline,
                                    ),
                                  ),
                                ),
                              ),
                              for (final p in pinned)
                                Positioned(
                                  left: pad + p.pin.x * s - 9,
                                  top: pad + p.pin.y * s - 9,
                                  child: Semantics(
                                    button: true,
                                    selected: widget.selectedId == p.entry.id,
                                    label: words(p),
                                    excludeSemantics: true,
                                    child: GestureDetector(
                                      onTap: putting != null ? null : () => widget.onPick(p.entry.id),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Container(
                                            width: 18,
                                            height: 18,
                                            decoration: BoxDecoration(
                                              shape: BoxShape.circle,
                                              color: theme.colorScheme.primary,
                                              border: Border.all(
                                                color: widget.selectedId == p.entry.id
                                                    ? theme.colorScheme.onSurface
                                                    : theme.colorScheme.surface,
                                                width: widget.selectedId == p.entry.id ? 3 : 2,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 4),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 4),
                                            color: theme.colorScheme.surface.withValues(alpha: 0.75),
                                            child: Text(p.entry.name, style: theme.textTheme.labelMedium),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                            ],
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
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton.icon(
            onPressed: () => setState(() => _fittedFor = null),
            icon: const Icon(Icons.fit_screen_outlined),
            label: const Text('Fit to view'),
          ),
        ),
        Text(
          [
            'A dot is a place, where you put it.',
            if (gridLines) 'A grid line every ${_n(map.grid)}${map.unit.isNotEmpty ? ' ${map.unit}' : ''}.',
            'The outline is the map’s edge.',
          ].join(' '),
          style: theme.textTheme.bodySmall,
        ),
        if (on.missing.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text('Not on this map (${on.missing.length}), still in the tree:', style: theme.textTheme.bodySmall),
          Wrap(
            spacing: 4,
            children: [
              for (final e in on.missing) ActionChip(label: Text(e.name), onPressed: () => widget.onPick(e.id)),
            ],
          ),
          Text('Select one to give it coordinates.', style: theme.textTheme.bodySmall),
        ],
        if (on.pinned.any((p) => p.outside))
          Text(
            'Outside the map’s edges: ${on.pinned.where((p) => p.outside).map((p) => p.entry.name).join(', ')}.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
          ),
      ],
    );
  }
}

String _n(double v) => v == v.roundToDouble() ? v.round().toString() : '$v';

class _GridPainter extends CustomPainter {
  _GridPainter({
    required this.origin,
    required this.width,
    required this.height,
    required this.step,
    required this.line,
    required this.edge,
  });
  final Offset origin;
  final double width;
  final double height;
  final double step;
  final Color line;
  final Color edge;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = line
      ..strokeWidth = 1;
    if (step > 0) {
      for (var x = step; x < width; x += step) {
        canvas.drawLine(origin + Offset(x, 0), origin + Offset(x, height), paint);
      }
      for (var y = step; y < height; y += step) {
        canvas.drawLine(origin + Offset(0, y), origin + Offset(width, y), paint);
      }
    }
    canvas.drawRect(
      origin & Size(width, height),
      Paint()
        ..color = edge
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(_GridPainter old) =>
      old.step != step || old.width != width || old.height != height || old.line != line;
}
