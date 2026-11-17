// The readings of the cast against the Flutter app's own outputs for the same novels (golden/views.golden.json, made by
// golden/dump.dart): every fixture novel, test/model/edge.novel.json, Scriptor's sample and the knowledge novel. For
// each: whose eyes, entrances, arcs, every chapter's table read and voices, the people waiting for a name, the names in
// the manuscript, everyone's lines and voices, the name board, the cast check, who is together, temperaments and
// foils, and the orbit with its sky (as hashes); and the readings over texts made to test them (`misc`, whole).
//
// Set VIEWS_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { hashOf } from '../golden/outputs';
import { misc, reads } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'views.golden.json')) as Golden;
const whole = process.env.VIEWS_DART ? (readJson(process.env.VIEWS_DART) as Record<string, Record<string, unknown>>) : null;
/** As JSON carries it: a Map as an object, a Set as a list, no undefined. */
const plain = (v: unknown): unknown =>
  JSON.parse(
    JSON.stringify(v, (_, x: unknown) => (x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : x)),
  );

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
  ['knowledge', join(__dirname, '..', 'golden', 'knowledge.novel.json')],
];

test('the readings over texts made to test them give what the Flutter app gives', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

for (const [name, path] of novels) {
  test(`${name}: the cast read in its pages as the Flutter app reads it`, () => {
    const r = plain(reads(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
