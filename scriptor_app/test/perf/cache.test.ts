// NamedInReader (characters/namedIn.ts) gives exactly what namedInJob gives, read again where the book changed: on every
// fixture novel and the sample, after a chapter is rewritten, a chapter added or removed, the names changed, and with a
// record twice or one that cannot be read.

import { CastData } from '../../src/domain/characters/castData';
import { NamedInReader, namedInJob } from '../../src/domain/characters/namedIn';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixtures, sampleJson } from '../fixtures';
import { largeNovel } from './largeNovel';
import { LayoutRun, layoutGraph, relationNetwork } from '../../src/domain/relationships/network';
import { mapDrawing, mapDrawingFrom, mapLayoutRun } from '../../src/domain/relationships/screens/relationshipMap';

const asPlain = (m: Map<string, string[]>) => [...m];

function storedOf(s: NovelSnapshot): string[] {
  return s.rows('chapterContents').map((r) => JSON.stringify(r));
}

test('NamedInReader reads what namedInJob reads, in every book', () => {
  const books = [...flutterFixtures().map((f) => f.json), sampleJson()].map((j) => NovelSnapshot.fromJson(j));
  for (const s of books) {
    const names = new CastData(s.projectId, s).findNames;
    const stored = storedOf(s);
    const reader = new NamedInReader();
    expect(asPlain(reader.read(stored, names))).toEqual(asPlain(namedInJob(stored, names)()));
    // Read again with nothing changed: the same, from what it kept.
    expect(asPlain(reader.read(stored, names))).toEqual(asPlain(namedInJob(stored, names)()));
  }
});

test('…and after the book changes: a page rewritten, added, removed, the names changed, a page twice or unreadable', () => {
  const s = largeNovel({ volumes: 2 });
  const names = new CastData(s.projectId, s).findNames;
  const reader = new NamedInReader();
  let stored = storedOf(s);
  expect(asPlain(reader.read(stored, names))).toEqual(asPlain(namedInJob(stored, names)()));

  const row = JSON.parse(stored[3]) as { doc: { content: { content: { text: string }[] }[] } };
  row.doc.content[0].content[0].text = 'Ysolde Vane 7 and Corin Rook 8 walked by the river. Nobody else.';
  stored = [...stored.slice(0, 3), JSON.stringify(row), ...stored.slice(4)];
  expect(asPlain(reader.read(stored, names))).toEqual(asPlain(namedInJob(stored, names)()));

  stored = [...stored.slice(0, 10), ...stored.slice(11), stored[0], 'not json', JSON.stringify({ id: 'x', doc: null })];
  expect(asPlain(reader.read(stored, names))).toEqual(asPlain(namedInJob(stored, names)()));

  const fewer = Object.fromEntries(Object.entries(names).slice(0, 20));
  expect(asPlain(reader.read(stored, fewer))).toEqual(asPlain(namedInJob(stored, fewer)()));
  expect(asPlain(reader.read(stored, names))).toEqual(asPlain(namedInJob(stored, names)()));
});

test('the layout laid out a few steps at a time is the layout laid out at once', () => {
  const s = largeNovel({ volumes: 2 });
  const cast = new CastData(s.projectId, s);
  const net = relationNetwork(cast.model);
  const nodes = net.nodes.map((n) => ({ id: n.id, degree: n.degree }));
  const edges = net.edges.map((e) => ({ from: e.from, to: e.to }));
  const whole = layoutGraph(nodes, edges);
  for (const slice of [1, 7, 50]) {
    const run = new LayoutRun(nodes, edges);
    for (let i = 0; i < 1000 && !run.done; i++) run.advance(slice);
    expect(run.done).toBe(true);
    expect([...run.result()]).toEqual([...whole]);
  }
  const run = mapLayoutRun(net);
  run.advance(Number.POSITIVE_INFINITY);
  expect(mapDrawingFrom(run.result())).toEqual(mapDrawing(net));
  // One record, or none: nothing to run, a result at once.
  expect(new LayoutRun([{ id: 'a', degree: 0 }], []).done).toBe(true);
  expect([...layoutGraph([], [])]).toEqual([]);
});
