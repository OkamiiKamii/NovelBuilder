// Field values as readers see them, and what is wrong with a value against its field. A port of
// flutter_app/lib/shared/domain/codex/field_values.dart.

import { type Category, type FieldDef, type FieldType } from '../records/category';
import { type Entry } from '../records/entry';
import { firstOrNull } from '../records/jsonRecord';
import { dartTrim } from '../text/dartString';

/** Several choices, tags or links are stored one per line. Blank lines and surrounding spaces are not values. */
export function splitChoices(value: string): string[] {
  return value
    .split('\n')
    .filter((v) => dartTrim(v).length > 0)
    .map((v) => dartTrim(v));
}

/** A value as a reader should see it: "Yes", "Fire, Ash", the linked entry's name… A link to an entry that is gone
 * reads as nothing, so a deleted record is never shown as if it were there. */
export function displayValue(
  type: FieldType | null,
  value: string,
  nameOf: (entryId: string) => string | null,
): string {
  if (dartTrim(value).length === 0) return '';
  switch (type) {
    case 'toggle':
      return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value;
    case 'multiselect':
    case 'tags':
      return splitChoices(value).join(', ');
    case 'reference':
      return nameOf(value) ?? '';
    case 'references':
      return splitChoices(value)
        .map(nameOf)
        .filter((n): n is string => n !== null)
        .join(', ');
    default:
      return value;
  }
}

/** The values are the original app's names for them (Dart's `FieldProblem.key`). */
export type FieldProblem =
  | 'required'
  | 'not-a-number'
  | 'too-small'
  | 'too-large'
  | 'not-a-date'
  | 'not-a-choice'
  | 'not-yes-no'
  | 'not-an-entry'
  | 'wrong-kind';

/** Where a value does not fit its field. Said, never enforced: the value is kept as written. */
export class FieldIssue {
  constructor(
    readonly defId: string,
    readonly field: string,
    readonly problem: FieldProblem,
    readonly message: string,
  ) {}
}

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function isDate(value: string): boolean {
  const m = datePattern.exec(value);
  if (m === null) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= days;
}

const int64Max = 9223372036854775807n;
const radixPrefixes: readonly [string, RegExp][] = [
  ['0x', /^0x[0-9a-f]+$/i],
  ['0o', /^0o[0-7]+$/i],
  ['0b', /^0b[01]+$/i],
];
const decimal = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** A number as JavaScript's `Number(text)` reads one (after trimming): decimal, exponent, `0x…`, `0o…`, `0b…`.
 * `Infinity` reads as a number there too, but not a finite one, so it is not a number here. As the Dart port, a
 * prefixed number past 2^63 - 1 is not a number. */
export function jsNumber(text: string): number | null {
  if (text.length === 0) return 0;
  for (const [prefix, pattern] of radixPrefixes) {
    if (pattern.test(text)) {
      const n = BigInt(`0${prefix[1]}${text.substring(2)}`);
      return n > int64Max ? null : Number(n);
    }
  }
  if (!decimal.test(text)) return null;
  return Number(text);
}

/** A number as the original app writes it in a message: 10, not 10.0. */
function n(x: number): string {
  return x === Math.round(x) && Math.abs(x) < 1e21 ? String(Math.trunc(x) + 0) : String(x);
}

const same = (key: string) => key;

/** What is wrong with one value against its field's definition, if anything. As the original app's `checkValue`. */
export function checkValue(
  def: FieldDef,
  value: string,
  entries: ReadonlyMap<string, Entry>,
  options: { categoryName?: (key: string) => string } = {},
): FieldIssue | null {
  const categoryName = options.categoryName ?? same;
  const issue = (problem: FieldProblem, message: string) => new FieldIssue(def.id, def.name, problem, message);
  const text = dartTrim(value);
  if (text.length === 0) return def.required ? issue('required', `${def.name} is required.`) : null;
  switch (def.type) {
    case 'number': {
      const x = jsNumber(text);
      if (x === null || !Number.isFinite(x)) {
        return issue('not-a-number', `${def.name} should be a number; it holds “${text}”.`);
      }
      if (def.min !== null && x < def.min) {
        return issue('too-small', `${def.name} should be at least ${n(def.min)}; it is ${n(x)}.`);
      }
      if (def.max !== null && x > def.max) {
        return issue('too-large', `${def.name} should be at most ${n(def.max)}; it is ${n(x)}.`);
      }
      return null;
    }
    case 'date':
      return isDate(text) ? null : issue('not-a-date', `${def.name} should be a date; it holds “${text}”.`);
    case 'toggle':
      return text === 'yes' || text === 'no'
        ? null
        : issue('not-yes-no', `${def.name} should be yes or no; it holds “${text}”.`);
    case 'select':
      return def.options.length === 0 || def.options.includes(text)
        ? null
        : issue('not-a-choice', `${def.name} should be one of ${def.options.join(', ')}; it holds “${text}”.`);
    case 'multiselect': {
      const choices = def.options;
      const off = splitChoices(text).filter((v) => !choices.includes(v));
      return choices.length === 0 || off.length === 0
        ? null
        : issue('not-a-choice', `${def.name} holds ${off.map((v) => `“${v}”`).join(', ')}, not among its choices.`);
    }
    case 'reference':
    case 'references': {
      const ids = def.type === 'reference' ? [text] : splitChoices(text);
      const missing = ids.filter((id) => !entries.has(id));
      if (missing.length > 0) {
        return issue(
          'not-an-entry',
          `${def.name} holds ${missing.map((v) => `“${v}”`).join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} ` +
            'not an entry.',
        );
      }
      const target = def.target;
      const wrong = target === null ? [] : ids.filter((id) => entries.get(id)!.category !== target);
      if (wrong.length > 0) {
        return issue(
          'wrong-kind',
          `${def.name} should link to ${categoryName(target!)}; ${wrong.map((id) => entries.get(id)!.name).join(', ')} ` +
            `${wrong.length === 1 ? 'is' : 'are'} not.`,
        );
      }
      return null;
    }
    default:
      return null;
  }
}

/** Every value of an entry that does not fit its category's fields (archived fields are not checked). */
export function entryIssues(
  entry: Entry,
  category: Category,
  entries: ReadonlyMap<string, Entry>,
  options: { categoryName?: (key: string) => string } = {},
): FieldIssue[] {
  const out: FieldIssue[] = [];
  const fields = entry.fields;
  for (const def of category.fields) {
    if (def.archived) continue;
    const value = firstOrNull(fields.filter((f) => f.defId === def.id))?.value ?? '';
    const found = checkValue(def, value, entries, options);
    if (found !== null) out.push(found);
  }
  return out;
}
