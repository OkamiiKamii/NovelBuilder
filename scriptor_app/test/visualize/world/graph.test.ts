// The logic of flutter_app/test/features/graph/graph_screens_test.dart, run on a real library: the graph says what it
// shows and every layer it hides comes with a way back; the path from the selection is shown step by step; the list
// form says every connection and where it is kept; a large graph draws the most connected first; deleting a record
// says a connection points at something deleted; the view's settings are kept as the original keeps them. (Its
// keyboard test belongs to the canvas, which a phone does not have.)

import { openLibrary } from '../../../src/data/library';
import { CharacterService } from '../../../src/domain/characters/characterService';
import { drawLimit, knowledgeGraph } from '../../../src/domain/graph/knowledge';
import { setIdGenerator } from '../../../src/domain/ids';
import { EntityRef } from '../../../src/domain/model/entityRef';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { TimelineService } from '../../../src/domain/timeline/timelineService';
import { GraphSettings, type GraphUndo, alone, graphPage, keptIn, pathSaid, pathSteps } from '../../../src/domain/visualize/world/graphView';
import { testIds } from '../../fixtures';
import { memoryLibrary } from '../../nodeSql';

setIdGenerator(testIds());

/** Mira takes part in the siege at the Keep, and the Docks lie in the Keep; Bren takes part in the feast, apart. */
function setUpNovel(extras = 0) {
  let now = 1000;
  const lib = openLibrary(memoryLibrary(), () => now, testIds());
  const novel = lib.library.create({ title: 'Ashfall' }).novel.id;
  const s = new CharacterService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() });
  const mira = s.change(novel, (x) => x.create({ name: 'Mira' })).id;
  const bren = s.change(novel, (x) => x.create({ name: 'Bren' })).id;
  const keep = s.change(novel, (x) => x.createEntry('location', 'The Keep')).id;
  const docks = s.change(novel, (x) => x.createEntry('location', 'The Docks')).id;
  s.change(novel, (x) => x.createConnection({ from: new EntityRef('entry', docks), to: new EntityRef('entry', keep), type: 'located-in' }));
  for (let i = 0; i < extras; i++) s.change(novel, (x) => x.create({ name: `Extra ${i}` }));
  new TimelineService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() }).change(novel, (x) => {
    const siege = x.createEvent('The siege');
    x.updateEvent(siege, () => ({ locationId: keep, characters: [{ id: mira, age: null }] }));
    const feast = x.createEvent('The feast');
    x.updateEvent(feast, () => ({ characters: [{ id: bren, age: null }] }));
  });
  const model = () => StoryModel.fromSnapshot(s.read(novel)!);
  return { lib, s, novel, mira, bren, docks, model };
}

const noFilters = { text: '', involving: null };
const labels = (undo: GraphUndo[]) => undo.map((u) => u.label);

test('the graph says what it shows, and every layer it hides comes with a way back', () => {
  const w = setUpNovel();
  const model = w.model();
  const full = knowledgeGraph(model);
  let page = graphPage(model, full, new GraphSettings(), noFilters, null);
  expect(page.status).toBe('Showing 6 of 6 records and 4 of 4 connections.');
  expect(page.partial).toEqual([]);

  const events = page.counts.nodes.find(([t]) => t === 'event')!;
  expect(events).toEqual(['event', 2]);
  page = graphPage(model, full, new GraphSettings({ hiddenNodes: new Set(['event']) }), noFilters, null);
  expect(page.partial.map((p) => p.text)).toEqual([
    'Hidden kinds of record: Events.',
    // Without the events, Mira and Bren are connected to nothing shown, and that is said too.
    '2 records have no connection shown, and are not drawn.',
  ]);
  expect(page.status).toBe('Showing 2 of 6 records and 1 of 4 connections.');
  const show = page.partial[0].undo[0];
  expect(show.label).toBe('Show them');
  expect(graphPage(model, full, 'settings' in show ? show.settings : new GraphSettings(), noFilters, null).status).toBe(
    'Showing 6 of 6 records and 4 of 4 connections.',
  );

  page = graphPage(model, full, new GraphSettings({ collapsed: new Set(['event']) }), noFilters, null);
  expect(page.partial.map((p) => p.text)).toContain('Folded together, one node each: Events. Connections inside a group are not drawn.');
  expect(page.status).toContain('1 group folded together');
  expect(page.restorable).toBe(true);
});

