import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { missingFor, readyViews } from '@/modules/codex/capabilities';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { TYPE_PRESETS } from '@/modules/codex/typePresets';
import type { FieldDef, KindUses } from '@/modules/codex/types';
import { createConnectionService } from '@/modules/connections/service';
import { knowledgeGraph, queryGraph } from '@/modules/graph/knowledge';
import { unsuitedKinds } from '@/modules/integrity/rules';
import { registerManuscript } from '@/modules/manuscript/service';
import { deriveConnections } from '@/modules/model/connections';
import { loadModel } from '@/modules/model/model';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { kindHolders, kindMap, kindRanks, kindsOf, kindTable, kindTimeline, niceTicks, readKind, tableCsv } from './kinds';

let n = 0;
let db: NovelDB;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`kinds-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
});

const f = (id: string, name: string, type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({ id, name, type, options: [], ...extra });
const FIELDS = [f('found', 'Found', 'number'), f('lost', 'Lost', 'date'), f('east', 'East', 'number'), f('north', 'North', 'number'), f('tier', 'Tier', 'select', { options: ['Low', 'Mid', 'High'] }), f('keeper', 'Keeper', 'reference'), f('code', 'Code', 'text'), f('bonds', 'Bonds', 'references')];
const FULL: KindUses = { timeline: { start: 'found', end: 'lost' }, map: { x: 'east', y: 'north' }, rank: 'tier', ownership: { type: 'owns', field: 'keeper' }, graphLabel: 'code', graphLinks: ['bonds'] };
const year = (y: number) => ({ kind: 'date' as const, when: { precision: 'exact' as const, year: y, month: null, day: null, hour: null, minute: null } });

/** A novel with a kind of record of its own, three records of it, and two characters to hold them. */
async function world(title = 'Kinds') {
  const p = await projects.create({ title });
  const codex = createCodexService(db, projects.contentChanged).forProject(p.id);
  const connections = createConnectionService(db, projects.contentChanged).forProject(p.id);
  const kind = await codex.saveCategory(null, { name: 'Artifacts', singular: 'Artifact', fields: FIELDS });
  const mira = await codex.create('character', 'Mira');
  const orrin = await codex.create('character', 'Orrin');
  const crown = await codex.create(kind.key, 'Ember Crown');
  const blade = await codex.create(kind.key, 'Ash Blade');
  const cup = await codex.create(kind.key, 'Dull Cup');
  const set = async (entryId: string, values: Record<string, string>) => {
    for (const [defId, value] of Object.entries(values)) await codex.setFieldValue(entryId, defId, value);
  };
  await set(crown.id, { found: '1020', lost: '1024-05-01', east: '3', north: '4', tier: 'High', keeper: mira.id, code: 'EC-1', bonds: blade.id });
  await set(blade.id, { found: '1022', east: 'far', north: '1', tier: 'Low', keeper: orrin.id });
  await set(cup.id, { found: 'long ago', tier: 'Rusty' });
  const model = async () => (await loadModel(db, p.id))!;
  return { p, codex, connections, kind, mira, orrin, crown, blade, cup, model };
}
const names = (entries: { name: string }[]) => entries.map((e) => e.name);

describe('a kind of record set up for only some views', () => {
  it('is drawn the ways it is set up for, and says what is missing for the rest', async () => {
    const w = await world();
    await w.codex.saveCategory(w.kind.key, { uses: { timeline: { start: 'found' }, rank: 'tier', map: { x: 'east' } } });
    const model = await w.model();
    const timeline = kindTimeline(model, w.kind.key);
    expect(timeline.placed.map((t) => [t.entry.name, t.label])).toEqual([['Ember Crown', 'Year 1020'], ['Ash Blade', 'Year 1022']]);
    expect(timeline.unplaced.map((u) => [u.entry.name, u.reason])).toEqual([['Dull Cup', 'Found holds “long ago”, not a year (a whole number).']]);
    const ranks = kindRanks(model, w.kind.key);
    expect(ranks.levels.map((l) => [l.label, names(l.entries)])).toEqual([['High', ['Ember Crown']], ['Mid', []], ['Low', ['Ash Blade']]]);
    expect(ranks.unplaced.map((u) => u.reason)).toEqual(['Tier holds “Rusty”, not one of its choices.']);
    expect(kindMap(model, w.kind.key)).toMatchObject({ points: [], missing: ['Up on the map is not set: choose a Number field.'] });
    expect(kindHolders(model, w.kind.key)).toMatchObject({ records: [], missing: ['No connection type is chosen as holding an artifact: choose one, such as Owns.'] });
  });

  it('with nothing set, it is still a table of its records, every field a column, links by name', async () => {
    const w = await world();
    const model = await w.model();
    expect(readyViews(model.categories.get(w.kind.key)!)).toEqual([]);
    const table = kindTable(model, w.kind.key);
    expect(table.columns.map((c) => c.name)).toEqual(['Found', 'Lost', 'East', 'North', 'Tier', 'Keeper', 'Code', 'Bonds']);
    expect(table.rows.map((r) => [r.entry.name, r.cells[5], r.cells[7]])).toEqual([['Ash Blade', 'Orrin', ''], ['Dull Cup', '', ''], ['Ember Crown', 'Mira', 'Ash Blade']]);
    await w.codex.update(w.cup.id, { name: 'Dull Cup, "chipped"' });
    expect(tableCsv(kindTable(await w.model(), w.kind.key)).split('\r\n').slice(0, 3)).toEqual(['Name,Found,Lost,East,North,Tier,Keeper,Code,Bonds', 'Ash Blade,1022,,far,1,Low,Orrin,,', '"Dull Cup, ""chipped""",long ago,,,,Rusty,,,']);
  });

  it('a map’s grid falls on round numbers', () => {
    expect([niceTicks(0, 10), niceTicks(-3, 4, 4), niceTicks(0.1, 0.35), niceTicks(5, 5)]).toEqual([[0, 2, 4, 6, 8, 10], [-2, 0, 2, 4], [0.1, 0.15, 0.2, 0.25, 0.3, 0.35], [5]]);
  });

  it('the view’s address: the kind asked for, else the first with records; an unknown way of showing it is the table', async () => {
    const w = await world();
    const model = await w.model();
    expect(kindsOf(model).some((k) => k.category.key === 'character')).toBe(false);
    expect(readKind(new URLSearchParams(`kind=${w.kind.key}&kshow=map`), model)).toEqual({ key: w.kind.key, show: 'map' });
    expect(readKind(new URLSearchParams('kind=nope&kshow=pie'), model)).toEqual({ key: w.kind.key, show: 'table' });
  });
});

describe('a kind of record set up for every view', () => {
  it('on a timeline (with an end), a map, a ladder, and by who holds it, history and all', async () => {
    const w = await world();
    await w.codex.saveCategory(w.kind.key, { uses: FULL });
    const owns = await w.connections.create({ from: { type: 'entry', id: w.mira.id }, to: { type: 'entry', id: w.crown.id }, type: 'owns' });
    await w.connections.change(owns.id, year(1023), { from: { type: 'entry', id: w.orrin.id } });
    const model = await w.model();
    expect(readyViews(model.categories.get(w.kind.key)!)).toEqual(['timeline', 'map', 'rank', 'ownership']);
    const crown = kindTimeline(model, w.kind.key).placed[0];
    expect([crown.entry.name, crown.end !== null, crown.label.startsWith('Year 1020 to Year 1024')]).toEqual(['Ember Crown', true, true]);
    const map = kindMap(model, w.kind.key);
    expect(map.points.map((p) => [p.entry.name, p.x, p.y])).toEqual([['Ember Crown', 3, 4]]);
    expect(map.unplaced.map((u) => [u.entry.name, u.reason])).toEqual([['Ash Blade', 'East holds “far”, not a number.'], ['Dull Cup', 'East is empty. North is empty.']]);
    const held = kindHolders(model, w.kind.key);
    const [blade, , crownHeld] = held.records;
    expect(crownHeld.history.map((h) => [h.holderName, h.when])).toEqual([['Mira', 'until Year 1023'], ['Orrin', 'from Year 1023']]);
    expect(crownHeld.note).toBe('Keeper names Mira, but the holding recorded as still in force is Orrin’s.');
    expect([blade.history, blade.current?.name, blade.note]).toEqual([[], 'Orrin', null]);
  });

  it('a value whose end comes before its start is drawn at its start, and says why', async () => {
    const w = await world();
    await w.codex.saveCategory(w.kind.key, { uses: FULL });
    await w.codex.setFieldValue(w.crown.id, 'lost', '1010-01-01');
    const crown = kindTimeline(await w.model(), w.kind.key).placed.find((t) => t.entry.id === w.crown.id)!;
    expect([crown.end, crown.note]).toEqual([null, 'drawn at its start only: Lost is before Found.']);
  });

  it('in the knowledge graph: labelled by its field (found by its name too), and only the link fields chosen drawn, the rest counted', async () => {
    const w = await world();
    await w.codex.saveCategory(w.kind.key, { uses: FULL });
    const model = await w.model();
    const graph = knowledgeGraph(model);
    const node = (id: string) => graph.nodes.find((x) => x.ref?.id === id)!;
    expect([node(w.crown.id).label, node(w.crown.id).aka, node(w.blade.id).label, node(w.blade.id).aka]).toEqual(['EC-1', 'Ember Crown', 'Ash Blade', undefined]);
    expect(queryGraph(graph, { text: 'ember' }).nodes.map((x) => x.label)).toContain('EC-1');
    expect(graph.edges.filter((e) => e.kind === 'field').map((e) => e.label)).toEqual(['Bonds']);
    expect(graph.undrawn).toEqual([{ category: w.kind.key, field: 'Keeper', count: 2 }]);
    // Left out of the drawing only: every other view still has the connection.
    expect(deriveConnections(model).connections.filter((c) => c.kind === 'field' && c.label === 'Keeper')).toHaveLength(2);
    await w.codex.saveCategory(w.kind.key, (stored) => ({ uses: { ...stored.uses, graphLinks: undefined } }));
    expect(knowledgeGraph(await w.model()).undrawn).toEqual([]);
  });
});

describe('settings are kept', () => {
  it('through renaming, moving and retyping fields: a setting is never dropped, and works again once its field suits', async () => {
    const w = await world();
    await w.codex.saveCategory(w.kind.key, { uses: FULL });
    await w.codex.saveCategory(w.kind.key, (stored) => ({ fields: [...stored.fields].reverse().map((d) => (d.id === 'tier' ? { ...d, name: 'Grade' } : d.id === 'found' ? { ...d, type: 'text' as const } : d)) }));
    let kind = (await w.model()).categories.get(w.kind.key)!;
    expect(kind.uses).toEqual(FULL);
    expect(readyViews(kind)).toEqual(['map', 'rank', 'ownership']);
    expect(missingFor(kind, 'timeline')).toEqual(['Found, chosen for the date on the timeline, is now Short text; it needs to be a Number or Date field.']);
    // The record check lists it; kinds never set up for a view are not problems.
    expect(unsuitedKinds(await w.model()).map((u) => [u.category.name, u.problems])).toEqual([['Artifacts', ['Found, chosen for the date on the timeline, is now Short text; it needs to be a Number or Date field.']]]);
    await w.codex.saveCategory(w.kind.key, (stored) => ({ fields: stored.fields.filter((d) => d.id !== 'north').map((d) => (d.id === 'found' ? { ...d, type: 'number' as const } : d)) }));
    kind = (await w.model()).categories.get(w.kind.key)!;
    expect([readyViews(kind), missingFor(kind, 'map')]).toEqual([['timeline', 'rank', 'ownership'], ['North, chosen for up on the map, was removed (archived): restore it or choose another.']]);
    await w.codex.saveCategory(w.kind.key, (stored) => ({ fields: stored.fields.map((d) => ({ ...d, archived: false })) }));
    expect(readyViews((await w.model()).categories.get(w.kind.key)!)).toEqual(['timeline', 'map', 'rank', 'ownership']);
  });

  it('in a copy of the novel and its backup, with every value', async () => {
    const w = await world();
    await w.codex.saveCategory(w.kind.key, { uses: FULL });
    const copy = await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(w.p.id, { everything: true }))));
    const model = (await loadModel(db, copy.id))!;
    const kind = [...model.categories.values()].find((c) => c.name === 'Artifacts')!;
    expect([kind.uses, readyViews(kind)]).toEqual([FULL, ['timeline', 'map', 'rank', 'ownership']]);
    expect(kindMap(model, kind.key).points.map((p) => [p.entry.name, p.x, p.y])).toEqual([['Ember Crown', 3, 4]]);
  });

  it('in a template: into another novel, pointed at its own fields; where that novel set something already, its setting stays', async () => {
    const w = await world();
    await w.codex.saveCategory(w.kind.key, { uses: FULL });
    const template = await w.codex.schemaSnapshot();
    const other = createCodexService(db, projects.contentChanged).forProject((await projects.create({ title: 'Other' })).id);
    const added = (await other.applyTemplate(template)).find((c) => c.name === 'Artifacts')!;
    const byName = (name: string) => added.fields.find((d) => d.name === name)!.id;
    expect(added.fields.some((d) => FIELDS.some((x) => x.id === d.id))).toBe(false);
    expect(added.uses).toEqual({ timeline: { start: byName('Found'), end: byName('Lost') }, map: { x: byName('East'), y: byName('North') }, rank: byName('Tier'), ownership: { type: 'owns', field: byName('Keeper') }, graphLabel: byName('Code'), graphLinks: [byName('Bonds')] });
    const third = createCodexService(db, projects.contentChanged).forProject((await projects.create({ title: 'Third' })).id);
    const mine = await third.saveCategory(null, { name: 'Artifacts', fields: [f('mine', 'Power', 'number')], uses: { rank: 'mine' } });
    const merged = (await third.applyTemplate(template)).find((c) => c.key === mine.key)!;
    expect(merged.uses?.rank).toBe('mine');
    expect(merged.uses?.map).toEqual({ x: merged.fields.find((d) => d.name === 'East')!.id, y: merged.fields.find((d) => d.name === 'North')!.id });
  });

  it('presets come set up for the views that suit them, by their own fields', async () => {
    const w = await world();
    const after = await w.codex.applyTemplate({ categories: TYPE_PRESETS.flatMap((t) => t.categories) });
    const ready = (name: string) => readyViews(after.find((c) => c.name === name)!);
    expect([ready('Spells'), ready('Planets'), ready('Relics'), ready('Species')]).toEqual([['rank'], ['timeline'], ['ownership'], []]);
  });
});
