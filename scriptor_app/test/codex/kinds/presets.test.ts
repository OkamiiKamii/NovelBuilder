// The presets, ported (codex/type_presets.dart, codex/world_presets.dart): field by field the same as the original
// app's (the goldens it wrote, flutter_app/test/fixtures/golden/codex.golden.json and kinds.golden.json, as
// codex_test.dart and kinds_test.dart check them), and what each does when added to a novel.

import { join } from 'node:path';

import { CodexChanges } from '../../../src/domain/codex/codexChanges';
import { typePresets } from '../../../src/domain/codex/typePresets';
import { worldPresets } from '../../../src/domain/codex/worldPresets';
import { jsonEquals } from '../../../src/domain/json';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../../fixtures';

const golden = (name: string) => readJson(join(flutterFixturesDir, 'golden', name)) as Record<string, unknown>;
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

class Codex {
  snapshot = new NovelSnapshot({ project: { id: 'novel', title: 'World' }, collections: {} });
  clock = 1000;
  private ids = 0;
  act<T>(change: (c: CodexChanges) => T): T {
    const c = new CodexChanges(this.snapshot, { now: ++this.clock, createId: () => `id${++this.ids}` });
    const result = change(c);
    this.snapshot = c.snapshot;
    return result;
  }
}

test('the record type presets are the original’s, field by field (codex_test.dart)', () => {
  expect(json(typePresets.map((p) => ({ id: p.id, name: p.name, description: p.description, categories: p.categories })))).toEqual(
    golden('codex.golden.json')['presets'],
  );
});

test('the worldbuilding presets are the original’s (kinds_test.dart)', () => {
  expect(json(worldPresets.map((p) => ({ id: p.id, name: p.name, description: p.description, categories: p.categories })))).toEqual(
    golden('kinds.golden.json')['presets'],
  );
});

test('presets: each a starting point that only adds; a second time adds nothing', () => {
  const w = new Codex();
  const spells = typePresets.find((t) => t.id === 'spells')!;
  const after = w.act((c) => c.addKinds(spells.categories));
  const made = after.find((c) => c.name === 'Spells')!;
  expect(made.fields.map((f) => [f.name, f.raw['type'], f.required, f.target])).toEqual([
    ['Effect', 'longtext', true, null],
    ['School', 'select', false, null],
    ['Rank', 'number', false, null],
    ['Cost', 'text', false, null],
    ['Known by', 'references', false, 'character'],
  ]);
  expect(made.key.startsWith('custom-')).toBe(true);
  expect(made.raw['uses']).toEqual({ rank: made.fields[2].id, tree: true });
  const again = w.act((c) => c.addKinds(spells.categories));
  expect(jsonEquals(again.find((c) => c.name === 'Spells')!.raw, made.raw)).toBe(true);
  expect(typePresets.map((t) => t.name)).toEqual([
    'Spells',
    'Planets',
    'Investigations',
    'Techniques',
    'Organizations',
    'Species',
    'Technologies',
    'Relics',
  ]);
});

test('a preset with a holder or a date is set up for that view, by its own fields', () => {
  const w = new Codex();
  const relics = w.act((c) => c.addKinds(typePresets.find((t) => t.id === 'relics')!.categories)).find((c) => c.name === 'Relics')!;
  expect(relics.raw['uses']).toEqual({ ownership: { type: 'owns', field: relics.fields[1].id } });
  const planets = w.act((c) => c.addKinds(typePresets.find((t) => t.id === 'planets')!.categories)).find((c) => c.name === 'Planets')!;
  expect(planets.raw['uses']).toEqual({ timeline: { start: planets.fields[5].id } });
});

test('a worldbuilding preset adds fields to Characters and kinds of its own, and changes nothing there already', () => {
  const w = new Codex();
  const before = w.act((c) => c.category('character')).fields.map((f) => f.name);
  const after = w.act((c) => c.addKinds(worldPresets[0].categories));
  const character = after.find((c) => c.key === 'character')!;
  expect(character.fields.map((f) => f.name)).toEqual([...before, 'Power Rank', 'Elements', 'Affixes', 'Current stage']);
  expect(after.filter((c) => !c.builtin).map((c) => c.name)).toEqual(['Skills & Abilities', 'Cultivation Stages', 'Guilds & Sects']);
  const again = w.act((c) => c.addKinds(worldPresets[0].categories));
  expect(again.map((c) => c.raw)).toEqual(after.map((c) => c.raw));
  expect(worldPresets.map((p) => p.name)).toEqual([
    'Progression Fantasy Bible',
    'Science Fiction',
    'Detective Case',
    'Urban Fantasy',
  ]);
});
