import 'package:flutter/material.dart';

import '../../../core/widgets/confirm_dialog.dart';
import '../../../core/widgets/saved_text_field.dart';
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/characters/knowledge.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/records/entry.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import '../widgets/parts.dart';

/// A character's secrets. What is true, what the character knows, what others know and what the reader knows are
/// kept apart for each one. This organises the story; it is not a lock.
class SecretsTab extends StatefulWidget {
  const SecretsTab({super.key, required this.cast, required this.entry, required this.actions});

  final CastData cast;
  final Entry entry;
  final CharacterActions actions;

  @override
  State<SecretsTab> createState() => _SecretsTabState();
}

class _SecretsTabState extends State<SecretsTab> {
  final _title = TextEditingController();

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  void _add() {
    if (_title.text.trim().isEmpty) return;
    final made = widget.actions.now((c) => c.saveSecret(widget.entry.id, null, {'title': _title.text}));
    if (made != null) _title.clear();
  }

  @override
  Widget build(BuildContext context) {
    final secrets = widget.cast.secrets(widget.entry.id);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'What is true, what ${widget.entry.name} knows, what others know and what the reader knows are kept apart '
          'for each secret.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 320,
              child: TextField(
                controller: _title,
                decoration: const InputDecoration(labelText: 'A new secret', hintText: 'Hidden parentage'),
                onSubmitted: (_) => _add(),
              ),
            ),
            FilledButton(onPressed: _add, child: const Text('Add secret')),
          ],
        ),
        const SizedBox(height: 12),
        if (secrets.isEmpty) const NotRecorded('No secrets recorded.'),
        for (final s in secrets) ...[
          _SecretCard(key: ValueKey(s.id), cast: widget.cast, entry: widget.entry, secret: s, actions: widget.actions),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _SecretCard extends StatelessWidget {
  const _SecretCard({super.key, required this.cast, required this.entry, required this.secret, required this.actions});

  final CastData cast;
  final Entry entry;
  final CharacterSecret secret;
  final CharacterActions actions;

  void _now(JsonMap changes) => actions.now((c) => c.saveSecret(entry.id, secret.id, changes));
  void _later(String what, JsonMap changes) =>
      actions.later('secret:${secret.id}:$what', (c) => c.saveSecret(entry.id, secret.id, changes));

  String _name(String id) => cast.nameOf(id) ?? 'Someone deleted';

  Widget _knowledge(String label, Knowledge value, ValueChanged<Knowledge> onChanged) =>
      DropdownButtonFormField<Knowledge>(
        key: ValueKey('${secret.id}:$label:${value.name}'),
        initialValue: value,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [for (final k in Knowledge.values) DropdownMenuItem(value: k, child: Text(k.label))],
        onChanged: (k) => k == null ? null : onChanged(k),
      );

  /// A record read aloud: "Mira suspects (“…”) in The Feast: overheard, from Kai."
  String _recordWords(KnowledgeRecord r) {
    final state = r.state;
    final where = [
      if (r.nodeId != null && cast.model.nodes.containsKey(r.nodeId)) 'in ${documentName(cast, r.nodeId)}',
      if (r.eventId != null && cast.model.events.containsKey(r.eventId)) 'at “${cast.model.events[r.eventId]!.name}”',
    ];
    final how = [
      if (r.how.trim().isNotEmpty) r.how.trim(),
      if (r.fromId != null) 'from ${_name(r.fromId!)}',
    ].join(', ');
    return '${_name(r.characterId)} ${state == null ? 'has a state this version does not know' : stateWords(state, r.belief)} '
        '${where.isEmpty ? 'with no chapter or event given' : where.join(', ')}${how.isEmpty ? '' : ': $how'}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Someone whose knowledge has a recorded history is kept in it, not in the lists.
    final recorded = {for (final r in secret.records) r.characterId};
    final people = [
      for (final p in cast.characters(except: entry.id))
        if (!recorded.contains(p.id)) (p.id, p.name),
    ];
    final withHistory = [
      for (final p in cast.characters(except: entry.id))
        if (recorded.contains(p.id)) p.name,
    ];
    final events = cast.model.events.values.toList();
    final threads = cast.model.threads.values.toList();
    final groups = whoKnowsWhat(secret);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: _spaced([
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: SavedTextField(
                    label: 'Secret',
                    value: secret.title,
                    style: theme.textTheme.titleMedium,
                    onChanged: (v) {
                      if (v.trim().isNotEmpty) _later('title', {'title': v});
                    },
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 170,
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('${secret.id}:status:${secret.status}'),
                    initialValue: secret.status,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Status'),
                    items: [
                      for (final s in {...secretStatuses, secret.status}) DropdownMenuItem(value: s, child: Text(s)),
                    ],
                    onChanged: (v) => _now({'status': v}),
                  ),
                ),
                IconButton(
                  tooltip: 'Delete the secret ${secret.title}',
                  onPressed: () async {
                    final ok = await showConfirmDialog(
                      context,
                      title: 'Delete the secret “${secret.title}”?',
                      message: 'What is written about it, and who knows it, go with it.',
                      confirmLabel: 'Delete secret',
                      destructive: true,
                    );
                    if (ok) actions.now((c) => c.removeSecret(secret.id));
                  },
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
            SavedTextField(
              label: 'What is true',
              hint: 'The fact itself, as it is in the story.',
              value: secret.description,
              multiline: true,
              onChanged: (v) => _later('description', {'description': v}),
            ),
            Text('Who knows', style: theme.textTheme.titleSmall),
            if (recorded.contains(entry.id))
              Text(
                'Does ${entry.name} know? ${currentOf(secret, entry.id).state?.label ?? 'Not recorded'} (from their '
                'recorded history below)',
              )
            else
              _knowledge('Does ${entry.name} know?', secret.self, (k) => _now({'self': k.name})),
            for (final (key, label) in [
              ('knows', 'Characters who know'),
              ('suspects', 'Characters who suspect'),
              ('unaware', 'Characters who are unaware'),
            ])
              IdPicker(
                label: label,
                chosen: strings(secret.raw[key]),
                options: people,
                nameOf: cast.nameOf,
                onChanged: (ids) => _now({key: ids}),
              ),
            if (withHistory.isNotEmpty)
              Text(
                '${withHistory.join(', ')} ${withHistory.length == 1 ? 'has' : 'have'} a recorded history, kept '
                'below as it is.',
                style: theme.textTheme.bodySmall,
              ),
            if (groups.isNotEmpty)
              Text(
                'Now: ${[for (final g in groups) '${g.state?.label ?? 'Not recorded'}: ${g.ids.map(_name).join(', ')}'].join(' · ')}',
                style: theme.textTheme.bodySmall,
              ),
            Text('The reader', style: theme.textTheme.titleSmall),
            _knowledge('What the reader knows', secret.reader, (k) => _now({'reader': k.name})),
            DocumentChooser(
              cast: cast,
              label: '…from this chapter on',
              value: secret.readerNodeId,
              onChanged: (id) => _now({'readerNodeId': id}),
            ),
            Text('In the story', style: theme.textTheme.titleSmall),
            DocumentChooser(
              cast: cast,
              label: 'First appears',
              value: secret.firstNodeId,
              onChanged: (id) => _now({'firstNodeId': id}),
            ),
            DocumentChooser(
              cast: cast,
              label: 'Revealed in',
              value: secret.revealNodeId,
              onChanged: (id) => _now({'revealNodeId': id}),
            ),
            if (events.isNotEmpty || secret.revealEventId != null)
              DropdownButtonFormField<String>(
                key: ValueKey('${secret.id}:event:${secret.revealEventId}'),
                initialValue: cast.model.events.containsKey(secret.revealEventId) || secret.revealEventId == null
                    ? (secret.revealEventId ?? '')
                    : '\u0000gone',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Reveal event'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Not set')),
                  if (secret.revealEventId != null && !cast.model.events.containsKey(secret.revealEventId))
                    const DropdownMenuItem(value: '\u0000gone', child: Text('A deleted event')),
                  for (final e in events)
                    DropdownMenuItem(
                      value: e.id,
                      child: Text(e.name, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) {
                  if (v != '\u0000gone') _now({'revealEventId': (v == null || v.isEmpty) ? null : v});
                },
              ),
            IdPicker(
              label: 'Related chapters',
              chosen: secret.nodeIds,
              options: [for (final d in cast.documents) (d.id, documentLabel(cast, d).trim())],
              nameOf: (id) => cast.model.nodes[id]?.displayTitle,
              onChanged: (ids) => _now({'nodeIds': ids}),
            ),
            if (threads.isNotEmpty || secret.threadIds.isNotEmpty)
              IdPicker(
                label: 'Related plot threads',
                chosen: secret.threadIds,
                options: [for (final t in threads) (t.id, t.title.isEmpty ? 'An untitled thread' : t.title)],
                onChanged: (ids) => _now({'threadIds': ids}),
              ),
            if (secret.records.isNotEmpty || secret.needs.isNotEmpty) ...[
              Text('How knowledge spreads (recorded)', style: theme.textTheme.titleSmall),
              Text(
                'Recorded with the original app, in the order things happen to each character. Kept exactly as they '
                'are; editing them comes with the continuity review.',
                style: theme.textTheme.bodySmall,
              ),
              for (final r in secret.records) Text('•  ${_recordWords(r)}'),
              for (final n in secret.needs)
                Text(
                  '•  ${_name(n.characterId)} acts on it'
                  '${n.nodeId != null ? ' in ${documentName(cast, n.nodeId)}' : ''}'
                  '${n.eventId != null && cast.model.events.containsKey(n.eventId) ? ' at “${cast.model.events[n.eventId]!.name}”' : ''}'
                  '${n.note.trim().isNotEmpty ? ': ${n.note.trim()}' : ''}',
                ),
            ],
            SavedTextField(
              label: 'Private author notes',
              value: secret.notes,
              multiline: true,
              onChanged: (v) => _later('notes', {'notes': v}),
            ),
          ]),
        ),
      ),
    );
  }
}

/// The parts of a card with room between them, so a heading never touches the field under it.
List<Widget> _spaced(List<Widget> parts) => [
  for (final (i, p) in parts.indexed) ...[if (i > 0) SizedBox(height: p is Text ? 16 : 10), p],
];
