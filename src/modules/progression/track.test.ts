import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry, type ProjectRegistry } from '@/core/projectRegistry';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { lifeHistory, type HistoryItem } from '@/modules/characters/lifeHistory';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createIntegrityService } from '@/modules/integrity/service';
import { brokenReferences } from '@/modules/integrity/rules';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { connectionsOf, deriveConnections } from '@/modules/model/connections';
import { loadModel } from '@/modules/model/model';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { registerSystems } from '@/modules/systems/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { changeLog, progressAt, progressSummary, UNKNOWN_TIME, whenWords, type ProgressState } from './track';
import { createTrackerService, registerTracker } from './trackService';

let n = 0;
let db: NovelDB;
let registry: ProjectRegistry;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`tracker-${++n}`);
  registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerCharacters(registry);
  registerTracker(registry);
  registerSystems(registry);
});

const year = (y: number) => ({ precision: 'exact' as const, year: y, month: null, day: null, hour: null, minute: null });

/** Mira, Orrin and Pell; the Ember Crown; three chapters; the coronation (Year 10) and the siege (Year 12). Nothing tracked yet. */
async function world() {
  const p = await projects.create({ title: 'Tracked' });
  const codexService = createCodexService(db, projects.contentChanged);
  const s = {
    codex: codexService.forProject(p.id),
    characters: createCharacterService(db, codexService, projects.contentChanged).forProject(p.id),
    ms: createManuscriptService(db, projects.contentChanged).forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    tracker: createTrackerService(db, projects.contentChanged).forProject(p.id),
    integrity: createIntegrityService(db, registry, projects.contentChanged).forProject(p.id),
  };
  const [mira, orrin, pell] = [await s.characters.create({ name: 'Mira' }), await s.characters.create({ name: 'Orrin' }), await s.characters.create({ name: 'Pell' })];
  const crown = await s.codex.create('item', 'Ember Crown');
  const [one, two, three] = [await s.ms.create('chapter', null, 'Chapter 1'), await s.ms.create('chapter', null, 'Chapter 2'), await s.ms.create('chapter', null, 'Chapter 3')];
  const coronation = await s.timeline.create('The coronation');
  await s.timeline.update(coronation.id, { when: year(10) });
  const siege = await s.timeline.create('The siege');
  await s.timeline.update(siege.id, { when: year(12) });
  const model = async (id = p.id) => (await loadModel(db, id))!;
  return { p, ...s, mira, orrin, pell, crown, one, two, three, coronation, siege, model };
}
const node = (id: string) => ({ kind: 'node' as const, nodeId: id });
const event = (id: string) => ({ kind: 'event' as const, eventId: id });
/** A state in words: "Category: value, value" per category, moments and lost things marked. */
const read = (state: ProgressState) =>
  state.categories.map(({ category, lines, moments, lost }) => `${category.name}: ${[...lines.map((l) => (l.subject && l.subject !== l.value ? `${l.subject} ${l.value}` : l.value) + (l.step ? ` (${l.step})` : '') + (l.uncertain.length ? ' (or not: order unknown)' : '')), ...moments.map((m) => `*${m.subject}`), ...lost.map((x) => `-${x}`)].join(', ')}`);

describe('a character with no progression recorded', () => {
  it('in a novel that tracks nothing: no categories, no values, nothing assumed', async () => {
    const w = await world();
    const state = progressAt(await w.model(), w.pell.id, 'end');
    expect(state).toEqual({ categories: [], unplaced: [], untracked: [] });
    expect([progressSummary(state), changeLog(await w.model(), w.pell.id)]).toEqual(['', []]);
  });

  it('in a novel that tracks levels and abilities: still no values, only what could be recorded for them', async () => {
    const w = await world();
    const level = await w.tracker.addPreset('Level');
    await w.tracker.addPreset('Abilities');
    const rank = await w.tracker.saveCategory(null, { name: 'Rank', shape: 'value', characterIds: [w.mira.id] });
    await w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '2', at: null });
    const state = progressAt(await w.model(), w.pell.id, 'end');
    expect(state.categories).toEqual([]);
    expect(state.untracked.map((c) => c.name)).toEqual(['Level', 'Abilities']);
    expect(progressSummary(state)).toBe('');
    // Mira has a level; the rank, set for her alone, is offered to her and to nobody else.
    expect(progressAt(await w.model(), w.mira.id, 'end').untracked.map((c) => c.name)).toEqual(['Abilities', 'Rank']);
    expect(rank.characterIds).toEqual([w.mira.id]);
  });
});

