import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, relatedTo } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { connectionsOf, deriveConnections } from '@/modules/model/connections';
import { loadModel } from '@/modules/model/model';
import { validateConnection } from '@/modules/model/validate';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { createSystemsService, registerSystems } from '@/modules/systems/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { createConnectionService, InvalidConnectionError } from './service';
import { connectionType, wordingOf } from './types';

let n = 0;

async function world() {
  const db = new NovelDB(`connections-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerRelationships(registry);
  registerTimeline(registry);
  registerPlot(registry);
  registerSystems(registry);
  const p = await projects.create({ title: 'Ashfall' });
  const codex = createCodexService(db, projects.contentChanged).forProject(p.id);
  const mira = await codex.create('character', 'Mira');
  const orrin = await codex.create('character', 'Orrin');
  const wardens = await codex.create('faction', 'The Wardens');
  const keep = await codex.create('location', 'The Keep');
  return {
    db, projects, p, codex, mira, orrin, wardens, keep,
    connections: createConnectionService(db, projects.contentChanged).forProject(p.id),
    ms: createManuscriptService(db, projects.contentChanged).forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    plot: createPlotService(db, projects.contentChanged).forProject(p.id),
    relationships: createRelationshipService(db, projects.contentChanged).forProject(p.id),
    systems: createSystemsService(db, projects.contentChanged).forProject(p.id),
  };
}

const entry = (x: { id: string }) => ({ type: 'entry' as const, id: x.id });

describe('valid connections', () => {
  it('joins any two records of the project by id, with its kind, wording, notes and canon status', async () => {
    const w = await world();
    const siege = await w.timeline.create('The siege');
    const chapter = await w.ms.create('chapter', null, 'One');
    const thread = await w.plot.create('The heir');
    const member = await w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'member-of', notes: 'Sworn in at sixteen.', canon: 'provisional' });
    await w.connections.create({ from: { type: 'event', id: siege.id }, to: entry(w.keep), type: 'occurred-at' });
    await w.connections.create({ from: { type: 'thread', id: thread.id }, to: { type: 'node', id: chapter.id }, type: 'foreshadowed in' });

    expect(member).toMatchObject({ fromId: w.mira.id, fromType: 'entry', toId: w.wardens.id, toType: 'entry', type: 'member-of', notes: 'Sworn in at sixteen.', canon: 'provisional' });
    expect(member.createdAt).toBeGreaterThan(0);
    expect(member.updatedAt).toBe(member.createdAt);
    // Only ids are stored: no copy of either record.
    expect(Object.keys(member).sort()).toEqual(['canon', 'createdAt', 'fromId', 'fromLabel', 'fromType', 'id', 'notes', 'projectId', 'toId', 'toLabel', 'toType', 'type', 'updatedAt']);

    const model = (await loadModel(w.db, w.p.id))!;
    const links = deriveConnections(model).connections.filter((c) => c.kind === 'link');
    expect(links.map((c) => [c.from.type, c.to.type, c.type, c.label]).sort()).toEqual([
      ['entry', 'entry', 'member-of', 'Member of'],
      ['event', 'entry', 'occurred-at', 'Took place at'],
      ['thread', 'node', 'foreshadowed in', 'foreshadowed in'],
    ].sort());
    for (const c of links) expect(validateConnection(model, c)).toEqual([]);
  });

  it('keeps a kind the author made up exactly as written, through edits, reloads and a project file', async () => {
    const w = await world();
    const oath = await w.connections.create({ from: entry(w.orrin), to: entry(w.mira), type: 'Blood-oath  ', label: 'Sworn to' });
    expect(oath.type).toBe('Blood-oath');
    await w.connections.update(oath.id, { notes: 'Under the ash tree.' });
    expect(connectionType('Blood-oath')).toEqual({ key: 'Blood-oath', label: 'Blood-oath', inverse: null });
    const copy = await w.projects.importSnapshot(JSON.parse(JSON.stringify(await w.projects.exportSnapshot(w.p.id))));
    const [restored] = await createConnectionService(w.db, w.projects.contentChanged).forProject(copy.id).list();
    expect(restored).toMatchObject({ type: 'Blood-oath', fromLabel: 'Sworn to', notes: 'Under the ash tree.' });
    expect(restored.fromId).not.toBe(w.orrin.id);
  });
});

describe('invalid ends', () => {
  it('refuses missing, foreign, malformed and self-connected ends, saying which', async () => {
    const w = await world();
    const other = await world();
    const reject = (input: Parameters<typeof w.connections.create>[0]) => expect(w.connections.create(input)).rejects.toBeInstanceOf(InvalidConnectionError);
    await reject({ from: entry(w.mira), to: entry({ id: 'no-such-entry' }) });
    await reject({ from: entry(w.mira), to: entry(other.mira) });
    await reject({ from: entry(w.mira), to: entry(w.mira) });
    await reject({ from: { type: 'chapter' as never, id: 'x' }, to: entry(w.mira) });
    await reject({ from: { type: 'ability', id: 'not-a-pair' }, to: entry(w.mira) });
    await reject({ from: { type: 'event', id: w.mira.id }, to: entry(w.keep) });
    await expect(w.connections.create({ from: entry(w.mira), to: entry({ id: 'gone' }) })).rejects.toThrow('The second end (entry gone) is not in this project.');
    await w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'member-of' });
    await expect(w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'member-of' })).rejects.toThrow('That connection already exists.');
    // A different kind between the same two is a different connection.
    await w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'leads' });
    expect(await w.connections.list()).toHaveLength(2);
  });
});

describe('direction', () => {
  it('lets each side say what it thinks, and never borrows one side’s words for the other', async () => {
    const w = await world();
    await w.connections.create({ from: entry(w.mira), to: entry(w.orrin), type: 'considers-rival' });
    await w.connections.create({ from: entry(w.orrin), to: entry(w.mira), type: 'considers-friend' });
    const seen = async (who: { id: string }) => {
      const { connections } = deriveConnections((await loadModel(w.db, w.p.id))!);
      // Mine first, then theirs; the order rows are read in does not matter.
      return connectionsOf(connections, entry(who)).map((c) => ({ other: c.other.id, label: c.label, theirLabel: c.theirLabel, outgoing: c.outgoing })).sort((a, b) => Number(b.outgoing) - Number(a.outgoing));
    };
    expect(await seen(w.mira)).toEqual([
      { other: w.orrin.id, label: 'Considers a rival', theirLabel: '', outgoing: true },
      { other: w.orrin.id, label: '', theirLabel: 'Considers a friend', outgoing: false },
    ]);
    expect(await seen(w.orrin)).toEqual([
      { other: w.mira.id, label: 'Considers a friend', theirLabel: '', outgoing: true },
      { other: w.mira.id, label: '', theirLabel: 'Considers a rival', outgoing: false },
    ]);
  });

  it('reads a fact’s plain converse from the other end, and a mutual kind the same both ways', () => {
    expect(wordingOf({ type: 'owns', fromLabel: '', toLabel: '' })).toEqual({ forward: 'Owns', backward: 'Owned by', reciprocal: false });
    expect(wordingOf({ type: 'allied-with', fromLabel: '', toLabel: '' })).toEqual({ forward: 'Allied with', backward: 'Allied with', reciprocal: true });
    expect(wordingOf({ type: 'considers-rival', fromLabel: '', toLabel: '' })).toEqual({ forward: 'Considers a rival', backward: '', reciprocal: false });
    // The author's own words win on either side.
    expect(wordingOf({ type: 'owns', fromLabel: 'Inherited', toLabel: 'Heirloom of' })).toEqual({ forward: 'Inherited', backward: 'Heirloom of', reciprocal: false });
    // An untyped related-entries link is exactly as before: only what was written.
    expect(wordingOf({ fromLabel: 'Sister', toLabel: '' })).toEqual({ forward: 'Sister', backward: '', reciprocal: true });
  });

  it('shows typed links between entries in the codex’s related entries, each side in its own words', async () => {
    const w = await world();
    await w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'member-of' });
    await w.connections.create({ from: { type: 'event', id: (await w.timeline.create('The siege')).id }, to: entry(w.keep), type: 'occurred-at' });
    const links = await w.codex.links();
    expect(links).toHaveLength(1);
    const entries = await w.codex.list();
    expect(relatedTo(w.mira.id, entries, links).map((r) => [r.entry.name, r.label, r.theirLabel])).toEqual([['The Wardens', 'Member of', 'Has member']]);
    expect(relatedTo(w.wardens.id, entries, links).map((r) => [r.entry.name, r.label, r.theirLabel])).toEqual([['Mira', 'Has member', 'Member of']]);
    // The plain related-entries link can still be added beside the typed one.
    await w.codex.link(w.mira.id, w.wardens.id, 'Old friends');
    expect(await w.codex.links()).toHaveLength(2);
  });
});

describe('deletion', () => {
  it('takes a record’s connections with it, and leaves the other ends alone', async () => {
    const w = await world();
    const siege = await w.timeline.create('The siege');
    const thread = await w.plot.create('The heir');
    const one = await w.ms.create('chapter', null, 'One');
    const scene = await w.ms.create('scene', one.id, 'The gate');
    const relation = await w.relationships.create(w.mira.id, w.orrin.id);
    await w.connections.create({ from: { type: 'event', id: siege.id }, to: entry(w.keep), type: 'occurred-at' });
    await w.connections.create({ from: { type: 'thread', id: thread.id }, to: entry(w.mira), type: 'involves' });
    await w.connections.create({ from: entry(w.keep), to: { type: 'node', id: scene.id }, type: 'appears-in' });
    await w.connections.create({ from: { type: 'relation', id: relation.id }, to: { type: 'event', id: siege.id }, type: 'caused' });
    const kept = await w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'member-of' });

    await w.timeline.remove(siege.id);
    await w.plot.remove(thread.id);
    await w.ms.remove(one.id);
    expect((await w.connections.list()).map((l) => l.id)).toEqual([kept.id]);
    expect((await w.codex.list()).map((e) => e.name).sort()).toEqual(['Mira', 'Orrin', 'The Keep', 'The Wardens']);

    // Removing a connection removes nothing else.
    await w.connections.remove(kept.id);
    expect(await w.connections.list()).toEqual([]);
    expect(await w.codex.get(w.wardens.id)).toBeDefined();
  });

  it('takes the connections of a deleted character’s relationships, and of abilities taken out of a blueprint', async () => {
    const w = await world();
    const relation = await w.relationships.create(w.mira.id, w.orrin.id);
    const siege = await w.timeline.create('The siege');
    await w.connections.create({ from: { type: 'relation', id: relation.id }, to: { type: 'event', id: siege.id }, type: 'caused' });
    await w.codex.remove(w.orrin.id);
    expect(await w.connections.list()).toEqual([]);

    const system = await w.systems.create();
    await w.systems.update(system.id, () => ({ groups: [{ id: 'g', name: 'Skills', single: false }], items: ['spark', 'flame'].map((id) => ({ id, groupId: 'g', name: id, description: '', parentId: null, rankId: null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '' })) }));
    await w.connections.create({ from: entry(w.mira), to: { type: 'ability', id: `${system.id}/spark` }, type: 'knows-about' });
    const flame = await w.connections.create({ from: entry(w.mira), to: { type: 'ability', id: `${system.id}/flame` }, type: 'knows-about' });
    await w.systems.update(system.id, (c) => ({ items: c.items.filter((i) => i.id !== 'spark') }));
    expect((await w.connections.list()).map((l) => l.id)).toEqual([flame.id]);
    await w.systems.remove(system.id);
    expect(await w.connections.list()).toEqual([]);
  });

  it('carries ability ends into a copy of the project, with the new blueprint id', async () => {
    const w = await world();
    const system = await w.systems.create();
    await w.systems.update(system.id, () => ({ groups: [{ id: 'g', name: 'Skills', single: false }], items: [{ id: 'spark', groupId: 'g', name: 'Spark', description: '', parentId: null, rankId: null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '' }] }));
    await w.connections.create({ from: entry(w.mira), to: { type: 'ability', id: `${system.id}/spark` }, type: 'knows-about' });
    const copy = await w.projects.duplicate(w.p.id);
    const [link] = await createConnectionService(w.db, w.projects.contentChanged).forProject(copy.id).list();
    const [newSystem] = await createSystemsService(w.db, w.projects.contentChanged).forProject(copy.id).list();
    expect(newSystem.id).not.toBe(system.id);
    expect(link.toId).toBe(`${newSystem.id}/spark`);
    const { dangling } = deriveConnections((await loadModel(w.db, copy.id))!);
    expect(dangling).toEqual([]);
  });
});
