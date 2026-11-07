import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry, type ProjectRegistry } from '@/core/projectRegistry';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { deriveConnections } from '@/modules/model/connections';
import { loadModel } from '@/modules/model/model';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { createStructureService, registerStructure } from '@/modules/structure/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { brokenReferences, duplicateCandidates, normalizeName, statusOf, unresolvedFields, withoutReference } from './rules';
import { createIntegrityService } from './service';

let n = 0;
let db: NovelDB;
let registry: ProjectRegistry;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`integrity-${++n}`);
  registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerPlot(registry);
  registerRelationships(registry);
  registerCharacters(registry);
  registerStructure(registry);
});

async function services(projectId: string) {
  const codex = createCodexService(db, projects.contentChanged);
  return {
    ms: createManuscriptService(db, projects.contentChanged).forProject(projectId),
    codex: codex.forProject(projectId),
    characters: createCharacterService(db, codex, projects.contentChanged).forProject(projectId),
    timeline: createTimelineService(db, projects.contentChanged).forProject(projectId),
    plot: createPlotService(db, projects.contentChanged).forProject(projectId),
    relationships: createRelationshipService(db, projects.contentChanged).forProject(projectId),
    connections: createConnectionService(db, projects.contentChanged).forProject(projectId),
    structure: createStructureService(db, projects.contentChanged).forProject(projectId),
    integrity: createIntegrityService(db, registry, projects.contentChanged).forProject(projectId),
  };
}

const linked = (entryId: string, text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'entityLink', attrs: { entryId } }] }] }] });

/**
 * Mira and Orrin (characters), the Keep (a place), Chapter 1 (where Mira is linked in the text, appears, and the
 * siege is told) and Chapter 2; the siege at the Keep with both; the quest involving Mira and developing in
 * Chapter 1; a marker on Chapter 1; Orrin owns the Keep.
 */
async function world() {
  const p = await projects.create({ title: 'Integrity' });
  const s = await services(p.id);
  const [mira, orrin] = [await s.characters.create({ name: 'Mira' }), await s.characters.create({ name: 'Orrin' })];
  const keep = await s.codex.create('location', 'The Keep');
  const [one, two] = [await s.ms.create('chapter', null, 'Chapter 1'), await s.ms.create('chapter', null, 'Chapter 2')];
  await s.ms.saveDoc(one.id, linked(mira.id, 'Mira'), { words: 1, characters: 4 });
  await s.ms.updatePlan(one.id, { appearIds: [mira.id], entityIds: [keep.id] });
  const siege = await s.timeline.create('The siege');
  await s.timeline.update(siege.id, { characters: [{ id: mira.id, age: null }, { id: orrin.id, age: null }], locationId: keep.id, nodeIds: [one.id, two.id] });
  const quest = await s.plot.create('The quest');
  await s.plot.update(quest.id, { characterIds: [mira.id] });
  await s.plot.addBeat(quest.id, { title: 'Setting out', nodeId: one.id });
  const marker = await s.structure.save(null, { kind: 'Inciting incident', nodeId: one.id });
  await s.connections.create({ from: { type: 'entry', id: orrin.id }, to: { type: 'entry', id: keep.id }, type: 'owns', canon: 'provisional' });
  return { p, s, mira, orrin, keep, one, two, siege, quest, marker };
}
const report = async (projectId: string) => brokenReferences((await loadModel(db, projectId))!, await createStructureService(db, projects.contentChanged).forProject(projectId).list());

describe('connection statuses', () => {
  it('a stored connection’s status reads as confirmed, provisional, disputed or invalid; other connections have none', () => {
    expect([statusOf({ kind: 'link' }), statusOf({ kind: 'link', canon: 'provisional' }), statusOf({ kind: 'link', canon: 'conflicting' }), statusOf({ kind: 'link', canon: 'retconned' }), statusOf({ kind: 'link', canon: 'non-canon' }), statusOf({ kind: 'told-in' })]).toEqual(['confirmed', 'provisional', 'disputed', 'invalid', 'invalid', null]);
  });
});

