import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createProjectService } from '@/modules/projects/service';
import { parse } from '@/modules/systems/formula';
import { createSystemsService, registerSystems } from '@/modules/systems/service';
import { BUILTIN_MODULES } from './builtin';
import { displayValue } from '@/modules/codex/schema';
import { arrangedTools } from './hooks';
import { buildLineage } from './lineage';
import { createExtensionService, deriveTools, parseDefinition, registerExtensions, resolveCategory, resolveField } from './service';

let n = 0;
function setup(name = `extensions-${++n}`) {
  const db = new NovelDB(name);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerSystems(registry);
  registerExtensions(registry);
  const manuscript = createManuscriptService(db, projects.contentChanged);
  const codex = createCodexService(db, projects.contentChanged);
  const systems = createSystemsService(db, projects.contentChanged);
  return { db, projects, manuscript, codex, systems, extensions: createExtensionService(db, codex, systems, projects.contentChanged) };
}
let app: ReturnType<typeof setup>;
beforeEach(() => {
  app = setup();
});

const BUILTIN_NAMES: Record<string, string> = { character: 'Characters', location: 'Locations', faction: 'Factions & Species', item: 'Items & Artifacts', power: 'Power Systems & Rules', lore: 'Lore & History' };

describe('the built-in modules', () => {
  it('are exactly the ten genres, each made only of data that reads back unchanged', () => {
    expect(BUILTIN_MODULES.map((m) => m.name)).toEqual([
      'Fantasy Worldbuilding', 'Progression Fantasy & LitRPG', 'Science Fiction & Space Exploration', 'Mystery, Detective & Investigation', 'Romance & Relationship Development',
      'Horror & Suspense', 'Superhero & Superpower', 'Historical Fiction', 'Contemporary Fiction & Social Dynamics', 'Political Intrigue, Factions & Power Structures',
    ]);
    expect(new Set(BUILTIN_MODULES.map((m) => m.id)).size).toBe(10);
    // Each says what it is on its card: a sidebar name, an icon, what it does and what it works with.
    for (const module of BUILTIN_MODULES) expect([Boolean(module.nav), Boolean(module.icon), module.features!.length >= 6, module.integrates!.length >= 5, module.tools.length >= 8], module.name).toEqual([true, true, true, true, true]);
    // None is an AI feature, and none holds a character, place or event of its own.
    expect(JSON.stringify(BUILTIN_MODULES.map((m) => [m.description, m.features, m.tools.map((t) => t.title)])).toLowerCase()).not.toMatch(/\bai\b|assistant|generat/);
    for (const module of BUILTIN_MODULES) expect(module.schema.categories.filter((c) => !c.builtin).map((c) => c.name), module.name).not.toEqual(expect.arrayContaining(['Characters']));
    for (const module of BUILTIN_MODULES) {
      const read = parseDefinition(JSON.parse(JSON.stringify(module)));
      // The system is tidied on the way in (which a preset already is); everything else is word for word.
      expect({ ...read, builtin: true, unlocks: module.unlocks }, module.name).toEqual(module);
      expect(new Set(module.tools.map((t) => t.id)).size, module.name).toBe(module.tools.length);
    }
  });

  it('only describe tools over categories and fields that exist once the module is on', async () => {
    for (const module of BUILTIN_MODULES) {
      const p = await app.projects.create({ title: module.name });
      await app.extensions.forProject(p.id).enable(module.id);
      const categories = await app.codex.forProject(p.id).categories();
      const fieldsOf = (name: string) => categories.find((c) => c.name === name)?.fields.map((f) => f.name);
      // Turning a module on creates no records of any kind: no entry, no system, no line in a log.
      expect([(await app.codex.forProject(p.id).list()).length, (await app.systems.forProject(p.id).list()).length, (await app.extensions.forProject(p.id).records()).length], module.name).toEqual([0, 0, 0]);
      for (const tool of module.tools) {
        const where = `${module.name} › ${tool.title}`;
        if (tool.type === 'registry') expect(fieldsOf(tool.category), where).toEqual(expect.arrayContaining([...(tool.groupBy ? [tool.groupBy] : []), ...(tool.summary ?? [])]));
        if (tool.type === 'board') expect(fieldsOf(tool.category), where).toEqual(expect.arrayContaining([tool.groupBy, ...(tool.show ?? [])]));
        if (tool.type === 'table' || tool.type === 'meters') expect(fieldsOf(tool.category), where).toEqual(expect.arrayContaining(tool.fields));
        if (tool.type === 'matrix') expect([fieldsOf(tool.rows), fieldsOf(tool.columns)].every(Boolean), where).toBe(true);
        if (tool.type === 'log' && tool.about) expect(fieldsOf(tool.about), where).toBeDefined();
        if (tool.type === 'calculator') for (const output of tool.outputs) expect(() => parse(output.formula), where).not.toThrow();
      }
    }
    expect(Object.values(BUILTIN_NAMES)).toContain('Characters');
  });
});

