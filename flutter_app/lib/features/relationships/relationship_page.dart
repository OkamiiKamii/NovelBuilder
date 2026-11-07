import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/connections.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/records/event.dart';
import '../../shared/domain/records/relation.dart';
import '../../shared/domain/relationships/history.dart';
import '../../shared/domain/relationships/relation_changes.dart';
import '../../shared/domain/relationships/relation_types.dart';
import '../../shared/domain/timeline/chronology.dart';
import '../../shared/domain/timeline/dates.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import '../timeline/widgets/date_editor.dart';

String relationshipPath(String relationId) => '/organize/relationship/$relationId';

/// The types offered for a stage: built-in ones the novel offers, its own, and Custom; the stage's own type always.
List<RelationPreset> offeredTypes(RelationSettings settings, [String? current]) => [
  for (final p in relationPresets)
    if (p.key == 'custom' || !settings.hidden.contains(p.key) || p.key == current) p,
  for (final t in settings.types) typeFor(t.key, settings.types),
];

/// Applies a relationship change now, saying plainly when it cannot be made.
T? relate<T>(CharacterActions actions, T Function(RelationChanges c) apply) => actions.now((c) {
  final r = RelationChanges(c.snapshot, now: c.now, createId: c.newId);
  final result = apply(r);
  c.snapshot = r.snapshot;
  return result;
});

/// The same, through autosave, for typing.
void relateLater(CharacterActions actions, String key, void Function(RelationChanges c) apply) =>
    actions.later(key, (c) {
      final r = RelationChanges(c.snapshot, now: c.now, createId: c.newId);
      apply(r);
      c.snapshot = r.snapshot;
    });

/// One relationship: who is who, how it evolved, and each stage of its history. Changing how it stands adds a stage;
/// a correction changes only the stage corrected.
class RelationshipPage extends ConsumerWidget {
  const RelationshipPage({super.key, required this.relationId});

