// Phase 8's keepsakes against the Flutter app's own outputs for the same novels (golden/keepsakes.golden.json, made by
// golden/dump.dart): every fixture novel, test/model/edge.novel.json and Scriptor's sample. For each: what each
// keepsake page gathers, and the best lines, fingerprint, story so far, jacket (copy and barcode), quiz at three seeds,
// gazette, postcards and their paintings, trailer, sampler, the sampler's PDF as drawn (read back out of the real file)
// and the submission kit and letter (as hashes); and made-up postcards' paintings and Dart's String.hashCode (`misc`).
//
// Set KEEPSAKES_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'keepsakes.golden.json')) as Golden;
const whole = process.env.KEEPSAKES_DART
  ? (readJson(process.env.KEEPSAKES_DART) as Record<string, Record<string, unknown>>)
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

test('made-up postcards are painted, and ids hashed, as the Flutter app does', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

for (const [name, path] of novels) {
  test(`${name}: every keepsake made as the Flutter app makes it`, () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
