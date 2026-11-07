import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import type { ReviewItem } from '@/modules/review/collect';
import { isSyncedSetting, syncedSettingKeys } from '@/modules/sync/account';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import type { EventDate } from '@/modules/timeline/types';
import type { SavedView } from '@/modules/visualize/saved';
import { addWidget, configureWidget, createDashboardStore, dashboardKey, EMPTY_LAYOUT, KIND_INFO, MAX_WIDGETS, moveWidget, parseLayout, removeWidget, resizeWidget, restoreWidget, settingsOf, titleOf, WIDGET_KINDS, type Layout } from './layout';
import { appearanceSummary, recentRecords, savedRows, threadSummary, upcomingEvents, warningSummary, wordRows } from './widgets';

const ids = (layout: Layout) => layout.widgets.map((w) => w.id);
const three = (): Layout => ['a', 'b', 'c'].reduce((l, id, i) => addWidget(l, WIDGET_KINDS[i], undefined, id), EMPTY_LAYOUT);

describe('arranging the dashboard', () => {
  it('places a widget at the end, at the start or after another, with its kind’s own size and no settings', () => {
    let layout = three();
    expect(ids(layout)).toEqual(['a', 'b', 'c']);
    layout = addWidget(layout, 'saved', 0, 'first');
    layout = addWidget(layout, 'words', 2, 'middle');
    expect(ids(layout)).toEqual(['first', 'a', 'middle', 'b', 'c']);
    expect(layout.widgets[2]).toEqual({ id: 'middle', kind: 'words', w: KIND_INFO.words.w, h: KIND_INFO.words.h, title: '', config: {} });
    // Out of range lands at the nearest end.
    expect(ids(addWidget(layout, 'saved', 99, 'end')).at(-1)).toBe('end');
    expect(ids(addWidget(layout, 'saved', -5, 'start'))[0]).toBe('start');
  });

  it('holds a limited number, and a full dashboard is left as it is', () => {
    let layout = EMPTY_LAYOUT;
    for (let i = 0; i < MAX_WIDGETS + 3; i++) layout = addWidget(layout, 'recent', undefined, `w${i}`);
    expect(layout.widgets).toHaveLength(MAX_WIDGETS);
  });

  it('reorders, clamping at either end, and returns the same layout when nothing moves', () => {
    const layout = three();
    expect(ids(moveWidget(layout, 'a', 2))).toEqual(['b', 'c', 'a']);
    expect(ids(moveWidget(layout, 'c', 0))).toEqual(['c', 'a', 'b']);
    expect(ids(moveWidget(layout, 'b', 10))).toEqual(['a', 'c', 'b']);
    expect(moveWidget(layout, 'a', -1)).toBe(layout);
    expect(moveWidget(layout, 'nope', 1)).toBe(layout);
  });

  it('resizes to the three widths and heights only', () => {
    const layout = three();
    const wide = resizeWidget(layout, 'a', { w: 3, h: 1 });
    expect(wide.widgets[0]).toMatchObject({ w: 3, h: 1 });
    // A size that is not one of the three is ignored, not guessed at.
    expect(resizeWidget(wide, 'a', { w: 7 as never, h: 0 as never }).widgets[0]).toMatchObject({ w: 3, h: 1 });
    expect(wide.widgets[1]).toEqual(layout.widgets[1]);
  });

  it('removes, says where from, and puts it back in the same place', () => {
    const layout = configureWidget(three(), 'b', { count: 3 }, 'Mine');
    const { layout: without, removed } = removeWidget(layout, 'b');
    expect(ids(without)).toEqual(['a', 'c']);
    expect(removed).toEqual({ widget: layout.widgets[1], index: 1 });
    expect(restoreWidget(without, removed!.widget, removed!.index)).toEqual(layout);
    // Putting back one already there changes nothing.
    expect(restoreWidget(layout, removed!.widget, 0)).toBe(layout);
    expect(removeWidget(layout, 'nope')).toEqual({ layout, removed: null });
  });

  it('configures some settings, keeping the rest; null clears one; the title is the author’s or the kind’s', () => {
    let layout = configureWidget(three(), 'a', { from: 'story', count: 4, future: { kept: true } });
    layout = configureWidget(layout, 'a', { count: null, threadId: 't1' });
    expect(layout.widgets[0].config).toEqual({ from: 'story', threadId: 't1', future: { kept: true } });
    expect(titleOf(layout.widgets[0])).toBe('Upcoming events');
    layout = configureWidget(layout, 'a', {}, 'Next up');
    expect(titleOf(layout.widgets[0])).toBe('Next up');
    expect(titleOf(configureWidget(layout, 'a', {}, '   ').widgets[0])).toBe('Upcoming events');
  });
});

