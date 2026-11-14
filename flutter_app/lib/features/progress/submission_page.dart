import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/manuscript/submission.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/text/proof.dart';
import '../characters/widgets/vault.dart';
import '../library/library_actions.dart';
import '../review/proof_page.dart';
import 'charts_page.dart' show fileSlug;
import 'sampler_page.dart';

/// THE SUBMISSION KIT on screen (`submission.dart` says what is in it): what an agent or a publisher asks for, each
/// ready or not and the way to make it so (the book's details, the slips in the opening chapters, the sampler PDF),
/// then the query letter laid out from the book's own details, its gaps (the parts only the author can write) marked
/// as the editor marks a gap. **Copy the letter**, or **Save it** as text. Nothing here writes into the book.

/// The words of the book [novelId]: its chapters' counts.
int bookWords(WidgetRef ref, String novelId) =>
    ref.read(novelStoreProvider).rowsIn(novelId, 'chapters').fold(0, (n, r) => n + StoryNode(r).wordCount);

/// The kit of [novelId], with [proofs] the slips of the whole book.
List<KitCheck> kitOf(WidgetRef ref, String novelId, List<Proof> proofs) {
  final novel = ref.watch(novelStoreProvider).novel(novelId);
  return submissionKit(
    title: novel?.title ?? '',
    author: novel?.author ?? '',
    genre: novel?.primaryGenre ?? '',
    words: bookWords(ref, novelId),
    synopsis: novel?.synopsis ?? '',
    openingSlips: proofs.where((p) => p.chapter <= openingChapters).length,
  );
}

/// Opens the kit of [novelId]; [proofs] are the book's slips and [titles] its chapters' titles.
Future<void> showSubmissionKit(
  BuildContext context, {
  required String novelId,
  required List<Proof> proofs,
  required Map<String, String> titles,
  void Function(String nodeId, String text, int block)? onRead,
  void Function(String nodeId)? onChapter,
}) => Navigator.of(context, rootNavigator: true).push(
  MaterialPageRoute<void>(
    builder: (_) =>
        SubmissionScreen(novelId: novelId, proofs: proofs, titles: titles, onRead: onRead, onChapter: onChapter),
  ),
);

class SubmissionScreen extends ConsumerStatefulWidget {
  const SubmissionScreen({
    super.key,
    required this.novelId,
    required this.proofs,
    required this.titles,
    this.onRead,
    this.onChapter,
  });

  final String novelId;
  final List<Proof> proofs;
  final Map<String, String> titles;
  final void Function(String nodeId, String text, int block)? onRead;
  final void Function(String nodeId)? onChapter;

  @override
  ConsumerState<SubmissionScreen> createState() => _SubmissionScreenState();
}

class _SubmissionScreenState extends ConsumerState<SubmissionScreen> {
  String? _message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final novel = ref.watch(novelStoreProvider).novel(widget.novelId);
    if (novel == null) return const Scaffold(body: SizedBox.shrink());
    final kit = kitOf(ref, widget.novelId, widget.proofs);
    final ready = kit.where((k) => k.ready).length;
    final words = bookWords(ref, widget.novelId);
    final length = lengthFor(novel.primaryGenre);
    final letter = queryLetter(
      title: novel.title,
      author: novel.author,
      genre: novel.primaryGenre,
      more: novel.secondaryGenres,
      words: words,
      finished: words >= length.low || (novel.targetWordCount != null && words >= novel.targetWordCount!),
      synopsis: novel.synopsis,
    );
    final title = novel.title.trim().isEmpty ? 'your book' : novel.title.trim();

