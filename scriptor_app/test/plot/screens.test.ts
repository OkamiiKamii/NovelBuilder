// The logic of the Plan screens' tests (flutter_app/test/features/plot/plot_screens_test.dart, story_questions_test.dart
// and board_undo_phone_test.dart): a new thread named, given developments in chapters and deleted with Undo; the loom
// said in words; the scene board's moves, statuses and undo, newest first, off while filtered; a card added to a thread
// as an appearance only and taken out again; a chapter moved with its scenes asked about first; the plan page's own
// fields, beats, who appears and labels, never the text; the questions an empty thread list asks. What those check of
// the widgets themselves (taps, scrolling, the Undo staying on screen, contrast) belongs to the screens; the presses are
// run here as the changes they make, on a real library, as the screens run them (PlotService.change, the manuscript
// service's move and status).

import { openLibrary } from '../../src/data/library';
import type { JsonMap } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { BoardHistory, dropOf, nudgePlace, placeOf } from '../../src/domain/plot/board';
import { diagnose } from '../../src/domain/plot/diagnostics';
import { roleKey } from '../../src/domain/plot/lanes';
import { PlotService, threadPath, threadsPath } from '../../src/domain/plot/plotService';
import { addToThread, boardView, bulkDialog, chapterCard, sceneCard, threadChips } from '../../src/domain/plot/screens/boardPage';
import { StrandPlan, legendDrawing, loomLegend, strandCard, strandDrawing } from '../../src/domain/plot/screens/loom';
import { labelPicker, planChanges, planPage, withLabel } from '../../src/domain/plot/screens/planPage';
import { canAddBeat, deleteThreadDialog, deletedMessage, goneChoice, threadChanges, threadPage } from '../../src/domain/plot/screens/threadPage';
import { anyAsked, askTheQuestions, askedMessage, noThreadFilters, storyQuestions, storyQuestionsWords, threadsView } from '../../src/domain/plot/screens/threads';
import { maps } from '../../src/domain/records/jsonRecord';
import type { StoryNode } from '../../src/domain/records/storyNode';
import { testIds } from '../fixtures';
import { memoryLibrary } from '../nodeSql';

/** A novel with Mira, two chapters, and two scenes in the first. */
function setUp() {
  let now = Date.UTC(2026, 10, 17, 9);
  const lib = openLibrary(memoryLibrary(), () => (now += 1000), testIds());
  const novel = lib.library.create({ title: 'Ashfall' }).novel.id;
  // A new novel comes with chapter one: the test's own chapters replace it, as the Flutter test's empty novel has none.
  for (const n of lib.manuscript.nodes(novel)) lib.manuscript.delete(novel, n.id, n.title);
  lib.novels.writeRows(novel, [
    { collection: 'loreEntries', id: 'mira', value: { id: 'mira', projectId: novel, category: 'character', name: 'Mira', fields: [] } },
  ]);
  const one = lib.manuscript.create(novel, 'chapter', null, 'The Gate').id;
  const two = lib.manuscript.create(novel, 'chapter', null, 'The River').id;
  const a = lib.manuscript.create(novel, 'scene', one, 'Arrival').id;
  const b = lib.manuscript.create(novel, 'scene', one, 'Bargain').id;
  const plot = new PlotService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() });
  const model = () => StoryModel.fromSnapshot(lib.novels.load(novel)!);
  const nodes = (): StoryNode[] => [...model().nodes.values()];
  const scenesOf = (chapterId: string) =>
    nodes()
      .filter((n) => n.parentId === chapterId)
      .sort((x, y) => x.order - y.order)
      .map((n) => n.title);
  const plan = (nodeId: string): JsonMap | undefined => lib.novels.rowsIn(novel, 'chapterPlans').find((r) => r['id'] === nodeId);
  return { lib, novel, mira: 'mira', one, two, a, b, plot, model, nodes, scenesOf, plan };
}

