// The relationships domain against the Flutter app's own outputs for the same novels (golden/relationships.golden.json,
// made by golden/dump.dart from the real Dart): every fixture novel, Scriptor's sample and edge.novel.json. For each:
// every relationship's history in words, the stage shown under 40-odd readings of "when" (with and without a type), the
// network and its layout under every filter (types, factions, focus, layers, chapters), and a run of relation changes
// on its first relationship, with the report again after it. Then a script of a hundred relation changes on a novel
// made for it (golden/script.json), every refusal included, and the layout of small graphs.
//
// Set RELATIONSHIPS_DUMP to a file path to write Scriptor's whole outputs there, to compare with dump.dart's when this
// fails.

import { createHash } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson, samplePath } from '../fixtures';
import { asJson, changed, graphs, report, runScript, scriptNovel, useTrig } from './outputs';
import { type JsonMap } from '../../src/domain/json';

const golden = readJson(join(__dirname, 'golden', 'relationships.golden.json')) as {
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
const plainJson = (v: unknown): unknown => JSON.parse(JSON.stringify(v), (_, x) => (Object.is(x, -0) ? 0 : x));

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, '..', 'model', 'edge.novel.json')],
  ['sample', samplePath],
];

const dump: Record<string, unknown> = {};

// Layouts start from cosines and sines, which differ in the last bit between C libraries for a few angles: these are
// the ones the Flutter app's platform gave where Node's differ (so the rest of the layout is checked to the pixel).
beforeAll(() => useTrig(golden.full['trig'] as [number, number, number][]));

afterAll(() => {
  if (process.env.RELATIONSHIPS_DUMP) writeFileSync(process.env.RELATIONSHIPS_DUMP, JSON.stringify(dump));
});

function expectAgrees(key: string, value: unknown) {
  dump[key] = value;
  if (key in golden.full) {
    expect(plainJson(value)).toEqual(plainJson(golden.full[key]));
  } else {
    expect({ key, digest: digest(plainJson(value)) }).toEqual({ key, digest: golden.digests[key] });
  }
}

for (const [name, path] of novels) {
  test(`${name}: histories, the network, its layout and a run of changes, as the Flutter app makes them`, () => {
    const s = NovelSnapshot.fromJson(readJson(path));
    expectAgrees(`${name}.report`, report(s));
    const steps = golden.full[`${name}.steps`] as unknown[];
    expect(steps).toBeDefined();
    const run = runScript(s, steps);
    expectAgrees(`${name}.script`, { steps: run.steps, refs: run.refs });
    expectAgrees(`${name}.after`, report(asJson(run.final)));
  });
}

test('a script of relation changes, each refused or made as the Flutter app does', () => {
  const spec = readJson(join(__dirname, 'golden', 'script.json')) as JsonMap;
  const run = runScript(scriptNovel(spec['novel'] as JsonMap), spec['steps'] as unknown[]);
  expect(run.steps.map((s) => s['refused'] ?? null)).toEqual(golden.full['script.refusals']);
  expectAgrees('script.steps', run.steps);
  expectAgrees('script.final', changed(asJson(run.final)));
  expectAgrees('script.report', report(asJson(run.final)));
});

test('small graphs are laid out as the Flutter app lays them out', () => {
  expectAgrees('graphs', graphs());
});

test('every golden output is checked', () => {
  const covered = new Set([
    ...novels.flatMap(([n]) => [`${n}.report`, `${n}.steps`, `${n}.script`, `${n}.after`]),
    'script.steps',
    'script.final',
    'script.report',
    'script.refusals',
    'graphs',
    'trig',
  ]);
  expect([...Object.keys(golden.full), ...Object.keys(golden.digests)].filter((k) => !covered.has(k))).toEqual([]);
});
