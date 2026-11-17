// The logic of the genre modules' screen tests (flutter_app/test/features/modules/{modules_screen,genre_shelf,try_on}
// _test.dart and modules_for_story_test.dart): the Module Manager over the novel the original app left with all ten
// modules on, a module's tools working on the novel's own records, Configure, a module of the author's own made,
// exported and imported, the genre shelf, Made for your story and Try it on. What those check of the widgets
// themselves (taps reaching the right widget, scrolling, text at twice the size, tap-target and contrast guidelines)
// belongs to the screens and is not here; the presses are run as the changes they make.

import { join } from 'node:path';

import { type JsonMap, mapOrNull, str } from '../../src/domain/json';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { sampleNovel } from '../../src/data/sampleNovel';
import { ModuleChanges, moduleFile, readModuleFile } from '../../src/domain/modules/moduleChanges';
import { FormatError, ModuleDefinition, builtinModules } from '../../src/domain/modules/moduleDefs';
import { ModuleLibrary } from '../../src/domain/modules/moduleLibrary';
import { fittingModules } from '../../src/domain/modules/moduleMatch';
import { tryOnModule } from '../../src/domain/modules/tryOn';
import {
  exportFileName,
  fitsShown,
  forYourStory,
  managerView,
  moduleCard,
  notAModuleMessage,
  suggestionKey,
  toggledMessage,
} from '../../src/domain/modules/screens/manager';
import { moduleTone, shelfLayout, shelfTile, tryOnShelf, tryOnView } from '../../src/domain/modules/screens/shelf';
import { configureChanges, configureView, dashboard, workspace } from '../../src/domain/modules/screens/workspace';
import { arcChart, logChanges, logTool, matrixTool, newEntryChange, registryTool } from '../../src/domain/modules/screens/tools';
import { flutterFixturesDir, readJson, sampleJson } from '../fixtures';
import { NovelBuilder } from '../model/builder';

const novelId = '70465ae9-f720-4346-8683-298ce006ed1a';

/** A novel being changed by presses: each press one change on it, as ModuleService.change makes them. */
class Novel {
  ids = 0;
  clock = 1_000_000;
  constructor(public snapshot: NovelSnapshot) {}
  change<T>(f: (m: ModuleChanges) => T): T {
    const m = new ModuleChanges(this.snapshot, { now: ++this.clock, createId: () => `t${++this.ids}` });
    const out = f(m);
    this.snapshot = m.snapshot;
    return out;
  }
  row(moduleId: string): JsonMap {
    return this.snapshot.rows('projectModules').find((r) => r['moduleId'] === moduleId)!;
  }
  records(moduleId: string): JsonMap[] {
    return this.snapshot.rows('moduleRecords').filter((r) => r['moduleId'] === moduleId);
  }
  kind(name: string): JsonMap {
    return this.snapshot.rows('loreSchemas').find((k) => k['name'] === name)!;
  }
}

const madeInTheApp = () => new Novel(NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, 'made-in-the-app.novel.json'))));
const enable = (n: Novel, id: string) => n.change((m) => m.enable(builtinModules.find((d) => d.id === id)!));

/** The settings of the device, kept in a map. */
const memorySettings = () => {
  const kept = new Map<string, unknown>();
  return { read: (k: string) => kept.get(k), write: (k: string, v: unknown) => void kept.set(k, JSON.parse(JSON.stringify(v))) };
};

