import { describe, expect, it } from 'vitest';
import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { buildModel } from '@/modules/model/model';
import type { PlotThread } from '@/modules/plot/types';
import type { TimelineEvent } from '@/modules/timeline/types';
import { collapseGraph, DRAW_LIMIT, edgeTypeLabel, isGroupNode, edgeWords, keyOf, knowledgeGraph, limitGraph, neighbourhood, nodeTypeLabel, pathBetween, queryGraph, refOf, typeCounts } from './knowledge';

const entry = (id: string, name: string, category: string): LoreEntry => ({ id, projectId: 'p', category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 0, updatedAt: 0 }) as LoreEntry;
const link = (id: string, fromId: string, toId: string, type?: string, more: Partial<LoreLink> = {}): LoreLink => ({ id, projectId: 'p', fromId, toId, fromLabel: '', toLabel: '', createdAt: 0, ...(type ? { type } : {}), ...more });
const node = (id: string, kind: StoryNode['kind'], title: string, order: number, parentId: string | null = null, mentions: string[] = []): StoryNode => ({ id, projectId: 'p', parentId, kind, title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions, createdAt: 0, updatedAt: 0 });
const event = (id: string, name: string, more: Partial<TimelineEvent> = {}): TimelineEvent => ({ id, projectId: 'p', name, description: '', when: { precision: 'unknown' }, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0, ...more });
const thread = (id: string, title: string, more: Partial<PlotThread> = {}): PlotThread => ({ id, projectId: 'p', title, premise: '', category: 'main', customCategory: '', status: 'active', characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats: [], notes: '', muted: false, createdAt: 0, updatedAt: 0, ...more });

/**
 * Mira (character, an elf: a species, the author's own category) owns the Ember Blade (item), which was created by Orrin;
 * Orrin knows about the prophecy (lore); the Siege (event) took place at the Keep (location), with Mira in it,
 * told in Chapter 1's scene "Walls"; the Siege caused the Exile (event, the author's own type: "set off").
 * Mira is linked in Chapter 2's text. The Quest (plot thread) involves Mira and develops in Chapter 2.
 * Mira has the ability Spark; Flame branches from Spark. Nobody knows the Hermit.
 */
function world() {
  const entries = [entry('mira', 'Mira', 'character'), entry('orrin', 'Orrin', 'character'), entry('elf', 'Elves', 'species'), entry('blade', 'The Ember Blade', 'item'), entry('keep', 'The Keep', 'location'), entry('prophecy', 'The prophecy', 'lore'), entry('hermit', 'The Hermit', 'character')];
  const links = [link('l1', 'mira', 'blade', 'owns'), link('l2', 'blade', 'orrin', 'created-by'), link('l3', 'orrin', 'prophecy', 'knows-about'), link('l4', 'mira', 'elf', 'member-of'), { ...link('l5', 'siege', 'exile', 'caused'), fromType: 'event', toType: 'event' } as LoreLink, { ...link('l6', 'siege', 'exile', 'set off'), fromType: 'event', toType: 'event' } as LoreLink];
  const nodes = [node('act', 'act', 'Act I', 0), node('c1', 'chapter', 'Chapter 1', 0, 'act'), node('walls', 'scene', 'Walls', 0, 'c1'), node('c2', 'chapter', 'Chapter 2', 1, 'act', ['mira'])];
  const events = [event('siege', 'The siege', { locationId: 'keep', characters: [{ id: 'mira', age: null }], nodeIds: ['walls'] }), event('exile', 'The exile')];
  const threads = [thread('quest', 'The quest', { characterIds: ['mira'], beats: [{ id: 'b1', nodeId: 'c2', title: 'Setting out', note: '', createdAt: 0 }] })];
  const systems = [{ id: 'magic', projectId: 'p', name: 'Magic', description: '', variables: [], tracks: [], ranks: [], groups: [{ id: 'g', name: 'Spells', single: false }], items: [{ id: 'spark', groupId: 'g', name: 'Spark', description: '', parentId: null, rankId: null, requires: '' }, { id: 'flame', groupId: 'g', name: 'Flame', description: '', parentId: 'spark', rankId: null, requires: '' }], matrices: [], createdAt: 0, updatedAt: 0 }];
  const sheets = [{ id: 'sheet', projectId: 'p', systemId: 'magic', entryId: 'mira', values: {}, progress: {}, itemIds: ['spark'], createdAt: 0, updatedAt: 0 }];
  const schemas = [{ id: 's-species', projectId: 'p', key: 'species', name: 'Species & Races', singular: 'Species', color: '#a3622b', builtin: false, order: 20, fields: [], createdAt: 0, updatedAt: 0 }];
  return buildModel({ project: { id: 'p' } as never, nodes, plans: [], entries, schemas: schemas as never, links, relations: [], events, threads, systems: systems as never, sheets: sheets as never });
}

