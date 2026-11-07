import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/records/system.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/systems/compute.dart' show curveTable;
import '../../shared/domain/systems/system_presets.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import '../workspace/organize_switch.dart';
import 'progression_providers.dart';
import 'widgets/sheet_editor.dart';
import 'widgets/sheet_view.dart';

const _tabs = {
  'variables': 'Attributes & resources',
  'tracks': 'Levels & realms',
  'kits': 'Classes, skills & more',
  'tables': 'Tables',
  'sheets': 'Sheets',
};

const _kindLabels = {'number': 'Attribute', 'resource': 'Resource pool', 'derived': 'Formula', 'choice': 'Choice'};
const _ops = {'add': '+', 'multiply': '×', 'set': '='};

/// SYSTEMS: the novel's own blueprints for how characters grow, where nothing is a fixed game concept. Variables,
/// tracks, groups ("Classes", "Titles", "Mutations"…), ranks, units and formulas are all named and shaped by the
/// author. A character's sheet keeps only what is its own; everything else is read from its blueprint.
class SystemsPage extends ConsumerStatefulWidget {
  const SystemsPage({super.key, this.systemId, this.tab, this.sheetId});
  final String? systemId;
  final String? tab;
  final String? sheetId;

  @override
  ConsumerState<SystemsPage> createState() => _SystemsPageState();
}

class _SystemsPageState extends ConsumerState<SystemsPage> {
  late String? _systemId = widget.systemId;
  late String _tab = _tabs.containsKey(widget.tab) ? widget.tab! : 'variables';
  late String? _sheetId = widget.sheetId;

  @override
  void didUpdateWidget(SystemsPage old) {
    super.didUpdateWidget(old);
    if (old.systemId != widget.systemId) _systemId = widget.systemId;
    if (old.tab != widget.tab && _tabs.containsKey(widget.tab)) _tab = widget.tab!;
    if (old.sheetId != widget.sheetId) _sheetId = widget.sheetId;
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    if (cast == null) return const PageScaffold(title: 'Systems', child: SizedBox.shrink());
    final theme = Theme.of(context);
    final model = cast.model;
    final actions = ProgressionActions(context, cast.novelId);
    final systems = stableSorted(model.systems.values, (a, b) {
      final c = a.createdAt.compareTo(b.createdAt);
      return c != 0 ? c : localeCompare(a.name, b.name);
    });
    final system = systems.where((s) => s.id == _systemId).firstOrNull ?? systems.firstOrNull;

    void create(JsonMap content) {
      final made = actions.systems((x) => x.createSystem(content));
      if (made != null) setState(() => _systemId = made.id);
    }

    final start = Wrap(
      spacing: 8,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        FilledButton.tonalIcon(
          onPressed: () => create(blankBlueprint),
          icon: const Icon(Icons.add),
          label: const Text('A blank system'),
        ),
        PopupMenuButton<SystemPreset>(
          tooltip: 'Start from a preset',
          onSelected: (p) => create(p.content),
          itemBuilder: (_) => [
            for (final p in systemPresets)
              PopupMenuItem(
                value: p,
                child: ListTile(title: Text(p.name), subtitle: Text(p.description)),
              ),
          ],
          // At least 48 pixels tall, so it is easy to tap.
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: Text('Or start from a preset…', style: TextStyle(color: theme.colorScheme.primary)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );

    return PageScaffold(
      title: 'Systems',
      subtitle: cast.novelTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: OrganizeSwitch(current: OrganizePart.systems),
          ),
          const SizedBox(height: 12),
          if (system == null)
            EmptyState(
              icon: Icons.account_tree_outlined,
              title: 'No systems yet',
              message:
                  'For a novel with a worked-out system (a game system, cultivation realms, hard magic): start blank or '
                  'from a preset, and change anything.',
              action: start,
            )
          else ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final s in systems)
                  ChoiceChip(
                    label: Text(s.name),
                    selected: s.id == system.id,
                    onSelected: (_) => setState(() => _systemId = s.id),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            start,
            const SizedBox(height: 16),
            _BlueprintHead(system: system, actions: actions, onDeleted: () => setState(() => _systemId = null)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final MapEntry(:key, :value) in _tabs.entries)
                  ChoiceChip(
                    label: Text('$value (${_count(system, model, key)})'),
                    selected: _tab == key,
                    onSelected: (_) => setState(() => _tab = key),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            switch (_tab) {
              'variables' => _VariablesTab(system: system, actions: actions),
              'tracks' => _TracksTab(system: system, actions: actions),
              'kits' => _KitsTab(system: system, actions: actions),
              'tables' => _TablesTab(system: system, actions: actions),
              _ => _SheetsTab(
                model: model,
                system: system,
                actions: actions,
                sheetId: _sheetId,
                onSelect: (id) => setState(() => _sheetId = id),
              ),
            },
          ],
        ],
      ),
    );
  }

  static int _count(SystemBlueprint s, StoryModel model, String tab) => switch (tab) {
    'variables' => s.variables.length,
    'tracks' => s.tracks.length,
    'kits' => s.items.length,
    'tables' => s.matrices.length,
    _ => model.sheets.where((x) => x.systemId == s.id).length,
  };
}

