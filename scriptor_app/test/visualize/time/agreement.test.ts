// Phase 6b's time views against the Flutter app's own outputs for the same novels (golden/time.golden.json, made by
// golden/dump.dart): every fixture novel, test/model/edge.novel.json and Scriptor's sample. For each, on the main
// timeline and on each alternate history: every way of splitting it into tracks (as they come, and arranged), each
// track's list, the line over it, the events not placed in time, and the drawing at 390 and 1000 wide for the whole
// story, zoomed and moved on (bands, every mark's shapes and name, where taps land, said aloud); the story and reading
// order (rows said aloud, the lines with nothing, a chapter or an event selected, the lists); each character's
// history (as hashes). And "Jump to date" and "Show from … until" on typed dates (`misc`, whole).
//
// Set TIME_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { plain } from '../../timeline/compare';
import { misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'time.golden.json')) as Golden;
const whole = process.env.TIME_DART ? (readJson(process.env.TIME_DART) as Record<string, Record<string, unknown>>) : null;

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('"Jump to date" and "Show from … until" read typed dates as the Flutter app does', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

for (const [name, path] of novels) {
  test(`${name}: the drawn timeline, story and reading order, and every character's history as the Flutter app has them`, () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
