// A port of the goal and session parts of flutter_app/test/features/write/manuscript_service_test.dart ("writing is
// logged per session and day; goals are the author's own"), against Scriptor's service (its writing log) and the
// goals read and written here; and the word meter's goal pieces (`_Meter` in chapter_editor.dart), whose widget tests
// read "· goal reached", "+3 this session" and "7 words · 1 min read".

import { openLibrary } from '../../src/data/library';
import { textToDoc } from '../../src/domain/prose';
import { intOrNull, weekStartKeyAt, wordsWritten } from '../../src/domain/goals/days';
import { type WordGoalKind, wordGoalWrite, wordGoalsOf } from '../../src/domain/goals/wordGoals';
import { lengthText, meterGoalOf, sessionText, weekText } from '../../src/domain/goals/wordMeter';
import { testIds } from '../fixtures';
import { memoryLibrary } from '../nodeSql';

const minute = 60 * 1000;

function setup() {
  // As the Dart test's clock: Saturday 24 October 2026, nine in the morning.
  let now = new Date(2026, 9, 24, 9).getTime();
  const lib = openLibrary(memoryLibrary(), () => now, testIds());
  const { novel } = lib.library.create({ title: 'T' });
  const p = novel.id;
  let n = 0;
  const setWordGoal = (kind: WordGoalKind, words: number | null) => {
    const w = wordGoalWrite(lib.novels.rowsIn(p, 'goals'), kind, words, {
      projectId: p,
      nowMs: now,
      createId: () => `goal-${++n}`,
    });
    lib.novels.writeRows(p, w ? [w] : [], false);
  };
  return {
    lib,
    p,
    setWordGoal,
    goals: () => wordGoalsOf(lib.novels.rowsIn(p, 'goals')),
    written: () => wordsWritten(lib.novels.rowsIn(p, 'writingSessions'), now),
    advance: (ms: number) => (now += ms),
    now: () => now,
  };
}

test('writing is logged per session and day; goals are the author’s own', () => {
  const { lib, p, setWordGoal, goals, written, advance } = setup();
  const m = lib.manuscript;
  const c = m.create(p, 'chapter');
  let rev = m.save(p, c.id, textToDoc('one two three'), { baseRev: 0 });
  advance(10 * minute);
  rev = m.save(p, c.id, textToDoc('one two three four five'), { baseRev: rev });
  advance(120 * minute);
  m.save(p, c.id, textToDoc('one two'), { baseRev: rev }); // a new session; words were cut
  const sessions = lib.novels.rowsIn(p, 'writingSessions');
  expect(sessions).toHaveLength(2);
  expect([sessions[0]['netWords'], sessions[0]['added'], sessions[0]['saves']]).toEqual([5, 5, 2]);
  expect([sessions[1]['netWords'], sessions[1]['removed']]).toEqual([-3, 3]);
  expect(written().today).toBe(2);

  expect(goals().daily).toBeNull();
  setWordGoal('daily', 500);
  setWordGoal('daily', 750);
  expect(goals().daily).toBe(750);
  expect(lib.novels.rowsIn(p, 'goals')).toHaveLength(1); // one daily goal
  setWordGoal('daily', null);
  expect(goals().daily).toBeNull();
});

test('a new day starts a new session, even within half an hour', () => {
  const { lib, p, advance } = setup();
  const m = lib.manuscript;
  advance(14 * 60 * minute + 50 * minute); // 23:50
  const c = m.create(p, 'chapter');
  const rev = m.save(p, c.id, textToDoc('one two'), { baseRev: 0 });
  advance(20 * minute); // 00:10 the next day
  m.save(p, c.id, textToDoc('one two three'), { baseRev: rev });
  const sessions = lib.novels.rowsIn(p, 'writingSessions');
  expect(sessions.map((s) => [s['day'], s['netWords']])).toEqual([
    ['2026-10-24', 2],
    ['2026-10-25', 1],
  ]);
});