describe('broken references, after deleting', () => {
  it('a clean novel has none', async () => {
    const w = await world();
    expect(await report(w.p.id)).toEqual([]);
  });

  it('deleting a chapter: what pointed at it is found, said for what it is, and each can be taken out without losing the rest', async () => {
    const w = await world();
    await w.s.ms.remove(w.one.id);
    const broken = await report(w.p.id);
    expect(broken.map((b) => [b.table, b.missing.type])).toEqual(expect.arrayContaining([['timelineEvents', 'node'], ['plotThreads', 'node'], ['structureMarkers', 'node']]));
    for (const b of broken) await w.s.integrity.removeReference(b.table, b.rowId, b.missing.id);
    expect(await report(w.p.id)).toEqual([]);
    // The beat is kept, unplaced; the event keeps its other chapter, its cast and its place; the marker stays, with no chapter.
    expect((await w.s.plot.get(w.quest.id))!.beats.map((b) => [b.title, b.nodeId])).toEqual([['Setting out', null]]);
    expect((await db.timelineEvents.get(w.siege.id))!).toMatchObject({ nodeIds: [w.two.id], locationId: w.keep.id });
    expect((await db.structureMarkers.get(w.marker.id))!).toMatchObject({ kind: 'Inciting incident', nodeId: null });
  });

  it('deleting an entry from the Codex: references left behind are found and can be taken out', async () => {
    const w = await world();
    await w.s.codex.remove(w.keep.id);
    const broken = await report(w.p.id);
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.every((b) => b.missing.id === w.keep.id)).toBe(true);
    for (const b of broken) await w.s.integrity.removeReference(b.table, b.rowId, b.missing.id);
    expect(await report(w.p.id)).toEqual([]);
    expect((await db.timelineEvents.get(w.siege.id))!).toMatchObject({ locationId: null, characters: [{ id: w.mira.id, age: null }, { id: w.orrin.id, age: null }] });
  });

  it('taking out a reference changes only that reference', () => {
    const event = { id: 'e', characters: [{ id: 'gone', age: 3 }, { id: 'kept', age: null }], nodeIds: ['gone', 'n'], locationId: 'gone', when: { precision: 'relative', anchorId: 'gone' } };
    expect(withoutReference(event, 'gone')).toEqual({ id: 'e', characters: [{ id: 'kept', age: null }], nodeIds: ['n'], locationId: null, when: { precision: 'relative', anchorId: null } });
    expect(withoutReference({ fields: [{ id: 'f', type: 'references', value: 'a\ngone\nb' }, { id: 'g', type: 'reference', value: 'gone' }] }, 'gone')).toEqual({ fields: [{ id: 'f', type: 'references', value: 'a\nb' }, { id: 'g', type: 'reference', value: '' }] });
  });

  it('text is not changed from here: a broken link in the text is only reported', async () => {
    const w = await world();
    await expect(w.s.integrity.removeReference('chapters', w.one.id, w.mira.id)).rejects.toThrow('changed where it is kept');
  });
});

describe('renaming and moving break nothing', () => {
  it('renaming an entry, moving it to another category, renaming and moving chapters', async () => {
    const w = await world();
    await w.s.codex.update(w.mira.id, { name: 'Mira of the Keep' });
    await w.s.codex.update(w.keep.id, { category: 'faction' });
    await w.s.ms.update(w.one.id, { title: 'The Beginning' });
    await w.s.ms.move(w.one.id, null, null);
    expect(await report(w.p.id)).toEqual([]);
    const model = (await loadModel(db, w.p.id))!;
    // The link in the text still names Mira by her id, under her new name.
    expect(JSON.stringify(await w.s.ms.loadDoc(w.one.id))).toContain(w.mira.id);
    expect(deriveConnections(model).connections.filter((c) => c.from.id === w.mira.id).map((c) => c.kind).sort()).toEqual(['appearance', 'mentioned', 'participant']);
  });
});

describe('export and import', () => {
  it('a copy made from the archive has every reference pointing at its own records, and none at the original’s', async () => {
    const w = await world();
    const imported = await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(w.p.id, { everything: true }))));
    expect(await report(imported.id)).toEqual([]);
    const rows = JSON.stringify(await Promise.all(registry.collections.map((c) => db.table(c.table).where('projectId').equals(imported.id).toArray())));
    for (const id of [w.mira.id, w.orrin.id, w.keep.id, w.one.id, w.siege.id, w.quest.id, w.marker.id]) expect(rows.includes(id), id).toBe(false);
    const model = (await loadModel(db, imported.id))!;
    expect(deriveConnections(model).connections.map((c) => c.kind).sort()).toEqual(deriveConnections((await loadModel(db, w.p.id))!).connections.map((c) => c.kind).sort());
  });

  it('a reference broken in the original stays reported in the copy: nothing is dropped quietly', async () => {
    const w = await world();
    await w.s.ms.remove(w.two.id);
    const before = (await report(w.p.id)).map((b) => [b.table, b.missing.type]);
    const imported = await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(w.p.id, { everything: true }))));
    expect((await report(imported.id)).map((b) => [b.table, b.missing.type])).toEqual(before);
  });
});

describe('references that name nothing', () => {
  it('a reference field holding words: listed, with the entries of that name, and pointed at one only when chosen', async () => {
    const w = await world();
    await w.s.codex.update(w.keep.id, { fields: [{ id: 'f1', key: 'Owner', value: 'orrin', type: 'reference' }] as never });
    const model = (await loadModel(db, w.p.id))!;
    const found = unresolvedFields(model);
    expect(found.map((f) => [f.entry.name, f.fieldName, f.value, f.suggestions.map((s) => s.name)])).toEqual([['The Keep', 'Owner', 'orrin', ['Orrin']]]);
    // Not counted as broken: words are not an id.
    expect(await report(w.p.id)).toEqual([]);
    await w.s.integrity.pointField(w.keep.id, 'f1', 'orrin', w.orrin.id);
    expect(unresolvedFields((await loadModel(db, w.p.id))!)).toEqual([]);
  });
});

