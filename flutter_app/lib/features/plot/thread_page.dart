import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/board.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/navigate.dart' show threadStatusName;
import '../../shared/domain/plot/diagnostics.dart';
import '../../shared/domain/plot/lanes.dart';
import '../../shared/domain/plot/plot_changes.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/records/thread.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/timeline/narrative.dart' show nodeLabel;
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import '../codex/widgets/connections_panel.dart';
import '../consequences/consequences_page.dart' show consequencesPath;
import 'plot_providers.dart';

/// Everything about one thread: what it is, who and where it involves, where it is meant to resolve, and its
/// developments chapter by chapter. Nothing here ever changes a status on the author's behalf, or the manuscript.
class ThreadPage extends ConsumerWidget {
  const ThreadPage({super.key, required this.threadId});

  final String threadId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    final thread = cast?.model.threads[threadId];
    if (cast == null || thread == null) {
      return PageScaffold(
        title: 'Plot thread',
        child: EmptyState(
          icon: Icons.timeline,
          title: 'This thread is not here',
          message: 'It may have been deleted. Plot threads lists every thread the novel has.',
          action: FilledButton(
            onPressed: () => PlotActions(context, cast?.novelId ?? '').router.go('/plan/threads'),
            child: const Text('Open Plot threads'),
          ),
        ),
      );
    }
    return _ThreadEditor(cast: cast, thread: thread);
  }
}

class _ThreadEditor extends StatefulWidget {
  const _ThreadEditor({required this.cast, required this.thread});
  final CastData cast;
  final PlotThread thread;

  @override
  State<_ThreadEditor> createState() => _ThreadEditorState();
}

class _ThreadEditorState extends State<_ThreadEditor> {
  final _newTitle = TextEditingController();
  String _newNode = '';
  String _newRole = 'development';

