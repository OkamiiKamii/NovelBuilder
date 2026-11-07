import 'package:flutter/material.dart';

import '../../../core/widgets/confirm_dialog.dart';
import '../../../shared/domain/collation.dart';
import '../../../shared/domain/integrity/rules.dart';
import '../../../shared/domain/model/connections.dart';
import '../../../shared/domain/model/entity_ref.dart';
import '../../../shared/domain/records/canon.dart';
import '../../../shared/domain/records/link.dart';
import '../../../shared/domain/stable_sort.dart';
import '../../characters/character_actions.dart';
import '../../characters/characters_providers.dart';
import '../../characters/widgets/parts.dart';

/// Opens a record where it lives, when it has a page yet: an entry, a chapter or scene.
void openRecord(CharacterActions actions, CastData cast, EntityRef ref) {
  switch (ref.type) {
    case EntityType.entry:
      actions.openEntry(ref.id, character: cast.model.entries[ref.id]?.category == 'character');
    case EntityType.node:
      actions.openChapter(ref.id);
    case EntityType.event:
      actions.flush();
      actions.router.go('/plan/event/${ref.id}');
    case EntityType.relation:
      actions.flush();
      actions.router.go('/organize/relationship/${ref.id}');
    default:
      break;
  }
}

bool _opens(EntityRef ref) =>
    ref.type == EntityType.entry ||
    ref.type == EntityType.node ||
    ref.type == EntityType.event ||
    ref.type == EntityType.relation;

/// Every connection a record has, both ways: what it points at and what points at it, read from where each is kept.
/// Each opens the record at the other end when it has a page. A connection you recorded shows its status and can be
/// changed or removed; the rest are facts of other records, changed where they are kept.
class ConnectionsPanel extends StatelessWidget {
  const ConnectionsPanel({super.key, required this.cast, required this.self, required this.actions});

  final CastData cast;
  final EntityRef self;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    String name(EntityRef ref) => cast.model.resolve(ref)?.label ?? 'Something deleted';
    final seen = stableSorted(
      connectionsOf(cast.derived.connections, self),
      (a, b) => localeCompare(name(a.other), name(b.other)),
    );
    return ProfileBox(
      title: 'Every connection (${seen.length})',
      trailing: TextButton.icon(
        onPressed: () => showConnectionDialog(context, cast: cast, actions: actions, from: self),
        icon: const Icon(Icons.add_link),
        label: const Text('Add a connection'),
      ),
      children: [
        if (seen.isEmpty) const NotRecorded('Nothing points here yet, and this points at nothing.'),
        for (final s in seen)
          () {
            final label = (s.outgoing ? s.label : s.connection.label).isNotEmpty
                ? (s.outgoing ? s.label : s.connection.label)
                : 'related to';
            final other = _opens(s.other)
                ? TextButton(
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
                    onPressed: () => openRecord(actions, cast, s.other),
                    child: Text(name(s.other)),
                  )
                : Text(name(s.other), style: const TextStyle(fontWeight: FontWeight.w600));
            final status = statusOf(s.connection);
            final stored = s.connection.kind == ConnectionKind.link;
            final canon = CanonStatus.of(s.connection.canon) ?? CanonStatus.canon;
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Wrap(
                spacing: 6,
                runSpacing: 2,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (s.outgoing) ...[Text(label), other] else ...[other, Text('${_lower(label)} this')],
                  if (status != null)
                    Chip(
                      label: Text(connectionStatusLabel(canon)),
                      visualDensity: VisualDensity.compact,
                      avatar: Icon(_statusIcon(status), size: 16),
                    ),
                  Text(
                    '· kept in ${sourceWords[s.connection.source.collection] ?? s.connection.source.collection}',
                    style: theme.textTheme.bodySmall,
                  ),
                  if (stored) ...[
                    IconButton(
                      tooltip: 'Change this connection',
                      visualDensity: VisualDensity.compact,
                      onPressed: () {
                        final link = cast.model.links.where((l) => l.id == s.connection.source.id).firstOrNull;
                        if (link != null) {
                          showConnectionDialog(context, cast: cast, actions: actions, from: self, editing: link);
                        }
                      },
                      icon: const Icon(Icons.edit_outlined),
                    ),
                    IconButton(
                      tooltip: 'Remove this connection',
                      visualDensity: VisualDensity.compact,
                      onPressed: () async {
                        final ok = await showConfirmDialog(
                          context,
                          title: 'Remove this connection?',
                          message: 'The records at both ends are not changed.',
                          confirmLabel: 'Remove',
                          destructive: true,
                        );
                        if (ok) actions.now((c) => c.removeConnection(s.connection.source.id));
                      },
                      icon: const Icon(Icons.link_off),
                    ),
                  ],
                ],
              ),
            );
          }(),
      ],
    );
  }
}

