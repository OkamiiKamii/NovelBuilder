import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/module_library.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/codex/codex_changes.dart' show ChangeRefused;
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/modules/module_changes.dart';
import '../../shared/domain/modules/module_defs.dart';
import '../../shared/domain/records/category.dart';
import '../workspace/open_novel.dart';
import '../workspace/organize_switch.dart';
import '../workspace/section_page.dart';
import 'module_page.dart' show ConfigureModule;
import 'module_service.dart';

String _safe(String s) => s.trim().replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1F]'), '').replaceAll(RegExp(r'\s+'), ' ');

/// MODULE MANAGER: every module that can be switched on for this novel, where each stands (available, enabled,
/// disabled, needing attention), what it shares with the others, and the author's own. Switching one on creates no
/// records; switching one off deletes none.
class ModulesPage extends ConsumerStatefulWidget {
  const ModulesPage({super.key});

  @override
  ConsumerState<ModulesPage> createState() => _ModulesPageState();
}

enum _Show {
  all('All'),
  on('Enabled'),
  off('Not enabled');

  const _Show(this.label);
  final String label;
}

class _ModulesPageState extends ConsumerState<ModulesPage> {
  late final NovelStore _store = ref.read(novelStoreProvider);
  var _show = _Show.all;
  final _name = TextEditingController();
  final _genre = TextEditingController();
  final _description = TextEditingController();
  final _picked = <String>[];
  String? _systemId;

  @override
  void initState() {
    super.initState();
    _store.addListener(_changed);
  }

