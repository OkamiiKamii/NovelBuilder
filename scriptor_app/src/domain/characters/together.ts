// TOGETHER: two characters the book puts on the page together, in how many chapters, and which. A port of
// flutter_app/lib/shared/domain/characters/together.dart. Reads only.

import { dartSort } from '../manuscript/dartSort';
import { type StoryOrder } from '../model/storyOrder';
import { type Listed } from './cast';

/** Two characters the book puts on the page together: the chapters both are in (by number, in order). */
export type Together = { a: string; b: string; chapters: number[] };

/** Together this many chapters or more, with no tie recorded, is worth asking about. */
export const togetherAtLeast = 3;

/** The key of a pair, whichever way round it is given. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** For every pair in `cast`, the chapters both are in (linked or named there), when there are any, by pairKey. Read
 * from where each character is (Listed.seenIn); chapters, not scenes, so two people in different scenes of one chapter
 * count. */
export function chaptersTogether(cast: readonly Listed[], order: StoryOrder): Map<string, number[]> {
  const where = new Map<string, Set<number>>();
  for (const l of cast) {
    const set = new Set<number>();
    for (const id of l.seenIn) {
      const n = order.chapterNumber.get(id);
      if (n !== undefined) set.add(n);
    }
    where.set(l.entry.id, set);
  }
  const people = cast.filter((l) => where.get(l.entry.id)!.size > 0).map((l) => l.entry.id);
  const out = new Map<string, number[]>();
  for (let i = 0; i < people.length; i++) {
    const mine = where.get(people[i])!;
    for (let j = i + 1; j < people.length; j++) {
      const theirs = where.get(people[j])!;
      const both = [...mine].filter((n) => theirs.has(n));
      if (both.length > 0) out.set(pairKey(people[i], people[j]), both.sort((x, y) => x - y));
    }
  }
  return out;
}

/** TIES THE BOOK SHOWS: pairs of characters together in togetherAtLeast chapters or more who have no relationship
 * recorded (`related`, by pairKey) and have not been set aside (`setAside`, by pairKey); the most together first, then
 * by first chapter. */
export function untiedTogether(
  cast: readonly Listed[],
  order: StoryOrder,
  options: { related: ReadonlySet<string>; setAside?: ReadonlySet<string> },
): Together[] {
  const setAside = options.setAside ?? new Set<string>();
  const out: Together[] = [];
  for (const [key, chapters] of chaptersTogether(cast, order)) {
    if (chapters.length < togetherAtLeast || options.related.has(key) || setAside.has(key)) continue;
    const [a, b] = key.split('|');
    out.push({ a, b, chapters });
  }
  return dartSort(out, (x, y) => {
    const more = y.chapters.length - x.chapters.length;
    return more !== 0 ? more : x.chapters[0] - y.chapters[0];
  });
}
