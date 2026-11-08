import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/records/novel.dart';
import '../characters/widgets/vault.dart';
import 'bookshelf.dart' show BookJacket;

/// The ideas still without a line of their own (no summary), in shelf order.
List<Novel> unwrittenIdeas(List<Novel> ideas) => [
  for (final n in ideas)
    if (n.synopsis.trim().isEmpty) n,
];

/// A NOTE ABOVE THE IDEAS: how many have no premise yet, and one press to go through them as index cards.
class IdeaCardsNote extends StatelessWidget {
  const IdeaCardsNote({super.key, required this.ideas});

  final List<Novel> ideas;

  @override
  Widget build(BuildContext context) {
    final bare = unwrittenIdeas(ideas);
    if (bare.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: scheme.primary.withValues(alpha: 0.55)),
          color: scheme.surface,
        ),
        child: Row(
          children: [
            Icon(Icons.style_outlined, color: scheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                bare.length == 1
                    ? 'One idea has no premise yet. Give it a line.'
                    : '${formatNumber(bare.length)} ideas have no premise yet. Give each a line.',
                style: vaultText(context, size: 16),
              ),
            ),
            TextButton(onPressed: () => showIdeaCards(context, bare), child: const Text('Begin')),
          ],
        ),
      ),
    );
  }
}

/// THE IDEA FILE: the ideas without a premise, one index card at a time: the jacket, the title, "In one line, what is
/// it about?", and **Save & next** (the line becomes the book's summary), **Skip**, or **Done**. How far through, and
/// how many were given a line. Nothing but what is typed and saved is changed.
Future<void> showIdeaCards(BuildContext context, List<Novel> ideas) => showDialog<void>(
  context: context,
  builder: (context) => WindowSize.of(context) == WindowSize.compact
      ? Dialog.fullscreen(child: _IdeaCards(ideas: ideas))
      : Dialog(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: _IdeaCards(ideas: ideas),
          ),
        ),
);

class _IdeaCards extends ConsumerStatefulWidget {
  const _IdeaCards({required this.ideas});
  final List<Novel> ideas;

  @override
  ConsumerState<_IdeaCards> createState() => _IdeaCardsState();
}

class _IdeaCardsState extends ConsumerState<_IdeaCards> {
  var _at = 0;
  var _saved = 0;
  final _line = TextEditingController();

  @override
  void dispose() {
    _line.dispose();
    super.dispose();
  }

  void _next({required bool save}) {
    if (save && _line.text.trim().isNotEmpty) {
      ref.read(libraryServiceProvider).updateDetails(widget.ideas[_at].id, {'synopsis': _line.text.trim()});
      _saved++;
    }
    if (_at + 1 >= widget.ideas.length) {
      _finish();
      return;
    }
    setState(() {
      _at++;
      _line.clear();
    });
  }

  void _finish() {
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).pop();
    if (_saved > 0) {
      messenger.showSnackBar(
        SnackBar(content: Text(_saved == 1 ? 'One idea has its line.' : '$_saved ideas have their lines.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final idea = widget.ideas[_at];
    final title = idea.title.isEmpty ? 'Untitled novel' : idea.title;
    final last = _at + 1 == widget.ideas.length;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'The idea file · ${_at + 1} of ${widget.ideas.length}',
                    style: vaultHeading(context, size: 13, weight: 700),
                  ),
                ),
                TextButton(onPressed: _finish, child: const Text('Done')),
              ],
            ),
            const SizedBox(height: 4),
            LinearProgressIndicator(
              value: (_at + 1) / widget.ideas.length,
              minHeight: 3,
              color: scheme.primary,
              backgroundColor: scheme.outlineVariant.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 24),
            // The card: the jacket beside its title, as an index card in a box.
            KeyedSubtree(
              key: ValueKey(idea.id),
              child: VaultFrame(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        BookJacket(novel: idea, width: 84),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Semantics(
                                header: true,
                                child: Text(
                                  title,
                                  style: vaultHeading(context, size: 18, weight: 700, color: scheme.onSurface),
                                ),
                              ),
                              if (idea.author.isNotEmpty) Text(idea.author, style: vaultText(context, size: 16)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'In one line, what is it about?',
                      style: vaultHeading(context, size: 11.5, weight: 700, color: scheme.onSurfaceVariant),
                    ),
                    TextField(
                      controller: _line,
                      autofocus: true,
                      maxLines: 3,
                      minLines: 1,
                      onChanged: (_) => setState(() {}),
                      textCapitalization: TextCapitalization.sentences,
                      style: vaultText(context, size: 18),
                      decoration: const InputDecoration(hintText: 'Who wants what, and what stands in the way.'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: _line.text.trim().isEmpty ? null : () => _next(save: true),
              child: Text(last ? 'Save' : 'Save & next'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => _next(save: false), child: Text(last ? 'Skip and finish' : 'Skip')),
          ],
        ),
      ),
    );
  }
}
