import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { graphSummary, placeRows, plotRows, progressionRows, relationshipRows, timelineRows } from './summaries';
import { VIEWS, viewFor } from './views';

let n = 0;
async function world() {
  const db = new NovelDB(`visualize-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  for (const register of [registerManuscript, registerCodex, registerRelationships, registerTimeline, registerPlot]) register(registry);
  const p = await projects.create({ title: 'Ashfall' });
  const other = await projects.create({ title: 'Another novel' });
  const services = (id: string) => ({
    ms: createManuscriptService(db, projects.contentChanged).forProject(id),
    codex: createCodexService(db, projects.contentChanged).forProject(id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(id),
    plot: createPlotService(db, projects.contentChanged).forProject(id),
    relationships: createRelationshipService(db, projects.contentChanged).forProject(id),
    connections: createConnectionService(db, projects.contentChanged).forProject(id),
  });
  return { db, p, other, ...services(p.id), there: services(other.id), model: async (id = p.id) => (await loadModel(db, id))! };
}

describe('the views on offer', () => {
  it('lists the seventeen views, and falls back to the first for an unknown address', () => {
    expect(VIEWS.map((v) => v.label)).toEqual(['Timeline', 'Story vs reading order', 'Relationship map', 'Plot board', 'Structure and pacing', 'Knowledge graph', 'Places', 'Character progression', 'Character history', 'Character appearances', 'Secrets and knowledge', 'Records by kind', 'Ability paths', 'Journeys', 'Factions', 'Ownership', 'Charts']);
    expect(viewFor('places').key).toBe('places');
    expect([viewFor(undefined).key, viewFor('nonsense').key]).toEqual(['timeline', 'timeline']);
  });
});

describe('what each view lists', () => {
  it('is empty for a new novel, with nothing borrowed from another', async () => {
    const w = await world();
    await w.there.timeline.create('Somewhere else');
    await w.there.codex.create('location', 'Another place');
    const model = await w.model();
    expect([timelineRows(model), relationshipRows(model), plotRows(model), placeRows(model), progressionRows(model, [])]).toEqual([[], [], [], [], []]);
    expect(graphSummary(model)).toEqual({ records: 0, connections: 0, dangling: 0, mostConnected: [] });
  });

  it('lists events by when they happen, undated ones last, each with where the reader meets it', async () => {
    const w = await world();
    const one = await w.ms.create('chapter', null, 'Arrival');
    const two = await w.ms.create('chapter', null, 'The gate');
    const late = await w.timeline.create('The fall');
    const early = await w.timeline.create('The founding');
    await w.timeline.create('A rumour');
    await w.timeline.update(late.id, { when: { precision: 'exact', year: 20, month: null, day: null, hour: null, minute: null }, nodeIds: [one.id] });
    await w.timeline.update(early.id, { when: { precision: 'approximate', year: 1, month: null, season: 'spring' }, nodeIds: [two.id], reveals: [{ nodeId: two.id, role: 'flashback' }] });
    expect(timelineRows(await w.model()).map((r) => [r.title, r.when, r.told])).toEqual([
      ['The founding', 'Spring of Year 1', ['Ch 2: The gate (flashback)']],
      ['The fall', 'Year 20', ['Ch 1: Arrival']],
      ['A rumour', 'Undated', []],
    ]);
  });

  it('lists relationships, threads, connections and progression from the records themselves', async () => {
    const w = await world();
    const one = await w.ms.create('chapter', null, 'One');
    const mira = await w.codex.create('character', 'Mira');
    const orrin = await w.codex.create('character', 'Orrin');
    await w.relationships.create(orrin.id, mira.id, 'mentor-student');
    const thread = await w.plot.create('The heir');
    await w.plot.addBeat(thread.id, { nodeId: one.id, title: 'Found' });
    await w.plot.addBeat(thread.id, { title: 'Not placed yet' });
    const model = await w.model();
    expect(relationshipRows(model)).toEqual([{ id: expect.any(String), between: 'Orrin → Mira', now: 'Mentor / Student', stages: 1 }]);
    expect(plotRows(model)).toEqual([{ id: thread.id, title: 'The heir', status: 'Planned', developments: 2, unplaced: 1, chapters: ['Ch 1: One'] }]);
    const graph = graphSummary(model);
    // One chapter, two characters, one thread; the relationship and the placed development connect them.
    expect([graph.records, graph.connections, graph.dangling]).toEqual([4, 2, 0]);
    expect(graph.mostConnected.map((m) => [m.label, m.count])).toEqual([['Mira', 1], ['One', 1], ['Orrin', 1], ['The heir', 1]]);
    expect(progressionRows(model, [{ entryId: mira.id }, { entryId: mira.id }, { entryId: 'gone' }])).toEqual([{ id: mira.id, name: 'Mira', abilities: 0, snapshots: 2, changes: 0, now: '' }]);
  });

  it('nests places by their located-in connections, counts what happened there, and survives a loop', async () => {
    const w = await world();
    const reach = await w.codex.create('location', 'Northern Reach');
    const keep = await w.codex.create('location', 'Ashen Keep');
    const vault = await w.codex.create('location', 'The Vault');
    const loopA = await w.codex.create('location', 'Mirror Hall');
    const loopB = await w.codex.create('location', 'Echo Room');
    const inside = async (a: { id: string }, b: { id: string }) => w.connections.create({ from: { type: 'entry', id: a.id }, to: { type: 'entry', id: b.id }, type: 'located-in' });
    await inside(keep, reach);
    await inside(vault, keep);
    await inside(loopA, loopB);
    await inside(loopB, loopA);
    const siege = await w.timeline.create('The siege');
    await w.timeline.update(siege.id, { locationId: keep.id });
    expect(placeRows(await w.model()).map((r) => [r.name, r.depth, r.events])).toEqual([
      ['Echo Room', 0, 0],
      ['Mirror Hall', 0, 0],
      ['Northern Reach', 0, 0],
      ['Ashen Keep', 1, 1],
      ['The Vault', 2, 0],
    ]);
  });
});
