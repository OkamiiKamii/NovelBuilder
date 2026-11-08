import 'package:flutter/material.dart';

import '../../../core/format.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../characters/widgets/vault.dart';

/// THE STORY AS TOLD, AS A FIRST TIMELINE: an empty timeline in a novel with chapters shows those chapters as a faint
/// timeline (a dot and the title of each, the first few, "and 9 more"), with one press to make them its events. They
/// keep the order the story tells them, wait to be given dates, and each links to its chapter. A new event can still be
/// made by hand.
class ChapterSeed extends StatelessWidget {
  const ChapterSeed({super.key, required this.chapters, required this.onSeed, required this.onNew});

  final List<StoryNode> chapters;
  final VoidCallback onSeed;
  final VoidCallback onNew;

  static const _shown = 5;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final faint = scheme.onSurfaceVariant;
    final more = chapters.length - _shown;
    return VaultFrame(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('What happened, and when', style: vaultHeading(context, size: 18, weight: 700)),
          const SizedBox(height: 6),
          Text(
            'The timeline is the story’s own chronology, apart from the order chapters are told in. Begin with the '
            'story as you tell it, then move each event to when it happens.',
            style: vaultText(context, size: 16, color: faint, style: FontStyle.italic),
          ),
          const VaultRule(),
          // The chapters, drawn as the timeline they would make.
          ExcludeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final (i, c) in chapters.take(_shown).indexed)
                  IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(
                          width: 24,
                          child: Column(
                            children: [
                              Expanded(child: _Stem(visible: i > 0)),
                              Container(
                                width: 11,
                                height: 11,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(color: scheme.primary, width: 2),
                                ),
                              ),
                              Expanded(child: _Stem(visible: i < chapters.length - 1 && i < _shown - 1 || more > 0)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Text(
                              c.displayTitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: vaultText(context, size: 17, color: scheme.onSurface),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                if (more > 0)
                  Padding(
                    padding: const EdgeInsets.only(left: 36, top: 2),
                    child: Text(
                      'and ${plural(more, 'more chapter')}',
                      style: vaultText(context, size: 15, color: faint, style: FontStyle.italic),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: onSeed,
                icon: const Icon(Icons.timeline),
                label: Text(
                  chapters.length == 1
                      ? 'Make an event from the chapter'
                      : 'Make ${chapters.length} events from the chapters',
                ),
              ),
              OutlinedButton.icon(onPressed: onNew, icon: const Icon(Icons.add), label: const Text('New event')),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stem extends StatelessWidget {
  const _Stem({required this.visible});
  final bool visible;

  @override
  Widget build(BuildContext context) => Center(
    child: Container(width: 2, color: visible ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.4) : null),
  );
}
