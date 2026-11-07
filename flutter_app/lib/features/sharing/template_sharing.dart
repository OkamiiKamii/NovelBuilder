import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/data/template_store.dart';
import '../../shared/domain/codex/codex_changes.dart';
import '../../shared/domain/collab/access.dart' show PermissionException;
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/sharing/template_files.dart';
import '../../shared/domain/systems/system_changes.dart' show instantiateBlueprint;
import '../workspace/open_novel.dart';

const _authorKey = 'sharing.author';
const _sharedKey = 'sharing.shared';

/// One template that can be shared: the author's saved categories, or the open novel's categories, profile layouts
/// and systems. [lineage] is the id and version it was received with, for one that came as a file.
typedef TemplateSource = ({
  String key,
  TemplateKind kind,
  String name,
  String description,
  JsonMap content,
  JsonMap? lineage,
});

String _safe(String s) => s.trim().replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1F]'), '').replaceAll(RegExp(r'\s+'), ' ');

/// Everything that can be shared from this device and the open novel.
List<TemplateSource> templateSources(WidgetRef ref) {
  final saved = ref.read(templatesProvider);
  final novelId = ref.read(openNovelProvider);
  final store = ref.read(novelStoreProvider);
  final novel = novelId == null ? null : store.novel(novelId);
  return [
    for (final t in saved)
      (
        key: 'template:${t.id}',
        kind: TemplateKind.categories,
        name: t.name,
        description: t.description,
        content: {'categories': t.categories},
        lineage: t.shared,
      ),
    if (novel != null) ...[
      (
        key: 'novel-categories:${novel.id}',
        kind: TemplateKind.categories,
        name: '${novel.title.isEmpty ? 'This novel' : novel.title}: categories & fields',
        description: '',
        content: {
          // As the codex shows them: the built-in categories too, until the novel has changed them.
          'categories': [
            if (store.loadPart(novel.id, const {'loreSchemas'}) case final s?)
              for (final c in categoriesOf(s).values)
                if (!c.archived) CodexChanges.kindTemplate(c),
          ],
        },
        lineage: null,
      ),
      for (final r in store.rowsIn(novel.id, 'characterTemplates'))
        (
          key: 'layout:${str(r['id'])}',
          kind: TemplateKind.profileLayout,
          name: str(r['name'], 'Untitled layout'),
          description: str(r['description']),
          content: layoutContent(r),
          lineage: mapOrNull(r['shared']),
        ),
      for (final r in store.rowsIn(novel.id, 'systems'))
        (
          key: 'system:${str(r['id'])}',
          kind: TemplateKind.system,
          name: str(r['name'], 'Untitled system'),
          description: str(r['description']),
          content: systemContent(r),
          lineage: mapOrNull(r['shared']),
        ),
    ],
  ];
}

/// Shares one template as a file: who made it, its terms and its version are chosen first, and what the file will hold
/// is shown before it is made.
Future<void> shareTemplateFlow(BuildContext context, WidgetRef ref) async {
  final sources = templateSources(ref);
  if (sources.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('There is nothing to share yet: save a template in Categories & fields, or open a novel.'),
      ),
    );
    return;
  }
  final settings = ref.read(settingsStoreProvider);
  final shared = mapOrNull(settings.read(_sharedKey)) ?? const <String, Object?>{};
  final picked = await showDialog<({SharedTemplate made, String source})>(
    context: context,
    builder: (_) => _ShareDialog(
      sources: sources,
      author: str(settings.read(_authorKey)),
      lastShared: (key) => mapOrNull(shared[key]),
    ),
  );
  if (picked == null || !context.mounted) return;
  final made = picked.made;
  final box = context.findRenderObject() as RenderBox?;
  final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
  final name = _safe(made.name).isEmpty ? 'Untitled template' : _safe(made.name);
  final result = await ref
      .read(backupFilesProvider)
      .saveFile(
        '$name.novel-template.json',
        Uint8List.fromList(utf8.encode(made.toFileText())),
        kind: FileKind.json,
        origin: origin,
      );
  if (result == null) return;
  settings
    ..write(_authorKey, made.author)
    ..write(_sharedKey, {
      ...shared,
      picked.source: {'id': made.id, 'version': made.version},
    });
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$result: version ${made.version} of “${made.name}”. Nothing else was included.')),
    );
  }
}

class _ShareDialog extends StatefulWidget {
  const _ShareDialog({required this.sources, required this.author, required this.lastShared});
  final List<TemplateSource> sources;
  final String author;
  final JsonMap? Function(String key) lastShared;

  @override
  State<_ShareDialog> createState() => _ShareDialogState();
}

