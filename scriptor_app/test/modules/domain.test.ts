// The genre modules' domain, ported from the Flutter app's tests: modules_test.dart (agreement, step by step, with
// the ORIGINAL app's extension service: flutter_app/test/fixtures/golden/modules.golden.json, written by the
// TypeScript app the Flutter app replaced), module_match_test.dart and try_on_test.dart's first test.

import { join } from 'node:path';
import { toFlutterWords } from '../../src/domain/modules/scriptorWords';

import { ChangeRefused } from '../../src/domain/codex/codexChanges';
import { type JsonMap, mapOrNull, str } from '../../src/domain/json';
import { maps, strings } from '../../src/domain/records/jsonRecord';
import { type NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { textToDoc } from '../../src/domain/prose';
import { foldText } from '../../src/domain/text/fold';
import { sampleNovel } from '../../src/data/sampleNovel';
import { ModuleChanges, moduleFile, readModuleFile } from '../../src/domain/modules/moduleChanges';
import { FormatError, ModuleDefinition, bindingsOf, builtinModules, moduleFileFormat, parseDefinition } from '../../src/domain/modules/moduleDefs';
import { fittingModules, fittingModulesFromStored, moduleWords } from '../../src/domain/modules/moduleMatch';
import { tryOnModule } from '../../src/domain/modules/tryOn';
import { flutterFixturesDir, readJson, sampleJson } from '../fixtures';
import { NovelBuilder } from '../model/builder';

// ------------------------------------------------------------------------------------- modules_test.dart

class TestNovel {
  clock = 1000;
  ids = 0;
  constructor(public snapshot: NovelSnapshot) {}

  change<T>(f: (m: ModuleChanges) => T): T {
    const m = new ModuleChanges(this.snapshot, { now: ++this.clock, createId: () => `id${++this.ids}` });
    const result = f(m);
    this.snapshot = m.snapshot;
    return result;
  }

  get read(): ModuleChanges {
    return new ModuleChanges(this.snapshot, { now: this.clock, createId: () => `id${++this.ids}` });
  }
}

const compareJson = (a: unknown, b: unknown) => {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

function state(m: ModuleChanges): JsonMap {
  const categories = m.categories();
  const catName = (key: string) => categories.find((k) => k.key === key)?.name ?? '?';
  const allFields = categories.flatMap((c) => c.fields);
  const entries = m.rows('loreEntries');
  const entryName = (id: unknown) => (id === null || id === undefined ? null : str(entries.find((e) => e['id'] === id)?.['name']));
  const rows = [...m.installed()].sort((a, b) => (str(a['moduleId']) < str(b['moduleId']) ? -1 : 1));
  return {
    categories: categories.map((k) => ({
      key: k.builtin ? k.key : '',
      name: k.name,
      archived: k.archived,
      fields: k.fields.map((f) => [f.name, f.raw['type'], f.options, f.archived]),
    })),
    modules: rows.map((r) => {
      const definition = new ModuleDefinition(mapOrNull(r['definition'])!);
      const bindings = bindingsOf(r['bindings']);
      return {
        moduleId: r['moduleId'],
        enabled: r['enabled'],
        version: definition.version,
        tools: definition.tools.length,
        created: strings(r['createdCategories']).map(catName),
        system: r['systemId'] === null || r['systemId'] === undefined ? null : 'yes',
        settings: r['settings'] ?? null,
        bindings: {
          categories: Object.fromEntries([...bindings.categories].map(([k, v]) => [k, catName(v)])),
          fields: Object.fromEntries([...bindings.fields].map(([k, v]) => [k, allFields.find((f) => f.id === v)?.name ?? '?'])),
        },
      };
    }),
    status: m.status([...builtinModules]).map((s) => ({
      id: s.module.id,
      state: s.state,
      reasons: s.reasons,
      installed: s.installed,
      updatable: s.updatable,
      usage: { entries: s.entries, records: s.records },
      shares: s.shares.map((sh) => ({ moduleId: sh.moduleId, name: sh.name, enabled: sh.enabled, categories: sh.categories })),
    })),
    entries: entries.map((e) => [e['name'], catName(str(e['category']))]).sort(compareJson),
    records: m
      .rows('moduleRecords')
      .map((r) => [r['moduleId'], r['toolId'], r['kind'], r['title'], r['state'], entryName(r['rowId']), entryName(r['colId'])])
      .sort(compareJson),
    systems: m.rows('systems').map((s) => s['name']),
  };
}

function run(novel: TestNovel, step: JsonMap): void {
  const keyOf = (m: ModuleChanges, category: string) => m.categories().find((k) => k.key === category || k.name === category)!.key;
  const entryId = (m: ModuleChanges, name: string) => str(m.rows('loreEntries').find((e) => e['name'] === name)!['id']);
  novel.change((m) => {
    switch (step['op']) {
      case 'enable': {
        const custom = step['custom'];
        const definition =
          custom !== undefined && custom !== null
            ? parseDefinition(custom, { newId: () => m.newId() })
            : builtinModules.find((d) => d.id === step['module']);
        if (definition === undefined) throw new ChangeRefused('That module is not available.');
        m.enable(definition);
        break;
      }
      case 'disable':
        m.disable(str(step['module']));
        break;
      case 'starter':
        m.addStarterSystem(str(step['module']));
        break;
      case 'entry':
        m.createEntry(keyOf(m, str(step['category'])), str(step['name']));
        break;
      case 'record':
        m.addRecord(str(step['module']), str(step['tool']), { title: step['title'], state: step['state'] });
        break;
      case 'cell':
        m.setCell(str(step['module']), str(step['tool']), entryId(m, str(step['row'])), entryId(m, str(step['col'])), str(step['value']));
        break;
      case 'configure':
        m.configure(str(step['module']), () => mapOrNull(step['settings'])!);
        break;
      case 'template':
        m.addKinds(maps(step['categories']));
        break;
      case 'downgrade': {
        const row = m.rowFor(str(step['module']))!;
        const definition = mapOrNull(row['definition'])!;
        m.put('projectModules', { ...row, definition: { ...definition, version: 1, tools: maps(definition['tools']).slice(0, 2) } });
        break;
      }
      case 'dropCategory':
        for (const k of [...m.rows('loreSchemas')]) if (k['name'] === step['name']) m.remove('loreSchemas', str(k['id']));
        break;
      case 'renameCategory':
        m.saveCategory(keyOf(m, str(step['name'])), (stored) => ({
          name: step['to'],
          fields: stored!.fields.map((f) => (f.name === step['field'] ? { ...f.raw, name: step['fieldTo'], options: step['options'] } : f.raw)),
        }));
        break;
      default:
        throw new Error(`unknown step ${String(step['op'])}`);
    }
  });
}

/** As JSON carries it: no undefined. */
const plain = (v: unknown): unknown => JSON.parse(toFlutterWords(JSON.stringify(v)));

const original = readJson(join(flutterFixturesDir, 'golden', 'modules.golden.json')) as Record<string, JsonMap[]>;

describe('every step agrees with the original app', () => {
  for (const [name, results] of Object.entries(original)) {
    test(name, () => {
      const novel = new TestNovel(new NovelBuilder().build());
      results.forEach((result, i) => {
        const step = mapOrNull(result['step'])!;
        let error: string | null = null;
        try {
          run(novel, step);
        } catch (e) {
          if (!(e instanceof ChangeRefused)) throw e;
          error = e.message;
        }
        expect([`${name} step ${i} ${String(step['op'])}`, error]).toEqual([`${name} step ${i} ${String(step['op'])}`, result['error']]);
        // Quiet steps carry no state to compare: they run, and the next loud step shows what they did.
        if ('state' in result) expect([`${name} step ${i}`, plain(state(novel.read))]).toEqual([`${name} step ${i}`, result['state']]);
      });
    });
  }
});

test('a module file reads back, and never replaces a built-in module', () => {
  let ids = 0;
  const newId = () => `n${++ids}`;
  const mystery = builtinModules.find((m) => m.id === 'mystery')!;
  const file = moduleFile(mystery);
  expect(file['format']).toBe(moduleFileFormat);
  const read = readModuleFile(JSON.parse(JSON.stringify(file)), { newId });
  expect(read.id).not.toBe('mystery');
  expect(read.name).toBe(mystery.name);
  expect(read.builtin).toBe(false);
  expect(() => readModuleFile({ format: 'something-else' }, { newId })).toThrow(FormatError);
});

// --------------------------------------------------------------------------------- module_match_test.dart

test('folding leaves plain ASCII as it was (lower case), as the table never held it', () => {
  for (let c = 0; c < 0x80; c++) {
    const s = String.fromCharCode(c);
    expect([c, foldText(s)]).toEqual([c, s.toLowerCase()]);
  }
  expect(foldText('Émile café Ωmega 𝐀')).toBe('emile cafe ωmega 𝐀');
});

test('the chapters as stored are read and matched together; an unreadable record counts as an empty chapter', () => {
  const stored = [
    JSON.stringify({ id: 'c1', doc: textToDoc('Can create skills.\n\nHave ranks from E to SSS.') }),
    '{not json',
    JSON.stringify({ id: 'c2', doc: textToDoc('Evolution of ranks.') }),
  ];
  const fits = fittingModulesFromStored({ genres: [], tags: [], synopsis: '', storedContents: stored });
  expect(fits[0].moduleId).toBe('progression');
  expect(fits[0].words).toEqual(expect.arrayContaining(['ranks', 'skills']));
});

test('every module has its words, and every listed id is a module', () => {
  expect(new Set(moduleWords.keys())).toEqual(new Set(builtinModules.map((m) => m.id)));
});

test('a story of skills and ranks calls for progression; words count where they are', () => {
  const fits = fittingModules({
    genres: [],
    tags: [],
    synopsis: '',
    chapters: ['Skill Creator. Can create skills. Have ranks from E to SSS. Have 4 evolution from Ranks.'],
  });
  expect(fits[0].moduleId).toBe('progression');
  expect(fits[0].words).toEqual(expect.arrayContaining(['ranks']));
  expect(fits[0].words.filter((w) => w.startsWith('skill'))).toHaveLength(1);
});

test('a genre outweighs a stray word; modules already on, and weak matches, are left out', () => {
  const fits = fittingModules({
    genres: ['Mystery'],
    tags: [],
    synopsis: 'A detective in a haunted town.',
    chapters: ['He saw a ghost once.'],
    on: new Set(['horror']),
  });
  expect(fits.map((f) => f.moduleId)).toEqual(['mystery']);
  expect(fittingModules({ genres: [], tags: [], synopsis: '', chapters: ['They had a heart.'] })).toEqual([]);
});

test('whole words only: "class" is not found in "classic", "level" not in "levelled"', () => {
  expect(fittingModules({ genres: [], tags: [], synopsis: '', chapters: ['A classic tale.', 'The ground was levelled.'] })).toEqual([]);
});

// ------------------------------------------------------------------------------------- try_on_test.dart

test('trying a module on says what turning it on does, and changes nothing', () => {
  const snapshot = sampleNovel(sampleJson(), 0);
  const progression = builtinModules.find((m) => m.id === 'progression')!;
  const tried = tryOnModule(snapshot, progression);

  // What the press itself would do.
  let n = 0;
  const on = new ModuleChanges(snapshot, { now: 0, createId: () => `x${++n}` });
  on.enable(progression);
  const before = new Set(tried.before.map((c) => c.key));
  const made = on
    .categories()
    .filter((c) => !before.has(c.key) && !c.archived)
    .map((c) => c.name);
  expect(tried.added.map((c) => c.name)).toEqual(made);
  expect(made).toContain('Skills & Abilities');
  // The cast gains Power Rank, and the preview names who.
  const cast = tried.gains.find((g) => g.kind.key === 'character')!;
  expect(cast.fields).toContain('Power Rank');
  expect(cast.entries).toContain('Wren Hollis');
  expect(tried.tools.map((t) => t.title)).toContain('Skills by rank');
  expect(tried.offersSystem).toBe(true);

  // Trying it on stored nothing.
  expect(snapshot.rows('projectModules')).toEqual([]);
  expect(tryOnModule(snapshot, progression).added.length).toBe(tried.added.length);
});

test('a high-fantasy try-on brings more than five kinds of record (the narrow-shelf case)', () => {
  const snapshot = sampleNovel(sampleJson(), 0);
  const fantasy = builtinModules.find((m) => m.id === 'high-fantasy')!;
  expect(tryOnModule(snapshot, fantasy).added.length).toBeGreaterThan(5);
});
