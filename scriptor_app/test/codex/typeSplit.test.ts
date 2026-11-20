// The four merged types split into eight (faction/species, item/artifact, power/rule, lore/history): the ten
// built-ins, the names kept or shown anew, sorting existing entries, new entries, and the quick New entry sheet.

import { ChangeRefused, CodexChanges } from '../../src/domain/codex/codexChanges';
import { entriesToSort, keepRest, keepType, moveType, partnerOf } from '../../src/domain/codex/sortTypes';
import { newEntryWith, quickFields } from '../../src/domain/codex/screens/world';
import { typePresets } from '../../src/domain/codex/typePresets';
import type { JsonMap } from '../../src/domain/json';
import { Category, resolveCategories } from '../../src/domain/records/category';
import { viewFields } from '../../src/domain/records/entry';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';

class Book {
  snapshot: NovelSnapshot;
  private n = 0;
  constructor(collections: Record<string, JsonMap[]> = {}) {
    this.snapshot = new NovelSnapshot({ project: { id: 'novel', title: 'World' }, collections });
  }
  act<T>(f: (c: CodexChanges) => T): T {
    const c = new CodexChanges(this.snapshot, { now: 2000, createId: () => `id${++this.n}` });
    const r = f(c);
    this.snapshot = c.snapshot;
    return r;
  }
  cats() {
    return this.act((c) => c.categories());
  }
  entry(id: string) {
    return this.act((c) => c.owned(id));
  }
  all() {
    return this.snapshot.rows('loreEntries').map((r) => this.entry(r['id'] as string));
  }
}

const row = (key: string, name: string, singular: string): JsonMap => ({ ...Category.builtin(key).raw, name, singular });
const sp = () => typePresets.find((p) => p.id === 'species')!.categories;

describe('the ten built-in types', () => {
  test('resolve in paired order with their own names, colours and unchanged first fields', () => {
    const all = resolveCategories([]);
    expect(all.map((c) => c.key)).toEqual([
      'character', 'location', 'faction', 'species', 'item', 'artifact', 'power', 'rule', 'lore', 'history',
    ]);
    expect(all.map((c) => c.name)).toEqual([
      'Characters', 'Locations', 'Factions', 'Species', 'Items', 'Artifacts', 'Powers', 'Rules', 'Lore', 'History',
    ]);
    expect(all.slice(0, 3).map((c) => c.order)).toEqual([0, 1, 2]);
    expect(Category.builtin('item').order).toBe(3);
    expect(Category.builtin('power').order).toBe(4);
    expect(Category.builtin('lore').order).toBe(5);
    for (const [a, b] of [['faction', 'species'], ['item', 'artifact'], ['power', 'rule'], ['lore', 'history']]) {
      expect(Category.builtin(a).color).not.toBe(Category.builtin(b).color);
    }
    const first = (k: string) => Category.builtin(k).fields.slice(0, 3).map((f) => [f.id, f.name, f.type]);
    expect(first('faction')).toEqual([
      ['builtin-faction-0', 'Type', 'longtext'],
      ['builtin-faction-1', 'Leader', 'longtext'],
      ['builtin-faction-2', 'Goals', 'longtext'],
    ]);
    expect(first('item').map((f) => f[0])).toEqual(['builtin-item-0', 'builtin-item-1', 'builtin-item-2']);
    expect(first('power').map((f) => f[1])).toEqual(['Rules', 'Costs & limits', 'Tiers']);
    expect(first('lore').map((f) => f[1])).toEqual(['When', 'Who was involved', 'Consequences']);
  });

  test('the new ones have typed fields, with links aimed at a kind', () => {
    const species = Category.builtin('species').fields;
    expect(species.map((f) => [f.name, f.type, f.target])).toEqual([
      ['Lifespan', 'text', null],
      ['Homeland', 'reference', 'location'],
      ['Sapient', 'toggle', null],
      ['Traits', 'tags', null],
      ['Abilities', 'longtext', null],
    ]);
    expect(Category.builtin('artifact').fields.find((f) => f.name === 'Rank')!.options).toContain('Legendary');
    expect(Category.builtin('history').fields.find((f) => f.name === 'Who was involved')!.type).toBe('references');
    expect(Category.builtin('rule').fields.map((f) => f.name)).toEqual([
      'Applies to', 'What it says', 'Exceptions', 'Cost of breaking it',
    ]);
  });

  test('a stored row with the old merged name shows the new one; a name the author typed stays; nothing is rewritten', () => {
    const stored = [
      new Category(row('faction', 'Factions & Species', 'Faction / Species')),
      new Category(row('item', 'My Things', 'Faction / Species')),
      new Category(row('lore', 'Lore & History', 'Chronicle')),
    ];
    const all = resolveCategories(stored);
    const get = (k: string) => all.find((c) => c.key === k)!;
    expect([get('faction').name, get('faction').singular]).toEqual(['Factions', 'Faction']);
    expect([get('item').name, get('item').singular]).toEqual(['My Things', 'Faction / Species']);
    expect([get('lore').name, get('lore').singular]).toEqual(['Lore', 'Chronicle']);
    expect(stored[0].name).toBe('Factions & Species');
    const book = new Book({ loreSchemas: [row('faction', 'Factions & Species', 'Faction / Species')] });
    book.cats();
    expect(book.snapshot.rows('loreSchemas')[0]['name']).toBe('Factions & Species');
  });

  test('applying the Species preset now finds the built-in rather than adding a second', () => {
    const book = new Book();
    book.act((c) => c.addKinds(sp()));
    expect(book.cats().filter((c) => c.name === 'Species')).toHaveLength(1);
  });

  test('a category of the same name hides the new built-in, and stands in for it when sorting', () => {
    // A novel that applied the Species preset has it stored under its own key.
    const book = new Book({ loreSchemas: [...sp()] });
    const all = book.cats();
    expect(all.filter((c) => c.name === 'Species')).toHaveLength(1);
    expect(all.some((c) => c.key === 'species')).toBe(false);
    expect(partnerOf('faction', all)!.key).toBe('preset-species');
    expect(partnerOf('item', all)!.key).toBe('artifact');
    expect(partnerOf('character', all)).toBeNull();
    // Once the built-in is stored, it shows beside the author's own.
    const both = resolveCategories([...all, new Category(row('species', 'Species', 'Species'))]);
    expect(both.filter((c) => c.name === 'Species')).toHaveLength(2);
  });
});

