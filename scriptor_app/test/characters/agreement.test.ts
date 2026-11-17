// Agreement with the original app's character code: a port of
// flutter_app/test/shared/domain/characters_agreement_test.dart. Both real fixture files go through the TypeScript
// port, and every result must equal what the original TypeScript produced for the same file (the goldens in
// flutter_app/test/fixtures/golden, which the Flutter port is held to as well).

import { join } from 'node:path';

import {
  type CellEvidence,
  type MatrixFilter,
  appearanceMatrix,
  evidenceWords,
} from '../../src/domain/characters/appearances';
import {
  CastFilters,
  type Listed,
  castSorts,
  countMentions,
  facetsOf,
  listCharacters,
  matchesQuery,
  passesFilters,
  sortCharacters,
} from '../../src/domain/characters/cast';
import { freshProfile } from '../../src/domain/characters/characterChanges';
import { CharacterProfile, CharacterSecret, awarenessKey } from '../../src/domain/characters/characterRecords';
import { currentOf, peopleOf, whoKnowsWhat } from '../../src/domain/characters/knowledge';
import { builtinTemplates, sectionsOf, suggestionsFor } from '../../src/domain/characters/templates';
import { categoriesOf } from '../../src/domain/codex/codexChanges';
import { checkValue, displayValue } from '../../src/domain/codex/fieldValues';
import { type JsonMap, str } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { docBlocks } from '../../src/domain/prose';
import { Entry, viewFields } from '../../src/domain/records/entry';
import { Link } from '../../src/domain/records/link';
import { StoryNode } from '../../src/domain/records/storyNode';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

const fixtureNames = ['qa-sample', 'made-in-the-app'];
const golden = (file: string) => readJson(join(flutterFixturesDir, 'golden', file)) as Record<string, unknown>;

/** IndexedDB hands rows back in id order; the original app's lists start from that order. */
const byId = (rows: readonly JsonMap[]) => [...rows].sort((a, b) => (str(a['id']) < str(b['id']) ? -1 : 1));
const ids = (list: readonly Listed[]) => list.map((l) => l.entry.id);
/** As JSON carries it (no undefined, a Map as an object). */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const evidence = (e: CellEvidence) => ({ kind: e.kind, nodeId: e.nodeId, ...(e.eventId !== null ? { eventId: e.eventId } : {}) });

