import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import type { StoryNode } from '@/modules/manuscript/types';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { createSystemsService, registerSystems } from '@/modules/systems/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { connectionsOf, deriveConnections } from './connections';
import { abilityId, buildModel, loadModel, parseRefKey, refKey, resolveRef } from './model';
import type { Connection, ConnectionKind, StoryModel } from './types';
import { validateConnection, validateRecord, validateRef } from './validate';

let n = 0;

async function world() {
  const db = new NovelDB(`model-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerRelationships(registry);
  registerTimeline(registry);
  registerPlot(registry);
  registerSystems(registry);
  const p = await projects.create({ title: 'Ashfall' });
  return {
    db,
    p,
    ms: createManuscriptService(db, projects.contentChanged).forProject(p.id),
    codex: createCodexService(db, projects.contentChanged).forProject(p.id),
    relationships: createRelationshipService(db, projects.contentChanged).forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    plot: createPlotService(db, projects.contentChanged).forProject(p.id),
    systems: createSystemsService(db, projects.contentChanged).forProject(p.id),
  };
}

/** A small story with one of every connection the app records today. */
async function story() {
  const w = await world();
  const one = await w.ms.create('chapter', null, 'One');
  const scene = await w.ms.create('scene', one.id, 'The gate');
  const two = await w.ms.create('chapter', null, 'Two');
  const mira = await w.codex.create('character', 'Mira');
  const orrin = await w.codex.create('character', 'Orrin');
  const keep = await w.codex.create('location', 'The Keep');
  const wardens = await w.codex.create('faction', 'The Wardens');
  const sword = await w.codex.create('item', 'Ashblade');
  await w.codex.setOwnFields(wardens.id, [{ id: 'f-leader', key: 'Leader', value: mira.id, type: 'reference' }]);
  await w.codex.link(orrin.id, mira.id, 'Rival');
  const mentor = await w.relationships.create(orrin.id, mira.id, 'mentor-student');
  await w.db.chapters.update(scene.id, { mentions: [mira.id] });
  await w.ms.updatePlan(two.id, { entityIds: [orrin.id] });
  const siege = await w.timeline.create('The siege');
  const fall = await w.timeline.create('The fall');
  await w.timeline.update(siege.id, { locationId: keep.id, characters: [{ id: mira.id, age: 19 }], entryIds: [sword.id], nodeIds: [two.id] });
  await w.timeline.update(fall.id, { afterId: siege.id, when: { precision: 'relative', anchorId: siege.id, amount: 2, unit: 'days', direction: 'after' } });
  const thread = await w.plot.create('The heir');
  await w.plot.update(thread.id, { characterIds: [mira.id], locationIds: [keep.id], targetNodeId: two.id });
  const beat = await w.plot.addBeat(thread.id, { nodeId: scene.id, title: 'Found at the gate' });
  const system = await w.systems.create();
  await w.systems.update(system.id, () => ({ groups: [{ id: 'g-skills', name: 'Skills', single: false }], items: [blank('i-root', 'Spark', null), blank('i-flame', 'Flame', 'i-root')] }));
  const sheet = await w.systems.addSheet(system.id, mira.id);
  await w.systems.updateSheet(sheet.id, () => ({ itemIds: ['i-flame'] }));
  const model = (await loadModel(w.db, w.p.id))!;
  return { ...w, model, one, scene, two, mira, orrin, keep, wardens, sword, mentor, siege, fall, thread, beat, system, sheet };
}

const blank = (id: string, name: string, parentId: string | null) => ({ id, groupId: 'g-skills', name, description: '', parentId, rankId: null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '' });
const pairs = (connections: Connection[], kind: ConnectionKind) => connections.filter((c) => c.kind === kind).map((c) => [refKey(c.from), refKey(c.to), c.label]);

describe('shared records', () => {
  it('reads every record by its id and names it as it is now, without copying it', async () => {
    const s = await story();
    expect(resolveRef(s.model, { type: 'node', id: s.scene.id })).toEqual({ found: true, view: { ref: { type: 'node', id: s.scene.id }, label: 'The gate', kind: 'scene' } });
    expect(resolveRef(s.model, { type: 'entry', id: s.keep.id })).toMatchObject({ found: true, view: { label: 'The Keep', kind: 'location' } });
    expect(resolveRef(s.model, { type: 'entry', id: s.wardens.id })).toMatchObject({ view: { kind: 'faction' } });
    expect(resolveRef(s.model, { type: 'event', id: s.siege.id })).toMatchObject({ view: { label: 'The siege', kind: 'event' } });
    expect(resolveRef(s.model, { type: 'thread', id: s.thread.id })).toMatchObject({ view: { label: 'The heir', kind: 'thread' } });
    expect(resolveRef(s.model, { type: 'relation', id: s.mentor.id })).toMatchObject({ view: { label: 'Orrin and Mira', kind: 'relation' } });
    expect(resolveRef(s.model, { type: 'ability', id: abilityId(s.system.id, 'i-flame') })).toMatchObject({ view: { label: 'Flame', kind: 'ability' } });
    // The model holds the stored rows themselves, not copies with other ids.
    expect(s.model.entries.get(s.mira.id)!.id).toBe(s.mira.id);
    expect(s.model.project.id).toBe(s.p.id);
  });

  it('answers “not found” for a deleted record or another project’s, and never throws', async () => {
    const s = await story();
    const other = await world();
    const stranger = await other.codex.create('character', 'Stranger');
    expect(resolveRef(s.model, { type: 'entry', id: stranger.id })).toEqual({ found: false, ref: { type: 'entry', id: stranger.id } });
    expect(resolveRef(s.model, { type: 'ability', id: `${s.system.id}/gone` }).found).toBe(false);
    await s.codex.remove(s.keep.id);
    const after = (await loadModel(s.db, s.p.id))!;
    expect(resolveRef(after, { type: 'entry', id: s.keep.id }).found).toBe(false);
    expect(await loadModel(s.db, 'no-such-project')).toBeNull();
  });

  it('turns refs into strings and back for URLs, rejecting anything else', () => {
    expect(refKey({ type: 'entry', id: 'abc' })).toBe('entry:abc');
    expect(parseRefKey('ability:sys/item')).toEqual({ type: 'ability', id: 'sys/item' });
    expect(parseRefKey('chapter:abc')).toBeNull();
    expect(parseRefKey('entry:')).toBeNull();
    expect(parseRefKey('nonsense')).toBeNull();
  });
});

describe('typed connections', () => {
  it('reads each kind of connection from where the author made it, with its own wording', async () => {
    const s = await story();
    const { connections, dangling } = deriveConnections(s.model);
    const e = (x: { id: string }) => `entry:${x.id}`;
    const node = (x: { id: string }) => `node:${x.id}`;
    expect(dangling).toEqual([]);
    expect(pairs(connections, 'part-of')).toEqual([[node(s.scene), node(s.one), 'Part of']]);
    expect(pairs(connections, 'mentioned')).toEqual([[e(s.mira), node(s.scene), 'Mentioned in']]);
    expect(pairs(connections, 'present')).toEqual([[e(s.orrin), node(s.two), 'Present in']]);
    expect(pairs(connections, 'link')).toEqual([[e(s.orrin), e(s.mira), 'Rival']]);
    expect(pairs(connections, 'relationship')).toEqual([[e(s.orrin), e(s.mira), 'Mentor']]);
    expect(connections.find((c) => c.kind === 'relationship')).toMatchObject({ directed: true, reverseLabel: 'Student', source: { table: 'characterRelations', id: s.mentor.id } });
    expect(pairs(connections, 'field')).toEqual([[e(s.wardens), e(s.mira), 'Leader']]);
    expect(pairs(connections, 'participant')).toEqual([[e(s.mira), `event:${s.siege.id}`, 'Takes part in']]);
    expect(pairs(connections, 'involved')).toEqual([[e(s.sword), `event:${s.siege.id}`, 'Involved in']]);
    expect(pairs(connections, 'occurs-at')).toEqual([[`event:${s.siege.id}`, e(s.keep), 'Takes place at']]);
    expect(pairs(connections, 'told-in')).toEqual([[`event:${s.siege.id}`, node(s.two), 'Told in']]);
    expect(pairs(connections, 'follows')).toEqual([[`event:${s.fall.id}`, `event:${s.siege.id}`, 'Comes after']]);
    expect(pairs(connections, 'dated-from')).toEqual([[`event:${s.fall.id}`, `event:${s.siege.id}`, 'Dated from']]);
    expect(pairs(connections, 'thread-entry')).toEqual([[`thread:${s.thread.id}`, e(s.mira), 'Involves'], [`thread:${s.thread.id}`, e(s.keep), 'Involves']]);
    expect(pairs(connections, 'beat')).toEqual([[`thread:${s.thread.id}`, node(s.scene), 'Found at the gate']]);
    expect(pairs(connections, 'resolves-in')).toEqual([[`thread:${s.thread.id}`, node(s.two), 'Meant to resolve in']]);
    expect(pairs(connections, 'holds')).toEqual([[e(s.mira), `ability:${s.system.id}/i-flame`, 'Has']]);
    expect(pairs(connections, 'branches-from')).toEqual([[`ability:${s.system.id}/i-flame`, `ability:${s.system.id}/i-root`, 'Branches from']]);
    // Every connection fits its contract.
    for (const c of connections) expect(validateConnection(s.model, c)).toEqual([]);
  });

  it('keeps each side’s wording apart, so a one-sided link never reads as mutual', async () => {
    const s = await story();
    const { connections } = deriveConnections(s.model);
    const link = (from: { id: string }) => connectionsOf(connections, { type: 'entry', id: from.id }).filter((c) => c.connection.kind === 'link');
    expect(link(s.orrin)).toEqual([expect.objectContaining({ other: { type: 'entry', id: s.mira.id }, label: 'Rival', theirLabel: '', outgoing: true })]);
    expect(link(s.mira)).toEqual([expect.objectContaining({ other: { type: 'entry', id: s.orrin.id }, label: '', theirLabel: 'Rival', outgoing: false })]);
    const mentorship = (from: { id: string }) => connectionsOf(connections, { type: 'entry', id: from.id }).find((c) => c.connection.kind === 'relationship')!;
    expect(mentorship(s.orrin)).toMatchObject({ label: 'Mentor', theirLabel: 'Student', outgoing: true });
    expect(mentorship(s.mira)).toMatchObject({ label: 'Student', theirLabel: 'Mentor', outgoing: false });
  });

  it('keeps connection ids through renames and reorders, so a selection survives', async () => {
    const s = await story();
    const before = deriveConnections(s.model).connections.map((c) => c.id).sort();
    await s.codex.update(s.mira.id, { name: 'Mira Vale' });
    await s.ms.update(s.scene.id, { title: 'The broken gate' });
    await s.ms.nudge(s.two.id, -1);
    await s.plot.update(s.thread.id, { title: 'The lost heir' });
    const after = (await loadModel(s.db, s.p.id))!;
    expect(deriveConnections(after).connections.map((c) => c.id).sort()).toEqual(before);
    expect(resolveRef(after, { type: 'entry', id: s.mira.id })).toMatchObject({ view: { label: 'Mira Vale' } });
  });

  it('reports a connection whose end was deleted, with what is missing, instead of dropping it', async () => {
    const s = await story();
    // Deleting an entry removes its codex links and relationships; events and threads still name it.
    await s.codex.remove(s.keep.id);
    const { connections, dangling } = deriveConnections((await loadModel(s.db, s.p.id))!);
    expect(connections.some((c) => c.to.id === s.keep.id)).toBe(false);
    expect(dangling.map((d) => [d.connection.kind, d.missing])).toEqual([
      ['occurs-at', [{ type: 'entry', id: s.keep.id }]],
      ['thread-entry', [{ type: 'entry', id: s.keep.id }]],
    ]);
  });
});

describe('contracts and older data', () => {
  it('reads rows written before later lists existed, as empty lists', () => {
    const old = { id: 'n1', projectId: 'p', parentId: null, kind: 'chapter', title: 'One', order: 0, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: 0, updatedAt: 0 } as StoryNode;
    const model = buildModel({
      project: { id: 'p' } as StoryModel['project'],
      nodes: [old],
      plans: [{ id: 'n1', projectId: 'p' } as never],
      entries: [{ id: 'e1', projectId: 'p', category: 'character', name: 'Mira' } as never],
      schemas: [],
      links: [],
      relations: [{ id: 'r1', projectId: 'p', fromId: 'e1', toId: 'e2' } as never],
      events: [{ id: 'v1', projectId: 'p', name: 'Siege', when: { precision: 'unknown' } } as never],
      threads: [{ id: 't1', projectId: 'p', title: 'Heir', status: 'active' } as never],
      systems: [{ id: 's1', projectId: 'p', name: 'Old' } as never],
      sheets: [{ id: 'h1', projectId: 'p', systemId: 's1', entryId: 'e1' } as never],
    });
    expect(model.nodes.get('n1')!.mentions).toEqual([]);
    expect(model.entries.get('e1')!.fields).toEqual([]);
    expect(model.events.get('v1')).toMatchObject({ characters: [], entryIds: [], nodeIds: [], afterId: null, locationId: null });
    expect(model.threads.get('t1')).toMatchObject({ beats: [], characterIds: [], locationIds: [], targetNodeId: null });
    expect(model.relations.get('r1')!.stages).toEqual([]);
    const { connections, dangling } = deriveConnections(model);
    expect(connections).toEqual([]);
    // The relationship names a character that is not there: reported, not hidden.
    expect(dangling.map((d) => d.connection.kind)).toEqual(['relationship']);
  });

  it('checks the fields a record must have, and accepts records that only lack optional ones', () => {
    expect(validateRecord('node', { id: 'n1', projectId: 'p', kind: 'scene', title: '', parentId: 'c1', order: 2 })).toEqual([]);
    expect(validateRecord('node', { id: 'n1', projectId: 'p', kind: 'page', title: 'x', parentId: null, order: 0 })).toEqual(['kind “page” is not one of volume, act, arc, chapter, scene']);
    expect(validateRecord('entry', { id: 'e1', projectId: 'p', category: 'custom-spells', name: 'Ward' })).toEqual([]);
    expect(validateRecord('entry', { id: '', projectId: 'p', category: 'character' })).toEqual(['id is missing or not an id', 'name is missing or not a string']);
    expect(validateRecord('event', { id: 'v1', projectId: 'p', name: 'Siege', when: { precision: 'someday' } })).toEqual(['when has no known precision']);
    expect(validateRecord('relation', { id: 'r1', projectId: 'p', fromId: 'e1', toId: 'e1' })).toEqual(['a relationship joins a character to themself']);
    expect(validateRecord('ability', { id: 'i1', groupId: 'g1', name: 'Spark' })).toEqual([]);
    expect(validateRecord('thread', null)).toEqual(['is not a record']);
  });

  it('checks refs and connections against their contracts', async () => {
    const s = await story();
    expect(validateRef({ type: 'entry', id: s.mira.id })).toEqual([]);
    expect(validateRef({ type: 'character', id: 'x' })).toEqual(['type “character” is not one of node, entry, event, thread, relation, ability']);
    expect(validateRef({ type: 'ability', id: 'flame' })).toEqual(['an ability id is “<systemId>/<itemId>”']);
    const wrongEnds: Connection = { id: 'x', kind: 'occurs-at', from: { type: 'entry', id: s.mira.id }, to: { type: 'node', id: s.one.id }, label: '', directed: true, source: { table: 'timelineEvents', id: 'x' } };
    expect(validateConnection(s.model, wrongEnds)).toEqual(['“occurs-at” starts from: event (here: entry)', '“occurs-at” leads to: entry (here: node)']);
    const toItself: Connection = { ...wrongEnds, kind: 'link', from: { type: 'entry', id: s.mira.id }, to: { type: 'entry', id: s.mira.id } };
    expect(validateConnection(s.model, toItself)).toEqual(['joins a record to itself']);
    const toNothing: Connection = { ...toItself, to: { type: 'entry', id: 'gone' } };
    expect(validateConnection(s.model, toNothing)).toEqual(['to: entry gone does not exist']);
    expect(validateConnection(s.model, { ...toItself, kind: 'blood-oath' as never })).toEqual(['kind “blood-oath” is not known']);
  });
});
