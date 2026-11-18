// Search and the tutorial are opened from many places (the magnifier and the question mark at the top of the areas,
// a lesson's "Show me"), and shown once, over everything, by the hosts the app frame holds (SearchHost, TutorialHost).

import { useEffect, useState } from 'react';

type Shown = { search: boolean; tutorial: boolean; tour: boolean };
let shown: Shown = { search: false, tutorial: false, tour: false };
const listeners = new Set<(s: Shown) => void>();

function set(next: Partial<Shown>): void {
  shown = { ...shown, ...next };
  for (const l of [...listeners]) l(shown);
}

export const openSearch = () => set({ search: true });
export const closeSearch = () => set({ search: false });
export const openTutorial = () => set({ tutorial: true });
export const closeTutorial = () => set({ tutorial: false });
/** "Show me on this page": the tutorial closes, and the tour of the page in view begins. */
export const startTour = () => set({ tutorial: false, tour: true });
export const endTour = () => set({ tour: false });

export function useShown(): Shown {
  const [s, setS] = useState(shown);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
