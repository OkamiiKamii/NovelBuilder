import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/confirm_dialog.dart';
import '../../../shared/domain/collation.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/model/validity.dart';
import '../../../shared/domain/progression/track.dart';
import '../../../shared/domain/records/progress.dart';
import '../../../shared/domain/stable_sort.dart';
import '../../../shared/domain/timeline/narrative.dart' show nodeLabel;
import '../../../shared/domain/visualize/summaries.dart' show timelineRows;
import '../../characters/characters_providers.dart';
import '../../characters/widgets/parts.dart';
import '../progression_providers.dart';
import 'progress_chart.dart';

/// The points a change can be at, as menu entries: each chapter and scene in reading order, each event in story order.
/// Values: `n:<id>` and `e:<id>`.
List<DropdownMenuItem<String>> whenItems(StoryModel model, {String prefix = ''}) {
  final documents = stableSorted(
    model.nodes.values.where(
      (n) => model.order.position.containsKey(n.id) && (n.kindKey == 'chapter' || n.kindKey == 'scene'),
    ),
    (a, b) => model.order.position[a.id]!.compareTo(model.order.position[b.id]!),
  );
  return [
    for (final n in documents)
      DropdownMenuItem(
        value: 'n:${n.id}',
        child: Text('$prefix${nodeLabel(model, n.id)}', overflow: TextOverflow.ellipsis),
      ),
    for (final e in timelineRows(model))
      DropdownMenuItem(
        value: 'e:${e.id}',
        child: Text('${prefix}Event: ${e.title}', overflow: TextOverflow.ellipsis),
      ),
  ];
}

/// A menu value as a point in the story: `n:<id>`, `e:<id>`; anything else is null.
JsonMap? anchorOfValue(String value) => value.startsWith('n:')
    ? {'kind': 'node', 'nodeId': value.substring(2)}
    : value.startsWith('e:')
    ? {'kind': 'event', 'eventId': value.substring(2)}
    : null;

/// A change's time as a menu value: '' not known, `start` before the story, `n:`/`e:` a chapter or event.
String _whenValue(ProgressChange c) => switch (c.at) {
  null => 'start',
  final at when isUnknownTime(at) => '',
  NodeAnchor(:final nodeId) => 'n:$nodeId',
  EventAnchor(:final eventId) => 'e:$eventId',
  _ => '',
};

Object? _atOf(String value) => value == 'start' ? null : (anchorOfValue(value) ?? unknownTime);

/// ONE CHARACTER'S PROGRESSION: what they are like at a point (the end of the story, a chapter, an event), the changes
/// in order, and recording a new one. Only what is recorded is shown: a character with nothing recorded has no level,
/// no statistics, no empty rows.
class ProgressTracker extends StatefulWidget {
  const ProgressTracker({super.key, required this.model, required this.entryId, required this.actions});
  final StoryModel model;
  final String entryId;
  final ProgressionActions actions;

  @override
  State<ProgressTracker> createState() => _ProgressTrackerState();
}

class _ProgressTrackerState extends State<ProgressTracker> {
  String _asOf = 'end';
  String? _editing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final model = widget.model;
    final entry = model.entries[widget.entryId];
    if (entry == null) return const SizedBox.shrink();
    final name = entry.name;
    final categories = [...model.progressCategories.values];
    final offered = [
      for (final c in categories)
        if (appliesTo(c, widget.entryId)) c,
    ];
    final log = changeLog(model, widget.entryId);
    final point = _asOf == 'end' ? null : Anchor.fromJson(anchorOfValue(_asOf));
    final state = progressAt(model, widget.entryId, point);
    final pointWords = point == null ? 'the end of the story' : whenWords(point, model);
    String words(ProgressChange c) => log.where((l) => l.change.id == c.id).firstOrNull?.words ?? '';
    final small = theme.textTheme.bodySmall;

