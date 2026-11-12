import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/navigate.dart' show threadStatusName;
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/plot/lanes.dart';
import '../../shared/domain/plot/plot_changes.dart' show categoryName;
import '../../shared/domain/records/thread.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/timeline/narrative.dart' show nodeLabel;
import '../characters/characters_providers.dart';
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import '../visualize/widgets/canon_badge.dart';
import 'plot_providers.dart';

const _headH = 34.0;
const _rowH = 48.0;
// A cell is 48 pixels square: its whole space is the tap target.
const _colW = 48.0;

/// THE PLOT BOARD
/// Each plot thread as a lane across the chapters, from what the author records: where it is introduced, develops,
/// crosses another thread and is resolved, and the events that belong to it. Chapters in between with nothing
/// recorded are shown, and counted, as just that. Nothing is made up to fill them.
class PlotLanesPage extends ConsumerStatefulWidget {
  const PlotLanesPage({super.key});

  @override
  ConsumerState<PlotLanesPage> createState() => _PlotLanesPageState();
}

class _PlotLanesPageState extends ConsumerState<PlotLanesPage> {
  bool _list = false;

  /// The cell chosen, by lane and chapter column, for the threads shown when it was chosen.
  ({String key, int lane, int col})? _chosen;

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child) => VizFrame(
      view: 'plot',
      title: 'Plot board',
      config: () => {'mode': _list ? 'list' : 'visual'},
      onApply: (JsonMap c) => setState(() {
        _list = c['mode'] == 'list';
        _chosen = null;
      }),
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.view_stream_outlined), label: Text('Lanes')),
            ButtonSegment(value: true, icon: Icon(Icons.table_rows_outlined), label: Text('List')),
          ],
          selected: {_list},
          showSelectedIcon: false,
          onSelectionChanged: (v) => setState(() => _list = v.first),
        ),
      ],
      child: child,
    );
    if (cast == null) return frame(const SizedBox.shrink());
    final model = cast.model;
    final theme = Theme.of(context);
    if (model.threads.isEmpty) {
      return frame(
        const EmptyState(
          icon: Icons.timeline,
          title: 'No plot threads yet',
          message: 'Start one on the Plot threads page, and record where it is introduced, develops and is resolved.',
        ),
      );
    }
    final keep = matchingKeys(model, viz.filter, [EntityType.thread]);
    final ids = [
      for (final t in stableSorted(model.threads.values, (a, b) => localeCompare(a.title, b.title)))
        if (keep == null || keep.contains('thread:${t.id}')) t.id,
    ];
    if (ids.isEmpty) return frame(NoResultsState(onClear: () => notifier.setFilter({})));
    final lanes = threadLanes(model, ids);
    final key = ids.join(',');
    final chosen = _chosen?.key == key ? _chosen : null;
    final selectedId = viz.selection?.type == EntityType.thread ? viz.selection!.id : null;
    final words = _Words(model, lanes);
    final actions = PlotActions(context, cast.novelId);
    final records = _Records(model: model, words: words, actions: actions, select: notifier.select);
    final selectedLane = lanes.lanes.where((l) => l.thread.id == selectedId).firstOrNull;

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 12),
          if (lanes.chapters.isEmpty)
            const EmptyState(
              icon: Icons.menu_book_outlined,
              title: 'No chapters yet',
              message: 'There is nothing to lay the threads along. Add chapters in Write.',
            )
          else if (_list)
            for (final lane in lanes.lanes) records.sequence(context, lane, lanes)
          else ...[
            _LanesDrawing(
              badges: ref.watch(canonBadgesProvider),
              lanes: lanes,
              selectedThreadId: selectedId,
              chosen: chosen == null ? null : (lane: chosen.lane, col: chosen.col),
              words: words.cell,
              onChoose: (lane, col) => setState(() => _chosen = (key: key, lane: lane, col: col)),
              onSelectThread: (id) => notifier.select(EntityRef(EntityType.thread, id)),
            ),
            const SizedBox(height: 12),
            const _Legend(),
            const SizedBox(height: 12),
            Semantics(
              liveRegion: true,
              child: Card.outlined(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: chosen == null
                      ? Text(
                          'Choose a cell to see what is recorded there, or a thread’s name to select it.',
                          style: theme.textTheme.bodySmall,
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(words.cell(lanes.lanes[chosen.lane], chosen.col), style: theme.textTheme.titleSmall),
                            records.places(context, lanes.lanes[chosen.lane], chosen.col),
                          ],
                        ),
                ),
              ),
            ),
            if (selectedLane != null) ...[const SizedBox(height: 16), records.sequence(context, selectedLane, lanes)],
          ],
        ],
      ),
    );
  }
}