// ---------------------------------------------------------------------------------------------------- list editing

List<JsonMap> _list(SystemBlueprint s, String key) => [for (final m in maps(s.raw[key])) m];
List<JsonMap> _patch(List<JsonMap> all, String id, JsonMap change) => [
  for (final m in all) m['id'] == id ? {...m, ...change} : m,
];
List<JsonMap> _without(List<JsonMap> all, String id) => [
  for (final m in all)
    if (m['id'] != id) m,
];
List<JsonMap> _moved(List<JsonMap> all, String id, int by) {
  final out = [...all];
  final at = out.indexWhere((m) => m['id'] == id);
  final to = at + by;
  if (at < 0 || to < 0 || to >= out.length) return out;
  final m = out.removeAt(at);
  out.insert(to, m);
  return out;
}

List<String> _split(String text) => [
  for (final s in text.split(','))
    if (s.trim().isNotEmpty) s.trim(),
];

class _RowTools extends StatelessWidget {
  const _RowTools({
    required this.name,
    required this.first,
    required this.last,
    required this.onMove,
    required this.onRemove,
  });
  final String name;
  final bool first;
  final bool last;
  final void Function(int by) onMove;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      IconButton(
        tooltip: 'Move $name up',
        onPressed: first ? null : () => onMove(-1),
        icon: const Icon(Icons.arrow_upward),
      ),
      IconButton(
        tooltip: 'Move $name down',
        onPressed: last ? null : () => onMove(1),
        icon: const Icon(Icons.arrow_downward),
      ),
      IconButton(tooltip: 'Remove $name', onPressed: onRemove, icon: const Icon(Icons.close)),
    ],
  );
}

/// Taking items out of a blueprint takes the paths recorded to or from them, and the sheets that hold them stop
/// holding them. When anything would go, the author is told what first; nothing else is asked.
Future<bool> _removing(BuildContext context, SystemBlueprint system, Set<String> itemIds, String what) async {
  if (itemIds.isEmpty) return true;
  final model = ProviderScope.containerOf(context, listen: false).read(castProvider)?.model;
  if (model == null) return false;
  final refs = {for (final id in itemIds) abilityId(system.id, id)};
  final paths = model.links
      .where(
        (l) =>
            (l.fromType == EntityType.ability && refs.contains(l.fromId)) ||
            (l.toType == EntityType.ability && refs.contains(l.toId)),
      )
      .length;
  final holders = model.sheets.where((s) => s.systemId == system.id && s.itemIds.any(itemIds.contains)).length;
  if (itemIds.length == 1 && paths == 0 && holders == 0) return true;
  if (!context.mounted) return false;
  return showConfirmDialog(
    context,
    title: 'Remove $what?',
    message: [
      if (itemIds.length > 1) '${itemIds.length} items go with it.',
      if (paths > 0)
        '$paths recorded ${paths == 1 ? 'path goes' : 'paths go'} with ${itemIds.length > 1 ? 'them' : 'it'}.',
      if (holders > 0)
        '${holders == 1 ? '1 sheet holds' : '$holders sheets hold'} ${itemIds.length > 1 ? 'some of them' : 'it'}, and will no longer. '
            'Snapshots keep what they recorded.',
    ].join(' '),
    confirmLabel: 'Remove',
    destructive: true,
  );
}

// ---------------------------------------------------------------------------------------------------- head