    // The way to make a thing ready, where it is not (and, once the opening is clean, the sample pages).
    Widget? action(KitCheck k) => switch (k.item) {
      KitItem.title || KitItem.author || KitItem.genre || KitItem.synopsis when k.ready => null,
      KitItem.title || KitItem.author || KitItem.genre || KitItem.synopsis => TextButton.icon(
        onPressed: () => editNovelFlow(context, ref, novel),
        icon: const Icon(Icons.edit_outlined, size: 18),
        label: const Text('Edit the book’s details'),
      ),
      KitItem.opening =>
        widget.proofs.any((p) => p.chapter <= openingChapters)
            ? TextButton.icon(
                onPressed: () => showProof(
                  context,
                  title: title,
                  proofs: [
                    for (final p in widget.proofs)
                      if (p.chapter <= openingChapters) p,
                  ],
                  titles: widget.titles,
                  onRead: widget.onRead == null
                      ? null
                      : (id, text, block) {
                          Navigator.of(context).pop();
                          widget.onRead!(id, text, block);
                        },
                  onChapter: widget.onChapter == null
                      ? null
                      : (id) {
                          Navigator.of(context).pop();
                          widget.onChapter!(id);
                        },
                ),
                icon: const Icon(Icons.spellcheck, size: 18),
                label: const Text('See the slips'),
              )
            : TextButton.icon(
                onPressed: () => showSampler(context, novelId: widget.novelId),
                icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                label: const Text('Make the sample pages'),
              ),
      KitItem.length => null,
    };

    return Scaffold(
      appBar: AppBar(title: const Text('Submission kit')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'What an agent or a publisher asks for, and how far $title has come: $ready of ${kit.length} ready.',
              style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),
            for (final k in kit)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 8, 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Icon(
                          k.ready ? Icons.check_circle : Icons.radio_button_unchecked,
                          color: k.ready ? scheme.primary : scheme.onSurfaceVariant,
                          semanticLabel: k.ready ? 'Ready' : 'Not yet',
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              k.item.label,
                              style: vaultHeading(context, size: 14.5, color: scheme.onSurface, weight: 700),
                            ),
                            const SizedBox(height: 2),
                            Text(k.said, style: vaultText(context, size: 14, color: scheme.onSurfaceVariant)),
                            if (action(k) case final a?) Align(alignment: Alignment.centerLeft, child: a),
                            if (action(k) == null) const SizedBox(height: 8),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 14),
            Text(
              'THE QUERY LETTER',
              style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
            ),
            const SizedBox(height: 4),
            Text(
              'Laid out from the book’s details. The marked parts are yours to write: no one else can.',
              style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 10),
            QueryLetterPage(letter: letter),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: letter));
                      if (mounted) setState(() => _message = 'The letter is copied, gaps and all.');
                    },
                    icon: const Icon(Icons.copy, size: 18),
                    label: const Text('Copy the letter'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () async {
                      final box = context.findRenderObject() as RenderBox?;
                      final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
                      final said = await ref
                          .read(backupFilesProvider)
                          .saveFile(
                            'query-letter-${fileSlug(title).toLowerCase()}.txt',
                            Uint8List.fromList(utf8.encode(letter)),
                            kind: FileKind.text,
                            origin: origin,
                          );
                      if (mounted) setState(() => _message = said);
                    },
                    icon: const Icon(Icons.save_alt, size: 18),
                    label: const Text('Save it'),
                  ),
                ),
              ],
            ),
            if (_message != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  _message!,
                  textAlign: TextAlign.center,
                  style: vaultText(context, size: 13, color: scheme.onSurfaceVariant),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The letter on paper, its gaps marked as the editor marks a gap.
class QueryLetterPage extends StatelessWidget {
  const QueryLetterPage({super.key, required this.letter});

  final String letter;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF2A241D);
    const gap = Color(0xFFF6D97A);
    final spans = <InlineSpan>[];
    var at = 0;
    for (final m in RegExp(r'\[\[([^\]]*)\]\]').allMatches(letter)) {
      if (m.start > at) spans.add(TextSpan(text: letter.substring(at, m.start)));
      spans.add(
        TextSpan(
          text: ' ${m[1]} ',
          style: const TextStyle(backgroundColor: gap, fontStyle: FontStyle.italic),
        ),
      );
      at = m.end;
    }
    if (at < letter.length) spans.add(TextSpan(text: letter.substring(at)));
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F1),
        borderRadius: BorderRadius.circular(4),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 10, offset: Offset(0, 4))],
      ),
      child: Text.rich(
        TextSpan(children: spans),
        style: vaultText(context, size: 14.5, color: ink).copyWith(height: 1.5),
      ),
    );
  }
}
