import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/destinations.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/branch.dart';
import '../../shared/domain/records/calendar.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/event.dart';
import '../../shared/domain/timeline/chronology.dart';
import '../../shared/domain/timeline/histories.dart';
import '../characters/widgets/parts.dart';
import '../workspace/area_switch.dart';
import 'timeline_providers.dart';
import 'widgets/date_editor.dart';

const _canonWords = {
  BranchStatus.alternate: 'Alternate canon: an official second course of events. The main timeline stays as it is.',
  BranchStatus.nonCanon: 'Not canon. The main timeline is the novel’s canon and stays as it is.',
  BranchStatus.experimental: 'An experiment, not canon. The main timeline stays as it is.',
  BranchStatus.abandoned: 'Set aside, not canon. The main timeline stays as it is.',
};

/// ALTERNATE HISTORIES: other courses of events for this novel, kept apart from its main timeline. Each holds only
/// what is different, and the rest is the main timeline's own events. Nothing here changes the main timeline, merges
/// into it, or changes a history's canon status by itself.
class HistoriesPage extends ConsumerStatefulWidget {
  const HistoriesPage({super.key, this.historyId});

  final String? historyId;

  @override
  ConsumerState<HistoriesPage> createState() => _HistoriesPageState();
}

class _HistoriesPageState extends ConsumerState<HistoriesPage> {
  String _name = '';
  String _kind = HistoryKind.hypothetical.key;
  String _status = BranchStatus.experimental.key;
  String? _baseId;
  String? _originId;
  String? _causeId;
  String _note = '';
  late final _nameController = TextEditingController();
  late final _noteController = TextEditingController();
  late final _newEventController = TextEditingController();

  /// The two timelines compared: `main`, or a history's id. Null: the default pair.
  String? _a;
  String? _b;
  bool _showSame = false;

