import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/modules/module_changes.dart';
import '../../shared/domain/modules/module_defs.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../characters/character_actions.dart' show entryPath;
import '../workspace/open_novel.dart';
import '../workspace/organize_switch.dart';
import '../workspace/section_page.dart';
import 'module_service.dart';
import 'module_tools.dart';

/// One module's workspace: its dashboard and its tools. When the module is off, it says so and keeps its data.
class ModulePage extends ConsumerStatefulWidget {
  const ModulePage({super.key, required this.moduleId, this.toolId, this.recordId});
  final String moduleId;
  final String? toolId;
  final String? recordId;

  @override
  ConsumerState<ModulePage> createState() => _ModulePageState();
}

class _ModulePageState extends ConsumerState<ModulePage> {
  late final NovelStore _store = ref.read(novelStoreProvider);

  @override
  void initState() {
    super.initState();
    _store.addListener(_changed);
  }

  @override
  void dispose() {
    _store.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const SectionPage(destination: Destination.organize);
    final snapshot = ref.read(moduleServiceProvider).read(novelId);
    if (snapshot == null) return const SectionPage(destination: Destination.organize);
    final writes = canChangeModules(ref);
    final read = ModuleChanges(snapshot, now: 0, createId: () => throw StateError('reading'));
    final row = read.rowFor(widget.moduleId);
    final back = TextButton.icon(
      onPressed: () => context.go(modulesPath),
      icon: const Icon(Icons.arrow_back),
      label: const Text('All modules'),
    );
    if (row == null) {
      return PageScaffold(
        title: 'Module not installed',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [const Text('This novel does not use that module.'), back],
        ),
      );
    }
    final module = ModuleDefinition(mapOrNull(row['definition'])!);
    if (row['enabled'] != true) {
      return PageScaffold(
        title: module.name,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This module is switched off, so its tools are hidden. Everything made with it is still stored.',
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                if (writes)
                  FilledButton(
                    onPressed: () => moduleChange(context, ref, novelId, (m) => m.enable(module)),
                    child: const Text('Turn it on'),
                  ),
                back,
              ],
            ),
          ],
        ),
      );
    }
    final settings = settingsOf(row['settings']);
    final tools = arrangedTools(module, row['settings']);
    final tool = tools.where((t) => t['id'] == widget.toolId).firstOrNull;
    final data = ToolData(novelId, snapshot, bindingsOf(row['bindings']));
    final starter = module.system != null && !snapshot.rows('systems').any((s) => s['id'] == row['systemId']) && writes;
    final muted = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    void open(String? toolId) => context.go(modulePath(module.id, tool: toolId));

    return PageScaffold(
      title: '${module.icon.isEmpty ? '' : '${module.icon} '}${settings.nav ?? module.nav}',
      subtitle: module.description,
      actions: [
        if (writes)
          OutlinedButton.icon(
            onPressed: () => showDialog<void>(
              context: context,
              builder: (_) => ConfigureModule(novelId: novelId, moduleId: module.id),
            ),
            icon: const Icon(Icons.tune),
            label: const Text('Configure'),
          ),
        back,
      ],
      child: ToolScope(
        ref: ref,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Align(
              alignment: Alignment.centerLeft,
              child: OrganizeSwitch(current: OrganizePart.modules),
            ),
            const SizedBox(height: 12),
            if (starter) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        'This module comes with an example system, “${str(module.system!['name'])}”, to reshape or learn '
                        'from. It is not added unless you ask: it contains sample classes and skills, and your story '
                        'may want none of them.',
                      ),
                      OutlinedButton(
                        onPressed: () => moduleChange(context, ref, novelId, (m) => m.addStarterSystem(module.id)),
                        child: const Text('Add the example system'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            Semantics(
              container: true,
              label: '${module.name} tools',
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  ChoiceChip(label: const Text('Dashboard'), selected: tool == null, onSelected: (_) => open(null)),
                  for (final t in tools)
                    ChoiceChip(
                      label: Text(str(t['title'])),
                      selected: t['id'] == tool?['id'],
                      onSelected: (_) => open(str(t['id'])),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (tool != null) ...[
              Semantics(header: true, child: Text(str(tool['title']), style: Theme.of(context).textTheme.titleLarge)),
              if (str(tool['hint']).isNotEmpty) Text(str(tool['hint']), style: muted),
              const SizedBox(height: 12),
              ToolView(
                key: ValueKey('${module.id}:${tool['id']}'),
                at: ToolContext(moduleId: module.id, tool: tool, data: data, writes: writes),
                record: widget.recordId,
              ),
            ] else
              _Dashboard(module: module, tools: tools, data: data),
          ],
        ),
      ),
    );
  }
}

String? _categoryOf(JsonMap tool) =>
    const {'registry', 'board', 'table', 'meters'}.contains(tool['type']) ? str(tool['category']) : null;

