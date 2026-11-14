import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/characters/widgets/vault.dart';
import '../../features/progress/submission_page.dart';
import '../../shared/domain/text/proof.dart';

/// SEND IT OUT, under More, under the proof: the submission kit (`features/progress/submission_page.dart`) in a line,
/// how many of its things are ready, one mark each; pressed, the kit and the query letter.
class SubmissionCard extends ConsumerWidget {
  const SubmissionCard({
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
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final kit = kitOf(ref, novelId, proofs);
    final ready = kit.where((k) => k.ready).length;
    final next = kit.where((k) => !k.ready).firstOrNull;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 2, 16, 6),
      child: Semantics(
        button: true,
        label: 'Submission kit: $ready of ${kit.length} ready${next == null ? '' : '. Next: ${next.item.label}'}',
        excludeSemantics: true,
        child: Material(
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(14),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => showSubmissionKit(
              context,
              novelId: novelId,
              proofs: proofs,
              titles: titles,
              onRead: onRead,
              onChapter: onChapter,
            ),
            child: Container(
              decoration: BoxDecoration(
                border: Border(left: BorderSide(color: scheme.tertiary, width: 4)),
              ),
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
              child: Row(
                children: [
                  Icon(Icons.outgoing_mail, color: scheme.tertiary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'SEND IT OUT',
                          style: vaultHeading(
                            context,
                            size: 10,
                            color: scheme.tertiary,
                            weight: 700,
                          ).copyWith(letterSpacing: 1.8),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Submission kit: $ready of ${kit.length} ready',
                          style: vaultText(context, size: 16, color: scheme.onSurface),
                        ),
                        const SizedBox(height: 6),
                        // A mark each, filled when ready.
                        Row(
                          children: [
                            for (final k in kit)
                              Container(
                                width: 18,
                                height: 6,
                                margin: const EdgeInsets.only(right: 4),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(3),
                                  color: k.ready ? scheme.tertiary : scheme.onSurfaceVariant.withValues(alpha: 0.25),
                                ),
                              ),
                            const SizedBox(width: 6),
                            if (next != null)
                              Expanded(
                                child: Text(
                                  'Next: ${next.item.label.toLowerCase()}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: vaultText(context, size: 13, color: scheme.onSurfaceVariant),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
