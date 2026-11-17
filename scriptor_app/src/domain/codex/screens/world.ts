// THE WORLD (Organize → World, FEATURES.md #201, #202, #204, #205): places, factions, items, powers, lore and the
// author's own kinds of record, as volumes on a shelf and an encyclopedia filed by letter. Characters live in their own
// library and are the same entries. The pure parts of flutter_app/lib/features/codex/world_page.dart,
// widgets/encyclopedia.dart and widgets/entry_bits.dart: what is shown, in what order, in what words, at what sizes.
//
// The page (top to bottom): "New entry" (a menu of every kind not archived, by `singular`; a press makes the entry in
// that kind and opens its page: `newEntry`), "Categories & fields" (to /organize/world/kinds); Found in your pages
// (foundInPages.ts); with no entries, the charter (worldCharter.ts); else the volumes, then (with no volume chosen) the
// chart (worldChart.ts), the search ("Search names, tags, fields", with "Clear search") and the tag chooser ("Tag":
// "All tags" and each tag; only with tags), the count line (`countLine`), and the encyclopedia, or, with nothing
// matching, the no-results state (clearing the search, the volume and the tag).

import { localeCompare } from '../../collation';
import { formatNumber, plural } from '../../desk/format';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import type { StoryOrder } from '../../model/storyOrder';
import { dartSort } from '../../manuscript/dartSort';
import { stableSorted } from '../../reader/stableSort';
import { Category } from '../../records/category';
import type { Entry } from '../../records/entry';
import type { StoryNode } from '../../records/storyNode';
import { dartTrim } from '../../text/dartString';
import { foldText } from '../../text/fold';
import type { CastData } from '../../characters/castData';
import { type CodexChanges, matchesEntry } from '../codexChanges';

// ---------------------------------------------------------------------------------------------------- entry bits

/** The first character as a reader sees it (a letter with the marks on it, or one whole character). */
export function firstCharacter(text: string): string {
  const m = /^.[\p{M}️]*/su.exec(text);
  return m === null ? '' : m[0];
}

/** Dart's `int.tryParse(text, radix: 16)`: digits of base 16 after an optional sign, else null. */
function hexOrNull(text: string): number | null {
  if (!/^[+-]?[0-9a-fA-F]+$/.test(text)) return null;
  return parseInt(text, 16);
}