describe('every record a node, every connection an edge', () => {
  it('nodes of every kind, including the author’s own categories and abilities', () => {
    const model = world();
    const graph = knowledgeGraph(model);
    const types = Object.fromEntries(graph.nodes.map((n) => [n.label, n.type]));
    expect(types).toMatchObject({ Mira: 'entry:character', Elves: 'entry:species', 'The Ember Blade': 'entry:item', 'The Keep': 'entry:location', 'The siege': 'event', 'Chapter 1': 'chapter', Walls: 'scene', 'Act I': 'part', 'The quest': 'thread', Spark: 'ability', Flame: 'ability' });
    expect(nodeTypeLabel('entry:species', model)).toBe('Species & Races');
    expect(graph.dangling).toBe(0);
  });

  it('typed edges: owns, created by, knows about, member of, caused, took place at, and the author’s own', () => {
    const graph = knowledgeGraph(world());
    const labelOf = (key: string) => graph.nodes.find((n) => n.key === key)!.label;
    const said = graph.edges.map((e) => `${e.type} | ${edgeWords(e, labelOf)}`).sort();
    expect(said).toEqual(
      [
        'link:owns | Mira owns The Ember Blade (from the other side: owned by)',
        'link:created-by | The Ember Blade created by Orrin (from the other side: created)',
        'link:knows-about | Orrin knows about The prophecy (from the other side: known to)',
        'link:member-of | Mira member of Elves (from the other side: has member)',
        'link:caused | The siege caused The exile (from the other side: caused by)',
        'link:set off | The siege set off The exile',
        'occurs-at | The siege takes place at The Keep',
        'participant | Mira takes part in The siege',
        'told-in | The siege told in Walls',
        'mentioned | Mira mentioned in Chapter 2',
        'part-of | Chapter 1 part of Act I',
        'part-of | Walls part of Chapter 1',
        'part-of | Chapter 2 part of Act I',
        'thread-entry | The quest involves Mira',
        'beat | The quest setting out Chapter 2',
        'holds | Mira has Spark',
        'branches-from | Flame branches from Spark',
      ].sort(),
    );
    expect([edgeTypeLabel('link:owns'), edgeTypeLabel('link:set off'), edgeTypeLabel('told-in')]).toEqual(['Owns', 'set off', 'Told in']);
    expect(typeCounts(graph).edges[0]).toEqual(['part-of', 3]);
  });

  it('nothing is stored for the graph: each edge is a connection the records already hold, by its own id', () => {
    const graph = knowledgeGraph(world());
    expect(graph.edges.find((e) => e.type === 'link:owns')).toMatchObject({ id: 'link:l1', connection: { source: { table: 'loreLinks', id: 'l1' } } });
    expect(graph.edges.find((e) => e.kind === 'holds')!.connection.source).toEqual({ table: 'systemSheets', id: 'sheet' });
    expect(refOf(keyOf({ type: 'ability', id: 'magic/spark' }))).toEqual({ type: 'ability', id: 'magic/spark' });
    expect(refOf('nonsense')).toBeNull();
  });
});

