// TIES: the cast as a table of who they are to each other, each character down the side and across the top, a cell for
// every pair. A pair with a relationship shows it as it stands now (its latest stage), marked by its kind; a press
// opens it. A pair with none is a faint "+": a press offers the common ties and records the one chosen (for a one-way
// tie, the character on the row takes the first role: Mira the Mentor, Kai the Student). One relationship per pair, as
// everywhere; its history is kept on its own page.
//
// The pure parts of flutter_app/lib/features/characters/widgets/cast_ties.dart.
//
// The table scrolls sideways. On a phone (narrower than 600) a cell is 92 × 58 and the names' column 112 wide; else 112
// × 58 and 168. The head row: a blank the names' column wide, then for each character a monogram of 30 (castTone, `ink`)
// over their name (11, bold, one line), at least 56 tall. Each row: the monogram and the name (13, bold, two lines),
// then a cell per character, 3 in from its edges: the diagonal a plain square (outlineVariant at 25%, radius 6); a tie
// tinted in its kind's colour at 14% with a border at 70%, radius 6, its name centred (14.5, two lines); no tie a
// border of outlineVariant at 70%, a "+" (18, onSurfaceVariant at 70%), or, when the two share togetherAtLeast
// chapters or more, a "+" (16, the accent) over "<n> together" (13, italic, the accent).

import { CharacterRelation } from '../../records/relation';
import { relationshipPath } from '../../relationships/screens/relationshipPage';
import { typeFor } from '../../relationships/relationTypes';
import { type Listed } from '../cast';
import { type CastData } from '../castData';
import { type CharacterChanges } from '../characterChanges';
import { castTone, monogram } from '../screens/library';
import { chaptersTogether, pairKey, togetherAtLeast } from '../together';
import { inkOn, relateIn } from './common';
import { tieChoices } from './togetherOnPage';

/** The colour of a kind of tie (with the kind always said in words too): `null` for the theme's outline. Opposition
 * apart from friendship, though both are social. */
export function kindColour(category: string, preset: string): string | null {
  switch (category) {
    case 'social':
      return preset === 'rivals' || preset === 'enemies' ? '#B4532A' : '#3D5FA8';
    case 'family':
      return '#3F7D4E';
    case 'romance':
      return '#A8436B';
    case 'mentorship':
      return '#2B7A8C';
    case 'hierarchy':
      return '#8A6D1F';
    default:
      return null;
  }
}

/** A cell of the table. */
export type TieCell =
  | { kind: 'self' }
  | {
      kind: 'tie';
      relation: CharacterRelation;
      label: string;
      colour: string | null;
      semanticsLabel: string;
      path: string;
    }
  | {
      kind: 'none';
      together: number;
      /** "<n> together" when they share togetherAtLeast chapters or more; else null (a faint "+"). */
      shown: string | null;
      semanticsLabel: string;
      tooltip: string;
      choices: { value: string; label: string }[];
      rowId: string;
      colId: string;
    };

/** A character as the table heads a row or a column with them. */
export type TieHead = { id: string; name: string; tone: string; ink: string; monogram: string };

/** The table for `found` (the cast as found and sorted), or the line said when there are fewer than two. */
export function castTies(
  cast: CastData,
  found: readonly Listed[],
  narrow: boolean,
): { empty: string } | { cell: { width: number; height: number }; head: number; people: TieHead[]; rows: TieCell[][] } {
  const people = found.map((l) => l.entry);
  if (people.length < 2) return { empty: 'Ties need at least two characters.' };
  const relations = new Map<string, CharacterRelation>();
  for (const row of cast.snapshot.rows('characterRelations')) {
    const r = new CharacterRelation(row);
    relations.set(pairKey(r.fromId, r.toId), r);
  }
  const together = chaptersTogether(cast.list, cast.model.order);
  const rows = people.map((row, i) =>
    people.map((col, j): TieCell => {
      if (i === j) return { kind: 'self' };
      const r = relations.get(pairKey(row.id, col.id));
      if (r !== undefined && r.stages.length > 0) {
        const stage = r.stages[r.stages.length - 1];
        const label = stage.label.length > 0 ? stage.label : typeFor(stage.preset).label;
        return {
          kind: 'tie',
          relation: r,
          label,
          colour: kindColour(stage.category, stage.preset),
          semanticsLabel: `${row.name} and ${col.name}: ${label}`,
          path: relationshipPath(r.id),
        };
      }
      const n = together.get(pairKey(row.id, col.id))?.length ?? 0;
      return {
        kind: 'none',
        together: n,
        shown: n >= togetherAtLeast ? `${n} together` : null,
        semanticsLabel:
          n > 0
            ? `${row.name} and ${col.name}: no tie yet, together in ${n} chapters. Add one`
            : `${row.name} and ${col.name}: no tie yet. Add one`,
        tooltip: `Who is ${row.name} to ${col.name}?`,
        choices: tieChoices(row.name),
        rowId: row.id,
        colId: col.id,
      };
    }),
  );
  return {
    cell: narrow ? { width: 92, height: 58 } : { width: 112, height: 58 },
    head: narrow ? 112 : 168,
    people: people.map((e) => ({ id: e.id, name: e.name, tone: castTone(e.id), ink: inkOn(castTone(e.id)), monogram: monogram(e.name) })),
    rows,
  };
}

/** Whether the screen is narrow enough for the phone's table (narrower than 600). */
export const tiesNarrow = (width: number): boolean => width < 600;

/** A tie chosen in an empty cell: recorded with the row's character first (inside CharacterService.change; a refusal
 * throws ChangeRefused, said as it is). Nothing is told; the cell shows it. */
export function addTie(c: CharacterChanges, rowId: string, colId: string, preset: string): CharacterRelation {
  return relateIn(c, (r) => r.createRelation(rowId, colId, preset));
}
