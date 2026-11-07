import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../shared/domain/reader/book.dart';
import '../workspace/open_novel.dart';
import '../workspace/section_page.dart';
import 'reader_providers.dart';

const _fields = <({String field, String label, String hint, int lines})>[
  (field: 'dedication', label: 'Dedication', hint: 'For …', lines: 2),
  (field: 'epigraph', label: 'Epigraph', hint: 'A quotation that opens the book.', lines: 3),
  (field: 'epigraphSource', label: 'Epigraph source', hint: 'Who said or wrote it.', lines: 1),
  (field: 'copyright', label: 'Copyright page', hint: 'Copyright © 2026 …. All rights reserved.', lines: 3),
  (field: 'acknowledgements', label: 'Acknowledgements', hint: 'Thanks, at the back of the book.', lines: 4),
  (field: 'aboutAuthor', label: 'About the author', hint: 'A few lines about you, at the very end.', lines: 4),
];

String _breakName(String mark) => switch (mark) {
  '' => 'A blank line',
  '—' => '— (a dash)',
  '#' => '# (as manuscripts mark it)',
  _ => mark,
};

/// The pages around the story, which the reader and publishing formats print: dedication, epigraph, copyright,
/// acknowledgements, about the author, and the mark between scenes. Each field saves as it is typed.
class BookDetailsPage extends ConsumerWidget {
  const BookDetailsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const SectionPage(destination: Destination.write);
    final read = ref.watch(readerSourceProvider);
    final matter = read?.source.matter ?? BookMatter(const {});
    final actions = ref.read(matterActionsProvider);
    final mark = matter.sceneBreak;
    final custom = !sceneBreaks.contains(mark);
    return PageScaffold(
      title: 'Book details',
      actions: [
        FilledButton.tonalIcon(
          onPressed: () => context.go('${Destination.write.path}/read'),
          icon: const Icon(Icons.menu_book_outlined),
          label: const Text('Read the book'),
        ),
      ],
      maxWidth: 720,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final f in _fields)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: SavedTextField(
                key: ValueKey('matter:$novelId:${f.field}'),
                label: f.label,
                hint: f.hint,
                value: matter.raw[f.field] is String ? matter.raw[f.field]! as String : '',
                multiline: f.lines > 1,
                minLines: f.lines,
                onChanged: (v) => actions.set(novelId, f.field, v),
              ),
            ),
          DropdownButtonFormField<String>(
            key: ValueKey('scene-break:$novelId:${custom ? 'custom' : mark}'),
            initialValue: custom ? null : mark,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: 'Between scenes',
              helperText: custom ? 'Your own mark: $mark' : 'Printed where one scene ends and the next begins.',
            ),
            items: [for (final m in sceneBreaks) DropdownMenuItem(value: m, child: Text(_breakName(m)))],
            onChanged: (v) {
              if (v != null) actions.set(novelId, 'sceneBreak', v);
            },
          ),
          const SizedBox(height: 16),
          SavedTextField(
            key: ValueKey('matter:$novelId:sceneBreak'),
            label: 'Or your own mark',
            hint: 'Up to 12 characters, like ~ or ◆',
            value: custom ? mark : '',
            onChanged: (v) {
              if (v.trim().isNotEmpty) actions.set(novelId, 'sceneBreak', v.length > 12 ? v.substring(0, 12) : v);
            },
          ),
        ],
      ),
    );
  }
}
