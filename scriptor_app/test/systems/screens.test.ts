// The logic of the Flutter app's Systems screen tests (flutter_app/test/features/progression/{status_window,
// live_window,system_speaks,systems_halves,blueprint_window,own_system,progression_screens,climb,face_off}_test.dart),
// on the screens' pure parts. What those check of the widgets themselves (taps reaching the right widget, a bar's fill
// painted frame by frame, layouts at phone width and twice the text size, the picture's pixels) belongs to the screens
// and is not here; the presses are run as the changes they make.

import { type JsonMap, str } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { maps } from '../../src/domain/records/jsonRecord';
import { SystemBlueprint } from '../../src/domain/records/system';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { SheetProfile, computeSheet } from '../../src/domain/systems/compute';
import { systemFromPages } from '../../src/domain/systems/fromPages';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { systemPresets } from '../../src/domain/systems/systemPresets';
import { climbChart, climbView } from '../../src/domain/systems/screens/climbView';
import { faceOffBars, faceOffView } from '../../src/domain/systems/screens/faceOffView';
import { ownSystemCard, presetCards } from '../../src/domain/systems/screens/gallery';
import { liveWindow } from '../../src/domain/systems/screens/liveWindow';
import { dartDoubleTryParse, formatBase, moved, splitList } from '../../src/domain/systems/screens/parts';
import { givePoint, leveling, logXp, sheetEditor } from '../../src/domain/systems/screens/sheetEditor';
import { formulaField, sheetView } from '../../src/domain/systems/screens/sheetView';
import { exampleHeld, statusWindowView, windowNumber } from '../../src/domain/systems/screens/statusWindow';
import { SpeaksState, bracketKey, speaksChapter, windowKindOf } from '../../src/domain/systems/screens/systemSpeaks';
import {
  addSheet,
  addVariable,
  beginOwn,
  deleteSystemDialog,
  editList,
  openingMode,
  ownSystemHolder,
  removingDialog,
  setGrants,
  sheetsTab,
  stageGrants,
  systemsOf,
  systemsPath,
  tabChip,
  tabOf,
} from '../../src/domain/systems/screens/systemsPage';
import { readJson, samplePath } from '../fixtures';

const litrpg = systemPresets.find((p) => p.id === 'litrpg')!;
const superhero = systemPresets.find((p) => p.id === 'superhero')!;
const sample = () => NovelSnapshot.fromJson(readJson(samplePath));
let ids = 0;
const changes = (s: NovelSnapshot = sample()) => new SystemChanges(s, { now: 1700000000000, createId: () => `t${ids++}` });
const entryNamed = (c: SystemChanges, name: string) => str(c.snapshot.rows('loreEntries').find((e) => e['name'] === name)!['id']);

describe('the status window', () => {
  test('an example sheet holds the first of each kind of class, skill and the like', () => {
    const groups = new Set(maps(litrpg.content['items']).map((i) => str(i['groupId'])));
    expect(exampleHeld(litrpg.content)).toHaveLength(groups.size);
  });

  test('the window shows the numbers the sheet will: its level, bars of what is left, what is held', () => {
    const held = exampleHeld(litrpg.content);
    const sheet = computeSheet(new SystemBlueprint(litrpg.content), new SheetProfile({ itemIds: held }));
    const view = statusWindowView({ content: litrpg.content, presetId: 'litrpg', holder: 'James', held, caption: 'For example.' });
    expect(view.semanticsLabel).toBe('Status window for James');
    expect(view.heading).toBe('STATUS');
    expect(view.standing[0]).toMatchObject({ kind: 'line', label: 'Name', value: 'James', strong: true });
    // Health, out of the Max Health that follows from Vitality.
    const most = sheet.rows.find((r) => r.variable.name === 'Max Health')!.display.replace(' HP', '');
    expect(view.resources.some((r) => r.kind === 'bar' && r.value === `100 / ${most} HP`)).toBe(true);
    // What a class held raises is marked so.
    const strength = sheet.rows.find((r) => r.variable.name === 'Strength')!;
    expect(strength.sources.length).toBeGreaterThan(0);
    expect(view.attributes).toContainEqual({ kind: 'line', label: 'Strength', value: strength.display, strong: false, raised: true });
    const shown = view.groups.flatMap((g) => g.held.map((h) => h.name));
    for (const i of sheet.items) expect(shown).toContain(i.item.name);
    // A bar's part is what is left of its most.
    const bar = view.resources.find((r) => r.kind === 'bar' && r.value.startsWith('100 /'));
    expect(bar).toMatchObject({ part: 100 / Number(most) });
  });

  test('every kind of system has its window, compact for the gallery (no next steps, nothing that follows)', () => {
    for (const p of systemPresets) {
      const view = statusWindowView({ content: p.content, presetId: p.id, holder: 'Your hero', held: exampleHeld(p.content), caption: '', compact: true });
      expect(view.standing.some((r) => r.kind === 'next')).toBe(false);
      expect(view.follows).toEqual([]);
    }
    expect(windowNumber(2.5)).toBe('2.5');
    expect(windowNumber(12.5)).toBe('13');
    expect(windowNumber(7)).toBe('7');
  });

  test('editing in place (a character’s Status): steppers and choices, and what can be held, by group', () => {
    const c = changes();
    const made = c.createSystem(litrpg.content);
    const view = statusWindowView({
      content: c.systems()[0].raw,
      presetId: 'litrpg',
      holder: 'Wren',
      held: [],
      caption: '',
      profile: new SheetProfile(),
      editing: true,
      holding: true,
      canMakeNew: true,
    });
    expect(view.standing[1]).toMatchObject({ kind: 'stepper', label: 'Level', whole: true, min: 1, semanticsLabel: 'Level: 1. Press to type a number.' });
    const classes = view.groups.find((g) => g.label === 'Classes · one at a time')!;
    expect(classes.held).toEqual([]);
    expect(classes.more!.length).toBeGreaterThan(0);
    expect(classes.addLabel).toBe('Add to Classes');
    expect(made.id).toBeTruthy();
  });
});

