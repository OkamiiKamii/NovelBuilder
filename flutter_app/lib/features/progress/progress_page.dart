import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/widgets/form_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/analytics/goal_changes.dart';
import '../../shared/domain/analytics/progress.dart';
import '../../shared/domain/manuscript/board.dart' show TreeItem;
import '../../shared/domain/records/story_node.dart';
import '../workspace/area_switch.dart';
import 'journal_view.dart';
import 'progress_providers.dart';
import 'widgets/bars.dart';

String _plural(int n, String word) => '${grouped(n)} $word${n == 1 ? '' : 's'}';
String duration(int minutes) => minutes < 60 ? '$minutes min' : '${minutes ~/ 60} h ${minutes % 60} min';

/// The page shown when no novel is open, for both progress pages.
class NoNovelProgress extends StatelessWidget {
  const NoNovelProgress({super.key});

  @override
  Widget build(BuildContext context) => PageScaffold(
    title: Destination.progress.label,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        EmptyState(
          icon: Icons.menu_book_outlined,
          title: 'No novel open',
          message: 'Progress works inside one novel. Open one from the Library.',
          action: FilledButton(
            onPressed: () => context.go(Destination.library.path),
            child: const Text('Go to Library'),
          ),
        ),
      ],
    ),
  );
}

/// A number with what it is, as a small card.
class Tile extends StatelessWidget {
  const Tile({super.key, required this.label, required this.value, this.detail, this.extra = const []});
  final String label;
  final String value;
  final String? detail;
  final List<Widget> extra;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Semantics(
          container: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(label, style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              const SizedBox(height: 2),
              Text(value, style: theme.textTheme.headlineSmall),
              if (detail != null) Text(detail!, style: theme.textTheme.bodySmall),
              ...extra,
            ],
          ),
        ),
      ),
    );
  }
}

/// Tiles in even columns, as many as fit (at least two on a phone), each as wide as the rest.
class Tiles extends StatelessWidget {
  const Tiles({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final columns = ((box.maxWidth + 12) / 212).floor().clamp(2, 6);
      final width = (box.maxWidth - 12 * (columns - 1)) / columns;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [for (final c in children) SizedBox(width: width, child: c)],
      );
    },
  );
}

/// How far along something is, 0 to 100.
class Meter extends StatelessWidget {
  const Meter({super.key, required this.percent, required this.label});
  final int percent;
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Semantics(
      label: label,
      value: '$percent%',
      child: Gauge(value: percent / 100),
    ),
  );
}

Widget section(BuildContext context, String title, List<Widget> children, {Widget? trailing}) => Card.outlined(
  margin: EdgeInsets.zero,
  child: Padding(
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
            ?trailing,
          ],
        ),
        const SizedBox(height: 8),
        ...children,
      ],
    ),
  ),
);

/// WRITING PROGRESS
/// The manuscript's words against the author's targets, the writing log (kept automatically as they write), where the
/// chapters and scenes stand, deadlines and tasks. It describes; nothing here judges. Cutting is shown as cutting, not
/// as a shortfall, and days spent planning, revising or resting are part of writing a book.
class ProgressPage extends ConsumerWidget {
  const ProgressPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(progressDataProvider);
    if (data == null) return const NoNovelProgress();
    final theme = Theme.of(context);
    final report = data.report;
    final actions = ProgressActions(context, data.novelId);
    final health = [
      if (report.targetWords case final t?)
        '${grouped(report.totalWords)} / ${grouped(t)} words'
      else
        _plural(report.totalWords, 'word'),
      if (report.percent != null) '${report.percent}% complete',
      if (report.chapters.total > 0) '${report.chapters.completed} / ${report.chapters.total} chapters complete',
      '${grouped(report.week.net < 0 ? 0 : report.week.net)} words this week',
    ];
    final tasks =
        [
          for (final g in data.goals)
            if (g.kind == 'task') g,
        ]..sort((a, b) {
          final c = (a.done ? 1 : 0).compareTo(b.done ? 1 : 0);
          return c != 0 ? c : (a.raw['createdAt'] as num? ?? 0).compareTo(b.raw['createdAt'] as num? ?? 0);
        });
    final recent = [...data.sessions]..sort((a, b) => b.startedAt.compareTo(a.startedAt));
    final small = theme.textTheme.bodySmall;