test('a new thread is named, given developments in chapters, and deleted with Undo', () => {
  const w = setUp();
  const id = w.plot.change(w.novel, (x) => x.createThread());
  expect(threadPath(id)).toBe(`/plan/thread/${id}`);
  w.plot.change(w.novel, threadChanges.update(id, { title: 'The stolen key' }));
  w.plot.change(w.novel, threadChanges.update(id, { premise: 'Who took the key?' }));
  let thread = w.model().threads.get(id)!;
  expect([thread.title, thread.premise]).toEqual(['The stolen key', 'Who took the key?']);

  w.plot.change(w.novel, threadChanges.addBeat(id, { title: 'The key is missing', nodeId: w.one, role: 'introduction' })!);
  thread = w.model().threads.get(id)!;
  const beat = thread.beats[0];
  expect([beat.title, beat.nodeId, roleKey(beat)]).toEqual(['The key is missing', w.one, 'introduction']);
  const page = threadPage(w.model(), id);
  if (page.missing) throw new Error('missing');
  expect(page.developments.beats[0].open?.label).toBe('Open Ch 1: The Gate');

  // Someone appearing needs no words of the author's.
  expect(canAddBeat('', 'appears')).toBe(true);
  expect(canAddBeat('  ', 'development')).toBe(false);
  expect(threadChanges.addBeat(id, { title: '', nodeId: w.b, role: 'development' })).toBeNull();
  w.plot.change(w.novel, threadChanges.addBeat(id, { title: '', nodeId: w.b, role: 'appears' })!);
  expect(w.model().threads.get(id)!.beats.map(roleKey)).toEqual(['introduction', 'appears']);

  const second = threadPage(w.model(), id);
  if (second.missing) throw new Error('missing');
  expect(second.developments.beats[1].removeTip).toBe('Remove development 2');
  w.plot.change(w.novel, threadChanges.removeBeat(id, second.developments.beats[1].beatId));
  expect(w.model().threads.get(id)!.beats).toHaveLength(1);

  const dialog = deleteThreadDialog(w.model().threads.get(id)!);
  expect(dialog.message).toContain('Chapters, scenes and entries are not changed');
  const kept = w.plot.deleteThread(w.novel, id, { title: dialog.name });
  expect(w.model().threads.size).toBe(0);
  expect(deletedMessage(dialog.name)).toEqual({ message: 'Deleted The stolen key.', action: 'Undo' });
  expect(threadsPath).toBe('/plan/threads');
  w.plot.undo(kept);
  expect(w.model().threads.get(id)!.beats[0].title).toBe('The key is missing');
  expect(w.nodes()).toHaveLength(4); // the manuscript is never touched
});

test('each thread is a strand on the loom, knotted where it develops and said in words', () => {
  const w = setUp();
  w.plot.change(w.novel, (x) => {
    const crown = x.createThread('The stolen crown');
    x.updateThread(crown, () => ({ status: 'resolved' }));
    x.addBeat(crown, { title: 'Missing', nodeId: w.one, role: 'introduction' });
    x.addBeat(crown, { title: 'Unmasked', nodeId: w.b, role: 'resolution' });
    x.addBeat(crown, { title: 'After', nodeId: w.two });
    const comet = x.createThread('The red comet');
    x.addBeat(comet, { title: 'Not placed yet' });
  });
  const view = threadsView(w.model(), 'Ashfall', noThreadFilters, 'status', 20);
  expect(view.showLegend).toBe(true);
  expect(loomLegend.map((l) => l.text)).toContain('Long gap');
  const model = w.model();
  const cards = view.report.reports.map((r) => strandCard(r, model, view.report.frontier, view.report.chapterCount));
  const crown = cards.find((c) => c.title === 'The stolen crown')!;
  // A scene's development sits on its chapter.
  expect(crown.semanticsLabel).toMatch(/^Developments in chapters 1, 2 of 2; tied off at chapter 2/);
  expect(crown.span).toBe('Chapters 1–2 · tied off');
  const comet = cards.find((c) => c.title === 'The red comet')!;
  expect(comet.semanticsLabel).toMatch(/No developments placed in chapters/);
  expect(comet.span).toBe('Not placed in any chapter yet');
  // The drawing: a warp, a tick a chapter, the strand, its knots; the resolution (in chapter 1, its scene) a diamond,
  // and, its last development being in chapter 2, a tied knot there too.
  const shapes = strandDrawing(crown.plan, 2, view.report.frontier, 360);
  expect(shapes.filter((s) => s.shape === 'line' && s.stroke.color === 'tone')).toHaveLength(1);
  expect(shapes.filter((s) => s.shape === 'path' && s.fill?.color === 'tone')).toHaveLength(2);
  expect(legendDrawing('fray').every((s) => s.shape === 'path')).toBe(true);
});

