import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import type { StoryNode } from '@/modules/manuscript/types';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { SYSTEM_PRESETS } from '@/modules/systems/presets';
import { createSystemsService, registerSystems, type SystemsService } from '@/modules/systems/service';
import type { SystemBlueprint } from '@/modules/systems/types';
import { createProgressionService, registerProgression, type ProgressionService } from './service';
import { compare, inStoryOrder, placeOf, resolveSystem, stateAt } from './state';
import type { ProgressSnapshot, SnapshotSystem } from './types';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let codex: CodexService;
let systems: SystemsService;
let progression: ProgressionService;

beforeEach(() => {
  db = new NovelDB(`progression-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerSystems(registry);
  registerProgression(registry);
  manuscript = createManuscriptService(db, projects.contentChanged);
  codex = createCodexService(db, projects.contentChanged);
  systems = createSystemsService(db, projects.contentChanged);
  progression = createProgressionService(db, projects.contentChanged);
});

async function world() {
  const p = await projects.create({ title: 'P' });
  const m = manuscript.forProject(p.id);
  const s = systems.forProject(p.id);
  const g = progression.forProject(p.id);
  const chapters: StoryNode[] = [];
  for (let i = 1; i <= 50; i++) chapters.push(await m.create('chapter', null, `Chapter ${i}`));
  const alex = await codex.forProject(p.id).create('character', 'Alex');
  const blade = await codex.forProject(p.id).create('item', 'Sunblade');
  const game = await s.create(SYSTEM_PRESETS.find((x) => x.id === 'litrpg')!.content);
  const sheet = await s.addSheet(game.id, alex.id);
  const id = (name: string) => (game.items.find((i) => i.name === name) ?? game.variables.find((v) => v.name === name) ?? game.tracks.find((t) => t.name === name))!.id;
  /** Changes a snapshot's standing in the game system. */
  const inGame = (snapshotId: string, change: (current: SnapshotSystem) => Partial<SnapshotSystem>) => g.update(snapshotId, (c) => ({ systems: { ...c.systems, [game.id]: { ...c.systems[game.id], ...change(c.systems[game.id]) } } }));
  const at = async (chapter: number | null) => stateAt(await g.list(), await m.list(), alex.id, chapter === null ? null : chapters[chapter - 1].id);
  const stat = (snapshot: ProgressSnapshot | null, system: SystemBlueprint, name: string) => resolveSystem(system, snapshot?.systems[system.id]).rows.find((r) => r.variable.name === name)!;
  return { p, m, s, g, chapters, alex, blade, game, sheet, id, inGame, at, stat };
}

describe('logging snapshots', () => {
  it('starts the first snapshot from the character\'s sheet, and each later one from the state before it', async () => {
    const { g, s, chapters, alex, blade, game, sheet, id, inGame } = await world();
    await s.updateSheet(sheet.id, () => ({ values: { [id('Strength')]: 12 }, progress: { [id('Level')]: 3 }, itemIds: [id('Warrior')] }));
    const first = await g.create(alex.id, { nodeId: chapters[0].id, label: ' Arrival ' });
    expect(first).toMatchObject({ entryId: alex.id, nodeId: chapters[0].id, label: 'Arrival', gear: [], status: { condition: '', goals: '' } });
    expect(first.systems[game.id]).toEqual({ auto: true, values: { [id('Strength')]: 12 }, progress: { [id('Level')]: 3 }, itemIds: [id('Warrior')], overrides: {} });

    await inGame(first.id, () => ({ progress: { [id('Level')]: 5 } }));
    await g.update(first.id, () => ({ gear: [{ id: '', name: ' Rusty Sword ', kind: 'Weapon', entryId: null, note: '' }, { id: '', name: 'Sunblade', kind: 'Bound artifact', entryId: blade.id, note: '' }, { id: '', name: '  ', kind: 'x', entryId: null, note: '' }], status: { ...first.status, goals: 'Find her brother' } }));
    const later = await g.create(alex.id, { nodeId: chapters[24].id });
    expect(later.systems[game.id].progress).toEqual({ [id('Level')]: 5 });
    expect(later.gear.map((x) => [x.name, x.kind, x.entryId])).toEqual([['Rusty Sword', 'Weapon', null], ['Sunblade', 'Bound artifact', blade.id]]);
    expect(later.status.goals).toBe('Find her brother');
    // A copy, not a link: changing the later one leaves the earlier one alone.
    await inGame(later.id, () => ({ progress: { [id('Level')]: 30 } }));
    await g.update(later.id, (c) => ({ gear: c.gear.slice(1) }));
    const stored = (await g.get(first.id))!;
    expect([stored.systems[game.id].progress[id('Level')], stored.gear.length]).toEqual([5, 2]);
    expect(later.gear[0].id).not.toBe(stored.gear[0].id);
  });

  it('takes a sheet\'s experience and placed points into a snapshot as plain numbers, as of that chapter', async () => {
    const { g, s, chapters, alex, game, sheet, id, inGame } = await world();
    const xp = (amount: number, chapter: number) => ({ id: '', trackId: id('Level'), amount, source: 'Combat', nodeId: chapters[chapter - 1].id, note: '' });
    await s.updateSheet(sheet.id, () => ({ xp: [xp(100, 2), xp(300, 10), xp(600, 30)], spent: { [id('Strength')]: 4 } }));
    // Chapter 5: only the first gain has happened. The placed points are in the attribute.
    const early = await g.create(alex.id, { nodeId: chapters[4].id });
    expect(early.systems[game.id]).toEqual({ auto: true, values: { [id('Strength')]: 14 }, progress: { [id('Level')]: 2 }, itemIds: [], overrides: {} });
    // The author's hand in the earlier snapshot stands; the level moves on with the log.
    await inGame(early.id, (c) => ({ values: { ...c.values, [id('Strength')]: 40 }, overrides: { [id('Agility')]: 99 } }));
    const mid = await g.create(alex.id, { nodeId: chapters[14].id });
    expect(mid.systems[game.id]).toEqual({ auto: true, values: { [id('Strength')]: 40 }, progress: { [id('Level')]: 3 }, itemIds: [], overrides: { [id('Agility')]: 99 } });
    expect((await g.create(alex.id, { nodeId: chapters[39].id })).systems[game.id].progress).toEqual({ [id('Level')]: 4 });
    // Logging more afterwards changes no snapshot already taken.
    await s.updateSheet(sheet.id, (c) => ({ xp: [...(c.xp ?? []), xp(5000, 1)] }));
    expect((await g.get(early.id))!.systems[game.id].progress).toEqual({ [id('Level')]: 2 });
  });

  it('tracks any codex entry, with or without a system', async () => {
    const { g, p, blade } = await world();
    const mira = await codex.forProject(p.id).create('character', 'Mira');
    const plain = await g.create(mira.id);
    expect(plain).toMatchObject({ nodeId: null, systems: {}, gear: [] });
    await g.update(plain.id, (c) => ({ status: { ...c.status, condition: 'Broken left arm\nExhausted' }, notes: 'n' }));
    expect((await g.get(plain.id))!.status.condition).toBe('Broken left arm\nExhausted');
    expect((await g.create(blade.id)).entryId).toBe(blade.id);
    await expect(g.create('nope')).rejects.toThrow('not in this project');
  });
});

describe('the state at a point in the story', () => {
  it('returns the latest snapshot at or before the chapter asked for', async () => {
    const { g, chapters, alex, id, inGame, at, m, game, stat } = await world();
    for (const [chapter, level] of [[25, 20], [1, 1], [50, 60]] as const) {
      const snapshot = await g.create(alex.id, { nodeId: chapters[chapter - 1].id, label: `At ${chapter}` });
      await inGame(snapshot.id, () => ({ progress: { [id('Level')]: level }, itemIds: level >= 20 ? [id('Mage')] : [] }));
    }
    const labels = async (...asked: (number | null)[]) => Promise.all(asked.map(async (c) => (await at(c))?.label ?? null));
    expect(await labels(1, 24, 25, 35, 49, 50, null)).toEqual(['At 1', 'At 1', 'At 25', 'At 25', 'At 25', 'At 50', 'At 50']);
    // "What level and abilities did Alex possess in Chapter 35?"
    const then = resolveSystem(game, (await at(35))!.systems[game.id]);
    expect([then.tracks[0].label, then.items.map((i) => i.item.name), stat(await at(35), game, 'Skill Slots').display]).toEqual(['20 of 100', ['Mage'], '5 slots']);

    expect(inStoryOrder(await g.list(), await m.list(), alex.id).map((x) => x.label)).toEqual(['At 1', 'At 25', 'At 50']);
    // A scene counts where it sits; a prologue snapshot comes before everything.
    const scene = await m.create('scene', chapters[29].id, 'The duel');
    const duel = await g.create(alex.id, { nodeId: scene.id, label: 'After the duel' });
    await g.create(alex.id, { label: 'Origin' });
    expect(duel.systems[game.id].progress[id('Level')]).toBe(20);
    expect(await labels(30, 31)).toEqual(['At 25', 'After the duel']);
    expect(inStoryOrder(await g.list(), await m.list(), alex.id).map((x) => x.label)).toEqual(['Origin', 'At 1', 'At 25', 'After the duel', 'At 50']);
    expect(placeOf(duel, await m.list())).toBe('The duel');
  });

  it('says nothing was logged yet, follows reordering, and keeps a snapshot whose chapter is deleted', async () => {
    const { g, m, chapters, alex, at } = await world();
    const ten = await g.create(alex.id, { nodeId: chapters[9].id, label: 'Ten' });
    expect([(await at(9)), (await at(10))?.label]).toEqual([null, 'Ten']);
    // Chapter 10 is moved to the front: the snapshot goes with it.
    await m.move(chapters[9].id, null, chapters[0].id);
    expect(stateAt(await g.list(), await m.list(), alex.id, chapters[9].id)?.label).toBe('Ten');
    expect(stateAt(await g.list(), await m.list(), alex.id, chapters[0].id)?.label).toBe('Ten');
    await m.remove(chapters[9].id);
    expect((await g.get(ten.id))!.nodeId).toBe(chapters[9].id);
    expect(placeOf((await g.get(ten.id))!, await m.list())).toBe('A chapter that was removed');
    expect(await at(null)).toBeNull();
    // It can be given a place again.
    await g.update(ten.id, () => ({ nodeId: chapters[4].id }));
    expect((await at(null))?.label).toBe('Ten');
  });
});

describe('the calculator is optional, and the author always has the last word', () => {
  it('works out formulas and class effects, and notifies what is now within reach', async () => {
    const { g, chapters, alex, game, id, inGame, stat } = await world();
    const snapshot = await g.create(alex.id, { nodeId: chapters[0].id });
    await inGame(snapshot.id, () => ({ values: { [id('Vitality')]: 20, [id('Intelligence')]: 15 }, progress: { [id('Level')]: 26 }, itemIds: [id('Mage')] }));
    const stored = (await g.get(snapshot.id))!;
    const state = resolveSystem(game, stored.systems[game.id]);
    expect([stat(stored, game, 'Max Health').display, stat(stored, game, 'Intelligence').display, stat(stored, game, 'Max Mana').display]).toEqual(['300 HP', '21', '195 MP']);
    expect(stat(stored, game, 'Intelligence')).toMatchObject({ byHand: false, sources: ['Mage'] });
    // Mage, level 26, intelligence 21: Void Mage and Fireball have opened up; Void Step has not.
    expect(state.available.map((i) => i.name)).toEqual(['Void Mage', 'Fireball']);
  });

  it('lets any value be set by hand, which then wins and feeds the other formulas', async () => {
    const { g, chapters, alex, game, id, inGame, stat } = await world();
    const snapshot = await g.create(alex.id, { nodeId: chapters[0].id });
    await inGame(snapshot.id, () => ({ itemIds: [id('Warrior')], overrides: { [id('Strength')]: 99, [id('Max Health')]: 5000, [id('Skill Slots')]: 1 } }));
    const stored = (await g.get(snapshot.id))!;
    // The Warrior's +5 strength would give 15; the author says 99, and Damage follows the author.
    expect(stat(stored, game, 'Strength')).toMatchObject({ display: '99', byHand: true, systemSays: '15', sources: [] });
    expect(stat(stored, game, 'Damage')).toMatchObject({ display: '148.5', byHand: false });
    expect(stat(stored, game, 'Max Health')).toMatchObject({ display: '5000 HP', byHand: true, systemSays: '230 HP' });
    expect(stat(stored, game, 'Skill Slots')).toMatchObject({ display: '1 slots', systemSays: '3 slots' });
    // A value set by hand that matches the system is still the author's, with nothing to point out.
    await inGame(snapshot.id, (c) => ({ overrides: { ...c.overrides, [id('Agility')]: 10 } }));
    expect(stat((await g.get(snapshot.id))!, game, 'Agility')).toMatchObject({ byHand: true, systemSays: null });
  });

  it('with the calculator off, applies nothing: every value is exactly what was entered', async () => {
    const { g, chapters, alex, game, id, inGame, stat } = await world();
    const snapshot = await g.create(alex.id, { nodeId: chapters[0].id });
    await inGame(snapshot.id, () => ({ auto: false, values: { [id('Strength')]: 14 }, itemIds: [id('Warrior'), id('Void Step')], overrides: { [id('Damage')]: 777 } }));
    const stored = (await g.get(snapshot.id))!;
    const state = resolveSystem(game, stored.systems[game.id]);
    expect(state.auto).toBe(false);
    expect([stat(stored, game, 'Strength').display, stat(stored, game, 'Damage').display, stat(stored, game, 'Max Health').display]).toEqual(['14', '777', '—']);
    expect(state.items.map((i) => [i.item.name, i.unmet, i.effects])).toEqual([['Warrior', [], []], ['Void Step', [], []]]);
    expect(state.available).toEqual([]);
    // Turning it back on loses nothing the author entered.
    await inGame(snapshot.id, () => ({ auto: true }));
    expect(stat((await g.get(snapshot.id))!, game, 'Damage')).toMatchObject({ display: '777', byHand: true, systemSays: '28.5' });
  });

  it('never changes a stored snapshot when the blueprint changes or a state is read', async () => {
    const { g, s, m, chapters, alex, game, id, inGame, stat } = await world();
    const snapshot = await g.create(alex.id, { nodeId: chapters[0].id });
    await inGame(snapshot.id, () => ({ itemIds: [id('Warrior')], overrides: { [id('Max Health')]: 5000 } }));
    const before = JSON.stringify(await g.list());
    await s.update(game.id, (c) => ({ variables: c.variables.map((v) => (v.name === 'Damage' ? { ...v, formula: 'strength * 10' } : v)) }));
    const changed = (await s.get(game.id))!;
    const stored = (await g.get(snapshot.id))!;
    for (let i = 0; i < 3; i++) {
      stateAt(await g.list(), await m.list(), alex.id, null);
      resolveSystem(changed, stored.systems[game.id]);
    }
    expect(JSON.stringify(await g.list())).toBe(before);
    // The worked-out value follows the blueprint; the hand-set one does not move.
    expect([stat(stored, changed, 'Damage').display, stat(stored, changed, 'Max Health').display]).toEqual(['150', '5000 HP']);
  });
});

describe('comparing two snapshots', () => {
  it('shows stat changes, advancement, what was gained and lost, gear and status', async () => {
    const { g, chapters, alex, game, id, inGame } = await world();
    const before = await g.create(alex.id, { nodeId: chapters[19].id, label: 'Before Evolution' });
    await inGame(before.id, () => ({ values: { [id('Strength')]: 14 }, progress: { [id('Level')]: 24 }, itemIds: [id('Mage'), id('Power Strike')] }));
    await g.update(before.id, (c) => ({
      gear: [{ id: '', name: 'Rusty Sword', kind: 'Weapon', entryId: null, note: '' }, { id: '', name: 'Ember Ring', kind: 'Equipped', entryId: null, note: '' }],
      status: { ...c.status, condition: 'Broken left arm\nExhausted', knowledge: 'Knows the prince is alive' },
    }));
    const after = await g.create(alex.id, { nodeId: chapters[20].id, label: 'After Evolution' });
    await inGame(after.id, (c) => ({ values: { [id('Strength')]: 20 }, progress: { [id('Level')]: 25 }, itemIds: [...c.itemIds.filter((x) => x !== id('Power Strike')), id('Void Mage'), id('Fireball'), id('Giant Slayer')] }));
    await g.update(after.id, (c) => ({
      gear: [{ id: '', name: 'ember ring', kind: 'Bound artifact', entryId: null, note: 'fused' }, { id: '', name: 'Sunblade', kind: 'Weapon', entryId: null, note: '' }],
      status: { ...c.status, condition: 'Exhausted', knowledge: 'Knows the prince is alive\nKnows who took him', goals: 'Find the prince' },
    }));
    const [a, b] = [(await g.get(before.id))!, (await g.get(after.id))!];
    const result = compare(a, b, [game]);
    expect(result.same).toBe(false);
    expect(result.advancement).toEqual([{ system: 'The System', name: 'Level', from: '24 of 100', to: '25 of 100' }]);
    expect(Object.fromEntries(result.stats.map((x) => [x.name, `${x.from} → ${x.to} (${x.delta})`]))).toMatchObject({ Strength: '14 → 20 (6)', Intelligence: '16 → 28 (12)', Mana: '90 MP → 180 MP (90)' });
    expect(result.stats.find((x) => x.name === 'Agility')).toBeUndefined();
    expect(result.gained).toEqual([{ group: 'Classes', name: 'Void Mage' }, { group: 'Skills', name: 'Fireball' }, { group: 'Titles', name: 'Giant Slayer' }]);
    expect(result.lost).toEqual([{ group: 'Skills', name: 'Power Strike' }]);
    expect(result.gear).toEqual([
      { change: 'changed', name: 'ember ring', detail: 'Equipped → Bound artifact · fused' },
      { change: 'gained', name: 'Sunblade', detail: 'Weapon' },
      { change: 'lost', name: 'Rusty Sword', detail: 'Weapon' },
    ]);
    expect(result.status).toEqual([
      { dimension: 'condition', label: 'Physical condition & injuries', added: [], removed: ['Broken left arm'] },
      { dimension: 'knowledge', label: 'Knowledge & secrets known', added: ['Knows who took him'], removed: [] },
      { dimension: 'goals', label: 'Personal goals', added: ['Find the prince'], removed: [] },
    ]);
    expect(compare(a, a, [game])).toMatchObject({ same: true, stats: [], gear: [] });
    // Read the other way, gains become losses.
    expect(compare(b, a, [game]).lost.map((x) => x.name)).toEqual(['Void Mage', 'Fireball', 'Giant Slayer']);
  });
});

describe('progression and projects', () => {
  it('keeps snapshots in their project, and carries them through copies and backups', async () => {
    const { p, g, s, chapters, alex, blade, game, id, inGame } = await world();
    const snapshot = await g.create(alex.id, { nodeId: chapters[24].id, label: 'Midpoint' });
    await inGame(snapshot.id, () => ({ progress: { [id('Level')]: 40 }, itemIds: [id('Mage')], overrides: { [id('Damage')]: 500 } }));
    await g.update(snapshot.id, (c) => ({ gear: [{ id: '', name: 'Sunblade', kind: 'Weapon', entryId: blade.id, note: '' }], status: { ...c.status, goals: 'Win' } }));

    const other = progression.forProject((await projects.create({ title: 'Other' })).id);
    expect([await other.list(), await other.get(snapshot.id)]).toEqual([[], undefined]);
    await expect(other.update(snapshot.id, () => ({ label: 'x' }))).rejects.toThrow('not found');
    await expect(other.remove(snapshot.id)).rejects.toThrow('not found');
    await expect(other.create(alex.id)).rejects.toThrow('not in this project');
    // References to another project's chapter, system or item are dropped.
    await g.update(snapshot.id, (c) => ({ systems: { ...c.systems, nope: c.systems[game.id] }, gear: [...c.gear, { id: '', name: 'Ghost', kind: '', entryId: 'nope', note: '' }] }));
    const stored = (await g.get(snapshot.id))!;
    expect([Object.keys(stored.systems), stored.gear.map((x) => x.entryId)]).toEqual([[game.id], [blade.id, null]]);

    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))))).id]) {
      const [copy] = await progression.forProject(projectId).list();
      const [system] = await systems.forProject(projectId).list();
      const entries = await codex.forProject(projectId).list();
      const nodes = await manuscript.forProject(projectId).list();
      expect(copy.id).not.toBe(snapshot.id);
      expect([entries.find((e) => e.id === copy.entryId)?.name, nodes.find((x) => x.id === copy.nodeId)?.title, entries.find((e) => e.id === copy.gear[0].entryId)?.name]).toEqual(['Alex', 'Chapter 25', 'Sunblade']);
      expect(Object.keys(copy.systems)).toEqual([system.id]);
      const state = resolveSystem(system, copy.systems[system.id]);
      expect([state.tracks[0].label, state.items[0].item.name, state.rows.find((r) => r.variable.name === 'Damage')!.display, copy.status.goals]).toEqual(['40 of 100', 'Mage', '500', 'Win']);
      expect(stateAt([copy], nodes, copy.entryId, null)?.label).toBe('Midpoint');
    }
    // Deleting the system leaves the snapshot's other dimensions intact.
    await s.remove(game.id);
    expect((await g.get(snapshot.id))!.gear).toHaveLength(2);
    await g.remove(snapshot.id);
    await projects.remove(p.id);
    expect(await g.list()).toEqual([]);
  });
});
