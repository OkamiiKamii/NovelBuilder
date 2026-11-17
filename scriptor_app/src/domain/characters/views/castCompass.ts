// THE COMPASS, a view of the cast (foils.ts reads it): the cast's temperaments, from what This or that keeps in their
// Core Traits. A board of two of its axes (the two the cast spreads across most, or any two chosen), each face in the
// square of its answers (the middle row and column for not asked yet); then the **foils** (pairs opposed on most of
// what both answered, with where they differ), the **twins** (alike nearly everywhere, whom a reader may mix up), the
// traits the **whole cast shares**, and who is **not on the compass yet**, each a press from This or that. It only
// reads.
//
// The pure parts of flutter_app/lib/features/characters/widgets/cast_compass.dart.
//
// The board (at most 560 wide, centred): a head row (74 blank, then three equal columns: the across axis's left trait,
// "Not asked", its right trait) and three rows 104 high, each a label of 74 (the down axis's left trait, "Not asked",
// its right trait, right-aligned) and three cells (2 apart, 4 in, radius 8, a border of outlineVariant at 50%; the
// middle row and column onSurface at 3%, the corners the accent at 8%; test key `cell-<row>-<col>`). Labels in
// capitals (11, bold, onSurfaceVariant, spacing 1), one line, made smaller to fit. In a cell, its people centred, 2
// apart: each 34 wide, a cameo of 26 × 31.2 (radius 6.5) over their first name (10.5, one line); a press opens them.
// A pair row: the low-high surface, radius 10, 10 in: two cameos of 36 (the second 24 to the right and 6 down), the
// names "A & B" (15, bold), what is said (13.5), and chips (12.5) on the accent at 10%, radius 20.

import { type Listed } from '../cast';
import { type Foils, type Temperament, foilsOf, spreadAxes, traitOf } from '../foils';
import { characterPath } from '../screens/create';
import { type TraitAxis, sidesOf, traitAxes, traitsIn } from '../thisOrThat';
import { dartToLowerCase, dartTrim } from '../../text/dartString';

/** The fields a character's traits are kept in, as This or that keeps them (recordLook.ts). */
const traitFields = ['core traits', 'traits', 'personality traits', 'personality'];

/** A character's temperament, from the traits in their profile (the first of the trait fields). */
export function temperamentOf(l: Listed): Temperament {
  const field = l.entry.fields.find((f) => traitFields.includes(dartToLowerCase(dartTrim(f.key))));
  return { id: l.entry.id, sides: field === undefined ? new Map() : sidesOf(traitsIn(field.value)) };
}

/** The axes shown: the ones chosen (`x`, `y`: null when not chosen), else the two the cast spreads across most. */
export function compassAxes(
  answered: readonly Temperament[],
  chosen: { x: string | null; y: string | null },
): { x: string; y: string } {
  const [spreadX, spreadY] = spreadAxes(answered);
  const x = chosen.x ?? spreadX;
  const y = chosen.y ?? (spreadY === x ? spreadX : spreadY);
  return { x, y };
}

/** An axis chooser ("Across", "Down"): every axis but the other one, as "<left> or <right>". Its test key is
 * `compass-<label>-<value>`. */
export function axisChooser(label: string, value: string, other: string): {
  label: string;
  value: string;
  key: string;
  choices: { value: string; label: string }[];
} {
  return {
    label,
    value,
    key: `compass-${label}-${value}`,
    choices: traitAxes.filter((a) => a.id !== other).map((a) => ({ value: a.id, label: `${a.leftTrait} or ${a.rightTrait}` })),
  };
}

const axisNamed = (id: string): TraitAxis => {
  const a = traitAxes.find((x) => x.id === id);
  if (a === undefined) throw new Error('Bad state: No element');
  return a;
};

/** The column (or row) of a side: the left trait 0, not asked 1, the right trait 2. */
const placeOf = (side: number | undefined) => (side === undefined ? 1 : side < 0 ? 0 : 2);

/** Where a cell is said to be, for a screen reader. */
function whereSaid(i: number, ax: TraitAxis, ay: TraitAxis): string {
  const row = Math.trunc(i / 3);
  const col = i % 3;
  const side = (a: TraitAxis, k: number) =>
    k === 0 ? a.leftTrait : k === 2 ? a.rightTrait : `${a.leftTrait} or ${a.rightTrait} not asked`;
  return `${side(ax, col)}, ${side(ay, row)}`;
}

