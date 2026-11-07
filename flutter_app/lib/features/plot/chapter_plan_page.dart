import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/codex/codex_changes.dart' show categoriesOf;
import '../../shared/domain/collation.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/plot/lanes.dart';
import '../../shared/domain/plot/plot_changes.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/structure/pacing.dart' show usedLabels;
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import '../codex/widgets/connections_panel.dart';
import '../consequences/consequences_page.dart' show consequencesPath;
import '../timeline/timeline_providers.dart' show eventPath;
import 'plot_providers.dart';
import 'widgets/label_picker.dart';

const _placeholders = {
  'objective': 'Why this exists: what it must accomplish for the story.',
  'conflict': 'Who wants what, and what stands in the way.',
  'emotionalArc': 'Where the reader starts and ends emotionally.',
  'dialogue': 'Lines or exchanges you want to land.',
  'foreshadowing': 'What to plant now for later.',
  'reveals': 'What the reader learns here.',
  'openQuestions': 'What should be left hanging.',
  'ending': 'The resolution, turn or cliffhanger to end on.',
};
const _dynamics = ['conflict', 'emotionalArc', 'dialogue', 'foreshadowing', 'reveals', 'openQuestions'];

/// The planning template for one chapter or scene. Everything here is stored in the planning layer; there is
/// deliberately no action that puts any of it into the manuscript.
class ChapterPlanPage extends ConsumerWidget {
  const ChapterPlanPage({super.key, required this.nodeId});

  final String nodeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    final node = cast?.model.nodes[nodeId];
    if (cast == null || node == null || (node.kind != NodeKind.chapter && node.kind != NodeKind.scene)) {
      return PageScaffold(
        title: 'Plan',
        child: EmptyState(
          icon: Icons.assignment_outlined,
          title: 'This chapter or scene is not here',
          message: 'It may have been deleted. The scene board shows every chapter and scene.',
          action: FilledButton(
            onPressed: () => PlotActions(context, cast?.novelId ?? '').router.go('/plan/board'),
            child: const Text('Open the scene board'),
          ),
        ),
      );
    }
    return _PlanForm(cast: cast, node: node);
  }
}

