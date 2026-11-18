// The Progress page against the Flutter app's own outputs for the same novels (golden/progress.golden.json, made by
// golden/dump.dart with the real Dart): every fixture novel, test/model/edge.novel.json and Scriptor's sample, each
// read with its own writing log and goals and with made-up ones. As hashes: the progress report, the journal and
// everything the page says and draws; the script of goal changes. And `misc` whole: lengths of fiction, numbers, days.
//
// Set PROGRESS_DART to dump.dart's whole output (run it with FULL=1; the scratch dir's run.sh does both) to compare
// whole.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'progress.golden.json')) as Golden;
const whole = process.env.PROGRESS_DART ? (readJson(process.env.PROGRESS_DART) as Record<string, Record<string, unknown>>) : null;
/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('lengths of fiction, numbers, days and times are the Flutter app’s', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

test('every novel the dump read is checked here', () => {
  expect(novels.map(([n]) => n).sort()).toEqual(Object.keys(golden).filter((k) => k !== 'misc').sort());
});

for (const [name, path] of novels) {
  test(`${name}: the progress report, the journal, the page and the goal changes as the Flutter app makes them`, () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
