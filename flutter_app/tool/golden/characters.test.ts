// Writes reference outputs of the original app's character code (library, appearances, templates, secrets, field
// display and checks) for the Flutter rebuild's agreement tests. Run from a copy of the original app:
//   GOLDEN_OUT=<dir> npx vitest run golden/characters.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { buildModel } from '@/modules/model/model';
import { NO_FILTERS, SORTS, countMentions, facets, listCharacters, matches, passes, sortCharacters, type Filters } from '@/modules/characters/library';
import { appearanceMatrix, evidenceWords, type MatrixFilter } from '@/modules/characters/appearances';
import { BUILTIN_TEMPLATES, sectionsOf, suggestionsFor } from '@/modules/characters/templates';
import { currentOf, peopleOf, whoKnowsWhat } from '@/modules/characters/knowledge';
import { displayValue, resolveCategories, viewFields } from '@/modules/codex/schema';
import { checkValue } from '@/modules/codex/validation';
import { isEntryLink } from '@/modules/codex/types';
import { docBlocks } from '@/modules/search/extract';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};
// IndexedDB hands rows back in id order; the original app's lists start from that order.
const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

for (const [name, path] of Object.entries(FIXTURES)) {
  test(name, () => {
    const file = JSON.parse(readFileSync(join(__dirname, path), 'utf8'));
    const c = file.collections;
    const rows = (k: string) => (c[k] ?? []) as any[];
    const model = buildModel({
      project: file.project,
      nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'),
      relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'),
      timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys'),
    });
    const entries = byId(rows('loreEntries'));
    const names = new Map(entries.map((e) => [e.id, e.name]));
    const nameOf = (id: string) => names.get(id);
    const profiles = new Map(byId(rows('characterProfiles')).map((p) => [p.entryId, p]));
    const fresh = (entry: any) => ({ id: `profile-${entry.id}`, projectId: entry.projectId, entryId: entry.id, epithet: '', aliases: [], roles: [], status: '', archived: false, focal: { x: 50, y: 30 }, order: entry.createdAt, sections: sectionsOf(BUILTIN_TEMPLATES[0]), linkStatus: {}, createdAt: entry.createdAt, updatedAt: entry.createdAt });
    const list = listCharacters(entries, profiles, byId(rows('loreLinks')).filter(isEntryLink), byId(rows('chapters')), model.order.position, fresh);
    const ids = (l: typeof list) => l.map((x) => x.entry.id);

    const listed = list.map((l) => ({ id: l.entry.id, profileId: l.profile.id, linkedIn: l.linkedIn, first: l.first, latest: l.latest, factions: l.factions }));
    const sorts = Object.fromEntries(SORTS.map((s) => [s, ids(sortCharacters(list, s))]));
    const f = facets(list);

    // Queries made from the data itself, plus words that should find nothing.
    const words = new Set<string>(['', 'the', 'zzz', 'MIRA', 'mira kai', 'émile', 'alive', 'protagonist']);
    for (const l of list) {
      words.add(l.entry.name.split(' ')[0]);
      if (l.profile.epithet) words.add(l.profile.epithet);
      for (const t of l.entry.tags) words.add(t);
      for (const field of l.entry.fields) if (field.value && field.value.length < 30) words.add(field.value);
    }
    for (const fac of f.factions) words.add(fac.toLowerCase());
    const queries = Object.fromEntries([...words].map((q) => [q, ids(list.filter((l) => matches(l, q, nameOf)))]));

    const filterSets: Record<string, Partial<Filters>> = { none: {}, archived: { archived: true } };
    for (const r of f.roles) filterSets[`role:${r}`] = { role: r.toLowerCase() };
    for (const s of f.statuses) filterSets[`status:${s}`] = { status: s.toUpperCase() };
    for (const t of f.tags) filterSets[`tag:${t}`] = { tag: t };
    for (const s of f.species) filterSets[`species:${s}`] = { species: s };
    for (const o of f.occupations) filterSets[`occupation:${o}`] = { occupation: o };
    for (const x of f.factions) filterSets[`faction:${x}`] = { faction: x };
    for (const ch of model.order.chapters.slice(0, 4)) filterSets[`firstBy:${ch.id}`] = { firstBy: model.order.position.get(ch.id)! };
    const filtered = Object.fromEntries(Object.entries(filterSets).map(([k, v]) => [k, ids(list.filter((l) => passes(l, { ...NO_FILTERS, ...v })))]));

    const texts = rows('chapterContents').flatMap((content) => docBlocks(content.doc).map((b) => b.text));
    const mentions = Object.fromEntries(list.map((l) => [l.entry.id, countMentions(texts, [l.entry.name, l.profile.epithet, ...l.profile.aliases])]));
    const extraMentions = {
      firstWords: countMentions(texts, list.map((l) => l.entry.name.split(' ')[0])),
      short: countMentions(texts, ['a', 'I', '']),
      punctuation: countMentions(texts, ['the.', 'Mr.']),
    };

    const places = [...model.entries.values()].filter((e) => e.category === 'location').map((e) => e.id).sort();
    const chapters = model.order.chapters.map((n) => n.id);
    const firstCharacter = [...model.entries.values()].filter((e) => e.category === 'character').map((e) => e.id).sort()[0];
    const matrixFilters: Record<string, MatrixFilter> = {
      chapters: { grain: 'chapters' },
      scenes: { grain: 'scenes' },
      everyone: { grain: 'chapters', all: true },
      scenesEveryone: { grain: 'scenes', all: true },
      drafting: { grain: 'scenes', status: 'drafting', all: true },
      range: { grain: 'chapters', from: chapters[1] ?? null, to: chapters[2] ?? null },
      openEnd: { grain: 'scenes', from: chapters[1] ?? null },
      place: { grain: 'scenes', placeId: places[0] ?? null },
      text: { grain: 'chapters', text: 'MI', all: true },
      one: { grain: 'chapters', characterIds: firstCharacter ? [firstCharacter] : [], all: true },
    };
    const matrices = Object.fromEntries(Object.entries(matrixFilters).map(([k, filter]) => {
      const m = appearanceMatrix(model, filter);
      return [k, {
        columns: m.columns,
        rows: m.rows.map((r) => ({ characterId: r.characterId, name: r.name, recorded: r.recorded, cells: r.cells.map((cell, i) => ({ state: cell.state, evidence: cell.evidence, words: evidenceWords(cell.evidence, model, m.columns[i].nodeId) })) })),
        hidden: m.hidden,
        characters: m.characters,
      }];
    }));

    const secrets = rows('characterSecrets').map((s) => ({
      id: s.id,
      people: peopleOf(s),
      groups: whoKnowsWhat(s),
      current: Object.fromEntries(peopleOf(s).map((p) => [p, currentOf(s, p)])),
    }));

    const categories = new Map(resolveCategories(rows('loreSchemas')).map((k) => [k.key, k]));
    const fields: unknown[] = [];
    for (const entry of entries) {
      const category = categories.get(entry.category);
      if (!category) continue;
      const view = viewFields(entry, category);
      for (const { def, field } of view.category) {
        fields.push({ entry: entry.id, def: def.id, display: field ? displayValue({ type: def.type, value: field.value }, nameOf) : null, issue: checkValue(def, field?.value ?? '', new Map(entries.map((e) => [e.id, e])), (k) => categories.get(k)?.name ?? k) });
      }
      for (const field of view.own) fields.push({ entry: entry.id, field: field.id, display: displayValue(field, nameOf) });
    }

    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${name}.characters.golden.json`), JSON.stringify({ listed, sorts, facets: f, queries, filtered, mentions, extraMentions, matrices, secrets, fields }, null, 1));
  });
}

test('templates', () => {
  const sections = Object.fromEntries(BUILTIN_TEMPLATES.map((t) => [t.id, sectionsOf(t)]));
  const names = [...new Set(BUILTIN_TEMPLATES.flatMap((t) => t.sections.map((s) => s.name))), ' the case ', 'A section of my own'];
  const suggestions = Object.fromEntries(names.flatMap((n) => [[`${n}|`, suggestionsFor(n, BUILTIN_TEMPLATES, [])], [`${n}|Age,motive, Core Traits `, suggestionsFor(n, BUILTIN_TEMPLATES, ['Age', 'motive', ' Core Traits '])]]));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'templates.golden.json'), JSON.stringify({ templates: BUILTIN_TEMPLATES, sections, suggestions }, null, 1));
});
