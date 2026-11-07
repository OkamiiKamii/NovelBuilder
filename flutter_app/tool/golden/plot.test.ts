// Reference outputs of the original app's plot lanes, thread reminders, scene board, structure and pacing, and the
// appearance matrix, on both real files and a generated saga (written beside the goldens so the Dart tests read the
// very same records).
// GOLDEN_OUT=<dir> npx vitest run golden/plot.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { appearanceMatrix } from '@/modules/characters/appearances';
import { boardOf, bulkOf, changeWords, dropOf, filterBoard, placeOf, undoProblem } from '@/modules/manuscript/board';
import { buildModel } from '@/modules/model/model';
import { beatPlace, diagnose } from '@/modules/plot/diagnostics';
import { endsOf, gapWords, threadLanes, threadsByNode } from '@/modules/plot/lanes';
import { barOf, labelDistribution, lengthBars, lengthFacts, partBands, placeMarkers, usedLabels } from '@/modules/structure/pacing';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};

/** A deterministic saga: volumes, acts, chapters and scenes with words and statuses; threads with every kind of beat; plans with labels and appearance records; markers. */
function saga() {
  let seed = 23;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T>(list: T[]) => list[Math.floor(rnd() * list.length)];
  const id = (k: string, i: number) => `00000000-0000-4000-8000-${k}${String(i).padStart(11, '0')}`;
  const P = 'saga';
  const statuses = ['idea', 'planned', 'drafting', 'draft-complete', 'revising', 'final', 'published'];
  const nodes: any[] = [];
  const node = (k: string, i: number, kind: string, parentId: string | null, title: string, order: number, words = 0) => {
    const n = { id: id(k, i), projectId: P, parentId, kind, title, order, summary: rnd() < 0.3 ? `About ${title.toLowerCase()}` : '', notes: '', status: pick(statuses), wordCount: words, charCount: words * 5, mentions: [], createdAt: i };
    nodes.push(n);
    return n;
  };
  const v1 = node('v', 0, 'volume', null, 'Book One', 0);
  const a1 = node('a', 0, 'act', v1.id, 'Act I', 0);
  const a2 = node('a', 1, 'act', v1.id, 'Act II', 1);
  node('a', 2, 'act', v1.id, 'Act III (empty)', 2);
  const chapters: any[] = [];
  for (let i = 0; i < 14; i++) {
    const parent = i < 5 ? a1.id : i < 9 ? a2.id : i === 9 ? v1.id : null;
    chapters.push(node('c', i, 'chapter', parent, i === 3 ? '' : `Chapter ${i + 1}`, i < 5 ? i : i < 9 ? i - 5 : i === 9 ? 10 : i, rnd() < 0.25 ? 0 : Math.floor(rnd() * 4000)));
  }
  const scenes: any[] = [];
  chapters.forEach((c, ci) => {
    const count = ci % 3 === 0 ? 0 : 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) scenes.push(node('s', scenes.length, 'scene', c.id, k === 1 ? '' : `Scene ${ci + 1}.${k + 1}`, k, rnd() < 0.2 ? 0 : Math.floor(rnd() * 2500)));
  });
  const docs = [...chapters, ...scenes];
  const people = Array.from({ length: 8 }, (_, i) => ({ id: id('p', i), projectId: P, category: 'character', name: `Hero ${String.fromCharCode(65 + i)}`, summary: '', description: '', tags: [], fields: [], createdAt: 100 + i }));
  const places = Array.from({ length: 3 }, (_, i) => ({ id: id('l', i), projectId: P, category: 'location', name: `Town ${i}`, summary: '', description: '', tags: [], fields: [], createdAt: 200 + i }));
  const labelSet = ['Action', 'action', 'Dialogue', 'Quiet moment', 'Heist', 'heist', 'Mystery clue', 'Fight'];
  const plans = docs.filter(() => rnd() < 0.6).map((d) => {
    const appear = people.filter(() => rnd() < 0.25).map((p) => p.id);
    return { id: d.id, projectId: P, objective: '', beats: [], entityIds: rnd() < 0.3 ? [pick(places).id, pick(people).id] : [], labels: rnd() < 0.7 ? [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(labelSet)))] : [], appearIds: appear, mentionIds: people.filter((p) => !appear.includes(p.id) && rnd() < 0.15).map((p) => p.id), povIds: rnd() < 0.3 ? [pick(people).id] : [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', updatedAt: 0 };
  });
  for (const d of docs) if (rnd() < 0.2) d.mentions = [pick(people).id];
  const roles = ['introduction', 'development', 'intersection', 'resolution', 'appears', undefined];
  const threads = Array.from({ length: 6 }, (_, i) => ({
    id: id('t', i), projectId: P, title: i === 4 ? 'A thread' : `Thread ${String.fromCharCode(70 - i)}`, premise: '', category: pick(['main', 'subplot', 'mystery', 'custom']), customCategory: i === 2 ? 'Prophecy' : '',
    status: pick(['planned', 'active', 'paused', 'resolved', 'custom', 'active']), customStatus: i === 1 ? 'Simmering' : undefined, characterIds: [pick(people).id], locationIds: [], targetNodeId: i === 0 ? a1.id : i === 3 ? chapters[2].id : null, targetNote: '', notes: '', muted: i === 5, createdAt: i, updatedAt: 0,
    beats: [] as any[],
  }));
  threads.forEach((t, i) => {
    const count = i === 4 ? 0 : 2 + Math.floor(rnd() * 5);
    for (let k = 0; k < count; k++) {
      const role = pick(roles);
      const where = rnd() < 0.1 ? null : rnd() < 0.08 ? id('z', k) : pick(docs).id;
      const beat: any = { id: `${t.id}-b${k}`, nodeId: where, title: role === 'appears' && rnd() < 0.5 ? '' : `Beat ${k + 1}`, note: rnd() < 0.2 ? 'A note' : '', createdAt: k };
      if (role) beat.role = role;
      if (role === 'intersection') beat.withThreadIds = [threads[(i + 1) % threads.length].id, 'gone'];
      t.beats.push(beat);
    }
  });
  const events = Array.from({ length: 10 }, (_, i) => ({ id: id('e', i), projectId: P, name: `Event ${i}`, description: '', when: { precision: 'exact', year: 100 + i, month: null, day: null, hour: null, minute: null }, duration: null, importance: 'minor', locationId: rnd() < 0.5 ? pick(places).id : null, characters: people.filter(() => rnd() < 0.2).map((p) => ({ id: p.id, age: null })), entryIds: [], nodeIds: rnd() < 0.8 ? [pick(docs).id] : [], afterId: null, threadIds: rnd() < 0.6 ? [pick(threads).id] : [], labels: rnd() < 0.3 ? ['FIGHT'] : [], createdAt: i, updatedAt: 0 }));
  const markers = [
    { id: id('m', 0), projectId: P, kind: 'Inciting incident', title: 'The call', nodeId: chapters[1].id, eventId: null, note: '', createdAt: 1, updatedAt: 0 },
    { id: id('m', 1), projectId: P, kind: 'Midpoint', title: '', nodeId: null, eventId: events.find((e) => e.nodeIds.length)!.id, note: '', createdAt: 2, updatedAt: 0 },
    { id: id('m', 2), projectId: P, kind: 'Climax', title: 'Gone chapter', nodeId: id('z', 9), eventId: null, note: '', createdAt: 3, updatedAt: 0 },
    { id: id('m', 3), projectId: P, kind: 'My own', title: 'Nowhere yet', nodeId: null, eventId: null, note: '', createdAt: 4, updatedAt: 0 },
    { id: id('m', 4), projectId: P, kind: 'Act break', title: '', nodeId: scenes[2].id, eventId: null, note: '', createdAt: 0, updatedAt: 0 },
  ];
  return { chapters: nodes, chapterPlans: plans, loreEntries: [...people, ...places], plotThreads: threads, timelineEvents: events, structureMarkers: markers };
}

