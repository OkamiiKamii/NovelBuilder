// THE DAILY NUDGE: one reminder a day at the time the writer chose, never on a day they have already written. The
// next week of reminders is planned at once (so the nudges keep coming while the app stays closed), and planned again
// whenever Scriptor goes to the background, which drops today's once today is written.

export type ReminderTime = { hour: number; minute: number };

/** The times offered: one press each. */
export const reminderChoices: readonly { label: string; time: ReminderTime }[] = [
  { label: 'Morning', time: { hour: 8, minute: 0 } },
  { label: 'Midday', time: { hour: 12, minute: 30 } },
  { label: 'Evening', time: { hour: 20, minute: 0 } },
];

export const reminderSetting = 'write.reminder';

/** The stored time, or null for none (a damaged value reads as none). */
export function readReminder(raw: unknown): ReminderTime | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { hour, minute } = raw as Record<string, unknown>;
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if ((hour as number) < 0 || (hour as number) > 23 || (minute as number) < 0 || (minute as number) > 59) return null;
  return { hour: hour as number, minute: minute as number };
}

/** "8:00 AM", "8:00 PM". */
export function reminderLabel(t: ReminderTime): string {
  const h = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${h}:${String(t.minute).padStart(2, '0')} ${t.hour < 12 ? 'AM' : 'PM'}`;
}

/** The local moments of the next `days` reminders from `nowMs`: today's only while it is still ahead and today is not
 * yet written, then one each following day. */
export function reminderDates(nowMs: number, time: ReminderTime, writtenToday: boolean, days = 7): Date[] {
  const out: Date[] = [];
  const at = (offset: number) => {
    const d = new Date(nowMs);
    d.setDate(d.getDate() + offset);
    d.setHours(time.hour, time.minute, 0, 0);
    return d;
  };
  const today = at(0);
  if (!writtenToday && today.getTime() > nowMs) out.push(today);
  for (let i = 1; out.length < days; i++) out.push(at(i));
  return out;
}