describe('duplicate-looking records', () => {
  it('the same name apart from capitals, accents, punctuation or a leading article, or a name that is another’s alias; same category only', () => {
    expect([normalizeName('The Émber-Blade!'), normalizeName('  ember   blade'), normalizeName('A Keep')]).toEqual(['ember blade', 'ember blade', 'keep']);
    const e = (id: string, name: string, category = 'item') => ({ id, name, category }) as never;
    const pairs = duplicateCandidates([e('1', 'The Ember Blade'), e('2', 'ember blade'), e('3', 'Ember Blade', 'location'), e('4', 'Kael', 'character'), e('5', 'The Oathbreaker', 'character')], new Map([['4', ['Oathbreaker']]]));
    // In name order: Kael's pair, then the blade's.
    expect(pairs.map((p) => [p.a.id, p.b.id, p.rule])).toEqual([['4', '5', 'alias'], ['1', '2', 'same-name']]);
  });
});

describe('merging, only when asked, keeping every reference', () => {
  async function twins() {
    const w = await world();
    const twin = await w.s.characters.create({ name: 'mira ' });
    await w.s.characters.identity(twin.id, { aliases: ['The Wanderer'] });
    // References to the twin everywhere: a link in the text, a plan, an event (also naming Mira), a thread, a connection, a relationship with Mira, a secret.
    await w.s.ms.saveDoc(w.two.id, linked(twin.id, 'mira'), { words: 1, characters: 4 });
    await w.s.ms.updatePlan(w.two.id, { appearIds: [twin.id] });
    await w.s.timeline.update(w.siege.id, { characters: [{ id: w.mira.id, age: null }, { id: twin.id, age: null }] });
    await w.s.plot.update(w.quest.id, { characterIds: [w.mira.id, twin.id] });
    await w.s.connections.create({ from: { type: 'entry', id: twin.id }, to: { type: 'entry', id: w.keep.id }, type: 'knows-about' });
    await w.s.relationships.create(w.mira.id, twin.id, 'friends');
    const secret = await w.s.characters.saveSecret(w.orrin.id, null, { title: 'The vault', knows: [twin.id] });
    return { ...w, twin, secret };
  }

  it('the plan says what would happen, before anything does', async () => {
    const w = await twins();
    const before = JSON.stringify(await Promise.all(registry.collections.map((c) => db.table(c.table).where('projectId').equals(w.p.id).toArray())));
    const plan = await w.s.integrity.mergePlan(w.mira.id, w.twin.id);
    expect(plan.repointed.map((r) => r.table)).toEqual(expect.arrayContaining(['chapterContents', 'chapterPlans', 'chapters', 'characterRelations', 'characterSecrets', 'loreLinks', 'plotThreads', 'timelineEvents']));
    expect(plan.dropped.join(' | ')).toContain('1 relationship between the two');
    expect(plan.dropped.join(' | ')).toContain('the profile layout of “mira”');
    expect(JSON.stringify(await Promise.all(registry.collections.map((c) => db.table(c.table).where('projectId').equals(w.p.id).toArray())))).toBe(before);
    await expect(w.s.integrity.mergePlan(w.mira.id, w.keep.id)).rejects.toThrow('Only entries of the same category');
  });

  it('merged: nothing points at the merged entry any more, nothing is left broken, nothing is doubled', async () => {
    const w = await twins();
    await w.s.integrity.merge(w.mira.id, w.twin.id);
    const rows = JSON.stringify(await Promise.all(registry.collections.map((c) => db.table(c.table).where('projectId').equals(w.p.id).toArray())));
    expect(rows.includes(w.twin.id)).toBe(false);
    expect(await report(w.p.id)).toEqual([]);
    expect(JSON.stringify(await w.s.ms.loadDoc(w.two.id))).toContain(w.mira.id);
    expect((await db.timelineEvents.get(w.siege.id))!.characters).toEqual([{ id: w.mira.id, age: null }]);
    expect((await w.s.plot.get(w.quest.id))!.characterIds).toEqual([w.mira.id]);
    expect((await db.characterSecrets.get(w.secret.id))!.knows).toEqual([w.mira.id]);
    expect((await db.characterRelations.where('projectId').equals(w.p.id).toArray()).length).toBe(0);
    expect((await w.s.connections.of({ type: 'entry', id: w.mira.id })).map((l) => l.type)).toEqual(['knows-about']);
    const profile = await w.s.characters.profile(w.mira.id);
    expect(profile.aliases).toEqual(expect.arrayContaining(['mira', 'The Wanderer']));
    expect((await db.loreEntries.get(w.mira.id))!.notes).toContain('Merged “mira” into this entry.');
    expect(await db.loreEntries.get(w.twin.id)).toBeUndefined();
  });
});
