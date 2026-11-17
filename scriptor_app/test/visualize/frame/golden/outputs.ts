// Scriptor's outputs for the Visualize workspace, keyed and shaped as golden/dump.dart writes the Flutter app's: what
// each view lists, the shared query, every record's details, Records by kind, saved views opened and changed, every
// chart; and `misc`.

import { ChartFilter, analyticsCharts, type Chart, fileSlug, niceStep, toCsv } from '../../../../src/domain/analytics/charts';
import { type JsonMap, mapOrNull } from '../../../../src/domain/json';
import { EntityRef } from '../../../../src/domain/model/entityRef';
import { detailsOf, relatedIds } from '../../../../src/domain/model/navigate';
import { Filter, select } from '../../../../src/domain/model/query';
import { StoryModel } from '../../../../src/domain/model/storyModel';
import { type NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';
import { kindHolders, kindKeyOf, kindMap, kindRanks, kindTable, kindTimeline, kindsOf, niceTicks, tableCsv, type Unplaced } from '../../../../src/domain/visualize/kinds';
import { neededBy, turnOff, turnOn, viewsOn } from '../../../../src/domain/visualize/modules';
import { SavedViewChanges, activeFilters, cleanConfig, cleanFilter, defaultViewConfig, openSaved } from '../../../../src/domain/visualize/savedViews';
import { graphSummary, placeRows, plotRows, progressionRows, relationshipRows, timelineRows } from '../../../../src/domain/visualize/summaries';
import { isBuilt, viewLabel, visualViews } from '../../../../src/domain/visualize/views';
import { dartToUpperCase } from '../../../../src/domain/exchange/dartUpperCase';

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const num_ = (n: number): unknown => (Number.isFinite(n) ? n : n > 0 ? 'inf' : '-inf');

function allRefs(m: StoryModel): EntityRef[] {
  return [
    ...[...m.nodes.keys()].map((id) => new EntityRef('node', id)),
    ...[...m.entries.keys()].map((id) => new EntityRef('entry', id)),
    ...[...m.events.keys()].map((id) => new EntityRef('event', id)),
    ...[...m.threads.keys()].map((id) => new EntityRef('thread', id)),
    ...[...m.relations.keys()].map((id) => new EntityRef('relation', id)),
    ...[...m.abilities.keys()].map((id) => new EntityRef('ability', id)),
  ].sort((a, b) => byText(a.key, b.key));
}

function summaries(m: StoryModel, s: NovelSnapshot): unknown {
  const g = graphSummary(m);
  return {
    timeline: timelineRows(m).map((r) => ({ id: r.id, title: r.title, when: r.when, dated: r.dated, start: num_(r.start), told: r.told })),
    relationships: relationshipRows(m),
    plot: plotRows(m),
    graph: {
      records: g.records,
      connections: g.connections,
      dangling: g.dangling,
      most: g.mostConnected.map((x) => ({ ref: x.ref.key, label: x.label, count: x.count })),
    },
    places: placeRows(m),
    progression: progressionRows(m, s.rows('progressSnapshots')),
  };
}

function filtersFor(m: StoryModel): JsonMap[] {
  const characters = [...m.entries.values()]
    .filter((e) => e.category === 'character')
    .map((e) => e.id)
    .sort(byText);
  const threads = [...m.threads.keys()].sort(byText);
  const chapters = m.order.chapters;
  const events = [...m.events.keys()].sort(byText);
  return [
    {},
    { text: 'a' },
    { text: 'the' },
    ...(characters.length > 0 ? [{ characters: [characters[0]] }] : []),
    ...(characters.length > 1 ? [{ characters: [characters[characters.length - 1]], types: ['event', 'node'] }] : []),
    { types: ['event'] },
    ...(threads.length > 0 ? [{ threads: [threads[0]] }] : []),
    ...(chapters.length > 2 ? [{ chapters: { from: chapters[1].id, to: chapters[2].id } }] : []),
    ...(chapters.length > 0 ? [{ chapters: { from: chapters[chapters.length - 1].id } }] : []),
    { canon: ['provisional', 'canon'] },
    { significance: ['major'], status: ['confirmed'] },
    { categories: ['location'] },
    ...(events.length > 0 ? [{ time: { from: { kind: 'event', eventId: events[0] } } }] : []),
    {
      time: {
        from: { kind: 'date', when: { precision: 'exact', year: 1 } },
        until: { kind: 'date', when: { precision: 'exact', year: 1200 } },
      },
    },
  ];
}

const query = (m: StoryModel): unknown =>
  filtersFor(m).map((f) => {
    const r = select(m, Filter.fromJson(f));
    return {
      filter: f,
      items: r.items.map((v) => v.ref.key),
      undecided: r.undecided.map((u) => ({ filter: u.filter, reason: u.reason, refs: u.refs.map((x) => x.key) })),
      considered: r.considered,
    };
  });

function details(m: StoryModel): unknown {
  const out: Record<string, unknown> = {};
  for (const ref of allRefs(m)) {
    const d = detailsOf(m, ref);
    out[ref.key] = {
      view: d === null ? null : { ref: d.view.ref.key, label: d.view.label, kind: d.view.kind },
      facts: d?.facts ?? [],
      groups: (d?.groups ?? []).map((g) => ({ title: g.title, items: g.items.map((i) => ({ ref: i.ref.key, label: i.label, note: i.note })) })),
      related: [...relatedIds(m, ref)].sort(byText),
    };
  }
  out['gone'] = detailsOf(m, new EntityRef('entry', 'no-such-record')) === null;
  return out;
}

function kinds(m: StoryModel): unknown {
  const each: Record<string, unknown> = {};
  const unplaced = (list: readonly Unplaced[]) => list.map((u) => ({ id: u.entry.id, reason: u.reason }));
  for (const k of kindsOf(m)) {
    const key = k.category.key;
    const table = kindTable(m, key);
    const timeline = kindTimeline(m, key);
    const map = kindMap(m, key);
    const ranks = kindRanks(m, key);
    const holders = kindHolders(m, key);
    each[key] = {
      table: { columns: table.columns.map((c) => c.name), rows: table.rows.map((r) => ({ id: r.entry.id, cells: r.cells })), csv: tableCsv(table) },
      timeline: {
        placed: timeline.placed.map((t) => ({
          id: t.entry.id,
          start: t.start.toJson(),
          end: t.end?.toJson() ?? null,
          lo: num_(t.lo),
          hi: num_(t.hi),
          label: t.label,
          note: t.note,
        })),
        unplaced: unplaced(timeline.unplaced),
        missing: timeline.missing,
      },
      map: { points: map.points.map((p) => ({ id: p.entry.id, x: p.x, y: p.y })), unplaced: unplaced(map.unplaced), axes: [map.axes.x, map.axes.y], missing: map.missing },
      ranks: { levels: ranks.levels.map((l) => ({ label: l.label, ids: l.entries.map((e) => e.id) })), unplaced: unplaced(ranks.unplaced), field: ranks.field, missing: ranks.missing },
      holders: {
        records: holders.records.map((r) => ({
          id: r.entry.id,
          history: r.history.map((h) => ({ connection: h.connection.id, holder: h.holder.key, name: h.holderName, when: h.when })),
          current: r.current,
          note: r.note,
        })),
        type: holders.typeLabel,
        field: holders.field,
        missing: holders.missing,
      },
    };
  }
  return {
    kinds: kindsOf(m).map((k) => ({ key: k.category.key, count: k.count })),
    first: kindKeyOf(m, null),
    asked: kindKeyOf(m, 'location'),
    each,
  };
}

function savedViews(m: StoryModel, s: NovelSnapshot): unknown {
  const refs = allRefs(m);
  const chapters = m.order.chapters;
  const opened = [
    ...s.rows('savedViews').map((r) => openSaved(m, mapOrNull(r['filter']) ?? {})),
    openSaved(m, {
      ids: [...(refs.length > 0 ? [refs[0].id] : []), 'gone-1'],
      characters: ['gone-2'],
      threads: [...[...m.threads.keys()].slice(0, 1), 'gone-3'],
      chapters: { from: chapters.length === 0 ? 'gone-4' : chapters[0].id, to: 'gone-5' },
      time: { from: { kind: 'event', eventId: 'gone-6' }, until: { kind: 'node', nodeId: chapters.length === 0 ? 'gone-7' : chapters[chapters.length - 1].id } },
      text: 'keep',
    }),
  ];
  let clock = 1000;
  let ids = 0;
  let snapshot = s;
  const steps: unknown[] = [];
  const run = <T>(apply: (c: SavedViewChanges) => T): T => {
    const c = new SavedViewChanges(snapshot, { now: ++clock, createId: () => `sv${++ids}` });
    const result = apply(c);
    snapshot = c.snapshot;
    steps.push({
      rows: [...snapshot.rows('savedViews')].sort((a, b) => byText(String(a['id']), String(b['id']))),
      off: snapshot.project['viewsOff'] ?? null,
      list: c.list().map((v) => v.name),
      timeline: c.list('timeline').map((v) => v.name),
    });
    return result;
  };
  const a = run((c) =>
    c.save('timeline', '  Mira’s year ', {
      filter: { characters: [' x ', 'x', 'y'], types: ['event', 'nonsense'], text: ' war ' },
      mode: 'list',
      layers: ['a', 'a', '', 3],
      scale: { x: 1, y: 2, k: 0.5 },
      layout: { grain: 'scenes' },
    }),
  );
  const b = run((c) => c.save('', '', { scale: { x: 1, y: 2, k: 0 } }));
  run((c) => c.update(a, { mode: 'visual', filter: { text: 'peace' } }));
  run((c) => c.rename(b, '   '));
  const d = run((c) => c.duplicate(a));
  run((c) => c.restoreDefault(d));
  run((c) => c.removeView(b));
  run((c) => c.setViewsOff(['journeys', 'places']));
  let refused: string | null = null;
  try {
    run((c) => c.removeView('no-such-view'));
  } catch (e) {
    refused = String(e);
  }
  return { opened: opened.map((o) => ({ filter: o.filter, missing: o.missing })), steps, refused: refused !== null };
}

const chartJson = (c: Chart): unknown => ({
  key: c.key,
  title: c.title,
  uses: c.uses,
  measure: c.measure,
  units: c.units,
  shape: c.shape,
  bars: c.bars.map((b) => ({ key: b.key, short: b.short, label: b.label, value: b.value, ref: b.ref?.key ?? null, detail: b.detail })),
  empty: c.empty,
  summary: c.summary,
  notes: c.notes,
  columns: c.columns,
  rows: c.rows,
  csv: toCsv(c.columns, c.rows),
});

function charts(m: StoryModel): unknown {
  const chapters = m.order.chapters;
  const threads = [...m.threads.keys()].sort(byText);
  const povs = [...new Set([...m.plans.values()].flatMap((p) => p.povIds))].filter((id) => m.entries.has(id)).sort(byText);
  const labels = [...new Set([...m.plans.values()].flatMap((p) => p.labels))].sort(byText);
  const layouts: JsonMap[] = [
    {},
    { cgrain: 'scenes' },
    { ccount: 'page' },
    ...(threads.length > 0 ? [{ cthread: threads[0] }] : []),
    ...(povs.length > 0 ? [{ cpov: povs[0] }] : []),
    ...(labels.length > 0 ? [{ clabel: dartToUpperCase(labels[0]) }] : []),
    ...(chapters.length > 3 ? [{ cfrom: chapters[1].id, cto: chapters[3].id, cgrain: 'scenes' }] : []),
    { cyfrom: ' 1000 ', cyto: '1300', cthread: 'gone' },
    { cyfrom: '-5', cyto: 'x' },
  ];
  return layouts.map((l) => {
    const f = ChartFilter.of(l, m);
    return { layout: l, filter: f.toLayout(), filtered: f.filtered, charts: analyticsCharts(m, f).map(chartJson) };
  });
}

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const m = StoryModel.fromSnapshot(s);
  return { summaries: summaries(m, s), query: query(m), details: details(m), kinds: kinds(m), savedViews: savedViews(m, s), charts: charts(m) };
}