  final String relationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    final relation = cast?.model.relations[relationId];
    if (cast == null || relation == null) {
      return PageScaffold(
        title: 'Relationship not found',
        child: EmptyState(
          icon: Icons.link_off,
          title: 'Relationship not found',
          message: cast == null ? 'No novel is open.' : 'It may have been deleted.',
          action: FilledButton(
            onPressed: () => context.go(cast == null ? Destination.library.path : Destination.organize.path),
            child: Text(cast == null ? 'Go to Library' : 'Characters'),
          ),
        ),
      );
    }
    final actions = CharacterActions(context, cast.novelId);
    final model = cast.model;
    String name(String id) => model.entries[id]?.name ?? 'Someone deleted';
    final settings = RelationSettings(cast.snapshot.rows('relationSettings').firstOrNull);
    final timeline = timelineOf(relation, model.order);
    final latest = timeline.isEmpty ? null : timeline.last.stage;
    final between = [
      for (final c in cast.derived.connections)
        if (c.kind == ConnectionKind.link &&
            {c.from.id, c.to.id}.containsAll([relation.fromId, relation.toId]) &&
            c.from.type == EntityType.entry &&
            c.to.type == EntityType.entry)
          c,
    ];
    const gap = SizedBox(height: 12);
    return PageScaffold(
      title: '${name(relation.fromId)} and ${name(relation.toId)}',
      subtitle: latest == null
          ? 'Relationship'
          : '${latest.label.isEmpty ? 'Related' : latest.label} · ${(Affinity.of(latest.affinity) ?? Affinity.neutral).label}',
      maxWidth: 1000,
      actions: [
        TextButton.icon(
          onPressed: () => actions.openCharacter(relation.fromId, tab: 'relationships'),
          icon: const Icon(Icons.arrow_back),
          label: Text(name(relation.fromId)),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfileBox(
            title: 'Who is who',
            children: [
              if (latest != null && latest.directional)
                Text('${name(relation.fromId)} (${latest.fromRole}) → ${name(relation.toId)} (${latest.toRole})')
              else
                Text('${name(relation.fromId)} and ${name(relation.toId)}: the same both ways now.'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  TextButton(
                    onPressed: () => actions.openCharacter(relation.fromId),
                    child: Text('Open ${name(relation.fromId)}'),
                  ),
                  TextButton(
                    onPressed: () => actions.openCharacter(relation.toId),
                    child: Text('Open ${name(relation.toId)}'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => relate(actions, (c) => c.reverse(relation.id)),
                    icon: const Icon(Icons.swap_horiz),
                    label: const Text('Swap who is who'),
                  ),
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
                    onPressed: () async {
                      final ok = await showConfirmDialog(
                        context,
                        title: 'Delete this relationship?',
                        message:
                            'Its whole history goes, with the connections recorded on it. ${name(relation.fromId)} and '
                            '${name(relation.toId)} are not changed.',
                        confirmLabel: 'Delete relationship',
                        destructive: true,
                      );
                      if (!ok) return;
                      actions.router.go(characterPath(relation.fromId, tab: 'relationships'));
                      relate(actions, (c) => c.removeRelation(relation.id));
                    },
                    child: const Text('Delete relationship…'),
                  ),
                ],
              ),
            ],
          ),
          gap,
          ProfileBox(
            title: 'How it evolved',
            caption:
                'Every state in order, what changed from the one before, and what brought it about, as you recorded it.',
            children: [
              for (final (i, t) in timeline.indexed)
                () {
                  final s = t.stage;
                  final changes = stageDifferences(
                    i == 0 ? null : timeline[i - 1].stage,
                    s,
                    fromName: name(relation.fromId),
                    toName: name(relation.toId),
                    attributes: settings.attributes,
                  );
                  final story = s.storyAt;
                  final when = story == null
                      ? null
                      : story['kind'] == 'event'
                      ? 'in story time at “${model.events[story['eventId']]?.name ?? 'an event since deleted'}”'
                      : 'in story time ${formatDate(EventDate.fromJson(story['when']), (id) => model.events[id]?.name, model.calendar)}';
                  final causes = [
                    if (s.causeEventId != null)
                      'brought about by “${model.events[s.causeEventId]?.name ?? 'an event since deleted'}”',
                    if (s.causeNodeId != null) 'shown in ${documentName(cast, s.causeNodeId)}',
                    if (s.event.trim().isNotEmpty) 'origin: ${s.event.trim()}',
                  ];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      [
                        t.range,
                        ?when,
                        '${s.label.isEmpty ? 'Related' : s.label} · ${(Affinity.of(s.affinity) ?? Affinity.neutral).label}'
                            '${s.title.isNotEmpty ? ' · “${s.title}”' : ''}',
                        if (changes.isNotEmpty) 'changed ${changes.join('; ')}',
                        if (causes.isNotEmpty)
                          causes.join(', ')
                        else
                          'No cause recorded. None is assumed from when it happened.',
                        if (t.orphaned) 'its chapter was deleted, so it counts from the start',
                      ].join(' · '),
                    ),
                  );
                }(),
            ],
          ),
          gap,
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: () => _recordChange(context, cast, actions, relation),
                icon: const Icon(Icons.add),
                label: const Text('Record a change…'),
              ),
              OutlinedButton(
                onPressed: () => context.go('/organize/relationships/settings'),
                child: const Text('Types and attributes…'),
              ),
            ],
          ),
          gap,
          for (final (i, t) in timeline.indexed) ...[
            _StageCard(
              key: ValueKey(t.stage.id),
              cast: cast,
              relation: relation,
              stage: t.stage,
              number: i + 1,
              range: t.range,
              settings: settings,
              actions: actions,
              names: (from: name(relation.fromId), to: name(relation.toId)),
            ),
            gap,
          ],
          ProfileBox(
            title: 'Also recorded between them',
            caption:
                'Connections made elsewhere between the same two characters: their own records, read from where they are kept.',
            children: [
              if (between.isEmpty) const NotRecorded('None.'),
              for (final c in between)
                Text('${name(c.from.id)} ${c.label.isEmpty ? 'related to' : c.label.toLowerCase()} ${name(c.to.id)}'),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _recordChange(
    BuildContext context,
    CastData cast,
    CharacterActions actions,
    CharacterRelation relation,
  ) async {
    final chosen = await showDialog<({String? nodeId, bool unknown})>(
      context: context,
      builder: (context) => _WhereDialog(cast: cast),
    );
    if (chosen == null) return;
    relate(actions, (c) => c.addStage(relation.id, chosen.nodeId, unknown: chosen.unknown));
    actions.tell(
      'A new stage is added, starting as things stood. Change it below; every earlier stage is kept as it was.',
    );
  }
}

const _unknown = '\u0000unknown';

/// Where in the book a change happens: the start of the story, a chapter or scene, or not said.
class _WhereDialog extends StatefulWidget {
  const _WhereDialog({required this.cast});
  final CastData cast;

  @override
  State<_WhereDialog> createState() => _WhereDialogState();
}

class _WhereDialogState extends State<_WhereDialog> {
  String _where = '';

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Record a change'),
    content: SizedBox(
      width: 420,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Where does the reader meet it? Every earlier stage stays exactly as it is.'),
          const SizedBox(height: 12),
          _StartChooser(cast: widget.cast, value: _where, onChanged: (v) => setState(() => _where = v)),
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(
        onPressed: () => Navigator.of(
          context,
        ).pop((nodeId: _where.isEmpty || _where == _unknown ? null : _where, unknown: _where == _unknown)),
        child: const Text('Add the stage'),
      ),
    ],
  );
}

