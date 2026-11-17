// A port of the pure test of flutter_app/test/features/write/goal_pledge_test.dart, and what its widget test does
// with the dialog (a card in one press, an own number winning over the cards, "No daily goal" clearing it) as the
// dialog's state; the contrast and tap-target checks are the screen's. Values the Dart tests do not pin were printed
// by Dart 3.10 (Flutter 3.38.9) running goal_pledge.dart's and progress.dart's functions.

import {
  dailyChoices,
  dartIntTryParse,
  finishAt,
  noGoalLabel,
  ownIsSet,
  pagesOf,
  pledgeCardWidth,
  pledgeCards,
  pledgeChoose,
  pledgeOpen,
  pledgeResult,
  wordsPerManuscriptPage,
} from '../../src/domain/goals/goalPledge';
import { mediumDay } from '../../src/domain/goals/days';

describe('what a day’s words are in pages, and when they finish the draft', () => {
  test('as the Dart test has it', () => {
    expect(pagesOf(100)).toBe('A paragraph or two');
    expect(pagesOf(250)).toBe('About a page');
    expect(pagesOf(1000)).toBe('About 4 pages');
    expect(finishAt(500, { words: 1000, target: 11000, today: '2026-11-07' })).toBe('The draft by Nov 27, 2026');
    expect(finishAt(500, { words: 1000, target: null, today: '2026-11-07' })).toBeNull();
    expect(finishAt(500, { words: 12000, target: 11000, today: '2026-11-07' })).toBeNull(); // target reached
  });

  test('pages at the edges, as Dart says them', () => {
    const dart: Record<number, string> = {
      0: 'A paragraph or two',
      1: 'A paragraph or two',
      186: 'A paragraph or two',
      187: 'A paragraph or two',
      188: 'About a page',
      374: 'About a page',
      375: 'About 2 pages',
      624: 'About 2 pages',
      625: 'About 3 pages',
      1125: 'About 5 pages',
      1250: 'About 5 pages',
      99999: 'About 400 pages',
      [-5]: 'A paragraph or two',
    };
    for (const [w, said] of Object.entries(dart)) expect(pagesOf(Number(w))).toBe(said);
    expect(wordsPerManuscriptPage).toBe(250);
  });

  test('finish days across months, years, leap days and summer time, as Dart counts them', () => {
    const cases: [number, number, number, string, string][] = [
      [100, 0, 80000, '2026-11-17', 'The draft by Jan 25, 2029'],
      [250, 0, 80000, '2026-11-17', 'The draft by Oct 3, 2027'],
      [1000, 79999, 80000, '2026-12-31', 'The draft by Jan 1, 2027'],
      [333, 1234, 50000, '2027-02-27', 'The draft by Jul 24, 2027'],
      [100, 0, 2000000, '2026-03-28', 'The draft by Dec 29, 2080'],
      [500, 0, 90000, '2026-10-24', 'The draft by Apr 22, 2027'],
      [1, 0, 1000000, '2026-01-01', 'The draft by Nov 29, 4763'],
    ];
    for (const [perDay, words, target, today, said] of cases) {
      expect(finishAt(perDay, { words, target, today })).toBe(said);
    }
    expect(finishAt(0, { words: 0, target: 100, today: '2026-11-07' })).toBeNull(); // no pace
    expect(finishAt(500, { words: 11000, target: 11000, today: '2026-11-07' })).toBeNull();
    expect(['2026-01-01', '2027-03-03', '2026-12-31', '2028-02-29'].map(mediumDay)).toEqual([
      'Jan 1, 2026',
      'Mar 3, 2027',
      'Dec 31, 2026',
      'Feb 29, 2028',
    ]);
  });
});

describe('the dialog', () => {
  const at = { words: 1000, target: 11000, today: '2026-11-07' };

  test('four cards, each its words a day, pages and finish; none chosen while no goal is set', () => {
    const state = pledgeOpen({ daily: null, weekly: null });
    expect(state).toEqual({ daily: null, own: '', weekly: '', ownOpen: false });
    const cards = pledgeCards(state, at);
    expect(cards.map((c) => c.words)).toEqual([...dailyChoices]);
    expect(cards.map((c) => c.number)).toEqual(['100', '250', '500', '1,000']);
    expect(cards.every((c) => !c.chosen && c.unit === 'words a day')).toBe(true);
    expect(cards[1].pages).toBe('About a page');
    expect(cards[2].semanticsLabel).toBe('500 words a day. About 2 pages. The draft by Nov 27, 2026.');
    expect(pledgeCards(state, { ...at, target: null })[3].semanticsLabel).toBe('1,000 words a day. About 4 pages.');
    expect(noGoalLabel(state)).toBe('No daily goal ✓');
  });

  test('a goal in one press; an own number wins over the cards; "No daily goal" clears it', () => {
    let state = pledgeChoose(pledgeOpen({ daily: null, weekly: null }), 250);
    expect(pledgeCards(state, at).filter((c) => c.chosen).map((c) => c.words)).toEqual([250]);
    expect(pledgeResult(state)).toEqual({ daily: 250, weekly: null });

    // Opened again on 250: the card is chosen, the own numbers closed.
    state = pledgeOpen({ daily: 250, weekly: null });
    expect(state.ownOpen).toBe(false);
    state = { ...state, ownOpen: true, own: '333' };
    expect(ownIsSet(state)).toBe(true);
    expect(pledgeCards(state, at).some((c) => c.chosen)).toBe(false);
    expect(noGoalLabel(state)).toBe('No daily goal');
    expect(pledgeResult(state)).toEqual({ daily: 333, weekly: null });

    // Opened on 333 (not a card): shown as the own number, open.
    state = pledgeOpen({ daily: 333, weekly: 2000 });
    expect(state).toEqual({ daily: 333, own: '333', weekly: '2000', ownOpen: true });
    state = pledgeChoose(state, null);
    expect(noGoalLabel(state)).toBe('No daily goal ✓');
    expect(pledgeResult(state)).toEqual({ daily: null, weekly: 2000 });

    // A card pressed clears the own number.
    expect(pledgeChoose({ daily: null, own: '42', weekly: '', ownOpen: true }, 1000)).toEqual({
      daily: 1000,
      own: '',
      weekly: '',
      ownOpen: true,
    });
    // An own field with only white space is not set, and does not parse: the card stands.
    expect(pledgeResult({ daily: 500, own: '   ', weekly: '', ownOpen: true })).toEqual({ daily: 500, weekly: null });
    expect(pledgeOpen({ daily: null, weekly: 5000 }).ownOpen).toBe(true);
  });

  test('numbers read as Dart’s int.tryParse reads them', () => {
    const typed = ['', '12', '0012', ' 12 ', '+5', '-5', '1e3', '9223372036854775807', '9223372036854775808', '12a', '٣'];
    expect(typed.map(dartIntTryParse)).toEqual([null, 12, 12, 12, 5, -5, null, Number(2n ** 63n - 1n), null, null, null]);
  });

  test('two cards to a row from 300 wide, 10 apart', () => {
    expect(pledgeCardWidth(440)).toBe(215);
    expect(pledgeCardWidth(300)).toBe(145);
    expect(pledgeCardWidth(299)).toBe(299);
  });
});
