import 'package:flutter/material.dart';

import '../../../core/widgets/confirm_dialog.dart';
import '../../../core/widgets/text_prompt.dart';
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/characters/templates.dart';
import '../../../shared/domain/codex/field_values.dart';
import '../../../shared/domain/records/category.dart';
import '../../../shared/domain/records/entry.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'typed_input.dart';
import 'vault.dart';

/// The sections of one tab of a profile, each a card of fields; with the hidden ones put away, the fields that belong
/// to no section, and a way to add a section. Every field shown is a field of the character's one record. Under
/// Details it also offers the fields every character of the novel shares.
class SectionsView extends StatelessWidget {
  const SectionsView({
    super.key,
    required this.cast,
    required this.entry,
    required this.profile,
    required this.tab,
    required this.actions,
  });

  final CastData cast;
  final Entry entry;
  final CharacterProfile profile;
  final ProfileTab tab;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    final peers = [
      for (final s in profile.sections)
        if (s.tab == tab) s,
    ];
    final hidden = peers.where((s) => s.hidden).toList();
    final placed = {for (final s in profile.sections) ...s.fieldIds};
    final loose = tab == ProfileTab.details
        ? [
            for (final f in entry.fields)
              if (!placed.contains(f.id) && (f.key.trim().isNotEmpty || f.value.trim().isNotEmpty)) f,
          ]
        : const <EntryField>[];
    // Shared fields this character has nothing in yet: offered, never forced onto the page.
    final offered = tab == ProfileTab.details
        ? [
            for (final (def, field) in viewFields(entry, cast.characterCategory).category)
              if (field == null) def,
          ]
        : const <FieldDef>[];
    final visible = peers.where((s) => !s.hidden).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final s in visible) ...[
          _SectionCard(
            key: ValueKey(s.id),
            cast: cast,
            entry: entry,
            profile: profile,
            section: s,
            first: s.id == visible.first.id,
            last: s.id == visible.last.id,
            actions: actions,
          ),
          const SizedBox(height: 12),
        ],
        if (loose.isNotEmpty || offered.isNotEmpty) ...[
          _Card(
            title: 'Fields without a section (${loose.length})',
            trailing: TextButton(
              onPressed: () => actions.router.go('/organize/world/kinds?kind=character'),
              child: const Text('Shared fields…'),
            ),
            children: [
              if (loose.isNotEmpty)
                Text(
                  'Shared by every character, or left behind by a section that was removed. Open one to give it a '
                  'section.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              if (offered.isNotEmpty)
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text('Shared by every character:', style: Theme.of(context).textTheme.bodySmall),
                    for (final def in offered)
                      ActionChip(
                        avatar: const Icon(Icons.add, size: 18),
                        label: Text(def.name),
                        onPressed: () => actions.now((c) => c.setFieldValue(entry.id, def.id, '')),
                      ),
                  ],
                ),
              for (final f in loose) _FieldCard(cast: cast, entry: entry, profile: profile, field: f, actions: actions),
            ],
          ),
          const SizedBox(height: 12),
        ],
        if (hidden.isNotEmpty) ...[
          ExpansionTile(
            title: Text('${hidden.length} hidden ${hidden.length == 1 ? 'section' : 'sections'}'),
            children: [
              for (final s in hidden)
                ListTile(
                  title: Text(s.name),
                  trailing: TextButton(
                    onPressed: () => actions.now((c) => c.updateSection(entry.id, s.id, hidden: false)),
                    child: Text('Show', semanticsLabel: 'Show the section ${s.name}'),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () async {
              final name = await showTextPrompt(
                context,
                title: 'Add a section',
                label: 'Section name',
                confirmLabel: 'Add section',
              );
              if (name != null && name.trim().isNotEmpty) actions.now((c) => c.addSection(entry.id, name, tab));
            },
            icon: const Icon(Icons.add),
            label: const Text('Add a section'),
          ),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.children, this.trailing});

  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => VaultFrame(
    padding: const EdgeInsets.fromLTRB(16, 8, 8, 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: VaultHeading(title)),
            // Never wider than the card: with large text, a button's words wrap.
            if (trailing != null) Flexible(child: trailing!),
          ],
        ),
        const SizedBox(height: 4),
        for (final c in children) Padding(padding: const EdgeInsets.only(top: 8, right: 8), child: c),
      ],
    ),
  );
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    super.key,
    required this.cast,
    required this.entry,
    required this.profile,
    required this.section,
    required this.first,
    required this.last,
    required this.actions,
  });

  final CastData cast;
  final Entry entry;
  final CharacterProfile profile;
  final ProfileSection section;
  final bool first;
  final bool last;
  final CharacterActions actions;

  Future<void> _remove(BuildContext context, int count) async {
    if (count == 0) {
      final ok = await showConfirmDialog(
        context,
        title: 'Delete the section “${section.name}”?',
        message: 'The section is empty.',
        confirmLabel: 'Delete section',
        destructive: true,
      );
      if (ok) actions.now((c) => c.removeSection(entry.id, section.id));
      return;
    }
    final choice = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete the section “${section.name}”?'),
        content: Text(
          'It holds ${count == 1 ? '1 field' : '$count fields'}. Unless you say otherwise they stay on the character, '
          'listed under “Fields without a section” on the Details tab.',
        ),
        actions: [
          TextButton(autofocus: true, onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Also delete ${count == 1 ? 'that field' : 'those fields'}'),
          ),
          FilledButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Delete section only')),
        ],
      ),
    );
    if (choice != null) actions.now((c) => c.removeSection(entry.id, section.id, deleteFields: choice));
  }

  @override
  Widget build(BuildContext context) {
    final byId = {for (final f in entry.fields) f.id: f};
    final fields = [for (final id in section.fieldIds) ?byId[id]];
    return _Card(
      title: '${section.name} (${fields.length})',
      trailing: PopupMenuButton<String>(
        tooltip: 'Options for the section ${section.name}',
        useRootNavigator: true,
        onSelected: (action) async {
          switch (action) {
            case 'rename':
              final name = await showTextPrompt(
                context,
                title: 'Rename the section',
                label: 'Section name',
                initial: section.name,
                confirmLabel: 'Rename',
              );
              if (name != null && name.trim().isNotEmpty) {
                actions.now((c) => c.updateSection(entry.id, section.id, name: name));
              }
            case 'up':
              actions.now((c) => c.moveSection(entry.id, section.id, -1));
            case 'down':
              actions.now((c) => c.moveSection(entry.id, section.id, 1));
            case 'duplicate':
              actions.now((c) => c.duplicateSection(entry.id, section.id));
            case 'tab':
              actions.now(
                (c) => c.updateSection(
                  entry.id,
                  section.id,
                  tab: section.tab == ProfileTab.overview ? ProfileTab.details : ProfileTab.overview,
                ),
              );
            case 'hide':
              actions.now((c) => c.updateSection(entry.id, section.id, hidden: true));
            case 'delete':
              if (context.mounted) await _remove(context, fields.length);
          }
        },
        itemBuilder: (_) => [
          const PopupMenuItem(value: 'rename', child: Text('Rename')),
          PopupMenuItem(value: 'up', enabled: !first, child: const Text('Move up')),
          PopupMenuItem(value: 'down', enabled: !last, child: const Text('Move down')),
          const PopupMenuItem(value: 'duplicate', child: Text('Duplicate (fields empty)')),
          PopupMenuItem(
            value: 'tab',
            child: Text(section.tab == ProfileTab.overview ? 'Move to the Details tab' : 'Move to the Overview tab'),
          ),
          const PopupMenuItem(value: 'hide', child: Text('Hide')),
          const PopupMenuItem(value: 'delete', child: Text('Delete…')),
        ],
      ),
      children: [
        for (final (i, f) in fields.indexed)
          _FieldCard(
            key: ValueKey(f.id),
            cast: cast,
            entry: entry,
            profile: profile,
            field: f,
            section: section,
            earlier: i > 0,
            later: i < fields.length - 1,
            actions: actions,
          ),
        _AddField(cast: cast, entry: entry, section: section, have: [for (final f in fields) f.key], actions: actions),
      ],
    );
  }
}