/// What the lanes say, in words: for screen readers, the chosen cell and the list.
class _Words {
  _Words(this.model, this.lanes);
  final StoryModel model;
  final Lanes lanes;

  String eventName(String id) => model.events[id]?.name ?? 'an event';
  String _where(String nodeId, String chapterId) =>
      nodeId == chapterId ? '' : ' in “${model.nodes[nodeId]?.title ?? 'a scene'}”';
  String beat(ThreadBeat b) =>
      '${beatRoleLabels[roleKey(b)]!.toLowerCase()}${b.title.trim().isEmpty ? '' : ' “${b.title.trim()}”'}';

  String cell(Lane lane, int col) {
    final c = lane.cells[col];
    final parts = [
      for (final p in c.places) ...[
        for (final b in p.beats) '${beat(b)}${_where(p.nodeId, p.chapterId)}',
        for (final id in p.eventIds) 'event “${eventName(id)}”${_where(p.nodeId, p.chapterId)}',
      ],
    ];
    final gap = lane.gaps.where((g) => col >= g.from && col <= g.to).firstOrNull;
    final crossedBy = [
      for (final o in lanes.lanes)
        if (o.crossings.any((x) => x.column == col && x.otherId == lane.thread.id)) o.thread.title,
    ];
    final what = parts.isNotEmpty
        ? parts.join('; ')
        : gap != null
        ? 'nothing recorded (${chaptersWords(lanes, gap.from, gap.to)}: ${gap.chapters} '
              '${gap.chapters == 1 ? 'chapter' : 'chapters'} with nothing recorded)'
        : 'nothing recorded';
    return '${lane.thread.title}, Ch ${lanes.chapters[col].number}: $what'
        '${crossedBy.isEmpty ? '' : '; crossed by ${crossedBy.join(', ')}'}';
  }
}

/// A chapter's record for a lane, and a whole thread from start to end, as widgets.
class _Records {
  _Records({required this.model, required this.words, required this.actions, required this.select});
  final StoryModel model;
  final _Words words;
  final PlotActions actions;
  final void Function(EntityRef? ref) select;