for (const name of fixtureNames) {
  describe(`characters agree with the original app on ${name}`, () => {
    const snapshot = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));
    const model = StoryModel.fromSnapshot(snapshot);
    const g = golden(`${name}.characters.golden.json`);
    const entries = byId(snapshot.rows('loreEntries')).map((r) => new Entry(r));
    const names = new Map(entries.map((e) => [e.id, e.name]));
    const profiles = new Map(
      byId(snapshot.rows('characterProfiles')).map((p) => [str(p['entryId']), new CharacterProfile(p)]),
    );
    const list = listCharacters(
      entries,
      profiles,
      byId(snapshot.rows('loreLinks'))
        .map((r) => new Link(r))
        .filter((l) => l.isEntryLink),
      byId(snapshot.rows('chapters')).map((r) => new StoryNode(r)),
      model.order.position,
      (e) => freshProfile(e, str(e.raw['projectId']), builtinTemplates[0]),
    );

    test('the library: each character with where it is linked and what it belongs to', () => {
      expect(
        list.map((l) => ({
          id: l.entry.id,
          profileId: l.profile.id,
          linkedIn: l.linkedIn,
          first: l.first,
          latest: l.latest,
          factions: l.factions,
        })),
      ).toEqual(g['listed']);
    });

    test('every sort order', () => {
      expect(Object.fromEntries(castSorts.map((s) => [s, ids(sortCharacters(list, s))]))).toEqual(g['sorts']);
    });

    test('the filter menus', () => {
      const f = facetsOf(list);
      expect(
        plain({
          roles: f.roles,
          statuses: f.statuses,
          tags: f.tags,
          species: f.species,
          occupations: f.occupations,
          factions: f.factions,
        }),
      ).toEqual(g['facets']);
    });

    test('search finds the same characters for every query', () => {
      const queries = g['queries'] as Record<string, unknown>;
      expect(
        Object.fromEntries(
          Object.keys(queries).map((q) => [q, ids(list.filter((l) => matchesQuery(l, q, (id) => names.get(id) ?? null)))]),
        ),
      ).toEqual(queries);
    });

    test('every filter keeps the same characters', () => {
      const expected = g['filtered'] as Record<string, unknown>;
      const filterFor = (key: string): CastFilters => {
        const colon = key.indexOf(':');
        const kind = colon < 0 ? key : key.substring(0, colon);
        const value = colon < 0 ? '' : key.substring(colon + 1);
        switch (kind) {
          case 'none':
            return CastFilters.none;
          case 'archived':
            return new CastFilters({ archived: true });
          case 'role':
            return new CastFilters({ role: value.toLowerCase() });
          case 'status':
            return new CastFilters({ status: value.toUpperCase() });
          case 'tag':
            return new CastFilters({ tag: value });
          case 'species':
            return new CastFilters({ species: value });
          case 'occupation':
            return new CastFilters({ occupation: value });
          case 'faction':
            return new CastFilters({ faction: value });
          case 'firstBy':
            return new CastFilters({ firstBy: model.order.position.get(value) ?? null });
          default:
            throw new Error(`Unknown filter ${key}`);
        }
      };
      expect(
        Object.fromEntries(
          Object.keys(expected).map((key) => [key, ids(list.filter((l) => passesFilters(l, filterFor(key))))]),
        ),
      ).toEqual(expected);
    });

    test('name mentions are counted as whole words, the same', () => {
      const texts = snapshot.rows('chapterContents').flatMap((c) => docBlocks(c['doc']).map((b) => b.text));
      expect(
        Object.fromEntries(
          list.map((l) => [l.entry.id, countMentions(texts, [l.entry.name, l.profile.epithet, ...l.profile.aliases])]),
        ),
      ).toEqual(g['mentions']);
      expect({
        firstWords: countMentions(
          texts,
          list.map((l) => l.entry.name.split(' ')[0]),
        ),
        short: countMentions(texts, ['a', 'I', '']),
        punctuation: countMentions(texts, ['the.', 'Mr.']),
      }).toEqual(g['extraMentions']);
    });

    test('the appearance matrix, cell by cell, with every filter', () => {
      const chapters = model.order.chapters.map((c) => c.id);
      const places = [...model.entries.values()]
        .filter((e) => e.category === 'location')
        .map((e) => e.id)
        .sort();
      const characters = [...model.entries.values()]
        .filter((e) => e.category === 'character')
        .map((e) => e.id)
        .sort();
      const at = (i: number) => (i < chapters.length ? chapters[i] : null);
      const filters: Record<string, MatrixFilter> = {
        chapters: {},
        scenes: { grain: 'scenes' },
        everyone: { all: true },
        scenesEveryone: { grain: 'scenes', all: true },
        drafting: { grain: 'scenes', status: 'drafting', all: true },
        range: { from: at(1), to: at(2) },
        openEnd: { grain: 'scenes', from: at(1) },
        place: { grain: 'scenes', placeId: places[0] ?? null },
        text: { text: 'MI', all: true },
        one: { characterIds: characters.slice(0, 1), all: true },
      };
      const expected = g['matrices'] as Record<string, unknown>;
      for (const [key, filter] of Object.entries(filters)) {
        const m = appearanceMatrix(model, filter);
        expect([
          key,
          {
            columns: m.columns.map((c) => ({
              nodeId: c.nodeId,
              chapterId: c.chapterId,
              chapterNumber: c.chapterNumber,
              label: c.label,
              short: c.short,
              status: c.status,
            })),
            rows: m.rows.map((r) => ({
              characterId: r.characterId,
              name: r.name,
              recorded: r.recorded,
              cells: r.cells.map((cell, i) => ({
                state: cell.state,
                evidence: cell.evidence.map(evidence),
                words: evidenceWords(cell.evidence, model, m.columns[i].nodeId),
              })),
            })),
            hidden: m.hidden,
            characters: m.characters,
          },
        ]).toEqual([key, expected[key]]);
      }
    });

    test('who knows each secret, from the records alone', () => {
      expect(
        snapshot.rows('characterSecrets').map((r) => {
          const s = new CharacterSecret(r);
          return {
            id: s.id,
            people: peopleOf(s),
            groups: whoKnowsWhat(s).map((x) => ({ state: x.state === null ? null : awarenessKey(x.state), ids: x.ids })),
            current: Object.fromEntries(
              peopleOf(s).map((p) => {
                const c = currentOf(s, p);
                return [
                  p,
                  {
                    state: c.state === null ? null : awarenessKey(c.state),
                    record: c.record?.raw ?? null,
                    source: c.source,
                  },
                ];
              }),
            ),
          };
        }),
      ).toEqual(g['secrets']);
    });

    test('field values read and checked the same', () => {
      const categories = categoriesOf(snapshot);
      const all = new Map(snapshot.rows('loreEntries').map((r) => [str(r['id']), new Entry(r)]));
      const out: unknown[] = [];
      for (const entry of entries) {
        const category = categories.get(entry.category);
        if (category === undefined) continue;
        const view = viewFields(entry, category);
        for (const [def, field] of view.category) {
          const issue = checkValue(def, field?.value ?? '', all, {
            categoryName: (k) => categories.get(k)?.name ?? k,
          });
          out.push({
            entry: entry.id,
            def: def.id,
            display: field === null ? null : displayValue(def.type, field.value, (id) => names.get(id) ?? null),
            issue:
              issue === null
                ? null
                : { defId: issue.defId, field: issue.field, problem: issue.problem, message: issue.message },
          });
        }
        for (const field of view.own) {
          out.push({ entry: entry.id, field: field.id, display: displayValue(field.type, field.value, (id) => names.get(id) ?? null) });
        }
      }
      expect(out).toEqual(g['fields']);
    });
  });
}

test('templates, their sections and what each section suggests, as the original app has them', () => {
  const g = golden('templates.golden.json');
  expect(
    builtinTemplates.map((t) => ({
      id: t.id,
      projectId: null,
      name: t.name,
      description: t.description,
      sections: t.sections.map((s) => s.toJson()),
      createdAt: 0,
    })),
  ).toEqual(g['templates']);
  expect(Object.fromEntries(builtinTemplates.map((t) => [t.id, sectionsOf(t)]))).toEqual(g['sections']);
  const expected = g['suggestions'] as Record<string, unknown>;
  expect(
    Object.fromEntries(
      Object.keys(expected).map((key) => {
        const bar = key.indexOf('|');
        const have = key.substring(bar + 1);
        return [
          key,
          suggestionsFor(key.substring(0, bar), builtinTemplates, have.length === 0 ? [] : have.split(',')).map((f) =>
            f.toJson(),
          ),
        ];
      }),
    ),
  ).toEqual(expected);
});
