// A port of the manuscript-export part of flutter_app/test/shared/domain/exchange_agreement_test.dart, against the
// same golden file (made by the original app): the compiled document, plain text, Markdown and the web page. Not
// ported here: the Word file (render_docx), import (import_parse, import_structure) and a view's records
// (records_export), and the `bible` variant, whose worldbuilding appendix compile.ts leaves out.

import { join } from 'node:path';

import { type JsonMap, isMap } from '../../src/domain/json';
import {
  type ExportOptions,
  CompileNotPortedError,
  bibleExport,
  compiledToJson,
  compileNovel,
  readerExport,
} from '../../src/domain/exchange/compile';
import { renderHtml, renderMarkdown, renderText } from '../../src/domain/exchange/renderText';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'exchange.golden.json')) as JsonMap;
const load = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe('manuscript export agrees with the original app', () => {
  for (const name of ['qa-sample', 'made-in-the-app', 'saga']) {
    const snapshot = load(name);
    const expected = golden[name] as JsonMap;
    const variants: Record<string, ExportOptions> = {
      reader: readerExport,
      planningOnly: { manuscript: false, titles: false, notes: true, lore: false, planning: true, history: false },
      textOnly: { manuscript: true, titles: false, notes: false, lore: false, planning: false, history: false },
      scoped: { ...bibleExport, scopeId: expected['scopeId'] as string },
    };
    for (const [key, options] of Object.entries(variants)) {
      test(`${name}, ${key}`, () => {
        const want = expected[key] as JsonMap;
        const compiled = compileNovel(snapshot, options);
        expect(plain(compiledToJson(compiled))).toEqual(want['compiled']);
        expect(renderText(compiled)).toBe(want['txt']);
        expect(renderMarkdown(compiled)).toBe(want['md']);
        expect(renderHtml(compiled)).toBe(want['html']);
      });
    }
    test(`${name}, bible: the worldbuilding appendix is not ported, and says so`, () => {
      expect(() => compileNovel(snapshot, bibleExport)).toThrow(CompileNotPortedError);
    });
  }
});

test('every fixture novel compiles in every switch combination, or says the codex is not ported', () => {
  for (const name of ['qa-sample', 'made-in-the-app']) {
    const snapshot = load(name);
    const hasEntries = snapshot.rows('loreEntries').length > 0;
    for (let mask = 0; mask < 64; mask++) {
      const options: ExportOptions = {
        manuscript: (mask & 1) !== 0,
        titles: (mask & 2) !== 0,
        notes: (mask & 4) !== 0,
        lore: (mask & 8) !== 0,
        planning: (mask & 16) !== 0,
        history: (mask & 32) !== 0,
      };
      if (options.lore && hasEntries) {
        expect(() => compileNovel(snapshot, options)).toThrow(CompileNotPortedError);
      } else {
        expect(() => compileNovel(snapshot, options)).not.toThrow();
      }
    }
  }
});

/** "Nov 14, 2023, 10:13 PM" in this machine's time zone, as the export writes a saved version's time. */
function localStamp(millis: number): string {
  const d = new Date(millis);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const h = d.getHours();
  const minutes = d.getMinutes() < 10 ? `0${d.getMinutes()}` : `${d.getMinutes()}`;
  return `${month} ${d.getDate()}, ${d.getFullYear()}, ${h % 12 === 0 ? 12 : h % 12}:${minutes} ${h < 12 ? 'AM' : 'PM'}`;
}

test('the revision history lists versions newest first, ties as stored, then each alternate draft', () => {
  const snapshot = NovelSnapshot.fromJson(readJson(join(__dirname, 'edge.novel.json')));
  const compiled = compileNovel(snapshot, {
    manuscript: false,
    titles: false,
    notes: false,
    lore: false,
    planning: false,
    history: true,
  });
  const blocks = (compiledToJson(compiled)['blocks'] as unknown[]).filter(isMap);
  expect(plain(blocks)).toEqual([
    { type: 'heading', role: 'section', level: 2, text: 'Revision history', pageBreak: true },
    { type: 'heading', role: 'entry', level: 3, text: 'Chapter: Chapter 1' },
    {
      type: 'list',
      ordered: false,
      items: [
        `Automatic version — ${localStamp(1700000000000)} — 1,234,567 words — Main draft`,
        `Tie — ${localStamp(1700000000000)} — 12 words — Alt`,
      ],
    },
    { type: 'heading', role: 'minor', level: 4, text: 'Alternate draft: Alt' },
    { type: 'heading', role: 'minor', level: 5, text: 'Alt heading' },
    { type: 'paragraph', runs: [{ text: 'Alt text', italic: true }] },
    { type: 'heading', role: 'entry', level: 3, text: 'Chapter: Orphan' },
    { type: 'list', ordered: false, items: [`Orphan — ${localStamp(1710000000000)} — 5 words — Main draft`] },
    { type: 'heading', role: 'entry', level: 3, text: 'Scene: Opening' },
    { type: 'list', ordered: false, items: [`Older — ${localStamp(1690000000000)} — 0 words — Main draft`] },
  ]);
  expect(compiled.chapterCount).toBe(10);
  // In UTC, the first is "Nov 14, 2023, 10:13 PM".
  if (new Date(0).getTimezoneOffset() === 0) expect(localStamp(1700000000000)).toBe('Nov 14, 2023, 10:13 PM');
  expect(renderText(compiled).startsWith('REVISION HISTORY\n----------------\n\n\nChapter: Chapter 1\n\n- Automatic')).toBe(
    true,
  );
});
