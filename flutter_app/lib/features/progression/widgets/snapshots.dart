import 'package:flutter/material.dart';

import '../../../core/widgets/confirm_dialog.dart';
import '../../../core/widgets/saved_text_field.dart';
import '../../../shared/domain/collation.dart';
import '../../../shared/domain/ids.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/manuscript/board.dart' show buildTree, flattenTree;
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/progression/snapshots.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/stable_sort.dart';
import '../../../shared/domain/systems/formula.dart' show formatNumber;
import '../../characters/widgets/parts.dart';
import '../progression_providers.dart';

/// SYSTEM SNAPSHOTS: for a novel with a worked-out system, a character's whole state against the blueprints (levels,
/// attributes, skills), gear and condition, logged at a chapter. Each is complete in itself.
class SnapshotsSection extends StatefulWidget {
  const SnapshotsSection({
    super.key,
    required this.model,
    required this.snapshots,
    required this.entryId,
    required this.actions,
  });
  final StoryModel model;
  final List<ProgressSnapshot> snapshots;
  final String entryId;
  final ProgressionActions actions;

  @override
  State<SnapshotsSection> createState() => _SnapshotsSectionState();
}

class _SnapshotsSectionState extends State<SnapshotsSection> {
  String _at = '';
  final _label = TextEditingController();
  String? _selected;
  String _view = 'inspect';
  String _asOf = '';
  String? _from;
  String? _to;

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final model = widget.model;
    final entry = model.entries[widget.entryId];
    if (entry == null) return const SizedBox.shrink();
    final name = entry.name;
    final nodes = [...model.nodes.values];
    final mine = inStoryOrder(widget.snapshots, nodes, entry.id);
    final documents = [
      for (final t in flattenTree(buildTree(nodes)))
        if (t.node.kind == NodeKind.chapter || t.node.kind == NodeKind.scene) t,
    ];
    final systems = [...model.systems.values];
    List<DropdownMenuItem<String>> chapterItems([String prefix = '']) => [
      for (final t in documents)
        DropdownMenuItem(
          value: t.node.id,
          child: Text('${'  ' * t.depth}$prefix${t.node.title}', overflow: TextOverflow.ellipsis),
        ),
    ];
    String summary(ProgressSnapshot s) => [
      for (final system in systems)
        if (s.systems[system.id] case final state?)
          for (final t in resolveSystem(system, state).tracks)
            '${t.track.name} ${t.label.replaceFirst(RegExp(r' of \d+$'), '')}',
    ].join(' · ');
    final selected = mine.where((s) => s.id == _selected).firstOrNull ?? mine.lastOrNull;
    final asOf = documents.any((t) => t.node.id == _asOf) ? _asOf : null;
    final found = stateAt(widget.snapshots, nodes, entry.id, asOf);
    final from = mine.where((s) => s.id == _from).firstOrNull ?? (mine.length > 1 ? mine[mine.length - 2] : null);
    final to = mine.where((s) => s.id == _to).firstOrNull ?? mine.lastOrNull;

    void log() {
      final made = widget.actions.snapshots(
        (x) => x.createSnapshot(entry.id, nodeId: _at.isEmpty ? null : _at, label: _label.text),
      );
      if (made == null) return;
      setState(() {
        _label.clear();
        _selected = made.id;
        _view = 'edit';
      });
    }

