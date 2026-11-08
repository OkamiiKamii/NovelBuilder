import 'package:flutter/material.dart';

import '../../characters/widgets/vault.dart';
import '../plot_providers.dart';

/// One question a reader carries through a book: how it is asked, an example, and the kind of thread it becomes.
typedef StoryQuestion = ({String asks, String hint, String category});

const storyQuestions = <StoryQuestion>[
  (asks: 'The question the whole book answers', hint: 'Will Ren master his deadly skill?', category: 'main'),
  (asks: 'A mystery the reader wants solved', hint: 'Who sealed the SSS rank, and why?', category: 'mystery'),
  (asks: 'Who might fall for whom', hint: 'Will Ilse forgive him?', category: 'romance'),
  (asks: 'What someone is hiding', hint: 'What is the Grey Abbot not saying?', category: 'villain'),
];

/// Makes a thread for each question written, as written (a question mark added when it has none), of its kind, in
/// one change. Returns how many were made.
int askTheQuestions(PlotActions actions, List<(StoryQuestion, String)> lines) {
  final asked = [
    for (final (q, text) in lines)
      if (text.trim().isNotEmpty) (q, text.trim()),
  ];
  if (asked.isEmpty) return 0;
  final made = actions.edit((x) {
    for (final (q, text) in asked) {
      final id = x.createThread(RegExp(r'[?!.…]$').hasMatch(text) ? text : '$text?');
      x.updateThread(id, (_) => {'category': q.category});
    }
    return asked.length;
  });
  return made ?? 0;
}

/// THE QUESTIONS YOUR STORY ASKS: an empty Plot threads page is not a definition of a thread but the questions a reader
/// carries through a book, to finish: what the whole book answers, a mystery, who might fall for whom, what someone is
/// hiding. **Ask them** makes a thread for each written (a main plot, a mystery, a romance, a villain's storyline), so
/// each can be followed chapter by chapter and the app can say when one has gone quiet. Any may stay empty.
class StoryQuestions extends StatefulWidget {
  const StoryQuestions({super.key, required this.novelId, required this.onNew});

  final String novelId;

  /// One thread by hand, as New thread.
  final VoidCallback onNew;

  @override
  State<StoryQuestions> createState() => _StoryQuestionsState();
}

class _StoryQuestionsState extends State<StoryQuestions> {
  late final _lines = [for (final q in storyQuestions) (q, TextEditingController())];

  @override
  void dispose() {
    for (final (_, c) in _lines) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _any => _lines.any((l) => l.$2.text.trim().isNotEmpty);

  void _ask() {
    final actions = PlotActions(context, widget.novelId);
    final made = askTheQuestions(actions, [for (final (q, c) in _lines) (q, c.text)]);
    if (made > 0) {
      actions.tell(
        made == 1
            ? 'Your first thread is ready. Mark the chapters where it moves.'
            : 'Your $made threads are ready. Mark the chapters where each moves.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return VaultFrame(
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('The questions your story asks', style: vaultHeading(context, size: 18, weight: 700)),
          const SizedBox(height: 4),
          Text(
            'Every question you raise is a promise to the reader. Write the ones your book makes; each becomes a thread '
            'to follow, and you will be told when one has gone quiet.',
            style: vaultText(context, size: 16, color: scheme.onSurfaceVariant, style: FontStyle.italic),
          ),
          const VaultRule(),
          for (final (q, controller) in _lines)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(q.asks, style: vaultHeading(context, size: 11.5, weight: 700, color: scheme.onSurfaceVariant)),
                  TextField(
                    controller: controller,
                    onChanged: (_) => setState(() {}),
                    textCapitalization: TextCapitalization.sentences,
                    textInputAction: TextInputAction.next,
                    style: vaultText(context, size: 18),
                    decoration: InputDecoration(isDense: true, hintText: q.hint),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 6),
          FilledButton.icon(
            onPressed: _any ? _ask : null,
            icon: const Icon(Icons.timeline),
            label: const Text('Ask them'),
          ),
          Align(
            child: TextButton(onPressed: widget.onNew, child: const Text('New thread')),
          ),
        ],
      ),
    );
  }
}
