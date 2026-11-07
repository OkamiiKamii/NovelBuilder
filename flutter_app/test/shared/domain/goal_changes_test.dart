// Goals, as the original app's progress service keeps them: one daily and one weekly target, deadlines that need a
// name and a date, tasks with a kind, and nothing else touched.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/analytics/goal_changes.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

GoalChanges fresh() {
  var n = 0;
  return GoalChanges(
    NovelSnapshot.fromJson({
      'format': 'novel-builder/project',
      'version': 4,
      'exportedAt': 0,
      'project': {'id': 'p', 'title': 'Goals'},
      'collections': {
        'writingSessions': [
          {'id': 'w', 'projectId': 'p', 'day': '2026-10-24', 'netWords': 10},
        ],
      },
    }),
    now: 1000,
    createId: () => 'g${n++}',
  );
}

void main() {
  test('a word target is set, changed in place, and removed by a blank or zero', () {
    final c = fresh()..setTarget('daily', '500.4');
    expect([for (final g in c.goals) (g.kind, g.targetWords)], [('daily', 500)]);
    c.setTarget('daily', 750);
    expect([for (final g in c.goals) (g.id, g.targetWords)], [('g0', 750)]);
    c.setTarget('weekly', 'lots');
    expect(c.goals, hasLength(1), reason: 'not a number: no target');
    c.setTarget('daily', 0);
    expect(c.goals, isEmpty);
    expect(c.rows('writingSessions'), hasLength(1), reason: 'the writing log is untouched');
  });

  test('a deadline needs a name and a date; a task gets a kind', () {
    final c = fresh();
    expect(
      () => c.addGoal('deadline', const GoalInput(title: ' ', dueDate: '2026-12-31')),
      throwsA(isA<ChangeRefused>()),
    );
    expect(
      () => c.addGoal('deadline', const GoalInput(title: 'Draft', dueDate: '31/12/2026')),
      throwsA(isA<ChangeRefused>()),
    );
    expect(() => c.addGoal('task', const GoalInput(title: '')), throwsA(isA<ChangeRefused>()));
    final d = c.addGoal(
      'deadline',
      const GoalInput(title: ' Draft ', dueDate: '2026-12-31', targetWords: '0', nodeId: ''),
    );
    expect([d.title, d.dueDate, d.targetWords, d.nodeId, d.raw['category']], ['Draft', '2026-12-31', null, null, null]);
    final t = c.addGoal('task', const GoalInput(title: 'Map', category: 'sailing', nodeId: 'c1', dueDate: ''));
    expect([t.raw['category'], t.nodeId, t.dueDate], ['other', null, null]);
  });

  test('a change keeps the name and date when they are left blank; checking off is recorded and undone', () {
    final c = fresh();
    final d = c.addGoal('deadline', const GoalInput(title: 'Draft', dueDate: '2026-12-31'));
    c.updateGoal(d.id, const GoalInput(title: '', dueDate: '', targetWords: 2000, nodeId: 'c2'));
    final after = c.goals.single;
    expect([after.title, after.dueDate, after.targetWords, after.nodeId], ['Draft', '2026-12-31', 2000, 'c2']);
    c.setDone(d.id, true);
    expect([c.goals.single.done, c.goals.single.raw['doneAt']], [true, 1000]);
    c.setDone(d.id, false);
    expect([c.goals.single.done, c.goals.single.raw['doneAt']], [false, null]);
    c.removeGoal(d.id);
    expect(c.goals, isEmpty);
    expect(() => c.removeGoal(d.id), throwsA(isA<ChangeRefused>()));
  });
}