describe('sorting entries made before the split', () => {
  test('lists unmarked entries of the first types only, by name, with a stay and a move choice', () => {
    const book = new Book({
      loreEntries: [
        { id: 'a', category: 'faction', name: 'Zed Guild', fields: [] },
        { id: 'b', category: 'item', name: 'Ash Key', fields: [] },
        { id: 'c', category: 'faction', name: 'Done', typeSorted: true, fields: [] },
        { id: 'd', category: 'species', name: 'Elves', fields: [] },
        { id: 'e', category: 'character', name: 'Mira', fields: [] },
      ],
    });
    const items = entriesToSort(book.all(), book.cats());
    expect(items.map((i) => i.entry.name)).toEqual(['Ash Key', 'Zed Guild']);
    expect(items[0].to.key).toBe('artifact');
    expect(items[0].choices.map((c) => c.action)).toEqual(['keep', 'move']);
    expect(items[1].choices[1].label).toBe('Move to Species');
  });

  test('keep marks and leaves it; keep the rest marks all', () => {
    const book = new Book({
      loreEntries: [
        { id: 'a', category: 'faction', name: 'A', fields: [] },
        { id: 'b', category: 'power', name: 'B', fields: [] },
        { id: 'c', category: 'lore', name: 'C', fields: [] },
      ],
    });
    book.act((c) => keepType(c, 'a'));
    expect(book.entry('a').typeSorted).toBe(true);
    expect(book.entry('a').category).toBe('faction');
    const left = entriesToSort(book.all(), book.cats());
    expect(left.map((i) => i.entry.id)).toEqual(['b', 'c']);
    book.act((c) => keepRest(c, left.map((i) => i.entry.id)));
    expect(entriesToSort(book.all(), book.cats())).toEqual([]);
    expect(['b', 'c'].map((i) => book.entry(i).category)).toEqual(['power', 'lore']);
  });

  test('move carries values into same-named fields; the rest stays on the entry as its own', () => {
    const book = new Book({ loreEntries: [{ id: 'v', category: 'lore', name: 'Burning of Vell', fields: [] }] });
    const [when, who, then] = book.cats().find((c) => c.key === 'lore')!.fields;
    book.act((c) => {
      c.setFieldValue('v', when.id, 'Year 3');
      c.setFieldValue('v', who.id, 'Ren and the harbour-folk');
      c.setFieldValue('v', then.id, 'The river was lost.');
      c.setOwnFields('v', [{ key: 'Mood', value: 'grim' }]);
    });
    const before = book.entry('v').fields.map((f) => f.value).sort();
    expect(before).toHaveLength(4);
    book.act((c) => moveType(c, 'v'));
    const moved = book.entry('v');
    expect([moved.category, moved.typeSorted]).toEqual(['history', true]);
    const view = viewFields(moved, book.cats().find((c) => c.key === 'history')!);
    const shown = Object.fromEntries(view.category.map(([d, f]) => [d.name, f?.value ?? null]));
    expect(shown).toEqual({ When: 'Year 3', 'Who was involved': null, Where: null, Consequences: 'The river was lost.' });
    expect(view.category.find(([d]) => d.name === 'When')![1]!.defId).toBe('builtin-history-0');
    // The people, typed as text, cannot go into a links field: kept beside it, named for where it came from.
    expect(view.own.map((f) => [f.key, f.value])).toEqual(
      expect.arrayContaining([['Who was involved (from Lore)', 'Ren and the harbour-folk'], ['Mood', 'grim']]),
    );
    expect(moved.fields.map((f) => f.value).sort()).toEqual(before);
  });

  test('move with nothing matching keeps every value as the entry\'s own', () => {
    const book = new Book({ loreEntries: [{ id: 'k', category: 'item', name: 'Ninth Key', fields: [] }] });
    const [type, owner] = book.cats().find((c) => c.key === 'item')!.fields;
    book.act((c) => {
      c.setFieldValue('k', type.id, 'key');
      c.setFieldValue('k', owner.id, 'Ren');
    });
    book.act((c) => moveType(c, 'k'));
    const view = viewFields(book.entry('k'), book.cats().find((c) => c.key === 'artifact')!);
    expect(view.category.every(([, f]) => f === null)).toBe(true);
    expect(view.own.map((f) => [f.key, f.value])).toEqual([['Type', 'key'], ['Owner', 'Ren']]);
  });

  test('move into the author\'s own same-named category, and refuse when there is nowhere to go', () => {
    const book = new Book({ loreEntries: [{ id: 'g', category: 'faction', name: 'Ash Guild', fields: [] }] });
    book.snapshot = new NovelSnapshot({
      project: { id: 'novel', title: 'World' },
      collections: { loreEntries: book.snapshot.rows('loreEntries'), loreSchemas: [...sp()] },
    });
    book.act((c) => moveType(c, 'g'));
    expect(book.entry('g').category).toBe('preset-species');
    const lone = new Book({ loreEntries: [{ id: 'x', category: 'character', name: 'Mira', fields: [] }] });
    expect(() => lone.act((c) => moveType(c, 'x'))).toThrow(ChangeRefused);
  });

  test('new entries in a first type are marked; in a newer type they need no mark; moving by hand marks', () => {
    const book = new Book();
    const f = book.act((c) => c.createEntry('faction', 'Guild'));
    const s = book.act((c) => c.createEntry('species', 'Elves'));
    expect([book.entry(f.id).typeSorted, book.entry(s.id).typeSorted]).toEqual([true, false]);
    const l = book.act((c) => c.createEntry('location', 'Vell'));
    book.act((c) => c.updateEntry(l.id, { category: 'item' }));
    expect(book.entry(l.id).typeSorted).toBe(true);
    expect(entriesToSort(book.all(), book.cats())).toEqual([]);
  });
});