export function misc(): Record<string, unknown> {
  const keys = visualViews.map((v) => v.key);
  return {
    views: visualViews.map((v) => ({ key: v.key, label: v.label, path: v.path, phase: v.phase, built: isBuilt(v) })),
    label: [viewLabel('graph'), viewLabel('nope')],
    on: [[], ['places'], ['journeys', 'charts'], keys].map((off) => viewsOn(off).map((v) => v.key)),
    neededBy: Object.fromEntries(keys.map((k) => [k, neededBy(k).map((m) => m.key)])),
    turnOff: (
      [
        [[], ['places']],
        [[], ['places', 'journeys']],
        [['journeys'], ['places']],
        [['timeline'], ['graph', 'charts']],
        [[], keys],
      ] as [string[], string[]][]
    ).map(([off, these]) => {
      const r = turnOff(off, these);
      return { off: r.off, blocked: r.blocked };
    }),
    turnOn: (
      [
        [['places', 'journeys'], 'journeys'],
        [['places'], 'places'],
        [['charts'], 'graph'],
        [keys, 'journeys'],
      ] as [string[], string][]
    ).map(([off, key]) => turnOn(off, key)),
    clean: [
      null,
      {},
      {
        types: 'event, entry,nope, event',
        ids: [' a ', 'b', 'a', 3, 2.5, null],
        canon: ['canon', 'retconned', 'x'],
        status: ['idea'],
        significance: ['minor', 'huge'],
        text: '  the war  ',
        chapters: { from: 'c1', to: '' },
        time: { from: { kind: 'node', nodeId: 'n1' }, until: { kind: 'date', when: { precision: 'exact', year: 3 } } },
      },
      { time: { until: { kind: 'date', when: { precision: 'bogus' } } }, chapters: { to: 'c9' }, characters: [] },
    ].map((f) => {
      const c = cleanFilter(f);
      return { clean: c, active: activeFilters(c) };
    }),
    config: [
      {},
      { mode: 'list', layers: ['x', 'x', 7, ''], scale: { x: 1, y: -2, k: 3 }, layout: { a: 1 }, filter: { text: ' hi ' } },
      { scale: { x: 1, y: 2, k: -1 }, layout: 'no' },
    ].map((c) => cleanConfig(c)),
    default: defaultViewConfig(),
    ticks: (
      [
        [0, 100, 5],
        [-3.2, 7.9, 5],
        [0.001, 0.0172, 4],
        [5, 5, 5],
        [10, 2, 5],
        [-1000, 250000, 6],
        [0.1, 0.3, 5],
      ] as [number, number, number][]
    ).map(([lo, hi, n]) => niceTicks(lo, hi, n)),
    steps: (
      [
        [1, 12],
        [13, 12],
        [9001, 12],
        [250, 30],
        [31, 30],
        [1201, 12],
        [0.5, 3],
      ] as [number, number][]
    ).map(([s, most]) => niceStep(s, most)),
    csv: toCsv(
      ['A', 'B, with comma'],
      [
        ['=SUM(1)', 3],
        ['he said "hi"', -2],
        ['@x', 'line\nbreak'],
        ['+1', '-1'],
      ],
    ),
    slugs: ['', 'The Drowned Road', '  ¡Hola, Señor!  ', '---', 'Ψυχή 2'].map(fileSlug),
  };
}
