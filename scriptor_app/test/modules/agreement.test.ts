// The genre modules against the Flutter app's own outputs for the same novels (golden/modules.golden.json, made by
// golden/dump.dart from the real Dart): every fixture novel, test/model/edge.novel.json and Scriptor's sample. For
// each, as hashes: where every module stands, what each would add (try it on), each installed module's workspace,
// each built-in module turned on, off and on again in a copy (the ids it makes, in turn), its arrangement, workspace
// and starter system; Made for your story; a module made from the novel and read back from its file. And `misc`
// whole: every built-in module read as a file would be, starter systems, formulas, random books matched, tracks'
// labels, numbers as typed, addresses.
//
// Set MODULES_DART to dump.dart's whole output (run it with FULL=1) to compare whole when this fails.

import '../flutterBuiltins';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../characters/golden/outputs';
import { toFlutterWords } from '../../src/domain/modules/scriptorWords';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { misc, novel } from './golden/outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'modules.golden.json')) as Golden;
const whole = process.env.MODULES_DART ? (readJson(process.env.MODULES_DART) as Record<string, Record<string, unknown>>) : null;
/** As JSON carries it: no undefined. */
/** As JSON carries it: no undefined; and in the Flutter app's words where Scriptor says World (scriptorWords.ts). */
const plain = (v: unknown): unknown => JSON.parse(toFlutterWords(JSON.stringify(v)));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('the built-in modules, formulas, matching, tracks, numbers and addresses are the Flutter app’s', () => {
  const dartFits = golden.misc['fits'] as Parameters<typeof misc>[0];
  const mine = plain(misc(dartFits)) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

test('every novel the dump read is checked here', () => {
  expect(novels.map(([n]) => n).sort()).toEqual(Object.keys(golden).filter((k) => k !== 'misc').sort());
});

for (const [name, path] of novels) {
  test(`${name}: every module as the Flutter app turns it on, shows it and works its tools`, () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)))) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