  @override
  void dispose() {
    _store.removeListener(_changed);
    _name.dispose();
    _genre.dispose();
    _description.dispose();
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void _tell(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 6)));

  Future<void> _export(ModuleDefinition module) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    final name = _safe(module.name).isEmpty ? 'Module' : _safe(module.name);
    final text = const JsonEncoder.withIndent('  ').convert(moduleFile(module));
    final result = await ref
        .read(backupFilesProvider)
        .saveFile('$name.module.json', Uint8List.fromList(utf8.encode(text)), kind: FileKind.json, origin: origin);
    if (result != null && mounted) _tell('$result: “${module.name}”. Only its categories, fields, tools and rules.');
  }

  Future<void> _import() async {
    final picked = await ref.read(backupFilesProvider).pickBackup();
    if (picked == null || !mounted) return;
    final ModuleDefinition definition;
    try {
      definition = readModuleFile(jsonDecode(picked.text), newId: newId);
    } on FormatException {
      _tell('“${picked.name}” is not a module. Nothing was added.');
      return;
    }
    ref.read(availableModulesProvider.notifier).save(definition);
    _tell('${definition.name} was added to your modules. Switch it on to use it here.');
  }

  @override
  Widget build(BuildContext context) {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const SectionPage(destination: Destination.organize);
    final snapshot = ref.read(moduleServiceProvider).read(novelId);
    if (snapshot == null) return const SectionPage(destination: Destination.organize);
    final writes = canChangeModules(ref);
    final library = ref.watch(availableModulesProvider);
    final read = ModuleChanges(snapshot, now: 0, createId: () => throw StateError('reading'));
    final installed = read.installed();
    final status = {for (final s in read.status(library)) s.module.id: s};
    final mine = [
      for (final m in library)
        if (!m.builtin) m,
    ];
    // Modules installed here whose definition is not in this device's library (the novel came from elsewhere).
    final foreign = [
      for (final r in installed)
        if (mapOrNull(r['definition'])?['builtin'] != true && !mine.any((m) => m.id == r['moduleId']))
          ModuleDefinition(mapOrNull(r['definition'])!),
    ];
    bool isOn(String id) => installed.any((r) => r['moduleId'] == id && r['enabled'] == true);
    final on = installed.where((r) => r['enabled'] == true).length;
    bool visible(ModuleDefinition m) => _show == _Show.all || (_show == _Show.on) == isOn(m.id);
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);

    void toggle(ModuleDefinition module) {
      final turningOn = !isOn(module.id);
      final sharing = [
        for (final x
            in status[module.id]?.shares ??
                const <({String moduleId, String name, bool enabled, List<String> categories})>[])
          if (x.enabled) x,
      ];
      final done = moduleChange(context, ref, novelId, (m) {
        if (turningOn) {
          m.enable(
            mine.where((d) => d.id == module.id).firstOrNull ??
                library.where((d) => d.id == module.id).firstOrNull ??
                module,
          );
        } else {
          m.disable(module.id);
        }
        return true;
      });
      if (done != true) return;
      _tell(
        turningOn
            ? '${module.name} is on. Its workspace is under Organize › Modules and its categories are in the Codex. '
                  'Nothing was created: its records are yours to make.'
            : '${module.name} is off. Its tools are hidden; everything made with it is kept.'
                  '${sharing.isEmpty ? '' : ' ${[for (final x in sharing) '${x.categories.join(', ')} ${x.categories.length == 1 ? 'stays' : 'stay'} in use by ${x.name}'].join('; ')}.'}',
      );
    }

    Widget card(ModuleDefinition listed, {required bool owned}) {
      final at = status[listed.id];
      // What this novel has installed is what its card describes; a module not installed is described as it comes.
      final module = at?.module ?? listed;
      final state = at?.state ?? ModuleState.available;
      final isEnabled = state == ModuleState.enabled || state == ModuleState.attention;
      final adds = [
        for (final c in module.categories)
          c['builtin'] == true
              ? '${maps(c['fields']).length} ${maps(c['fields']).length == 1 ? 'field' : 'fields'} on ${Category.builtin(str(c['key'])).name}'
              : str(c['name']),
      ];
      return Card(
        key: ValueKey('module:${module.id}'),
        color: isEnabled ? theme.colorScheme.secondaryContainer.withValues(alpha: 0.35) : null,
        child: Semantics(
          container: true,
          label: module.name,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (module.icon.isNotEmpty)
                      ExcludeSemantics(child: Text(module.icon, style: theme.textTheme.titleLarge)),
                    Text(module.name, style: theme.textTheme.titleMedium),
                    if (!module.builtin) const Chip(label: Text('Yours'), visualDensity: VisualDensity.compact),
                    Chip(
                      label: Text(state.label),
                      visualDensity: VisualDensity.compact,
                      avatar: Icon(switch (state) {
                        ModuleState.enabled => Icons.check_circle_outline,
                        ModuleState.attention => Icons.warning_amber_outlined,
                        ModuleState.disabled => Icons.pause_circle_outline,
                        ModuleState.available => Icons.add_circle_outline,
                      }, size: 18),
                    ),
                  ],
                ),
                if (module.genre.isNotEmpty) Text(module.genre, style: muted),
                const SizedBox(height: 4),
                Text(module.description),
                if (module.features.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Semantics(
                    label: 'What ${module.name} does',
                    container: true,
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final f in module.features) Chip(label: Text(f), visualDensity: VisualDensity.compact),
                      ],
                    ),
                  ),
                ],
                for (final reason in at?.reasons ?? const <String>[])
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline, size: 18, color: theme.colorScheme.tertiary),
                        const SizedBox(width: 6),
                        Expanded(child: Text(reason)),
                      ],
                    ),
                  ),
                ExpansionTile(
                  title: const Text('Details'),
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(bottom: 8),
                  expandedCrossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (adds.isNotEmpty) Text('Adds to the Codex: ${adds.join(', ')}.'),
                    if (module.tools.isNotEmpty)
                      Text('Tools: ${[for (final t in module.tools) str(t['title'])].join(', ')}.'),
                    if (module.integrates.isNotEmpty) Text('Works with: ${module.integrates.join(', ')}.'),
                    if (module.system != null)
                      Text(
                        'Offers an example system, “${str(module.system!['name'])}”. It is added only if you ask for it.',
                      ),
                    Text(
                      at != null && at.shares.isNotEmpty
                          ? 'Shares records with: ${[for (final x in at.shares) '${x.name} (${x.categories.join(', ')})'].join('; ')}. '
                                'Switching either off leaves them in place for the other.'
                          : 'Depends on no other module.',
                    ),
                    Text(
                      'Version ${module.version}'
                      '${at?.installed != null && at!.installed != listed.version ? ' installed · version ${listed.version} available' : ''}'
                      ' · ${module.builtin ? 'built in' : 'made by an author'} · works with this version of the app',
                      style: muted,
                    ),
                  ],
                ),
                if (at != null && (at.entries > 0 || at.records > 0))
                  Text(
                    'In use here: ${at.entries} ${at.entries == 1 ? 'record' : 'records'} in its categories, '
                    '${at.records} in its logs and tables.',
                  ),
                if (state == ModuleState.disabled)
                  Text(
                    'Switched off here. What was made with it is kept and comes back when it is enabled.',
                    style: muted,
                  ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (isEnabled)
                      FilledButton(
                        onPressed: () => context.go(modulePath(module.id)),
                        child: const Text('Open module'),
                      ),
                    if (isEnabled && writes)
                      OutlinedButton(
                        onPressed: () => showDialog<void>(
                          context: context,
                          builder: (_) => ConfigureModule(novelId: novelId, moduleId: module.id),
                        ),
                        child: Text('Configure', semanticsLabel: 'Configure ${module.name}'),
                      ),
                    if (at?.updatable == true && writes)
                      OutlinedButton(
                        onPressed: () {
                          final latest = library.where((d) => d.id == module.id).firstOrNull ?? module;
                          if (moduleChange(context, ref, novelId, (m) => m.enable(latest)) != null) {
                            _tell('${module.name} was updated. Only fields and tools were added.');
                          }
                        },
                        child: Text('Update', semanticsLabel: 'Update ${module.name}'),
                      ),
                    if (writes)
                      isEnabled
                          ? OutlinedButton(
                              onPressed: () => toggle(module),
                              child: Text('Disable', semanticsLabel: 'Disable ${module.name}'),
                            )
                          : FilledButton.tonal(
                              onPressed: () => toggle(module),
                              child: Text(
                                state == ModuleState.disabled ? 'Enable module again' : 'Enable module',
                                semanticsLabel: 'Enable ${module.name}',
                              ),
                            ),
                    if (!module.builtin) OutlinedButton(onPressed: () => _export(module), child: const Text('Export')),
                    if (owned)
                      TextButton(
                        onPressed: () {
                          ref.read(availableModulesProvider.notifier).remove(module.id);
                          _tell('${module.name} was removed from your modules. Novels that use it keep it.');
                        },
                        child: Text('Remove from my modules', semanticsLabel: 'Remove ${module.name} from my modules'),
                      ),
                    if (!module.builtin && !owned)
                      TextButton(
                        onPressed: () {
                          ref.read(availableModulesProvider.notifier).save(module);
                          _tell('${module.name} was added to your modules.');
                        },
                        child: const Text('Add to my modules'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    }

    Widget grid(List<Widget> cards) => LayoutBuilder(
      builder: (context, box) {
        final columns = box.maxWidth >= 1100 ? 3 : (box.maxWidth >= 720 ? 2 : 1);
        final width = (box.maxWidth - (columns - 1) * 12) / columns;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [for (final c in cards) SizedBox(width: width, child: c)],
        );
      },
    );

    final categories = read.categories();
    final packable = [
      for (final c in categories)
        if (!c.archived && c.fields.any((f) => !f.archived)) c,
    ];
    final systems = snapshot.rows('systems');

    return PageScaffold(
      title: 'Module Manager',
      subtitle: on == 0 ? 'No modules on: just the core' : '$on ${on == 1 ? 'module' : 'modules'} on in this novel',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: OrganizeSwitch(current: OrganizePart.modules),
          ),
          const SizedBox(height: 16),
          Semantics(header: true, child: Text('Genre modules', style: theme.textTheme.titleLarge)),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SegmentedButton<_Show>(
                segments: [for (final s in _Show.values) ButtonSegment(value: s, label: Text(s.label))],
                selected: {_show},
                showSelectedIcon: false,
                onSelectionChanged: (v) => setState(() => _show = v.first),
              ),
            ),
          ),
          const SizedBox(height: 12),
          grid([
            for (final m in builtinModules)
              if (visible(m)) card(m, owned: false),
          ]),
          const SizedBox(height: 24),
          Semantics(header: true, child: Text('Your modules', style: theme.textTheme.titleLarge)),
          const SizedBox(height: 8),
          if (mine.isEmpty && foreign.isEmpty)
            Text('None yet. Make one from this novel below, or import one someone has shared.', style: muted)
          else
            grid([for (final m in mine) card(m, owned: true), for (final m in foreign) card(m, owned: false)]),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: _import,
              icon: const Icon(Icons.file_open_outlined),
              label: const Text('Import a module…'),
            ),
          ),
          if (writes) ...[
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Semantics(
                      header: true,
                      child: Text('Make a module from this novel', style: theme.textTheme.titleMedium),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _name,
                      decoration: const InputDecoration(
                        labelText: 'Module name',
                        hintText: 'Superhero / Urban Fantasy',
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _genre,
                      decoration: const InputDecoration(
                        labelText: 'Module is for',
                        hintText: 'Capes, masks and secret identities',
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _description,
                      decoration: const InputDecoration(labelText: 'Module description'),
                    ),
                    const SizedBox(height: 12),
                    Text('Categories and their fields', style: theme.textTheme.titleSmall),
                    for (final c in packable)
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: _picked.contains(c.key),
                        title: Text(c.name),
                        subtitle: Text(
                          [
                            for (final f in c.fields)
                              if (!f.archived) f.name,
                          ].join(', '),
                        ),
                        onChanged: (v) => setState(() => v == true ? _picked.add(c.key) : _picked.remove(c.key)),
                      ),
                    if (systems.isNotEmpty)
                      DropdownButtonFormField<String>(
                        initialValue: _systemId ?? '',
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'System rules'),
                        items: [
                          const DropdownMenuItem(value: '', child: Text('No system')),
                          for (final s in systems)
                            DropdownMenuItem(
                              value: str(s['id']),
                              child: Text(str(s['name'], 'Untitled system'), overflow: TextOverflow.ellipsis),
                            ),
                        ],
                        onChanged: (v) => setState(() => _systemId = v == null || v.isEmpty ? null : v),
                      ),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FilledButton(
                        onPressed: () {
                          final ModuleDefinition built;
                          try {
                            built = ModuleChanges(snapshot, now: 0, createId: newId).buildFrom(
                              name: _name.text,
                              genre: _genre.text,
                              description: _description.text,
                              categoryKeys: [..._picked],
                              systemId: _systemId,
                            );
                          } on ChangeRefused catch (e) {
                            _tell(e.message);
                            return;
                          }
                          ref.read(availableModulesProvider.notifier).save(built);
                          _tell('${built.name} was saved to your modules.');
                          setState(() {
                            _name.clear();
                            _genre.clear();
                            _description.clear();
                            _picked.clear();
                            _systemId = null;
                          });
                        },
                        child: const Text('Save as a module'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
