import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/saved_text_field.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/modules/module_changes.dart';
import '../../shared/domain/modules/module_defs.dart';
import '../../shared/domain/progression/snapshots.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/systems/formula.dart';
import '../../shared/domain/timeline/chronology.dart';
import '../characters/character_actions.dart';
import '../characters/widgets/typed_input.dart';
import '../write/write_providers.dart';
import 'module_service.dart';

/// What every tool is given: the module, the tool as arranged here, the novel's records, and whether it can change.
class ToolContext {
  const ToolContext({required this.moduleId, required this.tool, required this.data, required this.writes});
  final String moduleId;
  final JsonMap tool;
  final ToolData data;
  final bool writes;

  String get novelId => data.novelId;
  String get title => str(tool['title']);
}

/// Draws a tool from its description.
class ToolView extends StatelessWidget {
  const ToolView({super.key, required this.at, this.record});
  final ToolContext at;

  /// The record open in a registry.
  final String? record;

  @override
  Widget build(BuildContext context) => switch (at.tool['type']) {
    'registry' => RegistryTool(at: at, record: record),
    'board' => _BoardTool(at: at),
    'table' => _TableTool(at: at),
    'matrix' => _MatrixTool(at: at),
    'meters' => _MetersTool(at: at),
    'log' => _LogTool(at: at),
    'calculator' => _CalculatorTool(at: at),
    'ranks' => _RanksTool(at: at),
    'inventory' => _InventoryTool(at: at),
    'lineage' => _LineageTool(at: at),
    'page' => _PageTool(at: at),
    _ => const Text('This kind of tool is not known to this version of the app.'),
  };
}

TextStyle? _muted(BuildContext context) =>
    Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);

class _Missing extends StatelessWidget {
  const _Missing(this.what);
  final String what;

  @override
  Widget build(BuildContext context) => Text(
    'This tool needs $what, which is not in the Codex. Turning the module off and on again puts back anything of its '
    'own that is missing.',
    style: _muted(context),
  );
}

void _openEntry(BuildContext context, Entry entry) =>
    context.go(entryPath(entry.id, character: entry.category == 'character'));

/// A link to an entry's page.
class _EntryLink extends StatelessWidget {
  const _EntryLink(this.entry);
  final Entry entry;

  @override
  Widget build(BuildContext context) => Semantics(
    link: true,
    child: InkWell(
      onTap: () => _openEntry(context, entry),
      child: Text(
        entry.name.isEmpty ? 'Untitled' : entry.name,
        style: TextStyle(
          color: Theme.of(context).colorScheme.primary,
          decoration: TextDecoration.underline,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
  );
}

/// Adds an entry to a category without leaving the tool.
class _NewEntry extends StatefulWidget {
  const _NewEntry({required this.at, required this.category, this.preset});
  final ToolContext at;
  final Category category;
  final ({FieldDef def, String value})? preset;

  @override
  State<_NewEntry> createState() => _NewEntryState();
}

class _NewEntryState extends State<_NewEntry> {
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _add() {
    final name = _name.text.trim();
    if (name.isEmpty) return;
    final made = CharacterActions(context, widget.at.novelId).now((c) {
      final entry = c.createEntry(widget.category.key, name);
      if (widget.preset case final p? when p.value.isNotEmpty) c.setFieldValue(entry.id, p.def.id, p.value);
      return entry;
    });
    if (made != null) setState(_name.clear);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.at.writes) return const SizedBox.shrink();
    final singular = widget.category.singular.toLowerCase();
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _name,
            decoration: InputDecoration(labelText: 'New $singular', hintText: 'New $singular…', isDense: true),
            textInputAction: TextInputAction.done,
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _add(),
          ),
        ),
        const SizedBox(width: 8),
        FilledButton.tonal(onPressed: _name.text.trim().isEmpty ? null : _add, child: const Text('Add')),
      ],
    );
  }
}

/// The right control for a field, saved as it changes.
class _Cell extends StatelessWidget {
  const _Cell({required this.at, required this.entry, required this.category, required this.def, this.width = 200});
  final ToolContext at;
  final Entry entry;
  final Category category;
  final FieldDef def;
  final double width;

  @override
  Widget build(BuildContext context) {
    final value = at.data.raw(entry, category, def);
    final label = '${def.name} of ${entry.name}';
    if (!at.writes) {
      final shown = at.data.shown(entry, category, def);
      return SizedBox(
        width: width,
        child: Text(shown.isEmpty ? '—' : shown, semanticsLabel: '$label: $shown'),
      );
    }
    final actions = CharacterActions(context, at.novelId);
    return SizedBox(
      width: width,
      child: TypedInput(
        key: ValueKey('${entry.id}/${def.id}'),
        label: label,
        type: def.type ?? FieldType.text,
        value: value,
        options: def.options,
        entries: [
          for (final e in at.data.entries)
            if (e.id != entry.id) e,
        ],
        onTyped: (v) => actions.later('${entry.id}/${def.id}', (c) => c.setFieldValue(entry.id, def.id, v)),
        onChosen: (v) => actions.now((c) => c.setFieldValue(entry.id, def.id, v)),
      ),
    );
  }
}

/// Text saved when the author is done with it (Enter, or moving on), not as each letter is typed.
class _Commit extends StatefulWidget {
  const _Commit({
    required this.label,
    required this.value,
    required this.onCommit,
    this.number = false,
    this.multiline = false,
    this.hint,
  });
  final String label;
  final String value;
  final ValueChanged<String> onCommit;
  final bool number;
  final bool multiline;
  final String? hint;

  @override
  State<_Commit> createState() => _CommitState();
}