/// One field: its name, and its value shown the way its type deserves. Press it to edit.
class _FieldCard extends StatefulWidget {
  const _FieldCard({
    super.key,
    required this.cast,
    required this.entry,
    required this.profile,
    required this.field,
    required this.actions,
    this.section,
    this.earlier = false,
    this.later = false,
  });

  final CastData cast;
  final Entry entry;
  final CharacterProfile profile;
  final EntryField field;
  final ProfileSection? section;
  final bool earlier;
  final bool later;
  final CharacterActions actions;

  @override
  State<_FieldCard> createState() => _FieldCardState();
}

class _FieldCardState extends State<_FieldCard> {
  bool _editing = false;

  @override
  Widget build(BuildContext context) {
    final w = widget;
    final field = w.field;
    final theme = Theme.of(context);
    // A field every character shares takes its name, type and choices from the shared set.
    final def = field.defId == null
        ? null
        : w.cast.characterCategory.fields.where((d) => d.id == field.defId).firstOrNull;
    final type = def?.type ?? field.type ?? FieldType.text;
    final options = def?.options ?? field.options;
    final name = def != null && def.name.isNotEmpty ? def.name : (field.key.isNotEmpty ? field.key : 'Untitled field');
    final linkable = [
      for (final e
          in w.cast.characters(except: w.entry.id).followedBy(w.cast.entries.where((e) => e.category != 'character')))
        if (def?.target == null || e.category == def!.target) e,
    ];
    final shown = displayValue(type, field.value, w.cast.nameOf);
    // A shared field's rules: checked and said, never enforced; the value is kept as written.
    final issue = def == null ? null : checkValue(def, field.value, w.cast.model.entries, categoryName: (k) => k);
    final required = def?.required ?? false;
    void typed(String value) =>
        w.actions.later('field:${w.entry.id}:${field.id}', (c) => c.updateField(w.entry.id, field.id, value: value));
    void chosen(String value) => w.actions.now((c) => c.updateField(w.entry.id, field.id, value: value));

    if (!_editing) {
      final linkedId = type == FieldType.reference && w.cast.model.entries.containsKey(field.value)
          ? field.value
          : null;
      return Material(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => setState(() => _editing = true),
          child: Semantics(
            button: true,
            label: 'Edit $name',
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$name${required ? ' *' : ''}', style: vaultHeading(context, size: 12)),
                  const SizedBox(height: 4),
                  if (shown.isEmpty)
                    Text(
                      type == FieldType.reference && field.value.isNotEmpty
                          ? 'The linked entry was deleted'
                          : 'Not recorded',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontStyle: FontStyle.italic,
                      ),
                    )
                  else if (type == FieldType.tags || type == FieldType.multiselect)
                    VaultChips(splitChoices(field.value))
                  else
                    Text(shown, style: vaultText(context)),
                  if (issue != null)
                    Text(issue.message, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error)),
                  if (linkedId != null && w.cast.model.entries[linkedId]!.category == 'character')
                    TextButton(
                      style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
                      onPressed: () => w.actions.openCharacter(linkedId),
                      child: Text('Open ${w.cast.nameOf(linkedId)} →'),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Material(
      color: theme.colorScheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TypedInput(
              label: '$name${required ? ' *' : ''}',
              type: type,
              value: field.value,
              options: options,
              entries: linkable,
              onTyped: typed,
              onChosen: chosen,
              errorText: issue?.message,
              helper: def?.help,
            ),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Field settings'),
              children: [
                if (def != null)
                  Text(
                    'Shared by every character: its name, type and choices are the same on every profile.',
                    style: theme.textTheme.bodySmall,
                  )
                else ...[
                  _SettingText(
                    label: 'Name',
                    value: field.key,
                    onChanged: (v) {
                      if (v.trim().isNotEmpty) {
                        w.actions.later(
                          'fieldname:${w.entry.id}:${field.id}',
                          (c) => c.updateField(w.entry.id, field.id, key: v),
                        );
                      }
                    },
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<FieldType>(
                    key: ValueKey('${field.id}:${type.name}'),
                    initialValue: type,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Type',
                      helperText: 'Changing the type never changes what is written.',
                    ),
                    items: [for (final t in FieldType.values) DropdownMenuItem(value: t, child: Text(t.label))],
                    onChanged: (t) =>
                        t == null ? null : w.actions.now((c) => c.updateField(w.entry.id, field.id, type: t)),
                  ),
                  if (type == FieldType.select || type == FieldType.multiselect) ...[
                    const SizedBox(height: 8),
                    _SettingText(
                      label: 'Choices (one per line)',
                      value: field.options.join('\n'),
                      multiline: true,
                      onChanged: (v) => w.actions.later(
                        'fieldoptions:${w.entry.id}:${field.id}',
                        (c) => c.updateField(w.entry.id, field.id, options: v.split('\n')),
                      ),
                    ),
                  ],
                ],
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  key: ValueKey('${field.id}:${w.section?.id}'),
                  initialValue: w.section?.id ?? '',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Section'),
                  items: [
                    if (w.section == null) const DropdownMenuItem(value: '', child: Text('Not in a section')),
                    for (final s in w.profile.sections)
                      DropdownMenuItem(
                        value: s.id,
                        child: Text(s.name, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (id) {
                    if (id != null && id.isNotEmpty && id != w.section?.id) {
                      w.actions.now((c) => c.moveField(w.entry.id, field.id, toSection: id));
                    }
                  },
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: w.earlier
                          ? () => w.actions.now((c) => c.moveField(w.entry.id, field.id, by: -1))
                          : null,
                      child: const Text('Move earlier'),
                    ),
                    OutlinedButton(
                      onPressed: w.later ? () => w.actions.now((c) => c.moveField(w.entry.id, field.id, by: 1)) : null,
                      child: const Text('Move later'),
                    ),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                      onPressed: () async {
                        final ok = await showConfirmDialog(
                          context,
                          title: 'Delete the field “$name”?',
                          message: field.value.trim().isEmpty
                              ? 'It is empty.'
                              : 'What is written in it goes too. The change is noted in the character’s history.',
                          confirmLabel: 'Delete field',
                          destructive: true,
                        );
                        if (ok) w.actions.now((c) => c.removeField(w.entry.id, field.id));
                      },
                      child: Text('Delete field', semanticsLabel: 'Delete the field $name'),
                    ),
                  ],
                ),
              ],
            ),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(onPressed: () => setState(() => _editing = false), child: const Text('Done')),
            ),
          ],
        ),
      ),
    );
  }
}

