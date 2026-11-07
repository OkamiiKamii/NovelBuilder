import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/manuscript/board.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/plot/lanes.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/characters_providers.dart';
import '../workspace/area_switch.dart';
import '../write/write_providers.dart';
import 'plot_providers.dart';

/// A beat's role on a card's chip, in a word.
const _roleWords = {
  'introduction': 'introduced',
  'development': 'develops',
  'intersection': 'crosses',
  'resolution': 'resolved',
  'appears': 'appears',
};

/// How many changes the board can take back, newest first.
const _undoLimit = 20;

/// A volume, act or arc in words, with what it sits in: "Volume One › Act II".
String _pathLabel(List<StoryNode> path) => path.map((n) => n.title).join(' › ');

String _title(StoryNode n) => n.title.isEmpty ? 'Untitled' : n.title;

/// What is being dragged, and what kind of card it is.
typedef _Drag = ({String id, NodeKind kind});

/// THE SCENE BOARD
/// The chapters and scenes as cards: a column (or a lane) for each chapter, a card for each scene, grouped by the
/// volumes, acts and arcs they sit in. Cards are the manuscript's own chapters and scenes, so the editor, the outline
/// and the board always show the same book. Moving a card moves it in the manuscript; each change can be undone while
/// things are as the board left them. Moving is by drag and drop, or by the buttons on each card.
class BoardPage extends ConsumerStatefulWidget {
  const BoardPage({super.key, this.threadId});

  /// Shows only where this plot thread is recorded.
  final String? threadId;

  @override
  ConsumerState<BoardPage> createState() => _BoardPageState();
}

class _BoardPageState extends ConsumerState<BoardPage> {
  final _search = TextEditingController();
  NodeStatus? _status;
  String? _threadId;
  bool? _lanes;
  final _history = <BoardChange>[];
  String _said = '';
  _Drag? _drag;

  @override
  void initState() {
    super.initState();
    _threadId = widget.threadId;
  }

