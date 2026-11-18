// The project analytics against the Flutter app's own outputs for the same novels (golden/analytics.golden.json, made
// by golden/dump.dart with the real Dart): every fixture novel, test/model/edge.novel.json and Scriptor's sample, each
// read at three moments, with only the names as entered and with every name Characters finds them by. As hashes; and
// `misc` whole.
//
// Set ANALYTICS_DART to dump.dart's whole output (run it with FULL=1; the scratch dir's run.sh does both) to compare
// whole.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ranges } from '../../../src/domain/analytics/analytics';
import { CastData } from '../../../src/domain/characters/castData';
import { type JsonMap } from '../../../src/domain/json';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { expectJson } from '../../timeline/compare';
import { analyticsJson, analyticsOf } from './json';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'analytics.golden.json')) as Golden;
const whole = process.env.ANALYTICS_DART ? (readJson(process.env.ANALYTICS_DART) as Record<string, Record<string, unknown>>) : null;
/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const moments: Record<string, number> = {
  oct25: new Date(2026, 9, 25, 12).getTime(),
  nov17: new Date(2026, 10, 17, 12).getTime(),
  jan2031: new Date(2031, 0, 3, 12).getTime(),
};

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

function report(s: NovelSnapshot): Record<string, unknown> {
  const names = new CastData('novel', s).findNames;
  const out: Record<string, unknown> = {};
  for (const [key, now] of Object.entries(moments)) {
    out[key] = plain(analyticsJson(analyticsOf(s, now)));
    out[`${key}-names`] = plain(analyticsJson(analyticsOf(s, now, names)));
  }
  return out;
}

test('ranges are the Flutter app’s', () => {
  const lists = [[], [4], [1, 2, 3, 7, 12], [1, 3, 4, 5, 9, 10], [2, 3], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]];
  expect({ ranges: lists.map(ranges) }).toEqual(golden.misc);
});

test('every novel the dump read is checked here', () => {
  expect(novels.map(([n]) => n).sort()).toEqual(Object.keys(golden).filter((k) => k !== 'misc').sort());
});

for (const [name, path] of novels) {
  test(`${name}: the analytics are the Flutter app’s, at three moments, with and without every name`, () => {
    const s = NovelSnapshot.fromJson(readJson(path) as JsonMap);
    const r = report(s);
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expectJson(r[key], whole[name][key], `${name}.${key}`);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