/// A setting typed in a field's settings, saved as it is typed.
class _SettingText extends StatelessWidget {
  const _SettingText({required this.label, required this.value, required this.onChanged, this.multiline = false});
  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final bool multiline;

  @override
  Widget build(BuildContext context) => TextFormField(
    initialValue: value,
    minLines: multiline ? 3 : 1,
    maxLines: multiline ? null : 1,
    decoration: InputDecoration(labelText: label),
    onChanged: onChanged,
  );
}

/// What a section offers to add (the fields its name has in any template), and a field of the author's own.
class _AddField extends StatefulWidget {
  const _AddField({
    required this.cast,
    required this.entry,
    required this.section,
    required this.have,
    required this.actions,
  });

  final CastData cast;
  final Entry entry;
  final ProfileSection section;
  final List<String> have;
  final CharacterActions actions;

  @override
  State<_AddField> createState() => _AddFieldState();
}

class _AddFieldState extends State<_AddField> {
  bool _open = false;
  final _name = TextEditingController();
  FieldType _type = FieldType.text;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _add(FieldSuggestion field) => widget.actions.now((c) => c.addField(widget.entry.id, widget.section.id, field));

  @override
  Widget build(BuildContext context) {
    final w = widget;
    // Leave out anything the character already has anywhere on the profile, so the same fact is never kept twice,
    // and anything every character shares, which is offered once, under Details.
    final everyone = [
      for (final d in w.cast.characterCategory.fields)
        if (!d.archived) d.name,
    ];
    final offered = suggestionsFor(w.section.name, w.cast.templates, [
      ...w.have,
      for (final f in w.entry.fields) f.key,
      ...everyone,
    ]);
    // An empty section shows what it usually holds straight away; otherwise the suggestions wait behind the button.
    final showing = _open || w.have.isEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showing && offered.isNotEmpty)
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              for (final f in offered.take(_open ? 40 : 6))
                ActionChip(
                  avatar: const Icon(Icons.add, size: 16),
                  label: Text(f.name),
                  tooltip: 'Add ${f.name} to ${w.section.name}',
                  onPressed: () => _add(f),
                ),
            ],
          ),
        if (_open)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 220,
                  child: TextField(
                    controller: _name,
                    autofocus: true,
                    decoration: InputDecoration(labelText: 'New field in ${w.section.name}'),
                    onSubmitted: (_) => _submit(),
                  ),
                ),
                SizedBox(
                  width: 200,
                  child: DropdownButtonFormField<FieldType>(
                    initialValue: _type,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Type'),
                    items: [for (final t in FieldType.values) DropdownMenuItem(value: t, child: Text(t.label))],
                    onChanged: (t) => setState(() => _type = t ?? _type),
                  ),
                ),
                FilledButton(onPressed: _submit, child: const Text('Add')),
                TextButton(onPressed: () => setState(() => _open = false), child: const Text('Done')),
              ],
            ),
          )
        else
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _open = true),
              icon: const Icon(Icons.add),
              label: Text('Add a field', semanticsLabel: 'Add a field to ${w.section.name}'),
            ),
          ),
      ],
    );
  }

  void _submit() {
    if (_name.text.trim().isEmpty) return;
    _add(FieldSuggestion(_name.text.trim(), _type));
    _name.clear();
  }
}