describe('turning modules on and off', () => {
  it('adds a module\'s categories and fields to the project once, and its example system only when asked', async () => {
    const { projects, codex, systems, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const x = extensions.forProject(p.id);
    expect([await x.installed(), await x.enabled()]).toEqual([[], []]);

    const row = await x.enable('progression');
    const categories = await codex.forProject(p.id).categories();
    const skills = categories.find((c) => c.name === 'Skills & Abilities')!;
    expect(row).toMatchObject({ moduleId: 'progression', enabled: true, systemId: null });
    expect(row.createdCategories).toContain(skills.key);
    expect(skills.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['Kind', 'Rank', 'Cost', 'Cooldown', 'Evolves into', 'Evolution condition', 'Known users']));
    // A field every character shares is added to the Characters field set. Class and level are not among them: a sheet on the module's system keeps those.
    expect(categories.find((c) => c.key === 'character')!.fields.map((f) => f.name)).toEqual(['Power Rank']);
    // The example system has sample classes and skills in it: it is offered, never added on its own.
    expect(await systems.forProject(p.id).list()).toEqual([]);
    const added = await x.addStarterSystem('progression');
    expect([added.name, (await x.installed())[0].systemId]).toEqual(['The System', added.id]);
    expect((await x.addStarterSystem('progression')).id).toBe(added.id);
    await expect(x.addStarterSystem('mystery')).rejects.toThrow('no starter system');

    await x.enable('progression');
    await x.disable('progression');
    await x.enable('progression');
    expect([(await systems.forProject(p.id).list()).length, (await codex.forProject(p.id).categories()).filter((c) => c.name === 'Skills & Abilities').length, (await x.installed()).length]).toEqual([1, 1, 1]);
    await expect(x.enable('nope')).rejects.toThrow('not available');
  });

  it('leaves projects that do not use a module exactly as they were', async () => {
    const { projects, codex, systems, extensions } = app;
    const [a, b] = [await projects.create({ title: 'A' }), await projects.create({ title: 'B' })];
    const before = JSON.stringify([await codex.forProject(b.id).categories(), await systems.forProject(b.id).list()]);
    await extensions.forProject(a.id).enable('mystery');
    await extensions.forProject(a.id).enable('scifi');
    expect(JSON.stringify([await codex.forProject(b.id).categories(), await systems.forProject(b.id).list()])).toBe(before);
    expect(await extensions.forProject(b.id).enabled()).toEqual([]);
    expect((await extensions.forProject(a.id).enabled()).map((m) => m.id)).toEqual(['mystery', 'scifi']);
  });

  it('hides a module without deleting anything, and brings it all back', async () => {
    const { db, projects, codex, manuscript, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const x = extensions.forProject(p.id);
    const c = codex.forProject(p.id);
    const chapter = await manuscript.forProject(p.id).create('chapter', null, 'One');
    await manuscript.forProject(p.id).saveDoc(chapter.id, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The body was cold.' }] }] }, { words: 4, characters: 18 });
    const core = async () => JSON.stringify([await db.chapters.where('projectId').equals(p.id).toArray(), await db.chapterContents.where('projectId').equals(p.id).toArray()]);
    const coreBefore = await core();

    await x.enable('mystery');
    const categories = await c.categories();
    const suspects = categories.find((cat) => cat.name === 'Suspects')!;
    const clues = categories.find((cat) => cat.name === 'Clues & Evidence')!;
    const butler = await c.create(suspects.key, 'The Butler');
    await c.setFieldValue(butler.id, suspects.fields.find((f) => f.name === 'Motive')!.id, 'Debts');
    const glove = await c.create(clues.key, 'A torn glove');
    await x.setCell('mystery', 'evidence', glove.id, butler.id, 'Implicates');
    await x.addRecord('mystery', 'herrings', { title: 'The gardener’s boots', state: 'Planted', nodeId: chapter.id, entryIds: [butler.id] });
    const data = async () => JSON.stringify([await c.list(), await x.records()]);
    const dataBefore = await data();

    await x.disable('mystery');
    expect((await x.enabled()).length).toBe(0);
    expect((await x.installed())[0]).toMatchObject({ enabled: false, moduleId: 'mystery' });
    // Its empty categories are tucked out of the "new entry" menus; the ones with records in them stay, and every entry, value and record is still there.
    const tucked = async () => Object.fromEntries((await c.categories()).filter((cat) => ['Suspects', 'Clues & Evidence', 'Cases', 'Alibis'].includes(cat.name)).map((cat) => [cat.name, Boolean(cat.archived)]));
    expect(await tucked()).toEqual({ Suspects: false, 'Clues & Evidence': false, Cases: true, Alibis: true });
    expect(await data()).toBe(dataBefore);
    expect((await c.get(butler.id))!.fields.map((f) => f.value)).toEqual(['Debts']);
    // The core never noticed.
    expect(await core()).toBe(coreBefore);
    await manuscript.forProject(p.id).saveDoc(chapter.id, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Still writing.' }] }] }, { words: 2, characters: 14 });
    expect((await projects.exportSnapshot(p.id, { everything: true })).collections.moduleRecords).toHaveLength(2);

    await x.enable('mystery');
    expect(await tucked()).toEqual({ Suspects: false, 'Clues & Evidence': false, Cases: false, Alibis: false });
    expect(await data()).toBe(dataBefore);
    await x.disable('nope');
  });

  it('off and on again, over and over, every module keeps every record, and adds nothing twice', async () => {
    const { db, projects, codex, extensions } = app;
    const p = await projects.create({ title: 'Cycles' });
    const x = extensions.forProject(p.id);
    const c = codex.forProject(p.id);
    for (const module of BUILTIN_MODULES) await x.enable(module.id);
    // Something made with each module: an entry in each kind it brings of its own, and a line in its first log.
    const categories = await c.categories();
    for (const module of BUILTIN_MODULES) {
      for (const incoming of module.schema.categories.filter((cat) => !cat.builtin)) {
        const category = categories.find((cat) => cat.name === incoming.name)!;
        await c.create(category.key, `${incoming.name}: one of mine`);
      }
      const log = module.tools.find((t) => t.type === 'log');
      if (log) await x.addRecord(module.id, log.id, { title: `${module.name}: a line of mine` });
    }
    const shape = async () => JSON.stringify((await c.categories()).map((cat) => ({ key: cat.key, name: cat.name, archived: Boolean(cat.archived), fields: cat.fields.map((f) => [f.id, f.name, f.type, Boolean(f.archived)]) })));
    const made = async () => JSON.stringify([await db.loreEntries.where('projectId').equals(p.id).sortBy('id'), await db.moduleRecords.where('projectId').equals(p.id).sortBy('id')]);
    const [shapeBefore, madeBefore] = [await shape(), await made()];
    for (let round = 0; round < 3; round++) {
      for (const module of BUILTIN_MODULES) {
        await x.disable(module.id);
        expect(await made()).toBe(madeBefore);
        await x.enable(module.id);
        expect(await made()).toBe(madeBefore);
      }
      expect(await shape()).toBe(shapeBefore);
    }
    // All off, then all on.
    for (const module of BUILTIN_MODULES) await x.disable(module.id);
    expect((await x.enabled()).length).toBe(0);
    expect(await made()).toBe(madeBefore);
    for (const module of BUILTIN_MODULES) await x.enable(module.id);
    expect([await shape(), await made()]).toEqual([shapeBefore, madeBefore]);
    expect((await x.installed()).length).toBe(BUILTIN_MODULES.length);
  }, 60_000);

  it('does not tuck away a category the project already had', async () => {
    const { projects, codex, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const c = codex.forProject(p.id);
    await c.applyTemplate({ categories: [{ key: '', name: 'Spells & Techniques', singular: 'Spell', color: '#7a4fa3', builtin: false, fields: [{ id: 'x', name: 'Incantation', type: 'text', options: [] }] }] });
    const row = await extensions.forProject(p.id).enable('high-fantasy');
    const spells = (await c.categories()).find((cat) => cat.name === 'Spells & Techniques')!;
    expect(row.createdCategories).not.toContain(spells.key);
    expect(spells.fields.map((f) => f.name).slice(0, 4)).toEqual(['Incantation', 'Magic system', 'Category', 'Effects']);
    await extensions.forProject(p.id).disable('high-fantasy');
    expect((await c.categories()).find((cat) => cat.name === 'Spells & Techniques')!.archived).toBeFalsy();
    expect((await c.categories()).find((cat) => cat.name === 'Creatures')!.archived).toBe(true);
  });
});

describe('modules working together', () => {
  it('point at the same character, place and faction instead of each keeping their own', async () => {
    const { projects, codex, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const x = extensions.forProject(p.id);
    const c = codex.forProject(p.id);
    for (const id of ['high-fantasy', 'progression', 'mystery', 'romance', 'politics']) await x.enable(id);
    const categories = await c.categories();
    const cat = (name: string) => categories.find((k) => k.name === name)!;
    const set = (entryId: string, category: string, field: string, value: string) => c.setFieldValue(entryId, cat(category).fields.find((f) => f.name === field)!.id, value);
    const before = (await c.list()).length;
    const mira = await c.create('character', 'Mira');
    const guild = await c.create('faction', 'Ash Guild');
    // A wizard, a class-holder, a suspect, half of a romance and a faction's leader: five modules, one Mira.
    const fireball = await c.create(cat('Spells & Techniques').key, 'Fireball');
    await set(fireball.id, 'Spells & Techniques', 'Known users', mira.id);
    const knight = await c.create(cat('Classes & Jobs').key, 'Arcane Knight');
    await set(knight.id, 'Classes & Jobs', 'Held by', mira.id);
    const suspect = await c.create(cat('Suspects').key, 'Mira, at the scene');
    await set(suspect.id, 'Suspects', 'Character', mira.id);
    const arc = await c.create(cat('Romantic Arcs').key, 'Mira & Bren');
    await set(arc.id, 'Romantic Arcs', 'Partners', mira.id);
    await set(guild.id, 'Factions & Species', 'Leadership', mira.id);
    expect((await c.list()).filter((e) => e.category === 'character').map((e) => e.name)).toEqual(['Mira']);
    expect((await c.list()).length).toBe(before + 6);
    // Every one of those links is the same id, so renaming her once renames her everywhere.
    const pointing = (await c.list()).filter((e) => e.fields.some((f) => f.value.split('\n').includes(mira.id))).map((e) => e.name).sort();
    expect(pointing).toEqual(['Arcane Knight', 'Ash Guild', 'Fireball', 'Mira & Bren', 'Mira, at the scene']);
    // Two modules that add to the same built-in category add to one field set: "Members" is one field, not one each.
    await x.enable('superhero');
    await x.enable('contemporary');
    expect((await c.categories()).find((k) => k.key === 'faction')!.fields.filter((f) => f.name === 'Members')).toHaveLength(1);
    expect((await c.categories()).find((k) => k.key === 'character')!.fields.map((f) => f.name)).toEqual(['Species', 'Power Rank']);
  });

  it('keeps a shared category in place when one of the modules that use it is switched off', async () => {
    const { projects, codex, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const x = extensions.forProject(p.id);
    const c = codex.forProject(p.id);
    // A module of the author's own that also works on Spells & Techniques.
    const mine = parseDefinition({ id: 'custom-rites', name: 'Rites', schema: { categories: [{ name: 'Spells & Techniques', fields: [{ name: 'Rite', type: 'text' }] }] }, tools: [{ id: 'rites', type: 'registry', title: 'Rites', category: 'Spells & Techniques' }] });
    await x.enable('high-fantasy');
    await x.enable(mine);
    const shares = (await x.status()).find((s) => s.module.id === 'high-fantasy')!.shares;
    expect(shares.find((s) => s.moduleId === 'custom-rites')).toMatchObject({ enabled: true, categories: ['Spells & Techniques'] });
    await x.disable('high-fantasy');
    const after = await c.categories();
    // Empty, and brought by Fantasy: but Rites still uses it, so it stays. An empty category nobody else uses is tucked away.
    expect([Boolean(after.find((k) => k.name === 'Spells & Techniques')!.archived), Boolean(after.find((k) => k.name === 'Creatures')!.archived)]).toEqual([false, true]);
    expect((await x.status()).find((s) => s.module.id === 'custom-rites')!.state).toBe('enabled');
  });
});

describe('the Module Manager', () => {
  it('says where each module stands, how much was made with it, and what needs attention', async () => {
    const { db, projects, codex, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const x = extensions.forProject(p.id);
    const c = codex.forProject(p.id);
    const state = async (id: string) => (await x.status()).find((s) => s.module.id === id)!;
    expect((await x.status()).map((s) => s.state)).toEqual(Array(10).fill('available'));
    expect(await state('mystery')).toMatchObject({ installed: null, updatable: false, usage: { entries: 0, records: 0 }, reasons: [] });

    await x.enable('mystery');
    const suspects = (await c.categories()).find((k) => k.name === 'Suspects')!;
    const butler = await c.create(suspects.key, 'The Butler');
    await c.create('character', 'Not a module record');
    await x.addRecord('mystery', 'reveals', { title: 'The will was forged' });
    expect(await state('mystery')).toMatchObject({ state: 'enabled', installed: 2, usage: { entries: 1, records: 1 } });
    await x.disable('mystery');
    expect(await state('mystery')).toMatchObject({ state: 'disabled', usage: { entries: 1, records: 1 } });
    await x.enable('mystery');

    // A project that had an earlier version of a built-in module: it still works, and says an update is there.
    const row = (await x.installed())[0];
    await db.projectModules.update(row.id, { definition: { ...row.definition, version: 1, tools: row.definition.tools.slice(0, 2) } });
    expect(await state('mystery')).toMatchObject({ state: 'attention', updatable: true, installed: 1 });
    expect((await state('mystery')).reasons.join(' ')).toContain('A newer version (2) is available');
    await x.enable('mystery');
    expect(await state('mystery')).toMatchObject({ state: 'enabled', updatable: false, installed: 2 });
    expect((await c.get(butler.id))!.name).toBe('The Butler');

    // A category a tool needs has gone from the Codex.
    await db.loreSchemas.where('projectId').equals(p.id).filter((k) => k.name === 'Alibis').delete();
    expect((await state('mystery')).reasons.join(' ')).toContain('Alibis is no longer in the Codex');
    await x.enable('mystery');
    expect((await state('mystery')).state).toBe('enabled');
  });

  it('lets the author rename a category or a field without breaking the module\'s tools', async () => {
    const { projects, codex, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const x = extensions.forProject(p.id);
    const c = codex.forProject(p.id);
    await x.enable('romance');
    const arcs = (await c.categories()).find((k) => k.name === 'Romantic Arcs')!;
    const stage = arcs.fields.find((f) => f.name === 'Stage')!;
    await c.saveCategory(arcs.key, (stored) => ({ name: 'Love Stories', fields: stored.fields.map((f) => (f.id === stage.id ? { ...f, name: 'Where they stand', options: ['Rivals', 'Reluctant allies', 'Trust', 'Partnership'] } : f)) }));
    const row = (await x.installed())[0];
    const now = await c.categories();
    const found = resolveCategory('Romantic Arcs', now, row.bindings)!;
    expect(found.name).toBe('Love Stories');
    expect(resolveField('Romantic Arcs', found, 'Stage', row.bindings)).toMatchObject({ name: 'Where they stand', options: ['Rivals', 'Reluctant allies', 'Trust', 'Partnership'] });
    // Nothing needs attention, and switching it off and on does not put a second "Romantic Arcs" or "Stage" back.
    expect((await x.status()).find((s) => s.module.id === 'romance')!.state).toBe('enabled');
    await x.disable('romance');
    await x.enable('romance');
    const again = await c.categories();
    expect([again.filter((k) => k.name === 'Romantic Arcs').length, again.find((k) => k.key === arcs.key)!.name, again.find((k) => k.key === arcs.key)!.fields.filter((f) => f.name === 'Stage').length, again.length]).toEqual([0, 'Love Stories', 0, now.length]);
  });

  it('keeps how a module is arranged: tools hidden, renamed and reordered, and a log\'s own stages', async () => {
    const { projects, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const x = extensions.forProject(p.id);
    await x.enable('romance');
    await x.configure('romance', () => ({ hidden: ['meters', 'no-such-tool'], order: ['milestones', 'arcs', 'nope'], titles: { arcs: ' Love stories ', milestones: '  ' }, states: { transitions: ['Rivals', 'Reluctant allies', 'Trust', 'Rivals'], arcs: [] }, nav: ' Hearts ' }));
    const row = (await x.installed())[0];
    expect(row.settings).toEqual({ hidden: ['meters'], order: ['milestones', 'arcs'], titles: { arcs: 'Love stories' }, states: { transitions: ['Rivals', 'Reluctant allies', 'Trust'] }, nav: 'Hearts' });
    const tools = arrangedTools(row.definition, row.settings);
    expect(tools.slice(0, 3).map((t) => t.title)).toEqual(['Emotional milestones', 'Love stories', 'Arcs by stage']);
    expect(tools.some((t) => t.id === 'meters')).toBe(false);
    expect(tools.find((t) => t.id === 'transitions')).toMatchObject({ states: ['Rivals', 'Reluctant allies', 'Trust'] });
    // Settings survive switching the module off and on, and a module that is not installed has none to set.
    await x.disable('romance');
    await x.enable('romance');
    expect((await x.installed())[0].settings).toEqual(row.settings);
    await expect(x.configure('horror', (s) => s)).rejects.toThrow('not installed');
  });

  it('ties a line in a log to a timeline event of the same project only', async () => {
    const { db, projects, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const other = await projects.create({ title: 'Other' });
    const event = (projectId: string, id: string) => db.timelineEvents.add({ id, projectId, name: 'The coup' } as never);
    await event(p.id, 'e1');
    await event(other.id, 'e2');
    const x = extensions.forProject(p.id);
    const coup = await x.addRecord('politics', 'events', { title: 'The coup', state: 'Coup', eventId: 'e1' });
    expect(coup.eventId).toBe('e1');
    await x.updateRecord(coup.id, { eventId: 'e2' });
    expect((await x.records())[0].eventId).toBeNull();
  });
});

describe('links to several entries', () => {
  it('are read as names, drawn as links in the story graph, and follow their entries into a copy', async () => {
    const { projects, codex, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const c = codex.forProject(p.id);
    await extensions.forProject(p.id).enable('high-fantasy');
    const spells = (await c.categories()).find((k) => k.name === 'Spells & Techniques')!;
    const users = spells.fields.find((f) => f.name === 'Known users')!;
    expect(users.type).toBe('references');
    const [mira, bren] = [await c.create('character', 'Mira'), await c.create('character', 'Bren')];
    const fireball = await c.create(spells.key, 'Fireball');
    await c.setFieldValue(fireball.id, users.id, `${mira.id}\n${bren.id}\ngone`);
    const stored = (await c.get(fireball.id))!.fields[0];
    const names = new Map([[mira.id, 'Mira'], [bren.id, 'Bren']]);
    expect(displayValue({ type: 'references', value: stored.value }, (id) => names.get(id))).toBe('Mira, Bren');
    const copy = await projects.duplicate(p.id);
    const copied = await codex.forProject(copy.id).list();
    const ids = copied.find((e) => e.name === 'Fireball')!.fields[0].value.split('\n');
    expect(ids.slice(0, 2)).toEqual([copied.find((e) => e.name === 'Mira')!.id, copied.find((e) => e.name === 'Bren')!.id]);
    expect(ids).not.toContain(mira.id);
  });

  it('show a family tree read from the relationships, not kept beside them', () => {
    const order = { position: new Map<string, number>(), index: new Map() } as never;
    const stage = (preset: string, fromRole: string, toRole: string, category = 'family') => [{ id: 's', startNodeId: null, preset, category, label: '', fromRole, toRole, directional: fromRole !== toRole, title: '', affinity: 'neutral', event: '', notes: '' }];
    const rel = (id: string, fromId: string, toId: string, stages: ReturnType<typeof stage>) => ({ id, projectId: 'p', fromId, toId, stages, createdAt: 0, updatedAt: 0 }) as never;
    const rows = buildLineage([
      rel('1', 'grandma', 'mum', stage('parent-child', 'Parent', 'Child')),
      rel('2', 'mum', 'kid', stage('parent-child', 'Parent', 'Child')),
      rel('3', 'mum', 'dad', stage('spouses', 'Spouse', 'Spouse')),
      rel('4', 'kid', 'sis', stage('siblings', 'Sibling', 'Sibling')),
      rel('5', 'kid', 'friend', stage('friends', 'Friend', 'Friend', 'social')),
      rel('6', 'kid', 'stranger-not-in-project', stage('siblings', 'Sibling', 'Sibling')),
    ], order, (id) => id !== 'stranger-not-in-project');
    expect(rows.map((row) => row.map((k) => k.id).sort())).toEqual([['grandma'], ['dad', 'mum'], ['kid', 'sis']]);
    expect(rows[1].find((k) => k.id === 'mum')).toMatchObject({ parents: ['grandma'], children: ['kid'], partners: ['dad'] });
    expect(rows.flat().some((k) => k.id === 'friend')).toBe(false);
  });
});

describe('what tools record', () => {
  it('keeps logs and matrix cells in the project, tied to chapters and entries', async () => {
    const { projects, codex, manuscript, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const x = extensions.forProject(p.id);
    const [one, two] = [await manuscript.forProject(p.id).create('chapter', null, 'One'), await manuscript.forProject(p.id).create('chapter', null, 'Two')];
    const [kai, ren] = [await codex.forProject(p.id).create('character', 'Kai'), await codex.forProject(p.id).create('character', 'Ren')];
    const beat = await x.addRecord('romance', 'arc', { title: ' First glance ', nodeId: one.id, entryIds: [kai.id, 'nope', kai.id], value: 3 });
    expect(beat).toMatchObject({ kind: 'log', title: 'First glance', nodeId: one.id, entryIds: [kai.id], value: 3, done: false });
    await x.updateRecord(beat.id, { state: 'Open conflict', endNodeId: two.id, done: true, value: 9, note: 'n', nodeId: 'nope', title: '  ' });
    expect((await x.records())[0]).toMatchObject({ state: 'Open conflict', endNodeId: two.id, done: true, value: 9, note: 'n', nodeId: null, title: 'Untitled' });

    await x.setCell('high-fantasy', 'magic', kai.id, ren.id, 'Knows');
    await x.setCell('high-fantasy', 'magic', kai.id, ren.id, ' Forbidden ');
    expect((await x.records()).filter((r) => r.kind === 'cell').map((r) => [r.rowId, r.colId, r.state])).toEqual([[kai.id, ren.id, 'Forbidden']]);
    await x.setCell('high-fantasy', 'magic', kai.id, ren.id, '');
    expect((await x.records()).filter((r) => r.kind === 'cell')).toEqual([]);
    await expect(x.setCell('high-fantasy', 'magic', kai.id, 'nope', 'x')).rejects.toThrow('not in this project');

    const other = extensions.forProject((await projects.create({ title: 'Other' })).id);
    expect(await other.records()).toEqual([]);
    await expect(other.updateRecord(beat.id, { title: 'x' })).rejects.toThrow('not in this project');
    await expect(other.removeRecord(beat.id)).rejects.toThrow('not in this project');
    await x.removeRecord(beat.id);
    expect(await x.records()).toEqual([]);
  });

  it('travels with the project through copies, backups and forks', async () => {
    const { projects, codex, manuscript, extensions } = app;
    const p = await projects.create({ title: 'P' });
    const x = extensions.forProject(p.id);
    await x.enable('mystery');
    const chapters = [await manuscript.forProject(p.id).create('chapter', null, 'One'), await manuscript.forProject(p.id).create('chapter', null, 'Two'), await manuscript.forProject(p.id).create('chapter', null, 'Three')];
    const suspects = (await codex.forProject(p.id).categories()).find((c) => c.name === 'Suspects')!;
    const butler = await codex.forProject(p.id).create(suspects.key, 'The Butler');
    await x.addRecord('mystery', 'herrings', { title: 'Early', nodeId: chapters[0].id, endNodeId: chapters[2].id, entryIds: [butler.id] });
    await x.addRecord('mystery', 'herrings', { title: 'Late', nodeId: chapters[2].id });
    await x.setCell('mystery', 'evidence', butler.id, butler.id, 'Unclear');

    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))))).id]) {
      const copy = extensions.forProject(projectId);
      const entries = await codex.forProject(projectId).list();
      const nodes = await manuscript.forProject(projectId).list();
      expect((await copy.enabled()).map((m) => m.id)).toEqual(['mystery']);
      const records = await copy.records();
      const early = records.find((r) => r.title === 'Early')!;
      expect([nodes.find((n) => n.id === early.nodeId)?.title, nodes.find((n) => n.id === early.endNodeId)?.title, entries.find((e) => e.id === early.entryIds[0])?.name]).toEqual(['One', 'Three', 'The Butler']);
      expect(records.find((r) => r.kind === 'cell')).toMatchObject({ rowId: entries[0].id, colId: entries[0].id, state: 'Unclear' });
      // The category keys the module created still name real categories in the copy.
      const created = (await copy.installed())[0].createdCategories;
      expect((await codex.forProject(projectId).categories()).filter((c) => created.includes(c.key)).map((c) => c.name).sort()).toEqual(['Alibis', 'Cases', 'Clues & Evidence', 'Suspects']);
    }
    // A timeline forked after chapter two has the early red herring, still unresolved, and not the late one.
    const forked = await projects.fork(p.id, new Set([chapters[0].id, chapters[1].id]), { title: 'Fork' });
    const records = (await extensions.forProject(forked.project.id).records()).filter((r) => r.kind === 'log');
    expect(records.map((r) => [r.title, r.endNodeId])).toEqual([['Early', null]]);
    await projects.remove(p.id);
    expect([await x.installed(), await x.records()]).toEqual([[], []]);
  });
});

describe('modules of the author\'s own', () => {
  it('packages chosen categories and a system, with tools worked out from them', async () => {
    const { projects, codex, systems, extensions } = app;
    const p = await projects.create({ title: 'Capes' });
    const c = codex.forProject(p.id);
    await c.applyTemplate({
      categories: [
        { key: '', name: 'Secret Identities', singular: 'Identity', color: '#2b7a8c', builtin: false, fields: [{ id: 'a', name: 'Public face', type: 'text', options: [] }, { id: 'b', name: 'Exposure', type: 'select', options: ['Secret', 'Suspected', 'Public'] }, { id: 'c', name: 'Public reputation', type: 'number', options: [] }] },
        { key: '', name: 'Costumes', singular: 'Costume', color: '#a8436b', builtin: false, fields: [{ id: 'a', name: 'Materials', type: 'text', options: [] }] },
        { key: '', name: 'Unrelated', singular: 'Thing', color: '#6b7a2b', builtin: false, fields: [{ id: 'a', name: 'X', type: 'text', options: [] }] },
      ],
    });
    await c.create('character', 'A real person who must not be in the module');
    const gifted = await systems.forProject(p.id).create({ name: 'Power Classifications', description: '', variables: [{ id: 'v', name: 'Output', key: 'output', kind: 'number', unit: 'kJ', base: 10, formula: '', options: [], note: '' }], tracks: [], ranks: [{ id: 'r-minor', name: 'Minor' }, { id: 'r-major', name: 'Major' }], groups: [], items: [], matrices: [] });
    const keys = (await c.categories()).filter((cat) => ['Secret Identities', 'Costumes'].includes(cat.name)).map((cat) => cat.key);

    const module = await extensions.forProject(p.id).buildFrom({ name: ' Superhero / Urban Fantasy ', genre: 'Capes', description: 'Masks and what they cost.', categoryKeys: keys, systemId: gifted.id });
    expect(module).toMatchObject({ name: 'Superhero / Urban Fantasy', genre: 'Capes', builtin: false, unlocks: ['systems', 'progression'] });
    expect(module.id).toMatch(/^custom-/);
    expect(module.schema.categories.map((cat) => [cat.name, cat.fields.map((f) => f.name)])).toEqual([['Secret Identities', ['Public face', 'Exposure', 'Public reputation']], ['Costumes', ['Materials']]]);
    expect(module.system).toMatchObject({ name: 'Power Classifications', ranks: [{ name: 'Minor' }, { name: 'Major' }] });
    expect(module.tools.map((t) => `${t.type}: ${t.title}`)).toEqual([
      'board: Secret Identities by exposure', 'table: Secret Identities', 'meters: Secret Identities: public reputation', 'table: Costumes', 'page: Systems', 'page: Character progression',
    ]);
    // Only the shape of things: no entries, no names, no text.
    expect(JSON.stringify(module)).not.toContain('real person');
    await expect(extensions.forProject(p.id).buildFrom({ name: '', categoryKeys: keys })).rejects.toThrow('name');
    await expect(extensions.forProject(p.id).buildFrom({ name: 'Empty', categoryKeys: [] })).rejects.toThrow('at least one');
    expect(deriveTools({ categories: [] }, false)).toEqual([]);
  });

  it('saves to the library, exports to a file, and works when imported somewhere else', async () => {
    const { projects, codex, extensions } = app;
    const p = await projects.create({ title: 'Capes' });
    await codex.forProject(p.id).applyTemplate({ categories: [{ key: '', name: 'Secret Identities', singular: 'Identity', color: '#2b7a8c', builtin: false, fields: [{ id: 'a', name: 'Exposure', type: 'select', options: ['Secret', 'Public'] }] }] });
    const key = (await codex.forProject(p.id).categories()).find((cat) => cat.name === 'Secret Identities')!.key;
    const module = await extensions.forProject(p.id).buildFrom({ name: 'Superhero', categoryKeys: [key] });
    await extensions.save(module);
    expect((await extensions.available()).map((m) => m.name)).toEqual([...BUILTIN_MODULES.map((m) => m.name), 'Superhero']);
    const file = extensions.exportModule(module);
    expect(JSON.parse(file)).toMatchObject({ format: 'novel-builder-module', version: 1, module: { name: 'Superhero' } });

    // Another author, another device.
    const elsewhere = setup(`extensions-elsewhere-${n}`);
    const imported = await elsewhere.extensions.importModule(file);
    expect(imported.definition).toEqual(module);
    const theirs = await elsewhere.projects.create({ title: 'Theirs' });
    await elsewhere.extensions.forProject(theirs.id).enable(imported.id);
    const identities = (await elsewhere.codex.forProject(theirs.id).categories()).find((cat) => cat.name === 'Secret Identities')!;
    expect(identities.fields.map((f) => [f.name, f.type, f.options])).toEqual([['Exposure', 'select', ['Secret', 'Public']]]);
    expect((await elsewhere.extensions.forProject(theirs.id).enabled())[0].tools.map((t) => t.type)).toEqual(['board', 'table']);

    // Taking it out of the library does not take it out of a project that uses it.
    await elsewhere.extensions.remove(imported.id);
    expect((await elsewhere.extensions.available()).length).toBe(BUILTIN_MODULES.length);
    expect((await elsewhere.extensions.forProject(theirs.id).enabled()).map((m) => m.name)).toEqual(['Superhero']);
    await elsewhere.extensions.forProject(theirs.id).disable(imported.id);
    await elsewhere.extensions.forProject(theirs.id).enable(imported.id);
    expect((await elsewhere.extensions.forProject(theirs.id).enabled()).length).toBe(1);
  });

  it('refuses files that are not modules, and never lets a file replace a built-in one', async () => {
    const { extensions } = app;
    for (const bad of ['nope', '{}', JSON.stringify({ format: 'novel-builder-workspace', module: {} }), JSON.stringify({ format: 'novel-builder-module', module: { tools: [] } })]) await expect(extensions.importModule(bad)).rejects.toThrow('not a module');
    const sneaky = await extensions.importModule(JSON.stringify({ format: 'novel-builder-module', module: { id: 'mystery', name: 'Fake Mystery', builtin: true, tools: [{ type: 'hologram', title: 'From the future' }, { type: 'board', title: 'No category' }, { type: 'log', title: 'Fine' }], schema: { categories: [{ name: 'Things', fields: [{ name: 'F', type: 'laser' }, { type: 'text' }] }] } } }));
    expect(sneaky.id).not.toBe('mystery');
    expect(sneaky.definition).toMatchObject({ builtin: false, name: 'Fake Mystery' });
    // Tools this version does not know, or that are incomplete, are left out; odd field types become plain text.
    expect(sneaky.definition.tools.map((t) => t.title)).toEqual(['Fine']);
    expect(sneaky.definition.schema.categories[0].fields).toEqual([{ id: 'module-0', name: 'F', type: 'text', options: [] }]);
    expect((await extensions.available()).find((m) => m.id === 'mystery')!.name).toBe('Mystery, Detective & Investigation');
  });
});
