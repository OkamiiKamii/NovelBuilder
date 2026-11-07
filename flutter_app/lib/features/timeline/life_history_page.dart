import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/states.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/timeline/ages.dart';
import '../../shared/domain/timeline/life_history.dart';
import '../characters/widgets/parts.dart';
import '../codex/widgets/connections_panel.dart' show openRecord;
import '../visualize/viz_frame.dart';
import 'timeline_providers.dart';

/// Visualize → Character history: everything recorded about one character, put together. Each line is a reference
/// to the record it comes from; nothing is copied. Story time and reading order stay apart: a chapter is never
/// compared with a date.
class LifeHistoryPage extends ConsumerWidget {
  const LifeHistoryPage({super.key, this.who});

  final String? who;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(timelineProvider);
    // Whose history it is is what a saved view of it keeps; the shared filters do not narrow one life.
    Widget frame(Widget child) => VizFrame(
      view: 'history',
      title: 'Character history',
      subtitle: data?.cast.novelTitle,
      filters: false,
      config: () => {
        'mode': 'list',
        'layout': {'who': ?who},
      },
      onApply: (c) {
        final who = strOrNull(mapOrNull(c['layout'])?['who']);
        GoRouter.of(context).go(who == null ? '/visualize/history' : '/visualize/history?who=$who');
      },
      child: child,
    );
    if (data == null) return frame(const SizedBox.shrink());
    final actions = TimelineActions(context, data.novelId);
    final characters = data.cast.characters();
    final chosen = characters.any((c) => c.id == who) ? who : null;
    final life = chosen == null
        ? null
        : lifeHistory(
            data.model,
            chosen,
            snapshots: data.cast.snapshot.rows('progressSnapshots'),
            milestones: [for (final r in data.cast.snapshot.rows('characterHistory')) CharacterHistoryLine(r)],
          );

    void open(HistoryItem item) {
      final ref = item.ref;
      if (ref != null) {
        if (ref.type == EntityType.event) return actions.openEvent(ref.id);
        if (ref.type == EntityType.entry && ref.id == chosen) return actions.openCharacter(ref.id);
        return openRecord(actions, data.cast, ref);
      }
      // Milestones live on the character's History tab; the other pages come in later phases.
      if (item.to?.page == 'history' && chosen != null) actions.openCharacter(chosen, tab: 'history');
    }

    Widget section(String title, String caption, List<HistoryItem> items, String empty) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: ProfileBox(
        title: title,
        caption: caption,
        children: [
          if (items.isEmpty) NotRecorded(empty),
          for (final i in items)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(i.title),
              subtitle: Text(
                [
                  i.when,
                  if (i.age != null && ageLabel(i.age!).isNotEmpty) ageLabel(i.age!),
                  if (i.detail.isNotEmpty) i.detail,
                ].join(' · '),
              ),
              leading: Tooltip(
                message: i.kind.label,
                child: Icon(_icons[i.kind], semanticLabel: i.kind.label),
              ),
              onTap: i.ref != null || i.to?.page == 'history' ? () => open(i) : null,
            ),
        ],
      ),
    );

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            key: ValueKey('who:$chosen'),
            initialValue: chosen ?? '',
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Whose history'),
            items: [
              const DropdownMenuItem(value: '', child: Text('Choose a character')),
              for (final c in characters)
                DropdownMenuItem(
                  value: c.id,
                  child: Text(c.name, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) =>
                actions.router.go(v == null || v.isEmpty ? '/visualize/history' : '/visualize/history?who=$v'),
          ),
          const SizedBox(height: 16),
          if (characters.isEmpty)
            const EmptyState(
              icon: Icons.person_outline,
              title: 'No characters yet',
              message: 'Add characters under Organize, and their history gathers here from everything you record.',
            )
          else if (life == null)
            const NotRecorded('Choose a character to see their whole history.')
          else ...[
            Semantics(liveRegion: true, child: Text(life.born)),
            const SizedBox(height: 12),
            if (life.issues.isNotEmpty) ...[
              ProfileBox(
                title: 'Worth a look',
                caption: 'Nothing is changed: each stated age still shows as stated.',
                children: [
                  for (final issue in life.issues)
                    Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(issue)),
                ],
              ),
              const SizedBox(height: 16),
            ],
            section(
              'In story time',
              'Events they take part in, with their age and where they were; ties dated by an event or a date.',
              life.story,
              'Nothing dated in story time yet.',
            ),
            section(
              'As the reader meets them',
              'Chapters they appear in, relationship changes and milestones, in reading order.',
              life.reading,
              'Not met in any chapter yet.',
            ),
            section('Throughout', 'Ties with no time given, and what they hold.', life.throughout, 'Nothing else.'),
          ],
        ],
      ),
    );
  }
}

const _icons = {
  HistoryItemKind.birth: Icons.cake_outlined,
  HistoryItemKind.event: Icons.event_outlined,
  HistoryItemKind.place: Icons.place_outlined,
  HistoryItemKind.affiliation: Icons.groups_outlined,
  HistoryItemKind.ability: Icons.auto_awesome_outlined,
  HistoryItemKind.appearance: Icons.menu_book_outlined,
  HistoryItemKind.relationship: Icons.people_outline,
  HistoryItemKind.milestone: Icons.flag_outlined,
  HistoryItemKind.progress: Icons.trending_up,
  HistoryItemKind.journey: Icons.route_outlined,
};