  @override
  void dispose() {
    _nameController.dispose();
    _noteController.dispose();
    _newEventController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(timelineProvider);
    if (data == null) {
      return PageScaffold(
        title: 'Alternate histories',
        child: EmptyState(
          icon: Icons.menu_book_outlined,
          title: 'No novel open',
          message: 'Alternate histories belong to one novel. Open one from the Library.',
          action: FilledButton(
            onPressed: () => TimelineActions(context, '').router.go(Destination.library.path),
            child: const Text('Go to Library'),
          ),
        ),
      );
    }
    final theme = Theme.of(context);
    final actions = TimelineActions(context, data.novelId);
    final cal = data.calendar;
    final main = data.model.events;
    final byId = data.histories;
    final list = data.historyList;
    final selected = byId[widget.historyId];
    String timelineName(String? id) => id == null ? mainTimeline : '“${byId[id]?.name ?? 'a deleted history'}”';
    List<Placed> inOrder(Map<String, TimelineEvent> events) => resolveChronology(events.values, cal);
    String counts(AlternateHistory h) {
      final parts = [
        if (h.changed.isNotEmpty) '${h.changed.length} changed',
        if (h.removed.isNotEmpty) '${h.removed.length} not happening',
        if (h.added.isNotEmpty) '${h.added.length} only here',
      ];
      return parts.isEmpty ? 'No differences yet' : parts.join(' · ');
    }

    void select(String? id) => actions.router.go(id == null ? '/plan/histories' : '/plan/histories?history=$id');
    final draftBase = historyEvents(main, byId, _baseId);

    void create() {
      final made = actions.edit(
        (x) => x.createHistory(
          name: _name,
          kind: _kind,
          status: _status,
          baseId: _baseId,
          originEventId: _originId,
          causeEventId: _kind == HistoryKind.timeTravel.key ? _causeId : null,
          note: _note,
        ),
      );
      if (made == null) return;
      setState(() {
        _name = '';
        _note = '';
        _originId = null;
        _causeId = null;
        _nameController.clear();
        _noteController.clear();
      });
      select(made);
    }

    Widget box(double width, Widget child) => SizedBox(width: width, child: child);
    DropdownMenuItem<String> eventItem(Placed p) => DropdownMenuItem(
      value: p.event.id,
      child: Text('${p.event.name} (${p.label})', overflow: TextOverflow.ellipsis),
    );
    final timelineChoices = [
      const DropdownMenuItem(value: 'main', child: Text('$mainTimeline (canon)')),
      for (final h in list)
        DropdownMenuItem(
          value: h.id,
          child: Text('${h.name} (${h.status.label})', overflow: TextOverflow.ellipsis),
        ),
    ];

    // Comparing: any two timelines, by default the selected history against what it branches from.
    String? pick(String? chosen, String? fallback) =>
        chosen == null ? fallback : (chosen == 'main' ? null : (byId.containsKey(chosen) ? chosen : fallback));
    final compareA = pick(_a, selected?.baseId);
    final compareB = pick(_b, selected?.id ?? list.firstOrNull?.id);
    final diffs = compareTimelines(historyEvents(main, byId, compareA), historyEvents(main, byId, compareB), cal);

    return PageScaffold(
      title: 'Alternate histories',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: planParts, current: '/plan/histories'),
          const SizedBox(height: 16),
          ProfileBox(
            title: 'Histories',
            children: [
              if (list.isEmpty)
                const NotRecorded(
                  'No alternate histories yet. Start one below: it reads exactly as the timeline it branches from until you change something.',
                ),
              for (final h in list)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  color: h.id == selected?.id ? theme.colorScheme.secondaryContainer : null,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => select(h.id),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            spacing: 8,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(h.name, style: theme.textTheme.titleSmall),
                              Text('${h.status.label} · ${h.kind.label}', style: theme.textTheme.labelSmall),
                            ],
                          ),
                          Text(
                            originWords(h, historyEvents(main, byId, h.baseId), byId, cal),
                            style: theme.textTheme.bodySmall,
                          ),
                          Text(counts(h), style: theme.textTheme.bodySmall),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          ProfileBox(
            title: 'Start an alternate history',
            children: [
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  box(
                    260,
                    TextField(
                      controller: _nameController,
                      decoration: const InputDecoration(labelText: 'Name', hintText: 'If the Keep had held'),
                      onChanged: (v) => _name = v,
                    ),
                  ),
                  box(
                    220,
                    DropdownButtonFormField<String>(
                      key: ValueKey('kind:$_kind'),
                      initialValue: _kind,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Kind'),
                      items: [for (final k in HistoryKind.values) DropdownMenuItem(value: k.key, child: Text(k.label))],
                      onChanged: (v) => setState(() => _kind = v ?? _kind),
                    ),
                  ),
                  box(
                    220,
                    DropdownButtonFormField<String>(
                      key: ValueKey('status:$_status'),
                      initialValue: _status,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Canon status'),
                      items: [for (final s in historyStatuses) DropdownMenuItem(value: s.key, child: Text(s.label))],
                      onChanged: (v) => setState(() => _status = v ?? _status),
                    ),
                  ),
                  box(
                    300,
                    DropdownButtonFormField<String>(
                      key: ValueKey('base:$_baseId'),
                      initialValue: _baseId ?? 'main',
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Branches from'),
                      items: timelineChoices,
                      onChanged: (v) => setState(() {
                        _baseId = v == null || v == 'main' ? null : v;
                        _originId = null;
                        _causeId = null;
                      }),
                    ),
                  ),
                  box(
                    300,
                    DropdownButtonFormField<String>(
                      key: ValueKey('origin:$_baseId:$_originId'),
                      initialValue: _originId ?? '',
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Departs at'),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('Across the whole timeline')),
                        for (final p in inOrder(draftBase)) eventItem(p),
                      ],
                      onChanged: (v) => setState(() => _originId = v == null || v.isEmpty ? null : v),
                    ),
                  ),
                  if (_kind == HistoryKind.timeTravel.key)
                    box(
                      300,
                      DropdownButtonFormField<String>(
                        key: ValueKey('cause:$_baseId:$_causeId'),
                        initialValue: _causeId ?? '',
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Caused by'),
                        items: [
                          const DropdownMenuItem(value: '', child: Text('Not said')),
                          for (final p in inOrder(draftBase)) eventItem(p),
                        ],
                        onChanged: (v) => setState(() => _causeId = v == null || v.isEmpty ? null : v),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                decoration: const InputDecoration(labelText: 'What it explores', hintText: 'Optional'),
                onChanged: (v) => _note = v,
              ),
              const SizedBox(height: 12),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: FilledButton(onPressed: create, child: const Text('Start the history')),
              ),
            ],
          ),
          if (selected != null) ...[
            const SizedBox(height: 16),
            _SelectedHistory(
              key: ValueKey('history:${selected.id}'),
              data: data,
              history: selected,
              actions: actions,
              timelineName: timelineName,
              newEventController: _newEventController,
              onDeleted: () => select(null),
            ),
          ],
          if (list.isNotEmpty) ...[
            const SizedBox(height: 16),
            ProfileBox(
              title: 'Compare',
              children: [
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    box(
                      300,
                      DropdownButtonFormField<String>(
                        key: ValueKey('a:$compareA'),
                        initialValue: compareA ?? 'main',
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Compare'),
                        items: timelineChoices,
                        onChanged: (v) => setState(() => _a = v),
                      ),
                    ),
                    box(
                      300,
                      DropdownButtonFormField<String>(
                        key: ValueKey('b:$compareB'),
                        initialValue: compareB ?? 'main',
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'with'),
                        items: timelineChoices,
                        onChanged: (v) => setState(() => _b = v),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Semantics(
                  liveRegion: true,
                  child: Text(comparisonSummary(diffs, timelineName(compareA), timelineName(compareB))),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _showSame,
                  onChanged: (v) => setState(() => _showSame = v ?? false),
                  title: const Text('Show the events that are the same too'),
                ),
                for (final d in diffs)
                  if (_showSame || d.difference != Difference.same)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text((d.b ?? d.a)!.name, style: theme.textTheme.titleSmall),
                          Text(
                            'In ${timelineName(compareA)}: ${d.a == null ? 'Does not happen' : '${d.a!.name == (d.b ?? d.a)!.name ? '' : '${d.a!.name}: '}${d.whenA}'}',
                            style: theme.textTheme.bodySmall,
                          ),
                          Text(
                            'In ${timelineName(compareB)}: ${d.b == null ? 'Does not happen' : d.whenB}',
                            style: theme.textTheme.bodySmall,
                          ),
                          Text(switch (d.difference) {
                            Difference.same => 'The same',
                            Difference.changed => 'Changed: ${d.fields.join(', ')}',
                            Difference.moved =>
                              'Moved ${d.direction ?? ''}: its date depends on one that changed'.replaceAll('  ', ' '),
                            Difference.onlyA => 'Only in ${timelineName(compareA)}',
                            Difference.onlyB => 'Only in ${timelineName(compareB)}',
                          }),
                        ],
                      ),
                    ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _SelectedHistory extends StatelessWidget {
  const _SelectedHistory({
    super.key,
    required this.data,
    required this.history,
    required this.actions,
    required this.timelineName,
    required this.newEventController,
    required this.onDeleted,
  });

  final TimelineData data;
  final AlternateHistory history;
  final TimelineActions actions;
  final String Function(String? id) timelineName;
  final TextEditingController newEventController;
  final VoidCallback onDeleted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cal = data.calendar;
    final main = data.model.events;
    final byId = data.histories;
    final h = history;
    final base = historyEvents(main, byId, h.baseId);
    final mine = historyEvents(main, byId, h.id);
    final baseOrder = resolveChronology(base.values, cal);
    final stale = staleChanges(main, byId, h);
    final origin = h.originEventId == null ? null : baseOrder.where((p) => p.event.id == h.originEventId).firstOrNull;
    final cause = h.causeEventId == null ? null : baseOrder.where((p) => p.event.id == h.causeEventId).firstOrNull;
    final before = origin?.value == null
        ? const <String>[]
        : [
            for (final id in h.changed.keys)
              if (baseOrder.where((p) => p.event.id == id).firstOrNull?.value case final v? when v < origin!.value!) id,
          ];
    final addedIds = {for (final e in h.added) e.id};

    Future<void> change(TimelineEvent e) async {
      final added = addedIds.contains(e.id);
      final result = await showDialog<JsonMap>(
        context: context,
        builder: (_) =>
            _ChangeDialog(event: e, calendar: cal, places: data.places, others: resolveChronology(mine.values, cal)),
      );
      if (result == null) return;
      actions.edit((x) => added ? x.updateAddedEvent(h.id, e.id, result) : x.changeHistoryEvent(h.id, e.id, result));
    }

    Future<void> delete() async {
      final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Delete this alternate history?'),
          content: Text(
            '“${h.name}” and its differences are deleted. The main timeline and its events are not touched. Histories based on this one are based on ${timelineName(h.baseId)} instead, keeping their own differences.',
          ),
          actions: [
            TextButton(autofocus: true, onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Delete history'),
            ),
          ],
        ),
      );
      if (yes != true) return;
      onDeleted();
      actions.edit((x) => x.removeHistory(h.id));
    }

    Widget box(double width, Widget child) => SizedBox(width: width, child: child);
    return ProfileBox(
      title: h.name,
      children: [
        Semantics(
          liveRegion: true,
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: h.status.label,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                TextSpan(text: ' · ${h.kind.label}. ${_canonWords[h.status] ?? ''}'),
              ],
            ),
          ),
        ),
        Text(originWords(h, base, byId, cal), style: theme.textTheme.bodySmall),
        if (cause != null)
          Text(
            'Caused by “${cause.event.name}” (${cause.label})'
            '${origin != null && cause.value != null && origin.value != null && cause.value! > origin.value! ? ', which comes later in story time than where this history departs: the change reaches back.' : '.'}',
            style: theme.textTheme.bodySmall,
          ),
        if (h.note.isNotEmpty) Text(h.note, style: theme.textTheme.bodySmall),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            box(
              260,
              SavedTextField(
                key: ValueKey('name:${h.id}'),
                label: 'Name',
                value: h.name,
                onChanged: (v) => actions.editLater('history:${h.id}:name', (x) => x.updateHistory(h.id, {'name': v})),
              ),
            ),
            box(
              220,
              DropdownButtonFormField<String>(
                key: ValueKey('status:${h.status.key}'),
                initialValue: h.status.key,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Canon status'),
                items: [for (final s in historyStatuses) DropdownMenuItem(value: s.key, child: Text(s.label))],
                onChanged: (v) => actions.edit((x) => x.updateHistory(h.id, {'status': v})),
              ),
            ),
            box(
              220,
              DropdownButtonFormField<String>(
                key: ValueKey('kind:${h.kind.key}'),
                initialValue: h.kind.key,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Kind'),
                items: [for (final k in HistoryKind.values) DropdownMenuItem(value: k.key, child: Text(k.label))],
                onChanged: (v) => actions.edit((x) => x.updateHistory(h.id, {'kind': v})),
              ),
            ),
            box(
              300,
              DropdownButtonFormField<String>(
                key: ValueKey('departs:${h.originEventId}'),
                initialValue: base.containsKey(h.originEventId) ? h.originEventId : '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Departs at'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Across the whole timeline')),
                  for (final p in baseOrder)
                    DropdownMenuItem(
                      value: p.event.id,
                      child: Text('${p.event.name} (${p.label})', overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) =>
                    actions.edit((x) => x.updateHistory(h.id, {'originEventId': v == null || v.isEmpty ? null : v})),
              ),
            ),
          ],
        ),
        if (stale.isNotEmpty || before.isNotEmpty) ...[
          const SizedBox(height: 12),
          if (stale.isNotEmpty)
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  '${stale.length == 1 ? '1 change points' : '${stale.length} changes point'} at events no longer in ${timelineName(h.baseId)}. They are not applied.',
                ),
                TextButton(onPressed: () => actions.edit((x) => x.forgetStale(h.id)), child: const Text('Forget them')),
              ],
            ),
          if (before.isNotEmpty)
            Text(
              '${before.map((id) => '“${base[id]?.name}”').join(', ')} ${before.length == 1 ? 'is' : 'are'} changed, though ${before.length == 1 ? 'it comes' : 'they come'} before where this history departs. That may be what you mean (a time-travel branch reaches back), or a slip.',
            ),
        ],
        const SizedBox(height: 16),
        Semantics(header: true, child: Text('Events in this history', style: theme.textTheme.titleSmall)),
        const SizedBox(height: 6),
        for (final p in resolveChronology(mine.values, cal))
          () {
            final e = p.event;
            final added = addedIds.contains(e.id);
            final changed = h.changed.containsKey(e.id);
            final fields = changed && base[e.id] != null
                ? compareTimelines({e.id: base[e.id]!}, {e.id: e}, cal).firstOrNull?.fields ?? const <String>[]
                : const <String>[];
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.label, style: theme.textTheme.bodySmall),
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(e.name, style: theme.textTheme.titleSmall),
                      if (added) Text('Only in this history', style: theme.textTheme.labelSmall),
                      if (changed)
                        Text(
                          'Changed here${fields.isEmpty ? '' : ': ${fields.join(', ')}'}',
                          style: theme.textTheme.labelSmall,
                        ),
                    ],
                  ),
                  Wrap(
                    spacing: 4,
                    children: [
                      TextButton(
                        onPressed: () => change(e),
                        child: Semantics(label: 'Change how “${e.name}” goes here', child: const Text('Change')),
                      ),
                      if (changed)
                        TextButton(
                          onPressed: () => actions.edit((x) => x.restoreHistoryEvent(h.id, e.id)),
                          child: Semantics(
                            label: 'Restore “${e.name}” as ${timelineName(h.baseId)} has it',
                            child: const Text('Restore'),
                          ),
                        ),
                      if (added)
                        TextButton(
                          onPressed: () => actions.edit((x) => x.deleteAddedEvent(h.id, e.id)),
                          child: Semantics(label: 'Delete “${e.name}”', child: const Text('Delete')),
                        )
                      else
                        TextButton(
                          onPressed: () => actions.edit((x) => x.removeHistoryEvent(h.id, e.id)),
                          child: const Text('Does not happen here'),
                        ),
                    ],
                  ),
                ],
              ),
            );
          }(),
        if (h.removed.any(base.containsKey)) ...[
          const SizedBox(height: 8),
          Semantics(header: true, child: Text('Do not happen in this history', style: theme.textTheme.titleSmall)),
          for (final id in h.removed.where(base.containsKey))
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(base[id]!.name, style: const TextStyle(decoration: TextDecoration.lineThrough)),
                TextButton(
                  onPressed: () => actions.edit((x) => x.restoreHistoryEvent(h.id, id)),
                  child: Semantics(
                    label: 'Restore “${base[id]!.name}” as ${timelineName(h.baseId)} has it',
                    child: const Text('Restore'),
                  ),
                ),
              ],
            ),
        ],
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 280,
              child: TextField(
                controller: newEventController,
                decoration: const InputDecoration(
                  labelText: 'Name of an event only in this history',
                  hintText: 'The parley at the gate',
                ),
              ),
            ),
            OutlinedButton(
              onPressed: () {
                final name = newEventController.text;
                final made = actions.edit((x) => x.addHistoryEvent(h.id, name));
                if (made != null) newEventController.clear();
              },
              child: const Text('Add an event only here'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
            onPressed: delete,
            icon: const Icon(Icons.delete_outline),
            label: const Text('Delete this history…'),
          ),
        ),
      ],
    );
  }
}

