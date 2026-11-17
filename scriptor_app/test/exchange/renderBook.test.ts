// A port of flutter_app/test/shared/domain/render_book_test.dart: the ebook and the web serial made from the book are
// valid files, every page is in the book's order, the author's text goes out exactly as written, and there is a clear
// reason when something cannot be done.

import { join } from 'node:path';

import { strFromU8, unzipSync } from 'fflate';

import { type JsonMap } from '../../src/domain/json';
import {
  type Book,
  type BookFormat,
  type TextPiece,
  bookSourceFromSnapshot,
  buildBook,
  pieceText,
} from '../../src/domain/reader/book';
import {
  BookOutputError,
  dartBase64Decode,
  epubFiles,
  epubIdentifier,
  renderEpub,
  renderSerialChapter,
  renderSerialZip,
  serialFileName,
  serialFiles,
  serialHeading,
} from '../../src/domain/exchange/renderBook';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';
import { firstStored, png } from './outputs';
import { findAll, innerText, parseXml, single } from './xml';

const load = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));

function book(name: string, format: BookFormat, project?: JsonMap): Book {
  const s = load(name);
  const snapshot =
    project === undefined ? s : NovelSnapshot.fromJson({ ...s.toJson(), project: { ...s.project, ...project } });
  return buildBook(bookSourceFromSnapshot(snapshot), format);
}

const modified = new Date(Date.UTC(2026, 9, 26, 12, 30, 5));
const epub = (b: Book, language = 'en') =>
  renderEpub(b, { identifier: 'urn:uuid:b0000000-0000-4000-8000-000000000000', language, modified });

/** The zip's entries, in order. */
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(bytes)));
}
const textOf = (a: Map<string, Uint8Array>, name: string) => strFromU8(a.get(name)!);
const bodyText = (xhtml: string) => innerText(single(parseXml(xhtml), 'body'));
const textPieces = (s: { pieces: readonly { type: string }[] }) => s.pieces.filter((p): p is TextPiece => p.type === 'text');
const breakCount = (s: { pieces: readonly { type: string }[] }) => s.pieces.filter((p) => p.type === 'break').length;

