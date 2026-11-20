// Phase 9's import and export against the Flutter app's own outputs for the same novels (golden/files.golden.json, made
// by golden/files.dump.dart): every fixture novel, test/model/edge.novel.json and Scriptor's sample. For each: its
// categories, profile layouts and systems as template files and read back; its records as spreadsheets for every view
// and kind; its filters in words; its complete bible as a Word file; a manuscript imported into it (as hashes). And
// template files refused or trimmed, hard text, Markdown and RTF, CSV cells, file names and malformed UTF-8 (`misc`).
//
// Set FILES_DART to the dump's whole output (run it with FULL=1) to compare whole when this fails.

import '../flutterBuiltins';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { hashOf } from '../characters/golden/outputs';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { misc, novel } from './golden/files.outputs';

type Golden = Record<string, Record<string, string>> & { misc: Record<string, unknown> };

const golden = readJson(join(__dirname, 'golden', 'files.golden.json')) as Golden;
const whole = process.env.FILES_DART ? (readJson(process.env.FILES_DART) as Record<string, Record<string, unknown>>) : null;
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const importMd = readFileSync(join(flutterFixturesDir, 'exchange', 'novel.md'), 'utf8');

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', 'model', 'edge.novel.json')],
  ['the-drowned-road', samplePath],
];

test('template files, hard text, cells, file names and malformed UTF-8 are read and written as the Flutter app does', () => {
  const mine = plain(misc()) as Record<string, unknown>;
  expect(Object.keys(mine).sort()).toEqual(Object.keys(golden.misc).sort());
  for (const key of Object.keys(golden.misc)) expect([key, mine[key]]).toEqual([key, golden.misc[key]]);
});

for (const [name, path] of novels) {
  test(`${name}: templates, records, filters, the Word bible and an import are the Flutter app's`, () => {
    const r = plain(novel(NovelSnapshot.fromJson(readJson(path)), importMd)) as Record<string, unknown>;
    const expected = golden[name];
    expect(Object.keys(r).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (whole !== null) expect([key, r[key]]).toEqual([key, whole[name][key]]);
      expect([key, hashOf(r[key])]).toEqual([key, expected[key]]);
    }
  });
}
