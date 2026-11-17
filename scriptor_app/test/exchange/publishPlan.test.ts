// What the publish dialog shows before anything is made, as flutter_app/lib/features/reader/publish_dialog.dart works
// it out; and Dart's upper case, which the plain-text export's headings use.

import { join } from 'node:path';

import { dartToUpperCase } from '../../src/domain/exchange/dartUpperCase';
import {
  epubArgsFor,
  publishBookFormat,
  publishCopiedMessage,
  publishFileName,
  publishPreview,
  publishSavedMessage,
  safeFileTitle,
  serialFormatChoice,
} from '../../src/domain/exchange/publishPlan';
import { type JsonMap } from '../../src/domain/json';
import { bookSourceFromSnapshot, buildBook } from '../../src/domain/reader/book';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

function book(name: string, kind: 'epub' | 'serialAll' | 'serialOne', project?: JsonMap) {
  const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));
  const snapshot =
    project === undefined ? s : NovelSnapshot.fromJson({ ...s.toJson(), project: { ...s.project, ...project } });
  return buildBook(bookSourceFromSnapshot(snapshot), publishBookFormat(kind));
}

test('an ebook holds every page, the contents among them, with the words of story', () => {
  const b = book('book', 'epub');
  const p = publishPreview(b, 'epub', 'html', null);
  expect(p.pages).toEqual(b.sections.map((s) => (s.kind === 'contents' ? 'Contents' : s.showsLabel ? `${s.label}: ${s.title}` : s.title)));
  expect(p.pages).toContain('Chapter 1: Arrival');
  expect(p.summary).toBe(
    `${p.pages.length} pages, 61 words of story. Your text goes out exactly as written; serial notes are left out of an ebook.`,
  );
  expect(p.empty).toBe(false);
  expect(p.coverNote).toBeNull();
  expect(publishPreview(book('book', 'epub', { cover: 'https://example.com/c.jpg' }), 'epub', 'html', null).coverNote).toBe(
    'The cover is a web address, which this app never fetches, so the ebook opens on its title page instead.',
  );
});

test('a web serial holds its chapter files, or the one chapter chosen', () => {
  const b = book('book', 'serialAll');
  const all = publishPreview(b, 'serialAll', 'markdown', null);
  expect(all.pages).toEqual([
    '001-arrival.md',
    '002-chapter-2.md',
    '003-chapter-3.md',
    '004-embers.md',
    '005-loose-scene.md',
    '006-empty.md',
  ]);
  expect(all.summary).toBe(
    '6 chapters, 61 words of story. Your text goes out exactly as written; your notes before and after each chapter are included.',
  );
  const second = b.sections.filter((s) => s.kind === 'chapter')[1];
  const one = publishPreview(b, 'serialOne', 'text', second.id);
  expect(one.pages).toEqual(['Chapter 2']);
  expect(one.summary.startsWith('1 chapter, ')).toBe(true);
  // A chapter no longer there falls back to the first.
  expect(publishPreview(b, 'serialOne', 'text', 'gone').chapter?.title).toBe('Arrival');
  expect(publishFileName(b, 'serialOne', 'text', second.id)).toBe('Book Layout Test - 002-chapter-2.txt');
  expect(publishFileName(b, 'serialAll', 'text', null)).toBe('Book Layout Test - web serial.zip');
  expect(publishCopiedMessage(second, 'markdown')).toBe('Copied "Chapter 2" as markdown. Nothing in the novel changed.');
});

test('with nothing written there is nothing to publish', () => {
  const p = publishPreview(book('kinds', 'epub'), 'epub', 'html', null);
  expect(p.empty).toBe(true);
  expect(p.summary).toBe('No chapter has text yet: there is nothing to publish. Write a chapter first.');
});

test('file names are safe, and an untitled novel is called so', () => {
  expect(safeFileTitle('  A: "B" / C?  D\tE ')).toBe('A B C DE') // a tab is a control character, taken out;
  expect(publishFileName(book('book', 'epub', { title: ' :/ ' }), 'epub', 'html', null)).toBe('Untitled novel.epub');
  expect(serialFormatChoice('markdown')).toBe('Markdown (.md)');
  expect(publishSavedMessage('Saved to Downloads', [{ text: 'A note.' }])).toBe(
    'Saved to Downloads. Nothing in the novel changed. A note.',
  );
  const now = new Date(0);
  expect(epubArgsFor({ id: 'p1' }, now)).toEqual({ identifier: 'urn:uuid:p1', language: 'en', modified: now });
});

test("upper case is the Dart VM's: ß and most letters above the first plane stay, Deseret does not", () => {
  expect(dartToUpperCase('straße ǆ ﬁ ŉ')).toBe('STRAßE Ǆ ﬁ ŉ');
  expect(dartToUpperCase('a\u{10428}b\u{1E922}\uD801x')).toBe('A\u{10400}B\u{1E922}\uD801X');
});
