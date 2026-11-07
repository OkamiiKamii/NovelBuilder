import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/form_section.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../shared/data/providers.dart';
import '../characters/characters_providers.dart';
import '../library/backup_actions.dart';
import '../sharing/template_sharing.dart';
import '../workspace/open_novel.dart';
import '../write/write_providers.dart' show selectedNodeProvider;
import 'data_export_dialog.dart';
import 'export_dialog.dart';
import 'import_dialog.dart';

/// IMPORT & EXPORT
/// Your writing is yours: bring a manuscript in, take it out in standard formats, take records out for a spreadsheet,
/// or take everything as a backup. Each says plainly what it holds; only a backup holds the whole novel. Nothing is sent
/// anywhere: files go only where you choose.
class ExchangePage extends ConsumerWidget {
  const ExchangePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(openNovelProvider);
    final novel = id == null ? null : ref.watch(libraryProvider).where((n) => n.id == id).firstOrNull;
    final cast = novel == null ? null : ref.watch(castProvider);
    return PageScaffold(
      title: 'Import & export',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (novel == null)
            const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Text(
                'Open a novel from the Library to export it or import a manuscript into it. Backups work without one.',
              ),
            )
          else ...[
            FormSection(
              title: 'Export the manuscript',
              description:
                  'Word, PDF, Markdown, plain text or a web page. Choose exactly what goes in: the clean manuscript for '
                  'readers, or a complete bible with planning, notes and lore; the whole book or one part.',
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.icon(
                    onPressed: () => showExportManuscriptDialog(context, novel.id),
                    icon: const Icon(Icons.ios_share),
                    label: const Text('Export manuscript…'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            FormSection(
              title: 'Import a manuscript',
              description:
                  'From a .txt, .md, .docx or .rtf file. Chapters and scenes are found from headings and scene breaks, '
                  'and you see the result before anything is added. Nothing already in “${novel.title}” is changed.',
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      final created = await importManuscriptFlow(context, ref, novel.id);
                      if (created != null && created.isNotEmpty) {
                        ref.read(selectedNodeProvider.notifier).select(created.first);
                      }
                    },
                    icon: const Icon(Icons.file_open_outlined),
                    label: const Text('Choose a file…'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            FormSection(
              title: 'Export records',
              description:
                  'Characters, places, factions, events, plot threads, relationships and more, as JSON (every field, with '
                  'its id) or as tables for a spreadsheet. Private notes and secrets are left out unless you tick them in. '
                  'Any Visualize view can also be exported on its own, from its Export button.',
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton.icon(
                    onPressed: cast == null
                        ? null
                        : () => showDataExportDialog(context, source: CastSource(cast.snapshot, cast.model)),
                    icon: const Icon(Icons.table_chart_outlined),
                    label: const Text('Export records…'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
          FormSection(
            title: 'Template files',
            description:
                'Share a template with another writer, or bring in one you were given: categories & fields, a profile '
                'layout or a progression system. A template holds definitions only, never your novel’s entries or '
                'text; a received one is checked and shown to you before it is added, and is never run as code.',
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => shareTemplateFlow(context, ref),
                    icon: const Icon(Icons.ios_share),
                    label: const Text('Share a template…'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => importTemplateFlow(context, ref),
                    icon: const Icon(Icons.file_open_outlined),
                    label: const Text('Import a template file…'),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          FormSection(
            title: 'Full backup',
            description:
                'A backup is the whole novel in one file: every chapter, version, record, link, custom field, history, '
                'alternate history and saved view, in the same .novel.json format the original Novel Builder writes. It '
                'is the only export that can bring a novel back. Importing one shows what it holds, and what it would '
                'change, before anything is written.',
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (novel != null)
                    OutlinedButton.icon(
                      onPressed: () => exportBackupFlow(context, ref, novel),
                      icon: const Icon(Icons.save_alt),
                      label: Text('Export backup of “${novel.title}”'),
                    ),
                  OutlinedButton.icon(
                    onPressed: () => importBackupFlow(context, ref),
                    icon: const Icon(Icons.restore_page_outlined),
                    label: const Text('Import a backup…'),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Everything here is made on this device. Nothing is uploaded: each file goes only to the place you choose in '
            'the save dialog or share sheet.',
          ),
        ],
      ),
    );
  }
}
