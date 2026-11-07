import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { storyOrder } from '@/modules/relationships/timeline';
import { resolveChronology } from '@/modules/timeline/chronology';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { buildGraph, clusterLeaves, filterGraph, neighbours, type Graph, type GraphData } from './build';

let n = 0;
const t = (text: string, entryId?: string) => ({ type: 'text', text, ...(entryId ? { marks: [{ type: 'entityLink', attrs: { entryId } }] } : {}) });
const doc = (...content: object[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });

async function world() {
  const db = new NovelDB(`graph-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerRelationships(registry);
  registerTimeline(registry);
  const project = await projects.create({ title: 'P' });
  const m = createManuscriptService(db, projects.contentChanged).forProject(project.id);
  const c = createCodexService(db, projects.contentChanged).forProject(project.id);
  const r = createRelationshipService(db, projects.contentChanged).forProject(project.id);
  const tl = createTimelineService(db, projects.contentChanged).forProject(project.id);

  const [mira, bren, hermit] = await Promise.all(['Mira', 'Bren', 'Hermit'].map((name) => c.create('character', name)));
  const guild = await c.create('faction', 'Ash Guild');
  const academy = await c.create('location', 'Academy');
  const blade = await c.create('item', 'Emberfang');
  const v1 = await m.create('volume', null, 'Volume 1');
  const ch1 = await m.create('chapter', v1.id);
  const scene = await m.create('scene', ch1.id);
  const ch2 = await m.create('chapter');

  await r.create(mira.id, bren.id, 'rivals');
  await c.link(mira.id, guild.id, 'member');
  await c.link(mira.id, bren.id, 'old friends'); // a second kind of link between the same pair
  await c.saveCategory('item', (stored) => ({ fields: [...stored.fields, { id: 'owner', name: 'Wielder', type: 'reference', options: [] }] }));
  await c.setFieldValue(blade.id, 'owner', mira.id);
  await m.saveDoc(scene.id, doc(t('Mira', mira.id), t(' at the '), t('Academy', academy.id)), { words: 4, characters: 20 });
  await m.updatePlan(ch2.id, { entityIds: [bren.id] });
  const siege = await tl.create('The Siege');
  await tl.update(siege.id, { when: { precision: 'exact', year: 1026, month: null, day: null, hour: null, minute: null }, characters: [{ id: mira.id, age: null }], locationId: academy.id, entryIds: [guild.id], nodeIds: [ch2.id] });
  const after = await tl.create('Aftermath');
  await tl.update(after.id, { afterId: siege.id });

  const data = async (): Promise<GraphData> => ({ entries: await c.list(), links: await c.links(), relations: await r.list(), order: storyOrder(await m.list()), events: resolveChronology(await tl.list()), nodes: await m.list(), plans: await m.plans(), categories: await c.categories() });
  return { m, c, r, tl, data, mira, bren, hermit, guild, academy, blade, v1, ch1, scene, ch2, siege, after };
}

const name = (graph: Graph, id: string) => graph.nodes.find((x) => x.id === id)?.label ?? id;
const edgeList = (graph: Graph) => graph.edges.map((e) => `${name(graph, e.source)} ${e.directed ? '→' : '—'} ${name(graph, e.target)}: ${e.labels.join(' + ')}`).sort();

describe('building the story graph', () => {
  it('has a node for every entry, event, chapter and arc; scenes fold into their chapter', async () => {
    const w = await world();
    const graph = buildGraph(await w.data());
    expect(graph.nodes.map((x) => `${x.group}:${x.label}`).sort()).toEqual([
      'chapter:Chapter 1', 'chapter:Chapter 2', 'chapter:Volume 1', 'character:Bren', 'character:Hermit', 'character:Mira', 'event:Aftermath', 'event:The Siege', 'faction:Ash Guild', 'item:Emberfang', 'location:Academy',
    ]);
    expect(graph.nodes.some((x) => x.id === w.scene.id)).toBe(false);
  });

  it('draws an edge for every kind of link, named for what it means', async () => {
    const w = await world();
    expect(edgeList(buildGraph(await w.data()))).toEqual([
      'Academy — Chapter 1: Appears in',
      'Aftermath → The Siege: Follows',
      'Ash Guild — The Siege: Involved in',
      'Bren — Chapter 2: Planned in',
      'Chapter 1 → Volume 1: Part of',
      'Emberfang → Mira: Wielder',
      'Mira — Ash Guild: member',
      'Mira — Bren: Rivals + old friends',
      'Mira — Chapter 1: Appears in',
      'Mira — The Siege: Involved in',
      'The Siege — Academy: Takes place at',
      'The Siege — Chapter 2: Told in',
    ]);
  });

  it('sizes nodes by how connected they are, and shows what is isolated', async () => {
    const w = await world();
    const graph = buildGraph(await w.data());
    const degree = Object.fromEntries(graph.nodes.map((x) => [x.label, x.degree]));
    expect(degree).toMatchObject({ Mira: 5, 'The Siege': 5, Bren: 2, Academy: 2, Hermit: 0, 'Volume 1': 1 });
    expect(graph.nodes.filter((x) => x.degree === 0).map((x) => x.label)).toEqual(['Hermit']);
    const rivalry = graph.edges.find((e) => e.kinds.includes('relationship'))!;
    expect(rivalry).toMatchObject({ affinity: 'neutral', kinds: ['relationship', 'related'] });
    expect(rivalry.relationId).toBeTruthy();
  });

  it('follows the project as it changes, and never invents or keeps a dead link', async () => {
    const w = await world();
    await w.c.remove(w.mira.id);
    await w.m.remove(w.ch2.id);
    await w.tl.remove(w.siege.id);
    const graph = buildGraph(await w.data());
    expect(edgeList(graph)).toEqual(['Academy — Chapter 1: Appears in', 'Chapter 1 → Volume 1: Part of']);
    const ids = new Set(graph.nodes.map((x) => x.id));
    expect(graph.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
    expect(graph.nodes.find((x) => x.label === 'Emberfang')!.degree).toBe(0); // its wielder is gone; the item is not
  });
});

describe('filtering and focus', () => {
  it('hides categories without touching the links between what remains', async () => {
    const w = await world();
    const graph = buildGraph(await w.data());
    const people = filterGraph(graph, { hidden: new Set(['location', 'faction', 'item', 'event', 'chapter', 'power', 'lore']), relationships: true, scope: null });
    expect(people.nodes.map((x) => x.label).sort()).toEqual(['Bren', 'Hermit', 'Mira']);
    expect(edgeList(people)).toEqual(['Mira — Bren: Rivals + old friends']);
    expect(people.nodes.find((x) => x.label === 'Mira')!.degree).toBe(5); // size still reflects the whole project

    const noRelationships = filterGraph(graph, { hidden: new Set(), relationships: false, scope: null });
    expect(edgeList(noRelationships)).toContain('Mira — Bren: old friends'); // the other link between them remains
    expect(noRelationships.edges.some((e) => e.kinds.includes('relationship') || e.relationId)).toBe(false);
    expect(edgeList(filterGraph(graph, { hidden: new Set(), relationships: true, scope: null }))).toEqual(edgeList(graph));
    expect(graph.edges.find((e) => e.relationId)!.kinds).toEqual(['relationship', 'related']); // filtering changed nothing in the source graph
  });

  it('limits the view to a volume, or to what surrounds one entry', async () => {
    const w = await world();
    const graph = buildGraph(await w.data());
    const none = new Set<string>();
    const volume = filterGraph(graph, { hidden: none, relationships: true, scope: { type: 'group', id: w.v1.id } }, await w.m.list());
    expect(volume.nodes.map((x) => x.label).sort()).toEqual(['Academy', 'Chapter 1', 'Mira', 'Volume 1']);
    const faction = filterGraph(graph, { hidden: none, relationships: true, scope: { type: 'around', id: w.guild.id } });
    expect(faction.nodes.map((x) => x.label).sort()).toEqual(['Ash Guild', 'Mira', 'The Siege']);
    expect(edgeList(faction)).toEqual(['Ash Guild — The Siege: Involved in', 'Mira — Ash Guild: member', 'Mira — The Siege: Involved in']);
    expect(filterGraph(graph, { hidden: none, relationships: true, scope: { type: 'around', id: 'gone' } }).nodes).toHaveLength(graph.nodes.length);
  });

  it('finds direct and second-step connections', async () => {
    const w = await world();
    const graph = buildGraph(await w.data());
    const { first, second } = neighbours(graph, w.bren.id);
    expect([...first].map((id) => name(graph, id)).sort()).toEqual(['Chapter 2', 'Mira']);
    expect([...second].map((id) => name(graph, id)).sort()).toEqual(['Ash Guild', 'Chapter 1', 'Emberfang', 'The Siege']);
    expect(neighbours(graph, w.hermit.id)).toEqual({ first: new Set(), second: new Set() });
  });
});

describe('large graphs', () => {
  const big = (hubs: number, leaves: number): Graph => {
    const nodes = [];
    const edges = [];
    for (let h = 0; h < hubs; h++) {
      nodes.push({ id: `h${h}`, group: 'character', label: `Hub ${h}`, color: '#000', degree: leaves + 1, ref: { kind: 'cluster' as const, hubId: '', memberIds: [] } });
      edges.push({ id: `h${h}|h${(h + 1) % hubs}`, source: `h${h}`, target: `h${(h + 1) % hubs}`, kinds: ['related' as const], labels: ['Related'], directed: false });
      for (let l = 0; l < leaves; l++) {
        const group = l % 2 ? 'chapter' : 'item';
        nodes.push({ id: `h${h}l${l}`, group, label: `Leaf ${h}.${l}`, color: '#111', degree: 1, ref: { kind: 'cluster' as const, hubId: '', memberIds: [] } });
        edges.push({ id: `h${h}|h${h}l${l}`, source: `h${h}l${l}`, target: `h${h}`, kinds: ['appears' as const], labels: ['Appears in'], directed: false });
      }
    }
    return { nodes, edges };
  };
  const label = (group: string, count: number) => `${count} ${group}s`;

  it('folds minor nodes around each hub once the graph is large, and opens them on request', () => {
    const graph = big(20, 16); // 340 nodes
    const folded = clusterLeaves(graph, new Set(), label);
    expect(folded.nodes).toHaveLength(20 + 40);
    expect(folded.nodes.filter((x) => x.ref.kind === 'cluster' && x.id.startsWith('cluster:')).map((x) => x.label).slice(0, 2)).toEqual(['8 items', '8 chapters']);
    const ids = new Set(folded.nodes.map((x) => x.id));
    expect(folded.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);

    const opened = clusterLeaves(graph, new Set(['h3']), label);
    expect(opened.nodes).toHaveLength(20 + 38 + 16);
    expect(opened.nodes.some((x) => x.id === 'h3l5')).toBe(true);
    expect(graph.nodes).toHaveLength(340); // the full graph is untouched
  });

  it('leaves small graphs, and hubs with only a few minor nodes, as they are', () => {
    expect(clusterLeaves(big(5, 10), new Set(), label)).toEqual(big(5, 10));
    const sparse = big(60, 3); // 240 nodes, but at most 2 per kind around a hub
    expect(clusterLeaves(sparse, new Set(), label).nodes).toHaveLength(240);
  });

  it('builds and filters a 1,000-node project quickly', async () => {
    const entries = Array.from({ length: 800 }, (_, i) => ({ id: `e${i}`, projectId: 'p', category: i % 3 ? 'character' : 'location', name: `Entry ${i}`, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 0, updatedAt: 0 }));
    const links = Array.from({ length: 2400 }, (_, i) => ({ id: `l${i}`, projectId: 'p', fromId: `e${i % 800}`, toId: `e${(i * 7 + 13) % 800}`, fromLabel: '', toLabel: '', createdAt: 0 }));
    const chapters = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, projectId: 'p', parentId: null, kind: 'chapter' as const, title: `Chapter ${i}`, order: i, summary: '', notes: '', status: 'idea' as const, wordCount: 0, charCount: 0, mentions: [`e${i}`, `e${i * 3}`], createdAt: 0, updatedAt: 0 }));
    const start = performance.now();
    const graph = buildGraph({ entries, links, relations: [], order: storyOrder(chapters), events: [], nodes: chapters, plans: [], categories: [] });
    const filtered = filterGraph(graph, { hidden: new Set(['location']), relationships: true, scope: null });
    const near = neighbours(filtered, 'e1');
    const ms = performance.now() - start;
    expect(graph.nodes).toHaveLength(1000);
    expect(graph.edges.length).toBeGreaterThan(1000);
    expect(near.first.size).toBeGreaterThan(0);
    expect(ms).toBeLessThan(400);
  });
});