class _CommitState extends State<_Commit> {
  late final _text = TextEditingController(text: widget.value);
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (!_focus.hasFocus) _commit();
    });
  }

  @override
  void didUpdateWidget(_Commit old) {
    super.didUpdateWidget(old);
    if (widget.value != old.value && !_focus.hasFocus) _text.text = widget.value;
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _commit() {
    if (_text.text != widget.value) widget.onCommit(_text.text);
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _text,
    focusNode: _focus,
    decoration: InputDecoration(labelText: widget.label, hintText: widget.hint, isDense: true),
    keyboardType: widget.number
        ? const TextInputType.numberWithOptions(decimal: true, signed: true)
        : (widget.multiline ? TextInputType.multiline : null),
    minLines: widget.multiline ? 2 : 1,
    maxLines: widget.multiline ? 6 : 1,
    onSubmitted: widget.multiline ? null : (_) => _commit(),
  );
}

/// A choice among a few values, with a "none" choice, keeping a value that is no longer among them.
class _Choice extends StatelessWidget {
  const _Choice({
    required this.label,
    required this.value,
    required this.options,
    required this.onChosen,
    this.none = '—',
    this.names,
  });
  final String label;
  final String value;
  final List<String> options;
  final ValueChanged<String> onChosen;
  final String? none;
  final String Function(String option)? names;

  @override
  Widget build(BuildContext context) {
    final all = [
      if (value.isNotEmpty && !options.contains(value)) value,
      ...{...options},
    ];
    return DropdownButtonFormField<String>(
      key: ValueKey('$label:$value'),
      initialValue: value.isEmpty && none != null ? '' : (value.isEmpty ? null : value),
      isExpanded: true,
      decoration: InputDecoration(labelText: label, isDense: true),
      items: [
        if (none != null)
          DropdownMenuItem(
            value: '',
            child: Text(none!, overflow: TextOverflow.ellipsis),
          ),
        for (final o in all)
          DropdownMenuItem(
            value: o,
            child: Text(names?.call(o) ?? o, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) {
        if (v != null && v != value) onChosen(v);
      },
    );
  }
}

/// REGISTRY: one category of the world as a working list. The records are the novel's own entries: what is made or
/// changed here is what the Codex, search, the story graph and every other module see.
class RegistryTool extends StatefulWidget {
  const RegistryTool({super.key, required this.at, this.record});
  final ToolContext at;
  final String? record;

  @override
  State<RegistryTool> createState() => _RegistryToolState();
}

class _RegistryToolState extends State<RegistryTool> {
  var _query = '';
  var _only = '';
  var _recent = false;

  void _open(String? id) => context.go(modulePath(widget.at.moduleId, tool: str(widget.at.tool['id']), record: id));

  @override
  Widget build(BuildContext context) {
    final at = widget.at;
    final data = at.data;
    final tool = at.tool;
    final category = data.category(str(tool['category']));
    if (category == null) return _Missing('“${str(tool['category'])}”');
    final group = strOrNull(tool['groupBy']) == null
        ? null
        : data.field(category, str(tool['groupBy']), str(tool['category']));
    final summary = [for (final name in strings(tool['summary'])) ?data.field(category, name, str(tool['category']))];
    final all = data.entriesOf(category);
    String groupOf(Entry e) => group == null ? '' : data.shown(e, category, group);
    final groups = group == null
        ? const <String>[]
        : [
            if (group.type == FieldType.select) ...group.options,
            ...{
              for (final e in all)
                if (groupOf(e).isNotEmpty && !(group.type == FieldType.select && group.options.contains(groupOf(e))))
                  groupOf(e),
            },
          ];
    final needle = _query.trim().toLowerCase();
    final listed = [
      for (final e in all)
        if ((_only.isEmpty || (_only == '—' ? groupOf(e).isEmpty : groupOf(e) == _only)) &&
            (needle.isEmpty ||
                [
                  e.name,
                  e.summary,
                  ...e.tags,
                  for (final f in e.fields) f.value,
                ].any((t) => t.toLowerCase().contains(needle))))
          e,
    ];
    if (_recent) {
      listed.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    } else {
      listed.sort((a, b) => localeCompare(a.name, b.name));
    }
    final selected = all.where((e) => e.id == widget.record).firstOrNull;
    final preset = group != null && group.type == FieldType.select && _only.isNotEmpty && _only != '—'
        ? (def: group, value: _only)
        : null;

    final list = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _NewEntry(at: at, category: category, preset: preset),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 240,
              child: TextField(
                decoration: InputDecoration(
                  labelText: 'Search ${category.name}',
                  prefixIcon: const Icon(Icons.search),
                  isDense: true,
                ),
                onChanged: (v) => setState(() => _query = v),
              ),
            ),
            if (group != null)
              SizedBox(
                width: 220,
                child: _Choice(
                  label: 'Filter by ${group.name}',
                  value: _only,
                  options: [...groups, '—'],
                  none: 'Any ${group.name.toLowerCase()}',
                  names: (o) => o == '—' ? 'Not set' : o,
                  onChosen: (v) => setState(() => _only = v),
                ),
              ),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('By name')),
                ButtonSegment(value: true, label: Text('Recently changed')),
              ],
              selected: {_recent},
              showSelectedIcon: false,
              onSelectionChanged: (v) => setState(() => _recent = v.first),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (all.isEmpty)
          Text(
            'No ${category.name.toLowerCase()} yet. Nothing is made for you: add the first one above.',
            style: _muted(context),
          )
        else if (listed.isEmpty)
          Text('Nothing matches.', style: _muted(context))
        else
          for (final e in listed)
            Card(
              margin: const EdgeInsets.only(bottom: 6),
              child: ListTile(
                selected: e.id == selected?.id,
                title: Text(e.name.isEmpty ? 'Untitled' : e.name),
                subtitle: () {
                  final line = [
                    if (e.summary.trim().isNotEmpty) e.summary.trim(),
                    for (final d in summary)
                      if (data.shown(e, category, d).isNotEmpty) '${d.name}: ${data.shown(e, category, d)}',
                  ].join(' · ');
                  return line.isEmpty ? null : Text(line, maxLines: 2, overflow: TextOverflow.ellipsis);
                }(),
                trailing: groupOf(e).isEmpty
                    ? null
                    : Chip(label: Text(groupOf(e)), visualDensity: VisualDensity.compact),
                onTap: () => _open(e.id),
              ),
            ),
      ],
    );
    if (selected == null) return list;
    final record = _Record(at: at, category: category, entry: selected, onClose: () => _open(null));
    return LayoutBuilder(
      builder: (context, box) => box.maxWidth < 760
          ? record
          : Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: list),
                const SizedBox(width: 16),
                Expanded(child: record),
              ],
            ),
    );
  }
}

