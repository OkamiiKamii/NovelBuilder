import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/widgets/form_dialog.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/exchange/import_parse.dart';
import '../../shared/domain/exchange/import_structure.dart';
import '../../shared/domain/manuscript/board.dart';
import '../../shared/domain/manuscript/outline.dart' show OutlineException;
import 'exchange_service.dart';

/// Import a manuscript: choose a .txt, .md, .docx or .rtf file, see what it becomes (volumes, chapters and scenes,
/// with word counts) and how it is split, then confirm. Nothing is added before that, a file that cannot be read
/// changes nothing, and what is already in the manuscript is never changed. Returns the ids added, or null.
Future<List<String>?> importManuscriptFlow(BuildContext context, WidgetRef ref, String novelId) async {
  final picked = await ref.read(backupFilesProvider).pickManuscript();
  if (picked == null || !context.mounted) return null;
  final List<ImportBlock> blocks;
  try {
    blocks = ref.read(exchangeServiceProvider).read(picked.name, picked.bytes);
  } on ImportException catch (e) {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('This file cannot be imported'),
        content: Text('“${picked.name}”: ${e.reason} Nothing was imported, and the manuscript is unchanged.'),
        actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
      ),
    );
    return null;
  }
  if (!context.mounted) return null;
  final created = await showDialog<List<String>>(
    context: context,
    builder: (_) => ImportManuscriptDialog(novelId: novelId, fileName: picked.name, blocks: blocks),
  );
  if (created != null && context.mounted) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Imported “${picked.name}”: ${plural(created.length, 'item')} added to the manuscript.'),
          persist: false,
          duration: const Duration(seconds: 6),
        ),
      );
  }
  return created;
}

class ImportManuscriptDialog extends ConsumerStatefulWidget {
  const ImportManuscriptDialog({super.key, required this.novelId, required this.fileName, required this.blocks});
  final String novelId;
  final String fileName;
  final List<ImportBlock> blocks;

  @override
  ConsumerState<ImportManuscriptDialog> createState() => _ImportManuscriptDialogState();
}

class _ImportManuscriptDialogState extends ConsumerState<ImportManuscriptDialog> {
  var _splitChapters = true;
  var _splitScenes = true;
  String? _parentId;
  String? _error;
  bool _working = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fallback = widget.fileName.replaceFirst(RegExp(r'\.[^.]+$'), '');
    final nodes = buildStructure(
      widget.blocks,
      ImportOptions(splitChapters: _splitChapters, splitScenes: _splitScenes, fallbackTitle: fallback),
    );
    final summary = summarise(nodes);
    final hasGroups = nodes.any((n) => n.kind.isGroup);
    final groups = [
      for (final item in flattenTree(buildTree(ref.read(exchangeServiceProvider).manuscript.nodes(widget.novelId))))
        if (item.node.kind?.isGroup ?? false) item,
    ];
    if (_parentId != null && !groups.any((g) => g.node.id == _parentId)) _parentId = null;
    final rows = <Widget>[];
    void preview(List<ImportNode> list, int depth) {
      for (final node in list) {
        final words = metricsOf(node.blocks).words;
        rows.add(
          Padding(
            padding: EdgeInsets.only(left: depth * 18.0, top: 2, bottom: 2),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    border: Border.all(color: theme.colorScheme.outline),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(node.kind.label, style: theme.textTheme.labelSmall),
                ),
                const SizedBox(width: 8),
                Expanded(child: Text(node.title, overflow: TextOverflow.ellipsis)),
                if (words > 0) Text(formatNumber(words), style: theme.textTheme.bodySmall),
              ],
            ),
          ),
        );
        preview(node.children, depth + 1);
      }
    }

    preview(nodes, 0);
    final found = [
      if (summary.volumes > 0) plural(summary.volumes, 'volume'),
      plural(summary.chapters, 'chapter'),
      if (summary.scenes > 0) plural(summary.scenes, 'scene'),
    ].join(', ');
    return FormDialog(
      title: 'Import ${widget.fileName}',
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            liveRegion: true,
            child: Text(
              nodes.isEmpty ? 'No text was found in this file.' : 'Found $found · ${plural(summary.words, 'word')}.',
            ),
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            value: _splitChapters,
            onChanged: (v) => setState(() => _splitChapters = v),
            title: const Text('Split into chapters at headings'),
            subtitle: const Text('Recognises heading styles and lines such as “Chapter 12”, “Prologue”, “Part Two”'),
            contentPadding: EdgeInsets.zero,
          ),
          SwitchListTile(
            value: _splitScenes,
            onChanged: (v) => setState(() => _splitScenes = v),
            title: const Text('Split scenes at scene breaks'),
            subtitle: const Text('Lines such as * * *, # or ---. Off keeps them as dividers inside the chapter'),
            contentPadding: EdgeInsets.zero,
          ),
          if (!hasGroups && groups.isNotEmpty) ...[
            const SizedBox(height: 8),
            DropdownButtonFormField<String?>(
              initialValue: _parentId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Add to'),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('End of the manuscript')),
                for (final g in groups)
                  DropdownMenuItem<String?>(value: g.node.id, child: Text('${'   ' * g.depth}${g.node.displayTitle}')),
              ],
              onChanged: (id) => setState(() => _parentId = id),
            ),
          ],
          const SizedBox(height: 12),
          Semantics(
            label: 'What will be added',
            child: Container(
              constraints: const BoxConstraints(maxHeight: 280),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                border: Border.all(color: theme.colorScheme.outline),
                borderRadius: BorderRadius.circular(8),
              ),
              child: SingleChildScrollView(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'The text is added exactly as it is in the file, after everything already in this manuscript. Nothing '
            'existing is changed.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          if (_error case final e?) ...[
            const SizedBox(height: 8),
            Text(e, style: TextStyle(color: theme.colorScheme.error)),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: nodes.isEmpty || _working
              ? null
              : () {
                  setState(() => _working = true);
                  try {
                    final created = ref
                        .read(exchangeServiceProvider)
                        .importNodes(widget.novelId, hasGroups ? null : _parentId, nodes);
                    Navigator.of(context).pop(created);
                  } on OutlineException catch (e) {
                    setState(() {
                      _error = '${e.message} Nothing was added.';
                      _working = false;
                    });
                  } on Object catch (e) {
                    setState(() {
                      _error = 'The import failed, and nothing was added: $e';
                      _working = false;
                    });
                  }
                },
          child: Text(_working ? 'Importing…' : 'Import'),
        ),
      ],
    );
  }
}
