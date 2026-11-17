// A port of flutter_app/test/shared/domain/book_test.dart: the book a manuscript makes, in each format, against what
// the original app's reader made from the same files (book.golden.json). `book` is test content holding every case the
// layout treats specially.

import { join } from 'node:path';

import { type JsonMap, jsonEquals } from '../../src/domain/json';
import {
  type Book,
  BookMatter,
  bookFormatLabel,
  bookFormats,
  bookSourceFromSnapshot,
  buildBook,
  castLines,
  isBreakLine,
  makeSection,
  pieceText,
  progressAt,
  readingMinutes,
} from '../../src/domain/reader/book';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'book.golden.json')) as JsonMap;
const novels = ['book', 'qa-sample', 'made-in-the-app', 'analytics', 'canon'];
const load = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));

function described(book: Book): JsonMap {
  return {
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    cover: book.cover,
    accent: book.accent,
    sceneBreak: book.sceneBreak,
    words: book.words,
    chapters: book.chapters,
    sections: book.sections.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      label: s.label,
      showsLabel: s.showsLabel,
      number: s.number,
      depth: s.depth,
      nodeId: s.nodeId,
      words: s.words,
      text: s.text,
      noteBefore: s.noteBefore,
      noteAfter: s.noteAfter,
      source: s.source,
      pieces: s.pieces.map((p) => (p.type === 'break' ? 'break' : { type: p.node['type'], text: pieceText(p) })),
    })),
    progress: book.sections.map((_, index) => [0, 0.5, 1].map((fraction) => progressAt(book, { index, fraction }))),
    minutes: readingMinutes(book.words),
  };
}

/** Golden fractions were computed in another language: agreement is to a part in a trillion, as the Dart test allows. */
function close(actual: unknown, expected: unknown, path: string): string | null {
  if (Array.isArray(actual) && Array.isArray(expected)) {
    for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
      const d = close(actual[i], expected[i], `${path}[${i}]`);
      if (d) return d;
    }
    return actual.length === expected.length ? null : `${path} has ${actual.length} items, expected ${expected.length}`;
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const a = actual as JsonMap;
    const e = expected as JsonMap;
    for (const k of new Set([...Object.keys(a), ...Object.keys(e)])) {
      if (!(k in a)) return `${path}.${k} missing`;
      if (!(k in e)) return `${path}.${k} unexpected`;
      const d = close(a[k], e[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  if (typeof actual === 'number' && typeof expected === 'number') {
    return Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)) ? null : `${path} is ${actual}, expected ${expected}`;
  }
  return actual === expected ? null : `${path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
}

for (const name of novels) {
  for (const { key, label } of bookFormats) {
    test(`${name} as a ${label.toLowerCase()} is laid out as the original laid it out`, () => {
      const book = buildBook(bookSourceFromSnapshot(load(name)), key);
      const want = (golden[name] as JsonMap)[key];
      expect(close(JSON.parse(JSON.stringify(described(book))), want, `${name}.${key}`)).toBeNull();
    });
  }
}

test('typed scene breaks are recognised as the original recognised them', () => {
  for (const [line, expected] of Object.entries(golden['breakLines'] as JsonMap)) {
    expect([line, isBreakLine(line)]).toEqual([line, expected]);
  }
});

test('the book is read from the records, never written: the source is the same after laying it out', () => {
  const snapshot = load('book');
  const before = snapshot.toJson();
  for (const { key } of bookFormats) buildBook(bookSourceFromSnapshot(snapshot), key);
  expect(jsonEquals(snapshot.toJson(), before)).toBe(true);
});

test('formats, labels and the matter read as the Flutter app reads them', () => {
  expect(bookFormatLabel('serial')).toBe('Web serial');
  expect(BookMatter.empty.sceneBreak).toBe('* * *');
  expect(BookMatter.empty.castTitle).toBe('Dramatis Personae');
  expect(new BookMatter({ castTitle: '  The Cast ', sceneBreak: '' }).castTitle).toBe('The Cast');
  expect(new BookMatter({ sceneBreak: '' }).sceneBreak).toBe('');
  expect(new BookMatter({ sceneBreak: 7 }).sceneBreak).toBe('* * *');
});

test('a label shows only when it says more than the title', () => {
  expect(makeSection({ id: 'a', kind: 'chapter', title: 'The Bell', label: 'Chapter 3' }).showsLabel).toBe(true);
  expect(makeSection({ id: 'a', kind: 'chapter', title: ' chapter 3 ', label: 'Chapter 3' }).showsLabel).toBe(false);
  expect(makeSection({ id: 'a', kind: 'chapter', title: 'Loose' }).showsLabel).toBe(false);
});

test('a cast list is read line by line: groups, names with who they are, names alone', () => {
  expect(castLines('The House:\nMira — the heir\nTomas – a clerk\n\n  Old Fen - the ferryman \nNobody\nA-B no spaces')).toEqual([
    { group: true, name: 'The House', about: '' },
    { group: false, name: 'Mira', about: 'the heir' },
    { group: false, name: 'Tomas', about: 'a clerk' },
    { group: false, name: 'Old Fen', about: 'the ferryman' },
    { group: false, name: 'Nobody', about: '' },
    { group: false, name: 'A-B no spaces', about: '' },
  ]);
});

test('reading time is at least a minute, at 250 words a minute', () => {
  expect([0, 124, 125, 374, 375, 1000].map(readingMinutes)).toEqual([1, 1, 1, 1, 2, 4]);
});
