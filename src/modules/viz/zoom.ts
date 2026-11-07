/**
 * Zooming and panning, as plain arithmetic so it can be tested and shared.
 * A view maps the drawing's own coordinates ("world") to the screen:
 * screen = world × k + (x, y).
 */
export interface View {
  x: number;
  y: number;
  k: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Limits {
  min: number;
  max: number;
}

export const IDENTITY: View = { x: 0, y: 0, k: 1 };
export const DEFAULT_LIMITS: Limits = { min: 0.1, max: 4 };
/** How much one zoom step (a button, a key, a wheel notch) changes the scale. */
export const STEP = 1.25;
/** How far an arrow key pans, in screen pixels. */
export const PAN_STEP = 60;

export const clampScale = (k: number, limits: Limits = DEFAULT_LIMITS): number => Math.min(limits.max, Math.max(limits.min, k));
export const toWorld = (view: View, p: Point): Point => ({ x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k });
export const toScreen = (view: View, p: Point): Point => ({ x: p.x * view.k + view.x, y: p.y * view.k + view.y });

/** Zooms by `factor` keeping the drawing under `at` (a screen point, such as the cursor) where it is. */
export function zoomAt(view: View, factor: number, at: Point, limits: Limits = DEFAULT_LIMITS): View {
  const k = clampScale(view.k * factor, limits);
  const world = toWorld(view, at);
  return { k, x: at.x - world.x * k, y: at.y - world.y * k };
}

export const panBy = (view: View, dx: number, dy: number): View => ({ ...view, x: view.x + dx, y: view.y + dy });

/** The view that shows all of `bounds` centred in `size`, with `padding` pixels around it, never zoomed past the limits. */
export function fitTo(bounds: Bounds, size: Size, padding = 24, limits: Limits = DEFAULT_LIMITS): View {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const room = { width: Math.max(1, size.width - padding * 2), height: Math.max(1, size.height - padding * 2) };
  const k = clampScale(Math.min(room.width / width, room.height / height), limits);
  return { k, x: size.width / 2 - (bounds.minX + width / 2) * k, y: size.height / 2 - (bounds.minY + height / 2) * k };
}

/** Two fingers moved from `before` to `after`: zoom by how far apart they spread, about their midpoint, and follow the midpoint. */
export function pinch(view: View, before: [Point, Point], after: [Point, Point], limits: Limits = DEFAULT_LIMITS): View {
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const from = mid(...before);
  const to = mid(...after);
  const zoomed = zoomAt(view, distance(...after) / distance(...before), from, limits);
  return panBy(zoomed, to.x - from.x, to.y - from.y);
}

/** The bounds of a set of points, or null when there are none. */
export function boundsOf(points: Point[]): Bounds | null {
  if (!points.length) return null;
  return points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

export type ZoomCommand = 'in' | 'out' | 'fit' | 'reset' | 'left' | 'right' | 'up' | 'down';

/** The command a key stands for on a focused drawing: + and − zoom, 0 fits, arrows pan. Null for any other key. */
export function commandForKey(key: string): ZoomCommand | null {
  switch (key) {
    case '+':
    case '=':
      return 'in';
    case '-':
    case '_':
      return 'out';
    case '0':
      return 'fit';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    default:
      return null;
  }
}

/** Carries out a command. Zooming from a button or key keeps the centre of the drawing area still; arrows move the drawing the way they point. */
export function applyCommand(view: View, command: ZoomCommand, size: Size, bounds: Bounds | null, limits: Limits = DEFAULT_LIMITS): View {
  const centre = { x: size.width / 2, y: size.height / 2 };
  switch (command) {
    case 'in':
      return zoomAt(view, STEP, centre, limits);
    case 'out':
      return zoomAt(view, 1 / STEP, centre, limits);
    case 'fit':
      return bounds ? fitTo(bounds, size, 24, limits) : IDENTITY;
    case 'reset':
      return IDENTITY;
    // Arrow keys look around: the drawing slides the opposite way, as a page does when it scrolls.
    case 'left':
      return panBy(view, PAN_STEP, 0);
    case 'right':
      return panBy(view, -PAN_STEP, 0);
    case 'up':
      return panBy(view, 0, PAN_STEP);
    case 'down':
      return panBy(view, 0, -PAN_STEP);
  }
}