/// A module's front page: how much there is of each kind of record, what was touched last, and which records are still
/// empty. Every number is counted from the novel as it is; each one opens the list it counts.
class _Dashboard extends StatelessWidget {
  const _Dashboard({required this.module, required this.tools, required this.data});
  final ModuleDefinition module;
  final List<JsonMap> tools;
  final ToolData data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    // One tile per category the module works on: the first tool that lists it is where the tile leads.
    final lists = <({JsonMap tool, Category category, List<Entry> entries})>[];
    for (final tool in tools) {
      final category = data.category(_categoryOf(tool) ?? '');
      if (category != null && !lists.any((l) => l.category.key == category.key)) {
        lists.add((tool: tool, category: category, entries: data.entriesOf(category)));
      }
    }
    final logs = [
      for (final tool in tools)
        if (tool['type'] == 'log' || tool['type'] == 'matrix')
          (
            tool: tool,
            count: data.records.where((r) => r['moduleId'] == module.id && r['toolId'] == tool['id']).length,
          ),
    ];
    // "Its own" records: those in categories the module brings, not the built-in ones it only adds fields to.
    final own = {
      for (final c in module.categories)
        if (c['builtin'] != true) ?data.category(str(c['name']))?.key,
    };
    final mine = [
      for (final l in lists)
        if (own.contains(l.category.key)) l,
    ];
    final recent = [
      for (final l in mine)
        for (final e in l.entries) (entry: e, list: l),
    ]..sort((a, b) => b.entry.updatedAt.compareTo(a.entry.updatedAt));
    final empty = [
      for (final l in mine)
        for (final e in l.entries)
          if (e.summary.trim().isEmpty &&
              e.description.trim().isEmpty &&
              !e.fields.any((f) => f.value.trim().isNotEmpty))
            (entry: e, list: l),
    ];
    void openTool(String toolId, [String? record]) => context.go(modulePath(module.id, tool: toolId, record: record));
    Widget row(({Entry entry, ({JsonMap tool, Category category, List<Entry> entries}) list}) r) => ListTile(
      dense: true,
      title: Text(r.entry.name.isEmpty ? 'Untitled' : r.entry.name),
      subtitle: Text(r.list.category.singular),
      onTap: () => r.list.tool['type'] == 'registry'
          ? openTool(str(r.list.tool['id']), r.entry.id)
          : context.go(entryPath(r.entry.id, character: r.entry.category == 'character')),
    );
    Widget tile(String label, int count, String name, VoidCallback onTap) => Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: SizedBox(
        width: 170,
        child: Card(
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$count', style: theme.textTheme.headlineSmall),
                  Text(name),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final l in lists)
              tile(
                '${l.entries.length} ${l.category.name}: open ${str(l.tool['title'])}',
                l.entries.length,
                l.category.name,
                () => openTool(str(l.tool['id'])),
              ),
            for (final l in logs)
              if (l.count > 0)
                tile(
                  '${l.count} in ${str(l.tool['title'])}: open it',
                  l.count,
                  str(l.tool['title']),
                  () => openTool(str(l.tool['id'])),
                ),
          ],
        ),
        if (lists.every((l) => l.entries.isEmpty) && logs.every((l) => l.count == 0)) ...[
          const SizedBox(height: 8),
          Text(
            'Nothing here yet. Turning the module on creates no records: your world is yours to make. Open any of its '
            'tools above to add the first one.',
            style: muted,
          ),
        ],
        if (recent.isNotEmpty) ...[
          const SizedBox(height: 16),
          Semantics(header: true, child: Text('Recently changed', style: theme.textTheme.titleMedium)),
          for (final r in recent.take(6)) row(r),
        ],
        if (empty.isNotEmpty) ...[
          const SizedBox(height: 16),
          Semantics(header: true, child: Text('Still empty  ${empty.length}', style: theme.textTheme.titleMedium)),
          Text('Records with a name and nothing else written.', style: muted),
          for (final r in empty.take(8)) row(r),
        ],
        if (module.integrates.isNotEmpty) ...[],
      ],
    );
  }
}

/// How a module is arranged in this novel: what it is called, which tools show and in what order, what each is called,
/// and the stages a log steps through. Its categories and their fields are shaped where every category is.
class ConfigureModule extends ConsumerStatefulWidget {
  const ConfigureModule({super.key, required this.novelId, required this.moduleId});
  final String novelId;
  final String moduleId;

  @override
  ConsumerState<ConfigureModule> createState() => _ConfigureModuleState();
}

class _ConfigureModuleState extends ConsumerState<ConfigureModule> {
  late final NovelStore _store = ref.read(novelStoreProvider);

  @override
  void initState() {
    super.initState();
    _store.addListener(_changed);
  }

