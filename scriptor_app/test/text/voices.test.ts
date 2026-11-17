// A port of flutter_app/test/shared/domain/voices_test.dart.

import { voicesOf } from '../../src/domain/text/voices';

const cast: Record<string, string[]> = {
  w: ['Wren Hollis', 'Wren'],
  n: ['Nan'],
};

const said = (paragraphs: string[], names: Record<string, string[]> = cast): [string, string | null][] =>
  voicesOf(paragraphs, names).lines.map((l) => [paragraphs[l.block].substring(l.start, l.end), l.speaker]);

test('a line is tied to the name beside it, after it or before it', () => {
  expect(said(['“It is going,” Wren said.'])).toEqual([['“It is going,”', 'w']]);
  expect(said(['“Go,” said Nan, and turned.'])).toEqual([['“Go,”', 'n']]);
  expect(said(['Nan whispered: “Close the drawer.”'])).toEqual([['“Close the drawer.”', 'n']]);
  expect(said(['"Straight quotes," Wren Hollis said.'])).toEqual([['"Straight quotes,"', 'w']]);
  // The comma outside the marks.
  expect(said(['“British”, said Nan.'])).toEqual([['“British”', 'n']]);
});

test('a paragraph of one named speaker is theirs throughout; two, or a pronoun, and only what is tied', () => {
  expect(said(['“Nine days,” Wren said. “Nine days of low water.”'])).toEqual([
    ['“Nine days,”', 'w'],
    ['“Nine days of low water.”', 'w'],
  ]);
  expect(said(['“Go,” Wren said. “No,” Nan said. “Then stay.”'])).toEqual([
    ['“Go,”', 'w'],
    ['“No,”', 'n'],
    ['“Then stay.”', null],
  ]);
  expect(said(['“Go,” Wren said. “No,” she said.'])).toEqual([
    ['“Go,”', 'w'],
    ['“No,”', null],
  ]);
});

test('nobody named is nobody guessed', () => {
  expect(said(['“Who is there?” she asked.'])).toEqual([['“Who is there?”', null]]);
  expect(said(['“Hello.”'])).toEqual([['“Hello.”', null]]);
  // Not in the cast.
  expect(said(['“Hello,” Orrin said.'])).toEqual([['“Hello,”', null]]);
  // No cast at all.
  expect(said(['“Hi,” Wren said.'], {})).toEqual([['“Hi,”', null]]);
  expect(said(['No dialogue here.', ''])).toEqual([]);
});

test('a name two characters share speaks for neither', () => {
  const twins = {
    a: ['Kit Marrow', 'Kit'],
    b: ['Kit'],
  };
  expect(said(['“Run,” Kit said.'], twins)).toEqual([['“Run,”', null]]);
  expect(said(['“Run,” Kit Marrow said.'], twins)).toEqual([['“Run,”', 'a']]);
});

test('the report counts words, lines and who has the floor', () => {
  const r = voicesOf(
    ['The river rose all night.', '“It is going,” Wren said. “All of it.”', '“Go,” said Nan.', '“Who?” she asked.'],
    cast,
  );
  expect(r.chapterWords).toBe(5 + 8 + 3 + 3);
  expect(r.dialogueWords).toBe(6 + 1 + 1);
  expect(r.speakers.map((s) => [s.speaker, s.words, s.lines])).toEqual([
    ['w', 6, 2],
    ['n', 1, 1],
    [null, 1, 1],
  ]);
  expect(r.of('n')).toHaveLength(1);
  expect(r.of('n')[0].block).toBe(2);
});
