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

/** Words Scriptor's lessons use for a button, and the label the button has on the screen (the kit's buttons register by
 * their label): "Desk" is the toolbox labelled "Desk: the writing tools", "the question mark" the Tutorial button. */
export const scriptorButtonWords: Readonly<Record<string, string>> = {
  Desk: 'Desk: the writing tools',
  'the question mark': 'Tutorial',
  'The magnifier at the top': 'Search, or go anywhere',
  'Press the magnifier': 'Search, or go anywhere',
  'the magnifier above the page': 'Find and replace',
  'Add a part or chapter': 'Add a part or chapter',
  'The book (the open book at the top)': 'The book: read, details, publish',
  'In their hand': 'In their hand',
  'Open Import & export': 'Open Import & export',
  'Continue on a book': 'Continue',
  'the sliders button': 'Arrange the cast',
};

/** For each of Scriptor's lesson steps, the labels of the buttons it names, in the order the step names them: the Flutter
 * app's names (as `namesIn`, whose labels are the same in Scriptor) and Scriptor's own words for a button. */
export function scriptorNamesIn(steps: readonly string[], names: readonly string[] = tutorialButtonNames): string[][] {
  return steps.map((step) => {
    const found: [number, string][] = [];
    for (const n of names) {
      const at = step.indexOf(n);
      if (at >= 0) found.push([at, n]);
    }
    for (const [word, label] of Object.entries(scriptorButtonWords)) {
      const at = step.indexOf(word);
      if (at >= 0) found.push([at, label]);
    }
    found.sort((a, b) => a[0] - b[0]);
    return [...new Set(found.map(([, label]) => label))];
  });
}

/** `tourOf` for Scriptor's lessons: each step, in order, that names a button shown on the screen (by Scriptor's words
 * for it too), at the first of them it names. */
export function scriptorTourOf<R>(steps: readonly string[], at: ReadonlyMap<string, R>): TourStop<R>[] {
  const out: TourStop<R>[] = [];
  scriptorNamesIn(steps).forEach((labels, i) => {
    const shown = labels.find((l) => at.has(l));
    if (shown !== undefined) out.push({ step: i, name: shown, at: at.get(shown)! });
  });
  return out;
}