test('a quiet active thread frays where the words stop, and a long gap is bracketed', () => {
  const w = setUp();
  for (let i = 0; i < 6; i++) w.lib.manuscript.create(w.novel, 'chapter', null, `More ${i}`);
  const last = w.nodes().filter((n) => n.kind === 'chapter').sort((a, b) => a.order - b.order).at(-1)!;
  w.lib.novels.writeRows(w.novel, [{ collection: 'chapters', id: last.id, value: { ...last.raw, wordCount: 500 } }]);
  w.plot.change(w.novel, (x) => {
    const t = x.createThread('Quiet one');
    x.updateThread(t, () => ({ status: 'active' }));
    x.addBeat(t, { title: 'Begins', nodeId: w.one, role: 'introduction' });
  });
  const report = diagnose([...w.model().threads.values()], w.nodes(), 5);
  const r = report.reports[0];
  expect(r.issues.map((i) => i.kind)).toEqual(['quiet']);
  const plan = StrandPlan.of(r, null);
  expect(plan.quiet && plan.open).toBe(true);
  const shapes = strandDrawing(plan, report.chapterCount, report.frontier, 400);
  expect(shapes.filter((s) => s.shape === 'path' && s.stroke?.color === 'fray')).toHaveLength(4);
});

test('the scene board moves scenes and sets statuses, and undoes each, newest first', () => {
  const w = setUp();
  const v = () => boardView(w.model(), { text: '', status: null, threadId: null });
  expect(v().subtitle).toBe('2 chapters · 2 scenes · 0 words');
  expect(w.scenesOf(w.one)).toEqual(['Arrival', 'Bargain']);
  let history = BoardHistory.empty;
  const node = (id: string) => w.nodes().find((n) => n.id === id)!;
  const move = (id: string, to: { parentId: string | null; beforeId: string | null }) => {
    const all = w.nodes();
    const drop = dropOf(all, id, to)!;
    const from = placeOf(all, id)!;
    w.lib.manuscript.move(w.novel, id, drop.parentId, drop.beforeId);
    history = history.remember({ kind: 'move', nodeId: id, title: node(id).title, from, to: drop }, w.nodes());
  };

  expect(sceneCard(v(), node(w.a), 0).later).toEqual({ tip: 'Move Arrival later', enabled: true });
  move(w.a, nudgePlace(w.nodes(), node(w.a), 1)!);
  expect(w.scenesOf(w.one)).toEqual(['Bargain', 'Arrival']);
  expect(history.undoLabel).toBe('Undo move of “Arrival”');

  // Into the other chapter, by its menu.
  const menu = sceneCard(v(), node(w.b), 0).toChapter!;
  expect(menu.tip).toBe('Move Bargain to chapter');
  move(w.b, { parentId: menu.chapters.find((c) => c.label === 'The River')!.value, beforeId: null });
  expect(w.scenesOf(w.two)).toEqual(['Bargain']);

  const before = node(w.one).status;
  w.lib.manuscript.setStatus(w.novel, w.one, 'published');
  history = history.remember({ kind: 'status', nodeId: w.one, title: 'The Gate', from: before, to: 'published' }, w.nodes());
  expect(history.said).toBe('“The Gate” set to Published.');

  const undo = () => {
    const taken = history.takeLast(w.nodes())!;
    expect(taken.problem).toBeNull();
    if (taken.change.kind === 'move') w.lib.manuscript.move(w.novel, taken.change.nodeId, taken.change.from.parentId, taken.change.from.beforeId);
    else w.lib.manuscript.setStatus(w.novel, taken.change.nodeId, taken.change.from);
    history = taken.history.undone(taken.words);
  };
  expect(history.undoLabel).toBe('Undo status of “The Gate”');
  undo();
  expect(node(w.one).status).toBe(before);
  expect(history.undoLabel).toBe('Undo move of “Bargain”');
  undo();
  expect(w.scenesOf(w.one)).toEqual(['Bargain', 'Arrival']);
  undo();
  expect(w.scenesOf(w.one)).toEqual(['Arrival', 'Bargain']);
  expect(history.last).toBeNull();

  // Filtered, moving is off.
  const filtered = boardView(w.model(), { text: 'Arr', status: null, threadId: null });
  expect(filtered.filteredNote).toMatch(/^Moving is off while the board is filtered/);
  expect(filtered.movable).toBe(false);
  expect(filtered.shown.flatMap((p) => p.columns.flatMap((c) => c.scenes.map((s) => s.node.title)))).toEqual(['Arrival']);
});

