import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../app/shell/app_shortcuts.dart';
import '../../app/theme/theme_choice.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/form_section.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/save_status_indicator.dart';
import '../../shared/data/providers.dart';
import '../../shared/data/sample_novel.dart';
import '../library/backup_actions.dart';
import '../library/library_actions.dart';
import '../tutorial/tutorial.dart';
import '../workspace/open_novel.dart';
import '../write/writing_prefs_controls.dart';
import 'theme_swatches.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final choice = ref.watch(themeChoiceProvider);
    final muted = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    return PageScaffold(
      title: 'Settings',
      // On a phone there is no bar on the shelf: the way back to the Library is here.
      leading: WindowSize.of(context) == WindowSize.compact
          ? Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: TextButton.icon(
                onPressed: () => context.go(Destination.library.path),
                icon: const Icon(Icons.arrow_back),
                label: const Text('Library'),
              ),
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _ThisNovel(),
          FormSection(
            title: 'Appearance',
            children: [ThemeSwatches(choice: choice, onChoose: ref.read(themeChoiceProvider.notifier).choose)],
          ),
          const SizedBox(height: 16),
          FormSection(
            title: 'Keyboard shortcuts',
            children: [
              for (final d in Destination.values)
                Row(
                  children: [
                    Expanded(child: Text(d.label)),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Text(
                        d == Destination.settings ? '${shortcutLabel(d)} or $primaryModifierLabel,' : shortcutLabel(d),
                        style: muted,
                        textAlign: TextAlign.end,
                      ),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 16),
          const FormSection(title: 'Writing', children: [WritingPrefsControls()]),
          const SizedBox(height: 16),
          FormSection(
            title: 'Tutorial',
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: () => showTutorial(context),
                  icon: const Icon(Icons.school_outlined),
                  label: const Text('Open the tutorial'),
                ),
              ),
              const TutorialSwitch(),
            ],
          ),
          const SizedBox(height: 16),
          const _SampleNovel(),
          const SizedBox(height: 16),
          const FormSection(title: 'Saving', children: [SaveStatusIndicator()]),
          const SizedBox(height: 16),
          FormSection(
            title: 'Import & export',
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.tonalIcon(
                  onPressed: () => GoRouter.of(context).go('${Destination.settings.path}/import-export'),
                  icon: const Icon(Icons.import_export),
                  label: const Text('Open Import & export'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const _RestorePoints(),
          const SizedBox(height: 16),
          FormSection(
            title: 'Your data',
            children: [
              const Text(
                'Everything stays on this device. Novel Builder has no account, no cloud service and no AI, '
                'and it sends nothing anywhere. To keep a copy elsewhere, export a backup from the Library.',
              ),
              if (ref.watch(databaseProvider).path case final path?)
                SelectableText('Library file: $path', style: muted),
            ],
          ),
        ],
      ),
    );
  }
}

/// The sample novel, which a new library starts with: another copy on request (your own novels are not touched).
class _SampleNovel extends ConsumerWidget {
  const _SampleNovel();

  @override
  Widget build(BuildContext context, WidgetRef ref) => FormSection(
    title: 'Sample novel',
    children: [
      const Text(
        '$sampleNovelTitle: fifteen chapters, with its people, places, plot threads, chapter plans and timeline '
        'filled in, to try every part of the app on. A new library starts with it. Adding it again puts another '
        'copy on the shelf; nothing else changes.',
      ),
      Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(
          onPressed: () {
            final novel = addSampleNovel(
              ref.read(novelStoreProvider),
              now: DateTime.now().millisecondsSinceEpoch,
              title: ref.read(libraryServiceProvider).uniqueTitle(sampleNovelTitle),
            );
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('“${novel.title}” is in your library.'),
                action: SnackBarAction(
                  label: 'Open',
                  onPressed: () {
                    ref.read(openNovelProvider.notifier).open(novel.id);
                    GoRouter.of(context).go(Destination.write.path);
                  },
                ),
              ),
            );
          },
          icon: const Icon(Icons.auto_stories_outlined),
          label: const Text('Add the sample novel'),
        ),
      ),
    ],
  );
}

/// Whole-novel copies kept before an import or a restore replaced a novel. Restoring one is itself undoable.
class _RestorePoints extends ConsumerWidget {
  const _RestorePoints();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final points = ref.watch(restorePointsProvider);
    final muted = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    final local = MaterialLocalizations.of(context);
    return FormSection(
      title: 'Restore points',
      children: [
        if (points.isEmpty) Text('None yet.', style: muted),
        for (final p in points)
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.title.isEmpty ? 'Untitled novel' : p.title),
                    Text(
                      '${p.reason} · ${local.formatMediumDate(p.createdAt)} ${local.formatTimeOfDay(TimeOfDay.fromDateTime(p.createdAt))}',
                      style: muted,
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () async {
                  final ok = await showConfirmDialog(
                    context,
                    title: 'Restore “${p.title}”?',
                    message:
                        'The novel goes back to how it was at this point. Its current version is kept as a restore '
                        'point first, so this can be undone.',
                    confirmLabel: 'Restore',
                  );
                  if (!ok || !context.mounted) return;
                  try {
                    ref.read(backupServiceProvider).restore(p.id);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Restored “${p.title}”.')));
                    }
                  } on Object catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(
                        context,
                      ).showSnackBar(SnackBar(content: Text('It could not be restored, and nothing was changed: $e')));
                    }
                  }
                },
                child: const Text('Restore'),
              ),
            ],
          ),
      ],
    );
  }
}

/// The open novel's own settings: its details, a backup, and closing it.
class _ThisNovel extends ConsumerWidget {
  const _ThisNovel();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(openNovelProvider);
    final novel = id == null ? null : ref.watch(libraryProvider).where((n) => n.id == id).firstOrNull;
    if (novel == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: FormSection(
        title: 'This novel: ${novel.title}',
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton(onPressed: () => editNovelFlow(context, ref, novel), child: const Text('Edit details')),
              OutlinedButton(
                onPressed: () => exportBackupFlow(context, ref, novel),
                child: const Text('Export backup'),
              ),
              TextButton(
                onPressed: () => ref.read(openNovelProvider.notifier).close(),
                child: const Text('Close novel'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
