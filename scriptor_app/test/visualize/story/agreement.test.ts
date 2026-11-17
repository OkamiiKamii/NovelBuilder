// Visualize's story views against the Flutter app's own outputs for the same novels (golden/story.golden.json, made
// by golden/dump.dart): every fixture novel, test/model/edge.novel.json and Scriptor's sample. For each, as hashes:
// structure and pacing at both grains, for the whole book and each part, with each label picked out; the markers and a
// script of marker changes with its refusals; every lane's cells in words, lines and sequence; a script of appearance
// records; and the ability paths (the tree, what does not add up, the layout, each path drawn and in words, the list,
// the view under eight choices, and each character's holdings and standings at the end and at every chapter and scene).
// And `misc` whole.
//
// Set STORY_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'story.golden.json')) as Golden;
const whole = process.env.STORY_DART ? (readJson(process.env.STORY_DART) as Record<string, Record<string, unknown>>) : null;
/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('the round numbers of the scale are the Flutter app’s', () => {
  expect(plain(misc())).toEqual(golden.misc);
});

test('every novel the dump read is checked here', () => {
  expect(novels.map(([n]) => n).sort()).toEqual(Object.keys(golden).filter((k) => k !== 'misc').sort());
});

for (const [name, path] of novels) {
  test(`${name}: structure, markers, lanes, appearances and ability paths as the Flutter app shows and changes them`, () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
