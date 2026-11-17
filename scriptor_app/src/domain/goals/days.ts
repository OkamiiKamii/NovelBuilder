// The days the goals speak of, and the writing log read for the word meter. Pure TypeScript. Ports of what
// `src/domain/desk/dayBook.ts` does not already have: `mediumDay` (flutter_app/lib/shared/domain/analytics/
// progress.dart), `dayKey` and `weekStartKey` and the meter's `wordsWritten` (flutter_app/lib/features/write/data/
// manuscript_service.dart), and Dart's `intOrNull` (flutter_app/lib/shared/domain/json.dart).

import { type JsonMap, numOrNull, str } from '../json';
import { parseDay } from '../desk/dayBook';

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longWeekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A whole number, as Dart's `intOrNull` reads one: an int, or a finite double that is whole; else null. */
export function intOrNull(value: unknown): number | null {
  const n = numOrNull(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

/** "Oct 25, 2026", as the original's pages write a date (`mediumDay`). */
export function mediumDay(key: string): string {
  const d = parseDay(key);
  return `${shortMonths[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Tuesday, Nov 17": a moment's local day as today's page heads it. */
export function weekdayMonthDay(nowMs: number): string {
  const d = new Date(Math.trunc(nowMs));
  return `${longWeekdays[(d.getDay() + 6) % 7]}, ${shortMonths[d.getMonth()]} ${d.getDate()}`;
}

/** The local day of [nowMs], `yyyy-mm-dd` (the service's `dayKey`; the same as `dayKeyOf` for years 1000 to 9999). */
export function dayKeyAt(nowMs: number): string {
  const t = new Date(Math.trunc(nowMs));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(t.getFullYear(), 4)}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/** The Monday on or before the local day of [nowMs] (the service's `weekStartKey`). */
export function weekStartKeyAt(nowMs: number): string {
  const t = new Date(Math.trunc(nowMs));
  const monday = new Date(2000, 0, 1);
  monday.setFullYear(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return dayKeyAt(monday.getTime());
}

/** Net words written today, and since Monday (today included), from the `writingSessions` rows: what the word meter
 * shows ("Today: 1,204 of 1,000 words", "This week: 3,400 of 5,000"). Net: a day of cutting counts against, and,
 * unlike the day book's week, a day below nothing is not raised to 0. (`ManuscriptService.wordsWritten`.) */
export function wordsWritten(sessionRows: Iterable<JsonMap>, nowMs: number): { today: number; week: number } {
  const today = dayKeyAt(nowMs);
  const monday = weekStartKeyAt(nowMs);
  let day = 0;
  let week = 0;
  for (const s of sessionRows) {
    const d = str(s['day']);
    const n = intOrNull(s['netWords']) ?? 0;
    if (d === today) day += n;
    if (d >= monday && d <= today) week += n;
  }
  return { today: day, week };
}

