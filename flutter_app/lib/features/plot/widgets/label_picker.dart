import 'package:flutter/material.dart';

import '../../../core/widgets/text_prompt.dart';
import '../../../shared/domain/timeline/event_changes.dart' show suggestedLabels;

/// The author's labels for a chapter, scene or event: the suggestions and the labels already used in the novel are
/// offered, and their own words are welcome. A label is the same whatever its capitals.
class LabelPicker extends StatelessWidget {
  const LabelPicker({super.key, required this.labels, required this.onChanged, this.used = const [], this.of = ''});

  final List<String> labels;
  final ValueChanged<List<String>> onChanged;

  /// Labels already used elsewhere in the novel.
  final List<String> used;

  /// What is labelled, for screen readers: "this scene".
  final String of;

  @override
  Widget build(BuildContext context) {
    final offered = <String>[];
    for (final l in [...suggestedLabels, ...used]) {
      final taken = [...labels, ...offered].any((x) => x.toLowerCase() == l.toLowerCase());
      if (!taken) offered.add(l);
    }
    return InputDecorator(
      decoration: const InputDecoration(labelText: 'Labels', border: InputBorder.none, contentPadding: EdgeInsets.zero),
      child: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Wrap(
          spacing: 6,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final l in labels)
              InputChip(
                label: Text(l),
                deleteButtonTooltipMessage: 'Remove the label $l',
                onDeleted: () => onChanged([
                  for (final x in labels)
                    if (x != l) x,
                ]),
              ),
            if (labels.isEmpty) const Text('None'),
            PopupMenuButton<String>(
              tooltip: of.isEmpty ? 'Add a label' : 'Add a label to $of',
              useRootNavigator: true,
              icon: const Icon(Icons.add_circle_outline),
              itemBuilder: (_) => [
                for (final l in offered) PopupMenuItem(value: l, child: Text(l)),
                const PopupMenuItem(value: '\u0000own', child: Text('Your own…')),
              ],
              onSelected: (choice) async {
                if (choice != '\u0000own') return onChanged([...labels, choice]);
                final typed = await showTextPrompt(context, title: 'Add a label', label: 'Label', confirmLabel: 'Add');
                if (typed != null && typed.trim().isNotEmpty) onChanged([...labels, typed.trim()]);
              },
            ),
          ],
        ),
      ),
    );
  }
}
