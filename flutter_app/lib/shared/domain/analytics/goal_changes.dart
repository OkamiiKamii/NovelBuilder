import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../json.dart';
import 'progress.dart';

/// The collections a change to goals reads and writes.
const goalCollections = {'goals', 'chapters'};

/// The kinds of task, as the original names them.
const taskCategories = ['planning', 'worldbuilding', 'editing', 'other'];
const taskLabels = {'planning': 'Planning', 'worldbuilding': 'Worldbuilding', 'editing': 'Editing', 'other': 'Other'};

/// What a deadline or task form gives: null leaves a field as it is (on a change), as in the original.
class GoalInput {
  const GoalInput({this.title, this.targetWords, this.dueDate, this.nodeId, this.category});
  final String? title;

  /// Words typed: anything not a positive number is no target.
  final Object? targetWords;

  /// `yyyy-mm-dd`, or '' for none.
  final String? dueDate;

  /// The part of the manuscript a deadline covers, or '' for the whole manuscript.
  final String? nodeId;
  final String? category;
}

int? _words(Object? value) {
  final n = value is num ? value : num.tryParse(str(value).trim());
  return n != null && n.isFinite && n > 0 ? (n + 0.5).floor() : null;
}

String? _date(Object? value) => value is String && RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value) ? value : null;

/// WRITING GOALS (as in the original app): daily and weekly word targets (at most one of each), deadlines (a date,
/// with a word target for the whole manuscript or one part of it if the author likes) and tasks (milestones that have
/// nothing to do with word counts). The writing log is never changed here: it is written only as the author writes.
class GoalChanges extends RecordChanges {
  GoalChanges(super.snapshot, {required super.now, required super.createId});

  List<Goal> get goals => [for (final r in rows('goals')) Goal(r)];

  Goal _owned(String id) {
    final r = row('goals', id);
    if (r == null) throw ChangeRefused('That goal is no longer here.');
    return Goal(r);
  }

  JsonMap _clean(String kind, GoalInput input, [Goal? base]) => {
    'title': input.title != null ? input.title!.trim() : (base?.title ?? ''),
    'targetWords': input.targetWords != null ? _words(input.targetWords) : base?.targetWords,
    'dueDate': input.dueDate != null ? _date(input.dueDate) : base?.dueDate,
    'nodeId': kind == 'deadline'
        ? (input.nodeId != null ? (input.nodeId!.isEmpty ? null : input.nodeId) : base?.nodeId)
        : null,
    'category': kind == 'task'
        ? (taskCategories.contains(input.category) ? input.category : (strOrNull(base?.raw['category']) ?? 'other'))
        : null,
  };

  /// Sets the daily or weekly word target. A blank or zero target removes it.
  void setTarget(String kind, Object? target) {
    final existing = [
      for (final g in goals)
        if (g.kind == kind) g,
    ];
    final words = _words(target);
    if (words == null) {
      for (final g in existing) {
        remove('goals', g.id);
      }
      return;
    }
    if (existing.isNotEmpty) {
      put('goals', {...existing.first.raw, 'targetWords': words, 'updatedAt': now});
      return;
    }
    put('goals', {
      'id': newId(),
      'projectId': projectId,
      'kind': kind,
      'title': '',
      'targetWords': words,
      'dueDate': null,
      'nodeId': null,
      'category': null,
      'done': false,
      'doneAt': null,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  /// Adds a deadline or a task.
  Goal addGoal(String kind, GoalInput input) {
    if (kind != 'deadline' && kind != 'task') throw ChangeRefused('Unknown kind of goal.');
    final fields = _clean(kind, input);
    if (str(fields['title']).isEmpty) {
      throw ChangeRefused(kind == 'task' ? 'Give the task a name.' : 'Give the deadline a name.');
    }
    if (kind == 'deadline' && fields['dueDate'] == null) throw ChangeRefused('Pick a date for the deadline.');
    final goal = {
      'id': newId(),
      'projectId': projectId,
      'kind': kind,
      ...fields,
      'done': false,
      'doneAt': null,
      'createdAt': now,
      'updatedAt': now,
    };
    put('goals', goal);
    return Goal(goal);
  }

  /// Changes a deadline or task. A blank name or (for a deadline) date keeps the one it had.
  void updateGoal(String id, GoalInput input) {
    final goal = _owned(id);
    final fields = _clean(goal.kind, input, goal);
    if (str(fields['title']).isEmpty && (goal.kind == 'task' || goal.kind == 'deadline')) fields['title'] = goal.title;
    if (goal.kind == 'deadline' && fields['dueDate'] == null) fields['dueDate'] = goal.dueDate;
    put('goals', {...goal.raw, ...fields, 'updatedAt': now});
  }

  /// Checks a task or deadline off, or un-checks it.
  void setDone(String id, bool done) {
    final goal = _owned(id);
    put('goals', {...goal.raw, 'done': done, 'doneAt': done ? now : null, 'updatedAt': now});
  }

  void removeGoal(String id) {
    _owned(id);
    remove('goals', id);
  }
}
