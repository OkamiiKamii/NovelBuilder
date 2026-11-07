// Reference outputs of the original app's record check for the Flutter rebuild's agreement tests.
// GOLDEN_OUT=<dir> npx vitest run golden/integrity.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { buildModel } from '@/modules/model/model';
import { brokenReferences, duplicateCandidates, normalizeName, statusOf, unfitEntries, unresolvedFields, withoutReference } from '@/modules/integrity/rules';
import { deriveConnections } from '@/modules/model/connections';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};

/** The file with the first character and the first chapter removed, nothing else touched: references left broken. */
const damaged = (c: Record<string, any[]>) => {
  const character = (c.loreEntries ?? []).find((e) => e.category === 'character')?.id;
  const chapter = (c.chapters ?? []).find((n) => n.kind === 'chapter')?.id;
  return { ...c, loreEntries: (c.loreEntries ?? []).filter((e) => e.id !== character), chapters: (c.chapters ?? []).filter((n) => n.id !== chapter) };
};

const report = (c: Record<string, any[]>, project: unknown) => {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({
    project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'),
    relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'),
    timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys'),
  } as any);
  const aliases = new Map(rows('characterProfiles').map((p) => [p.entryId, p.aliases ?? []]));
  return {
    broken: brokenReferences(model, rows('structureMarkers')),
    unresolved: unresolvedFields(model).map((u) => ({ key: u.key, entry: u.entry.id, fieldId: u.fieldId, fieldName: u.fieldName, value: u.value, suggestions: u.suggestions.map((s) => s.id) })),
    duplicates: duplicateCandidates([...model.entries.values()], aliases).map((d) => ({ key: d.key, a: d.a.id, b: d.b.id, rule: d.rule, because: d.because })),
    unfit: unfitEntries(model).map((u) => ({ key: u.key, entry: u.entry.id, issues: u.issues })),
    statuses: deriveConnections(model).connections.map((c) => statusOf(c)),
  };
};

test('integrity', () => {
  const out: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(FIXTURES)) {
    const file = JSON.parse(readFileSync(join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
    out[`${name}-damaged`] = report(damaged(file.collections), file.project);
  }
  out.names = Object.fromEntries(['The Ember Blade', 'ember-blade', '  Émile  Zola! ', 'A Tale', 'an', 'The', 'Ørn the Great', 'İstanbul', '42 Things'].map((n) => [n, normalizeName(n)]));
  out.without = [
    withoutReference({ id: 'x', nodeIds: ['a', 'b'], characters: [{ id: 'b', age: 3 }, { id: 'c' }], locationId: 'b', value: 'a\nb\nc' }, 'b'),
    withoutReference({ fields: [{ id: 'f', key: 'Leader', value: 'b' }], beats: [{ id: 'bt', nodeId: 'b', note: 'keep' }] }, 'b'),
    withoutReference(['b', { id: 'b' }, 'c'], 'b'),
  ];
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'integrity.golden.json'), JSON.stringify(out, null, 1));
});
