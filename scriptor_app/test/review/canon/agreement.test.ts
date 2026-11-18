// Phase 7's canon port against the Flutter app's own outputs for the same novels (golden/canon.golden.json, made by
// golden/dump.dart with dart.exe): every fixture novel, test/model/edge.novel.json and Scriptor's sample. For each, as
// hashes: the canon review, every source as a reader would cite it, the marks laid over the views and all of them
// merged, "What depends on this" for every chapter, scene, group, event and development (and with the author's own
// choices), and a script of canon changes (each step's statements or refusal). And `misc` whole.
//
// Set CANON_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'canon.golden.json')) as Golden;
const whole = process.env.CANON_DART ? (readJson(process.env.CANON_DART) as Record<string, Record<string, unknown>>) : null;
/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('the review of made-up statements, normalizing, quoting and keys are the Flutter app’s', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

test('every novel the dump read is checked here', () => {
  expect(novels.map(([n]) => n).sort()).toEqual(Object.keys(golden).filter((k) => k !== 'misc').sort());
});

for (const [name, path] of novels) {
  test(`${name}: its canon, sources, marks, what depends on each point and a script of changes as the Flutter app has them`, () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