describe('the live window, the halves, the blueprint’s window', () => {
  test('a sheet as it stands, changing as the system is changed; with no sheet, a hero', () => {
    const c = changes();
    const made = c.createSystem(litrpg.content);
    const empty = liveWindow(StoryModel.fromSnapshot(c.snapshot), c.systems()[0], null);
    expect(empty.holder).toBe('Your hero');
    expect(empty.caption).toBe('How a sheet in it will look as it begins. Change the system below, and it changes here.');
    const sheet = c.addSheet(made.id, entryNamed(c, 'Wren Hollis'));
    const strength = c.systems()[0].variables.find((v) => v.name === 'Strength')!;
    c.updateSheet(sheet.id, () => ({ values: { [strength.id]: 17 } }));
    const w = liveWindow(StoryModel.fromSnapshot(c.snapshot), c.systems()[0], null, 'beside');
    expect(w.holder).toBe('Wren Hollis');
    expect(w.caption).toContain('Change the system beside');
    const view = statusWindowView({ content: c.systems()[0].raw, presetId: w.presetId, holder: w.holder, held: w.held, caption: '', profile: w.profile });
    expect(view.attributes).toContainEqual({ kind: 'line', label: 'Strength', value: '17', strong: false, raised: false });
    c.updateSystem(made.id, (cur) => ({ variables: maps(cur.raw['variables']).map((v) => (v['name'] === 'Strength' ? { ...v, name: 'Might' } : v)) }));
    const again = statusWindowView({ content: c.systems()[0].raw, presetId: w.presetId, holder: w.holder, held: w.held, caption: '', profile: liveWindow(StoryModel.fromSnapshot(c.snapshot), c.systems()[0], null).profile });
    expect(again.attributes.map((r) => (r.kind === 'line' ? r.label : ''))).toContain('Might');
    expect(again.attributes.map((r) => (r.kind === 'line' ? r.label : ''))).not.toContain('Strength');
  });

  test('two halves: the story first, the blueprint remembered; a link to a tab opens the blueprint', () => {
    expect(openingMode({ tab: null, sheetId: null }, undefined)).toBe('story');
    expect(openingMode({ tab: null, sheetId: null }, 'blueprint')).toBe('blueprint');
    expect(openingMode({ tab: 'kits', sheetId: null }, 'story')).toBe('blueprint');
    expect(tabOf('kits')).toBe('kits');
    expect(tabOf('nonsense')).toBe('variables');
    expect(systemsPath({ tab: 'kits' })).toBe('/organize/systems?tab=kits');
    expect(systemsPath()).toBe('/organize/systems');
  });

  test('a tier given a power: a character at that tier holds it, in the window at once, from that tier', () => {
    const c = changes();
    const made = c.createSystem(superhero.content);
    const system = c.systems()[0];
    const tier = system.tracks.find((t) => t.kind === 'stages')!;
    const first = tier.stages[0];
    const release = system.items.find((i) => i.name === 'Kinetic Release')!;
    expect(stageGrants(system, first).label).toBe(`Reaching ${first.name} gives`);
    expect(stageGrants(system, first).offered.some((g) => g.items.some((i) => i.name === 'Kinetic Release'))).toBe(true);
    const sheet = c.addSheet(made.id, entryNamed(c, 'Wren Hollis'));
    setGrants(made.id, tier.id, first.id, [release.id])(c);
    const after = c.systems()[0];
    expect(stageGrants(after, after.tracks.find((t) => t.id === tier.id)!.stages[0]).given.map((g) => g.name)).toEqual(['Kinetic Release']);
    const w = liveWindow(StoryModel.fromSnapshot(c.snapshot), after, sheet.id);
    const view = statusWindowView({ content: after.raw, presetId: w.presetId, holder: w.holder, held: w.held, caption: '', profile: w.profile });
    const given = view.groups.flatMap((g) => g.held).find((h) => h.name === 'Kinetic Release')!;
    expect(given.from).toBe(first.name);
    setGrants(made.id, tier.id, first.id, [])(c);
    const gone = statusWindowView({ content: c.systems()[0].raw, presetId: w.presetId, holder: w.holder, held: [], caption: '', profile: liveWindow(StoryModel.fromSnapshot(c.snapshot), c.systems()[0], sheet.id).profile });
    expect(gone.groups.flatMap((g) => g.held).some((h) => h.name === 'Kinetic Release')).toBe(false);
  });
});

