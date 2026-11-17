// Phase 6a's timeline against the Flutter app's own outputs for the same novels (golden/timeline.golden.json, made by
// golden/dump.dart): every fixture novel, test/model/edge.novel.json and Scriptor's sample. For each: its event records
// and their problems, events at the same time, ages and life paths, life histories, the timeline review, the chronicle
// and each event's card, each event page's issues and lines, the alternate histories and their comparisons, the
// calendar page with each ready-made calendar as its draft, the What if…? starters, the chapter seed, and a script of
// timeline changes run on a copy (every row and refusal) (as hashes); and dates, typed dates and the axis's marks in
// every calendar preset, labels and how events share time (`misc`, whole).
//
// Set TIMELINE_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { plain } from './compare';
import { misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'timeline.golden.json')) as Golden;
const whole = process.env.TIMELINE_DART ? (readJson(process.env.TIMELINE_DART) as Record<string, Record<string, unknown>>) : null;

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('dates, typed dates, marks, labels and shared time in every calendar are the Flutter app’s', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

for (const [name, path] of novels) {
  test(`${name}: its timeline, chronicle, event pages, histories, calendars and changes as the Flutter app has them`, () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
