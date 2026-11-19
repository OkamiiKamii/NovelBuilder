import { readReminder, reminderDates, reminderLabel } from '../src/domain/goals/reminder';

const evening = { hour: 20, minute: 0 };
const noon = new Date(2026, 10, 18, 12, 0).getTime();

describe('the daily nudge', () => {
  test('today is nudged while the time is ahead and nothing is written yet', () => {
    const d = reminderDates(noon, evening, false);
    expect(d).toHaveLength(7);
    expect([d[0].getDate(), d[0].getHours()]).toEqual([18, 20]);
    expect(d[6].getDate()).toBe(24);
  });

  test('a day already written is never nudged: tomorrow comes first', () => {
    const d = reminderDates(noon, evening, true);
    expect([d[0].getDate(), d[0].getHours()]).toEqual([19, 20]);
    expect(d).toHaveLength(7);
  });

  test('past today’s time, tomorrow comes first', () => {
    expect(reminderDates(new Date(2026, 10, 18, 21, 0).getTime(), evening, false)[0].getDate()).toBe(19);
  });

  test('the month turns over', () => {
    expect(reminderDates(new Date(2026, 10, 30, 21, 0).getTime(), evening, false)[0].getMonth()).toBe(11);
  });

  test('a stored time reads back; a damaged one reads as none', () => {
    expect(readReminder({ hour: 8, minute: 0 })).toEqual({ hour: 8, minute: 0 });
    expect(readReminder({ hour: 25, minute: 0 })).toBeNull();
    expect(readReminder('8pm')).toBeNull();
    expect(readReminder(null)).toBeNull();
  });

  test('labels', () => {
    expect(reminderLabel(evening)).toBe('8:00 PM');
    expect(reminderLabel({ hour: 0, minute: 5 })).toBe('12:05 AM');
    expect(reminderLabel({ hour: 12, minute: 30 })).toBe('12:30 PM');
  });
});