describe('the system speaks', () => {
  test('a blueprint wears the window its words call for', () => {
    const named = (name: string) => new SystemBlueprint({ name });
    expect(windowKindOf(named('Nine Realms Cultivation'))).toBe('cultivation');
    expect(windowKindOf(named('The Rune Ledger'))).toBe('hard-magic');
    expect(windowKindOf(named('Hero Registry'))).toBe('superhero');
    expect(windowKindOf(named('The System'))).toBe('litrpg');
  });

  test('filled from the sheet, in the book’s brackets (remembered), written at the end of the chapter', () => {
    const c = changes();
    const made = c.createSystem(litrpg.content);
    c.addSheet(made.id, entryNamed(c, 'Wren Hollis'));
    const model = StoryModel.fromSnapshot(c.snapshot);
    const state = new SpeaksState(model, model.systems.get(made.id)!, undefined);
    expect(state.view().semanticsLabel).toMatch(/^The message: \[Level up!\] \[Wren Hollis has reached Level \d+\.\]/);
    state.chooseKind('skill');
    state.type('name', 'Tide Sense');
    state.type('rank', 'E');
    expect(state.chooseBracket('lenticular')).toBe('lenticular');
    expect(state.view().semanticsLabel).toBe('The message: 【Skill acquired: Tide Sense (E)】');
    expect(bracketKey('n1')).toBe('systems.bracket.n1');
    const chapters = [...model.order.chapters];
    const chapter = speaksChapter(model, chapters[1].id, null, () => true)!;
    expect(chapter.id).toBe(chapters[1].id);
    expect(chapter.said).toBe(`At the end of “${chapters[1].displayTitle}”.`);
    expect(speaksChapter(model, null, null, () => false)).toBeNull();
    expect(state.copied()).toBe('【Skill acquired: Tide Sense (E)】');
    expect(state.message).toBe('Copied. Paste it where the system speaks.');
  });
});

describe('the gallery, the book’s own system', () => {
  test('every preset to begin from, its ranks in words', () => {
    const cards = presetCards(null);
    expect(cards.map((c) => c.begin)).toEqual(systemPresets.map((p) => `Begin with ${p.name}`));
    expect(cards.some((c) => c.lines.some(([, v]) => v === 'Common → Advanced → Unique → Legendary'))).toBe(true);
  });

  test('the book’s own system first: why, and the hero’s sheet holding its skills; begun in one change', () => {
    const own = systemFromPages(
      ['James gained a level. His new skill was Smart Atoms.', 'Every skill has a cost. His class was Reincarnator.'],
      ['Empathic Mimicry', 'Smart Atoms'],
    )!;
    const card = ownSystemCard(own, 'James');
    expect(card.said).toContain('“skill” ×2');
    expect(card.caption).toBe('A sheet for James, holding all 2.');
    expect(card.held).toHaveLength(2);
    const c = changes();
    const wren = entryNamed(c, 'Wren Hollis');
    const cast = [
      { entry: { id: 'x', name: 'Nobody' }, profile: { roles: [] }, seenIn: [] },
      { entry: { id: wren, name: 'Wren Hollis' }, profile: { roles: ['Protagonist'] }, seenIn: [1] },
    ];
    const holder = ownSystemHolder(own, cast);
    expect(holder).toEqual({ holderId: wren, holderName: 'Wren Hollis' });
    const system = beginOwn(own, holder.holderId)(c);
    expect(c.systems()).toHaveLength(1);
    const mine = c.systems()[0].items.filter((i) => ['empathic mimicry', 'smart atoms'].includes(i.name.toLowerCase()));
    expect(mine).toHaveLength(2);
    expect(c.sheets()[0].entryId).toBe(wren);
    expect(new Set(c.sheets()[0].itemIds)).toEqual(new Set(mine.map((i) => i.id)));
    expect(system.id).toBe(c.systems()[0].id);
    expect(ownSystemHolder({ ...own, powers: [] }, cast)).toEqual({ holderId: null, holderName: null });
  });
});

