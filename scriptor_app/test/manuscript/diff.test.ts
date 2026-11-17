// A port of the version-comparison expectations in flutter_app/test/shared/domain/prose_test.dart, against the same
// golden file (made by the original app).

import { join } from 'node:path';

import { type JsonMap, isMap, listOf } from '../../src/domain/json';
import { diffDocs, diffParagraphs, diffWords } from '../../src/domain/manuscript/diff';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'prose.golden.json')) as JsonMap;
const fixtureNames = ['qa-sample', 'made-in-the-app'];
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

for (const name of fixtureNames) {
  test(`version comparisons in ${name} agree`, () => {
    const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));
    const contents = new Map(s.rows('chapterContents').map((r) => [r['id'], r]));
    for (const d of listOf((golden[name] as JsonMap)['diffs']).filter(isMap)) {
      const rev = s.rows('chapterRevisions').find((r) => r['id'] === d['revision'])!;
      const result = diffDocs(rev['doc'], contents.get(rev['nodeId'])!['doc']);
      expect([d['revision'], plain(result)]).toEqual([d['revision'], d['result']]);
    }
  });
}

test('paragraph comparisons agree: edits, moves, spacing, additions', () => {
  const cases: [string[], string[]][] = [
    [
      ['One two three.', 'Keep me.', 'Moved paragraph here.'],
      ['Moved paragraph here.', 'One two four.', 'Keep me.', 'Brand new.'],
    ],
    [['Same  spacing.'], ['Same spacing.']],
    [[], ['Only added.']],
    [['The quick brown fox jumps over the lazy dog.'], ['The quick red fox leaps over the lazy dog!']],
  ];
  const expected = listOf(golden['paragraphDiffs']);
  cases.forEach(([before, after], i) => {
    expect([i, plain(diffParagraphs(before, after))]).toEqual([i, expected[i]]);
  });
});

test('joining the parts of a word diff gives back both texts exactly', () => {
  const before = 'She  ran to the old mill, quickly.';
  const after = 'She walked to the mill — slowly.';
  const parts = diffWords(before, after);
  expect(
    parts
      .filter((p) => p.op !== 'add')
      .map((p) => p.text)
      .join(''),
  ).toBe(before);
  expect(
    parts
      .filter((p) => p.op !== 'del')
      .map((p) => p.text)
      .join(''),
  ).toBe(after);
});