class _Record extends StatelessWidget {
  const _Record({required this.at, required this.category, required this.entry, required this.onClose});
  final ToolContext at;
  final Category category;
  final Entry entry;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final actions = CharacterActions(context, at.novelId);
    final view = viewFields(entry, category);
    return Card(
      key: ValueKey(entry.id),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                TextButton.icon(onPressed: onClose, icon: const Icon(Icons.arrow_back), label: Text(category.name)),
                TextButton(onPressed: () => _openEntry(context, entry), child: const Text('Open in the Codex')),
              ],
            ),
            if (!at.writes) ...[
              Semantics(header: true, child: Text(entry.name, style: Theme.of(context).textTheme.titleMedium)),
              if (entry.summary.isNotEmpty) Text(entry.summary),
              for (final (def, _) in view.category)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('${def.name}: ${at.data.shown(entry, category, def)}'),
                ),
            ] else ...[
              SavedTextField(
                label: '${category.singular} name',
                value: entry.name,
                onChanged: (v) {
                  if (v.trim().isNotEmpty) actions.later('${entry.id}/name', (c) => c.updateEntry(entry.id, name: v));
                },
              ),
              const SizedBox(height: 8),
              SavedTextField(
                label: 'Description',
                hint: 'In a line or two',
                value: entry.summary,
                multiline: true,
                minLines: 3,
                onChanged: (v) => actions.later('${entry.id}/summary', (c) => c.updateEntry(entry.id, summary: v)),
              ),
              for (final (def, field) in view.category)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: TypedInput(
                    key: ValueKey('${entry.id}/${def.id}'),
                    label: def.name,
                    type: def.type ?? FieldType.text,
                    value: field?.value ?? '',
                    options: def.options,
                    entries: [
                      for (final e in at.data.entries)
                        if (e.id != entry.id) e,
                    ],
                    onTyped: (v) => actions.later('${entry.id}/${def.id}', (c) => c.setFieldValue(entry.id, def.id, v)),
                    onChosen: (v) => actions.now((c) => c.setFieldValue(entry.id, def.id, v)),
                  ),
                ),
              const SizedBox(height: 8),
              SavedTextField(
                label: 'Private notes',
                value: entry.notes,
                multiline: true,
                minLines: 2,
                onChanged: (v) => actions.later('${entry.id}/notes', (c) => c.updateEntry(entry.id, notes: v)),
              ),
            ],
            const SizedBox(height: 8),
            Text(
              'This is a record in the Codex under ${category.name}. Its links, canon facts and where the manuscript '
              'mentions it are on its Codex page; fields are added, renamed or removed under “Categories & fields” there.',
              style: _muted(context),
            ),
          ],
        ),
      ),
    );
  }
}

class _BoardTool extends StatelessWidget {
  const _BoardTool({required this.at});
  final ToolContext at;

  @override
  Widget build(BuildContext context) {
    final data = at.data;
    final tool = at.tool;
    final name = str(tool['category']);
    final category = data.category(name);
    final group = data.field(category, str(tool['groupBy']), name);
    if (category == null || group == null) return _Missing('“$name” with a “${str(tool['groupBy'])}” field');
    final entries = data.entriesOf(category);
    final values = [for (final e in entries) data.raw(e, category, group)];
    // A choice field's options in their own order; anything else, the values there are, smallest first.
    final columns = group.type == FieldType.select
        ? [
            ...group.options,
            ...{
              for (final v in values)
                if (v.isNotEmpty && !group.options.contains(v)) v,
            },
          ]
        : ([
            ...{
              for (final v in values)
                if (v.isNotEmpty) v,
            },
          ]..sort((a, b) {
            final x = num.tryParse(a), y = num.tryParse(b);
            final byNumber = x != null && y != null ? x.compareTo(y) : 0;
            return byNumber != 0 ? byNumber : localeCompare(a, b);
          }));
    final shown = [for (final n in strings(tool['show'])) ?data.field(category, n, name)];
    Widget column(String title, String value) {
      final cards = [
        for (final e in entries)
          if (data.raw(e, category, group) == value) e,
      ];
      return Semantics(
        container: true,
        label: title,
        child: Container(
          width: 260,
          margin: const EdgeInsets.only(right: 12),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('$title  ${cards.length}', style: Theme.of(context).textTheme.titleSmall),
              for (final e in cards)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _EntryLink(e),
                        for (final d in shown)
                          if (data.shown(e, category, d).isNotEmpty)
                            Text(
                              '${d.name}: ${data.shown(e, category, d)}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                        const SizedBox(height: 4),
                        _Cell(at: at, entry: e, category: category, def: group, width: 236),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _NewEntry(at: at, category: category),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final v in columns) column(group.type == FieldType.number ? '${group.name} $v' : v, v),
              if (entries.any((e) => data.raw(e, category, group).isEmpty) || columns.isEmpty)
                column('No ${group.name.toLowerCase()} yet', ''),
            ],
          ),
        ),
      ],
    );
  }
}

