import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/characters/appearances.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/characters_providers.dart';
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import 'plot_providers.dart';

const _glyph = {CellState.appears: '●', CellState.mentioned: '◐', CellState.other: '○', CellState.none: ''};

/// About how many cells the matrix draws at first; more rows are drawn when asked.
const _cellBudget = 6000;
const _nameW = 150.0;
// 48 pixels square, so each cell is easy to tap.
const _cellW = 48.0;
const _cellH = 48.0;

/// CHARACTER APPEARANCES
/// Characters against chapters (or scenes), from recorded associations only: the author's appearance records, and the
/// other records that tie a character to a chapter, each shown for what it is. A blank cell is nothing recorded, never
/// proof that a character is not in the text.
class AppearancesPage extends ConsumerStatefulWidget {
  const AppearancesPage({super.key});

  @override
  ConsumerState<AppearancesPage> createState() => _AppearancesPageState();
}

class _AppearancesPageState extends ConsumerState<AppearancesPage> {
  bool _list = false;
  Grain _grain = Grain.chapters;
  NodeStatus? _status;
  bool _all = false;
  int? _rowsAsked;

  /// The cell chosen, by character and chapter or scene.
  ({String characterId, String nodeId})? _cell;

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final viz = ref.watch(vizStateProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child) => VizFrame(
      view: 'appearances',
      title: 'Character appearances',
      config: () => {
        'mode': _list ? 'list' : 'visual',
        'layout': {'grain': _grain.name, 'status': ?_status?.key, if (_all) 'all': true},
      },
      onApply: (JsonMap c) {
        final layout = mapOrNull(c['layout']) ?? const {};
        setState(() {
          _list = c['mode'] == 'list';
          _grain = layout['grain'] == 'scenes' ? Grain.scenes : Grain.chapters;
          _status = NodeStatus.values.where((s) => s.key == layout['status']).firstOrNull;
          _all = layout['all'] == true;
          _cell = null;
        });
      },
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.grid_on), label: Text('Matrix')),
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
    if (!model.entries.values.any((e) => e.category == 'character')) {
      return frame(
        const EmptyState(
          icon: Icons.people_outline,
          title: 'No characters yet',
          message: 'Make one on the Characters page; then record, in each chapter’s plan, who appears there.',
        ),
      );
    }
    if (model.order.chapters.isEmpty) {
      return frame(
        const EmptyState(
          icon: Icons.menu_book_outlined,
          title: 'No chapters yet',
          message: 'Add chapters in Write; then record, in each one’s plan, who appears there.',
        ),
      );
    }
    final actions = PlotActions(context, cast.novelId);
    final asked = viz.filter;
    final chapters = mapOrNull(asked['chapters']);
    final filter = MatrixFilter(
      grain: _grain,
      characterIds: strings(asked['characters']),
      text: str(asked['text']),
      from: strOrNull(chapters?['from']),
      to: strOrNull(chapters?['to']),
      threadId: strings(asked['threads']).firstOrNull,
      placeId: strings(asked['locations']).firstOrNull,
      status: _status,
      all: _all,
    );
    final matrix = appearanceMatrix(model, filter);
    final (:columns, :rows) = (columns: matrix.columns, rows: matrix.rows);
    final chosenRow = _cell == null ? -1 : rows.indexWhere((r) => r.characterId == _cell!.characterId);
    final chosenCol = _cell == null ? -1 : columns.indexWhere((c) => c.nodeId == _cell!.nodeId);
    final step = math.max(20, _cellBudget ~/ math.max(1, columns.length));
    final drawn = rows.take(math.max(_rowsAsked ?? step, chosenRow + 1)).toList();
    final documents = model.order.chapters;
    final threads = stableSorted(model.threads.values, (a, b) => localeCompare(a.title, b.title));
    final places = stableSorted(
      model.entries.values.where((e) => e.category == 'location'),
      (a, b) => localeCompare(a.name, b.name),
    );
    final filtered =
        filter.from != null ||
        filter.to != null ||
        filter.threadId != null ||
        filter.placeId != null ||
        _status != null ||
        filter.characterIds.isNotEmpty ||
        filter.text.trim().isNotEmpty;
    String cellWords(MatrixRow row, int col) {
      final cell = row.cells[col];
      final column = columns[col];
      return '${row.name}, ${column.label}: ${cell.state.label.toLowerCase()}'
          '${cell.evidence.isEmpty ? '' : ' (${evidenceWords(cell.evidence, model, column.nodeId).join('; ')})'}';
    }

    void setShared(String key, Object? value) {
      final next = {...asked};
      if (value == null) {
        next.remove(key);
      } else {
        next[key] = value;
      }
      notifier.setFilter(next);
    }

    void setRange({String? from, String? to, bool fromSet = false, bool toSet = false}) {
      final now = {...?chapters};
      if (fromSet) now['from'] = from;
      if (toSet) now['to'] = to;
      now.removeWhere((_, v) => v == null);
      setShared('chapters', now.isEmpty ? null : now);
    }

    Widget box(double w, Widget child) => SizedBox(width: w, child: child);
    final controls = Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SegmentedButton<Grain>(
          segments: const [
            ButtonSegment(value: Grain.chapters, label: Text('Chapters')),
            ButtonSegment(value: Grain.scenes, label: Text('Scenes')),
          ],
          selected: {_grain},
          showSelectedIcon: false,
          onSelectionChanged: (v) => setState(() => _grain = v.first),
        ),
        box(
          200,
          DropdownButtonFormField<String>(
            key: ValueKey('from:${filter.from}'),
            initialValue: documents.any((d) => d.id == filter.from) ? filter.from : '',
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'From chapter', isDense: true),
            items: [
              const DropdownMenuItem(value: '', child: Text('The first')),
              for (final (i, d) in documents.indexed)
                DropdownMenuItem(
                  value: d.id,
                  child: Text('${i + 1}. ${d.title}', overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => setRange(from: v == null || v.isEmpty ? null : v, fromSet: true),
          ),
        ),
        box(
          200,
          DropdownButtonFormField<String>(
            key: ValueKey('to:${filter.to}'),
            initialValue: documents.any((d) => d.id == filter.to) ? filter.to : '',
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'To chapter', isDense: true),
            items: [
              const DropdownMenuItem(value: '', child: Text('The last')),
              for (final (i, d) in documents.indexed)
                DropdownMenuItem(
                  value: d.id,
                  child: Text('${i + 1}. ${d.title}', overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => setRange(to: v == null || v.isEmpty ? null : v, toSet: true),
          ),
        ),
        if (threads.isNotEmpty)
          box(
            200,
            DropdownButtonFormField<String>(
              key: ValueKey('thread:${filter.threadId}'),
              initialValue: threads.any((t) => t.id == filter.threadId) ? filter.threadId : '',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Plot thread', isDense: true),
              items: [
                const DropdownMenuItem(value: '', child: Text('Any')),
                for (final t in threads)
                  DropdownMenuItem(
                    value: t.id,
                    child: Text(t.title, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (v) => setShared('threads', v == null || v.isEmpty ? null : [v]),
            ),
          ),
        if (places.isNotEmpty)
          box(
            200,
            DropdownButtonFormField<String>(
              key: ValueKey('place:${filter.placeId}'),
              initialValue: places.any((p) => p.id == filter.placeId) ? filter.placeId : '',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Place', isDense: true),
              items: [
                const DropdownMenuItem(value: '', child: Text('Any')),
                for (final p in places)
                  DropdownMenuItem(
                    value: p.id,
                    child: Text(p.name, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (v) => setShared('locations', v == null || v.isEmpty ? null : [v]),
            ),
          ),
        box(
          170,
          DropdownButtonFormField<NodeStatus?>(
            key: ValueKey('status:$_status'),
            initialValue: _status,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Status', isDense: true),
            items: [
              const DropdownMenuItem(value: null, child: Text('Any')),
              for (final s in NodeStatus.values) DropdownMenuItem(value: s, child: Text(s.label)),
            ],
            onChanged: (v) => setState(() => _status = v),
          ),
        ),
        box(
          320,
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            controlAffinity: ListTileControlAffinity.leading,
            value: _all,
            onChanged: (v) => setState(() => _all = v == true),
            title: const Text('Show characters with nothing recorded here'),
          ),
        ),
      ],
    );

    final selected = chosenRow >= 0 && chosenCol >= 0
        ? (row: rows[chosenRow], column: columns[chosenCol], cell: rows[chosenRow].cells[chosenCol])
        : null;
    final perColumn = _grain == Grain.chapters ? 'chapter' : 'column';

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card.outlined(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: 'From what is recorded. ', style: theme.textTheme.labelLarge),
                    const TextSpan(
                      text:
                          'Each cell shows your appearance record (appears, or only mentioned) if you made one, and '
                          'otherwise any other record tying the character to that chapter: a link in the text, the '
                          'plan’s “Entities involved”, or an event they take part in that the chapter tells. Nothing '
                          'is read from the text itself. A blank cell means nothing is recorded, not that the '
                          'character is absent.',
                    ),
                  ],
                ),
                style: theme.textTheme.bodySmall,
              ),
            ),
          ),
          const SizedBox(height: 12),
          controls,
          const SizedBox(height: 12),
          if (columns.isEmpty)
            EmptyState(
              icon: Icons.filter_alt_off_outlined,
              title: 'Nothing matches',
              message: 'No chapters match these filters.',
              action: OutlinedButton(
                onPressed: () {
                  notifier.setFilter({});
                  setState(() => _status = null);
                },
                child: const Text('Clear filters'),
              ),
            )
          else ...[
            Semantics(
              liveRegion: true,
              child: Text(
                '${plural(rows.length, 'character')} × ${plural(columns.length, perColumn)} · '
                '${plural(rows.fold(0, (n, r) => n + r.recorded), 'cell')} with a record'
                '${matrix.hidden > 0 ? ' · ${plural(matrix.hidden, 'character')} with nothing recorded here not shown' : ''}'
                '${filtered ? ' · filtered' : ''}',
              ),
            ),
            const SizedBox(height: 8),
            if (rows.isEmpty)
              EmptyState(
                icon: Icons.people_outline,
                title: 'Nothing recorded here',
                message:
                    'Nothing is recorded for anyone in these chapters. That is not the same as nobody being in them.',
                action: OutlinedButton(
                  onPressed: () => setState(() => _all = true),
                  child: const Text('Show every character'),
                ),
              )
            else if (!_list) ...[
              _Matrix(
                columns: columns,
                rows: drawn,
                chosen: chosenRow >= 0 && chosenCol >= 0 ? (row: chosenRow, col: chosenCol) : null,
                words: cellWords,
                onChoose: (r, c) =>
                    setState(() => _cell = (characterId: rows[r].characterId, nodeId: columns[c].nodeId)),
                onPickCharacter: (id) => notifier.select(EntityRef(EntityType.entry, id)),
              ),
              if (drawn.length < rows.length)
                Wrap(
                  spacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      'Showing the first ${drawn.length} of ${rows.length} characters, by name, so the table stays '
                      'quick. The list shows everyone.',
                      style: theme.textTheme.bodySmall,
                    ),
                    TextButton(
                      onPressed: () => setState(() => _rowsAsked = drawn.length + step),
                      child: Text('Show ${math.min(step, rows.length - drawn.length)} more'),
                    ),
                    TextButton(
                      onPressed: () => setState(() => _rowsAsked = rows.length),
                      child: Text('Show all ${rows.length} (may be slow)'),
                    ),
                  ],
                ),
              const SizedBox(height: 8),
              const _Legend(),
            ] else
              for (final row in rows)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(row.name, style: theme.textTheme.titleSmall),
                        for (final s in [CellState.appears, CellState.mentioned, CellState.other])
                          if (_labels(row, columns, s) case final l when l.isNotEmpty)
                            Text('${s.label}: ${l.join(', ')}'),
                        Text(
                          'Nothing recorded: ${_labels(row, columns, CellState.none).isEmpty ? 'none' : _labels(row, columns, CellState.none).join(', ')}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
            if (selected != null) ...[
              const SizedBox(height: 16),
              _CellPanel(
                model: model,
                grain: _grain,
                row: selected.row,
                column: selected.column,
                cell: selected.cell,
                actions: actions,
                onPickEvent: (id) => notifier.select(EntityRef(EntityType.event, id)),
              ),
            ],
          ],
        ],
      ),
    );
  }

  static List<String> _labels(MatrixRow row, List<MatrixColumn> columns, CellState s) => [
    for (final (c, column) in columns.indexed)
      if (row.cells[c].state == s) column.label,
  ];
}