/** The board: its corner labels, nine cells (row by row) of the people in each, and what a screen reader says of it. */
export function compassBoard(
  people: readonly Listed[],
  temperaments: ReadonlyMap<string, Temperament>,
  x: string,
  y: string,
): {
  across: [string, string, string];
  down: [string, string, string];
  cells: { row: number; col: number; key: string; middle: boolean; people: { listed: Listed; first: string; path: string }[] }[];
  semanticsLabel: string;
} {
  const ax = axisNamed(x);
  const ay = axisNamed(y);
  const cells: Listed[][] = Array.from({ length: 9 }, () => []);
  for (const l of people) {
    const s = temperaments.get(l.entry.id)!.sides;
    if (s.size === 0) continue;
    cells[placeOf(s.get(y)) * 3 + placeOf(s.get(x))].push(l);
  }
  const said = cells
    .map((c, i) => (c.length === 0 ? null : `${c.map((l) => l.entry.name).join(', ')}: ${whereSaid(i, ax, ay)}`))
    .filter((s): s is string => s !== null);
  return {
    across: [ax.leftTrait, 'Not asked', ax.rightTrait],
    down: [ay.leftTrait, 'Not asked', ay.rightTrait],
    cells: cells.map((c, i) => {
      const row = Math.trunc(i / 3);
      const col = i % 3;
      return {
        row,
        col,
        key: `cell-${row}-${col}`,
        middle: row === 1 || col === 1,
        people: c.map((l) => ({ listed: l, first: l.entry.name.split(' ')[0], path: characterPath(l.entry.id) })),
      };
    }),
    semanticsLabel:
      `The compass: ${ax.leftTrait} to ${ax.rightTrait} across, ${ay.leftTrait} to ${ay.rightTrait} down. ` +
      said.join('; '),
  };
}

/** A pair of the cast side by side: who, what they are to each other, and the traits that say it. */
export type CompassPair = { key: string; a: Listed; b: Listed; said: string; chips: string[] };

/** The compass for `found` (those archived left out). `chosen`: the axes the author picked (null: not picked). */
export function castCompass(
  found: readonly Listed[],
  chosen: { x: string | null; y: string | null },
): {
  caption: string;
  /** With no one answered yet, the line said in place of the board, the foils and the twins. */
  none: string | null;
  axes: { x: string; y: string };
  across: ReturnType<typeof axisChooser>;
  down: ReturnType<typeof axisChooser>;
  board: ReturnType<typeof compassBoard>;
  read: Foils;
  foils: { heading: string; caption: string; pairs: CompassPair[] } | null;
  twins: { heading: string; caption: string; pairs: CompassPair[] } | null;
  shared: string[];
  unasked: { heading: string; people: { listed: Listed; key: string; ask: string }[] } | null;
} {
  const people = found.filter((l) => !l.profile.archived);
  const byId = new Map(people.map((l) => [l.entry.id, l]));
  const temperaments = new Map(people.map((l) => [l.entry.id, temperamentOf(l)]));
  const answered = [...temperaments.values()].filter((t) => t.sides.size > 0);
  const unasked = people.filter((l) => temperaments.get(l.entry.id)!.sides.size === 0);
  const axes = compassAxes(answered, chosen);
  const read = foilsOf(answered);
  const pairsOf = (list: Foils['foils'], prefix: string, said: (p: Foils['foils'][number]) => string, chips: (p: Foils['foils'][number]) => string[]) =>
    list.slice(0, 5).flatMap((p) => {
      const a = byId.get(p.a);
      const b = byId.get(p.b);
      return a === undefined || b === undefined ? [] : [{ key: `${prefix}-${p.a}-${p.b}`, a, b, said: said(p), chips: chips(p) }];
    });
  const sideOf = (id: string, axis: string) => temperaments.get(id)!.sides.get(axis)!;
  return {
    caption:
      'The cast’s temperaments set against each other, from what This or that keeps in their Core Traits: who are ' +
      'foils, who are too alike, and what the whole cast shares.',
    none:
      answered.length === 0
        ? 'No one has answered This or that yet. A few quick choices each, and the cast’s temperaments are set side ' +
          'by side here.'
        : null,
    axes,
    across: axisChooser('Across', axes.x, axes.y),
    down: axisChooser('Down', axes.y, axes.x),
    board: compassBoard(people, temperaments, axes.x, axes.y),
    read,
    foils:
      answered.length === 0 || read.foils.length === 0
        ? null
        : {
            heading: 'FOILS',
            caption: 'Opposed on most of what both answered: the contrast a scene between them runs on.',
            pairs: pairsOf(
              read.foils,
              'foil',
              (p) => `Opposite on ${p.opposed} of ${p.both}`,
              (p) => p.differ.map((axis) => `${traitOf(axis, sideOf(p.a, axis))} · ${traitOf(axis, sideOf(p.b, axis))}`),
            ),
          },
    twins:
      answered.length === 0 || read.twins.length === 0
        ? null
        : {
            heading: 'TOO ALIKE',
            caption:
              'Alike on nearly everything both answered: a reader may mix them up. Set them apart, or make them one.',
            pairs: pairsOf(
              read.twins,
              'twin',
              (p) => `Alike on ${p.alike} of ${p.both}`,
              (p) =>
                traitAxes.flatMap((axis) => {
                  const s = temperaments.get(p.a)!.sides.get(axis.id);
                  return s !== undefined && temperaments.get(p.b)!.sides.get(axis.id) === s ? [traitOf(axis.id, s)] : [];
                }),
            ),
          },
    shared:
      answered.length === 0
        ? []
        : read.shared.map(
            (s) =>
              `Everyone who answered is ${traitOf(s.axis, s.side)} (${s.count} of ${s.count}). No one in the cast to ` +
              'break it.',
          ),
    unasked:
      unasked.length === 0
        ? null
        : {
            heading: 'NOT ON THE COMPASS YET',
            people: unasked.map((l) => ({ listed: l, key: `unasked-${l.entry.id}`, ask: 'This or that' })),
          },
  };
}
