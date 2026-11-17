// HOW MUCH A DAY: setting a writing goal from the page is a choice of four cards, not two empty boxes and a keyboard:
// each a number of words a day, what it is in manuscript pages, and (when the novel has a target) the day the draft
// would be done at that pace. One press chooses; the chosen card is framed in the accent. "No daily goal" and the
// author's own numbers (a day, a week) stay beneath. Goals are the author's; none is assumed.
// Pure TypeScript. A port of the logic of flutter_app/lib/features/write/goal_pledge.dart (and
// `wordsPerManuscriptPage` from flutter_app/lib/features/progress/widgets/length_shelf.dart); the dialog only draws
// what is here, and saves with `wordGoalWrite` (./wordGoals.ts).

import { addDays } from '../desk/dayBook';
import { formatNumber } from '../desk/format';
import { dartTrim } from '../text/dartString';
import { mediumDay } from './days';
import type { WordGoals } from './wordGoals';

/** The daily goals offered with one press, from a paragraph or two a day to four pages. */
export const dailyChoices: readonly number[] = [100, 250, 500, 1000];

/** Words on a standard manuscript page (12-point, double-spaced), the usual reckoning. */
export const wordsPerManuscriptPage = 250;

/** "About a page", "About 4 pages", "A paragraph or two" (under three quarters of a page), at 250 words a page. */
export function pagesOf(words: number): string {
  const pages = words / wordsPerManuscriptPage;
  if (pages < 0.75) return 'A paragraph or two';
  const whole = Math.round(pages); // pages ≥ 0.75 here, where Math.round and Dart's round agree.
  return whole === 1 ? 'About a page' : `About ${whole} pages`;
}

/** When the draft reaches [target] at [perDay] words a day from [words] today ([today] a day key, "2026-11-07"):
 * "The draft by Mar 3, 2027", or null when there is no target, it is reached, or there is no pace. */
export function finishAt(
  perDay: number,
  { words, target, today }: { words: number; target: number | null; today: string },
): string | null {
  if (target === null || target <= words || perDay <= 0) return null;
  const days = Math.ceil((target - words) / perDay);
  return `The draft by ${mediumDay(addDays(today, days))}`;
}

// ---------------------------------------------------------------------------------------------------- the dialog

export const pledgeTitle = 'How much a day?';
export const pledgeNote = 'Goals are yours to set; none is assumed. Words count net of cuts.';
export const pledgeUnit = 'words a day';
export const ownNumbersLabel = 'Your own numbers';
export const ownDailyField = { label: 'Each day', hint: 'Another number of words' } as const;
export const ownWeeklyField = { label: 'Each week', hint: 'No goal' } as const;
export const pledgeCancel = 'Cancel';
export const pledgeSaveLabel = 'Save goals';

/** The cards sit two to a row from this width of the dialog's content (440 at most), 10 apart; else one to a row. */
export const pledgeTwoColumnsFrom = 300;
export const pledgeCardGap = 10;
export const pledgeContentWidth = 440;

/** The width of each card in content [maxWidth] wide. */
export function pledgeCardWidth(maxWidth: number): number {
  return maxWidth >= pledgeTwoColumnsFrom ? (maxWidth - pledgeCardGap) / 2 : maxWidth;
}

/** What the dialog holds while it is open: the card chosen (null: none), and the two own-number fields as typed. */
export type PledgeState = { daily: number | null; own: string; weekly: string; ownOpen: boolean };

/** The dialog as it opens on the stored goals: a stored daily goal that is not one of the cards is shown as the own
 * number; the own numbers are open when either has something in it. */
export function pledgeOpen(goals: WordGoals): PledgeState {
  const own = goals.daily !== null && !dailyChoices.includes(goals.daily) ? `${goals.daily}` : '';
  const weekly = goals.weekly === null ? '' : `${goals.weekly}`;
  return { daily: goals.daily, own, weekly, ownOpen: own !== '' || weekly !== '' };
}

/** A card pressed ([words]), or "No daily goal" (null): the choice, and the own daily number cleared. */
export function pledgeChoose(state: PledgeState, words: number | null): PledgeState {
  return { ...state, daily: words, own: '' };
}

/** Whether an own daily number is typed (it then wins over the cards, and no card is framed). */
export function ownIsSet(state: PledgeState): boolean {
  return dartTrim(state.own) !== '';
}

/** One of the four cards: its number and unit, its pages, the finish day (null without a target), whether it is the
 * one chosen, and what a screen reader says of it. */
export type PledgeCard = {
  words: number;
  number: string;
  unit: string;
  pages: string;
  finish: string | null;
  chosen: boolean;
  semanticsLabel: string;
};

/** The four cards, for a manuscript of [words] words now with [target] ([today] a day key). */
export function pledgeCards(
  state: PledgeState,
  { words, target, today }: { words: number; target: number | null; today: string },
): PledgeCard[] {
  const ownSet = ownIsSet(state);
  return dailyChoices.map((w) => {
    const finish = finishAt(w, { words, target, today });
    return {
      words: w,
      number: formatNumber(w),
      unit: pledgeUnit,
      pages: pagesOf(w),
      finish,
      chosen: !ownSet && state.daily === w,
      semanticsLabel: `${formatNumber(w)} words a day. ${pagesOf(w)}.${finish === null ? '' : ` ${finish}.`}`,
    };
  });
}

/** "No daily goal ✓" while no goal is chosen and no own number typed, else "No daily goal". */
export function noGoalLabel(state: PledgeState): string {
  return state.daily === null && !ownIsSet(state) ? 'No daily goal ✓' : 'No daily goal';
}

const maxDartInt = 2n ** 63n - 1n;
const minDartInt = -(2n ** 63n);

/** Dart's `int.tryParse` (base 10): an optional sign and digits, white space around allowed; null for anything else
 * or a number outside a 64-bit int. (Above 2^53 the number loses precision in JavaScript.) */
export function dartIntTryParse(text: string): number | null {
  const t = dartTrim(text);
  if (!/^[+-]?[0-9]+$/.test(t)) return null;
  const big = BigInt(t);
  if (big > maxDartInt || big < minDartInt) return null;
  return Number(big);
}

/** What "Save goals" stores: the own daily number when one is typed (a number), else the card chosen; and the weekly
 * number. Each null (or 0 or less) is no goal. Pass each to `wordGoalWrite`. */
export function pledgeResult(state: PledgeState): WordGoals {
  return { daily: dartIntTryParse(state.own) ?? state.daily, weekly: dartIntTryParse(state.weekly) };
}
