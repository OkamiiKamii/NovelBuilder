// The author's labels for chapters, scenes and events: the suggestions, how a label is kept, their steady order, and
// every label the novel uses. Ports of `suggestedLabels` and `cleanLabels` in
// flutter_app/lib/shared/domain/timeline/event_changes.dart and of `labelOrder` and `usedLabels` in
// shared/domain/structure/pacing.dart (the plan page and the label picker need them; the timeline and the structure
// view share them).

import { localeCompare } from '../collation';
import { listOf } from '../json';
import type { StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** Labels offered for events and scenes, as the original suggests them. */
export const suggestedLabels: readonly string[] = ['Action', 'Dialogue', 'Exposition', 'Romance', 'Mystery clue', 'Quiet moment'];
const labelMax = 40;
const labelsPerItem = 12;

/** Labels as kept: trimmed, spaces collapsed, at most 40 characters, a suggested one in its own spelling, no repeats
 * (ignoring case), at most 12. */
export function cleanLabels(list: unknown): string[] {
  const out: string[] = [];
  for (const value of listOf(list)) {
    if (typeof value !== 'string') continue;
    let typed = dartTrim(value).replace(/\s+/g, ' ');
    if (typed.length > labelMax) typed = typed.substring(0, labelMax);
    const label = suggestedLabels.find((l) => dartToLowerCase(l) === dartToLowerCase(typed)) ?? typed;
    if (label.length > 0 && !out.some((l) => dartToLowerCase(l) === dartToLowerCase(label))) out.push(label);
  }
  return out.slice(0, labelsPerItem);
}

/** Labels in a steady order: the suggestions first, as listed, then the author's own, alphabetically. */
export function labelOrder(labels: Iterable<string>): string[] {
  const rank = (l: string) => {
    const i = suggestedLabels.findIndex((s) => dartToLowerCase(s) === dartToLowerCase(l));
    return i < 0 ? suggestedLabels.length : i;
  };
  return stableSorted(new Set(labels), (a, b) => {
    const r = rank(a) - rank(b);
    return r !== 0 ? r : localeCompare(a, b);
  });
}

const spellings = new WeakMap<StoryModel, Map<string, string>>();

/** A label as the novel first spells it: plans in reading order, then events by id. */
function spellingOf(model: StoryModel, label: string): string {
  let known = spellings.get(model);
  if (known === undefined) {
    known = new Map();
    const last = 9007199254740991;
    const plans = stableSorted(model.plans.values(), (a, b) => {
      const byPosition = (model.order.position.get(a.id) ?? last) - (model.order.position.get(b.id) ?? last);
      return byPosition !== 0 ? Math.sign(byPosition) : localeCompare(a.id, b.id);
    });
    const events = stableSorted(model.events.values(), (a, b) => localeCompare(a.id, b.id));
    for (const l of [...plans.flatMap((p) => p.labels), ...events.flatMap((e) => e.labels)]) {
      const key = dartToLowerCase(l);
      if (!known.has(key)) known.set(key, l);
    }
    spellings.set(model, known);
  }
  return known.get(dartToLowerCase(label)) ?? label;
}

/** Every label the novel uses (plans' and events'), each in its first spelling, in label order. */
export function usedLabels(model: StoryModel): string[] {
  return labelOrder(
    [...[...model.plans.values()].flatMap((p) => p.labels), ...[...model.events.values()].flatMap((e) => e.labels)].map((l) =>
      spellingOf(model, l),
    ),
  );
}