String _lower(String s) => s.isEmpty ? s : '${s[0].toLowerCase()}${s.substring(1)}';

/// A sign beside each status, so it is never told by colour alone.
IconData _statusIcon(ConnectionStatus s) => switch (s) {
  ConnectionStatus.confirmed => Icons.check_circle_outline,
  ConnectionStatus.provisional => Icons.pending_outlined,
  ConnectionStatus.disputed => Icons.help_outline,
  ConnectionStatus.invalid => Icons.block,
};

/// The records a connection can join, by kind, for choosing the other end.
List<(EntityRef, String)> connectableRecords(CastData cast, EntityType type, EntityRef except) {
  final model = cast.model;
  final out = switch (type) {
    EntityType.entry => [for (final e in cast.entries) (EntityRef(EntityType.entry, e.id), e.name)],
    EntityType.node => [
      for (final n in cast.documents) (EntityRef(EntityType.node, n.id), documentLabel(cast, n).trim()),
    ],
    EntityType.event => [for (final e in model.events.values) (EntityRef(EntityType.event, e.id), e.name)],
    EntityType.thread => [for (final t in model.threads.values) (EntityRef(EntityType.thread, t.id), t.title)],
    _ => <(EntityRef, String)>[],
  };
  final kept = [
    for (final r in out)
      if (r.$1 != except) r,
  ];
  return type == EntityType.node ? kept : stableSorted(kept, (a, b) => localeCompare(a.$2, b.$2));
}

const _otherKinds = [
  (EntityType.entry, 'Character or codex entry'),
  (EntityType.node, 'Chapter or scene'),
  (EntityType.event, 'Timeline event'),
  (EntityType.thread, 'Plot thread'),
];

/// Asks for a new connection from [from] (or changes [editing]): its kind (a known one or the author's own word),
/// the other end, each side's words, notes and status.
Future<void> showConnectionDialog(
  BuildContext context, {
  required CastData cast,
  required CharacterActions actions,
  required EntityRef from,
  Link? editing,
}) => showDialog<void>(
  context: context,
  builder: (_) => _ConnectionDialog(cast: cast, actions: actions, from: from, editing: editing),
);

class _ConnectionDialog extends StatefulWidget {
  const _ConnectionDialog({required this.cast, required this.actions, required this.from, this.editing});

  final CastData cast;
  final CharacterActions actions;
  final EntityRef from;
  final Link? editing;

  @override
  State<_ConnectionDialog> createState() => _ConnectionDialogState();
}

class _ConnectionDialogState extends State<_ConnectionDialog> {
  late String _kind = connectionTypes.any((t) => t.key == widget.editing?.type)
      ? widget.editing!.type!
      : (widget.editing == null ? 'related' : '\u0000own');
  late final _own = TextEditingController(
    text: widget.editing != null && !connectionTypes.any((t) => t.key == widget.editing!.type)
        ? (widget.editing!.type ?? '')
        : '',
  );
  late final _label = TextEditingController(text: widget.editing?.fromLabel ?? '');
  late final _reverse = TextEditingController(text: widget.editing?.toLabel ?? '');
  late final _notes = TextEditingController(text: widget.editing?.notes ?? '');
  EntityType _otherType = EntityType.entry;
  EntityRef? _to;
  late CanonStatus _canon = widget.editing?.canon ?? CanonStatus.canon;

