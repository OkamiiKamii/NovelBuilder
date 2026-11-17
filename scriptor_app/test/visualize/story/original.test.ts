// Structure and pacing, the structural markers and the appearance matrix agree with the original app. Ported from the
// parts of flutter_app/test/shared/domain/plot_test.dart that are Visualize's (`pacing`, `markers`, `matrices`): the
// same report, compared whole with the original app's own golden (flutter_app/test/fixtures/golden/plot.golden.json),
// as the Flutter app compares itself with it. (Its other parts are Plan's: test/plot/original.test.ts.)

import { join } from 'node:path';

import { appearanceMatrix, type MatrixFilter } from '../../../src/domain/characters/appearances';
import type { JsonMap } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import {
  type Grain,
  type LengthBar,
  StructureMarker,
  barOf,
  labelDistribution,
  lengthBars,
  lengthFacts,
  partBands,
  placeMarkers,
} from '../../../src/domain/visualize/story/pacing';
import { flutterFixturesDir, readJson } from '../../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'plot.golden.json')) as Record<string, Record<string, unknown>>;

const bar = (b: LengthBar): JsonMap => ({ ...b });

function report(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const nodes = [...model.nodes.values()];
  const threads = [...model.threads.values()];
  const firstChapter = nodes.find((n) => n.kind === 'chapter');
  const statusOf = firstChapter?.status ?? 'idea';
  const parts = nodes.filter((n) => n.kind === 'volume' || n.kind === 'act' || n.kind === 'arc').map((n) => n.id);
  const markers = s.rows('structureMarkers').map((r) => new StructureMarker(r));
  const barsC = lengthBars(model);
  const barsS = lengthBars(model, { grain: 'scenes' });
  const locations = [...model.entries.values()].filter((e) => e.category === 'location').map((e) => e.id);
  const chapters = model.order.chapters;
  const pacing: Record<string, unknown> = {};
  for (const grain of ['chapters', 'scenes'] as Grain[]) {
    for (const partId of [null, ...parts.slice(0, 2)]) {
      const bars = lengthBars(model, { grain, partId });
      const facts = lengthFacts(bars);
      const dist = labelDistribution(bars, model, grain);
      pacing[`${grain}:${partId ?? 'all'}`] = {
        bars: bars.map(bar),
        bands: partBands(bars, model).map((b) => ({ ...b })),
        facts: {
          count: facts.count,
          total: facts.total,
          average: facts.average,
          median: facts.median,
          longest: facts.longest?.nodeId ?? null,
          shortest: facts.shortest?.nodeId ?? null,
          empty: facts.empty,
          labelled: facts.labelled,
        },
        labels: {
          labels: dist.labels,
          cells: dist.cells.map((c) => ({ nodeId: c.nodeId, words: Object.fromEntries(c.words), unlabelled: c.unlabelled })),
          totals: dist.totals.map((t) => ({ ...t })),
          unlabelled: dist.unlabelled,
        },
      };
    }
  }
  const filters: [string, MatrixFilter][] = [
    ['chapters', {}],
    ['scenes', { grain: 'scenes' }],
    ['all', { all: true }],
    ['thread', { grain: 'scenes', threadId: threads[0]?.id ?? null }],
    ['place', { placeId: locations[0] ?? null }],
    ['status', { grain: 'scenes', status: statusOf }],
    ['range', { from: chapters.length > 1 ? chapters[1].id : null, to: chapters.length > 3 ? chapters[3].id : null }],
  ];
  return {
    pacing,
    markers: placeMarkers(markers, model).map((p) => ({
      marker: p.marker.id,
      nodeId: p.nodeId,
      via: p.via,
      missing: p.missing,
      barC: barOf(p, barsC, model),
      barS: barOf(p, barsS, model),
    })),
    matrices: Object.fromEntries(
      filters.map(([k, f]) => {
        const m = appearanceMatrix(model, f);
        return [
          k,
          {
            columns: m.columns.map((c) => ({ nodeId: c.nodeId, chapterId: c.chapterId, chapterNumber: c.chapterNumber, label: c.label, short: c.short, status: c.status })),
            rows: m.rows.map((r) => ({ id: r.characterId, name: r.name, recorded: r.recorded, cells: r.cells.map((c) => c.state) })),
            hidden: m.hidden,
            characters: m.characters,
          },
        ];
      }),
    ),
  };
}

/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const sources: [string, string][] = [
  ['qa-sample', join(flutterFixturesDir, 'qa-sample.novel.json')],
  ['made-in-the-app', join(flutterFixturesDir, 'made-in-the-app.novel.json')],
  ['saga', join(flutterFixturesDir, 'saga.novel.json')],
];

for (const [name, path] of sources) {
  describe(`${name} agrees with the original`, () => {
    const actual = plain(report(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    for (const part of ['pacing', 'markers', 'matrices']) {
      test(part, () => expect(actual[part]).toEqual(golden[name][part]));
    }
  });
}
