// MOTION (DESIGN.md, "Motion"): Scriptor moves only to acknowledge a touch, to show a state change, or for the one
// moment it has earned (the page filling with ink). Everything here runs on the native driver and stands still when
// the device asks for less motion.

import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';

// One listener for the whole app, however many progress bars are on screen.
let reducedNow = false;
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  const set = (r: boolean) => {
    if (r === reducedNow) return;
    reducedNow = r;
    listeners.forEach((l) => l());
  };
  void AccessibilityInfo.isReduceMotionEnabled().then(set);
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the device asks for less motion ("Remove animations"), kept up to date while the app runs. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reducedNow);
}

/** The press scale, the durations and the one easing: a confident arrival that settles, never a bounce. */
export const motion = {
  press: 0.97,
  state: 600,
  focal: 1100,
  arrive: Easing.bezier(0.16, 1, 0.3, 1),
} as const;