class _StartChooser extends StatelessWidget {
  const _StartChooser({required this.cast, required this.value, required this.onChanged});
  final CastData cast;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final docs = cast.documents;
    final known = value.isEmpty || value == _unknown || docs.any((d) => d.id == value);
    return DropdownButtonFormField<String>(
      key: ValueKey('start:$value'),
      initialValue: known ? value : '',
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Where the reader meets it'),
      items: [
        const DropdownMenuItem(value: '', child: Text('From the start of the story')),
        const DropdownMenuItem(value: _unknown, child: Text('Not said')),
        for (final d in docs)
          DropdownMenuItem(
            value: d.id,
            child: Text(documentLabel(cast, d), overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) => onChanged(v ?? ''),
    );
  }
}

class _StageCard extends StatelessWidget {
  const _StageCard({
    super.key,
    required this.cast,
    required this.relation,
    required this.stage,
    required this.number,
    required this.range,
    required this.settings,
    required this.actions,
    required this.names,
  });

  final CastData cast;
  final CharacterRelation relation;
  final RelationStage stage;
  final int number;
  final String range;
  final RelationSettings settings;
  final CharacterActions actions;
  final ({String from, String to}) names;

  void _now(StageInput input) => relate(actions, (c) => c.updateStage(relation.id, stage.id, input));
  void _later(String what, StageInput input) =>
      relateLater(actions, 'stage:${stage.id}:$what', (c) => c.updateStage(relation.id, stage.id, input));