  @override
  void dispose() {
    for (final c in [_own, _label, _reverse, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  String get _type => _kind == '\u0000own' ? _own.text.trim() : _kind;

  void _save() {
    final editing = widget.editing;
    final saved = editing == null
        ? widget.actions.now(
            (c) => c.createConnection(
              from: widget.from,
              to: _to!,
              type: _type,
              label: _label.text,
              reverseLabel: _reverse.text,
              notes: _notes.text,
              canon: _canon == CanonStatus.canon ? null : _canon,
            ),
          )
        : widget.actions.now(
            (c) => c.updateConnection(
              editing.id,
              type: _type,
              label: _label.text,
              reverseLabel: _reverse.text,
              notes: _notes.text,
              canon: (value: _canon == CanonStatus.canon ? null : _canon),
            ),
          );
    if (saved != null) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final cast = widget.cast;
    final kind = connectionType(_type.isEmpty ? null : _type);
    final options = connectableRecords(cast, _otherType, widget.from);
    final selfName = cast.model.resolve(widget.from)?.label ?? 'This';
    final ready = (widget.editing != null || _to != null) && _type.isNotEmpty;
    final reads = kind.reciprocal
        ? 'Reads the same from both ends.'
        : kind.inverse != null
        ? 'From the other end it reads “${kind.inverse}”.'
        : 'One-sided: it says nothing about what the other side thinks. Add their own connection if they have one.';
    return AlertDialog(
      title: Text(widget.editing == null ? 'Add a connection' : 'Change the connection'),
      scrollable: true,
      content: SizedBox(
        width: 480,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('From $selfName', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _kind,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Kind of connection'),
              items: [
                for (final t in connectionTypes) DropdownMenuItem(value: t.key, child: Text(t.label)),
                const DropdownMenuItem(value: '\u0000own', child: Text('A kind of my own…')),
              ],
              onChanged: (v) => setState(() => _kind = v ?? _kind),
            ),
            if (_kind == '\u0000own') ...[
              const SizedBox(height: 12),
              TextField(
                controller: _own,
                autofocus: true,
                decoration: const InputDecoration(labelText: 'Your kind, kept as written', hintText: 'sworn enemy of'),
                onChanged: (_) => setState(() {}),
              ),
            ],
            const SizedBox(height: 4),
            Text(reads, style: Theme.of(context).textTheme.bodySmall),
            if (widget.editing == null) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<EntityType>(
                initialValue: _otherType,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Connected to a…'),
                items: [for (final (t, l) in _otherKinds) DropdownMenuItem(value: t, child: Text(l))],
                onChanged: (t) => setState(() {
                  _otherType = t ?? _otherType;
                  _to = null;
                }),
              ),
              const SizedBox(height: 12),
              if (options.isEmpty)
                const NotRecorded('There is nothing of that kind in this novel yet.')
              else
                DropdownButtonFormField<String>(
                  key: ValueKey(_otherType),
                  initialValue: _to?.id,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Which one'),
                  items: [
                    for (final (ref, label) in options)
                      DropdownMenuItem(
                        value: ref.id,
                        child: Text(label, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (id) => setState(() => _to = id == null ? null : EntityRef(_otherType, id)),
                ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _label,
              decoration: InputDecoration(labelText: 'How $selfName puts it (optional)', hintText: kind.label),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reverse,
              decoration: const InputDecoration(
                labelText: 'How the other end puts it (optional)',
                helperText: 'Only if they say so: nobody’s opinion is guessed.',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Notes'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<CanonStatus>(
              initialValue: _canon,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Status'),
              items: [
                for (final s in CanonStatus.values) DropdownMenuItem(value: s, child: Text(connectionStatusLabel(s))),
              ],
              onChanged: (s) => setState(() => _canon = s ?? _canon),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(onPressed: ready ? _save : null, child: Text(widget.editing == null ? 'Connect' : 'Save')),
      ],
    );
  }
}
