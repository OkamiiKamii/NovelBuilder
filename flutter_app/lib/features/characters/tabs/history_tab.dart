import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/entry.dart';
import '../../../shared/domain/stable_sort.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import '../widgets/parts.dart';

/// A record line in words, as the original app says it.
String recordWords(CharacterHistoryLine h) {
  final (label, from, to) = (h.label, h.from, h.to);
  return switch (h.action) {
    'created' => 'Created the character “$label”.',
    'field' =>
      to == 'removed'
          ? 'Removed the field $label (it said “$from”).'
          : from.isNotEmpty
          ? (to.isNotEmpty ? 'Changed $label from “$from” to “$to”.' : 'Cleared $label (it said “$from”).')
          : 'Set $label to “$to”.',
    'identity' =>
      from.isNotEmpty
          ? (to.isNotEmpty ? 'Changed $label from “$from” to “$to”.' : 'Cleared $label (it was “$from”).')
          : 'Set $label to “$to”.',
    'section' => 'Section “$label” $to.',
    'archived' => 'Archived the character.',
    'restored' => 'Restored the character from the archive.',
    'portrait' => 'Portrait $label.',
    'template' => 'Applied the layout “$label” ($to).',
    'note' => 'Added the field $label, $to.',
    _ => label,
  };
}

/// Two records, side by side and never mixed: what happens to the character in the story, and what the author has
/// done to the character's record. Nothing is made up for changes made before this history existed.
class HistoryTab extends StatefulWidget {
  const HistoryTab({super.key, required this.cast, required this.entry, required this.actions});

  final CastData cast;
  final Entry entry;
  final CharacterActions actions;

  @override
  State<HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends State<HistoryTab> {
  final _text = TextEditingController();
  String? _nodeId;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _add() {
    if (_text.text.trim().isEmpty) return;
    final made = widget.actions.now((c) => c.addMilestone(widget.entry.id, _text.text, _nodeId));
    if (made != null) {
      _text.clear();
      setState(() => _nodeId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cast = widget.cast;
    final entry = widget.entry;
    final theme = Theme.of(context);
    final lines = cast.history(entry.id);
    int place(String? nodeId) => nodeId == null ? -1 : (cast.model.order.position[nodeId] ?? 1 << 30);
    final story = <({String key, int at, String? nodeId, String text, String source, String? removable})>[
      for (final h in lines)
        if (h.isStory)
          (key: h.id, at: place(h.nodeId), nodeId: h.nodeId, text: h.text, source: 'Milestone', removable: h.id),
      for (final relation in cast.model.relations.values)
        if (relation.fromId == entry.id || relation.toId == entry.id)
          if (cast.nameOf(relation.fromId == entry.id ? relation.toId : relation.fromId) case final other?)
            for (final (i, stage) in sortedStages(relation, cast.model.order).indexed)
              (
                key: '${relation.id}-${stage.id}',
                at: place(stage.startNodeId),
                nodeId: stage.startNodeId,
                text:
                    '${i == 0 ? 'Relationship with' : 'Relationship changes with'} $other: '
                    '${stage.title.isNotEmpty ? stage.title : (stage.label.isNotEmpty ? stage.label : 'related')}',
                source: 'Relationship',
                removable: null,
              ),
      for (final event in cast.model.events.values)
        if (event.characters.any((c) => c.id == entry.id))
          (
            key: event.id,
            at: event.nodeIds.isEmpty ? (1 << 30) - 1 : event.nodeIds.map(place).reduce((a, b) => a < b ? a : b),
            nodeId: event.nodeIds.firstOrNull,
            text: event.name,
            source: 'Timeline event',
            removable: null,
          ),
    ];
    final ordered = stableSorted(story, (a, b) => a.at - b.at);
    final record = [
      for (final h in lines)
        if (!h.isStory) h,
    ];
    final localizations = MaterialLocalizations.of(context);
    String when(num at) {
      final t = DateTime.fromMillisecondsSinceEpoch(at.toInt());
      return '${localizations.formatMediumDate(t)}, ${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(t))}';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfileBox(
          title: 'In the story',
          caption:
              'What happens to ${entry.name}, in reading order. Lines from relationships and the timeline belong to '
              'those records; milestones are yours to write here.',
          trailing: TextButton.icon(
            onPressed: () => GoRouter.of(context).go('/visualize/history?who=${entry.id}'),
            icon: const Icon(Icons.person_search_outlined),
            label: Text('${entry.name}’s whole life history'),
          ),
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 320,
                  child: TextField(
                    controller: _text,
                    decoration: const InputDecoration(
                      labelText: 'A milestone in the story',
                      hintText: 'Became commander of the guard',
                    ),
                    onSubmitted: (_) => _add(),
                  ),
                ),
                SizedBox(
                  width: 260,
                  child: DocumentChooser(
                    cast: cast,
                    label: 'Where',
                    value: _nodeId,
                    none: 'Before the story / not placed',
                    onChanged: (id) => setState(() => _nodeId = id),
                  ),
                ),
                FilledButton(onPressed: _add, child: const Text('Add milestone')),
              ],
            ),
            const SizedBox(height: 8),
            if (ordered.isEmpty) const NotRecorded('Nothing recorded yet.'),
            for (final line in ordered)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: SizedBox(
                  width: 120,
                  child: Text(
                    line.nodeId != null && cast.model.nodes.containsKey(line.nodeId)
                        ? documentName(cast, line.nodeId)
                        : (line.at < 0 ? 'Before the story' : 'Not placed'),
                    style: theme.textTheme.bodySmall,
                  ),
                ),
                title: Text(line.text),
                subtitle: Text(line.source),
                trailing: line.removable == null
                    ? null
                    : IconButton(
                        tooltip: 'Remove the milestone ${line.text}',
                        onPressed: () => widget.actions.now((c) => c.removeMilestone(line.removable!)),
                        icon: const Icon(Icons.close),
                      ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        ProfileBox(
          title: 'Changes to the record',
          caption:
              'What you have done to this profile, newest first. Changes made before this history existed are not '
              'listed: nothing here is reconstructed.',
          children: [
            if (record.isEmpty) const NotRecorded('No changes recorded yet.'),
            for (final h in record)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(recordWords(h)),
                subtitle: Text(when(h.at)),
              ),
          ],
        ),
      ],
    );
  }
}