  @override
  void didUpdateWidget(BoardPage old) {
    super.didUpdateWidget(old);
    if (old.threadId != widget.threadId) _threadId = widget.threadId;
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    if (cast == null) return const PageScaffold(title: 'Scene board', child: SizedBox.shrink());
    final model = cast.model;
    final all = [...model.nodes.values];
    final parts = boardOf(all);
    final thread = _threadId == null ? null : model.threads[_threadId];
    final threadNodes = thread == null ? null : {for (final p in placesOf(thread, model)) p.nodeId};
    final filter = BoardFilter(status: _status, text: _search.text, nodeIds: threadNodes);
    final shown = filterBoard(parts, filter);
    final view = _BoardView(
      state: this,
      cast: cast,
      all: all,
      parts: parts,
      filtered: filter.filtered,
      lanes: _lanes ?? MediaQuery.sizeOf(context).width < 700,
      threadsHere: threadsByNode(model),
    );
    final chapters = all.where((n) => n.kind == NodeKind.chapter).length;
    final scenes = all.where((n) => n.kind == NodeKind.scene).length;
    final groups = all.where((n) => n.kind?.isGroup == true).length;
    final words = buildTree(all).fold(0, (n, t) => n + t.totalWords);
    final threads = stableSorted(model.threads.values, (a, b) => localeCompare(a.title, b.title));
    final last = _history.lastOrNull;
    final theme = Theme.of(context);

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyZ, control: true): _undo,
        const SingleActivator(LogicalKeyboardKey.keyZ, meta: true): _undo,
      },
      child: Focus(
        autofocus: true,
        child: PageScaffold(
          title: 'Scene board',
          subtitle: '${plural(chapters, 'chapter')} · ${plural(scenes, 'scene')} · ${plural(words, 'word')}',
          maxWidth: double.infinity,
          actions: [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Columns'), icon: Icon(Icons.view_column_outlined)),
                ButtonSegment(value: true, label: Text('Lanes'), icon: Icon(Icons.view_stream_outlined)),
              ],
              selected: {view.lanes},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() => _lanes = s.single),
            ),
            FilledButton.icon(
              onPressed: () => _add(NodeKind.chapter, null),
              icon: const Icon(Icons.add),
              label: const Text('Chapter'),
            ),
          ],
          scrollable: false,
          // What was just done, with its Undo, stays in view above the board however far it is scrolled.
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_said.isNotEmpty || last != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Semantics(
                    liveRegion: true,
                    child: Wrap(
                      spacing: 12,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (_said.isNotEmpty) Text(_said, style: theme.textTheme.bodySmall),
                        if (last != null)
                          OutlinedButton.icon(
                            onPressed: _undo,
                            icon: const Icon(Icons.undo),
                            label: Text('Undo ${last is MoveChange ? 'move' : 'status'} of “${last.title}”'),
                          ),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: _LazyList(
                  top: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const AreaSwitch(parts: planParts, current: '/plan/board'),
                      if (thread != null && threadNodes != null) ...[
                        const SizedBox(height: 12),
                        Card.outlined(
                          margin: EdgeInsets.zero,
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Wrap(
                              spacing: 8,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Text(
                                  'Showing where “${thread.title}” is recorded: '
                                  '${plural(threadNodes.length, 'chapter or scene', 'chapters and scenes')}, from its '
                                  'developments and the events that belong to it.',
                                ),
                                TextButton(
                                  onPressed: () => view.actions.router.go('/visualize/plot'),
                                  child: const Text('See it in the plot lanes'),
                                ),
                                TextButton(
                                  onPressed: () => view.actions.openThread(thread.id),
                                  child: const Text('Edit the thread'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                      if (all.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 12,
                          runSpacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            SizedBox(
                              width: 260,
                              child: TextField(
                                controller: _search,
                                decoration: const InputDecoration(
                                  labelText: 'Search cards',
                                  hintText: 'Titles and summaries',
                                  prefixIcon: Icon(Icons.search),
                                  isDense: true,
                                ),
                                onChanged: (_) => setState(() {}),
                              ),
                            ),
                            SizedBox(
                              width: 180,
                              child: DropdownButtonFormField<NodeStatus?>(
                                key: ValueKey('status:$_status'),
                                initialValue: _status,
                                isExpanded: true,
                                decoration: const InputDecoration(labelText: 'Show status', isDense: true),
                                items: [
                                  const DropdownMenuItem(value: null, child: Text('Every status')),
                                  for (final s in NodeStatus.values) DropdownMenuItem(value: s, child: Text(s.label)),
                                ],
                                onChanged: (v) => setState(() => _status = v),
                              ),
                            ),
                            if (threads.isNotEmpty)
                              SizedBox(
                                width: 240,
                                child: DropdownButtonFormField<String>(
                                  key: ValueKey('thread:${thread?.id}'),
                                  initialValue: thread?.id ?? '',
                                  isExpanded: true,
                                  decoration: const InputDecoration(labelText: 'Show thread', isDense: true),
                                  items: [
                                    const DropdownMenuItem(value: '', child: Text('Every plot thread')),
                                    for (final t in threads)
                                      DropdownMenuItem(
                                        value: t.id,
                                        child: Text(t.title, overflow: TextOverflow.ellipsis),
                                      ),
                                  ],
                                  onChanged: (v) => setState(() => _threadId = v == null || v.isEmpty ? null : v),
                                ),
                              ),
                            if (filter.filtered) ...[
                              Text(
                                'Moving is off while the board is filtered, so nothing lands where you cannot see it.',
                                style: theme.textTheme.bodySmall,
                              ),
                              TextButton(onPressed: _clearFilters, child: const Text('Clear filter')),
                            ],
                          ],
                        ),
                      ],
                      const SizedBox(height: 16),
                    ],
                  ),
                  items: [
                    if (chapters == 0 && groups == 0)
                      (_) => EmptyState(
                        icon: Icons.view_column_outlined,
                        title: 'No chapters yet',
                        message: 'Each chapter becomes a column here, and each scene a card in it.',
                        action: FilledButton(
                          onPressed: () => _add(NodeKind.chapter, null),
                          child: const Text('Add the first chapter'),
                        ),
                      )
                    else if (shown.isEmpty)
                      (_) => EmptyState(
                        icon: Icons.filter_alt_off_outlined,
                        title: 'Nothing matches',
                        message: 'Nothing on the board matches this filter.',
                        action: OutlinedButton(onPressed: _clearFilters, child: const Text('Clear filter')),
                      )
                    else
                      for (final part in shown) ...view.partItems(part, showTitle: groups > 0),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  PlotActions get _actions => PlotActions(context, ref.read(castProvider)!.novelId);
  List<StoryNode> get _nodes => [...ref.read(castProvider)!.model.nodes.values];

  void _clearFilters() => setState(() {
    _search.clear();
    _status = null;
    _threadId = null;
  });

  /// Runs a change to the manuscript, saying why when it cannot be made. Nothing is changed when it fails.
  bool _run(void Function() change) {
    try {
      change();
      return true;
    } on OutlineException catch (e) {
      _actions.tell(e.message);
    } on StaleWriteException catch (e) {
      _actions.tell('$e');
    } on Object catch (e) {
      _actions.tell('That could not be done, and nothing was changed: $e');
    }
    return false;
  }

  void _remember(BoardChange change) => setState(() {
    _history.add(change);
    if (_history.length > _undoLimit) _history.removeAt(0);
    _said = boardChangeWords(change, _nodes);
  });

  void _add(NodeKind kind, String? parentId) {
    final actions = _actions;
    _run(() => ref.read(manuscriptServiceProvider).create(actions.novelId, kind, parentId: parentId));
  }

  /// Moves a card, asking first when it would carry a chapter's scenes into another volume, act or arc.
  Future<void> moveTo(StoryNode node, Place to) async {
    final all = _nodes;
    final drop = dropOf(all, node.id, to);
    if (drop == null) return;
    final bulk = bulkOf(all, node.id, drop);
    if (bulk != null) {
      final where = drop.parentId == null
          ? 'to the top level'
          : 'into “${all.where((n) => n.id == drop.parentId).firstOrNull?.title ?? ''}”';
      final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Move a chapter with its scenes'),
          content: Text(
            'Move “${_title(node)}” and its ${plural(bulk.scenes, 'scene')} (${plural(bulk.words, 'word')}) $where? '
            'Everything inside it goes with it, and you can undo this.',
          ),
          actions: [
            TextButton(autofocus: true, onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Move them')),
          ],
        ),
      );
      if (yes != true || !mounted) return;
    }
    final from = placeOf(_nodes, node.id);
    if (from == null) return;
    final novelId = _actions.novelId;
    if (_run(
      () => ref.read(manuscriptServiceProvider).move(novelId, node.id, drop.parentId, beforeId: drop.beforeId),
    )) {
      _remember(MoveChange(node.id, node.title, from, drop));
    }
  }

  /// One place earlier or later among the same siblings.
  void nudge(StoryNode node, int by) {
    final siblings = siblingsOf(_nodes, node.parentId);
    final at = siblings.indexWhere((n) => n.id == node.id);
    if (by < 0 && at <= 0) return;
    if (by > 0 && at == siblings.length - 1) return;
    final before = by < 0 ? siblings[at - 1] : (at + 2 < siblings.length ? siblings[at + 2] : null);
    moveTo(node, (parentId: node.parentId, beforeId: before?.id));
  }

  void setStatus(StoryNode node, NodeStatus status) {
    if (status == node.status) return;
    final novelId = _actions.novelId;
    if (_run(() => ref.read(manuscriptServiceProvider).setStatus(novelId, node.id, status))) {
      _remember(StatusChange(node.id, node.title, node.status, status));
    }
  }

  void _undo() {
    final change = _history.lastOrNull;
    if (change == null) return;
    setState(() => _history.removeLast());
    final all = _nodes;
    final problem = undoProblem(all, change);
    if (problem != null) {
      _actions.tell('That cannot be undone: $problem');
      return;
    }
    final service = ref.read(manuscriptServiceProvider);
    final novelId = _actions.novelId;
    final words = boardChangeWords(change, all);
    if (_run(() {
      switch (change) {
        case MoveChange(:final from):
          service.move(novelId, change.nodeId, from.parentId, beforeId: from.beforeId);
        case StatusChange(:final from):
          service.setStatus(novelId, change.nodeId, from);
      }
    })) {
      setState(() => _said = 'Undone: $words');
    }
  }

  void startDrag(_Drag? drag) => setState(() => _drag = drag);
}

/// Draws the board's parts, columns and cards for one build.
class _BoardView {
  _BoardView({
    required this.state,
    required this.cast,
    required this.all,
    required this.parts,
    required this.filtered,
    required this.lanes,
    required this.threadsHere,
  }) : actions = PlotActions(state.context, cast.novelId),
       groups = [...all.where((n) => n.kind?.isGroup == true)],
       orderedChapters = [
         for (final p in parts)
           for (final c in p.columns) c.chapter,
       ];

  final _BoardPageState state;
  final CastData cast;
  final List<StoryNode> all;
  final List<BoardPart> parts;
  final bool filtered;
  final bool lanes;
  final Map<String, List<ThreadHere>> threadsHere;
  final PlotActions actions;
  final List<StoryNode> groups;
  final List<StoryNode> orderedChapters;

  /// Moving cards on a partial board would put them where the author cannot see, so moving waits until the filter is
  /// cleared.
  bool get movable => !filtered;
  _Drag? get drag => state._drag;

  /// Touch screens drag after a long press, so a swipe still scrolls the board.
  bool get touch => switch (defaultTargetPlatform) {
    TargetPlatform.android || TargetPlatform.iOS => true,
    _ => false,
  };

  /// A part of the board as list items, built only when scrolled to: its title, then each lane, or its row of columns.
  List<WidgetBuilder> partItems(BoardPart part, {required bool showTitle}) {
    final label = part.path.isEmpty ? 'Not in a volume, act or arc' : _pathLabel(part.path);
    Widget? end() => drag?.kind == NodeKind.chapter
        ? _DropZone(
            label: 'Drop here to move it to the end of ${part.path.isEmpty ? 'this run of chapters' : '“$label”'}',
            accepts: (d) =>
                d.kind == NodeKind.chapter &&
                dropOf(all, d.id, (
                      parentId: part.parentId,
                      beforeId: part.columns.isEmpty ? null : part.endBeforeId,
                    )) !=
                    null,
            onDrop: (d) =>
                _dropped(d, (parentId: part.parentId, beforeId: part.columns.isEmpty ? null : part.endBeforeId)),
          )
        : null;
    Widget head(BuildContext context) {
      final theme = Theme.of(context);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (showTitle)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Semantics(
                header: true,
                child: Text.rich(
                  TextSpan(
                    children: [
                      if (part.path.isNotEmpty)
                        TextSpan(
                          text: '${(part.path.last.kind?.label ?? '').toUpperCase()}  ',
                          style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.primary),
                        ),
                      TextSpan(text: label),
                    ],
                  ),
                  style: theme.textTheme.titleMedium,
                ),
              ),
            ),
          if (part.columns.isEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: Text(
                filtered ? 'Nothing here matches.' : 'No chapters here yet.',
                style: theme.textTheme.bodySmall,
              ),
            ),
        ],
      );
    }

    if (lanes) {
      return [
        head,
        for (final c in part.columns)
          (context) => Padding(padding: const EdgeInsets.only(bottom: 12), child: column(context, c)),
        (context) => Padding(padding: const EdgeInsets.only(bottom: 24), child: end() ?? const SizedBox.shrink()),
      ];
    }
    return [
      head,
      if (part.columns.isNotEmpty || drag?.kind == NodeKind.chapter)
        (context) {
          final zone = end();
          return Padding(
            padding: const EdgeInsets.only(bottom: 24),
            child: _ColumnsRow(
              key: ValueKey('columns:${part.parentId}'),
              count: part.columns.length,
              column: (context, i) => column(context, part.columns[i]),
              trailing: zone == null ? null : SizedBox(width: 200, child: zone),
            ),
          );
        },
    ];
  }

  Widget column(BuildContext context, BoardColumn column) {
    final theme = Theme.of(context);
    final chapter = column.chapter;
    final siblings = siblingsOf(all, chapter.parentId);
    final at = siblings.indexWhere((n) => n.id == chapter.id);
    final homes = [
      null,
      ...groups,
    ].where((g) => (g?.id) != chapter.parentId && moveError(all, chapter.id, g?.id) == null).toList();
    final sceneCount = all.where((n) => n.parentId == chapter.id && n.kind == NodeKind.scene).length;
    final name = _title(chapter);
    final head = _CardBody(
      node: chapter,
      heading: true,
      meta: '${plural(column.words, 'word')} · ${plural(sceneCount, 'scene')}',
      view: this,
      moves: movable
          ? [
              IconButton(
                tooltip: 'Move $name earlier',
                onPressed: at <= 0 ? null : () => state.nudge(chapter, -1),
                icon: Icon(lanes ? Icons.arrow_upward : Icons.arrow_back),
              ),
              IconButton(
                tooltip: 'Move $name later',
                onPressed: at == siblings.length - 1 ? null : () => state.nudge(chapter, 1),
                icon: Icon(lanes ? Icons.arrow_downward : Icons.arrow_forward),
              ),
              if (groups.isNotEmpty && homes.isNotEmpty)
                PopupMenuButton<String>(
                  tooltip: 'Move $name into',
                  icon: const Icon(Icons.drive_file_move_outline),
                  itemBuilder: (_) => [
                    for (final g in homes)
                      PopupMenuItem(
                        value: g?.id ?? '\u0000top',
                        child: Text(
                          g == null ? 'The top level' : '${g.kind?.label ?? 'Group'}: ${_pathLabel(pathTo(all, g.id))}',
                        ),
                      ),
                  ],
                  onSelected: (v) => state.moveTo(chapter, (parentId: v == '\u0000top' ? null : v, beforeId: null)),
                ),
            ]
          : const [],
    );
    final scenes = [for (final s in column.scenes) sceneCard(context, column, s)];
    final body = Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            _dropTarget(
              kind: NodeKind.chapter,
              place: (parentId: chapter.parentId, beforeId: chapter.id),
              child: _draggable(chapter, head),
            ),
            const SizedBox(height: 8),
            if (scenes.isEmpty)
              Padding(
                padding: const EdgeInsets.all(8),
                child: Text(filtered ? 'No matching scenes.' : 'No scenes yet.', style: theme.textTheme.bodySmall),
              )
            else if (lanes)
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final s in scenes)
                      Padding(
                        padding: const EdgeInsetsDirectional.only(end: 8),
                        child: SizedBox(width: 240, child: s),
                      ),
                  ],
                ),
              )
            else
              for (final s in scenes) Padding(padding: const EdgeInsets.only(bottom: 8), child: s),
            if (drag?.kind == NodeKind.scene)
              _DropZone(
                label: 'Drop here to move it to the end of “$name”',
                accepts: (d) =>
                    d.kind == NodeKind.scene && dropOf(all, d.id, (parentId: chapter.id, beforeId: null)) != null,
                onDrop: (d) => _dropped(d, (parentId: chapter.id, beforeId: null)),
              ),
            if (!filtered)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () => state._add(NodeKind.scene, chapter.id),
                  icon: const Icon(Icons.add),
                  label: Text('Scene', semanticsLabel: 'Add a scene to $name'),
                ),
              ),
          ],
        ),
      ),
    );
    return Semantics(container: true, label: 'Chapter: $name', child: body);
  }

  Widget sceneCard(BuildContext context, BoardColumn column, BoardCard card) {
    final node = card.node;
    final siblings = siblingsOf(all, node.parentId);
    final at = siblings.indexWhere((n) => n.id == node.id);
    final name = _title(node);
    final others = [
      for (final c in orderedChapters)
        if (c.id != node.parentId) c,
    ];
    final body = Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: _CardBody(
          node: node,
          heading: false,
          meta: plural(card.words, 'word'),
          view: this,
          moves: movable
              ? [
                  IconButton(
                    tooltip: 'Move $name earlier',
                    onPressed: at <= 0 ? null : () => state.nudge(node, -1),
                    icon: Icon(lanes ? Icons.arrow_back : Icons.arrow_upward),
                  ),
                  IconButton(
                    tooltip: 'Move $name later',
                    onPressed: at == siblings.length - 1 ? null : () => state.nudge(node, 1),
                    icon: Icon(lanes ? Icons.arrow_forward : Icons.arrow_downward),
                  ),
                  if (others.isNotEmpty)
                    PopupMenuButton<String>(
                      tooltip: 'Move $name to chapter',
                      icon: const Icon(Icons.drive_file_move_outline),
                      itemBuilder: (_) => [for (final c in others) PopupMenuItem(value: c.id, child: Text(_title(c)))],
                      onSelected: (id) => state.moveTo(node, (parentId: id, beforeId: null)),
                    ),
                ]
              : const [],
        ),
      ),
    );
    return Semantics(
      container: true,
      label: 'Scene: $name',
      child: _dropTarget(
        kind: NodeKind.scene,
        place: (parentId: column.chapter.id, beforeId: node.id),
        child: _draggable(node, body),
      ),
    );
  }

  /// The plot threads recorded at a chapter or scene, as chips that open the thread, and a menu to add it to another.
  /// Adding records only that the thread appears here: no development is made up. A chip can be taken off only when
  /// that is all it records.
  Widget? threadChips(BuildContext context, StoryNode node) {
    final here = threadsHere[node.id] ?? const <ThreadHere>[];
    final addable = stableSorted(
      cast.model.threads.values.where((t) => !here.any((h) => h.thread.id == t.id)),
      (a, b) => localeCompare(a.title, b.title),
    );
    if (here.isEmpty && addable.isEmpty) return null;
    final name = _title(node);
    return Wrap(
      spacing: 4,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final h in here)
          InputChip(
            visualDensity: VisualDensity.compact,
            label: Text(
              '${h.thread.title} · ${[for (final r in h.roles) _roleWords[r] ?? r, if (h.events > 0) plural(h.events, 'event')].join(', ')}',
              overflow: TextOverflow.ellipsis,
            ),
            tooltip: 'Open ${h.thread.title}',
            onPressed: () => actions.openThread(h.thread.id),
            onDeleted: h.plainIds.isNotEmpty && h.roles.length == 1 && h.events == 0
                ? () => actions.edit((x) {
                    for (final id in h.plainIds) {
                      x.removeBeat(h.thread.id, id);
                    }
                  })
                : null,
            deleteButtonTooltipMessage: 'Take $name out of ${h.thread.title}',
          ),
        if (addable.isNotEmpty)
          PopupMenuButton<String>(
            tooltip: 'Add $name to a plot thread',
            useRootNavigator: true,
            itemBuilder: (_) => [for (final t in addable) PopupMenuItem(value: t.id, child: Text(t.title))],
            onSelected: (id) => actions.edit((x) => x.addBeat(id, nodeId: node.id, role: 'appears')),
            // At least 48 pixels tall, so it is easy to tap.
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add, size: 16),
                    SizedBox(width: 4),
                    Flexible(child: Text('Add to a thread', overflow: TextOverflow.ellipsis)),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  void _dropped(_Drag d, Place to) {
    final node = all.where((n) => n.id == d.id).firstOrNull;
    state.startDrag(null);
    if (node != null) state.moveTo(node, to);
  }

  Widget _draggable(StoryNode node, Widget child) {
    if (!movable) return child;
    final data = (id: node.id, kind: node.kind ?? NodeKind.scene);
    final feedback = Material(
      elevation: 6,
      borderRadius: BorderRadius.circular(8),
      child: Padding(padding: const EdgeInsets.all(12), child: Text(_title(node))),
    );
    void started() => state.startDrag(data);
    void ended() => state.startDrag(null);
    final faded = Opacity(opacity: 0.4, child: child);
    return touch
        ? LongPressDraggable<_Drag>(
            data: data,
            feedback: feedback,
            childWhenDragging: faded,
            onDragStarted: started,
            onDragEnd: (_) => ended(),
            child: child,
          )
        : Draggable<_Drag>(
            data: data,
            feedback: feedback,
            childWhenDragging: faded,
            onDragStarted: started,
            onDragEnd: (_) => ended(),
            child: child,
          );
  }

  /// A card that takes a card of the same kind dropped on it: it lands in front of this one.
  Widget _dropTarget({required NodeKind kind, required Place place, required Widget child}) {
    if (!movable) return child;
    return DragTarget<_Drag>(
      onWillAcceptWithDetails: (d) => d.data.kind == kind && dropOf(all, d.data.id, place) != null,
      onAcceptWithDetails: (d) => _dropped(d.data, place),
      builder: (context, candidates, _) => candidates.isEmpty
          ? child
          : DecoratedBox(
              decoration: BoxDecoration(
                border: BorderDirectional(
                  start: kind == NodeKind.chapter && !lanes
                      ? BorderSide(color: Theme.of(context).colorScheme.primary, width: 3)
                      : BorderSide.none,
                  top: kind == NodeKind.scene || lanes
                      ? BorderSide(color: Theme.of(context).colorScheme.primary, width: 3)
                      : BorderSide.none,
                ),
              ),
              child: child,
            ),
    );
  }
}

