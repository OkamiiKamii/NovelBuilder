// Writes reference outputs of the original TypeScript model for the Flutter rebuild's agreement tests.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { buildModel } from '@/modules/model/model';
import { deriveConnections } from '@/modules/model/connections';
import { validateRecord } from '@/modules/model/validate';
import { boundsOfEvent, spanOfEvent, timeContext, validAt, overlaps, type Anchor } from '@/modules/model/validity';
import { select, selectConnections, type Filter } from '@/modules/model/query';
import { stageAt } from '@/modules/relationships/timeline';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};

const num = (n: number) => (n === Infinity ? 'inf' : n === -Infinity ? '-inf' : n);
const span = (s: { lo: number; hi: number } | null) => (s ? { lo: num(s.lo), hi: num(s.hi) } : null);

for (const [name, path] of Object.entries(FIXTURES)) {
  test(name, () => {
    const file = JSON.parse(readFileSync(join(__dirname, path), 'utf8'));
    const c = file.collections;
    const rows = (k: string) => (c[k] ?? []) as any[];
    const model = buildModel({
      project: file.project,
      nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'),
      relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'),
      timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys'),
    });
    const context = timeContext(model);
    const { connections, dangling } = deriveConnections(model);

    const validation: unknown[] = [];
    const check = (type: any, list: any[]) => list.forEach((r) => { const p = validateRecord(type, r); if (p.length) validation.push({ type, id: r.id, problems: p }); });
    check('node', rows('chapters')); check('entry', rows('loreEntries')); check('event', rows('timelineEvents'));
    check('thread', rows('plotThreads')); check('relation', rows('characterRelations'));
    for (const s of rows('systems')) check('ability', s.items ?? []);

    const nodeIds = [...model.order.position.keys()];
    const chapters = model.order.chapters.map((n) => n.id);
    const events = [...model.events.keys()].sort();
    const characters = [...model.entries.values()].filter((e) => e.category === 'character').map((e) => e.id).sort();
    const places = [...model.entries.values()].filter((e) => e.category === 'location').map((e) => e.id).sort();
    const years = [...model.events.values()].flatMap((e) => ('year' in e.when ? [e.when.year] : [])).sort((a, b) => a - b);
    const midYear = years.length ? years[Math.floor(years.length / 2)] : 0;
    const yearAnchor = (year: number): Anchor => ({ kind: 'date', when: { precision: 'approximate', year, month: null, season: null } });

    const filters: Record<string, Filter> = {
      all: {},
      characters: { types: ['entry'], categories: ['character'] },
      text: { text: 'the' },
      withFirstCharacter: { characters: characters.slice(0, 1) },
      withFirstPlace: { locations: places.slice(0, 1) },
      firstThreeChapters: { chapters: { from: chapters[0] ?? null, to: chapters[2] ?? null } },
      fromMidYear: { types: ['event'], time: { from: yearAnchor(midYear) } },
      beforeMidYear: { types: ['event'], time: { until: yearAnchor(midYear) } },
      canonOnly: { canon: ['canon'] },
      majorConfirmed: { status: ['confirmed'], significance: ['major', 'climax'] },
    };
    const query = Object.fromEntries(Object.entries(filters).map(([k, f]) => {
      const r = select(model, f);
      return [k, { filter: f, items: r.items.map((v) => ({ type: v.ref.type, id: v.ref.id, label: v.label, kind: v.kind })), undecided: r.undecided, considered: r.considered }];
    }));
    const connectionQueries = {
      links: { kinds: ['link'] as any },
      involvingFirstCharacter: { involving: characters.slice(0, 1) },
      canon: { canon: ['canon'] as any },
      fromMidYear: { time: { from: yearAnchor(midYear) } },
    };
    const connectionQuery = Object.fromEntries(Object.entries(connectionQueries).map(([k, f]) => {
      const r = selectConnections(model, f);
      return [k, { filter: f, items: r.items.map((x) => x.id), undecided: r.undecided.map((u) => ({ reason: u.reason, connections: u.connections.map((x) => x.id) })) }];
    }));

    const anchors: Anchor[] = [...chapters.map((nodeId) => ({ kind: 'node', nodeId }) as Anchor), ...events.map((eventId) => ({ kind: 'event', eventId }) as Anchor), yearAnchor(midYear)];
    const validity = model.links.filter((l) => l.validity).map((l) => ({ id: l.id, at: anchors.map((a) => validAt(l.validity!, a, context)) }));
    const linkPairs: unknown[] = [];
    const withValidity = model.links.filter((l) => l.validity);
    for (const a of withValidity) for (const b of withValidity) if (a.id < b.id) linkPairs.push({ a: a.id, b: b.id, overlaps: overlaps(a.validity!, b.validity!, context) });

    const golden = {
      fixture: name,
      order: { position: Object.fromEntries(nodeIds.map((id) => [id, model.order.position.get(id)])), chapterNumber: Object.fromEntries(nodeIds.map((id) => [id, model.order.chapterNumber.get(id)])), chapters },
      connections,
      dangling: dangling.map((d) => ({ id: d.connection.id, missing: d.missing })),
      validation,
      events: Object.fromEntries(events.map((id) => {
        const b = boundsOfEvent(id, context);
        return [id, { span: span(spanOfEvent(id, context)), bounds: b ? { start: span(b.start), end: span(b.end), open: b.open } : null }];
      })),
      stages: Object.fromEntries([...model.relations.values()].map((r) => [r.id, [null, ...chapters].map((n) => stageAt(r, n, model.order)?.id ?? null)])),
      anchors,
      validity,
      linkPairs,
      query,
      connectionQuery,
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${name}.golden.json`), JSON.stringify(golden, (_k, v) => (v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v), 2));
  });
}