class _PlanForm extends StatelessWidget {
  const _PlanForm({required this.cast, required this.node});
  final CastData cast;
  final StoryNode node;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final model = cast.model;
    final actions = PlotActions(context, cast.novelId);
    final id = node.id;
    final plan = model.plans[id];
    final kind = node.kind?.label.toLowerCase() ?? 'chapter';
    final here = 'this $kind';
    final title = node.title.isEmpty ? 'Untitled' : node.title;
    void plan_(JsonMap Function(JsonMap stored) edit) => actions.edit((x) => x.updatePlan(id, edit));
    void later(String key, JsonMap Function(JsonMap stored) edit) =>
        actions.editLater('plan:$id:$key', (x) => x.updatePlan(id, edit));
    Widget gap([double h = 16]) => SizedBox(height: h);
    Widget text(String field, {int lines = 2}) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: SavedTextField(
        key: ValueKey('$field:$id'),
        label: planLabels[field],
        hint: _placeholders[field],
        value: str(plan?.raw[field]),
        multiline: true,
        minLines: lines,
        onChanged: (v) => later(field, (_) => {field: v}),
      ),
    );

    final categories = categoriesOf(cast.snapshot);
    final entries = stableSorted(model.entries.values, (a, b) => localeCompare(a.name, b.name));
    String entryLabel(Entry e) => '${e.name} · ${categories[e.category]?.singular ?? e.category}';
    final inText = stableSorted([
      for (final m in node.mentions) ?model.entries[m],
    ], (a, b) => localeCompare(a.name, b.name));
    final events = [
      for (final e in model.events.values)
        if (e.nodeIds.contains(id)) e,
    ];
    final threads = threadsByNode(model)[id] ?? const <ThreadHere>[];

    return PageScaffold(
      title: 'Plan: $title',
      subtitle: node.kind?.label,
      actions: [
        TextButton.icon(
          onPressed: () => actions.openChapter(id),
          icon: const Icon(Icons.edit_note),
          label: const Text('Write it'),
        ),
        TextButton.icon(
          onPressed: () => actions.router.go(consequencesPath(nodeId: id)),
          icon: const Icon(Icons.account_tree_outlined),
          label: Text('What depends on this ${node.kind?.label.toLowerCase() ?? 'chapter'}?'),
        ),
        TextButton.icon(
          onPressed: () => actions.router.go('/plan/board'),
          icon: const Icon(Icons.view_column_outlined),
          label: const Text('Scene board'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Status', style: theme.textTheme.labelLarge),
          gap(6),
          _StatusStepper(
            status: node.status,
            onChange: (s) => actions.edit((x) => x.updateNode(id, status: s)),
          ),
          gap(),
          text('objective'),
          SavedTextField(
            key: ValueKey('summary:$id'),
            label: 'Summary',
            hint: 'What happens in $here, in a sentence or two.',
            value: node.summary,
            multiline: true,
            minLines: 3,
            onChanged: (v) => actions.editLater('node:$id:summary', (x) => x.updateNode(id, summary: v)),
          ),
          gap(),
          LabelPicker(
            labels: plan?.labels ?? const [],
            used: usedLabels(model),
            of: here,
            onChanged: (labels) => plan_((_) => {'labels': labels}),
          ),
          gap(),
          ProfileBox(
            title: 'Key events & plot beats',
            children: [_BeatsEditor(nodeId: id, plan: plan, actions: actions)],
          ),
          gap(),
          if (entries.isEmpty)
            Text(
              'Create characters, and places and items under World, to attach them here.',
              style: theme.textTheme.bodySmall,
            )
          else
            IdPicker(
              label: 'Entities involved',
              chosen: [
                for (final e in plan?.entityIds ?? const <String>[])
                  if (model.entries.containsKey(e)) e,
              ],
              options: [for (final e in entries) (e.id, entryLabel(e))],
              onChanged: (ids) => plan_((_) => {'entityIds': ids}),
            ),
          if (inText.isNotEmpty) ...[
            gap(12),
            Text('Linked in the text', style: theme.textTheme.labelLarge),
            gap(6),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                for (final e in inText)
                  ActionChip(
                    label: Text(e.name),
                    tooltip: 'Open ${e.name}',
                    onPressed: () => actions.openEntry(e.id, character: e.category == 'character'),
                  ),
              ],
            ),
          ],
          gap(),
          _Appearances(cast: cast, node: node, plan: plan, onChange: plan_),
          gap(),
          ProfileBox(title: 'Narrative dynamics', children: [for (final f in _dynamics) text(f)]),
          gap(),
          text('ending'),
          if (node.kind == NodeKind.chapter) ...[
            ProfileBox(
              title: 'Notes for a web serial',
              caption:
                  'Printed before and after the chapter when the book is read or exported as a web serial. Never part of the story text.',
              children: [
                for (final (field, label, hint) in const [
                  ('noteBefore', 'Note before the chapter', 'A word to readers before the chapter starts.'),
                  ('noteAfter', 'Note after the chapter', 'Thanks, a schedule, what comes next.'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: SavedTextField(
                      key: ValueKey('$field:$id'),
                      label: label,
                      hint: hint,
                      value: str(node.raw[field]),
                      multiline: true,
                      minLines: 2,
                      onChanged: (v) => actions.editLater(
                        'node:$id:$field',
                        (x) => field == 'noteBefore' ? x.updateNode(id, noteBefore: v) : x.updateNode(id, noteAfter: v),
                      ),
                    ),
                  ),
              ],
            ),
            gap(),
          ],
          ProfileBox(
            title: 'Timeline events',
            caption: events.isEmpty ? 'No timeline events are linked to $here yet.' : null,
            children: [
              for (final e in events)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.event_outlined),
                  title: Text(e.name.isEmpty ? 'Untitled event' : e.name),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    actions.flush();
                    actions.router.go(eventPath(e.id));
                  },
                ),
            ],
          ),
          gap(),
          ProfileBox(
            title: 'Plot threads',
            caption: threads.isEmpty ? 'No plot threads develop in $here yet.' : null,
            children: [
              for (final h in threads)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.timeline),
                  title: Text(h.thread.title.isEmpty ? 'Untitled thread' : h.thread.title),
                  subtitle: () {
                    final titles = [
                      for (final b in h.thread.beats)
                        if (b.nodeId == id && b.title.trim().isNotEmpty) b.title,
                    ];
                    return titles.isEmpty ? null : Text(titles.join(', '));
                  }(),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => actions.openThread(h.thread.id),
                ),
            ],
          ),
          gap(),
          ConnectionsPanel(cast: cast, self: EntityRef(EntityType.node, id), actions: actions),
          gap(),
          SavedTextField(
            key: ValueKey('notes:$id'),
            label: 'Private notes',
            hint: 'Scratchpad: loose ideas, reminders, things to fix.',
            value: node.raw['notes'] is String ? node.raw['notes']! as String : '',
            multiline: true,
            minLines: 6,
            onChanged: (v) => actions.editLater('node:$id:notes', (x) => x.updateNode(id, notes: v)),
          ),
          gap(12),
        ],
      ),
    );
  }
}