/// Characters by chapter: the arrow keys move between cells, Enter opens one. One stop in the tab order.
class _Matrix extends StatefulWidget {
  const _Matrix({
    required this.columns,
    required this.rows,
    required this.chosen,
    required this.words,
    required this.onChoose,
    required this.onPickCharacter,
  });

  final List<MatrixColumn> columns;
  final List<MatrixRow> rows;
  final ({int row, int col})? chosen;
  final String Function(MatrixRow row, int col) words;
  final void Function(int row, int col) onChoose;
  final ValueChanged<String> onPickCharacter;

  @override
  State<_Matrix> createState() => _MatrixState();
}

class _MatrixState extends State<_Matrix> {
  final _scroll = ScrollController();
  final _node = FocusNode(debugLabel: 'Appearances matrix');
  var _focus = (row: 0, col: 0);
  bool _focused = false;

  @override
  void dispose() {
    _scroll.dispose();
    _node.dispose();
    super.dispose();
  }

  void _move(int row, int col) {
    final next = (row: row.clamp(0, widget.rows.length - 1), col: col.clamp(0, widget.columns.length - 1));
    setState(() => _focus = next);
    if (!_scroll.hasClients) return;
    final left = _nameW + next.col * _cellW;
    final view = _scroll.position.viewportDimension;
    if (left < _scroll.offset + _nameW) _scroll.jumpTo(math.max(0, left - _nameW));
    if (left + _cellW > _scroll.offset + view) {
      _scroll.jumpTo(math.min(_scroll.position.maxScrollExtent, left + _cellW - view));
    }
  }

