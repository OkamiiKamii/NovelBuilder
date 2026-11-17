// A port of flutter_app/test/features/write/fresh_ink_test.dart (its pure tests), with the cases fresh_ink.dart's
// comments describe.

import {
  dayStartOf,
  freshInkKey,
  freshInkReadAfterMs,
  freshParagraphs,
  textAtDayStart,
} from '../../src/domain/desk/freshInk';
import { textToDoc } from '../../src/domain/prose';

const today = new Date(2026, 10, 11).getTime();
const yesterday = new Date(2026, 10, 10, 22).getTime();
const todayNoon = new Date(2026, 10, 11, 12).getTime();

describe('textAtDayStart', () => {
  test('the page as the day began: nothing if made today, the saved text if untouched, else its history', () => {
    expect(textAtDayStart({ node: { createdAt: todayNoon }, saved: null, revisions: [], dayStart: today })).toEqual([]);
    expect(
      textAtDayStart({
        node: { createdAt: yesterday },
        saved: { savedAt: yesterday, doc: textToDoc('Old.\nLines.') },
        revisions: [],
        dayStart: today,
      }),
    ).toEqual(['Old.', 'Lines.']);
    const history = [
      { savedAt: yesterday - 1000, doc: textToDoc('Older.'), branchName: 'Main draft' },
      { savedAt: yesterday, doc: textToDoc('Last night.'), branchName: 'Main draft' },
      { savedAt: yesterday + 10, doc: textToDoc('Another draft.'), branchName: 'Dark ending' },
      { savedAt: todayNoon, doc: textToDoc('This morning.'), branchName: 'Main draft' },
    ];
    expect(
      textAtDayStart({
        node: { createdAt: yesterday - 5000 },
        saved: { savedAt: todayNoon, doc: textToDoc('Now.') },
        revisions: history,
        dayStart: today,
      }),
    ).toEqual(['Last night.']);
    // No copy from before today: unknown, so nothing is marked.
    expect(
      textAtDayStart({
        node: { createdAt: yesterday - 5000 },
        saved: { savedAt: todayNoon, doc: textToDoc('Now.') },
        revisions: [],
        dayStart: today,
      }),
    ).toBeNull();
  });

  test('the saved text without a save time goes by when the chapter last changed', () => {
    expect(
      textAtDayStart({
        node: { createdAt: yesterday - 5000, updatedAt: yesterday },
        saved: { doc: textToDoc('Kept.') },
        revisions: [],
        dayStart: today,
      }),
    ).toEqual(['Kept.']);
  });

  test('history of the chapter’s own draft only; a copy without a draft is of the main draft', () => {
    const history = [
      { savedAt: yesterday, doc: textToDoc('Main, unnamed.') },
      { savedAt: yesterday + 10, doc: textToDoc('Dark.'), branchName: 'Dark ending' },
    ];
    const node = { createdAt: yesterday - 5000, branchName: 'Dark ending' };
    const saved = { savedAt: todayNoon, doc: textToDoc('Now.') };
    expect(textAtDayStart({ node, saved, revisions: history, dayStart: today })).toEqual(['Dark.']);
    expect(
      textAtDayStart({ node: { createdAt: 1 }, saved, revisions: history, dayStart: today }),
    ).toEqual(['Main, unnamed.']);
  });

  test('the day starts at local midnight', () => {
    expect(dayStartOf(todayNoon)).toBe(today);
    expect(dayStartOf(today)).toBe(today);
    expect(dayStartOf(today - 1)).toBe(new Date(2026, 10, 10).getTime());
  });
});

describe('freshParagraphs', () => {
  test('fresh paragraphs: those with words not among the day’s first text, each earlier one matched once', () => {
    expect(freshParagraphs(['A.', 'B changed.', '', 'C.'], ['A.', 'B.', 'C.'])).toEqual(new Set([1]));
    expect(freshParagraphs(['A.', 'A.'], ['A.'])).toEqual(new Set([1]));
    expect(freshParagraphs(['A.', '  '], [])).toEqual(new Set([0]));
    expect(freshParagraphs(['A.'], null).size).toBe(0);
  });

  test('a page made today is all today’s ink; moving a paragraph is not writing it; spaces around do not count', () => {
    expect(freshParagraphs(['The gate was open.', 'Nobody guarded it.'], [])).toEqual(new Set([0, 1]));
    expect(freshParagraphs(['B.', 'A.'], ['A.', 'B.']).size).toBe(0);
    expect(freshParagraphs(['  A. '], ['A.']).size).toBe(0);
  });

  test('kept on this device, read again a moment after typing pauses', () => {
    expect(freshInkKey).toBe('write.freshInk');
    expect(freshInkReadAfterMs).toBe(350);
  });
});