test('the path from the selection to another record is shown step by step', () => {
  const w = setUpNovel();
  const model = w.model();
  const full = knowledgeGraph(model);
  const mira = new EntityRef('entry', w.mira);
  let page = graphPage(model, full, new GraphSettings({ path: `entry:${w.bren}` }), noFilters, mira);
  expect(page.selected?.label).toBe('Mira');
  expect(pathSaid(page.path, page.hiddenPath)).toBe('Not connected within eight steps.');
  page = graphPage(model, full, new GraphSettings({ path: `entry:${w.docks}` }), noFilters, mira);
  const steps = pathSteps(page.path!, page.labelOf);
  expect(steps).toHaveLength(3);
  expect(steps[0]).toMatch(/^1\. Mira /);
  expect(steps[2]).toMatch(/^3\. The Docks /);
  // Hidden by a layer: connected only through what the view hides, with a way back.
  page = graphPage(model, full, new GraphSettings({ path: `entry:${w.docks}`, hiddenNodes: new Set(['event']) }), noFilters, mira);
  expect(pathSaid(page.path, page.hiddenPath)).toBe('Connected only through what this view hides (3 steps).');
});

test('the list form says every connection in words, and where it is kept', () => {
  const w = setUpNovel();
  const model = w.model();
  const page = graphPage(model, knowledgeGraph(model), new GraphSettings({ isolated: true }), noFilters, null);
  const kept = page.drawn.edges.map(keptIn);
  expect(kept.filter((k) => k === 'a connection you recorded')).toHaveLength(1);
  expect(kept.filter((k) => k === 'a timeline event')).toHaveLength(3);
  expect(alone(page.drawn)).toEqual([]);
});

test('a large graph draws the most connected first, and says how many more there are', () => {
  const w = setUpNovel(200);
  const model = w.model();
  const full = knowledgeGraph(model);
  let page = graphPage(model, full, new GraphSettings(), noFilters, null);
  expect(page.partial.map((p) => p.text)).toContain('200 records have no connection shown, and are not drawn.');
  const drawThem = page.partial.find((p) => p.key === 'isolated')!.undo[0];
  expect(drawThem.label).toBe('Draw them');
  let s = 'settings' in drawThem ? drawThem.settings : new GraphSettings();
  page = graphPage(model, full, s, noFilters, null);
  const limit = page.partial.find((p) => p.key === 'limit')!;
  expect(limit.text).toContain('Only the 200 most connected of 206 records and groups are drawn');
  expect(labels(limit.undo)).toEqual(['Draw 6 more', 'Draw all 206 (may be slow)']);
  s = 'settings' in limit.undo[0] ? limit.undo[0].settings : s;
  page = graphPage(model, full, s, noFilters, null);
  expect(page.partial.some((p) => p.key === 'limit')).toBe(false);
  expect(page.status).toBe('Showing 206 of 206 records and 4 of 4 connections.');
});

test('deleting a record says a connection points at something deleted', () => {
  const w = setUpNovel();
  w.s.change(w.novel, (x) => x.updateEntry(w.mira, { name: 'Mirabel' }));
  w.s.delete(w.novel, w.bren, { name: 'Bren' });
  const model = w.model();
  const page = graphPage(model, knowledgeGraph(model), new GraphSettings(), noFilters, null);
  expect(page.byKey.get(`entry:${w.mira}`)?.label).toBe('Mirabel');
  expect(page.status).toBe('Showing 4 of 5 records and 3 of 3 connections. 1 connection points at something deleted, and is left out.');
  expect(page.partial.map((p) => p.text)).toContain('1 record has no connection shown, and is not drawn.');
});

test('a search or a character narrows the view, and says so', () => {
  const w = setUpNovel();
  const model = w.model();
  const full = knowledgeGraph(model);
  const page = graphPage(model, full, new GraphSettings(), { text: 'Docks', involving: null }, null);
  expect(page.partial.find((p) => p.key === 'text')?.text).toBe('Only records named “Docks”, and what they are connected to.');
  expect(page.drawn.nodes.map((n) => n.label).sort()).toEqual(['The Docks', 'The Keep']);
  const around = graphPage(model, full, new GraphSettings(), { text: '', involving: w.mira }, null);
  expect(around.focusKey).toBe(`entry:${w.mira}`);
  expect(around.partial.find((p) => p.key === 'focus')?.text).toBe('Only what is within one step of Mira.');
});

test('the view’s settings are kept as the original keeps them in a saved view', () => {
  const layout = {
    ghide: 'event,thread',
    gedges: 'link:owns',
    gstatus: 'disputed',
    gfocus: 'entry:x',
    gdepth: '2',
    gall: '1',
    gcollapse: 'scene',
    gfold: '1',
    glimit: '300',
  };
  expect(GraphSettings.of(layout).toLayout()).toEqual(layout);
  expect(GraphSettings.of({ glimit: 'all' }).limit).toBe(Number.POSITIVE_INFINITY);
  expect(GraphSettings.of({ glimit: '50' }).limit).toBe(drawLimit);
  expect(new GraphSettings().toLayout()).toEqual({});
});
