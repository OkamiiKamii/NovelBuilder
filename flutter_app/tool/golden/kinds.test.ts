// Reference outputs of the original app's kinds of record in the views: what each setting reads and what is missing,
// Records by kind (table, CSV, timeline, map, ladder, holders), the record check for settings that no longer suit,
// and the built-in worldbuilding presets. On real files and a generated novel of kinds (written beside the goldens so
// the Dart tests read the very same records).
// GOLDEN_OUT=<dir> npx vitest run golden/kinds.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { fieldsFor, KIND_VIEWS, missingFor, readyViews, SLOTS, typeWords, type Slot } from '@/modules/codex/capabilities';
import { PRESETS } from '@/modules/codex/presets';
import { unsuitedKinds } from '@/modules/integrity/rules';
import { buildModel } from '@/modules/model/model';
import { kindHolders, kindMap, kindRanks, kindsOf, kindTable, kindTimeline, niceTicks, tableCsv } from '@/modules/visualize/kinds';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
  chronicle: `${OUT}/chronicle.novel.json`,
};
const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (v > 0 ? 'Infinity' : '-Infinity') : v), 1);

/** A novel of kinds: one set up for every view, one partly, one with settings gone stale, records with every sort of value. */
function kindsNovel(calendar: boolean) {
  const P = 'kinds';
  const id = (k: string, i: number) => `00000000-0000-4000-8000-${k}${String(i).padStart(11, '0')}`;
  const f = (fid: string, name: string, type: string, extra: Record<string, unknown> = {}) => ({ id: fid, name, type, options: [], ...extra });
  const artifacts = {
    id: id('s', 0), projectId: P, key: 'custom-artifacts', name: 'Artifacts', singular: 'Artifact', color: '#2b7a8c', builtin: false, order: 40, createdAt: 1, updatedAt: 1,
    fields: [f('found', 'Found', 'number'), f('lost', 'Lost', 'date'), f('east', 'East', 'number'), f('north', 'North', 'number'), f('tier', 'Tier', 'select', { options: ['Low', 'Mid', 'High'] }), f('keeper', 'Keeper', 'reference'), f('code', 'Code', 'text'), f('bonds', 'Bonds', 'references'), f('notes', 'Notes', 'longtext')],
    uses: { timeline: { start: 'found', end: 'lost' }, map: { x: 'east', y: 'north' }, rank: 'tier', ownership: { type: 'owns', field: 'keeper' }, graphLabel: 'code', graphLinks: ['bonds'] },
  };
  const relics = {
    id: id('s', 1), projectId: P, key: 'custom-relics', name: 'Relics', singular: 'Relic', color: '#a8436b', builtin: false, order: 41, createdAt: 1, updatedAt: 1,
    fields: [f('age', 'Age', 'number'), f('seen', 'Seen', 'date'), f('power', 'Power', 'number'), f('grade', 'Grade', 'select', { options: ['Only'] }), f('gone', 'Gone', 'number', { archived: true }), f('owner', 'Owner', 'text'), f('links', 'Links', 'references')],
    uses: { timeline: { start: 'age' }, map: { x: 'power', y: 'power' }, rank: 'grade', ownership: { field: 'owner' }, graphLabel: 'gone', graphLinks: ['links', 'owner'] },
  };
  const tomes = {
    id: id('s', 2), projectId: P, key: 'custom-tomes', name: 'Tomes', singular: 'Tome', color: '#6b7a2b', builtin: false, order: 42, createdAt: 1, updatedAt: 1,
    fields: [f('pages', 'Pages', 'number'), f('written', 'Written', 'date')],
    uses: { rank: 'pages', timeline: { start: 'written', end: 'pages' } },
  };
  const empty = { id: id('s', 3), projectId: P, key: 'custom-empty', name: 'Empties', singular: 'Empty', color: '#4f5fa3', builtin: false, order: 43, createdAt: 1, updatedAt: 1, fields: [f('t', 'Title', 'text')] };
  const entry = (k: string, i: number, category: string, name: string, values: Record<string, string> = {}) => ({
    id: id(k, i), projectId: P, category, name, summary: '', description: '', tags: [], createdAt: 10 + i,
    fields: Object.entries(values).map(([defId, value], j) => ({ id: `${k}${i}-${j}`, key: defId, value, defId })),
  });
  const mira = entry('p', 0, 'character', 'Mira');
  const orrin = entry('p', 1, 'character', 'Orrin');
  const keep = entry('l', 0, 'location', 'The Keep');
  const crown = entry('a', 0, 'custom-artifacts', 'Ember Crown', { found: '1020', lost: '1024-05-01', east: '3', north: '4', tier: 'High', keeper: mira.id, code: 'EC-1', bonds: id('a', 1), notes: 'Heavy,\n"old"' });
  const blade = entry('a', 1, 'custom-artifacts', 'Ash Blade', { found: '1022', lost: '1010-01-01', east: 'far', north: '1', tier: 'Low', keeper: orrin.id });
  const cup = entry('a', 2, 'custom-artifacts', 'Dull Cup, "chipped"', { found: 'long ago', tier: 'Rusty', keeper: 'nobody' });
  const ring = entry('a', 3, 'custom-artifacts', 'Ring', { found: ' -50 ', lost: '0003-13-40', east: '-2.5', north: '1e2', tier: 'Mid' });
  const orb = entry('a', 4, 'custom-artifacts', 'Orb', { found: '1021', lost: '1021-12-31', east: '0', north: ' 0 ', tier: 'High', keeper: keep.id });
  const shard = entry('a', 5, 'custom-artifacts', 'Shard', { found: '1020-02-30', east: '7', north: 'x' });
  const stone = entry('r', 0, 'custom-relics', 'Stone', { age: '12', grade: 'Only', power: '3' });
  const tome = entry('t', 0, 'custom-tomes', 'Grimoire', { pages: '300', written: '1019-07-04' });
  const tome2 = entry('t', 1, 'custom-tomes', 'Primer', { pages: '300', written: '' });
  const tome3 = entry('t', 2, 'custom-tomes', 'Atlas', { pages: '1.5e2' });
  const link = (i: number, from: string, to: string, type: string, validity?: unknown) => ({ id: id('k', i), projectId: P, fromId: from, toId: to, fromType: 'entry', toType: 'entry', type, fromLabel: '', toLabel: '', createdAt: i, ...(validity ? { validity } : {}) });
  const year = (y: number) => ({ kind: 'date', when: { precision: 'exact', year: y, month: null, day: null, hour: null, minute: null } });
  const chapter = { id: id('c', 0), projectId: P, parentId: null, kind: 'chapter', title: 'The Gate', order: 0, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: 1 };
  const event = { id: id('e', 0), projectId: P, name: 'The siege', description: '', when: { precision: 'exact', year: 1022, month: null, day: null, hour: null, minute: null }, end: null, ongoing: false, nodeIds: [], characters: [], entryIds: [], threadIds: [], labels: [], locationId: null, createdAt: 1 };
  const links = [
    link(0, mira.id, crown.id, 'owns', { from: null, until: year(1023) }),
    link(1, orrin.id, crown.id, 'owns', { from: year(1023), until: null }),
    link(2, keep.id, orb.id, 'owns', { from: { kind: 'node', nodeId: chapter.id }, until: { kind: 'event', eventId: event.id } }),
    link(3, mira.id, orb.id, 'owns', { from: { kind: 'event', eventId: event.id }, until: null }),
    link(4, orrin.id, ring.id, 'owns'),
    link(5, mira.id, ring.id, 'owns'),
    link(6, mira.id, blade.id, 'created-by'),
    link(7, 'gone', cup.id, 'owns'),
  ];
  const calendars = calendar
    ? [{ id: id('y', 0), projectId: P, kind: 'custom', name: 'Ten Moons', months: Array.from({ length: 10 }, (_, i) => ({ name: `Moon ${i + 1}`, days: 20 })), hoursPerDay: 20, daysPerWeek: 5, eras: [], seasons: { spring: 1, summer: 3, autumn: 6, winter: 9 }, updatedAt: 1 }]
    : [];
  return {
    format: 'novel-builder/project',
    version: 4,
    exportedAt: 0,
    project: { id: P, title: calendar ? 'Kinds and a calendar' : 'Kinds', subtitle: '', author: '', primaryGenre: '', secondaryGenres: [], cover: null, tags: [], synopsis: '', status: 'planning', targetWordCount: null, deadline: null, language: 'en', accent: '#b4532a', pinned: false, archived: false, createdAt: 1, updatedAt: 1, lastOpenedAt: null },
    collections: {
      chapters: [chapter],
      loreSchemas: [artifacts, relics, tomes, empty],
      loreEntries: [mira, orrin, keep, crown, blade, cup, ring, orb, shard, stone, tome, tome2, tome3],
      loreLinks: links,
      timelineEvents: [event],
      storyCalendars: calendars,
    },
  };
}

