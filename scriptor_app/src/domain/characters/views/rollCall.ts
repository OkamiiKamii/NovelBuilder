// THE ROLL CALL, a view of Characters: the whole cast as a table of the basics (role, age, gender, species,
// occupation, what they want), every cell written in place and kept in that character's profile (in the field that
// holds it, else a new one where it belongs). Names stay at the left while the columns scroll; a blank is a cell to
// fill, and the head says how many are filled. Faster than opening each profile in turn; nothing else changes.
//
// The pure parts of flutter_app/lib/features/characters/widgets/roll_call.dart.
//
// Rows 60 high, a rule of 1 between them (outlineVariant at 60%); the names' column 150 wide: a cameo of 32 × 40
// (radius 8) and the name (13.5, bold, one line; "Unnamed" for none) over the roles (13, italic, one line), a press
// opening them. The head row 36 high, each column's label in capitals (11, bold, the accent, spacing 1.4). Over the
// table, the count and a bar of what is filled (4 high). A cell that is a choice (a Gender) is a drop-down with "—" for
// none (its choices, and the value written when it is not one of them); any other a text field, "—" for none, a blank
// tinted with the accent at 6%; an Age takes a number. A cell changed elsewhere is shown, unless it is being written in.

import { type FieldType } from '../../records/category';
import { type Entry } from '../../records/entry';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type Listed, fieldNamed } from '../cast';
import { type CharacterChanges } from '../characterChanges';
import { kindOf, settled } from '../fieldKinds';
import { recordIn } from '../recordLook';
import { stakeField, stakeFieldNames } from '../stakes';

/** A column of the roll call: what it is called, the fields that hold it (in lower case, the first written read), the
 * field a new answer is written to, where that field goes, and how wide it is. */
export type RollColumn = {
  label: string;
  names: readonly string[];
  field: string;
  sections: readonly string[];
  width: number;
};

/** The roll call's columns: the basics every character is asked first. */
export const rollColumns: readonly RollColumn[] = [
  { label: 'Age', names: ['age'], field: 'Age', sections: ['identity'], width: 76 },
  { label: 'Gender', names: ['gender', 'sex'], field: 'Gender', sections: ['identity'], width: 112 },
  { label: 'Species', names: ['species', 'race', 'kind'], field: 'Species', sections: ['identity'], width: 120 },
  {
    label: 'Occupation',
    names: ['occupation', 'job', 'profession', 'trade'],
    field: 'Occupation',
    sections: ['identity', 'position'],
    width: 168,
  },
  {
    label: 'What they want',
    names: stakeFieldNames.wants,
    field: stakeField.wants,
    sections: ['goals', 'stakes', 'opposition', 'role in the story', 'arc'],
    width: 280,
  },
];

export const rollRowHeight = 60;
export const rollNameWidth = 150;

/** `entry`'s answer to `column`: the first field of its names that is written. */
export function rollValue(entry: Entry, column: RollColumn): string {
  for (const n of column.names) {
    const v = fieldNamed(entry, n);
    if (v.length > 0) return v;
  }
  return '';
}

/** A cell: its key (also its autosave key), what a screen reader calls it, its value, and how it is written: chosen
 * from `choices` ("—" for none), or typed (`number` for a number). */
export type RollCell = {
  key: string;
  column: RollColumn;
  semanticsLabel: string;
  value: string;
  input: { kind: 'choice'; value: string | null; choices: string[] } | { kind: 'text'; number: boolean; blank: boolean };
};

/** The table for `found`: the head's line, the share filled, and a row a character. */
export function rollCall(found: readonly Listed[]): {
  said: string;
  filled: number;
  cells: number;
  part: number;
  heading: string;
  columns: { label: string; heading: string; width: number }[];
  rows: { listed: Listed; name: string; roles: string | null; cells: RollCell[] }[];
} {
  const cells = found.length * rollColumns.length;
  let filled = 0;
  for (const l of found) for (const c of rollColumns) if (rollValue(l.entry, c).length > 0) filled++;
  return {
    said:
      filled === cells
        ? 'Every answer is in. Press a name to open their profile.'
        : `${filled} of ${cells} filled. Write in a blank and it is kept in their profile.`,
    filled,
    cells,
    part: cells === 0 ? 0 : filled / cells,
    heading: 'CHARACTER',
    columns: rollColumns.map((c) => ({ label: c.label, heading: c.label.toUpperCase(), width: c.width })),
    rows: found.map((l) => {
      const name = dartTrim(l.entry.name);
      return {
        listed: l,
        name: name.length === 0 ? 'Unnamed' : name,
        roles: l.profile.roles.length > 0 ? l.profile.roles.join(' · ') : null,
        cells: rollColumns.map((c) => rollCell(l, c)),
      };
    }),
  };
}

function rollCell(l: Listed, column: RollColumn): RollCell {
  const name = dartTrim(l.entry.name);
  const value = rollValue(l.entry, column);
  // A column whose answer has a known shape (fieldKinds.ts): a Gender is chosen, not typed; an Age is a number.
  const kind = kindOf(column.field);
  const select: FieldType = 'select';
  const number: FieldType = 'number';
  if (kind !== null && kind.type === select) {
    const v = settled(kind, value);
    return {
      key: rollKey(l.entry.id, column),
      column,
      semanticsLabel: `${name.length === 0 ? 'Unnamed' : name}, ${column.label}`,
      value,
      input: {
        kind: 'choice',
        value: v.length === 0 ? null : v,
        choices: [...kind.options, ...(v.length > 0 && !kind.options.includes(v) ? [v] : [])],
      },
    };
  }
  return {
    key: rollKey(l.entry.id, column),
    column,
    semanticsLabel: `${name.length === 0 ? 'Unnamed' : name}, ${column.label}`,
    value,
    input: { kind: 'text', number: kind?.type === number, blank: value.length === 0 },
  };
}

/** A cell's key, and its autosave key (CharacterActions.later: `character:<novel>:<this>`). */
export function rollKey(entryId: string, column: RollColumn): string {
  return `roll:${entryId}:${column.label}`;
}

/** What writing `text` in a cell saves (through autosave, under rollKey): kept in the field that holds it, else a new
 * one where it belongs; nothing written where there was nothing makes no empty field. A refusal (the character was
 * deleted meanwhile) is told as "Not saved: <why>". */
export function rollWrite(c: CharacterChanges, entryId: string, column: RollColumn, text: string): void {
  const e = c.character(entryId);
  const has = e.fields.some((f) => column.names.includes(dartToLowerCase(dartTrim(f.key))));
  if (!has && dartTrim(text).length === 0) return;
  recordIn(c, entryId, column.field, column.names, dartTrim(text), {
    sections: column.sections,
    newSection: column.label === 'What they want' ? 'Goals & Stakes' : 'Core Identity',
  });
}
