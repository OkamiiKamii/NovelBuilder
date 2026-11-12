import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:super_editor/super_editor.dart';

import '../../shared/data/providers.dart';
import '../characters/widgets/vault.dart';
import '../plot/plot_providers.dart' show chapterPlanPath;
import 'margin.dart';

/// Ways into a first line: the openings writers reach for. Prompts to think with; nothing is written for the author.
const firstPageWays = [
  (label: 'A line of dialogue', prompt: 'Someone speaks. Who, to whom, and what do they want from them?'),
  (label: 'A place', prompt: 'Where are we? Give one detail only this point of view would notice.'),
  (label: 'The middle of things', prompt: 'Something is already happening. Begin as it happens, and explain later.'),
];

/// Whether [document] holds no words yet: every paragraph empty or only spaces.
bool documentIsEmpty(Document document) {
  for (final node in document) {
    if (node is TextNode && node.text.toPlainText().trim().isNotEmpty) return false;
  }
  return true;
}

/// THE FIRST PAGE: a chapter or scene with no words yet opens on what the author already knows of it, set on the page
/// under the first line: where the story stands (the last lines of the chapter before), what this chapter is for (its
/// objective or summary, its planned beats, who is on the page, the threads that move here), and a few ways into a
/// first line. On a phone it is the plan, which the Desk keeps folded away, in sight when it is wanted most.
///
/// It writes nothing: pressing it, or one of the ways in, puts the caret on the page; with the first word it is gone
/// (it watches the text, so it comes back only if the page is emptied). Read once from the store as the page opens.
class FirstPage extends ConsumerStatefulWidget {
  const FirstPage({
    super.key,
    required this.novelId,
    required this.nodeId,
    required this.document,
    required this.onWrite,
    this.onLeave,
    this.notesBeside = false,
    this.ink,
    this.muted,
  });

  final String novelId;
  final String nodeId;
  final Document document;

  /// Puts the caret on the page, the editor focused.
  final VoidCallback onWrite;

  /// Before going to the chapter's plan (the page's work is saved first).
  final VoidCallback? onLeave;

  /// Whether the margin shows the same notes beside the page: then only the ways in are here, not the notes twice.
  final bool notesBeside;

  /// The page colour's ink, when the author chose a page colour.
  final Color? ink;
  final Color? muted;

  @override
  ConsumerState<FirstPage> createState() => _FirstPageState();
}

class _FirstPageState extends ConsumerState<FirstPage> {
  late bool _empty = documentIsEmpty(widget.document);
  late MarginNotes _notes = _read();
  int? _way;

  MarginNotes _read() => marginNotesOf(ref.read(novelStoreProvider), widget.novelId, widget.nodeId);

  @override
  void initState() {
    super.initState();
    widget.document.addListener(_changed);
  }

  @override
  void didUpdateWidget(FirstPage old) {
    super.didUpdateWidget(old);
    if (!identical(old.document, widget.document)) {
      old.document.removeListener(_changed);
      widget.document.addListener(_changed);
      _empty = documentIsEmpty(widget.document);
    }
    if (old.nodeId != widget.nodeId) {
      _notes = _read();
      _way = null;
    }
  }

  @override
  void dispose() {
    widget.document.removeListener(_changed);
    super.dispose();
  }

  void _changed(DocumentChangeLog _) {
    final empty = documentIsEmpty(widget.document);
    if (empty != _empty && mounted) setState(() => _empty = empty);
  }

  @override
  Widget build(BuildContext context) {
    if (!_empty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final text = widget.ink ?? scheme.onSurface;
    final soft = widget.muted ?? scheme.onSurfaceVariant;
    final beside = widget.notesBeside;
    final n = _notes;
    final purpose = beside ? '' : (n.objective.isNotEmpty ? n.objective : n.summary);
    final planned = beside || purpose.isNotEmpty || n.beats.isNotEmpty || n.people.isNotEmpty || n.threads.isNotEmpty;

    Widget heading(String s) => Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 6),
      child: Semantics(header: true, child: Text(s, style: vaultHeading(context, size: 12, weight: 700))),
    );
    final body = vaultText(context, size: 17, color: text);

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Semantics(
            container: true,
            label: 'The first page',
            child: GestureDetector(
              // A press on the page (not on a button) is a press to write.
              onTap: widget.onWrite,
              behavior: HitTestBehavior.opaque,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    beside
                        ? 'Nothing written here yet. What you know of it is beside the page.'
                        : 'Nothing written here yet. What you already know of it:',
                    style: vaultText(context, size: 15, color: soft, style: FontStyle.italic),
                  ),
                  if (n.before case final before? when !beside) ...[
                    heading('Where the story stands'),
                    Text('${before.title} ends:', style: vaultText(context, size: 15, color: soft)),
                    const SizedBox(height: 4),
                    Text(
                      '${before.cut ? '…' : ''}${before.text}',
                      maxLines: 5,
                      overflow: TextOverflow.ellipsis,
                      style: vaultText(context, size: 17, color: text, style: FontStyle.italic),
                    ),
                  ],
                  if (purpose.isNotEmpty) ...[heading('This chapter is for'), Text(purpose, style: body)],
                  if (!beside && n.beats.isNotEmpty) ...[
                    heading('Planned'),
                    for (final (i, b) in n.beats.indexed)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 26,
                              child: Text('${i + 1}.', style: vaultText(context, size: 17, color: soft)),
                            ),
                            Expanded(child: Text(b, style: body)),
                          ],
                        ),
                      ),
                  ],
                  if (!beside && n.people.isNotEmpty) ...[
                    heading('On the page'),
                    Text(
                      [for (final p in n.people) p.pov ? '${p.name} (point of view)' : p.name].join(', '),
                      style: body,
                    ),
                  ],
                  if (!beside && n.threads.isNotEmpty) ...[
                    heading('Moving here'),
                    for (final t in n.threads)
                      Text(t.development.isEmpty ? t.title : '${t.title}: ${t.development}', style: body),
                  ],
                  if (!planned)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 8,
                        children: [
                          Text('No plan for it yet.', style: vaultText(context, size: 15, color: soft)),
                          TextButton.icon(
                            onPressed: () {
                              widget.onLeave?.call();
                              context.go(chapterPlanPath(widget.nodeId));
                            },
                            icon: const Icon(Icons.edit_note),
                            label: const Text('Plan this chapter'),
                          ),
                        ],
                      ),
                    ),
                  heading('A way in'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final (i, w) in firstPageWays.indexed)
                        ChoiceChip(
                          label: Text(w.label),
                          selected: _way == i,
                          onSelected: (_) {
                            setState(() => _way = i);
                            widget.onWrite();
                          },
                        ),
                    ],
                  ),
                  if (_way case final i?)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          firstPageWays[i].prompt,
                          style: vaultText(context, size: 16, color: soft, style: FontStyle.italic),
                        ),
                      ),
                    ),
                  const SizedBox(height: 10),
                  Text(
                    'Write on the first line above; this page goes with your first word.',
                    style: vaultText(context, size: 14, color: soft),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
