import 'package:flutter/material.dart';

import '../../../core/format.dart';
import '../../../shared/domain/collation.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/entry.dart';
import '../../../shared/domain/relationships/history.dart';
import '../../../shared/domain/relationships/relation_types.dart';
import '../../../shared/domain/stable_sort.dart';
import '../../relationships/relationship_page.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import '../widgets/parts.dart';
import '../widgets/portrait.dart';

/// The character's relationships, each with how it stands now and how many states its history holds. Opening one
/// shows its whole history, where changes are recorded. Nothing is inferred: a role is shown only as the author set it.
class RelationshipsTab extends StatelessWidget {
  const RelationshipsTab({super.key, required this.cast, required this.entry, required this.actions});

  final CastData cast;
  final Entry entry;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rows = stableSorted([
      for (final relation in cast.model.relations.values)
        if (relation.fromId == entry.id || relation.toId == entry.id)
          if (cast.model.entries[relation.fromId == entry.id ? relation.toId : relation.fromId] case final other?)
            (relation: relation, other: other),
    ], (a, b) => localeCompare(a.other.name, b.other.name));
    return ProfileBox(
      title: 'Relationships (${rows.length})',
      trailing: Wrap(
        spacing: 8,
        children: [
          TextButton(
            onPressed: () => actions.router.go('/organize/relationships/settings'),
            child: const Text('Types and attributes…'),
          ),
          FilledButton.icon(
            onPressed: () async {
              final id = await addRelationshipFlow(context, cast, actions, entry.id);
              if (id != null) actions.router.go(relationshipPath(id));
            },
            icon: const Icon(Icons.add),
            label: const Text('Add a relationship'),
          ),
        ],
      ),
      children: [
        if (rows.isEmpty) NotRecorded('${entry.name} has no relationships recorded yet.'),
        for (final r in rows)
          () {
            final stage = stageAt(r.relation, null, cast.model.order);
            final role = stage == null ? '' : roleOf(stage, r.relation, r.other.id);
            final words = [
              role,
              if (stage != null && stage.title.isNotEmpty) stage.title,
              if (stage != null) RelationCategory.of(stage.category).label,
              if (stage != null) (Affinity.of(stage.affinity) ?? Affinity.neutral).label,
              if (r.relation.stages.length > 1) '${formatNumber(r.relation.stages.length)} stages over the story',
            ];
            return ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Portrait(
                name: r.other.name,
                image: r.other.image,
                focal: cast.profiles[r.other.id]?.focal,
                size: 40,
              ),
              title: Text(r.other.name),
              subtitle: Text(words.where((w) => w.isNotEmpty).join(' · '), style: theme.textTheme.bodySmall),
              onTap: () => actions.router.go(relationshipPath(r.relation.id)),
              trailing: const Icon(Icons.chevron_right, semanticLabel: 'Open the relationship'),
            );
          }(),
      ],
    );
  }
}