/// A grid that scrolls sideways when it is wider than the screen: a header row and rows of cells.
class _Grid extends StatelessWidget {
  const _Grid({required this.header, required this.rows});
  final List<Widget> header;
  final List<List<Widget>> rows;

  @override
  Widget build(BuildContext context) {
    final line = BorderSide(color: Theme.of(context).colorScheme.outlineVariant);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Table(
        defaultColumnWidth: const IntrinsicColumnWidth(),
        defaultVerticalAlignment: TableCellVerticalAlignment.middle,
        border: TableBorder(horizontalInside: line),
        children: [
          TableRow(
            children: [
              for (final h in header)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: DefaultTextStyle.merge(
                    style: const TextStyle(fontWeight: FontWeight.w600),
                    child: h,
                  ),
                ),
            ],
          ),
          for (final r in rows)
            TableRow(
              children: [for (final c in r) Padding(padding: const EdgeInsets.all(6), child: c)],
            ),
        ],
      ),
    );
  }
}

class _TableTool extends StatelessWidget {
  const _TableTool({required this.at});
  final ToolContext at;

  @override
  Widget build(BuildContext context) {
    final data = at.data;
    final name = str(at.tool['category']);
    final category = data.category(name);
    final defs = [for (final n in strings(at.tool['fields'])) ?data.field(category, n, name)];
    if (category == null || defs.isEmpty) return _Missing('“$name” and its fields');
    final entries = data.entriesOf(category);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _NewEntry(at: at, category: category),
        const SizedBox(height: 8),
        if (entries.isEmpty)
          Text('Nothing in ${category.name} yet.', style: _muted(context))
        else
          _Grid(
            header: [Text(category.singular), for (final d in defs) Text(d.name)],
            rows: [
              for (final e in entries)
                [_EntryLink(e), for (final d in defs) _Cell(at: at, entry: e, category: category, def: d)],
            ],
          ),
      ],
    );
  }
}

class _MatrixTool extends StatelessWidget {
  const _MatrixTool({required this.at});
  final ToolContext at;

  @override
  Widget build(BuildContext context) {
    final data = at.data;
    final tool = at.tool;
    final rows = data.category(str(tool['rows']));
    final columns = data.category(str(tool['columns']));
    if (rows == null || columns == null) return _Missing('“${str(tool['rows'])}” and “${str(tool['columns'])}”');
    final rowEntries = data.entriesOf(rows);
    final columnEntries = data.entriesOf(columns);
    final toolId = str(tool['id']);
    final cells = {
      for (final r in data.records)
        if (r['kind'] == 'cell' && r['moduleId'] == at.moduleId && r['toolId'] == toolId)
          '${r['rowId']}|${r['colId']}': str(r['state']),
    };
    final values = strings(tool['values']);
    void set(Entry row, Entry column, String value) => moduleChange(
      context,
      _ref(context),
      at.novelId,
      (m) => m.setCell(at.moduleId, toolId, row.id, column.id, value),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _NewEntry(at: at, category: rows),
        if (columns.key != rows.key) ...[const SizedBox(height: 8), _NewEntry(at: at, category: columns)],
        const SizedBox(height: 8),
        if (rowEntries.isEmpty || columnEntries.isEmpty)
          Text(
            'Add at least one ${rows.singular.toLowerCase()} and one ${columns.singular.toLowerCase()} to fill in the '
            'matrix.',
            style: _muted(context),
          )
        else
          _Grid(
            header: [const SizedBox.shrink(), for (final c in columnEntries) _EntryLink(c)],
            rows: [
              for (final r in rowEntries)
                [
                  _EntryLink(r),
                  for (final c in columnEntries)
                    SizedBox(
                      width: 170,
                      child: () {
                        final value = cells['${r.id}|${c.id}'] ?? '';
                        final label = '${r.name} and ${c.name}';
                        if (!at.writes) return Text(value.isEmpty ? '—' : value, semanticsLabel: '$label: $value');
                        return values.isNotEmpty
                            ? _Choice(label: label, value: value, options: values, onChosen: (v) => set(r, c, v))
                            : _Commit(label: label, value: value, hint: '—', onCommit: (v) => set(r, c, v));
                      }(),
                    ),
                ],
            ],
          ),
      ],
    );
  }
}

WidgetRef _ref(BuildContext context) => _RefScope.of(context);

/// Gives the tools below it the page's [WidgetRef], so a tool that is a plain widget can still make a change.
class _RefScope extends InheritedWidget {
  const _RefScope({required this.ref, required super.child});
  final WidgetRef ref;

  static WidgetRef of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<_RefScope>()!.ref;

  @override
  bool updateShouldNotify(_RefScope old) => false;
}

/// Puts the page's [WidgetRef] where the tools can reach it.
class ToolScope extends StatelessWidget {
  const ToolScope({super.key, required this.ref, required this.child});
  final WidgetRef ref;
  final Widget child;

  @override
  Widget build(BuildContext context) => _RefScope(ref: ref, child: child);
}

class _MetersTool extends StatelessWidget {
  const _MetersTool({required this.at});
  final ToolContext at;

