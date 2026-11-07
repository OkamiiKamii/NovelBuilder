// Reference outputs of the original app's Visualize frame: the details panel and what is connected to a selection,
// the views' written forms, saved views (cleaning, opening without records deleted since) and turning views off and on.
// GOLDEN_OUT=<dir> npx vitest run golden/visualize.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { buildModel } from '@/modules/model/model';
import { detailsOf, relatedIds } from '@/modules/model/navigate';
import type { EntityRef } from '@/modules/model/types';
import { turnOff, turnOn, viewsOn } from '@/modules/visualize/modules';
import { cleanConfig, openSaved } from '@/modules/visualize/saved';
import { graphSummary, placeRows, plotRows, progressionRows, relationshipRows, timelineRows } from '@/modules/visualize/summaries';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
  chronicle: `${OUT}/chronicle.novel.json`,
};
const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (v > 0 ? 'Infinity' : '-Infinity') : v), 1);

const report = (c: Record<string, any[]>, project: unknown) => {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const refs: EntityRef[] = [
    ...[...model.nodes.keys()].map((id) => ({ type: 'node' as const, id })),
    ...[...model.entries.keys()].map((id) => ({ type: 'entry' as const, id })),
    ...[...model.events.keys()].map((id) => ({ type: 'event' as const, id })),
    ...[...model.threads.keys()].map((id) => ({ type: 'thread' as const, id })),
    ...[...model.relations.keys()].map((id) => ({ type: 'relation' as const, id })),
    ...[...model.abilities.keys()].map((id) => ({ type: 'ability' as const, id })),
    { type: 'entry', id: 'gone' },
  ];
  const details = Object.fromEntries(refs.map((r) => {
    const d = detailsOf(model, r);
    return [`${r.type}:${r.id}`, d && { label: d.view.label, facts: d.facts, groups: d.groups.map((g) => ({ title: g.title, items: g.items.map((i) => ({ ref: `${i.ref.type}:${i.ref.id}`, label: i.label, note: i.note })) })) }];
  }));
  const related = Object.fromEntries(refs.map((r) => [`${r.type}:${r.id}`, [...relatedIds(model, r)].sort()]));
  const ids = [...model.entries.keys()];
  const filters = [
    {},
    { characters: [ids[0], 'gone', ids[0]], locations: ['gone'], text: '  keep  ', types: ['entry', 'nonsense', 'event'], canon: ['canon', 'maybe'], status: ['idea'], significance: ['huge', 'climax'] },
    { ids: [...ids.slice(0, 3), 'gone'], threads: ['gone'], chapters: { from: [...model.nodes.keys()][0] ?? 'x', to: 'gone' }, time: { from: { kind: 'event', eventId: 'gone' }, until: { kind: 'node', nodeId: [...model.nodes.keys()][1] ?? 'y' } } },
    { time: { from: { kind: 'date', when: { precision: 'relative', anchorId: 'gone', amount: 1, unit: 'years', direction: 'after' } }, until: { kind: 'date', when: { precision: 'bogus' } } }, factions: [''] },
  ];
  const configs = filters.map((filter, i) => ({ filter, mode: i % 2 ? 'list' : 'odd', layers: ['a', 'a', '', 3], scale: i === 1 ? { x: 1, y: 2, k: 0.5 } : { x: 1, y: Infinity, k: 1 }, layout: i === 2 ? ['no'] : { group: 'thread', trackOrder: ids.slice(0, 2) } }));
  const cleaned = configs.map((c) => cleanConfig(c as any));
  const opened = cleaned.map((c) => openSaved(model, c));
  return {
    details,
    related,
    timeline: timelineRows(model),
    relationships: relationshipRows(model),
    plot: plotRows(model),
    graph: { ...graphSummary(model), mostConnected: graphSummary(model).mostConnected.map((m) => ({ ref: `${m.ref.type}:${m.ref.id}`, label: m.label, count: m.count })) },
    places: placeRows(model),
    progression: progressionRows(model, rows('progressSnapshots')),
    cleaned,
    opened,
  };
};

test('visualize', () => {
  const out: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(FIXTURES)) {
    const file = JSON.parse(readFileSync(path.startsWith('/') ? path : join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
  }
  out.modules = {
    on: viewsOn(['charts', 'places']).map((v) => v.key),
    offPlaces: turnOff([], ['places']),
    offBoth: turnOff(['charts'], ['places', 'journeys']),
    offJourneys: turnOff([], ['journeys']),
    onJourneys: turnOn(['journeys', 'places', 'charts'], 'journeys'),
    onTimeline: turnOn(['timeline'], 'timeline'),
  };
  writeFileSync(join(OUT, 'visualize.golden.json'), json(out));
});
