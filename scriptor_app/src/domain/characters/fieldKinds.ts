// FIELD KINDS: the fields of a character whose answer has a known shape, by name, wherever they are made or shown. A
// Gender is chosen, Male or Female, never typed; Pronouns follow it (He/him or She/her); an Age is a number; a Date of
// Birth a date; an Alignment one of the nine. Any other field is what its author made it. A port of
// flutter_app/lib/shared/domain/characters/field_kinds.dart.
//
// A value written before (or written another way: "male", "man", "she") is read as its choice; one that is none of
// them is kept and shown as written, never changed or dropped.

import { type FieldType, fieldTypeLabel } from '../records/category';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** The shape a field's answer takes: its type and, for a choice, the choices. */
export type FieldKind = { readonly type: FieldType; readonly options: readonly string[] };

export const genders: readonly string[] = ['Male', 'Female'];
export const pronounChoices: readonly string[] = ['He/him', 'She/her'];
export const alignments: readonly string[] = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
];

const none: readonly string[] = [];

const kinds: ReadonlyMap<string, FieldKind> = new Map<string, FieldKind>([
  ['gender', { type: 'select', options: genders }],
  ['sex', { type: 'select', options: genders }],
  ['pronouns', { type: 'select', options: pronounChoices }],
  ['age', { type: 'number', options: none }],
  ['date of birth', { type: 'date', options: none }],
  ['birth date', { type: 'date', options: none }],
  ['birthdate', { type: 'date', options: none }],
  ['birthday', { type: 'date', options: none }],
  ['alignment', { type: 'select', options: alignments }],
  ['loyalty', { type: 'number', options: none }],
  ['ambition', { type: 'number', options: none }],
  ['political influence', { type: 'number', options: none }],
]);

/** The kind of the field named `name` (any case), or null for a field that is what its author makes it. */
export function kindOf(name: string): FieldKind | null {
  return kinds.get(dartToLowerCase(dartTrim(name))) ?? null;
}

/** What a field of `kind` is, said in its settings ("Gender is a choice: Male or Female."). */
export function kindNote(name: string, kind: FieldKind): string {
  const n = dartTrim(name).length === 0 ? 'This field' : dartTrim(name);
  switch (kind.type) {
    case 'select':
      return `${n} is a choice: ${
        kind.options.length <= 3 ? kind.options.join(' or ') : `one of ${kind.options.length}`
      }.`;
    case 'number':
      return `${n} is a number.`;
    case 'date':
      return `${n} is a date, chosen from a calendar or written yyyy-mm-dd.`;
    default:
      return `${n} is ${dartToLowerCase(fieldTypeLabel[kind.type])}.`;
  }
}

const sayings: ReadonlyMap<string, readonly string[]> = new Map([
  ['Male', ['male', 'man', 'boy', 'm', 'masculine', 'he', 'him']],
  ['Female', ['female', 'woman', 'girl', 'f', 'lady', 'feminine', 'she', 'her']],
  ['He/him', ['he', 'him', 'he/him', 'he / him', 'he/him/his', 'his']],
  ['She/her', ['she', 'her', 'she/her', 'she / her', 'she/her/hers', 'hers']],
]);

/** `value` as `kind` reads it: for a choice, the choice it says (in any case, or another way of saying it: "man" is
 * Male); else, and for anything that is none of the choices, `value` as written. */
export function settled(kind: FieldKind | null, value: string): string {
  const v = dartTrim(value);
  if (kind === null || kind.type !== 'select' || v.length === 0) return value;
  const lower = dartToLowerCase(v);
  for (const o of kind.options) {
    if (dartToLowerCase(o) === lower) return o;
    if ((sayings.get(o) ?? []).includes(lower)) return o;
  }
  return value;
}
