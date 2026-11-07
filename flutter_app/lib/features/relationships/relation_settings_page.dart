import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/text_prompt.dart';
import '../../shared/domain/relationships/relation_types.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import 'relationship_page.dart';

/// The novel's relationship types and the attributes it tracks. Nothing is tracked until the author chooses it;
/// changing a type re-words the relationships using it; deleting one keeps their wording, as Custom.
class RelationSettingsPage extends ConsumerWidget {
  const RelationSettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    if (cast == null) {
      return PageScaffold(
        title: 'Relationship types and attributes',
        child: EmptyState(
          icon: Icons.menu_book_outlined,
          title: 'No novel open',
          message: 'These belong to a novel. Open one from the Library.',
          action: FilledButton(
            onPressed: () => context.go(Destination.library.path),
            child: const Text('Go to Library'),
          ),
        ),
      );
    }
    final actions = CharacterActions(context, cast.novelId);
    final settings = RelationSettings(cast.snapshot.rows('relationSettings').firstOrNull);
    final inUse = {
      for (final r in cast.model.relations.values)
        for (final s in r.stages) s.preset,
    };
    final tracked = {for (final a in settings.attributes) a.key};
    return PageScaffold(
      title: 'Relationship types and attributes',
      subtitle: cast.novelTitle,
      actions: [
        TextButton.icon(
          onPressed: () => context.go(Destination.organize.path),
          icon: const Icon(Icons.arrow_back),
          label: const Text('Characters'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfileBox(
            title: 'Your own types',
            caption: 'Offered beside the built-in types. A one-way type has a role for each side (Liege → Sworn).',
            trailing: FilledButton.icon(
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => _TypeDialog(actions: actions),
              ),
              icon: const Icon(Icons.add),
              label: const Text('New type'),
            ),
            children: [
              if (settings.types.isEmpty) const NotRecorded('None yet.'),
              for (final t in settings.types)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(t.label),
                  subtitle: Text(
                    '${t.category.label} · ${t.directional ? '${t.fromRole} → ${t.toRole}' : 'the same both ways'}',
                  ),
                  trailing: Wrap(
                    children: [
                      IconButton(
                        tooltip: 'Change ${t.label}',
                        onPressed: () => showDialog<void>(
                          context: context,
                          builder: (_) => _TypeDialog(actions: actions, editing: t),
                        ),
                        icon: const Icon(Icons.edit_outlined),
                      ),
                      IconButton(
                        tooltip: 'Delete ${t.label}',
                        onPressed: () async {
                          final ok = await showConfirmDialog(
                            context,
                            title: 'Delete the type “${t.label}”?',
                            message:
                                'Relationships using it keep their wording, as Custom. Nothing about them is lost.',
                            confirmLabel: 'Delete type',
                            destructive: true,
                          );
                          if (ok) relate(actions, (c) => c.removeType(t.id));
                        },
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          ProfileBox(
            title: 'Built-in types offered',
            children: [
              for (final p in relationPresets)
                if (p.key != 'custom')
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(p.label),
                    subtitle: Text('${p.category.label}${inUse.contains(p.key) ? ' · in use' : ''}'),
                    value: !settings.hidden.contains(p.key),
                    onChanged: (on) => relate(actions, (c) => c.offerBuiltIn(p.key, offered: on)),
                  ),
            ],
          ),
          const SizedBox(height: 12),
          ProfileBox(
            title: 'Attributes to track',
            caption:
                'None is tracked until you choose. Each is given at each stage, from 0 to $attributeMax, each way: trust '
                'need not be returned. Untracking keeps the values given.',
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final a in suggestedAttributes)
                    FilterChip(
                      label: Text(a.label),
                      selected: tracked.contains(a.key),
                      onSelected: (on) =>
                          relate(actions, (c) => on ? c.trackAttribute(a.key) : c.untrackAttribute(a.key)),
                    ),
                  for (final a in settings.attributes)
                    if (!suggestedAttributes.any((s) => s.key == a.key))
                      InputChip(
                        label: Text(a.label),
                        onDeleted: () => relate(actions, (c) => c.untrackAttribute(a.key)),
                        deleteButtonTooltipMessage: 'Stop tracking ${a.label}',
                      ),
                  ActionChip(
                    avatar: const Icon(Icons.add, size: 18),
                    label: const Text('Your own…'),
                    onPressed: () async {
                      final name = await showTextPrompt(
                        context,
                        title: 'Track an attribute of your own',
                        label: 'Name',
                        hint: 'Debt',
                        confirmLabel: 'Track it',
                      );
                      if (name != null && name.trim().isNotEmpty) relate(actions, (c) => c.trackAttribute(name));
                    },
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TypeDialog extends StatefulWidget {
  const _TypeDialog({required this.actions, this.editing});

  final CharacterActions actions;
  final RelationType? editing;

  @override
  State<_TypeDialog> createState() => _TypeDialogState();
}

class _TypeDialogState extends State<_TypeDialog> {
  late final _label = TextEditingController(text: widget.editing?.label ?? '');
  late final _from = TextEditingController(text: widget.editing?.fromRole ?? '');
  late final _to = TextEditingController(text: widget.editing?.toRole ?? '');
  late bool _oneWay = widget.editing?.directional ?? false;
  late RelationCategory _category = widget.editing?.category ?? RelationCategory.custom;

  @override
  void dispose() {
    for (final c in [_label, _from, _to]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.editing == null ? 'New relationship type' : 'Change the type'),
    scrollable: true,
    content: SizedBox(
      width: 420,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _label,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Name'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<RelationCategory>(
            initialValue: _category,
            decoration: const InputDecoration(labelText: 'Group'),
            items: [for (final c in RelationCategory.values) DropdownMenuItem(value: c, child: Text(c.label))],
            onChanged: (c) => setState(() => _category = c ?? _category),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('One-way: each side has its own role'),
            value: _oneWay,
            onChanged: (v) => setState(() => _oneWay = v),
          ),
          TextField(
            controller: _from,
            decoration: InputDecoration(labelText: _oneWay ? 'The first is the…' : 'Each is a… (optional)'),
          ),
          if (_oneWay) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _to,
              decoration: const InputDecoration(labelText: 'The second is the…'),
            ),
          ],
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(
        onPressed: () {
          final made = relate(
            widget.actions,
            (c) => c.saveType(
              typeId: widget.editing?.id,
              label: _label.text,
              category: _category,
              directional: _oneWay,
              fromRole: _from.text,
              toRole: _to.text,
            ),
          );
          if (made != null) Navigator.of(context).pop();
        },
        child: const Text('Save'),
      ),
    ],
  );
}