    return ProfileBox(
      title: 'Progression',
      caption:
          'How $name changes over the story: only what you record, each change at the chapter, scene or event it happens '
          'at, when that is known.',
      children: [
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: () => showDialog<void>(
              context: context,
              builder: (_) => TrackedCategoriesDialog(actions: widget.actions),
            ),
            icon: const Icon(Icons.tune),
            label: Text(categories.isEmpty ? 'Choose what to track…' : 'What is tracked…'),
          ),
        ),
        if (categories.isEmpty) ...[
          const Text('This novel tracks nothing about how characters change yet.'),
          Text(
            'Choose what to track (levels, ranks, titles, attributes, abilities, equipment, transformations, a class or '
            'job, milestones, restrictions, costs, or your own) and record each change as it happens. Nothing is '
            'assumed: $name shows only what you record.',
            style: small,
          ),
        ] else ...[
          SizedBox(
            width: 320,
            child: DropdownButtonFormField<String>(
              key: ValueKey('asOf:$_asOf'),
              initialValue: _asOf,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Progression as of', isDense: true),
              items: [
                const DropdownMenuItem(value: 'end', child: Text('The end of the story')),
                ...whenItems(model),
              ],
              onChanged: (v) => setState(() => _asOf = v ?? 'end'),
            ),
          ),
          const SizedBox(height: 8),
          if (log.isEmpty)
            Text('Nothing recorded for $name yet.', style: small)
          else if (state.categories.isEmpty)
            Text('Nothing recorded for $name can be placed at or before $pointWords.', style: small)
          else
            Semantics(
              container: true,
              label: '$name as of $pointWords',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final s in state.categories)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(s.category.name, style: theme.textTheme.labelLarge),
                          for (final l in s.lines)
                            Text.rich(
                              TextSpan(
                                children: [
                                  if (s.category.shape == 'named') TextSpan(text: '${l.subject}: '),
                                  TextSpan(
                                    text: l.value,
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                  if (l.step != null) TextSpan(text: ' (${l.step})', style: small),
                                  if (l.uncertain.isNotEmpty)
                                    TextSpan(
                                      text:
                                          ' · or ${l.uncertain.map((u) => '${words(u)} (${whenWords(u.at, model)})').join(', ')}: which comes later cannot be told',
                                      style: small?.copyWith(color: theme.colorScheme.error),
                                    ),
                                ],
                              ),
                            ),
                          if (s.moments.isNotEmpty) Text(s.moments.map((m) => m.subject).join(', ')),
                          if (s.lost.isNotEmpty) Text('Once held: ${s.lost.join(', ')}', style: small),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          if (state.unplaced.isNotEmpty)
            Text(
              'Not placed against $pointWords (recorded in story time against reading order, or with no time known): '
              '${state.unplaced.map((c) => '${words(c)} (${whenWords(c.at, model)})').join('; ')}.',
              style: small,
            ),
          if (state.untracked.isNotEmpty)
            Text(
              'Also tracked in this novel, nothing recorded for $name: ${state.untracked.map((c) => c.name).join(', ')}.',
              style: small,
            ),
          if (chartSeries(model, widget.entryId) case final series when series.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Over the story', style: theme.textTheme.titleSmall),
            ProgressChart(series: series, length: log.length),
          ],
          if (log.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Changes, in order', style: theme.textTheme.titleSmall),
            for (final l in log)
              if (_editing == l.change.id)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: ChangeForm(
                    model: model,
                    entryId: widget.entryId,
                    actions: widget.actions,
                    initial: l.change,
                    onDone: () => setState(() => _editing = null),
                  ),
                )
              else
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: l.words,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        if (l.before != null) TextSpan(text: ' (was ${l.before})'),
                        TextSpan(text: ' · ${l.category?.name ?? 'A category that was removed'}', style: small),
                      ],
                    ),
                  ),
                  subtitle: Text(
                    [
                      l.when,
                      if (l.change.cost.isNotEmpty) 'cost: ${l.change.cost}',
                      if (l.change.note.isNotEmpty) l.change.note,
                    ].join(' · '),
                  ),
                  trailing: Wrap(
                    children: [
                      IconButton(
                        tooltip: 'Edit “${l.words}”',
                        onPressed: () => setState(() => _editing = l.change.id),
                        icon: const Icon(Icons.edit_outlined),
                      ),
                      IconButton(
                        tooltip: 'Delete “${l.words}”',
                        onPressed: () async {
                          final ok = await showConfirmDialog(
                            context,
                            title: 'Delete this change',
                            message:
                                'Delete “${l.words}” (${l.when})? Nothing else about $name changes. This cannot be undone.',
                            confirmLabel: 'Delete the change',
                            destructive: true,
                          );
                          if (!ok) return;
                          final done = widget.actions.track((x) {
                            x.removeChange(l.change.id);
                            return true;
                          });
                          if (done == true) widget.actions.tell('Deleted: ${l.words}.');
                        },
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ],
                  ),
                ),
          ],
          const SizedBox(height: 12),
          if (offered.isNotEmpty) ...[
            Text('Record a change', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            ChangeForm(model: model, entryId: widget.entryId, actions: widget.actions),
          ] else
            Text(
              'None of what this novel tracks applies to $name. Change that under “What is tracked…”.',
              style: small,
            ),
        ],
      ],
    );
  }
}

