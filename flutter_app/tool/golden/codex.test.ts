// Writes reference outputs of the original app's codex code (presets, view settings, entry search) for the Flutter
// rebuild's agreement tests. Run from a copy of the original app: GOLDEN_OUT=<dir> npx vitest run golden/codex.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { TYPE_PRESETS } from '@/modules/codex/typePresets';
import { cleanUses, mergeUses, remapUses } from '@/modules/codex/capabilities';
import { matchesEntry } from '@/modules/codex/hooks';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};

test('codex', () => {
  const fields = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const raws: unknown[] = [
    null, {}, 'x', { timeline: { start: 'a', end: 'zz' } }, { map: { x: 'a', y: 'b' }, rank: 'c', tree: true },
    { ownership: { type: '  owns  ', field: 'b' }, graphLabel: 'a', graphLinks: ['a', 'a', 'zz', 'c'] },
    { ownership: { type: '   ' }, graphLinks: [] }, { rank: 'zz', timeline: { start: 'zz' }, tree: 'yes', extra: 1 },
    { ownership: { type: 'x'.repeat(80) } },
  ];
  const cleaned = raws.map((r) => cleanUses(r, fields) ?? null);
  const remapped = raws.map((r) => remapUses(cleanUses(r, fields), (id) => (id === 'c' ? undefined : `${id}2`)) ?? null);
  const merged = [
    mergeUses(undefined, { rank: 'a' }) ?? null,
    mergeUses({ rank: 'a' }, undefined) ?? null,
    mergeUses({ rank: 'a', tree: true }, { rank: 'b', map: { x: 'a' } }) ?? null,
  ];
  const search: Record<string, Record<string, string[]>> = {};
  for (const [name, path] of Object.entries(FIXTURES)) {
    const entries = JSON.parse(readFileSync(join(__dirname, path), 'utf8')).collections.loreEntries as any[];
    const queries = ['', 'the', 'GUILD', ' keep ', 'zzz', ...entries.slice(0, 6).map((e) => e.name.slice(0, 4))];
    search[name] = Object.fromEntries(queries.map((q) => [q, entries.filter((e) => matchesEntry(e, q)).map((e) => e.id)]));
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'codex.golden.json'), JSON.stringify({ presets: TYPE_PRESETS, cleaned, remapped, merged, search }, null, 1));
});
