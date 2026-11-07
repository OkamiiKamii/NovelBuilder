import 'package:flutter/material.dart';

import '../../shared/domain/collation.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import 'progression_providers.dart';
import 'widgets/sheet_editor.dart';
import 'widgets/snapshots.dart';
import 'widgets/tracker.dart';

/// A character's Progression tab: how they change over the story, change by change; their sheets on the novel's
/// system blueprints; and snapshots of their whole state at chapters. Nothing is assumed: a character with nothing
/// recorded has no level, no statistics and no empty rows.
class ProgressionTab extends StatelessWidget {
  const ProgressionTab({super.key, required this.cast, required this.entry, required this.actions});
  final CastData cast;
  final Entry entry;
  final ProgressionActions actions;

  @override
  Widget build(BuildContext context) {
    final model = cast.model;
    final theme = Theme.of(context);
    final sheets = stableSorted(
      model.sheets.where((s) => s.entryId == entry.id && model.systems.containsKey(s.systemId)),
      (a, b) => localeCompare(model.systems[a.systemId]!.name, model.systems[b.systemId]!.name),
    );
    final free = stableSorted(
      model.systems.values.where((s) => !sheets.any((x) => x.systemId == s.id)),
      (a, b) => localeCompare(a.name, b.name),
    );
    const gap = SizedBox(height: 16);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProgressTracker(model: model, entryId: entry.id, actions: actions),
        gap,
        ProfileBox(
          title: 'System sheets',
          caption:
              'Put ${entry.name} on one of the novel’s system blueprints to give them a sheet. A sheet keeps only what is '
              'their own; everything a class or skill brings is read from the blueprint.',
          children: [
            if (model.systems.isEmpty)
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text('This novel has no system blueprints.', style: theme.textTheme.bodySmall),
                  TextButton(onPressed: () => actions.openSystems(), child: const Text('Open Systems')),
                ],
              ),
            for (final sheet in sheets)
              ExpansionTile(
                key: PageStorageKey('sheet:${sheet.id}'),
                tilePadding: EdgeInsets.zero,
                initiallyExpanded: sheets.length == 1,
                title: Text(model.systems[sheet.systemId]!.name),
                childrenPadding: const EdgeInsets.only(bottom: 12),
                children: [
                  SheetEditor(
                    model: model,
                    system: model.systems[sheet.systemId]!,
                    sheet: sheet,
                    name: entry.name,
                    actions: actions,
                  ),
                ],
              ),
            if (free.isNotEmpty)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: PopupMenuButton<String>(
                  tooltip: 'Add ${entry.name} to a system',
                  onSelected: (id) => actions.systems((x) => x.addSheet(id, entry.id)),
                  itemBuilder: (_) => [for (final s in free) PopupMenuItem(value: s.id, child: Text(s.name))],
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text('Add ${entry.name} to a system…', style: TextStyle(color: theme.colorScheme.primary)),
                  ),
                ),
              ),
          ],
        ),
        gap,
        SnapshotsSection(model: model, snapshots: snapshotsOf(cast.snapshot), entryId: entry.id, actions: actions),
      ],
    );
  }
}
