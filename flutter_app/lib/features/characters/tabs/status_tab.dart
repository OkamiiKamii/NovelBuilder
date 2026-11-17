import 'package:flutter/material.dart';

import '../../../core/format.dart';
import '../../../core/widgets/text_prompt.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/collation.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/stable_sort.dart';
import '../../../shared/domain/systems/compute.dart' show SheetProfile;
import '../../progression/progression_providers.dart';
import '../../progression/widgets/status_window.dart';
import '../../progression/widgets/system_speaks.dart' show windowKindOf;
import '../characters_providers.dart';
import '../widgets/vault.dart';

/// THEIR STATUS: in a novel with systems, the first thing a character's page shows. Their sheet on the system drawn as
/// the story's own screen would draw it (`status_window.dart`): who they are, their level, the bars of what is left,
/// their attributes and what they hold, every number worked out by the system from their own. Beside it, who they are
/// in brief: the summary, where they are in the book, how many ties they have, and the pages to go to from here.
///
/// A character made since the system was begun has a sheet already; one from before is shown as they would begin, with
/// one press to give them the sheet.
class StatusTab extends StatefulWidget {
  const StatusTab({super.key, required this.cast, required this.listed, required this.onOpen});

  final CastData cast;
  final Listed listed;

  /// Goes to another of the character's tabs, by name ('progression', 'relationships'…).
  final ValueChanged<String> onOpen;

  @override
  State<StatusTab> createState() => _StatusTabState();
}

class _StatusTabState extends State<StatusTab> {
  String? _systemId;

  /// Whether the window is changing their sheet, in place.
  bool _editing = false;

  void _apply(String sheetId, SheetEdit e) => ProgressionActions(context, widget.cast.novelId).systems(
    (x) => x.updateSheet(
      sheetId,
      (c) => {
        if (e.track)
          'progress': {...?mapOrNull(c.raw['progress']), e.id: e.value}
        else
          'values': {...?mapOrNull(c.raw['values']), e.id: e.value},
      },
    ),
  );

  void _hold(String sheetId, String itemId, bool hold) => ProgressionActions(context, widget.cast.novelId).systems(
    (x) => x.updateSheet(
      sheetId,
      (c) => {
        'itemIds': [
          for (final id in c.itemIds)
            if (id != itemId) id,
          if (hold) itemId,
        ],
      },
    ),
  );

