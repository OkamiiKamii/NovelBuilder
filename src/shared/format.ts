const number = new Intl.NumberFormat();
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const DAY = 86_400_000;

export const formatNumber = (n: number): string => number.format(n);

export function formatRelative(timestamp: number, now = Date.now()): string {
  const diff = timestamp - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < DAY) return relative.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * DAY) return relative.format(Math.round(diff / DAY), 'day');
  return new Date(timestamp).toLocaleDateString();
}

/** Whole days from today until an ISO date (negative when past). */
export function daysUntil(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / DAY);
}

export const formatDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const progress = (value: number, target: number | null): number | null =>
  target ? Math.min(100, Math.round((value / target) * 100)) : null;