describe('an EPUB ebook', () => {
  test('starts with its type, stored as it is, and names its package', () => {
    const bytes = epub(book('book', 'ebook')).bytes;
    const a = unzip(bytes);
    expect([...a.keys()][0]).toBe('mimetype');
    expect(firstStored(bytes)).toBe(true);
    // The name in the first local header, right after its 30 bytes.
    expect(strFromU8(bytes.subarray(30, 38))).toBe('mimetype');
    expect(textOf(a, 'mimetype')).toBe('application/epub+zip');
    const container = parseXml(textOf(a, 'META-INF/container.xml'));
    expect(single(container, 'rootfile').attributes['full-path']).toBe('OEBPS/content.opf');
  });

  test('says what the book is, and lists every page, each one present and well-formed', () => {
    const a = unzip(epub(book('book', 'ebook'), 'en-GB').bytes);
    const opf = parseXml(textOf(a, 'OEBPS/content.opf'));
    const meta = (name: string) => innerText(single(opf, name));
    expect(meta('dc:title')).toBe('Book Layout Test');
    expect(meta('dc:creator')).toBe('Test Author');
    expect(meta('dc:language')).toBe('en-GB');
    expect(meta('dc:identifier')).toBe('urn:uuid:b0000000-0000-4000-8000-000000000000');
    expect(innerText(single(opf, 'meta'))).toBe('2026-10-26T12:30:05Z');
    for (const item of findAll(opf, 'item')) {
      const href = item.attributes['href'];
      expect([href, a.has(`OEBPS/${href}`)]).toEqual([href, true]);
      if (href.endsWith('.xhtml')) parseXml(textOf(a, `OEBPS/${href}`));
    }
    expect(findAll(opf, 'item').filter((i) => i.attributes['properties'] === 'nav')).toHaveLength(1);
  });

  test('reads in the order of the ebook: cover, title page, matter, contents, then the story, then the back', () => {
    const b = book('book', 'ebook');
    const a = unzip(epub(b).bytes);
    const opf = parseXml(textOf(a, 'OEBPS/content.opf'));
    const hrefOf = new Map(findAll(opf, 'item').map((i) => [i.attributes['id'], i.attributes['href']]));
    const titles = findAll(opf, 'itemref').map((ref) =>
      innerText(single(parseXml(textOf(a, `OEBPS/${hrefOf.get(ref.attributes['idref'])}`)), 'title')),
    );
    expect(titles).toEqual(b.sections.map((s) => (s.kind === 'contents' ? 'Contents' : s.title)));
    // The contents page jumps to every part and chapter, and the back matter.
    const nav = parseXml(textOf(a, 'OEBPS/nav.xhtml'));
    const toc = findAll(nav, 'nav').find((n) => n.attributes['epub:type'] === 'toc')!;
    expect(findAll(toc, 'a').map(innerText)).toEqual([
      'The First Book',
      'Chapter 1: Arrival',
      'Chapter 2',
      'Chapter 3',
      'Act 1',
      'Chapter 4: Embers',
      'Loose scene',
      'Chapter 5: Empty',
      'Acknowledgements',
      'About the author',
    ]);
  });

  test("carries the author's text exactly as written, with the book's own scene breaks, and no serial notes", () => {
    const b = book('book', 'ebook');
    const a = unzip(epub(b).bytes);
    const arrival = b.sections.find((s) => s.title === 'Arrival')!;
    // Pages are numbered in order; the contents page is nav.xhtml and takes no number.
    const number = b.sections.slice(0, b.sections.indexOf(arrival)).filter((s) => s.kind !== 'contents').length;
    const page = textOf(a, `OEBPS/p${String(number).padStart(3, '0')}.xhtml`);
    const text = bodyText(page);
    for (const p of textPieces(arrival)) expect(text).toContain(pieceText(p).trim());
    expect(text).toContain('The chapter’s own opening'); // curly apostrophes stay curly
    expect(text.match(/⁂/g)?.length ?? 0).toBe(breakCount(arrival));
    expect(text).not.toContain('Thanks for reading'); // serial notes are for the web, not the ebook
    expect(page).toContain('<em>early</em>');
    expect(page).toContain('<strong>listened</strong>');
  });

  test('a cover picture from the device goes in; a web address is never fetched, and says so', () => {
    const withPicture = epub(book('book', 'ebook', { cover: png }));
    const a = unzip(withPicture.bytes);
    expect(a.has('OEBPS/cover.png')).toBe(true);
    expect(withPicture.notes).toEqual([]);
    expect(textOf(a, 'OEBPS/content.opf')).toContain('properties="cover-image"');

    const web = epub(book('book', 'ebook', { cover: 'https://example.com/cover.jpg' }));
    expect(unzip(web.bytes).has('OEBPS/cover.jpg')).toBe(false);
    expect(web.notes).toHaveLength(1);
    expect(web.notes[0].text).toContain('never fetches');
  });

  test('a novel with nothing written yet is refused with what to do', () => {
    const empty = book('kinds', 'ebook');
    expect(() => epub(empty)).toThrow(BookOutputError);
    expect(() => epub(empty)).toThrow(/Write a chapter, then try again/);
  });

  test('every fixture with text makes an ebook whose every page is well-formed', () => {
    for (const name of ['qa-sample', 'made-in-the-app', 'analytics', 'canon']) {
      const a = unzip(epub(book(name, 'ebook')).bytes);
      for (const [file, content] of a) {
        if (file.endsWith('.xhtml') || file.endsWith('.opf')) {
          expect(() => parseXml(strFromU8(content))).not.toThrow();
        }
      }
    }
  });

  test('the files before zipping are the files in the zip, in the same order', () => {
    const b = book('book', 'ebook', { cover: png });
    const args = { identifier: epubIdentifier({ id: 'x' }), language: 'en', modified };
    const { entries } = epubFiles(b, args);
    const a = unzip(renderEpub(b, args).bytes);
    expect([...a.keys()]).toEqual(entries.map(([name]) => name));
    for (const [name, content] of entries) {
      expect([name, typeof content === 'string' ? textOf(a, name) : [...a.get(name)!]]).toEqual([
        name,
        typeof content === 'string' ? content : [...content],
      ]);
    }
    expect(args.identifier).toBe('urn:uuid:x');
  });
});

