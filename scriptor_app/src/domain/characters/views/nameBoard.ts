// THE NAME BOARD, a view of the cast (nameBoard.ts reads it): every name in the book, people and places and the rest,
// on a board of the alphabet, each under the letter it starts with; a letter shaded as it fills, and gold when crowded.
// A letter pressed lists its names, each a press from its page. Then the look-alikes (two names a reader could take for
// one another, and why), and the free letters, with **Forge a name** for the next one. It only reads, but for the name
// forged, which joins the cast.
//
// The pure parts of flutter_app/lib/features/characters/widgets/name_board.dart.
//
// The board: tiles 84 high, 6 apart, max(4, min(9, width ~/ 86)) across. A tile (radius 10, test key `letter-<L>`): the
// letter (20, bold; onSurfaceVariant at 50% when empty), its count at the right (11, bold, the accent; gold when
// crowded), the first two names each after a dot of 6 in their kind's colour (11, one line), "+<n>" for more (10.5).
// Filled transparent when empty, gold at 28% when crowded, else the accent at 6% + 8% a name; its border onSurface 2
// wide when picked, else outlineVariant at 50% (empty), gold (crowded), the accent at 30%. '#' only when it has names.
// A free letter: a square of 32, radius 8, a gold border at 60%, the letter (14, bold).

import { type CastData } from '../castData';
import { type CharacterChanges } from '../characterChanges';
import { type BoardName, type LookAlike, byLetter, crowded, freeLetters, lookAlikes } from '../nameBoard';
import { castTone } from '../screens/library';
import { entryPath } from '../screens/create';
import { type Entry } from '../../records/entry';
import { dartTrim } from '../../text/dartString';

/** The gold of a crowded letter and of the free letters. */
export const boardGold = '#E0A93B';

/** How many look-alikes are shown. */
export const lookAlikesShown = 12;

/** Every name in the book: each entry with a name, trimmed, with its kind. */
export function boardNames(cast: CastData): BoardName[] {
  const out: BoardName[] = [];
  for (const e of cast.model.entries.values()) {
    if (dartTrim(e.name).length > 0) out.push({ name: dartTrim(e.name), id: e.id, kind: e.category });
  }
  return out;
}

/** A name's dot: a character's own colour, a place's green, anything else the theme's outline (null). */
export function kindColour(n: BoardName): string | null {
  return n.kind === 'character' ? castTone(n.id) : n.kind === 'location' ? '#3F7D4E' : null;
}

/** How many letters across, for the board's width. */
export function lettersAcross(width: number): number {
  return Math.max(4, Math.min(9, Math.trunc(width / 86)));
}

/** A tile of the board. */
export type LetterTile = {
  letter: string;
  key: string;
  names: BoardName[];
  count: number;
  crowded: boolean;
  picked: boolean;
  /** The first two names under it, and how many more ("+3"), or null. */
  first: BoardName[];
  more: string | null;
  /** How it is filled: none, gold (crowded), or the accent at `alpha`. */
  fill: { kind: 'none' } | { kind: 'gold'; alpha: number } | { kind: 'accent'; alpha: number };
  semanticsLabel: string;
  /** Whether a press does anything (a letter with names): it picks the letter, or unpicks it. */
  pressable: boolean;
};

/** The board: its caption, the tiles, the letter picked and its names, the look-alikes, and the free letters. */
export function nameBoard(
  cast: CastData,
  picked: string | null,
): {
  caption: string;
  tiles: LetterTile[];
  picked: { heading: string; names: { name: BoardName; tooltip: string; path: string }[] } | null;
  lookAlikes: { heading: string; line: string | null; shown: { alike: LookAlike; words: string; why: string; names: string }[] };
  free: { heading: string; line: string; letters: string[]; forge: string | null };
} {
  const names = boardNames(cast);
  const board = byLetter(names);
  const alike = lookAlikes(names);
  const free = freeLetters(board);
  const tiles: LetterTile[] = [];
  for (const [letter, list] of board) {
    if (letter === '#' && list.length === 0) continue;
    const n = list.length;
    const isCrowded = n >= crowded;
    tiles.push({
      letter,
      key: `letter-${letter}`,
      names: list,
      count: n,
      crowded: isCrowded,
      picked: picked === letter,
      first: list.slice(0, 2),
      more: n > 2 ? `+${n - 2}` : null,
      fill: n === 0 ? { kind: 'none' } : isCrowded ? { kind: 'gold', alpha: 0.28 } : { kind: 'accent', alpha: 0.06 + 0.08 * n },
      semanticsLabel:
        n === 0 ? `${letter}: no names` : `${letter}: ${list.map((x) => x.name).join(', ')}${isCrowded ? ', crowded' : ''}`,
      pressable: n > 0,
    });
  }
  const under = picked === null ? null : (board.get(picked) ?? null);
  return {
    caption:
      'Every name in the book by the letter it starts with. Readers know a name by its first letter and its shape ' +
      'before they read it through: spread them out, and keep the look-alikes apart.',
    tiles,
    picked:
      under !== null && under.length > 0
        ? {
            heading: `${under.length} ${under.length === 1 ? 'name' : 'names'} under ${picked}`,
            names: under.map((n) => ({
              name: n,
              tooltip: `Open ${n.name}`,
              path: entryPath(n.id, { character: n.kind === 'character' }),
            })),
          }
        : null,
    lookAlikes: {
      heading: 'LOOK-ALIKES',
      line: alike.length === 0 ? 'No two names a reader could take for one another.' : null,
      shown: alike.slice(0, lookAlikesShown).map((a) => ({
        alike: a,
        words: `${a.wordA}  ·  ${a.wordB}`,
        why: `   ${a.why}`,
        names: `${a.inA.map((n) => n.name).join(', ')}  and  ${a.inB.map((n) => n.name).join(', ')}`,
      })),
    },
    free: {
      heading: 'FREE LETTERS',
      line:
        free.length === 0
          ? 'Every letter has a name already.'
          : `No name begins with ${free.length === 1 ? 'this letter' : `these ${free.length}`} yet: room for the next one.`,
      letters: free,
      forge: free.length === 0 ? null : 'Forge a name',
    },
  };
}

/** A letter pressed: the letter picked after it (the same letter again unpicks it). */
export function letterPressed(picked: string | null, letter: string): string | null {
  return picked === letter ? null : letter;
}

/** **Forge a name**: who the name forge is told of, the cast's names and the places'. */
export function forgeFor(cast: CastData): { people: string[]; places: string[] } {
  const names = boardNames(cast);
  return {
    people: names.filter((n) => n.kind === 'character').map((n) => n.name),
    places: names.filter((n) => n.kind === 'location').map((n) => n.name),
  };
}

/** A name forged (with words in it): makes the character (inside CharacterService.change), and the toast "Mira is in
 * the cast." with **Open** to them. */
export function addForged(c: CharacterChanges, name: string): { made: Entry; tell: string; action: string } {
  return { made: c.create({ name: dartTrim(name) }), tell: `${dartTrim(name)} is in the cast.`, action: 'Open' };
}