/** A kind's colour as `#rrggbb`, from its stored `#rrggbb` (a grey, #5c6370, when it cannot be read). */
export function kindColor(kind: Category): string {
  const hex = kind.color.startsWith('#') ? kind.color.substring(1) : kind.color;
  const value = hex.length === 6 ? hexOrNull(hex) : null;
  const rgb = ((0xff000000 | (value ?? 0x5c6370)) >>> 0) & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

/** An entry's initial, for its picture when it has none: its first character in capitals, "?" for no name. */
export function entryInitial(entry: Entry): string {
  const name = dartTrim(entry.name);
  return name.length === 0 ? '?' : dartToUpperCase(firstCharacter(name));
}

/** EntryThumb: an uploaded picture, or the initial on the kind's colour in a square of `size` (48), corners
 * size × 0.18, the letter size × 0.42, weight 600, black at 87% on a light colour, else white. The kind badge: a dot of
 * 10 in the kind's colour, 6, the kind's `singular` (never the colour alone). */
export const entryThumb = { size: 48, corner: 0.18, letter: 0.42 } as const;

// ---------------------------------------------------------------------------------------------------- the shelves

/** The world as the book holds it now: its kinds in order (not characters; by their order, then name), every entry
 * that is not a character in name order, the tags they carry (in order) and how many of each kind. */
export type WorldShelves = { kinds: Category[]; all: Entry[]; tags: string[]; counts: Map<string, number> };

export function worldShelves(cast: CastData): WorldShelves {
  const kinds = dartSort(
    [...cast.model.categories.values()].filter((c) => c.key !== 'character'),
    (a, b) => (a.order !== b.order ? (a.order < b.order ? -1 : 1) : localeCompare(a.name, b.name)),
  );
  const all = stableSorted(
    cast.entries.filter((e) => e.category !== 'character'),
    (a, b) => localeCompare(a.name, b.name),
  );
  const counts = new Map<string, number>();
  for (const e of all) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  const tags = dartSort([...new Set(all.flatMap((e) => e.tags))], localeCompare);
  return { kinds, all, tags, counts };
}

/** What is shown of `all` (in name order already: what matches keeps it) for the volume chosen, the tag chosen and the
 * search. */
export function worldVisible(all: readonly Entry[], filter: { category: string | null; tag: string | null; query: string }): Entry[] {
  return all.filter(
    (e) =>
      (filter.category === null || e.category === filter.category) &&
      (filter.tag === null || e.tags.includes(filter.tag)) &&
      matchesEntry(e, filter.query),
  );
}

/** Under the search: "4 entries", or "2 of 4 entries". */
export function countLine(visible: number, all: number): string {
  return visible === all ? plural(all, 'entry', 'entries') : `${formatNumber(visible)} of ${plural(all, 'entry', 'entries')}`;
}

/** The kinds "New entry" offers: those not archived, in shelf order, each by its `singular`. */
export function newEntryKinds(kinds: readonly Category[]): { key: string; label: string }[] {
  return kinds.filter((k) => !k.archived).map((k) => ({ key: k.key, label: k.singular }));
}

/** A press on one of "New entry"'s kinds: the entry made (then opened at entryPath(id, character: false)). */
export function newEntry(c: CodexChanges, key: string): Entry {
  return c.createEntry(key);
}

/** The kind of an entry: its category, or one made up for a key the novel does not have. */
export function kindOfEntry(cast: CastData, e: Entry): Category {
  return cast.model.categories.get(e.category) ?? Category.unknown(e.category);
}

export const worldWords = {
  title: 'Organize',
  noNovel: { title: 'No novel open', message: 'The world belongs to a novel. Open one from the Library.', action: 'Go to Library' },
  newEntry: 'New entry',
  kinds: 'Categories & fields',
  kindsPath: '/organize/world/kinds',
  search: 'Search names, tags, fields',
  clearSearch: 'Clear search',
  tag: 'Tag',
  allTags: 'All tags',
} as const;

// ---------------------------------------------------------------------------------------------------- the volumes

/** THE VOLUMES: each kind of record as a bound volume (its colour on the spine, its name, how many entries it holds).
 * "The whole world" (every kind) first; then each kind not archived, or archived and still holding entries. A press on
 * a volume chooses it, on the chosen one goes back to the whole world.
 *
 * Laid out `columns` across (2 on a phone; else (width + 12) / 192, 2 to 6), 12 apart. A volume (at least 72 high):
 * radius 3 at the left and 8 at the right; a spine 18 wide in its colour with two gilt bands (2 high, 3 in, spaced
 * evenly: gold on the system style); then, padded 12 10 10 10, the title (vault heading 14, weight 700, two lines) and
 * "3 entries" (book face 15, italic, onSurfaceVariant). Chosen: the accent at 10% over the surface, a border of the
 * accent 2 wide, elevation 3, a check (20, the accent) at the right; else surfaceContainerLow, outlineVariant at 60%. */
export type Volume = { key: string | null; title: string; count: number; spine: string | null; selected: boolean; label: string };

export function worldVolumes(shelves: WorldShelves, selected: string | null): Volume[] {
  const count = (key: string) => shelves.counts.get(key) ?? 0;
  const volume = (key: string | null, title: string, n: number, spine: string | null): Volume => ({
    key,
    title,
    count: n,
    spine,
    selected: selected === key,
    label: `${title}, ${plural(n, 'entry', 'entries')}`,
  });
  return [
    volume(null, 'The whole world', shelves.all.length, null),
    ...shelves.kinds.filter((k) => !k.archived || count(k.key) > 0).map((k) => volume(k.key, k.name, count(k.key), kindColor(k))),
  ];
}

/** How many volumes across, for the width (a phone: 2). */
export function volumeColumns(width: number, compact: boolean): number {
  return compact ? 2 : Math.max(2, Math.min(6, Math.floor((width + 12) / 192)));
}

/** A press on a volume: the volume chosen next (the chosen one again goes back to the whole world). */
export function volumePressed(selected: string | null, key: string | null): string | null {
  return key === null ? null : selected === key ? null : key;
}

// ---------------------------------------------------------------------------------------------------- the encyclopedia

/** The letter an entry is filed under: its first letter without accents ("Élan" under E), "#" for a digit or a sign. */
export function letterOf(name: string): string {
  const first = firstCharacter(foldText(dartTrim(name)));
  return /^\p{L}$/u.test(first) ? dartToUpperCase(first) : '#';
}

/** Entries in the order given, filed under their letters (a letter met again later joins its first group). */
export function fileByLetter(entries: readonly Entry[]): [string, Entry[]][] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const letter = letterOf(e.name);
    let list = groups.get(letter);
    if (list === undefined) groups.set(letter, (list = []));
    list.push(e);
  }
  return [...groups];
}

/** For each entry, the chapters (by number, in reading order) where a chapter or one of its scenes links to it. */
export function chaptersMentioning(nodes: Iterable<StoryNode>, order: StoryOrder): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const node of nodes) {
    const n = order.chapterNumber.get(node.id);
    if (n === undefined || n < 1) continue;
    for (const id of node.mentions) {
      let set = out.get(id);
      if (set === undefined) out.set(id, (set = new Set()));
      set.add(n);
    }
  }
  return out;
}