  @override
  Widget build(BuildContext context) {
    final data = at.data;
    final name = str(at.tool['category']);
    final category = data.category(name);
    final fields = strings(at.tool['fields']);
    final defs = [for (final n in fields) ?data.field(category, n, name)];
    if (category == null || defs.isEmpty) return _Missing('“$name” with ${fields.join(', ')}');
    final max = numOrNull(at.tool['max']) ?? 10;
    final entries = data.entriesOf(category);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _NewEntry(at: at, category: category),
        const SizedBox(height: 8),
        if (entries.isEmpty) Text('Nothing in ${category.name} yet.', style: _muted(context)),
        for (final e in entries)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _EntryLink(e),
                  for (final d in defs) ...[
                    const SizedBox(height: 6),
                    () {
                      final text = data.raw(e, category, d).trim();
                      final value = num.tryParse(text);
                      final share = value == null || max <= 0 ? 0.0 : (value / max).clamp(0, 1).toDouble();
                      return Wrap(
                        spacing: 12,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          SizedBox(width: 120, child: Text(d.name, style: _muted(context))),
                          Semantics(
                            label: '${d.name} meter for ${e.name}',
                            value: value == null ? 'not set' : '$value of $max',
                            child: SizedBox(width: 160, child: LinearProgressIndicator(value: share, minHeight: 8)),
                          ),
                          _Cell(at: at, entry: e, category: category, def: d, width: 140),
                          Text(
                            '/ ${max is int || max == max.roundToDouble() ? max.round() : max}',
                            style: _muted(context),
                          ),
                        ],
                      );
                    }(),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Values over the course of the story, one line per thing they are about.
class _ArcChart extends StatelessWidget {
  const _ArcChart({
    required this.records,
    required this.data,
    required this.min,
    required this.max,
    required this.label,
  });
  final List<JsonMap> records;
  final ToolData data;
  final num min;
  final num max;
  final String label;

  static const _colours = [
    Color(0xFFB4532A),
    Color(0xFF3D5FA8),
    Color(0xFF3F7D4E),
    Color(0xFF8A63A8),
    Color(0xFFC08A1A),
  ];

  @override
  Widget build(BuildContext context) {
    final points = [
      for (final r in records)
        if (r['value'] is num && r['nodeId'] != null && data.position(strOrNull(r['nodeId'])) < 1 << 52) r,
    ];
    if (points.length < 2) {
      return Text('Give at least two points a chapter and a value to see the line.', style: _muted(context));
    }
    String first(JsonMap r) => strings(r['entryIds']).firstOrNull ?? '';
    final series = [
      ...{for (final r in points) first(r)},
    ];
    final names = [for (final id in series) data.model.entries[id]?.name ?? 'Everything else'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          label: '$label through the story',
          image: true,
          child: SizedBox(
            height: 180,
            child: CustomPaint(
              painter: _ArcPainter(
                lines: [
                  for (final id in series)
                    [
                      for (final r in points)
                        if (first(r) == id) (data.position(strOrNull(r['nodeId'])), (r['value'] as num).toDouble()),
                    ]..sort((a, b) => a.$1.compareTo(b.$1)),
                ],
                last: math.max(1, data.documents.length - 1),
                min: min.toDouble(),
                max: max.toDouble(),
                axis: Theme.of(context).colorScheme.outline,
                colours: _colours,
              ),
            ),
          ),
        ),
        Text(
          '$label from $min to $max, left to right through the chapters'
          '${series.any((s) => s.isNotEmpty) ? ': ${names.join(', ')}' : ''}',
          style: _muted(context),
        ),
        if (series.length > 1)
          Wrap(
            spacing: 12,
            children: [
              for (final (i, n) in names.indexed)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(width: 12, height: 3, color: _colours[i % _colours.length]),
                    const SizedBox(width: 4),
                    Text(n, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
            ],
          ),
      ],
    );
  }
}

class _ArcPainter extends CustomPainter {
  _ArcPainter({
    required this.lines,
    required this.last,
    required this.min,
    required this.max,
    required this.axis,
    required this.colours,
  });
  final List<List<(int, double)>> lines;
  final int last;
  final double min;
  final double max;
  final Color axis;
  final List<Color> colours;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 16.0;
    final axisPaint = Paint()
      ..color = axis
      ..strokeWidth = 1;
    canvas
      ..drawLine(Offset(pad, size.height - pad), Offset(size.width - pad, size.height - pad), axisPaint)
      ..drawLine(const Offset(pad, pad), Offset(pad, size.height - pad), axisPaint);
    Offset at((int, double) p) => Offset(
      pad + p.$1 / last * (size.width - pad * 2),
      size.height - pad - ((p.$2.clamp(min, max) - min) / (max - min == 0 ? 1 : max - min)) * (size.height - pad * 2),
    );
    for (final (i, line) in lines.indexed) {
      final paint = Paint()
        ..color = colours[i % colours.length]
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke;
      final path = Path();
      for (final (j, p) in line.indexed) {
        j == 0 ? path.moveTo(at(p).dx, at(p).dy) : path.lineTo(at(p).dx, at(p).dy);
      }
      canvas.drawPath(path, paint);
      for (final p in line) {
        canvas.drawCircle(at(p), 4, Paint()..color = colours[i % colours.length]);
      }
    }
  }

  @override
  bool shouldRepaint(_ArcPainter old) => true;
}

class _LogTool extends StatefulWidget {
  const _LogTool({required this.at});
  final ToolContext at;

  @override
  State<_LogTool> createState() => _LogToolState();
}

