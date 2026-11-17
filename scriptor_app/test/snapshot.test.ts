import { type JsonMap, jsonEquals } from '../src/domain/json';
import { copyNovel, duplicateNovel, foreignReferences } from '../src/domain/snapshot/copy';
import { NovelSnapshot, SnapshotError } from '../src/domain/snapshot/novelSnapshot';
import { join } from 'node:path';

import { flutterFixtures, readJson, sampleJson, testIds } from './fixtures';

const goldenDir = join(__dirname, 'golden', 'flutter-roundtrip');

/** Every object's keys in order, through the whole value: the order a file is written in. */
function keyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(keyOrder);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as JsonMap).map(([k, v]) => [k, keyOrder(v)]);
  }
  return null;
}

describe('.novel.json', () => {
  const files = flutterFixtures();

  it('has the Flutter app’s fixtures to check against', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  // The reference: what the Flutter app itself writes after reading each fixture (test/golden/flutter-roundtrip,
  // made by the Flutter app's NovelSnapshot). Scriptor must write the same, key for key, in the same order.
  it.each(files.map((f) => [f.name, f.json] as const))('reads %s and writes what the Flutter app writes', (name, json) => {
    const file = json as JsonMap;
    const flutter = readJson(join(goldenDir, name)) as JsonMap;
    const scriptor = NovelSnapshot.fromJson(file).toJson((file['exportedAt'] as number | undefined) ?? 0);
    expect(jsonEquals(scriptor, flutter)).toBe(true);
    expect(keyOrder(scriptor)).toEqual(keyOrder(flutter));
  });

  it.each(files.map((f) => [f.name] as const))('reads its own output of %s back unchanged', (name) => {
    const flutter = readJson(join(goldenDir, name)) as JsonMap;
    expect(jsonEquals(NovelSnapshot.fromJson(flutter).toJson(flutter['exportedAt'] as number), flutter)).toBe(true);
  });

  it('reads the sample novel', () => {
    const s = NovelSnapshot.fromJson(sampleJson());
    expect(s.project['title']).toBe('The Drowned Road');
    expect(s.rows('chapters').filter((r) => r['kind'] === 'chapter')).toHaveLength(15);
    expect(s.rows('loreEntries').length).toBeGreaterThan(0);
  });

  it('keeps collections, fields and top-level keys it does not know', () => {
    const file = {
      format: 'novel-builder/project',
      version: 4,
      exportedAt: 5,
      fromTheFuture: { kept: true },
      project: { id: 'p', title: 'T', somethingNew: [1, 2] },
      collections: { chapters: [{ id: 'c', kind: 'chapter', status: 'idea', extra: 'x' }], hoverboards: [{ id: 'h' }] },
    };
    const s = NovelSnapshot.fromJson(file);
    expect(s.unknownCollections).toEqual(['hoverboards']);
    const out = s.toJson();
    expect(out['fromTheFuture']).toEqual({ kept: true });
    expect((out['project'] as JsonMap)['somethingNew']).toEqual([1, 2]);
    expect((out['collections'] as JsonMap)['hoverboards']).toEqual([{ id: 'h' }]);
    expect(((out['collections'] as JsonMap)['chapters'] as JsonMap[])[0]['extra']).toBe('x');
  });

  it.each([
    ['not an object', [1], 'it is not a JSON object'],
    ['another format', { format: 'x', version: 4 }, 'it is not a novel file'],
    ['no version', { format: 'novel-builder/project' }, 'it does not say which version of the format it uses'],
    ['a newer version', { format: 'novel-builder/project', version: 5, project: { id: 'p' } }, 'format 5'],
    ['no details', { format: 'novel-builder/project', version: 4 }, 'it has no novel details'],
    ['no novel id', { format: 'novel-builder/project', version: 4, project: { id: ' ' } }, 'its novel has no id'],
    [
      'two records with one id',
      { format: 'novel-builder/project', version: 4, project: { id: 'p' }, collections: { goals: [{ id: 'a' }, { id: 'a' }] } },
      'two records in goals share the id a',
    ],
    [
      'a record without an id',
      { format: 'novel-builder/project', version: 4, project: { id: 'p' }, collections: { goals: [{ name: 'x' }] } },
      '1 record in goals cannot be read',
    ],
  ])('refuses a file with %s, saying why', (_, json, reason) => {
    expect(() => NovelSnapshot.fromJson(json)).toThrow(SnapshotError);
    expect(() => NovelSnapshot.fromJson(json)).toThrow(reason);
  });

  it('upgrades old chapter statuses into the single pipeline', () => {
    const s = NovelSnapshot.fromJson({
      format: 'novel-builder/project',
      version: 2,
      project: { id: 'p' },
      collections: {
        chapters: [
          { id: 'a', status: 'outlining' },
          { id: 'b', status: 'editing', publication: 'written' },
          { id: 'c', status: 'complete', publication: 'published' },
          { id: 'd', status: 'drafting' },
        ],
      },
    });
    expect(s.rows('chapters').map((r) => r['status'])).toEqual(['planned', 'revising', 'published', 'drafting']);
    expect(s.rows('chapters').some((r) => 'publication' in r)).toBe(false);
  });

  it('upgrades blueprints whose ranks and tables are linked by name', () => {
    const s = NovelSnapshot.fromJson({
      format: 'novel-builder/project',
      version: 3,
      project: { id: 'p' },
      collections: {
        systems: [
          {
            id: 's',
            ranks: ['E', 'D'],
            items: [{ id: 'i1', rank: 'D' }, { id: 'i2', rank: 'S' }, { id: 'i3' }],
            matrices: [{ id: 'm', rows: ['Fire'], columns: ['Water'], cells: { 'Fire|Water': 'weak' } }],
          },
        ],
      },
    });
    const sys = s.rows('systems')[0];
    const ranks = sys['ranks'] as JsonMap[];
    expect(ranks.map((r) => r['name'])).toEqual(['E', 'D', 'S']);
    const items = sys['items'] as JsonMap[];
    expect(items[0]['rankId']).toBe(ranks[1]['id']);
    expect(items[1]['rankId']).toBe(ranks[2]['id']);
    expect(items[2]['rankId']).toBeNull();
    const m = (sys['matrices'] as JsonMap[])[0];
    const row = (m['rows'] as JsonMap[])[0]['id'];
    const col = (m['columns'] as JsonMap[])[0]['id'];
    expect(m['cells']).toEqual({ [`${row}|${col}`]: 'weak' });
    // Safe to run twice: reading what it wrote changes nothing.
    const again = NovelSnapshot.fromJson(s.toJson());
    expect(jsonEquals(again.rows('systems'), s.rows('systems'))).toBe(true);
  });
});

describe('copies', () => {
  const sample = NovelSnapshot.fromJson(sampleJson());

  it('share nothing with the original, and keep every record', () => {
    const copy = copyNovel(sample, { title: 'Copy', now: 1, createId: testIds() });
    expect(foreignReferences(sample, copy)).toEqual([]);
    for (const [name, rows] of Object.entries(sample.collections)) expect(copy.rows(name)).toHaveLength(rows.length);
    expect(copy.project['title']).toBe('Copy');
    expect(copy.project['pinned']).toBe(false);
  });

  it('leave the text of chapters exactly as written', () => {
    const copy = copyNovel(sample, { title: 'Copy', now: 1, createId: testIds() });
    const texts = (s: NovelSnapshot) =>
      JSON.stringify(s.rows('chapterContents').map((r) => r['content'])).match(/"text":"[^"]*"/g);
    expect(texts(copy)).toEqual(texts(sample));
  });

  it('leave version history out of a duplicate', () => {
    const withHistory = sample.withRows('chapterRevisions', [{ id: 'rev', nodeId: 'x' }]);
    const dup = duplicateNovel(withHistory, { title: 'Dup', now: 1, createId: testIds() });
    expect(dup.rows('chapterRevisions')).toHaveLength(0);
  });
});
