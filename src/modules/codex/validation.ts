import { splitChoices } from './schema';
import type { Category, FieldDef, LoreEntry } from './types';

/**
 * HOW A VALUE FITS ITS FIELD
 * Each field of a category says what fits it: its type, whether it is
 * required, a number's range, the choices, the kind of record a link points
 * at. These checks say where a value does not fit. They never change a
 * value or stop one being saved: an entry can be half-done, and a value
 * written before a field changed type is kept as written.
 */
export type FieldProblem = 'required' | 'not-a-number' | 'too-small' | 'too-large' | 'not-a-date' | 'not-a-choice' | 'not-yes-no' | 'not-an-entry' | 'wrong-kind';

export interface FieldIssue {
  defId: string;
  field: string;
  problem: FieldProblem;
  message: string;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isDate = (value: string) => {
  const m = DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

/** What is wrong with one value, if anything, against its field's definition. */
export function checkValue(def: FieldDef, value: string, entries: ReadonlyMap<string, Pick<LoreEntry, 'category' | 'name'>>, categoryName: (key: string) => string = (k) => k): FieldIssue | null {
  const issue = (problem: FieldProblem, message: string): FieldIssue => ({ defId: def.id, field: def.name, problem, message });
  const text = value.trim();
  if (!text) return def.required ? issue('required', `${def.name} is required.`) : null;
  switch (def.type) {
    case 'number': {
      const n = Number(text);
      if (!Number.isFinite(n)) return issue('not-a-number', `${def.name} should be a number; it holds “${text}”.`);
      if (def.min !== undefined && n < def.min) return issue('too-small', `${def.name} should be at least ${def.min}; it is ${n}.`);
      if (def.max !== undefined && n > def.max) return issue('too-large', `${def.name} should be at most ${def.max}; it is ${n}.`);
      return null;
    }
    case 'date':
      return isDate(text) ? null : issue('not-a-date', `${def.name} should be a date; it holds “${text}”.`);
    case 'toggle':
      return text === 'yes' || text === 'no' ? null : issue('not-yes-no', `${def.name} should be yes or no; it holds “${text}”.`);
    case 'select':
      return !def.options.length || def.options.includes(text) ? null : issue('not-a-choice', `${def.name} should be one of ${def.options.join(', ')}; it holds “${text}”.`);
    case 'multiselect': {
      const off = splitChoices(text).filter((v) => !def.options.includes(v));
      return !def.options.length || !off.length ? null : issue('not-a-choice', `${def.name} holds ${off.map((v) => `“${v}”`).join(', ')}, not among its choices.`);
    }
    case 'reference':
    case 'references': {
      const ids = def.type === 'reference' ? [text] : splitChoices(text);
      const missing = ids.filter((id) => !entries.has(id));
      if (missing.length) return issue('not-an-entry', `${def.name} holds ${missing.map((v) => `“${v}”`).join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not an entry.`);
      const wrong = def.target ? ids.filter((id) => entries.get(id)!.category !== def.target) : [];
      if (wrong.length) return issue('wrong-kind', `${def.name} should link to ${categoryName(def.target!)}; ${wrong.map((id) => entries.get(id)!.name).join(', ')} ${wrong.length === 1 ? 'is' : 'are'} not.`);
      return null;
    }
    default:
      return null;
  }
}

/** Every value of an entry that does not fit its category's fields (archived fields are not checked). */
export function entryIssues(entry: Pick<LoreEntry, 'fields'>, category: Pick<Category, 'fields'>, entries: ReadonlyMap<string, Pick<LoreEntry, 'category' | 'name'>>, categoryName?: (key: string) => string): FieldIssue[] {
  return category.fields
    .filter((def) => !def.archived)
    .flatMap((def) => {
      const field = entry.fields.find((f) => f.defId === def.id);
      return checkValue(def, field?.value ?? '', entries, categoryName) ?? [];
    });
}
