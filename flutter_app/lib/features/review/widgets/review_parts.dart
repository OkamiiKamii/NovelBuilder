import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/domain/continuity/rules.dart';
import '../../../shared/domain/model/entity_ref.dart';
import '../../../shared/domain/records/review.dart';
import '../../../shared/domain/review/collect.dart';
import '../../characters/character_actions.dart';
import '../../visualize/visualize_providers.dart';

/// A severity, in words and colour together (never colour alone), readable on either theme.
class SeverityChip extends StatelessWidget {
  const SeverityChip(this.severity, {super.key});
  final Severity severity;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (severity) {
      Severity.critical => (scheme.error, scheme.onError),
      Severity.warning => (scheme.errorContainer, scheme.onErrorContainer),
      Severity.info => (scheme.surfaceContainerHighest, scheme.onSurface),
    };
    return Tooltip(
      message: severity.hint,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
        child: Text(severity.label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: fg)),
      ),
    );
  }
}

/// A small outlined tag: a certainty, a source, a decision.
class Tag extends StatelessWidget {
  const Tag(this.label, {super.key, this.tooltip});
  final String label;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tag = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.outline),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: theme.textTheme.labelMedium),
    );
    return tooltip == null ? tag : Tooltip(message: tooltip!, child: tag);
  }
}

const decisionHints = {
  ReviewDecision.review: 'Still open, and flagged to come back to. It stays on every list of things to look at.',
  ReviewDecision.resolved: 'Dealt with: settled, or fixed somewhere the records do not show.',
  ReviewDecision.intentional: 'Meant: the story explains it (a flashback, a disguise, an unreliable narrator…).',
  ReviewDecision.dismissed: 'Not worth acting on. The other pages call this Dismiss.',
};

/// Choosing a status for a finding: open (no decision), or one of the author's decisions, with a note.
class DecisionEditor extends StatefulWidget {
  const DecisionEditor({
    super.key,
    required this.current,
    required this.note,
    required this.onSave,
    required this.onCancel,
  });
  final ReviewDecision? current;
  final String note;
  final void Function(ReviewDecision? decision, String note) onSave;
  final VoidCallback onCancel;

  @override
  State<DecisionEditor> createState() => _DecisionEditorState();
}

class _DecisionEditorState extends State<DecisionEditor> {
  late ReviewDecision? _kind = widget.current;
  late final _note = TextEditingController(text: widget.note);

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            ChoiceChip(
              label: const Text('Open'),
              selected: _kind == null,
              onSelected: (_) => setState(() => _kind = null),
            ),
            for (final d in ReviewDecision.values)
              ChoiceChip(label: Text(d.label), selected: _kind == d, onSelected: (_) => setState(() => _kind = d)),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          _kind == null ? 'No decision: it stays on the list to look at.' : decisionHints[_kind]!,
          style: theme.textTheme.bodySmall,
        ),
        if (_kind != null) ...[
          const SizedBox(height: 6),
          TextField(
            controller: _note,
            decoration: const InputDecoration(
              labelText: 'Note (optional)',
              hintText: 'Why, or what was done',
              isDense: true,
            ),
          ),
          Wrap(
            spacing: 6,
            children: [
              for (final r in intentionalReasons)
                ActionChip(label: Text(r), onPressed: () => setState(() => _note.text = r)),
            ],
          ),
        ],
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: [
            FilledButton.tonal(onPressed: () => widget.onSave(_kind, _note.text), child: const Text('Save the status')),
            TextButton(onPressed: widget.onCancel, child: const Text('Cancel')),
          ],
        ),
      ],
    );
  }
}

/// Opens a place a warning links to: a page of this app, a passage of the manuscript, or a view with the canon marks
/// on and its record selected.
void openReviewLink(CharacterActions actions, String path, {EntityRef? select}) {
  if (path.startsWith('/write?node=')) return actions.openChapter(path.substring('/write?node='.length));
  if (path.startsWith('/visualize')) {
    final container = actions.container;
    container.read(canonMarksProvider.notifier).set(true);
    if (select != null) container.read(vizStateProvider.notifier).select(select);
  }
  actions.flush();
  actions.router.go(path);
}

void openContext(CharacterActions actions, ReviewContext context) =>
    openReviewLink(actions, context.path, select: context.select);

/// Every warning comes from a check with its own rule, raised only when the records hold what that rule needs.
const reviewPromise =
    'Every warning comes from one of the checks below, each with its own stated rule, and is raised only when your '
    'records hold what that rule needs: no date, no place, no tracked rule means no warning, never a guess. Nothing here '
    'changes a record, canon or the manuscript; only your decision about each warning is kept.';

/// Reads the provider container from a widget's context (for the actions above).
ProviderContainer containerOf(BuildContext context) => ProviderScope.containerOf(context, listen: false);
