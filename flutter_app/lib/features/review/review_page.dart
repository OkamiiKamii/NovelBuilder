import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/continuity/rules.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/records/review.dart';
import '../../shared/domain/review/collect.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/vault.dart';
import '../codex/widgets/connections_panel.dart' show openRecord;
import '../progress/widgets/bars.dart' show Gauge;
import '../workspace/area_switch.dart';
import 'review_providers.dart';
import 'widgets/review_parts.dart';

enum _Show {
  todo('To look at'),
  decided('Decided'),
  all('Everything');

  const _Show(this.label);
  final String label;
}

/// CONTINUITY REVIEW
/// Every warning the app's deterministic checks raise, in one place, organised by severity and category. Each says
/// whether it is a confirmed data error or a possible inconsistency, its rule, the data it rests on, the records it is
/// about, and where to see it in context. The author marks it resolved, intentional, ignored or needing review, with a
/// note if they like. Nothing is changed but that decision: no record, no canon, no word of the manuscript.
class ReviewPage extends ConsumerStatefulWidget {
  const ReviewPage({super.key});

  @override
  ConsumerState<ReviewPage> createState() => _ReviewPageState();
}

class _ReviewPageState extends ConsumerState<ReviewPage> {
  _Show _show = _Show.todo;
  bool _byCategory = false;
  Certainty? _certainty;
  Severity? _severity;
  ReviewCategory? _category;
  ReviewSource? _source;
  String _text = '';
  String? _editing;

  /// One warning at a time (while any is open), or the whole list.
  bool _oneAtATime = true;

  /// Which open warning is in front, by its place in the queue.
  int _at = 0;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  bool get _filtered =>
      _certainty != null || _severity != null || _category != null || _source != null || _text.isNotEmpty;

