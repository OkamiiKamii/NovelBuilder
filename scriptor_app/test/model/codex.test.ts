// The codex: categories, fields, entries, links. A port of flutter_app/test/shared/domain/codex_test.dart. Its preset
// tests read the presets from the golden the original app wrote (codex/type_presets.dart is not ported), and the
// codex part of canon_changes_test.dart (entries and their own fields) is here too; the rest of that file tests the
// canon and continuity modules, which are not ported yet.

import { join } from 'node:path';

import { cleanUses, mergeUses, remapUses } from '../../src/domain/codex/capabilities';
import { ChangeRefused, CodexChanges, fieldLimits, matchesEntry } from '../../src/domain/codex/codexChanges';
import { type JsonMap, jsonEquals, str } from '../../src/domain/json';
import { Category } from '../../src/domain/records/category';
import { Entry, viewFields } from '../../src/domain/records/entry';
import { maps } from '../../src/domain/records/jsonRecord';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'codex.golden.json')) as Record<string, unknown>;
const presets = golden['presets'] as { id: string; name: string; categories: JsonMap[] }[];

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

  get read(): CodexChanges {
    return new CodexChanges(this.snapshot, {
      now: this.clock,
      createId: () => {
        throw new Error('reading');
      },
    });
  }

  category(key: string): Category {
    return this.read.category(key);
  }

  fieldNames(key: string): string[] {
    return this.category(key).fields.map((f) => `${f.name}${f.archived ? ' (archived)' : ''}:${f.raw['type']}`);
  }

  entry(id: string): Entry {
    return this.read.owned(id);
  }
}

const def = (id: string, name: string, type: string, extra: JsonMap = {}): JsonMap => ({
  id,
  name,
  type,
  options: [],
  ...extra,
});

const refused = (f: () => unknown, message?: string) => {
  expect(f).toThrow(ChangeRefused);
  if (message !== undefined) expect(f).toThrow(message);
};

describe('agrees with the original app', () => {
  test('view settings are cleaned, remapped and merged the same', () => {
    const raws: unknown[] = [
      null,
      {},
      'x',
      { timeline: { start: 'a', end: 'zz' } },
      { map: { x: 'a', y: 'b' }, rank: 'c', tree: true },
      { ownership: { type: '  owns  ', field: 'b' }, graphLabel: 'a', graphLinks: ['a', 'a', 'zz', 'c'] },
      { ownership: { type: '   ' }, graphLinks: [] },
      { rank: 'zz', timeline: { start: 'zz' }, tree: 'yes', extra: 1 },
      { ownership: { type: 'x'.repeat(80) } },
    ];
    const ids = ['a', 'b', 'c'];
    expect(raws.map((r) => cleanUses(r, ids))).toEqual(golden['cleaned']);
    expect(raws.map((r) => remapUses(cleanUses(r, ids), (id) => (id === 'c' ? null : `${id}2`)))).toEqual(
      golden['remapped'],
    );
    expect([
      mergeUses(null, { rank: 'a' }),
      mergeUses({ rank: 'a' }, null),
      mergeUses({ rank: 'a', tree: true }, { rank: 'b', map: { x: 'a' } }),
    ]).toEqual(golden['merged']);
  });

  test('entry search finds the same entries in both real files', () => {
    const search = golden['search'] as Record<string, Record<string, string[]>>;
    for (const name of ['qa-sample', 'made-in-the-app']) {
      const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));
      const entries = s.rows('loreEntries').map((r) => new Entry(r));
      const expected = search[name];
      const actual: Record<string, string[]> = {};
      for (const q of Object.keys(expected)) actual[q] = entries.filter((e) => matchesEntry(e, q)).map((e) => e.id);
      expect(actual).toEqual(expected);
    }
  });
});

