import 'package:flutter/material.dart';

import '../../shared/domain/text/proof.dart';
import '../characters/widgets/vault.dart';

/// BEFORE A READER SEES IT on screen (`proof.dart` finds them): every slip in the book, as a proofreader marks them,
/// each in its sentence with the slip marked in red, what it is, and where; a kind at a time or all. **Read it there**
/// opens the chapter at it, to be put right by hand: nothing here changes a word.

/// The proofreader's red.
const proofRed = Color(0xFFB5402F);

/// Opens the slips [proofs] of the book called [title] ([titles] are its chapters' titles by id). [onRead] opens a
/// chapter at a slip's words; [onChapter] opens a chapter (for a chapter with no title or no words).
Future<void> showProof(
  BuildContext context, {
  required String title,
  required List<Proof> proofs,
  required Map<String, String> titles,
  void Function(String nodeId, String text, int block)? onRead,
  void Function(String nodeId)? onChapter,
}) => Navigator.of(context, rootNavigator: true).push(
  MaterialPageRoute<void>(
    builder: (_) => ProofScreen(title: title, proofs: proofs, titles: titles, onRead: onRead, onChapter: onChapter),
  ),
);

class ProofScreen extends StatefulWidget {
  const ProofScreen({
    super.key,
    required this.title,
    required this.proofs,
    required this.titles,
    this.onRead,
    this.onChapter,
  });

  final String title;
  final List<Proof> proofs;
  final Map<String, String> titles;
  final void Function(String nodeId, String text, int block)? onRead;
  final void Function(String nodeId)? onChapter;

  @override
  State<ProofScreen> createState() => _ProofScreenState();
}

class _ProofScreenState extends State<ProofScreen> {
  Slip? _only;

  void _open(Proof p) {
    Navigator.of(context).pop();
    if (p.find.isEmpty) {
      widget.onChapter?.call(p.nodeId);
    } else {
      widget.onRead?.call(p.nodeId, p.find, p.block);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final counts = <Slip, int>{};
    for (final p in widget.proofs) {
      counts.update(p.kind, (n) => n + 1, ifAbsent: () => 1);
    }
    final shown = [
      for (final p in widget.proofs)
        if (_only == null || p.kind == _only) p,
    ];
    final n = widget.proofs.length;
    return Scaffold(
      appBar: AppBar(title: const Text('Before a reader sees it')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Text(
            n == 0
                ? 'Nothing to check in ${widget.title}: it reads clean.'
                : '${n == 1 ? 'One thing' : '$n things'} to check in ${widget.title}, as a proofreader would mark '
                      'them. Nothing here changes your words: each is put right in its chapter.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
          if (n > 0) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  label: Text('All $n'),
                  selected: _only == null,
                  onSelected: (_) => setState(() => _only = null),
                ),
                for (final kind in Slip.values)
                  if (counts[kind] case final c?)
                    ChoiceChip(
                      label: Text('${kind.title} $c'),
                      selected: _only == kind,
                      onSelected: (_) => setState(() => _only = _only == kind ? null : kind),
                    ),
              ],
            ),
            const SizedBox(height: 12),
            for (final p in shown) _ProofTile(proof: p, chapterTitle: widget.titles[p.nodeId] ?? '', onOpen: _open),
          ],
        ],
      ),
    );
  }
}

class _ProofTile extends StatelessWidget {
  const _ProofTile({required this.proof, required this.chapterTitle, required this.onOpen});

  final Proof proof;
  final String chapterTitle;
  final ValueChanged<Proof> onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final p = proof;
    final where = chapterTitle.trim().isEmpty
        ? 'Chapter ${p.chapter}'
        : 'Chapter ${p.chapter} · ${chapterTitle.trim()}';
    final marked = p.end > p.start;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              p.kind.title.toUpperCase(),
              style: vaultHeading(context, size: 10, color: proofRed, weight: 700).copyWith(letterSpacing: 1.8),
            ),
            const SizedBox(height: 6),
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: p.text.substring(0, p.start)),
                  if (marked)
                    TextSpan(
                      text: p.text.substring(p.start, p.end),
                      style: TextStyle(
                        color: proofRed,
                        fontWeight: FontWeight.w700,
                        backgroundColor: proofRed.withValues(alpha: 0.12),
                        decoration: TextDecoration.underline,
                        decorationColor: proofRed,
                        decorationStyle: TextDecorationStyle.wavy,
                      ),
                    ),
                  TextSpan(text: p.text.substring(p.end)),
                ],
              ),
              style: vaultText(context, size: 15.5, color: scheme.onSurface).copyWith(height: 1.4),
            ),
            const SizedBox(height: 6),
            Text(
              p.note,
              style: vaultText(context, size: 14, color: scheme.onSurface).copyWith(fontStyle: FontStyle.italic),
            ),
            Row(
              children: [
                Expanded(
                  child: Text(
                    where,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: vaultText(context, size: 12.5, color: scheme.onSurfaceVariant),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => onOpen(p),
                  icon: const Icon(Icons.menu_book_outlined, size: 18),
                  label: const Text('Read it there'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
