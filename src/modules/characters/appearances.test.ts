import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript, type ProjectManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { appearanceMatrix, evidenceWords, stateOf, type MatrixFilter } from './appearances';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let m: ProjectManuscript;
let codex: ReturnType<CodexService['forProject']>;
let pid: string;

beforeEach(async () => {
  db = new NovelDB(`appearances-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerPlot(registry);
  const p = await projects.create({ title: 'Cast' });
  pid = p.id;
  m = createManuscriptService(db, projects.contentChanged).forProject(p.id);
  codex = createCodexService(db, projects.contentChanged).forProject(p.id);
});

const model = async () => (await loadModel(db, pid))!;
const grid = async (filter: Partial<MatrixFilter> = {}) => {
  const matrix = appearanceMatrix(await model(), { grain: 'chapters', ...filter });
  return { ...matrix, text: matrix.rows.map((r) => `${r.name}: ${r.cells.map((c) => ({ appears: 'A', mentioned: 'M', other: 'o', none: '.' })[c.state]).join('')}`) };
};

/**
 * Four chapters; chapter 2 has two scenes.
 *  Mira   appears in Ch 1 (recorded); mentioned in Ch 2's "Talk" (recorded); linked in Ch 3's text only
 *  Kai    takes part in "The duel", told in Ch 4 at the Keep; listed as involved in Ch 1's plan
 *  Bren   nothing recorded anywhere
 */
async function book() {
  const [mira, kai, bren] = [await codex.create('character', 'Mira'), await codex.create('character', 'Kai'), await codex.create('character', 'Bren')];
  const keep = await codex.create('location', 'The Keep');
  const chapters = [await m.create('chapter', null, 'Arrival'), await m.create('chapter', null, 'The inn'), await m.create('chapter', null, 'The road'), await m.create('chapter', null, 'The duel')];
  const [talk, quiet] = [await m.create('scene', chapters[1].id, 'Talk'), await m.create('scene', chapters[1].id, 'Quiet')];
  await m.updatePlan(chapters[0].id, { appearIds: [mira.id], entityIds: [kai.id] });
  await m.updatePlan(talk.id, { mentionIds: [mira.id] });
  await db.chapters.update(chapters[2].id, { mentions: [mira.id, keep.id] });
  await m.update(chapters[3].id, { status: 'drafting' });
  const timeline = createTimelineService(db, projects.contentChanged).forProject(pid);
  const duel = await timeline.create('The duel');
  await timeline.update(duel.id, { nodeIds: [chapters[3].id], characters: [{ id: kai.id, age: null }], locationId: keep.id });
  const plot = createPlotService(db, projects.contentChanged).forProject(pid);
  const quest = await plot.create('The quest');
  await plot.addBeat(quest.id, { title: 'Setting out', nodeId: chapters[0].id });
  await plot.addBeat(quest.id, { title: 'On the road', nodeId: chapters[2].id });
  return { mira, kai, bren, keep, chapters, talk, quiet, duel, quest };
}

describe('what a cell says, and what it never says', () => {
  it('the author’s appearance record first, then other records, then nothing recorded', async () => {
    await book();
    const { text, hidden } = await grid();
    // Kai and Mira only: Bren has nothing recorded in these chapters, and is left out unless asked for.
    expect(text).toEqual(['Kai: o..o', 'Mira: AMo.']);
    expect(hidden).toBe(1);
    expect((await grid({ all: true })).text).toEqual(['Bren: ....', 'Kai: o..o', 'Mira: AMo.']);
    expect([stateOf([]), stateOf([{ kind: 'linked', nodeId: 'x' }, { kind: 'mentioned', nodeId: 'x' }]), stateOf([{ kind: 'mentioned', nodeId: 'x' }, { kind: 'appears', nodeId: 'x' }])]).toEqual(['none', 'mentioned', 'appears']);
  });

  it('each record is said for what it is, and where it is', async () => {
    const b = await book();
    const mdl = await model();
    const { rows, columns } = appearanceMatrix(mdl, { grain: 'chapters' });
    const [kai, mira] = rows;
    expect(evidenceWords(kai.cells[0].evidence, mdl, columns[0].nodeId)).toEqual(['Listed under “Entities involved” in the plan']);
    expect(evidenceWords(kai.cells[3].evidence, mdl, columns[3].nodeId)).toEqual(['Takes part in “The duel”, told here']);
    expect(evidenceWords(mira.cells[1].evidence, mdl, columns[1].nodeId)).toEqual(['Mentioned, not on the page (your appearance record) (in “Talk”)']);
    expect(evidenceWords(mira.cells[2].evidence, mdl, columns[2].nodeId)).toEqual(['Linked in the text']);
    expect(mira.cells[1].evidence[0].nodeId).toBe(b.talk.id);
  });

  it('by scene: each scene a column, and a chapter with no scenes as itself', async () => {
    await book();
    const { columns, text } = await grid({ grain: 'scenes' });
    expect(columns.map((c) => c.short)).toEqual(['1', '2.1', '2.2', '3', '4']);
    expect(text).toEqual(['Kai: o...o', 'Mira: AM.o.']);
  });
});

describe('filters', () => {
  it('by character, and by name', async () => {
    const b = await book();
    expect((await grid({ characterIds: [b.kai.id] })).text).toEqual(['Kai: o..o']);
    expect((await grid({ text: 'mi' })).text).toEqual(['Mira: AMo.']);
    // Asked for by name, someone with nothing recorded is shown as such, not dropped silently.
    expect((await grid({ characterIds: [b.bren.id], all: true })).text).toEqual(['Bren: ....']);
  });

  it('by a range of chapters, from either end; a scene stands for its chapter', async () => {
    const b = await book();
    expect((await grid({ from: b.chapters[1].id, to: b.chapters[2].id })).columns.map((c) => c.label)).toEqual(['Ch 2: The inn', 'Ch 3: The road']);
    expect((await grid({ from: b.talk.id })).columns.map((c) => c.short)).toEqual(['2', '3', '4']);
    expect((await grid({ to: b.chapters[0].id })).text).toEqual(['Kai: o', 'Mira: A']);
  });

  it('by plot thread, place and status: only the chapters where each is recorded', async () => {
    const b = await book();
    expect((await grid({ threadId: b.quest.id })).columns.map((c) => c.short)).toEqual(['1', '3']);
    // The Keep is linked in Ch 3's text, and is where the duel told in Ch 4 happens.
    expect((await grid({ placeId: b.keep.id })).columns.map((c) => c.short)).toEqual(['3', '4']);
    expect((await grid({ status: 'drafting' })).text).toEqual(['Kai: o']);
    expect((await grid({ status: 'published' })).columns).toEqual([]);
  });
});

describe('the records themselves', () => {
  it('a character appears or is mentioned in a chapter, not both; only characters of this novel', async () => {
    const b = await book();
    let plan = await m.updatePlan(b.chapters[0].id, { mentionIds: [b.mira.id, b.keep.id, 'nobody'] });
    expect([plan.appearIds, plan.mentionIds]).toEqual([[], [b.mira.id]]);
    plan = await m.updatePlan(b.chapters[0].id, { appearIds: [b.mira.id] });
    expect([plan.appearIds, plan.mentionIds]).toEqual([[b.mira.id], []]);
    // The plan's other lists are untouched.
    expect(plan.entityIds).toEqual([b.kai.id]);
  });

  it('a copy of the novel keeps the records, pointing at its own characters', async () => {
    await book();
    const copy = await projects.duplicate(pid);
    const copied = (await loadModel(db, copy.id))!;
    const mira = [...copied.entries.values()].find((e) => e.name === 'Mira')!;
    expect(appearanceMatrix(copied, { grain: 'chapters', characterIds: [mira.id] }).rows.map((r) => r.cells.map((c) => c.state))).toEqual([['appears', 'mentioned', 'other', 'none']]);
  });

  it('a large cast across many chapters is laid out at once', async () => {
    const chars = await Promise.all(Array.from({ length: 40 }, (_, i) => codex.create('character', `C${String(i).padStart(2, '0')}`)));
    for (let c = 0; c < 60; c++) {
      const chapter = await m.create('chapter', null, `Ch ${c}`);
      await m.updatePlan(chapter.id, { appearIds: chars.filter((_, i) => (i + c) % 7 === 0).map((x) => x.id) });
    }
    const mdl = await model();
    const started = performance.now();
    const { rows, columns } = appearanceMatrix(mdl, { grain: 'chapters' });
    expect(performance.now() - started).toBeLessThan(1000);
    expect([rows.length, columns.length, rows.reduce((s, r) => s + r.recorded, 0)]).toEqual([40, 60, 342]);
  });
});