  /// One new to the system, named here: made in [groupId] and held by them, in one change. A name the group has already
  /// (letter case aside) is that one, held: never two of the same.
  Future<void> _new(String systemId, String sheetId, String groupId, String group, String name) async {
    final typed = await showTextPrompt(
      context,
      title: 'New in $group',
      label: 'Name',
      hint: 'Held by $name, and in the system for anyone after.',
      confirmLabel: 'Give it to $name',
    );
    final named = typed?.trim() ?? '';
    if (named.isEmpty || !mounted) return;
    ProgressionActions(context, widget.cast.novelId).systems((x) {
      final system = x.systems().firstWhere((s) => s.id == systemId);
      final same = system.items
          .where((i) => i.groupId == groupId && i.name.trim().toLowerCase() == named.toLowerCase())
          .firstOrNull;
      final id = same?.id ?? x.newId();
      if (same == null) {
        x.updateSystem(
          systemId,
          (c) => {
            'items': [
              ...maps(c.raw['items']),
              {'id': id, 'groupId': groupId, 'name': named},
            ],
          },
        );
      }
      x.updateSheet(
        sheetId,
        (c) => {
          'itemIds': [
            for (final i in c.itemIds)
              if (i != id) i,
            id,
          ],
        },
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final model = widget.cast.model;
    final entry = widget.listed.entry;
    final name = entry.name;
    final systems = stableSorted(model.systems.values, (a, b) {
      final c = a.createdAt.compareTo(b.createdAt);
      return c != 0 ? c : localeCompare(a.name, b.name);
    });
    if (systems.isEmpty) return const SizedBox.shrink();
    final system = systems.where((s) => s.id == _systemId).firstOrNull ?? systems.first;
    final sheet = model.sheets.where((s) => s.entryId == entry.id && s.systemId == system.id).firstOrNull;
    final scheme = Theme.of(context).colorScheme;

    final window = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (systems.length > 1) ...[
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in systems)
                ChoiceChip(
                  label: Text(s.name),
                  selected: s.id == system.id,
                  onSelected: (_) => setState(() => _systemId = s.id),
                ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        StatusWindow(
          key: ValueKey('status-${system.id}-${sheet?.id}'),
          content: system.raw,
          presetId: windowKindOf(system),
          holder: name,
          held: sheet?.itemIds ?? const [],
          profile: sheet == null ? null : SheetProfile.of(sheet),
          // Changed right here: a level, what is left, their own numbers, a stage; saved as each is changed.
          onEdit: sheet != null && _editing ? (e) => _apply(sheet.id, e) : null,
          // And what they hold: a power, a class, a title given or taken away.
          onHold: sheet != null && _editing ? (id, hold) => _hold(sheet.id, id, hold) : null,
          // And one the system does not have yet: a power the story has just given them.
          onNew: sheet != null && _editing ? (groupId, group) => _new(system.id, sheet.id, groupId, group, name) : null,
          caption: sheet == null
              ? 'As $name would begin in ${system.name}: not on a sheet yet.'
              : _editing
              ? 'Each change is kept at once: a number, a stage, a power given or taken away. What follows (the most of each, damage…) the system works out.'
              : '$name in ${system.name}. Their numbers and what they hold are changed here; experience and points, on their whole sheet.',
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (sheet == null)
              FilledButton.icon(
                onPressed: () =>
                    ProgressionActions(context, widget.cast.novelId).systems((x) => x.addSheet(system.id, entry.id)),
                icon: const Icon(Icons.add_chart),
                label: Text('Give $name a sheet in ${system.name}'),
              )
            else ...[
              FilledButton.tonalIcon(
                onPressed: () => setState(() => _editing = !_editing),
                icon: Icon(_editing ? Icons.check : Icons.tune),
                label: Text(_editing ? 'Done' : 'Change their numbers'),
              ),
              OutlinedButton.icon(
                onPressed: () => widget.onOpen('progression'),
                icon: const Icon(Icons.edit_outlined),
                label: const Text('Their whole sheet'),
              ),
            ],
          ],
        ),
      ],
    );

    final ties = model.relations.values.where((r) => r.fromId == entry.id || r.toId == entry.id).length;
    final summary = VaultFrame(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'PROFILE SUMMARY',
                  style: vaultHeading(context, size: 12, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            entry.summary.trim().isEmpty ? 'No summary yet.' : entry.summary.trim(),
            style: vaultText(
              context,
              size: 16,
              style: entry.summary.trim().isEmpty ? FontStyle.italic : null,
              color: entry.summary.trim().isEmpty ? scheme.onSurfaceVariant : null,
            ),
          ),
          const VaultRule(),
          _Count(label: 'Chapters linked', value: widget.listed.linkedIn.length),
          _Count(label: 'In the text', value: widget.listed.seenIn.length),
          _Count(label: 'Relationships', value: ties),
          _Count(label: 'Systems', value: model.sheets.where((s) => s.entryId == entry.id).length),
          const VaultRule(),
          Text(
            'GO TO',
            style: vaultHeading(context, size: 12, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
          ),
          const SizedBox(height: 6),
          for (final (tab, icon, label) in [
            ('progression', Icons.trending_up, 'Their sheet and progression'),
            ('relationships', Icons.hub_outlined, 'Relationships'),
            ('details', Icons.badge_outlined, 'Details'),
            ('history', Icons.history, 'History'),
          ])
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(alignment: AlignmentDirectional.centerStart),
                onPressed: () => widget.onOpen(tab),
                icon: Icon(icon),
                label: Text(label),
              ),
            ),
        ],
      ),
    );

    return LayoutBuilder(
      builder: (context, box) => box.maxWidth >= 760
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(flex: 3, child: window),
                const SizedBox(width: 20),
                Expanded(flex: 2, child: summary),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [window, const SizedBox(height: 16), summary],
            ),
    );
  }
}

class _Count extends StatelessWidget {
  const _Count({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      children: [
        Expanded(child: Text(label, style: vaultText(context, size: 15))),
        Text(formatNumber(value), style: vaultHeading(context, size: 15, weight: 700)),
      ],
    ),
  );
}
