// Reference outputs of the original app's knowledge graph: every record and connection, the layers, words and focus,
// folding, the drawing limit, paths between records, counts, labels and letter codes, on real files and the
// generated ones (chronicle, court, saga).
// GOLDEN_OUT=<dir> npx vitest run golden/graph.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { EDGE_GROUPS, groupOf, pairsOf, shapeOf, typeCodes } from '@/modules/graph/components/KnowledgeMap';
import { collapseGraph, edgeTypeLabel, edgeWords, knowledgeGraph, limitGraph, neighbourhood, nodeTypeLabel, pathBetween, queryGraph, refOf, typeCounts, type KnowledgeGraph } from '@/modules/graph/knowledge';
import { buildModel } from '@/modules/model/model';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
  chronicle: `${OUT}/chronicle.novel.json`,
  court: `${OUT}/court.novel.json`,
  saga: `${OUT}/saga.novel.json`,
};
const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (v > 0 ? 'Infinity' : '-Infinity') : v), 1);

const shape = (g: KnowledgeGraph) => ({
  nodes: g.nodes.map((n) => ({ key: n.key, type: n.type, label: n.label, aka: n.aka ?? null, color: n.color, degree: n.degree, members: (n as any).members ?? null })),
  edges: g.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind, type: e.type, label: e.label, reverseLabel: e.reverseLabel ?? null, directed: e.directed })),
  dangling: g.dangling,
  excluded: g.excluded ?? null,
  undrawn: g.undrawn ?? null,
});

const report = (c: Record<string, any[]>, project: unknown) => {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const full = knowledgeGraph(model);
  const counts = typeCounts(full);
  const types = [...new Set(full.nodes.map((n) => n.type))];
  const edgeTypes = [...new Set(full.edges.map((e) => e.type))];
  // The most connected records, as the views would focus on them.
  const ranked = [...full.nodes].sort((a, b) => b.degree - a.degree || a.key.localeCompare(b.key));
  const hub = ranked[0]?.key ?? 'entry:none';
  const second = ranked[1]?.key ?? hub;
  const word = full.nodes.find((n) => n.label.length > 3)?.label.slice(1, 4) ?? 'a';
  const queries: Record<string, any> = {
    all: {},
    isolated: { isolated: true },
    hideFirstType: { hiddenNodes: [types[0]] },
    hideFirstEdge: { hiddenEdges: [edgeTypes[0]] },
    hideStatuses: { hiddenStatuses: ['provisional', 'disputed'] },
    text: { text: ` ${word.toUpperCase()} ` },
    focus1: { focus: { key: hub, depth: 1 } },
    focus2: { focus: { key: second, depth: 2 } },
    focusHidden: { focus: { key: hub, depth: 2 }, hiddenNodes: [types[1] ?? 'none'] },
    textAndFocus: { text: word, focus: { key: hub, depth: 1 }, isolated: true },
    focusGone: { focus: { key: 'entry:gone', depth: 1 } },
  };
  const queried = Object.fromEntries(
    Object.entries(queries).map(([name, q]) => {
      const g = queryGraph(full, { ...q, hiddenNodes: q.hiddenNodes && new Set(q.hiddenNodes), hiddenEdges: q.hiddenEdges && new Set(q.hiddenEdges), hiddenStatuses: q.hiddenStatuses && new Set(q.hiddenStatuses) });
      return [name, { nodes: g.nodes.map((n) => n.key), edges: g.edges.map((e) => e.id) }];
    }),
  );
  const folder = (key: string) => {
    const ref = refOf(key);
    const node = ref?.type === 'node' ? model.nodes.get(ref.id) : undefined;
    return node?.kind === 'scene' && node.parentId && model.nodes.get(node.parentId)?.kind === 'chapter' ? `node:${node.parentId}` : null;
  };
  const groupLabel = (type: string, count: number) => `${count} ${nodeTypeLabel(type, model).toLowerCase()}`;
  const collapse = (types: string[], fold: boolean) => {
    const r = collapseGraph(full, { types: new Set(types), fold: fold ? folder : undefined }, groupLabel);
    return { graph: shape(r.graph), into: Object.fromEntries([...r.into].filter(([k, v]) => k !== v)), inside: r.inside };
  };
  const limits = Object.fromEntries(
    [3, 10, 200].map((n) => {
      const r = limitGraph(full, n, new Set([full.nodes.at(-1)?.key ?? 'x', 'entry:gone']));
      return [n, { nodes: r.graph.nodes.map((x) => x.key), edges: r.graph.edges.map((e) => e.id), total: r.total, cut: r.cut }];
    }),
  );
  const labelOf = (key: string) => full.nodes.find((n) => n.key === key)?.label ?? 'Something deleted';
  const paths = Object.fromEntries(
    full.nodes.slice(0, 12).map((n) => {
      const p = pathBetween(full.edges, hub, n.key);
      return [n.key, p && p.map((e) => e.id)];
    }),
  );
  return {
    full: shape(full),
    counts,
    typeLabels: Object.fromEntries([...types, 'entry:gone', 'nonsense'].map((t) => [t, nodeTypeLabel(t, model)])),
    edgeTypeLabels: Object.fromEntries([...edgeTypes, 'link:nonsense', 'nonsense'].map((t) => [t, edgeTypeLabel(t)])),
    codes: Object.fromEntries(typeCodes(full.nodes.map((n) => n.type), (t) => nodeTypeLabel(t, model))),
    shapes: Object.fromEntries(types.map((t) => [t, shapeOf(t)])),
    groups: Object.fromEntries(full.edges.map((e) => [e.id, groupOf(e)])),
    words: full.edges.slice(0, 30).map((e) => edgeWords(e, labelOf)),
    pairs: pairsOf(full.edges).map((p) => ({ key: p.key, edges: p.edges.map((e) => e.id) })),
    queries: queried,
    neighbourhood: { one: [...neighbourhood(full.edges, hub, 1)].sort(), two: [...neighbourhood(full.edges, hub, 2)].sort() },
    collapsed: { fold: collapse([], true), types: collapse(types.slice(0, 2), false), both: collapse(['chapter', 'scene', types[0]], true) },
    limits,
    paths: { hub, paths, self: pathBetween(full.edges, hub, hub), tooFar: pathBetween(full.edges, hub, second, 1)?.map((e) => e.id) ?? null },
  };
};

test('graph', () => {
  const out: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(FIXTURES)) {
    const file = JSON.parse(readFileSync(path.startsWith('/') ? path : join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
  }
  out.edgeGroups = EDGE_GROUPS;
  out.typeCodes = {
    shared: Object.fromEntries(typeCodes(['entry:character', 'entry:location', 'entry:faction', 'event', 'chapter', 'thread', 'ability', 'scene'], (t) => ({ 'entry:character': 'Characters', 'entry:location': 'Locations', 'entry:faction': 'Factions', event: 'Events', chapter: 'Chapters', thread: 'Plot threads', ability: 'Abilities', scene: 'Scenes' })[t] ?? t)),
    clash: Object.fromEntries(typeCodes(['entry:a', 'entry:b', 'entry:c', 'entry:d'], (t) => ({ 'entry:a': 'Cats', 'entry:b': 'Cattle', 'entry:c': 'Catalogue', 'entry:d': '!!!' })[t] ?? t)),
    alone: Object.fromEntries(typeCodes(['entry:character', 'event'], (t) => t)),
  };
  writeFileSync(join(OUT, 'graph.golden.json'), json(out));
});