describe('the quick New entry sheet', () => {
  test('asks for required fields first, then short ones, then long text, at most three', () => {
    expect(quickFields(Category.builtin('species')).map((f) => f.name)).toEqual(['Lifespan', 'Homeland', 'Sapient']);
    expect(quickFields(Category.builtin('rule')).map((f) => f.name)).toEqual(['Applies to', 'What it says', 'Exceptions']);
    expect(quickFields(Category.builtin('artifact')).map((f) => f.name)).toEqual(['Current holder', 'Rank', 'Cursed']);
    // Types whose fields are all long text still show their first ones.
    expect(quickFields(Category.builtin('faction')).map((f) => f.name)).toEqual(['Type', 'Leader', 'Goals']);
    expect(quickFields(Category.builtin('location')).map((f) => f.name)).toEqual(['Type', 'Region', 'Notable features']);
    const required = new Category({ key: 'k', name: 'K', fields: [{ id: 'a', name: 'A', type: 'longtext' }, { id: 'b', name: 'B', type: 'longtext', required: true }] });
    expect(quickFields(required).map((f) => f.name)).toEqual(['B', 'A']);
  });

  test('makes the entry with its name and values in one change, skipping blanks', () => {
    const book = new Book();
    const [lifespan, home, sapient] = quickFields(Category.builtin('species'));
    const made = book.act((c) =>
      newEntryWith(c, 'species', 'Tidefolk', { [lifespan.id]: '300 years', [home.id]: '  ', [sapient.id]: 'yes' }),
    );
    expect(made.name).toBe('Tidefolk');
    expect(book.entry(made.id).raw).toEqual(made.raw);
    expect(made.fields.map((f) => [f.defId, f.value])).toEqual([[lifespan.id, '300 years'], [sapient.id, 'yes']]);
    const again = book.act((c) => newEntryWith(c, 'species', 'Hillfolk', {}));
    expect(again.fields).toEqual([]);
    expect(book.snapshot.rows('loreEntries')).toHaveLength(2);
  });
});

