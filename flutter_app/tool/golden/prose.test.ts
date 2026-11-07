// Reference outputs of the original app's text measuring and version comparison, for the Flutter rebuild.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { measure, countWords } from '@/modules/manuscript/metrics';
import { diffDocs, diffParagraphs } from '@/modules/manuscript/diff';
import { docBlocks } from '@/modules/search/extract';
import { mentionsIn } from '@/modules/manuscript/editor/references';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};

const SAMPLES = [
  'Hello world', "Don't stop—never.", 'well-known e.g. U.S.A. 3.14 1,000 _snake_case', 'Ça va? Él dijo: «sí».',
  '  spaced   out  ', '', 'Tab\tseparated\nlines', '東京は大きい。', 'Emoji 😀 ok', 'twenty-one', "rock'n'roll", 'A.B.C', 'x:y',
];

test('prose goldens', () => {
  const out: Record<string, unknown> = { words: Object.fromEntries(SAMPLES.map((s) => [s, countWords(s)])) };
  for (const [name, path] of Object.entries(FIXTURES)) {
    const c = JSON.parse(readFileSync(join(__dirname, path), 'utf8')).collections;
    const docs: Record<string, unknown> = {};
    for (const row of [...(c.chapterContents ?? []), ...(c.chapterRevisions ?? []), ...(c.chapterBranches ?? [])]) {
      if (!row.doc) continue;
      const blocks = docBlocks(row.doc);
      const m = measure(blocks.map((b) => b.text));
      docs[row.id] = { blocks, words: m.words, characters: m.characters, paragraphs: m.paragraphs, mentions: mentionsIn(row.doc) };
    }
    const diffs: unknown[] = [];
    for (const rev of c.chapterRevisions ?? []) {
      const current = (c.chapterContents ?? []).find((x: { id: string }) => x.id === rev.nodeId);
      if (current) diffs.push({ revision: rev.id, result: diffDocs(rev.doc, current.doc) });
    }
    out[name] = { docs, diffs };
  }
  out.paragraphDiffs = [
    diffParagraphs(['One two three.', 'Keep me.', 'Moved paragraph here.'], ['Moved paragraph here.', 'One two four.', 'Keep me.', 'Brand new.']),
    diffParagraphs(['Same  spacing.'], ['Same spacing.']),
    diffParagraphs([], ['Only added.']),
    diffParagraphs(['The quick brown fox jumps over the lazy dog.'], ['The quick red fox leaps over the lazy dog!']),
  ];
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'prose.golden.json'), JSON.stringify(out, null, 2));
});
