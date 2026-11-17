// IN YOUR MANUSCRIPT: the names the author keeps writing but has not added to the cast (nameFinder.ts), as cards above
// the cast: each with how often and in how many chapters it is written, **Add to the cast** (one press makes the
// character) and **Not a character** (set aside for this novel on this device). Shown only when there are such names;
// nothing is added or changed until a press.
//
// The pure parts of flutter_app/lib/features/characters/widgets/manuscript_names.dart (and the press the characters
// page gives it). Worked out once per cast (a new CastData), from the chapters' rows as stored
// (CharacterService.store.rowsIn(novelId, 'chapterContents'), in the store's order).
//
// A card: 14/12/10/8 padding, the low surface, radius 10, an outline; a circle of 38 in the name's own colour
// (castTone of its plain form) with its monogram (13, bold, `ink`); the name (15, bold, one line) and how often (15,
// italic); **Add <name>** (person_add_alt icon) and **Not a character**. Cards in columns of (width + 12) / 262, 1 to 4,
// 12 apart; six, then "Show all".

import { formatNumber, plural } from '../../desk/format';
import { type JsonMap, str } from '../../json';
import { blockTexts } from '../../prose';
import { type CastData } from '../castData';
import { type CharacterChanges } from '../characterChanges';
import { type ManuscriptName, knownWords, manuscriptNames, plainName } from '../nameFinder';
import { castTone, monogram } from '../screens/library';
import { type Entry } from '../../records/entry';
import { inkOn, storedList } from './common';

/** Where the names set aside as "Not a character" are kept, per novel. */
export const notCharactersKey = (novelId: string): string => `cast.notCharacters.${novelId}`;

/** How many cards are shown before "Show all". */
export const namesFirst = 6;

/** The names the manuscript keeps writing that are not the cast's or the world's (at most 40), from the chapters'
 * rows. */
export function namesInManuscript(cast: CastData, chapterRows: readonly JsonMap[]): ManuscriptName[] {
  const chapters: [number, string[]][] = [];
  for (const row of chapterRows) {
    const number = cast.model.order.chapterNumber.get(str(row['id']));
    if (number !== undefined) chapters.push([number, blockTexts(row['doc'])]);
  }
  const names: string[] = cast.entries.map((e) => e.name);
  for (const p of cast.profiles.values()) names.push(...p.aliases, p.epithet);
  return manuscriptNames(chapters, { known: knownWords(names), limit: 40 });
}

/** The names shown, those not set aside (`stored`: what is under notCharactersKey); their count is what the strip of
 * notes says ('names'). */
export function namesShown(found: readonly ManuscriptName[], stored: unknown): ManuscriptName[] {
  const aside = new Set(storedList(stored));
  return found.filter((n) => !aside.has(plainName(n.name)));
}

/** What to store under notCharactersKey when `name` is set aside. */
export function notCharacterAfter(stored: unknown, name: ManuscriptName): string[] {
  return [...new Set(storedList(stored)), plainName(name.name)];
}

/** One card. */
export type NameCard = {
  name: ManuscriptName;
  tone: string;
  ink: string;
  monogram: string;
  said: string;
  add: string;
  notOne: string;
};

/** The panel, or null with no names. `all`: "Show all" was pressed. */
export function manuscriptNamesPanel(
  names: readonly ManuscriptName[],
  all: boolean,
): { title: string; cards: NameCard[]; toggle: string | null; count: number } | null {
  if (names.length === 0) return null;
  const shown = all ? names : names.slice(0, namesFirst);
  return {
    title: 'In your manuscript',
    cards: shown.map((n) => {
      const tone = castTone(plainName(n.name));
      const where = n.chapters === 1 ? `in chapter ${n.first}` : `in ${formatNumber(n.chapters)} chapters`;
      return {
        name: n,
        tone,
        ink: inkOn(tone),
        monogram: monogram(n.name),
        said: `${plural(n.times, 'time')} · ${where}`,
        add: `Add ${n.name}`,
        notOne: 'Not a character',
      };
    }),
    toggle: names.length > namesFirst ? (all ? 'Show fewer' : `Show all ${formatNumber(names.length)}`) : null,
    count: names.length,
  };
}

/** **Add <name>** (the characters page's press): makes the character (inside CharacterService.change), and the toast
 * "Mira is in the cast." with **Open** to them. */
export function addFromManuscript(c: CharacterChanges, name: string): { made: Entry; tell: string; action: string } {
  return { made: c.create({ name }), tell: `${name} is in the cast.`, action: 'Open' };
}