describe('reading a stored dashboard', () => {
  it('reads nothing usable as an empty dashboard', () => {
    for (const raw of [null, undefined, 3, 'x', [], {}, { widgets: 'no' }]) expect(parseLayout(raw)).toEqual(EMPTY_LAYOUT);
  });

  it('leaves out what cannot be read, keeps a newer version’s widget, and keeps settings it does not know', () => {
    const layout = parseLayout({
      widgets: [
        { id: 'a', kind: 'threads', w: 2, h: 3, title: 'Mine', config: { sort: 'title', later: [1, 2] } },
        { id: 'a', kind: 'words' },
        { kind: 'words' },
        { id: 'b', kind: '' },
        'junk',
        { id: 'c', kind: 'from-the-future', w: 9, config: 'no' },
        { id: 'd', kind: 'words', w: 0, h: 'tall' },
      ],
    });
    expect(layout.widgets).toEqual([
      { id: 'a', kind: 'threads', w: 2, h: 3, title: 'Mine', config: { sort: 'title', later: [1, 2] } },
      { id: 'c', kind: 'from-the-future', w: 1, h: 2, title: '', config: {} },
      { id: 'd', kind: 'words', w: KIND_INFO.words.w, h: KIND_INFO.words.h, title: '', config: {} },
    ]);
    expect(titleOf(layout.widgets[1])).toBe('A widget from a newer version');
  });

  it('reads settings with the kind’s own where none, or a nonsense one, is stored', () => {
    expect(settingsOf('upcoming', {})).toEqual({ from: 'reading', count: 6, threadId: null, characterId: null });
    expect(settingsOf('upcoming', { from: 'sideways', count: 1000, threadId: '', characterId: 7 })).toEqual({ from: 'reading', count: 50, threadId: null, characterId: null });
    expect(settingsOf('recent', { types: ['event', 'bogus', 'event'] })).toEqual({ types: ['event'], count: 8 });
    expect(settingsOf('recent', { types: [] }).types).toEqual(['node', 'entry', 'event', 'thread', 'relation']);
    expect(settingsOf('words', { count: 0.2, sort: 'shortest' })).toEqual({ grain: 'chapters', sort: 'shortest', count: 1, partId: null });
  });
});