class _BlueprintHead extends StatelessWidget {
  const _BlueprintHead({required this.system, required this.actions, required this.onDeleted});
  final SystemBlueprint system;
  final ProgressionActions actions;
  final VoidCallback onDeleted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SavedTextField(
          key: ValueKey('name:${system.id}'),
          label: 'System name',
          value: system.name,
          onChanged: (v) {
            if (v.trim().isNotEmpty) {
              actions.systemsLater('${system.id}:name', (x) => x.updateSystem(system.id, (_) => {'name': v}));
            }
          },
        ),
        const SizedBox(height: 8),
        SavedTextField(
          key: ValueKey('description:${system.id}'),
          label: 'What it is',
          value: system.description,
          multiline: true,
          onChanged: (v) => actions.systemsLater(
            '${system.id}:description',
            (x) => x.updateSystem(system.id, (_) => {'description': v}),
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: theme.colorScheme.error),
            onPressed: () async {
              final ok = await showConfirmDialog(
                context,
                title: 'Delete ${system.name}?',
                message:
                    'The blueprint goes, with the sheets made from it and the paths recorded between its items. '
                    'Characters and entries are not changed; snapshots keep what they recorded.',
                confirmLabel: 'Delete the system',
                destructive: true,
              );
              if (!ok) return;
              final done = actions.systems((x) {
                x.removeSystem(system.id);
                return true;
              });
              if (done == true) {
                onDeleted();
                actions.tell('Deleted ${system.name}.');
              }
            },
            icon: const Icon(Icons.delete_outline),
            label: const Text('Delete this system…'),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------------------------------- variables

class _VariablesTab extends StatelessWidget {
  const _VariablesTab({required this.system, required this.actions});
  final SystemBlueprint system;
  final ProgressionActions actions;

  void _edit(List<JsonMap> Function(List<JsonMap> all) change) =>
      actions.systems((x) => x.updateSystem(system.id, (c) => {'variables': change(_list(c, 'variables'))}));
  void _later(String key, String id, JsonMap change) => actions.systemsLater(
    '${system.id}:$id:$key',
    (x) => x.updateSystem(system.id, (c) => {'variables': _patch(_list(c, 'variables'), id, change)}),
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final variables = system.variables;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, v) in variables.indexed)
          Card.outlined(
            margin: const EdgeInsets.only(top: 8),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SizedBox(
                    width: 200,
                    child: SavedTextField(
                      key: ValueKey('${v.id}:name'),
                      label: 'Name',
                      value: v.name,
                      dense: true,
                      onChanged: (t) {
                        if (t.trim().isNotEmpty) _later('name', v.id, {'name': t.trim()});
                      },
                    ),
                  ),
                  Text('key: ${v.key}', style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace')),
                  SizedBox(
                    width: 160,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('${v.id}:kind:${v.kind}'),
                      initialValue: v.kind,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Kind', isDense: true),
                      items: [
                        for (final e in _kindLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
                      ],
                      onChanged: (k) => _edit((all) => _patch(all, v.id, {'kind': k})),
                    ),
                  ),
                  if (v.kind == 'number' || v.kind == 'resource')
                    SizedBox(
                      width: 120,
                      child: SavedTextField(
                        key: ValueKey('${v.id}:base'),
                        label: 'Starting value',
                        value: formatBase(v.base),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                        dense: true,
                        onChanged: (t) => _later('base', v.id, {'base': double.tryParse(t.trim()) ?? 0}),
                      ),
                    ),
                  if (v.kind == 'derived')
                    SizedBox(
                      width: 320,
                      child: FormulaField(
                        key: ValueKey('${v.id}:formula'),
                        system: system,
                        label: 'Formula for ${v.name}',
                        hint: 'strength * 1.5',
                        value: v.formula,
                        onChanged: (t) => _later('formula', v.id, {'formula': t}),
                      ),
                    ),
                  if (v.kind == 'choice')
                    SizedBox(
                      width: 320,
                      child: SavedTextField(
                        key: ValueKey('${v.id}:options'),
                        label: 'Choices for ${v.name}',
                        hint: 'Fire, Water, Earth',
                        value: v.options.join(', '),
                        dense: true,
                        onChanged: (t) => _later('options', v.id, {'options': _split(t)}),
                      ),
                    ),
                  if (v.kind != 'choice')
                    SizedBox(
                      width: 110,
                      child: SavedTextField(
                        key: ValueKey('${v.id}:unit'),
                        label: 'Unit',
                        hint: 'HP',
                        value: v.unit,
                        dense: true,
                        onChanged: (t) => _later('unit', v.id, {'unit': t}),
                      ),
                    ),
                  _RowTools(
                    name: v.name,
                    first: i == 0,
                    last: i == variables.length - 1,
                    onMove: (by) => _edit((all) => _moved(all, v.id, by)),
                    onRemove: () => _edit((all) => _without(all, v.id)),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            for (final MapEntry(key: kind, value: label) in _kindLabels.entries)
              OutlinedButton.icon(
                onPressed: () => _edit(
                  (all) => [
                    ...all,
                    {
                      'id': newId(),
                      'name': 'New ${label.toLowerCase()}',
                      'kind': kind,
                      'base': 0,
                      'formula': '',
                      'options': <String>[],
                    },
                  ],
                ),
                icon: const Icon(Icons.add),
                label: Text(label),
              ),
          ],
        ),
      ],
    );
  }
}

String formatBase(double n) => n == n.truncateToDouble() ? n.toInt().toString() : n.toString();

// ---------------------------------------------------------------------------------------------------- tracks

class _TracksTab extends StatelessWidget {
  const _TracksTab({required this.system, required this.actions});
  final SystemBlueprint system;
  final ProgressionActions actions;

