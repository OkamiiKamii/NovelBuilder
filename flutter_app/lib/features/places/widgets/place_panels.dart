import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format.dart';
import '../../../core/widgets/confirm_dialog.dart';
import '../../../core/widgets/saved_text_field.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/collation.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/model/entity_ref.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/places/explore.dart';
import '../../../shared/domain/places/places.dart';
import '../../../shared/domain/records/link.dart';
import '../../../shared/domain/stable_sort.dart';
import '../../../shared/domain/timeline/narrative.dart' show nodeLabel;
import '../../characters/characters_providers.dart';
import '../../characters/data/portrait_image.dart' show UnreadableImage;
import '../../plot/plot_providers.dart';
import '../../relationships/relationship_page.dart' show relate;
import '../../timeline/timeline_providers.dart';
import '../data/map_image.dart';
import '../places_providers.dart';

/// The novel's levels of place, largest first: from a set to start with, or the author's own. A level some place has
/// cannot be removed.
class LevelsDialog extends ConsumerStatefulWidget {
  const LevelsDialog({super.key, required this.actions});
  final PlaceActions actions;

  @override
  ConsumerState<LevelsDialog> createState() => _LevelsDialogState();
}

class _LevelsDialogState extends ConsumerState<LevelsDialog> {
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final theme = Theme.of(context);
    final actions = widget.actions;
    final levels = cast == null ? const <PlaceLevel>[] : PlaceData(cast.snapshot).settings?.levels ?? const [];
    int using(String id) => cast?.model.entries.values.where((e) => e.placeLevel == id).length ?? 0;
    void save(List<PlaceLevel> next) =>
        actions.places((c) => c.setLevels([for (final l in next) (id: l.id, name: l.name)]));
    return AlertDialog(
      title: const Text('Levels of place'),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'How large each kind of place is in this novel, largest first: a universe, a planet, a city, a room, or '
                'your own. A place’s level is set on it; nothing needs one.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final p in levelPresets)
                    ActionChip(
                      tooltip: p.levels.join(', '),
                      label: Text(levels.isEmpty ? 'Start from “${p.name}”' : 'Add the levels of “${p.name}”'),
                      onPressed: () {
                        final done = actions.places((c) => c.applyPreset(p.id));
                        if (done != null) {
                          actions.tell(
                            levels.isEmpty
                                ? 'Started from “${p.name}”.'
                                : 'Added the levels of “${p.name}” that were missing.',
                          );
                        }
                      },
                    ),
                ],
              ),
              const SizedBox(height: 8),
              if (levels.isEmpty) const Text('No levels yet.'),
              for (final (i, level) in levels.indexed)
                Row(
                  children: [
                    Expanded(
                      child: SavedTextField(
                        key: ValueKey('level:${level.id}'),
                        label: 'Level ${i + 1} name',
                        value: level.name,
                        dense: true,
                        onChanged: (v) {
                          if (v.trim().isEmpty || v.trim() == level.name) return;
                          actions.placesLater(
                            'level:${level.id}',
                            (c) => c.setLevels([
                              for (final l in c.settings()?.levels ?? const <PlaceLevel>[])
                                (id: l.id, name: l.id == level.id ? v : l.name),
                            ]),
                          );
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(plural(using(level.id), 'place'), style: theme.textTheme.bodySmall),
                    IconButton(
                      tooltip: 'Move ${level.name} up',
                      onPressed: i == 0
                          ? null
                          : () => save(
                              [...levels]
                                ..insert(i - 1, levels[i])
                                ..removeAt(i + 1),
                            ),
                      icon: const Icon(Icons.arrow_upward),
                    ),
                    IconButton(
                      tooltip: 'Move ${level.name} down',
                      onPressed: i == levels.length - 1
                          ? null
                          : () => save(
                              [...levels]
                                ..insert(i + 2, levels[i])
                                ..removeAt(i),
                            ),
                      icon: const Icon(Icons.arrow_downward),
                    ),
                    IconButton(
                      tooltip: 'Remove ${level.name}',
                      onPressed: () => save([
                        for (final l in levels)
                          if (l.id != level.id) l,
                      ]),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _name,
                      decoration: const InputDecoration(
                        labelText: 'New level',
                        hintText: 'A level of your own, e.g. Sector',
                        isDense: true,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.tonal(
                    onPressed: _name.text.trim().isEmpty
                        ? null
                        : () {
                            final done = actions.places(
                              (c) => c.setLevels([
                                for (final l in c.settings()?.levels ?? const <PlaceLevel>[]) (id: l.id, name: l.name),
                                (id: null, name: _name.text),
                              ]),
                            );
                            if (done != null) setState(_name.clear);
                          },
                    child: const Text('Add'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done'))],
    );
  }
}

/// The novel's maps: each of the whole world or of one place, over a grid or an image from the author's device.
class MapsDialog extends ConsumerStatefulWidget {
  const MapsDialog({super.key, required this.actions});
  final PlaceActions actions;

  @override
  ConsumerState<MapsDialog> createState() => _MapsDialogState();
}

class _MapsDialogState extends ConsumerState<MapsDialog> {
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final theme = Theme.of(context);
    final data = cast == null ? null : PlaceData(cast.snapshot);
    return AlertDialog(
      title: const Text('Maps'),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'A map is optional: every place is in the tree whether it has coordinates or not. A map is drawn over a '
                'grid, or over an image you choose from this device; it stays in this novel and is never sent anywhere. '
                'Coordinates are in the map’s own units, across from the left and down from the top.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              if (data == null || data.maps.isEmpty) const Text('No maps yet.'),
              if (cast != null && data != null)
                for (final m in data.maps)
                  _MapFields(key: ValueKey(m.id), model: cast.model, map: m, pins: data.pins, actions: widget.actions),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _name,
                      decoration: const InputDecoration(
                        labelText: 'New map name',
                        hintText: 'A new map, e.g. The Known World',
                        isDense: true,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.tonal(
                    onPressed: _name.text.trim().isEmpty
                        ? null
                        : () {
                            final name = _name.text.trim();
                            final made = widget.actions.places((c) => c.saveMap(null, name: name));
                            if (made != null) {
                              widget.actions.tell('Made the map “$name”.');
                              setState(_name.clear);
                            }
                          },
                    child: const Text('Make the map'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done'))],
    );
  }
}

class _MapFields extends StatelessWidget {
  const _MapFields({super.key, required this.model, required this.map, required this.pins, required this.actions});
  final StoryModel model;
  final WorldMap map;
  final List<MapPin> pins;
  final PlaceActions actions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final places = stableSorted(model.entries.values.where(isPlace), (a, b) => localeCompare(a.name, b.name));
    final count = pins.where((p) => p.mapId == map.id).length;
    String n(double v) => v == v.roundToDouble() ? v.round().toString() : '$v';
    Widget number(String label, double value, void Function(double v) save) => SizedBox(
      width: 110,
      child: SavedTextField(
        key: ValueKey('${map.id}:$label'),
        label: label,
        value: n(value),
        dense: true,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        onChanged: (t) {
          final v = double.tryParse(t.trim());
          if (v != null && v != value) save(v);
        },
      ),
    );
    return Card.outlined(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 240,
              child: SavedTextField(
                key: ValueKey('${map.id}:name'),
                label: 'Name',
                value: map.name,
                dense: true,
                onChanged: (t) {
                  if (t.trim().isNotEmpty) actions.placesLater('${map.id}:name', (c) => c.saveMap(map.id, name: t));
                },
              ),
            ),
            SizedBox(
              width: 240,
              child: DropdownButtonFormField<String>(
                key: ValueKey('${map.id}:of:${map.placeId}'),
                initialValue: map.placeId ?? '',
                isExpanded: true,
                decoration: InputDecoration(labelText: 'What ${map.name} is a map of', isDense: true),
                items: [
                  const DropdownMenuItem(value: '', child: Text('The whole world')),
                  for (final p in places) DropdownMenuItem(value: p.id, child: Text(p.name)),
                ],
                onChanged: (v) =>
                    actions.places((c) => c.saveMap(map.id, placeId: (value: v == null || v.isEmpty ? null : v))),
              ),
            ),
            number('Width', map.width, (v) => actions.placesLater('${map.id}:w', (c) => c.saveMap(map.id, width: v))),
            number(
              'Height',
              map.height,
              (v) => actions.placesLater('${map.id}:h', (c) => c.saveMap(map.id, height: v)),
            ),
            SizedBox(
              width: 140,
              child: SavedTextField(
                key: ValueKey('${map.id}:unit'),
                label: 'Unit',
                hint: 'leagues, km, squares…',
                value: map.unit,
                dense: true,
                onChanged: (t) => actions.placesLater('${map.id}:unit', (c) => c.saveMap(map.id, unit: t)),
              ),
            ),
            number(
              'Grid every',
              map.grid,
              (v) => actions.placesLater('${map.id}:g', (c) => c.saveMap(map.id, grid: v)),
            ),
            OutlinedButton.icon(
              onPressed: () => _chooseImage(context, count),
              icon: const Icon(Icons.image_outlined),
              label: Text(map.image != null ? 'Change the background image' : 'Choose a background image'),
            ),
            if (map.image != null)
              TextButton(
                onPressed: () {
                  final done = actions.places((c) {
                    c.setImage(map.id, null);
                    return true;
                  });
                  if (done == true) actions.tell('Background image removed.');
                },
                child: const Text('Remove the image'),
              ),
            TextButton(
              style: TextButton.styleFrom(foregroundColor: theme.colorScheme.error),
              onPressed: () async {
                final ok = await showConfirmDialog(
                  context,
                  title: 'Delete this map?',
                  message:
                      'Delete the map “${map.name}” and its ${plural(count, 'pin')}? The places themselves are kept, in '
                      'the tree and on any other map.',
                  confirmLabel: 'Delete the map',
                  destructive: true,
                );
                if (ok) {
                  actions.places((c) {
                    c.removeMap(map.id);
                    return true;
                  });
                }
              },
              child: Text('Delete ${map.name}'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _chooseImage(BuildContext context, int count) async {
    final files = ProviderScope.containerOf(context, listen: false).read(backupFilesProvider);
    final picked = await files.pickImage();
    if (picked == null) return;
    try {
      final image = await mapImage(picked.bytes);
      final done = actions.places((c) {
        c.setImage(map.id, image.url);
        // With nothing placed on it yet, the map takes the image's proportions, so the picture is not stretched.
        if (count == 0 && image.width > 0 && image.height > 0) {
          c.saveMap(map.id, height: (map.width * (image.height / image.width) * 100).roundToDouble() / 100);
        }
        return true;
      });
      if (done == true) actions.tell('Background image set. It stays in this novel, on this device.');
    } on UnreadableImage catch (e) {
      actions.tell('$e');
    } on ImageTooLarge catch (e) {
      actions.tell('$e');
    }
  }
}

/// For a selected place: its level, what it is in, what it is tied to (characters, factions, events, chapters), tying
/// more to it, and where it is on each map. Every change goes through the service that keeps that record.
class PlaceDetails extends StatefulWidget {
  const PlaceDetails({
    super.key,
    required this.model,
    required this.data,
    required this.entryId,
    required this.actions,
    required this.onExplore,
    required this.onPutOnMap,
  });
  final StoryModel model;
  final PlaceData data;
  final String entryId;
  final PlaceActions actions;
  final VoidCallback onExplore;
  final ValueChanged<String> onPutOnMap;

  @override
  State<PlaceDetails> createState() => _PlaceDetailsState();
}

const _tieKinds = ['located-in', 'controls', 'influences', 'owns', 'leads', 'related'];

class _PlaceDetailsState extends State<PlaceDetails> {
  String? _record;
  String _type = 'located-in';
  String? _event;
  String? _node;

  @override
  void didUpdateWidget(PlaceDetails old) {
    super.didUpdateWidget(old);
    if (old.entryId != widget.entryId) {
      _record = null;
      _event = null;
      _node = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final model = widget.model;
    final data = widget.data;
    final actions = widget.actions;
    final id = widget.entryId;
    final entry = model.entries[id]!;
    final rows = placeTree(model, settings: data.settings, pins: data.pins);
    final row = rows.where((r) => r.entry.id == id).firstOrNull;
    final within = placesWithin(rows, id).toSet();
    final links = placeLinks(model, id);
    final levels = data.settings?.levels ?? const <PlaceLevel>[];
    final others = stableSorted(
      model.entries.values.where((e) => e.category != 'location'),
      (a, b) => localeCompare(a.name, b.name),
    );
    final chapters = stableSorted(
      model.nodes.values.where((n) => model.order.position.containsKey(n.id)),
      (a, b) => model.order.position[a.id]!.compareTo(model.order.position[b.id]!),
    );
    final events = stableSorted(
      model.events.values.where((e) => e.locationId != id),
      (a, b) => localeCompare(a.name, b.name),
    );
    Widget listOf(String title, List<String> items) => items.isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.labelLarge),
                for (final i in items) Text('• $i'),
              ],
            ),
          );
    String tiedWords(Tied t) => '${t.entry.name}: ${t.how.join('; ')}';

    return Card.outlined(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(header: true, child: Text(entry.name, style: theme.textTheme.titleMedium)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                SizedBox(
                  width: 220,
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('level:$id:${entry.placeLevel}'),
                    initialValue: levels.any((l) => l.id == entry.placeLevel) ? entry.placeLevel : '',
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Level of place', isDense: true),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('Not set')),
                      for (final l in levels) DropdownMenuItem(value: l.id, child: Text(l.name)),
                    ],
                    onChanged: (v) => actions.places((c) => c.setLevel(id, v == null || v.isEmpty ? null : v)),
                  ),
                ),
                SizedBox(
                  width: 260,
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('in:$id:${row?.parentId}'),
                    initialValue: row?.parentId ?? '',
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Located in', isDense: true),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('Nothing (at the top)')),
                      for (final r in rows)
                        if (r.entry.id != id && !within.contains(r.entry.id))
                          DropdownMenuItem(
                            value: r.entry.id,
                            child: Text('${'  ' * r.depth}${r.entry.name}', overflow: TextOverflow.ellipsis),
                          ),
                    ],
                    onChanged: (v) => actions.places((c) => c.setParent(id, v == null || v.isEmpty ? null : v)),
                  ),
                ),
              ],
            ),
            if (levels.isEmpty)
              Text('No levels of place yet: set them under “Levels of place…”.', style: theme.textTheme.bodySmall),
            if (row != null && row.childIds.isNotEmpty)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(onPressed: widget.onExplore, child: Text('Explore what is inside ${entry.name}')),
              ),
            listOf('Characters', links.characters.map(tiedWords).toList()),
            listOf('Factions', links.factions.map(tiedWords).toList()),
            listOf('Other records', links.others.map(tiedWords).toList()),
            listOf('Events here', [for (final e in links.events) e.name]),
            if (row != null && row.eventsWithin > 0)
              Text('${plural(row.eventsWithin, 'event')} in places inside it.', style: theme.textTheme.bodySmall),
            listOf('Chapters and scenes', [
              for (final c in links.chapters) '${nodeLabel(model, c.node.id)}: ${c.how.join('; ')}',
            ]),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: Text('Tie something to ${entry.name}'),
              childrenPadding: const EdgeInsets.only(bottom: 8),
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SizedBox(
                      width: 260,
                      child: DropdownButtonFormField<String>(
                        key: ValueKey('record:$id:$_record'),
                        initialValue: _record,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Record to tie', isDense: true),
                        hint: const Text('A character, faction or other record…'),
                        items: [
                          for (final e in others)
                            DropdownMenuItem(
                              value: e.id,
                              child: Text(e.name, overflow: TextOverflow.ellipsis),
                            ),
                        ],
                        onChanged: (v) => setState(() => _record = v),
                      ),
                    ),
                    SizedBox(
                      width: 260,
                      child: DropdownButtonFormField<String>(
                        key: ValueKey('type:$id:$_type'),
                        initialValue: _type,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'How it is tied', isDense: true),
                        items: [
                          for (final t in _tieKinds)
                            DropdownMenuItem(value: t, child: Text('${connectionType(t).label} ${entry.name}')),
                        ],
                        onChanged: (v) => setState(() => _type = v ?? 'located-in'),
                      ),
                    ),
                    FilledButton.tonal(
                      onPressed: _record == null
                          ? null
                          : () {
                              final made = relate(
                                actions,
                                (r) => r.createConnection(
                                  from: EntityRef(EntityType.entry, _record!),
                                  to: EntityRef(EntityType.entry, id),
                                  type: _type,
                                ),
                              );
                              if (made != null) {
                                setState(() => _record = null);
                                actions.tell('Tied.');
                              }
                            },
                      child: const Text('Tie it'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SizedBox(
                      width: 300,
                      child: DropdownButtonFormField<String>(
                        key: ValueKey('event:$id:$_event'),
                        initialValue: _event,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Event that takes place here', isDense: true),
                        items: [
                          for (final e in events)
                            DropdownMenuItem(
                              value: e.id,
                              child: Text(e.name, overflow: TextOverflow.ellipsis),
                            ),
                        ],
                        onChanged: (v) => setState(() => _event = v),
                      ),
                    ),
                    FilledButton.tonal(
                      onPressed: _event == null
                          ? null
                          : () {
                              final done = TimelineActions(context, actions.novelId).edit((c) {
                                c.updateEvent(_event!, (_) => {'locationId': id});
                                return true;
                              });
                              if (done == true) {
                                setState(() => _event = null);
                                actions.tell('The event now takes place here.');
                              }
                            },
                      child: const Text('Set'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SizedBox(
                      width: 300,
                      child: DropdownButtonFormField<String>(
                        key: ValueKey('node:$id:$_node'),
                        initialValue: _node,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'A chapter or scene set here (its plan)',
                          isDense: true,
                        ),
                        items: [
                          for (final n in chapters)
                            DropdownMenuItem(
                              value: n.id,
                              child: Text(nodeLabel(model, n.id), overflow: TextOverflow.ellipsis),
                            ),
                        ],
                        onChanged: (v) => setState(() => _node = v),
                      ),
                    ),
                    FilledButton.tonal(
                      onPressed: _node == null
                          ? null
                          : () {
                              final node = _node!;
                              final done = PlotActions(context, actions.novelId).edit((c) {
                                c.updatePlan(
                                  node,
                                  (plan) => {
                                    'entityIds': {...strings(plan['entityIds']), id}.toList(),
                                  },
                                );
                                return true;
                              });
                              if (done == true) {
                                setState(() => _node = null);
                                actions.tell('Added to the chapter’s plan.');
                              }
                            },
                      child: const Text('Add'),
                    ),
                  ],
                ),
              ],
            ),
            if (data.maps.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('On the maps', style: theme.textTheme.labelLarge),
              for (final m in data.maps)
                _Coordinates(
                  key: ValueKey('coords:$id:${m.id}'),
                  name: entry.name,
                  map: m,
                  pin: data.pins.where((p) => p.mapId == m.id && p.entryId == id).firstOrNull,
                  actions: actions,
                  entryId: id,
                  onTapMap: () => widget.onPutOnMap(m.id),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Coordinates extends StatefulWidget {
  const _Coordinates({
    super.key,
    required this.name,
    required this.map,
    required this.pin,
    required this.actions,
    required this.entryId,
    required this.onTapMap,
  });
  final String name;
  final WorldMap map;
  final MapPin? pin;
  final PlaceActions actions;
  final String entryId;
  final VoidCallback onTapMap;

  @override
  State<_Coordinates> createState() => _CoordinatesState();
}

class _CoordinatesState extends State<_Coordinates> {
  late final _x = TextEditingController(text: _n(widget.pin?.x));
  late final _y = TextEditingController(text: _n(widget.pin?.y));

  static String _n(double? v) => v == null ? '' : (v == v.roundToDouble() ? v.round().toString() : '$v');

  @override
  void didUpdateWidget(_Coordinates old) {
    super.didUpdateWidget(old);
    if (old.pin?.x != widget.pin?.x || old.pin?.y != widget.pin?.y) {
      _x.text = _n(widget.pin?.x);
      _y.text = _n(widget.pin?.y);
    }
  }

  @override
  void dispose() {
    _x.dispose();
    _y.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.map;
    final pin = widget.pin;
    final numbers = [FilteringTextInputFormatter.allow(RegExp(r'[-0-9.]'))];
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text('${m.name}${pin == null ? ': no coordinates' : ''}'),
          for (final (c, label) in [(_x, 'across'), (_y, 'down')])
            SizedBox(
              width: 90,
              child: Semantics(
                label: '${m.name}: $label',
                child: TextField(
                  controller: c,
                  inputFormatters: numbers,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  decoration: InputDecoration(labelText: label == 'across' ? 'Across' : 'Down', isDense: true),
                ),
              ),
            ),
          FilledButton.tonal(
            onPressed: () {
              final x = double.tryParse(_x.text.trim());
              final y = double.tryParse(_y.text.trim());
              if (x == null || y == null) return widget.actions.tell('Give both coordinates.');
              final done = widget.actions.places((c) => c.pin(m.id, widget.entryId, x, y));
              if (done != null) widget.actions.tell('Placed on ${m.name}.');
            },
            child: Text(pin == null ? 'Place' : 'Move'),
          ),
          TextButton(onPressed: widget.onTapMap, child: const Text('by tapping the map')),
          if (pin != null)
            TextButton(
              onPressed: () {
                final done = widget.actions.places((c) {
                  c.unpin(m.id, widget.entryId);
                  return true;
                });
                if (done == true) widget.actions.tell('Taken off ${m.name}.');
              },
              child: const Text('Take it off'),
            ),
        ],
      ),
    );
  }
}