describe('the blueprint’s tabs and sheets', () => {
  test('a system starts from a preset, and its parts are named by the author', () => {
    const c = changes();
    const made = c.createSystem(litrpg.content);
    expect(c.systems()[0].name).toBe(litrpg.content['name']);
    const before = c.systems()[0].variables.length;
    addVariable(made.id, 'number')(c);
    expect(c.systems()[0].variables).toHaveLength(before + 1);
    expect(c.systems()[0].variables[before].name).toBe('New attribute');
    const model = StoryModel.fromSnapshot(c.snapshot);
    expect(systemsOf(model, null).system!.id).toBe(made.id);
    expect(tabChip(c.systems()[0], model, 'variables')).toBe(`Attributes & resources (${before + 1})`);
  });

  test('a character is put on a system from its Sheets tab, and taken off again', () => {
    const c = changes();
    const made = c.createSystem(litrpg.content);
    const wren = entryNamed(c, 'Wren Hollis');
    const sheet = addSheet(made.id, wren)(c);
    const tab = sheetsTab(StoryModel.fromSnapshot(c.snapshot), c.systems()[0], sheet.id);
    expect(tab.selected).toMatchObject({ name: 'Wren Hollis', character: true, open: 'Open profile' });
    expect(tab.free.some((e) => e.id === wren)).toBe(false);
    const editor = sheetEditor(c.systems()[0], c.sheets()[0], 'Wren Hollis');
    expect(editor.takeOff).toBe(`Take Wren Hollis off ${c.systems()[0].name}`);
    c.removeSheet(sheet.id);
    expect(c.sheets()).toEqual([]);
  });

  test('deleting a system asks first and names what goes with it', () => {
    const c = changes();
    const made = c.createSystem(litrpg.content);
    expect(deleteSystemDialog(c.systems()[0]).message).toContain('Characters and entries are not changed');
    c.removeSystem(made.id);
    expect(c.systems()).toEqual([]);
  });

  test('removing a group says first that its items and their paths go with it', () => {
    const c = changes();
    const made = c.createSystem({
      name: 'Ember Arts',
      groups: [{ id: 'g', name: 'Skills', single: false }],
      items: [
        { id: 'spark', groupId: 'g', name: 'Spark' },
        { id: 'lance', groupId: 'g', name: 'Fire Lance', requires: 'Skill: Spark' },
        { id: 'ward', groupId: 'g', name: 'Ward' },
      ],
    });
    const system = c.systems()[0];
    const item = (name: string) => `${made.id}/${system.items.find((i) => i.name === name)!.id}`;
    c.put('loreLinks', { id: 'l1', projectId: c.projectId, fromType: 'ability', fromId: item('Ward'), toType: 'ability', toId: item('Spark'), type: 'excludes' });
    const group = system.groupList[0];
    const dialog = removingDialog(StoryModel.fromSnapshot(c.snapshot), system, new Set(system.items.filter((i) => i.groupId === group.id).map((i) => i.id)), `the group ${group.name}`)!;
    expect(dialog.title).toBe('Remove the group Skills?');
    expect(dialog.message).toContain('3 items go with it. 1 recorded path goes with them.');
    editList(made.id, 'groups', (all) => all.filter((g) => g['id'] !== group.id))(c);
    expect(c.systems()[0].items).toEqual([]);
    expect(c.rows('loreLinks').some((l) => l['id'] === 'l1')).toBe(false);
  });

  test('the sheet: levelling from logged experience, points to place, the sheet as lines', () => {
    const c = changes();
    const made = c.createSystem(litrpg.content);
    const sheet = c.addSheet(made.id, entryNamed(c, 'Wren Hollis'));
    const model = () => StoryModel.fromSnapshot(c.snapshot);
    const before = leveling(model(), c.systems()[0], c.sheets()[0], 'Wren', null)!;
    expect(before.experience!.empty).toContain('Nothing logged: Wren’s level is the number set above.');
    const track = before.experience!.track;
    expect(logXp(sheet.id, { trackId: track.id, amountText: 'x', source: '', nodeId: '', note: '' })).toBeNull();
    logXp(sheet.id, { trackId: track.id, amountText: '100000', source: 'Combat', nodeId: '', note: 'A boss' }, () => 'xp1')!(c);
    const after = leveling(model(), c.systems()[0], c.sheets()[0], 'Wren', null)!;
    expect(after.experience!.log[0]).toMatchObject({ entryId: 'xp1', rose: true });
    expect(after.experience!.log[0].title).toContain('Combat · A boss · Before the story');
    expect(after.points!.title).toMatch(/^Points: \d+ to place$/);
    const v = after.points!.rows[0];
    givePoint(sheet.id, v.variableId, 1)(c);
    expect(c.sheets()[0].spent.get(v.variableId)).toBe(1);
    givePoint(sheet.id, v.variableId, -1)(c);
    expect(c.sheets()[0].spent.has(v.variableId)).toBe(false);
    const lines = sheetView(c.systems()[0], SheetProfile.of(c.sheets()[0]));
    expect('rows' in lines && lines.rows.length).toBe(c.systems()[0].variables.length);
    expect(sheetView(new SystemBlueprint({}), new SheetProfile())).toEqual({ empty: 'This blueprint has nothing defined yet.' });
    expect(formulaField(c.systems()[0], 'strength * 2').helper).toMatch(/^= \d+ with starting values$/);
    expect(formulaField(c.systems()[0], 'strenght * 2').error).toBe('Nothing here is called “strenght”.');
  });
});

