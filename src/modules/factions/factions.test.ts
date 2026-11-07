import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createBranchingService } from '@/modules/branching/service';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import type { Anchor } from '@/modules/model/validity';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { withHistory } from '@/modules/timeline/histories';
import { createHistoryService, registerHistories } from '@/modules/timeline/historyService';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { ownedItems, ownershipOf } from './ownership';
import { factionAt, factionNetwork, factionsOf, factionTies } from './ties';

let n = 0;
let db: NovelDB;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`factions-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerCharacters(registry);
  registerHistories(registry);
});

const year = (y: number): Anchor => ({ kind: 'date', when: { precision: 'exact', year: y, month: null, day: null, hour: null, minute: null } });

async function world() {
  const p = await projects.create({ title: 'Factions' });
  const codexService = createCodexService(db, projects.contentChanged);
  const manuscript = createManuscriptService(db, projects.contentChanged);
  const s = {
    codex: codexService.forProject(p.id),
    characters: createCharacterService(db, codexService, projects.contentChanged).forProject(p.id),
    ms: manuscript.forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    connections: createConnectionService(db, projects.contentChanged).forProject(p.id),
    histories: createHistoryService(db, projects.contentChanged).forProject(p.id),
    branching: createBranchingService(db, projects, manuscript),
  };
  const [mira, orrin, smith, king] = [await s.characters.create({ name: 'Mira' }), await s.characters.create({ name: 'Orrin' }), await s.characters.create({ name: 'The Smith' }), await s.characters.create({ name: 'The King' })];
  const [guild, crown] = [await s.codex.create('faction', 'The Guild'), await s.codex.create('faction', 'The Crown')];
  const docks = await s.codex.create('location', 'The Docks');
  const regalia = await s.codex.create('item', 'The Ember Crown');
  const cup = await s.codex.create('item', 'A plain cup');
  const model = async (id = p.id) => (await loadModel(db, id))!;
  return { p, ...s, mira, orrin, smith, king, guild, crown, docks, regalia, cup, model };
}
const e = (id: string) => ({ type: 'entry' as const, id });

describe('item ownership over time', () => {
  /** Made by the Smith in Year 1, given to the King in Year 5, stolen by Mira at the theft (Year 10), lost in Year 12, found by Orrin in Year 15. */
  async function crownHistory(w: Awaited<ReturnType<typeof world>>) {
    await w.connections.create({ from: e(w.regalia.id), to: e(w.smith.id), type: 'created-by', validity: { from: year(1), until: null } });
    const made = await w.connections.create({ from: e(w.smith.id), to: e(w.regalia.id), type: 'owns', how: 'made', validity: { from: year(1), until: null } });
    const given = await w.connections.change(made.id, year(5), { from: e(w.king.id), how: 'given' });
    const theft = await w.timeline.create('The theft');
    await w.timeline.update(theft.id, { when: { precision: 'exact', year: 10, month: 6, day: 1, hour: null, minute: null } });
    const stolen = await w.connections.change(given.id, { kind: 'event', eventId: theft.id }, { from: e(w.mira.id), how: 'stolen' });
    await w.connections.end(stolen.id, year(12), 'lost');
    await w.connections.create({ from: e(w.orrin.id), to: e(w.regalia.id), type: 'owns', how: 'found', validity: { from: year(15), until: null } });
    return { theft };
  }

  it('each holding in order, how it began and how it passed on; who made it; a stretch with no owner known', async () => {
    const w = await world();
    await crownHistory(w);
    const o = ownershipOf(await w.model(), w.regalia.id)!;
    expect(o.makers).toEqual([{ name: 'The Smith', when: 'Year 1' }]);
    expect(o.holdings.map((h) => [h.holderName, h.how, h.began, h.ended, h.endHow])).toEqual([
      ['The Smith', 'made', 'Year 1', 'Year 5', 'given to The King'],
      ['The King', 'given', 'Year 5', 'At “The theft”', 'stolen by Mira'],
      ['Mira', 'stolen', 'At “The theft”', 'Year 12', 'lost'],
      ['Orrin', 'found', 'Year 15', null, ''],
    ]);
    expect(o.unknown).toEqual(['Not known between Year 12 (lost) and Year 15']);
    expect(o.now).toEqual({ state: 'held', holders: ['Orrin'], words: 'Held by Orrin.' });
  });

  it('where it stands at a point: held, or not known; nothing is assumed to last', async () => {
    const w = await world();
    await crownHistory(w);
    const model = await w.model();
    expect(ownershipOf(model, w.regalia.id, year(7))!.now.holders).toEqual(['The King']);
    // At the theft itself it changes hands: either may hold it, said as such.
    expect(ownershipOf(model, w.regalia.id, { kind: 'event', eventId: (await w.timeline.list()).find((x) => x.name === 'The theft')!.id })!.now.words).toBe('Perhaps held by The King and Mira (it changes hands at this point, or a time cannot be compared with it).');
    expect(ownershipOf(model, w.regalia.id, year(13))!.now).toEqual({ state: 'unknown', holders: [], words: 'Who holds it then is not recorded.' });
    // Ended with nothing after it: the end of the story says how it ended.
    const w2 = await world();
    const held = await w2.connections.create({ from: e(w2.mira.id), to: e(w2.regalia.id), type: 'owns', validity: { from: year(3), until: null } });
    await w2.connections.end(held.id, year(4), 'destroyed');
    expect(ownershipOf(await w2.model(), w2.regalia.id)!.now).toEqual({ state: 'ended', holders: [], words: 'Destroyed (Year 4, by Mira).' });
  });

  it('unknown ownership: no owner recorded, and a holding with no time, are said as such', async () => {
    const w = await world();
    expect(ownershipOf(await w.model(), w.cup.id)!.now).toEqual({ state: 'none', holders: [], words: 'No owner recorded.' });
    await w.connections.create({ from: e(w.orrin.id), to: e(w.cup.id), type: 'owns' });
    const o = ownershipOf(await w.model(), w.cup.id)!;
    expect([o.holdings[0].timeless, o.holdings[0].began, o.now.holders]).toEqual([true, 'no time given', ['Orrin']]);
    expect(ownedItems(await w.model()).map((i) => i.name)).toEqual(['A plain cup', 'The Ember Crown']);
  });

  it('branch-specific: in an alternate history without the theft, the King keeps it, and Mira’s holding does not happen', async () => {
    const w = await world();
    const { theft } = await crownHistory(w);
    const history = await w.histories.create({ name: 'Mercy' });
    await w.histories.removeEvent(history.id, theft.id);
    const model = withHistory(await w.model(), new Map([[history.id, (await w.histories.get(history.id))!]]), history.id);
    const o = ownershipOf(model, w.regalia.id)!;
    const mira = o.holdings.find((h) => h.holderName === 'Mira')!;
    expect([mira.inThisTimeline, mira.began]).toEqual([false, 'at an event this timeline does not have']);
    expect(o.holdings.find((h) => h.holderName === 'The King')!.endHow).toBe('the event it ends at does not happen in this timeline, so it goes on');
    expect(o.now.holders).toEqual(['The King', 'Orrin']);
    // The main timeline is unchanged.
    expect(ownershipOf(await w.model(), w.regalia.id)!.now.holders).toEqual(['Orrin']);
  });

  it('branch-specific: a forked timeline keeps its own ownership; changing it there leaves the original as it was', async () => {
    const w = await world();
    const one = await w.ms.create('chapter', null, 'Chapter 1');
    const held = await w.connections.create({ from: e(w.king.id), to: e(w.regalia.id), type: 'owns', how: 'inherited', validity: { from: year(2), until: null } });
    const fork = await w.branching.fork(w.p.id, one.id, { name: 'What if', status: 'alternate' });
    const there = await w.model(fork.id);
    expect([there.timeline?.status, ownershipOf(there, [...there.entries.values()].find((x) => x.name === 'The Ember Crown')!.id)!.now.holders]).toEqual(['alternate', ['The King']]);
    const forkConnections = createConnectionService(db, projects.contentChanged).forProject(fork.id);
    const forkHeld = there.links.find((l) => l.type === 'owns')!;
    await forkConnections.change(forkHeld.id, year(9), { from: e([...there.entries.values()].find((x) => x.name === 'Mira')!.id), how: 'won' });
    expect(ownershipOf(await w.model(fork.id), forkHeld.toId)!.now.holders).toEqual(['Mira']);
    expect(ownershipOf(await w.model(), w.regalia.id)!.now.holders).toEqual(['The King']);
    expect((await w.model()).links.find((l) => l.id === held.id)!.validity!.until).toBeNull();
  });
});

describe('factions over time', () => {
  /** Mira is in the Guild from Year 3 until she is expelled in Year 8, then joins the Crown; the Guild and the Crown are allies until Year 9, then at war; the Guild controls the Docks; Orrin leads the Guild, no time given; the Guild owes a debt to the King. */
  async function guildHistory(w: Awaited<ReturnType<typeof world>>) {
    const member = await w.connections.create({ from: e(w.mira.id), to: e(w.guild.id), type: 'member-of', validity: { from: year(3), until: null } });
    await w.connections.end(member.id, year(8), 'expelled');
    await w.connections.create({ from: e(w.mira.id), to: e(w.crown.id), type: 'member-of', how: 'recruited', validity: { from: year(8), until: null } });
    await w.connections.create({ from: e(w.guild.id), to: e(w.crown.id), type: 'allied-with', validity: { from: null, until: year(9) } });
    await w.connections.create({ from: e(w.guild.id), to: e(w.crown.id), type: 'at-war-with', validity: { from: year(9), until: null } });
    await w.connections.create({ from: e(w.guild.id), to: e(w.docks.id), type: 'controls', validity: { from: year(2), until: null } });
    await w.connections.create({ from: e(w.orrin.id), to: e(w.guild.id), type: 'leads' });
    await w.connections.create({ from: e(w.guild.id), to: e(w.king.id), type: 'Owes a debt to' });
  }
  const roles = (byRole: Map<string, { otherName: string; timeless: boolean }[]>) => Object.fromEntries([...byRole].map(([role, ties]) => [role, ties.map((t) => `${t.otherName}${t.timeless ? ' (no time given)' : ''}`)]));

  it('members, leaders, allies, rivals, territory and the author’s own ties, as they stand at each point', async () => {
    const w = await world();
    await guildHistory(w);
    const model = await w.model();
    expect(roles(factionAt(model, w.guild.id, year(5)).byRole)).toEqual({ member: ['Mira'], ally: ['The Crown'], territory: ['The Docks'], leader: ['Orrin (no time given)'], other: ['The King (no time given)'] });
    expect(roles(factionAt(model, w.guild.id, year(10)).byRole)).toEqual({ territory: ['The Docks'], rival: ['The Crown'], leader: ['Orrin (no time given)'], other: ['The King (no time given)'] });
    expect(factionAt(model, w.guild.id, year(10)).notNow).toBe(2);
    expect(roles(factionAt(model, w.crown.id, 'end').byRole)).toEqual({ member: ['Mira'], rival: ['The Guild'] });
  });

  it('its history: every tie in order, with when and how it began and ended; ties of the author’s own kind in their own words', async () => {
    const w = await world();
    await guildHistory(w);
    const ties = factionTies(await w.model(), w.guild.id);
    const line = (who: string) => ties.find((t) => t.otherName === who && t.role !== 'ally')!;
    expect([line('Mira').words, line('Mira').when]).toEqual(['Mira is a member', 'from Year 3 until Year 8 (expelled)']);
    expect([line('Orrin').words, line('Orrin').when]).toEqual(['Orrin leads it', 'no time given']);
    expect([line('The King').role, line('The King').words]).toEqual(['other', 'Owes a debt to The King']);
    expect(ties.find((t) => t.role === 'ally')!.when).toBe('from the start until Year 9');
    expect(factionTies(await w.model(), w.crown.id).find((t) => t.otherName === 'Mira')!.when).toBe('from Year 8 (recruited)');
  });

  it('what counts as a faction, and the map of factions and what they hold sway over', async () => {
    const w = await world();
    await guildHistory(w);
    const order = await w.codex.create('lore', 'The Silent Order');
    await w.connections.create({ from: e(w.orrin.id), to: e(order.id), type: 'member-of' });
    const model = await w.model();
    expect(factionsOf(model).map((f) => f.name)).toEqual(['The Crown', 'The Guild', 'The Silent Order']);
    const map = factionNetwork(model, 'end');
    expect([map.edges.map((t) => t.link.type).sort(), map.territories.map((t) => t.name)]).toEqual([['at-war-with', 'controls'], ['The Docks']]);
    expect(factionNetwork(model, year(5)).edges.map((t) => t.link.type).sort()).toEqual(['allied-with', 'controls']);
  });
});
