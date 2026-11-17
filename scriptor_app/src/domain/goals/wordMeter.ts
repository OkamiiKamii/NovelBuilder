// THE WORD METER'S GOALS (FEATURES.md #119): under the page, today's words against the daily goal as a ring that
// closes when the goal is met (a press opens "How much a day?"), the words this sitting, the chapter's length and
// reading time, and this week's words against the weekly goal. Pure TypeScript. A port of the logic of `_Meter` in
// flutter_app/lib/features/write/chapter_editor.dart; today and this week come from `wordsWritten` (./days.ts), the
// goals from `wordGoalsOf` (./wordGoals.ts).

import { formatNumber, plural } from '../desk/format';

/** Today's goal: [reached] shows a filled check (the accent) in place of the ring and sets the text in the strong
 * style (600 weight, on-surface; else muted); [share] is the ring's fill, 0 to 1 (it springs there, not by jumps);
 * [underline] when no goal is set (the text then invites one). */
export type MeterGoal = { reached: boolean; share: number; text: string; underline: boolean; ringLabel: string };

export function meterGoalOf(today: number, daily: number | null): MeterGoal {
  const reached = daily !== null && today >= daily;
  return {
    reached,
    share: daily === null || daily === 0 ? 0 : Math.min(1, Math.max(0, today / daily)),
    text:
      daily === null
        ? `Today: ${formatNumber(today)} words · Set a goal`
        : `Today: ${formatNumber(today)} of ${formatNumber(daily)} words${reached ? ' · goal reached' : ''}`,
    underline: daily === null,
    ringLabel: "Today's goal",
  };
}

/** "+120 this session", "−8 this session" (a true minus sign); null (not shown) at 0. In the strong style. */
export function sessionText(session: number): string | null {
  if (session === 0) return null;
  return `${session > 0 ? '+' : '−'}${formatNumber(Math.abs(session))} this session`;
}

/** "2,400 words · 10 min read", the chapter's length. Muted. */
export function lengthText(words: number, minutes: number): string {
  return `${plural(words, 'word')} · ${minutes} min read`;
}

/** "This week: 3,400 of 5,000"; null (not shown) without a weekly goal. Muted. */
export function weekText(week: number, weekly: number | null): string | null {
  return weekly === null ? null : `This week: ${formatNumber(week)} of ${formatNumber(weekly)}`;
}
