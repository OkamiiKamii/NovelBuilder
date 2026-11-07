// Reference outputs of the original app's writing progress and creative analytics: the progress report (goals,
// deadlines, runs), the project analytics (output, sessions, structure, cast, threads, observations) and every chart
// under many filters, with the chart filter read from an address, nice steps and the CSV file. On real files and a
// generated novel with a writing log (written beside the goldens so the Dart tests read the very same records).
// GOLDEN_OUT=<dir> npx vitest run golden/analytics.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { analyticsCharts, niceStep, readChartFilter, toCsv, type ChartFilter } from '@/modules/analytics/charts';
import { computeAnalytics } from '@/modules/analytics/compute';
import { buildModel } from '@/modules/model/model';
import { computeProgress } from '@/modules/progress/analytics';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};
const json = (value: unknown) => JSON.stringify(value, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v), 1);

/** Noon on October 25, 2026: the day the reports are read on. */
const NOW = new Date(2026, 9, 25, 12).getTime();
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime();

// ---------------------------------------------------------------------------------------------------- the analytics novel

function analyticsNovel() {
  const P = 'analytics';
  let order = 0;
  const node = (id: string, title: string, kind: string, parentId: string | null, wordCount: number, status = 'drafting', more: Record<string, unknown> = {}) => ({ id, projectId: P, parentId, kind, title, order: order++, summary: '', notes: '', status, wordCount, charCount: wordCount * 5, createdAt: order, updatedAt: 0, ...more });
  const nodes = [
    node('v1', 'Book One', 'volume', null, 0, 'idea'),
    node('c1', 'The Call', 'chapter', 'v1', 2400, 'final', { mentions: ['orrin'] }),
    node('c2', 'Crossing', 'chapter', 'v1', 0, 'revising'),
    node('s2a', 'At the river', 'scene', 'c2', 1800, 'draft-complete'),
    node('s2b', '', 'scene', 'c2', 900, 'drafting'),
    node('c3', '  ', 'chapter', 'v1', 300, 'drafting'),
    node('s3a', 'The tower', 'scene', 'c3', 4100, 'published'),
    node('c4', 'Quiet', 'chapter', 'v1', 0, 'planned'),
    node('c5', 'Ashes', 'chapter', 'v1', 12500, 'drafting'),
    node('c6', 'Return', 'chapter', 'v1', 1250, 'idea'),
  ];
  const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const doc = (...texts: string[]) => ({ type: 'doc', content: texts.map(para) });
  const chapterContents = [
    { id: 'c1', projectId: P, doc: doc('Mira woke before the bells.', 'The road north was empty.'), updatedAt: 0 },
    { id: 's2a', projectId: P, doc: doc('Mira and Kai crossed at dawn.'), updatedAt: 0 },
    { id: 's2b', projectId: P, doc: doc('Kai said nothing. Miracles were rare.'), updatedAt: 0 },
    { id: 's3a', projectId: P, doc: doc('Pell waited in the tower.'), updatedAt: 0 },
    { id: 'c5', projectId: P, doc: doc('Ash fell over everything. Mira, Kai and Pell.'), updatedAt: 0 },
    { id: 'c6', projectId: P, doc: doc('Home, at last.'), updatedAt: 0 },
  ];
  const entry = (id: string, name: string, category = 'character') => ({ id, projectId: P, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: order++, updatedAt: 0 });
  const loreEntries = [entry('mira', 'Mira'), entry('kai', 'Kai'), entry('pell', 'Pell'), entry('orrin', 'Orrin'), entry('zed', 'Zed'), entry('ana', 'Ana'), entry('tower', 'The Tower', 'location')];
  const plan = (id: string, more: Record<string, unknown>) => ({ id, projectId: P, objective: '', beats: [], entityIds: [], labels: [], appearIds: [], mentionIds: [], povIds: [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', updatedAt: 0, ...more });
  const chapterPlans = [
    plan('c1', { povIds: ['mira'], labels: ['Action', 'opening'], appearIds: ['mira'], mentionIds: ['pell'] }),
    plan('c2', { povIds: ['kai'], labels: ['travel'] }),
    plan('s2a', { labels: ['action', 'Dialogue'], appearIds: ['mira', 'kai'] }),
    plan('s2b', { povIds: ['mira', 'kai'], labels: ['dialogue'], entityIds: ['ana'] }),
    plan('s3a', { povIds: ['pell', 'gone'], labels: ['Quiet moment'], appearIds: ['pell'] }),
    plan('c5', { povIds: ['mira'], labels: ['ACTION'], appearIds: ['mira', 'kai', 'pell'] }),
  ];
  const thread = (id: string, title: string, category: string, status: string, beats: [string | null, string?][], more: Record<string, unknown> = {}) => ({
    id, projectId: P, title, premise: '', category, customCategory: '', status, characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', notes: '', createdAt: order++, updatedAt: 0,
    beats: beats.map(([nodeId, role], k) => ({ id: `${id}-b${k}`, nodeId, title: `Beat ${k + 1}`, note: '', createdAt: k, ...(role ? { role } : {}) })),
    ...more,
  });
  const plotThreads = [
    thread('t1', 'The heir', 'main', 'active', [['c1', 'introduction'], ['s2a', 'development'], ['c5']]),
    thread('t2', 'Who burned the tower', 'mystery', 'active', [['c1', 'introduction']]),
    thread('t3', 'Kai learns to trust', 'character-arc', 'paused', [['s2b'], ['s3a'], [null]]),
    thread('t4', 'Old debts', 'custom', 'custom', [], { customCategory: 'Vendetta', customStatus: 'Simmering' }),
    thread('t5', 'A quiet one', 'subplot', 'active', []),
    thread('t6', 'The war', 'main', 'resolved', [['c6', 'resolution']]),
  ];
  const date = (year: number, month: number | null = null, day: number | null = null) => ({ precision: 'exact', year, month, day, hour: null, minute: null });
  const event = (id: string, name: string, when: unknown, nodeIds: string[], threadIds: string[] = []) => ({ id, projectId: P, name, description: '', when, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds, afterId: null, threadIds, createdAt: order++, updatedAt: 0 });
  const timelineEvents = [
    event('e1', 'The summons', date(310, 3, 1), ['c1'], ['t1']),
    event('e2', 'The crossing', date(310, 4), ['s2a'], ['t1']),
    event('e3', 'The fire', { precision: 'approximate', year: 302, month: null, season: null, day: null, hour: null, minute: null }, [], ['t2']),
    event('e4', 'Someday', { precision: 'unknown' }, ['c5']),
    event('e5', 'The ashes', date(311), ['c5'], ['t1', 't2']),
    event('e6', 'Home', date(340), ['c6'], ['t6']),
    event('e7', 'The tower', date(305), ['s3a']),
  ];
  const characterRelations = [
    { id: 'r1', projectId: P, fromId: 'mira', toId: 'kai', type: 'Friends', description: '', createdAt: 0, updatedAt: 0 },
    { id: 'r2', projectId: P, fromId: 'mira', toId: 'pell', type: 'Rivals', description: '', createdAt: 0, updatedAt: 0 },
    { id: 'r3', projectId: P, fromId: 'zed', toId: 'zed', type: 'Self', description: '', createdAt: 0, updatedAt: 0 },
  ];
  const progressSnapshots = [
    { id: 'p1', projectId: P, entryId: 'mira', nodeId: 'c1', title: 'Start', note: '', values: {}, createdAt: 0, updatedAt: 0 },
    { id: 'p2', projectId: P, entryId: 'mira', nodeId: 'c5', title: 'After', note: '', values: {}, createdAt: 1, updatedAt: 0 },
    { id: 'p3', projectId: P, entryId: 'kai', nodeId: null, title: 'Before', note: '', values: {}, createdAt: 2, updatedAt: 0 },
  ];
  // A writing log: a run ending yesterday, an older run, sessions in other months, and a day with words removed.
  const session = (id: string, day: string, hour: number, minutes: number, added: number, removed: number) => ({ id, projectId: P, day, startedAt: at(day, hour), lastActiveAt: at(day, hour) + minutes * 60000, netWords: added - removed, added, removed, saves: 3 });
  const writingSessions = [
    session('w1', '2026-08-30', 9, 45, 1200, 100),
    session('w2', '2026-09-28', 20, 90, 2100, 0),
    session('w3', '2026-09-29', 21, 30, 800, 50),
    session('w4', '2026-09-30', 7, 20, 400, 0),
    session('w5', '2026-10-01', 8, 0, 0, 0),
    session('w6', '2026-10-10', 10, 120, 3500, 300),
    session('w7', '2026-10-19', 10, 25, 600, 0),
    session('w8', '2026-10-21', 10, 25, 650, 0),
    session('w9', '2026-10-22', 10, 40, 0, 900),
    session('w10', '2026-10-23', 22, 15, 300, 20),
    session('w11', '2026-10-24', 23, 70, 1500, 0),
    session('w12', '2026-10-24', 6, 10, 200, 0),
  ];
  const goal = (id: string, kind: string, title: string, more: Record<string, unknown> = {}) => ({ id, projectId: P, kind, title, targetWords: null, dueDate: null, nodeId: null, category: null, done: false, doneAt: null, createdAt: order++, updatedAt: 0, ...more });
  const goals = [
    goal('g1', 'daily', 'Daily', { targetWords: 500 }),
    goal('g2', 'weekly', 'Weekly', { targetWords: 4000 }),
    goal('g3', 'deadline', 'Book one', { targetWords: 40000, dueDate: '2026-12-31' }),
    goal('g4', 'deadline', 'Crossing', { targetWords: 2000, dueDate: '2026-10-20', nodeId: 'c2' }),
    goal('g5', 'deadline', 'Submit', { dueDate: '2026-11-15' }),
    goal('g6', 'task', 'Map the river', { category: 'research', done: true }),
    goal('g7', 'task', 'Rename Kai', { category: 'revision' }),
  ];
  return {
    format: 'novel-builder/project',
    version: 4,
    exportedAt: 0,
    project: { id: P, title: 'Analytics', targetWordCount: 90000, createdAt: 0, updatedAt: 0 },
    collections: { chapters: nodes, chapterContents, loreEntries, chapterPlans, plotThreads, timelineEvents, characterRelations, progressSnapshots, writingSessions, goals },
  };
}

// ---------------------------------------------------------------------------------------------------- the report

function report(c: Record<string, any[]>, project: any) {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const targetWordCount = project.targetWordCount ?? null;
  const nodes = rows('chapters');
  const sessions = rows('writingSessions');
  const goals = rows('goals');
  const progress = computeProgress({ targetWordCount, nodes, sessions, goals, now: NOW });
  const analytics = computeAnalytics({ targetWordCount, nodes, docs: new Map(rows('chapterContents').map((r) => [r.id, r.doc])), plans: rows('chapterPlans'), entries: rows('loreEntries'), relations: rows('characterRelations'), snapshots: rows('progressSnapshots'), threads: rows('plotThreads'), sessions, goals, now: NOW });
  const chapters = model.order.chapters;
  const plans = [...model.plans.values()];
  const pov = plans.flatMap((p) => p.povIds ?? []).find((id) => model.entries.has(id)) ?? null;
  const label = plans.flatMap((p) => p.labels ?? [])[0] ?? null;
  const thread = [...model.threads.keys()].sort()[0] ?? null;
  const base: ChartFilter = { from: null, to: null, threadId: null, povId: null, label: null, yearFrom: null, yearTo: null, grain: 'chapters', count: 'any' };
  const filters: Record<string, ChartFilter> = {
    all: base,
    scenes: { ...base, grain: 'scenes' },
    page: { ...base, count: 'page' },
    range: { ...base, from: chapters[1]?.id ?? null, to: chapters[3]?.id ?? null },
    fromOnly: { ...base, from: chapters.at(-2)?.id ?? null },
    thread: { ...base, threadId: thread },
    pov: { ...base, povId: pov },
    povScenes: { ...base, povId: pov, grain: 'scenes' },
    label: { ...base, label: label?.toUpperCase() ?? null },
    years: { ...base, yearFrom: 305, yearTo: 320 },
    nothing: { ...base, label: 'no such label' },
    mixed: { ...base, from: chapters[1]?.id ?? null, threadId: thread, count: 'page', grain: 'scenes' },
  };
  const charts = Object.fromEntries(Object.entries(filters).map(([k, f]) => [k, analyticsCharts(model, f)]));
  return { progress, analytics, filters, charts, csv: charts.all.map((x) => toCsv(x.table.columns, x.table.rows)) };
}

test('analytics', () => {
  const out: Record<string, unknown> = {};
  writeFileSync(join(OUT, 'analytics.novel.json'), JSON.stringify(analyticsNovel(), null, 1));
  const files = { ...FIXTURES, analytics: `${OUT}/analytics.novel.json` };
  for (const [name, path] of Object.entries(files)) {
    const file = JSON.parse(readFileSync(path.startsWith('/') ? path : join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
  }
  const model = buildModel({ project: { id: 'x' }, nodes: [], plans: [], entries: [], schemas: [], links: [], relations: [], events: [], threads: [], systems: [], sheets: [], timeline: null, calendar: null, progressCategories: [], progress: [], journeys: [] } as any);
  out.empty = analyticsCharts(model, readChartFilter(new URLSearchParams(), model));
  out.steps = [1, 2, 9, 12, 13, 25, 31, 100, 101, 250, 1200, 12001, 99999].flatMap((n) => [niceStep(n, 12), niceStep(n, 30)]);
  out.csv = toCsv(['Name', 'Count'], [['=SUM(A1)', 3], ['a "quote", here', -2], ['+1', 0], ['line\nbreak', 7], ['@x', 1], ['-y', 2], ['plain', 4]]);
  out.read = ['', 'cgrain=scenes&ccount=page&cyfrom=10&cyto=x&clabel=%20Action%20', 'cyfrom=1.5&cyto=-3&cgrain=words', 'cyfrom=%20&clabel=%20'].map((q) => readChartFilter(new URLSearchParams(q), model));
  writeFileSync(join(OUT, 'analytics.golden.json'), json(out));
});
