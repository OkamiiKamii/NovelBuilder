import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { createSystemsService, registerSystems } from '@/modules/systems/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { loadModel } from './model';
import { detailsOf, relatedIds, routeFor } from './navigate';

let n = 0;
async function story() {
  const db = new NovelDB(`navigate-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  for (const register of [registerManuscript, registerCodex, registerRelationships, registerTimeline, registerPlot, registerSystems]) register(registry);
  const p = await projects.create({ title: 'Ashfall' });
  const ms = createManuscriptService(db, projects.contentChanged).forProject(p.id);
  const codex = createCodexService(db, projects.contentChanged).forProject(p.id);
  const timeline = createTimelineService(db, projects.contentChanged).forProject(p.id);
  const plot = createPlotService(db, projects.contentChanged).forProject(p.id);
  const relationships = createRelationshipService(db, projects.contentChanged).forProject(p.id);
  const systems = createSystemsService(db, projects.contentChanged).forProject(p.id);
  const act = await ms.create('act', null, 'Act I');
  const one = await ms.create('chapter', act.id, 'Arrival');
  const two = await ms.create('chapter', act.id, 'The gate');
  const mira = await codex.create('character', 'Mira');
  const orrin = await codex.create('character', 'Orrin');
  const keep = await codex.create('location', 'Ashen Keep');
  const heir = await plot.create('The heir');
  const relation = await relationships.create(orrin.id, mira.id, 'mentor-student');
  const fire = await timeline.create('The fire');
  const siege = await timeline.create('The siege');
  await timeline.update(fire.id, { when: { precision: 'exact', year: 1, month: null, day: null, hour: null, minute: null } });
  await timeline.update(siege.id, { when: { precision: 'exact', year: 10, month: null, day: null, hour: null, minute: null }, characters: [{ id: mira.id, age: 19 }, { id: orrin.id, age: null }], locationId: keep.id, nodeIds: [one.id, two.id], reveals: [{ nodeId: two.id, role: 'flashback' }], threadIds: [heir.id], afterId: fire.id, importance: 'major' });
  const system = await systems.create();
  await systems.update(system.id, () => ({ groups: [{ id: 'g', name: 'Skills', single: false }], items: [{ id: 'spark', groupId: 'g', name: 'Spark', description: 'A small flame.', parentId: null, rankId: null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '' }] }));
  const sheet = await systems.addSheet(system.id, mira.id);
  await systems.updateSheet(sheet.id, () => ({ itemIds: ['spark'] }));
  return { db, projects, p, act, one, two, mira, orrin, keep, heir, relation, fire, siege, system, codex, timeline, model: async () => (await loadModel(db, p.id))! };
}

const items = (details: ReturnType<typeof detailsOf>, title: string) => details!.groups.find((g) => g.title === title)?.items.map((i) => (i.note ? `${i.label} (${i.note})` : i.label));

describe('where a record opens', () => {
  it('opens each kind of record on the page where it is kept, in this novel', async () => {
    const s = await story();
    const model = await s.model();
    const base = `/project/${s.p.id}`;
    expect(routeFor(s.p.id, model, { type: 'entry', id: s.mira.id })).toEqual({ to: `${base}/characters/${s.mira.id}`, label: 'Open character profile' });
    expect(routeFor(s.p.id, model, { type: 'entry', id: s.keep.id })).toEqual({ to: `${base}/codex/${s.keep.id}`, label: 'Open in the Codex' });
    expect(routeFor(s.p.id, model, { type: 'node', id: s.one.id })).toEqual({ to: `${base}/manuscript/${s.one.id}`, label: 'Open in the editor' });
    expect(routeFor(s.p.id, model, { type: 'node', id: s.act.id })).toEqual({ to: `${base}/organizer`, state: { select: s.act.id }, label: 'Open in the Organizer' });
    expect(routeFor(s.p.id, model, { type: 'event', id: s.siege.id })?.to).toBe(`${base}/timeline?event=${s.siege.id}`);
    expect(routeFor(s.p.id, model, { type: 'thread', id: s.heir.id })?.to).toBe(`${base}/plot?thread=${s.heir.id}`);
    expect(routeFor(s.p.id, model, { type: 'relation', id: s.relation.id })?.to).toBe(`${base}/relationships?rel=${s.relation.id}`);
    expect(routeFor(s.p.id, model, { type: 'ability', id: `${s.system.id}/spark` })?.to).toBe(`${base}/characters/systems?system=${s.system.id}`);
    expect(routeFor(s.p.id, model, { type: 'entry', id: 'gone' })).toBeNull();
  });
});

describe('the details of what is selected', () => {
  it('shows an event’s participants, chapters, place, thread and order, each in its own words', async () => {
    const s = await story();
    const d = detailsOf(await s.model(), { type: 'event', id: s.siege.id })!;
    expect(d.view.label).toBe('The siege');
    expect(d.facts).toEqual([{ label: 'When', value: 'Year 10' }, { label: 'Significance', value: 'Major' }, { label: 'Status', value: 'Confirmed' }, { label: 'Canon', value: 'Canon' }]);
    expect(items(d, 'Who takes part')).toEqual(['Mira (Age 19)', 'Orrin']);
    expect(items(d, 'Takes place at')).toEqual(['Ashen Keep']);
    expect(items(d, 'Told in')).toEqual(['Arrival', 'The gate (Flashback in)']);
    expect(items(d, 'Plot threads')).toEqual(['The heir']);
    expect(items(d, 'Comes after')).toEqual(['The fire']);
    expect(items(detailsOf(await s.model(), { type: 'event', id: s.fire.id }), 'Followed by')).toEqual(['The siege']);
  });

  it('shows a character’s events, relationships and abilities, and a relationship’s two characters', async () => {
    const s = await story();
    const model = await s.model();
    const mira = detailsOf(model, { type: 'entry', id: s.mira.id })!;
    expect(mira.facts).toEqual([{ label: 'Kind', value: 'Character' }]);
    expect(items(mira, 'Events they take part in')).toEqual(['The siege (Age 19)']);
    expect(items(mira, 'Relationships')).toEqual(['Orrin (Student)']);
    expect(items(mira, 'Relationship records')).toEqual(['Orrin and Mira']);
    expect(items(mira, 'Abilities')).toEqual(['Spark']);
    expect(items(detailsOf(model, { type: 'entry', id: s.orrin.id }), 'Relationships')).toEqual(['Mira (Mentor)']);
    const tie = detailsOf(model, { type: 'relation', id: s.relation.id })!;
    // Edge details (Prompt 26): which way it reads, and how they feel.
    expect([tie.facts, items(tie, 'Between')]).toEqual([[{ label: 'Now', value: 'Mentor / Student' }, { label: 'Direction', value: 'Orrin (Mentor) → Mira (Student)' }, { label: 'Feeling', value: 'Neutral' }, { label: 'Stages', value: '1' }], ['Mira', 'Orrin']]);
    expect(items(detailsOf(model, { type: 'ability', id: `${s.system.id}/spark` }), 'Held by')).toEqual(['Mira']);
    expect(items(detailsOf(model, { type: 'node', id: s.two.id }), 'Events told here')).toEqual(['The siege (Flashback in)']);
    expect(items(detailsOf(model, { type: 'node', id: s.act.id }), 'Contains')).toEqual(['Arrival', 'The gate']);
  });

  it('answers “not found” for a deleted record or one from another novel, and never throws', async () => {
    const s = await story();
    const other = await s.projects.create({ title: 'Other' });
    const stranger = await createCodexService(s.db, s.projects.contentChanged).forProject(other.id).create('character', 'Stranger');
    expect(detailsOf(await s.model(), { type: 'entry', id: stranger.id })).toBeNull();
    await s.codex.remove(s.keep.id);
    const model = await s.model();
    expect(detailsOf(model, { type: 'entry', id: s.keep.id })).toBeNull();
    expect(routeFor(s.p.id, model, { type: 'entry', id: s.keep.id })).toBeNull();
    // The event that took place there still opens; its place is listed by id as one that no longer exists.
    expect(items(detailsOf(model, { type: 'event', id: s.siege.id }), 'Takes place at')).toBeUndefined();
  });

  it('marks what is connected to the selection, for other views', async () => {
    const s = await story();
    const model = await s.model();
    const around = relatedIds(model, { type: 'event', id: s.siege.id });
    expect([s.siege.id, s.mira.id, s.orrin.id, s.keep.id, s.one.id, s.two.id, s.heir.id, s.fire.id].every((id) => around.has(id))).toBe(true);
    expect(around.has(s.relation.id)).toBe(false);
    const tie = relatedIds(model, { type: 'relation', id: s.relation.id });
    expect([...tie].sort()).toEqual([s.relation.id, s.mira.id, s.orrin.id].sort());
    expect(relatedIds(model, { type: 'entry', id: s.mira.id }).has(s.relation.id)).toBe(true);
  });
});