const report = (c: Record<string, any[]>, project: unknown) => {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const nodes = [...model.nodes.values()];
  const lanes = threadLanes(model);
  const laneOut = {
    chapters: lanes.chapters,
    lanes: lanes.lanes.map((l) => ({ thread: l.thread.id, cells: l.cells.map((c) => ({ places: c.places.map((p) => [p.nodeId, p.chapterId, p.beats.map((b) => b.id), p.eventIds]), beats: c.beats.map((b) => b.id), events: c.eventIds, role: c.role })), first: l.first, last: l.last, gaps: l.gaps.map((g) => ({ ...g, words: gapWords(lanes, g) })), crossings: l.crossings, unplaced: l.unplaced.map((b) => b.id), untold: l.untold, ends: endsOf(l, lanes) })),
  };
  const byNode = Object.fromEntries([...threadsByNode(model)].map(([k, v]) => [k, v.map((h) => ({ thread: h.thread.id, roles: h.roles, plain: h.plainIds, events: h.events }))]));
  const threads = [...model.threads.values()];
  const diagnosis = Object.fromEntries([5, 20].map((q) => {
    const d = diagnose(threads, nodes, q);
    return [q, { frontier: d.frontier, chapters: d.chapterCount, reports: d.reports.map((r) => ({ thread: r.thread.id, beats: r.beats.map((b) => [b.beat.id, b.node?.id ?? null, b.chapter, b.missing, beatPlace(b)]), quietFor: r.quietFor, issues: r.issues, silenced: r.silenced })) }];
  }));
  const partsOut = (parts: ReturnType<typeof boardOf>) => parts.map((p) => ({ key: p.key, parentId: p.parentId, path: p.path.map((n) => n.id), columns: p.columns.map((col) => ({ chapter: col.chapter.id, words: col.words, scenes: col.scenes.map((s) => [s.node.id, s.words]) })), endBeforeId: p.endBeforeId }));
  const board = boardOf(nodes);
  const statusOf = nodes.find((n) => n.kind === 'chapter')?.status ?? 'idea';
  const filters = { status: filterBoard(board, { status: statusOf as any, text: '' }), text: filterBoard(board, { status: null, text: 'SCENE 2' }), thread: threads[0] ? filterBoard(board, { status: null, text: '', nodeIds: new Set(threadsByNode(model).keys()) }) : [] };
  const docs = nodes.filter((n) => n.kind === 'chapter' || n.kind === 'scene');
  const ids = docs.map((n) => n.id);
  const moves = docs.slice(0, 12).flatMap((n, i) => {
    const targets = [{ parentId: n.parentId, beforeId: null }, { parentId: n.parentId, beforeId: ids[(i + 3) % ids.length] }, { parentId: nodes.find((x) => x.kind !== n.kind && x.kind !== 'scene')?.id ?? null, beforeId: null }, { parentId: null, beforeId: null }, { parentId: n.id, beforeId: null }];
    return targets.map((to) => ({ node: n.id, to, drop: dropOf(nodes, n.id, to), bulk: bulkOf(nodes, n.id, to), place: placeOf(nodes, n.id) }));
  });
  const first = docs[0];
  const undo = first ? [
    { kind: 'status' as const, nodeId: first.id, title: first.title, from: 'idea' as const, to: first.status },
    { kind: 'status' as const, nodeId: first.id, title: first.title, from: 'idea' as const, to: 'published' as const },
    { kind: 'move' as const, nodeId: first.id, title: first.title, from: { parentId: null, beforeId: null }, to: placeOf(nodes, first.id)! },
    { kind: 'move' as const, nodeId: first.id, title: first.title, from: { parentId: 'gone', beforeId: null }, to: placeOf(nodes, first.id)! },
    { kind: 'move' as const, nodeId: 'gone', title: 'Gone', from: { parentId: null, beforeId: null }, to: { parentId: null, beforeId: null } },
  ].map((ch) => ({ problem: undoProblem(nodes, ch), words: changeWords(ch, nodes) })) : [];
  const parts = nodes.filter((n) => n.kind === 'volume' || n.kind === 'act' || n.kind === 'arc').map((n) => n.id);
  const pacing = Object.fromEntries(['chapters', 'scenes'].flatMap((grain) => [null, ...parts.slice(0, 2)].map((partId) => {
    const bars = lengthBars(model, { grain: grain as any, partId });
    const facts = lengthFacts(bars);
    const dist = labelDistribution(bars, model, grain as any);
    return [`${grain}:${partId ?? 'all'}`, { bars, bands: partBands(bars, model), facts: { ...facts, longest: facts.longest?.nodeId ?? null, shortest: facts.shortest?.nodeId ?? null }, labels: { labels: dist.labels, cells: dist.cells.map((c) => ({ nodeId: c.nodeId, words: Object.fromEntries(c.words), unlabelled: c.unlabelled })), totals: dist.totals, unlabelled: dist.unlabelled } }];
  })));
  const placed = placeMarkers(rows('structureMarkers'), model);
  const barsC = lengthBars(model, { grain: 'chapters', partId: null });
  const barsS = lengthBars(model, { grain: 'scenes', partId: null });
  const markers = placed.map((p) => ({ marker: p.marker.id, nodeId: p.nodeId, via: p.via, missing: p.missing, barC: barOf(p, barsC, model), barS: barOf(p, barsS, model) }));
  const matrices = Object.fromEntries([
    ['chapters', { grain: 'chapters' }], ['scenes', { grain: 'scenes' }], ['all', { grain: 'chapters', all: true }],
    ['thread', { grain: 'scenes', threadId: threads[0]?.id ?? null }], ['place', { grain: 'chapters', placeId: [...model.entries.values()].find((e) => e.category === 'location')?.id ?? null }],
    ['status', { grain: 'scenes', status: statusOf }], ['range', { grain: 'chapters', from: model.order.chapters[1]?.id ?? null, to: model.order.chapters[3]?.id ?? null }],
  ].map(([k, f]) => {
    const m = appearanceMatrix(model, f as any);
    return [k, { columns: m.columns, rows: m.rows.map((r) => ({ id: r.characterId, name: r.name, recorded: r.recorded, cells: r.cells.map((c) => c.state) })), hidden: m.hidden, characters: m.characters }];
  }));
  return { lanes: laneOut, byNode, diagnosis, board: partsOut(board), filters: Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, partsOut(v)])), moves, undo, pacing, used: usedLabels(model), markers, matrices };
};

test('plot', () => {
  const out: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(FIXTURES)) {
    const file = JSON.parse(readFileSync(join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
  }
  const s = saga();
  const project = { id: 'saga', title: 'The Saga', createdAt: 0, updatedAt: 0 };
  out.saga = report(s, project);
  writeFileSync(join(OUT, 'plot.golden.json'), JSON.stringify(out, null, 1));
  writeFileSync(join(OUT, 'saga.novel.json'), JSON.stringify({ format: 'novel-builder/project', version: 4, exportedAt: 0, project, collections: s }, null, 1));
});
