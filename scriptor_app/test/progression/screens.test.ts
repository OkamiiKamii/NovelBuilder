// The logic of the Flutter app's progression screens' tests (flutter_app/test/features/progression/
// {levels_view,number_ledger,pages_names,progression_screens}_test.dart, the tracker, chart and snapshot parts), on the
// pure parts of src/domain/progression/screens: what each shows in words and what its presses change. What those tests
// check of the widgets themselves (taps reaching the right widget, scrolling, the editor taking the find, a reading
// kept between pages as a count of readings) belongs to the screens and is not here; a press is run as the change it
// makes, on the records.

import { CastData } from '../../src/domain/characters/castData';
import { type JsonMap, str } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { readingOrder } from '../../src/domain/model/storyOrder';
import { isDocument } from '../../src/domain/outline';
import { textToDoc } from '../../src/domain/prose';
import { ledgerJob, ledgerLine, ledgerWords, slipCard, slipReadThere, slipsCount } from '../../src/domain/progression/screens/ledgerView';
import {
  giveLevel,
  levelledThing,
  levelsAside,
  levelsAssigned,
  levelsJob,
  levelsList,
  levelsOnSystems,
  levelsReadingKey,
  levelsWords,
  setAsideLevel,
  stepReadThere,
  stepsDrawing,
  theirLevels,
} from '../../src/domain/progression/screens/levelsView';
import { addNames, notPartAfter, pagesNamesJob, pagesNamesView } from '../../src/domain/progression/screens/pagesNamesView';
import { chartCaption, chartLabel, chartMarks, chartOffset, chartPath, chartSeries, nearestPoint } from '../../src/domain/progression/screens/progressChart';
import { addSheet, progressionSheets, statusChanges, statusView } from '../../src/domain/progression/screens/progressionTab';
import {
  type SnapshotsState,
  comparisonLines,
  inSystem,
  logSnapshot,
  snapshotEdits,
  snapshotEditor,
  snapshotsStart,
  snapshotsView,
  stateCard,
  systemPart,
} from '../../src/domain/progression/screens/snapshotsView';
import {
  atOf,
  changeForm,
  changeFormStart,
  submitChange,
  trackedChanges,
  trackedView,
  trackerView,
  whenItems,
  whenValue,
} from '../../src/domain/progression/screens/tracker';
import { ProgressSnapshot, SnapshotChanges, compareSnapshots } from '../../src/domain/progression/snapshots';
import { TrackChanges } from '../../src/domain/progression/trackChanges';
import { ProgressChange } from '../../src/domain/records/progress';
import { StoryNode } from '../../src/domain/records/storyNode';
import { SystemBlueprint, SystemSheet } from '../../src/domain/records/system';
import { NovelSnapshot, snapshotFormat } from '../../src/domain/snapshot/novelSnapshot';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { systemPresets } from '../../src/domain/systems/systemPresets';
import { readJson, samplePath } from '../fixtures';

/** A novel of `chapters` (one paragraph each, or paragraphs split at blank lines) and the characters `cast`. */
function novelOf(chapters: string[], cast: string[] = []): NovelSnapshot {
  return NovelSnapshot.fromJson({
    format: snapshotFormat,
    version: 4,
    exportedAt: 1,
    project: { id: 'p', title: 'The Ever Armor' },
    collections: {
      chapters: chapters.map((_, i) => ({ id: `ch${i + 1}`, title: `Chapter ${i + 1}`, kind: 'chapter', order: i, parentId: null })),
      chapterContents: chapters.map((text, i) => ({ id: `ch${i + 1}`, doc: textToDoc(text) })),
      loreEntries: cast.map((name) => ({ id: name.toLowerCase(), category: 'character', name })),
    },
  });
}

const storedOf = (s: NovelSnapshot) => s.rows('chapterContents').map((r) => JSON.stringify(r));

