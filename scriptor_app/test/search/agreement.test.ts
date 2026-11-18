// Search, the index of names, "Go to" and the lesson for a page, against the real Dart: golden/search.golden.json is
// made by golden/dump.dart (plain dart.exe over the Flutter app's package) for every fixture novel, the edge novel and
// the sample. Compared by hash; with SEARCH_DART set to the whole dump (search.full.json), compared whole.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { canonical, hashOf } from '../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { misc, reads } from './golden/outputs';

type Golden = Record<string, Record<string, unknown>>;
const golden = readJson(join(__dirname, 'golden', 'search.golden.json')) as Golden;
const whole = process.env.SEARCH_DART ? (readJson(process.env.SEARCH_DART) as Golden) : null;
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('"Go to", the lesson for each address, the buttons lessons name and the query words are the Flutter app’s', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, canonical(mine[key])]).toEqual([key, canonical(golden.misc[key])]);
});

test('every novel of the golden is read here', () => {
  expect(novels.map(([n]) => n).sort()).toEqual(Object.keys(golden).filter((k) => k !== 'misc').sort());
});

for (const [name, path] of novels) {
  test(`${name}: the same blocks, the same results for every query in every scope, the same index`, () => {
    const r = plain(reads(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
