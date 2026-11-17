// The character writing aids against the Flutter app's own outputs for the same novels (golden/aids.golden.json, made
// by golden/dump.dart): every fixture novel, test/model/edge.novel.json, Scriptor's sample and the characters' own
// knowledge.novel.json. For each: the interview each character is asked, their cameo, their likeness in words, their
// journal prompts, the places and sparks of a scene written in, the this-or-that deck, the empty chairs, their looks on
// the page, their card, the cast list for the book every way, the cast photograph and the name forge (as hashes); and
// the changes the aids make (traits, face, looks, interview answers, a journal page, the playbill, a scene's plan),
// each a hash of the novel after it.
//
// Set AIDS_DUMP to a file path to write Scriptor's reads whole, to compare with dump.dart's (FULL=…) when this fails.

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson, samplePath } from '../../fixtures';
import { type Inputs, hashOf, reads } from './golden/outputs';

type Golden = Record<string, { reads: Record<string, string>; inputs: Inputs }>;

const golden = readJson(join(__dirname, 'golden', 'aids.golden.json')) as Golden;
/** As JSON carries it: a Map as an object, no undefined. */
const plain = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (_, x: unknown) => (x instanceof Map ? Object.fromEntries(x) : x)));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
  ['knowledge', join(__dirname, '..', 'golden', 'knowledge.novel.json')],
  ['aids', join(__dirname, 'golden', 'aids.novel.json')],
];

const dump: Record<string, unknown> = {};
afterAll(() => {
  if (process.env.AIDS_DUMP) writeFileSync(process.env.AIDS_DUMP, JSON.stringify(dump));
});

for (const [name, path] of novels) {
  test(`${name}: the writing aids read and change the novel as the Flutter app's do`, () => {
    const snapshot = NovelSnapshot.fromJson(readJson(path));
    const expected = golden[name];
    const r = reads(snapshot, expected.inputs);
    const mine = plain(r.reads) as Record<string, unknown>;
    dump[name] = mine;
    expect(Object.keys(mine).sort()).toEqual(Object.keys(expected.reads).sort());
    for (const key of Object.keys(expected.reads)) expect([key, hashOf(mine[key])]).toEqual([key, expected.reads[key]]);
    expect(r.ids).toBe(expected.inputs.ids);
  });
}
