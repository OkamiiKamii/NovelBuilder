// SHOW ME ON THIS PAGE (FEATURES.md #360): the lesson's steps that name a button shown on the screen, each at that
// button. The choosing is spotlight.dart's `tourOf`, ported; where the buttons are is the screen's to say.

import { tutorialButtonNames } from './topicsData';

/** A stop of the tour: a step of the lesson, the button it names, and where that button is on the screen. */
export type TourStop<R> = { step: number; name: string; at: R };

/** The names a lesson's steps mention (Scriptor's buttons are named as the Flutter app's are). */
export function namesIn(steps: readonly string[], names: readonly string[] = tutorialButtonNames): string[][] {
  return steps.map((step) => names.filter((n) => step.includes(n)));
}

/** The tour of a lesson's `steps` on the page in view: each step, in order, that names a button `at` finds on the
 * screen (the first one it names that is), at that button. Steps naming nothing on the screen are left out. */
export function tourOf<R>(steps: readonly string[], at: ReadonlyMap<string, R>, names?: readonly string[]): TourStop<R>[] {
  const named = namesIn(steps, names);
  const out: TourStop<R>[] = [];
  named.forEach((list, i) => {
    const shown = list.filter((n) => at.has(n)).sort((a, b) => steps[i].indexOf(a) - steps[i].indexOf(b));
    if (shown.length > 0) out.push({ step: i, name: shown[0], at: at.get(shown[0])! });
  });
  return out;
}
