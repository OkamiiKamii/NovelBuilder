import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { storyOrder } from '@/modules/relationships/timeline';
import { refusal, visible } from '@/modules/sync/access';
import { NO_FILTERS, countMentions, facets, listCharacters, matches, passes, sortCharacters } from './library';
import { createCharacterService, registerCharacters } from './service';
import { BUILTIN_TEMPLATES, sectionsOf, suggestionsFor } from './templates';

let n = 0;
const link = (text: string, entryId: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'entityLink', attrs: { entryId } }] }] }] });

async function world() {
  const db = new NovelDB(`characters-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerRelationships(registry);
  registerPlot(registry);
  registerCharacters(registry);
  const manuscript = createManuscriptService(db, projects.contentChanged);
  const codex = createCodexService(db, projects.contentChanged);
  const relationships = createRelationshipService(db, projects.contentChanged);
  const plot = createPlotService(db, projects.contentChanged);
  const characters = createCharacterService(db, codex, projects.contentChanged);
  const p = await projects.create({ title: 'Ashfall' });
  const api = characters.forProject(p.id);
  const dump = async () => JSON.stringify(Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()]))));
  return { db, projects, manuscript, codex, relationships, plot, characters, p, api, dump };
}

describe('a character is one record', () => {
  it('is created as a codex entry in Characters, with a profile beside it', async () => {
    const { db, api, codex, p } = await world();
    const sera = await api.create({ name: 'Seraphina Valdris', epithet: 'The Last Heir', roles: ['Protagonist'], summary: 'First daughter of House Valdris.' });
    expect(sera).toMatchObject({ category: 'character', name: 'Seraphina Valdris', summary: 'First daughter of House Valdris.', projectId: p.id });
    // The Codex and the character library read the same row.
    expect((await codex.forProject(p.id).list()).map((e) => e.id)).toEqual([sera.id]);
    expect((await api.entries()).map((e) => e.id)).toEqual([sera.id]);
    const profile = await api.profile(sera.id);
    expect(profile).toMatchObject({ entryId: sera.id, epithet: 'The Last Heir', roles: ['Protagonist'], archived: false });
    expect(profile.sections.map((s) => [s.name, s.tab, s.fieldIds.length])).toEqual([['Core Identity', 'overview', 0], ['Personality & Psychology', 'overview', 0], ['Character Arc', 'overview', 0], ['Resources & Position', 'overview', 0], ['Biography & History', 'details', 0], ['Appearance', 'details', 0]]);
    expect(await db.characterProfiles.count()).toBe(1);
    await expect(api.create({ name: '  ' })).rejects.toThrow('Give the character a name.');
    // Nothing else is required: no summary, no role, no portrait.
    expect(await api.create({ name: 'Nobody' })).toMatchObject({ name: 'Nobody', summary: '', image: null });
  });

  it('gives a character made in the Codex the same profile, without writing anything until it is changed', async () => {
    const { db, api, codex, p, dump } = await world();
    const old = await codex.forProject(p.id).create('character', 'Old Tam');
    await codex.forProject(p.id).update(old.id, { fields: [{ id: 'a', key: 'Age', value: '70' }] });
    const before = await dump();
    const profile = await api.profile(old.id);
    expect(profile.sections.map((s) => s.name)).toContain('Core Identity');
    expect((await api.entries()).length).toBe(1);
    expect(await dump()).toBe(before);
    // The field written in the Codex is the character's field: not copied, the same one.
    await api.updateField(old.id, 'a', { value: '71' });
    expect((await codex.forProject(p.id).get(old.id))!.fields).toEqual([{ id: 'a', key: 'Age', value: '71' }]);
    expect(await db.characterProfiles.count()).toBe(0);
    await api.identity(old.id, { epithet: 'The Ferryman' });
    expect(await db.characterProfiles.count()).toBe(1);
    // Only characters have profiles.
    const place = await codex.forProject(p.id).create('location', 'Emberhold');
    await expect(api.profile(place.id)).rejects.toThrow('not in this project');
    await expect(characters_of_another(db, api, old.id)).resolves.toBe(true);
  });

  it('keeps identity where it belongs and notes each change, folding quick edits into one line', async () => {
    const { api } = await world();
    const c = await api.create({ name: 'Marcus' });
    await api.identity(c.id, { name: 'Marcus Vell', epithet: 'The Oathbreaker', aliases: ['Marc', 'Marc', ' The Wolf '], roles: ['Antagonist', 'Supporting'], status: 'Alive', summary: 'A soldier.', focal: { x: 130, y: -4 }, tags: ['guard'] });
    expect(await api.profile(c.id)).toMatchObject({ epithet: 'The Oathbreaker', aliases: ['Marc', 'The Wolf'], roles: ['Antagonist', 'Supporting'], status: 'Alive', focal: { x: 100, y: 0 } });
    await api.identity(c.id, { summary: 'A soldier, then a commander.' });
    await api.identity(c.id, { image: 'data:image/png;base64,AAAA' });
    await api.identity(c.id, { image: null });
    const said = (await api.history(c.id)).map((h) => `${h.action}|${h.label}|${h.from}|${h.to}`).sort();
    expect(said).toEqual([
      'created|Marcus||', 'identity|Name|Marcus|Marcus Vell', 'identity|Summary||A soldier, then a commander.', 'identity|Title||The Oathbreaker', 'identity|Aliases||Marc, The Wolf', 'identity|Role||Antagonist, Supporting', 'identity|Status||Alive',
      'portrait|added||', 'portrait|removed||',
    ].sort());
  });
});

/** A profile of this project's character cannot be reached from another project. */
async function characters_of_another(db: NovelDB, _api: unknown, entryId: string): Promise<boolean> {
  const { createCharacterService: make } = await import('./service');
  const { createCodexService: lore } = await import('@/modules/codex/service');
  const other = make(db, lore(db, async () => {}), async () => {}).forProject('another-project');
  return other.profile(entryId).then(() => false, () => true);
}

describe('sections and fields', () => {
  it('lets the author add, rename, reorder, hide, duplicate and remove sections', async () => {
    const { api } = await world();
    const c = await api.create({ name: 'Kael', templateId: 'supporting' });
    const names = async (tab = 'overview') => (await api.profile(c.id)).sections.filter((s) => s.tab === tab).map((s) => s.name);
    expect(await names()).toEqual(['Core Identity', 'Role in the Story', 'Personality']);
    await api.addSection(c.id, 'Magic');
    const magic = (await api.profile(c.id)).sections.find((s) => s.name === 'Magic')!;
    await api.moveSection(c.id, magic.id, -1);
    await api.moveSection(c.id, magic.id, -1);
    expect(await names()).toEqual(['Core Identity', 'Magic', 'Role in the Story', 'Personality']);
    await api.moveSection(c.id, magic.id, -1);
    await api.moveSection(c.id, magic.id, -1);
    expect((await names())[0]).toBe('Magic');
    await api.updateSection(c.id, magic.id, { name: 'Lineage & Magic', hidden: true });
    expect((await api.profile(c.id)).sections.find((s) => s.id === magic.id)).toMatchObject({ name: 'Lineage & Magic', hidden: true });
    await expect(api.updateSection(c.id, magic.id, { name: ' ' })).rejects.toThrow('Give the section a name.');
    await expect(api.addSection(c.id, '')).rejects.toThrow();

    const school = await api.addField(c.id, magic.id, { name: 'School', value: 'Ash' });
    await api.addField(c.id, magic.id, { name: 'Tier', type: 'number', value: '3' });
    const copy = await api.duplicateSection(c.id, magic.id);
    const after = await api.profile(c.id);
    expect(after.sections.map((s) => s.name).slice(0, 2)).toEqual(['Lineage & Magic', 'Lineage & Magic (copy)']);
    const entry = (await api.entries())[0];
    expect(copy.fieldIds.map((id) => entry.fields.find((f) => f.id === id))).toMatchObject([{ key: 'School', value: '' }, { key: 'Tier', value: '', type: 'number' }]);

    // Removing a section leaves what was written, unless the author says to delete it too.
    await api.removeSection(c.id, magic.id);
    expect((await api.entries())[0].fields.find((f) => f.id === school.id)).toMatchObject({ key: 'School', value: 'Ash' });
    await api.removeSection(c.id, copy.id, true);
    expect((await api.entries())[0].fields.map((f) => f.key)).toEqual(['School', 'Tier']);
    expect((await api.profile(c.id)).sections.some((s) => s.name.startsWith('Lineage'))).toBe(false);
  });

  it('lets the author add, rename, retype, reorder, move, edit and remove fields, of every type', async () => {
    const { api, codex, p } = await world();
    const c = await api.create({ name: 'Kael' });
    const guild = await codex.forProject(p.id).create('faction', 'Ash Guild');
    const [identity, psyche] = (await api.profile(c.id)).sections;
    const age = await api.addField(c.id, identity.id, { name: 'Age', value: '27' });
    const traits = await api.addField(c.id, identity.id, { name: 'Core Traits', type: 'tags', value: 'Brooding\nLoyal' });
    const faction = await api.addField(c.id, identity.id, { name: 'Faction', type: 'reference', value: guild.id });
    const oath = await api.addField(c.id, identity.id, { name: 'Oathbound', type: 'toggle', value: 'yes' });
    const rank = await api.addField(c.id, identity.id, { name: 'Rank', type: 'select', options: ['Squire', 'Knight', 'Knight'], value: 'Knight' });
    expect(rank.options).toEqual(['Squire', 'Knight']);
    const ids = async (sectionId: string) => (await api.profile(c.id)).sections.find((s) => s.id === sectionId)!.fieldIds;
    expect(await ids(identity.id)).toEqual([age.id, traits.id, faction.id, oath.id, rank.id]);

    await api.moveField(c.id, rank.id, { by: -1 });
    await api.moveField(c.id, age.id, { by: -1 });
    expect(await ids(identity.id)).toEqual([age.id, traits.id, faction.id, rank.id, oath.id]);
    await api.moveField(c.id, traits.id, { sectionId: psyche.id });
    expect([await ids(identity.id), await ids(psyche.id)]).toEqual([[age.id, faction.id, rank.id, oath.id], [traits.id]]);

    await api.updateField(c.id, age.id, { key: 'Age in years', type: 'number', value: '28' });
    await api.updateField(c.id, faction.id, { value: '' });
    await api.updateField(c.id, traits.id, { value: 'Brooding\nLoyal\nGuarded' });
    const entry = (await api.entries())[0];
    expect(entry.fields.find((f) => f.id === age.id)).toEqual({ id: age.id, key: 'Age in years', value: '28', type: 'number' });
    await expect(api.updateField(c.id, age.id, { key: '' })).rejects.toThrow('Give the field a name.');
    await expect(api.addField(c.id, identity.id, { name: '' })).rejects.toThrow();
    await expect(api.updateField(c.id, 'nope', { value: 'x' })).rejects.toThrow();

    // History says what changed, in words, with a linked entry by its name.
    const lines = (await api.history(c.id)).filter((h) => h.action === 'field').map((h) => `${h.label}: ${h.from} → ${h.to}`);
    expect(lines).toEqual(expect.arrayContaining(['Age in years: 27 → 28', 'Faction: Ash Guild → ', 'Core Traits: Brooding, Loyal → Brooding, Loyal, Guarded']));

    await api.removeField(c.id, oath.id);
    expect(await ids(identity.id)).toEqual([age.id, faction.id, rank.id]);
    expect((await api.entries())[0].fields.some((f) => f.id === oath.id)).toBe(false);
  });

  it('folds a run of edits to one field into a single line, and drops it if the value ends where it began', async () => {
    const { api } = await world();
    const c = await api.create({ name: 'Marcus' });
    const [identity] = (await api.profile(c.id)).sections;
    const job = await api.addField(c.id, identity.id, { name: 'Occupation', value: 'Soldier' });
    for (const value of ['C', 'Co', 'Commander']) await api.updateField(c.id, job.id, { value });
    const lines = async () => (await api.history(c.id)).filter((h) => h.action === 'field').map((h) => `${h.label}: ${h.from} → ${h.to}`);
    expect(await lines()).toEqual(['Occupation: Soldier → Commander']);
    await api.updateField(c.id, job.id, { value: 'Soldier' });
    expect(await lines()).toEqual([]);
  });

  it('offers a section’s usual fields without storing any until one is added', async () => {
    const { api } = await world();
    const c = await api.create({ name: 'Kael', templateId: 'suspect' });
    const profile = await api.profile(c.id);
    expect(profile.sections.map((s) => s.name)).toEqual(['Identity', 'The Case', 'Reveal', 'Personality & Psychology', 'Biography & History']);
    expect((await api.entries())[0].fields).toEqual([]);
    const offered = suggestionsFor('The Case', await api.templates(), ['Motive']);
    expect(offered.map((f) => f.name)).toEqual(['Means', 'Opportunity', 'Alibi', 'Alibi holds?', 'Evidence for', 'Evidence against']);
    expect(offered.find((f) => f.name === 'Alibi holds?')!.type).toBe('toggle');
    expect(suggestionsFor('A section of my own', await api.templates(), [])).toEqual([]);
    for (const template of BUILTIN_TEMPLATES) expect(new Set(sectionsOf(template).map((s) => s.id)).size, template.id).toBe(template.sections.length);
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toEqual(['General Character', 'Protagonist', 'Antagonist', 'Supporting Character', 'Fantasy Character', 'Progression Fantasy Character', 'Mystery Suspect', 'Romance Character', 'Science Fiction Character']);
  });

  it('applies a template by adding what is missing, and saves a layout for other characters', async () => {
    const { api } = await world();
    const a = await api.create({ name: 'A', templateId: 'supporting' });
    const [identity] = (await api.profile(a.id)).sections;
    await api.addField(a.id, identity.id, { name: 'Age', value: '30' });
    await api.applyTemplate(a.id, 'fantasy');
    const names = (await api.profile(a.id)).sections.map((s) => s.name);
    expect(names).toEqual(['Core Identity', 'Role in the Story', 'Personality', 'Biography & History', 'Lineage & Magic', 'Personality & Psychology', 'Character Arc', 'Allegiances', 'Appearance']);
    expect((await api.entries())[0].fields).toMatchObject([{ key: 'Age', value: '30' }]);

    const saved = await api.saveTemplate(a.id, 'My cast');
    expect(saved.sections[0]).toEqual({ name: 'Core Identity', tab: 'overview', fields: [{ name: 'Age', type: 'text' }] });
    const b = await api.create({ name: 'B', templateId: saved.id });
    expect((await api.profile(b.id)).sections.map((s) => s.name)).toEqual(names);
    expect(suggestionsFor('Core Identity', [saved], []).map((f) => f.name)).toEqual(['Age']);
    await api.removeTemplate(saved.id);
    expect((await api.templates()).length).toBe(BUILTIN_TEMPLATES.length);
    await expect(api.applyTemplate(a.id, saved.id)).rejects.toThrow();
  });
});

describe('the library', () => {
  async function cast() {
    const w = await world();
    const { api, codex, manuscript, p } = w;
    const m = manuscript.forProject(p.id);
    const one = await m.create('chapter', null, 'One');
    const two = await m.create('chapter', null, 'Two');
    const three = await m.create('chapter', null, 'Three');
    const kael = await api.create({ name: 'Kaelen Draven', epithet: 'The Oathbreaker', roles: ['Protagonist'], summary: 'A disgraced knight.' });
    const sera = await api.create({ name: 'Seraphina Valdris', roles: ['Antagonist', 'Supporting'], summary: 'First daughter of House Valdris.' });
    const tam = await api.create({ name: 'Old Tam', roles: ['Minor'] });
    const guild = await codex.forProject(p.id).create('faction', 'Ash Guild');
    await codex.forProject(p.id).link(kael.id, guild.id, 'Captain');
    await api.identity(kael.id, { aliases: ['Kael'], status: 'Alive', tags: ['knight'] });
    await api.identity(sera.id, { status: 'Alive', tags: ['noble', 'knight'] });
    await api.identity(tam.id, { status: 'Deceased' });
    const [kid] = (await api.profile(kael.id)).sections;
    await api.addField(kael.id, kid.id, { name: 'Species', value: 'Human' });
    await api.addField(kael.id, kid.id, { name: 'Occupation', value: 'Warrior' });
    const [sid] = (await api.profile(sera.id)).sections;
    await api.addField(sera.id, sid.id, { name: 'Species', value: 'Elf' });
    await api.addField(sera.id, sid.id, { name: 'Backstory', type: 'longtext', value: 'Raised among wolves.' });
    await m.saveDoc(one.id, link('Sera', sera.id), { words: 1, characters: 4 });
    await m.saveDoc(two.id, link('Kael', kael.id), { words: 1, characters: 4 });
    await m.saveDoc(three.id, link('Sera', sera.id), { words: 1, characters: 4 });
    const read = async () => {
      const [entries, nodes] = [await codex.forProject(p.id).list(), await m.list()];
      const list = listCharacters(entries, await api.profiles(), await codex.forProject(p.id).links(), nodes, storyOrder(nodes).position, (entry) => api.fresh(entry));
      // In the order they were made, whatever order the database hands them back in.
      list.sort((a, b) => a.profile.order - b.profile.order);
      return { list, names: (l: typeof list) => l.map((x) => x.entry.name.split(' ')[0]), nameOf: (id: string) => entries.find((e) => e.id === id)?.name };
    };
    return { ...w, kael, sera, tam, one, two, three, read };
  }

  it('finds a character by name, alias, epithet, summary, tag, role, faction or a field, and only ever real ones', async () => {
    const { read } = await cast();
    const { list, names, nameOf } = await read();
    const find = (query: string) => names(list.filter((l) => matches(l, query, nameOf)));
    expect(find('')).toEqual(['Kaelen', 'Seraphina', 'Old']);
    expect(find('The Oathbreaker')).toEqual(['Kaelen']);
    expect(find('oathbreaker kael')).toEqual(['Kaelen']);
    expect(find('KAEL')).toEqual(['Kaelen']);
    expect(find('valdris')).toEqual(['Seraphina']);
    expect(find('knight')).toEqual(['Kaelen', 'Seraphina']);
    expect(find('antagonist')).toEqual(['Seraphina']);
    expect(find('ash guild')).toEqual(['Kaelen']);
    expect(find('warrior')).toEqual(['Kaelen']);
    expect(find('elf')).toEqual(['Seraphina']);
    // Long passages are not searched here (that is what project search is for), and nothing is invented.
    expect(find('wolves')).toEqual([]);
    expect(find('zzz')).toEqual([]);
  });

  it('filters by role, status, tag, species, occupation, faction and first appearance; a character can hold two roles', async () => {
    const { api, tam, read, two } = await cast();
    const { list, names } = await read();
    const only = (filters: Partial<typeof NO_FILTERS>) => names(list.filter((l) => passes(l, { ...NO_FILTERS, ...filters })));
    expect(only({ role: 'Antagonist' })).toEqual(['Seraphina']);
    expect(only({ role: 'supporting' })).toEqual(['Seraphina']);
    expect(only({ status: 'Deceased' })).toEqual(['Old']);
    expect(only({ tag: 'knight' })).toEqual(['Kaelen', 'Seraphina']);
    expect(only({ species: 'Elf' })).toEqual(['Seraphina']);
    expect(only({ occupation: 'Warrior' })).toEqual(['Kaelen']);
    expect(only({ faction: 'Ash Guild' })).toEqual(['Kaelen']);
    expect(only({ firstBy: 0 })).toEqual(['Seraphina']);
    expect(only({ firstBy: storyOrder([]).position.get(two.id) ?? 1 })).toEqual(['Kaelen', 'Seraphina']);
    expect(facets(list)).toEqual({ roles: ['Antagonist', 'Minor', 'Protagonist', 'Supporting'], statuses: ['Alive', 'Deceased'], tags: ['knight', 'noble'], species: ['Elf', 'Human'], occupations: ['Warrior'], factions: ['Ash Guild'] });

    // Archived characters are out of the library until asked for, and nothing else about them changes.
    await api.setArchived(tam.id, true);
    const again = (await read()).list;
    expect(names(again.filter((l) => passes(l, NO_FILTERS)))).toEqual(['Kaelen', 'Seraphina']);
    expect(names(again.filter((l) => passes(l, { ...NO_FILTERS, archived: true })))).toEqual(['Old']);
    await api.setArchived(tam.id, false);
    expect((await api.history(tam.id)).map((h) => h.action).slice(0, 2)).toEqual(['restored', 'archived']);
  });

  it('sorts by name, dates, appearances and the author’s own order', async () => {
    const { api, kael, sera, tam, read } = await cast();
    const { list, names } = await read();
    expect(list.map((l) => [l.entry.name.split(' ')[0], l.linkedIn.length, l.first, l.latest])).toEqual([['Kaelen', 1, 1, 1], ['Seraphina', 2, 0, 2], ['Old', 0, -1, -1]]);
    expect(names(sortCharacters(list, 'name'))).toEqual(['Kaelen', 'Old', 'Seraphina']);
    expect(names(sortCharacters(list, 'first'))).toEqual(['Seraphina', 'Kaelen', 'Old']);
    expect(names(sortCharacters(list, 'latest'))).toEqual(['Seraphina', 'Kaelen', 'Old']);
    expect(names(sortCharacters(list, 'appearances'))).toEqual(['Seraphina', 'Kaelen', 'Old']);
    expect(names(sortCharacters(list, 'custom'))).toEqual(['Kaelen', 'Seraphina', 'Old']);
    await api.reorder([tam.id, sera.id, kael.id]);
    expect(names(sortCharacters((await read()).list, 'custom'))).toEqual(['Old', 'Seraphina', 'Kaelen']);
  });

  it('counts name mentions as whole words, and says nothing more than that', () => {
    const texts = ['Kael drew his sword. "Kaelen!" she cried. The Oathbreaker did not turn.', 'Mikael, not Kael’s brother, laughed. kael.'];
    expect(countMentions(texts, ['Kaelen Draven', 'Kael', 'The Oathbreaker'])).toBe(4);
    expect(countMentions(texts, ['Kael'])).toBe(3);
    expect(countMentions(texts, ['K', ''])).toBe(0);
    expect(countMentions([], ['Kael'])).toBe(0);
    // Punctuation in a name is matched as written, not as a pattern.
    expect(countMentions(['Dr. A.B. Stone and AxB'], ['A.B.'])).toBe(1);
  });
});

describe('secrets, notes and history', () => {
  it('keeps apart what is true, what the character knows, what others know and what the reader knows', async () => {
    const { api } = await world();
    const [kael, mira, tam] = [await api.create({ name: 'Kael' }), await api.create({ name: 'Mira' }), await api.create({ name: 'Tam' })];
    const secret = await api.saveSecret(kael.id, null, { title: 'True heir', description: 'Kael is the king’s son.', self: 'unaware', knows: [tam.id, kael.id], suspects: [mira.id], reader: 'suspects' });
    expect(secret).toMatchObject({ status: 'Hidden', self: 'unaware', knows: [tam.id], suspects: [mira.id], unaware: [], reader: 'suspects' });
    // Mira finds out: she moves from suspecting to knowing, never both.
    const later = await api.saveSecret(kael.id, secret.id, { knows: [tam.id, mira.id], status: 'Partly revealed' });
    expect(later).toMatchObject({ knows: [tam.id, mira.id], suspects: [], status: 'Partly revealed', self: 'unaware', description: 'Kael is the king’s son.' });
    expect((await api.saveSecret(kael.id, secret.id, { unaware: [mira.id] })).knows).toEqual([tam.id]);
    await expect(api.saveSecret(kael.id, null, { title: ' ' })).rejects.toThrow('Give the secret a title.');
    await expect(api.saveSecret(mira.id, secret.id, { title: 'Stolen' })).rejects.toThrow();
    expect((await api.secrets(kael.id)).length).toBe(1);
    expect(await api.secrets(mira.id)).toEqual([]);
    await api.removeSecret(secret.id);
    expect(await api.secrets(kael.id)).toEqual([]);
  });

  it('keeps notes out of the record until the author copies one in', async () => {
    const { api } = await world();
    const marcus = await api.create({ name: 'Marcus' });
    const before = JSON.stringify((await api.entries())[0].fields);
    const note = await api.saveNote(marcus.id, null, { content: 'Maybe make Marcus the prince’s brother', tags: ['idea', 'idea'] });
    expect(note).toMatchObject({ title: 'Maybe make Marcus the prince’s brother', tags: ['idea'], pinned: false });
    await api.saveNote(marcus.id, null, { title: 'Pinned', content: 'Read first.', pinned: true });
    expect((await api.notes(marcus.id)).map((n) => n.title)).toEqual(['Pinned', 'Maybe make Marcus the prince’s brother']);
    // Writing the note changed nothing about Marcus.
    expect(JSON.stringify((await api.entries())[0].fields)).toBe(before);
    await expect(api.saveNote(marcus.id, null, { title: '', content: ' ' })).rejects.toThrow('Write the note first.');

    const [identity] = (await api.profile(marcus.id)).sections;
    await expect(api.promoteNote(note.id, identity.id, '')).rejects.toThrow();
    const field = await api.promoteNote(note.id, identity.id, 'Family');
    expect((await api.entries())[0].fields).toEqual([{ id: field.id, key: 'Family', value: 'Maybe make Marcus the prince’s brother', type: 'longtext' }]);
    expect((await api.notes(marcus.id)).length).toBe(2);
    expect((await api.history(marcus.id))[0]).toMatchObject({ action: 'note', label: 'Family' });
  });

  it('tells a change to the record from an event in the story', async () => {
    const { api, manuscript, p } = await world();
    const marcus = await api.create({ name: 'Marcus' });
    const eighteen = await manuscript.forProject(p.id).create('chapter', null, 'Chapter 18');
    const [identity] = (await api.profile(marcus.id)).sections;
    const job = await api.addField(marcus.id, identity.id, { name: 'Occupation', value: 'Soldier' });
    await api.updateField(marcus.id, job.id, { value: 'Commander' });
    const event = await api.addMilestone(marcus.id, 'Marcus became commander.', eighteen.id);
    await expect(api.addMilestone(marcus.id, ' ')).rejects.toThrow();
    const lines = await api.history(marcus.id);
    expect(lines.filter((h) => h.kind === 'record').map((h) => [h.action, h.label, h.from, h.to])).toEqual([['field', 'Occupation', 'Soldier', 'Commander'], ['created', 'Marcus', '', '']]);
    expect(lines.filter((h) => h.kind === 'story')).toMatchObject([{ text: 'Marcus became commander.', nodeId: eighteen.id }]);
    // Only the author's own story lines can be removed; the record of changes cannot.
    await api.removeMilestone(lines.find((h) => h.action === 'created')!.id);
    await api.removeMilestone(event.id);
    expect((await api.history(marcus.id)).map((h) => h.action)).toEqual(['field', 'created']);
  });
});

describe('archiving and deleting', () => {
  it('says what refers to a character, and deleting removes the character without harming anything else', async () => {
    const { db, api, codex, manuscript, relationships, plot, p } = await world();
    const [kael, mira] = [await api.create({ name: 'Kael' }), await api.create({ name: 'Mira' })];
    const guild = await codex.forProject(p.id).create('faction', 'Ash Guild');
    await codex.forProject(p.id).link(kael.id, guild.id, 'Captain');
    const one = await manuscript.forProject(p.id).create('chapter', null, 'One');
    await manuscript.forProject(p.id).saveDoc(one.id, link('Kael', kael.id), { words: 1, characters: 4 });
    await relationships.forProject(p.id).create(kael.id, mira.id, 'rivals');
    const thread = await plot.forProject(p.id).create('The Heist');
    await plot.forProject(p.id).update(thread.id, { characterIds: [kael.id, mira.id] });
    await api.saveSecret(kael.id, null, { title: 'Heir' });
    const hers = await api.saveSecret(mira.id, null, { title: 'Spy', knows: [kael.id] });
    await api.saveNote(kael.id, null, { content: 'A note.' });
    expect(await api.references(kael.id)).toEqual({ chapters: 1, relationships: 1, events: 0, threads: 1, links: 1, sheets: 0, snapshots: 0, secrets: 1, inSecrets: 1, notes: 1 });

    const text = JSON.stringify((await db.chapterContents.get(one.id))!.doc);
    await api.remove(kael.id);
    expect((await api.entries()).map((e) => e.name)).toEqual(['Mira']);
    for (const table of ['characterProfiles', 'characterSecrets', 'characterNotes', 'characterHistory'] as const) expect((await db.table(table).toArray()).some((row: { entryId: string }) => row.entryId === kael.id), table).toBe(false);
    expect(await db.characterRelations.count()).toBe(0);
    // Everything else is as it was: the words, the faction, the plot thread, Mira and her secret (which no longer names Kael).
    expect(JSON.stringify((await db.chapterContents.get(one.id))!.doc)).toBe(text);
    expect((await codex.forProject(p.id).list()).map((e) => e.name).sort()).toEqual(['Ash Guild', 'Mira']);
    expect((await db.plotThreads.get(thread.id))!.title).toBe('The Heist');
    expect((await db.characterSecrets.get(hers.id))!).toMatchObject({ title: 'Spy', knows: [] });
    // Deleting a character from the Codex cleans up the same way.
    await api.saveNote(mira.id, null, { content: 'x' });
    await codex.forProject(p.id).remove(mira.id);
    expect([await db.characterProfiles.count(), await db.characterSecrets.count(), await db.characterNotes.count(), await db.characterHistory.count()]).toEqual([0, 0, 0, 0]);
  });

  it('travels with the project: a copy has its own characters, profiles, secrets and notes, pointing at its own records', async () => {
    const { db, api, projects, characters } = await world();
    const [kael, mira] = [await api.create({ name: 'Kael', epithet: 'The Oathbreaker' }), await api.create({ name: 'Mira' })];
    await api.saveSecret(kael.id, null, { title: 'Heir', knows: [mira.id] });
    await api.saveNote(kael.id, null, { content: 'A note.' });
    const copy = await projects.duplicate((await db.projects.toArray())[0].id);
    const theirs = characters.forProject(copy.id);
    const cast = await theirs.entries();
    expect(cast.map((e) => e.name).sort()).toEqual(['Kael', 'Mira']);
    const kael2 = cast.find((e) => e.name === 'Kael')!;
    expect(kael2.id).not.toBe(kael.id);
    expect(await theirs.profile(kael2.id)).toMatchObject({ epithet: 'The Oathbreaker', entryId: kael2.id });
    expect((await theirs.secrets(kael2.id))[0].knows).toEqual([cast.find((e) => e.name === 'Mira')!.id]);
    expect((await theirs.notes(kael2.id)).length).toBe(1);
    // The original is untouched by changes to the copy.
    await theirs.identity(kael2.id, { epithet: 'Changed' });
    expect((await api.profile(kael.id)).epithet).toBe('The Oathbreaker');
  });

  it('shares a character’s layout with reviewers but keeps secrets, notes and history to the authors', () => {
    const row = { id: 'x', projectId: 'p', entryId: 'e' };
    for (const table of ['characterSecrets', 'characterNotes', 'characterHistory']) {
      expect(visible('coauthor', 'm', `${table}:x`, row, () => null)).toBe(row);
      for (const role of ['editor', 'reader', 'viewer'] as const) expect(visible(role, 'm', `${table}:x`, row, () => null), `${role} ${table}`).toBeNull();
    }
    expect(visible('editor', 'm', 'characterProfiles:x', row, () => null)).toBe(row);
    expect(visible('reader', 'm', 'characterProfiles:x', row, () => null)).toBeNull();
    expect(refusal('editor', 'm', 'characterProfiles:x', row, { ...row, epithet: 'Mine' })).not.toBeNull();
    expect(refusal('coauthor', 'm', 'characterProfiles:x', row, { ...row, epithet: 'Ours' })).toBeNull();
  });
});

describe('knowledge records', () => {
  async function heir() {
    const w = await world();
    const [kael, mira, tam] = [await w.api.create({ name: 'Kael' }), await w.api.create({ name: 'Mira' }), await w.api.create({ name: 'Tam' })];
    const m = w.manuscript.forProject(w.p.id);
    const [one, three, five] = [await m.create('chapter', null, 'One'), await m.create('chapter', null, 'Three'), await m.create('chapter', null, 'Five')];
    const secret = await w.api.saveSecret(kael.id, null, { title: 'True heir', description: 'Kael is the old king’s son.', self: 'unaware', suspects: [mira.id], knows: [tam.id] });
    return { ...w, kael, mira, tam, one, three, five, secret };
  }

  it('a change is a new record: the earlier ones stay, in the order they happen to the character', async () => {
    const { api, kael, mira, tam, one, three, five, secret } = await heir();
    await api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'unaware', nodeId: one.id });
    await api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'partial', belief: ' that he is noble-born ', nodeId: three.id, how: 'the signet ring' });
    const last = await api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'knows', nodeId: five.id, how: 'a confession', fromId: tam.id });
    // Mira's first record took her out of "suspects"; what the list said is kept as her first record, with no chapter.
    expect(last.records!.map((r) => [r.state, r.belief, r.nodeId])).toEqual([['suspects', '', null], ['unaware', '', one.id], ['partial', 'that he is noble-born', three.id], ['knows', '', five.id]]);
    expect([last.suspects, last.knows]).toEqual([[], [tam.id]]);
    // Editing a record changes only that record.
    const edited = await api.saveRecord(kael.id, secret.id, last.records![2].id, { belief: 'that he is of royal blood' });
    expect(edited.records!.map((r) => r.belief)).toEqual(['', '', 'that he is of royal blood', '']);
    expect(edited.records![2].id).toBe(last.records![2].id);
  });

  it('a first record that agrees with the list adds nothing extra; the secret’s own character keeps their answer', async () => {
    const { api, kael, tam, one, secret } = await heir();
    const s = await api.saveRecord(kael.id, secret.id, null, { characterId: tam.id, state: 'knows', nodeId: one.id });
    expect(s.records!.map((r) => r.state)).toEqual(['knows']);
    const own = await api.saveRecord(kael.id, secret.id, null, { characterId: kael.id, state: 'knows', nodeId: one.id });
    expect([own.self, own.records!.length]).toEqual(['unaware', 2]);
  });

  it('checks what it is given, and keeps someone with records out of the lists', async () => {
    const { api, db, kael, mira, tam, secret } = await heir();
    await expect(api.saveRecord(kael.id, secret.id, null, { characterId: 'nobody', state: 'knows' })).rejects.toThrow('That character is not in this project.');
    await expect(api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'wonders' as never })).rejects.toThrow('Choose what they know.');
    await expect(api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'knows', fromId: mira.id })).rejects.toThrow('Someone cannot learn it from themself.');
    await expect(api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'knows', nodeId: 'elsewhere' })).rejects.toThrow('That chapter or scene is not in this novel.');
    await db.timelineEvents.add({ id: 'theirs', projectId: 'another' } as never);
    await expect(api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'knows', eventId: 'theirs' })).rejects.toThrow('That event is not in this novel.');
    await expect(api.saveRecord(mira.id, secret.id, null, { characterId: tam.id, state: 'knows' })).rejects.toThrow('That secret is no longer there.');
    await api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'knows' });
    await expect(api.saveSecret(kael.id, secret.id, { unaware: [mira.id] })).rejects.toThrow('add a record to it instead');
    // Nothing failed half-way: the list's "suspects" became her first record, then "knows".
    expect((await db.characterSecrets.get(secret.id))!.records!.map((r) => r.state)).toEqual(['suspects', 'knows']);
  });

  it('moves a record among the character’s own; removes records and marks', async () => {
    const { api, kael, mira, tam, one, three, secret } = await heir();
    await api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'suspects', nodeId: one.id });
    await api.saveRecord(kael.id, secret.id, null, { characterId: tam.id, state: 'knows', nodeId: one.id });
    let s = await api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'knows', nodeId: three.id });
    const [first, middle, last] = s.records!;
    s = await api.moveRecord(kael.id, secret.id, last.id, -1);
    expect(s.records!.map((r) => r.id)).toEqual([last.id, middle.id, first.id]);
    // Already first of hers: nothing moves.
    expect((await api.moveRecord(kael.id, secret.id, last.id, -1)).records!.map((r) => r.id)).toEqual([last.id, middle.id, first.id]);
    await expect(api.saveNeed(kael.id, secret.id, null, { characterId: mira.id, note: 'blackmails' })).rejects.toThrow('Say where they act on it');
    s = await api.saveNeed(kael.id, secret.id, null, { characterId: mira.id, nodeId: one.id, note: ' blackmails the steward ' });
    expect(s.needs!.map((n) => [n.characterId, n.nodeId, n.note])).toEqual([[mira.id, one.id, 'blackmails the steward']]);
    s = await api.removeNeed(kael.id, secret.id, s.needs![0].id);
    s = await api.removeRecord(kael.id, secret.id, first.id);
    expect([s.needs, s.records!.length]).toEqual([[], 2]);
  });

  it('deleting a character takes their records and marks, and leaves who they told knowing', async () => {
    const { api, db, kael, mira, tam, one, secret } = await heir();
    await api.saveRecord(kael.id, secret.id, null, { characterId: tam.id, state: 'knows', nodeId: one.id });
    await api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'knows', nodeId: one.id, fromId: tam.id, how: 'told at the well' });
    await api.saveNeed(kael.id, secret.id, null, { characterId: tam.id, nodeId: one.id });
    expect((await api.references(tam.id)).inSecrets).toBe(1);
    await api.remove(tam.id);
    const s = (await db.characterSecrets.get(secret.id))!;
    expect(s.records!.map((r) => [r.characterId, r.state, r.fromId, r.how])).toEqual([[mira.id, 'suspects', null, ''], [mira.id, 'knows', null, 'told at the well']]);
    expect(s.needs).toEqual([]);
  });

  it('a copy of the novel has the records pointing at its own characters and chapters', async () => {
    const { api, db, projects, characters, kael, mira, tam, one, secret } = await heir();
    await api.saveRecord(kael.id, secret.id, null, { characterId: mira.id, state: 'false', belief: 'a foundling', nodeId: one.id, fromId: tam.id });
    await api.saveNeed(kael.id, secret.id, null, { characterId: mira.id, nodeId: one.id });
    const copy = await projects.duplicate((await db.projects.toArray())[0].id);
    const theirs = characters.forProject(copy.id);
    const cast = new Map((await theirs.entries()).map((e) => [e.name, e.id]));
    const chapter = (await db.chapters.where('projectId').equals(copy.id).toArray()).find((c) => c.title === 'One')!;
    const s = (await theirs.secrets(cast.get('Kael')!))[0];
    expect(s.records!.map((r) => [r.characterId, r.state, r.belief, r.nodeId, r.fromId])).toEqual([[cast.get('Mira'), 'suspects', '', null, null], [cast.get('Mira'), 'false', 'a foundling', chapter.id, cast.get('Tam')]]);
    expect(s.needs!.map((n) => [n.characterId, n.nodeId])).toEqual([[cast.get('Mira'), chapter.id]]);
  });

  it('older secrets with no records read as empty and save as before', async () => {
    const { api, db, kael, secret } = await heir();
    const { records: _r, needs: _n, ...old } = (await db.characterSecrets.get(secret.id))!;
    await db.characterSecrets.put(old as never);
    expect((await api.saveSecret(kael.id, secret.id, { status: 'Hinted' })).status).toBe('Hinted');
    expect((await api.removeRecord(kael.id, secret.id, 'none')).records).toEqual([]);
  });
});
