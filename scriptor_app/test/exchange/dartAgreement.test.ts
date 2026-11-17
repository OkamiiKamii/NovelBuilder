// Scriptor's book, ebook, web serial and manuscript export against the Flutter app's own outputs for the same novels
// (golden/dart.golden.json, made by golden/dump.dart): every fixture novel and edge.novel.json, a novel of edge cases
// (marks, alignments, quotes, lists, typed breaks, a blank scene-break mark, unknown kinds, blank and missing parents,
// tied orders, covers of every kind, Greek, Turkish and German letters).

import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { type JsonMap } from '../../src/domain/json';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';
import { outputsOf } from './outputs';

const golden = readJson(join(__dirname, 'golden', 'dart.golden.json')) as {
  full: Record<string, unknown>;
  digests: Record<string, string>;
};

const novels: [string, string][] = [
  ...readdirSync(flutterFixturesDir)
    .filter((f) => f.endsWith('.novel.json'))
    .map((f): [string, string] => [f.replace('.novel.json', ''), join(flutterFixturesDir, f)]),
  ['edge', join(__dirname, 'edge.novel.json')],
];

const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

for (const [name, path] of novels) {
  test(`${name}: the book, ebook, serial and export are the Flutter app's`, () => {
    const outputs = outputsOf(name, NovelSnapshot.fromJson(readJson(path)));
    const expected = [...Object.keys(golden.full), ...Object.keys(golden.digests)].filter(
      (k) => k.split(/[.+]/)[0] === name,
    );
    expect(Object.keys(outputs).sort()).toEqual(expected.sort());
    for (const [key, value] of Object.entries(outputs)) {
      if (key in golden.full) {
        expect([key, plain(value)]).toEqual([key, golden.full[key]]);
      } else {
        expect([key, digest(value)]).toEqual([key, golden.digests[key]]);
      }
    }
  });
}

test('the golden holds every kind of output, with text in it', () => {
  const edge = golden.full['edge.compile.15.'] as JsonMap;
  expect(edge['txt']).toContain('Author notes: Chapter 1');
  expect(edge['txt']).toContain('Planning: Chapter 1');
  expect((golden.full['book.epub.en'] as JsonMap)['firstStored']).toBe(true);
  expect(Object.keys(golden.digests).some((k) => k.startsWith('made-in-the-app.compile.'))).toBe(true);
});
