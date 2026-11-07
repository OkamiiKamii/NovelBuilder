import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../shared/data/backup_service.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/collab/review_files.dart';
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../collab/collab_providers.dart';
import '../workspace/open_novel.dart';

/// Each kind of record as one and as many.
const _collectionWords = {
  'chapters': ('chapter, scene or group', 'chapters, scenes and groups'),
  'chapterContents': ('text', 'texts'),
  'loreEntries': ('codex entry', 'codex entries'),
  'loreLinks': ('connection', 'connections'),
  'characterRelations': ('relationship', 'relationships'),
  'timelineEvents': ('event', 'events'),
  'plotThreads': ('plot thread', 'plot threads'),
  'canonFacts': ('canon fact', 'canon facts'),
  'systems': ('system', 'systems'),
  'chapterRevisions': ('earlier version', 'earlier versions'),
};

/// "12 chapters, scenes and groups · 51 codex entries · … · and 40 other records".
String describeCounts(Map<String, int> counts) {
  final parts = [
    for (final e in _collectionWords.entries)
      if (counts[e.key] case final n? when n > 0) '$n ${n == 1 ? e.value.$1 : e.value.$2}',
  ];
  final others = counts.entries.where((e) => !_collectionWords.containsKey(e.key)).fold(0, (n, e) => n + e.value);
  if (others > 0) parts.add('and $others other ${others == 1 ? 'record' : 'records'}');
  return parts.isEmpty ? 'No records yet' : parts.join(' · ');
}

void _tell(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

/// Import a backup: choose a file, see what it holds and what importing would do, then confirm. Nothing is written
/// before the author confirms, and a file that cannot be read changes nothing.
Future<void> importBackupFlow(BuildContext context, WidgetRef ref) async {
  final picked = await ref.read(backupFilesProvider).pickBackup();
  if (picked == null || !context.mounted) return;
  final backups = ref.read(backupServiceProvider);
  final ImportPreview preview;
  try {
    preview = backups.previewImport(picked.text);
  } on SnapshotException catch (e) {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('This file cannot be imported'),
        content: Text('“${picked.name}”: ${e.reason}. Nothing was imported, and your library is unchanged.'),
        actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
      ),
    );
    return;
  }
  if (!context.mounted) return;
  if (ReviewMark.of(preview.snapshot.project) case final mark?) {
    await _openReviewCopyFlow(context, ref, preview, mark);
    return;
  }
  final replacing = preview.existing != null;
  final choice = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(replacing ? '“${preview.existing!.title}” is already in your library' : 'Import “${preview.title}”?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(describeCounts(preview.counts)),
            if (replacing) ...[
              const SizedBox(height: 12),
              const Text(
                'Import it as a separate copy beside the one you have, or replace that one with the backup. Replacing '
                'keeps the current version first as a restore point (Settings → Restore points), so it can be undone.',
              ),
              const SizedBox(height: 8),
              Text(
                preview.changes.isEmpty
                    ? 'Replacing would change nothing: the backup holds exactly what you have.'
                    : 'Replacing would change, compared with what you have now:',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              for (final MapEntry(key: name, value: c) in preview.changes.entries)
                Text(
                  '• ${_collectionWords[name]?.$2 ?? 'records in “$name”'}: ${[if (c.added > 0) '${c.added} added', if (c.changed > 0) '${c.changed} changed', if (c.removed > 0) '${c.removed} removed'].join(', ')}',
                ),
            ],
            if (preview.fromVersion < NovelSnapshot.currentVersion) ...[
              const SizedBox(height: 12),
              Text(
                'It was made by an earlier version of Novel Builder (format ${preview.fromVersion}). It is brought up '
                'to date as it is read; nothing in it is dropped.',
              ),
            ],
            if (preview.problems.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                '${preview.problems.length == 1 ? '1 reference' : '${preview.problems.length} references'} in it '
                'name a record the file does not hold. They are imported as they are, nothing is dropped, and Review → '
                'Record check can deal with them afterwards:',
              ),
              for (final p in preview.problems.take(5)) Text('• $p'),
              if (preview.problems.length > 5) Text('…and ${preview.problems.length - 5} more.'),
            ],
            if (preview.unknownCollections.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'It also holds records this version has no screens for (${preview.unknownCollections.join(', ')}). '
                'They are kept, unchanged, and written back into backups.',
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(autofocus: replacing, onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        if (replacing) ...[
          OutlinedButton(onPressed: () => Navigator.of(context).pop('replace'), child: const Text('Replace')),
          FilledButton(onPressed: () => Navigator.of(context).pop('copy'), child: const Text('Import as a copy')),
        ] else
          FilledButton(
            autofocus: true,
            onPressed: () => Navigator.of(context).pop('import'),
            child: const Text('Import'),
          ),
      ],
    ),
  );
  if (choice == null || !context.mounted) return;
  try {
    switch (choice) {
      case 'copy':
        final copy = ref.read(libraryServiceProvider).importAsCopy(preview);
        if (context.mounted) _tell(context, 'Imported “${copy.title}” as a separate copy.');
      default:
        final kept = backups.importBackup(preview);
        if (context.mounted) {
          _tell(
            context,
            kept == null
                ? 'Imported “${preview.title}”.'
                : 'Replaced “${preview.title}”. The earlier version is a restore point.',
          );
        }
    }
  } on Object catch (e) {
    if (context.mounted) _tell(context, 'The import failed and nothing was changed: $e');
  }
}

/// A review copy someone shared: what it is and in what role, then opened as a review copy. A newer one takes the
/// place of the one held, keeping the person's own changes not yet sent.
Future<void> _openReviewCopyFlow(BuildContext context, WidgetRef ref, ImportPreview preview, ReviewMark mark) async {
  final held = preview.existing != null;
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('A review copy of “${mark.title}”'),
      content: Text(
        'From ${mark.ownerName}, for ${mark.memberName} as ${mark.role.label}: ${mark.role.summary} '
        'You read it, comment and suggest; nothing you do changes the author’s book, and your feedback file goes back '
        'to them when you choose.'
        '${held ? ' It takes the place of the review copy you have, keeping your own changes not yet sent.' : ''}',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(held ? 'Update it' : 'Open it')),
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  try {
    final id = openReviewCopy(ref.read(novelStoreProvider), preview.snapshot);
    ref.read(openNovelProvider.notifier).open(id);
    if (context.mounted) GoRouter.of(context).go(Destination.write.path);
    if (context.mounted) _tell(context, 'Opened the review copy of “${mark.title}”. It is in Write.');
  } on SnapshotException catch (e) {
    if (context.mounted) _tell(context, 'This review copy cannot be opened: ${e.reason}.');
  } on Object catch (e) {
    if (context.mounted) _tell(context, 'The review copy could not be opened, and nothing was changed: $e');
  }
}

/// Export a full backup of one novel to a place the author chooses.
Future<void> exportBackupFlow(BuildContext context, WidgetRef ref, Novel novel) async {
  final box = context.findRenderObject() as RenderBox?;
  final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
  try {
    final text = ref.read(backupServiceProvider).exportBackup(novel.id);
    final result = await ref
        .read(backupFilesProvider)
        .saveBackup(BackupService.fileNameFor(novel), text, origin: origin);
    if (result != null && context.mounted) _tell(context, result);
  } on Object catch (e) {
    if (context.mounted) _tell(context, 'The backup could not be made: $e');
  }
}