/// Recording a change, or changing one: the fields its category's shape asks for, and when it happens.
class ChangeForm extends StatefulWidget {
  const ChangeForm({
    super.key,
    required this.model,
    required this.entryId,
    required this.actions,
    this.initial,
    this.onDone,
  });
  final StoryModel model;
  final String entryId;
  final ProgressionActions actions;
  final ProgressChange? initial;
  final VoidCallback? onDone;

  @override
  State<ChangeForm> createState() => _ChangeFormState();
}

class _ChangeFormState extends State<ChangeForm> {
  late String _categoryId = widget.initial?.categoryId ?? '';
  late String _action = widget.initial?.action ?? 'set';
  late final _subject = TextEditingController(text: widget.initial?.subject ?? '');
  late final _value = TextEditingController(text: widget.initial?.value ?? '');
  late String _refId = widget.initial?.refId ?? '';
  late String _abilityId = widget.initial?.abilityId ?? '';
  late String _when = widget.initial == null ? '' : _whenValue(widget.initial!);
  late final _cost = TextEditingController(text: widget.initial?.cost ?? '');
  late final _note = TextEditingController(text: widget.initial?.note ?? '');

  @override
  void dispose() {
    for (final c in [_subject, _value, _cost, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final model = widget.model;
    final entryId = widget.entryId;
    final offered = stableSorted(
      model.progressCategories.values.where((c) => appliesTo(c, entryId) || c.id == widget.initial?.categoryId),
      (a, b) {
        final o = a.order.compareTo(b.order);
        return o != 0 ? o : localeCompare(a.name, b.name);
      },
    );
    final category = offered.where((c) => c.id == _categoryId).firstOrNull ?? offered.firstOrNull;
    if (category == null) return const SizedBox.shrink();
    final shape = category.shape;
    final action = shape == 'held' ? (_action == 'lose' ? 'lose' : 'gain') : (shape == 'moment' ? 'happen' : 'set');
    final subjects = {
      for (final c in model.progress)
        if (c.categoryId == category.id && c.entryId == entryId && c.subject.isNotEmpty) c.subject,
    };
    final others = stableSorted(
      model.entries.values.where((e) => e.id != entryId),
      (a, b) => localeCompare(a.name, b.name),
    );
    Widget box(double w, Widget child) => SizedBox(width: w, child: child);
    final subjectLabel = shape == 'named' ? 'Which' : (shape == 'held' ? 'What' : 'What happened');

    void submit() {
      final input = <String, Object?>{
        'entryId': entryId,
        'categoryId': category.id,
        'action': action,
        'subject': _subject.text,
        'value': _value.text,
        'refId': _refId.isEmpty ? null : _refId,
        'abilityId': _abilityId.isEmpty ? null : _abilityId,
        'at': _atOf(_when),
        'cost': _cost.text,
        'note': _note.text,
      };
      final initial = widget.initial;
      final saved = widget.actions.track((x) => initial == null ? x.record(input) : x.updateChange(initial.id, input));
      if (saved == null) return;
      widget.actions.tell('${initial == null ? 'Recorded' : 'Saved'}: ${changeWords(saved, category, model)}.');
      if (initial == null) {
        setState(() {
          for (final c in [_subject, _value, _cost, _note]) {
            c.clear();
          }
          _refId = '';
          _abilityId = '';
        });
      }
      widget.onDone?.call();
    }

    return Semantics(
      container: true,
      label: widget.initial == null ? 'Record a change' : 'Change the recorded change',
      child: Wrap(
        spacing: 12,
        runSpacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          box(
            220,
            DropdownButtonFormField<String>(
              initialValue: category.id,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'What changes', isDense: true),
              items: [for (final c in offered) DropdownMenuItem(value: c.id, child: Text(c.name))],
              onChanged: widget.initial != null ? null : (v) => setState(() => _categoryId = v ?? ''),
            ),
          ),
          box(
            260,
            DropdownButtonFormField<String>(
              key: ValueKey('when:$_when'),
              initialValue: _when,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'When', isDense: true),
              items: [
                const DropdownMenuItem(value: '', child: Text('When is not known')),
                const DropdownMenuItem(value: 'start', child: Text('Before the story')),
                ...whenItems(model),
              ],
              onChanged: (v) => setState(() => _when = v ?? ''),
            ),
          ),
          if (shape == 'held')
            box(
              160,
              DropdownButtonFormField<String>(
                initialValue: action,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Gained or lost', isDense: true),
                items: [
                  for (final a in ['gain', 'lose']) DropdownMenuItem(value: a, child: Text(actionLabels[a]!)),
                ],
                onChanged: (v) => setState(() => _action = v ?? 'gain'),
              ),
            ),
          if (shape != 'value')
            box(
              260,
              TextField(
                controller: _subject,
                decoration: InputDecoration(
                  labelText: subjectLabel,
                  hintText: switch (shape) {
                    'named' => 'Strength, Standing with the guild…',
                    'held' => 'Fire Lance, the Ember Crown, Wolf form…',
                    _ => 'First kill, Oath sworn…',
                  },
                  isDense: true,
                  suffixIcon: subjects.isEmpty
                      ? null
                      : PopupMenuButton<String>(
                          tooltip: 'Recorded before',
                          icon: const Icon(Icons.arrow_drop_down),
                          itemBuilder: (_) => [for (final s in subjects) PopupMenuItem(value: s, child: Text(s))],
                          onSelected: (s) => setState(() => _subject.text = s),
                        ),
                ),
              ),
            ),
          if (shape == 'value' || shape == 'named')
            box(
              200,
              TextField(
                controller: _value,
                decoration: InputDecoration(
                  labelText: 'Set to',
                  isDense: true,
                  suffixIcon: category.ladder.isEmpty
                      ? null
                      : PopupMenuButton<String>(
                          tooltip: 'Its steps',
                          icon: const Icon(Icons.arrow_drop_down),
                          itemBuilder: (_) => [
                            for (final s in category.ladder) PopupMenuItem(value: s, child: Text(s)),
                          ],
                          onSelected: (s) => setState(() => _value.text = s),
                        ),
                ),
              ),
            ),
          if (shape == 'held' || shape == 'moment')
            box(
              240,
              DropdownButtonFormField<String>(
                key: ValueKey('ref:$_refId'),
                initialValue: others.any((e) => e.id == _refId) ? _refId : '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Its codex entry (optional)', isDense: true),
                items: [
                  const DropdownMenuItem(value: '', child: Text('None')),
                  for (final e in others)
                    DropdownMenuItem(
                      value: e.id,
                      child: Text(e.name, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _refId = v ?? ''),
              ),
            ),
          if ((shape == 'held' || shape == 'moment') && model.abilities.isNotEmpty)
            box(
              240,
              DropdownButtonFormField<String>(
                key: ValueKey('ability:$_abilityId'),
                initialValue: model.abilities.containsKey(_abilityId) ? _abilityId : '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Its ability in a system (optional)', isDense: true),
                items: [
                  const DropdownMenuItem(value: '', child: Text('None')),
                  for (final MapEntry(key: id, value: a) in model.abilities.entries)
                    DropdownMenuItem(
                      value: id,
                      child: Text('${a.system.name}: ${a.item.name}', overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _abilityId = v ?? ''),
              ),
            ),
          box(
            200,
            TextField(
              controller: _cost,
              decoration: const InputDecoration(
                labelText: 'Cost (optional)',
                hintText: 'What it cost, if anything',
                isDense: true,
              ),
            ),
          ),
          box(
            320,
            TextField(
              controller: _note,
              decoration: const InputDecoration(labelText: 'Note (optional)', isDense: true),
            ),
          ),
          FilledButton.tonal(
            onPressed: submit,
            child: Text(widget.initial == null ? 'Record the change' : 'Save the change'),
          ),
          if (widget.onDone != null && widget.initial != null)
            TextButton(onPressed: widget.onDone, child: const Text('Cancel')),
        ],
      ),
    );
  }
}

/// What the novel tracks about how its characters change. Nothing is tracked until the author adds it, from the
/// suggestions or of their own; each category can be limited to some characters; one in use is archived, never
/// removed, so no change recorded in it is lost.
class TrackedCategoriesDialog extends ConsumerStatefulWidget {
  const TrackedCategoriesDialog({super.key, required this.actions});
  final ProgressionActions actions;