    return ProfileBox(
      title: 'System snapshots',
      caption:
          'For a novel with a worked-out system: $name’s whole state against your system blueprints (levels, '
          'attributes, skills), gear and condition, logged at a chapter.',
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 260,
              child: DropdownButtonFormField<String>(
                initialValue: documents.any((t) => t.node.id == _at) ? _at : '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Snapshot is true from', isDense: true),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Before the story')),
                  ...chapterItems(),
                ],
                onChanged: (v) => setState(() => _at = v ?? ''),
              ),
            ),
            SizedBox(
              width: 260,
              child: TextField(
                controller: _label,
                decoration: const InputDecoration(
                  labelText: 'Label for the new snapshot',
                  hintText: 'After the evolution',
                  isDense: true,
                ),
              ),
            ),
            FilledButton.tonal(onPressed: log, child: const Text('Log snapshot')),
          ],
        ),
        Text(
          'A new snapshot starts as a copy of $name’s state at that point, so you only enter what changed.',
          style: theme.textTheme.bodySmall,
        ),
        if (mine.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in mine)
                ChoiceChip(
                  label: Text(
                    [
                      placeOfSnapshot(s, nodes),
                      if (s.label.isNotEmpty) s.label,
                      if (summary(s).isNotEmpty) summary(s),
                    ].join(' · '),
                  ),
                  selected: s.id == selected?.id && _view == 'edit',
                  onSelected: (_) => setState(() {
                    _selected = s.id;
                    _view = 'edit';
                  }),
                ),
            ],
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'inspect', label: Text('State at a chapter')),
              ButtonSegment(value: 'edit', label: Text('Edit snapshot')),
              ButtonSegment(value: 'compare', label: Text('Compare')),
            ],
            selected: {_view},
            showSelectedIcon: false,
            onSelectionChanged: (v) => setState(() => _view = v.first),
          ),
          const SizedBox(height: 12),
          if (_view == 'inspect') ...[
            SizedBox(
              width: 320,
              child: DropdownButtonFormField<String>(
                key: ValueKey('asof:$asOf'),
                initialValue: asOf ?? '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'As of', isDense: true),
                items: [
                  const DropdownMenuItem(value: '', child: Text('As of the end of the story')),
                  ...chapterItems('As of '),
                ],
                onChanged: (v) => setState(() => _asOf = v ?? ''),
              ),
            ),
            const SizedBox(height: 8),
            if (found == null)
              Text('Nothing is logged for $name by then.', style: theme.textTheme.bodySmall)
            else
              StateCard(model: model, snapshot: found, nodes: nodes),
          ] else if (_view == 'edit' && selected != null)
            SnapshotEditor(
              key: ValueKey('edit:${selected.id}'),
              model: model,
              snapshot: selected,
              name: name,
              actions: widget.actions,
              onDeleted: () => setState(() => _selected = null),
            )
          else if (_view == 'compare' && mine.length >= 2 && from != null && to != null) ...[
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final (label, current, set) in [
                  ('From', from, (String? v) => setState(() => _from = v)),
                  ('To', to, (String? v) => setState(() => _to = v)),
                ])
                  SizedBox(
                    width: 280,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('$label:${current.id}'),
                      initialValue: current.id,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: label, isDense: true),
                      items: [
                        for (final s in mine)
                          DropdownMenuItem(
                            value: s.id,
                            child: Text(
                              '${placeOfSnapshot(s, nodes)}${s.label.isNotEmpty ? ': ${s.label}' : ''}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: set,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            _CompareView(comparison: compareSnapshots(from, to, systems)),
          ] else if (_view == 'compare')
            Text('Log two snapshots to compare them.', style: theme.textTheme.bodySmall),
        ],
      ],
    );
  }
}

/// One snapshot as it reads: each system worked out (or as entered), gear, status and notes.
class StateCard extends StatelessWidget {
  const StateCard({super.key, required this.model, required this.snapshot, required this.nodes});
  final StoryModel model;
  final ProgressSnapshot snapshot;
  final List<StoryNode> nodes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final small = theme.textTheme.bodySmall;
    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'From the snapshot at ${placeOfSnapshot(snapshot, nodes)}${snapshot.label.isNotEmpty ? ': ${snapshot.label}' : ''}',
              style: small,
            ),
            for (final MapEntry(key: id, value: state) in snapshot.systems.entries)
              if (model.systems[id] case final system?) ...[
                const SizedBox(height: 8),
                Text(system.name, style: theme.textTheme.titleSmall),
                for (final t in resolveSystem(system, state).tracks) Text('${t.track.name}: ${t.label}'),
                for (final row in resolveSystem(system, state).rows)
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(text: '${row.variable.name}: '),
                        TextSpan(
                          text: row.display,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        if (row.byHand) TextSpan(text: ' (set by hand)', style: small),
                        if (row.systemSays != null)
                          TextSpan(text: ' · the system works out ${row.systemSays}', style: small),
                      ],
                    ),
                  ),
                if (resolveSystem(system, state).items case final items when items.isNotEmpty)
                  Text('Holds: ${items.map((i) => i.item.name).join(', ')}'),
              ],
            if (snapshot.gear.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Inventory & gear', style: theme.textTheme.titleSmall),
              for (final g in snapshot.gear)
                Text([g.name, if (g.kind.isNotEmpty) g.kind, if (g.note.isNotEmpty) g.note].join(' · ')),
            ],
            for (final d in statusDimensions)
              if (linesOf(snapshot.status(d)) case final lines when lines.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(dimensionLabels[d]!, style: theme.textTheme.titleSmall),
                for (final l in lines) Text('• $l'),
              ],
            if (snapshot.notes.isNotEmpty) ...[const SizedBox(height: 8), Text(snapshot.notes, style: small)],
          ],
        ),
      ),
    );
  }
}

