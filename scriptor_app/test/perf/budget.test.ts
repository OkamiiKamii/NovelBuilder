// Whole-book work stays within its budget on the large novel (largeNovel.ts: the Flutter app's large test novel, 600
// scenes, 300,000 words, 400 characters, 1,000 entries), so a change that makes a reading much slower, or makes one grow
// faster than the book, fails here (FEATURES.md #11).
//
// Budgets are in Node's time on a quiet computer (about three times what each took there, 2026-11-17), scaled by how
// slow the computer is running at the moment of measuring: a fixed reference job (a JSON round trip of the large novel,
// about 20 ms when quiet) is timed before and after, so tests running beside this one, or anything else, do not fail
// it. The phone (Hermes) is slower than Node by a few times over. Each reading is the best of two runs.
// `PERF_TABLE=1 npx jest test/perf/budget` prints the table.

import { CastData } from '../../src/domain/characters/castData';
import { relationNetwork } from '../../src/domain/relationships/network';
import { mapLayoutRun } from '../../src/domain/relationships/screens/relationshipMap';
import { largeNovel, largeNovelId, largeNovelJson } from './largeNovel';
import { measureReadings, type Timed } from './measure';

/** The budget of each reading, in ms (Node, quiet); those not named have `others`. */
const budgets: Record<string, number> = {
  'namedIn after one page changed (NamedInReader)': 60,
  'cast view: whose eyes': 300,
  'cast view: entrances': 300,
  'cast view: arcs': 300,
  'panel: names in your manuscript': 500,
  'world: found in your pages': 400,
  'systems: levels in your pages': 500,
  'review: all warnings (audit + checks)': 600,
  'keepsake: best lines': 400,
  'keepsake: quiz': 900,
  'keepsake: gazette': 1000,
  'keepsake: postcards': 300,
  'keepsake: trailer': 1200,
  'keepsake: sampler + PDF layout': 700,
  'keepsake: book print': 600,
  'keepsake: your book so far': 900,
  'graph layout (200 drawn)': 2500,
  'relationship map (400 characters)': 4000,
};
const others = 500;

const budgetOf = (name: string): number =>
  budgets[name] ?? budgets[name.replace(/\(\d+ characters\)/, '(400 characters)')] ?? others;

/** The reference job's time on a quiet computer, in ms. */
const quietReference = 20;

/** How much slower than quiet the computer runs now (1 or more): the reference job's best of five against its quiet
 * time. */
function slowness(): number {
  const json = largeNovelJson();
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    JSON.parse(JSON.stringify(json));
    best = Math.min(best, performance.now() - t);
  }
  return Math.max(1, best / quietReference);
}

/** The readings, and how slow the computer ran while they were timed. */
function measured(volumes?: number): { timed: Timed[]; slow: number } {
  const before = slowness();
  const timed = measureReadings(largeNovel(volumes === undefined ? {} : { volumes }), 2);
  return { timed, slow: Math.max(before, slowness()) };
}

let full: Timed[] = [];
let slow = 1;

beforeAll(() => {
  ({ timed: full, slow } = measured());
  if (process.env.PERF_TABLE) {
    const total = full.reduce((n, t) => n + t.ms, 0);
    const rows = full.map((t) => `${t.ms.toFixed(0).padStart(7)} ms  (budget ${String(budgetOf(t.name)).padStart(4)})  ${t.name}`);
    console.log([...rows, `${total.toFixed(0).padStart(7)} ms  in all; the computer ran ${slow.toFixed(2)}× slower than quiet`].join('\n'));
  }
}, 900000);

test('every main reading of the large novel keeps to its budget', () => {
  expect(full.length).toBeGreaterThan(30);
  const over = full
    .filter((t) => t.ms > budgetOf(t.name) * slow)
    .map((t) => `${t.name}: ${t.ms.toFixed(0)} ms, budget ${budgetOf(t.name)} × ${slow.toFixed(2)}`);
  expect(over).toEqual([]);
});

test('no reading grows much faster than the book: twice the book, at most about twice the time', () => {
  const half = measured(5);
  // Each run's times as on a quiet computer, so a busy moment during one of them does not look like growth.
  const steep = full
    .map((f, i) => ({ name: f.name, ms: f.ms / slow, ratio: f.ms / slow / Math.max(half.timed[i].ms / half.slow, 1) }))
    // Below 40 ms a reading is too quick to time fairly; the layouts' work is capped by what is drawn, not the book.
    .filter((r) => r.ms >= 40 && r.ratio > 3.2)
    .map((r) => `${r.name}: ${r.ratio.toFixed(1)}×`);
  expect(steep).toEqual([]);
}, 900000);

test('the relationship map of 400 characters is laid out a step at a time, each step short', () => {
  const s = largeNovel();
  const net = relationNetwork(new CastData(largeNovelId, s).model);
  expect(net.nodes.length).toBeGreaterThan(300);
  const run = mapLayoutRun(net);
  const steps: number[] = [];
  const before = slowness();
  for (let i = 0; i < 1000 && !run.done; i++) {
    const t = performance.now();
    run.advance(1);
    steps.push(performance.now() - t);
  }
  const busy = Math.max(before, slowness());
  expect(run.done).toBe(true);
  // One step is what the screen waits for at most between frames (ui/inSlices.ts): kept short. The typical step, the
  // median: one slow step on a busy computer says nothing about the layout.
  steps.sort((a, b) => a - b);
  expect(steps[Math.floor(steps.length / 2)]).toBeLessThan(40 * busy);
}, 600000);
