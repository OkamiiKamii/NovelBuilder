// The characters domain against the Flutter app's own outputs for the same novels (golden/characters.golden.json, made
// by golden/dump.dart): every fixture novel, test/model/edge.novel.json, Scriptor's sample and golden/knowledge.novel.json
// (secrets whose knowledge is recorded, to check). For each: the cast as
// the library reads it, searched, filtered and sorted every way, the names and where they are, the passages, the
// secrets, the matrix, the references, profiles, lines and sentences (as hashes); and script.json's changes applied
// step by step (each step's result whole, and a hash of the novel after it). And the pure helpers (`misc`), whole.
//
// Set CHAR_DUMP to a file path to write Scriptor's reads whole, to compare with dump.dart's (FULL=…) when this fails.

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { hashOf, misc, reads, runScript } from './golden/outputs';

type Golden = Record<string, { reads: Record<string, string>; steps: unknown[] }> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'characters.golden.json')) as Golden;
const script = readJson(join(__dirname, 'golden', 'script.json')) as Record<string, unknown>[];
/** As JSON carries it: a Map as an object, no undefined. */
const plain = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (_, x: unknown) => (x instanceof Map ? Object.fromEntries(x) : x)));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
  ['knowledge', join(__dirname, 'golden', 'knowledge.novel.json')],
];

const dump: Record<string, unknown> = {};
afterAll(() => {
  if (process.env.CHAR_DUMP) writeFileSync(process.env.CHAR_DUMP, JSON.stringify(dump));
});

test('the pure helpers give what the Flutter app gives', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

for (const [name, path] of novels) {
  describe(name, () => {
    const snapshot = NovelSnapshot.fromJson(readJson(path));

    test('reads the cast as the Flutter app does', () => {
      const r = reads(snapshot);
      dump[name] = plain(r);
      const expected = golden[name].reads;
      expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
      for (const key of Object.keys(expected)) expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    });

    test('makes the script’s changes as the Flutter app does, step by step', () => {
      const steps = plain(runScript(snapshot, script)) as unknown[];
      const expected = golden[name].steps;
      expect(steps).toHaveLength(expected.length);
      steps.forEach((step, i) => expect([i, step]).toEqual([i, expected[i]]));
    });
  });
}