class _ShareDialogState extends State<_ShareDialog> {
  late var _source = widget.sources.first;
  late final _name = TextEditingController(text: _source.name);
  late final _description = TextEditingController(text: _source.description);
  late final _author = TextEditingController(text: widget.author);
  var _license = TemplateLicense.useAndShare;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _author.dispose();
    super.dispose();
  }

  /// The template's lasting id and its next version: continued from the file it came in, or from the last time it was
  /// shared from here.
  /// A template's id is made once, the first time it is shared, and remembered for where it came from.
  late final _freshIds = <String, String>{};

  ({String id, int version}) get _lineage {
    final from = _source.lineage;
    final last = widget.lastShared(_source.key);
    final id = from != null && str(from['id']).isNotEmpty
        ? str(from['id'])
        : (last != null && str(last['id']).isNotEmpty ? str(last['id']) : _freshIds.putIfAbsent(_source.key, newId));
    final before = [numOrNull(from?['version']) ?? 0, numOrNull(last?['version']) ?? 0].reduce((a, b) => a > b ? a : b);
    return (id: id, version: before.toInt() + 1);
  }

  String? _problem;

  SharedTemplate? _make() {
    _problem = null;
    try {
      final (:id, :version) = _lineage;
      return makeSharedTemplate(
        kind: _source.kind,
        id: id,
        version: version,
        name: _name.text,
        description: _description.text,
        author: _author.text,
        license: _license,
        now: DateTime.now().millisecondsSinceEpoch,
        content: _source.content,
        newId: newId,
      );
    } on TemplateFileException catch (e) {
      _problem = e.message;
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final made = _make();
    return AlertDialog(
      scrollable: true,
      title: const Text('Share a template'),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: _source.key,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Template'),
                items: [
                  for (final s in widget.sources)
                    DropdownMenuItem(
                      value: s.key,
                      child: Text('${s.kind.label}: ${s.name}', overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (key) => setState(() {
                  _source = widget.sources.firstWhere((s) => s.key == key);
                  _name.text = _source.name;
                  _description.text = _source.description;
                }),
              ),
              TextField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
                onChanged: (_) => setState(() {}),
              ),
              TextField(
                controller: _description,
                minLines: 1,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Description (optional)'),
                onChanged: (_) => setState(() {}),
              ),
              TextField(
                controller: _author,
                decoration: const InputDecoration(
                  labelText: 'Made by',
                  helperText:
                      'Your name as you want to be credited. It goes in the file; leave it empty to stay unnamed.',
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<TemplateLicense>(
                initialValue: _license,
                isExpanded: true,
                decoration: InputDecoration(labelText: 'Terms', helperText: _license.terms, helperMaxLines: 3),
                items: [for (final l in TemplateLicense.values) DropdownMenuItem(value: l, child: Text(l.label))],
                onChanged: (l) => setState(() => _license = l ?? _license),
              ),
              const SizedBox(height: 12),
              Text(
                made == null
                    ? 'It cannot be shared as it is: ${_problem ?? 'it could not be made into a file'}'
                    : 'Version ${made.version}. Each time you share it again its version goes up, so whoever has an '
                          'earlier one can tell.',
                style: muted,
              ),
              const SizedBox(height: 12),
              Text('What the file will hold', style: theme.textTheme.titleSmall),
              Text(
                'Only these definitions: none of your novel’s entries, text, notes or other records go in it.',
                style: muted,
              ),
              if (made != null)
                for (final line in made.summary.take(30)) Text('• $line'),
              if (made != null && made.summary.length > 30) Text('…and ${made.summary.length - 30} more.'),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: made == null || _name.text.trim().isEmpty
              ? null
              : () => Navigator.of(context).pop((made: made, source: _source.key)),
          child: const Text('Save the file…'),
        ),
      ],
    );
  }
}

/// Brings in a template file: it is read and checked first, what it holds, who made it, its terms and its version are
/// shown, and only then is it added. Never run, never anything but template data.
Future<void> importTemplateFlow(BuildContext context, WidgetRef ref) async {
  final picked = await ref.read(backupFilesProvider).pickBackup();
  if (picked == null || !context.mounted) return;
  final SharedTemplate t;
  try {
    t = readTemplateFile(picked.text, newId: newId);
  } on TemplateFileException catch (e) {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('This template cannot be imported'),
        content: Text('“${picked.name}”: ${e.message} Nothing was added, and nothing changed.'),
        actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
      ),
    );
    return;
  }
  if (!context.mounted) return;
  final store = ref.read(novelStoreProvider);
  final novelId = ref.read(openNovelProvider);
  final novel = novelId == null ? null : store.novel(novelId);
  final held = switch (t.kind) {
    TemplateKind.categories => [
      for (final s in ref.read(templatesProvider))
        if (s.shared case final m?) (id: str(m['id']), version: (numOrNull(m['version']) ?? 1).toInt()),
    ],
    TemplateKind.profileLayout || TemplateKind.system => [
      if (novel != null)
        for (final r in store.rowsIn(novel.id, t.kind == TemplateKind.system ? 'systems' : 'characterTemplates'))
          if (mapOrNull(r['shared']) case final m?) (id: str(m['id']), version: (numOrNull(m['version']) ?? 1).toInt()),
    ],
  };
  final standing = standingOf(t, held);
  final needsNovel = t.kind != TemplateKind.categories;
  final where = switch (t.kind) {
    TemplateKind.categories => 'It is added to your templates, to use in any novel from Categories & fields.',
    TemplateKind.profileLayout =>
      novel == null
          ? 'A profile layout goes into a novel: open one first.'
          : 'It is added to the profile layouts of “${novel.title}”.',
    TemplateKind.system =>
      novel == null
          ? 'A system goes into a novel: open one first.'
          : 'It is added to “${novel.title}” as a new system. Nothing already there changes.',
  };
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) {
      final muted = Theme.of(context).textTheme.bodySmall;
      return AlertDialog(
        scrollable: true,
        title: Text('${t.kind.label}: “${t.name}”'),
        content: SizedBox(
          width: 560,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (t.description.isNotEmpty) Text(t.description),
                Text(
                  'Made by ${t.author.isEmpty ? 'someone unnamed' : t.author}'
                  '${t.madeAt > 0 ? ' · ${DateTime.fromMillisecondsSinceEpoch(t.madeAt.toInt()).year}' : ''} · version ${t.version}',
                  style: muted,
                ),
                Text('Terms: ${t.license.label}. ${t.license.terms}', style: muted),
                const SizedBox(height: 8),
                Text(switch (standing) {
                  TemplateStanding.added => 'You do not have this template yet.',
                  TemplateStanding.newer => 'This is a newer version of one you have. The one you have stays as it is.',
                  TemplateStanding.sameOrOlder => 'You already have this version of it, or a newer one.',
                }),
                Text(where),
                if (t.leftOut > 0)
                  Text(
                    '${plural(t.leftOut, 'part')} of the file ${t.leftOut == 1 ? 'was' : 'were'} not template data and '
                    '${t.leftOut == 1 ? 'is' : 'are'} left out.',
                    style: muted,
                  ),
                const SizedBox(height: 8),
                Text('What it holds', style: Theme.of(context).textTheme.titleSmall),
                for (final line in t.summary.take(30)) Text('• $line'),
                if (t.summary.length > 30) Text('…and ${t.summary.length - 30} more.'),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            onPressed: (needsNovel && novel == null) || standing == TemplateStanding.sameOrOlder
                ? null
                : () => Navigator.of(context).pop(true),
            child: Text(standing == TemplateStanding.newer ? 'Add the newer version' : 'Add it'),
          ),
        ],
      );
    },
  );
  if (ok != true || !context.mounted) return;
  final lineage = {'id': t.id, 'version': t.version, 'author': t.author, 'license': t.license.name, 'madeAt': t.madeAt};
  final now = DateTime.now().millisecondsSinceEpoch;
  String message;
  try {
    switch (t.kind) {
      case TemplateKind.categories:
        ref
            .read(templatesProvider.notifier)
            .saveShared(
              name: t.name,
              description: t.description,
              categories: [for (final c in maps(t.content['categories'])) c],
              shared: lineage,
            );
        message = 'Added “${t.name}” to your templates. Use it from Categories & fields, or when you start a novel.';
      case TemplateKind.profileLayout:
        store.writeRows(novel!.id, [
          RowWrite.put('characterTemplates', {
            'id': newId(),
            'projectId': novel.id,
            'name': t.name,
            'description': t.description,
            'createdAt': now,
            'sections': t.content['sections'],
            'shared': lineage,
          }, expect: null),
        ]);
        message = 'Added the profile layout “${t.name}” to “${novel.title}”.';
      case TemplateKind.system:
        store.writeRows(novel!.id, [
          RowWrite.put('systems', {
            'id': newId(),
            'projectId': novel.id,
            ...instantiateBlueprint(t.content, newId),
            'shared': lineage,
            'createdAt': now,
            'updatedAt': now,
          }, expect: null),
        ]);
        message = 'Added the system “${t.name}” to “${novel.title}”.';
    }
  } on PermissionException catch (e) {
    message = '${e.message} Nothing was added.';
  }
  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