const report = (c: Record<string, any[]>, project: unknown) => {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const entryOut = (e: { id: string; name: string }) => ({ id: e.id, name: e.name });
  const unplaced = (u: { entry: { id: string; name: string }; reason: string }[]) => u.map((x) => ({ ...entryOut(x.entry), reason: x.reason }));
  const kinds = kindsOf(model);
  return {
    kinds: kinds.map((k) => ({ key: k.category.key, count: k.count })),
    categories: Object.fromEntries(
      [...model.categories.values()].map((cat) => [
        cat.key,
        {
          missing: Object.fromEntries([...KIND_VIEWS, 'graphLabel', 'graphLinks'].map((v) => [v, missingFor(cat, v as any)])),
          ready: readyViews(cat),
          fieldsFor: Object.fromEntries((Object.keys(SLOTS) as Slot[]).map((s) => [s, fieldsFor(cat, s).map((d) => d.id)])),
        },
      ]),
    ),
    views: Object.fromEntries(
      kinds.map(({ category }) => {
        const key = category.key;
        const table = kindTable(model, key);
        const timeline = kindTimeline(model, key);
        const map = kindMap(model, key);
        const ranks = kindRanks(model, key);
        const held = kindHolders(model, key);
        return [
          key,
          {
            table: { columns: table.columns.map((d) => d.id), rows: table.rows.map((r) => ({ ...entryOut(r.entry), cells: r.cells })) },
            csv: tableCsv(table),
            timeline: { placed: timeline.placed.map((t) => ({ ...entryOut(t.entry), start: t.start, end: t.end, span: t.span, label: t.label, note: t.note })), unplaced: unplaced(timeline.unplaced), missing: timeline.missing },
            map: { points: map.points.map((p) => ({ ...entryOut(p.entry), x: p.x, y: p.y })), unplaced: unplaced(map.unplaced), axes: map.axes, missing: map.missing },
            ranks: { levels: ranks.levels.map((l) => ({ label: l.label, entries: l.entries.map((e) => e.id) })), unplaced: unplaced(ranks.unplaced), field: ranks.field, missing: ranks.missing },
            holders: {
              records: held.records.map((r) => ({ ...entryOut(r.entry), history: r.history.map((h) => ({ connection: h.connection.id, holder: h.holder.id, holderName: h.holderName, when: h.when })), current: r.current, note: r.note })),
              typeLabel: held.typeLabel,
              field: held.field,
              missing: held.missing,
            },
          },
        ];
      }),
    ),
    unsuited: unsuitedKinds(model).map((u) => ({ key: u.key, category: u.category.key, problems: u.problems })),
  };
};

test('kinds', () => {
  const out: Record<string, unknown> = {};
  for (const [name, calendar] of [['kinds', false], ['kinds-calendar', true]] as const) writeFileSync(join(OUT, `${name}.novel.json`), JSON.stringify(kindsNovel(calendar), null, 1));
  const files = { ...FIXTURES, kinds: `${OUT}/kinds.novel.json`, 'kinds-calendar': `${OUT}/kinds-calendar.novel.json` };
  for (const [name, path] of Object.entries(files)) {
    const file = JSON.parse(readFileSync(path.startsWith('/') ? path : join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
  }
  out.typeWords = Object.fromEntries((Object.keys(SLOTS) as Slot[]).map((s) => [s, typeWords(s)]));
  out.niceTicks = [niceTicks(0, 10), niceTicks(-3, 4, 4), niceTicks(0.1, 0.35), niceTicks(5, 5), niceTicks(-1000, 2500), niceTicks(1e-3, 9e-3), niceTicks(0, 1, 3)];
  out.presets = PRESETS;
  writeFileSync(join(OUT, 'kinds.golden.json'), json(out));
});