  @override
  ConsumerState<TrackedCategoriesDialog> createState() => _TrackedCategoriesDialogState();
}

class _TrackedCategoriesDialogState extends ConsumerState<TrackedCategoriesDialog> {
  final _name = TextEditingController();
  String _shape = 'held';

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final actions = widget.actions;
    final theme = Theme.of(context);
    final model = ref.watch(castProvider)?.model;
    if (model == null) return const SizedBox.shrink();
    final categories = orderedCategories(model);
    final changes = model.progress;
    final characters = stableSorted([
      for (final e in model.entries.values)
        if (e.category == 'character') (id: e.id, name: e.name),
    ], (a, b) => localeCompare(a.name, b.name));
    int used(ProgressCategory c) => changes.where((p) => p.categoryId == c.id).length;
    void act(Object? Function() run, [String? done]) {
      final result = run();
      if (result != null && done != null) actions.tell(done);
    }

    final missing = [
      for (final p in progressPresets)
        if (!categories.any((c) => c.name.toLowerCase() == p.name.toLowerCase())) p,
    ];
    return AlertDialog(
      title: const Text('What is tracked'),
      content: SizedBox(
        width: 640,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'What this novel tracks about how its characters change. Nothing is tracked until you add it, and a '
                'character shows only what you record for them: no levels or statistics unless you record some.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              if (categories.isEmpty) const Text('Nothing is tracked yet.'),
              for (final c in categories)
                Card.outlined(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            SizedBox(
                              width: 200,
                              child: TextFormField(
                                key: ValueKey('name:${c.id}:${c.name}'),
                                initialValue: c.name,
                                decoration: InputDecoration(labelText: 'Name of ${c.name}', isDense: true),
                                onFieldSubmitted: (v) => act(() => actions.track((x) => x.saveCategory(c.id, name: v))),
                              ),
                            ),
                            SizedBox(
                              width: 220,
                              child: DropdownButtonFormField<String>(
                                key: ValueKey('shape:${c.id}:${c.shape}'),
                                initialValue: c.shape,
                                isExpanded: true,
                                decoration: InputDecoration(labelText: 'Shape of ${c.name}', isDense: true),
                                items: [
                                  for (final s in progressShapes)
                                    DropdownMenuItem(value: s, child: Text(shapeLabels[s]!)),
                                ],
                                onChanged: used(c) > 0
                                    ? null
                                    : (v) => act(() => actions.track((x) => x.saveCategory(c.id, shape: v))),
                              ),
                            ),
                            Text(
                              '${used(c)} ${used(c) == 1 ? 'change' : 'changes'}${c.archived ? ' · archived' : ''}',
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                        if (c.shape == 'value')
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: TextFormField(
                              key: ValueKey('ladder:${c.id}:${c.ladder.join('|')}'),
                              initialValue: c.ladder.join(', '),
                              decoration: InputDecoration(
                                labelText: 'Steps of ${c.name}, lowest first',
                                hintText: 'If it is a ladder: Squire, Knight, Captain',
                                isDense: true,
                              ),
                              onFieldSubmitted: (v) =>
                                  act(() => actions.track((x) => x.saveCategory(c.id, ladder: v.split(',')))),
                            ),
                          ),
                        if (characters.isNotEmpty)
                          ExpansionTile(
                            tilePadding: EdgeInsets.zero,
                            title: Text(
                              c.characterIds.isEmpty
                                  ? 'For every character'
                                  : 'For ${[for (final p in characters)
                                      if (c.characterIds.contains(p.id)) p.name].join(', ')}',
                              style: theme.textTheme.bodyMedium,
                            ),
                            children: [
                              Wrap(
                                spacing: 6,
                                children: [
                                  for (final p in characters)
                                    FilterChip(
                                      label: Text(p.name),
                                      selected: c.characterIds.contains(p.id),
                                      onSelected: (on) => act(
                                        () => actions.track(
                                          (x) => x.saveCategory(
                                            c.id,
                                            characterIds: on
                                                ? [...c.characterIds, p.id]
                                                : [
                                                    for (final id in c.characterIds)
                                                      if (id != p.id) id,
                                                  ],
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              Text('None ticked: it applies to every character.', style: theme.textTheme.bodySmall),
                            ],
                          ),
                        Wrap(
                          spacing: 8,
                          children: [
                            TextButton(
                              onPressed: () =>
                                  act(() => actions.track((x) => x.saveCategory(c.id, archived: !c.archived))),
                              child: Text(c.archived ? 'Restore ${c.name}' : 'Archive ${c.name}'),
                            ),
                            if (used(c) == 0)
                              TextButton(
                                onPressed: () => act(
                                  () => actions.track((x) {
                                    x.removeCategory(c.id);
                                    return true;
                                  }),
                                  'Stopped tracking ${c.name}.',
                                ),
                                child: Text('Remove ${c.name}'),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              if (missing.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Start from', style: theme.textTheme.titleSmall),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final p in missing)
                      ActionChip(
                        avatar: const Icon(Icons.add, size: 16),
                        label: Text(p.name),
                        tooltip: shapeHints[p.shape],
                        onPressed: () =>
                            act(() => actions.track((x) => x.addPreset(p.name)), 'Now tracking ${p.name}.'),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              Text('Your own', style: theme.textTheme.titleSmall),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SizedBox(
                    width: 220,
                    child: TextField(
                      controller: _name,
                      decoration: const InputDecoration(
                        labelText: 'New category name',
                        hintText: 'Cultivation realm, Oaths, Scars…',
                        isDense: true,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  SizedBox(
                    width: 220,
                    child: DropdownButtonFormField<String>(
                      initialValue: _shape,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Its shape', isDense: true),
                      items: [for (final s in progressShapes) DropdownMenuItem(value: s, child: Text(shapeLabels[s]!))],
                      onChanged: (v) => setState(() => _shape = v ?? 'held'),
                    ),
                  ),
                  FilledButton.tonal(
                    onPressed: _name.text.trim().isEmpty
                        ? null
                        : () {
                            final name = _name.text.trim();
                            act(
                              () => actions.track((x) => x.saveCategory(null, name: name, shape: _shape)),
                              'Now tracking $name.',
                            );
                            _name.clear();
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