test('on a short phone, a chapter moved later is put back by Undo', () => {
  const w = setUp();
  const gate = () => w.nodes().find((n) => n.id === w.one)!;
  const to = nudgePlace(w.nodes(), gate(), 1)!;
  const from = placeOf(w.nodes(), w.one)!;
  w.lib.manuscript.move(w.novel, w.one, to.parentId, to.beforeId);
  const history = BoardHistory.empty.remember({ kind: 'move', nodeId: w.one, title: 'The Gate', from, to }, w.nodes());
  expect(gate().order).toBe(1);
  expect(history.undoLabel).toBe('Undo move of “The Gate”');
  const taken = history.takeLast(w.nodes())!;
  if (taken.change.kind !== 'move') throw new Error('a move');
  w.lib.manuscript.move(w.novel, w.one, taken.change.from.parentId, taken.change.from.beforeId);
  expect(gate().order).toBe(0);
});

test('a card is added to a thread as an appearance only, and taken out again', () => {
  const w = setUp();
  const id = w.plot.change(w.novel, (x) => x.createThread('The stolen key'));
  const arrival = () => w.nodes().find((n) => n.id === w.a)!;
  const chips = () => threadChips(boardView(w.model(), { text: '', status: null, threadId: null }), w.model(), arrival())!;
  expect(chips().add?.tip).toBe('Add Arrival to a plot thread');
  w.plot.change(w.novel, addToThread(id, w.a));
  const beat = w.model().threads.get(id)!.beats[0];
  expect([beat.nodeId, roleKey(beat), beat.title]).toEqual([w.a, 'appears', '']);
  expect(chips().chips[0].label).toBe('The stolen key · appears');
  const remove = chips().chips[0].remove!;
  expect(remove.tip).toBe('Take Arrival out of The stolen key');
  w.plot.change(w.novel, remove.change);
  expect(w.model().threads.get(id)!.beats).toHaveLength(0);

  // Showing one thread narrows the board to where it is recorded.
  w.plot.change(w.novel, (x) => x.addBeat(id, { title: 'Clue', nodeId: w.two, role: 'development' }));
  const shown = boardView(w.model(), { text: '', status: null, threadId: id });
  expect(shown.thread?.banner).toMatch(/^Showing where “The stolen key” is recorded: 1 chapter or scene/);
  const titles = shown.shown.flatMap((p) => p.columns.flatMap((c) => [c.chapter.title, ...c.scenes.map((s) => s.node.title)]));
  expect(titles).toContain('The River');
  expect(titles).not.toContain('Arrival');
});

test('moving a chapter with its scenes into a volume asks first', () => {
  const w = setUp();
  const volume = w.lib.manuscript.create(w.novel, 'volume', null, 'Book One').id;
  const v = boardView(w.model(), { text: '', status: null, threadId: null });
  const gate = v.parts.flatMap((p) => p.columns).find((c) => c.chapter.id === w.one)!;
  const into = chapterCard(v, gate).into!;
  expect(into.tip).toBe('Move The Gate into');
  const home = into.homes.find((h) => h.label.includes('Book One'))!;
  const drop = dropOf(w.nodes(), w.one, { parentId: home.value, beforeId: null })!;
  const ask = bulkDialog(w.nodes(), gate.chapter, drop)!;
  expect(ask.title).toBe('Move a chapter with its scenes');
  expect(ask.message).toBe('Move “The Gate” and its 2 scenes (0 words) into “Book One”? Everything inside it goes with it, and you can undo this.');
  // Cancelled: nothing moves.
  expect(w.nodes().find((n) => n.id === w.one)!.parentId).toBeNull();
  w.lib.manuscript.move(w.novel, w.one, drop.parentId, drop.beforeId);
  expect(w.nodes().find((n) => n.id === w.one)!.parentId).toBe(volume);
  expect(w.scenesOf(w.one)).toEqual(['Arrival', 'Bargain']);
});