describe('graph queries', () => {
  const graph = knowledgeGraph(world());
  const labels = (g: { nodes: { label: string }[] }) => g.nodes.map((n) => n.label).sort();

  it('hiding node types and edge types', () => {
    const noStory = queryGraph(graph, { hiddenNodes: new Set(['chapter', 'scene', 'part']) });
    expect(noStory.nodes.some((n) => ['chapter', 'scene', 'part'].includes(n.type))).toBe(false);
    expect(noStory.edges.some((e) => e.type === 'told-in' || e.type === 'part-of')).toBe(false);
    const onlyOwning = queryGraph(graph, { hiddenEdges: new Set(typeCounts(graph).edges.map(([t]) => t).filter((t) => t !== 'link:owns')) });
    expect(labels(onlyOwning)).toEqual(['Mira', 'The Ember Blade']);
  });

  it('records with nothing shown are left out unless asked for', () => {
    expect(labels(queryGraph(graph, {})).includes('The Hermit')).toBe(false);
    expect(labels(queryGraph(graph, { isolated: true })).includes('The Hermit')).toBe(true);
  });

  it('by name: what matches, and what it is directly connected to', () => {
    expect(labels(queryGraph(graph, { text: 'blade' }))).toEqual(['Mira', 'Orrin', 'The Ember Blade']);
  });

  it('focus: one step, or two', () => {
    expect(labels(queryGraph(graph, { focus: { key: 'entry:orrin', depth: 1 } }))).toEqual(['Orrin', 'The Ember Blade', 'The prophecy']);
    expect(labels(queryGraph(graph, { focus: { key: 'entry:orrin', depth: 2 } }))).toEqual(['Mira', 'Orrin', 'The Ember Blade', 'The prophecy']);
    expect(neighbourhood(graph.edges, 'entry:hermit', 2)).toEqual(new Set(['entry:hermit']));
    // A focus on someone with nothing shown still shows them.
    expect(labels(queryGraph(graph, { focus: { key: 'entry:hermit', depth: 1 } }))).toEqual(['The Hermit']);
  });

  it('how two records are connected: the shortest chain, either way along each connection', () => {
    const path = pathBetween(graph.edges, 'entry:orrin', 'entry:keep')!;
    expect(path.map((e) => e.type)).toEqual(['link:created-by', 'link:owns', 'participant', 'occurs-at']);
    expect(pathBetween(graph.edges, 'entry:orrin', 'entry:hermit')).toBeNull();
    expect(pathBetween(graph.edges, 'entry:orrin', 'entry:keep', 2)).toBeNull();
    expect(pathBetween(graph.edges, 'entry:mira', 'entry:mira')).toEqual([]);
  });

  it('a large graph is built and queried at once', () => {
    const many = Array.from({ length: 600 }, (_, i) => entry(`e${i}`, `Entry ${String(i).padStart(3, '0')}`, i % 3 ? 'character' : 'location'));
    const links = Array.from({ length: 1500 }, (_, i) => link(`x${i}`, `e${i % 600}`, `e${(i * 7 + 1) % 600}`, i % 2 ? 'knows-about' : 'related'));
    const model = buildModel({ project: { id: 'p' } as never, nodes: [], plans: [], entries: many, schemas: [], links, relations: [], events: [], threads: [], systems: [], sheets: [] });
    const started = performance.now();
    const big = knowledgeGraph(model);
    const focused = queryGraph(big, { focus: { key: 'entry:e1', depth: 2 }, hiddenEdges: new Set(['link:related']) });
    pathBetween(big.edges, 'entry:e0', 'entry:e599');
    expect(performance.now() - started).toBeLessThan(2000);
    expect([big.nodes.length, big.edges.length]).toEqual([600, 1500]);
    expect(focused.nodes.length).toBeGreaterThan(1);
  });
});

