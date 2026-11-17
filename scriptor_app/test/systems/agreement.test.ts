// The Systems core agrees with the Flutter app's own output, made by running the real Dart (golden/dump.dart, with
// plain dart.exe; golden/systems.golden.json pins it): for every fixture novel, the edge novel and the sample, each
// system's window, every sheet worked out, its climb and level history, every face-off, the book's own system read
// from its pages, and a script of changes; and `misc`: the system's messages, systems from made-up pages, the presets'
// windows. Each part is compared by its hash (the whole dump, set VIEWS-style in SYSTEMS_DART, is compared whole).

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { misc, novel } from './golden/outputs';
import { jsonDiff } from './original.test';

type Golden = Record<string, Record<string, unknown>>;
const golden = readJson(join(__dirname, 'golden', 'systems.golden.json')) as Golden;
const whole = process.env.SYSTEMS_DART ? (readJson(process.env.SYSTEMS_DART) as Golden) : null;
/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('the system’s messages, systems from made-up pages and the presets’ windows are the Flutter app’s', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  for (const key of Object.keys(golden['misc'])) expect([key, jsonDiff(mine[key], golden['misc'][key], key)]).toEqual([key, null]);
});

test('every novel is in the golden', () => {
  expect(novels.map(([n]) => n).sort()).toEqual(Object.keys(golden).filter((k) => k !== 'misc').sort());
});

describe.each(novels)('%s', (name, path) => {
  test('windows, sheets, climbs, history, face-offs, its own system and the changes are the Flutter app’s', () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, jsonDiff(r[key], whole[name][key], `${name}.${key}`)]).toEqual([key, null]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
});