/** The row of letters over the encyclopedia (only with more than one letter): each a target of 48, the letter (vault
 * heading 17, weight 700, the accent), with its tip. */
export function letterIndex(letters: readonly string[]): { letter: string; tip: string }[] {
  return letters.map((l) => ({ letter: l, tip: l === '#' ? 'Jump to names starting with a number or sign' : `Jump to ${l}` }));
}

/** A letter's heading (16 above, 4 below): the letter (vault heading 34, weight 700, the accent), 14, a rule of 1 (the
 * accent at 45%), 6, a diamond of 6 (the accent at 70%). What a screen reader says of it. */
export function letterHeadingLabel(letter: string): string {
  return letter === '#' ? 'Numbers and signs' : `Letter ${letter}`;
}

/** How many columns of articles: one on a phone or under 760 wide, else two, 32 apart. */
export function articleColumns(width: number, compact: boolean): number {
  return compact || width < 760 ? 1 : 2;
}

/** An article: padded 12 above and below and 4 at the sides, a drop capital of 64 (dropCap), 14, then the name (vault
 * heading 16, weight 700, two lines), a dot of 8 in its kind's colour with its kind and tags ("Location  ·  north ·
 * stone"; book face 15, italic, one line), the summary (book face 16, three lines, 4 above), and (with chapters in the
 * book) the chapter thread (one mark a chapter, lit where it figures) with where it is (bodySmall, 3 under it). */
export type Article = {
  entry: Entry;
  kind: Category;
  tone: string;
  initial: string;
  kindLine: string;
  summary: string | null;
  where: string | null;
  marks: boolean[];
  label: string;
};

export function articleOf(entry: Entry, kind: Category, chapters: ReadonlySet<number>, chapterCount: number): Article {
  const sorted = [...chapters].filter((n) => n <= chapterCount).sort((a, b) => a - b);
  const where =
    chapterCount === 0
      ? null
      : sorted.length === 0
        ? 'Not in the manuscript yet'
        : sorted.length === 1
          ? `In chapter ${sorted[0]}`
          : `In ${formatNumber(sorted.length)} of ${formatNumber(chapterCount)} chapters · ${sorted[0]}–${sorted[sorted.length - 1]}`;
  const marks: boolean[] = [];
  for (let i = 1; i <= chapterCount; i++) marks.push(chapters.has(i));
  return {
    entry,
    kind,
    tone: kindColor(kind),
    initial: entryInitial(entry),
    kindLine: kind.singular + (entry.tags.length > 0 ? `  ·  ${entry.tags.join(' · ')}` : ''),
    summary: entry.summary.length > 0 ? entry.summary : null,
    where,
    marks,
    label: [
      entry.name,
      kind.singular,
      ...(entry.summary.length > 0 ? [entry.summary] : []),
      ...(entry.tags.length > 0 ? [`Tags: ${entry.tags.join(', ')}`] : []),
      ...(where !== null ? [where] : []),
    ].join(', '),
  };
}

/** The drop capital (with no uploaded picture): 64 square, radius 6, a gradient (top left to bottom right) of the
 * theme's bound look of the kind's colour (lift 0.1, sink 0.4, tinted), padded 5, a frame (the look's frame at 60% on
 * the system style, else its ink at 45%), the initial in it (vault heading 30, weight 700, the look's ink). */
export const dropCap = { size: 64, radius: 6, padding: 5, letter: 30, lift: 0.1, sink: 0.4 } as const;

/** The encyclopedia, filed: each letter with its articles, as many as `shown` allows (built a screenful at a time). */
export function encyclopedia(
  entries: readonly Entry[],
  kindOf: (e: Entry) => Category,
  mentions: ReadonlyMap<string, ReadonlySet<number>>,
  chapterCount: number,
  shown: number = Number.POSITIVE_INFINITY,
): { index: { letter: string; tip: string }[] | null; letters: { letter: string; label: string; articles: Article[] }[] } {
  const all = fileByLetter(entries);
  const letters: { letter: string; label: string; articles: Article[] }[] = [];
  let left = shown;
  for (const [letter, list] of all) {
    if (left <= 0) break;
    const taken = list.length <= left ? list : list.slice(0, left);
    letters.push({
      letter,
      label: letterHeadingLabel(letter),
      articles: taken.map((e) => articleOf(e, kindOf(e), mentions.get(e.id) ?? new Set(), chapterCount)),
    });
    left -= list.length;
  }
  return { index: all.length > 1 ? letterIndex(all.map(([l]) => l)) : null, letters };
}
