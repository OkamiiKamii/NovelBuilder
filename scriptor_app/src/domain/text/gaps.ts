// GAPS: the places a writer has left to fill, so as to write past them and keep going. Two marks, both long-standing
// habits of writers rather than anything of this app's making: "TK" (printers' shorthand for "to come", chosen because
// those two letters almost never meet in a real word), and a note in double square brackets ("[[the name of the
// pass]]"). Single brackets are left alone: a LitRPG page is full of them ("[Skill acquired]").
//
// Reads only. A gap is the author's own text, found where it is written; nothing is ever added, removed or stored.
// Pure TypeScript (it also runs in the editor's WebView). A port of flutter_app/lib/shared/domain/text/gaps.dart.

import { isMap } from '../json';
import { blockTexts } from '../prose';
import { dartTrim, dartTrimLeft, dartTrimRight } from './dartString';

/** One gap in a paragraph: where it starts and ends (UTF-16 indices, end exclusive), and the note in it (empty for a
 * bare TK, or for "[[ ]]"). */
export type GapSpan = { start: number; end: number; note: string };

const gapPattern = /\[\[([^\[\]\n]*)\]\]|(?<![\p{L}\p{N}])TK(?:TK)*(?![\p{L}\p{N}])/gu;

/** The gaps in one paragraph, in order. */
export function gapsIn(text: string): GapSpan[] {
  if (!text.includes('TK') && !text.includes('[[')) return [];
  return [...text.matchAll(gapPattern)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    note: dartTrim(m[1] ?? ''),
  }));
}

/** One gap in the book: the chapter or scene, the paragraph (its index among the chapter's paragraphs), where it is
 * in that paragraph, the gap as written, the note in it, and the words either side of it (`before` and `after`), cut
 * to `gapContextChars` each. */
export type Gap = {
  nodeId: string;
  block: number;
  start: number;
  end: number;
  written: string;
  note: string;
  before: string;
  after: string;
};

/** The most of the words either side of a gap that are shown. */
export const gapContextChars = 60;

/** Every gap in `nodeIds` (in reading order), paragraph by paragraph. `pages` are each chapter's paragraphs. */
export function bookGaps(pages: ReadonlyMap<string, readonly string[]>, nodeIds: readonly string[]): Gap[] {
  const out: Gap[] = [];
  for (const id of nodeIds) {
    const blocks = pages.get(id);
    if (blocks === undefined) continue;
    blocks.forEach((text, i) => {
      for (const g of gapsIn(text)) {
        out.push({
          nodeId: id,
          block: i,
          start: g.start,
          end: g.end,
          written: text.substring(g.start, g.end),
          note: g.note,
          before: before(text, g.start),
          after: after(text, g.end),
        });
      }
    });
  }
  return out;
}

/** The words before `at`, back to the paragraph's start or about `gapContextChars`, cut at a space. */
function before(text: string, at: number): string {
  const from = at - gapContextChars;
  if (from <= 0) return dartTrimLeft(text.substring(0, at));
  const space = text.indexOf(' ', from);
  const cut = space < 0 || space >= at ? from : space + 1;
  return `…${text.substring(cut, at)}`;
}

/** The words after `at`, on to the paragraph's end or about `gapContextChars`, cut at a space. */
function after(text: string, at: number): string {
  const to = at + gapContextChars;
  if (to >= text.length) return dartTrimRight(text.substring(at));
  const space = text.lastIndexOf(' ', to);
  const cut = space <= at ? to : space;
  return `${text.substring(at, cut)}…`;
}

/** `bookGaps` over the chapters as stored (each `chapterContents` record as JSON text), as a job to run away from the
 * screen: only plain data in and out. A record that is not JSON, or not one of `nodeIds`, is passed over. */
export function gapsJob(storedContents: readonly string[], nodeIds: readonly string[]): () => Gap[] {
  return () => {
    const wanted = new Set<unknown>(nodeIds);
    const pages = new Map<string, string[]>();
    for (const json of storedContents) {
      // Most chapters hold no gap: those are passed over before they are decoded.
      if (!json.includes('TK') && !json.includes('[[')) continue;
      let row: unknown;
      try {
        row = JSON.parse(json);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
      if (!isMap(row) || !wanted.has(row['id'])) continue;
      pages.set(`${row['id']}`, blockTexts(row['doc']));
    }
    return bookGaps(pages, nodeIds);
  };
}