describe('changes over time', () => {
  it('in reading order: what a character is like at each chapter, from the changes up to it', async () => {
    const w = await world();
    const [level, abilities, equipment, milestones] = [await w.tracker.addPreset('Level'), await w.tracker.addPreset('Abilities'), await w.tracker.addPreset('Equipment'), await w.tracker.addPreset('Milestones')];
    const r = (input: Omit<Parameters<typeof w.tracker.record>[0], 'entryId'>) => w.tracker.record({ entryId: w.mira.id, ...input });
    await r({ categoryId: level.id, action: 'set', value: '1', at: null });
    await r({ categoryId: abilities.id, action: 'gain', subject: 'Fire Lance', at: node(w.one.id) });
    await r({ categoryId: milestones.id, action: 'happen', subject: 'First kill', at: node(w.one.id), cost: 'Her sleep' });
    await r({ categoryId: level.id, action: 'set', value: '3', at: node(w.two.id) });
    await r({ categoryId: equipment.id, action: 'gain', refId: w.crown.id, at: node(w.two.id) });
    await r({ categoryId: abilities.id, action: 'lose', subject: 'fire lance', at: node(w.three.id), note: 'Burned out at the gate' });
    const model = await w.model();
    expect(read(progressAt(model, w.mira.id, node(w.one.id)))).toEqual(['Level: 1', 'Abilities: Fire Lance', 'Milestones: *First kill']);
    expect(read(progressAt(model, w.mira.id, node(w.two.id)))).toEqual(['Level: 3', 'Abilities: Fire Lance', 'Equipment: Ember Crown', 'Milestones: *First kill']);
    expect(read(progressAt(model, w.mira.id, node(w.three.id)))).toEqual(['Level: 3', 'Abilities: -fire lance', 'Equipment: Ember Crown', 'Milestones: *First kill']);
    expect(progressSummary(progressAt(model, w.mira.id, 'end'))).toBe('Level 3 · Equipment: Ember Crown · Milestones: First kill');
    // In order of the story; within one chapter, in the order recorded (here, the same millisecond, so compared as a set).
    const log = changeLog(model, w.mira.id);
    expect(log.map((l) => l.when)).toEqual(['Before the story', 'Ch 1: Chapter 1', 'Ch 1: Chapter 1', 'Ch 2: Chapter 2', 'Ch 2: Chapter 2', 'Ch 3: Chapter 3']);
    expect(log.map((l) => [l.when, l.words, l.before]).sort()).toEqual([
      ['Before the story', 'Level set to 1', null],
      ['Ch 1: Chapter 1', 'Gained Fire Lance', null],
      ['Ch 1: Chapter 1', 'First kill', null],
      ['Ch 2: Chapter 2', 'Level set to 3', '1'],
      ['Ch 2: Chapter 2', 'Gained Ember Crown', null],
      ['Ch 3: Chapter 3', 'Lost fire lance', null],
    ].sort());
  });

  it('story time and reading order are never compared: a change at an event is listed, not applied, at a chapter; at the end, an order that cannot be told is said', async () => {
    const w = await world();
    const rank = await w.tracker.saveCategory(null, { name: 'Rank', shape: 'value', ladder: ['Squire', 'Knight', 'Captain'] });
    await w.tracker.record({ entryId: w.mira.id, categoryId: rank.id, action: 'set', value: 'Knight', at: event(w.coronation.id) });
    await w.tracker.record({ entryId: w.mira.id, categoryId: rank.id, action: 'set', value: 'Captain', at: node(w.three.id) });
    const model = await w.model();
    const atTwo = progressAt(model, w.mira.id, node(w.two.id));
    expect([atTwo.categories, atTwo.unplaced.map((c) => c.value)]).toEqual([[], ['Knight']]);
    const atSiege = progressAt(model, w.mira.id, event(w.siege.id));
    expect([read(atSiege), atSiege.unplaced.map((c) => c.value)]).toEqual([['Rank: Knight (2 of 3)'], ['Captain']]);
    expect(read(progressAt(model, w.mira.id, 'end'))).toEqual(['Rank: Captain (3 of 3) (or not: order unknown)']);
    expect(read(progressAt(model, w.mira.id, { kind: 'date', when: year(11) }))).toEqual(['Rank: Knight (2 of 3)']);
    expect(whenWords(event(w.coronation.id), model)).toBe('At “The coronation”');
  });

  it('a change whose time is not known is kept and shown as such: it has happened by the end, and is never placed at a chapter', async () => {
    const w = await world();
    const titles = await w.tracker.addPreset('Titles');
    const change = await w.tracker.record({ entryId: w.orrin.id, categoryId: titles.id, action: 'gain', subject: 'Lord of the Marches' });
    expect(change.at).toEqual(UNKNOWN_TIME);
    const model = await w.model();
    expect(whenWords(change.at, model)).toBe('When is not known');
    expect(progressAt(model, w.orrin.id, node(w.three.id))).toMatchObject({ categories: [], unplaced: [{ id: change.id }] });
    expect(read(progressAt(model, w.orrin.id, 'end'))).toEqual(['Titles: Lord of the Marches']);
  });

  it('a value off its ladder is kept as written, and said', async () => {
    const w = await world();
    const rank = await w.tracker.saveCategory(null, { name: 'Rank', shape: 'value', ladder: ['Squire', 'Knight'] });
    await w.tracker.record({ entryId: w.mira.id, categoryId: rank.id, action: 'set', value: 'Hedge knight', at: null });
    expect(read(progressAt(await w.model(), w.mira.id, 'end'))).toEqual(['Rank: Hedge knight (not one of its steps)']);
  });
});

