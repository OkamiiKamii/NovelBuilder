// Every output of the book, the ebook, the web serial and the manuscript export for one novel, keyed as
// golden/dump.dart keys the Flutter app's own outputs (see dart.golden.json).

import { strFromU8, unzipSync } from 'fflate';

import { type JsonMap, str } from '../../src/domain/json';
import { type Book, type BookFormat, bookSourceFromSnapshot, buildBook, castLines, pieceText, progressAt, readingMinutes } from '../../src/domain/reader/book';
import { bibleExport, compiledToJson, compileNovel } from '../../src/domain/exchange/compile';
import {
  BookOutputError,
  type SerialFormat,
  blocksOf,
  epubIdentifier,
  renderEpub,
  renderSerialChapter,
  renderSerialZip,
  serialFileName,
  serialHeading,
} from '../../src/domain/exchange/renderBook';
import { renderHtml, renderMarkdown, renderText } from '../../src/domain/exchange/renderText';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';

export const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** The cover variants the golden holds, by novel. */
const coverVariants: Record<string, Record<string, string>> = {
  book: {
    '+png': png,
    '+web': 'https://example.com/cover.jpg',
    '+bad': 'data:image/png;base64,AAAA',
  },
  edge: {
    '+gif': 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    '+webp': 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
    '+riff': 'data:image/webp;base64,UklGRhoAAABBVklGVlA4TA0AAAAv',
    '+urlsafe': 'data:image/png;base64,iVBORw0KGgo-_w==',
    '+pct': 'data:image/png;base64,iVBORw0KGgoAAA%3D%3d',
    '+nob64': 'data:image/png,iVBORw0KGgo',
    '+bad64': 'data:image/png;base64,iVBORw0KGgoA',
    '+empty': '',
  },
};

export function described(book: Book): JsonMap {
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
      blocks: blocksOf(s).map((b) => b.toJson()),
    })),
    progress: book.sections.map((_, index) => [0, 0.25, 0.5, 1].map((fraction) => progressAt(book, { index, fraction }))),
    minutes: readingMinutes(book.words),
    cast: book.sections
      .filter((s) => s.kind === 'cast')
      .map((s) => castLines(s.text).map((l) => [l.group, l.name, l.about])),
  };
}

/** A zip's entries in order, as [name, text] (a cover picture as base64). */
export function zipEntries(bytes: Uint8Array): [string, string][] {
  return Object.entries(unzipSync(bytes)).map(([name, content]) => [
    name,
    name.includes('cover.') ? Buffer.from(content).toString('base64') : strFromU8(content),
  ]);
}

/** Whether the zip's first entry is stored, not compressed (its local header's compression method is 0). */
export function firstStored(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[8] === 0 && bytes[9] === 0;
}

const errorText = (e: unknown) =>
  e instanceof BookOutputError ? `BookOutputException: ${e.message}` : `ERROR ${String(e)}`;

export const epubModified = new Date(Date.UTC(2026, 9, 26, 12, 30, 5));

/** Every output for one novel, keyed as dump.dart keys them. Compiles with the history switch only when asked: their
 * dates are in local time. */
export function outputsOf(name: string, base: NovelSnapshot, withHistory = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const withProject = (p: JsonMap) => NovelSnapshot.fromJson({ ...base.toJson(), project: { ...base.project, ...p } });
  const variants: Record<string, NovelSnapshot> = { '': base };
  for (const [v, cover] of Object.entries(coverVariants[name] ?? {})) variants[v] = withProject({ cover });
  if (name === 'book') variants['+noauthor'] = withProject({ author: '  ', title: ' ', subtitle: '' });

  for (const [v, snapshot] of Object.entries(variants)) {
    const source = bookSourceFromSnapshot(snapshot);
    for (const format of ['novel', 'ebook', 'serial'] as BookFormat[]) {
      const book = buildBook(source, format);
      if (v === '') out[`${name}.book.${format}`] = described(book);
      if (format === 'ebook') {
        const languages = v === '' && name === 'book' ? ['en', 'en-GB', '  '] : [str(snapshot.project['language'], 'en')];
        for (const language of languages) {
          try {
            const r = renderEpub(book, { identifier: epubIdentifier(snapshot.project), language, modified: epubModified });
            out[`${name}${v}.epub.${language}`] = {
              files: zipEntries(r.bytes),
              notes: r.notes.map((n) => n.text),
              firstStored: firstStored(r.bytes),
            };
          } catch (e) {
            out[`${name}${v}.epub.${language}`] = errorText(e);
          }
        }
      }
      if (format === 'serial' && v === '') {
        const chapters = book.sections.filter((s) => s.kind === 'chapter');
        for (const sf of ['html', 'markdown', 'text'] as SerialFormat[]) {
          out[`${name}.serial.${sf}`] = chapters.map((s, i) => [
            serialFileName(s, i, sf),
            serialHeading(s),
            renderSerialChapter(book, s, sf),
          ]);
          try {
            out[`${name}.serialzip.${sf}`] = zipEntries(renderSerialZip(book, sf));
          } catch (e) {
            out[`${name}.serialzip.${sf}`] = errorText(e);
          }
        }
      }
    }
  }

  const scopes: (string | null)[] = [
    null,
    ...base
      .rows('chapters')
      .filter((r) => r['kind'] !== 'scene')
      .map((r) => str(r['id'])),
  ].slice(0, 6);
  for (let mask = 0; mask < 32; mask++) {
    if ((mask & 16) !== 0 && !withHistory) continue;
    for (const scope of mask === 31 || mask === 3 ? scopes : [null]) {
      const c = compileNovel(base, {
        manuscript: (mask & 1) !== 0,
        titles: (mask & 2) !== 0,
        notes: (mask & 4) !== 0,
        lore: false,
        planning: (mask & 8) !== 0,
        history: (mask & 16) !== 0,
        scopeId: scope,
      });
      out[`${name}.compile.${mask}.${scope ?? ''}`] = {
        compiled: compiledToJson(c),
        txt: renderText(c),
        md: renderMarkdown(c),
        html: renderHtml(c),
      };
    }
  }
  const firstScope = scopes[1];
  if (firstScope !== undefined && firstScope !== null) {
    out[`${name}.compile.bible.${firstScope}`] = {
      compiled: compiledToJson(compileNovel(base, { ...bibleExport, scopeId: firstScope })),
    };
  }
  return out;
}