  void _edit(List<JsonMap> Function(List<JsonMap> all) change) =>
      actions.systems((x) => x.updateSystem(system.id, (c) => {'tracks': change(_list(c, 'tracks'))}));
  void _later(String key, String id, JsonMap Function(JsonMap track) change) => actions.systemsLater(
    '${system.id}:$id:$key',
    (x) => x.updateSystem(
      system.id,
      (c) => {
        'tracks': [
          for (final t in _list(c, 'tracks')) t['id'] == id ? {...t, ...change(t)} : t,
        ],
      },
    ),
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tracks = system.tracks;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, track) in tracks.indexed)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: ProfileBox(
              title: track.kind == 'levels' ? 'Numbered levels' : 'Named stages',
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SizedBox(
                      width: 200,
                      child: SavedTextField(
                        key: ValueKey('${track.id}:name'),
                        label: 'Name',
                        value: track.name,
                        dense: true,
                        onChanged: (t) {
                          if (t.trim().isNotEmpty) _later('name', track.id, (_) => {'name': t.trim()});
                        },
                      ),
                    ),
                    Text('key: ${track.key}', style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace')),
                    if (track.kind == 'levels') ...[
                      SizedBox(
                        width: 120,
                        child: SavedTextField(
                          key: ValueKey('${track.id}:cap'),
                          label: 'Highest level',
                          hint: 'No cap',
                          value: track.cap == 0 ? '' : '${track.cap}',
                          keyboardType: TextInputType.number,
                          dense: true,
                          onChanged: (t) => _later('cap', track.id, (_) => {'cap': int.tryParse(t.trim()) ?? 0}),
                        ),
                      ),
                      SizedBox(
                        width: 120,
                        child: SavedTextField(
                          key: ValueKey('${track.id}:points'),
                          label: 'Points a level',
                          value: track.points == 0 ? '' : formatBase(track.points),
                          keyboardType: TextInputType.number,
                          dense: true,
                          onChanged: (t) =>
                              _later('points', track.id, (_) => {'points': double.tryParse(t.trim()) ?? 0}),
                        ),
                      ),
                    ],
                    _RowTools(
                      name: track.name,
                      first: i == 0,
                      last: i == tracks.length - 1,
                      onMove: (by) => _edit((all) => _moved(all, track.id, by)),
                      onRemove: () => _edit((all) => _without(all, track.id)),
                    ),
                  ],
                ),
                if (track.kind == 'levels') ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      SizedBox(
                        width: 320,
                        child: FormulaField(
                          key: ValueKey('${track.id}:curve'),
                          system: system,
                          label: 'Curve of ${track.name}',
                          hint: '100 * ${track.key} ^ 1.5',
                          value: track.curve,
                          extra: {track.key: 1},
                          onChanged: (t) => _later('curve', track.id, (_) => {'curve': t}),
                        ),
                      ),
                      SizedBox(
                        width: 120,
                        child: SavedTextField(
                          key: ValueKey('${track.id}:unit'),
                          label: 'Its unit',
                          hint: 'XP',
                          value: track.curveUnit,
                          dense: true,
                          onChanged: (t) => _later('unit', track.id, (_) => {'curveUnit': t}),
                        ),
                      ),
                      SizedBox(
                        width: 280,
                        child: SavedTextField(
                          key: ValueKey('${track.id}:sources'),
                          label: 'Where ${track.curveUnit.isEmpty ? 'experience' : track.curveUnit} comes from',
                          hint: 'Combat, Quest, Training',
                          value: track.sources.join(', '),
                          dense: true,
                          onChanged: (t) => _later('sources', track.id, (_) => {'sources': _split(t)}),
                        ),
                      ),
                    ],
                  ),
                  if (curveTable(system, track, const [1, 2, 3, 5, 10]) case final rows when rows.isNotEmpty)
                    Text(
                      'To pass each level: ${rows.map((r) => 'level ${r.level}: ${r.cost}').join(' · ')}',
                      style: theme.textTheme.bodySmall,
                    ),
                ] else ...[
                  for (final (si, stage) in track.stages.indexed)
                    Card.outlined(
                      margin: const EdgeInsets.only(top: 8),
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            SizedBox(
                              width: 200,
                              child: SavedTextField(
                                key: ValueKey('${stage.id}:name'),
                                label: 'Stage ${si + 1}',
                                value: stage.name,
                                dense: true,
                                onChanged: (t) {
                                  if (t.trim().isEmpty) return;
                                  _later(
                                    'stage:${stage.id}:name',
                                    track.id,
                                    (tr) => {
                                      'stages': _patch(maps(tr['stages']).toList(), stage.id, {'name': t.trim()}),
                                    },
                                  );
                                },
                              ),
                            ),
                            if (si > 0)
                              SizedBox(
                                width: 320,
                                child: FormulaField(
                                  key: ValueKey('${stage.id}:requires'),
                                  system: system,
                                  condition: true,
                                  label: 'What ${stage.name} requires',
                                  hint: 'qi >= 1000 AND Pill: Foundation Pill',
                                  value: stage.requires,
                                  onChanged: (t) => _later(
                                    'stage:${stage.id}:requires',
                                    track.id,
                                    (tr) => {
                                      'stages': _patch(maps(tr['stages']).toList(), stage.id, {'requires': t}),
                                    },
                                  ),
                                ),
                              ),
                            SizedBox(
                              width: 280,
                              child: SavedTextField(
                                key: ValueKey('${stage.id}:note'),
                                label: 'Notes on ${stage.name}',
                                hint: 'The bottleneck, the breakthrough, the price',
                                value: stage.note,
                                dense: true,
                                onChanged: (t) => _later(
                                  'stage:${stage.id}:note',
                                  track.id,
                                  (tr) => {
                                    'stages': _patch(maps(tr['stages']).toList(), stage.id, {'note': t}),
                                  },
                                ),
                              ),
                            ),
                            _RowTools(
                              name: stage.name,
                              first: si == 0,
                              last: si == track.stages.length - 1,
                              onMove: (by) => _edit(
                                (all) => _patch(all, track.id, {
                                  'stages': _moved(
                                    maps(all.firstWhere((t) => t['id'] == track.id)['stages']).toList(),
                                    stage.id,
                                    by,
                                  ),
                                }),
                              ),
                              onRemove: () => _edit(
                                (all) => _patch(all, track.id, {
                                  'stages': _without(
                                    maps(all.firstWhere((t) => t['id'] == track.id)['stages']).toList(),
                                    stage.id,
                                  ),
                                }),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton.icon(
                      onPressed: () => _edit(
                        (all) => _patch(all, track.id, {
                          'stages': [
                            ...maps(all.firstWhere((t) => t['id'] == track.id)['stages']),
                            {'id': newId(), 'name': 'New stage', 'requires': '', 'note': ''},
                          ],
                        }),
                      ),
                      icon: const Icon(Icons.add),
                      label: const Text('Add a stage'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: () => _edit(
                (all) => [
                  ...all,
                  {'id': newId(), 'name': 'Level', 'kind': 'levels', 'cap': 0, 'curve': '', 'curveUnit': ''},
                ],
              ),
              icon: const Icon(Icons.add),
              label: const Text('Numbered levels'),
            ),
            OutlinedButton.icon(
              onPressed: () => _edit(
                (all) => [
                  ...all,
                  {'id': newId(), 'name': 'Realm', 'kind': 'stages', 'stages': <Object?>[]},
                ],
              ),
              icon: const Icon(Icons.add),
              label: const Text('Named stages'),
            ),
          ],
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------------------------------- classes, skills…

class _NamedList extends StatelessWidget {
  const _NamedList({required this.noun, required this.names, required this.hint, required this.onChange});
  final String noun;
  final List<({String id, String name})> names;
  final String hint;
  final void Function(List<JsonMap> Function(List<JsonMap> all) change, {String? later}) onChange;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (final (i, n) in names.indexed)
        Row(
          children: [
            Expanded(
              child: SavedTextField(
                key: ValueKey('$noun:${n.id}'),
                label: 'Name of $noun ${i + 1}',
                value: n.name,
                dense: true,
                onChanged: (t) {
                  if (t.trim().isNotEmpty) onChange((all) => _patch(all, n.id, {'name': t.trim()}), later: n.id);
                },
              ),
            ),
            _RowTools(
              name: n.name,
              first: i == 0,
              last: i == names.length - 1,
              onMove: (by) => onChange((all) => _moved(all, n.id, by)),
              onRemove: () => onChange((all) => _without(all, n.id)),
            ),
          ],
        ),
      Align(
        alignment: AlignmentDirectional.centerStart,
        child: TextButton.icon(
          onPressed: () => onChange(
            (all) => [
              ...all,
              {'id': newId(), 'name': 'New $noun'},
            ],
          ),
          icon: const Icon(Icons.add),
          label: Text('Add a $noun${names.isEmpty ? ' ($hint)' : ''}'),
        ),
      ),
    ],
  );
}

class _KitsTab extends StatelessWidget {
  const _KitsTab({required this.system, required this.actions});
  final SystemBlueprint system;
  final ProgressionActions actions;

  void _edit(String key, List<JsonMap> Function(List<JsonMap> all) change, {String? later}) {
    if (later != null) {
      actions.systemsLater(
        '${system.id}:$key:$later',
        (x) => x.updateSystem(system.id, (c) => {key: change(_list(c, key))}),
      );
    } else {
      actions.systems((x) => x.updateSystem(system.id, (c) => {key: change(_list(c, key))}));
    }
  }

  @override
  Widget build(BuildContext context) {
    final groups = system.groupList;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        ProfileBox(
          title: 'Ranks, lowest first',
          children: [
            _NamedList(
              noun: 'rank',
              names: system.ranks,
              hint: 'Common, Advanced, Unique…',
              onChange: (change, {later}) => _edit('ranks', change, later: later),
            ),
          ],
        ),
        for (final group in groups)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: ProfileBox(
              title: group.name,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SizedBox(
                      width: 220,
                      child: SavedTextField(
                        key: ValueKey('${group.id}:name'),
                        label: 'Group name',
                        value: group.name,
                        dense: true,
                        onChanged: (t) {
                          if (t.trim().isNotEmpty) {
                            _edit('groups', (all) => _patch(all, group.id, {'name': t.trim()}), later: group.id);
                          }
                        },
                      ),
                    ),
                    FilterChip(
                      label: const Text('Held one at a time'),
                      selected: group.single,
                      onSelected: (on) => _edit('groups', (all) => _patch(all, group.id, {'single': on})),
                    ),
                    TextButton(
                      onPressed: () async {
                        final ids = {
                          for (final i in system.items)
                            if (i.groupId == group.id) i.id,
                        };
                        if (await _removing(context, system, ids, 'the group ${group.name}') && context.mounted) {
                          _edit('groups', (all) => _without(all, group.id));
                        }
                      },
                      child: Text(
                        'Remove ${group.name}',
                        semanticsLabel: 'Remove the group ${group.name} and its items',
                      ),
                    ),
                  ],
                ),
                for (final item in system.items.where((i) => i.groupId == group.id))
                  ExpansionTile(
                    key: PageStorageKey('item:${item.id}'),
                    tilePadding: EdgeInsets.zero,
                    title: Text(item.name),
                    subtitle: Text(
                      [
                        if (system.rankName(item).isNotEmpty) system.rankName(item),
                        if (item.requires.isNotEmpty) 'requires ${item.requires}',
                      ].join(' · '),
                    ),
                    childrenPadding: const EdgeInsets.only(bottom: 12),
                    children: [_ItemEditor(system: system, item: item, actions: actions)],
                  ),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    onPressed: () => _edit(
                      'items',
                      (all) => [
                        ...all,
                        {'id': newId(), 'groupId': group.id, 'name': 'New ${group.name.toLowerCase()}'},
                      ],
                    ),
                    icon: const Icon(Icons.add),
                    label: Text('Add to ${group.name}'),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: OutlinedButton.icon(
            onPressed: () => _edit(
              'groups',
              (all) => [
                ...all,
                {'id': newId(), 'name': 'New group', 'single': false},
              ],
            ),
            icon: const Icon(Icons.add),
            label: const Text('A group'),
          ),
        ),
      ],
    );
  }
}