describe('recording', () => {
  it('a change must fit its category, and name what changed; the values themselves are never judged', async () => {
    const w = await world();
    const [level, attributes, abilities] = [await w.tracker.addPreset('Level'), await w.tracker.addPreset('Attributes'), await w.tracker.addPreset('Abilities')];
    await expect(w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'gain', subject: 'x' })).rejects.toThrow('a value set');
    await expect(w.tracker.record({ entryId: w.mira.id, categoryId: attributes.id, action: 'set', value: '6' })).rejects.toThrow('Say which value changes');
    await expect(w.tracker.record({ entryId: w.mira.id, categoryId: abilities.id, action: 'gain' })).rejects.toThrow('Say what is gained or lost');
    await expect(w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '' })).rejects.toThrow('Say what it is set to');
    const other = await projects.create({ title: 'Elsewhere' });
    const foreign = await createManuscriptService(db, projects.contentChanged).forProject(other.id).create('chapter', null, 'Theirs');
    await expect(w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '9', at: node(foreign.id) })).rejects.toThrow('not in this project');
    expect((await w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: 'over nine thousand', at: null })).value).toBe('over nine thousand');
  });

  it('what is tracked: offered, never imposed; a shape stays once used; a category in use is archived, not removed', async () => {
    const w = await world();
    expect(await w.tracker.categories()).toEqual([]);
    const level = await w.tracker.addPreset('Level');
    expect((await w.tracker.addPreset('Level')).id).toBe(level.id);
    await w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '1', at: null });
    await expect(w.tracker.saveCategory(level.id, { shape: 'held' })).rejects.toThrow('its shape stays');
    await expect(w.tracker.removeCategory(level.id)).rejects.toThrow('Archive it instead');
    await w.tracker.saveCategory(level.id, { archived: true });
    await expect(w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '2' })).rejects.toThrow('archived');
    // Archived, its changes are still read.
    expect(read(progressAt(await w.model(), w.mira.id, 'end'))).toEqual(['Level: 1']);
    const unused = await w.tracker.addPreset('Costs paid');
    await w.tracker.removeCategory(unused.id);
    expect((await w.tracker.categories()).map((c) => c.name)).toEqual(['Level']);
  });
});

