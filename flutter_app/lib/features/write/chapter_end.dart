import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import 'write_providers.dart';

/// THE CHAPTER'S END: under the last line of a chapter or scene, a printer's end ornament and the page to turn to.
/// When something follows in reading order (the chapter's first scene, or the next chapter), it is named with its
/// length, and one press opens it with the caret after its last word. At the end of the manuscript, one press begins
/// the next chapter (made after this one, in the same part) and opens it to write in. So the writing carries on from
/// where it stops, without going back to the contents. Changes nothing until pressed; never touches the text.
class ChapterEnd extends ConsumerWidget {
  const ChapterEnd({super.key, required this.novelId, required this.node, this.ink, this.muted});

  final String novelId;
  final StoryNode node;

  /// The page colour's ink, when the author chose a page colour.
  final Color? ink;
  final Color? muted;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final documents = [
      for (final n in readingOrder(ref.watch(outlineProvider)))
        if (n.kind == NodeKind.chapter || n.kind == NodeKind.scene) n,
    ];
    final at = documents.indexWhere((n) => n.id == node.id);
    final next = at >= 0 && at + 1 < documents.length ? documents[at + 1] : null;
    final text = ink ?? scheme.onSurface;
    final soft = muted ?? scheme.onSurfaceVariant;

    void open(StoryNode to) {
      ref.read(selectedNodeProvider.notifier).select(to.id);
      ref.read(pendingCaretEndProvider.notifier).request(to.id);
    }

    void begin() {
      final manuscript = ref.read(manuscriptServiceProvider);
      // After this chapter (a scene's chapter), in the same part.
      final chapter = node.kind == NodeKind.scene
          ? ref.read(outlineProvider).where((n) => n.id == node.parentId).firstOrNull ?? node
          : node;
      try {
        open(manuscript.create(novelId, NodeKind.chapter, parentId: chapter.parentId));
      } on Object catch (e) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('The next chapter could not be made: $e'), persist: false));
      }
    }

    final chapters = documents.where((n) => n.kind == NodeKind.chapter).length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 36, 24, 48),
      child: Column(
        children: [
          _EndMark(color: scheme.primary),
          const SizedBox(height: 28),
          Semantics(
            container: true,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                children: [
                  Text(next == null ? 'The end, so far' : 'Next', style: vaultHeading(context, size: 12, weight: 700)),
                  const SizedBox(height: 6),
                  Text(
                    next == null ? 'Chapter ${chapters + 1}' : next.displayTitle,
                    textAlign: TextAlign.center,
                    style: vaultText(context, size: 24, color: text),
                  ),
                  if (next != null)
                    Text(
                      [
                        if (next.kind == NodeKind.scene) 'A scene',
                        next.wordCount == 0 ? 'Not begun' : plural(next.wordCount, 'word'),
                      ].join(' · '),
                      style: vaultText(context, size: 15, color: soft, style: FontStyle.italic),
                    ),
                  const SizedBox(height: 16),
                  if (next != null)
                    FilledButton.icon(
                      onPressed: () => open(next),
                      icon: const Icon(Icons.arrow_forward),
                      label: Text('Continue to “${next.displayTitle}”'),
                    )
                  else
                    FilledButton.icon(
                      onPressed: begin,
                      icon: const Icon(Icons.add),
                      label: const Text('Begin the next chapter'),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The end of the text, marked as a printer marks it: a rule, three diamonds, a rule.
class _EndMark extends StatelessWidget {
  const _EndMark({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) {
    Widget diamond(double s) => Transform.rotate(
      angle: 0.785398,
      child: Container(width: s, height: s, color: color.withValues(alpha: 0.8)),
    );
    return ExcludeSemantics(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 60, height: 1, color: color.withValues(alpha: 0.5)),
          const SizedBox(width: 12),
          diamond(5),
          const SizedBox(width: 8),
          diamond(8),
          const SizedBox(width: 8),
          diamond(5),
          const SizedBox(width: 12),
          Container(width: 60, height: 1, color: color.withValues(alpha: 0.5)),
        ],
      ),
    );
  }
}
