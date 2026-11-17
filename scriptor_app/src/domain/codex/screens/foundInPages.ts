// FOUND IN YOUR PAGES, at the top of the World (FEATURES.md #207): the places, groups, powers and things the
// manuscript names that the world does not hold yet (worldFinder.ts), each a card in its kind's colour: "Mimir Forest",
// "Location · reads as a place · in chapter 1", **Add as Location** (one press, under the kind it reads as), **Another
// kind** (the same, under any other), or **Not an entry**, which sets it aside for this novel. The most written first;
// three, then "Show all". The pure parts of flutter_app/lib/features/codex/widgets/found_in_pages.dart.
//
// It reads the saved chapters once per change of the novel (`worldFindsFor`), only while the World is shown. Nothing is
// added until a press.
//
// Shown (with anything to show; 20 under it, then a divider): the heading (vault heading 13, 700), 2, the intro (book
// face 15, italic, onSurfaceVariant), 10, the cards in columns ((width + 12) / 300, 1 to 3) 12 apart; with more than
// three, "Show all 5" / "Show fewer" (6 above). A card (padded 14 12 10 6, surfaceContainerLow, radius 10, a border of
// outlineVariant at 70%): its monogram on its kind's colour (40 square, radius 6; vault heading 13, 700, in #FFF8EC on a
// dark colour, else #1B140E), 12, the name (vault heading 15, 700, two lines) over `line` (book face 15, italic,
// onSurfaceVariant); 4, the buttons ("Add as …" with a plus; "Another kind", a menu of the other kinds by singular,
// tipped "Add Mimir Forest as another kind"; "Not an entry"; the last two in onSurfaceVariant).

import { formatNumber } from '../../desk/format';
import { str } from '../../json';
import { blockTexts } from '../../prose';
import type { Category } from '../../records/category';
import type { Entry } from '../../records/entry';
import type { CastData } from '../../characters/castData';
import { monogram } from '../../characters/screens/library';
import type { CodexChanges } from '../codexChanges';
import { type WorldFind, worldFinds, worldKey } from '../worldFinder';
import { kindColor } from './world';

/** Where the names set aside as "Not an entry" are kept, per novel (a device setting). */
export function notEntriesKey(novelId: string): string {
  return `world.notEntries.${novelId}`;
}

/** The names set aside, as stored (each as Dart's string interpolation writes it). */
export function notEntriesOf(stored: unknown): Set<string> {
  return new Set(Array.isArray(stored) ? stored.map((s) => (s === null || s === undefined ? 'null' : String(s))) : []);
}

/** What "Not an entry" stores: the names set aside, with this one. */
export function notAnEntryAfter(stored: unknown, find: WorldFind): string[] {
  return [...notEntriesOf(stored), worldKey(find.name)];
}

/** The book read for what it names (`chapterContents` rows as stored, each by its chapter number; at most 40). */
export function worldFindsFor(cast: CastData, chapterContents: readonly Record<string, unknown>[]): WorldFind[] {
  const chapters: [number, string[]][] = [];
  for (const row of chapterContents) {
    const number = cast.model.order.chapterNumber.get(str(row['id']));
    if (number !== undefined) chapters.push([number, blockTexts(row['doc'])]);
  }
  const known = new Set<string>();
  for (const e of cast.entries) known.add(worldKey(e.name));
  for (const p of cast.profiles.values()) for (const a of p.aliases) known.add(worldKey(a));
  return worldFinds(chapters, { known, limit: 40 });
}

/** One card: the find, its kind, its letters, its colour, its line, and the other kinds it can be added as. */
export type FindCard = {
  find: WorldFind;
  key: string;
  kind: Category;
  tone: string;
  monogram: string;
  line: string;
  add: string;
  others: { key: string; label: string }[];
  anotherTip: string;
};

/** The panel: null when there is nothing to show (all set aside, or of kinds the novel has not, or has archived). */
export function foundInPages(
  finds: readonly WorldFind[],
  stored: unknown,
  kinds: ReadonlyMap<string, Category>,
  all: boolean,
): { heading: string; intro: string; cards: FindCard[]; more: string | null } | null {
  const aside = notEntriesOf(stored);
  const shownFinds = finds.filter((f) => {
    const k = kinds.get(f.kind);
    return !aside.has(worldKey(f.name)) && k !== undefined && !k.archived;
  });
  if (shownFinds.length === 0) return null;
  const others = [...kinds.values()].filter((k) => k.key !== 'character' && !k.archived);
  const cards = (all ? shownFinds : shownFinds.slice(0, foundFirst)).map((f): FindCard => {
    const kind = kinds.get(f.kind)!;
    const where = f.chapters === 1 ? `in chapter ${f.first}` : `in ${formatNumber(f.chapters)} chapters`;
    return {
      find: f,
      key: worldKey(f.name),
      kind,
      tone: kindColor(kind),
      monogram: monogram(f.name),
      line: `${kind.singular} · ${f.why} · ${where}`,
      add: `Add as ${kind.singular}`,
      others: others.filter((k) => k.key !== f.kind).map((k) => ({ key: k.key, label: k.singular })),
      anotherTip: `Add ${f.name} as another kind`,
    };
  });
  return {
    heading: 'Found in your pages',
    intro: 'Places, groups, powers and things your chapters name that the world does not hold yet.',
    cards,
    more: shownFinds.length > foundFirst ? (all ? 'Show fewer' : `Show all ${formatNumber(shownFinds.length)}`) : null,
  };
}

/** How many cards before "Show all". */
export const foundFirst = 3;

/** How many columns of cards, for the width. */
export function findColumns(width: number): number {
  return Math.max(1, Math.min(3, Math.floor((width + 12) / 300)));
}

/** A press on "Add as …" or on another kind: the entry made, and the toast "Mimir Forest is in the world." with
 * **Open** (entryPath(made.id, character: false)). */
export function addFind(c: CodexChanges, find: WorldFind, kind: string): { made: Entry; tell: string; action: string } {
  return { made: c.createEntry(kind, find.name), tell: `${find.name} is in the world.`, action: 'Open' };
}

export const foundWords = { another: 'Another kind', notAnEntry: 'Not an entry' } as const;