  Widget places(BuildContext context, Lane lane, int col) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final p in lane.cells[col].places)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    TextButton(
                      onPressed: () => actions.openChapter(p.nodeId),
                      child: Text('Open ${nodeLabel(model, p.nodeId)}'),
                    ),
                    TextButton(
                      onPressed: () => select(EntityRef(EntityType.node, p.nodeId)),
                      child: const Text('Show details'),
                    ),
                  ],
                ),
                for (final b in p.beats)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(start: 12, bottom: 4),
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: beatRoleLabels[roleKey(b)], style: theme.textTheme.labelMedium),
                          TextSpan(text: '  ${b.title.trim().isEmpty ? 'No title' : b.title.trim()}'),
                          if (b.note.trim().isNotEmpty)
                            TextSpan(text: ' · ${b.note.trim()}', style: theme.textTheme.bodySmall),
                          if (roleKey(b) == 'intersection' && b.withThreadIds.any(model.threads.containsKey))
                            TextSpan(
                              text:
                                  ' · crosses ${[for (final id in b.withThreadIds) ?model.threads[id]?.title].join(', ')}',
                            ),
                        ],
                      ),
                    ),
                  ),
                for (final id in p.eventIds)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(start: 12),
                    child: Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text('Event', style: theme.textTheme.labelMedium),
                        TextButton(
                          onPressed: () => select(EntityRef(EntityType.event, id)),
                          child: Text(words.eventName(id)),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }

  /// A thread from start to end: each chapter with something recorded, and the gaps between, in reading order.
  Widget sequence(BuildContext context, Lane lane, Lanes all) {
    final theme = Theme.of(context);
    final ends = endsOf(lane, all);
    final thread = lane.thread;
    final steps = <Widget>[];
    for (final (col, c) in lane.cells.indexed) {
      if (c.places.isNotEmpty) {
        steps.add(
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Ch ${all.chapters[col].number}', style: theme.textTheme.titleSmall),
                places(context, lane, col),
              ],
            ),
          ),
        );
      }
      final gap = lane.gaps.where((g) => g.from == col).firstOrNull;
      if (gap != null) {
        steps.add(
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(gapWords(all, gap), style: theme.textTheme.bodySmall),
          ),
        );
      }
    }
    return Semantics(
      container: true,
      label: 'Thread: ${thread.title}',
      child: Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  TextButton(
                    onPressed: () => select(EntityRef(EntityType.thread, thread.id)),
                    child: Text(thread.title.isEmpty ? 'Untitled thread' : thread.title),
                  ),
                  Text(threadStatusName(thread) ?? '', style: theme.textTheme.labelMedium),
                  Text(categoryName(thread), style: theme.textTheme.bodySmall),
                ],
              ),
              Wrap(
                spacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text('Introduced: ${ends.introduced} · Resolved: ${ends.resolved}'),
                  TextButton(
                    onPressed: () => actions.router.go('/plan/board?thread=${thread.id}'),
                    child: const Text('Its chapters and scenes on the scene board'),
                  ),
                  TextButton(onPressed: () => actions.openThread(thread.id), child: const Text('Edit the thread')),
                ],
              ),
              if (steps.isEmpty) Text('Nothing placed in a chapter yet.', style: theme.textTheme.bodySmall),
              ...steps,
              if (lane.unplaced.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Not placed in a chapter: ${lane.unplaced.map<String>(words.beat).join('; ')}.',
                    style: theme.textTheme.bodySmall,
                  ),
                ),
              if (lane.untold.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Its events told in no chapter: ${lane.untold.map<String>(words.eventName).join(', ')}.',
                    style: theme.textTheme.bodySmall,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The colours of the marks. Each role also has its own shape, so colour is never the only difference.
Color _roleColor(ColorScheme s, String? role) => switch (role) {
  'introduction' => s.tertiary,
  'development' => s.primary,
  'intersection' => s.secondary,
  'resolution' => s.error,
  'appears' => s.outline,
  _ => s.onSurfaceVariant,
};

/// Each thread as a lane across the chapters, in reading order. A mark is something the author recorded in that
/// chapter (its shape says the beat's role); a solid line joins neighbouring chapters, and a dashed one crosses
/// chapters where nothing is recorded, with how many. An intersection is a line to the lane of the thread it crosses.
/// One stop in the tab order: the arrow keys move between cells (the first column is the thread itself), Enter shows
/// what a cell holds or selects the thread.
class _LanesDrawing extends StatefulWidget {
  const _LanesDrawing({
    required this.lanes,
    required this.selectedThreadId,
    required this.chosen,
    required this.words,
    required this.onChoose,
    required this.onSelectThread,
    this.badges,
  });

  /// Canon and continuity badges, by record key; null while the marks are off.
  final Map<String, CanonBadge>? badges;
  final Lanes lanes;
  final String? selectedThreadId;
  final ({int lane, int col})? chosen;
  final String Function(Lane lane, int col) words;
  final void Function(int lane, int col) onChoose;
  final ValueChanged<String> onSelectThread;

  @override
  State<_LanesDrawing> createState() => _LanesDrawingState();
}

class _LanesDrawingState extends State<_LanesDrawing> {
  final _scroll = ScrollController();
  final _node = FocusNode(debugLabel: 'Plot lanes');
  var _focus = (lane: 0, col: -1);
  bool _focused = false;

  /// The columns whose cells exist as widgets (tap targets and screen-reader buttons): those on screen and a margin
  /// either side, in steps of [_step], so a novel of hundreds of chapters is not thousands of widgets. The drawing
  /// ([LanesPainter]) draws the same columns.
  var _from = 0;
  var _to = _step * 2;
  double _nameW = 180;
  static const _step = 16;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_window);
  }

  void _window() {
    if (!_scroll.hasClients) return;
    final cols = widget.lanes.chapters.length;
    final view = _scroll.position.viewportDimension;
    final first = ((_scroll.offset - _nameW) / _colW).floor();
    final last = ((_scroll.offset + view - _nameW) / _colW).ceil();
    final from = math.max(0, (first ~/ _step - 1) * _step);
    final to = math.min(cols, (last ~/ _step + 2) * _step);
    if (from != _from || to != _to) {
      setState(() {
        _from = from;
        _to = to;
      });
    }
  }

  @override
  void dispose() {
    _scroll.removeListener(_window);
    _scroll.dispose();
    _node.dispose();
    super.dispose();
  }

  void _choose(int lane, int col) =>
      col < 0 ? widget.onSelectThread(widget.lanes.lanes[lane].thread.id) : widget.onChoose(lane, col);

  void _move(int lane, int col, double nameW) {
    final cols = widget.lanes.chapters.length;
    final next = (lane: lane.clamp(0, widget.lanes.lanes.length - 1), col: col.clamp(-1, cols - 1));
    setState(() => _focus = next);
    if (!_scroll.hasClients) return;
    final left = next.col < 0 ? 0.0 : nameW + next.col * _colW;
    final right = next.col < 0 ? nameW : left + _colW;
    final view = _scroll.position.viewportDimension;
    if (left < _scroll.offset) _scroll.jumpTo(math.max(0, left - nameW));
    if (right > _scroll.offset + view) _scroll.jumpTo(math.min(_scroll.position.maxScrollExtent, right - view));
  }

  KeyEventResult _key(KeyEvent event, double nameW) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
    final (:lane, :col) = _focus;
    switch (event.logicalKey) {
      case LogicalKeyboardKey.arrowRight:
        _move(lane, col + 1, nameW);
      case LogicalKeyboardKey.arrowLeft:
        _move(lane, col - 1, nameW);
      case LogicalKeyboardKey.arrowDown:
        _move(lane + 1, col, nameW);
      case LogicalKeyboardKey.arrowUp:
        _move(lane - 1, col, nameW);
      case LogicalKeyboardKey.home:
        _move(lane, -1, nameW);
      case LogicalKeyboardKey.end:
        _move(lane, widget.lanes.chapters.length - 1, nameW);
      case LogicalKeyboardKey.enter || LogicalKeyboardKey.space:
        _choose(lane, col);
      default:
        return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final lanes = widget.lanes;
    final nameW = WindowSize.of(context) == WindowSize.compact ? 120.0 : 180.0;
    final cols = lanes.chapters.length;
    _nameW = nameW;
    // Until the first scroll, a screen's width of columns from wherever the view starts.
    if (!_scroll.hasClients) {
      _to = math.max(_to, math.min(cols, (MediaQuery.sizeOf(context).width / _colW).ceil() + _step));
    }
    final from = math.min(_from, cols);
    final to = math.min(_to, cols);
    final width = nameW + cols * _colW + 10;
    final height = _headH + lanes.lanes.length * _rowH + 6;
    final scale = MediaQuery.textScalerOf(context);
    final focus = _focused ? _focus : null;
    Widget hit({
      required Rect rect,
      required String label,
      required bool pressed,
      required int lane,
      required int col,
      Widget? child,
    }) => Positioned.fromRect(
      rect: rect,
      child: Semantics(
        button: true,
        selected: pressed,
        label: label,
        onTap: () => _choose(lane, col),
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            setState(() => _focus = (lane: lane, col: col));
            _node.requestFocus();
            _choose(lane, col);
          },
          child: child ?? const SizedBox.expand(),
        ),
      ),
    );

    return Semantics(
      container: true,
      label:
          'Plot-thread lanes: ${lanes.lanes.length} ${lanes.lanes.length == 1 ? 'thread' : 'threads'} across $cols '
          '${cols == 1 ? 'chapter' : 'chapters'}. Arrow keys move between cells, Enter shows what a cell holds.',
      child: Focus(
        focusNode: _node,
        onFocusChange: (f) => setState(() => _focused = f),
        onKeyEvent: (_, e) => _key(e, nameW),
        child: Scrollbar(
          controller: _scroll,
          thumbVisibility: true,
          child: SingleChildScrollView(
            controller: _scroll,
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.only(bottom: 12),
            child: SizedBox(
              width: width,
              height: height,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: CustomPaint(
                      painter: LanesPainter(
                        lanes: lanes,
                        from: from,
                        to: to,
                        nameW: nameW,
                        scheme: scheme,
                        text: theme.textTheme,
                        scale: scale,
                        selectedThreadId: widget.selectedThreadId,
                        chosen: widget.chosen,
                        focus: focus,
                        badges: widget.badges,
                      ),
                    ),
                  ),
                  for (var i = from; i < to; i++)
                    Positioned(
                      left: nameW + i * _colW,
                      top: 0,
                      width: _colW,
                      height: _headH,
                      child: Tooltip(
                        message: 'Chapter ${lanes.chapters[i].number}: ${lanes.chapters[i].title}',
                        excludeFromSemantics: true,
                        child: const SizedBox.expand(),
                      ),
                    ),
                  for (final (l, lane) in lanes.lanes.indexed) ...[
                    hit(
                      rect: Rect.fromLTWH(0, _headH + l * _rowH, nameW - 2, _rowH),
                      label: '${lane.thread.title}, ${threadStatusName(lane.thread) ?? ''}. Select the thread',
                      pressed: lane.thread.id == widget.selectedThreadId,
                      lane: l,
                      col: -1,
                    ),
                    for (var col = from; col < to; col++)
                      hit(
                        rect: Rect.fromLTWH(nameW + col * _colW, _headH + l * _rowH, _colW, _rowH),
                        label: widget.words(lane, col),
                        pressed: widget.chosen?.lane == l && widget.chosen?.col == col,
                        lane: l,
                        col: col,
                      ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Draws the lanes, but only the columns from [from] to [to] (the page's window: those on screen and a margin either
/// side, the same as its tap targets): a novel of hundreds of chapters was drawn whole, some twelve thousand cells and
/// the dashes between them, and the first frame to show it took 55 to 60 ms to draw every time the view was opened.
/// Lines running in from outside are drawn where they cross the window, dashed in the same places.
@visibleForTesting
class LanesPainter extends CustomPainter {
  LanesPainter({
    required this.lanes,
    this.from = 0,
    this.to,
    required this.nameW,
    required this.scheme,
    required this.text,
    required this.scale,
    required this.selectedThreadId,
    required this.chosen,
    required this.focus,
    this.badges,
  });

  final Map<String, CanonBadge>? badges;
  final Lanes lanes;

  /// The columns drawn (all of them when [to] is null).
  final int from;
  final int? to;
  final double nameW;
  final ColorScheme scheme;
  final TextTheme text;
  final TextScaler scale;
  final String? selectedThreadId;
  final ({int lane, int col})? chosen;
  final ({int lane, int col})? focus;

  double x(int col) => nameW + col * _colW + _colW / 2;
  double y(int lane) => _headH + lane * _rowH + _rowH / 2;

  void _text(Canvas canvas, String s, Offset at, TextStyle? style, {double? maxWidth, bool centre = false}) {
    final p = TextPainter(
      text: TextSpan(text: s, style: style),
      textDirection: TextDirection.ltr,
      textScaler: scale,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: maxWidth ?? double.infinity);
    p.paint(canvas, centre ? at - Offset(p.width / 2, 0) : at);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final small = text.labelSmall?.copyWith(color: scheme.onSurfaceVariant);
    final first = math.max(0, from);
    final last = math.min(to ?? lanes.chapters.length, lanes.chapters.length);
    bool shown(int col) => col >= first && col < last;
    // The window's left and right edges, where lines from outside it are cut.
    final left = nameW + first * _colW;
    final right = nameW + last * _colW;
    for (var i = first; i < last; i++) {
      final c = lanes.chapters[i];
      _text(canvas, '${c.number}', Offset(x(i), _headH - 26), small, centre: true);
      if (badges?['node:${c.id}'] case final badge?) {
        paintCanonBadge(canvas, Offset(x(i) + 6, 0), badge, scheme, size: 9);
      }
    }
    final laneOf = {for (final (i, l) in lanes.lanes.indexed) l.thread.id: i};
    for (final (l, lane) in lanes.lanes.indexed) {
      final top = _headH + l * _rowH;
      final selected = lane.thread.id == selectedThreadId;
      canvas.drawRect(
        Rect.fromLTWH(0, top + 2, size.width, _rowH - 4),
        Paint()..color = selected ? scheme.secondaryContainer : scheme.surfaceContainerLow,
      );
      final nameBox = RRect.fromRectAndRadius(
        Rect.fromLTWH(4, top + 4, nameW - 10, _rowH - 8),
        const Radius.circular(6),
      );
      canvas.drawRRect(nameBox, Paint()..color = scheme.surface);
      canvas.drawRRect(
        nameBox,
        Paint()
          ..style = PaintingStyle.stroke
          ..color = selected ? scheme.secondary : scheme.outlineVariant,
      );
      _text(canvas, lane.thread.title, Offset(12, top + 7), text.labelLarge, maxWidth: nameW - 26);
      if (badges?['thread:${lane.thread.id}'] case final badge?) {
        paintCanonBadge(canvas, Offset(nameW - 30, top + 26), badge, scheme, size: 9);
      }
      _text(canvas, threadStatusName(lane.thread) ?? '', Offset(12, top + 25), small, maxWidth: nameW - 26);

      final marked = [
        for (final (i, c) in lane.cells.indexed)
          if (c.places.isNotEmpty) i,
      ];
      for (var i = 1; i < marked.length; i++) {
        final from = marked[i - 1], to = marked[i];
        // A line wholly outside the window is not drawn; one running into it is drawn where it crosses it.
        if (x(to) < left || x(from) > right) continue;
        final gap = to - from > 1;
        final line = Paint()
          ..color = gap ? scheme.outline : scheme.onSurface
          ..strokeWidth = 2;
        if (gap) {
          // The dashes where they always fall (every 8 from the line's start), from the first in the window.
          final skip = x(from) < left ? ((left - x(from)) / 8).floor() : 0;
          final end = math.min(x(to), right);
          for (var a = x(from) + skip * 8; a < end; a += 8) {
            canvas.drawLine(Offset(a, y(l)), Offset(math.min(a + 4, x(to)), y(l)), line);
          }
          final middle = (x(from) + x(to)) / 2;
          if (middle >= left - _colW && middle <= right + _colW) {
            _text(canvas, '${to - from - 1} ch.', Offset(middle, y(l) - 21), small, centre: true);
          }
        } else {
          canvas.drawLine(Offset(x(from), y(l)), Offset(x(to), y(l)), line);
        }
      }
      for (final c in lane.crossings) {
        if (!shown(c.column)) continue;
        final other = laneOf[c.otherId];
        if (other == null) continue;
        final cross = Paint()
          ..color = scheme.secondary
          ..strokeWidth = 1.5;
        final (a, b) = (y(l), y(other));
        final step = b > a ? 5.0 : -5.0;
        for (var p = a; (step > 0 ? p < b : p > b); p += step * 2) {
          canvas.drawLine(Offset(x(c.column), p), Offset(x(c.column), p + step), cross);
        }
        canvas.drawCircle(Offset(x(c.column), b), 4.5, Paint()..color = scheme.secondary);
      }
      for (var col = first; col < math.min(last, lane.cells.length); col++) {
        final cell = lane.cells[col];
        final isChosen = chosen?.lane == l && chosen?.col == col;
        final hit = RRect.fromRectAndRadius(
          Rect.fromLTWH(nameW + col * _colW + 2, top + 4, _colW - 4, _rowH - 8),
          const Radius.circular(4),
        );
        if (isChosen) canvas.drawRRect(hit, Paint()..color = scheme.primaryContainer);
        if (cell.places.isNotEmpty) _mark(canvas, cell.role, Offset(x(col), y(l)));
        final count = cell.beats.length + cell.eventIds.length;
        if (count > 1) _text(canvas, '$count', Offset(x(col) + 9, y(l) - 20), small);
        if (focus?.lane == l && focus?.col == col) _ring(canvas, hit);
      }
      if (focus?.lane == l && focus?.col == -1) _ring(canvas, nameBox);
    }
  }

  void _ring(Canvas canvas, RRect r) => canvas.drawRRect(
    r.inflate(1),
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..color = scheme.primary,
  );

  void _mark(Canvas canvas, String? role, Offset c) => paintRoleMark(canvas, role, c, scheme);

  @override
  bool shouldRepaint(LanesPainter old) =>
      old.lanes != lanes ||
      old.from != from ||
      old.to != to ||
      old.nameW != nameW ||
      old.scheme != scheme ||
      old.selectedThreadId != selectedThreadId ||
      old.chosen != chosen ||
      old.focus != focus;
}

/// A beat's role as a shape: a ring, a dot, a diamond, a square or a small dot; only events, a triangle.
void paintRoleMark(Canvas canvas, String? role, Offset c, ColorScheme scheme) {
  final fill = Paint()..color = _roleColor(scheme, role);
  final (x, y) = (c.dx, c.dy);
  switch (role) {
    case 'introduction':
      canvas.drawCircle(
        c,
        6,
        fill
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3,
      );
    case 'development':
      canvas.drawCircle(c, 6, fill);
    case 'intersection':
      canvas.drawPath(
        Path()
          ..moveTo(x, y - 8)
          ..lineTo(x + 8, y)
          ..lineTo(x, y + 8)
          ..lineTo(x - 8, y)
          ..close(),
        fill,
      );
    case 'resolution':
      canvas.drawRect(Rect.fromCenter(center: c, width: 13, height: 13), fill);
    case 'appears':
      canvas.drawCircle(c, 3.5, fill);
    default:
      canvas.drawPath(
        Path()
          ..moveTo(x, y - 7)
          ..lineTo(x + 7, y + 6)
          ..lineTo(x - 7, y + 6)
          ..close(),
        fill,
      );
  }
}

/// What the lanes show: each role, events, and the lines.
class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    Widget swatch(void Function(Canvas c, Offset o) paint) =>
        SizedBox(width: 22, height: 18, child: CustomPaint(painter: _Swatch(paint)));
    Widget item(Widget s, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        s,
        const SizedBox(width: 6),
        Flexible(child: Text(label, style: theme.textTheme.bodySmall)),
      ],
    );
    return ExcludeSemantics(
      child: Wrap(
        spacing: 16,
        runSpacing: 6,
        children: [
          Text('What the lanes show', style: theme.textTheme.labelLarge),
          for (final r in beatRoles) item(swatch((c, o) => paintRoleMark(c, r, o, scheme)), beatRoleLabels[r]!),
          item(swatch((c, o) => paintRoleMark(c, null, o, scheme)), 'An event of the thread, told in that chapter'),
          item(
            swatch(
              (c, o) => c.drawLine(
                o - const Offset(9, 0),
                o + const Offset(9, 0),
                Paint()
                  ..color = scheme.onSurface
                  ..strokeWidth = 2,
              ),
            ),
            'Recorded in neighbouring chapters',
          ),
          item(
            swatch((c, o) {
              final p = Paint()
                ..color = scheme.outline
                ..strokeWidth = 2;
              for (var a = -9.0; a < 9; a += 8) {
                c.drawLine(o + Offset(a, 0), o + Offset(a + 4, 0), p);
              }
            }),
            'Chapters in between with nothing recorded (how many)',
          ),
          item(
            swatch((c, o) {
              final p = Paint()
                ..color = scheme.secondary
                ..strokeWidth = 1.5;
              for (var a = -8.0; a < 8; a += 6) {
                c.drawLine(o + Offset(0, a), o + Offset(0, a + 3), p);
              }
            }),
            'An intersection with another thread',
          ),
        ],
      ),
    );
  }
}

class _Swatch extends CustomPainter {
  _Swatch(this.draw);
  final void Function(Canvas c, Offset o) draw;

  @override
  void paint(Canvas canvas, Size size) => draw(canvas, size.center(Offset.zero));

  @override
  bool shouldRepaint(_Swatch old) => false;
}