/// How an event goes in a history: its name, date, place, whether it is still going on, and what happens. Only what
/// differs from the base is kept.
class _ChangeDialog extends StatefulWidget {
  const _ChangeDialog({required this.event, required this.calendar, required this.places, required this.others});

  final TimelineEvent event;
  final Calendar calendar;
  final List<Entry> places;
  final List<Placed> others;

  @override
  State<_ChangeDialog> createState() => _ChangeDialogState();
}

class _ChangeDialogState extends State<_ChangeDialog> {
  late JsonMap _draft = {
    'name': widget.event.name,
    'when': mapOrNull(widget.event.raw['when']) ?? const {'precision': 'unknown'},
    'locationId': widget.event.locationId,
    'ongoing': widget.event.ongoing,
    'description': widget.event.description,
  };

  @override
  Widget build(BuildContext context) => _FormDialog(
    title: 'How “${widget.event.name}” goes in this history',
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(onPressed: () => Navigator.of(context).pop(_draft), child: const Text('Save for this history')),
    ],
    children: [
      TextFormField(
        initialValue: str(_draft['name']),
        decoration: const InputDecoration(labelText: 'Event name in this history'),
        onChanged: (v) => _draft = {..._draft, 'name': v},
      ),
      const SizedBox(height: 12),
      DateEditor(
        when: mapOrNull(_draft['when']),
        calendar: widget.calendar,
        others: [
          for (final p in widget.others)
            if (p.event.id != widget.event.id) p,
        ],
        onChange: (edit) => setState(() => _draft = {..._draft, 'when': edit(mapOrNull(_draft['when']) ?? const {})}),
      ),
      const SizedBox(height: 12),
      DropdownButtonFormField<String>(
        initialValue: widget.places.any((p) => p.id == _draft['locationId']) ? _draft['locationId']! as String : '',
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Where it happens in this history'),
        items: [
          const DropdownMenuItem(value: '', child: Text('Not set')),
          for (final p in widget.places)
            DropdownMenuItem(
              value: p.id,
              child: Text(p.name, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (v) => _draft = {..._draft, 'locationId': v == null || v.isEmpty ? null : v},
      ),
      CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        value: _draft['ongoing'] == true,
        onChanged: (v) => setState(() => _draft = {..._draft, 'ongoing': v == true}),
        title: const Text('Still going on when the story ends'),
      ),
      TextFormField(
        initialValue: str(_draft['description']),
        minLines: 3,
        maxLines: null,
        decoration: const InputDecoration(labelText: 'What happens in this history'),
        onChanged: (v) => _draft = {..._draft, 'description': v},
      ),
    ],
  );
}

/// A dialog holding a form: a fixed width, its fields scrolling under the title, its buttons always in view.
class _FormDialog extends StatelessWidget {
  const _FormDialog({required this.title, required this.children, required this.actions});

  final String title;
  final List<Widget> children;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) => Dialog(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 560),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
            const SizedBox(height: 16),
            Flexible(
              child: SingleChildScrollView(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
              ),
            ),
            const SizedBox(height: 16),
            Wrap(alignment: WrapAlignment.end, spacing: 8, runSpacing: 8, children: actions),
          ],
        ),
      ),
    ),
  );
}