describe('keeping the dashboard in the browser', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { data, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } };
  };

  it('keeps each novel’s under its own key, and an empty dashboard as nothing stored', () => {
    const { data, storage } = memory();
    const store = createDashboardStore(storage);
    let heard = 0;
    store.subscribe(() => heard++);
    store.save('p1', three());
    expect(createDashboardStore(storage).layout('p1')).toEqual(three());
    expect(store.layout('p2')).toEqual(EMPTY_LAYOUT);
    expect(JSON.parse(data.get(dashboardKey('p1'))!)).toEqual({ version: 1, widgets: three().widgets });
    store.save('p1', EMPTY_LAYOUT);
    expect(data.has(dashboardKey('p1'))).toBe(false);
    expect(heard).toBe(2);
  });

  it('reads a corrupt layout as empty, without throwing or rewriting it', () => {
    const { data, storage } = memory();
    data.set(dashboardKey('p1'), '{not json');
    expect(createDashboardStore(storage).layout('p1')).toEqual(EMPTY_LAYOUT);
    expect(data.get(dashboardKey('p1'))).toBe('{not json');
  });

  it('when the browser will not store it, keeps it for this visit and says so', () => {
    const store = createDashboardStore({ getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} });
    store.save('p1', three());
    expect(store.unsaved('p1')).toBe(true);
    expect(store.layout('p1')).toEqual(three());
    store.refresh();
    expect(store.layout('p1')).toEqual(three());
  });

  it('reads it again when another tab, or sync, changes it', () => {
    const { data, storage } = memory();
    const store = createDashboardStore(storage);
    expect(store.layout('p1')).toEqual(EMPTY_LAYOUT);
    data.set(dashboardKey('p1'), JSON.stringify(three()));
    expect(store.layout('p1')).toEqual(EMPTY_LAYOUT);
    store.refresh();
    expect(store.layout('p1')).toEqual(three());
  });

  it('travels with the person’s other settings when they sync', () => {
    expect(syncedSettingKeys('p1')).toContain(dashboardKey('p1'));
    expect(isSyncedSetting(dashboardKey('p1'))).toBe(true);
    expect(isSyncedSetting('novel-builder:dashboard:../x')).toBe(false);
  });
});

const exact = (year: number): EventDate => ({ precision: 'exact', year, month: null, day: null, hour: null, minute: null });
let n = 0;
let db: NovelDB;

/**
 * Four chapters: 1 and 2 have words (2 through its scene), 3 and 4 have none.
 *  Arrival   Year 1, told in Ch 1
 *  Siege     Year 5, told in Ch 3; in “The quest”; Mira takes part
 *  Prophecy  Year 20, foreshadowed in Ch 1, told in Ch 4
 *  Old war   Year −10, a flashback in Ch 4
 *  Someday   no date, told nowhere
 */
