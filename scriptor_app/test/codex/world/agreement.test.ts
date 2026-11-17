// The world against the Flutter app's own outputs for the same novels (golden/world.golden.json, made by
// golden/dump.dart): every fixture novel, test/model/edge.novel.json, Scriptor's sample and the knowledge novel. For
// each: what each chapter names, what the pages name that the world lacks and its cards, the place tree, the chart
// (what is on it, laid out at two widths with and without an all-capitals face, its names and shores), the shelves and
// the encyclopedia, each entry's page and the charter begun on it (as hashes); and the readings over texts made to
// test them, the sea's marks and the shores' seeds (`misc`, whole). Numbers that are not whole are compared to nine
// significant places: the chart's sines, cosines and powers are each platform's own.
//
// Set WORLD_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { hashOf } from '../../characters/golden/outputs';
import { misc, reads, rounded } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'world.golden.json')) as Golden;
const whole = process.env.WORLD_DART ? (readJson(process.env.WORLD_DART) as Record<string, Record<string, unknown>>) : null;
const plain = (v: unknown): unknown => rounded(JSON.parse(JSON.stringify(v)));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
  ['knowledge', join(__dirname, '..', '..', 'characters', 'golden', 'knowledge.novel.json')],
  // Many places (the packing's spiral), nesting, levels, a loop, an ended tie, a crowded shore, and pages naming what
  // the world lacks: made from the sample (golden/bigworld.novel.json).
  ['bigworld', join(__dirname, 'golden', 'bigworld.novel.json')],
];

test('the readings over texts made to test them give what the Flutter app gives', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

test('every novel the golden holds is read here', () => {
  expect(Object.keys(golden).filter((k) => k !== 'misc').sort()).toEqual(novels.map(([n]) => n).sort());
});

for (const [name, path] of novels) {
  test(`${name}: the world as the Flutter app reads and lays it out`, () => {
    const r = plain(reads(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
