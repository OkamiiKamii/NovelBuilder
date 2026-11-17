// The Visualize workspace against the original app's own goldens, as the Flutter app's tests replay them
// (flutter_app/test/shared/domain/visualize_test.dart, kinds_test.dart's Records by kind, analytics_test.dart's
// charts): every record's details and what is connected to it, the views' written forms, saved views cleaned and
// opened, turning views off and on; each kind's table, CSV, timeline, map, ladder and holders; every chart under the
// original's filters, the empty novel's charts, nice steps, the CSV file and the filter read from an address.

import { join } from 'node:path';

import { ChartFilter, analyticsCharts, type Chart, niceStep, toCsv } from '../../../src/domain/analytics/charts';
import { type JsonMap, mapOrNull } from '../../../src/domain/json';
import { EntityRef } from '../../../src/domain/model/entityRef';
import { detailsOf, relatedIds } from '../../../src/domain/model/navigate';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { kindHolders, kindMap, kindRanks, kindTable, kindTimeline, kindsOf, niceTicks, tableCsv, type Unplaced } from '../../../src/domain/visualize/kinds';
import { turnOff, turnOn, viewsOn } from '../../../src/domain/visualize/modules';
import { cleanConfig, openSaved } from '../../../src/domain/visualize/savedViews';
import { graphSummary, placeRows, plotRows, progressionRows, relationshipRows, timelineRows } from '../../../src/domain/visualize/summaries';
import { flutterFixturesDir, readJson } from '../../fixtures';
import { expectJson } from '../../timeline/compare';

const golden = (name: string) => readJson(join(flutterFixturesDir, 'golden', name)) as Record<string, JsonMap>;
const fixture = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)) as JsonMap);
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------------------------- visualize_test

function visualizeReport(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const refs = [
    ...[...model.nodes.keys()].map((id) => new EntityRef('node', id)),
    ...[...model.entries.keys()].map((id) => new EntityRef('entry', id)),
    ...[...model.events.keys()].map((id) => new EntityRef('event', id)),
    ...[...model.threads.keys()].map((id) => new EntityRef('thread', id)),
    ...[...model.relations.keys()].map((id) => new EntityRef('relation', id)),
    ...[...model.abilities.keys()].map((id) => new EntityRef('ability', id)),
    new EntityRef('entry', 'gone'),
  ];
  const ids = [...model.entries.keys()];
  const nodes = [...model.nodes.keys()];
  const filters: JsonMap[] = [
    {},
    {
      characters: [ids[0], 'gone', ids[0]],
      locations: ['gone'],
      text: '  keep  ',
      types: ['entry', 'nonsense', 'event'],
      canon: ['canon', 'maybe'],
      status: ['idea'],
      significance: ['huge', 'climax'],
    },
    {
      ids: [...ids.slice(0, 3), 'gone'],
      threads: ['gone'],
      chapters: { from: nodes[0] ?? 'x', to: 'gone' },
      time: { from: { kind: 'event', eventId: 'gone' }, until: { kind: 'node', nodeId: nodes.length > 1 ? nodes[1] : 'y' } },
    },
    {
      time: {
        from: { kind: 'date', when: { precision: 'relative', anchorId: 'gone', amount: 1, unit: 'years', direction: 'after' } },
        until: { kind: 'date', when: { precision: 'bogus' } },
      },
      factions: [''],
    },
  ];
  const cleaned = filters.map((filter, i) =>
    cleanConfig({
      filter,
      mode: i % 2 === 1 ? 'list' : 'odd',
      layers: ['a', 'a', '', 3],
      scale: i === 1 ? { x: 1, y: 2, k: 0.5 } : { x: 1, y: Number.POSITIVE_INFINITY, k: 1 },
      layout: i === 2 ? ['no'] : { group: 'thread', trackOrder: ids.slice(0, 2) },
    }),
  );
  const graph = graphSummary(model);
  const details: JsonMap = {};
  const related: JsonMap = {};
  for (const r of refs) {
    const d = detailsOf(model, r);
    details[r.key] =
      d === null
        ? null
        : {
            label: d.view.label,
            facts: d.facts,
            groups: d.groups.map((g) => ({ title: g.title, items: g.items.map((i) => ({ ref: i.ref.key, label: i.label, note: i.note })) })),
          };
    related[r.key] = [...relatedIds(model, r)].sort(byText);
  }
  return {
    details,
    related,
    timeline: timelineRows(model).map((t) => ({ id: t.id, title: t.title, when: t.when, dated: t.dated, start: Number.isFinite(t.start) ? t.start : 'Infinity', told: t.told })),
    relationships: relationshipRows(model),
    plot: plotRows(model).map((p) => ({
      id: p.id,
      title: p.title,
      ...(p.status !== null ? { status: p.status } : {}),
      developments: p.developments,
      unplaced: p.unplaced,
      chapters: p.chapters,
    })),
    graph: { records: graph.records, connections: graph.connections, dangling: graph.dangling, mostConnected: graph.mostConnected.map((m) => ({ ref: m.ref.key, label: m.label, count: m.count })) },
    places: placeRows(model),
    progression: progressionRows(model, s.rows('progressSnapshots')),
    cleaned,
    opened: cleaned.map((c) => {
      const o = openSaved(model, mapOrNull(c['filter'])!);
      return { filter: o.filter, missing: o.missing };
    }),
  };
}