  void _clear() => setState(() {
    _certainty = null;
    _severity = null;
    _category = null;
    _source = null;
    _text = '';
  });

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(reviewDataProvider);
    final cast = ref.watch(castProvider);
    if (data == null || cast == null) {
      return PageScaffold(
        title: Destination.review.label,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EmptyState(
              icon: Icons.menu_book_outlined,
              title: 'No novel open',
              message: 'Review works inside one novel. Open one from the Library.',
              action: FilledButton(
                onPressed: () => context.go(Destination.library.path),
                child: const Text('Go to Library'),
              ),
            ),
          ],
        ),
      );
    }
    final theme = Theme.of(context);
    final actions = ReviewActions(context, data.novelId);
    final items = data.status.items;
    bool isTodo(ReviewedWarning i) => i.status == 'open' || i.status == 'review';
    final todo = items.where(isTodo).toList();
    final decided = items.where((i) => !isTodo(i)).toList();
    int count(List<ReviewedWarning> list, Certainty c) => list.where((i) => i.warning.certainty == c).length;
    final text = _text.trim().toLowerCase();
    final listed = [
      for (final i in switch (_show) {
        _Show.todo => todo,
        _Show.decided => decided,
        _Show.all => items,
      })
        if ((_certainty == null || i.warning.certainty == _certainty) &&
            (_severity == null || i.warning.severity == _severity) &&
            (_category == null || i.warning.category == _category) &&
            (_source == null || i.warning.source == _source) &&
            (text.isEmpty ||
                '${i.warning.title} ${i.warning.message} ${i.warning.because}'.toLowerCase().contains(text)))
          i,
    ];
    final bySource = <ReviewSource, int>{};
    for (final w in data.warnings) {
      bySource[w.source] = (bySource[w.source] ?? 0) + 1;
    }
    final needReview = items.where((i) => i.status == 'review').length;
    final summary = todo.isEmpty
        ? 'Nothing to look at'
        : '${todo.length} to look at: ${count(todo, Certainty.error)} confirmed data '
              '${count(todo, Certainty.error) == 1 ? 'error' : 'errors'}, ${count(todo, Certainty.possible)} possible '
              '${count(todo, Certainty.possible) == 1 ? 'inconsistency' : 'inconsistencies'}';
    final status = '$summary · $needReview need review · ${decided.length} decided';

    Widget menu<T>(String label, T? value, List<T> options, String Function(T) words, ValueChanged<T?> onChanged) =>
        SizedBox(
          width: 220,
          child: DropdownButtonFormField<T?>(
            key: ValueKey('$label:$value'),
            initialValue: value,
            isExpanded: true,
            decoration: InputDecoration(labelText: label, isDense: true),
            items: [
              DropdownMenuItem<T?>(value: null, child: Text(label == 'Certainty' ? 'Both' : 'Any')),
              for (final o in options)
                DropdownMenuItem<T?>(
                  value: o,
                  child: Text(words(o), overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: onChanged,
          ),
        );

    List<Widget> linksOf(Warning w) => [
      for (final r in w.refs)
        TextButton(
          onPressed: () => openRecord(actions, cast, r),
          child: Text(data.model.resolve(r)?.label ?? 'something deleted'),
        ),
      for (final l in w.links) TextButton(onPressed: () => openReviewLink(actions, l.path), child: Text(l.label)),
      if (w.context case final c?) TextButton(onPressed: () => openContext(actions, c), child: Text(c.label)),
    ];

    Widget card(ReviewedWarning item) {
      final w = item.warning;
      final decision = item.decision;
      return Card.outlined(
        margin: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  SeverityChip(w.severity),
                  Tag(w.certainty.label, tooltip: w.certainty.hint),
                  Tag(w.source.label),
                  if (decision != null) Tag(decision.decision.label),
                ],
              ),
              const SizedBox(height: 6),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: '${w.title}. ',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(text: w.message),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              Text.rich(
                TextSpan(
                  children: [
                    const TextSpan(
                      text: 'The rule: ',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(text: w.rule),
                  ],
                ),
                style: theme.textTheme.bodySmall,
              ),
              Text.rich(
                TextSpan(
                  children: [
                    const TextSpan(
                      text: 'Because: ',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(text: w.because),
                  ],
                ),
                style: theme.textTheme.bodySmall,
              ),
              if (decision != null && decision.note.isNotEmpty)
                Text('Your note: ${decision.note}', style: theme.textTheme.bodySmall),
              Wrap(
                spacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  ...linksOf(w),
                  TextButton(
                    onPressed: () => openReviewLink(actions, w.source.page),
                    child: Text('Where it is checked: ${w.source.label}'),
                  ),
                ],
              ),
              if (_editing == w.key)
                DecisionEditor(
                  current: decision?.decision,
                  note: decision?.note ?? '',
                  onCancel: () => setState(() => _editing = null),
                  onSave: (kind, note) {
                    if (kind == null) {
                      if (decision != null) actions.reopen(decision.id);
                    } else {
                      final nodeId = w.source == ReviewSource.continuity
                          ? w.refs.where((r) => r.type == EntityType.node).firstOrNull?.id
                          : null;
                      actions.decide(w.key, w.message, kind, note: note, nodeId: nodeId);
                    }
                    setState(() => _editing = null);
                  },
                )
              else
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: OutlinedButton(
                    onPressed: () => setState(() => _editing = w.key),
                    child: Text('Set the status…', semanticsLabel: 'Set the status of: ${w.message}'),
                  ),
                ),
            ],
          ),
        ),
      );
    }

    // The open warnings, most serious first, in the order the list groups them.
    final queue = [...todo]
      ..sort((a, b) {
        final s = a.warning.severity.index.compareTo(b.warning.severity.index);
        return s != 0 ? s : a.warning.category.index.compareTo(b.warning.category.index);
      });
    final focusing = _oneAtATime && queue.isNotEmpty;
    final at = queue.isEmpty ? 0 : _at.clamp(0, queue.length - 1);

    Widget header() {
      final scheme = theme.colorScheme;
      final bySeverity = [
        for (final s in Severity.values)
          if (todo.where((i) => i.warning.severity == s).length case final n when n > 0)
            '$n ${s.label.toLowerCase()}${s == Severity.warning && n != 1 ? 's' : ''}',
      ];
      return Card.outlined(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 16,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.end,
                children: [
                  Text(
                    '${todo.length}',
                    style: vaultHeading(context, size: 44, weight: 700, color: scheme.primary).copyWith(height: 1),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      todo.length == 1 ? 'warning to look at' : 'warnings to look at',
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  if (bySeverity.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        bySeverity.join(' · '),
                        style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Semantics(
                label: '${decided.length} of ${items.length} decided',
                child: Gauge(value: items.isEmpty ? 1 : decided.length / items.length, height: 8),
              ),
              const SizedBox(height: 6),
              Semantics(liveRegion: true, child: Text(status, style: theme.textTheme.bodySmall)),
            ],
          ),
        ),
      );
    }

    void decideFocused(ReviewedWarning item, ReviewDecision kind) {
      final w = item.warning;
      final nodeId = w.source == ReviewSource.continuity
          ? w.refs.where((r) => r.type == EntityType.node).firstOrNull?.id
          : null;
      if (actions.decide(w.key, w.message, kind, note: _note.text.trim(), nodeId: nodeId)) {
        _note.clear();
        // A decision that closes it takes it out of the queue, so the next one moves up; "needs review" stays.
        setState(() => _at = kind.closes ? at : at + 1);
      }
    }

    Widget focusCard(ReviewedWarning item) {
      final w = item.warning;
      final scheme = theme.colorScheme;
      const icons = {
        ReviewDecision.resolved: Icons.check_circle_outline,
        ReviewDecision.intentional: Icons.auto_awesome_outlined,
        ReviewDecision.review: Icons.flag_outlined,
        ReviewDecision.dismissed: Icons.visibility_off_outlined,
      };
      return Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${at + 1} of ${queue.length}',
                      style: theme.textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Previous warning',
                    onPressed: at == 0 ? null : () => setState(() => _at = at - 1),
                    icon: const Icon(Icons.chevron_left),
                  ),
                  IconButton(
                    tooltip: 'Skip to the next warning',
                    onPressed: queue.length < 2 ? null : () => setState(() => _at = (at + 1) % queue.length),
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  SeverityChip(w.severity),
                  Tag(w.certainty.label, tooltip: w.certainty.hint),
                  Tag(w.source.label),
                  if (item.decision != null) Tag(item.decision!.decision.label),
                ],
              ),
              const SizedBox(height: 14),
              Semantics(
                header: true,
                child: Text(w.title, style: vaultHeading(context, size: 22, weight: 700, color: scheme.onSurface)),
              ),
              const SizedBox(height: 6),
              Text(w.message, style: theme.textTheme.bodyLarge),
              const SizedBox(height: 12),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text.rich(
                        TextSpan(
                          children: [
                            const TextSpan(
                              text: 'The rule: ',
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                            TextSpan(text: w.rule),
                          ],
                        ),
                        style: theme.textTheme.bodySmall,
                      ),
                      const SizedBox(height: 4),
                      Text.rich(
                        TextSpan(
                          children: [
                            const TextSpan(
                              text: 'Because: ',
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                            TextSpan(text: w.because),
                          ],
                        ),
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Wrap(spacing: 4, children: linksOf(w)),
              const SizedBox(height: 12),
              TextField(
                controller: _note,
                decoration: const InputDecoration(
                  labelText: 'Note (optional)',
                  hintText: 'Why, or what was done',
                  isDense: true,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final d in [
                    ReviewDecision.resolved,
                    ReviewDecision.intentional,
                    ReviewDecision.review,
                    ReviewDecision.dismissed,
                  ])
                    d == ReviewDecision.resolved
                        ? FilledButton.icon(
                            onPressed: () => decideFocused(item, d),
                            icon: Icon(icons[d]),
                            label: Text(d.label),
                          )
                        : OutlinedButton.icon(
                            onPressed: () => decideFocused(item, d),
                            icon: Icon(icons[d]),
                            label: Text(d.label),
                          ),
                ],
              ),
            ],
          ),
        ),
      );
    }

    final outer = _byCategory
        ? [
            for (final c in ReviewCategory.values)
              if (listed.any((i) => i.warning.category == c)) c,
          ]
        : [
            for (final s in Severity.values)
              if (listed.any((i) => i.warning.severity == s)) s,
          ];

    return PageScaffold(
      title: 'Continuity review',
      subtitle: cast.novelTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: reviewParts, current: '/review'),
          const SizedBox(height: 12),
          if (items.isNotEmpty)
            header()
          else
            Semantics(liveRegion: true, child: Text(status, style: theme.textTheme.titleSmall)),
          if (queue.isNotEmpty) ...[
            const SizedBox(height: 12),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: true, icon: Icon(Icons.filter_1), label: Text('One at a time')),
                  ButtonSegment(value: false, icon: Icon(Icons.view_list), label: Text('The whole list')),
                ],
                selected: {_oneAtATime},
                showSelectedIcon: false,
                onSelectionChanged: (v) => setState(() => _oneAtATime = v.first),
              ),
            ),
          ],
          if (focusing) ...[
            const SizedBox(height: 16),
            KeyedSubtree(key: ValueKey('focus:${queue[at].warning.key}'), child: focusCard(queue[at])),
          ] else ...[
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('What was checked'),
              childrenPadding: const EdgeInsets.only(bottom: 8),
              children: [
                for (final s in ReviewSource.values)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Text(
                      '${s.label}: ${s.what}. ${bySource[s] ?? 0} raised.'
                      '${s == ReviewSource.continuity ? ' ${data.manuscript.scanned.documents} chapters and scenes, ${data.manuscript.scanned.rules} tracked rules.' : ''}',
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
              ],
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SegmentedButton<_Show>(
                  segments: [
                    for (final s in _Show.values)
                      ButtonSegment(
                        value: s,
                        label: Text(
                          '${s.label} (${switch (s) {
                            _Show.todo => todo.length,
                            _Show.decided => decided.length,
                            _Show.all => items.length,
                          }})',
                        ),
                      ),
                  ],
                  selected: {_show},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) => setState(() => _show = v.first),
                ),
                SizedBox(
                  width: 240,
                  child: DropdownButtonFormField<bool>(
                    key: ValueKey('by:$_byCategory'),
                    initialValue: _byCategory,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Group by', isDense: true),
                    items: const [
                      DropdownMenuItem(value: false, child: Text('Severity, then category')),
                      DropdownMenuItem(value: true, child: Text('Category, then severity')),
                    ],
                    onChanged: (v) => setState(() => _byCategory = v ?? false),
                  ),
                ),
                menu<Certainty>(
                  'Certainty',
                  _certainty,
                  Certainty.values,
                  (c) => c.label,
                  (v) => setState(() => _certainty = v),
                ),
                menu<Severity>(
                  'Severity',
                  _severity,
                  Severity.values,
                  (s) => s.label,
                  (v) => setState(() => _severity = v),
                ),
                menu<ReviewCategory>(
                  'Category',
                  _category,
                  ReviewCategory.values,
                  (c) => c.label,
                  (v) => setState(() => _category = v),
                ),
                menu<ReviewSource>(
                  'Check',
                  _source,
                  ReviewSource.values,
                  (s) => s.label,
                  (v) => setState(() => _source = v),
                ),
                SizedBox(
                  width: 240,
                  child: TextField(
                    decoration: const InputDecoration(
                      labelText: 'Search the warnings',
                      prefixIcon: Icon(Icons.search),
                      isDense: true,
                    ),
                    onChanged: (t) => setState(() => _text = t),
                  ),
                ),
                if (_filtered) TextButton(onPressed: _clear, child: const Text('Clear filters')),
              ],
            ),
            const SizedBox(height: 12),
            if (listed.isEmpty)
              EmptyState(
                icon: Icons.task_alt,
                title: _filtered
                    ? 'Nothing matches these filters'
                    : switch (_show) {
                        _Show.todo => items.isEmpty ? 'No check has found anything' : 'Nothing to look at',
                        _Show.decided => 'Nothing decided yet',
                        _Show.all => 'No check has found anything',
                      },
                message: _filtered
                    ? 'Clear the filters to see every warning.'
                    : (_show == _Show.todo && items.isNotEmpty
                          ? 'Every warning has a decision.'
                          : 'Your records agree with each other, as far as each rule can tell from what is recorded.'),
                action: _filtered ? OutlinedButton(onPressed: _clear, child: const Text('Clear filters')) : null,
              )
            else
              for (final o in outer) ...[
                Semantics(
                  header: true,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 12, bottom: 4),
                    child: Text(
                      '${o is Severity ? o.label : (o as ReviewCategory).label} '
                      '(${listed.where((i) => _byCategory ? i.warning.category == o : i.warning.severity == o).length})',
                      style: theme.textTheme.titleLarge,
                    ),
                  ),
                ),
                for (final inner in _byCategory ? Severity.values : ReviewCategory.values)
                  if (listed.where(
                        (i) =>
                            (_byCategory ? i.warning.category == o : i.warning.severity == o) &&
                            (_byCategory ? i.warning.severity == inner : i.warning.category == inner),
                      )
                      case final here when here.isNotEmpty) ...[
                    Padding(
                      padding: const EdgeInsets.only(top: 6, bottom: 4),
                      child: Text(
                        '${inner is Severity ? inner.label : (inner as ReviewCategory).label} (${here.length})',
                        style: theme.textTheme.titleSmall,
                      ),
                    ),
                    for (final i in here) card(i),
                  ],
              ],
          ],
          if (data.status.gone.isNotEmpty) ...[
            const SizedBox(height: 12),
            Semantics(
              header: true,
              child: Text('Decisions about warnings no longer raised', style: theme.textTheme.titleMedium),
            ),
            Text(
              'The records changed since, so these warnings are not raised now. The decisions are kept; remove one to '
              'tidy up.',
              style: theme.textTheme.bodySmall,
            ),
            for (final d in data.status.gone)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(d.message.isEmpty ? d.key : d.message),
                subtitle: Text('${d.decision.label}${d.note.isNotEmpty ? ' · ${d.note}' : ''}'),
                trailing: TextButton(onPressed: () => actions.reopen(d.id), child: const Text('Remove')),
              ),
          ],
        ],
      ),
    );
  }
}

/// A decision's word on a check's own page ("Dismissed" for what the review calls Ignored).
String decisionWord(ReviewDecision d) => d == ReviewDecision.dismissed ? 'Dismissed' : d.label;
