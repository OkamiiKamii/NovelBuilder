import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/records/review.dart';
import '../../shared/domain/timeline/review.dart';
import '../characters/widgets/parts.dart';
import '../review/record_check_page.dart' show integrityServiceProvider;
import '../workspace/area_switch.dart';
import 'timeline_providers.dart';

/// Reasons offered when a finding is marked intentional; the author's own words are just as welcome.
const _reasons = [
  'A double or impostor',
  'Magic or a portal',
  'Time travel',
  'The record is wrong in the story itself',
  'Flashback sequence',
  'Disguise',
  'Magic illusion',
  'Dream or vision',
  'Remembered, not present',
  'Unreliable narrator',
];

String _decisionWord(ReviewDecision d) => d == ReviewDecision.dismissed ? 'Dismissed' : d.label;

/// TIMELINE REVIEW: what the timeline's own records do not agree on: dates, ages, and where characters are when. Each
/// finding names its rule, what it rests on, and the records to open. Nothing here changes the story or canon: the
/// author fixes a record (and the finding goes), or keeps a decision about it.
class TimelineReviewPage extends ConsumerWidget {
  const TimelineReviewPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(timelineProvider);
    if (data == null) {
      return PageScaffold(
        title: Destination.review.label,
        child: EmptyState(
          icon: Icons.menu_book_outlined,
          title: 'No novel open',
          message: 'Review works inside one novel. Open one from the Library.',
          action: FilledButton(
            onPressed: () => TimelineActions(context, '').router.go(Destination.library.path),
            child: const Text('Go to Library'),
          ),
        ),
      );
    }
    final theme = Theme.of(context);
    final actions = TimelineActions(context, data.novelId);
    final service = ref.watch(integrityServiceProvider);
    final (:open, :decided, :gone) = data.review;
    final events = data.model.events.length;
    void decide(ReviewFinding f, ReviewDecision kind, [String note = '']) =>
        service.decide(data.novelId, f.key, f.message, kind, note: note);

    Future<void> intentional(ReviewFinding f) async {
      final note = await showDialog<String>(context: context, builder: (_) => const _ReasonDialog());
      if (note != null) decide(f, ReviewDecision.intentional, note);
    }

    return PageScaffold(
      title: 'Timeline review',
      subtitle:
          '${open.isEmpty ? 'Nothing to look at' : '${open.length} to look at'} · ${data.findings.length - open.length} decided · checked ${plural(events, 'event')}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: reviewParts, current: '/review/timeline'),
          const SizedBox(height: 16),
          if (open.isEmpty)
            const EmptyState(
              icon: Icons.check_circle_outline,
              title: 'Nothing to look at',
              message:
                  'The dates, ages and places in the timeline agree with each other and with the travel times you have recorded.',
            ),
          for (final rule in ReviewRule.values)
            if (open.any((f) => f.rule == rule)) ...[
              ProfileBox(
                title: rule.title,
                caption: 'The rule: ${rule.rule} It needs: ${rule.needs}',
                children: [
                  for (final f in open.where((f) => f.rule == rule))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(f.message, style: theme.textTheme.titleSmall),
                          const SizedBox(height: 2),
                          Text('Because: ${f.because}', style: theme.textTheme.bodySmall),
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 4,
                            runSpacing: 0,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              const Text('To resolve, fix the record:'),
                              for (final id in f.eventIds)
                                TextButton(
                                  onPressed: () => actions.openEvent(id),
                                  child: Text('Open “${data.eventName(id) ?? 'an event'}”'),
                                ),
                            ],
                          ),
                          Wrap(
                            spacing: 8,
                            runSpacing: 4,
                            children: [
                              OutlinedButton(
                                onPressed: () => intentional(f),
                                child: Semantics(
                                  label: 'Mark as intentional: ${f.message}',
                                  child: const Text('Mark as intentional…'),
                                ),
                              ),
                              TextButton(
                                onPressed: () => decide(f, ReviewDecision.dismissed),
                                child: Semantics(label: 'Dismiss: ${f.message}', child: const Text('Dismiss')),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 16),
            ],
          if (decided.isNotEmpty || gone.isNotEmpty)
            ProfileBox(
              title: 'Decided',
              caption:
                  'Findings you have marked intentional or dismissed. They stay decided while the records stay the same.',
              children: [
                for (final (:finding, :decision) in decided)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: '${_decisionWord(decision.decision)} ',
                                style: const TextStyle(fontWeight: FontWeight.w700),
                              ),
                              TextSpan(text: finding.message),
                            ],
                          ),
                        ),
                        Text('The rule: ${finding.rule.rule}', style: theme.textTheme.bodySmall),
                        if (decision.note.isNotEmpty)
                          Text('Your note: ${decision.note}', style: theme.textTheme.bodySmall),
                        TextButton(
                          onPressed: () => service.reopen(data.novelId, decision.id),
                          child: Semantics(label: 'Reopen: ${finding.message}', child: const Text('Reopen')),
                        ),
                      ],
                    ),
                  ),
                if (gone.isNotEmpty) ...[
                  Text(
                    'No longer raised: the records have changed since',
                    style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  for (final d in gone)
                    Wrap(
                      spacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        NotRecorded(d.message),
                        TextButton(
                          onPressed: () => service.reopen(data.novelId, d.id),
                          child: const Text('Remove this decision'),
                        ),
                      ],
                    ),
                ],
              ],
            ),
        ],
      ),
    );
  }
}

/// Why a finding is intentional: one of the usual reasons, or the author's own words.
class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog();

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Why is this intentional?'),
    scrollable: true,
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Why is this intentional?',
            hintText: 'A double, a portal, a lie in the record…',
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: [
            for (final r in _reasons) ActionChip(label: Text(r), onPressed: () => setState(() => _controller.text = r)),
          ],
        ),
      ],
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(
        onPressed: () => Navigator.of(context).pop(_controller.text.trim()),
        child: const Text('Save as intentional'),
      ),
    ],
  );
}