  Widget _eventChooser(String label, String? value, void Function(String? id) onChanged) {
    final events = cast.model.events.values.toList();
    final known = value == null || cast.model.events.containsKey(value);
    return DropdownButtonFormField<String>(
      key: ValueKey('${stage.id}:$label:$value'),
      initialValue: known ? (value ?? '') : '\u0000gone',
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        const DropdownMenuItem(value: '', child: Text('Not said')),
        if (!known) const DropdownMenuItem(value: '\u0000gone', child: Text('An event since deleted')),
        for (final e in events)
          DropdownMenuItem(
            value: e.id,
            child: Text(e.name, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) {
        if (v != '\u0000gone') onChanged(v == null || v.isEmpty ? null : v);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final types = offeredTypes(settings, stage.preset);
    final story = stage.storyAt;
    final start = stage.startUnknown ? _unknown : (stage.startNodeId ?? '');
    const gap = SizedBox(height: 10);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Semantics(header: true, child: Text('Stage $number · $range', style: theme.textTheme.titleMedium)),
                if (stage.startUnknown) ...[
                  IconButton(
                    tooltip: 'Move this stage earlier',
                    onPressed: () => relate(actions, (c) => c.moveStage(relation.id, stage.id, -1)),
                    icon: const Icon(Icons.arrow_upward),
                  ),
                  IconButton(
                    tooltip: 'Move this stage later',
                    onPressed: () => relate(actions, (c) => c.moveStage(relation.id, stage.id, 1)),
                    icon: const Icon(Icons.arrow_downward),
                  ),
                ],
                if (relation.stages.length > 1)
                  IconButton(
                    tooltip: 'Remove this stage',
                    onPressed: () async {
                      final ok = await showConfirmDialog(
                        context,
                        title: 'Remove stage $number?',
                        message: 'The stages around it then meet. The other stages are not changed.',
                        confirmLabel: 'Remove stage',
                        destructive: true,
                      );
                      if (ok) relate(actions, (c) => c.removeStage(relation.id, stage.id));
                    },
                    icon: const Icon(Icons.delete_outline),
                  ),
              ],
            ),
            gap,
            _StartChooser(
              cast: cast,
              value: start,
              onChanged: (v) => _now(
                v == _unknown ? const StageInput(startUnknown: true) : StageInput(start: (value: v.isEmpty ? null : v)),
              ),
            ),
            gap,
            DropdownButtonFormField<String>(
              key: ValueKey('${stage.id}:type:${stage.preset}'),
              initialValue: types.any((t) => t.key == stage.preset) ? stage.preset : 'custom',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Type'),
              items: [
                for (final t in types)
                  DropdownMenuItem(
                    value: t.key,
                    child: Text('${t.label} · ${t.category.label}', overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (k) => k == null ? null : _now(StageInput(preset: k)),
            ),
            if (stage.preset == 'custom') ...[
              gap,
              SavedTextField(
                label: 'Its name',
                value: stage.label,
                onChanged: (v) => _later('label', StageInput(label: v)),
              ),
              gap,
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('One-way: each side has its own role'),
                value: stage.directional,
                onChanged: (on) => _now(StageInput(directional: on)),
              ),
              Wrap(
                spacing: 12,
                runSpacing: 10,
                children: [
                  SizedBox(
                    width: 220,
                    child: SavedTextField(
                      label: '${names.from} is…',
                      value: stage.fromRole,
                      onChanged: (v) => _later('from', StageInput(fromRole: v)),
                    ),
                  ),
                  if (stage.directional)
                    SizedBox(
                      width: 220,
                      child: SavedTextField(
                        label: '${names.to} is…',
                        value: stage.toRole,
                        onChanged: (v) => _later('to', StageInput(toRole: v)),
                      ),
                    ),
                ],
              ),
              gap,
              DropdownButtonFormField<RelationCategory>(
                key: ValueKey('${stage.id}:group:${stage.category}'),
                initialValue: RelationCategory.of(stage.category),
                decoration: const InputDecoration(labelText: 'Group'),
                items: [for (final c in RelationCategory.values) DropdownMenuItem(value: c, child: Text(c.label))],
                onChanged: (c) => c == null ? null : _now(StageInput(category: c)),
              ),
            ] else if (stage.directional) ...[
              gap,
              Text('${names.from} is the ${stage.fromRole}; ${names.to} is the ${stage.toRole}.'),
            ],
            gap,
            SavedTextField(
              label: 'Title of this phase (optional)',
              hint: 'Rivalry over the Royal Tournament',
              value: stage.title,
              onChanged: (v) => _later('title', StageInput(title: v)),
            ),
            gap,
            Text('How they feel', style: theme.textTheme.labelLarge),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                for (final a in Affinity.values)
                  ChoiceChip(
                    label: Text(a.label),
                    selected: stage.affinity == a.name,
                    onSelected: (_) => _now(StageInput(affinity: a)),
                  ),
              ],
            ),
            for (final a in settings.attributes) ...[
              gap,
              Text('${a.label}, from 0 to $attributeMax (empty: not said)', style: theme.textTheme.labelLarge),
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  for (final (side, who, toward) in [('from', names.from, names.to), ('to', names.to, names.from)])
                    SizedBox(
                      width: 220,
                      child: _AttributeField(
                        label: '$who toward $toward',
                        value: side == 'from' ? stage.attribute(a.key).from : stage.attribute(a.key).to,
                        onChanged: (v) => _now(
                          StageInput(
                            attributes: {a.key: (from: v, to: v, setFrom: side == 'from', setTo: side == 'to')},
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
            gap,
            DropdownButtonFormField<String>(
              key: ValueKey('${stage.id}:story:${story?['kind']}'),
              initialValue: story?['kind'] == 'date' ? 'date' : (story?['kind'] == 'event' ? 'event' : ''),
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'When in story time'),
              items: const [
                DropdownMenuItem(value: '', child: Text('Not said')),
                DropdownMenuItem(value: 'event', child: Text('At an event…')),
                DropdownMenuItem(value: 'date', child: Text('On a date…')),
              ],
              onChanged: (v) {
                if (v == '') _now(const StageInput(storyEventId: (value: null)));
                if (v == 'event' && story?['kind'] != 'event') {
                  final first = cast.model.events.keys.firstOrNull;
                  if (first == null) {
                    actions.tell('There are no events on the timeline yet. Add one under Plan, or give a date.');
                  } else {
                    _now(StageInput(storyEventId: (value: first)));
                  }
                }
                if (v == 'date' && story?['kind'] != 'date') {
                  _now(
                    const StageInput(
                      storyDate: (
                        value: {
                          'precision': 'exact',
                          'year': 1,
                          'month': null,
                          'day': null,
                          'hour': null,
                          'minute': null,
                        },
                      ),
                    ),
                  );
                }
              },
            ),
            if (story?['kind'] == 'event') ...[
              gap,
              _eventChooser(
                'At the event',
                _str(story!['eventId']),
                (id) => _now(StageInput(storyEventId: (value: id))),
              ),
            ],
            if (story?['kind'] == 'date') ...[
              gap,
              DateEditor(
                key: ValueKey('${stage.id}:storyDate'),
                when: mapOrNull(story!['when']),
                calendar: cast.model.calendar,
                others: resolveChronology(cast.model.events.values, cast.model.calendar),
                legend: 'On a date in story time',
                offered: const ['exact', 'approximate', 'relative'],
                onChange: (edit) => _now(StageInput(storyDate: (value: edit(mapOrNull(story['when']) ?? const {})))),
              ),
            ],
            gap,
            _eventChooser(
              'Brought about by (an event)',
              stage.causeEventId,
              (id) => _now(StageInput(causeEventId: (value: id))),
            ),
            gap,
            DocumentChooser(
              cast: cast,
              label: 'Shown in (a chapter or scene)',
              value: stage.causeNodeId,
              none: 'Not said',
              onChanged: (id) => _now(StageInput(causeNodeId: (value: id))),
            ),
            gap,
            SavedTextField(
              label: 'Origin: what brought this about, in your words',
              value: stage.event,
              multiline: true,
              onChanged: (v) => _later('event', StageInput(event: v)),
            ),
            gap,
            SavedTextField(
              label: 'Notes',
              value: stage.notes,
              multiline: true,
              onChanged: (v) => _later('notes', StageInput(notes: v)),
            ),
          ],
        ),
      ),
    );
  }
}

String? _str(Object? v) => v is String && v.isNotEmpty ? v : null;

class _AttributeField extends StatelessWidget {
  const _AttributeField({required this.label, required this.value, required this.onChanged});