/// A chapter's head or a scene card: its title (which opens it), summary, status, words, threads and moves.
class _CardBody extends StatelessWidget {
  const _CardBody({
    required this.node,
    required this.heading,
    required this.meta,
    required this.view,
    required this.moves,
  });

  final StoryNode node;
  final bool heading;
  final String meta;
  final _BoardView view;
  final List<Widget> moves;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = _title(node);
    final chips = view.threadChips(context, node);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            if (view.movable)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 4),
                child: Tooltip(
                  message: view.touch ? 'Press and hold to move' : 'Drag to move',
                  child: Icon(Icons.drag_indicator, size: 18, color: theme.colorScheme.outline),
                ),
              ),
            Expanded(
              child: InkWell(
                onTap: () => view.actions.openChapter(node.id),
                // At least 48 pixels tall, so it is easy to tap.
                child: Container(
                  constraints: const BoxConstraints(minHeight: 48),
                  alignment: AlignmentDirectional.centerStart,
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text(
                    name,
                    style: heading ? theme.textTheme.titleSmall : theme.textTheme.bodyLarge,
                    semanticsLabel: 'Open $name',
                  ),
                ),
              ),
            ),
            IconButton(
              tooltip: 'Plan for $name',
              onPressed: () => view.actions.openPlan(node.id),
              icon: const Icon(Icons.assignment_outlined, size: 20),
            ),
          ],
        ),
        if (node.summary.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(node.summary, maxLines: 4, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall),
          ),
        Wrap(
          spacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 130,
              child: DropdownButton<NodeStatus>(
                value: node.status,
                isExpanded: true,
                underline: const SizedBox.shrink(),
                items: [for (final s in NodeStatus.values) DropdownMenuItem(value: s, child: Text(s.label))],
                onChanged: (s) => s == null ? null : view.state.setStatus(node, s),
              ),
            ),
            Text(meta, style: theme.textTheme.bodySmall),
          ],
        ),
        if (chips != null) Padding(padding: const EdgeInsets.only(top: 4), child: chips),
        if (moves.isNotEmpty) Wrap(children: moves),
      ],
    );
  }
}