describe('a web serial', () => {
  test("a chapter goes out with its heading, the notes before and after, and the book's scene breaks", () => {
    const b = book('book', 'serial');
    const arrival = b.sections.find((s) => s.title === 'Arrival')!;
    const md = renderSerialChapter(b, arrival, 'markdown');
    expect(md.split('\n')[0]).toBe('# Chapter 1: Arrival');
    expect(md).toContain('> Thanks for reading!');
    expect(md).toContain('> Next week: the river.');
    expect(md.indexOf('Thanks for reading')).toBeLessThan(md.indexOf('Mira woke'));
    expect(md.indexOf('Mira woke')).toBeLessThan(md.indexOf('Next week'));
    expect(md).toContain('*early*');
    expect(md).toContain('**listened**');
    expect(md.match(/^⁂$/gm)?.length ?? 0).toBe(breakCount(arrival));

    const txt = renderSerialChapter(b, arrival, 'text');
    expect(txt.startsWith('Chapter 1: Arrival\n\nThanks for reading!\nNew chapters on Fridays.\n')).toBe(true);
    expect(txt).toContain('The chapter’s own opening, before its scenes.');

    const html = renderSerialChapter(b, arrival, 'html');
    expect(() => parseXml(html)).not.toThrow();
    expect(html).toContain('<h1>Chapter 1: Arrival</h1>');
  });

  test('a chapter titled as its number is headed once', () => {
    const b = book('book', 'serial');
    const second = b.sections.find((s) => s.number === 2)!;
    expect(renderSerialChapter(b, second, 'text').split('\n')[0]).toBe('Chapter 2');
    expect(serialHeading(second)).toBe('Chapter 2');
  });

  test('every chapter is one file in the zip, named by its place and title', () => {
    const b = book('book', 'serial');
    const names = [
      '001-arrival.md',
      '002-chapter-2.md',
      '003-chapter-3.md',
      '004-embers.md',
      '005-loose-scene.md',
      '006-empty.md',
    ];
    expect([...unzip(renderSerialZip(b, 'markdown')).keys()]).toEqual(names);
    expect(serialFiles(b, 'markdown').map(([name]) => name)).toEqual(names);
    const chapters = b.sections.filter((s) => s.kind === 'chapter');
    expect(serialFileName(chapters[0], 0, 'html')).toBe('001-arrival.html');
    expect(serialFileName(chapters[0], 0, 'text')).toBe('001-arrival.txt');
  });

  test('with nothing written, it is refused with what to do', () => {
    expect(() => renderSerialZip(book('kinds', 'serial'), 'text')).toThrow(BookOutputError);
  });
});

test('making the outputs changes nothing in the novel', () => {
  const s = load('book');
  const before = JSON.stringify(s.toJson());
  const b = buildBook(bookSourceFromSnapshot(s), 'ebook');
  epub(b);
  renderSerialZip(buildBook(bookSourceFromSnapshot(s), 'serial'), 'html');
  expect(JSON.stringify(s.toJson())).toBe(before);
});

test('a cover is read as Dart reads base64: padding required, either alphabet, no stray bits', () => {
  // Each against what Dart 3.10's base64Decode gives (null where it throws a FormatException).
  const cases: [string, number[] | null][] = [
    ['', []],
    ['YQ', null],
    ['YQ==', [97]],
    ['YQ=', null],
    ['Y', null],
    ['YQ%3D%3D', [97]],
    ['YQ%3d=', [97]],
    ['Y Q==', null],
    ['YQ==YQ==', null],
    ['-_8=', [251, 255]],
    ['+/8=', [251, 255]],
    ['YWJj', [97, 98, 99]],
    ['YWJ*', null],
    ['YWJjZA', null],
    ['YWJjZA=', null],
    ['YWJjZA==', [97, 98, 99, 100]],
    ['YR==', null],
    ['YWI=', [97, 98]],
    ['YWJ=', null],
    ['====', null],
    ['YQ=\n=', null],
    ['YQ==\n', null],
  ];
  for (const [text, bytes] of cases) {
    const got = dartBase64Decode(text);
    expect([text, got === null ? null : [...got]]).toEqual([text, bytes]);
  }
});
