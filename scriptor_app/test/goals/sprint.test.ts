// A port of flutter_app/test/features/write/sprint_test.dart, its widget tests played as the sprint's steps (the
// clock, the words in each chapter, the card, the best kept); typing, the caret, focus mode and the phone at twice the
// text size are the screen's. The clock, minutes and pace at the edges were printed by Dart 3.10 (Flutter 3.38.9)
// running sprint.dart's sums.

import {
  type Sprint,
  bestSprintKey,
  bestSprintWords,
  clockOf,
  finishSprint,
  minutesRun,
  reportSprint,
  signedWords,
  sprintBarOf,
  sprintCardOf,
  sprintLengths,
  sprintMenuLabel,
  sprintWords,
  startSprint,
  stopSprint,
  tickSprint,
  wordsPerMinute,
} from '../../src/domain/goals/sprint';

/** [seconds] of the timer, as the notifier ticks it. Throws if the sprint finishes on the way. */
function run(s: Sprint, seconds: number): Sprint {
  for (let i = 0; i < seconds; i++) {
    const t = tickSprint(s);
    if (t.kind !== 'running') throw new Error('finished');
    s = t.sprint;
  }
  return s;
}

/** Ticks until the time is up; the second it finishes at. */
function runOut(s: Sprint): number {
  for (;;) {
    const t = tickSprint(s);
    if (t.kind === 'finish') return t.elapsed;
    s = t.sprint;
  }
}

test('the lengths, the key, the menu', () => {
  expect(sprintLengths).toEqual([10, 15, 25, 45]);
  expect(bestSprintKey).toBe('write.bestSprint');
  expect(sprintLengths.map(sprintMenuLabel)).toEqual([
    'Sprint for 10 minutes',
    'Sprint for 15 minutes',
    'Sprint for 25 minutes',
    'Sprint for 45 minutes',
  ]);
});

test('a sprint counts the words added, and says what was written when the time is up', () => {
  let s = reportSprint(startSprint(10), 'gate', 7); // the open chapter, as the sprint starts
  expect(sprintBarOf(s)).toMatchObject({ clock: '10:00', words: '+0 words this sprint', ringValue: 1 });
  s = run(s, 1);
  s = reportSprint(s, 'gate', 10); // " Not even Orrin."
  expect(sprintBarOf(s).words).toBe('+3 words this sprint');
  expect(sprintBarOf(s).clock).toMatch(/^9:5\d$/); // the clock runs down
  expect(sprintBarOf(s).ringValueLabel).toBe('9:59 of 10 minutes');

  const elapsed = runOut(s);
  expect(elapsed).toBe(600);
  const { result, newBest } = finishSprint(s, { finished: true, elapsed, stored: null });
  const card = sprintCardOf(result);
  expect(card).toMatchObject({ heading: 'Sprint complete', words: '+3 words', time: 'in 10 minutes', pace: null });
  expect(card.best).toBe('Your best sprint yet');
  expect(newBest).toEqual({ words: 3, seconds: 600 });
});

test('words in every chapter written in count; a sprint stopped early says so; under a minute, nothing', () => {
  let s = startSprint(25);
  expect(stopSprint(run(s, 59))).toEqual({ kind: 'drop' }); // under a minute: nothing to say

  s = reportSprint(startSprint(25), 'gate', 7);
  s = run(s, 1);
  s = reportSprint(s, 'gate', 10);
  s = reportSprint(s, 'river', 0); // to the next chapter mid-sprint
  s = run(s, 1);
  s = reportSprint(s, 'river', 4); // "The river ran high."
  expect(sprintBarOf(s).words).toBe('+7 words this sprint');
  // Back to the first: its first count stands.
  s = reportSprint(s, 'gate', 10);
  expect(sprintWords(s)).toBe(7);
  expect(reportSprint(s, 'gate', 10)).toBe(s);

  s = run(s, 180);
  const stop = stopSprint(s);
  expect(stop).toEqual({ kind: 'finish', finished: false, elapsed: 182 });
  if (stop.kind !== 'finish') return;
  const { result } = finishSprint(s, { finished: false, elapsed: stop.elapsed, stored: { words: 3, seconds: 600 } });
  expect(sprintCardOf(result)).toMatchObject({
    heading: 'Sprint stopped',
    words: '+7 words',
    time: 'in 3 minutes of 25',
    best: 'Your best sprint yet',
    again: 'Another sprint',
    done: 'Done',
  });

  // Another sprint, of the same length.
  expect(sprintBarOf(startSprint(result.minutes))).toMatchObject({ clock: '25:00', words: '+0 words this sprint' });
});

test('the best: more than nothing and more than before; kept as {words, seconds}', () => {
  const s = reportSprint(reportSprint(startSprint(10), 'a', 100), 'a', 160);
  expect(finishSprint(s, { finished: true, elapsed: 600, stored: { words: 60, seconds: 600 } }).result.best).toBe(false);
  expect(finishSprint(s, { finished: true, elapsed: 600, stored: { words: 59, seconds: 1 } }).newBest).toEqual({
    words: 60,
    seconds: 600,
  });
  const cut = reportSprint(reportSprint(startSprint(10), 'a', 100), 'a', 90);
  expect(finishSprint(cut, { finished: true, elapsed: 600, stored: null })).toEqual({
    result: { words: -10, seconds: 600, minutes: 10, finished: true, best: false },
    newBest: null,
  });
  expect(sprintCardOf(finishSprint(cut, { finished: true, elapsed: 600, stored: null }).result).words).toBe(
    '−10 words',
  );
  expect([null, 5, 'x', [], { words: '9' }, { words: 9.5 }, { words: 9 }].map(bestSprintWords)).toEqual([
    0, 0, 0, 0, 0, 0, 9,
  ]);
});

test('the clock, the minutes and the pace, as Dart reckons them', () => {
  expect([0, 5, 59, 60, 61, 599, 600, 2700, -5, -65].map(clockOf)).toEqual([
    '0:00',
    '0:05',
    '0:59',
    '1:00',
    '1:01',
    '9:59',
    '10:00',
    '45:00',
    '0:55',
    '-1:55',
  ]);
  expect([0, 29, 30, 89, 90, 150, 180, 600].map(minutesRun)).toEqual([1, 1, 1, 1, 2, 3, 3, 10]);
  const pace: [number, number][] = [
    [49, 60],
    [50, 60],
    [125, 120],
    [3, 600],
    [151, 240],
    [1000, 600],
    [75, 180],
    [50, 120],
    [150, 240],
  ];
  expect(pace.map(([w, sec]) => wordsPerMinute(w, sec))).toEqual([0, 50, 63, 0, 38, 100, 25, 25, 38]);
  expect(sprintCardOf({ words: 1000, seconds: 600, minutes: 10, finished: true, best: false }).pace).toBe(
    '100 words a minute',
  );
  expect(signedWords(1)).toBe('+1 word');
  expect(signedWords(-1)).toBe('−1 word');
  expect(signedWords(12345)).toBe('+12,345 words');
});

test('any chapter id counts, even one named like a property of every object', () => {
  let s = reportSprint(startSprint(10), 'constructor', 5);
  s = reportSprint(s, 'constructor', 9);
  s = reportSprint(s, '__proto__', 2);
  s = reportSprint(s, '__proto__', 4);
  expect(sprintWords(s)).toBe(6);
});
