// YOUR PATH (FEATURES.md #359): which lessons the author has already put to use, read from what the library holds (in
// any of its books), never asked and never stored. A lesson counts as tried when what it teaches has left something
// behind: a character for Characters, an event for the Timeline. A port of
// flutter_app/lib/features/tutorial/your_path.dart. (Its ribbons check reads a setting Scriptor never writes, so it
// counts as not tried; the ribbons lesson is not shown in Scriptor either.)

import { type JsonMap } from '../json';
import { type Topic } from './topics';

/** What the path reads: how many rows a book holds of a collection, the rows themselves, and the app's settings. */
export type PathLook = {
  count(novelId: string, collection: string): number;
  rows(novelId: string, collection: string): readonly JsonMap[];
  setting(key: string): unknown;
};

type Look = {
  novels: readonly string[];
  any(collection: string): boolean;
  anyWhere(collection: string, test: (row: JsonMap) => boolean): boolean;
  most(collection: string): number;
  setting(key: string): unknown;
};

const tried: Readonly<Record<string, (l: Look) => boolean>> = {
  library: (l) => l.novels.length > 0,
  write: (l) => l.any('chapterContents'),
  outline: (l) => l.most('chapters') >= 2,
  characters: (l) => l.anyWhere('loreEntries', (r) => r['category'] === 'character'),
  world: (l) => l.anyWhere('loreEntries', (r) => r['category'] !== 'character'),
  timeline: (l) => l.any('timelineEvents'),
  threads: (l) => l.any('plotThreads'),
  relationships: (l) => l.any('characterRelations'),
  ribbons: (l) =>
    l.novels.some((id) => {
      const v = l.setting(`ribbons.${id}`);
      return Array.isArray(v) && v.length > 0;
    }),
  progress: (l) => l.any('goals'),
  history: (l) => l.any('chapterRevisions'),
  drafts: (l) => l.any('chapterBranches'),
  canon: (l) => l.any('canonFacts'),
  continuity: (l) => l.any('continuityRules'),
  places: (l) => l.any('journeys') || l.any('mapPins'),
  systems: (l) => l.any('systems'),
  progression: (l) => l.any('progressSnapshots'),
  modules: (l) => l.any('moduleRecords'),
  histories: (l) => l.any('alternateHistories'),
  graph: (l) => l.any('savedViews'),
  book: (l) => l.any('bookMatter'),
  team: (l) => l.any('members'),
  settings: (l) => l.setting('appearance.theme') !== null && l.setting('appearance.theme') !== undefined,
};

/** The order the path suggests lessons in: the book first, then its people and world, then its plot, then the rest. */
export const yourPathOrder: readonly string[] = [
  'library', 'write', 'outline', 'characters', 'world', 'timeline', 'threads', 'relationships', 'ribbons', 'progress',
  'history', 'drafts', 'canon', 'continuity', 'places', 'systems', 'progression', 'modules', 'histories', 'graph',
  'book', 'team', 'settings',
];

/** Where the author is on the path: the lessons tried, those the path can tell about, and the next to try. */
export type YourPath = { tried: ReadonlySet<string>; counted: readonly string[]; next: Topic | null };

/** Works out the path from the library's books (`novelIds`) and the app's settings. Reads only. A book that cannot be
 * read counts as holding nothing. `topics`: the lessons the path may name (Scriptor's shown ones). */
export function yourPath(look: PathLook, novelIds: readonly string[], topics: readonly Topic[]): YourPath {
  const counts = new Map<string, number>();
  const count = (id: string, collection: string): number => {
    const key = `${id}\u0000${collection}`;
    let n = counts.get(key);
    if (n === undefined) {
      try {
        n = look.count(id, collection);
      } catch {
        n = 0;
      }
      counts.set(key, n);
    }
    return n;
  };
  const l: Look = {
    novels: novelIds,
    any: (collection) => novelIds.some((id) => count(id, collection) > 0),
    anyWhere: (collection, test) => novelIds.some((id) => count(id, collection) > 0 && look.rows(id, collection).some(test)),
    most: (collection) => novelIds.reduce((m, id) => Math.max(m, count(id, collection)), 0),
    setting: (key) => look.setting(key),
  };
  const done = new Set<string>();
  for (const [key, check] of Object.entries(tried)) {
    try {
      if (check(l)) done.add(key);
    } catch {
      // Nothing readable there: not tried.
    }
  }
  const byId = new Map(topics.map((t) => [t.id, t]));
  const nextId = yourPathOrder.find((id) => !done.has(id) && byId.has(id));
  return {
    tried: done,
    counted: yourPathOrder.filter((id) => byId.has(id)),
    next: nextId === undefined ? null : byId.get(nextId)!,
  };
}