  @override
  void dispose() {
    _store.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void _save(JsonMap Function(JsonMap s) change) =>
      moduleChange(context, ref, widget.novelId, (m) => m.configure(widget.moduleId, change));

  @override
  Widget build(BuildContext context) {
    final snapshot = ref.read(moduleServiceProvider).read(widget.novelId);
    final read = snapshot == null ? null : ModuleChanges(snapshot, now: 0, createId: () => throw StateError('reading'));
    final row = read?.rowFor(widget.moduleId);
    if (read == null || row == null) return const SizedBox.shrink();
    final module = ModuleDefinition(mapOrNull(row['definition'])!);
    final settings = mapOrNull(row['settings']) ?? const <String, Object?>{};
    final order = strings(settings['order']);
    int at(String id) =>
        order.contains(id) ? order.indexOf(id) : order.length + module.tools.indexWhere((t) => t['id'] == id);
    final tools = [...module.tools]..sort((a, b) => at(str(a['id'])).compareTo(at(str(b['id']))));
    final hidden = strings(settings['hidden']);
    final titles = mapOrNull(settings['titles']) ?? const {};
    final states = mapOrNull(settings['states']) ?? const {};
    void move(String id, int by) {
      final ids = [for (final t in tools) str(t['id'])];
      final from = ids.indexOf(id);
      final to = from + by;
      if (to < 0 || to >= ids.length) return;
      ids[from] = ids[to];
      ids[to] = id;
      _save((s) => {...s, 'order': ids});
    }

    final categories = read.categories();
    final bindings = bindingsOf(row['bindings']);
    final own = <Category>[
      for (final c in module.categories)
        ?(resolveCategory(c['builtin'] == true ? str(c['key']) : str(c['name']), categories, bindings) ??
            categories.where((x) => c['builtin'] == true && x.key == c['key']).firstOrNull),
    ];
    return AlertDialog(
      title: Text('Configure ${module.name}'),
      scrollable: true,
      content: SizedBox(
        width: 560,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Typed(
              label: 'Name in the menus',
              value: str(settings['nav'], module.nav),
              onDone: (v) => _save((s) => {...s, 'nav': v.trim() == module.nav ? '' : v}),
            ),
            const SizedBox(height: 16),
            Text('Tools: show, name and order', style: Theme.of(context).textTheme.titleSmall),
            for (final (i, t) in tools.indexed)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Checkbox(
                      value: !hidden.contains(t['id']),
                      semanticLabel: 'Show ${str(t['title'])}',
                      onChanged: (shown) => _save(
                        (s) => {
                          ...s,
                          'hidden': shown == true
                              ? [
                                  for (final id in strings(s['hidden']))
                                    if (id != t['id']) id,
                                ]
                              : [...strings(s['hidden']), str(t['id'])],
                        },
                      ),
                    ),
                    SizedBox(
                      width: 240,
                      child: _Typed(
                        label: 'Name of ${str(t['title'])}',
                        value: str(titles[t['id']], str(t['title'])),
                        onDone: (v) => _save(
                          (s) => {
                            ...s,
                            'titles': {...?mapOrNull(s['titles']), str(t['id']): v.trim() == t['title'] ? '' : v},
                          },
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Move ${str(t['title'])} up',
                      onPressed: i == 0 ? null : () => move(str(t['id']), -1),
                      icon: const Icon(Icons.arrow_upward),
                    ),
                    IconButton(
                      tooltip: 'Move ${str(t['title'])} down',
                      onPressed: i == tools.length - 1 ? null : () => move(str(t['id']), 1),
                      icon: const Icon(Icons.arrow_downward),
                    ),
                    if (t['type'] == 'log' && strings(t['states']).isNotEmpty)
                      SizedBox(
                        width: 320,
                        child: _Typed(
                          label: 'Stages of ${str(t['title'])}',
                          hint: 'Stages, separated by commas',
                          value: (strings(states[t['id']]).isEmpty ? strings(t['states']) : strings(states[t['id']]))
                              .join(', '),
                          onDone: (v) {
                            final list = [
                              for (final x in v.split(','))
                                if (x.trim().isNotEmpty) x.trim(),
                            ];
                            _save(
                              (s) => {
                                ...s,
                                'states': {
                                  ...?mapOrNull(s['states']),
                                  str(t['id']): list.join('|') == strings(t['states']).join('|') ? <String>[] : list,
                                },
                              },
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 16),
            Text('Categories & fields', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final c in own)
                  OutlinedButton(
                    onPressed: () {
                      Navigator.of(context).pop();
                      context.go(Uri(path: '/organize/world/kinds', queryParameters: {'kind': c.key}).toString());
                    },
                    child: Text('${c.name}…'),
                  ),
              ],
            ),
          ],
        ),
      ),
      actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done'))],
    );
  }
}

/// A text box saved when the author is done with it.
class _Typed extends StatefulWidget {
  const _Typed({required this.label, required this.value, required this.onDone, this.hint});
  final String label;
  final String value;
  final String? hint;
  final ValueChanged<String> onDone;

  @override
  State<_Typed> createState() => _TypedState();
}

class _TypedState extends State<_Typed> {
  late final _text = TextEditingController(text: widget.value);
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (!_focus.hasFocus) _done();
    });
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _done() {
    if (_text.text != widget.value) widget.onDone(_text.text);
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _text,
    focusNode: _focus,
    decoration: InputDecoration(labelText: widget.label, hintText: widget.hint, isDense: true),
    onSubmitted: (_) => _done(),
  );
}
