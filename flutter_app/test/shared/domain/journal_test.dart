// The writing journal: runs of days, the pace and where it leads, shading against the author's own days, milestones.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/analytics/journal.dart';
import 'package:novel_builder/shared/domain/analytics/progress.dart';

const _today = '2026-10-30';
final _now = parseDay(_today).add(const Duration(hours: 12)).millisecondsSinceEpoch;

WritingSession _s(String day, int net) => WritingSession({'id': '$day$net', 'day': day, 'netWords': net});

Journal _journal(
  List<WritingSession> sessions, {
  int words = 0,
  int? target,
  ({int total, int completed}) chapters = (total: 0, completed: 0),
}) => computeJournal(sessions: sessions, totalWords: words, targetWords: target, chapters: chapters, now: _now);

void main() {
  test('runs: the current one counts up to today, or yesterday while today is open; the best is kept', () {
    final days = [
      for (final i in [1, 2, 3]) _s(addDays(_today, -i), 100),
      for (final i in [10, 11, 12, 13, 14]) _s(addDays(_today, -i), 100),
    ];
    final j = _journal(days);
    expect((j.currentRun, j.bestRun), (3, 5));
    expect(_journal([...days, _s(_today, 50)]).currentRun, 4);
    expect(_journal([_s(addDays(_today, -2), 100)]).currentRun, 0, reason: 'a day missed ends the run');
  });

  test('a day with two sessions is one day, its words added up', () {
    final j = _journal([_s(_today, 300), _s(_today, -50)]);
    expect(j.days[_today], (day: _today, net: 250, sessions: 2));
  });

  test('pace over the last 30 days leads to a finish date; none without a target, a pace, or once reached', () {
    final sessions = [for (var i = 0; i < 30; i++) _s(addDays(_today, -i), 1000)];
    final j = _journal(sessions, words: 40000, target: 90000);
    expect(j.pacePerDay, 1000);
    expect(j.finishDay, addDays(_today, 50));
    expect(_journal(sessions, words: 40000).finishDay, isNull);
    expect(_journal(sessions, words: 95000, target: 90000).finishDay, isNull);
    expect(_journal([_s(addDays(_today, -40), 5000)], words: 1, target: 9).pacePerDay, isNull);
  });

  test('shading: nothing is 0, revising is 1, words added rank 1 to 4 among the author\'s own days', () {
    final j = _journal([
      _s(addDays(_today, -1), 100),
      _s(addDays(_today, -2), 200),
      _s(addDays(_today, -3), 300),
      _s(addDays(_today, -4), 400),
      _s(addDays(_today, -5), -80),
    ]);
    expect([for (var i = 1; i <= 6; i++) j.level(addDays(_today, -i))], [1, 2, 3, 4, 1, 0]);
  });

  test('milestones: passed ones reached, the next of each kind says how far, the target among the words', () {
    final j = _journal(
      [for (var i = 0; i < 8; i++) _s(addDays(_today, -i), 10)],
      words: 12000,
      target: 30000,
      chapters: (total: 4, completed: 1),
    );
    String show(Milestone m) => '${m.label}${m.reached ? ' ✓' : ''}${m.toGo != null ? ' (${m.toGo})' : ''}';
    expect(j.milestones.map(show), [
      '1,000 words ✓',
      '10,000 words ✓',
      '25,000 words (13,000 words to go)',
      'Your target: 30,000',
      '50,000 words',
      '100,000 words',
      '7 days in a row ✓',
      '30 days in a row (22 more days)',
      '100 days in a row',
      'First chapter complete ✓',
      'Every chapter complete (3 to go)',
    ]);
  });
}
