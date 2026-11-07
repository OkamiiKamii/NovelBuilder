import 'package:flutter/material.dart';

import '../../../core/format.dart';
import '../../../core/widgets/confirm_dialog.dart';
import '../../../core/widgets/saved_text_field.dart';
import '../../../shared/domain/characters/character_changes.dart';
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/records/entry.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import '../widgets/parts.dart';

/// Loose notes about a character. A note is not part of what is established about them until the author copies it
/// into the profile, and copying keeps the note.
class NotesTab extends StatefulWidget {
  const NotesTab({super.key, required this.cast, required this.entry, required this.profile, required this.actions});

  final CastData cast;
  final Entry entry;
  final CharacterProfile profile;
  final CharacterActions actions;

  @override
  State<NotesTab> createState() => _NotesTabState();
}

class _NotesTabState extends State<NotesTab> {
  final _content = TextEditingController();

  @override
  void dispose() {
    _content.dispose();
    super.dispose();
  }

  void _add() {
    if (_content.text.trim().isEmpty) return;
    final made = widget.actions.now((c) => c.saveNote(widget.entry.id, null, content: _content.text));
    if (made != null) _content.clear();
  }

  @override
  Widget build(BuildContext context) {
    final notes = widget.cast.notes(widget.entry.id);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Ideas and loose ends about ${widget.entry.name}. A note changes nothing on the profile until you copy it '
          'there.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _content,
          minLines: 2,
          maxLines: 6,
          decoration: const InputDecoration(labelText: 'A new note'),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton(onPressed: _add, child: const Text('Add note')),
        ),
        const SizedBox(height: 12),
        if (notes.isEmpty) const NotRecorded('No notes yet.'),
        for (final n in notes) ...[
          _NoteCard(
            key: ValueKey(n.id),
            cast: widget.cast,
            entry: widget.entry,
            profile: widget.profile,
            note: n,
            actions: widget.actions,
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _NoteCard extends StatelessWidget {
  const _NoteCard({
    super.key,
    required this.cast,
    required this.entry,
    required this.profile,
    required this.note,
    required this.actions,
  });

  final CastData cast;
  final Entry entry;
  final CharacterProfile profile;
  final CharacterNote note;
  final CharacterActions actions;

  Future<void> _copy(BuildContext context) async {
    if (profile.sections.isEmpty) {
      actions.tell('The profile has no section to copy it into. Add a section first.');
      return;
    }
    final picked = await showDialog<(String, String)>(
      context: context,
      builder: (_) => _CopyDialog(sections: profile.sections, title: note.title),
    );
    if (picked == null) return;
    final (sectionId, fieldName) = picked;
    final made = actions.now((c) => c.promoteNote(note.id, sectionId, fieldName));
    if (made != null) {
      final section = profile.sections.firstWhere((s) => s.id == sectionId).name;
      actions.tell('Copied into $section as “${fieldName.trim()}”. The note is kept.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    void later(String what, void Function(CharacterChanges c) apply) => actions.later('note:${note.id}:$what', apply);
    return Card(
      margin: EdgeInsets.zero,
      color: note.pinned ? theme.colorScheme.secondaryContainer.withValues(alpha: 0.35) : null,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                if (note.pinned)
                  const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: Icon(Icons.push_pin, semanticLabel: 'Pinned'),
                  ),
                Expanded(
                  child: SavedTextField(
                    label: 'Title',
                    value: note.title,
                    onChanged: (v) => later('title', (c) => c.saveNote(entry.id, note.id, title: v)),
                  ),
                ),
                TextButton(
                  onPressed: () => actions.now((c) => c.saveNote(entry.id, note.id, pinned: !note.pinned)),
                  child: Text(note.pinned ? 'Unpin' : 'Pin'),
                ),
                IconButton(
                  tooltip: 'Delete the note ${note.title}',
                  onPressed: () async {
                    final ok = await showConfirmDialog(
                      context,
                      title: 'Delete the note “${note.title}”?',
                      message: 'Anything already copied from it into the profile stays there.',
                      confirmLabel: 'Delete note',
                      destructive: true,
                    );
                    if (ok) actions.now((c) => c.removeNote(note.id));
                  },
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SavedTextField(
              label: 'Note',
              value: note.content,
              multiline: true,
              minLines: 3,
              onChanged: (v) => later('content', (c) => c.saveNote(entry.id, note.id, content: v)),
            ),
            const SizedBox(height: 8),
            SavedTextField(
              label: 'Tags (comma separated)',
              value: note.tags.join(', '),
              onChanged: (v) => later('tags', (c) => c.saveNote(entry.id, note.id, tags: v.split(','))),
            ),
            IdPicker(
              label: 'About these chapters',
              chosen: note.nodeIds,
              options: [for (final d in cast.documents) (d.id, documentLabel(cast, d).trim())],
              nameOf: (id) => cast.model.nodes[id]?.displayTitle,
              onChanged: (ids) => actions.now((c) => c.saveNote(entry.id, note.id, nodeIds: ids)),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                OutlinedButton.icon(
                  onPressed: () => _copy(context),
                  icon: const Icon(Icons.move_to_inbox_outlined),
                  label: const Text('Copy into the profile…'),
                ),
                Text(
                  'Written ${formatRelative(context, note.createdAt)} · changed ${formatRelative(context, note.updatedAt)}',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CopyDialog extends StatefulWidget {
  const _CopyDialog({required this.sections, required this.title});
  final List<ProfileSection> sections;
  final String title;

  @override
  State<_CopyDialog> createState() => _CopyDialogState();
}

class _CopyDialogState extends State<_CopyDialog> {
  late String _section = widget.sections.first.id;
  late final _field = TextEditingController(text: widget.title.length > 40 ? '' : widget.title);

  @override
  void dispose() {
    _field.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Copy the note into the profile'),
    content: SizedBox(
      width: 420,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Its text becomes a field of the character’s record. The note itself is kept.'),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _section,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Section'),
            items: [
              for (final s in widget.sections)
                DropdownMenuItem(
                  value: s.id,
                  child: Text(s.name, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => setState(() => _section = v ?? _section),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _field,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Field name', hintText: 'Family'),
            onChanged: (_) => setState(() {}),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(
        onPressed: _field.text.trim().isEmpty ? null : () => Navigator.of(context).pop((_section, _field.text)),
        child: const Text('Copy into the profile'),
      ),
    ],
  );
}
