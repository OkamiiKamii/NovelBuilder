// Progression change by change and snapshots against the original app's own golden (flutter_app/test/fixtures/golden/
// growth.golden.json, which the Flutter app's growth_test.dart checks too): for every person of qa-sample,
// made-in-the-app and growth, their changes in order, what they are like at every chapter, event, a date and the end,
// the one-line summary, the change log, their snapshots in story order and the snapshot valid at every chapter, each
// snapshot worked out against its systems (`resolved`, through the systems calculator) and each compared with the one
// before it (`compared`); and every change's time in words.

import { join } from 'node:path';

import { type JsonMap } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { Anchor } from '../../src/domain/model/validity';
import {
  ProgressSnapshot,
  compareSnapshots,
  inStoryOrder,
  resolveSystem,
  stateAt,
} from '../../src/domain/progression/snapshots';
import { type ProgressState, changeLog, inOrder, progressAt, progressSummary, whenWords } from '../../src/domain/progression/track';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'growth.golden.json')) as Record<string, JsonMap>;

const stateOut = (st: ProgressState) => ({
  categories: st.categories.map((x) => ({
    category: x.category.id,
    lines: x.lines.map((l) => ({
      subject: l.subject,
      value: l.value,
      change: l.change.id,
      step: l.step,
      uncertain: l.uncertain.map((u) => u.id),
    })),
    moments: x.moments.map((m) => m.id),
    lost: x.lost,
  })),
  unplaced: st.unplaced.map((u) => u.id),
  untracked: st.untracked.map((u) => u.id),
});

/** A number as the golden writes it: non-finite ones as words. */
const js = (v: unknown): unknown =>
  typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity') : v;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function report(s: NovelSnapshot) {
  const model = StoryModel.fromSnapshot(s);
  const snapshots = s.rows('progressSnapshots').map((r) => new ProgressSnapshot(r));
  const nodes = [...model.nodes.values()];
  const systems = [...model.systems.values()];
  const people = [
    ...new Set([...model.progress.map((p) => p.entryId), ...snapshots.map((x) => x.entryId), ...model.sheets.map((x) => x.entryId)]),
  ].sort(byText);
  const anchors: [string, Anchor | null][] = [
    ['end', null],
    ...nodes.map((n): [string, Anchor] => [`node:${n.id}`, Anchor.node(n.id)]),
    ...[...model.events.keys()].map((id): [string, Anchor] => [`event:${id}`, Anchor.event(id)]),
    ['date:11', Anchor.date({ precision: 'exact', year: 11, month: null, day: null, hour: null, minute: null })],
  ];
  const progression: Record<string, Record<string, unknown>> = {};
  for (const id of people) {
    const ordered = inStoryOrder(snapshots, nodes, id);
    const resolved: Record<string, unknown> = {};
    for (const x of ordered) {
      for (const [sid, st] of x.systems) {
        const system = model.systems.get(sid);
        if (system === undefined) continue;
        const r = resolveSystem(system, st);
        resolved[`${x.id}/${sid}`] = {
          auto: r.auto,
          rows: r.rows.map((row) => ({
            id: row.variable.id,
            value: js(row.value),
            display: row.display,
            byHand: row.byHand,
            systemSays: row.systemSays,
            sources: row.sources,
            error: row.error,
          })),
          tracks: r.tracks.map((t) => ({ id: t.track.id, label: t.label, unmet: t.unmet, error: t.error })),
          items: r.items.map((i) => ({ id: i.item.id, unmet: i.unmet, effects: i.effects, error: i.error })),
          available: r.available.map((a) => a.id),
        };
      }
    }
    progression[id] = {
      order: inOrder(model, id).map((x) => x.id),
      at: Object.fromEntries(anchors.map(([k, a]) => [k, stateOut(progressAt(model, id, a))])),
      summary: progressSummary(progressAt(model, id, null)),
      log: changeLog(model, id).map((l) => ({ change: l.change.id, words: l.words, before: l.before, when: l.when })),
      snapshots: ordered.map((x) => x.id),
      stateAt: Object.fromEntries(
        [null, ...nodes.map((n) => n.id), 'gone'].map((n) => [`${n}`, stateAt(snapshots, nodes, id, n)?.id ?? null]),
      ),
      resolved,
      compared: ordered.slice(1).map((x, i) => {
        const c = compareSnapshots(ordered[i], x, systems);
        return { stats: c.stats, advancement: c.advancement, gained: c.gained, lost: c.lost, gear: c.gear, status: c.status, same: c.same };
      }),
    };
  }
  return { progression, words: model.progress.map((p) => [p.id, whenWords(p.at, model)]) };
}

/** Within a part in a trillion for fractions (as the Flutter test's expectJson); whole numbers, text and shapes exact. */
function close(actual: unknown, expected: unknown, path: string): void {
  if (typeof actual === 'number' && typeof expected === 'number' && !Number.isInteger(expected)) {
    expect([path, Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected))]).toEqual([path, true]);
    return;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    expect([path, actual.length]).toEqual([path, expected.length]);
    actual.forEach((a, i) => close(a, expected[i], `${path}[${i}]`));
    return;
  }
  if (actual !== null && expected !== null && typeof actual === 'object' && typeof expected === 'object') {
    expect([path, Object.keys(actual).sort(byText)]).toEqual([path, Object.keys(expected).sort(byText)]);
    for (const k of Object.keys(expected)) close((actual as JsonMap)[k], (expected as JsonMap)[k], `${path}.${k}`);
    return;
  }
  expect([path, actual]).toEqual([path, expected]);
}

for (const name of ['qa-sample', 'made-in-the-app', 'growth']) {
  describe(`${name}: progression as the original app has it`, () => {
    const actual = report(NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`))));
    const expected = golden[name];
    test('every change’s time in words', () => expect(actual.words).toEqual(expected['words']));
    const want = expected['progression'] as Record<string, Record<string, unknown>>;
    test('the same people', () => expect(Object.keys(actual.progression).sort(byText)).toEqual(Object.keys(want).sort(byText)));
    for (const id of Object.keys(want)) {
      for (const part of ['order', 'at', 'summary', 'log', 'snapshots', 'stateAt', 'resolved', 'compared']) {
        test(`${id}: ${part}`, () => close(JSON.parse(JSON.stringify(actual.progression[id][part])), want[id][part], `${id}.${part}`));
      }
    }
  });
}