describe('the Visualize frame agrees with the original', () => {
  const g = golden('visualize.golden.json');
  for (const name of ['qa-sample', 'made-in-the-app', 'chronicle']) {
    const expected = g[name];
    const actual = visualizeReport(fixture(name));
    for (const part of Object.keys(expected)) test(`${name}: ${part}`, () => expectJson(actual[part], expected[part], `${name}.${part}`));
  }

  test('turning views off and on follows the original’s rules', () => {
    const r = turnOff([], ['places']);
    expectJson(
      {
        on: viewsOn(['charts', 'places']).map((v) => v.key),
        offPlaces: { off: r.off, blocked: r.blocked },
        offBoth: { off: turnOff(['charts'], ['places', 'journeys']).off, blocked: [] },
        offJourneys: { off: turnOff([], ['journeys']).off, blocked: [] },
        onJourneys: turnOn(['journeys', 'places', 'charts'], 'journeys'),
        onTimeline: turnOn(['timeline'], 'timeline'),
      },
      g['modules'],
      'modules',
    );
  });
});

// ---------------------------------------------------------------------------------------------- kinds_test

const entryJson = (e: { id: string; name: string }) => ({ id: e.id, name: e.name });
const unplacedJson = (u: readonly Unplaced[]) => u.map((x) => ({ ...entryJson(x.entry), reason: x.reason }));

function kindsReport(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const kinds = kindsOf(model);
  const views: JsonMap = {};
  for (const { category } of kinds) {
    const key = category.key;
    const table = kindTable(model, key);
    const timeline = kindTimeline(model, key);
    const map = kindMap(model, key);
    const ranks = kindRanks(model, key);
    const held = kindHolders(model, key);
    views[key] = {
      table: { columns: table.columns.map((d) => d.id), rows: table.rows.map((r) => ({ ...entryJson(r.entry), cells: r.cells })) },
      csv: tableCsv(table),
      timeline: {
        placed: timeline.placed.map((t) => ({ ...entryJson(t.entry), start: t.start.toJson(), end: t.end?.toJson() ?? null, span: { lo: t.lo, hi: t.hi }, label: t.label, note: t.note })),
        unplaced: unplacedJson(timeline.unplaced),
        missing: timeline.missing,
      },
      map: { points: map.points.map((p) => ({ ...entryJson(p.entry), x: p.x, y: p.y })), unplaced: unplacedJson(map.unplaced), axes: map.axes, missing: map.missing },
      ranks: { levels: ranks.levels.map((l) => ({ label: l.label, entries: l.entries.map((e) => e.id) })), unplaced: unplacedJson(ranks.unplaced), field: ranks.field, missing: ranks.missing },
      holders: {
        records: held.records.map((r) => ({
          ...entryJson(r.entry),
          history: r.history.map((h) => ({ connection: h.connection.id, holder: h.holder.id, holderName: h.holderName, when: h.when })),
          current: r.current,
          note: r.note,
        })),
        typeLabel: held.typeLabel,
        field: held.field,
        missing: held.missing,
      },
    };
  }
  return { kinds: kinds.map((k) => ({ key: k.category.key, count: k.count })), views };
}

describe('Records by kind agree with the original', () => {
  const g = golden('kinds.golden.json');
  for (const name of ['qa-sample', 'made-in-the-app', 'chronicle', 'kinds', 'kinds-calendar']) {
    const actual = kindsReport(fixture(name));
    for (const part of ['kinds', 'views']) test(`${name}: ${part}`, () => expectJson(actual[part], g[name][part], `${name}.${part}`));
  }
  test('a map’s grid follows the original', () => {
    expectJson(
      [niceTicks(0, 10), niceTicks(-3, 4, 4), niceTicks(0.1, 0.35), niceTicks(5, 5), niceTicks(-1000, 2500), niceTicks(1e-3, 9e-3), niceTicks(0, 1, 3)],
      g['niceTicks'],
      'niceTicks',
    );
  });
});