class _CompareView extends StatelessWidget {
  const _CompareView({required this.comparison});
  final Comparison comparison;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = comparison;
    if (c.same) return const Text('Nothing differs between the two.');
    Widget head(String s) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(s, style: theme.textTheme.titleSmall),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (c.stats.isNotEmpty) head('Values'),
        for (final s in c.stats)
          Text(
            '${s.system} · ${s.name}: ${s.from} → ${s.to}${s.delta != null ? ' (${s.delta! >= 0 ? '+' : '−'}${formatNumber(s.delta!.abs())})' : ''}',
          ),
        if (c.advancement.isNotEmpty) head('Advancement'),
        for (final a in c.advancement) Text('${a.system} · ${a.name}: ${a.from} → ${a.to}'),
        if (c.gained.isNotEmpty) head('Gained'),
        for (final g in c.gained) Text('${g.group}: ${g.name}'),
        if (c.lost.isNotEmpty) head('Lost'),
        for (final g in c.lost) Text('${g.group}: ${g.name}'),
        if (c.gear.isNotEmpty) head('Gear'),
        for (final g in c.gear)
          Text(
            '${g.change[0].toUpperCase()}${g.change.substring(1)}: ${g.name}${g.detail.isNotEmpty ? ' (${g.detail})' : ''}',
          ),
        for (final s in c.status) ...[
          head(s.label),
          for (final l in s.added) Text('+ $l'),
          for (final l in s.removed) Text('− $l'),
        ],
      ],
    );
  }
}

/// Editing one snapshot: when it is true from, its label, each system (worked out or entered, with values set by
/// hand), gear, status and notes. Editing it never changes any other snapshot.
class SnapshotEditor extends StatefulWidget {
  const SnapshotEditor({
    super.key,
    required this.model,
    required this.snapshot,
    required this.name,
    required this.actions,
    required this.onDeleted,
  });
  final StoryModel model;
  final ProgressSnapshot snapshot;
  final String name;
  final ProgressionActions actions;
  final VoidCallback onDeleted;

  @override
  State<SnapshotEditor> createState() => _SnapshotEditorState();
}

class _SnapshotEditorState extends State<SnapshotEditor> {
  final _gearName = TextEditingController();
  final _gearKind = TextEditingController();
  String _gearEntry = '';

  @override
  void dispose() {
    _gearName.dispose();
    _gearKind.dispose();
    super.dispose();
  }

  void _edit(JsonMap Function(ProgressSnapshot current) change) =>
      widget.actions.snapshots((x) => x.updateSnapshot(widget.snapshot.id, change));
  void _later(String key, JsonMap Function(ProgressSnapshot current) change) =>
      widget.actions.snapshotsLater('${widget.snapshot.id}:$key', (x) => x.updateSnapshot(widget.snapshot.id, change));