  KeyEventResult _key(KeyEvent e) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent) return KeyEventResult.ignored;
    final (:row, :col) = _focus;
    switch (e.logicalKey) {
      case LogicalKeyboardKey.arrowRight:
        _move(row, col + 1);
      case LogicalKeyboardKey.arrowLeft:
        _move(row, col - 1);
      case LogicalKeyboardKey.arrowDown:
        _move(row + 1, col);
      case LogicalKeyboardKey.arrowUp:
        _move(row - 1, col);
      case LogicalKeyboardKey.home:
        _move(row, 0);
      case LogicalKeyboardKey.end:
        _move(row, widget.columns.length - 1);
      case LogicalKeyboardKey.enter || LogicalKeyboardKey.space:
        widget.onChoose(row.clamp(0, widget.rows.length - 1), col.clamp(0, widget.columns.length - 1));
      default:
        return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = theme.colorScheme;
    final columns = widget.columns;
    Color? shade(CellState st) => switch (st) {
      CellState.appears => s.primaryContainer,
      CellState.mentioned => s.secondaryContainer,
      CellState.other => s.surfaceContainerHigh,
      CellState.none => null,
    };
    return Semantics(
      container: true,
      label: 'Characters by chapter: arrow keys move between cells, Enter opens one',
      child: Focus(
        focusNode: _node,
        onFocusChange: (f) => setState(() => _focused = f),
        onKeyEvent: (_, e) => _key(e),
        child: Scrollbar(
          controller: _scroll,
          thumbVisibility: true,
          child: SingleChildScrollView(
            controller: _scroll,
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    SizedBox(
                      width: _nameW,
                      child: Text('Character', style: theme.textTheme.labelLarge),
                    ),
                    for (final c in columns)
                      Tooltip(
                        message: c.label,
                        child: SizedBox(
                          width: _cellW,
                          height: _cellH,
                          child: Center(child: Text(c.short, style: theme.textTheme.labelSmall)),
                        ),
                      ),
                  ],
                ),
                for (final (r, row) in widget.rows.indexed)
                  Row(
                    children: [
                      SizedBox(
                        width: _nameW,
                        height: _cellH,
                        child: Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: TextButton(
                            onPressed: () => widget.onPickCharacter(row.characterId),
                            child: Text(row.name, overflow: TextOverflow.ellipsis),
                          ),
                        ),
                      ),
                      for (final (c, cell) in row.cells.indexed)
                        Semantics(
                          button: true,
                          selected: widget.chosen?.row == r && widget.chosen?.col == c,
                          label: widget.words(row, c),
                          onTap: () => widget.onChoose(r, c),
                          excludeSemantics: true,
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () {
                              setState(() => _focus = (row: r, col: c));
                              _node.requestFocus();
                              widget.onChoose(r, c);
                            },
                            child: Container(
                              width: _cellW,
                              height: _cellH,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: widget.chosen?.row == r && widget.chosen?.col == c
                                    ? s.tertiaryContainer
                                    : shade(cell.state),
                                border: Border.all(
                                  color: _focused && _focus.row == r && _focus.col == c ? s.primary : s.outlineVariant,
                                  width: _focused && _focus.row == r && _focus.col == c ? 2.5 : 0.5,
                                ),
                              ),
                              child: Text(_glyph[cell.state]!, style: TextStyle(color: s.onSurface, fontSize: 16)),
                            ),
                          ),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget item(String glyph, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(width: 18, child: Text(glyph, textAlign: TextAlign.center)),
        const SizedBox(width: 4),
        Flexible(child: Text(label, style: theme.textTheme.bodySmall)),
      ],
    );
    return ExcludeSemantics(
      child: Wrap(
        spacing: 16,
        runSpacing: 6,
        children: [
          Text('What a cell shows', style: theme.textTheme.labelLarge),
          item('●', CellState.appears.label),
          item('◐', '${CellState.mentioned.label}, not on the page'),
          item('○', 'Other records (a link in the text, the plan, an event)'),
          item('', 'Blank: nothing recorded (not the same as absent)'),
        ],
      ),
    );
  }
}

