// Visualize's world views and the knowledge graph against the Flutter app's own outputs for the same novels
// (golden/world.golden.json, made by golden/dump.dart with the real Dart): every fixture novel, test/model/edge,
// Scriptor's sample and the big world. For each: journeys read against the story, every traveller's route, the travel
// checks, references taken out of journeys; the factions, their ties at three points, each at a point and the faction
// map four ways; the items and who held them at three points; the knowledge graph whole, its counts, letter codes,
// labels, queries, paths, folding, limit, pairs, words, groups and shapes; and a script of place and journey changes
// with every refusal (as hashes). Numbers that are not whole are compared to nine significant places.
//
// Set VWORLD_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { reads, rounded } from './golden/outputs';

type Golden = Record<string, Record<string, string>>;

const golden = readJson(join(__dirname, 'golden', 'world.golden.json')) as Golden;
const whole = process.env.VWORLD_DART ? (readJson(process.env.VWORLD_DART) as Record<string, Record<string, unknown>>) : null;
const plain = (v: unknown): unknown => rounded(JSON.parse(JSON.stringify(rounded(v))));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
  ['bigworld', join(__dirname, '..', '..', 'codex', 'world', 'golden', 'bigworld.novel.json')],
];

test('every novel the golden holds is read here', () => {
  expect(Object.keys(golden).sort()).toEqual(novels.map(([n]) => n).sort());
});

for (const [name, path] of novels) {
  test(`${name}: journeys, factions, ownership, the graph and place changes as the Flutter app has them`, () => {
    const r = plain(reads(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
