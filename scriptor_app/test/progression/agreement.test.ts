// Phase 5c's page readings and character progression against the Flutter app's own outputs for the same novels
// (golden/progression.golden.json, made by golden/dump.dart): every fixture novel, test/model/edge.novel.json and
// Scriptor's sample. For each: the levels its pages give (and with the author's word), the ledger and the names in its
// pages for each system (and the names with none), names added to each system, each person's chart series, a script
// of tracker changes and of snapshot changes run on a copy (every row and refusal), with each snapshot made worked out
// and compared (as hashes); and the readings over texts made to test them (`misc`, whole).
//
// Set PROGRESSION_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'progression.golden.json')) as Golden;
const whole = process.env.PROGRESSION_DART
  ? (readJson(process.env.PROGRESSION_DART) as Record<string, Record<string, unknown>>)
  : null;
/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('the readings over texts made to test them give what the Flutter app gives', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

for (const [name, path] of novels) {
  test(`${name}: its levels, ledger, names, charts, tracker and snapshots as the Flutter app has them`, () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