/// Where a dragged card can land at the end of a chapter or a part.
class _DropZone extends StatelessWidget {
  const _DropZone({required this.label, required this.accepts, required this.onDrop});
  final String label;
  final bool Function(_Drag d) accepts;
  final void Function(_Drag d) onDrop;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DragTarget<_Drag>(
      onWillAcceptWithDetails: (d) => accepts(d.data),
      onAcceptWithDetails: (d) => onDrop(d.data),
      builder: (context, candidates, _) => Container(
        margin: const EdgeInsets.only(top: 4),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: candidates.isEmpty ? null : scheme.primaryContainer,
          border: Border.all(color: scheme.primary),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(label, style: Theme.of(context).textTheme.bodySmall),
      ),
    );
  }
}

/// [top], then [items] built only as they are scrolled to, so a board of hundreds of chapters opens at once.
class _LazyList extends StatelessWidget {
  const _LazyList({required this.top, required this.items});
  final Widget top;
  final List<WidgetBuilder> items;

  @override
  Widget build(BuildContext context) =>
      ListView.builder(itemCount: items.length + 1, itemBuilder: (context, i) => i == 0 ? top : items[i - 1](context));
}

/// One part's row of chapter columns, built only near the screen: the columns in view and a margin either side, in
/// steps of [_step], with spacers of their exact width for the rest. So a part of hundreds of chapters (a novel with no
/// volumes) opens at once, and scrolls, and its scrollbar, are as if every column were there. The row keeps the height of
/// the tallest column it has shown, so what is beneath it does not jump as columns come and go.
class _ColumnsRow extends StatefulWidget {
  const _ColumnsRow({super.key, required this.count, required this.column, this.trailing});
  final int count;
  final Widget Function(BuildContext context, int index) column;
  final Widget? trailing;

