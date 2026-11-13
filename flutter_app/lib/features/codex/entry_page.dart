import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/codex/field_values.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/records/canon.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../characters/data/portrait_image.dart';
import '../characters/widgets/in_their_pages.dart';
import '../characters/widgets/name_forge.dart';
import '../characters/widgets/parts.dart';
import '../characters/widgets/portrait.dart';
import '../characters/widgets/typed_input.dart';
import 'codex_providers.dart';
import 'widgets/connections_panel.dart';
import 'widgets/entry_bits.dart';

/// How the status of a link reads, as in the original app.
String linkStatusLabel(CanonStatus s) => switch (s) {
  CanonStatus.canon => 'Confirmed',
  CanonStatus.provisional => 'Provisional',
  CanonStatus.conflicting => 'Disputed',
  CanonStatus.retconned => 'Invalid: retconned',
  CanonStatus.nonCanon => 'Invalid: not canon',
};

/// An entry of the world. Every field saves itself; nothing here writes to the manuscript.
class EntryPage extends ConsumerWidget {
  const EntryPage({super.key, required this.entryId});

  final String entryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    final entry = cast?.model.entries[entryId];
    if (cast == null || entry == null) {
      return PageScaffold(
        title: 'Entry not found',
        child: EmptyState(
          icon: Icons.search_off,
          title: 'Entry not found',
          message: cast == null ? 'No novel is open. Open one from the Library.' : 'It may have been deleted.',
          action: FilledButton(
            onPressed: () => context.go(cast == null ? Destination.library.path : '/organize/world'),
            child: Text(cast == null ? 'Go to Library' : 'The world'),
          ),
        ),
      );
    }
    // A character is the same entry, shown in its profile.
    if (entry.category == 'character') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.go(characterPath(entry.id));
      });
      return const LoadingState();
    }
    final actions = CharacterActions(context, cast.novelId);
    final kind = cast.model.categories[entry.category] ?? Category.unknown(entry.category);
    const gap = SizedBox(height: 12);
    return PageScaffold(
      title: entry.name,
      subtitle: kind.singular,
      maxWidth: 1000,
      actions: [
        TextButton.icon(
          onPressed: () => context.go('/organize/world'),
          icon: const Icon(Icons.arrow_back),
          label: const Text('The world'),
        ),
      ],
      child: Column(
        key: ValueKey(entry.id),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Head(cast: cast, entry: entry, kind: kind, actions: actions),
          gap,
          ProfileBox(
            title: 'Detailed description',
            children: [
              SavedTextField(
                value: entry.description,
                multiline: true,
                minLines: 5,
                semanticsLabel: 'Detailed description',
                onChanged: (v) =>
                    actions.later('description:${entry.id}', (c) => c.updateEntry(entry.id, description: v)),
              ),
            ],
          ),
          gap,
          _KindFields(cast: cast, entry: entry, kind: kind, actions: actions),
          gap,
          ProfileBox(
            title: 'Fields just for this entry',
            children: [
              _OwnFields(
                key: ValueKey('own:${entry.id}:${entry.category}'),
                cast: cast,
                entry: entry,
                kind: kind,
                actions: actions,
              ),
            ],
          ),
          gap,
          ProfileBox(
            title: 'Tags',
            children: [
              SavedTextField(
                label: 'Tags (comma separated)',
                value: entry.tags.join(', '),
                onChanged: (v) => actions.later('tags:${entry.id}', (c) => c.updateEntry(entry.id, tags: v.split(','))),
              ),
            ],
          ),
          gap,
          _Related(cast: cast, entry: entry, actions: actions),
          gap,
          _Mentions(cast: cast, entry: entry, actions: actions),
          InTheirPages(cast: cast, entryId: entry.id, actions: actions, title: 'In its pages'),
          gap,
          ConnectionsPanel(cast: cast, self: EntityRef(EntityType.entry, entry.id), actions: actions),
          gap,
          ProfileBox(
            title: 'Author notes (private)',
            children: [
              SavedTextField(
                value: entry.notes,
                multiline: true,
                minLines: 3,
                semanticsLabel: 'Author notes',
                hint: 'Reminders, open questions, spoilers. For your eyes only.',
                onChanged: (v) => actions.later('notes:${entry.id}', (c) => c.updateEntry(entry.id, notes: v)),
              ),
            ],
          ),
          gap,
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            alignment: WrapAlignment.spaceBetween,
            children: [
              Text(
                'Reference only: nothing here is ever added to your manuscript.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              OutlinedButton(
                style: OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
                onPressed: () => _delete(context, ref, cast, entry, kind, actions),
                child: const Text('Delete entry…'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    CastData cast,
    Entry entry,
    Category kind,
    CharacterActions actions,
  ) async {
    final service = ref.read(codexServiceProvider);
    final r = service.references(cast.novelId, entry.id);
    final said = [
      if (r.links > 0) '${plural(r.links, 'link')} to other records (removed with it)',
      if (r.chapters > 0) '${plural(r.chapters, 'chapter')} linking to it in the text (the words stay)',
      if (r.events > 0) '${plural(r.events, 'timeline event')} naming it (kept; they show it as deleted)',
      if (r.threads > 0) '${plural(r.threads, 'plot thread')} naming it (kept)',
      if (r.fields > 0) '${plural(r.fields, 'other entry', 'other entries')} with a field linking to it (kept)',
      if (r.plans > 0) '${plural(r.plans, 'chapter plan')} listing it (kept)',
    ];
    final ok = await showConfirmDialog(
      context,
      title: 'Delete ${entry.name}?',
      message: [
        'This deletes the ${kind.singular.toLowerCase()} ${entry.name}.',
        if (said.isEmpty)
          'Nothing else in the novel refers to it.'
        else
          'It is referred to elsewhere:\n• ${said.join('\n• ')}',
        'A restore point is kept first (Settings → Restore points), so it can be brought back.',
      ].join('\n\n'),
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok) return;
    actions.flush();
    try {
      final kept = service.delete(cast.novelId, entry.id, name: entry.name);
      actions.router.go('/organize/world');
      actions.tell(
        'Deleted ${entry.name}.',
        actionLabel: 'Undo',
        onAction: () {
          service.undoDelete(kept);
          actions.openEntry(entry.id, character: false);
        },
      );
    } on Object catch (e) {
      actions.tell('Deleting failed, and nothing was changed: $e');
    }
  }
}

class _Head extends StatelessWidget {
  const _Head({required this.cast, required this.entry, required this.kind, required this.actions});

  final CastData cast;
  final Entry entry;
  final Category kind;
  final CharacterActions actions;

  Future<void> _upload(BuildContext context) async {
    final files = ProviderScope.containerOf(context, listen: false).read(backupFilesProvider);
    final picked = await files.pickImage();
    if (picked == null) return;
    try {
      final image = await portraitDataUrl(picked.bytes);
      actions.now((c) => c.updateEntry(entry.id, image: (value: image)));
    } on UnreadableImage catch (e) {
      actions.tell('$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final kinds = [
      for (final c in cast.model.categories.values)
        if (c.key != 'character' && (!c.archived || c.key == entry.category)) c,
    ]..sort((a, b) => a.order != b.order ? a.order.compareTo(b.order) : localeCompare(a.name, b.name));
    final image = entry.image;
    final uploaded = uploadedImageBytes(image) != null;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Wrap(
          spacing: 20,
          runSpacing: 16,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                EntryThumb(
                  entry: entry,
                  color: kindColor(kind),
                  size: 96,
                  label: image == null ? '${entry.name} has no picture' : 'Picture of ${entry.name}',
                ),
                if (image != null && !uploaded)
                  SizedBox(
                    width: 160,
                    child: Text(
                      'This picture is a web address. The app does not fetch pictures from the web, so it is kept but '
                      'not shown.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                TextButton(
                  onPressed: () => _upload(context),
                  child: Text(image == null ? 'Upload picture' : 'Replace picture'),
                ),
                if (image != null)
                  TextButton(
                    onPressed: () async {
                      final ok = await showConfirmDialog(
                        context,
                        title: 'Remove the picture?',
                        message: 'The picture is removed from ${entry.name}. A restore point or a backup still has it.',
                        confirmLabel: 'Remove picture',
                        destructive: true,
                      );
                      if (ok) actions.now((c) => c.updateEntry(entry.id, image: (value: null)));
                    },
                    child: const Text('Remove picture'),
                  ),
              ],
            ),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SavedTextField(
                    label: 'Name',
                    value: entry.name,
                    onChanged: (v) {
                      if (v.trim().isNotEmpty) {
                        actions.later('name:${entry.id}', (c) => c.updateEntry(entry.id, name: v));
                      }
                    },
                  ),
                  // A name in the shape of the book's own places and people, or a tradition's (`name_forge.dart`).
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () async {
                        final picked = await showNameForge(
                          context,
                          people: [
                            for (final e in cast.entries)
                              if (e.category == 'character') e.name,
                          ],
                          places: [
                            for (final e in cast.entries)
                              if (e.category == 'location') e.name,
                          ],
                          place: entry.category != 'character',
                        );
                        if (picked != null) actions.now((c) => c.updateEntry(entry.id, name: picked));
                      },
                      icon: const Icon(Icons.auto_fix_high_outlined, size: 18),
                      label: const Text('Forge a name'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    key: ValueKey('category:${entry.category}'),
                    initialValue: entry.category,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Category',
                      helperText: 'Moving it keeps every value: one the new category cannot place stays on the entry.',
                      helperMaxLines: 2,
                    ),
                    items: [
                      for (final k in kinds)
                        DropdownMenuItem(
                          value: k.key,
                          child: Text(k.name, overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (v) {
                      if (v != null && v != entry.category) actions.now((c) => c.updateEntry(entry.id, category: v));
                    },
                  ),
                  const SizedBox(height: 12),
                  SavedTextField(
                    label: 'Short summary',
                    hint: 'One or two lines you can take in at a glance.',
                    value: entry.summary,
                    multiline: true,
                    onChanged: (v) => actions.later('summary:${entry.id}', (c) => c.updateEntry(entry.id, summary: v)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The fields of the entry's kind, each with what fits it said, never enforced.
class _KindFields extends StatelessWidget {
  const _KindFields({required this.cast, required this.entry, required this.kind, required this.actions});

  final CastData cast;
  final Entry entry;
  final Category kind;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    final view = viewFields(entry, kind);
    final others = [
      for (final e in cast.entries)
        if (e.id != entry.id) e,
    ];
    final names = {for (final c in cast.model.categories.values) c.key: c.name};
    return ProfileBox(
      title: '${kind.singular} fields',
      trailing: TextButton(
        onPressed: () => context.go('/organize/world/kinds?kind=${Uri.encodeQueryComponent(kind.key)}'),
        child: const Text('Edit these fields…'),
      ),
      children: [
        if (view.category.isEmpty) const NotRecorded('This category has no fields of its own yet.'),
        for (final (def, field) in view.category)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: TypedInput(
              key: ValueKey('${entry.id}:${def.id}'),
              label: '${def.name}${def.required ? ' *' : ''}',
              type: def.type ?? FieldType.text,
              value: field?.value ?? '',
              options: def.options,
              entries: stableSorted([
                for (final e in others)
                  if (def.target == null || e.category == def.target) e,
              ], (a, b) => localeCompare(a.name, b.name)),
              helper: def.help,
              errorText: checkValue(
                def,
                field?.value ?? '',
                cast.model.entries,
                categoryName: (k) => names[k] ?? k,
              )?.message,
              onTyped: (v) => actions.later('value:${entry.id}:${def.id}', (c) => c.setFieldValue(entry.id, def.id, v)),
              onChosen: (v) => actions.now((c) => c.setFieldValue(entry.id, def.id, v)),
            ),
          ),
        if (view.archived.isNotEmpty)
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: Text(
              '${view.archived.length} archived ${view.archived.length == 1 ? 'field' : 'fields'} with something written',
            ),
            children: [
              for (final (def, field) in view.archived)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(def.name),
                  subtitle: Text(
                    displayValue(def.type, field.value, cast.nameOf).isNotEmpty
                        ? displayValue(def.type, field.value, cast.nameOf)
                        : field.value,
                  ),
                ),
              Text(
                'These fields were removed from ${kind.name}. What you wrote is kept; restore a field under “Edit these '
                'fields…” to edit it again.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
      ],
    );
  }
}

/// Fields that belong to this entry alone: any name, any type. Saved through autosave as they are edited.
class _OwnFields extends StatefulWidget {
  const _OwnFields({super.key, required this.cast, required this.entry, required this.kind, required this.actions});

  final CastData cast;
  final Entry entry;
  final Category kind;
  final CharacterActions actions;

  @override
  State<_OwnFields> createState() => _OwnFieldsState();
}

class _OwnFieldsState extends State<_OwnFields> {
  late List<JsonMap> _rows = [for (final f in viewFields(widget.entry, widget.kind).own) f.toJsonMap()];

  void _change(List<JsonMap> rows, {bool now = false}) {
    setState(() => _rows = rows);
    final id = widget.entry.id;
    final copy = [for (final r in rows) Map<String, Object?>.of(r)];
    if (now) {
      widget.actions.now((c) => c.setOwnFields(id, copy));
    } else {
      widget.actions.later('ownfields:$id', (c) => c.setOwnFields(id, copy));
    }
  }

  void _edit(int i, JsonMap patch, {bool now = false}) => _change([
    for (final (j, r) in _rows.indexed) j == i ? {...r, ...patch} : r,
  ], now: now);

  @override
  Widget build(BuildContext context) {
    final others = stableSorted([
      for (final e in widget.cast.entries)
        if (e.id != widget.entry.id) e,
    ], (a, b) => localeCompare(a.name, b.name));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, row) in _rows.indexed)
          Padding(
            key: ValueKey(row['id']),
            padding: const EdgeInsets.only(bottom: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: SavedTextField(
                        label: 'Field name',
                        value: str(row['key']),
                        onChanged: (v) => _edit(i, {'key': v}),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 170,
                      child: DropdownButtonFormField<FieldType>(
                        initialValue: FieldType.of(row['type']) ?? FieldType.longtext,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Type'),
                        items: [
                          for (final t in FieldType.values)
                            DropdownMenuItem(
                              value: t,
                              child: Text(t.label, overflow: TextOverflow.ellipsis),
                            ),
                        ],
                        onChanged: (t) => _edit(i, {'type': t?.name}, now: true),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Remove the field ${str(row['key'], 'without a name')}',
                      onPressed: () => _change([
                        for (final (j, r) in _rows.indexed)
                          if (j != i) r,
                      ], now: true),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (row['type'] == 'select' || row['type'] == 'multiselect') ...[
                  SavedTextField(
                    label: 'Choices, separated by commas',
                    value: strings(row['options']).join(', '),
                    onChanged: (v) => _edit(i, {
                      'options': [
                        for (final o in v.split(','))
                          if (o.trim().isNotEmpty) o.trim(),
                      ],
                    }),
                  ),
                  const SizedBox(height: 8),
                ],
                TypedInput(
                  label: str(row['key']).isEmpty ? 'Value' : '${str(row['key'])}: value',
                  type: FieldType.of(row['type']) ?? FieldType.longtext,
                  value: str(row['value']),
                  options: strings(row['options']),
                  entries: others,
                  onTyped: (v) => _edit(i, {'value': v}),
                  onChosen: (v) => _edit(i, {'value': v}, now: true),
                ),
              ],
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () => setState(
              () => _rows = [
                ..._rows,
                {'id': newId(), 'key': '', 'value': '', 'type': 'text'},
              ],
            ),
            icon: const Icon(Icons.add),
            label: const Text('Add a field'),
          ),
        ),
        if (_rows.any((r) => str(r['key']).trim().isEmpty && str(r['value']).trim().isEmpty))
          Text('A field with neither a name nor a value is not kept.', style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

extension on EntryField {
  JsonMap toJsonMap() => deepCopy(raw)! as JsonMap;
}

class _Related extends StatefulWidget {
  const _Related({required this.cast, required this.entry, required this.actions});

  final CastData cast;
  final Entry entry;
  final CharacterActions actions;

  @override
  State<_Related> createState() => _RelatedState();
}

class _RelatedState extends State<_Related> {
  String? _to;
  final _label = TextEditingController();

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget;
    final related = w.cast.relatedOf(w.entry.id);
    final linked = {for (final r in related) r.entry.id};
    final linkable = stableSorted([
      for (final e in w.cast.entries)
        if (e.id != w.entry.id && !linked.contains(e.id)) e,
    ], (a, b) => localeCompare(a.name, b.name));
    Category kindOf(Entry e) => w.cast.model.categories[e.category] ?? Category.unknown(e.category);
    return ProfileBox(
      title: 'Related entries',
      children: [
        if (related.isEmpty) const NotRecorded('Not linked to anything yet.'),
        for (final r in related)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                TextButton(
                  onPressed: () => w.actions.openEntry(r.entry.id, character: r.entry.category == 'character'),
                  child: Text(r.entry.name),
                ),
                KindBadge(kind: kindOf(r.entry)),
                SizedBox(
                  width: 220,
                  child: SavedTextField(
                    dense: true,
                    label: 'Relationship',
                    hint: r.theirLabel.isNotEmpty ? 'They say: ${r.theirLabel}' : null,
                    value: r.label,
                    onChanged: (v) =>
                        w.actions.later('linklabel:${r.linkId}', (c) => c.labelLink(r.linkId, w.entry.id, v)),
                  ),
                ),
                SizedBox(
                  width: 190,
                  child: () {
                    final canon = w.cast.links.where((l) => l.id == r.linkId).firstOrNull?.canon ?? CanonStatus.canon;
                    return DropdownButtonFormField<CanonStatus>(
                      key: ValueKey('${r.linkId}:${canon.key}'),
                      initialValue: canon,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Status', isDense: true),
                      items: [
                        for (final s in CanonStatus.values)
                          DropdownMenuItem(
                            value: s,
                            child: Text(linkStatusLabel(s), overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (s) => s == null ? null : w.actions.now((c) => c.setLinkCanon(r.linkId, s)),
                    );
                  }(),
                ),
                IconButton(
                  tooltip: 'Remove the link to ${r.entry.name}',
                  onPressed: () => w.actions.now((c) => c.unlink(r.linkId)),
                  icon: const Icon(Icons.link_off),
                ),
              ],
            ),
          ),
        if (linkable.isNotEmpty)
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 260,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('link-to:$_to'),
                  initialValue: _to,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Link to…'),
                  items: [
                    for (final e in linkable)
                      DropdownMenuItem(
                        value: e.id,
                        child: Text('${e.name} (${kindOf(e).singular})', overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() => _to = v),
                ),
              ),
              SizedBox(
                width: 220,
                child: TextField(
                  controller: _label,
                  decoration: const InputDecoration(labelText: 'Relationship (optional)'),
                ),
              ),
              FilledButton(
                onPressed: _to == null
                    ? null
                    : () {
                        if (w.actions.now((c) => c.linkEntries(w.entry.id, _to!, _label.text)) != null) {
                          setState(() => _to = null);
                          _label.clear();
                        }
                      },
                child: const Text('Link'),
              ),
            ],
          ),
      ],
    );
  }
}

/// Where the entry figures elsewhere: chapters that link to it, events and plot threads that name it. Each record
/// lives in its own feature; nothing is copied here.
class _Mentions extends StatelessWidget {
  const _Mentions({required this.cast, required this.entry, required this.actions});

  final CastData cast;
  final Entry entry;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    final chapters = stableSorted(
      cast.model.nodes.values.where((n) => n.mentions.contains(entry.id)),
      (a, b) => (cast.model.order.position[a.id] ?? 0) - (cast.model.order.position[b.id] ?? 0),
    );
    final events = [
      for (final e in cast.model.events.values)
        if (e.locationId == entry.id || e.entryIds.contains(entry.id)) e,
    ];
    final threads = [
      for (final t in cast.model.threads.values)
        if (t.locationIds.contains(entry.id)) t,
    ];
    return ProfileBox(
      title: 'Where it figures',
      children: [
        if (chapters.isEmpty && events.isEmpty && threads.isEmpty)
          NotRecorded('No chapter, event or plot thread refers to ${entry.name} yet.'),
        if (chapters.isNotEmpty) ...[
          const Text('Linked in the text of:'),
          Wrap(
            children: [
              for (final n in chapters)
                TextButton(onPressed: () => actions.openChapter(n.id), child: Text(documentName(cast, n.id))),
            ],
          ),
        ],
        if (events.isNotEmpty) Text('Timeline events: ${events.map((e) => e.name).join(', ')}'),
        if (threads.isNotEmpty) Text('Plot threads here: ${threads.map((t) => t.title).join(', ')}'),
      ],
    );
  }
}
