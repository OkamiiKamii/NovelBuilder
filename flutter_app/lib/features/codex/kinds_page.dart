import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/template_store.dart';
import '../../shared/domain/codex/codex_changes.dart';
import '../../shared/domain/codex/type_presets.dart';
import '../../shared/domain/codex/world_presets.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/sharing/template_files.dart' show TemplateLicense;
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import 'widgets/entry_bits.dart';
import 'widgets/kind_uses_editor.dart';

/// Where the novel's kinds of record and their field sets are shaped. Every change here is to structure only: no entry
/// and no value an author wrote is ever deleted. A removed field is archived and can be brought back.
class KindsPage extends ConsumerStatefulWidget {
  const KindsPage({super.key, this.kind});

  final String? kind;

  @override
  ConsumerState<KindsPage> createState() => _KindsPageState();
}

class _KindsPageState extends ConsumerState<KindsPage> {
  late String? _key = widget.kind;
  final _newName = TextEditingController();

  @override
  void dispose() {
    _newName.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    if (cast == null) {
      return PageScaffold(
        title: 'Categories & fields',
        child: EmptyState(
          icon: Icons.menu_book_outlined,
          title: 'No novel open',
          message: 'Categories belong to a novel. Open one from the Library.',
          action: FilledButton(
            onPressed: () => context.go(Destination.library.path),
            child: const Text('Go to Library'),
          ),
        ),
      );
    }
    final actions = CharacterActions(context, cast.novelId);
    final kinds = [...cast.model.categories.values]
      ..sort((a, b) => a.order != b.order ? a.order.compareTo(b.order) : localeCompare(a.name, b.name));
    final kind = kinds.where((k) => k.key == _key).firstOrNull ?? kinds.firstWhere((k) => k.key != 'character');
    int count(Category k) => cast.entries.where((e) => e.category == k.key).length;

    void add() {
      if (_newName.text.trim().isEmpty) return;
      final made = actions.now((c) => c.saveCategory(null, (_) => {'name': _newName.text}));
      if (made != null) {
        _newName.clear();
        setState(() => _key = made.key);
      }
    }

    return PageScaffold(
      title: 'Categories & fields',
      subtitle: cast.novelTitle,
      actions: [
        TextButton.icon(
          onPressed: () => context.go('/organize/world'),
          icon: const Icon(Icons.arrow_back),
          label: const Text('The world'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            key: ValueKey('kind:${kind.key}:${kinds.length}'),
            initialValue: kind.key,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Category'),
            items: [
              for (final k in kinds)
                DropdownMenuItem(
                  value: k.key,
                  child: Text(
                    '${k.name} · ${k.archived ? 'archived' : plural(count(k), 'entry', 'entries')}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (v) => setState(() => _key = v),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 280,
                child: TextField(
                  controller: _newName,
                  decoration: const InputDecoration(labelText: 'New category', hintText: 'Kingdoms'),
                  onSubmitted: (_) => add(),
                ),
              ),
              OutlinedButton(onPressed: add, child: const Text('Add category')),
              PopupMenuButton<TypePreset>(
                tooltip: 'Start a kind of record from a preset',
                useRootNavigator: true,
                onSelected: (p) {
                  final after = actions.now((c) => c.addKinds(p.categories));
                  if (after == null) return;
                  final made = after.where((c) => c.name.trim().toLowerCase() == p.name.toLowerCase()).firstOrNull;
                  if (made != null) setState(() => _key = made.key);
                  actions.tell('Added “${p.name}” with its fields. Rename, retype or remove any of them.');
                },
                itemBuilder: (_) => [
                  for (final p in typePresets)
                    PopupMenuItem(
                      value: p,
                      child: ListTile(title: Text(p.name), subtitle: Text(p.description)),
                    ),
                ],
                child: const IgnorePointer(
                  child: OutlinedButton(onPressed: _noop, child: Text('Or start from a preset…')),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _KindEditor(key: ValueKey(kind.key), cast: cast, kind: kind, count: count(kind), actions: actions),
          const SizedBox(height: 24),
          _Templates(actions: actions),
        ],
      ),
    );
  }
}

void _noop() {}

/// A number as typed back into a box: no thousands separators, no trailing “.0”.
String _plain(num n) => n == n.roundToDouble() ? n.toInt().toString() : n.toString();

class _KindEditor extends StatelessWidget {
  const _KindEditor({super.key, required this.cast, required this.kind, required this.count, required this.actions});

  final CastData cast;
  final Category kind;
  final int count;
  final CharacterActions actions;

  /// A change to the field set, made against the category as stored right now, so quick edits build on each other.
  void _fields(List<JsonMap> Function(List<JsonMap> stored) change, {bool later = false, String what = ''}) {
    JsonMap edit(Category? current) => {
      'fields': change([for (final f in current!.fields) f.raw]),
    };
    if (later) {
      actions.later('kind:${kind.key}:$what', (c) => c.saveCategory(kind.key, edit));
    } else {
      actions.now((c) => c.saveCategory(kind.key, edit));
    }
  }

  void _editField(String id, JsonMap patch, {bool later = false, String what = ''}) => _fields(
    (stored) => [
      for (final f in stored) f['id'] == id ? ({...f, ...patch}..removeWhere((k, v) => v == null)) : f,
    ],
    later: later,
    what: '$id:$what',
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = kind.fields.where((f) => !f.archived).toList();
    final archived = kind.fields.where((f) => f.archived).toList();
    int usedBy(FieldDef def) => cast.entries
        .where((e) => e.category == kind.key && e.fields.any((f) => f.defId == def.id && f.value.trim().isNotEmpty))
        .length;
    final isCharacter = kind.key == 'character';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfileBox(
          title: kind.name,
          caption: isCharacter
              ? 'The fields every character shares: offered on every profile, under Details. Fields for one character '
                    'alone are added on their profile.'
              : null,
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                SizedBox(
                  width: 260,
                  child: SavedTextField(
                    label: 'Category name',
                    value: kind.name,
                    onChanged: (v) {
                      if (v.trim().isNotEmpty) {
                        actions.later('kind:${kind.key}:name', (c) => c.saveCategory(kind.key, (_) => {'name': v}));
                      }
                    },
                  ),
                ),
                SizedBox(
                  width: 260,
                  child: SavedTextField(
                    label: 'One of them is a…',
                    value: kind.singular,
                    onChanged: (v) {
                      if (v.trim().isNotEmpty) {
                        actions.later(
                          'kind:${kind.key}:singular',
                          (c) => c.saveCategory(kind.key, (_) => {'singular': v}),
                        );
                      }
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text('Colour', style: theme.textTheme.labelLarge),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final color in {kind.color, ...customColors})
                  Semantics(
                    selected: kind.color == color,
                    button: true,
                    label: 'Colour $color${kind.color == color ? ', chosen' : ''}',
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () => actions.now((c) => c.saveCategory(kind.key, (_) => {'color': color})),
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: kindColor(Category({'color': color})),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: kind.color == color ? theme.colorScheme.onSurface : Colors.transparent,
                            width: 3,
                          ),
                        ),
                        child: kind.color == color ? const Icon(Icons.check, color: Colors.white, size: 18) : null,
                      ),
                    ),
                  ),
              ],
            ),
            if (!isCharacter) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  FilterChip(
                    label: const Text('Show in the knowledge graph'),
                    selected: kind.raw['graph'] != false,
                    tooltip: 'Its records stay everywhere else either way.',
                    onSelected: (on) => actions.now((c) => c.saveCategory(kind.key, (_) => {'graph': on})),
                  ),
                  OutlinedButton.icon(
                    onPressed: () {
                      final saved = actions.container.read(templatesProvider.notifier).save(
                        kind.name,
                        'One kind of record: ${kind.name}',
                        [CodexChanges.kindTemplate(kind)],
                      );
                      actions.tell('Saved “${saved.name}” as a template, to add to any novel.');
                    },
                    icon: const Icon(Icons.bookmark_add_outlined),
                    label: Text('Save ${kind.name} as a template'),
                  ),
                ],
              ),
            ],
          ],
        ),
        const SizedBox(height: 12),
        ProfileBox(
          title: 'Fields every ${kind.singular.toLowerCase()} has',
          children: [
            if (active.isEmpty) const NotRecorded('No fields yet.'),
            for (final (i, def) in active.indexed)
              _FieldRow(
                key: ValueKey(def.id),
                def: def,
                first: i == 0,
                last: i == active.length - 1,
                kinds: cast.model.categories.values.toList(),
                edit: _editField,
                move: (by) => _fields((stored) {
                  final live = [
                    for (final f in stored)
                      if (f['archived'] != true) f,
                  ];
                  final from = live.indexWhere((f) => f['id'] == def.id);
                  final to = from + by;
                  if (from < 0 || to < 0 || to >= live.length) return stored;
                  final moving = live[from];
                  live[from] = live[to];
                  live[to] = moving;
                  return [
                    ...live,
                    for (final f in stored)
                      if (f['archived'] == true) f,
                  ];
                }),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: () => _fields(
                  (stored) => [
                    for (final f in stored)
                      if (f['archived'] != true) f,
                    {'id': newId(), 'name': 'New field', 'type': 'text', 'options': <String>[]},
                    for (final f in stored)
                      if (f['archived'] == true) f,
                  ],
                ),
                icon: const Icon(Icons.add),
                label: const Text('Add a field'),
              ),
            ),
          ],
        ),
        if (!isCharacter) ...[
          const SizedBox(height: 12),
          KindUsesEditor(
            category: kind,
            links: cast.model.links,
            save: (change) => actions.now(
              (c) => c.saveCategory(
                kind.key,
                (current) => {
                  'uses': change({...?mapOrNull(current?.raw['uses'])}),
                },
              ),
            ),
          ),
        ],
        if (archived.isNotEmpty) ...[
          const SizedBox(height: 12),
          ProfileBox(
            title: 'Archived fields',
            caption: 'Removing a field only hides it. What you wrote in it is kept, and comes back if you restore it.',
            children: [
              for (final def in archived)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(def.name),
                  subtitle: Text(
                    '${def.type?.label ?? 'Short text'} · '
                    '${usedBy(def) > 0 ? 'still filled in on ${plural(usedBy(def), 'entry', 'entries')}' : 'no values'}',
                  ),
                  trailing: TextButton(
                    onPressed: () => _editField(def.id, {'archived': null}),
                    child: Text('Restore', semanticsLabel: 'Restore ${def.name}'),
                  ),
                ),
            ],
          ),
        ],
        if (!kind.builtin) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                kind.archived
                    ? 'Archived: no new entries can be added; existing ones are kept.'
                    : 'Archiving hides this category from “New entry”. Its ${plural(count, 'entry is', 'entries are')} kept.',
                style: theme.textTheme.bodySmall,
              ),
              OutlinedButton(
                onPressed: () => actions.now((c) => c.saveCategory(kind.key, (_) => {'archived': !kind.archived})),
                child: Text(kind.archived ? 'Restore category' : 'Archive category'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _FieldRow extends StatelessWidget {
  const _FieldRow({
    super.key,
    required this.def,
    required this.first,
    required this.last,
    required this.kinds,
    required this.edit,
    required this.move,
  });

  final FieldDef def;
  final bool first;
  final bool last;
  final List<Category> kinds;
  final void Function(String id, JsonMap patch, {bool later, String what}) edit;
  final void Function(int by) move;

  @override
  Widget build(BuildContext context) {
    final type = def.type ?? FieldType.text;
    final isLink = type == FieldType.reference || type == FieldType.references;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 240,
                  child: SavedTextField(
                    label: 'Field name',
                    value: def.name,
                    onChanged: (v) {
                      if (v.trim().isNotEmpty) edit(def.id, {'name': v}, later: true, what: 'name');
                    },
                  ),
                ),
                SizedBox(
                  width: 200,
                  child: DropdownButtonFormField<FieldType>(
                    key: ValueKey('${def.id}:${type.name}'),
                    initialValue: type,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Type'),
                    items: [for (final t in FieldType.values) DropdownMenuItem(value: t, child: Text(t.label))],
                    onChanged: (t) => t == null ? null : edit(def.id, {'type': t.name}),
                  ),
                ),
                IconButton(
                  tooltip: 'Move ${def.name} up',
                  onPressed: first ? null : () => move(-1),
                  icon: const Icon(Icons.arrow_upward),
                ),
                IconButton(
                  tooltip: 'Move ${def.name} down',
                  onPressed: last ? null : () => move(1),
                  icon: const Icon(Icons.arrow_downward),
                ),
                IconButton(
                  tooltip: 'Remove ${def.name} (archived: values already written are kept)',
                  onPressed: () => edit(def.id, {'archived': true}),
                  icon: const Icon(Icons.archive_outlined),
                ),
              ],
            ),
            if (type == FieldType.select || type == FieldType.multiselect) ...[
              const SizedBox(height: 8),
              SavedTextField(
                label: 'Choices, separated by commas',
                value: def.options.join(', '),
                onChanged: (v) => edit(
                  def.id,
                  {
                    'options': [
                      for (final o in v.split(','))
                        if (o.trim().isNotEmpty) o.trim(),
                    ],
                  },
                  later: true,
                  what: 'options',
                ),
              ),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                FilterChip(
                  label: const Text('Required'),
                  selected: def.required,
                  tooltip: 'Said at the field when it is empty; never stops an entry being saved.',
                  onSelected: (on) => edit(def.id, {'required': on ? true : null}),
                ),
                if (type == FieldType.number) ...[
                  SizedBox(
                    width: 120,
                    child: SavedTextField(
                      label: 'Lowest',
                      value: def.min == null ? '' : _plain(def.min!),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                      onChanged: (v) => edit(def.id, {'min': num.tryParse(v.trim())}, later: true, what: 'min'),
                    ),
                  ),
                  SizedBox(
                    width: 120,
                    child: SavedTextField(
                      label: 'Highest',
                      value: def.max == null ? '' : _plain(def.max!),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                      onChanged: (v) => edit(def.id, {'max': num.tryParse(v.trim())}, later: true, what: 'max'),
                    ),
                  ),
                ],
                if (isLink)
                  SizedBox(
                    width: 240,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('${def.id}:target:${def.target}'),
                      initialValue: kinds.any((k) => k.key == def.target) ? def.target : '',
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Links to'),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('Any kind of entry')),
                        for (final k in kinds)
                          DropdownMenuItem(
                            value: k.key,
                            child: Text(k.name, overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) => edit(def.id, {'target': (v == null || v.isEmpty) ? null : v}),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            SavedTextField(
              label: 'Help shown with the field (optional)',
              value: def.help ?? '',
              onChanged: (v) => edit(def.id, {'help': v.trim().isEmpty ? null : v}, later: true, what: 'help'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Templates: every category and field set of this novel saved to start other novels from, and what a template (a
/// built-in one, or the author's own) adds here. Adding only ever adds: nothing that exists is changed.
class _Templates extends ConsumerStatefulWidget {
  const _Templates({required this.actions});
  final CharacterActions actions;

  @override
  ConsumerState<_Templates> createState() => _TemplatesState();
}

class _TemplatesState extends ConsumerState<_Templates> {
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _save() {
    final actions = widget.actions;
    final data = actions.now((c) => c.schemaSnapshot());
    if (data == null || _name.text.trim().isEmpty) return;
    final saved = ref
        .read(templatesProvider.notifier)
        .save(_name.text, plural(data.length, 'category', 'categories'), data);
    _name.clear();
    actions.tell('Saved “${saved.name}”. Pick it when you create a new novel, or add it to any novel here.');
  }

  void _apply(String name, List<JsonMap> categories) {
    final after = widget.actions.now((c) => c.addKinds(categories));
    if (after == null) return;
    widget.actions.tell('Added what was missing from “$name”. Nothing existing was changed.');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final saved = ref.watch(templatesProvider);
    return ProfileBox(
      title: 'Templates',
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 320,
              child: TextField(
                controller: _name,
                decoration: const InputDecoration(
                  labelText: 'Template name',
                  hintText: 'Save all categories & fields as a template…',
                ),
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _save(),
              ),
            ),
            FilledButton.tonal(onPressed: _name.text.trim().isEmpty ? null : _save, child: const Text('Save template')),
          ],
        ),
        const SizedBox(height: 12),
        PopupMenuButton<(String, List<JsonMap>)>(
          tooltip: 'Add categories and fields from a template',
          useRootNavigator: true,
          onSelected: (t) => _apply(t.$1, t.$2),
          itemBuilder: (_) => [
            const PopupMenuItem(enabled: false, child: Text('Built in')),
            for (final p in worldPresets)
              PopupMenuItem(
                value: (p.name, p.categories),
                child: ListTile(title: Text(p.name), subtitle: Text(p.description)),
              ),
            if (saved.isNotEmpty) ...[
              const PopupMenuDivider(),
              const PopupMenuItem(enabled: false, child: Text('Yours')),
              for (final t in saved)
                PopupMenuItem(
                  value: (t.name, t.categories),
                  child: ListTile(title: Text(t.name), subtitle: Text(t.description)),
                ),
            ],
          ],
          child: const IgnorePointer(
            child: OutlinedButton(onPressed: _noop, child: Text('Add categories and fields from a template…')),
          ),
        ),
        if (saved.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text('Your templates', style: theme.textTheme.labelLarge),
          for (final t in saved)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(t.name),
              subtitle: Text(
                [
                  if (t.description.isNotEmpty) t.description,
                  // One received as a file says whose it is, which version, and on what terms.
                  if (t.shared case final s?)
                    'Version ${s['version'] ?? 1}, made by ${str(s['author']).isEmpty ? 'someone unnamed' : str(s['author'])} · '
                        '${TemplateLicense.of(s['license']).label}',
                ].join('\n'),
              ),
              trailing: TextButton(
                onPressed: () {
                  ref.read(templatesProvider.notifier).remove(t.id);
                  widget.actions.tell('Deleted the template “${t.name}”. No novel was changed.');
                },
                child: Text('Delete', semanticsLabel: 'Delete template ${t.name}'),
              ),
            ),
        ],
      ],
    );
  }
}
