// A port of flutter_app/test/shared/domain/day_book_test.dart, journal_test.dart and the pure test of
// flutter_app/test/features/write/day_book_test.dart, with what its widget test reads off the card and the cases
// day_book.dart's comments describe. The droplets were printed by Dart 3.10 running day_book.dart's painter's sums.

import {
  type BookDay,
  type Milestone,
  type WritingSession,
  addDays,
  carryOnNode,
  computeJournal,
  dayBookCounts,
  dayBookHeadline,
  dayBookOf,
  dayBookOffers,
  dayKeyOf,
  dayLabel,
  dayMarkOf,
  lastNodeKey,
  parseDay,
  shortDay,
  weekInitials,
  weekStart,
  weekdayOf,
  writingSessionOf,
} from '../../src/domain/desk/dayBook';
import { storyNode } from '../../src/domain/outline';

function s(day: string, net: number, added?: number): WritingSession {
  return writingSessionOf({ id: `${day}${net}`, day, netWords: net, added: added ?? (net > 0 ? net : 0) });
}

// Wednesday 11 November 2026.
const now = new Date(2026, 10, 11, 18).getTime();

describe('days', () => {
  test('a day is its local date; days run on over months and years; weeks start on Monday', () => {
    expect(dayKeyOf(now)).toBe('2026-11-11');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(weekdayOf('2026-11-11')).toBe(3);
    expect(weekStart('2026-11-11')).toBe('2026-11-09');
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
    expect(shortDay('2026-11-01')).toBe('Nov 1');
    expect(parseDay('2026-11-11').getTime()).toBe(new Date(2026, 10, 11).getTime());
    expect(() => parseDay('someday')).toThrow();
  });
});

describe('dayBookOf', () => {
  test('five whole weeks from Monday, ending this Sunday; days to come are marked', () => {
    const book = dayBookOf([], now);
    expect(book.days).toHaveLength(35);
    expect(book.days[0].key).toBe('2026-10-12');
    expect(weekdayOf(book.days[0].key)).toBe(1);
    expect(book.days[book.days.length - 1].key).toBe('2026-11-15');
    expect(book.days.filter((d) => d.today).map((d) => d.key)).toEqual(['2026-11-11']);
    expect(book.days.slice(28).map((d) => d.ahead)).toEqual([false, false, false, true, true, true, true]);
    expect(book.streak).toBe(0);
    expect(book.most).toBe(1); // never zero, for scaling
  });

  test('the days in a row reach today when today is written, else yesterday; a day of cutting still counts', () => {
    const sessions = [
      s('2026-11-08', 300),
      s('2026-11-09', -40, 10), // cut more than written
      s('2026-11-10', 200),
      s('2026-11-10', 120),
    ];
    const before = dayBookOf(sessions, now);
    expect(before.keptToday).toBe(false);
    expect(before.streak).toBe(3);
    expect(before.today).toBe(0);
    const day = before.days.find((d) => d.key === '2026-11-10')!;
    expect([day.words, day.written]).toEqual([320, true]);
    const cut = before.days.find((d) => d.key === '2026-11-09')!;
    expect([cut.words, cut.written]).toEqual([0, true]);
    expect(before.most).toBe(320);
    expect(before.thisWeek).toBe(0 + 320); // Monday on: the 9th cut words, the 10th added 320

    const after = dayBookOf([...sessions, s('2026-11-11', 50)], now);
    expect([after.keptToday, after.streak, after.today]).toEqual([true, 4, 50]);

    const broken = dayBookOf([s('2026-11-08', 300)], now);
    expect(broken.streak).toBe(0); // a day missed since
  });

  test('a session that neither added nor gained words does not write the day; today can be below nothing', () => {
    const book = dayBookOf([s('2026-11-11', -30, 0)], now);
    expect(book.keptToday).toBe(false);
    expect(book.today).toBe(-30);
    expect(book.days.find((d) => d.today)!.words).toBe(0);
  });

  test('more or fewer weeks; the log read leniently', () => {
    expect(dayBookOf([], now, 2).days[0].key).toBe('2026-11-02');
    expect(writingSessionOf({ day: 3, netWords: '12', added: 2.5 })).toEqual({ day: '', netWords: 0, added: 0 });
    expect(writingSessionOf({ day: '2026-11-11', netWords: 12.0, added: 4 })).toEqual({
      day: '2026-11-11',
      netWords: 12,
      added: 4,
    });
  });
});

