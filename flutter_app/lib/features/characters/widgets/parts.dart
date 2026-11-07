import 'package:flutter/material.dart';

import '../../../shared/domain/records/story_node.dart';
import '../characters_providers.dart';

/// A titled card on a profile tab.
class ProfileBox extends StatelessWidget {
  const ProfileBox({super.key, required this.title, required this.children, this.trailing, this.caption});

  final String title;
  final String? caption;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Wraps rather than squeezes: with large text the button goes under the title instead of off the card.
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              children: [
                Semantics(header: true, child: Text(title, style: theme.textTheme.titleMedium)),
                ?trailing,
              ],
            ),
            if (caption != null) ...[
              const SizedBox(height: 4),
              Text(caption!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ],
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// Text that says nothing is recorded, set apart from real values so it is never read as one.
class NotRecorded extends StatelessWidget {
  const NotRecorded(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      text,
      style: theme.textTheme.bodyMedium?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
        fontStyle: FontStyle.italic,
      ),
    );
  }
}

/// A chapter or scene as a chooser shows it: "Ch 3: The Seal", a scene indented under its chapter.
String documentLabel(CastData cast, StoryNode node) {
  final number = cast.model.order.chapterNumber[node.id];
  return node.kind == NodeKind.scene
      ? '    ${node.displayTitle}'
      : (number == null ? node.displayTitle : 'Ch $number: ${node.displayTitle}');
}

/// Where a chapter or scene is named in a sentence: its title, or that it is gone.
String documentName(CastData cast, String? nodeId) =>
    nodeId == null ? 'Not set' : (cast.model.nodes[nodeId]?.displayTitle ?? 'A deleted chapter');

/// Choosing one chapter or scene, or none.
class DocumentChooser extends StatelessWidget {
  const DocumentChooser({
    super.key,
    required this.cast,
    required this.label,
    required this.value,
    required this.onChanged,
    this.none = 'Not set',
  });

  final CastData cast;
  final String label;
  final String? value;
  final ValueChanged<String?> onChanged;
  final String none;

  @override
  Widget build(BuildContext context) {
    final docs = cast.documents;
    final known = value == null || docs.any((d) => d.id == value);
    return DropdownButtonFormField<String>(
      key: ValueKey('$label:$value'),
      initialValue: known ? (value ?? '') : '\u0000gone',
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        DropdownMenuItem(value: '', child: Text(none)),
        if (!known) const DropdownMenuItem(value: '\u0000gone', child: Text('A deleted chapter')),
        for (final d in docs)
          DropdownMenuItem(
            value: d.id,
            child: Text(documentLabel(cast, d), overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) {
        if (v != '\u0000gone') onChanged(v == null || v.isEmpty ? null : v);
      },
    );
  }
}

/// Choosing several records: the chosen ones as chips (each removable), and a menu to add another.
class IdPicker extends StatelessWidget {
  const IdPicker({
    super.key,
    required this.label,
    required this.chosen,
    required this.options,
    required this.onChanged,
    this.nameOf,
  });

  final String label;
  final List<String> chosen;

  /// What can be added, by id and name, in the order to offer them.
  final List<(String id, String name)> options;
  final ValueChanged<List<String>> onChanged;

  /// Names for chosen ids that are not among [options] (a deleted record says so).
  final String? Function(String id)? nameOf;

  @override
  Widget build(BuildContext context) {
    final names = {for (final (id, name) in options) id: name};
    String name(String id) => names[id] ?? nameOf?.call(id) ?? 'A deleted record';
    final addable = [
      for (final o in options)
        if (!chosen.contains(o.$1)) o,
    ];
    return InputDecorator(
      decoration: InputDecoration(labelText: label, border: InputBorder.none, contentPadding: EdgeInsets.zero),
      child: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Wrap(
          spacing: 6,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final id in chosen)
              InputChip(
                label: Text(name(id)),
                onDeleted: () => onChanged([
                  for (final x in chosen)
                    if (x != id) x,
                ]),
                deleteButtonTooltipMessage: 'Remove ${name(id)}',
              ),
            if (chosen.isEmpty) const Text('None'),
            if (addable.isNotEmpty)
              PopupMenuButton<String>(
                tooltip: 'Add to $label',
                useRootNavigator: true,
                icon: const Icon(Icons.add_circle_outline),
                itemBuilder: (_) => [for (final (id, n) in addable) PopupMenuItem(value: id, child: Text(n))],
                onSelected: (id) => onChanged([...chosen, id]),
              ),
          ],
        ),
      ),
    );
  }
}

String capitalized(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
