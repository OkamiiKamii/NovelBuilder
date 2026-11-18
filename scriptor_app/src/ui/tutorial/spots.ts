// WHERE THE BUTTONS ARE, for "Show me on this page" (FEATURES.md #360). The Flutter app finds a lesson's buttons by
// reading the built page for their labels; here the kit's buttons (GoldButton, OutlineButton, IconButton, Chip) say
// where they are themselves: each registers by its label while it is on the screen, and the tour measures the ones the
// lesson names (in the window, on the screen, not behind the tutorial).

import { type ComponentRef, type RefObject, useEffect, useRef } from 'react';
import { Dimensions, type View } from 'react-native';

type Spot = ComponentRef<typeof View>;

const spots = new Map<string, Set<RefObject<Spot | null>>>();

/** A ref for a button named `name`: it is found by the tour while it is mounted. */
export function useSpot(name: string | undefined): RefObject<Spot | null> {
  const ref = useRef<Spot | null>(null);
  useEffect(() => {
    if (name === undefined || name.length === 0) return;
    let set = spots.get(name);
    if (set === undefined) spots.set(name, (set = new Set()));
    set.add(ref);
    return () => {
      const s = spots.get(name);
      s?.delete(ref);
      if (s?.size === 0) spots.delete(name);
    };
  }, [name]);
  return ref;
}

export type Rect = { x: number; y: number; width: number; height: number };

function measure(ref: RefObject<Spot | null>): Promise<Rect | null> {
  return new Promise((resolve) => {
    const v = ref.current;
    if (v === null) return resolve(null);
    try {
      v.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
    } catch {
      resolve(null);
    }
  });
}

/** Where on the screen each of `names` is now: a button with that label, or one whose label begins with it and goes on
 * ("Continue writing “Chapter 1”"), shown on the screen. The first found of each name counts. */
export async function findOnScreen(names: Iterable<string>): Promise<Map<string, Rect>> {
  const wanted = new Set(names);
  const screen = Dimensions.get('window');
  const found = new Map<string, Rect>();
  for (const [label, refs] of spots) {
    const name = wanted.has(label) ? label : [...wanted].find((n) => label.startsWith(`${n} `));
    if (name === undefined || found.has(name)) continue;
    for (const ref of refs) {
      const at = await measure(ref);
      if (at === null || at.width <= 4 || at.height <= 4) continue;
      const cx = at.x + at.width / 2;
      const cy = at.y + at.height / 2;
      if (cx < 0 || cy < 0 || cx > screen.width || cy > screen.height) continue;
      found.set(name, at);
      break;
    }
  }
  return found;
}