  final String label;
  final int? value;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) => DropdownButtonFormField<int?>(
    key: ValueKey('$label:$value'),
    initialValue: value,
    isExpanded: true,
    decoration: InputDecoration(labelText: label),
    items: [
      const DropdownMenuItem<int?>(child: Text('Not said')),
      for (var i = 0; i <= attributeMax; i++) DropdownMenuItem<int?>(value: i, child: Text('$i')),
    ],
    onChanged: onChanged,
  );
}

/// Asks for a new relationship from [fromId]: the other character and the type. Returns the new relationship's id.
Future<String?> addRelationshipFlow(
  BuildContext context,
  CastData cast,
  CharacterActions actions,
  String fromId,
) async {
  final settings = RelationSettings(cast.snapshot.rows('relationSettings').firstOrNull);
  final tied = {
    for (final r in cast.model.relations.values)
      if (r.fromId == fromId) r.toId else if (r.toId == fromId) r.fromId,
  };
  final others = [
    for (final e in cast.characters(except: fromId))
      if (!tied.contains(e.id)) e,
  ];
  if (others.isEmpty) {
    actions.tell('Every other character already has a relationship with this one. Record a change on it instead.');
    return null;
  }
  final chosen = await showDialog<(String, String)>(
    context: context,
    builder: (context) {
      String? other;
      var type = 'friends';
      return StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Add a relationship'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: other,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'With'),
                  items: [for (final e in others) DropdownMenuItem(value: e.id, child: Text(e.name))],
                  onChanged: (v) => setState(() => other = v),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: type,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Type',
                    helperText: 'For a one-way type, this character takes the first role (the Parent, the Mentor).',
                    helperMaxLines: 2,
                  ),
                  items: [
                    for (final t in offeredTypes(settings))
                      DropdownMenuItem(
                        value: t.key,
                        child: Text(t.label, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() => type = v ?? type),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            FilledButton(
              onPressed: other == null ? null : () => Navigator.of(context).pop((other!, type)),
              child: const Text('Add'),
            ),
          ],
        ),
      );
    },
  );
  if (chosen == null) return null;
  return relate(actions, (c) => c.createRelation(fromId, chosen.$1, chosen.$2))?.id;
}
