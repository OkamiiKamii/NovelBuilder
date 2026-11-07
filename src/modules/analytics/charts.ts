import { appearanceMatrix } from '@/modules/characters/appearances';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { spanOfEvent, timeContext } from '@/modules/model/validity';
import { placesOf, threadLanes } from '@/modules/plot/lanes';
import { yearName } from '@/modules/timeline/calendar';

/**
 * CHARTS OF WHAT IS RECORDED
 * Counts and distributions read straight off the novel's records: words
 * saved in each chapter and scene, the author's appearance records and other
 * records tying characters to chapters, plot-thread developments and events,
 * event dates, points of view and the author's own labels. Nothing is scored
 * or judged: no quality, impact or genre is inferred, and every chart says
 * what it uses and what it leaves out. Pure: it reads, and changes nothing.
 */

/** The charts' filters and settings in the page address, kept by saved views. */
export const CHART_PARAMS = ['cfrom', 'cto', 'cthread', 'cpov', 'clabel', 'cyfrom', 'cyto', 'cgrain', 'ccount'] as const;
export const chartLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(CHART_PARAMS.flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])));

export interface ChartFilter {
  /** A range of chapters, by id, both included; either end may be open. */
  from: string | null;
  to: string | null;
  /** Only the chapters and scenes this thread is recorded in, and its events. */
  threadId: string | null;
  /** Only the chapters and scenes told from this character's point of view. */
  povId: string | null;
  /** Only the chapters and scenes with this label. */
  label: string | null;
  /** Story years, both included: for the events chart (chapters have no dates of their own). */
  yearFrom: number | null;
  yearTo: number | null;
  /** Words per chapter, or per scene. */
  grain: 'chapters' | 'scenes';
  /** Character appearances counted from any record, or only from appearance records ("on the page"). */
  count: 'any' | 'page';
}

const whole = (value: string | null) => (value !== null && value.trim() !== '' && Number.isInteger(Number(value)) ? Number(value) : null);

/** The filter the address asks for; ids that name nothing in this novel are dropped. */
export function readChartFilter(params: URLSearchParams, model: Pick<StoryModel, 'nodes' | 'threads' | 'entries'>): ChartFilter {
  const node = (key: string) => (params.get(key) && model.nodes.has(params.get(key)!) ? params.get(key) : null);
  return {
    from: node('cfrom'),
    to: node('cto'),
    threadId: params.get('cthread') && model.threads.has(params.get('cthread')!) ? params.get('cthread') : null,
    povId: params.get('cpov') && model.entries.has(params.get('cpov')!) ? params.get('cpov') : null,
    label: params.get('clabel')?.trim() || null,
    yearFrom: whole(params.get('cyfrom')),
    yearTo: whole(params.get('cyto')),
    grain: params.get('cgrain') === 'scenes' ? 'scenes' : 'chapters',
    count: params.get('ccount') === 'page' ? 'page' : 'any',
  };
}

export type ChartKey = 'words' | 'lengths' | 'appearances' | 'threads' | 'events' | 'pov' | 'labels';

export interface ChartBar {
  key: string;
  /** On the axis: short ("3", "Mira", "10–19"). */
  short: string;
  /** In full, for the tooltip and the table. */
  label: string;
  value: number;
  /** The record it is, to select; null when it is not one (a range of years). */
  ref: EntityRef | null;
  /** More about it, in words, for the tooltip. */
  detail: string;
}

