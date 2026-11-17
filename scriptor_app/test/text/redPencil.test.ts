// A port of flutter_app/test/shared/domain/red_pencil_test.dart.

import { blockTexts, countWords } from '../../src/domain/prose';
import { isMap } from '../../src/domain/json';
import { type PencilMark, countOf, findingsOf, redPencil } from '../../src/domain/text/redPencil';
import { sampleJson } from '../fixtures';

function marked(paragraphs: string[], kind: PencilMark): string[] {
  return findingsOf(redPencil(paragraphs), kind).map((f) => paragraphs[f.block].substring(f.start, f.end));
}

const filled = (n: number, s: string) => Array<string>(n).fill(s);

test('an echo: a distinctive word again close to itself, in either form, both places marked', () => {
  expect(marked(['The stone was cold. She touched the stone again.'], 'echo')).toEqual(['stone', 'stone']);
  expect(marked(['Seven stones stood there.', 'The first stone leaned.'], 'echo')).toEqual(['stones', 'stone']);
  expect(marked(['The bell’s note. A bell rang.'], 'echo')).toEqual(['bell’s', 'bell']);
});

test('not an echo: everyday words, names, short words, or a word that comes back much later', () => {
  expect(marked(['“Go,” she said. “No,” he said. They were there, and there they were.'], 'echo')).toEqual([]);
  expect(marked(['Wren ran. Wren stopped. Then Wren laughed.'], 'echo')).toEqual([]); // a name
  expect(marked(['The sea. The sea. The sea.'], 'echo')).toEqual([]); // three letters
  const far = [`The harbour was empty. ${filled(45, 'and').join(' ')} The harbour filled.`];
  expect(marked(far, 'echo')).toEqual([]);
});

test('fillers, and "began to"', () => {
  expect(marked(['It was very cold and she just began to run, really.'], 'filler')).toEqual([
    'very',
    'just',
    'began to',
    'really',
  ]);
  expect(marked(['The beginning of it. She started the boat.'], 'filler')).toEqual([]);
});

test('a long sentence: more than forty words between full stops, marked from its first word to its stop', () => {
  const long = `The road ${filled(42, 'ran').join(' ')} on.`;
  const text = `A short one. ${long} “And this?” Done.`;
  const found = findingsOf(redPencil([text]), 'long');
  expect(found).toHaveLength(1);
  expect(text.substring(found[0].start, found[0].end)).toBe(long);
  expect(findingsOf(redPencil(['Mr. Fenn paid 3.5 crowns. Then left.']), 'long')).toEqual([]);
});

test('leaned on: the distinctive words used most, five times or more', () => {
  const text = filled(6, 'The water rose.').join(' ') + filled(5, ' Lanterns swung.').join('');
  expect(redPencil([text]).leanedOn).toEqual([
    { word: 'rose', count: 6 },
    { word: 'water', count: 6 },
    { word: 'lanterns', count: 5 },
    { word: 'swung', count: 5 },
  ]);
});

test('it only reads: the same text gives the same marks, and nothing in it is changed', () => {
  const paragraphs = ['The stone was very cold.', 'The stone was colder.'];
  const copy = [...paragraphs];
  expect(redPencil(paragraphs).findings).toEqual(redPencil(copy).findings);
  expect(paragraphs).toEqual(copy);
});

test('on a real chapter it marks places to look again, not every other word', () => {
  // The sample novel's chapters, as the Flutter test reads them from sampleChapters (Scriptor's sample is the same
  // text, written out from the Flutter app's sample).
  const collections = (sampleJson() as { collections: Record<string, unknown[]> }).collections;
  const chapters = collections['chapterContents'].filter(isMap);
  expect(chapters.length).toBeGreaterThan(0);
  for (const c of chapters) {
    const paragraphs = blockTexts(c['doc']);
    const words = countWords(paragraphs.join('\n'));
    const report = redPencil(paragraphs);
    expect(countOf(report, 'echo')).toBeLessThan(words * 0.12);
    for (const f of report.findings) {
      expect(f.end).toBeLessThanOrEqual(paragraphs[f.block].length);
      expect(f.start).toBeLessThan(f.end);
    }
  }
});
