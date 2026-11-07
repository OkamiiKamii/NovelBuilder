import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/destinations.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/records/canon.dart';
import '../../shared/domain/records/event.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/structure/pacing.dart' show usedLabels;
import '../../shared/domain/timeline/ages.dart';
import '../../shared/domain/timeline/chronology.dart';
import '../../shared/domain/timeline/narrative.dart';
import '../../shared/domain/timeline/overlap.dart';
import '../characters/widgets/parts.dart';
import '../codex/widgets/connections_panel.dart';
import '../consequences/consequences_page.dart' show consequencesPath;
import '../plot/widgets/label_picker.dart';
import 'timeline_providers.dart';
import 'widgets/date_editor.dart';
import 'widgets/number_field.dart';

const importanceLabels = {'minor': 'Minor', 'major': 'Major', 'climax': 'Climax'};
const eventStatusLabels = {'idea': 'Idea', 'planned': 'Planned', 'confirmed': 'Confirmed'};

/// How a chapter tells an event, as a choice.
const revealChoices = {
  RevealRole.told: 'Told here',
  RevealRole.flashback: 'As a flashback',
  RevealRole.flashforward: 'As a flash-forward',
  RevealRole.foreshadowed: 'Foreshadowed',
  RevealRole.mentioned: 'Only mentioned',
  RevealRole.revealed: 'Revealed afterwards',
};

/// One event: when, where, who, what it links to, where it sits in the order, and where the reader meets it. Every
/// edit is saved through the timeline's checks, built on the event as it is stored at that moment.
class EventPage extends ConsumerWidget {
  const EventPage({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(timelineProvider);
    final placed = data?.placedById[eventId];
    if (data == null || placed == null) {
      return PageScaffold(
        title: 'Event',
        child: EmptyState(
          icon: Icons.event_busy_outlined,
          title: 'This event is not here',
          message: data == null
              ? 'Open a novel from the Library to see its timeline.'
              : 'It may have been deleted. The timeline lists every event the novel has.',
          action: FilledButton(
            onPressed: () => TimelineActions(context, data?.novelId ?? '').router.go(Destination.plan.path),
            child: const Text('Open the timeline'),
          ),
        ),
      );
    }
    return _EventEditor(data: data, placed: placed);
  }
}

class _EventEditor extends StatelessWidget {
  const _EventEditor({required this.data, required this.placed});

  final TimelineData data;
  final Placed placed;

  TimelineEvent get event => placed.event;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final actions = TimelineActions(context, data.novelId);
    final model = data.model;
    final cal = data.calendar;
    final id = event.id;
    final others = [
      for (final p in data.placed)
        if (p.event.id != id) p,
    ];
    void update(JsonMap Function(TimelineEvent stored) edit) => actions.edit((x) => x.updateEvent(id, edit));
    void updateLater(String key, JsonMap Function(TimelineEvent stored) edit) =>
        actions.editLater('$id:$key', (x) => x.updateEvent(id, edit));

    final cast = [
      for (final c in event.characters)
        if (model.entries[c.id] case final entry?) (id: c.id, age: c.age, entry: entry),
    ];
    final steps = {
      for (final c in cast)
        c.id: lifePath(
          data.placed,
          c.id,
          calendar: cal,
          birthDate: birthDateOf(c.entry),
        ).where((s) => s.placed.event.id == id).firstOrNull,
    };
    final findings = data.findingsOf(id);
    final issues = [
      ...placed.issues,
      for (final c in cast)
        if (steps[c.id]?.issue case final issue?)
          issue
              .replaceFirst(RegExp('^Stated'), '${c.entry.name} is stated')
              .replaceFirst(RegExp('^Takes part'), '${c.entry.name} takes part'),
      for (final f in findings) f.message,
    ];
    final record = data.recordById[id]!;
    final followers = [
      for (final p in others)
        if (p.event.afterId == id) p.event.name,
    ];
    final endMode = event.ongoing
        ? 'ongoing'
        : event.raw['end'] == null
        ? ''
        : (event.end is UnknownDate ? 'unknown' : 'date');
    final sameTime = atTheSameTime(data.records, id, cal.minutesPerDay);
    final docs = data.cast.documents;
    final linked = [
      for (final t in record.told)
        if (model.nodes.containsKey(t.nodeId)) t,
    ];
    Widget gap([double h = 16]) => SizedBox(height: h);
    Widget half(Widget child) => SizedBox(width: 260, child: child);