describe('defining a kind of record', () => {
  test('a field’s rules are kept only where they fit its type; a link only to a category that exists', () => {
    const w = new Codex();
    const made = w.act((c) => c.saveCategory(null, () => ({ name: 'Spells' })));
    const saved = w.act((c) =>
      c.saveCategory(made.key, () => ({
        fields: [
          def('a', 'Rank', 'number', { min: 0, max: 10, required: true, help: '  How strong  ' }),
          def('b', 'School', 'text', { min: 3 }),
          def('c', 'Known by', 'references', { target: 'character' }),
          def('d', 'Ghost link', 'reference', { target: 'nowhere' }),
          def('e', 'Backwards', 'number', { min: 5, max: 1 }),
        ],
      })),
    );
    expect(
      saved.fields.map((f) => [f.id, f.raw['required'], f.raw['help'], f.raw['min'], f.raw['max'], f.raw['target']].map((x) => x ?? null)),
    ).toEqual([
      ['a', true, 'How strong', 0, 10, null],
      ['b', null, null, null, null, null],
      ['c', null, null, null, null, 'character'],
      ['d', null, null, null, null, null],
      ['e', null, null, 5, null, null],
    ]);
  });

  test('custom fields cannot grow past the limits that keep the app sound', () => {
    const w = new Codex();
    const made = w.act((c) => c.saveCategory(null, () => ({ name: 'Planets' })));
    const many = Array.from({ length: fieldLimits.fields + 1 }, (_, i) => def(`f${i}`, `F${i}`, 'text'));
    refused(() => w.act((c) => c.saveCategory(made.key, () => ({ fields: many }))), 'at most 60 fields');
    const saved = w.act((c) =>
      c.saveCategory(made.key, () => ({
        fields: [def('x', 'N'.repeat(200), 'select', { options: Array.from({ length: 150 }, (_, i) => `o${i}`) })],
      })),
    );
    expect([saved.fields[0].name.length, saved.fields[0].options.length]).toEqual([60, 100]);
    const odd = w.act((c) => c.saveCategory(made.key, () => ({ fields: [def('y', 'Odd', 'spreadsheet')] })));
    expect(odd.fields.find((f) => f.id === 'y')!.raw['type']).toBe('text');
  });

  test('presets: each a starting point that only adds; a second time adds nothing', () => {
    const w = new Codex();
    const spells = presets.find((t) => t.id === 'spells')!;
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
    // Its view settings follow its own fields.
    expect(made.raw['uses']).toEqual({ rank: made.fields[2].id, tree: true });
    const again = w.act((c) => c.addKinds(spells.categories));
    expect(jsonEquals(again.find((c) => c.name === 'Spells')!.raw, made.raw)).toBe(true);
    expect(presets.map((t) => t.name)).toEqual([
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

  test('kinds added together keep their links to each other', () => {
    const w = new Codex();
    const after = w.act((c) =>
      c.addKinds([
        { key: 'cells', name: 'Cells', fields: [def('m', 'Members', 'references', { target: 'agents', required: true })] },
        { key: 'agents', name: 'Agents', fields: [] },
      ]),
    );
    const cells = after.find((c) => c.name === 'Cells')!;
    const agents = after.find((c) => c.name === 'Agents')!;
    expect(cells.fields).toHaveLength(1);
    expect([cells.fields[0].name, cells.fields[0].required, cells.fields[0].target]).toEqual([
      'Members',
      true,
      agents.key,
    ]);
  });
});

describe('categories and fields', () => {
  test('starts with the eleven built-in categories, partners together, and their default fields, storing nothing', () => {
    const w = new Codex();
    expect(w.read.categories().map((c) => c.name)).toEqual([
      'Characters',
      'Locations',
      'Factions',
      'Species',
      'Items',
      'Artifacts',
      'Powers',
      'Skills',
      'Rules',
      'Lore',
      'History',
    ]);
    expect(w.fieldNames('location')).toEqual(['Type:longtext', 'Region:longtext', 'Notable features:longtext']);
    expect(w.snapshot.rows('loreSchemas')).toEqual([]);
  });

  test('NON-DESTRUCTIVE: renaming, retyping, reordering and removing fields never loses a value', () => {
    const w = new Codex();
    const keep = w.act((c) => c.createEntry('location', 'The Keep'));
    const [type, region, notable] = w.category('location').fields;
    w.act((c) => c.setFieldValue(keep.id, type.id, 'Fortress'));
    w.act((c) => c.setFieldValue(keep.id, region.id, 'North'));
    const stored = () => w.entry(keep.id).fields.map((f) => [f.defId, f.value]);
    const values = stored();
    // Rename, retype, reorder; and leave "Region" out entirely.
    w.act((c) =>
      c.saveCategory('location', () => ({
        fields: [
          { ...notable.raw, name: 'Sights', type: 'number' },
          { ...type.raw, name: 'Kind' },
        ],
      })),
    );
    expect(w.fieldNames('location')).toEqual(['Sights:number', 'Kind:longtext', 'Region (archived):longtext']);
    expect(stored()).toEqual(values); // not one stored value changed
    const view = viewFields(w.entry(keep.id), w.category('location'));
    expect(view.category.map(([d, f]) => `${d.name}=${f?.value ?? ''}`)).toEqual(['Sights=', 'Kind=Fortress']);
    expect(view.archived.map(([d, f]) => `${d.name}=${f.value}`)).toEqual(['Region=North']);
    // Restoring the field brings its value back.
    w.act((c) =>
      c.saveCategory('location', (current) => ({
        fields: current!.fields.map((f) => {
          const raw: JsonMap = { ...f.raw };
          delete raw['archived'];
          return raw;
        }),
      })),
    );
    const restored = viewFields(w.entry(keep.id), w.category('location')).category.find((s) => s[0].name === 'Region')!;
    expect(restored[1]!.value).toBe('North');
  });

  test('creates custom categories with their own fields, and entries in them; entries can move', () => {
    const w = new Codex();
    const kingdoms = w.act((c) =>
      c.saveCategory(null, () => ({ name: ' Kingdoms ', singular: 'Kingdom', fields: [def('pop', 'Population', 'number')] })),
    );
    expect([kingdoms.name, kingdoms.singular, kingdoms.builtin]).toEqual(['Kingdoms', 'Kingdom', false]);
    expect(kingdoms.key.startsWith('custom-')).toBe(true);
    refused(() => w.act((c) => c.saveCategory(null, () => ({ name: 'kingdoms' }))), 'already a category');
    refused(() => w.act((c) => c.saveCategory(null, () => ({ name: '  ' }))));
    refused(() => w.act((c) => c.saveCategory('nope', () => ({ name: 'X' }))));
    const aldmoor = w.act((c) => c.createEntry(kingdoms.key));
    expect([aldmoor.name, aldmoor.category]).toEqual(['New kingdom', kingdoms.key]);
    w.act((c) => c.setFieldValue(aldmoor.id, 'pop', '120000'));
    w.act((c) => c.updateEntry(aldmoor.id, { category: 'location' }));
    // A value the new category cannot place stays on the entry.
    expect(viewFields(w.entry(aldmoor.id), w.category('location')).own.map((f) => `${f.key}=${f.value}`)).toEqual([
      'Population=120000',
    ]);
    w.act((c) => c.updateEntry(aldmoor.id, { category: 'made-up' }));
    expect(w.entry(aldmoor.id).category).toBe('location');
  });

  test('archiving a category keeps its entries; built-ins cannot be archived', () => {
    const w = new Codex();
    const ships = w.act((c) => c.saveCategory(null, () => ({ name: 'Starships' })));
    const ship = w.act((c) => c.createEntry(ships.key, 'Kestrel'));
    w.act((c) => c.saveCategory(ships.key, () => ({ archived: true })));
    expect(w.category(ships.key).archived).toBe(true);
    expect(w.entry(ship.id).name).toBe('Kestrel');
    refused(() => w.act((c) => c.createEntry(ships.key)));
    w.act((c) => c.saveCategory(ships.key, () => ({ archived: false })));
    expect(w.act((c) => c.createEntry(ships.key)).category).toBe(ships.key);
    w.act((c) => c.saveCategory('location', () => ({ archived: true })));
    expect(w.category('location').archived).toBe(false);
  });

  test('a category keeps what a later version stored on it', () => {
    const w = new Codex();
    w.snapshot = w.snapshot.putRow('loreSchemas', {
      ...Category.builtin('location').toJson(),
      id: 's1',
      projectId: 'novel',
      futureSetting: { x: 1 },
      fields: [{ ...Category.builtin('location').fields[0].raw, futureRule: 'keep me' }],
    });
    const saved = w.act((c) => c.saveCategory('location', () => ({ name: 'Places' })));
    expect(saved.raw['futureSetting']).toEqual({ x: 1 });
    w.act((c) => c.saveCategory('location', (current) => ({ fields: current!.fields.map((f) => f.raw) })));
    expect(w.category('location').fields[0].raw['futureRule']).toBe('keep me');
  });

  test('fields of one entry alone sit beside the category’s fields, and empty rows are dropped', () => {
    const w = new Codex();
    const keep = w.act((c) => c.createEntry('location', 'The Keep'));
    w.act((c) => c.setFieldValue(keep.id, 'builtin-location-0', 'Fortress'));
    w.act((c) =>
      c.setOwnFields(keep.id, [
        { id: 'o1', key: 'Motto', value: 'Hold' },
        { id: 'o2', key: 'Rank', value: 'S', type: 'select', options: ['A', 'S', 'S'] },
        { id: 'o3', key: '', value: '' },
      ]),
    );
    const view = viewFields(w.entry(keep.id), w.category('location'));
    expect(view.own.map((f) => f.raw)).toEqual([
      { id: 'o1', key: 'Motto', value: 'Hold' },
      { id: 'o2', key: 'Rank', value: 'S', type: 'select', options: ['A', 'S'] },
    ]);
    expect(view.category[0][1]?.value).toBe('Fortress'); // untouched by edits to the entry’s own fields
  });

  test('a link’s status is set by the author and kept on the link', () => {
    const w = new Codex();
    const a = w.act((c) => c.createEntry('location', 'A'));
    const b = w.act((c) => c.createEntry('faction', 'B'));
    const link = w.act((c) => c.linkEntries(a.id, b.id, 'Seat of'));
    w.act((c) => c.setLinkCanon(link.id, 'conflicting'));
    expect(w.snapshot.rows('loreLinks').map((l) => l['canon'])).toEqual(['conflicting']);
    refused(() => w.act((c) => c.linkEntries(b.id, a.id)));
  });

  test('an entry’s own fields are replaced by id, from the canon tests', () => {
    const w = new Codex();
    const mira = w.act((c) => c.createEntry('character', 'Mira')).id;
    w.act((c) => c.setOwnFields(mira, [{ id: 'age', key: 'Age', value: '19', type: 'text' }]));
    const fields = maps(w.snapshot.rows('loreEntries')[0]['fields']);
    expect(fields.map((f) => [str(f['id']), f['value']])).toEqual([['age', '19']]);
  });
});

test('a refusal reads as its reason', () => {
  const e = new ChangeRefused('That link no longer exists.');
  expect(e.name).toBe('ChangeRefused');
  expect(`${e}`).toBe('That link no longer exists.');
  expect(e).toBeInstanceOf(Error);
});
