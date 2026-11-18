// Review's warnings and record check against the Flutter app's own outputs for the same novels
// (golden/warnings.golden.json, made by golden/dump.dart with dart.exe): every fixture novel, test/model/edge.novel.json
// and Scriptor's sample, each whole and with its first character and first chapter deleted. For each, as hashes: the
// record check's findings, the record-to-record rules, every warning gathered with its decisions, and every fix (each
// broken reference taken out, each field pointed, each look-alike's merge plan both ways, merges), refusals said. And
// `misc` whole: names compared for likeness, references taken out, the words for where things are kept.
//
// Set WARNINGS_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { damaged, misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'warnings.golden.json')) as Golden;
const whole = process.env.WARNINGS_DART ? (readJson(process.env.WARNINGS_DART) as Record<string, Record<string, unknown>>) : null;
/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('names, references taken out and the words for tables are the Flutter app’s', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

test('every novel the dump read is checked here', () => {
  const read = novels.flatMap(([n]) => [n, `${n}-damaged`]).sort();
  expect(read).toEqual(
    Object.keys(golden)
      .filter((k) => k !== 'misc')
      .sort(),
  );
});

for (const [name, path] of novels) {
  test(`${name}: the record check, the rules, the warnings and the fixes are the Flutter app’s`, () => {
    const s = NovelSnapshot.fromJson(readJson(path));
    for (const [key, snap] of [
      [name, s],
      [`${name}-damaged`, damaged(s)],
    ] as const) {
      const r = plain(novel(snap)) as Record<string, unknown>;
      const expected = golden[key];
      expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
      for (const part of Object.keys(expected)) {
        if (whole !== null) expect([key, part, r[part]]).toEqual([key, part, whole[key][part]]);
        expect([key, part, hashOf(r[part])]).toEqual([key, part, expected[part]]);
      }
    }
  });
}