    Widget period(
      String label,
      PeriodTotals totals,
      ({Goal goal, int words, int target, int percent})? target,
      String empty,
    ) => Tile(
      label: label,
      value: totals.sessions == 0 ? '0' : '${totals.net > 0 ? '+' : ''}${signed(totals.net)}',
      detail: totals.sessions == 0
          ? empty
          : totals.removed > 0
          ? '${grouped(totals.added)} written, ${grouped(totals.removed)} trimmed'
          : 'words in ${_plural(totals.sessions, 'session')}',
      extra: [
        if (target != null) ...[
          Meter(percent: target.percent, label: '$label target'),
          Text(
            target.percent >= 100 ? 'Target reached' : '${target.percent}% of ${grouped(target.target)}',
            style: small,
          ),
        ],
      ],
    );

    String deadlineText(DeadlineRow d) {
      final when = d.daysLeft > 0
          ? '${_plural(d.daysLeft, 'day')} to go'
          : d.daysLeft == 0
          ? 'Due today'
          : '${_plural(-d.daysLeft, 'day')} past the date';
      if (d.target == null || d.target == 0) return when;
      final count = '${grouped(d.words)} / ${grouped(d.target!)} words';
      if (d.reached) return '$count · reached';
      return '$count · $when${d.perDay != null ? ' · about ${grouped(d.perDay!)} a day gets there' : ''}';
    }

