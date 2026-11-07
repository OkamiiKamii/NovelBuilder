import type { Point } from './zoom';

/**
 * Moving the keyboard focus through the marks of a visual: one mark at a time
 * takes Tab, and the arrow keys move between them, so a view of a thousand
 * nodes is one stop in the tab order, not a thousand.
 */

/** In a row or a list: arrows step, Home and End go to the ends. Null for other keys. Never wraps, so the ends are felt. */
export function stepIndex(count: number, current: number, key: string, orientation: 'horizontal' | 'vertical' | 'both' = 'both'): number | null {
  if (count === 0) return null;
  const back = orientation !== 'vertical' && key === 'ArrowLeft' ? true : orientation !== 'horizontal' && key === 'ArrowUp';
  const forward = orientation !== 'vertical' && key === 'ArrowRight' ? true : orientation !== 'horizontal' && key === 'ArrowDown';
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (back) return Math.max(0, current - 1);
  if (forward) return Math.min(count - 1, current + 1);
  return null;
}

/** In a grid read row by row: left and right within a row, up and down a column. */
export function stepGrid(count: number, columns: number, current: number, key: string): number | null {
  if (count === 0 || columns < 1) return null;
  const col = current % columns;
  switch (key) {
    case 'ArrowLeft':
      return col === 0 ? current : current - 1;
    case 'ArrowRight':
      return col === columns - 1 || current + 1 >= count ? current : current + 1;
    case 'ArrowUp':
      return current - columns >= 0 ? current - columns : current;
    case 'ArrowDown':
      return current + columns < count ? current + columns : current;
    case 'Home':
      return current - col;
    case 'End':
      return Math.min(count - 1, current - col + columns - 1);
    default:
      return null;
  }
}

const DIRECTIONS: Record<string, Point> = { ArrowRight: { x: 1, y: 0 }, ArrowLeft: { x: -1, y: 0 }, ArrowDown: { x: 0, y: 1 }, ArrowUp: { x: 0, y: -1 } };

/**
 * On a free-form drawing (a graph, a map): the nearest mark in the direction
 * of the arrow, looking within 45° either side of it. Closeness counts the
 * straight-ahead distance once and the sideways distance twice, so the mark
 * the arrow points at wins over one that is slightly nearer but off to the
 * side. Null when nothing lies that way (or the key is not an arrow).
 */
export function nearestInDirection<T extends Point & { id: string }>(items: T[], currentId: string, key: string): T | null {
  const dir = DIRECTIONS[key];
  const from = items.find((i) => i.id === currentId);
  if (!dir || !from) return null;
  let best: T | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    if (item.id === currentId) continue;
    const dx = item.x - from.x;
    const dy = item.y - from.y;
    const ahead = dx * dir.x + dy * dir.y;
    const aside = Math.abs(dx * dir.y - dy * dir.x);
    if (ahead <= 0 || aside > ahead) continue;
    const score = ahead + aside * 2;
    if (score < bestScore || (score === bestScore && best && item.id < best.id)) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

/** Selecting what is already selected clears the selection; anything else selects it. */
export const toggleSelection = (current: string | null, id: string): string | null => (current === id ? null : id);