let ids = 0;
const nextId = () => `id-${++ids}`;
const track = <T>(s: NovelSnapshot, now: number, f: (x: TrackChanges) => T): [NovelSnapshot, T] => {
  const x = new TrackChanges(s, { now, createId: nextId });
  const r = f(x);
  return [x.snapshot, r];
};
const systems = <T>(s: NovelSnapshot, f: (x: SystemChanges) => T): [NovelSnapshot, T] => {
  const x = new SystemChanges(s, { now: 5, createId: nextId });
  const r = f(x);
  return [x.snapshot, r];
};

// ---------------------------------------------------------------------------------------------------- levels

const armor = [
  'The armor answered him. Archer Armor Level 1. The bow settled into his hands.',
  'He drew on it until his arms shook, and the Archer Armor reached Level 2.',
  'A second shape came out of the first: Hunter Armor (Lv. 1).',
  'The Hunter Armor’s level rose to 12 after the wolves.',
  'At last, on the ridge above the city, the Hunter Armor reached Level 100.',
];

/** The same book, with Kade wearing it. */
const kades = [
  'Kade felt the armor answer him. Kade’s Archer Armor Level 1. The bow settled into his hands.',
  'Kade drew on it until his arms shook, and the Archer Armor reached Level 2.',
  'A second shape came out of the first: Kade’s Hunter Armor (Lv. 1). Kade reached Level 3.',
  'The Hunter Armor’s level rose to 12 after the wolves, and Kade knew it.',
  'At last, on the ridge above the city, Kade’s Hunter Armor reached Level 100.',
];

const levelsOf = (s: NovelSnapshot, stored: unknown = null, owners: unknown = null) => {
  const cast = new CastData('p', s);
  return { cast, levels: levelsJob(cast, storedOf(s), levelsAside(stored), levelsAssigned(owners))() };
};