test('the novel’s modules as the original app left them: off keeps everything, on again brings it all back', () => {
  const n = madeInTheApp();
  expect(managerView(n.snapshot, builtinModules).subtitle).toBe('10 modules on in this novel');
  const entries = n.snapshot.rows('loreEntries').length;
  const records = n.snapshot.rows('moduleRecords').length;
  const mystery = builtinModules.find((m) => m.id === 'mystery')!;
  const before = managerView(n.snapshot, builtinModules).status.get('mystery')!;
  expect(moduleCard(mystery, before, { owned: false, writes: true }).buttons.map((b) => b.label)).toContain('Disable');
  n.change((m) => m.disable('mystery'));
  expect(n.row('mystery')['enabled']).toBe(false);
  const after = managerView(n.snapshot, builtinModules);
  expect(moduleCard(mystery, after.status.get('mystery')!, { owned: false, writes: true }).stateLabel).toBe('Disabled');
  expect(toggledMessage(mystery, false, before)).toMatch(/^Mystery, Detective & Investigation is off\./);
  // Its empty categories are tucked away, not deleted; one with an entry in it stays.
  expect([n.kind('Cases')['archived'], n.kind('Suspects')['archived'] === true]).toEqual([true, false]);
  expect([n.snapshot.rows('loreEntries').length, n.snapshot.rows('moduleRecords').length]).toEqual([entries, records]);
  // Its workspace says it is off, and keeps what it holds.
  const off = workspace(novelId, n.snapshot, 'mystery', null, true);
  expect(off.kind).toBe('off');
  expect(off.kind === 'off' && off.text).toMatch(/This module is switched off/);
  n.change((m) => m.enable(new ModuleDefinition(mapOrNull(n.row('mystery')['definition'])!)));
  expect([n.row('mystery')['enabled'], n.kind('Cases')['archived'] === true]).toEqual([true, false]);
  expect([n.snapshot.rows('loreEntries').length, n.snapshot.rows('moduleRecords').length]).toEqual([entries, records]);
  // As its author arranged it: its own name, a tool renamed and one hidden.
  const on = workspace(novelId, n.snapshot, 'mystery', null, true);
  if (on.kind !== 'on') throw new Error('not on');
  expect(on.title).toContain('Whodunit');
  expect(on.chips.map((c) => c.label)).toContain('Casebook');
  expect(on.chips.map((c) => c.label)).not.toContain('Who knows what');
  const d = dashboard(on.module, on.tools, on.data, (e) => `/organize/entry/${e.id}`);
  expect(d.tiles.map((t) => t.label)).toContain('1 Suspects: open Suspect board');
});

test('its tools work on the novel’s own records: a registry, a matrix and a log', () => {
  const n = madeInTheApp();
  enable(n, 'mystery');
  const at = (toolId: string) => {
    const w = workspace(novelId, n.snapshot, 'mystery', toolId, true);
    if (w.kind !== 'on' || w.tool === null) throw new Error(`no ${toolId}`);
    return { moduleId: 'mystery', tool: w.tool, data: w.data, writes: true };
  };
  const registry = registryTool(at('people'), { query: '', only: '', recent: false, record: null });
  if ('missing' in registry) throw new Error(registry.missing);
  expect(registry.newEntry.label).toBe('New suspect');
  n.change((m) => newEntryChange(registry.category, 'The Butler')!(m));
  const butler = n.snapshot.rows('loreEntries').find((e) => e['name'] === 'The Butler')!;
  expect(butler['category']).toBe(n.kind('Suspects')['key']);
  const listed = registryTool(at('people'), { query: '', only: '', recent: false, record: str(butler['id']) });
  if ('missing' in listed) throw new Error(listed.missing);
  expect(listed.rows.find((r) => r.title === 'The Butler')!.path).toBe(`/organize/modules/mystery?tool=people&record=${butler['id']}`);
  expect(listed.record!.codex).toBe('Open in World');

  // The evidence matrix: a clue against a suspect.
  const matrix = matrixTool(at('evidence'));
  if ('missing' in matrix) throw new Error(matrix.missing);
  const clues = matrix.newEntries.find((x) => x.words.label === 'New clue')!;
  n.change((m) => newEntryChange(clues.category, 'A torn glove')!(m));
  const filled = matrixTool(at('evidence'));
  if ('missing' in filled) throw new Error(filled.missing);
  const glove = filled.rowEntries.find((e) => e.name === 'A torn glove')!;
  const theButler = filled.columnEntries.find((e) => e.name === 'The Butler')!;
  expect(filled.cell(glove, theButler).label).toBe('A torn glove and The Butler');
  expect(filled.values).toContain('Implicates');
  n.change(filled.set(glove, theButler, 'Implicates'));
  const cell = n.records('mystery').filter((r) => r['kind'] === 'cell');
  expect(cell.map((r) => [r['kind'], r['toolId'], r['state'], r['colId']])).toEqual([['cell', 'evidence', 'Implicates', butler['id']]]);

  // A log: a line with its first stage.
  const log = logTool(at('herrings'));
  expect(log.add!.label).toBe('New entry in Red herrings');
  n.change(logChanges.add(at('herrings'), 'The gardener’s boots', null)!);
  const line = n.records('mystery').find((r) => r['kind'] === 'log')!;
  expect([line['title'], line['state'], line['toolId']]).toEqual(['The gardener’s boots', 'Planted', 'herrings']);
  const shown = logTool(at('herrings')).lines.find((l) => l.title === 'The gardener’s boots')!;
  expect(shown.removeLabel).toBe('Remove The gardener’s boots');
  n.change(logChanges.remove(shown.id));
  expect(n.records('mystery').filter((r) => r['kind'] === 'log')).toEqual([]);
});