  /// A change to one system of the snapshot, made from it as stored.
  JsonMap Function(ProgressSnapshot) _inSystem(String systemId, JsonMap Function(JsonMap current) change) => (s) {
    final systems = {...?mapOrNull(s.raw['systems'])};
    final current = {
      'auto': true,
      'values': <String, Object?>{},
      'progress': <String, Object?>{},
      'itemIds': <String>[],
      'overrides': <String, Object?>{},
      ...?mapOrNull(systems[systemId]),
    };
    systems[systemId] = {...current, ...change(current)};
    return {'systems': systems};
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final model = widget.model;
    final snapshot = widget.snapshot;
    final name = widget.name;
    final nodes = [...model.nodes.values];
    final documents = [
      for (final t in flattenTree(buildTree(nodes)))
        if (t.node.kind == NodeKind.chapter || t.node.kind == NodeKind.scene) t,
    ];
    final here = snapshot.systems;
    final unused = [
      for (final s in model.systems.values)
        if (!here.containsKey(s.id)) s,
    ];
    final codexItems = stableSorted(
      model.entries.values.where((e) => e.category != 'character'),
      (a, b) => localeCompare(a.name, b.name),
    );
    final at = snapshot.nodeId == null
        ? ''
        : (documents.any((t) => t.node.id == snapshot.nodeId) ? snapshot.nodeId! : 'gone');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            SizedBox(
              width: 260,
              child: DropdownButtonFormField<String>(
                key: ValueKey('at:${snapshot.id}:$at'),
                initialValue: at,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'True from', isDense: true),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Before the story')),
                  if (at == 'gone') const DropdownMenuItem(value: 'gone', child: Text('A chapter that was removed')),
                  for (final t in documents)
                    DropdownMenuItem(
                      value: t.node.id,
                      child: Text('${'  ' * t.depth}${t.node.title}', overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) {
                  if (v == 'gone') return;
                  _edit((_) => {'nodeId': v == null || v.isEmpty ? null : v});
                },
              ),
            ),
            SizedBox(
              width: 260,
              child: SavedTextField(
                key: ValueKey('label:${snapshot.id}'),
                label: 'Snapshot label',
                hint: 'After the evolution',
                value: snapshot.label,
                dense: true,
                onChanged: (v) => _later('label', (_) => {'label': v}),
              ),
            ),
          ],
        ),
        for (final MapEntry(key: systemId, value: state) in here.entries)
          if (model.systems[systemId] case final system?)
            _SystemPart(
              system: system,
              state: state,
              name: name,
              snapshotId: snapshot.id,
              edit: (change) => _edit(_inSystem(systemId, change)),
              later: (key, change) => _later('$systemId:$key', _inSystem(systemId, change)),
            ),
        if (unused.isNotEmpty)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: PopupMenuButton<String>(
              tooltip: 'Track a system in this snapshot',
              onSelected: (id) => _edit(_inSystem(id, (_) => const {})),
              itemBuilder: (_) => [for (final s in unused) PopupMenuItem(value: s.id, child: Text(s.name))],
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text('Track $name in another system…', style: TextStyle(color: theme.colorScheme.primary)),
              ),
            ),
          ),
        const SizedBox(height: 12),
        ProfileBox(
          title: 'Inventory & gear',
          children: [
            for (final g in snapshot.gear)
              Row(
                children: [
                  Expanded(
                    child: SavedTextField(
                      key: ValueKey('gear:${g.id}:name'),
                      label: 'Name of ${g.name}',
                      value: g.name,
                      dense: true,
                      onChanged: (v) {
                        if (v.trim().isEmpty) return;
                        _later(
                          'gear:${g.id}:name',
                          (s) => {
                            'gear': _gearWith(s, g.id, {'name': v}),
                          },
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 140,
                    child: SavedTextField(
                      key: ValueKey('gear:${g.id}:kind'),
                      label: 'How it is held',
                      hint: 'Equipped',
                      value: g.kind,
                      dense: true,
                      onChanged: (v) => _later(
                        'gear:${g.id}:kind',
                        (s) => {
                          'gear': _gearWith(s, g.id, {'kind': v}),
                        },
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Remove ${g.name}',
                    icon: const Icon(Icons.close),
                    onPressed: () => _edit(
                      (s) => {
                        'gear': [
                          for (final x in maps(s.raw['gear']))
                            if (x['id'] != g.id) x,
                        ],
                      },
                    ),
                  ),
                ],
              ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 200,
                  child: TextField(
                    controller: _gearName,
                    decoration: const InputDecoration(labelText: 'New gear', hintText: 'What they have', isDense: true),
                  ),
                ),
                if (codexItems.isNotEmpty)
                  SizedBox(
                    width: 200,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('gearEntry:$_gearEntry'),
                      initialValue: _gearEntry,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Codex item', isDense: true),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('Not in the codex')),
                        for (final e in codexItems)
                          DropdownMenuItem(
                            value: e.id,
                            child: Text(e.name, overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) => setState(() => _gearEntry = v ?? ''),
                    ),
                  ),
                SizedBox(
                  width: 160,
                  child: TextField(
                    controller: _gearKind,
                    decoration: InputDecoration(
                      labelText: 'How it is held',
                      hintText: gearKinds.first,
                      isDense: true,
                      suffixIcon: PopupMenuButton<String>(
                        icon: const Icon(Icons.arrow_drop_down),
                        tooltip: 'Suggestions',
                        itemBuilder: (_) => [for (final k in gearKinds) PopupMenuItem(value: k, child: Text(k))],
                        onSelected: (k) => _gearKind.text = k,
                      ),
                    ),
                  ),
                ),
                OutlinedButton(
                  onPressed: () {
                    final typed = _gearName.text.trim();
                    final named = typed.isNotEmpty ? typed : (model.entries[_gearEntry]?.name ?? '');
                    if (named.isEmpty) return;
                    final item = {
                      'id': newId(),
                      'name': named,
                      'kind': _gearKind.text.trim(),
                      'entryId': _gearEntry.isEmpty ? null : _gearEntry,
                      'note': '',
                    };
                    _edit(
                      (s) => {
                        'gear': [...maps(s.raw['gear']), item],
                      },
                    );
                    setState(() {
                      _gearName.clear();
                      _gearKind.clear();
                      _gearEntry = '';
                    });
                  },
                  child: const Text('Add gear'),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 12),
        ProfileBox(
          title: 'Status (one thing per line)',
          children: [
            for (final d in statusDimensions)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SavedTextField(
                  key: ValueKey('status:${snapshot.id}:$d'),
                  label: dimensionLabels[d],
                  hint: dimensionHints[d],
                  value: snapshot.status(d),
                  multiline: true,
                  dense: true,
                  onChanged: (v) => _later(
                    'status:$d',
                    (s) => {
                      'status': {...?mapOrNull(s.raw['status']), d: v},
                    },
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        SavedTextField(
          key: ValueKey('notes:${snapshot.id}'),
          label: 'Notes',
          value: snapshot.notes,
          multiline: true,
          onChanged: (v) => _later('notes', (_) => {'notes': v}),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text('Editing this snapshot never changes any other.', style: theme.textTheme.bodySmall),
            OutlinedButton(
              style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
              onPressed: () async {
                final ok = await showConfirmDialog(
                  context,
                  title: 'Delete snapshot',
                  message: 'Delete this snapshot of $name? The snapshots before and after it are not changed.',
                  confirmLabel: 'Delete snapshot',
                  destructive: true,
                );
                if (!ok) return;
                final done = widget.actions.snapshots((x) {
                  x.removeSnapshot(snapshot.id);
                  return true;
                });
                if (done == true) widget.onDeleted();
              },
              child: const Text('Delete snapshot…'),
            ),
          ],
        ),
      ],
    );
  }

  static List<JsonMap> _gearWith(ProgressSnapshot s, String id, JsonMap change) => [
    for (final g in maps(s.raw['gear'])) g['id'] == id ? {...g, ...change} : g,
  ];
}

/// One system in a snapshot: worked out from the blueprint (values set by hand win), or entered as is.
class _SystemPart extends StatelessWidget {
  const _SystemPart({
    required this.system,
    required this.state,
    required this.name,
    required this.snapshotId,
    required this.edit,
    required this.later,
  });
  final SystemBlueprint system;
  final SnapshotSystem state;
  final String name;
  final String snapshotId;
  final void Function(JsonMap Function(JsonMap current) change) edit;
  final void Function(String key, JsonMap Function(JsonMap current) change) later;

  static JsonMap _without(Object? map, String id) => {...?mapOrNull(map)}..remove(id);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final resolved = resolveSystem(system, state);
    final auto = state.auto;
    final items = system.items;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: ProfileBox(
        title: system.name,
        children: [
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: auto,
            onChanged: (v) => edit((_) => {'auto': v == true}),
            title: const Text('Work out formulas and class effects from the system'),
            subtitle: Text(
              auto
                  ? 'Suggestions only: anything you set by hand replaces what the system works out.'
                  : 'Nothing is worked out. Every value below is exactly what you enter.',
            ),
          ),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final track in system.tracks)
                SizedBox(
                  width: 220,
                  child: track.kind == 'levels'
                      ? SavedTextField(
                          key: ValueKey('$snapshotId:${track.id}'),
                          label: '${track.name} in this snapshot',
                          value: state.progress[track.id] is double
                              ? formatNumber(state.progress[track.id]! as double)
                              : '1',
                          keyboardType: TextInputType.number,
                          dense: true,
                          onChanged: (text) => later(track.id, (c) {
                            final n = double.tryParse(text.trim()) ?? 1;
                            return {
                              'progress': {...?mapOrNull(c['progress']), track.id: n < 1 ? 1 : (n + 0.5).floor()},
                            };
                          }),
                        )
                      : DropdownButtonFormField<String>(
                          key: ValueKey('$snapshotId:${track.id}:${state.progress[track.id]}'),
                          initialValue: track.stages.any((s) => s.id == state.progress[track.id])
                              ? state.progress[track.id]! as String
                              : track.stages.firstOrNull?.id,
                          isExpanded: true,
                          decoration: InputDecoration(labelText: '${track.name} in this snapshot', isDense: true),
                          items: [for (final s in track.stages) DropdownMenuItem(value: s.id, child: Text(s.name))],
                          onChanged: (v) => edit(
                            (c) => {
                              'progress': {...?mapOrNull(c['progress']), track.id: v},
                            },
                          ),
                        ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          for (final row in resolved.rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Wrap(
                spacing: 12,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SizedBox(width: 140, child: Text(row.variable.name, style: theme.textTheme.labelLarge)),
                  if (row.variable.kind == 'choice')
                    SizedBox(
                      width: 180,
                      child: DropdownButtonFormField<String>(
                        key: ValueKey('$snapshotId:${row.variable.id}:${row.value}'),
                        initialValue: row.variable.options.contains(row.value)
                            ? row.value! as String
                            : row.variable.options.firstOrNull,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: '${row.variable.name} in this snapshot', isDense: true),
                        items: [for (final o in row.variable.options) DropdownMenuItem(value: o, child: Text(o))],
                        onChanged: (v) => edit(
                          (c) => auto
                              ? {
                                  'values': {...?mapOrNull(c['values']), row.variable.id: v},
                                }
                              : {
                                  'values': {...?mapOrNull(c['values']), row.variable.id: v},
                                  'overrides': _without(c['overrides'], row.variable.id),
                                },
                        ),
                      ),
                    )
                  else if (row.variable.kind != 'derived' || !auto)
                    SizedBox(
                      width: 160,
                      child: SavedTextField(
                        key: ValueKey('$snapshotId:${row.variable.id}:own'),
                        label: auto ? 'Their own' : 'Entered',
                        hint: row.variable.kind == 'derived' ? '—' : formatNumber(row.variable.base),
                        value: () {
                          final v = auto
                              ? state.values[row.variable.id]
                              : (state.overrides[row.variable.id] ?? state.values[row.variable.id]);
                          return v is double ? formatNumber(v) : '';
                        }(),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                        dense: true,
                        onChanged: (text) => later('${row.variable.id}:own', (c) {
                          final n = double.tryParse(text.trim());
                          final value = text.trim().isEmpty || n == null ? null : n;
                          final id = row.variable.id;
                          if (row.variable.kind != 'derived') {
                            final values = value == null
                                ? _without(c['values'], id)
                                : {...?mapOrNull(c['values']), id: value};
                            return auto
                                ? {'values': values}
                                : {'values': values, 'overrides': _without(c['overrides'], id)};
                          }
                          return {
                            'overrides': value == null
                                ? _without(c['overrides'], id)
                                : {...?mapOrNull(c['overrides']), id: value},
                          };
                        }),
                      ),
                    ),
                  if (auto)
                    Text(
                      row.error ?? (row.byHand ? (row.systemSays ?? row.display) : row.display),
                      style: row.error != null
                          ? theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error)
                          : null,
                    ),
                  if (auto && row.variable.kind != 'choice')
                    SizedBox(
                      width: 140,
                      child: SavedTextField(
                        key: ValueKey('$snapshotId:${row.variable.id}:hand'),
                        label: 'Set ${row.variable.name} by hand',
                        hint: '—',
                        value: state.overrides[row.variable.id] is double
                            ? formatNumber(state.overrides[row.variable.id]! as double)
                            : '',
                        keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                        dense: true,
                        onChanged: (text) => later('${row.variable.id}:hand', (c) {
                          final n = double.tryParse(text.trim());
                          final id = row.variable.id;
                          return {
                            'overrides': text.trim().isEmpty || n == null
                                ? _without(c['overrides'], id)
                                : {...?mapOrNull(c['overrides']), id: n},
                          };
                        }),
                      ),
                    ),
                ],
              ),
            ),
          for (final group in system.groupList)
            if (items.where((i) => i.groupId == group.id).toList() case final options when options.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('${group.name} in this snapshot', style: theme.textTheme.labelLarge),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        for (final item in options)
                          FilterChip(
                            label: Text(item.name),
                            selected: state.itemIds.contains(item.id),
                            onSelected: (held) => edit((c) {
                              final now = strings(c['itemIds']);
                              final next = held
                                  ? [
                                      // A group held one at a time keeps the one chosen.
                                      for (final id in now)
                                        if (!group.single || !options.any((o) => o.id == id)) id,
                                      item.id,
                                    ]
                                  : [
                                      for (final id in now)
                                        if (id != item.id) id,
                                    ];
                              return {'itemIds': next};
                            }),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
          if (resolved.available.isNotEmpty)
            Text(
              'Now within reach: ${resolved.available.map((i) => i.name).join(', ')}',
              style: theme.textTheme.bodySmall,
            ),
        ],
      ),
    );
  }
}