async function book() {
  db = new NovelDB(`dashboard-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerPlot(registry);
  const p = await projects.create({ title: 'Ashfall' });
  const m = createManuscriptService(db, projects.contentChanged).forProject(p.id);
  const codex = createCodexService(db, projects.contentChanged).forProject(p.id);
  const timeline = createTimelineService(db, projects.contentChanged).forProject(p.id);
  const plot = createPlotService(db, projects.contentChanged).forProject(p.id);
  const ch = [await m.create('chapter', null, 'Arrival'), await m.create('chapter', null, 'The inn'), await m.create('chapter', null, 'The walls'), await m.create('chapter', null, 'Embers')];
  const scene = await m.create('scene', ch[1].id, 'Talk');
  await db.chapters.update(ch[0].id, { wordCount: 500 });
  await db.chapters.update(scene.id, { wordCount: 300 });
  const [mira, kai] = [await codex.create('character', 'Mira'), await codex.create('character', 'Kai')];
  await m.updatePlan(ch[0].id, { appearIds: [mira.id] });
  await m.updatePlan(ch[2].id, { mentionIds: [mira.id], appearIds: [kai.id] });
  const quest = await plot.create('The quest');
  await plot.update(quest.id, { status: 'active' });
  await plot.addBeat(quest.id, { title: 'Setting out', nodeId: ch[0].id });
  await plot.addBeat(quest.id, { title: 'The walls', nodeId: ch[2].id });
  await plot.addBeat(quest.id, { title: 'Somewhere', nodeId: null });
  const heir = await plot.create('Lost heir');
  const feud = await plot.create('Old feud');
  await plot.update(feud.id, { status: 'resolved' });
  const event = async (name: string, when: EventDate | null, changes: Record<string, unknown> = {}) => {
    const made = await timeline.create(name);
    await timeline.update(made.id, { ...(when ? { when } : {}), ...changes });
    return made;
  };
  const arrival = await event('Arrival', exact(1), { nodeIds: [ch[0].id] });
  const siege = await event('Siege', exact(5), { nodeIds: [ch[2].id], threadIds: [quest.id], characters: [{ id: mira.id, age: null }] });
  const prophecy = await event('Prophecy', exact(20), { nodeIds: [ch[0].id, ch[3].id], reveals: [{ nodeId: ch[0].id, role: 'foreshadowed' }] });
  const oldWar = await event('Old war', exact(-10), { nodeIds: [ch[3].id], reveals: [{ nodeId: ch[3].id, role: 'flashback' }] });
  const someday = await event('Someday', null);
  const model = async () => (await loadModel(db, p.id))!;
  return { p, ch, scene, mira, kai, quest, heir, feud, arrival, siege, prophecy, oldWar, someday, model };
}

describe('upcoming events', () => {
  it('in reading order: told in a chapter with no words yet, where the reader will meet them', async () => {
    const b = await book();
    const data = upcomingEvents(await b.model(), settingsOf('upcoming', {}));
    expect(data.rows.map((r) => r.title)).toEqual(['Siege', 'Old war', 'Prophecy']);
    // Only the chapters still to be written: the Prophecy's foreshadowing in Ch 1 is already written.
    expect(data.rows[2].places).toEqual([{ nodeId: b.ch[3].id, label: 'Ch 4: Embers', role: 'told', written: false }]);
    expect(data.rows[1].places[0].role).toBe('flashback');
    expect([data.total, data.unplaced, data.reached]).toEqual([3, 1, null]);
  });

  it('in story order: later than the latest event told as it happens, not moved by a glimpse ahead', async () => {
    const b = await book();
    const data = upcomingEvents(await b.model(), settingsOf('upcoming', { from: 'story' }));
    // The Prophecy is foreshadowed in a written chapter, but that does not take the story to Year 20.
    expect(data.reached?.title).toBe('Arrival');
    expect(data.rows.map((r) => r.title)).toEqual(['Siege', 'Prophecy']);
    expect(data.rows[1].places.map((p) => [p.role, p.written])).toEqual([['foreshadowed', true], ['told', false]]);
    // The one with no date cannot be placed in story order, and is counted as such, not guessed at.
    expect(data.unplaced).toBe(1);
  });

  it('keeps to a thread and a character, and says when one it follows is gone', async () => {
    const b = await book();
    const model = await b.model();
    expect(upcomingEvents(model, settingsOf('upcoming', { threadId: b.quest.id })).rows.map((r) => r.title)).toEqual(['Siege']);
    expect(upcomingEvents(model, settingsOf('upcoming', { characterId: b.mira.id, from: 'story' })).rows.map((r) => r.title)).toEqual(['Siege']);
    const none = upcomingEvents(model, settingsOf('upcoming', { characterId: b.kai.id }));
    expect([none.rows.length, none.matching, none.missing]).toEqual([0, 0, { thread: false, character: false }]);
    expect(upcomingEvents(model, settingsOf('upcoming', { threadId: 'deleted' })).missing).toEqual({ thread: true, character: false });
  });

  it('shows as many as asked, and says how many there are', async () => {
    const b = await book();
    const data = upcomingEvents(await b.model(), settingsOf('upcoming', { count: 1 }));
    expect([data.rows.length, data.total]).toEqual([1, 3]);
  });
});

describe('the other widgets read the records as they are', () => {
  it('plot threads: the statuses the author gave, filtered and ordered as asked', async () => {
    const b = await book();
    const model = await b.model();
    const all = threadSummary(model, settingsOf('threads', {}));
    expect(all.rows.map((r) => [r.title, r.statusLabel])).toEqual([['The quest', 'Active'], ['Lost heir', 'Planned'], ['Old feud', 'Resolved']]);
    expect(all.groups).toEqual([{ status: 'active', label: 'Active', count: 1 }, { status: 'planned', label: 'Planned', count: 1 }, { status: 'resolved', label: 'Resolved', count: 1 }]);
    expect(all.rows[0]).toMatchObject({ developments: 3, unplaced: 1, latest: { nodeId: b.ch[2].id, label: 'Ch 3: The walls' } });
    expect(all.rows[1]).toMatchObject({ developments: 0, latest: null });
    const open = threadSummary(model, settingsOf('threads', { statuses: ['planned', 'resolved'], sort: 'title' }));
    expect(open.rows.map((r) => r.title)).toEqual(['Lost heir', 'Old feud']);
    expect([open.total, open.all]).toEqual([2, 3]);
  });

  it('recently changed: by the time each record last saved, of the kinds chosen', async () => {
    const b = await book();
    await db.loreEntries.update(b.kai.id, { updatedAt: 9e12 });
    await db.plotThreads.update(b.feud.id, { updatedAt: 8e12 });
    const model = await b.model();
    const rows = recentRecords(model, settingsOf('recent', { count: 2 })).rows;
    expect(rows.map((r) => [r.label, r.kind])).toEqual([['Kai', 'Character'], ['Old feud', 'Plot thread']]);
    const events = recentRecords(model, settingsOf('recent', { types: ['event'] }));
    expect(events.total).toBe(5);
    expect(events.rows.every((r) => r.kind === 'Event')).toBe(true);
  });

  it('words: as the editor counts them; a chapter with none is not written yet, not short', async () => {
    const b = await book();
    const model = await b.model();
    const reading = wordRows(model, settingsOf('words', {}));
    expect(reading.rows.map((r) => [r.label, r.words])).toEqual([['Ch 1: Arrival', 500], ['Ch 2: The inn', 300], ['Ch 3: The walls', 0], ['Ch 4: Embers', 0]]);
    expect([reading.words, reading.bars, reading.empty, reading.most]).toEqual([800, 4, 2, 500]);
    expect(wordRows(model, settingsOf('words', { sort: 'shortest' })).rows.map((r) => r.words)).toEqual([300, 500]);
    expect(wordRows(model, settingsOf('words', { sort: 'longest', count: 1 })).rows.map((r) => r.label)).toEqual(['Ch 1: Arrival']);
    expect(wordRows(model, settingsOf('words', { grain: 'scenes' })).rows.map((r) => r.label)).toContain('Ch 2, scene: Talk');
    expect(wordRows(model, settingsOf('words', { partId: 'gone' }))).toMatchObject({ missingPart: true, rows: [] });
  });

  it('appearances: one character’s chapters by what is recorded, or the ones who appear most', async () => {
    const b = await book();
    const model = await b.model();
    const one = appearanceSummary(model, settingsOf('appearances', { characterId: b.mira.id }));
    expect(one.mode === 'one' && one.columns.map((c) => c.state)).toEqual(['appears', 'none', 'mentioned', 'none']);
    expect(one).toMatchObject({ appears: 1, mentioned: 1, other: 0, chapters: 4 });
    const top = appearanceSummary(model, settingsOf('appearances', {}));
    expect(top.mode === 'top' && top.rows.map((r) => [r.name, r.appears, r.mentioned])).toEqual([['Mira', 1, 1], ['Kai', 1, 0]]); // tied on appearances: more chapters recorded first
    expect(appearanceSummary(model, settingsOf('appearances', { characterId: 'gone' })).missing).toBe(true);
  });

  it('warnings: the ones still to look at, most serious and most certain first', () => {
    const item = (key: string, severity: ReviewItem['severity'], status: ReviewItem['status'], certainty: ReviewItem['certainty'] = 'possible') => ({ key, title: key, severity, status, certainty }) as ReviewItem;
    const items = [item('b-info', 'info', 'open'), item('c-warn', 'warning', 'open'), item('a-crit', 'critical', 'review'), item('z-crit', 'critical', 'open', 'error'), item('done', 'critical', 'intentional')];
    const all = warningSummary(items, settingsOf('warnings', {}));
    expect(all.rows.map((i) => i.key)).toEqual(['z-crit', 'a-crit', 'c-warn', 'b-info']);
    expect([all.todo, all.bySeverity]).toEqual([4, { critical: 2, warning: 1, info: 1 }]);
    expect(warningSummary(items, settingsOf('warnings', { severities: ['info'] })).rows.map((i) => i.key)).toEqual(['b-info']);
  });

  it('saved views: of one view or all, by name', () => {
    const view = (id: string, name: string, kind: string) => ({ id, name, view: kind, createdAt: 1 }) as SavedView;
    const list = [view('1', 'Siege lines', 'timeline'), view('2', 'Court', 'relationships'), view('3', 'Arcs', 'timeline')];
    expect(savedRows(list, settingsOf('saved', {})).rows.map((s) => s.name)).toEqual(['Arcs', 'Court', 'Siege lines']);
    expect(savedRows(list, settingsOf('saved', { view: 'timeline', count: 1 }))).toMatchObject({ total: 2, all: 3, rows: [{ name: 'Arcs' }] });
  });
});

describe('nothing is made up', () => {
  let empty: Awaited<ReturnType<typeof loadModel>>;
  beforeEach(async () => {
    const local = new NovelDB(`dashboard-empty-${++n}`);
    const p = await createProjectService(local, createProjectRegistry()).create({ title: 'Blank' });
    empty = await loadModel(local, p.id);
  });

  it('a new novel shows no rows, no counts and no example content in any widget', () => {
    const model = empty!;
    expect(upcomingEvents(model, settingsOf('upcoming', {}))).toMatchObject({ rows: [], total: 0, unplaced: 0, matching: 0 });
    expect(upcomingEvents(model, settingsOf('upcoming', { from: 'story' }))).toMatchObject({ rows: [], reached: null });
    expect(threadSummary(model, settingsOf('threads', {}))).toEqual({ rows: [], total: 0, all: 0, groups: [] });
    expect(recentRecords(model, settingsOf('recent', {}))).toEqual({ rows: [], total: 0 });
    expect(wordRows(model, settingsOf('words', {}))).toMatchObject({ rows: [], words: 0, bars: 0, most: 0 });
    expect(appearanceSummary(model, settingsOf('appearances', {}))).toMatchObject({ rows: [], characters: 0 });
    expect(warningSummary([], settingsOf('warnings', {}))).toMatchObject({ rows: [], todo: 0, bySeverity: { critical: 0, warning: 0, info: 0 } });
    expect(savedRows([], settingsOf('saved', {}))).toEqual({ rows: [], total: 0, all: 0 });
  });

  it('a layout names records by id only: nothing of a record is copied into it', async () => {
    const b = await book();
    const data = new Map<string, string>();
    const store = createDashboardStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) });
    let layout = addWidget(EMPTY_LAYOUT, 'appearances', undefined, 'w1');
    layout = configureWidget(layout, 'w1', { characterId: b.mira.id });
    layout = configureWidget(addWidget(layout, 'upcoming', undefined, 'w2'), 'w2', { threadId: b.quest.id });
    store.save(b.p.id, layout);
    const stored = data.get(dashboardKey(b.p.id))!;
    expect(stored).toContain(b.mira.id);
    // With the ids taken out (a random id may hold any digits), no name, title or count is left.
    const rest = stored.replaceAll(b.mira.id, '').replaceAll(b.quest.id, '');
    for (const words of ['Mira', 'The quest', 'Siege', 'Arrival', '500', '300']) expect(rest).not.toContain(words);
    // Renaming the record changes what the widget shows, and nothing in the layout.
    await db.loreEntries.update(b.mira.id, { name: 'Mira Vale' });
    const one = appearanceSummary(await b.model(), settingsOf('appearances', layout.widgets[0].config));
    expect(one.mode === 'one' && one.name).toBe('Mira Vale');
    expect(data.get(dashboardKey(b.p.id))).toBe(stored);
  });
});