class _LogToolState extends State<_LogTool> {
  final _title = TextEditingController();
  var _chapter = '';

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final at = widget.at;
    final data = at.data;
    final tool = at.tool;
    final toolId = str(tool['id']);
    final states = strings(tool['states']);
    final value = mapOrNull(tool['value']);
    final second = strOrNull(tool['second']);
    final about = strOrNull(tool['about']);
    final candidates = about == null ? data.entries : data.entriesOf(data.category(about));
    final placed = resolveChronology(data.model.events.values, data.model.calendar);
    final records = [
      for (final r in data.records)
        if (r['kind'] == 'log' && r['moduleId'] == at.moduleId && r['toolId'] == toolId) r,
    ];
    // Stable: by chapter, then the order they were added.
    records.sort((a, b) {
      final byPlace = data.position(strOrNull(a['nodeId'])).compareTo(data.position(strOrNull(b['nodeId'])));
      return byPlace != 0 ? byPlace : (numOrNull(a['createdAt']) ?? 0).compareTo(numOrNull(b['createdAt']) ?? 0);
    });
    void change(void Function(ModuleChanges m) apply) => moduleChange(context, _ref(context), at.novelId, apply);
    void add(String name) {
      if (name.trim().isEmpty) return;
      change(
        (m) => m.addRecord(at.moduleId, toolId, {
          'title': name,
          'nodeId': _chapter.isEmpty ? null : _chapter,
          'state': states.firstOrNull ?? '',
        }),
      );
      setState(_title.clear);
    }

    void update(JsonMap record, JsonMap changes) => change((m) => m.updateRecord(str(record['id']), changes));
    final chapterIds = [for (final d in data.documents) d.node.id];
    String chapterName(String id) {
      final d = data.documents.where((d) => d.node.id == id).firstOrNull;
      return d == null ? id : '${'   ' * d.depth}${d.node.title.isEmpty ? 'Untitled' : d.node.title}';
    }

    Widget chapters(String? value, String label, String none, ValueChanged<String?> onPick) => _Choice(
      label: label,
      value: chapterIds.contains(value) ? value! : '',
      options: chapterIds,
      none: none,
      names: chapterName,
      onChosen: (v) => onPick(v.isEmpty ? null : v),
    );
    final suggestions = [
      for (final s in strings(tool['suggestions']))
        if (!records.any((r) => r['title'] == s)) s,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (value != null) ...[
          _ArcChart(
            records: records,
            data: data,
            min: numOrNull(value['min']) ?? 0,
            max: numOrNull(value['max']) ?? 10,
            label: str(value['label'], 'Value'),
          ),
          const SizedBox(height: 12),
        ],
        if (at.writes) ...[
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.end,
            children: [
              SizedBox(
                width: 280,
                child: TextField(
                  controller: _title,
                  decoration: InputDecoration(
                    labelText: 'New entry in ${at.title}',
                    hintText: 'What happens?',
                    isDense: true,
                  ),
                  onChanged: (_) => setState(() {}),
                  onSubmitted: add,
                ),
              ),
              SizedBox(
                width: 240,
                child: chapters(_chapter, 'Chapter for the new entry', 'No chapter yet', (id) => _chapter = id ?? ''),
              ),
              FilledButton.tonal(
                onPressed: _title.text.trim().isEmpty ? null : () => add(_title.text),
                child: const Text('Add'),
              ),
            ],
          ),
          if (suggestions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [for (final s in suggestions) ActionChip(label: Text('+ $s'), onPressed: () => add(s))],
            ),
          ],
          const SizedBox(height: 12),
        ],
        if (records.isEmpty)
          Text('Nothing logged yet.', style: _muted(context))
        else
          for (final r in records)
            Card(
              key: ValueKey(r['id']),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: !at.writes
                    ? _ReadLine(record: r, data: data, second: second)
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              if (tool['checklist'] == true)
                                Checkbox(
                                  value: r['done'] == true,
                                  semanticLabel: '${str(r['title'])} done',
                                  onChanged: (v) => update(r, {'done': v == true}),
                                ),
                              SizedBox(
                                width: 260,
                                child: _Commit(
                                  label: 'Title of ${str(r['title'])}',
                                  value: str(r['title']),
                                  onCommit: (v) => update(r, {'title': v}),
                                ),
                              ),
                              if (states.isNotEmpty)
                                SizedBox(
                                  width: 200,
                                  child: _Choice(
                                    label: 'State of ${str(r['title'])}',
                                    value: str(r['state']),
                                    options: states,
                                    none: null,
                                    onChosen: (v) => update(r, {'state': v}),
                                  ),
                                ),
                              if (value != null)
                                SizedBox(
                                  width: 120,
                                  child: _Commit(
                                    number: true,
                                    label: '${str(value['label'], 'Value')} of ${str(r['title'])}',
                                    value: r['value'] is num ? '${r['value']}' : '',
                                    onCommit: (v) => update(r, {'value': v.trim().isEmpty ? null : num.tryParse(v)}),
                                  ),
                                ),
                              IconButton(
                                tooltip: 'Remove ${str(r['title'])}',
                                icon: const Icon(Icons.close),
                                onPressed: () => change((m) => m.removeRecord(str(r['id']))),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              SizedBox(
                                width: 240,
                                child: chapters(
                                  strOrNull(r['nodeId']),
                                  'Chapter of ${str(r['title'])}',
                                  'No chapter yet',
                                  (id) => update(r, {'nodeId': id}),
                                ),
                              ),
                              if (second != null)
                                SizedBox(
                                  width: 240,
                                  child: chapters(
                                    strOrNull(r['endNodeId']),
                                    '$second: ${str(r['title'])}',
                                    '$second: not yet',
                                    (id) => update(r, {'endNodeId': id}),
                                  ),
                                ),
                              if (candidates.isNotEmpty)
                                SizedBox(
                                  width: 240,
                                  child: _Choice(
                                    label: '${str(r['title'])} is about',
                                    value: strings(r['entryIds']).firstOrNull ?? '',
                                    options: [for (final e in candidates) e.id],
                                    none: 'About…',
                                    names: (id) => data.model.entries[id]?.name ?? id,
                                    onChosen: (v) => update(r, {
                                      'entryIds': v.isEmpty ? <String>[] : [v],
                                    }),
                                  ),
                                ),
                              if (placed.isNotEmpty)
                                SizedBox(
                                  width: 240,
                                  child: _Choice(
                                    label: 'Timeline event of ${str(r['title'])}',
                                    value: placed.any((p) => p.event.id == r['eventId']) ? str(r['eventId']) : '',
                                    options: [for (final p in placed) p.event.id],
                                    none: 'Timeline event…',
                                    names: (id) {
                                      final p = placed.firstWhere((p) => p.event.id == id);
                                      return p.label.isEmpty ? p.event.name : '${p.event.name} (${p.label})';
                                    },
                                    onChosen: (v) => update(r, {'eventId': v.isEmpty ? null : v}),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          _Commit(
                            multiline: true,
                            label: 'Notes on ${str(r['title'])}',
                            hint: 'Notes: what led to it, what it changes',
                            value: str(r['note']),
                            onCommit: (v) => update(r, {'note': v}),
                          ),
                          _LineLinks(record: r, data: data, placed: placed),
                        ],
                      ),
              ),
            ),
      ],
    );
  }
}

