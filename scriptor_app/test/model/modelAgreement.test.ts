// The shared model against the Flutter app's own outputs for the same novels (golden/model.golden.json, made by
// golden/dump.dart): every fixture novel, Scriptor's sample and edge.novel.json (a novel of edge cases: tied orders,
// missing and looping parents, unknown kinds, relative dates in a loop, ongoing and backwards events, damaged fields,
// links of every kind and to records that are gone, abilities, sheets, journeys, progress). For each: the records as
// the model reads them, the reading order, every connection and broken one, deleting every record, the codex's
// views, a run of codex changes, the chronology and the two orders, in the standard calendar and in one of its own.
//
// Set MODEL_DUMP to a file path to write Scriptor's whole outputs there, to compare with dump.dart's when this fails.

import '../flutterBuiltins';
import { createHash } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { kindsTemplate, miscOutputs, outputsOf } from './outputs';

const golden = readJson(join(__dirname, 'golden', 'model.golden.json')) as {
  full: Record<string, unknown>;
  digests: Record<string, string>;
};

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  if (typeof v === 'number' && Object.is(v, -0)) return '0';
  return JSON.stringify(v);
}

const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex').slice(0, 32);
/** As JSON carries it: -0 is written "-0.0" by Dart and read back as -0, which is 0 as far as JSON is concerned. */
const plainJson = (v: unknown): unknown => JSON.parse(JSON.stringify(v), (_, x) => (Object.is(x, -0) ? 0 : x));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, 'edge.novel.json')],
  ['sample', samplePath],
];

const template = kindsTemplate(NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, 'kinds.novel.json'))));
const dump: Record<string, unknown> = {};

afterAll(() => {
  if (process.env.MODEL_DUMP) writeFileSync(process.env.MODEL_DUMP, JSON.stringify(dump));
});

for (const [name, path] of novels) {
  test(`${name}: the model reads, connects, deletes, changes and orders it as the Flutter app does`, () => {
    const outputs = outputsOf(name, NovelSnapshot.fromJson(readJson(path)), template);
    Object.assign(dump, outputs);
    const expected = [...Object.keys(golden.full), ...Object.keys(golden.digests)].filter(
      (k) => k.split(/[.+]/)[0] === name,
    );
    expect(Object.keys(outputs).sort()).toEqual(expected.sort());
    for (const [key, value] of Object.entries(outputs)) {
      if (key in golden.full) {
        expect([key, plainJson(value)]).toEqual([key, plainJson(golden.full[key])]);
      } else {
        expect([key, digest(value)]).toEqual([key, golden.digests[key]]);
      }
    }
  });
}

test('dates, calendars, numbers, fields, folding, sorting and refs are read and written as the Flutter app does', () => {
  const misc = miscOutputs() as Record<string, unknown>;
  dump['misc'] = misc;
  const expected = golden.full['misc'] as Record<string, unknown>;
  expect(Object.keys(misc).sort()).toEqual(Object.keys(expected).sort());
  for (const key of Object.keys(expected)) {
    expect([key, plainJson(misc[key])]).toEqual([key, plainJson(expected[key])]);
  }
});

test('the golden holds every part for every novel, with content in it', () => {
  expect(Object.keys(golden.digests).length + Object.keys(golden.full).length).toBe(novels.length * 9 + 1);
  const edge = golden.full['edge.connections'] as { connections: unknown[]; dangling: unknown[] };
  expect(edge.connections.length).toBeGreaterThan(40);
  expect(edge.dangling.length).toBeGreaterThan(5);
  expect(Object.keys(golden.full['edge.deletes'] as object).length).toBeGreaterThan(40);
});