export interface Chart {
  key: ChartKey;
  title: string;
  /** What it counts, and from which records. */
  uses: string;
  /** What a bar's length is: "Words", "Chapters". */
  measure: string;
  /** The same, counted: one, and many. */
  units: [string, string];
  /** Columns along the story, or bars for things that have names. */
  shape: 'columns' | 'bars';
  bars: ChartBar[];
  /** Why there is nothing to draw, when there is not. */
  empty: string | null;
  /** A sentence of what the chart shows, for a screen reader and the caption. */
  summary: string;
  /** What is left out, or not recorded: said, never filled in. */
  notes: string[];
  /** The same data as a table, and as a downloadable file. */
  table: { columns: string[]; rows: (string | number)[][] };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const fmt = (n: number) => n.toLocaleString();
/** A step that keeps at most `most` groups across a stretch: 1, 2, 5, 10, 20, 25, 50, 100… */
export function niceStep(stretch: number, most: number): number {
  for (let scale = 1; ; scale *= 10) for (const step of [1, 2, 2.5, 5]) if (step * scale >= 1 && Number.isInteger(step * scale) && Math.ceil(stretch / (step * scale)) <= most) return step * scale;
}

/** Everything the charts read, worked out once. */
function scope(model: StoryModel, filter: ChartFilter) {
  const chapters = model.order.chapters;
  const index = (id: string | null) => (id ? chapters.findIndex((c) => c.id === id || model.nodes.get(id)?.parentId === c.id) : -1);
  const lo = filter.from ? Math.max(0, index(filter.from)) : 0;
  const hi = filter.to && index(filter.to) >= 0 ? index(filter.to) : chapters.length - 1;
  const position = (id: string) => model.order.position.get(id) ?? 0;
  const scenesOf = (chapterId: string) => [...model.nodes.values()].filter((n) => n.parentId === chapterId && n.kind === 'scene').sort((a, b) => position(a.id) - position(b.id));
  const threadNodes = filter.threadId ? new Set(placesOf(model.threads.get(filter.threadId)!, model).map((p) => p.nodeId)) : null;
  // A scene with no point of view of its own is told from its chapter's.
  const povOf = (nodeId: string): string[] => {
    const own = (model.plans.get(nodeId)?.povIds ?? []).filter((id) => model.entries.has(id));
    const parent = model.nodes.get(nodeId)?.parentId;
    return own.length || !parent || model.nodes.get(parent)?.kind !== 'chapter' ? own : (model.plans.get(parent)?.povIds ?? []).filter((id) => model.entries.has(id));
  };
  const spelling = new Map<string, string>();
  for (const node of [...model.nodes.values()].sort((a, b) => position(a.id) - position(b.id))) for (const l of model.plans.get(node.id)?.labels ?? []) if (!spelling.has(l.toLowerCase())) spelling.set(l.toLowerCase(), l);
  const labelsOf = (nodeId: string) => [...new Set((model.plans.get(nodeId)?.labels ?? []).map((l) => spelling.get(l.toLowerCase())!))];
  const chapterOf = (nodeId: string) => (model.nodes.get(nodeId)?.kind === 'scene' ? model.nodes.get(nodeId)!.parentId : nodeId);
  /** Whether a chapter or scene passes the thread, point-of-view and label filters. */
  const passes = (nodeId: string, skip: 'pov' | 'label' | null = null) =>
    (!threadNodes || threadNodes.has(nodeId) || threadNodes.has(chapterOf(nodeId) ?? '')) && (skip === 'pov' || !filter.povId || povOf(nodeId).includes(filter.povId)) && (skip === 'label' || !filter.label || labelsOf(nodeId).some((l) => l.toLowerCase() === filter.label!.toLowerCase()));
  const narrowed = Boolean(threadNodes || filter.povId || filter.label);

  /** Each chapter in range, with its parts: its own text (when it has scenes, only if it holds words) and its scenes. */
  const inRange = chapters.slice(lo, hi + 1).map((chapter, k) => {
    const number = lo + k + 1;
    const scenes = scenesOf(chapter.id);
    const title = (n: { title: string; kind: string }) => n.title.trim() || (n.kind === 'scene' ? 'Untitled scene' : 'Untitled chapter');
    const parts = [...(!scenes.length || chapter.wordCount > 0 ? [{ node: chapter, label: scenes.length ? `Ch ${number}: ${title(chapter)} (chapter text)` : `Ch ${number}: ${title(chapter)}`, short: `${number}` }] : []), ...scenes.map((s, i) => ({ node: s, label: `Ch ${number}, scene: ${title(s)}`, short: `${number}.${i + 1}` }))];
    return { chapter, number, label: `Ch ${number}: ${title(chapter)}`, parts };
  });
  /** Every chapter and scene in range that passes, each counted once: the documents a count by scene reads. */
  const documents = (skip: 'pov' | 'label' | null = null) => inRange.flatMap((c) => c.parts.filter((p) => passes(p.node.id, skip)).map((p) => ({ ...p, chapterNumber: c.number })));
  /** A chapter's words: its own text and every scene's. */
  const chapterWords = (chapterId: string) => (model.nodes.get(chapterId)?.wordCount ?? 0) + scenesOf(chapterId).reduce((n, x) => n + x.wordCount, 0);
  return { chapters, lo, hi, inRange, documents, passes, narrowed, povOf, labelsOf, threadNodes, chapterWords };
}

/** Every chart, for the novel as filtered. */
export function analyticsCharts(model: StoryModel, filter: ChartFilter): Chart[] {
  const s = scope(model, filter);
  const filterWords = s.narrowed ? ' Only what passes the filters is counted.' : '';
  const charts: Chart[] = [];

  // 1. Words per chapter, or per scene.
  {
    const bars: ChartBar[] =
      filter.grain === 'chapters'
        ? s.inRange.flatMap((c) => {
            const parts = c.parts.filter((p) => s.passes(p.node.id));
            if (s.narrowed && !parts.length) return [];
            const words = s.narrowed ? parts.reduce((n, p) => n + p.node.wordCount, 0) : s.chapterWords(c.chapter.id);
            return [{ key: c.chapter.id, short: `${c.number}`, label: c.label, value: words, ref: { type: 'node' as const, id: c.chapter.id }, detail: `${plural(words, 'word')}${c.parts.length > 1 ? `, in ${plural(c.parts.length, 'part')}` : ''}` }];
          })
        : s.documents().map((d) => ({ key: d.node.id, short: d.short, label: d.label, value: d.node.wordCount, ref: { type: 'node' as const, id: d.node.id }, detail: plural(d.node.wordCount, 'word') }));
    const total = bars.reduce((n, b) => n + b.value, 0);
    const longest = bars.reduce<ChartBar | null>((best, b) => (!best || b.value > best.value ? b : best), null);
    const unwritten = bars.filter((b) => b.value === 0).length;
    charts.push({
      key: 'words',
      title: `Words per ${filter.grain === 'chapters' ? 'chapter' : 'chapter and scene'}`,
      uses: `The word count saved with each chapter and scene in the manuscript, in reading order.${filter.grain === 'chapters' ? ' A chapter counts its own text and its scenes’.' : ' A chapter with scenes shows its own text apart, when it holds any.'}${filterWords}`,
      measure: 'Words',
      units: ['word', 'words'],
      shape: 'columns',
      bars,
      empty: !model.order.chapters.length ? 'No chapters yet. Add them in the Organizer.' : !bars.length ? 'No chapters or scenes match these filters.' : total === 0 ? 'Nothing is written yet in these chapters, so there are no words to count.' : null,
      summary: bars.length ? `${plural(bars.length, filter.grain === 'chapters' ? 'chapter' : 'chapter or scene', filter.grain === 'chapters' ? 'chapters' : 'chapters and scenes')}, ${plural(total, 'word')} in all${longest && longest.value ? `; the most words: ${longest.label} (${fmt(longest.value)})` : ''}.` : '',
      notes: unwritten ? [`${plural(unwritten, filter.grain === 'chapters' ? 'chapter has' : 'chapter or scene has', filter.grain === 'chapters' ? 'chapters have' : 'chapters and scenes have')} no words yet; shown at zero, not as short.`] : [],
      table: { columns: [filter.grain === 'chapters' ? 'Chapter' : 'Chapter or scene', 'Words'], rows: bars.map((b) => [b.label, b.value]) },
    });

    // 2. How long chapters are: how many fall in each band of lengths.
    const chapterWords = s.inRange.flatMap((c) => {
      const parts = c.parts.filter((p) => s.passes(p.node.id));
      if (s.narrowed && !parts.length) return [];
      return [{ label: c.label, words: s.narrowed ? parts.reduce((n, p) => n + p.node.wordCount, 0) : s.chapterWords(c.chapter.id) }];
    });
    const written = chapterWords.filter((c) => c.words > 0);
    const step = written.length ? niceStep(Math.max(...written.map((c) => c.words)) + 1, 12) : 1;
    const bands = written.length ? Array.from({ length: Math.floor(Math.max(...written.map((c) => c.words)) / step) + 1 }, (_, i) => i) : [];
    const lengthBars: ChartBar[] = bands.map((i) => {
      const [from, to] = [i * step, (i + 1) * step - 1];
      const here = written.filter((c) => c.words >= from && c.words <= to);
      return { key: `band-${i}`, short: `${from >= 1000 ? `${from / 1000}K` : from}`, label: `${fmt(from)}–${fmt(to)} words`, value: here.length, ref: null, detail: here.length ? here.map((c) => c.label).join('; ') : 'No chapter' };
    });
    charts.push({
      key: 'lengths',
      title: 'How long chapters are',
      uses: `Each chapter’s words (its own text and its scenes’), counted into bands of ${fmt(step)} words: how many chapters fall in each. Chapters with no words yet are left out, as not written.${filterWords}`,
      measure: 'Chapters',
      units: ['chapter', 'chapters'],
      shape: 'columns',
      bars: lengthBars,
      empty: written.length < 2 ? `Needs at least two chapters with words${written.length ? ': only one has any so far' : ''}.` : null,
      summary: written.length ? `${plural(written.length, 'chapter')} with words, in bands of ${fmt(step)} words; the most chapters in one band: ${Math.max(...lengthBars.map((b) => b.value))}.` : '',
      notes: chapterWords.length > written.length ? [`${plural(chapterWords.length - written.length, 'chapter has', 'chapters have')} no words yet, and ${chapterWords.length - written.length === 1 ? 'is' : 'are'} not counted.`] : [],
      table: { columns: ['Length', 'Chapters', 'Which'], rows: lengthBars.map((b) => [b.label, b.value, b.value ? b.detail : '']) },
    });
  }

  // 3. Character appearances: in how many chapters each character is recorded.
  {
    const matrix = appearanceMatrix(model, { grain: 'chapters', from: filter.from, to: filter.to, threadId: filter.threadId });
    const kept = matrix.columns.map((col) => {
      if (!filter.povId && !filter.label) return true;
      const c = s.inRange.find((x) => x.chapter.id === col.chapterId);
      return Boolean(c?.parts.some((p) => s.passes(p.node.id)));
    });
    const rows = matrix.rows.map((r) => {
      const cells = r.cells.filter((_, i) => kept[i]);
      const page = cells.filter((c) => c.state === 'appears').length;
      const mentioned = cells.filter((c) => c.state === 'mentioned').length;
      const other = cells.filter((c) => c.state === 'other').length;
      return { r, page, mentioned, other, any: page + mentioned + other };
    });
    const counted = rows.map((x) => ({ ...x, value: filter.count === 'page' ? x.page : x.any })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value || a.r.name.localeCompare(b.r.name));
    const columns = kept.filter(Boolean).length;
    const characters = [...model.entries.values()].filter((e) => e.category === 'character').length;
    charts.push({
      key: 'appearances',
      title: 'Character appearances',
      uses: filter.count === 'page' ? 'Your appearance records only: the chapters in which you record a character as on the page (a chapter counts its scenes’ records).' : 'Every record tying a character to a chapter or its scenes: your appearance records (on the page, or mentioned), links in the text, “Entities involved” in a plan, and events told there that they take part in. No text is searched for names.',
      measure: 'Chapters',
      units: ['chapter', 'chapters'],
      shape: 'bars',
      bars: counted.map((x) => ({ key: x.r.characterId, short: x.r.name, label: x.r.name, value: x.value, ref: { type: 'entry' as const, id: x.r.characterId }, detail: `${plural(x.value, 'chapter')} of ${columns}: on the page ${x.page}, mentioned ${x.mentioned}, other records ${x.other}` })),
      empty: !characters ? 'No characters yet. Add them on the Characters page.' : !columns ? 'No chapters match these filters.' : !counted.length ? (filter.count === 'page' ? 'No appearance records in these chapters. Record who appears on a chapter’s or scene’s plan, under “Who appears here”.' : 'Nothing ties a character to these chapters yet: no appearance records, links in the text, plans or events told there.') : null,
      summary: counted.length ? `${plural(counted.length, 'character')} recorded in ${plural(columns, 'chapter')}; the most: ${counted[0].r.name}, in ${plural(counted[0].value, 'chapter')}.` : '',
      notes: characters > counted.length && counted.length ? [`${plural(characters - counted.length, 'character has', 'characters have')} nothing recorded in these chapters, and ${characters - counted.length === 1 ? 'is' : 'are'} not shown: not recorded, which is not the same as absent.`] : [],
      table: { columns: ['Character', 'Chapters with any record', 'On the page', 'Mentioned', 'Other records'], rows: rows.filter((x) => x.any > 0).sort((a, b) => b.any - a.any || a.r.name.localeCompare(b.r.name)).map((x) => [x.r.name, x.any, x.page, x.mentioned, x.other]) },
    });
  }

  // 4. Plot-thread presence: in how many chapters each thread has something recorded.
  {
    const lanes = threadLanes(model, filter.threadId ? [filter.threadId] : undefined);
    const shown = s.inRange.map((c) => c.number - 1);
    const rows = lanes.lanes.map((lane) => {
      const present = shown.filter((col) => lane.cells[col]?.places.some((p) => s.passes(p.nodeId)));
      return { lane, present };
    });
    const counted = rows.filter((r) => r.present.length).sort((a, b) => b.present.length - a.present.length || a.lane.thread.title.localeCompare(b.lane.thread.title));
    const span = shown.length;
    charts.push({
      key: 'threads',
      title: 'Plot-thread presence',
      uses: 'The chapters in which each plot thread has a development you placed (introduced, develops, crosses, resolved, appears) or one of its events is told. Chapters with nothing recorded for a thread are counted as just that.',
      measure: 'Chapters',
      units: ['chapter', 'chapters'],
      shape: 'bars',
      bars: counted.map((r) => ({ key: r.lane.thread.id, short: r.lane.thread.title, label: r.lane.thread.title, value: r.present.length, ref: { type: 'thread' as const, id: r.lane.thread.id }, detail: `in ${r.present.length} of ${span} ${span === 1 ? 'chapter' : 'chapters'} (${Math.round((r.present.length / Math.max(span, 1)) * 100)}%): Ch ${r.present.map((col) => col + 1).join(', ')}` })),
      empty: !model.threads.size ? 'No plot threads yet. Start one on the Plot threads page.' : !span ? 'No chapters match these filters.' : !counted.length ? 'No thread has anything placed in these chapters yet.' : null,
      summary: counted.length ? `${plural(counted.length, 'thread')} across ${plural(span, 'chapter')}; the most present: ${counted[0].lane.thread.title}, in ${plural(counted[0].present.length, 'chapter')}.` : '',
      notes: rows.length > counted.length && counted.length ? [`${plural(rows.length - counted.length, 'thread has', 'threads have')} nothing placed in these chapters.`] : [],
      table: { columns: ['Thread', 'Chapters', 'Share of chapters shown', 'Which'], rows: rows.map((r) => [r.lane.thread.title, r.present.length, `${Math.round((r.present.length / Math.max(span, 1)) * 100)}%`, r.present.map((col) => `Ch ${col + 1}`).join(', ')]) },
    });
  }

  // 5. Events over story time.
  {
    const context = timeContext(model);
    const perYear = model.calendar.minutesPerYear;
    const told = (nodeIds: string[]) => nodeIds.some((id) => {
      const c = s.inRange.find((x) => x.chapter.id === id || x.parts.some((p) => p.node.id === id));
      return Boolean(c) && (!filter.povId && !filter.label ? true : s.passes(id));
    });
    const ranged = Boolean(filter.from || filter.to || filter.povId || filter.label);
    const events = [...model.events.values()].filter((e) => (!filter.threadId || (e.threadIds ?? []).includes(filter.threadId)) && (!ranged || told(e.nodeIds ?? [])));
    const placed: { name: string; year: number }[] = [];
    let undated = 0;
    for (const e of events) {
      const span = spanOfEvent(e.id, context);
      if (!span) {
        undated++;
        continue;
      }
      // The year it starts: the first its date allows ("some time in Year 10" is Year 10).
      const year = Math.floor(span.lo / perYear);
      if ((filter.yearFrom !== null && year < filter.yearFrom) || (filter.yearTo !== null && year > filter.yearTo)) continue;
      placed.push({ name: e.name, year });
    }
    const years = placed.map((p) => p.year);
    const [min, max] = years.length ? [filter.yearFrom ?? Math.min(...years), filter.yearTo ?? Math.max(...years)] : [0, 0];
    const step = years.length ? niceStep(max - min + 1, 30) : 1;
    const start = Math.floor(min / step) * step;
    const count = years.length ? Math.floor((max - start) / step) + 1 : 0;
    const name = (y: number) => yearName(y, model.calendar);
    const bars: ChartBar[] = Array.from({ length: count }, (_, i) => {
      const [a, b] = [start + i * step, start + (i + 1) * step - 1];
      const here = placed.filter((p) => p.year >= a && p.year <= b);
      return { key: `y${a}`, short: step === 1 ? `${a}` : `${a}–${b}`, label: step === 1 ? name(a) : `${name(a)} to ${name(b)}`, value: here.length, ref: null, detail: here.length ? here.map((p) => p.name).slice(0, 8).join('; ') + (here.length > 8 ? `; and ${here.length - 8} more` : '') : 'No event' };
    });
    charts.push({
      key: 'events',
      title: `Events per ${step === 1 ? 'year' : `${fmt(step)} years`} of story time`,
      uses: `The timeline’s events placed by the year they start, in the novel’s calendar (an approximate date counts at the first year it allows; a relative date, from the event it leans on).${ranged ? ' Only events told in the chapters that pass the filters.' : ''}${filter.threadId ? ' Only the thread’s events.' : ''}`,
      measure: 'Events',
      units: ['event', 'events'],
      shape: 'columns',
      bars,
      empty: !model.events.size ? 'No events yet. Add them on the Timeline.' : !events.length ? 'No events match these filters.' : !placed.length ? `None of the ${plural(events.length, 'event')} has a date that can be placed${filter.yearFrom !== null || filter.yearTo !== null ? ' in these years' : ''}.` : null,
      summary: placed.length ? `${plural(placed.length, 'event')} from ${name(min)} to ${name(max)}, in groups of ${plural(step, 'year')}; the busiest: ${bars.reduce((best, b) => (b.value > best.value ? b : best), bars[0]).label}.` : '',
      notes: undated ? [`${plural(undated, 'event has', 'events have')} no date that can be placed, and ${undated === 1 ? 'is' : 'are'} not counted.`] : [],
      table: { columns: ['Story time', 'Events', 'Which'], rows: bars.map((b) => [b.label, b.value, b.value ? b.detail : '']) },
    });
  }

  // 6. Point of view.
  {
    const docs = s.documents('pov');
    const by = new Map<string, { count: number; words: number }>();
    let none = 0;
    for (const d of docs) {
      const pov = s.povOf(d.node.id).filter((id) => !filter.povId || id === filter.povId);
      if (!s.povOf(d.node.id).length) none++;
      for (const id of pov) by.set(id, { count: (by.get(id)?.count ?? 0) + 1, words: (by.get(id)?.words ?? 0) + d.node.wordCount });
    }
    const rows = [...by].map(([id, v]) => ({ id, name: model.entries.get(id)!.name, ...v })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const recordedAnywhere = [...model.plans.values()].some((p) => (p.povIds ?? []).length);
    charts.push({
      key: 'pov',
      title: 'Point of view',
      uses: 'Whose point of view each chapter and scene is told from, as you record it on its plan (“Who appears here” → Point of view). A scene with none recorded is told from its chapter’s. Counted by chapter and scene; a part with two points of view counts for both.',
      measure: 'Chapters and scenes',
      units: ['chapter or scene', 'chapters and scenes'],
      shape: 'bars',
      bars: rows.map((r) => ({ key: r.id, short: r.name, label: r.name, value: r.count, ref: { type: 'entry' as const, id: r.id }, detail: `${plural(r.count, 'chapter or scene', 'chapters and scenes')}, ${plural(r.words, 'word')}` })),
      empty: !recordedAnywhere ? 'No point of view is recorded. Record it on a chapter’s or scene’s plan, under “Who appears here”, and this chart counts it.' : !rows.length ? 'No point of view is recorded in the chapters and scenes that match these filters.' : null,
      summary: rows.length ? `${plural(rows.length, 'point of view', 'points of view')} across ${plural(docs.length, 'chapter or scene', 'chapters and scenes')}; the most: ${rows[0].name}, ${plural(rows[0].count, 'chapter or scene', 'chapters and scenes')}.` : '',
      notes: none && recordedAnywhere ? [`${plural(none, 'chapter or scene has', 'chapters and scenes have')} no point of view recorded, and ${none === 1 ? 'is' : 'are'} not counted.`] : [],
      table: { columns: ['Point of view', 'Chapters and scenes', 'Words'], rows: rows.map((r) => [r.name, r.count, r.words]) },
    });
  }

  // 7. The author's own categories: labels on chapters and scenes.
  {
    const docs = s.documents('label');
    const by = new Map<string, { count: number; words: number }>();
    let none = 0;
    for (const d of docs) {
      const labels = s.labelsOf(d.node.id);
      if (!labels.length) none++;
      for (const l of labels.filter((x) => !filter.label || x.toLowerCase() === filter.label.toLowerCase())) by.set(l, { count: (by.get(l)?.count ?? 0) + 1, words: (by.get(l)?.words ?? 0) + d.node.wordCount });
    }
    const rows = [...by].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const recordedAnywhere = [...model.plans.values()].some((p) => (p.labels ?? []).length);
    charts.push({
      key: 'labels',
      title: 'Your scene categories',
      uses: 'The labels you give chapters and scenes on their plans (action, dialogue, a quiet moment…), as you spell them. Counted by chapter and scene, each under its own labels; one with two labels counts for both.',
      measure: 'Chapters and scenes',
      units: ['chapter or scene', 'chapters and scenes'],
      shape: 'bars',
      bars: rows.map((r) => ({ key: r.label, short: r.label, label: r.label, value: r.count, ref: null, detail: `${plural(r.count, 'chapter or scene', 'chapters and scenes')}, ${plural(r.words, 'word')}` })),
      empty: !recordedAnywhere ? 'No labels yet. Give a chapter or scene labels on its plan, and this chart counts them.' : !rows.length ? 'No labelled chapters or scenes match these filters.' : null,
      summary: rows.length ? `${plural(rows.length, 'label')} on ${plural(docs.length - none, 'chapter or scene', 'chapters and scenes')}; the most used: ${rows[0].label}, on ${plural(rows[0].count, 'chapter or scene', 'chapters and scenes')}.` : '',
      notes: none && recordedAnywhere ? [`${plural(none, 'chapter or scene has', 'chapters and scenes have')} no label, and ${none === 1 ? 'is' : 'are'} not counted.`] : [],
      table: { columns: ['Label', 'Chapters and scenes', 'Words'], rows: rows.map((r) => [r.label, r.count, r.words]) },
    });
  }

  return charts;
}

/** A table as a CSV file. A cell that a spreadsheet would read as a formula (=, +, -, @) is kept as text. */
export function toCsv(columns: string[], rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const text = typeof v === 'number' ? String(v) : /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
