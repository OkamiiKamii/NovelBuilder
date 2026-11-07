import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/destinations.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/states.dart';
import '../collab/collab_providers.dart';
import '../collab/review_workspace.dart';
import '../workspace/open_novel.dart';
import '../workspace/section_page.dart';
import 'chapter_editor.dart';
import 'outline_panel.dart';
import 'write_providers.dart';
import 'writing_prefs.dart';

/// Write: the manuscript's outline beside the chapter being written (on a phone, one then the other).
class WritePage extends ConsumerWidget {
  const WritePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const SectionPage(destination: Destination.write);
    // A review copy is read, commented on and suggested to; its text is not written here.
    if (ref.watch(reviewMarkProvider) case final mark?) return ReviewWorkspace(mark: mark);
    final nodes = ref.watch(outlineProvider);
    final selectedId = ref.watch(selectedNodeProvider);
    final node = nodes.where((n) => n.id == selectedId).firstOrNull;

    Widget editor({VoidCallback? onBack}) => node == null
        ? EmptyState(
            icon: Icons.edit_note,
            title: nodes.isEmpty ? 'Start with a chapter' : 'Choose a chapter or scene',
            message: nodes.isEmpty
                ? 'Add one from the outline. Everything you write is saved on this device as you go.'
                : 'Pick one from the outline to write in it.',
          )
        : ChapterEditor(key: ValueKey(node.id), novelId: novelId, node: node, onBack: onBack);

    // Focus mode: only the chapter being written.
    final focus = ref.watch(focusModeProvider) && node != null;
    if (WindowSize.of(context) == WindowSize.compact) {
      if (focus) return editor();
      return node == null
          ? const OutlinePanel()
          : editor(onBack: () => ref.read(selectedNodeProvider.notifier).select(null));
    }
    // On a computer, the same row in focus mode, without the outline, so the chapter's editor (and its caret) is kept
    // as it is. On a tablet the editor is built afresh, as before: there the keyboard closes and the caret goes anyway,
    // and keeping it trips a known slip of super_editor 0.3.0-dev.50's Android handles (README, "The typewriter").
    final computer = switch (Theme.of(context).platform) {
      TargetPlatform.macOS || TargetPlatform.windows || TargetPlatform.linux => true,
      _ => false,
    };
    if (focus && !computer) return editor();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!focus) ...[const SizedBox(width: 300, child: OutlinePanel()), const VerticalDivider(width: 1)],
        Expanded(key: const ValueKey('chapter'), child: editor()),
      ],
    );
  }
}