describe('against clutter', () => {
  const model = world();
  const graph = knowledgeGraph(model);
  const folder = (key: string) => {
    const ref = refOf(key);
    const node = ref?.type === 'node' ? model.nodes.get(ref.id) : undefined;
    return node?.kind === 'scene' && node.parentId ? `node:${node.parentId}` : null;
  };

  it('a kind of record folds into one group: its connections follow it, those inside are counted', () => {
    const { graph: g, into, inside } = collapseGraph(graph, { types: new Set(['entry:character']) }, (type, n) => `${n} ${type}`);
    const group = g.nodes.find((n) => n.key === 'group:entry:character')!;
    expect([group.label, (isGroupNode(group) ? group.members : []).sort(), group.ref]).toEqual(['3 entry:character', ['entry:hermit', 'entry:mira', 'entry:orrin'], null]);
    expect(into.get('entry:mira')).toBe('group:entry:character');
    expect(inside).toBe(0);
    // Every connection is still there, by its own id, now from or to the group.
    expect(g.edges.length).toBe(graph.edges.length);
    expect(g.edges.find((e) => e.id === 'link:l1')).toMatchObject({ from: 'group:entry:character', to: 'entry:blade' });
  });

  it('scenes fold into their chapters; the connection between them is inside, and goes', () => {
    const { graph: g, into, inside } = collapseGraph(graph, { fold: folder }, () => '');
    expect(g.nodes.some((n) => n.key === 'node:walls')).toBe(false);
    expect(into.get('node:walls')).toBe('node:c1');
    expect(inside).toBe(1);
    expect(g.edges.find((e) => e.kind === 'told-in')).toMatchObject({ from: 'event:siege', to: 'node:c1' });
  });

  it('a folded scene follows its chapter into a group', () => {
    const { into } = collapseGraph(graph, { fold: folder, types: new Set(['chapter']) }, () => '');
    expect([into.get('node:walls'), into.get('node:c2')]).toEqual(['group:chapter', 'group:chapter']);
  });

  it('a limit keeps the most connected, and always what must stay; the rest is counted', () => {
    const { graph: g, total, cut } = limitGraph(graph, 3);
    expect([total, cut, g.nodes.length]).toEqual([graph.nodes.length, graph.nodes.length - 3, 3]);
    // The three most connected: Mira (6 connections), the siege (5), Chapter 2 (3).
    expect(g.nodes.map((n) => n.label)).toEqual(['Chapter 2', 'Mira', 'The siege']);
    const kept = limitGraph(graph, 3, new Set(['entry:hermit']));
    expect(kept.graph.nodes.some((n) => n.key === 'entry:hermit')).toBe(true);
    expect(kept.graph.nodes.length).toBe(3);
    expect(limitGraph(graph, 1000)).toMatchObject({ cut: 0, graph });
    // Only edges between what is drawn.
    expect(g.edges.every((e) => g.nodes.some((n) => n.key === e.from) && g.nodes.some((n) => n.key === e.to))).toBe(true);
  });
});

describe('a large novel stays quick', () => {
  it('3,000 records and 9,000 connections: built, filtered, folded and limited in good time; the layout of what is drawn too', async () => {
    const many = Array.from({ length: 3000 }, (_, i) => entry(`e${i}`, `Entry ${String(i).padStart(4, '0')}`, ['character', 'location', 'faction', 'item'][i % 4]));
    const links = Array.from({ length: 9000 }, (_, i) => link(`x${i}`, `e${i % 3000}`, `e${(i * 13 + 7) % 3000}`, ['knows-about', 'owns', 'member-of', 'related'][i % 4]));
    const big = buildModel({ project: { id: 'p' } as never, nodes: [], plans: [], entries: many, schemas: [], links, relations: [], events: [], threads: [], systems: [], sheets: [] });
    const started = performance.now();
    const full = knowledgeGraph(big);
    const shown = queryGraph(full, { hiddenEdges: new Set(['link:related']) });
    const folded = collapseGraph(shown, { types: new Set(['entry:item']) }, (t, n) => `${n} ${t}`);
    const drawn = limitGraph(folded.graph, DRAW_LIMIT);
    const queried = performance.now() - started;
    expect(queried).toBeLessThan(3000);
    expect([full.nodes.length, full.edges.length, drawn.graph.nodes.length, drawn.total]).toEqual([3000, 9000, DRAW_LIMIT, 2251]);
    const { layoutNetwork } = await import('@/modules/relationships/network');
    const laidOut = performance.now();
    const layout = layoutNetwork(drawn.graph.nodes.map((n) => ({ id: n.key, degree: n.degree })), drawn.graph.edges.map((e) => ({ from: e.from, to: e.to })));
    expect(performance.now() - laidOut).toBeLessThan(4000);
    expect(layout.size).toBe(DRAW_LIMIT);
  });
});
