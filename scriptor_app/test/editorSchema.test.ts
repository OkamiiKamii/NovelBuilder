// Every chapter the Flutter app's fixtures hold must come back from the editor's schema exactly as stored: the proof
// that Scriptor's editor writes the same manuscript format.

import { getSchema } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';

import { manuscriptExtensions } from '../editor-web/extensions';
import { type JsonMap, jsonEquals } from '../src/domain/json';
import { normalizeProse } from '../src/domain/prose';
import { NovelSnapshot } from '../src/domain/snapshot/novelSnapshot';
import { flutterFixtures, sampleJson } from './fixtures';

const schema = getSchema(manuscriptExtensions());

function docsOf(json: unknown): { where: string; doc: JsonMap }[] {
  const s = NovelSnapshot.fromJson(json);
  return [
    ...s.rows('chapterContents').map((r) => ({ where: `chapterContents/${r['id']}`, doc: r['doc'] as JsonMap })),
    ...s.rows('chapterRevisions').map((r) => ({ where: `chapterRevisions/${r['id']}`, doc: r['doc'] as JsonMap })),
    ...s.rows('chapterBranches').map((r) => ({ where: `chapterBranches/${r['id']}`, doc: r['doc'] as JsonMap })),
  ].filter((d) => d.doc && typeof d.doc === 'object');
}

const all = [...flutterFixtures(), { name: 'sample', json: sampleJson() }].flatMap((f) =>
  docsOf(f.json).map((d) => ({ ...d, file: f.name })),
);

describe("the editor's schema", () => {
  it('has chapters to check', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it.each(all.map((d) => [`${d.file} ${d.where}`, d.doc] as const))('keeps %s exactly', (_, doc) => {
    const back = Node.fromJSON(schema, doc).toJSON();
    // The same, allowing only the default alignment the editor writes on every paragraph and heading.
    expect(jsonEquals(normalizeProse(back), normalizeProse(doc))).toBe(true);
  });

  it('keeps a document the editor wrote byte for byte', () => {
    const made = all.filter((d) => d.file === 'sample');
    expect(made.length).toBeGreaterThan(10);
    for (const d of made) expect(jsonEquals(Node.fromJSON(schema, d.doc).toJSON(), d.doc)).toBe(true);
  });

  it('refuses a document with formatting it does not know, so it can open read-only', () => {
    const odd = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }] }] };
    expect(() => Node.fromJSON(schema, odd)).toThrow();
  });

  it('writes an empty chapter as the Flutter app does', () => {
    const empty = schema.topNodeType.createAndFill()!.toJSON();
    expect(empty).toEqual({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null } }] });
  });
});