describe('levels in your pages', () => {
  test('on Systems, what is no one’s: the versions, where each is now, every step, and read there', () => {
    const s = novelOf(armor);
    const before = JSON.stringify(s.toJson(0));
    const { cast, levels } = levelsOf(s);
    const on = levelsOnSystems(cast, levels);
    expect(on.holders).toEqual([]);
    const list = levelsList(on.noOnes);
    expect(list.groups.map((g) => g.heading)).toEqual(['ARMOR · 2 versions']);
    const hunter = levelledThing(on.noOnes.find((l) => l.name === 'Hunter Armor')!);
    expect(hunter.since).toBe('since chapter 5 · 2 steps from Level 1');
    expect(hunter.level).toBe('100');
    expect(hunter.key).toBe('level-Hunter Armor');
    expect(hunter.steps.map((x) => x.sentence)).toContain('“A second shape came out of the first: Hunter Armor (Lv. 1).”');
    expect(JSON.stringify(s.toJson(0))).toBe(before);
    // Read it there: the latest step's chapter, with find on its sentence.
    expect(stepReadThere(hunter.steps[0].step)).toEqual({
      nodeId: 'ch5',
      term: 'At last, on the ridge above the city, the Hunter Armor reached Level 100.',
      block: 0,
    });
  });

  test('on the character’s page: their own level and their armor; Systems says who holds them', () => {
    const { cast, levels } = levelsOf(novelOf(kades, ['Kade', 'Mira']));
    const on = levelsOnSystems(cast, levels);
    expect(on.noOnes).toEqual([]);
    expect(on.holders.map((h) => [h.key, h.label])).toEqual([['holder-kade', 'Kade: Archer Armor, Hunter Armor, their level']]);
    const theirs = theirLevels(cast, 'kade', levels)!;
    expect(theirs.things.map((l) => theirs.titleOf(l))).toEqual(['Kade’s level', 'Archer Armor', 'Hunter Armor']);
    expect(levelsList(theirs.things).groups.map((g) => g.heading)).toEqual([null, 'ARMOR · 2 versions']);
    expect(levelledThing(theirs.things[2]).level).toBe('100');
    expect(theirLevels(cast, 'mira', levels)).toBeNull();
  });

  test('not theirs: back on Systems, no one’s; give to someone else: on their page', () => {
    const s = novelOf(kades, ['Kade', 'Mira']);
    const { levels } = levelsOf(s);
    const archer = levels.find((l) => l.name === 'Archer Armor')!;
    const notTheirs = giveLevel(null, archer, null);
    expect(notTheirs).toEqual({ 'archer armor': '' });
    let read = levelsOf(s, null, notTheirs);
    expect(levelsOnSystems(read.cast, read.levels).noOnes.map((l) => l.name)).toEqual(['Archer Armor']);
    expect(theirLevels(read.cast, 'kade', read.levels)!.things.map((l) => l.name)).not.toContain('Archer Armor');
    const toMira = giveLevel(notTheirs, archer, 'mira');
    expect(toMira).toEqual({ 'archer armor': 'mira' });
    read = levelsOf(s, null, toMira);
    expect(levelsOnSystems(read.cast, read.levels).noOnes).toEqual([]);
    expect(theirLevels(read.cast, 'mira', read.levels)!.things.map((l) => l.name)).toEqual(['Archer Armor']);
  });

  test('a slip marked; not a level; the reading follows the pages as they change', () => {
    const s = novelOf([...armor, 'The Archer Armor was Level 1, though no one had touched it.']);
    const { cast, levels } = levelsOf(s);
    expect(levelsList(levels).slips).toBe('One goes back down where the page does not say it fell: marked below.');
    const archer = levels.find((l) => l.name === 'Archer Armor')!;
    const aside = setAsideLevel(null, archer);
    expect(aside).toEqual({ store: ['archer armor'], said: 'Archer Armor is set aside: not a level.' });
    expect(levelsOf(s, aside.store).levels.map((l) => l.name)).toEqual(['Hunter Armor']);
    // The same book, the same key; the text written, another.
    const key = levelsReadingKey(cast, levelsAside(aside.store), new Map(), 3);
    expect(levelsReadingKey(cast, levelsAside(aside.store), new Map(), 3)).toBe(key);
    expect(levelsReadingKey(cast, levelsAside(aside.store), new Map(), 4)).not.toBe(key);
  });

  test('its steps drawn: held flat, then up; the slips in their own colour', () => {
    const { levels } = levelsOf(novelOf([...armor, 'The Archer Armor was Level 1, though no one had touched it.']));
    const archer = levels.find((l) => l.name === 'Archer Armor')!;
    const d = stepsDrawing(archer.steps);
    expect(d.path).toBe('M0 28 L14 28 L14 0 L70 0 L70 28');
    expect(d.dots.map((x) => x.backwards)).toEqual([false, false, true]);
  });

  test('a book that levels nothing says how to write one', () => {
    expect(levelsOf(novelOf(['He walked into the rain.'])).levels).toEqual([]);
    expect(levelsWords.empty.startsWith('Nothing in your chapters has a level yet.')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------- the ledger

/** The sample novel with chapters rewritten, and its chapters in reading order. */
function sampleWith(texts: string[]): { s: NovelSnapshot; chapters: string[] } {
  let s = NovelSnapshot.fromJson(readJson(samplePath));
  const chapters = readingOrder(s.rows('chapters').map((r) => new StoryNode(r)))
    .filter((n) => isDocument(n.kind))
    .map((n) => n.id);
  texts.forEach((text, i) => {
    const row = s.rows('chapterContents').find((r) => r['id'] === chapters[i])!;
    s = s.putRow('chapterContents', { ...row, doc: textToDoc(text) });
  });
  return { s, chapters };
}

describe('the ledger', () => {
  test('the numbers the pages give, a slip flagged, and read in its chapter', () => {
    const { s: written, chapters } = sampleWith(['Wren checked the window. Strength 13. Level 2.', 'The tide bell rang.\n\n[Strength +2 (12 → 14)]']);
    const litrpg = systemPresets.find((p) => p.id === 'litrpg')!;
    const [s, system] = systems(written, (x) => x.createSystem(litrpg.content));
    const model = StoryModel.fromSnapshot(s);
    const ledger = ledgerJob(model, system, storedOf(s))();
    expect(slipsCount(ledger)).toBe('1 slip');
    expect(slipCard(ledger.slips[0]).says).toBe('Strength rises from 12 in chapter 2, but it was 13 in chapter 1.');
    expect(slipCard(ledger.slips[0]).read).toBe('Read it in chapter 2');
    const labels = ledger.lines.map((l) => ledgerLine(l).semanticsLabel);
    expect(labels).toContain('Strength: 13 in chapter 1, 14 in chapter 2');
    expect(labels).toContain('Level: 2 in chapter 1');
    expect(slipReadThere(ledger.slips[0]).nodeId).toBe(chapters[1]);
    expect(str(s.project['title'])).toBe('The Drowned Road');
  });

  test('pages that give none of its numbers: said so', () => {
    const [s, system] = systems(NovelSnapshot.fromJson(readJson(samplePath)), (x) => x.createSystem({ name: 'Quiet', variables: [] }));
    const ledger = ledgerJob(StoryModel.fromSnapshot(s), system, storedOf(s))();
    expect(ledger.lines).toEqual([]);
    expect(slipsCount(ledger)).toBeNull();
    expect(ledgerWords.empty.startsWith('Your pages do not give any of its numbers yet.')).toBe(true);
  });

  test('a line: its last six numbers, "…" before them, the last the strongest', () => {
    const line = {
      name: 'HP',
      track: false,
      entries: [1, 2, 3, 4, 5, 6, 7.5].map((value, i) => ({ chapter: i + 1, nodeId: 'n', block: 0, value, from: null, by: null, said: '' })),
    };
    const shown = ledgerLine(line);
    expect(shown.more).toBe(true);
    expect(shown.numbers.map((n) => `${n.value}${n.chapter}${n.last ? '!' : ''}`)).toEqual(['2 ·2', '3 ·3', '4 ·4', '5 ·5', '6 ·6', '7.5 ·7!']);
  });
});

// ---------------------------------------------------------------------------------------------------- names in pages

describe('in your pages, not in the system', () => {
  test('added to its group and the sheet in a press, or set aside', () => {
    const { s: written } = sampleWith([
      'The bell rang.\n\n[Skill acquired: Tide Sense (E)]\n\nShe tried [Power Strike].\n\n[Title earned: Drowned Walker]\n\nAgain, [Tide Sense].',
    ]);
    const wren = written.rows('loreEntries').find((r) => r['name'] === 'Wren Hollis')!;
    const litrpg = systemPresets.find((p) => p.id === 'litrpg')!;
    const [s, systemId] = systems(written, (x) => {
      const made = x.createSystem(litrpg.content);
      x.addSheet(made.id, str(wren['id']));
      return made.id;
    });
    const model = StoryModel.fromSnapshot(s);
    const system = model.systems.get(systemId)!;
    const found = pagesNamesJob(model, system, storedOf(s), null)();
    const view = pagesNamesView(system, found, new Set())!;
    const titles = view.shown.map((n) => n.title);
    expect(titles).toContain('[Tide Sense]');
    expect(titles).not.toContain('[Power Strike]');
    expect(titles).toContain('[Drowned Walker]');
    const tideShown = view.shown.find((n) => n.title === '[Tide Sense]')!;
    expect(tideShown.kind).toBe('Skill · rank E');
    expect(tideShown.add).toBe('Add to Skills');

    const adding = addNames(model, systemId, [tideShown.name]);
    expect(adding.said).toBe('Tide Sense is in the system and on Wren Hollis’s sheet.');
    const [after] = systems(s, (x) => adding.change(x));
    const blueprint = new SystemBlueprint(after.rows('systems').find((r) => r['id'] === systemId)!);
    const tide = blueprint.items.find((i) => i.name === 'Tide Sense')!;
    expect(blueprint.groupList.find((g) => g.id === tide.groupId)!.name).toBe('Skills');
    expect(new SystemSheet(after.rows('systemSheets')[0]).itemIds).toContain(tide.id);

    const left = pagesNamesView(system, found, new Set(['tide sense']))!;
    expect(left.shown.map((n) => n.title)).not.toContain('[Tide Sense]');
    const walker = left.shown.find((n) => n.title === '[Drowned Walker]')!.name;
    const stored = notPartAfter(null, walker);
    expect(stored).toEqual(['Drowned Walker']);
    expect(pagesNamesView(system, found, new Set(['tide sense', 'drowned walker']))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------- progression

describe('the Progression tab', () => {
  const mira = () => novelOf(['Mira woke.', 'Mira went out.'], ['Mira']);

  test('records a change only once something is tracked', () => {
    let s = mira();
    let model = StoryModel.fromSnapshot(s);
    const empty = trackerView(model, 'mira', 'end')!;
    expect(empty.nothingTracked!.line).toBe('This novel tracks nothing about how characters change yet.');
    expect(empty.chooseLabel).toBe('Choose what to track…');
    const preset = trackedChanges.preset('Level');
    [s] = track(s, 1, preset.change);
    expect(preset.said).toBe('Now tracking Level.');
    expect(s.rows('progressCategories').map((r) => r['name'])).toEqual(['Level']);
    model = StoryModel.fromSnapshot(s);
    const form = { ...changeFormStart(), value: '4' };
    const view = changeForm(model, 'mira', form)!;
    expect(view.value!.label).toBe('Set to');
    expect(view.subject).toBeNull();
    const submit = submitChange(model, 'mira', view, form);
    let saved!: ProgressChange;
    [s, saved] = track(s, 2, submit.change);
    expect(submit.said(saved)).toBe('Recorded: Level set to 4.');
    const change = s.rows('progressChanges')[0];
    expect([change['entryId'], change['value'], change['action']]).toEqual(['mira', '4', 'set']);
    // "When is not known" unless chosen.
    expect(change['at']).toEqual({ kind: 'date', when: { precision: 'unknown' } });
    const now = trackerView(StoryModel.fromSnapshot(s), 'mira', 'end')!;
    expect(now.log!.heading).toBe('Changes, in order');
    expect(now.categories).toEqual([{ name: 'Level', lines: [{ lead: '', value: '4', step: null, uncertain: null }], moments: null, lost: null }]);
    expect(now.log!.rows[0].subtitle).toBe('When is not known');
  });

  test('a character with nothing recorded is shown nothing, not empty rows', () => {
    const model = StoryModel.fromSnapshot(mira());
    expect(progressionSheets(model, 'mira', 'Mira').none!.line).toBe('This novel has no system blueprints.');
    const [s] = track(mira(), 1, (x) => x.addPreset('Titles'));
    const view = trackerView(StoryModel.fromSnapshot(s), 'mira', 'end')!;
    expect(view.nothing).toBe('Nothing recorded for Mira yet.');
    expect(view.categories).toEqual([]);
    expect(view.log).toBeNull();
  });

  test('the points a change can be at; a When value as a time and back', () => {
    const model = StoryModel.fromSnapshot(mira());
    expect(whenItems(model)).toEqual([
      { value: 'n:ch1', label: 'Ch 1: Chapter 1' },
      { value: 'n:ch2', label: 'Ch 2: Chapter 2' },
    ]);
    expect(atOf('start')).toBeNull();
    expect(atOf('n:ch2')).toEqual({ kind: 'node', nodeId: 'ch2' });
    expect(atOf('')).toEqual({ kind: 'date', when: { precision: 'unknown' } });
    const c = (at: unknown) => new ProgressChange({ id: 'x', at } as JsonMap);
    expect([c(null), c({ kind: 'node', nodeId: 'ch1' }), c({ kind: 'date', when: { precision: 'unknown' } })].map(whenValue)).toEqual([
      'start',
      'n:ch1',
      '',
    ]);
  });

  test('a value set more than once is drawn over the story; words that are not numbers or steps are not', () => {
    let s = mira();
    let level!: string;
    let rank!: string;
    let mood!: string;
    [s, level] = track(s, 1, (x) => x.saveCategory(null, { name: 'Level', shape: 'value' }).id);
    [s, rank] = track(s, 2, (x) => x.saveCategory(null, { name: 'Rank', shape: 'value', ladder: ['Squire', 'Knight', 'Lord'] }).id);
    [s, mood] = track(s, 3, (x) => x.saveCategory(null, { name: 'Mood', shape: 'value' }).id);
    const values: [string, string][] = [
      [level, '3'],
      [level, '7'],
      [rank, 'Squire'],
      [rank, 'Lord'],
      [mood, 'Calm'],
      [mood, 'Grim'],
    ];
    values.forEach(([categoryId, value], i) => {
      [s] = track(s, 10 + i, (x) => x.record({ entryId: 'mira', categoryId, action: 'set', value }));
    });
    const model = StoryModel.fromSnapshot(s);
    const series = chartSeries(model, 'mira');
    expect(series.map((x) => x.name)).toEqual(['Level', 'Rank']);
    expect(series[0].points.map((p) => p.y)).toEqual([3, 7]);
    expect(series[1].points.map((p) => p.y)).toEqual([0, 2]);
    const view = trackerView(model, 'mira', 'end')!;
    expect(view.overTheStory!.heading).toBe('Over the story');
    expect(chartLabel(series[0]).startsWith('Level over the story, 2 settings')).toBe(true);
    expect(chartLabel(series[1]).startsWith('Rank over the story, 2 settings: Squire')).toBe(true);
    // Where it is drawn: the log runs across, the values up; a ladder's steps label the scale.
    const length = view.overTheStory!.length;
    expect(chartOffset(series[0].points[0], series[0], length, 600)).toEqual({ x: 72, y: 168 });
    expect(chartOffset(series[0].points[1], series[0], length, 600)).toEqual({ x: 72 + (1 / 5) * 516, y: 12 });
    expect(chartPath(series[0], length, 600)).toBe(`M72 168 L${72 + (1 / 5) * 516} 168 L${72 + (1 / 5) * 516} 12`);
    expect(chartMarks(series[0], length, 600).map((m) => m.text)).toEqual(['3', '5', '7']);
    expect(chartMarks(series[1], length, 600).map((m) => m.text)).toEqual(['Squire', 'Knight', 'Lord']);
    expect(nearestPoint(series[0], length, 600, 80, 160)).toBe(0);
    expect(nearestPoint(series[0], length, 600, 400, 90)).toBeNull();
    expect(chartCaption(series[0], null)).toBe('Tap a point to see when it was set.');
    expect(chartCaption(series[0], 1)).toBe('Level: 7 (When is not known)');
  });

  test('what is tracked: the counts, the shape kept once used, archived not removed', () => {
    let s = mira();
    let level!: string;
    [s, level] = track(s, 1, (x) => x.addPreset('Level').id);
    [s] = track(s, 2, (x) => x.record({ entryId: 'mira', categoryId: level, action: 'set', value: '1' }));
    const view = trackedView(StoryModel.fromSnapshot(s));
    const row = view.rows[0];
    expect([row.count, row.shapeLocked, row.removeLabel, row.archiveLabel]).toEqual(['1 change', true, null, 'Archive Level']);
    expect(row.forWhom!.title).toBe('For every character');
    expect(view.startFrom!.presets.map((p) => p.name)).not.toContain('Level');
    [s] = track(s, 3, trackedChanges.forCharacter(row.category, 'mira', true));
    expect(trackedView(StoryModel.fromSnapshot(s)).rows[0].forWhom!.title).toBe('For Mira');
    expect(() => track(s, 4, trackedChanges.remove(row.category).change)).toThrow('“Level” has 1 change recorded. Archive it instead: they are kept.');
    expect(trackedChanges.own('   ', 'held')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------- snapshots

describe('system snapshots', () => {
  /** Mira on the LitRPG preset, with a snapshot before the story and one at chapter 2. */
  function logged() {
    const litrpg = systemPresets.find((p) => p.id === 'litrpg')!;
    let [s, systemId] = systems(novelOf(['Mira woke.', 'Mira went out.'], ['Mira']), (x) => {
      const made = x.createSystem(litrpg.content);
      x.addSheet(made.id, 'mira');
      return made.id;
    });
    const snap = <T>(f: (x: SnapshotChanges) => T): T => {
      const x = new SnapshotChanges(s, { now: 9, createId: nextId });
      const r = f(x);
      s = x.snapshot;
      return r;
    };
    const first = snap(logSnapshot('mira', { ...snapshotsStart, label: ' Start ' }).change);
    const state: SnapshotsState = { ...snapshotsStart, at: 'ch2', label: 'After' };
    const step = logSnapshot('mira', state);
    const second = snap(step.change);
    expect(step.after(second)).toEqual({ ...state, label: '', selected: second.id, view: 'edit' });
    return { s: () => s, snap, systemId, first, second };
  }

  test('logged, chosen, compared; one alone cannot be compared', () => {
    const n = logged();
    const model = StoryModel.fromSnapshot(n.s());
    const snapshots = n.s().rows('progressSnapshots').map((r) => new ProgressSnapshot(r));
    const view = snapshotsView(model, snapshots, 'mira', { ...snapshotsStart, view: 'compare' })!;
    expect(view.chips.map((c) => c.label)).toEqual(['Before the story · Start · Level 1', 'Chapter 2 · After · Level 1']);
    expect('comparison' in view.compare!).toBe(true);
    const one = snapshotsView(model, snapshots.slice(0, 1), 'mira', { ...snapshotsStart, view: 'compare' })!;
    expect(one.compare).toEqual({ none: 'Log two snapshots to compare them.' });
    const inspect = snapshotsView(model, snapshots, 'mira', { ...snapshotsStart, asOf: 'ch1' })!;
    expect(inspect.inspect!.found!.id).toBe(n.first.id);
  });

  test('edited in place: a level typed, gear added and named, status lines, a value by hand; compared', () => {
    const n = logged();
    let model = StoryModel.fromSnapshot(n.s());
    const system = model.systems.get(n.systemId)!;
    const levels = system.tracks.find((t) => t.kind === 'levels')!;
    const strength = system.variables.find((v) => v.kind !== 'derived' && v.kind !== 'choice')!;
    const edit = (e: (c: ProgressSnapshot) => JsonMap) => n.snap((x) => x.updateSnapshot(n.second.id, e));
    edit(inSystem(n.systemId, snapshotEdits.level(levels, '3.6')));
    edit(inSystem(n.systemId, snapshotEdits.byHand(strength, '20')));
    edit(snapshotEdits.addGear(model, ' Tide Glass ', '', 'Carried', () => 'g1')!);
    edit(snapshotEdits.status('condition', 'Soaked\n\nCold'));
    model = StoryModel.fromSnapshot(n.s());
    const now = new ProgressSnapshot(n.s().rows('progressSnapshots').find((r) => r['id'] === n.second.id)!);
    const part = systemPart(system, now.systems.get(n.systemId)!);
    expect(part.tracks.find((t) => t.track.id === levels.id)!.label).toBe(`${levels.name} in this snapshot`);
    expect(part.rows.find((r) => r.variable.id === strength.id)!.byHand!.value).toBe('20');
    expect(snapshotEdits.level(levels, 'x')({ progress: {} })).toEqual({ progress: { [levels.id]: 1 } });
    expect(snapshotEdits.level(levels, '0')({ progress: {} })).toEqual({ progress: { [levels.id]: 1 } });
    const card = stateCard(model, now, [...model.nodes.values()]);
    expect(card.heading).toBe('From the snapshot at Chapter 2: After');
    expect(card.gear).toEqual({ heading: 'Inventory & gear', lines: ['Tide Glass · Carried'] });
    expect(card.status).toEqual([{ heading: 'Physical condition & injuries', lines: ['• Soaked', '• Cold'] }]);
    const lines = comparisonLines(compareSnapshots(n.first, now, [system]));
    expect('groups' in lines).toBe(true);
    const groups = (lines as { groups: { heading: string; lines: string[] }[] }).groups;
    expect(groups.find((g) => g.heading === 'Advancement')!.lines).toEqual([`${system.name} · ${levels.name}: 1 of ${levels.cap} → 4 of ${levels.cap}`]);
    expect(groups.find((g) => g.heading === 'Gear')!.lines).toEqual(['Gained: Tide Glass (Carried)']);
    expect(groups.find((g) => g.heading === 'Physical condition & injuries')!.lines).toEqual(['+ Soaked', '+ Cold']);
    expect(comparisonLines(compareSnapshots(n.first, n.first, [system]))).toEqual({ same: 'Nothing differs between the two.' });
    const editor = snapshotEditor(model, now, 'Mira');
    expect(editor.at).toBe('ch2');
    expect(editor.delete.message).toBe('Delete this snapshot of Mira? The snapshots before and after it are not changed.');
    expect(editor.status.fields[0].hint).toBe('Broken left arm\nExhausted');
    // A gear with no name is not added; removing it takes it away.
    expect(snapshotEdits.addGear(model, '  ', '', '', () => 'g2')).toBeNull();
    edit(snapshotEdits.removeGear('g1'));
    expect(new ProgressSnapshot(n.s().rows('progressSnapshots').find((r) => r['id'] === n.second.id)!).gear).toEqual([]);
  });

  test('an item held one at a time: choosing another lets the first go', () => {
    const n = logged();
    const system = StoryModel.fromSnapshot(n.s()).systems.get(n.systemId)!;
    const single = system.groupList.find((g) => g.single && system.items.filter((i) => i.groupId === g.id).length >= 2);
    if (single === undefined) return;
    const [a, b] = system.items.filter((i) => i.groupId === single.id);
    const held = snapshotEdits.hold(single, system.items.filter((i) => i.groupId === single.id), b, true)({ itemIds: [a.id, 'other'] });
    expect(held).toEqual({ itemIds: ['other', b.id] });
    expect(snapshotEdits.hold(single, [], a, false)({ itemIds: [a.id, 'other'] })).toEqual({ itemIds: ['other'] });
  });
});

// ---------------------------------------------------------------------------------------------------- status

describe('the Status tab', () => {
  test('nothing without systems; one to begin with; their numbers changed in place; one new to the system held', () => {
    const litrpg = systemPresets.find((p) => p.id === 'litrpg')!;
    const plain = novelOf(['Mira woke.'], ['Mira']);
    expect(statusView(new CastData('p', plain), new CastData('p', plain).listed('mira')!, null, false)).toBeNull();
    let [s, systemId] = systems(plain, (x) => x.createSystem(litrpg.content).id);
    let cast = new CastData('p', s);
    let view = statusView(cast, cast.listed('mira')!, null, false)!;
    expect(view.caption).toBe(`As Mira would begin in ${view.system.name}: not on a sheet yet.`);
    expect(view.give).toBe(`Give Mira a sheet in ${view.system.name}`);
    expect(view.summary.text).toBe('No summary yet.');
    [s] = systems(s, addSheet(systemId, 'mira'));
    cast = new CastData('p', s);
    view = statusView(cast, cast.listed('mira')!, null, true)!;
    expect(view.change).toEqual({ label: 'Done', done: true });
    expect(view.summary.counts.find((c) => c.label === 'Systems')!.value).toBe('1');
    const sheetId = view.sheet!.id;
    const group = view.system.groupList[0];
    [s] = systems(s, statusChanges.newItem(systemId, sheetId, group.id, ' Tide Sense ')!);
    [s] = systems(s, statusChanges.newItem(systemId, sheetId, group.id, 'tide sense')!);
    const blueprint = new SystemBlueprint(s.rows('systems').find((r) => r['id'] === systemId)!);
    const made = blueprint.items.filter((i) => i.name === 'Tide Sense');
    expect(made.length).toBe(1);
    expect(new SystemSheet(s.rows('systemSheets')[0]).itemIds).toContain(made[0].id);
    expect(statusChanges.newItem(systemId, sheetId, group.id, '   ')).toBeNull();
    [s] = systems(s, statusChanges.hold(sheetId, made[0].id, false));
    expect(new SystemSheet(s.rows('systemSheets')[0]).itemIds).not.toContain(made[0].id);
    expect(statusChanges.newPrompt(group.name, 'Mira').confirmLabel).toBe('Give it to Mira');
  });
});