// ---------------------------------------------------------------------------------------------- analytics_test

const chartJson = (c: Chart) => ({
  key: c.key,
  title: c.title,
  uses: c.uses,
  measure: c.measure,
  units: c.units,
  shape: c.shape,
  bars: c.bars.map((b) => ({ key: b.key, short: b.short, label: b.label, value: b.value, ref: b.ref?.toJson() ?? null, detail: b.detail })),
  empty: c.empty,
  summary: c.summary,
  notes: c.notes,
  table: { columns: c.columns, rows: c.rows },
});

const filterJson = (f: ChartFilter) => ({
  from: f.from,
  to: f.to,
  threadId: f.threadId,
  povId: f.povId,
  label: f.label,
  yearFrom: f.yearFrom,
  yearTo: f.yearTo,
  grain: f.grain,
  count: f.count,
});

const filterOf = (f: JsonMap) =>
  new ChartFilter({
    from: (f['from'] as string | null) ?? null,
    to: (f['to'] as string | null) ?? null,
    threadId: (f['threadId'] as string | null) ?? null,
    povId: (f['povId'] as string | null) ?? null,
    label: (f['label'] as string | null) ?? null,
    yearFrom: (f['yearFrom'] as number | null) ?? null,
    yearTo: (f['yearTo'] as number | null) ?? null,
    grain: f['grain'] as 'chapters' | 'scenes',
    count: f['count'] as 'any' | 'page',
  });

describe('the charts agree with the original', () => {
  const g = golden('analytics.golden.json');
  for (const name of ['qa-sample', 'made-in-the-app', 'analytics']) {
    const expected = g[name];
    const model = StoryModel.fromSnapshot(fixture(name));
    const filters = expected['filters'] as JsonMap;
    for (const [key, value] of Object.entries(filters)) {
      test(`${name}: the charts agree, filtered "${key}"`, () => {
        const charts = analyticsCharts(model, filterOf(value as JsonMap));
        expectJson(charts.map(chartJson), (expected['charts'] as JsonMap)[key], `${name}.charts.${key}`);
        if (key === 'all') expect(charts.map((c) => toCsv(c.columns, c.rows))).toEqual(expected['csv']);
      });
    }
  }

  const empty = StoryModel.fromSnapshot(
    NovelSnapshot.fromJson({ format: 'novel-builder/project', version: 4, exportedAt: 0, project: { id: 'x', title: 'Empty' }, collections: {} }),
  );

  test('an empty novel: every chart says why it is empty', () => {
    expectJson(analyticsCharts(empty, ChartFilter.of({}, empty)).map(chartJson), g['empty'], 'empty');
  });

  test('nice steps, the CSV file and the filter read from an address agree', () => {
    expect([1, 2, 9, 12, 13, 25, 31, 100, 101, 250, 1200, 12001, 99999].flatMap((n) => [niceStep(n, 12), niceStep(n, 30)])).toEqual(g['steps']);
    expect(
      toCsv(
        ['Name', 'Count'],
        [
          ['=SUM(A1)', 3],
          ['a "quote", here', -2],
          ['+1', 0],
          ['line\nbreak', 7],
          ['@x', 1],
          ['-y', 2],
          ['plain', 4],
        ],
      ),
    ).toEqual(g['csv']);
    const read = ['', 'cgrain=scenes&ccount=page&cyfrom=10&cyto=x&clabel=%20Action%20', 'cyfrom=1.5&cyto=-3&cgrain=words', 'cyfrom=%20&clabel=%20'].map((q) =>
      filterJson(ChartFilter.of(Object.fromEntries(new URLSearchParams(q)), empty)),
    );
    expectJson(read, g['read'], 'read');
  });

  test('a filter is kept as a saved view keeps it, and read back the same', () => {
    const model = StoryModel.fromSnapshot(fixture('analytics'));
    const filter = new ChartFilter({ from: 'c2', to: 'c5', threadId: 't1', povId: 'mira', label: 'Action', yearFrom: -4, yearTo: 320, grain: 'scenes', count: 'page' });
    expect(filterJson(ChartFilter.of(filter.toLayout(), model))).toEqual(filterJson(filter));
    expect(filter.toLayout()).toEqual({ cfrom: 'c2', cto: 'c5', cthread: 't1', cpov: 'mira', clabel: 'Action', cyfrom: '-4', cyto: '320', cgrain: 'scenes', ccount: 'page' });
    expect(ChartFilter.of({ cfrom: 'gone', cthread: 'gone', cpov: 'gone' }, model).filtered).toBe(false);
  });
});