/// The workflow pipeline as a row of steps: the current one is chosen, earlier ones are ticked off.
class _StatusStepper extends StatelessWidget {
  const _StatusStepper({required this.status, required this.onChange});
  final NodeStatus status;
  final ValueChanged<NodeStatus> onChange;

  @override
  Widget build(BuildContext context) {
    final current = NodeStatus.values.indexOf(status);
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final (i, s) in NodeStatus.values.indexed)
          ChoiceChip(
            label: Text(s.label),
            avatar: i < current ? const Icon(Icons.check, size: 16) : null,
            selected: s == status,
            onSelected: (_) => onChange(s),
          ),
      ],
    );
  }
}

/// An ordered list of plot beats. Each saves shortly after typing stops; a beat emptied by typing is kept until it
/// is removed on purpose, so clearing a line to rewrite it never loses it.
class _BeatsEditor extends StatefulWidget {
  const _BeatsEditor({required this.nodeId, required this.plan, required this.actions});
  final String nodeId;
  final ChapterPlan? plan;
  final PlotActions actions;

  @override
  State<_BeatsEditor> createState() => _BeatsEditorState();
}

class _BeatsEditorState extends State<_BeatsEditor> {
  final _new = TextEditingController();

  @override
  void dispose() {
    _new.dispose();
    super.dispose();
  }

  List<JsonMap> _stored(JsonMap plan) => [for (final b in maps(plan['beats'])) b];

  void _save(List<JsonMap> Function(List<JsonMap> beats) edit) =>
      widget.actions.edit((x) => x.updatePlan(widget.nodeId, (stored) => {'beats': edit(_stored(stored))}));

  void _add() {
    final text = _new.text.trim();
    if (text.isEmpty) return;
    _save(
      (beats) => [
        ...beats,
        {'id': newId(), 'text': text},
      ],
    );
    setState(_new.clear);
  }