  @override
  State<_ColumnsRow> createState() => _ColumnsRowState();
}

class _ColumnsRowState extends State<_ColumnsRow> {
  static const _width = 280.0;
  static const _gap = 12.0;
  static const _slot = _width + _gap;
  static const _step = 8;

  final _scroll = ScrollController();
  final _row = GlobalKey();
  var _from = 0;
  var _to = _step * 2;
  double _tallest = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_window);
  }

  @override
  void didUpdateWidget(_ColumnsRow old) {
    super.didUpdateWidget(old);
    // The chapters changed (a card moved, a scene added): measured again from what is shown.
    _tallest = 0;
  }

  @override
  void dispose() {
    _scroll.removeListener(_window);
    _scroll.dispose();
    super.dispose();
  }

  void _window() {
    if (!_scroll.hasClients) return;
    final view = _scroll.position.viewportDimension;
    final first = (_scroll.offset / _slot).floor();
    final last = ((_scroll.offset + view) / _slot).ceil();
    final from = math.max(0, (first ~/ _step - 1) * _step);
    final to = math.min(widget.count, (last ~/ _step + 2) * _step);
    if (from != _from || to != _to) {
      setState(() {
        _from = from;
        _to = to;
      });
    }
  }

  void _measure() {
    final height = _row.currentContext?.size?.height;
    if (height != null && height > _tallest + 0.5 && mounted) setState(() => _tallest = height);
  }

  @override
  Widget build(BuildContext context) {
    final count = widget.count;
    // Until the first scroll, a screen's width of columns from the start.
    if (!_scroll.hasClients) {
      _to = math.max(_to, math.min(count, (MediaQuery.sizeOf(context).width / _slot).ceil() + _step));
    }
    final from = math.min(_from, count);
    final to = math.min(_to, count);
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
    return Scrollbar(
      controller: _scroll,
      child: SingleChildScrollView(
        controller: _scroll,
        scrollDirection: Axis.horizontal,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: _tallest),
          child: Row(
            key: _row,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (from > 0) SizedBox(width: from * _slot),
              for (var i = from; i < to; i++)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: _gap),
                  child: SizedBox(width: _width, child: widget.column(context, i)),
                ),
              if (to < count) SizedBox(width: (count - to) * _slot),
              ?widget.trailing,
            ],
          ),
        ),
      ),
    );
  }
}