    return PageScaffold(
      title: event.name.isEmpty ? 'Untitled event' : event.name,
      subtitle: '${importanceLabels[event.importanceKey] ?? 'Minor'} · ${record.label}',
      actions: [
        TextButton.icon(
          onPressed: () => actions.router.go(consequencesPath(eventId: event.id)),
          icon: const Icon(Icons.account_tree_outlined),
          label: const Text('What depends on this event?'),
        ),
        TextButton.icon(
          onPressed: () => actions.router.go(Destination.plan.path),
          icon: const Icon(Icons.arrow_back),
          label: const Text('Timeline'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (issues.isNotEmpty) ...[
            Card(
              margin: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: theme.colorScheme.error),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.error_outline, color: theme.colorScheme.error, size: 20),
                        const SizedBox(width: 8),
                        Semantics(header: true, child: Text('Things to check', style: theme.textTheme.titleSmall)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    for (final issue in issues)
                      Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('• $issue')),
                    if (findings.isNotEmpty)
                      TextButton(
                        onPressed: () => actions.router.go('/review/timeline'),
                        child: const Text('The rule behind each, and what you can do: Timeline review'),
                      ),
                  ],
                ),
              ),
            ),
            gap(),
          ],
          SavedTextField(
            key: ValueKey('name:$id'),
            label: 'Event name',
            value: event.name,
            onChanged: (v) => updateLater('name', (_) => {'name': v}),
          ),
          gap(),
          DateEditor(
            key: ValueKey('when:$id'),
            when: mapOrNull(event.raw['when']),
            calendar: cal,
            others: others,
            onChange: (edit) => update((stored) => {'when': edit(mapOrNull(stored.raw['when']) ?? const {})}),
          ),
          gap(),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              half(
                DropdownButtonFormField<String>(
                  key: ValueKey('importance:${event.importanceKey}'),
                  initialValue: importanceLabels.containsKey(event.importanceKey) ? event.importanceKey : 'minor',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Importance'),
                  items: [
                    for (final e in importanceLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
                  ],
                  onChanged: (v) => update((_) => {'importance': v}),
                ),
              ),
              half(
                DropdownButtonFormField<String>(
                  key: ValueKey('location:${event.locationId}'),
                  initialValue: data.places.any((p) => p.id == event.locationId) ? event.locationId : '',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Location'),
                  items: [
                    DropdownMenuItem(
                      value: '',
                      child: Text(data.places.isEmpty ? 'No locations in the world yet' : 'Not set'),
                    ),
                    for (final p in data.places)
                      DropdownMenuItem(
                        value: p.id,
                        child: Text(p.name, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => update((_) => {'locationId': v == null || v.isEmpty ? null : v}),
                ),
              ),
              SizedBox(
                width: 124,
                child: NumberField(
                  key: ValueKey('lasts:${event.duration?.amount}'),
                  label: 'Lasts',
                  value: event.duration?.amount,
                  decimals: true,
                  hint: '—',
                  enabled: event.raw['end'] == null && !event.ongoing,
                  check: (v) => v != null && v < 0 ? 'Give a length of 0 or more; it was not changed.' : null,
                  onCommit: (v) => update(
                    (stored) => {
                      'duration': v == null || v == 0
                          ? null
                          : {'amount': v, 'unit': stored.duration?.unit.name ?? 'days'},
                    },
                  ),
                ),
              ),
              SizedBox(
                width: 124,
                child: DropdownButtonFormField<TimeUnit>(
                  key: ValueKey('unit:${event.duration?.unit}'),
                  initialValue: event.duration?.unit ?? TimeUnit.days,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Unit'),
                  items: [for (final u in TimeUnit.values) DropdownMenuItem(value: u, child: Text(u.name))],
                  onChanged: event.duration == null
                      ? null
                      : (u) => update(
                          (stored) => stored.duration == null
                              ? const {}
                              : {
                                  'duration': {'amount': stored.duration!.amount, 'unit': (u ?? TimeUnit.days).name},
                                },
                        ),
                ),
              ),
            ],
          ),
          gap(),
          DropdownButtonFormField<String>(
            key: ValueKey('ends:$endMode'),
            initialValue: endMode,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Ends'),
            items: [
              DropdownMenuItem(
                value: '',
                child: Text(event.duration != null ? 'When the time it lasts is over' : 'At once: it is a moment'),
              ),
              const DropdownMenuItem(value: 'date', child: Text('On a date…')),
              const DropdownMenuItem(value: 'unknown', child: Text('At a time not given')),
              const DropdownMenuItem(value: 'ongoing', child: Text('Still going on')),
            ],
            onChanged: (mode) => update((stored) {
              switch (mode) {
                case 'ongoing':
                  return {'ongoing': true};
                case 'unknown':
                  return {
                    'end': {'precision': 'unknown'},
                  };
                case 'date':
                  // Starts from the date it already has, or the day it begins, for the author to move on.
                  final end = mapOrNull(stored.raw['end']);
                  final when = mapOrNull(stored.raw['when']);
                  final from = end != null && end['precision'] != 'unknown'
                      ? end
                      : (when?['precision'] == 'exact' || when?['precision'] == 'approximate' ? when : null);
                  return {
                    'end':
                        from ??
                        {'precision': 'exact', 'year': 1, 'month': null, 'day': null, 'hour': null, 'minute': null},
                  };
                default:
                  return {'end': null, 'ongoing': false};
              }
            }),
          ),
          if (endMode == 'unknown')
            const _Hint(
              'It lasts a while, but its end is not given yet. The timeline draws it fading out after it begins, and never says it is over.',
            ),
          if (endMode == 'ongoing')
            const _Hint('Still going on when the story ends: the timeline draws it to the edge, with an arrow.'),
          if (endMode == 'date') ...[
            gap(12),
            DateEditor(
              key: ValueKey('end:$id'),
              when: mapOrNull(event.raw['end']),
              calendar: cal,
              others: others,
              legend: 'Ends on',
              prefix: 'End',
              offered: const ['exact', 'approximate', 'relative'],
              onChange: (edit) => update((stored) {
                final end = mapOrNull(stored.raw['end']);
                return end == null ? const {} : {'end': edit(end)};
              }),
            ),
          ],
          gap(),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              half(
                DropdownButtonFormField<String>(
                  key: ValueKey('status:${event.statusKey}'),
                  initialValue: eventStatusLabels.containsKey(event.statusKey) ? event.statusKey : 'confirmed',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Planning status'),
                  items: [
                    for (final e in eventStatusLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
                  ],
                  onChanged: (v) => update((_) => {'status': v}),
                ),
              ),
              half(
                DropdownButtonFormField<String>(
                  key: ValueKey('canon:${event.canonKey}'),
                  initialValue: CanonStatus.of(event.canonKey)?.key ?? 'canon',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Canon status'),
                  items: [for (final s in CanonStatus.values) DropdownMenuItem(value: s.key, child: Text(s.label))],
                  onChanged: (v) => update((_) => {'canon': v}),
                ),
              ),
            ],
          ),
          gap(),
          IdPicker(
            label: 'Plot threads',
            chosen: event.threadIds,
            options: [for (final t in data.threads) (t.id, t.title.isEmpty ? 'Untitled thread' : t.title)],
            nameOf: (tid) => model.threads[tid]?.title,
            onChanged: (ids) => update((_) => {'threadIds': ids}),
          ),
          gap(12),
          LabelPicker(
            labels: event.labels,
            used: usedLabels(model),
            of: 'this event',
            onChanged: (labels) => update((_) => {'labels': labels}),
          ),
          gap(),
          ProfileBox(
            title: 'Characters involved',
            caption:
                'Their age at this event (0 for their birth). Leave it empty to have it worked out from their other records.',
            trailing: _AddMenu(
              tooltip: 'Add a character',
              label: 'Add a character',
              options: [
                for (final c in data.cast.characters())
                  if (!event.characters.any((x) => x.id == c.id)) (c.id, c.name),
              ],
              onSelected: (cid) => update(
                (stored) => {
                  'characters': [
                    ...[
                      for (final c in stored.characters) {'id': c.id, 'age': c.age},
                    ],
                    {'id': cid, 'age': null},
                  ],
                },
              ),
            ),
            children: [
              if (cast.isEmpty) const NotRecorded('No one yet.'),
              for (final c in cast)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      TextButton(
                        onPressed: () => actions.openCharacter(c.id),
                        child: Text(c.entry.name.isEmpty ? 'Unnamed' : c.entry.name),
                      ),
                      SizedBox(
                        width: 130,
                        child: NumberField(
                          key: ValueKey('age:${c.id}:${c.age}'),
                          label: '${c.entry.name}’s age',
                          value: c.age,
                          hint: switch (steps[c.id]?.ageAt) {
                            final KnownAge a => '≈ ${ageWords(a)}',
                            final AgeRange a => '≈ ${a.min}–${a.max}',
                            _ => 'Age',
                          },
                          check: (v) =>
                              v != null && (v < 0 || v > 100000) ? 'An age from 0 up; it was not changed.' : null,
                          onCommit: (age) => update(
                            (stored) => {
                              'characters': [
                                for (final x in stored.characters) {'id': x.id, 'age': x.id == c.id ? age : x.age},
                              ],
                            },
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Remove ${c.entry.name}',
                        icon: const Icon(Icons.close),
                        onPressed: () => update(
                          (stored) => {
                            'characters': [
                              for (final x in stored.characters)
                                if (x.id != c.id) {'id': x.id, 'age': x.age},
                            ],
                          },
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          gap(),
          ProfileBox(
            title: 'Chapters and scenes where this is told',
            caption:
                'In reading order, each with how it tells it. Where it is told never changes when it happens, and no chapter is moved.',
            trailing: _AddMenu(
              tooltip: 'Link a chapter or scene',
              label: 'Link a chapter or scene',
              options: [
                for (final d in docs)
                  if (!event.nodeIds.contains(d.id)) (d.id, nodeLabel(model, d.id)),
              ],
              onSelected: (nid) => update(
                (stored) => {
                  'nodeIds': [...stored.nodeIds, nid],
                },
              ),
            ),
            children: [
              if (linked.isEmpty) const NotRecorded('Not linked to a chapter yet.'),
              for (final t in linked)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      TextButton(
                        onPressed: () => actions.openChapter(t.nodeId),
                        child: Text(nodeLabel(model, t.nodeId)),
                      ),
                      SizedBox(
                        width: 210,
                        child: DropdownButtonFormField<RevealRole>(
                          key: ValueKey('role:${t.nodeId}:${t.role}'),
                          initialValue: t.role,
                          isExpanded: true,
                          decoration: InputDecoration(labelText: 'How ${nodeLabel(model, t.nodeId)} tells it'),
                          items: [
                            for (final e in revealChoices.entries)
                              DropdownMenuItem(
                                value: e.key,
                                child: Text(e.value, overflow: TextOverflow.ellipsis),
                              ),
                          ],
                          onChanged: (role) => update(
                            (stored) => {
                              'reveals': [
                                for (final r in maps(stored.raw['reveals']))
                                  if (r['nodeId'] != t.nodeId) r,
                                if (role != null && role != RevealRole.told) {'nodeId': t.nodeId, 'role': role.name},
                              ],
                            },
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Unlink ${nodeLabel(model, t.nodeId)}',
                        icon: const Icon(Icons.link_off),
                        onPressed: () => update(
                          (stored) => {
                            'nodeIds': [
                              for (final n in stored.nodeIds)
                                if (n != t.nodeId) n,
                            ],
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              TextButton(
                onPressed: () => actions.router.go('/visualize/order'),
                child: const Text('Compare story order and reading order'),
              ),
            ],
          ),
          gap(),
          IdPicker(
            label: 'Factions, items and lore involved',
            chosen: event.entryIds,
            options: [
              for (final e in stableSorted(
                data.cast.entries.where((e) => e.category != 'character'),
                (a, b) => localeCompare(a.name, b.name),
              ))
                (e.id, e.name.isEmpty ? 'Untitled' : e.name),
            ],
            nameOf: data.cast.nameOf,
            onChanged: (ids) => update((_) => {'entryIds': ids}),
          ),
          gap(),
          DropdownButtonFormField<String>(
            key: ValueKey('after:${event.afterId}'),
            initialValue: others.any((p) => p.event.id == event.afterId) ? event.afterId : '',
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Comes after (previous event)'),
            items: [
              const DropdownMenuItem(value: '', child: Text('Not set')),
              for (final p in others)
                DropdownMenuItem(
                  value: p.event.id,
                  child: Text(p.event.name.isEmpty ? 'Untitled event' : p.event.name, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => update((_) => {'afterId': v == null || v.isEmpty ? null : v}),
          ),
          if (followers.isNotEmpty) _Hint('Followed by: ${followers.join(', ')}'),
          gap(),
          SavedTextField(
            key: ValueKey('description:$id'),
            label: 'Description',
            value: event.description,
            multiline: true,
            minLines: 4,
            onChanged: (v) => updateLater('description', (_) => {'description': v}),
          ),
          gap(),
          ProfileBox(
            title: 'At the same time',
            children: [
              if (record.bounds == null) const NotRecorded('Not placed in time yet, so nothing can be compared.'),
              if (record.bounds != null && sameTime.isEmpty) const NotRecorded('Nothing else happens then.'),
              for (final x in sameTime)
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton(
                    onPressed: () => actions.openEvent(x.record.id),
                    child: Text(
                      '${x.record.title} · ${x.how.words}'
                      '${x.record.event.locationId != null && model.entries[x.record.event.locationId] != null ? ' · at ${model.entries[x.record.event.locationId]!.name}' : ''}',
                    ),
                  ),
                ),
            ],
          ),
          gap(),
          ConnectionsPanel(cast: data.cast, self: EntityRef(EntityType.event, id), actions: actions),
          gap(24),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            alignment: WrapAlignment.spaceBetween,
            children: [
              Text('Changing chapters never changes this date.', style: theme.textTheme.bodySmall),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                onPressed: () => _delete(context, actions, followers.isNotEmpty),
                icon: const Icon(Icons.delete_outline),
                label: const Text('Delete event…'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _delete(BuildContext context, TimelineActions actions, bool followed) async {
    final name = event.name.isEmpty ? 'Untitled event' : event.name;
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete $name?'),
        content: Text(
          'Chapters, scenes and entries it links to are not changed, and its connections go with it.'
          '${followed ? ' Events set to follow it will be flagged so you can place them again.' : ''}'
          ' You can undo this.',
        ),
        actions: [
          TextButton(autofocus: true, onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    actions.flush();
    final kept = actions.timeline.deleteEvent(actions.novelId, event.id, name: name);
    actions.router.go(Destination.plan.path);
    actions.tell('Deleted $name.', actionLabel: 'Undo', onAction: () => actions.timeline.undo(kept));
  }
}

class _Hint extends StatelessWidget {
  const _Hint(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(text, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
    );
  }
}

/// A button that offers records to add, by id and name.
class _AddMenu extends StatelessWidget {
  const _AddMenu({required this.tooltip, required this.label, required this.options, required this.onSelected});

  final String tooltip;
  final String label;
  final List<(String, String)> options;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    if (options.isEmpty) return const SizedBox.shrink();
    return PopupMenuButton<String>(
      tooltip: tooltip,
      useRootNavigator: true,
      itemBuilder: (_) => [
        for (final (id, name) in options)
          PopupMenuItem(
            value: id,
            child: Text(name, overflow: TextOverflow.ellipsis),
          ),
      ],
      onSelected: onSelected,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.add, size: 18, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 4),
            Flexible(
              child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.primary)),
            ),
          ],
        ),
      ),
    );
  }
}
