/** Calendar helpers. Days are the author's local days, written `yyyy-mm-dd`. */

const pad = (n: number) => String(n).padStart(2, '0');

export const dayKey = (time: number | Date): string => {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const parseDay = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (key: string, days: number): string => {
  const d = parseDay(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
};

/** The Monday on or before the given day. */
export const weekStart = (key: string): string => addDays(key, -((parseDay(key).getDay() + 6) % 7));

export const monthOf = (key: string): string => key.slice(0, 7);

export const daysBetween = (from: string, to: string): number => Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
