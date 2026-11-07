import 'package:flutter/material.dart';

import '../../shared/domain/characters/character_records.dart';

typedef NewCharacter = ({String name, String epithet, List<String> roles, String summary, String templateId});

/// Asks for a new character. Only a name is needed; the layout can be changed at any time afterwards.
Future<NewCharacter?> showNewCharacterDialog(BuildContext context, {required List<CharacterTemplate> templates}) =>
    showDialog<NewCharacter>(context: context, builder: (_) => _NewCharacterDialog(templates));

class _NewCharacterDialog extends StatefulWidget {
  const _NewCharacterDialog(this.templates);
  final List<CharacterTemplate> templates;

  @override
  State<_NewCharacterDialog> createState() => _NewCharacterDialogState();
}

class _NewCharacterDialogState extends State<_NewCharacterDialog> {
  final _name = TextEditingController();
  final _epithet = TextEditingController();
  final _summary = TextEditingController();
  final _roles = <String>{};
  late String _template = widget.templates.first.id;
  bool _tried = false;

  @override
  void dispose() {
    _name.dispose();
    _epithet.dispose();
    _summary.dispose();
    super.dispose();
  }

  void _submit() {
    setState(() => _tried = true);
    if (_name.text.trim().isEmpty) return;
    Navigator.of(context).pop((
      name: _name.text.trim(),
      epithet: _epithet.text.trim(),
      roles: [
        for (final r in characterRoles)
          if (_roles.contains(r)) r,
      ],
      summary: _summary.text.trim(),
      templateId: _template,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final template = widget.templates.firstWhere((t) => t.id == _template);
    return AlertDialog(
      title: const Text('New character'),
      scrollable: true,
      content: SizedBox(
        width: 480,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _name,
              autofocus: true,
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(
                labelText: 'Name *',
                errorText: _tried && _name.text.trim().isEmpty ? 'Give the character a name.' : null,
              ),
              onChanged: (_) => _tried ? setState(() {}) : null,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _epithet,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Title or epithet', hintText: 'The Last Heir'),
            ),
            const SizedBox(height: 12),
            Text('Narrative role (one or several)', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final role in characterRoles)
                  FilterChip(
                    label: Text(role),
                    selected: _roles.contains(role),
                    onSelected: (on) => setState(() => on ? _roles.add(role) : _roles.remove(role)),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _summary,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Summary'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _template,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: 'Profile layout',
                helperText: template.description,
                helperMaxLines: 3,
              ),
              items: [
                for (final t in widget.templates)
                  DropdownMenuItem(
                    value: t.id,
                    child: Text(t.name, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (v) => setState(() => _template = v ?? _template),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(onPressed: _submit, child: const Text('Create character')),
      ],
    );
  }
}