/// A line of a log as read in a review copy.
class _ReadLine extends StatelessWidget {
  const _ReadLine({required this.record, required this.data, required this.second});
  final JsonMap record;
  final ToolData data;
  final String? second;

  @override
  Widget build(BuildContext context) {
    final node = data.model.nodes[strOrNull(record['nodeId'])];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          [str(record['title']), if (str(record['state']).isNotEmpty) str(record['state'])].join(' · '),
          style: Theme.of(context).textTheme.titleSmall,
        ),
        if (node != null) Text(node.title, style: _muted(context)),
        if (str(record['note']).isNotEmpty) Text(str(record['note'])),
      ],
    );
  }
}

/// Where a line of a log points: its chapter, its event on the timeline, and what it is about.
class _LineLinks extends ConsumerWidget {
  const _LineLinks({required this.record, required this.data, required this.placed});
  final JsonMap record;
  final ToolData data;
  final List<Placed> placed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final node = data.model.nodes[strOrNull(record['nodeId'])];
    final event = placed.where((p) => p.event.id == record['eventId']).firstOrNull;
    final about = [for (final id in strings(record['entryIds'])) ?data.model.entries[id]];
    if (node == null && event == null && about.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 4,
      children: [
        if (node case final StoryNode n)
          TextButton(
            onPressed: () {
              ref.read(selectedNodeProvider.notifier).select(n.id);
              context.go('/write');
            },
            child: Text('Open ${n.title.isEmpty ? 'Untitled' : n.title}'),
          ),
        if (event != null)
          TextButton(
            onPressed: () => context.go('/plan/event/${event.event.id}'),
            child: const Text('On the timeline'),
          ),
        for (final e in about) TextButton(onPressed: () => _openEntry(context, e), child: Text(e.name)),
      ],
    );
  }
}

class _CalculatorTool extends StatefulWidget {
  const _CalculatorTool({required this.at});
  final ToolContext at;

  @override
  State<_CalculatorTool> createState() => _CalculatorToolState();
}

class _CalculatorToolState extends State<_CalculatorTool> {
  late final Map<String, String> _values = {
    for (final i in maps(widget.at.tool['inputs'])) str(i['key']).toLowerCase(): '${numOrNull(i['value']) ?? 0}',
  };