test('the plan page keeps its own fields, beats and who appears, and never the text', () => {
  const w = setUp();
  const page = () => {
    const p = planPage(w.model(), w.lib.novels.load(w.novel)!, w.one);
    if (p.missing) throw new Error('missing');
    return p;
  };
  expect(page().title).toBe('Plan: The Gate');
  w.plot.change(w.novel, planChanges.plan(w.one, { objective: 'Get them inside' }));
  expect(w.plan(w.one)?.['objective']).toBe('Get them inside');
  w.plot.change(w.novel, planChanges.node(w.one, { summary: 'They reach the gate.' }));
  expect(w.nodes().find((n) => n.id === w.one)!.summary).toBe('They reach the gate.');

  let n = 0;
  const id = () => `beat${++n}`;
  expect(planChanges.addBeat(w.one, '   ', id)).toBeNull();
  w.plot.change(w.novel, planChanges.addBeat(w.one, 'The guard refuses', id)!);
  w.plot.change(w.novel, planChanges.addBeat(w.one, 'Mira bribes him', id)!);
  const texts = () => maps(w.plan(w.one)?.['beats']).map((b) => b['text']);
  expect(texts()).toEqual(['The guard refuses', 'Mira bribes him']);
  expect(page().beats.items[1].up).toBe('Move beat 2 up');
  w.plot.change(w.novel, planChanges.moveBeat(w.one, page().beats.items[1].id, -1));
  expect(texts()).toEqual(['Mira bribes him', 'The guard refuses']);

  const appear = page().appearances!.lists[0];
  expect(appear.addTip).toBe('Add to Appears');
  w.plot.change(w.novel, planChanges.plan(w.one, { appearIds: [w.mira] }));
  expect(w.plan(w.one)?.['appearIds']).toEqual([w.mira]);
  // Recording her as mentioned moves her from the other list.
  const mentioned = page().appearances!.lists[1];
  expect(mentioned.options.find((o) => o.value === w.mira)!.label).toBe('Mira (moves from the other list)');
  w.plot.change(w.novel, planChanges.plan(w.one, { mentionIds: [w.mira] }));
  expect(w.plan(w.one)?.['appearIds']).toEqual([]);
  expect(w.plan(w.one)?.['mentionIds']).toEqual([w.mira]);

  expect(page().labels.addTip).toBe('Add a label to this chapter');
  w.plot.change(w.novel, planChanges.plan(w.one, { labels: withLabel([], 'Action') }));
  expect(w.plan(w.one)?.['labels']).toEqual(['Action']);
  expect(page().labels.offered).not.toContain('Action');
  expect(w.lib.novels.rowsIn(w.novel, 'chapterContents').every((r) => r['id'] !== 'beat1')).toBe(true);
});

test('an empty thread list asks the story’s questions; each answered becomes a thread of its kind', () => {
  const w = setUp();
  expect(threadsView(w.model(), 'Ashfall', noThreadFilters, 'status', 20).empty).toBe(true);
  expect(storyQuestionsWords.title).toBe('The questions your story asks');
  const texts = ['Can Ren survive the SSS rank', 'Who made the first skill?', '', ''];
  expect(anyAsked(['', ' '])).toBe(false);
  expect(anyAsked(texts)).toBe(true);
  const made = w.plot.change(w.novel, (x) => askTheQuestions(x, storyQuestions.map((q, i) => [q, texts[i]] as const)));
  const threads = Object.fromEntries([...w.model().threads.values()].map((t) => [t.title, t.category]));
  expect(threads).toEqual({ 'Can Ren survive the SSS rank?': 'main', 'Who made the first skill?': 'mystery' });
  expect(askedMessage(made)).toMatch(/^Your 2 threads are ready/);
  expect(threadsView(w.model(), 'Ashfall', noThreadFilters, 'status', 20).empty).toBe(false);
});

test('a development whose chapter was removed is shown as such and keeps its place until moved', () => {
  const w = setUp();
  const id = w.plot.change(w.novel, (x) => x.createThread('Lost'));
  w.plot.change(w.novel, (x) => x.addBeat(id, { title: 'Was here', nodeId: w.two }));
  w.lib.manuscript.delete(w.novel, w.two, 'The River');
  const page = threadPage(w.model(), id);
  if (page.missing) throw new Error('missing');
  const beat = page.developments.beats[0];
  expect([beat.place, beat.struck, beat.node.value]).toEqual(['Chapter removed', true, goneChoice]);
  expect(threadChanges.beatNode(id, beat.beatId, goneChoice)).toBeNull();
  expect(page.checks?.lines).toEqual(['• 1 development points at a chapter or scene that is no longer in the manuscript.']);
  expect(labelPicker([], [], '').addTip).toBe('Add a label');
});