/// One cell: what ties the character to the chapter, and the author's own record of it, to make, change or remove.
/// A record is written to that chapter's or scene's plan, and nowhere else.
class _CellPanel extends StatelessWidget {
  const _CellPanel({
    required this.model,
    required this.grain,
    required this.row,
    required this.column,
    required this.cell,
    required this.actions,
    required this.onPickEvent,
  });

  final StoryModel model;
  final Grain grain;
  final MatrixRow row;
  final MatrixColumn column;
  final MatrixCell cell;
  final PlotActions actions;
  final ValueChanged<String> onPickEvent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final plan = model.plans[column.nodeId];
    final who = row.characterId;
    final own = (plan?.appearIds ?? const []).contains(who)
        ? 'appears'
        : (plan?.mentionIds ?? const []).contains(who)
        ? 'mentioned'
        : null;
    void record(String? as) => actions.edit(
      (x) => x.updatePlan(column.nodeId, (stored) {
        final appear = [
          for (final id in strings(stored['appearIds']))
            if (id != who) id,
        ];
        final mention = [
          for (final id in strings(stored['mentionIds']))
            if (id != who) id,
        ];
        return switch (as) {
          'appears' => {
            'appearIds': [...appear, who],
          },
          'mentioned' => {
            'mentionIds': [...mention, who],
          },
          _ => {'appearIds': appear, 'mentionIds': mention},
        };
      }),
    );
    final evidence = evidenceWords(cell.evidence, model, column.nodeId);
    return Semantics(
      container: true,
      label: 'Selected: ${row.name} in ${column.label}',
      child: Card.outlined(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('${row.name} in ${column.label}', style: theme.textTheme.titleMedium),
              const SizedBox(height: 4),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: '${cell.state.label}. ', style: theme.textTheme.labelLarge),
                    if (cell.state == CellState.none)
                      const TextSpan(text: 'Nothing ties them to it in your records. They may still be in the text.'),
                  ],
                ),
              ),
              for (final (i, w) in evidence.indexed)
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text('• $w', style: theme.textTheme.bodySmall),
                    if (cell.evidence[i].eventId case final id?)
                      TextButton(onPressed: () => onPickEvent(id), child: const Text('Show the event')),
                  ],
                ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  TextButton(
                    onPressed: () => actions.openChapter(column.nodeId),
                    child: Text('Open ${column.label} to write'),
                  ),
                  TextButton(onPressed: () => actions.openCharacter(who), child: Text('Open ${row.name}')),
                  TextButton(onPressed: () => actions.openPlan(column.nodeId), child: const Text('Its plan')),
                ],
              ),
              const SizedBox(height: 8),
              Semantics(
                container: true,
                label: 'Your record',
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: own == 'appears' ? null : () => record('appears'),
                      child: const Text('Record: appears here'),
                    ),
                    OutlinedButton(
                      onPressed: own == 'mentioned' ? null : () => record('mentioned'),
                      child: const Text('Record: mentioned here'),
                    ),
                    if (own != null) TextButton(onPressed: () => record(null), child: const Text('Remove my record')),
                  ],
                ),
              ),
              if (grain == Grain.chapters && cell.evidence.any((e) => e.nodeId != column.nodeId))
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'A record made here is on the chapter itself; its scenes keep their own.',
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