describe('connected to the story', () => {
  it('each change is a connection to its chapter or event, and to the codex entry it names', async () => {
    const w = await world();
    const equipment = await w.tracker.addPreset('Equipment');
    await w.tracker.record({ entryId: w.mira.id, categoryId: equipment.id, action: 'gain', refId: w.crown.id, at: event(w.coronation.id) });
    const connections = connectionsOf(deriveConnections(await w.model()).connections, { type: 'entry', id: w.mira.id }).filter((c) => c.connection.kind === 'progress');
    expect(connections.map((c) => [c.other.type, c.connection.label]).sort()).toEqual([['entry', 'Gained'], ['event', 'Changes (Gained Ember Crown) at']]);
  });

  it('when its chapter is deleted, the change is found, and keeps what it says when the reference is taken out; when its codex entry is deleted, it stops linking to it', async () => {
    const w = await world();
    const [level, equipment] = [await w.tracker.addPreset('Level'), await w.tracker.addPreset('Equipment')];
    const atTwo = await w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '3', at: node(w.two.id) });
    const crown = await w.tracker.record({ entryId: w.mira.id, categoryId: equipment.id, action: 'gain', refId: w.crown.id, at: null });
    await w.ms.remove(w.two.id);
    const broken = brokenReferences(await w.model()).filter((b) => b.table === 'progressChanges');
    expect(broken.map((b) => [b.rowId, b.where])).toEqual([[atTwo.id, 'a progression change']]);
    await w.integrity.removeReference('progressChanges', atTwo.id, w.two.id);
    expect(await db.progressChanges.get(atTwo.id)).toMatchObject({ at: UNKNOWN_TIME, value: '3' });
    await w.codex.remove(w.crown.id);
    expect(await db.progressChanges.get(crown.id)).toMatchObject({ refId: null, subject: 'Ember Crown' });
    expect(changeLog(await w.model(), w.mira.id).map((l) => l.words)).toEqual(['Gained Ember Crown', 'Level set to 3']);
  });

  it('each change joins the character’s history where it happens: in reading order, in story time, or with no time known', async () => {
    const w = await world();
    const [level, titles] = [await w.tracker.addPreset('Level'), await w.tracker.addPreset('Titles')];
    await w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '2', at: node(w.two.id), cost: 'A scar' });
    await w.tracker.record({ entryId: w.mira.id, categoryId: titles.id, action: 'gain', subject: 'Knight', at: event(w.coronation.id) });
    await w.tracker.record({ entryId: w.mira.id, categoryId: titles.id, action: 'gain', subject: 'Witch-friend' });
    const h = lifeHistory(await w.model(), w.mira.id)!;
    const progress = (items: HistoryItem[]) => items.filter((i) => i.kind === 'progress').map((i) => [i.when, i.title, i.detail]);
    expect([progress(h.reading), progress(h.story), progress(h.throughout)]).toEqual([[['Ch 2: Chapter 2', 'Level set to 2', 'Level · cost: A scar']], [['At “The coronation”', 'Gained Knight', 'Titles']], [['When is not known', 'Gained Witch-friend', 'Titles']]]);
    // A change at an event is not taking part in it.
    expect(h.story.some((i) => i.kind === 'event')).toBe(false);
  });

  it('a change can name an ability of a system: checked, named by it, connected to it, and pointing at the copy’s own in a copy', async () => {
    const w = await world();
    await db.systems.add({ id: `${w.p.id}-sys`, projectId: w.p.id, name: 'Ember Arts', description: '', variables: [], tracks: [], ranks: [], groups: [{ id: 'g', name: 'Skills', single: false }], items: [{ id: 'lance', groupId: 'g', name: 'Fire Lance', description: '', parentId: null, rankId: null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '' }], matrices: [], createdAt: 0, updatedAt: 0 });
    const abilities = await w.tracker.addPreset('Abilities');
    await expect(w.tracker.record({ entryId: w.mira.id, categoryId: abilities.id, action: 'gain', abilityId: `${w.p.id}-sys/nothing` })).rejects.toThrow('not in any of this project');
    const gained = await w.tracker.record({ entryId: w.mira.id, categoryId: abilities.id, action: 'gain', abilityId: `${w.p.id}-sys/lance`, at: node(w.one.id) });
    expect([gained.subject, gained.abilityId]).toEqual(['Fire Lance', `${w.p.id}-sys/lance`]);
    const seen = connectionsOf(deriveConnections(await w.model()).connections, { type: 'ability', id: `${w.p.id}-sys/lance` });
    expect(seen.map((c) => [c.other.id, c.connection.label])).toEqual([[w.mira.id, 'Gained']]);
    const copy = await projects.duplicate(w.p.id);
    const copied = await w.model(copy.id);
    expect(copied.progress[0].abilityId).not.toBe(gained.abilityId);
    expect(copied.abilities.get(copied.progress[0].abilityId!)?.item.name).toBe('Fire Lance');
  });

  it('a character deleted takes their changes; nobody else’s are touched', async () => {
    const w = await world();
    const level = await w.tracker.addPreset('Level');
    await w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '1', at: null });
    await w.tracker.record({ entryId: w.orrin.id, categoryId: level.id, action: 'set', value: '5', at: null });
    await w.characters.remove(w.mira.id);
    expect((await w.tracker.changes()).map((c) => c.value)).toEqual(['5']);
  });

  it('a copy of the novel has the changes, pointing at its own chapters, events and characters; a fork keeps only what it has reached', async () => {
    const w = await world();
    const level = await w.tracker.addPreset('Level');
    await w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '2', at: node(w.one.id) });
    await w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '4', at: node(w.three.id) });
    await w.tracker.record({ entryId: w.mira.id, categoryId: level.id, action: 'set', value: '3', at: event(w.siege.id) });
    const copy = await projects.duplicate(w.p.id);
    const copied = await w.model(copy.id);
    expect(copied.progress.map((c) => c.value).sort()).toEqual(['2', '3', '4']);
    expect(copied.progress.every((c) => copied.entries.has(c.entryId) && copied.progressCategories.has(c.categoryId) && (c.at?.kind !== 'node' || copied.nodes.has(c.at.nodeId)) && (c.at?.kind !== 'event' || copied.events.has(c.at.eventId)))).toBe(true);
    const fork = await projects.fork(w.p.id, new Set([w.one.id, w.two.id]));
    expect((await w.model(fork.project.id)).progress.map((c) => c.value).sort()).toEqual(['2', '3']);
  });
});
