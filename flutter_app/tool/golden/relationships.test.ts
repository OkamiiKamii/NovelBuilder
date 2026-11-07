// Reference outputs of the original app's relationship history and network, on both real files and on a generated
// court (written beside the goldens so the Dart tests read the very same records).
// GOLDEN_OUT=<dir> npx vitest run golden/relationships.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { buildModel } from '@/modules/model/model';
import { relationNetwork, stageShown, type When } from '@/modules/relationships/network';
import { stageDifferences, timelineOf } from '@/modules/relationships/timeline';
import { RELATION_PRESETS } from '@/modules/relationships/types';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};

/** A deterministic court: characters, chapters, factions, relationships with histories, and other connections. */
function court() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const id = (k: string, i: number) => `00000000-0000-4000-8000-${k}${String(i).padStart(11, '0')}`;
  const chapters = Array.from({ length: 8 }, (_, i) => ({ id: id('c', i), projectId: 'court', parentId: null, kind: 'chapter', title: `Chapter ${i + 1}`, order: i, mentions: [], createdAt: i }));
  const people = Array.from({ length: 40 }, (_, i) => ({ id: id('p', i), projectId: 'court', category: 'character', name: `Courtier ${String(i).padStart(2, '0')}`, summary: '', description: '', tags: [], fields: [], createdAt: i }));
  const factions = Array.from({ length: 3 }, (_, i) => ({ id: id('f', i), projectId: 'court', category: 'faction', name: `House ${i}`, summary: '', description: '', tags: [], fields: [], createdAt: 100 + i }));
  const presets = RELATION_PRESETS.filter((p) => p.key !== 'custom');
  const stage = (n: number, start: string | null, unknown = false) => {
    const p = presets[Math.floor(rnd() * presets.length)];
    return { id: `s${n}`, startNodeId: start, preset: p.key, category: p.category, label: p.label, fromRole: p.fromRole, toRole: p.toRole, directional: p.directional, title: rnd() < 0.2 ? `Phase ${n}` : '', affinity: ['hostile', 'reluctant', 'neutral', 'friendly', 'trusting'][Math.floor(rnd() * 5)], event: '', notes: '', ...(unknown ? { startUnknown: true } : {}), ...(rnd() < 0.3 ? { attributes: { trust: { from: Math.floor(rnd() * 11), to: rnd() < 0.5 ? null : Math.floor(rnd() * 11) } } } : {}) };
  };
  const relations = [];
  const seen = new Set<string>();
  let n = 0;
  while (relations.length < 120) {
    const a = Math.floor(rnd() * 40), b = Math.floor(rnd() * 40);
    if (a === b || seen.has(`${Math.min(a, b)}-${Math.max(a, b)}`)) continue;
    seen.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
    const count = 1 + Math.floor(rnd() * 4);
    const stages = Array.from({ length: count }, (_, k) => (k === 0 ? stage(n++, rnd() < 0.7 ? null : chapters[Math.floor(rnd() * 3)].id) : rnd() < 0.2 ? stage(n++, null, true) : stage(n++, chapters[Math.floor(rnd() * 8)].id)));
    relations.push({ id: id('r', relations.length), projectId: 'court', fromId: people[a].id, toId: people[b].id, stages, createdAt: relations.length, updatedAt: 0 });
  }
  const links = [
    ...people.map((p, i) => ({ id: id('m', i), projectId: 'court', fromId: p.id, toId: factions[i % 3].id, fromType: 'entry', toType: 'entry', type: 'member-of', fromLabel: '', toLabel: '', createdAt: i })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: id('d', i), projectId: 'court', fromId: people[i].id, toId: people[(i * 7 + 3) % 40].id, fromType: 'entry', toType: 'entry', type: 'distrusts', fromLabel: '', toLabel: '', createdAt: 200 + i })),
  ];
  return { chapters, loreEntries: [...people, ...factions], characterRelations: relations, loreLinks: links };
}

const report = (c: Record<string, any[]>, project: unknown) => {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const chapters = model.order.chapters.map((n) => n.id);
  const characters = [...model.entries.values()].filter((e) => e.category === 'character').map((e) => e.id).sort();
  const factions = [...model.entries.values()].filter((e) => e.category === 'faction').map((e) => e.id).sort();
  const name = (id: string) => model.entries.get(id)?.name ?? '?';
  const attributes = [{ key: 'trust', label: 'Trust' }];
  const timelines = Object.fromEntries([...model.relations.values()].map((r) => [r.id, timelineOf(r, model.order).map((t, i, all) => ({ stage: t.stage.id, range: t.range, orphaned: t.orphaned, changes: stageDifferences(i === 0 ? null : all[i - 1].stage, t.stage, { from: name(r.fromId), to: name(r.toId) }, attributes) }))]));
  const whens: Record<string, When> = { current: { kind: 'current' }, ever: { kind: 'ever' }, ...(chapters[2] ? { at3: { kind: 'at', nodeId: chapters[2] }, range: { kind: 'range', from: chapters[1] ?? null, to: chapters[3] ?? null } } : {}) };
  const shown = Object.fromEntries(Object.entries(whens).map(([k, w]) => [k, Object.fromEntries([...model.relations.values()].map((r) => [r.id, stageShown(r, model, w)?.id ?? null]))]));
  const filters: Record<string, Parameters<typeof relationNetwork>[1]> = {
    all: {}, ever: { when: { kind: 'ever' } }, isolated: { isolated: true }, friends: { type: 'friends' },
    noSocial: { hidden: ['social', 'connection'] }, faction: { factionId: factions[0] ?? null },
    focus1: { focus: characters[0] ? { id: characters[0], depth: 1 } : null }, focus2: { focus: characters[0] ? { id: characters[0], depth: 2 } : null },
    ...(chapters[2] ? { at3: { when: { kind: 'at', nodeId: chapters[2] } } } : {}),
  };
  const networks = Object.fromEntries(Object.entries(filters).map(([k, f]) => {
    const net = relationNetwork(model, f);
    return [k, { nodes: net.nodes, edges: net.edges.map((e) => ({ id: e.id, kind: e.kind, from: e.from, to: e.to, directed: e.directed, label: e.label, fromRole: e.fromRole, toRole: e.toRole, category: e.category, affinity: e.affinity, stage: e.stage?.id ?? null, range: e.range })), total: net.total, hidden: net.hidden }];
  }));
  return { timelines, shown, networks };
};

test('relationships', () => {
  const out: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(FIXTURES)) {
    const file = JSON.parse(readFileSync(join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
  }
  const c = court();
  const project = { id: 'court', title: 'The Court', createdAt: 0, updatedAt: 0 };
  out.court = report(c, project);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'relationships.golden.json'), JSON.stringify(out, null, 1));
  writeFileSync(join(OUT, 'court.novel.json'), JSON.stringify({ format: 'novel-builder/project', version: 4, exportedAt: 0, project, collections: c }, null, 1));
});
