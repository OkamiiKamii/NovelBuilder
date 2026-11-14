import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/destinations.dart';
import '../../../shared/data/background.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/systems/compute.dart';
import '../../../shared/domain/systems/number_ledger.dart';
import '../../characters/widgets/vault.dart';
import '../../write/write_providers.dart';

/// THE LEDGER on Systems (`number_ledger.dart` keeps it): the numbers the chapters give for this system's stats and
/// levels, each a line of what it was and where ("Strength 10 · 1 → 12 · 3 → 14 · 5"), and above them the slips, each
/// with the sentence and a press to read it in its chapter (opened with find on the name, at that paragraph). Read
/// from the saved chapters as the page opens, away from the screen. It only reads.
class NumberLedgerView extends ConsumerStatefulWidget {
  const NumberLedgerView({super.key, required this.novelId, required this.model, required this.system});

  final String novelId;
  final StoryModel model;
  final SystemBlueprint system;

  @override
  ConsumerState<NumberLedgerView> createState() => _NumberLedgerViewState();
}

class _NumberLedgerViewState extends ConsumerState<NumberLedgerView> {
  Ledger? _ledger;
  late final List<({String id, String title})> _chapters = [
    for (final n in readingOrder(widget.model.nodes.values))
      if (isDocument(n.kind)) (id: n.id, title: n.displayTitle),
  ];

  @override
  void initState() {
    super.initState();
    final system = widget.system;
    final sheets = [
      for (final s in widget.model.sheets)
        if (s.systemId == system.id && widget.model.entries.containsKey(s.entryId)) s,
    ];
    // With one sheet, what it holds now, for the last check.
    final sheet = <String, num>{};
    if (sheets.length == 1) {
      final c = computeSheet(system, SheetProfile.of(sheets.single));
      for (final r in c.rows) {
        if (r.value case final double v) sheet[r.variable.name] = v;
      }
      for (final t in c.tracks) {
        if (t.level case final int l) sheet[t.track.name] = l;
      }
    }
    final store = ref.read(novelStoreProvider);
    ref
        .read(runAsideProvider)(
          numberLedgerJob(
            store.rawJsonIn(widget.novelId, 'chapterContents'),
            [for (final c in _chapters) c.id],
            stats: [for (final v in system.variables) v.name],
            tracks: [
              for (final t in system.tracks)
                if (t.kind == 'levels') t.name,
            ],
            sheet: sheet,
          ),
        )
        .then(
          (l) {
            if (mounted) setState(() => _ledger = l);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'progression')),
        );
  }

  void _read(LedgerSlip slip) {
    ref.read(pendingFindProvider.notifier).request((nodeId: slip.at.nodeId, term: slip.name, block: slip.at.block));
    ref.read(selectedNodeProvider.notifier).select(slip.at.nodeId);
    GoRouter.of(context).go(Destination.write.path);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ledger = _ledger;
    final slips = ledger?.slips ?? const [];
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.receipt_long_outlined, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    'THE LEDGER',
                    style: vaultHeading(
                      context,
                      size: 11,
                      color: scheme.primary,
                      weight: 700,
                    ).copyWith(letterSpacing: 2),
                  ),
                ),
              ),
              if (slips.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: scheme.error, borderRadius: BorderRadius.circular(10)),
                  child: Text(
                    slips.length == 1 ? '1 slip' : '${slips.length} slips',
                    style: TextStyle(color: scheme.onError, fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'The numbers your pages give for this system, checked as a reader would.',
            style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          if (ledger == null)
            const LinearProgressIndicator(minHeight: 2)
          else if (ledger.lines.isEmpty)
            Text(
              'Your pages do not give any of its numbers yet. When a chapter says "Strength 12" or "Level 3" (or '
              'The system speaks writes it), it is kept here.',
              style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
            )
          else ...[
            for (final s in slips) _Slip(slip: s, onRead: () => _read(s)),
            if (slips.isEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Icon(Icons.check_circle_outline, size: 18, color: scheme.primary),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Every number adds up.',
                        style: vaultText(context, size: 15, color: scheme.onSurface),
                      ),
                    ),
                  ],
                ),
              ),
            for (final line in ledger.lines) _Line(line: line),
          ],
        ],
      ),
    );
  }
}

/// A slip: what kind, what it says, the sentence, and a press to read it there.
class _Slip extends StatelessWidget {
  const _Slip({required this.slip, required this.onRead});
  final LedgerSlip slip;
  final VoidCallback onRead;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final kicker = switch (slip.kind) {
      SlipKind.sum => 'THE SUM',
      SlipKind.start => 'THE START',
      SlipKind.backwards => 'BACKWARDS',
      SlipKind.sheet => 'THE SHEET',
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: scheme.errorContainer.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.error.withValues(alpha: 0.4)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              kicker,
              style: vaultHeading(context, size: 10, color: scheme.error, weight: 700).copyWith(letterSpacing: 1.5),
            ),
            const SizedBox(height: 2),
            Text(slip.says, style: vaultText(context, size: 15.5, color: scheme.onSurface)),
            const SizedBox(height: 2),
            Text(
              '“${slip.at.said}”',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: vaultText(context, size: 14, style: FontStyle.italic, color: scheme.onSurfaceVariant),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onRead,
                icon: const Icon(Icons.menu_book_outlined, size: 18),
                label: Text('Read it in chapter ${slip.at.chapter}'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A stat or level's line: its numbers in order, each with its chapter, the last the strongest.
class _Line extends StatelessWidget {
  const _Line({required this.line});
  final LedgerLine line;

  static String _n(num v) => v == v.roundToDouble() ? v.round().toString() : v.toString();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final shown = line.entries.length > 6 ? line.entries.sublist(line.entries.length - 6) : line.entries;
    return Semantics(
      label: '${line.name}: ${[for (final e in line.entries) '${_n(e.value)} in chapter ${e.chapter}'].join(', ')}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 96,
              child: Text(
                line.name,
                style: vaultHeading(context, size: 13, weight: 700),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Expanded(
              child: Wrap(
                spacing: 4,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (shown.length < line.entries.length) Text('…', style: TextStyle(color: scheme.onSurfaceVariant)),
                  for (final (i, e) in shown.indexed) ...[
                    if (i > 0) Icon(Icons.arrow_forward, size: 12, color: scheme.onSurfaceVariant),
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: _n(e.value),
                            style: TextStyle(
                              fontFamily: 'JetBrains Mono',
                              fontWeight: i == shown.length - 1 ? FontWeight.w700 : FontWeight.w400,
                              color: i == shown.length - 1 ? scheme.primary : scheme.onSurface,
                            ),
                          ),
                          TextSpan(
                            text: ' ·${e.chapter}',
                            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
