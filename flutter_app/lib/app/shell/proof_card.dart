import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/characters/widgets/vault.dart';
import '../../features/review/proof_page.dart';
import '../../shared/data/background.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/text/proof.dart';
import 'submission_card.dart';

/// BEFORE A READER SEES IT, under More: how many slips a proofreader would mark in the book (`proof.dart`), and of
/// which kinds; pressed, the list of them (`features/review/proof_page.dart`). When there are none, it says the book
/// reads clean. Under it, the submission kit (`submission_card.dart`), told the slips found here. Worked out away from
/// the screen each time More opens; it only reads.
class ProofCard extends ConsumerStatefulWidget {
  const ProofCard({super.key, required this.novelId, required this.title, this.onRead, this.onChapter});

  final String novelId;
  final String title;
  final void Function(String nodeId, String text, int block)? onRead;
  final void Function(String nodeId)? onChapter;

  @override
  ConsumerState<ProofCard> createState() => _ProofCardState();
}

class _ProofCardState extends ConsumerState<ProofCard> {
  List<Proof>? _proofs;
  Map<String, String> _titles = const {};

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final nodes = [
      for (final n in readingOrder([for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n,
    ];
    _titles = {for (final n in nodes) n.id: n.title};
    final names = {
      for (final r in store.rowsIn(widget.novelId, 'loreEntries'))
        if ('${r['name'] ?? ''}'.trim().isNotEmpty) '${r['name']}'.trim(),
    };
    ref
        .read(runAsideProvider)(
          proofsJob(store.rawJsonIn(widget.novelId, 'chapterContents'), [for (final n in nodes) n.id], _titles, names),
        )
        .then(
          (proofs) {
            if (mounted) setState(() => _proofs = proofs);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'contents')),
        );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final proofs = _proofs;
    if (proofs == null) return const SizedBox.shrink();
    final counts = <Slip, int>{};
    for (final p in proofs) {
      counts.update(p.kind, (n) => n + 1, ifAbsent: () => 1);
    }
    final clean = proofs.isEmpty;
    final n = proofs.length;
    final summary = [
      for (final kind in Slip.values)
        if (counts[kind] case final c?) '$c ${_name(kind, c)}',
    ];
    final card = Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      child: Semantics(
        button: !clean,
        label: clean
            ? 'Before a reader sees it: nothing to check, the book reads clean'
            : 'Before a reader sees it: $n to check. ${summary.join(', ')}',
        excludeSemantics: true,
        child: Material(
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(14),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: clean
                ? null
                : () => showProof(
                    context,
                    title: widget.title.trim().isEmpty ? 'your book' : widget.title.trim(),
                    proofs: proofs,
                    titles: _titles,
                    onRead: widget.onRead,
                    onChapter: widget.onChapter,
                  ),
            child: Container(
              decoration: BoxDecoration(
                border: Border(left: BorderSide(color: clean ? scheme.primary : proofRed, width: 4)),
              ),
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
              child: Row(
                children: [
                  Icon(clean ? Icons.task_alt : Icons.spellcheck, color: clean ? scheme.primary : proofRed),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'BEFORE A READER SEES IT',
                          style: vaultHeading(
                            context,
                            size: 10,
                            color: clean ? scheme.primary : proofRed,
                            weight: 700,
                          ).copyWith(letterSpacing: 1.8),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          clean
                              ? 'Nothing to check: the book reads clean.'
                              : '${n == 1 ? 'One thing' : '$n things'} to check',
                          style: vaultText(context, size: 16, color: scheme.onSurface),
                        ),
                        if (!clean)
                          Text(
                            summary.join(' · '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: vaultText(context, size: 13, color: scheme.onSurfaceVariant),
                          ),
                      ],
                    ),
                  ),
                  if (!clean) Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    // Then the kit for sending it out, which knows the slips in the opening chapters from these.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        card,
        SubmissionCard(
          novelId: widget.novelId,
          proofs: proofs,
          titles: _titles,
          onRead: widget.onRead,
          onChapter: widget.onChapter,
        ),
      ],
    );
  }
}

/// What [count] slips of [kind] are called, small, in a line.
String _name(Slip kind, int count) => switch (kind) {
  Slip.name => count == 1 ? 'name slip' : 'name slips',
  Slip.doubled => count == 1 ? 'doubled word' : 'doubled words',
  Slip.didnt => 'after “didn’t”',
  Slip.unclosed => count == 1 ? 'unclosed quotation' : 'unclosed quotations',
  Slip.quotes => count == 1 ? 'odd quote mark' : 'odd quote marks',
  Slip.spacing => count == 1 ? 'spacing slip' : 'spacing slips',
  Slip.small => count == 1 ? 'small letter' : 'small letters',
  Slip.chapter => count == 1 ? 'chapter to finish' : 'chapters to finish',
};
