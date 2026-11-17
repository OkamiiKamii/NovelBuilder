// Field values as readers see them, and what is wrong with them. A port of
// flutter_app/test/shared/domain/field_values_test.dart.

import { normalizeImage } from '../../src/domain/codex/codexChanges';
import { checkValue, displayValue } from '../../src/domain/codex/fieldValues';
import { type JsonMap } from '../../src/domain/json';
import { FieldDef } from '../../src/domain/records/category';
import { Entry } from '../../src/domain/records/entry';
import { foldText } from '../../src/domain/text/fold';

const def = (
  type: string,
  o: { options?: string[]; min?: number; max?: number; required?: boolean; target?: string } = {},
) => {
  const raw: JsonMap = { id: 'd', name: 'Power', type, options: o.options ?? [], required: o.required ?? false };
  if (o.min !== undefined) raw['min'] = o.min;
  if (o.max !== undefined) raw['max'] = o.max;
  if (o.target !== undefined) raw['target'] = o.target;
  return new FieldDef(raw);
};

const entries = new Map([
  ['mira', new Entry({ id: 'mira', category: 'character', name: 'Mira' })],
  ['keep', new Entry({ id: 'keep', category: 'location', name: 'The Keep' })],
]);
const problem = (d: FieldDef, value: string) =>
  checkValue(d, value, entries, { categoryName: (k) => (k === 'character' ? 'Characters' : k) })?.message ?? null;

test('values are read the way a reader should see them; a deleted link reads as nothing', () => {
  const name = (id: string) => entries.get(id)?.name ?? null;
  expect(displayValue('toggle', 'yes', name)).toBe('Yes');
  expect(displayValue('toggle', 'no', name)).toBe('No');
  expect(displayValue('toggle', 'maybe', name)).toBe('maybe');
  expect(displayValue('tags', 'Fire\n\n Ash \n', name)).toBe('Fire, Ash');
  expect(displayValue('reference', 'mira', name)).toBe('Mira');
  expect(displayValue('reference', 'gone', name)).toBe('');
  expect(displayValue('references', 'mira\ngone\nkeep', name)).toBe('Mira, The Keep');
  expect(displayValue(null, '  ', name)).toBe('');
  expect(displayValue('number', '42', name)).toBe('42');
});

test('every problem a value can have against its field is said, in the original app’s words', () => {
  expect(problem(def('text', { required: true }), ' ')).toBe('Power is required.');
  expect(problem(def('text'), '')).toBeNull();
  expect(problem(def('number'), 'many')).toBe('Power should be a number; it holds “many”.');
  expect(problem(def('number'), 'Infinity')).toBe('Power should be a number; it holds “Infinity”.');
  expect(problem(def('number', { min: 1 }), '0.5')).toBe('Power should be at least 1; it is 0.5.');
  expect(problem(def('number', { max: 10 }), '12')).toBe('Power should be at most 10; it is 12.');
  expect(problem(def('number', { min: 0, max: 255 }), '0xFF')).toBeNull();
  expect(problem(def('number'), ' 1e3 ')).toBeNull();
  expect(problem(def('date'), '2024-02-30')).toBe('Power should be a date; it holds “2024-02-30”.');
  expect(problem(def('date'), '2024-02-29')).toBeNull();
  expect(problem(def('toggle'), 'Yes')).toBe('Power should be yes or no; it holds “Yes”.');
  expect(problem(def('select', { options: ['Low', 'High'] }), 'Mid')).toBe(
    'Power should be one of Low, High; it holds “Mid”.',
  );
  expect(problem(def('select'), 'Anything')).toBeNull(); // no choices set: anything fits
  expect(problem(def('multiselect', { options: ['Fire', 'Ash'] }), 'Fire\nSmoke\nDust')).toBe(
    'Power holds “Smoke”, “Dust”, not among its choices.',
  );
  expect(problem(def('reference'), 'gone')).toBe('Power holds “gone”, which is not an entry.');
  expect(problem(def('references'), 'gone\nlost')).toBe('Power holds “gone”, “lost”, which are not an entry.');
  expect(problem(def('references', { target: 'character' }), 'mira\nkeep')).toBe(
    'Power should link to Characters; The Keep is not.',
  );
});

test('searching ignores accents and case the way the original app does', () => {
  expect(foldText('Émile Ångström')).toBe('emile angstrom');
  expect(foldText('İstanbul')).toBe('istanbul');
  expect(foldText('Йорк')).toBe('иорк'); // Cyrillic short i decomposes too
  // Letters that are not a base and an accent stay themselves, as with NFD.
  expect(foldText('Øster Łódź')).toBe('øster łodz');
  expect(foldText('é')).toBe('e'); // an accent typed separately is dropped
});

test('images are kept only as web addresses or uploaded pictures, within the original’s size', () => {
  expect(normalizeImage('https://example.com/a.png')).toBe('https://example.com/a.png');
  expect(normalizeImage('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
  expect(normalizeImage('javascript:alert(1)')).toBeNull();
  expect(normalizeImage('data:text/html;base64,AAAA')).toBeNull();
  expect(normalizeImage('')).toBeNull();
  expect(normalizeImage(`data:image/png;base64,${'A'.repeat(2000000)}`)).toBeNull();
});