test('a goal row: its fields, kept when changed, removed with none', () => {
  const { lib, p, setWordGoal, goals, advance, now } = setup();
  const created = now();
  setWordGoal('weekly', 5000);
  advance(minute);
  setWordGoal('weekly', 6000);
  setWordGoal('daily', 0); // 0 or less is no goal: nothing to remove, nothing written
  expect(lib.novels.rowsIn(p, 'goals')).toEqual([
    {
      id: 'goal-1',
      projectId: p,
      kind: 'weekly',
      title: '',
      targetWords: 6000,
      dueDate: null,
      nodeId: null,
      category: null,
      done: false,
      doneAt: null,
      createdAt: created,
      updatedAt: created + minute,
    },
  ]);
  expect(goals()).toEqual({ daily: null, weekly: 6000 });

  // An existing row keeps its own fields; only the first of a kind is read; a target that is not whole is none.
  const rows = [
    { id: 'a', kind: 'daily', targetWords: 300, title: 'Mine', extra: 1, createdAt: 5 },
    { id: 'b', kind: 'daily', targetWords: 900 },
    { id: 'c', kind: 'weekly', targetWords: 12.5 },
    { id: 'd', kind: 'deadline', targetWords: 80000, dueDate: '2027-01-01' },
  ];
  expect(wordGoalsOf(rows)).toEqual({ daily: 300, weekly: null });
  const w = wordGoalWrite(rows, 'daily', 400, { projectId: 'n', nowMs: 99, createId: () => 'new' });
  expect(w).toEqual({
    collection: 'goals',
    id: 'a',
    value: {
      id: 'a',
      projectId: 'n',
      kind: 'daily',
      title: 'Mine',
      extra: 1,
      targetWords: 400,
      dueDate: null,
      nodeId: null,
      category: null,
      done: false,
      doneAt: null,
      createdAt: 5,
      updatedAt: 99,
    },
  });
  expect(wordGoalWrite(rows, 'daily', -1, { projectId: 'n', nowMs: 99, createId: () => 'new' })).toEqual({
    collection: 'goals',
    id: 'a',
    value: null,
  });
  expect(wordGoalWrite([], 'weekly', null, { projectId: 'n', nowMs: 99, createId: () => 'new' })).toBeNull();
  expect([3, 3.0, 3.5, '3', null, Infinity].map(intOrNull)).toEqual([3, 3, null, null, null, null]);
});

test('the meter’s today and this week: net, from Monday to today', () => {
  // Wednesday 11 November 2026.
  const at = new Date(2026, 10, 11, 18).getTime();
  expect(weekStartKeyAt(at)).toBe('2026-11-09');
  expect(weekStartKeyAt(new Date(2026, 10, 15, 23).getTime())).toBe('2026-11-09'); // a Sunday
  expect(weekStartKeyAt(new Date(2026, 10, 16, 0, 5).getTime())).toBe('2026-11-16'); // a Monday
  const rows = [
    { day: '2026-11-08', netWords: 1000 }, // last Sunday
    { day: '2026-11-09', netWords: 400 },
    { day: '2026-11-10', netWords: -150 }, // a day of cutting counts against
    { day: '2026-11-11', netWords: 200 },
    { day: '2026-11-11', netWords: 50.0 },
    { day: '2026-11-11', netWords: 7.5 }, // not a whole number: 0
    { day: '2026-11-12', netWords: 999 }, // tomorrow (a clock set back)
  ];
  expect(wordsWritten(rows, at)).toEqual({ today: 250, week: 500 });
});

test('the meter’s goal pieces', () => {
  expect(meterGoalOf(120, null)).toEqual({
    reached: false,
    share: 0,
    text: 'Today: 120 words · Set a goal',
    underline: true,
    ringLabel: "Today's goal",
  });
  expect(meterGoalOf(250, 1000)).toMatchObject({ reached: false, share: 0.25, text: 'Today: 250 of 1,000 words' });
  expect(meterGoalOf(10, 1)).toMatchObject({ reached: true, share: 1, text: 'Today: 10 of 1 words · goal reached' });
  expect(meterGoalOf(-40, 500)).toMatchObject({ reached: false, share: 0, text: 'Today: -40 of 500 words' });
  expect(meterGoalOf(0, 0)).toMatchObject({ reached: true, share: 0 });
  expect([sessionText(3), sessionText(-1200), sessionText(0)]).toEqual([
    '+3 this session',
    '−1,200 this session',
    null,
  ]);
  expect(lengthText(7, 1)).toBe('7 words · 1 min read');
  expect(lengthText(1, 1)).toBe('1 word · 1 min read');
  expect([weekText(3400, 5000), weekText(3400, null)]).toEqual(['This week: 3,400 of 5,000', null]);
});