describe('the day book card', () => {
  test('the headline: the days in a row, and whether today keeps them', () => {
    expect(dayBookHeadline({ streak: 0, keptToday: false })).toBe('Every day you write leaves a mark');
    expect(dayBookHeadline({ streak: 1, keptToday: true })).toBe('Written today');
    expect(dayBookHeadline({ streak: 4, keptToday: true })).toBe('4 days in a row');
    expect(dayBookHeadline({ streak: 1, keptToday: false })).toBe('1 day · write today to keep it');
    expect(dayBookHeadline({ streak: 3, keptToday: false })).toBe('3 days in a row · write today to keep it');
  });

  test('today’s words, against the daily goal once there is one, and the week', () => {
    expect(dayBookCounts({ today: 7, thisWeek: 7 }, null)).toBe('Today: 7 words · this week 7');
    expect(dayBookCounts({ today: 7, thisWeek: 1320 }, 250)).toBe('Today: 7 of 250 words · this week 1,320');
    expect(dayBookCounts({ today: 1, thisWeek: 1 }, 0)).toBe('Today: 1 word · this week 1');
    expect(dayBookOffers({ today: 7, streak: 1 }, null)).toEqual({ setGoal: true, share: true });
    expect(dayBookOffers({ today: 0, streak: 0 }, 250)).toEqual({ setGoal: false, share: false });
    expect(weekInitials).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  test('what a screen reader hears for each day', () => {
    const book = dayBookOf([s('2026-11-11', 7), s('2026-11-10', 1)], now);
    const label = (key: string) => dayLabel(book.days.find((d) => d.key === key)!);
    expect(label('2026-11-11')).toBe('Nov 11, today: 7 words');
    expect(label('2026-11-10')).toBe('Nov 10: 1 word');
    expect(label('2026-11-09')).toBe('Nov 9: nothing written');
    expect(label('2026-11-12')).toBeNull();
  });

  test('the marks: a dot to come, a faint ring unwritten, ink fuller and darker with the words; today ringed', () => {
    const day = (over: Partial<BookDay>): BookDay => ({
      key: '2026-11-11',
      words: 0,
      written: false,
      today: false,
      ahead: false,
      ...over,
    });
    expect(dayMarkOf(day({ ahead: true }), 10, null)).toEqual({ kind: 'ahead', ring: null });
    expect(dayMarkOf(day({}), 10, null)).toEqual({ kind: 'unwritten', ring: null });
    expect(dayMarkOf(day({ today: true }), 10, null)).toEqual({ kind: 'unwritten', ring: 0 });

    const small = dayMarkOf(day({ words: 7, written: true }), 320, null);
    expect(small).toMatchObject({ kind: 'blot', share: Math.sqrt(7 / 320), droplets: [] });
    const mid = dayMarkOf(day({ words: 200, written: true }), 320, null);
    expect(mid).toMatchObject({ alpha: 0.8743416490252569, scale: 0.7994733192202055 });
    const cut = dayMarkOf(day({ words: 0, written: true }), 320, null);
    expect(cut).toMatchObject({ kind: 'blot', share: 0, alpha: 0.4, scale: 0.42, droplets: [] });

    // Past a share of 0.6, three droplets, the same for the same day every time.
    const big = dayMarkOf(day({ words: 320, written: true, today: true }), 320, 250);
    expect(big).toMatchObject({ kind: 'blot', share: 1, alpha: 0.4 + 0.6, scale: 0.42 + 0.48, ring: 1 });
    expect(big.kind === 'blot' && big.droplets).toEqual([
      { angle: 1.2936151092722232, beyond: 2.932040200100335, radius: 1.2657319550476522 },
      { angle: 5.967890015616611, beyond: 3.193926354805833, radius: 1.5416810140294082 },
      { angle: 6.265106695274715, beyond: 1.9687950430582795, radius: 1.2125000597657682 },
    ]);
    const other = dayMarkOf(day({ key: '2026-10-12', words: 320, written: true }), 320, null);
    expect(other.kind === 'blot' && other.droplets[0]).toEqual({
      angle: 5.853536312134025,
      beyond: 1.5792560266640134,
      radius: 1.485345038511531,
    });

    // Today's ring closes on the goal; with none, whole once anything is written.
    expect(dayMarkOf(day({ today: true, words: 125, written: true }), 320, 250).ring).toBe(0.5);
    expect(dayMarkOf(day({ today: true, words: 1, written: true }), 320, null).ring).toBe(1);
    expect(dayMarkOf(day({ today: true, words: 0, written: true }), 320, 0).ring).toBe(1);
  });

  test('carrying on: the page last open, else the last with words, else the first', () => {
    const n = (id: string, kind: string, words: number, order = 0) =>
      storyNode({ id, kind, title: id, wordCount: words, parentId: null, order });
    const nodes = [n('v', 'volume', 0), n('a', 'chapter', 100, 0), n('b', 'chapter', 50, 1), n('c', 'chapter', 0, 2)];
    expect(carryOnNode(nodes, 'a')!.id).toBe('a');
    expect(carryOnNode(nodes, 'gone')!.id).toBe('b');
    expect(carryOnNode([n('x', 'chapter', 0), n('y', 'chapter', 0, 1)], null)!.id).toBe('x');
    expect(carryOnNode([n('v', 'volume', 0)], 'v')).toBeNull();
    expect(lastNodeKey('n1')).toBe('write.lastNode.n1');
  });
});

describe('computeJournal', () => {
  const today = '2026-10-30';
  const at = parseDay(today).getTime() + 12 * 3600 * 1000;
  const j = (
    sessions: WritingSession[],
    { words = 0, target = null, chapters = { total: 0, completed: 0 } }: { words?: number; target?: number | null; chapters?: { total: number; completed: number } } = {},
  ) => computeJournal({ sessions, totalWords: words, targetWords: target, chapters, now: at });
  const js = (day: string, net: number) => writingSessionOf({ id: `${day}${net}`, day, netWords: net });

  test('runs: the current one counts up to today, or yesterday while today is open; the best is kept', () => {
    const days = [...[1, 2, 3].map((i) => js(addDays(today, -i), 100)), ...[10, 11, 12, 13, 14].map((i) => js(addDays(today, -i), 100))];
    const journal = j(days);
    expect([journal.currentRun, journal.bestRun]).toEqual([3, 5]);
    expect(j([...days, js(today, 50)]).currentRun).toBe(4);
    expect(j([js(addDays(today, -2), 100)]).currentRun).toBe(0); // a day missed ends the run
  });

  test('a day with two sessions is one day, its words added up', () => {
    expect(j([js(today, 300), js(today, -50)]).days.get(today)).toEqual({ day: today, net: 250, sessions: 2 });
    expect(j([js('', 300)]).days.size).toBe(0);
  });

  test('pace over the last 30 days leads to a finish date; none without a target, a pace, or once reached', () => {
    const sessions = Array.from({ length: 30 }, (_, i) => js(addDays(today, -i), 1000));
    const journal = j(sessions, { words: 40000, target: 90000 });
    expect(journal.pacePerDay).toBe(1000);
    expect(journal.finishDay).toBe(addDays(today, 50));
    expect(j(sessions, { words: 40000 }).finishDay).toBeNull();
    expect(j(sessions, { words: 95000, target: 90000 }).finishDay).toBeNull();
    expect(j([js(addDays(today, -40), 5000)], { words: 1, target: 9 }).pacePerDay).toBeNull();
  });

  test("shading: nothing is 0, revising is 1, words added rank 1 to 4 among the author's own days", () => {
    const journal = j([
      js(addDays(today, -1), 100),
      js(addDays(today, -2), 200),
      js(addDays(today, -3), 300),
      js(addDays(today, -4), 400),
      js(addDays(today, -5), -80),
    ]);
    expect([1, 2, 3, 4, 5, 6].map((i) => journal.level(addDays(today, -i)))).toEqual([1, 2, 3, 4, 1, 0]);
  });

  test('milestones: passed ones reached, the next of each kind says how far, the target among the words', () => {
    const journal = j(
      Array.from({ length: 8 }, (_, i) => js(addDays(today, -i), 10)),
      { words: 12000, target: 30000, chapters: { total: 4, completed: 1 } },
    );
    const show = (m: Milestone) => `${m.label}${m.reached ? ' ✓' : ''}${m.toGo !== null ? ` (${m.toGo})` : ''}`;
    expect(journal.milestones.map(show)).toEqual([
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

  test('a target that is one of the milestones is named as the target, once', () => {
    const journal = j([], { words: 0, target: 50000, chapters: { total: 1, completed: 0 } });
    expect(journal.milestones.filter((m) => m.kind === 'words').map((m) => m.label)).toEqual([
      '1,000 words',
      '10,000 words',
      '25,000 words',
      'Your target: 50,000',
      '100,000 words',
    ]);
    expect(journal.milestones.filter((m) => m.kind === 'chapters').map((m) => m.label)).toEqual(['First chapter complete']);
  });
});