    Widget goalRow(Goal goal, List<Widget> body) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Checkbox(
            value: goal.done,
            semanticLabel: '${goal.title} done',
            onChanged: (v) => actions.goals((c) => c.setDone(goal.id, v ?? false)),
          ),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: body),
          ),
          IconButton(
            tooltip: 'Edit ${goal.title}',
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => editGoal(context, actions, goal.kind, data.scopes, goal),
          ),
          IconButton(
            tooltip: 'Delete ${goal.title}',
            icon: const Icon(Icons.delete_outline),
            onPressed: () async {
              final sure = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: Text('Delete “${goal.title}”?'),
                  content: Text(
                    goal.kind == 'task'
                        ? 'The task is removed. Nothing else changes.'
                        : 'The deadline is removed. Nothing else changes: the manuscript and the writing log are kept.',
                  ),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                    FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
                  ],
                ),
              );
              if (sure ?? false) actions.goals((c) => c.removeGoal(goal.id));
            },
          ),
        ],
      ),
    );

    final total = report.chapters.total + report.scenes.total;
    return PageScaffold(
      title: Destination.progress.label,
      subtitle: health.join(' • '),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: progressParts, current: '/progress'),
          const SizedBox(height: 16),
          JournalHero(journal: data.journal, report: report),
          const SizedBox(height: 16),
          section(context, 'A year of writing', [YearOfWriting(journal: data.journal)]),
          const SizedBox(height: 16),
          section(context, 'Milestones', [const SizedBox(height: 4), Milestones(journal: data.journal)]),
          const SizedBox(height: 16),
          Tiles(
            children: [
              period('Today', report.today, report.daily, 'Nothing logged yet today'),
              period('This week', report.week, report.weekly, 'Nothing logged yet this week'),
              period('This month', report.month, null, 'Nothing logged yet this month'),
            ],
          ),
          const SizedBox(height: 16),
          TrendChart(title: 'Net words per week, last 8 weeks', periodLabel: 'Week of', points: report.weeks),
          const SizedBox(height: 12),
          Text(
            [
              '${report.chapters.completed} of ${report.chapters.total} chapters complete',
              if (report.scenes.total > 0) '${report.scenes.completed} of ${report.scenes.total} scenes complete',
              'average chapter ${grouped(report.averageChapterWords)} words',
              if (report.sessionCount > 0)
                '${_plural(report.sessionCount, 'session')}, ${duration(report.totalMinutes)} in all, '
                    'about ${grouped(report.averageWordsPerSession < 0 ? 0 : report.averageWordsPerSession)} words each',
              '${report.daysWrittenLast30} of the last 30 days written',
            ].join(' · '),
            style: small,
          ),
          const SizedBox(height: 16),
          section(context, 'Where the manuscript stands', [
            for (final status in NodeStatus.values)
              Semantics(
                label: '${status.label}: ${report.statusCounts[status]}',
                excludeSemantics: true,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      SizedBox(width: 130, child: Text(status.label)),
                      Expanded(child: Gauge(value: total == 0 ? 0 : report.statusCounts[status]! / total, height: 10)),
                      const SizedBox(width: 12),
                      SizedBox(
                        width: 36,
                        child: Text(
                          '${report.statusCounts[status]}',
                          textAlign: TextAlign.end,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ]),
          const SizedBox(height: 16),
          section(context, 'Word targets', [
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _TargetField(
                  label: 'Words per day',
                  value: report.daily?.target,
                  onCommit: (v) => actions.goals((c) => c.setTarget('daily', v)),
                ),
                _TargetField(
                  label: 'Words per week',
                  value: report.weekly?.target,
                  onCommit: (v) => actions.goals((c) => c.setTarget('weekly', v)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Manuscript target: '
              '${data.novel.targetWordCount != null ? '${grouped(data.novel.targetWordCount!)} words' : 'none'}'
              '${data.novel.deadline != null && parseDayOrNull(data.novel.deadline!) ? ' by ${mediumDay(data.novel.deadline!)}' : ''}. '
              'Change it in the Library, under the novel’s details.',
              style: small,
            ),
          ]),
          const SizedBox(height: 16),
          section(context, 'Deadlines', [
            if (report.deadlines.isEmpty) Text('No deadlines yet.', style: small),
            for (final d in report.deadlines)
              goalRow(d.goal, [
                Text(d.goal.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(
                  '${mediumDay(d.goal.dueDate!)}'
                  '${d.scope != null
                      ? ' · ${d.scope}'
                      : d.goal.nodeId != null
                      ? ''
                      : ' · whole manuscript'}',
                  style: small,
                ),
                if (d.percent != null) Meter(percent: d.percent!, label: '${d.goal.title} progress'),
                Text(deadlineText(d)),
              ]),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: OutlinedButton.icon(
                onPressed: () => editGoal(context, actions, 'deadline', data.scopes, null),
                icon: const Icon(Icons.add),
                label: const Text('Add deadline'),
              ),
            ),
          ]),
          const SizedBox(height: 16),
          section(
            context,
            'Tasks & milestones',
            trailing: report.tasks.total > 0
                ? Text('${report.tasks.done} of ${report.tasks.total} done', style: small)
                : null,
            [
              for (final task in tasks)
                goalRow(task, [
                  Text(task.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(
                    '${taskLabels[task.raw['category']] ?? 'Other'}'
                    '${task.dueDate != null && parseDayOrNull(task.dueDate!) ? ' · ${mediumDay(task.dueDate!)}' : ''}'
                    '${task.done && task.raw['doneAt'] is num ? ' · done ${shortDay(dayKeyOf(task.raw['doneAt']! as num))}' : ''}',
                    style: small,
                  ),
                ]),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: OutlinedButton.icon(
                  onPressed: () => editGoal(context, actions, 'task', data.scopes, null),
                  icon: const Icon(Icons.add),
                  label: const Text('Add task'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          section(context, 'Recent sessions', [
            if (recent.isEmpty)
              const Text(
                'Sessions are logged automatically while you write or revise. A break of half an hour starts a new one.',
              )
            else
              NumbersTable(
                label: 'Recent sessions',
                columns: const ['Day', 'Started', 'Length', 'Words'],
                rows: [
                  for (final s in recent.take(12))
                    [
                      weekdayDay(s.day),
                      clockTime(s.startedAt),
                      duration(sessionMinutes(s)),
                      '${s.netWords > 0 ? '+' : ''}${signed(s.netWords)}${s.netWords <= 0 ? ' · revising' : ''}',
                    ],
                ],
              ),
          ]),
        ],
      ),
    );
  }
}

typedef DeadlineRow = ({
  Goal goal,
  String? scope,
  int words,
  int? target,
  int? percent,
  int daysLeft,
  int? perDay,
  bool reached,
});

/// Whether [key] is a day the app can read (`yyyy-mm-dd`).
bool parseDayOrNull(String key) => RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(key);

/// A word target typed in: kept when the field is left or Enter pressed. Blank removes it.
class _TargetField extends StatefulWidget {
  const _TargetField({required this.label, required this.value, required this.onCommit});
  final String label;
  final int? value;
  final void Function(int? value) onCommit;

  @override
  State<_TargetField> createState() => _TargetFieldState();
}

class _TargetFieldState extends State<_TargetField> {
  late final _text = TextEditingController(text: widget.value?.toString() ?? '');
  late final FocusNode _focus = FocusNode()
    ..addListener(() {
      if (!_focus.hasFocus) _commit();
    });

  @override
  void didUpdateWidget(_TargetField old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value && !_focus.hasFocus) _text.text = widget.value?.toString() ?? '';
  }

  void _commit() {
    final t = _text.text.trim();
    final n = t.isEmpty ? null : int.tryParse(t);
    final next = n == null || n <= 0 ? null : n;
    if (next != widget.value) widget.onCommit(next);
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 200,
    child: TextField(
      controller: _text,
      focusNode: _focus,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(labelText: widget.label, hintText: 'No target'),
      onSubmitted: (_) => _commit(),
    ),
  );
}

/// Adds a deadline or task, or changes one ([goal]).
Future<void> editGoal(BuildContext context, ProgressActions actions, String kind, List<TreeItem> scopes, Goal? goal) =>
    showDialog<void>(
      context: context,
      builder: (_) => _GoalDialog(actions: actions, kind: kind, scopes: scopes, goal: goal),
    );

class _GoalDialog extends StatefulWidget {
  const _GoalDialog({required this.actions, required this.kind, required this.scopes, required this.goal});
  final ProgressActions actions;
  final String kind;
  final List<TreeItem> scopes;
  final Goal? goal;

  @override
  State<_GoalDialog> createState() => _GoalDialogState();
}

class _GoalDialogState extends State<_GoalDialog> {
  late final _title = TextEditingController(text: widget.goal?.title ?? '');
  late final _target = TextEditingController(text: widget.goal?.targetWords?.toString() ?? '');
  late String? _due = widget.goal?.dueDate;
  late String _nodeId = widget.goal?.nodeId ?? '';
  late String _category = (widget.goal?.raw['category'] as String?) ?? 'planning';

  bool get _task => widget.kind == 'task';

  @override
  void dispose() {
    _title.dispose();
    _target.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _due != null && parseDayOrNull(_due!) ? parseDay(_due!) : now,
      firstDate: DateTime(now.year - 50),
      lastDate: DateTime(now.year + 50),
    );
    if (picked != null) setState(() => _due = dayOf(picked));
  }

  void _save() {
    final input = _task
        ? GoalInput(title: _title.text, category: _category, dueDate: _due ?? '')
        : GoalInput(title: _title.text, dueDate: _due ?? '', targetWords: _target.text, nodeId: _nodeId);
    final goal = widget.goal;
    final done = widget.actions.goals((c) {
      if (goal == null) {
        c.addGoal(widget.kind, input);
      } else {
        c.updateGoal(goal.id, input);
      }
    });
    if (done) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final name = _task ? 'task' : 'deadline';
    const gap = SizedBox(height: 12);
    return FormDialog(
      title: widget.goal == null ? 'Add a $name' : 'Change the $name',
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _title,
            autofocus: true,
            decoration: InputDecoration(
              labelText: _task ? 'Task name' : 'Deadline name',
              hintText: _task ? 'e.g. Complete magic system lore' : 'e.g. Finish Volume 1',
            ),
          ),
          gap,
          if (_task)
            DropdownButtonFormField<String>(
              initialValue: _category,
              decoration: const InputDecoration(labelText: 'Task type'),
              items: [for (final c in taskCategories) DropdownMenuItem(value: c, child: Text(taskLabels[c]!))],
              onChanged: (v) => setState(() => _category = v ?? 'planning'),
            )
          else ...[
            TextField(
              controller: _target,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Word target (optional)'),
            ),
            gap,
            DropdownButtonFormField<String>(
              initialValue: widget.scopes.any((t) => t.node.id == _nodeId) ? _nodeId : '',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Deadline covers'),
              items: [
                const DropdownMenuItem(value: '', child: Text('Whole manuscript')),
                for (final t in widget.scopes)
                  DropdownMenuItem(
                    value: t.node.id,
                    child: Text(
                      '${'  ' * t.depth}${t.node.title.trim().isEmpty ? 'Untitled' : t.node.title}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
              onChanged: (v) => setState(() => _nodeId = v ?? ''),
            ),
          ],
          gap,
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                _due != null && parseDayOrNull(_due!)
                    ? '${_task ? 'Date' : 'Due'}: ${mediumDay(_due!)}'
                    : (_task ? 'No date (optional)' : 'No date yet'),
              ),
              TextButton(onPressed: _pick, child: Text(_task ? 'Pick a date' : 'Pick the date')),
              if (_task && _due != null)
                TextButton(onPressed: () => setState(() => _due = null), child: const Text('No date')),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: _save,
          child: Text(widget.goal != null ? 'Save' : (_task ? 'Add task' : 'Add deadline')),
        ),
      ],
    );
  }
}