  @override
  Widget build(BuildContext context) {
    final scope = FormulaScope(
      value: (name) =>
          _values.containsKey(name.toLowerCase()) ? (double.tryParse(_values[name.toLowerCase()]!) ?? 0.0) : null,
      holds: (_, _) => null,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final i in maps(widget.at.tool['inputs']))
              SizedBox(
                width: 240,
                child: TextFormField(
                  initialValue: _values[str(i['key']).toLowerCase()],
                  decoration: InputDecoration(labelText: '${str(i['label'])} (${str(i['unit'])})', isDense: true),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  onChanged: (v) => setState(() => _values[str(i['key']).toLowerCase()] = v),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Semantics(
          container: true,
          label: 'Results',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final o in maps(widget.at.tool['outputs']))
                ListTile(
                  dense: true,
                  title: Text(str(o['label'])),
                  trailing: Text(() {
                    try {
                      final v = evaluateFormula(parseFormula(str(o['formula'])), scope);
                      return v is num ? '${formatNumber(v.toDouble())} ${str(o['unit'])}' : jsString(v);
                    } on FormulaError catch (e) {
                      return e.message;
                    } catch (_) {
                      return 'Cannot be worked out';
                    }
                  }(), style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

List<ProgressSnapshot> _snapshots(ToolData data) => [
  for (final r in data.snapshot.rows('progressSnapshots')) ProgressSnapshot(r),
];

List<Entry> _tracked(ToolData data, List<ProgressSnapshot> snapshots) => [
  for (final e in data.entries)
    if (snapshots.any((s) => s.entryId == e.id)) e,
]..sort((a, b) => localeCompare(a.name, b.name));

/// Each tracked character's level or realm, snapshot by snapshot.
class _RanksTool extends StatelessWidget {
  const _RanksTool({required this.at});
  final ToolContext at;

  @override
  Widget build(BuildContext context) {
    final data = at.data;
    final snapshots = _snapshots(data);
    final tracked = _tracked(data, snapshots);
    final nodes = [...data.model.nodes.values];
    if (tracked.isEmpty) {
      return const _Empty(
        text:
            'No progression snapshots yet. Log how a character changes on their profile, and their climb appears here.',
        action: 'Open the cast',
        path: '/organize',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final e in tracked)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _EntryLink(e),
                  for (final s in inStoryOrder(snapshots, nodes, e.id))
                    Text(
                      '${placeOfSnapshot(s, nodes)}: ${[for (final b in data.model.systems.values)
                        if (s.systems[b.id] != null)
                          for (final t in resolveSystem(b, s.systems[b.id]).tracks) '${t.track.name} ${t.label.replaceFirst(RegExp(r' of \d+$'), '')}'].join(' · ').ifEmpty(s.label.isEmpty ? 'No system' : s.label)}',
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text, required this.action, required this.path});
  final String text;
  final String action;
  final String path;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(text, style: _muted(context)),
      TextButton(onPressed: () => context.go(path), child: Text(action)),
    ],
  );
}

/// What a character carries at a point in the story.
class _InventoryTool extends StatefulWidget {
  const _InventoryTool({required this.at});
  final ToolContext at;

  @override
  State<_InventoryTool> createState() => _InventoryToolState();
}

class _InventoryToolState extends State<_InventoryTool> {
  var _who = '';
  var _at = '';

  @override
  Widget build(BuildContext context) {
    final data = widget.at.data;
    final snapshots = _snapshots(data);
    final tracked = _tracked(data, snapshots);
    final nodes = [...data.model.nodes.values];
    if (tracked.isEmpty) {
      return const _Empty(
        text: 'No progression snapshots yet. Log a character’s gear on their profile, and it appears here.',
        action: 'Open the cast',
        path: '/organize',
      );
    }
    final entry = tracked.where((e) => e.id == _who).firstOrNull ?? tracked.first;
    final chapterIds = [for (final d in data.documents) d.node.id];
    final state = stateAt(snapshots, nodes, entry.id, chapterIds.contains(_at) ? _at : null);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            SizedBox(
              width: 240,
              child: _Choice(
                label: 'Inventory of',
                value: entry.id,
                options: [for (final e in tracked) e.id],
                none: null,
                names: (id) => data.model.entries[id]?.name ?? id,
                onChosen: (v) => setState(() => _who = v),
              ),
            ),
            SizedBox(
              width: 260,
              child: _Choice(
                label: 'Inventory as of',
                value: _at,
                options: chapterIds,
                none: 'At the end of the story',
                names: (id) => 'As of ${data.model.nodes[id]?.title ?? id}',
                onChosen: (v) => setState(() => _at = v),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (state == null)
          Text('Nothing logged for ${entry.name} by then.', style: _muted(context))
        else if (state.gear.isEmpty)
          Text('${entry.name} carries nothing at ${placeOfSnapshot(state, nodes)}.', style: _muted(context))
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final g in state.gear)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (data.model.entries[g.entryId] case final Entry e) _EntryLink(e) else Text(g.name),
                        if (g.kind.isNotEmpty) Text(g.kind, style: _muted(context)),
                        if (g.note.isNotEmpty) Text(g.note),
                      ],
                    ),
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

/// A family tree, drawn from the family relationships kept in Relationships.
class _LineageTool extends StatelessWidget {
  const _LineageTool({required this.at});
  final ToolContext at;

  @override
  Widget build(BuildContext context) {
    final data = at.data;
    final people = {
      for (final e in data.entries)
        if (e.category == 'character') e.id: e,
    };
    final rows = buildLineage([...data.model.relations.values], data.model.order, people.containsKey);
    String names(List<String> ids) => [for (final id in ids) ?people[id]?.name].join(', ');
    if (rows.isEmpty) {
      return const _Empty(
        text:
            'No family relationships yet. Record who is whose parent, sibling or spouse in Relationships and the tree '
            'is drawn from them.',
        action: 'Open Relationships',
        path: '/visualize',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, row) in rows.indexed) ...[
          Text('Generation ${i + 1}', style: Theme.of(context).textTheme.titleSmall),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final kin in [...row]..sort((a, b) => localeCompare(people[a.id]!.name, people[b.id]!.name)))
                SizedBox(
                  width: 260,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _EntryLink(people[kin.id]!),
                          if (kin.parents.isNotEmpty) Text('Child of ${names(kin.parents)}'),
                          if (kin.partners.isNotEmpty) Text('Married to ${names(kin.partners)}'),
                          if (kin.siblings.isNotEmpty) Text('Sibling of ${names(kin.siblings)}'),
                          if (kin.children.isNotEmpty) Text('Parent of ${names(kin.children)}'),
                          if (kin.relatives.isNotEmpty) Text('Related to ${names(kin.relatives)}'),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        Text(
          'Read from the relationships as they stand at the end of the story. To change the tree, change a '
          'relationship in Relationships.',
          style: _muted(context),
        ),
      ],
    );
  }
}

class _PageTool extends StatelessWidget {
  const _PageTool({required this.at});
  final ToolContext at;

  @override
  Widget build(BuildContext context) {
    final path = corePagePath(str(at.tool['to']));
    return Align(
      alignment: Alignment.centerLeft,
      child: path == null
          ? Text('That page is not in this version of the app.', style: _muted(context))
          : FilledButton(onPressed: () => context.go(path), child: Text('Open ${at.title}')),
    );
  }
}
