import 'package:flutter/material.dart';

import '../../characters/widgets/vault.dart';

/// A starting question: its words, and the event it departs at (when it turns on one).
typedef WhatIfStarter = ({String question, String? eventId});

/// Questions to begin from, out of the novel's own story: its first events ("What if The Fall of Emberhold never
/// happened?", departing there) and its people ("What if Mira chose otherwise?"), then a few that fit any story.
/// At most six.
List<WhatIfStarter> whatIfStarters({required List<({String id, String name})> events, required List<String> people}) {
  final out = <WhatIfStarter>[
    for (final e in events.take(3))
      if (e.name.trim().isNotEmpty) (question: 'What if ${e.name.trim()} never happened?', eventId: e.id),
    for (final p in people.take(2))
      if (p.trim().isNotEmpty) (question: 'What if ${p.trim()} chose otherwise?', eventId: null),
    (question: 'What if the hero failed?', eventId: null),
    (question: 'What if it all happened ten years earlier?', eventId: null),
  ];
  return out.take(6).toList();
}

/// The history's name from a question as written: trimmed, with its question mark.
String whatIfName(String question) {
  final q = question.trim();
  if (q.isEmpty) return q;
  return RegExp(r'[?!.…]$').hasMatch(q) ? q : '$q?';
}

/// WHAT IF…?: an alternate history begun as a question. One line to finish ("What if …?"), starters out of the
/// story to begin from, and **Branch the story**, which makes the history (named as the question, departing at the
/// event its starter turns on) and opens it. Nothing is made until the press. The full form stays below it.
class WhatIfCard extends StatefulWidget {
  const WhatIfCard({super.key, required this.starters, required this.onBranch});

  final List<WhatIfStarter> starters;

  /// Makes the history from the question and the event it departs at.
  final void Function(String name, String? eventId) onBranch;

  @override
  State<WhatIfCard> createState() => _WhatIfCardState();
}

class _WhatIfCardState extends State<WhatIfCard> {
  final _question = TextEditingController();
  String? _eventId;

  @override
  void dispose() {
    _question.dispose();
    super.dispose();
  }

  void _take(WhatIfStarter s) => setState(() {
    _question.text = s.question;
    _eventId = s.eventId;
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ready = _question.text.trim().isNotEmpty;
    return VaultFrame(
      padding: const EdgeInsets.fromLTRB(22, 20, 22, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('What if…?', style: vaultHeading(context, size: 20, weight: 700)),
          const SizedBox(height: 4),
          Text(
            'Try another course of events without touching the timeline. Ask the question; the history keeps only '
            'what you change.',
            style: vaultText(context, size: 16, color: scheme.onSurfaceVariant, style: FontStyle.italic),
          ),
          const VaultRule(),
          TextField(
            controller: _question,
            onChanged: (_) => setState(() => _eventId = null),
            textCapitalization: TextCapitalization.sentences,
            style: vaultText(context, size: 19),
            decoration: const InputDecoration(labelText: 'The question', hintText: 'What if the Keep had held?'),
          ),
          const SizedBox(height: 12),
          Text('Or begin from one of these', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in widget.starters)
                ActionChip(
                  avatar: Icon(s.eventId == null ? Icons.help_outline : Icons.call_split, size: 16),
                  label: Text(s.question),
                  onPressed: () => _take(s),
                ),
            ],
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: ready ? () => widget.onBranch(whatIfName(_question.text), _eventId) : null,
            icon: const Icon(Icons.call_split),
            label: const Text('Branch the story'),
          ),
        ],
      ),
    );
  }
}