test('a log with values draws its line through the chapters', () => {
  const n = madeInTheApp();
  enable(n, 'romance');
  const chapters = n.snapshot
    .rows('chapters')
    .filter((c) => c['kind'] === 'chapter')
    .map((c) => str(c['id']));
  n.change((m) => chapters.slice(0, 2).forEach((id, i) => m.addRecord('romance', 'arc', { title: `Beat ${i}`, nodeId: id, value: 3 + i * 4 })));
  const w = workspace(novelId, n.snapshot, 'romance', 'arc', true);
  if (w.kind !== 'on' || w.tool === null) throw new Error('no arc');
  const log = logTool({ moduleId: 'romance', tool: w.tool, data: w.data, writes: true });
  const chart = log.chart!;
  if ('note' in chart) throw new Error(chart.note);
  expect(chart.semanticsLabel).toBe('Intensity through the story');
  expect(chart.caption).toContain('Intensity from 0 to 10');
  // Fewer than two points: the note instead.
  expect(arcChart([], w.data, { min: 0, max: 10, label: 'Intensity' })).toEqual({
    note: 'Give at least two points a chapter and a value to see the line.',
  });
});

test('Configure hides a tool, keeping how the author arranged the others', () => {
  const n = madeInTheApp();
  enable(n, 'mystery');
  const view = configureView(n.snapshot, 'mystery')!;
  expect(view.tools.find((t) => t.id === 'cases')!.showLabel).toBe('Show Cases');
  n.change((m) => m.configure('mystery', configureChanges.shown('cases', false)));
  expect(mapOrNull(n.row('mystery')['settings'])!['hidden']).toEqual(['knowledge', 'cases']);
  const w = workspace(novelId, n.snapshot, 'mystery', null, true);
  if (w.kind !== 'on') throw new Error('not on');
  expect(w.chips.map((c) => c.label)).not.toContain('Casebook');
  expect(w.chips.map((c) => c.label)).toContain('Alibis');
  // A move past either end makes no change.
  expect(configureChanges.move(['a', 'b'], 'a', -1)).toBeNull();
  expect(configureChanges.move(['a', 'b'], 'a', 1)!({})).toEqual({ order: ['b', 'a'] });
});

test('a module of the author’s own: made from the novel, exported, imported, never replacing a built-in one', () => {
  const n = madeInTheApp();
  const library = new ModuleLibrary(memorySettings(), { clock: () => 5, createId: () => `c${Math.random().toString(16).slice(2)}` });
  expect(library.saved()).toEqual([]);
  const view = managerView(n.snapshot, library.available());
  const built = new ModuleChanges(n.snapshot, { now: 0, createId: () => `b${Math.random().toString(16).slice(2)}` }).buildFrom({
    name: 'My rules',
    categoryKeys: [view.packable[0].category.key],
  });
  library.save(built);
  const mine = library.saved();
  expect(mine.map((m) => m.name)).toEqual(['My rules']);
  // Only the shape of things: no entries, names or text.
  expect(JSON.stringify(mine[0].raw)).not.toContain('Bren');
  expect(exportFileName(mine[0])).toBe('My rules.module.json');
  expect(moduleCard(mine[0], null, { owned: true, writes: true }).buttons.map((b) => b.label)).toEqual(
    expect.arrayContaining(['Export', 'Remove from my modules']),
  );

  // The same file claiming to be a built-in module comes in as a module of its own.
  const data = JSON.parse(JSON.stringify(moduleFile(mine[0]))) as JsonMap;
  const fake = { ...data, module: { ...mapOrNull(data['module'])!, id: 'mystery', name: 'Not the real one' } };
  library.save(readModuleFile(fake, { newId: () => 'z1' }));
  const now = library.available();
  expect(now.filter((m) => m.id === 'mystery').map((m) => m.name)).toEqual(['Mystery, Detective & Investigation']);
  expect(now.find((m) => m.name === 'Not the real one')!.id).toMatch(/^custom-/);
  expect(() => readModuleFile({ format: 'something-else' }, { newId: () => 'z2' })).toThrow(FormatError);
  expect(notAModuleMessage('notes.json')).toContain('is not a module');
  // Taken out of the library, it is gone from it (novels that use it keep their copy).
  library.remove(mine[0].id);
  expect(library.saved().map((m) => m.name)).toEqual(['Not the real one']);
});