  @override
  void dispose() {
    _newTitle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cast = widget.cast;
    final thread = widget.thread;
    final model = cast.model;
    final actions = PlotActions(context, cast.novelId);
    final id = thread.id;
    final report = diagnose([thread], [...model.nodes.values]).reports.single;
    final others = stableSorted([
      for (final t in model.threads.values)
        if (t.id != id) t,
    ], (a, b) => localeCompare(a.title, b.title));
    final tree = flattenTree(buildTree([...model.nodes.values]));
    final documents = [
      for (final t in tree)
        if (t.node.kind == NodeKind.chapter || t.node.kind == NodeKind.scene) t,
    ];
    void update(JsonMap Function(PlotThread stored) edit) => actions.edit((x) => x.updateThread(id, edit));
    void later(String key, JsonMap Function(PlotThread stored) edit) =>
        actions.editLater('$id:$key', (x) => x.updateThread(id, edit));
    String indent(TreeItem t) => '${'  ' * t.depth}${t.node.title.isEmpty ? 'Untitled' : t.node.title}';
    final status = thread.statusKey;
    Widget gap([double h = 16]) => SizedBox(height: h);
    Widget half(Widget child) => SizedBox(width: 260, child: child);

    void addBeat() {
      if (_newTitle.text.trim().isEmpty && _newRole != 'appears') return;
      final made = actions.edit(
        (x) => x.addBeat(id, title: _newTitle.text, nodeId: _newNode.isEmpty ? null : _newNode, role: _newRole),
      );
      if (made != null) setState(_newTitle.clear);
    }

    return PageScaffold(
      title: thread.title.isEmpty ? 'Untitled thread' : thread.title,
      subtitle: '${threadStatusName(thread) ?? status} · ${categoryName(thread)}',
      actions: [
        TextButton.icon(
          onPressed: () => actions.router.go('/plan/threads'),
          icon: const Icon(Icons.arrow_back),
          label: const Text('Plot threads'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (report.issues.isNotEmpty) ...[
            ProfileBox(title: 'Things to check', children: [for (final i in report.issues) Text('• ${i.message}')]),
            gap(),
          ],
          SavedTextField(
            key: ValueKey('title:$id'),
            label: 'Thread title',
            value: thread.title,
            onChanged: (v) => later('title', (_) => {'title': v}),
          ),
          gap(),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              half(
                DropdownButtonFormField<String>(
                  key: ValueKey('category:${thread.category}'),
                  initialValue: threadCategories.contains(thread.category) ? thread.category : 'subplot',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: [
                    for (final c in threadCategories) DropdownMenuItem(value: c, child: Text(threadCategoryLabels[c]!)),
                  ],
                  onChanged: (v) => update((_) => {'category': v}),
                ),
              ),
              half(
                DropdownButtonFormField<String>(
                  key: ValueKey('status:$status'),
                  initialValue: threadStatuses.contains(status) ? status : 'planned',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: [
                    for (final s in threadStatuses) DropdownMenuItem(value: s, child: Text(threadStatusLabels[s]!)),
                  ],
                  onChanged: (v) => update((_) => {'status': v}),
                ),
              ),
            ],
          ),
          if (status == 'custom') ...[
            gap(12),
            SavedTextField(
              key: ValueKey('customStatus:$id'),
              label: 'Status name',
              hint: 'e.g. Dormant, Waiting on book two',
              value: thread.customStatus ?? '',
              onChanged: (v) => later('customStatus', (_) => {'customStatus': v}),
            ),
          ],
          if (thread.category == 'custom') ...[
            gap(12),
            SavedTextField(
              key: ValueKey('customCategory:$id'),
              label: 'Category name',
              hint: 'e.g. Prophecy, Heist, Rivalry',
              value: str(thread.raw['customCategory']),
              onChanged: (v) => later('customCategory', (_) => {'customCategory': v}),
            ),
          ],
          gap(),
          SavedTextField(
            key: ValueKey('premise:$id'),
            label: 'Objective or premise',
            hint: 'The question this thread raises, or the promise it makes to the reader.',
            value: thread.premise,
            multiline: true,
            onChanged: (v) => later('premise', (_) => {'premise': v}),
          ),
          gap(),
          IdPicker(
            label: 'Characters involved',
            chosen: thread.characterIds,
            options: [for (final c in cast.characters()) (c.id, c.name)],
            nameOf: cast.nameOf,
            onChanged: (ids) => update((_) => {'characterIds': ids}),
          ),
          gap(12),
          IdPicker(
            label: 'Key locations',
            chosen: thread.locationIds,
            options: [
              for (final e in stableSorted(
                model.entries.values.where((e) => e.category == 'location'),
                (a, b) => localeCompare(a.name, b.name),
              ))
                (e.id, e.name),
            ],
            nameOf: cast.nameOf,
            onChanged: (ids) => update((_) => {'locationIds': ids}),
          ),
          gap(),
          ProfileBox(
            title: 'Target resolution',
            children: [
              DropdownButtonFormField<String>(
                key: ValueKey('target:${thread.targetNodeId}'),
                initialValue: model.nodes.containsKey(thread.targetNodeId) ? thread.targetNodeId : '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Meant to resolve in'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Not decided')),
                  for (final t in tree)
                    DropdownMenuItem(
                      value: t.node.id,
                      child: Text(indent(t), overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => update((_) => {'targetNodeId': v == null || v.isEmpty ? null : v}),
              ),
              gap(12),
              SavedTextField(
                key: ValueKey('targetNote:$id'),
                label: 'Or in your own words',
                hint: 'The midpoint · the end of book two · the final battle',
                value: str(thread.raw['targetNote']),
                onChanged: (v) => later('targetNote', (_) => {'targetNote': v}),
              ),
            ],
          ),
          gap(),
          ProfileBox(
            title: 'Developments, in reading order',
            caption: report.beats.isEmpty
                ? 'Record each step this thread takes and the chapter it happens in: a setup, a clue, a reversal, the payoff.'
                : null,
            children: [
              for (final (i, placed) in report.beats.indexed)
                _BeatEditor(
                  key: ValueKey('beat:${placed.beat.id}'),
                  placed: placed,
                  number: i + 1,
                  threadId: id,
                  documents: documents,
                  others: others,
                  model: cast,
                  actions: actions,
                ),
              const Divider(),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SizedBox(
                    width: 260,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('newNode:$_newNode'),
                      initialValue: documents.any((t) => t.node.id == _newNode) ? _newNode : '',
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Chapter or scene'),
                      items: [
                        DropdownMenuItem(
                          value: '',
                          child: Text(documents.isEmpty ? 'No chapters yet' : 'Not placed yet'),
                        ),
                        for (final t in documents)
                          DropdownMenuItem(
                            value: t.node.id,
                            child: Text(indent(t), overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) => setState(() => _newNode = v ?? ''),
                    ),
                  ),
                  SizedBox(
                    width: 230,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('newRole:$_newRole'),
                      initialValue: _newRole,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Role'),
                      items: [for (final r in beatRoles) DropdownMenuItem(value: r, child: Text(beatRoleLabels[r]!))],
                      onChanged: (v) => setState(() => _newRole = v ?? 'development'),
                    ),
                  ),
                  SizedBox(
                    width: 300,
                    child: TextField(
                      controller: _newTitle,
                      decoration: InputDecoration(
                        labelText: 'New development',
                        hintText: _newRole == 'appears'
                            ? 'Optional: what it is doing here'
                            : 'What happens? e.g. Symbol discovered',
                      ),
                      onChanged: (_) => setState(() {}),
                      onSubmitted: (_) => addBeat(),
                    ),
                  ),
                  FilledButton.tonal(
                    onPressed: _newTitle.text.trim().isEmpty && _newRole != 'appears' ? null : addBeat,
                    child: const Text('Add development'),
                  ),
                ],
              ),
              gap(8),
              Wrap(
                spacing: 8,
                children: [
                  TextButton(
                    onPressed: () => actions.router.go('/visualize/plot'),
                    child: const Text('See it in the plot lanes'),
                  ),
                  TextButton(
                    onPressed: () => actions.router.go('/plan/board?thread=$id'),
                    child: const Text('Its chapters and scenes on the scene board'),
                  ),
                ],
              ),
            ],
          ),
          gap(),
          ConnectionsPanel(cast: cast, self: EntityRef(EntityType.thread, id), actions: actions),
          gap(),
          SavedTextField(
            key: ValueKey('notes:$id'),
            label: 'Notes',
            hint: 'Loose ends, alternatives, how it should pay off.',
            value: str(thread.raw['notes']),
            multiline: true,
            minLines: 4,
            onChanged: (v) => later('notes', (_) => {'notes': v}),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: thread.raw['muted'] == true,
            onChanged: (v) => update((_) => {'muted': v == true}),
            title: Text('Don’t flag this thread${report.silenced > 0 ? ' (${report.silenced} held back)' : ''}'),
          ),
          gap(),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                onPressed: () => _delete(context, actions, thread, report.beats.length),
                icon: const Icon(Icons.delete_outline),
                label: const Text('Delete thread…'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _delete(BuildContext context, PlotActions actions, PlotThread thread, int beats) async {
    final title = thread.title.isEmpty ? 'Untitled thread' : thread.title;
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete $title?'),
        content: Text(
          'It and its $beats ${beats == 1 ? 'development' : 'developments'} go. Chapters, scenes and entries are not changed; events stop belonging to it. You can undo this.',
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
    final kept = actions.plot.deleteThread(actions.novelId, thread.id, title: title);
    actions.router.go('/plan/threads');
    actions.tell('Deleted $title.', actionLabel: 'Undo', onAction: () => actions.plot.undo(kept));
  }
}

class _BeatEditor extends StatelessWidget {
  const _BeatEditor({
    super.key,
    required this.placed,
    required this.number,
    required this.threadId,
    required this.documents,
    required this.others,
    required this.model,
    required this.actions,
  });

  final PlacedBeat placed;
  final int number;
  final String threadId;
  final List<TreeItem> documents;
  final List<PlotThread> others;
  final CastData model;
  final PlotActions actions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final beat = placed.beat;
    final name = 'development $number';
    final role = roleKey(beat);
    void change(JsonMap c) => actions.edit((x) => x.updateBeat(threadId, beat.id, c));
    void later(String key, JsonMap c) =>
        actions.editLater('$threadId:${beat.id}:$key', (x) => x.updateBeat(threadId, beat.id, c));
    final crossing = [for (final id in beat.withThreadIds) ?model.model.threads[id]];
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(beatPlace(placed), style: theme.textTheme.labelLarge),
              SizedBox(
                width: 240,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('node:${beat.id}:${beat.nodeId}'),
                  initialValue: placed.missing ? '\u0000gone' : (beat.nodeId ?? ''),
                  isExpanded: true,
                  decoration: InputDecoration(labelText: 'Chapter for $name'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('Not placed yet')),
                    if (placed.missing)
                      const DropdownMenuItem(value: '\u0000gone', child: Text('A chapter that was removed')),
                    for (final t in documents)
                      DropdownMenuItem(
                        value: t.node.id,
                        child: Text(
                          '${'  ' * t.depth}${t.node.title.isEmpty ? 'Untitled' : t.node.title}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: (v) {
                    if (v != '\u0000gone') change({'nodeId': v == null || v.isEmpty ? null : v});
                  },
                ),
              ),
              SizedBox(
                width: 230,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('role:${beat.id}:$role'),
                  initialValue: beatRoles.contains(role) ? role : 'development',
                  isExpanded: true,
                  decoration: InputDecoration(labelText: 'Role of $name'),
                  items: [for (final r in beatRoles) DropdownMenuItem(value: r, child: Text(beatRoleLabels[r]!))],
                  onChanged: (v) => change({'role': v}),
                ),
              ),
              IconButton(
                tooltip: 'What depends on $name?',
                onPressed: () => actions.router.go(consequencesPath(threadId: threadId, beatId: beat.id)),
                icon: const Icon(Icons.account_tree_outlined),
              ),
              IconButton(
                tooltip: 'Remove $name',
                onPressed: () => actions.edit((x) => x.removeBeat(threadId, beat.id)),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (role == 'intersection')
            IdPicker(
              label: 'Crosses',
              chosen: [for (final t in crossing) t.id],
              options: [for (final t in others) (t.id, t.title)],
              onChanged: (ids) => change({'withThreadIds': ids}),
            ),
          if (role == 'intersection') const SizedBox(height: 12),
          SavedTextField(
            key: ValueKey('beatTitle:${beat.id}'),
            label: 'Title of $name',
            value: beat.title,
            dense: true,
            onChanged: (v) => later('title', {'title': v}),
          ),
          const SizedBox(height: 6),
          SavedTextField(
            key: ValueKey('beatNote:${beat.id}'),
            label: 'Note for $name',
            hint: 'What changes for this thread here?',
            value: beat.note,
            dense: true,
            multiline: true,
            onChanged: (v) => later('note', {'note': v}),
          ),
          if (placed.node != null)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: () => actions.openChapter(placed.node!.id),
                child: Text('Open ${nodeLabel(model.model, placed.node!.id)}'),
              ),
            ),
        ],
      ),
    );
  }
}