  @override
  Widget build(BuildContext context) {
    final beats = widget.plan == null ? const <JsonMap>[] : _stored(widget.plan!.raw);
    final id = widget.nodeId;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, b) in beats.indexed)
          Padding(
            key: ValueKey('beat:${b['id']}'),
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 14, right: 8),
                  child: Text('${i + 1}', style: Theme.of(context).textTheme.labelLarge),
                ),
                Expanded(
                  child: SavedTextField(
                    label: 'Beat ${i + 1}',
                    value: str(b['text']),
                    multiline: true,
                    dense: true,
                    onChanged: (v) {
                      if (v.trim().isEmpty) return;
                      widget.actions.editLater(
                        'plan:$id:beat:${b['id']}',
                        (x) => x.updatePlan(
                          id,
                          (stored) => {
                            'beats': [
                              for (final s in _stored(stored)) s['id'] == b['id'] ? {...s, 'text': v} : s,
                            ],
                          },
                        ),
                      );
                    },
                  ),
                ),
                IconButton(
                  tooltip: 'Move beat ${i + 1} up',
                  onPressed: i == 0 ? null : () => _save((all) => _swap(all, b['id'], -1)),
                  icon: const Icon(Icons.arrow_upward),
                ),
                IconButton(
                  tooltip: 'Move beat ${i + 1} down',
                  onPressed: i == beats.length - 1 ? null : () => _save((all) => _swap(all, b['id'], 1)),
                  icon: const Icon(Icons.arrow_downward),
                ),
                IconButton(
                  tooltip: 'Remove beat ${i + 1}',
                  onPressed: () => _save(
                    (all) => [
                      for (final s in all)
                        if (s['id'] != b['id']) s,
                    ],
                  ),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _new,
                decoration: const InputDecoration(labelText: 'New beat', hintText: 'What happens'),
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _add(),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton.tonal(onPressed: _new.text.trim().isEmpty ? null : _add, child: const Text('Add beat')),
          ],
        ),
      ],
    );
  }

  static List<JsonMap> _swap(List<JsonMap> beats, Object? id, int by) {
    final out = [...beats];
    final at = out.indexWhere((b) => b['id'] == id);
    final to = at + by;
    if (at < 0 || to < 0 || to >= out.length) return out;
    final b = out[at];
    out[at] = out[to];
    out[to] = b;
    return out;
  }
}

/// Who appears in a chapter or scene, and who is only mentioned, as the author records it. Characters linked in the
/// text are offered to record with a tap; nothing is recorded for the author, and no text is searched for names.
class _Appearances extends StatelessWidget {
  const _Appearances({required this.cast, required this.node, required this.plan, required this.onChange});
  final CastData cast;
  final StoryNode node;
  final ChapterPlan? plan;
  final void Function(JsonMap Function(JsonMap stored) edit) onChange;

  @override
  Widget build(BuildContext context) {
    final characters = cast.characters();
    if (characters.isEmpty) return const SizedBox.shrink();
    final byId = {for (final c in characters) c.id: c};
    List<String> known(List<String> ids) => [
      for (final id in ids)
        if (byId.containsKey(id)) id,
    ];
    final appear = known(plan?.appearIds ?? const []);
    final mention = known(plan?.mentionIds ?? const []);
    final pov = known(plan?.povIds ?? const []);
    final recorded = {...appear, ...mention};
    final linked = [
      for (final id in node.mentions)
        if (byId.containsKey(id) && !recorded.contains(id)) id,
    ];
    final here = 'this ${node.kind?.label.toLowerCase() ?? 'chapter'}';
    List<(String, String)> options(String field, List<String> ids) => [
      for (final c in characters)
        (
          c.id,
          field != 'povIds' && recorded.contains(c.id) && !ids.contains(c.id)
              ? '${c.name} (moves from the other list)'
              : c.name,
        ),
    ];
    Widget list(String title, List<String> ids, String field) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: IdPicker(
        label: title,
        chosen: ids,
        options: options(field, ids),
        onChanged: (next) => onChange((_) => {field: next}),
      ),
    );
    final theme = Theme.of(context);
    return ProfileBox(
      title: 'Who appears here',
      caption:
          'Your record of who is on the page in $here, who is only mentioned, and whose point of view it is told '
          'from. The Character appearances view shows these; a character with no record is “not recorded”, not '
          'absent.',
      children: [
        list('Appears', appear, 'appearIds'),
        list('Mentioned, not on the page', mention, 'mentionIds'),
        list('Point of view', pov, 'povIds'),
        if (linked.isNotEmpty) ...[
          Text('Linked in the text, with no record yet', style: theme.textTheme.labelLarge),
          for (final id in linked)
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(byId[id]!.name),
                TextButton(
                  onPressed: () => onChange(
                    (_) => {
                      'appearIds': [...appear, id],
                    },
                  ),
                  child: Text('Appears', semanticsLabel: 'Record ${byId[id]!.name} as appearing in $here'),
                ),
                TextButton(
                  onPressed: () => onChange(
                    (_) => {
                      'mentionIds': [...mention, id],
                    },
                  ),
                  child: Text('Mentioned', semanticsLabel: 'Record ${byId[id]!.name} as mentioned in $here'),
                ),
              ],
            ),
        ],
      ],
    );
  }
}