class _ItemEditor extends StatelessWidget {
  const _ItemEditor({required this.system, required this.item, required this.actions});
  final SystemBlueprint system;
  final SysItem item;
  final ProgressionActions actions;

  JsonMap Function(SystemBlueprint) _change(JsonMap Function(JsonMap item) change) =>
      (c) => {
        'items': [
          for (final i in _list(c, 'items')) i['id'] == item.id ? {...i, ...change(i)} : i,
        ],
      };
  void _edit(JsonMap Function(JsonMap item) change) =>
      actions.systems((x) => x.updateSystem(system.id, _change(change)));
  void _later(String key, JsonMap Function(JsonMap item) change) =>
      actions.systemsLater('${system.id}:${item.id}:$key', (x) => x.updateSystem(system.id, _change(change)));

  @override
  Widget build(BuildContext context) {
    final variables = [
      for (final v in system.variables)
        if (v.kind != 'choice') v,
    ];
    final others = [
      for (final i in system.items)
        if (i.id != item.id) i,
    ];
    Widget box(double w, Widget child) => SizedBox(width: w, child: child);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        box(
          220,
          SavedTextField(
            key: ValueKey('${item.id}:name'),
            label: 'Name',
            value: item.name,
            dense: true,
            onChanged: (t) {
              if (t.trim().isNotEmpty) _later('name', (_) => {'name': t.trim()});
            },
          ),
        ),
        box(
          180,
          DropdownButtonFormField<String>(
            key: ValueKey('${item.id}:rank:${item.rankId}'),
            initialValue: system.ranks.any((r) => r.id == item.rankId) ? item.rankId : '',
            isExpanded: true,
            decoration: InputDecoration(labelText: 'Rank of ${item.name}', isDense: true),
            items: [
              const DropdownMenuItem(value: '', child: Text('No rank')),
              for (final r in system.ranks) DropdownMenuItem(value: r.id, child: Text(r.name)),
            ],
            onChanged: (v) => _edit((_) => {'rankId': v == null || v.isEmpty ? null : v}),
          ),
        ),
        box(
          220,
          DropdownButtonFormField<String>(
            key: ValueKey('${item.id}:parent:${item.parentId}'),
            initialValue: others.any((o) => o.id == item.parentId) ? item.parentId : '',
            isExpanded: true,
            decoration: InputDecoration(labelText: '${item.name} grows out of', isDense: true),
            items: [
              const DropdownMenuItem(value: '', child: Text('Nothing')),
              for (final o in others)
                DropdownMenuItem(
                  value: o.id,
                  child: Text(o.name, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => _edit((_) => {'parentId': v == null || v.isEmpty ? null : v}),
          ),
        ),
        box(
          460,
          SavedTextField(
            key: ValueKey('${item.id}:description'),
            label: 'Description of ${item.name}',
            hint: 'What it is',
            value: item.description,
            multiline: true,
            dense: true,
            onChanged: (t) => _later('description', (_) => {'description': t}),
          ),
        ),
        box(
          460,
          FormulaField(
            key: ValueKey('${item.id}:requires'),
            system: system,
            condition: true,
            label: 'What ${item.name} requires',
            hint: 'Class: Void Mage AND level >= 50',
            value: item.requires,
            onChanged: (t) => _later('requires', (_) => {'requires': t}),
          ),
        ),
        for (final m in item.modifiers)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              box(
                160,
                DropdownButtonFormField<String>(
                  key: ValueKey('${m.id}:target:${m.target}'),
                  initialValue: variables.any((v) => v.key == m.target) ? m.target : null,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: 'What ${item.name} changes', isDense: true),
                  items: [for (final v in variables) DropdownMenuItem(value: v.key, child: Text(v.name))],
                  onChanged: (t) => _edit(
                    (i) => {
                      'modifiers': _patch(maps(i['modifiers']).toList(), m.id, {'target': t}),
                    },
                  ),
                ),
              ),
              const SizedBox(width: 6),
              box(
                70,
                DropdownButtonFormField<String>(
                  key: ValueKey('${m.id}:op:${m.op}'),
                  initialValue: m.op,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: 'How',
                    isDense: true,
                    semanticCounterText: 'How ${item.name} changes it',
                  ),
                  items: [for (final e in _ops.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                  onChanged: (o) => _edit(
                    (i) => {
                      'modifiers': _patch(maps(i['modifiers']).toList(), m.id, {'op': o}),
                    },
                  ),
                ),
              ),
              const SizedBox(width: 6),
              box(
                160,
                FormulaField(
                  key: ValueKey('${m.id}:value'),
                  system: system,
                  label: 'Amount ${item.name} gives',
                  hint: '5',
                  value: m.value,
                  onChanged: (t) => _later(
                    'mod:${m.id}',
                    (i) => {
                      'modifiers': _patch(maps(i['modifiers']).toList(), m.id, {'value': t}),
                    },
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Remove this change',
                onPressed: () => _edit((i) => {'modifiers': _without(maps(i['modifiers']).toList(), m.id)}),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        for (final c in item.costs)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              box(
                160,
                FormulaField(
                  key: ValueKey('${c.id}:amount'),
                  system: system,
                  label: 'Amount ${item.name} costs',
                  hint: '20',
                  value: c.amount,
                  onChanged: (t) => _later(
                    'cost:${c.id}',
                    (i) => {
                      'costs': _patch(maps(i['costs']).toList(), c.id, {'amount': t}),
                    },
                  ),
                ),
              ),
              const SizedBox(width: 6),
              box(
                160,
                DropdownButtonFormField<String>(
                  key: ValueKey('${c.id}:target:${c.target}'),
                  initialValue: variables.any((v) => v.key == c.target) ? c.target : null,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: 'What ${item.name} costs', isDense: true),
                  items: [for (final v in variables) DropdownMenuItem(value: v.key, child: Text(v.name))],
                  onChanged: (t) => _edit(
                    (i) => {
                      'costs': _patch(maps(i['costs']).toList(), c.id, {'target': t}),
                    },
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Remove this cost',
                onPressed: () => _edit((i) => {'costs': _without(maps(i['costs']).toList(), c.id)}),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        if (variables.isNotEmpty) ...[
          TextButton.icon(
            onPressed: () => _edit(
              (i) => {
                'modifiers': [
                  ...maps(i['modifiers']),
                  {'id': newId(), 'target': variables.first.key, 'op': 'add', 'value': '1'},
                ],
              },
            ),
            icon: const Icon(Icons.add),
            label: const Text('A change it makes'),
          ),
          TextButton.icon(
            onPressed: () => _edit(
              (i) => {
                'costs': [
                  ...maps(i['costs']),
                  {'id': newId(), 'target': variables.first.key, 'amount': '1'},
                ],
              },
            ),
            icon: const Icon(Icons.add),
            label: const Text('A cost'),
          ),
        ],
        for (final (key, label, hint, value) in [
          ('cooldown', 'Cooldown of ${item.name}', '30 seconds · once a day · a full verse', item.cooldown),
          ('affinity', 'Affinity of ${item.name}', 'Fire', item.affinity),
          ('evolution', 'Evolution of ${item.name}', 'Becomes Inferno after 1,000 casts', item.evolution),
        ])
          box(
            300,
            SavedTextField(
              key: ValueKey('${item.id}:$key'),
              label: label,
              hint: hint,
              value: value,
              dense: true,
              onChanged: (t) => _later(key, (_) => {key: t}),
            ),
          ),
        TextButton(
          onPressed: () async {
            if (await _removing(context, system, {item.id}, item.name) && context.mounted) {
              actions.systems((x) => x.updateSystem(system.id, (c) => {'items': _without(_list(c, 'items'), item.id)}));
            }
          },
          child: Text('Remove ${item.name}', semanticsLabel: 'Remove ${item.name} from ${system.name}'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------------------------------- tables

class _TablesTab extends StatelessWidget {
  const _TablesTab({required this.system, required this.actions});
  final SystemBlueprint system;
  final ProgressionActions actions;

  void _edit(String id, JsonMap Function(JsonMap m) change, {String? later}) {
    JsonMap apply(SystemBlueprint c) => {
      'matrices': [
        for (final m in _list(c, 'matrices')) m['id'] == id ? {...m, ...change(m)} : m,
      ],
    };
    if (later != null) {
      actions.systemsLater('${system.id}:$id:$later', (x) => x.updateSystem(system.id, apply));
    } else {
      actions.systems((x) => x.updateSystem(system.id, apply));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final m in system.matrices)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: ProfileBox(
              title: m.name,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: SavedTextField(
                        key: ValueKey('${m.id}:name'),
                        label: 'Table name',
                        value: m.name,
                        dense: true,
                        onChanged: (t) {
                          if (t.trim().isNotEmpty) _edit(m.id, (_) => {'name': t.trim()}, later: 'name');
                        },
                      ),
                    ),
                    TextButton(
                      onPressed: () => actions.systems(
                        (x) => x.updateSystem(system.id, (c) => {'matrices': _without(_list(c, 'matrices'), m.id)}),
                      ),
                      child: Text('Remove ${m.name}'),
                    ),
                  ],
                ),
                Wrap(
                  spacing: 24,
                  children: [
                    for (final (part, label) in [('rows', 'row'), ('columns', 'column')])
                      SizedBox(
                        width: 320,
                        child: _NamedList(
                          noun: label,
                          names: part == 'rows' ? m.rows : m.columns,
                          hint: 'Fire, Water…',
                          onChange: (change, {later}) => _edit(
                            m.id,
                            (raw) => {part: change(maps(raw[part]).toList())},
                            later: later == null ? null : '$part:$later',
                          ),
                        ),
                      ),
                  ],
                ),
                if (m.rows.isNotEmpty && m.columns.isNotEmpty)
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const SizedBox(width: 120),
                            for (final c in m.columns)
                              SizedBox(width: 140, child: Text(c.name, style: theme.textTheme.labelLarge)),
                          ],
                        ),
                        for (final r in m.rows)
                          Row(
                            children: [
                              SizedBox(width: 120, child: Text(r.name, style: theme.textTheme.labelLarge)),
                              for (final c in m.columns)
                                SizedBox(
                                  width: 140,
                                  child: Padding(
                                    padding: const EdgeInsets.all(2),
                                    child: SavedTextField(
                                      key: ValueKey('${m.id}:${r.id}|${c.id}'),
                                      label: '${r.name} against ${c.name}',
                                      hint: '—',
                                      value: m.cells['${r.id}|${c.id}'] ?? '',
                                      dense: true,
                                      onChanged: (t) => _edit(
                                        m.id,
                                        (raw) => {
                                          'cells': {...?mapOrNull(raw['cells']), '${r.id}|${c.id}': t},
                                        },
                                        later: '${r.id}|${c.id}',
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: OutlinedButton.icon(
            onPressed: () => actions.systems(
              (x) => x.updateSystem(
                system.id,
                (c) => {
                  'matrices': [
                    ..._list(c, 'matrices'),
                    {
                      'id': newId(),
                      'name': 'New table',
                      'rows': <Object?>[],
                      'columns': <Object?>[],
                      'cells': <String, Object?>{},
                    },
                  ],
                },
              ),
            ),
            icon: const Icon(Icons.add),
            label: const Text('A table'),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------------------------------- sheets

class _SheetsTab extends StatelessWidget {
  const _SheetsTab({
    required this.model,
    required this.system,
    required this.actions,
    required this.sheetId,
    required this.onSelect,
  });
  final StoryModel model;
  final SystemBlueprint system;
  final ProgressionActions actions;
  final String? sheetId;
  final ValueChanged<String?> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mine = stableSorted(
      model.sheets.where((s) => s.systemId == system.id && model.entries.containsKey(s.entryId)),
      (a, b) => localeCompare(model.entries[a.entryId]!.name, model.entries[b.entryId]!.name),
    );
    final selected = mine.where((s) => s.id == sheetId).firstOrNull;
    final free = stableSorted(
      model.entries.values.where((e) => !mine.any((s) => s.entryId == e.id)),
      (a, b) => localeCompare(a.name, b.name),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final s in mine)
              ChoiceChip(
                label: Text(model.entries[s.entryId]!.name),
                selected: s.id == selected?.id,
                onSelected: (_) => onSelect(s.id),
              ),
            if (free.isNotEmpty)
              PopupMenuButton<String>(
                tooltip: 'Add a codex entry to this system',
                onSelected: (id) {
                  final sheet = actions.systems((x) => x.addSheet(system.id, id));
                  if (sheet != null) onSelect(sheet.id);
                },
                itemBuilder: (_) => [for (final e in free) PopupMenuItem(value: e.id, child: Text(e.name))],
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text('Add a character or entry…', style: TextStyle(color: theme.colorScheme.primary)),
                ),
              ),
          ],
        ),
        if (model.entries.isEmpty)
          Text(
            'Create a character, or an item under World, first; then it can be given a sheet here.',
            style: theme.textTheme.bodySmall,
          ),
        if (selected != null) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: Text(model.entries[selected.entryId]!.name, style: theme.textTheme.titleMedium)),
              TextButton(
                onPressed: () => actions.openEntry(
                  selected.entryId,
                  character: model.entries[selected.entryId]!.category == 'character',
                ),
                child: const Text('Open profile'),
              ),
            ],
          ),
          SheetEditor(
            model: model,
            system: system,
            sheet: selected,
            name: model.entries[selected.entryId]!.name,
            actions: actions,
          ),
        ],
      ],
    );
  }
}