test('on a phone the genre modules are a shelf of tiles: turn one on from its tile, and it says so', () => {
  expect(new Set(builtinModules.map(moduleTone)).size).toBe(builtinModules.length);
  const n = new Novel(sampleNovel(sampleJson(), Date.UTC(2026, 10, 10)));
  const first = builtinModules[0];
  const tile = shelfTile(first, 'available', true);
  expect(tile.button).toEqual({ kind: 'turnOn', label: 'Turn on', semanticsLabel: `Turn on ${first.name}` });
  n.change((m) => m.enable(first));
  const state = managerView(n.snapshot, builtinModules).status.get(first.id)!.state;
  expect(shelfTile(first, state, true).button.semanticsLabel).toBe(`Open ${first.name}`);
  expect(shelfTile(first, 'disabled', true).button.label).toBe('Turn on again');
  expect(shelfTile(first, 'available', false).button.label).toBe('More');
});

test('Made for your story: what the story calls for, said why; nothing once it is on; nothing for a blank story', () => {
  const chapters = ['Can create skills.\n\nHave ranks from E to SSS.\n\nHave 4 evolution from Ranks.'];
  const fits = fittingModules({ genres: [], tags: [], synopsis: '', chapters });
  const shown = forYourStory(fitsShown(fits, 'n', 'n', new Set()));
  expect(shown.map((x) => x.module.name)).toContain('Progression Fantasy & LitRPG');
  expect(shown[0].said).toMatch(/^Your book mentions /);
  expect(shown[0].said).toContain('ranks');
  expect(fitsShown(fits, 'n', 'n', new Set(['progression'])).map((f) => f.moduleId)).not.toContain('progression');
  expect(fitsShown(fits, 'other', 'n', new Set())).toEqual([]);
  expect(fittingModules({ genres: [], tags: [], synopsis: '', chapters: [] })).toEqual([]);
  // Worked out again only when the chapters (or the details, or the modules on) change.
  const key = (count: number, on: string[] = []) =>
    suggestionKey({ novelId: 'n', stamp: { count, latest: 7 }, genres: [], tags: [], synopsis: '', on: new Set(on) });
  expect(key(1)).toBe(key(1));
  expect(key(2)).not.toBe(key(1));
  expect(key(1, ['b', 'a'])).toBe(key(1, ['a', 'b']));
});

test('Try it on shows what the first module adds to this book: who gains what, its tools, and the promise', () => {
  const snapshot = new NovelBuilder().entry('james', { category: 'character', name: 'James' }).build();
  const progression = builtinModules.find((m) => m.id === 'progression')!;
  const view = tryOnView(tryOnModule(snapshot, progression), progression, 'Skill In Fantasy', 390);
  expect(view.heading).toBe('In “Skill In Fantasy”, with Progression Fantasy & LitRPG');
  expect(view.gains).toContain('James gains Power Rank.');
  expect(view.tools.map((t) => t.title)).toContain('Skills by rank');
  expect(view.promise).toContain('turning it off later deletes nothing');
  expect(snapshot.rows('projectModules')).toEqual([]);
});

test('on a narrow shelf every new kind of record stays in view', () => {
  const snapshot = sampleNovel(sampleJson(), 0);
  const fantasy = builtinModules.find((m) => m.id === 'high-fantasy')!;
  const tried = tryOnModule(snapshot, fantasy);
  expect(tried.added.length).toBeGreaterThan(5);
  const layout = shelfLayout(tryOnShelf(tried), 260);
  layout.order.forEach((s, i) => {
    if (!s.fresh) return;
    const left = i * (layout.width + layout.gap);
    expect([s.kind.name, left + layout.width <= 260 + 0.5]).toEqual([s.kind.name, true]);
  });
});
