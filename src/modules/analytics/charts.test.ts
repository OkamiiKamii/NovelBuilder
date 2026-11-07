import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { brokenReferences } from '@/modules/integrity/rules';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { analyticsCharts, niceStep, readChartFilter, toCsv, type ChartFilter, type ChartKey } from './charts';

let n = 0;
let db: NovelDB;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`charts-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerCharacters(registry);
  registerPlot(registry);
});

const ALL: ChartFilter = { from: null, to: null, threadId: null, povId: null, label: null, yearFrom: null, yearTo: null, grain: 'chapters', count: 'any' };
const year = (y: number, month: number | null = null) => ({ precision: 'exact' as const, year: y, month, day: null, hour: null, minute: null });

async function world() {
  const p = await projects.create({ title: 'Charts' });
  const codexService = createCodexService(db, projects.contentChanged);
  const s = {
    codex: codexService.forProject(p.id),
    characters: createCharacterService(db, codexService, projects.contentChanged).forProject(p.id),
    ms: createManuscriptService(db, projects.contentChanged).forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    plot: createPlotService(db, projects.contentChanged).forProject(p.id),
  };
  const model = async () => (await loadModel(db, p.id))!;
  const charts = async (filter: Partial<ChartFilter> = {}) => {
    const all = analyticsCharts(await model(), { ...ALL, ...filter });
    return (key: ChartKey) => all.find((c) => c.key === key)!;
  };
  return { p, ...s, model, charts };
}

/** Three chapters: the first with two scenes (and none of its own text), the second plain, the third not written yet. */
async function book(w: Awaited<ReturnType<typeof world>>) {
  const [one, two, three] = [await w.ms.create('chapter', null, 'The Gate'), await w.ms.create('chapter', null, 'The Hall'), await w.ms.create('chapter', null, 'The Tomb')];
  const [a, b] = [await w.ms.create('scene', one.id, 'Arrival'), await w.ms.create('scene', one.id, 'Night')];
  const words = { [a.id]: 1200, [b.id]: 800, [two.id]: 2600 };
  for (const [id, count] of Object.entries(words)) await db.chapters.update(id, { wordCount: count });
  const [mira, orrin, tam] = [await w.characters.create({ name: 'Mira' }), await w.characters.create({ name: 'Orrin' }), await w.characters.create({ name: 'Tam' })];
  return { one, two, three, a, b, mira, orrin, tam };
}

describe('charts of what is recorded', () => {
  it('words per chapter count its scenes; per scene, each part; a chapter not written yet is zero, and said', async () => {
    const w = await world();
    const { one, two, a, b } = await book(w);
    const words = (await w.charts())('words');
    expect(words.bars.map((x) => [x.short, x.value])).toEqual([['1', 2000], ['2', 2600], ['3', 0]]);
    expect(words.summary).toBe('3 chapters, 4,600 words in all; the most words: Ch 2: The Hall (2,600).');
    expect(words.notes).toEqual(['1 chapter has no words yet; shown at zero, not as short.']);
    expect(words.uses).toMatch(/^The word count saved with each chapter and scene/);
    const scenes = (await w.charts({ grain: 'scenes' }))('words');
    expect(scenes.bars.map((x) => [x.key, x.value])).toEqual([[a.id, 1200], [b.id, 800], [two.id, 2600], [expect.any(String), 0]]);
    expect(scenes.bars[0].label).toBe('Ch 1, scene: Arrival');
    expect(scenes.bars.some((x) => x.key === one.id)).toBe(false);
    // The table and the file hold the same numbers.
    expect(words.table).toEqual({ columns: ['Chapter', 'Words'], rows: [['Ch 1: The Gate', 2000], ['Ch 2: The Hall', 2600], ['Ch 3: The Tomb', 0]] });
  });

  it('chapter lengths fall in bands, and need two written chapters', async () => {
    const w = await world();
    await book(w);
    const lengths = (await w.charts())('lengths');
    expect(lengths.empty).toBeNull();
    expect(lengths.uses).toContain('bands of 250 words');
    expect(lengths.bars.filter((x) => x.value).map((x) => [x.label, x.value, x.detail])).toEqual([
      ['2,000–2,249 words', 1, 'Ch 1: The Gate'],
      ['2,500–2,749 words', 1, 'Ch 2: The Hall'],
    ]);
    expect(lengths.notes).toEqual(['1 chapter has no words yet, and is not counted.']);
    expect((await w.charts({ to: (await w.model()).order.chapters[0].id }))('lengths').empty).toBe('Needs at least two chapters with words: only one has any so far.');
    expect(niceStep(2601, 12)).toBe(250);
    expect(niceStep(30, 30)).toBe(1);
  });

  it('character appearances: from any record, or only on the page; a chapter range narrows them; nothing is searched in the text', async () => {
    const w = await world();
    const { one, two, three, a, mira, orrin } = await book(w);
    await w.ms.updatePlan(a.id, { appearIds: [mira.id], mentionIds: [orrin.id] });
    await w.ms.updatePlan(two.id, { appearIds: [mira.id] });
    const feast = await w.timeline.create('The feast');
    await w.timeline.update(feast.id, { characters: [{ id: orrin.id, age: null }], nodeIds: [three.id] });
    const any = (await w.charts())('appearances');
    expect(any.bars.map((x) => [x.label, x.value])).toEqual([['Mira', 2], ['Orrin', 2]]);
    expect(any.bars[1].detail).toBe('2 chapters of 3: on the page 0, mentioned 1, other records 1');
    expect(any.notes).toEqual(['1 character has nothing recorded in these chapters, and is not shown: not recorded, which is not the same as absent.']);
    const page = (await w.charts({ count: 'page' }))('appearances');
    expect(page.bars.map((x) => [x.label, x.value])).toEqual([['Mira', 2]]);
    const first = (await w.charts({ from: one.id, to: one.id }))('appearances');
    expect(first.bars.map((x) => [x.label, x.value])).toEqual([['Mira', 1], ['Orrin', 1]]);
  });

  it('plot-thread presence, events over story time with the undated said, and the filters that scope them', async () => {
    const w = await world();
    const { one, three } = await book(w);
    const quest = await w.plot.create('The quest');
    const rival = await w.plot.create('The rivalry');
    await w.plot.addBeat(quest.id, { nodeId: one.id, role: 'introduction', title: 'A map' });
    await w.plot.addBeat(quest.id, { nodeId: three.id, role: 'resolution', title: 'Found' });
    await w.plot.addBeat(rival.id, { nodeId: three.id, role: 'development', title: 'A duel' });
    const threads = (await w.charts())('threads');
    expect(threads.bars.map((x) => [x.label, x.value, x.detail])).toEqual([
      ['The quest', 2, 'in 2 of 3 chapters (67%): Ch 1, 3'],
      ['The rivalry', 1, 'in 1 of 3 chapters (33%): Ch 3'],
    ]);
    for (const [name, when, thread] of [['The siege', year(10), quest.id], ['The truce', year(10, 6), null], ['The duel', year(13), rival.id], ['A rumour', null, null]] as const) {
      const e = await w.timeline.create(name);
      if (when) await w.timeline.update(e.id, { when, ...(thread ? { threadIds: [thread] } : {}) });
    }
    const events = (await w.charts())('events');
    expect(events.bars.map((x) => [x.short, x.value])).toEqual([['10', 2], ['11', 0], ['12', 0], ['13', 1]]);
    expect(events.notes).toEqual(['1 event has no date that can be placed, and is not counted.']);
    expect(events.summary).toBe('3 events from Year 10 to Year 13, in groups of 1 year; the busiest: Year 10.');
    expect((await w.charts({ yearFrom: 11 }))('events').bars.map((x) => [x.short, x.value])).toEqual([['11', 0], ['12', 0], ['13', 1]]);
    // A thread scopes its events, and every chapter chart to its chapters.
    const quested = await w.charts({ threadId: quest.id });
    expect(quested('events').bars.map((x) => x.value).reduce((a, b) => a + b, 0)).toBe(1);
    expect(quested('words').bars.map((x) => x.short)).toEqual(['1', '3']);
    expect(quested('threads').bars.map((x) => x.label)).toEqual(['The quest']);
    // No events at all, and events none of which has a date: each its own empty state.
    const bare = await world();
    expect((await bare.charts())('events').empty).toBe('No events yet. Add them on the Timeline.');
    await bare.timeline.create('Undated');
    expect((await bare.charts())('events').empty).toBe('None of the 1 event has a date that can be placed.');
  });

  it('point of view as recorded: a scene with none is told from its chapter’s; it scopes the other charts; none recorded is an empty state', async () => {
    const w = await world();
    const { one, two, b, mira, orrin } = await book(w);
    expect((await w.charts())('pov').empty).toBe('No point of view is recorded. Record it on a chapter’s or scene’s plan, under “Who appears here”, and this chart counts it.');
    await w.ms.updatePlan(one.id, { povIds: [mira.id] });
    await w.ms.updatePlan(b.id, { povIds: [orrin.id] });
    await w.ms.updatePlan(two.id, { povIds: [mira.id] });
    const pov = (await w.charts())('pov');
    expect(pov.bars.map((x) => [x.label, x.value, x.detail])).toEqual([
      ['Mira', 2, '2 chapters and scenes, 3,800 words'],
      ['Orrin', 1, '1 chapter or scene, 800 words'],
    ]);
    expect(pov.notes).toEqual(['1 chapter or scene has no point of view recorded, and is not counted.']);
    // Only Orrin's point of view: the words of his scene alone.
    expect((await w.charts({ povId: orrin.id }))('words').bars.map((x) => [x.short, x.value])).toEqual([['1', 800]]);
  });

  it('the author’s own scene categories, counted as spelled; a category scopes the other charts', async () => {
    const w = await world();
    const { a, b, two } = await book(w);
    expect((await w.charts())('labels').empty).toMatch(/^No labels yet/);
    await w.ms.updatePlan(a.id, { labels: ['Action'] });
    await w.ms.updatePlan(b.id, { labels: ['quiet', 'action'] });
    await w.ms.updatePlan(two.id, { labels: ['Quiet'] });
    const labels = (await w.charts())('labels');
    expect(labels.bars.map((x) => [x.label, x.value, x.detail])).toEqual([
      ['Action', 2, '2 chapters and scenes, 2,000 words'],
      ['quiet', 2, '2 chapters and scenes, 3,400 words'],
    ]);
    expect((await w.charts({ label: 'QUIET' }))('words').bars.map((x) => [x.short, x.value])).toEqual([['1', 800], ['2', 2600]]);
  });

  it('reads its filters from the address, dropping ids that name nothing; writes a CSV a spreadsheet will not run', async () => {
    const w = await world();
    const { one } = await book(w);
    const model = await w.model();
    expect(readChartFilter(new URLSearchParams({ cfrom: one.id, cto: 'gone', cthread: 'gone', cyfrom: '10', cyto: 'x', cgrain: 'scenes', ccount: 'page' }), model)).toEqual({ ...ALL, from: one.id, yearFrom: 10, grain: 'scenes', count: 'page' });
    expect(toCsv(['Chapter', 'Words'], [['Ch 1: "The Gate", again', 2000], ['=SUM(A1)', 3]])).toBe('Chapter,Words\r\n"Ch 1: ""The Gate"", again",2000\r\n\'=SUM(A1),3');
  });

  it('a point of view is the plan’s own record: only this novel’s characters are kept, and a deleted one is a broken reference', async () => {
    const w = await world();
    const { one, mira } = await book(w);
    const place = await w.codex.create('location', 'The Keep');
    const other = await projects.create({ title: 'Elsewhere' });
    const stranger = await createCharacterService(db, createCodexService(db, projects.contentChanged), projects.contentChanged).forProject(other.id).create({ name: 'Stranger' });
    const plan = await w.ms.updatePlan(one.id, { povIds: [mira.id, place.id, stranger.id] });
    expect(plan.povIds).toEqual([mira.id]);
    await db.loreEntries.delete(mira.id);
    expect(brokenReferences(await w.model()).map((b) => [b.table, b.rowId, b.missing])).toEqual([['chapterPlans', one.id, { type: 'entry', id: mira.id }]]);
  });
});