describe('names never repeat', () => {
  const names = (all: readonly Category[]) => all.map((c) => c.name.toLowerCase());
  const unique = (all: readonly Category[]) => expect(new Set(names(all)).size).toBe(all.length);

  test('lore renamed "History" hides the new History, and has no partner', () => {
    const book = new Book({ loreSchemas: [row('lore', 'History', 'Event')] });
    const all = book.cats();
    unique(all);
    expect(all.some((c) => c.key === 'history')).toBe(false);
    expect(partnerOf('lore', all)).toBeNull();
    book.act((c) => c.saveCategory('lore', () => ({ color: '#111111' })));
  });

  test('factions renamed "Species" likewise', () => {
    const book = new Book({ loreSchemas: [row('faction', 'Species', 'Species')] });
    const all = book.cats();
    unique(all);
    expect(partnerOf('faction', all)).toBeNull();
    book.act((c) => c.saveCategory('faction', () => ({ color: '#111111' })));
  });

  test('a custom "Powers" keeps the original power under its old name', () => {
    const custom = { ...Category.builtin('power').raw, key: 'mine', name: 'Powers', singular: 'Power', builtin: false };
    const book = new Book({ loreSchemas: [custom] });
    const all = book.cats();
    unique(all);
    expect(all.find((c) => c.key === 'power')!.name).toBe('Power Systems & Rules');
    expect(all.find((c) => c.key === 'rule')!.name).toBe('Rules');
    for (const c of all) book.act((ch) => ch.saveCategory(c.key, () => ({ color: '#222222' })));
  });

  test('with no clash every type is savable and shows its new name', () => {
    const book = new Book();
    for (const c of book.cats()) book.act((ch) => ch.saveCategory(c.key, () => ({ color: '#333333' })));
    expect(book.cats().map((c) => c.name)).toContain('Powers');
  });
});

test('importing a fresh novel’s types into one whose “Species” is its own adds no second “Species”', () => {
  const fresh = new Book().act((c) => c.schemaSnapshot());
  expect(fresh.some((k) => k['key'] === 'species')).toBe(true);
  const book = new Book({ loreSchemas: [...sp()] });
  book.act((c) => c.addKinds(fresh));
  const all = book.cats();
  expect(all.filter((c) => c.name === 'Species')).toHaveLength(1);
  // Every type can still be saved.
  for (const c of all) book.act((x) => x.saveCategory(c.key, () => ({ color: c.color })));
});

test('a genre module’s “Species & Races” (a Species) stands in for the built-in Species: one Species chip, sorting moves there', () => {
  const races: JsonMap = { key: 'custom-races', name: 'Species & Races', singular: 'Species', color: '#a3622b', builtin: false, order: 20, fields: [] };
  const book = new Book({ loreSchemas: [races] });
  const all = book.cats();
  expect(all.filter((c) => c.singular === 'Species').map((c) => c.name)).toEqual(['Species & Races']);
  expect(partnerOf('faction', all)?.name).toBe('Species & Races');
  for (const c of all) book.act((x) => x.saveCategory(c.key, () => ({ color: c.color })));
});

test('a built-in with entries filed under it never hides, even where another type stands in for it', () => {
  const races: JsonMap = { key: 'custom-races', name: 'Species & Races', singular: 'Species', color: '#a3622b', builtin: false, order: 20, fields: [] };
  const book = new Book();
  const selkies = book.act((c) => c.createEntry('species', 'Selkies'));
  book.act((c) => c.saveCategory(null, () => ({ ...races, key: undefined })));
  const all = book.cats();
  expect(all.some((c) => c.key === 'species')).toBe(true);
  expect(book.act((c) => c.category(selkies.category)).name).toBe('Species');
  // Without entries the stand-in takes its place, as before.
  expect(new Book({ loreSchemas: [races] }).cats().some((c) => c.key === 'species')).toBe(false);
});
