// Reference outputs of the original app's reader (the book a manuscript makes, in each format), for the Flutter rebuild.
// Run as the other golden scripts: GOLDEN_OUT=<dir> FIXTURES=<flutter_app/test/fixtures> npx vitest run golden/book.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { normalizeInput } from '@/modules/projects/service';
import { buildBook, FORMATS, isBreakLine, progressAt, readingMinutes, showsLabel, type DocNode } from '@/modules/reader/book';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES = process.env.FIXTURES!;
const NOVELS = ['book', 'qa-sample', 'made-in-the-app', 'analytics', 'canon'];

const inline = (nodes: DocNode[] | undefined): string => (nodes ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : inline(n.content))).join('');

test('book goldens', () => {
  const out: Record<string, unknown> = {};
  for (const name of NOVELS) {
    const file = JSON.parse(readFileSync(join(FIXTURES, `${name}.novel.json`), 'utf8'));
    const c = file.collections;
    // As the database returns them: by id.
    const byId = (rows: { id: string }[] = []) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const source = {
      // As the original stores a novel: its details always filled in.
      project: { ...file.project, ...normalizeInput(file.project) },
      nodes: byId(c.chapters),
      docs: new Map(byId(c.chapterContents).map((r: { id: string; doc?: unknown }) => [r.id, r.doc])),
      matter: byId(c.bookMatter)[0] ?? null,
    };
    const formats: Record<string, unknown> = {};
    for (const format of FORMATS) {
      const book = buildBook(source as never, format);
      formats[format] = {
        title: book.title,
        subtitle: book.subtitle,
        author: book.author,
        cover: book.cover,
        accent: book.accent,
        sceneBreak: book.sceneBreak,
        words: book.words,
        chapters: book.chapters,
        sections: book.sections.map((s) => ({
          id: s.id, kind: s.kind, title: s.title, label: s.label, showsLabel: showsLabel(s), number: s.number, depth: s.depth, nodeId: s.nodeId, words: s.words,
          text: s.text, noteBefore: s.noteBefore, noteAfter: s.noteAfter, source: s.source,
          pieces: s.pieces.map((p) => (p.kind === 'break' ? 'break' : { type: p.node.type, text: inline(p.node.content) })),
        })),
        progress: book.sections.map((_, index) => [0, 0.5, 1].map((fraction) => progressAt(book, { index, fraction }))),
        minutes: readingMinutes(book.words),
      };
    }
    out[name] = formats;
  }
  out.breakLines = Object.fromEntries(['***', '* * *', '*  *  *  *', '#', '---', '-----', '~~~', '⁂', ' * * * ', '**', '- - -', '##', '—', 'text'].map((t) => [t, isBreakLine(t)]));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'book.golden.json'), JSON.stringify(out, null, 2));
});
