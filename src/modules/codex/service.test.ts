import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { PRESETS } from './presets';
import { displayValue, filledFields, viewFields } from './schema';
import { createCodexService, createTemplateService, registerCodex, relatedTo, type CodexService, type ProjectCodex } from './service';
import { SUGGESTED_FIELDS } from './types';

// Characters ship with no shared fields (their profile's sections shape them). These tests are about how any
// category's field set behaves, and use Characters with a starting set of four as the example throughout.
SUGGESTED_FIELDS.character = ['Appearance', 'Personality', 'Backstory', 'Goals'];

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let codex: CodexService;

beforeEach(() => {
  db = new NovelDB(`codex-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  manuscript = createManuscriptService(db, projects.contentChanged);
  codex = createCodexService(db, projects.contentChanged);
});

const related = async (c: ProjectCodex, id: string) =>
  relatedTo(id, await c.list(), await c.links()).map((r) => `${r.entry.name}${r.label ? ` (${r.label})` : ''}`);

async function world() {
  const p = await projects.create({ title: 'P' });
  const c = codex.forProject(p.id);
  const mira = await c.create('character', 'Mira Vale');
  const guild = await c.create('faction', 'Ash Guild');
  const blade = await c.create('item', 'Emberfang');
  return { p, c, mira, guild, blade };
}

describe('entries', () => {
  it('creates an entry in each category with editable starter fields', async () => {
    const p = await projects.create({ title: 'P' });
    const c = codex.forProject(p.id);
    const character = await c.create('character');
    expect(character).toMatchObject({ name: 'New character', category: 'character', summary: '', tags: [], image: null });
    expect(character.fields).toEqual([]); // nothing stored until the author writes something…
    const [characters] = await c.categories();
    expect(viewFields(character, characters).category.map((slot) => slot.def.name)).toEqual(['Appearance', 'Personality', 'Backstory', 'Goals']); // …but the category's fields are there to fill in
    for (const category of ['location', 'faction', 'item', 'power', 'lore'] as const) {
      expect((await c.create(category, 'X')).category).toBe(category);
    }
    await expect(c.create('spaceship' as never)).rejects.toThrow('Unknown category');
    // The character is the Character Library's to count, not the Codex's.
    expect(await projects.getStats(p.id)).toMatchObject({ counts: { 'codex entries': 5 } });
  });

  it('saves every metadata field, custom fields and tags exactly', async () => {
    const { c, mira } = await world();
    await c.update(mira.id, {
      name: '  Mira  Vale ',
      category: 'character',
      summary: 'A runaway fire-mage.',
      description: 'Line one.\n\n  Indented line two.',
      image: 'https://example.com/mira.png',
      notes: 'Dies in book 3?',
      tags: ['protagonist', ' mage ', 'protagonist', ''],
      fields: [
        { id: 'f1', key: ' Power Rank ', value: 'B+' },
        { id: 'f2', key: 'Affixes', value: 'Burning\nSwift' },
        { id: 'f3', key: '', value: '   ' },
        { id: 'f4', key: 'Element', value: '' },
      ],
    });
    const saved = (await c.get(mira.id))!;
    expect(saved).toMatchObject({
      name: 'Mira  Vale',
      summary: 'A runaway fire-mage.',
      description: 'Line one.\n\n  Indented line two.',
      image: 'https://example.com/mira.png',
      notes: 'Dies in book 3?',
      tags: ['protagonist', 'mage'],
    });
    expect(saved.fields).toEqual([
      { id: 'f1', key: 'Power Rank', value: 'B+' },
      { id: 'f2', key: 'Affixes', value: 'Burning\nSwift' },
      { id: 'f4', key: 'Element', value: '' },
    ]);

    // A fresh connection (a "session restart") reads the same thing back.
    db.close();
    const reopened = new NovelDB(db.name);
    expect(await reopened.loreEntries.get(mira.id)).toEqual(saved);
  });

  it('partial updates leave other fields alone, and bad values are ignored', async () => {
    const { c, mira } = await world();
    await c.update(mira.id, { summary: 'S', tags: ['a'] });
    await c.update(mira.id, { notes: 'N', category: 'nonsense' as never, image: 'javascript:alert(1)' });
    expect(await c.get(mira.id)).toMatchObject({ summary: 'S', tags: ['a'], notes: 'N', category: 'character', image: null, name: 'Mira Vale' });
  });
});

describe('links', () => {
  it('are bidirectional, with each side keeping its own wording', async () => {
    const { c, mira, guild, blade } = await world();
    const link = await c.link(mira.id, guild.id, 'member of');
    await c.link(blade.id, mira.id);
    await c.labelLink(link.id, guild.id, 'recruit');

    expect(await related(c, mira.id)).toEqual(['Ash Guild (member of)', 'Emberfang']);
    expect(await related(c, guild.id)).toEqual(['Mira Vale (recruit)']);
    expect(await related(c, blade.id)).toEqual(['Mira Vale']);
  });

  it('rejects self-links, duplicates in either direction, and missing entries', async () => {
    const { c, mira, guild } = await world();
    await c.link(mira.id, guild.id);
    await expect(c.link(mira.id, mira.id)).rejects.toThrow('itself');
    await expect(c.link(mira.id, guild.id)).rejects.toThrow('already linked');
    await expect(c.link(guild.id, mira.id)).rejects.toThrow('already linked');
    await expect(c.link(mira.id, 'nope')).rejects.toThrow('not found');
    expect(await c.links()).toHaveLength(1);
  });

  it('unlinking removes it from both sides and changes neither entry', async () => {
    const { c, mira, guild } = await world();
    const before = [await c.get(mira.id), await c.get(guild.id)];
    const link = await c.link(mira.id, guild.id, 'member');
    await c.unlink(link.id);
    expect(await related(c, mira.id)).toEqual([]);
    expect(await related(c, guild.id)).toEqual([]);
    expect([await c.get(mira.id), await c.get(guild.id)]).toEqual(before);
  });

  it('deleting an entry removes its links and leaves the others intact', async () => {
    const { c, mira, guild, blade } = await world();
    await c.update(guild.id, { summary: 'Mercenaries', fields: [{ id: 'x', key: 'Leader', value: 'Orrin' }] });
    await c.link(mira.id, guild.id, 'member');
    await c.link(blade.id, mira.id, 'wielded by');
    await c.link(guild.id, blade.id, 'forged');
    const guildBefore = await c.get(guild.id);
    const bladeBefore = await c.get(blade.id);

    await c.remove(mira.id);

    expect(await c.get(mira.id)).toBeUndefined();
    expect(await c.get(guild.id)).toEqual(guildBefore);
    expect(await c.get(blade.id)).toEqual(bladeBefore);
    expect(await related(c, guild.id)).toEqual(['Emberfang (forged)']);
    expect(await c.links()).toHaveLength(1);
    expect(await db.loreLinks.count()).toBe(1); // no dangling rows
  });
});

describe('reference isolation', () => {
  it('codex changes never touch manuscript text', async () => {
    const { p, c, mira, guild } = await world();
    const m = manuscript.forProject(p.id);
    const chapter = await m.create('chapter');
    const text = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mira Vale walked into the Ash Guild.' }] }] };
    await m.saveDoc(chapter.id, text, { words: 7, characters: 36 });
    const snapshot = async () => JSON.stringify([await db.chapters.toArray(), await db.chapterContents.toArray(), await db.chapterDrafts.toArray(), await db.chapterRevisions.toArray()]);
    const before = await snapshot();

    await c.update(mira.id, { name: 'Mira Ashborne', description: 'Renamed entirely.', tags: ['x'] });
    await c.link(mira.id, guild.id, 'member');
    await c.create('lore', 'The Burning');
    await c.remove(guild.id);

    expect(await snapshot()).toBe(before);
    expect(await m.loadDoc(chapter.id)).toEqual(text);
    expect((await m.openDoc(chapter.id)).rev).toBe(1);
  });

  it("cannot read, edit or link another project's entries", async () => {
    const { c, mira } = await world();
    const other = codex.forProject((await projects.create({ title: 'Other' })).id);
    const theirs = await other.create('character', 'Stranger');

    expect((await other.list()).map((e) => e.name)).toEqual(['Stranger']);
    expect(await other.get(mira.id)).toBeUndefined();
    await expect(other.update(mira.id, { name: 'Hacked' })).rejects.toThrow('not found');
    await expect(other.remove(mira.id)).rejects.toThrow('not found');
    await expect(other.link(theirs.id, mira.id)).rejects.toThrow('not found');
    await expect(c.link(mira.id, theirs.id)).rejects.toThrow('not found');
    const link = await c.link(mira.id, (await c.list()).find((e) => e.name === 'Ash Guild')!.id);
    await expect(other.unlink(link.id)).rejects.toThrow('no longer exists');
    await expect(other.labelLink(link.id, mira.id, 'x')).rejects.toThrow('no longer exists');
    expect((await c.get(mira.id))!.name).toBe('Mira Vale');
  });

  it('project duplicate, backup/restore and delete carry entries and links', async () => {
    const { p, c, mira, guild } = await world();
    await c.update(mira.id, { tags: ['protagonist'], fields: [{ id: 'f', key: 'Power Rank', value: 'B' }] });
    await c.link(mira.id, guild.id, 'member');

    const copy = await projects.duplicate(p.id);
    const cc = codex.forProject(copy.id);
    const copiedMira = (await cc.list()).find((e) => e.name === 'Mira Vale')!;
    expect(copiedMira.id).not.toBe(mira.id);
    expect(copiedMira).toMatchObject({ tags: ['protagonist'], fields: [{ key: 'Power Rank', value: 'B' }] });
    expect(await related(cc, copiedMira.id)).toEqual(['Ash Guild (member)']);
    // The copy's links point at the copy's entries, not the original's.
    const originalIds = new Set((await c.list()).map((e) => e.id));
    expect((await cc.links()).some((l) => originalIds.has(l.fromId) || originalIds.has(l.toId))).toBe(false);

    const file = JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id)));
    expect(file.collections.loreEntries).toHaveLength(3);
    const imported = codex.forProject((await projects.importSnapshot(file)).id);
    expect(await related(imported, (await imported.list()).find((e) => e.name === 'Ash Guild')!.id)).toEqual(['Mira Vale']);

    await projects.remove(p.id);
    expect(await c.list()).toEqual([]);
    expect(await db.loreLinks.where('projectId').equals(p.id).count()).toBe(0);
    expect(await cc.list()).toHaveLength(3);
  });
});

describe('custom fields, categories and templates', () => {
  const names = async (c: ProjectCodex) => (await c.categories()).map((x) => x.name);
  const fieldNames = async (c: ProjectCodex, key: string) => (await c.categories()).find((x) => x.key === key)!.fields.map((f) => `${f.name}${f.archived ? ' (archived)' : ''}:${f.type}`);
  const category = async (c: ProjectCodex, key: string) => (await c.categories()).find((x) => x.key === key)!;

  it('starts with the six built-in categories and their default fields, storing nothing', async () => {
    const { p, c } = await world();
    expect(await names(c)).toEqual(['Characters', 'Locations', 'Factions & Species', 'Items & Artifacts', 'Power Systems & Rules', 'Lore & History']);
    expect(await fieldNames(c, 'location')).toEqual(['Type:longtext', 'Region:longtext', 'Notable features:longtext']);
    expect(await db.loreSchemas.where('projectId').equals(p.id).count()).toBe(0);
  });

  it('adds typed fields to a built-in category and stores a value of every type', async () => {
    const { c, mira, guild } = await world();
    const characters = await category(c, 'character');
    const saved = await c.saveCategory('character', {
      fields: [
        ...characters.fields,
        { id: 'class', name: ' Class ', type: 'text', options: [] },
        { id: 'bio', name: 'Bio', type: 'longtext', options: [] },
        { id: 'level', name: 'Level', type: 'number', options: [] },
        { id: 'rank', name: 'Power Level', type: 'select', options: ['B-Rank', 'A-Rank', 'S-Rank', 'S-Rank', ' '] },
        { id: 'elements', name: 'Elements', type: 'multiselect', options: ['Fire', 'Ash', 'Void'] },
        { id: 'alive', name: 'Alive', type: 'toggle', options: [] },
        { id: 'born', name: 'Born', type: 'date', options: [] },
        { id: 'guild', name: 'Guild', type: 'reference', options: [] },
        { id: 'odd', name: '', type: 'hologram' as never, options: [] },
      ],
    });
    expect(saved.fields.slice(4).map((f) => `${f.name}:${f.type}`)).toEqual(['Class:text', 'Bio:longtext', 'Level:number', 'Power Level:select', 'Elements:multiselect', 'Alive:toggle', 'Born:date', 'Guild:reference', 'Untitled field:text']);
    expect(saved.fields.find((f) => f.id === 'rank')!.options).toEqual(['B-Rank', 'A-Rank', 'S-Rank']);

    for (const [id, value] of [['class', 'Void Mage'], ['bio', 'Line one.\n  Line two.'], ['level', '42'], ['rank', 'S-Rank'], ['elements', 'Fire\nVoid'], ['alive', 'yes'], ['born', '1000-03-01'], ['guild', guild.id]]) {
      await c.setFieldValue(mira.id, id, value);
    }
    const entry = (await c.get(mira.id))!;
    const nameOf = (id: string) => (id === guild.id ? 'Ash Guild' : undefined);
    expect(filledFields(entry, await category(c, 'character'), nameOf).map((f) => `${f.label}: ${f.text}`)).toEqual([
      'Class: Void Mage', 'Bio: Line one.\n  Line two.', 'Level: 42', 'Power Level: S-Rank', 'Elements: Fire, Void', 'Alive: Yes', 'Born: 1000-03-01', 'Guild: Ash Guild',
    ]);
    expect(displayValue({ type: 'toggle', value: 'no' }, nameOf)).toBe('No');
    expect(displayValue({ type: 'reference', value: 'gone' }, nameOf)).toBe('');
    await expect(c.setFieldValue(mira.id, 'not-a-field', 'x')).rejects.toThrow('not part of this category');

    db.close(); // values and their types survive a restart
    expect(await new NovelDB(db.name).loreEntries.get(mira.id)).toEqual(entry);
  });

  it('quick edits to different fields never overwrite each other', async () => {
    const { c, mira } = await world();
    const [a, b, d] = (await category(c, 'character')).fields;
    await Promise.all([c.setFieldValue(mira.id, a.id, 'one'), c.setFieldValue(mira.id, b.id, 'two'), c.setFieldValue(mira.id, d.id, 'three'), c.setOwnFields(mira.id, [{ id: 'x', key: 'Motive', value: 'Revenge' }])]);
    await c.setFieldValue(mira.id, a.id, 'one, edited');
    const view = viewFields((await c.get(mira.id))!, await category(c, 'character'));
    expect(view.category.map((slot) => slot.field?.value ?? '')).toEqual(['one, edited', 'two', 'three', '']);
    expect(view.own).toMatchObject([{ key: 'Motive', value: 'Revenge' }]);
  });

  it('fields belonging to one entry can be of any type, alongside the category\'s fields', async () => {
    const { c, mira } = await world();
    await c.setFieldValue(mira.id, 'builtin-character-0', 'Copper hair');
    await c.setOwnFields(mira.id, [
      { id: 'o1', key: 'Motive', value: 'Revenge' },
      { id: 'o2', key: 'Rank', value: 'S-Rank', type: 'select', options: ['A-Rank', 'S-Rank'] },
      { id: 'o3', key: '', value: '' },
    ]);
    await c.setOwnFields(mira.id, [{ id: 'o2', key: 'Rank', value: 'A-Rank', type: 'select', options: ['A-Rank', 'S-Rank'] }]);
    const view = viewFields((await c.get(mira.id))!, await category(c, 'character'));
    expect(view.own).toEqual([{ id: 'o2', key: 'Rank', value: 'A-Rank', type: 'select', options: ['A-Rank', 'S-Rank'] }]);
    expect(view.category[0].field?.value).toBe('Copper hair'); // untouched by edits to the entry's own fields
  });

  it('values written before the field set existed are adopted by name, not duplicated', async () => {
    const { c, mira } = await world();
    await c.update(mira.id, { fields: [{ id: 'old1', key: 'appearance', value: 'Copper hair' }, { id: 'old2', key: 'Power Rank', value: 'B+' }] }); // a Phase 5 entry
    let view = viewFields((await c.get(mira.id))!, await category(c, 'character'));
    expect(view.category[0]).toMatchObject({ def: { name: 'Appearance' }, field: { id: 'old1', value: 'Copper hair' } });
    expect(view.own.map((f) => f.key)).toEqual(['Power Rank']);

    await c.setFieldValue(mira.id, 'builtin-character-0', 'Copper hair, burn scars');
    view = viewFields((await c.get(mira.id))!, await category(c, 'character'));
    expect((await c.get(mira.id))!.fields).toHaveLength(2);
    expect(view.category[0].field).toMatchObject({ id: 'old1', value: 'Copper hair, burn scars', defId: 'builtin-character-0' });
  });

  it('NON-DESTRUCTIVE: renaming, retyping, reordering and removing fields never loses a value', async () => {
    const { c, mira } = await world();
    const before = await category(c, 'character');
    const [appearance, personality, backstory, goals] = before.fields;
    await c.setFieldValue(mira.id, appearance.id, 'Copper hair');
    await c.setFieldValue(mira.id, personality.id, 'Guarded');
    await c.setFieldValue(mira.id, goals.id, '12');
    const stored = async () => Object.fromEntries((await c.get(mira.id))!.fields.map((f) => [f.defId, f.value]));
    const values = await stored();

    // Rename, retype, reorder; and leave "Personality" out entirely.
    await c.saveCategory('character', { fields: [{ ...goals, name: 'Ambition', type: 'number' }, { ...appearance, name: 'Looks' }, backstory] });
    expect(await fieldNames(c, 'character')).toEqual(['Ambition:number', 'Looks:longtext', 'Backstory:longtext', 'Personality (archived):longtext']);
    expect(await stored()).toEqual(values); // not one stored value changed

    let view = viewFields((await c.get(mira.id))!, await category(c, 'character'));
    expect(view.category.map((slot) => `${slot.def.name}=${slot.field?.value ?? ''}`)).toEqual(['Ambition=12', 'Looks=Copper hair', 'Backstory=']);
    expect(view.archived.map((a) => `${a.def.name}=${a.field.value}`)).toEqual(['Personality=Guarded']);
    expect(view.own).toEqual([]);

    // Editing the entry's other fields leaves the archived value alone; restoring the field brings it back.
    await c.setOwnFields(mira.id, [{ id: 'n', key: 'Note', value: 'x' }]);
    await c.setFieldValue(mira.id, goals.id, '13');
    const current = await category(c, 'character');
    await c.saveCategory('character', { fields: current.fields.map((f) => ({ ...f, archived: false })) });
    view = viewFields((await c.get(mira.id))!, await category(c, 'character'));
    expect(view.category.find((slot) => slot.def.name === 'Personality')!.field!.value).toBe('Guarded');
    expect(view.archived).toEqual([]);

    // A value that does not fit a new type is kept as written until the author changes it.
    await c.saveCategory('character', { fields: (await category(c, 'character')).fields.map((f) => (f.id === appearance.id ? { ...f, type: 'number' } : f)) });
    expect((await stored())[appearance.id]).toBe('Copper hair');
  });

  it('quick changes to a field set build on each other', async () => {
    const { c } = await world();
    const [appearance, personality] = (await category(c, 'character')).fields;
    // Rename one field, add another, move a third and archive a fourth, all at once.
    await Promise.all([
      c.saveCategory('character', (stored) => ({ fields: stored.fields.map((f) => (f.id === appearance.id ? { ...f, name: 'Looks' } : f)) })),
      c.saveCategory('character', (stored) => ({ fields: [...stored.fields, { id: 'new', name: 'Motive', type: 'text', options: [] }] })),
      c.saveCategory('character', (stored) => ({ fields: [stored.fields[1], stored.fields[0], ...stored.fields.slice(2)] })),
      c.saveCategory('character', (stored) => ({ fields: stored.fields.map((f) => (f.name === 'Goals' ? { ...f, archived: true } : f)) })),
      c.saveCategory('character', (stored) => ({ name: `${stored.name}!` })),
    ]);
    expect(await fieldNames(c, 'character')).toEqual(['Personality:longtext', 'Looks:longtext', 'Backstory:longtext', 'Goals (archived):longtext', 'Motive:text']);
    expect((await category(c, 'character')).name).toBe('Characters!');
    expect(personality.name).toBe('Personality');
  });

  it('creates custom categories with their own fields, and entries in them', async () => {
    const { p, c, mira } = await world();
    const kingdoms = await c.saveCategory(null, { name: ' Kingdoms ', singular: 'Kingdom', fields: [{ id: 'pop', name: 'Population', type: 'number', options: [] }, { id: 'gov', name: 'Government Type', type: 'select', options: ['Monarchy', 'Republic'] }, { id: 'mon', name: 'Monarch', type: 'reference', options: [] }] });
    expect(kingdoms).toMatchObject({ name: 'Kingdoms', singular: 'Kingdom', builtin: false });
    expect(kingdoms.key).toMatch(/^custom-/);
    await expect(c.saveCategory(null, { name: 'kingdoms' })).rejects.toThrow('already a category');
    await expect(c.saveCategory(null, { name: '  ' })).rejects.toThrow('name');
    await expect(c.saveCategory('nope', { name: 'X' })).rejects.toThrow('Unknown category');

    const aldmoor = await c.create(kingdoms.key);
    expect(aldmoor).toMatchObject({ name: 'New kingdom', category: kingdoms.key });
    await c.setFieldValue(aldmoor.id, 'pop', '120000');
    await c.setFieldValue(aldmoor.id, 'mon', mira.id);
    expect(filledFields((await c.get(aldmoor.id))!, await category(c, kingdoms.key), () => 'Mira Vale').map((f) => `${f.label}: ${f.text}`)).toEqual(['Population: 120000', 'Monarch: Mira Vale']);
    expect(await names(c)).toEqual(['Characters', 'Locations', 'Factions & Species', 'Items & Artifacts', 'Power Systems & Rules', 'Lore & History', 'Kingdoms']);
    expect(await projects.getStats(p.id)).toMatchObject({ counts: { 'codex entries': 3 } }); // Mira is a character, counted with the cast

    // An entry can move between categories; values it cannot place stay on the entry.
    await c.update(aldmoor.id, { category: 'location' });
    expect(viewFields((await c.get(aldmoor.id))!, await category(c, 'location')).own.map((f) => `${f.key}=${f.value}`)).toEqual(['Population=120000', `Monarch=${mira.id}`]);
    await c.update(aldmoor.id, { category: 'made-up' });
    expect((await c.get(aldmoor.id))!.category).toBe('location');
  });

  it('archiving a category keeps its entries; built-ins cannot be archived', async () => {
    const { c } = await world();
    const ships = await c.saveCategory(null, { name: 'Starships' });
    const ship = await c.create(ships.key, 'Kestrel');
    await c.saveCategory(ships.key, { archived: true });
    expect((await category(c, ships.key)).archived).toBe(true);
    expect((await c.get(ship.id))!.name).toBe('Kestrel');
    await expect(c.create(ships.key)).rejects.toThrow('archived');
    await c.saveCategory(ships.key, { archived: false });
    expect((await c.create(ships.key)).category).toBe(ships.key);
    await c.saveCategory('character', { archived: true });
    expect((await category(c, 'character')).archived).toBeUndefined();
  });

  it('saves a project\'s structure as a template and applies it to a new project', async () => {
    const { c } = await world();
    const templates = createTemplateService(db);
    await c.saveCategory('character', { fields: [...(await category(c, 'character')).fields, { id: 'rank', name: 'Power Level', type: 'select', options: ['A', 'S'] }, { id: 'gone', name: 'Dropped', type: 'text', options: [], archived: true }] });
    const kingdoms = await c.saveCategory(null, { name: 'Kingdoms', singular: 'Kingdom', color: '#123456', fields: [{ id: 'pop', name: 'Population', type: 'number', options: [] }] });
    await c.saveCategory(null, { name: 'Retired', archived: true });
    await c.create(kingdoms.key, 'Aldmoor'); // entries are not part of a template

    const saved = await templates.save(' My Fantasy Bible ', 'For the trilogy', await c.schemaSnapshot());
    await expect(templates.save(' ', '', await c.schemaSnapshot())).rejects.toThrow('name');
    expect((await templates.list()).map((t) => t.name)).toEqual(['My Fantasy Bible']);
    expect(JSON.stringify(saved)).not.toContain('Aldmoor');
    expect(saved.categories.map((x) => x.name)).not.toContain('Retired');

    const fresh = codex.forProject((await projects.create({ title: 'Book Two' })).id);
    await fresh.applyTemplate(saved);
    expect(await names(fresh)).toEqual(['Characters', 'Locations', 'Factions & Species', 'Items & Artifacts', 'Power Systems & Rules', 'Lore & History', 'Kingdoms']);
    expect(await fieldNames(fresh, 'character')).toEqual(['Appearance:longtext', 'Personality:longtext', 'Backstory:longtext', 'Goals:longtext', 'Power Level:select']);
    const copied = (await fresh.categories()).find((x) => x.name === 'Kingdoms')!;
    expect(copied).toMatchObject({ singular: 'Kingdom', color: '#123456', fields: [{ name: 'Population', type: 'number' }] });
    expect(copied.key).not.toBe(kingdoms.key); // its own category, not a shared one
    expect(await fresh.list()).toEqual([]);

    await templates.remove(saved.id);
    expect(await templates.list()).toEqual([]);
    expect(await names(fresh)).toContain('Kingdoms'); // deleting a template changes no project
  });

  it('applying a template only ever adds; applying it twice changes nothing more', async () => {
    const { c, mira } = await world();
    await c.setFieldValue(mira.id, 'builtin-character-0', 'Copper hair');
    await c.saveCategory('character', { fields: [...(await category(c, 'character')).fields, { id: 'mine', name: 'power rank', type: 'text', options: [] }] });
    await c.setFieldValue(mira.id, 'mine', 'B+');
    const preset = PRESETS.find((x) => x.id === 'preset-progression-fantasy')!;

    await c.applyTemplate(preset);
    const once = JSON.stringify(await c.categories());
    await c.applyTemplate(preset);
    expect(JSON.stringify(await c.categories())).toBe(once);

    expect(await names(c)).toEqual(['Characters', 'Locations', 'Factions & Species', 'Items & Artifacts', 'Power Systems & Rules', 'Lore & History', 'Skills & Abilities', 'Cultivation Stages', 'Guilds & Sects']);
    expect(await fieldNames(c, 'character')).toEqual(['Appearance:longtext', 'Personality:longtext', 'Backstory:longtext', 'Goals:longtext', 'power rank:text', 'Elements:multiselect', 'Affixes:longtext', 'Current stage:reference']);
    const view = viewFields((await c.get(mira.id))!, await category(c, 'character'));
    expect(view.category.filter((slot) => slot.field).map((slot) => `${slot.def.name}=${slot.field!.value}`)).toEqual(['Appearance=Copper hair', 'power rank=B+']); // the author's own field and values untouched
    for (const each of PRESETS) expect(each.categories.length).toBeGreaterThanOrEqual(3);
  });

  it('schemas are per project and travel with it; a linked entry follows the copy', async () => {
    const { p, c, mira, guild } = await world();
    await c.saveCategory('character', { fields: [...(await category(c, 'character')).fields, { id: 'g', name: 'Guild', type: 'reference', options: [] }] });
    await c.setFieldValue(mira.id, 'g', guild.id);
    const ships = await c.saveCategory(null, { name: 'Starships' });
    await c.create(ships.key, 'Kestrel');

    const other = codex.forProject((await projects.create({ title: 'Other' })).id);
    expect(await names(other)).not.toContain('Starships');
    await expect(other.create(ships.key)).rejects.toThrow('Unknown category');
    await expect(other.saveCategory(ships.key, { name: 'Hijacked' })).rejects.toThrow('Unknown category');

    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))))).id]) {
      const copy = codex.forProject(projectId);
      const entries = await copy.list();
      expect(await names(copy)).toContain('Starships');
      expect(entries.find((e) => e.name === 'Kestrel')!.category).toBe(ships.key);
      const copiedMira = entries.find((e) => e.name === 'Mira Vale')!;
      const copiedGuild = entries.find((e) => e.name === 'Ash Guild')!;
      expect(copiedGuild.id).not.toBe(guild.id);
      expect(filledFields(copiedMira, (await copy.categories())[0], (id) => entries.find((e) => e.id === id)?.name).map((f) => `${f.label}: ${f.text}`)).toEqual(['Guild: Ash Guild']);
    }
    await projects.remove(p.id);
    expect(await db.loreSchemas.where('projectId').equals(p.id).count()).toBe(0);
  });
});

