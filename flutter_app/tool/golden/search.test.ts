// Reference outputs of the original app's search across the whole novel, for the Flutter rebuild: the blocks every
// chapter and codex entry becomes, and the results of a set of queries in every scope.
// Run as the other golden scripts: GOLDEN_OUT=<dir> FIXTURES=<flutter_app/test/fixtures> npx vitest run golden/search.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { resolveCategories, unknownCategory } from '@/modules/codex/schema';
import { PLAN_TEXT_FIELDS } from '@/modules/manuscript/types';
import { entryBlocks, nodeBlocks } from '@/modules/search/extract';
import { buildIndex } from '@/modules/search/query';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES = process.env.FIXTURES!;
const NOVELS = ['qa-sample', 'made-in-the-app', 'analytics', 'canon', 'book'];
const SCOPES = ['all', 'manuscript', 'codex', 'notes'] as const;

// Words that occur in the fixtures, alone and together, plus misses, case changes and punctuation.
function queriesFor(texts: string[]): string[] {
  const words = [...new Set(texts.join(' ').split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 4))].slice(0, 40);
  const picks = words.filter((_, i) => i % 3 === 0).slice(0, 10);
  return [
    ...picks,
    ...picks.slice(0, 5).map((w, i) => `${w} ${picks[(i + 1) % picks.length]}`),
    ...picks.slice(0, 3).map((w) => w.toUpperCase()),
    'the',
    'a',
    'zzzz nothing here',
    'e',
    '  the   ',
    'kai ren',
    'chapter',
    'gate.',
  ];
}

test('search goldens', () => {
  const out: Record<string, unknown> = {};
  for (const name of NOVELS) {
    const file = JSON.parse(readFileSync(join(FIXTURES, `${name}.novel.json`), 'utf8'));
    const c = file.collections;
    const docs = new Map((c.chapterContents ?? []).map((r: { id: string; doc: unknown }) => [r.id, r.doc]));
    const plans = new Map((c.chapterPlans ?? []).map((r: { id: string }) => [r.id, r]));
    const categories = new Map(resolveCategories(c.loreSchemas ?? []).map((cat) => [cat.key, cat]));
    const names = new Map((c.loreEntries ?? []).map((e: { id: string; name: string }) => [e.id, e.name]));
    const blocks = [
      // As the original stores them: missing text fields are empty.
      ...(c.chapters ?? []).flatMap((raw: { id: string }) => nodeBlocks({ title: '', summary: '', notes: '', ...raw } as never, (docs.get(raw.id) as never) ?? null, plans.get(raw.id) ? ({ ...Object.fromEntries(PLAN_TEXT_FIELDS.map((k) => [k, ''])), beats: [], ...(plans.get(raw.id) as object) } as never) : undefined)),
      ...(c.loreEntries ?? []).flatMap((e: { category: string; tags?: string[] }) => entryBlocks({ name: '', summary: '', description: '', notes: '', tags: [], fields: [], ...e } as never, categories.get(e.category) ?? unknownCategory(e.category as never), (id) => names.get(id) as string | undefined)),
    ];
    const index = buildIndex(blocks);
    const queries = queriesFor(blocks.map((b) => b.text));
    const results: Record<string, unknown> = {};
    for (const q of queries) for (const scope of SCOPES) results[`${scope}|${q}`] = index.search(q, scope);
    out[name] = { blocks, queries, results };
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'search.golden.json'), JSON.stringify(out));
});