describe('the climb and the face-off, as shown', () => {
  test('the climb: who has climbed, the caption, the chart', () => {
    const c = changes();
    const made = c.createSystem(litrpg.content);
    const sheet = c.addSheet(made.id, entryNamed(c, 'Wren Hollis'));
    expect(climbView(StoryModel.fromSnapshot(c.snapshot), c.systems()[0], null)).toBeNull();
    const model0 = StoryModel.fromSnapshot(c.snapshot);
    const chapters = model0.order.chapters.map((ch) => ch.id);
    const track = c.systems()[0].tracks.find((t) => t.kind === 'levels')!;
    c.updateSheet(sheet.id, () => ({
      xp: [
        { id: 'a', trackId: track.id, amount: 5000, nodeId: chapters[0] },
        { id: 'b', trackId: track.id, amount: 5000, nodeId: chapters[1] },
      ],
    }));
    const view = climbView(StoryModel.fromSnapshot(c.snapshot), c.systems()[0], null)!;
    expect(view.caption).toBe('How fast Wren Hollis rises, chapter by chapter, and where the pace leads.');
    const chart = climbChart(view.shown.climbs[0], 300, 160);
    expect(chart.labels.map((l) => l.text)).toContain('Ch. 0');
    expect(chart.steps.startsWith('M30 ')).toBe(true);
  });

  test('the face-off: two sides, their bars, what it says', () => {
    const c = changes();
    const made = c.createSystem(litrpg.content);
    const a = c.addSheet(made.id, entryNamed(c, 'Wren Hollis'));
    c.addSheet(made.id, entryNamed(c, 'Aldous Crane'));
    const strength = c.systems()[0].variables.find((v) => v.name === 'Strength')!;
    c.updateSheet(a.id, () => ({ values: { [strength.id]: 30 } }));
    const view = faceOffView(StoryModel.fromSnapshot(c.snapshot), c.systems()[0], { a: null, b: null })!;
    expect(view.pickers).toBeNull();
    expect(view.face.says[0]).toContain('Wren Hollis leads in');
    const bars = faceOffBars(view.face.rows.find((r) => r.name === 'Strength')!);
    expect(bars).toMatchObject({ name: 'STRENGTH', aPart: 1, aLeads: true, bLeads: false, aValue: '30' });
  });
});

describe('the parts', () => {
  test('numbers as Dart reads them, a starting value as written, list edits', () => {
    expect(dartDoubleTryParse(' 2.5 ')).toBe(2.5);
    expect(dartDoubleTryParse('1e3')).toBe(1000);
    expect(dartDoubleTryParse('x')).toBeNull();
    expect(formatBase(10)).toBe('10');
    expect(formatBase(2.5)).toBe('2.5');
    expect(splitList('Fire, Water, , Earth')).toEqual(['Fire', 'Water', 'Earth']);
    const list: JsonMap[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moved(list, 'a', 1).map((m) => m['id'])).toEqual(['b', 'a', 'c']);
    expect(moved(list, 'a', -1).map((m) => m['id'])).toEqual(['a', 'b', 'c']);
  });
});
