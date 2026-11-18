// Review by file agrees with the real Dart (golden/collab.golden.json, made by golden/dump.dart with dart.exe over the
// Flutter app's fixture novels, the edge novel and the sample): for each novel, the same scripted team, review copies,
// work in each role's copy (with every refusal), feedback files, previews, decisions and merges, compared part by
// part by hash (or whole, with COLLAB_DART set to the whole dump).

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, unknown>>;
const golden = readJson(join(__dirname, 'golden', 'collab.golden.json')) as Golden;
const whole = process.env.COLLAB_DART ? (readJson(process.env.COLLAB_DART) as Golden) : null;
/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('the roles, targets, marks and paragraphs built by hand are the Flutter app’s', () => {
  expect(plain(misc())).toEqual(golden['misc']);
});

test('every novel has its golden', () => {
  expect(novels.map(([n]) => n).sort()).toEqual(Object.keys(golden).filter((k) => k !== 'misc').sort());
});

test.each(novels)('%s: the team, copies, work, feedback, decisions and merges are the Flutter app’s', (name, path) => {
  const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
  const expected = golden[name];
  expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
  for (const key of Object.keys(expected)) {
    if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
    expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
  }
});
