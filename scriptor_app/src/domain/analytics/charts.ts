// CHARTS OF WHAT IS RECORDED (as in the original app). Counts and distributions read straight off the novel's records:
// words saved in each chapter and scene, the author's appearance records and other records tying characters to chapters,
// plot-thread developments and events, event dates, points of view and the author's own labels. Nothing is scored or
// judged: no quality, impact or genre is inferred, and every chart says what it uses and what it leaves out. Pure: it
// reads, and changes nothing. A port of flutter_app/lib/shared/domain/analytics/charts.dart.

import { appearanceMatrix } from '../characters/appearances';
import { localeCompare } from '../exchange/collation';
import { type JsonMap, str } from '../json';
import { EntityRef } from '../model/entityRef';
import { type StoryModel } from '../model/storyModel';
import { spanOfEvent } from '../model/validity';
import { placesOf, threadLanes } from '../plot/lanes';
import { stableSorted } from '../reader/stableSort';
import { type StoryNode } from '../records/storyNode';
import { dartTrim, dartToLowerCase } from '../text/dartString';

/** "1,234": a whole number (rounded half away from zero), grouped by thousands (analytics/progress.dart's grouped). */
export function grouped(n: number): string {
  const whole = n < 0 ? -Math.round(-n) : Math.round(n);
  const digits = String(Math.abs(whole));
  let out = whole < 0 ? '-' : '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/** Dart's `int.tryParse` on trimmed text: a whole number, or null. */
function wholeOrNull(text: string): number | null {
  const t = dartTrim(text);
  return /^[+-]?\d+$/.test(t) ? Number.parseInt(t, 10) : null;
}

export class ChartFilter {
  constructor(
    readonly f: {
      /** A range of chapters, by id, both included; either end may be open. */
      from?: string | null;
      to?: string | null;
      /** Only the chapters and scenes this thread is recorded in, and its events. */
      threadId?: string | null;
      /** Only the chapters and scenes told from this character's point of view. */
      povId?: string | null;
      /** Only the chapters and scenes with this label. */
      label?: string | null;
      /** Story years, both included: for the events chart (chapters have no dates of their own). */
      yearFrom?: number | null;
      yearTo?: number | null;
      /** `chapters` or `scenes`: words per chapter, or per scene. */
      grain?: 'chapters' | 'scenes';
      /** `any` or `page`: appearances counted from any record, or only from appearance records. */
      count?: 'any' | 'page';
    } = {},
  ) {}

  get from(): string | null {
    return this.f.from ?? null;
  }
  get to(): string | null {
    return this.f.to ?? null;
  }
  get threadId(): string | null {
    return this.f.threadId ?? null;
  }
  get povId(): string | null {
    return this.f.povId ?? null;
  }
  get label(): string | null {
    return this.f.label ?? null;
  }
  get yearFrom(): number | null {
    return this.f.yearFrom ?? null;
  }
  get yearTo(): number | null {
    return this.f.yearTo ?? null;
  }
  get grain(): 'chapters' | 'scenes' {
    return this.f.grain ?? 'chapters';
  }
  get count(): 'any' | 'page' {
    return this.f.count ?? 'any';
  }

  /** The filter as a saved view keeps it (the original's page-address keys); ids naming nothing here are dropped. */
  static of(layout: JsonMap, model: StoryModel): ChartFilter {
    const node = (key: string): string | null => {
      const v = layout[key];
      return typeof v === 'string' && model.nodes.has(v) ? v : null;
    };
    const label = dartTrim(str(layout['clabel']));
    const thread = layout['cthread'];
    const pov = layout['cpov'];
    return new ChartFilter({
      from: node('cfrom'),
      to: node('cto'),
      threadId: typeof thread === 'string' && model.threads.has(thread) ? thread : null,
      povId: typeof pov === 'string' && model.entries.has(pov) ? pov : null,
      label: label.length === 0 ? null : label,
      yearFrom: wholeOrNull(str(layout['cyfrom'])),
      yearTo: wholeOrNull(str(layout['cyto'])),
      grain: layout['cgrain'] === 'scenes' ? 'scenes' : 'chapters',
      count: layout['ccount'] === 'page' ? 'page' : 'any',
    });
  }

  toLayout(): JsonMap {
    return {
      ...(this.from !== null ? { cfrom: this.from } : {}),
      ...(this.to !== null ? { cto: this.to } : {}),
      ...(this.threadId !== null ? { cthread: this.threadId } : {}),
      ...(this.povId !== null ? { cpov: this.povId } : {}),
      ...(this.label !== null ? { clabel: this.label } : {}),
      ...(this.yearFrom !== null ? { cyfrom: `${this.yearFrom}` } : {}),
      ...(this.yearTo !== null ? { cyto: `${this.yearTo}` } : {}),
      ...(this.grain === 'scenes' ? { cgrain: 'scenes' } : {}),
      ...(this.count === 'page' ? { ccount: 'page' } : {}),
    };
  }

  get filtered(): boolean {
    return this.from !== null || this.to !== null || this.threadId !== null || this.povId !== null || this.label !== null || this.yearFrom !== null || this.yearTo !== null;
  }
}

export class ChartBar {
  constructor(
    readonly key: string,
    /** On the axis: short ("3", "Mira", "10–19"). */
    readonly short: string,
    /** In full, for the tooltip and the table. */
    readonly label: string,
    readonly value: number,
    /** The record it is, to select; null when it is not one (a range of years). */
    readonly ref: EntityRef | null,
    readonly detail: string,
  ) {}
}

export type ChartCell = string | number;

export type Chart = {
  /** words, lengths, appearances, threads, events, pov or labels. */
  key: string;
  title: string;
  /** What it counts, and from which records. */
  uses: string;
  measure: string;
  units: [string, string];
  /** `columns` along the story, or `bars` for things that have names. */
  shape: 'columns' | 'bars';
  bars: ChartBar[];
  /** Why there is nothing to draw, when there is not. */
  empty: string | null;
  summary: string;
  /** What is left out, or not recorded: said, never filled in. */
  notes: string[];
  /** The same data as a table, and as a downloadable file. */
  columns: string[];
  rows: ChartCell[][];
};

const plural = (n: number, one: string, many?: string): string => `${grouped(n)} ${n === 1 ? one : (many ?? `${one}s`)}`;
const jsRound = (n: number): number => Math.floor(n + 0.5);

/** A step that keeps at most `most` groups across a stretch: 1, 2, 5, 10, 20, 25, 50, 100… */
export function niceStep(stretch: number, most: number): number {
  // Counted: a step of 10^20 covers any stretch a book has.
  for (let scale = 1, k = 0; k < 24; scale *= 10, k++) {
    for (const step of [1, 2, 2.5, 5]) {
      const s = step * scale;
      if (s >= 1 && s === Math.round(s) && Math.ceil(stretch / s) <= most) return Math.round(s);
    }
  }
  return Math.max(1, Math.round(stretch));
}

const numText = (n: number): string => (n === Math.round(n) ? `${Math.round(n)}` : `${n}`);

type Part = { node: StoryNode; label: string; short: string };
type InRange = { chapter: StoryNode; number: number; label: string; parts: Part[] };

/** Every chart, for the novel as filtered. */
export function analyticsCharts(model: StoryModel, filter: ChartFilter): Chart[] {
  const chapters = model.order.chapters;
  const index = (id: string | null): number =>
    id === null ? -1 : chapters.findIndex((c) => c.id === id || model.nodes.get(id)?.parentId === c.id);
  const lo = filter.from !== null ? Math.max(0, index(filter.from)) : 0;
  const hi = filter.to !== null && index(filter.to) >= 0 ? index(filter.to) : chapters.length - 1;
  const position = (id: string) => model.order.position.get(id) ?? 0;
  const scenesOf = (chapterId: string): StoryNode[] =>
    stableSorted(
      [...model.nodes.values()].filter((n) => n.parentId === chapterId && n.kind === 'scene'),
      (a, b) => position(a.id) - position(b.id),
    );
  const thread = filter.threadId === null ? null : (model.threads.get(filter.threadId) ?? null);
  const threadNodes = thread === null ? null : new Set(placesOf(thread, model).map((p) => p.nodeId));
  // A scene with no point of view of its own is told from its chapter's.
  const povOf = (nodeId: string): string[] => {
    const own = (model.plans.get(nodeId)?.povIds ?? []).filter((id) => model.entries.has(id));
    const parent = model.nodes.get(nodeId)?.parentId ?? null;
    if (own.length > 0 || parent === null || model.nodes.get(parent)?.kind !== 'chapter') return own;
    return (model.plans.get(parent)?.povIds ?? []).filter((id) => model.entries.has(id));
  };

  const spelling = new Map<string, string>();
  for (const node of stableSorted(model.nodes.values(), (a, b) => position(a.id) - position(b.id))) {
    for (const l of model.plans.get(node.id)?.labels ?? []) {
      const k = dartToLowerCase(l);
      if (!spelling.has(k)) spelling.set(k, l);
    }
  }
  const labelsOf = (nodeId: string): string[] => [...new Set((model.plans.get(nodeId)?.labels ?? []).map((l) => spelling.get(dartToLowerCase(l))!))];
  const chapterOf = (nodeId: string): string | null => (model.nodes.get(nodeId)?.kind === 'scene' ? model.nodes.get(nodeId)!.parentId : nodeId);
  const passes = (nodeId: string, skip?: string): boolean =>
    (threadNodes === null || threadNodes.has(nodeId) || threadNodes.has(chapterOf(nodeId) ?? '')) &&
    (skip === 'pov' || filter.povId === null || povOf(nodeId).includes(filter.povId)) &&
    (skip === 'label' || filter.label === null || labelsOf(nodeId).some((l) => dartToLowerCase(l) === dartToLowerCase(filter.label!)));
  const narrowed = threadNodes !== null || filter.povId !== null || filter.label !== null;
  const title = (n: StoryNode): string =>
    dartTrim(n.title).length > 0 ? dartTrim(n.title) : n.kind === 'scene' ? 'Untitled scene' : 'Untitled chapter';

  /** Each chapter in range, with its parts: its own text (when it has scenes, only if it holds words) and its scenes. */
  const inRange: InRange[] = [];
  for (let k = lo; k <= hi && k < chapters.length; k++) {
    const chapter = chapters[k];
    const number = k + 1;
    const scenes = scenesOf(chapter.id);
    const parts: Part[] = [
      ...(scenes.length === 0 || chapter.wordCount > 0
        ? [{ node: chapter, label: scenes.length > 0 ? `Ch ${number}: ${title(chapter)} (chapter text)` : `Ch ${number}: ${title(chapter)}`, short: `${number}` }]
        : []),
      ...scenes.map((s, i) => ({ node: s, label: `Ch ${number}, scene: ${title(s)}`, short: `${number}.${i + 1}` })),
    ];
    inRange.push({ chapter, number, label: `Ch ${number}: ${title(chapter)}`, parts });
  }
  const documents = (skip?: string) =>
    inRange.flatMap((c) => c.parts.filter((p) => passes(p.node.id, skip)).map((p) => ({ node: p.node, label: p.label, short: p.short, chapterNumber: c.number })));
  const chapterWords = (chapterId: string) => (model.nodes.get(chapterId)?.wordCount ?? 0) + scenesOf(chapterId).reduce((n, x) => n + x.wordCount, 0);
  const filterWords = narrowed ? ' Only what passes the filters is counted.' : '';
  const charts: Chart[] = [];
  const byChapters = filter.grain === 'chapters';

  // 1. Words per chapter, or per scene.
  {
    const bars = byChapters
      ? inRange
          .filter((c) => !(narrowed && !c.parts.some((p) => passes(p.node.id))))
          .map((c) => {
            const parts = c.parts.filter((p) => passes(p.node.id));
            const words = narrowed ? parts.reduce((n, p) => n + p.node.wordCount, 0) : chapterWords(c.chapter.id);
            return new ChartBar(
              c.chapter.id,
              `${c.number}`,
              c.label,
              words,
              new EntityRef('node', c.chapter.id),
              `${plural(words, 'word')}${c.parts.length > 1 ? `, in ${plural(c.parts.length, 'part')}` : ''}`,
            );
          })
      : documents().map((d) => new ChartBar(d.node.id, d.short, d.label, d.node.wordCount, new EntityRef('node', d.node.id), plural(d.node.wordCount, 'word')));
    const total = bars.reduce((n, b) => n + b.value, 0);
    let longest: ChartBar | null = null;
    for (const b of bars) if (longest === null || b.value > longest.value) longest = b;
    const unwritten = bars.filter((b) => b.value === 0).length;
    charts.push({
      key: 'words',
      title: `Words per ${byChapters ? 'chapter' : 'chapter and scene'}`,
      uses:
        'The word count saved with each chapter and scene in the manuscript, in reading order.' +
        (byChapters ? ' A chapter counts its own text and its scenes’.' : ' A chapter with scenes shows its own text apart, when it holds any.') +
        filterWords,
      measure: 'Words',
      units: ['word', 'words'],
      shape: 'columns',
      bars,
      empty:
        chapters.length === 0
          ? 'No chapters yet. Add them in the Organizer.'
          : bars.length === 0
            ? 'No chapters or scenes match these filters.'
            : total === 0
              ? 'Nothing is written yet in these chapters, so there are no words to count.'
              : null,
      summary:
        bars.length > 0
          ? `${plural(bars.length, byChapters ? 'chapter' : 'chapter or scene', byChapters ? 'chapters' : 'chapters and scenes')}, ` +
            `${plural(total, 'word')} in all` +
            `${longest !== null && longest.value !== 0 ? `; the most words: ${longest.label} (${grouped(longest.value)})` : ''}.`
          : '',
      notes:
        unwritten > 0
          ? [
              `${plural(unwritten, byChapters ? 'chapter has' : 'chapter or scene has', byChapters ? 'chapters have' : 'chapters and scenes have')} ` +
                'no words yet; shown at zero, not as short.',
            ]
          : [],
      columns: [byChapters ? 'Chapter' : 'Chapter or scene', 'Words'],
      rows: bars.map((b) => [b.label, b.value]),
    });

    // 2. How long chapters are: how many fall in each band of lengths.
    const chapterLengths = inRange
      .filter((c) => !(narrowed && !c.parts.some((p) => passes(p.node.id))))
      .map((c) => ({
        label: c.label,
        words: narrowed ? c.parts.filter((p) => passes(p.node.id)).reduce((n, p) => n + p.node.wordCount, 0) : chapterWords(c.chapter.id),
      }));
    const written = chapterLengths.filter((c) => c.words > 0);
    const most = written.length === 0 ? 0 : Math.max(...written.map((c) => c.words));
    const step = written.length === 0 ? 1 : niceStep(most + 1, 12);
    const bands: number[] = [];
    if (written.length > 0) for (let i = 0; i <= Math.trunc(most / step); i++) bands.push(i);
    const lengthBars = bands.map((i) => {
      const from = i * step;
      const to = (i + 1) * step - 1;
      const here = written.filter((c) => c.words >= from && c.words <= to);
      return new ChartBar(
        `band-${i}`,
        from >= 1000 ? `${numText(from / 1000)}K` : `${from}`,
        `${grouped(from)}–${grouped(to)} words`,
        here.length,
        null,
        here.length > 0 ? here.map((c) => c.label).join('; ') : 'No chapter',
      );
    });
    charts.push({
      key: 'lengths',
      title: 'How long chapters are',
      uses:
        `Each chapter’s words (its own text and its scenes’), counted into bands of ${grouped(step)} words: how ` +
        `many chapters fall in each. Chapters with no words yet are left out, as not written.${filterWords}`,
      measure: 'Chapters',
      units: ['chapter', 'chapters'],
      shape: 'columns',
      bars: lengthBars,
      empty: written.length < 2 ? `Needs at least two chapters with words${written.length > 0 ? ': only one has any so far' : ''}.` : null,
      summary:
        written.length > 0
          ? `${plural(written.length, 'chapter')} with words, in bands of ${grouped(step)} words; the most chapters in ` +
            `one band: ${Math.max(...lengthBars.map((b) => b.value))}.`
          : '',
      notes:
        chapterLengths.length > written.length
          ? [
              `${plural(chapterLengths.length - written.length, 'chapter has', 'chapters have')} no words yet, and ` +
                `${chapterLengths.length - written.length === 1 ? 'is' : 'are'} not counted.`,
            ]
          : [],
      columns: ['Length', 'Chapters', 'Which'],
      rows: lengthBars.map((b) => [b.label, b.value, b.value > 0 ? b.detail : '']),
    });
  }

  // 3. Character appearances: in how many chapters each character is recorded.
  {
    const matrix = appearanceMatrix(model, { from: filter.from, to: filter.to, threadId: filter.threadId });
    const kept = matrix.columns.map((col) =>
      filter.povId === null && filter.label === null ? true : (inRange.find((x) => x.chapter.id === col.chapterId)?.parts.some((p) => passes(p.node.id)) ?? false),
    );
    const rows = matrix.rows.map((r) => {
      const cells = r.cells.filter((_, i) => kept[i]);
      const page = cells.filter((c) => c.state === 'appears').length;
      const mentioned = cells.filter((c) => c.state === 'mentioned').length;
      const other = cells.filter((c) => c.state === 'other').length;
      return { r, page, mentioned, other, any: page + mentioned + other };
    });
    const counted = stableSorted(
      rows.filter((x) => (filter.count === 'page' ? x.page : x.any) > 0).map((x) => ({ x, value: filter.count === 'page' ? x.page : x.any })),
      (a, b) => {
        const c = b.value - a.value;
        return c !== 0 ? c : localeCompare(a.x.r.name, b.x.r.name);
      },
    );
    const columns = kept.filter((k) => k).length;
    const characters = [...model.entries.values()].filter((e) => e.category === 'character').length;
    charts.push({
      key: 'appearances',
      title: 'Character appearances',
      uses:
        filter.count === 'page'
          ? 'Your appearance records only: the chapters in which you record a character as on the page (a chapter ' +
            'counts its scenes’ records).'
          : 'Every record tying a character to a chapter or its scenes: your appearance records (on the page, or ' +
            'mentioned), links in the text, “Entities involved” in a plan, and events told there that they take ' +
            'part in. No text is searched for names.',
      measure: 'Chapters',
      units: ['chapter', 'chapters'],
      shape: 'bars',
      bars: counted.map(
        (c) =>
          new ChartBar(
            c.x.r.characterId,
            c.x.r.name,
            c.x.r.name,
            c.value,
            new EntityRef('entry', c.x.r.characterId),
            `${plural(c.value, 'chapter')} of ${columns}: on the page ${c.x.page}, mentioned ${c.x.mentioned}, other ` + `records ${c.x.other}`,
          ),
      ),
      empty:
        characters === 0
          ? 'No characters yet. Add them on the Characters page.'
          : columns === 0
            ? 'No chapters match these filters.'
            : counted.length === 0
              ? filter.count === 'page'
                ? 'No appearance records in these chapters. Record who appears on a chapter’s or scene’s plan, under ' + '“Who appears here”.'
                : 'Nothing ties a character to these chapters yet: no appearance records, links in the text, plans or ' + 'events told there.'
              : null,
      summary:
        counted.length > 0
          ? `${plural(counted.length, 'character')} recorded in ${plural(columns, 'chapter')}; the most: ` +
            `${counted[0].x.r.name}, in ${plural(counted[0].value, 'chapter')}.`
          : '',
      notes:
        characters > counted.length && counted.length > 0
          ? [
              `${plural(characters - counted.length, 'character has', 'characters have')} nothing recorded in these ` +
                `chapters, and ${characters - counted.length === 1 ? 'is' : 'are'} not shown: not recorded, which is not ` +
                'the same as absent.',
            ]
          : [],
      columns: ['Character', 'Chapters with any record', 'On the page', 'Mentioned', 'Other records'],
      rows: stableSorted(
        rows.filter((x) => x.any > 0),
        (a, b) => {
          const c = b.any - a.any;
          return c !== 0 ? c : localeCompare(a.r.name, b.r.name);
        },
      ).map((x) => [x.r.name, x.any, x.page, x.mentioned, x.other]),
    });
  }

  // 4. Plot-thread presence: in how many chapters each thread has something recorded.
  {
    const lanes = threadLanes(model, filter.threadId !== null ? [filter.threadId] : undefined);
    const shown = inRange.map((c) => c.number - 1);
    const rows = lanes.lanes.map((lane) => ({
      lane,
      present: shown.filter((col) => col < lane.cells.length && lane.cells[col].places.some((p) => passes(p.nodeId))),
    }));
    const counted = stableSorted(
      rows.filter((r) => r.present.length > 0),
      (a, b) => {
        const c = b.present.length - a.present.length;
        return c !== 0 ? c : localeCompare(a.lane.thread.title, b.lane.thread.title);
      },
    );
    const span = shown.length;
    const pct = (n: number) => jsRound((n / Math.max(span, 1)) * 100);
    charts.push({
      key: 'threads',
      title: 'Plot-thread presence',
      uses:
        'The chapters in which each plot thread has a development you placed (introduced, develops, crosses, ' +
        'resolved, appears) or one of its events is told. Chapters with nothing recorded for a thread are counted as ' +
        'just that.',
      measure: 'Chapters',
      units: ['chapter', 'chapters'],
      shape: 'bars',
      bars: counted.map(
        (r) =>
          new ChartBar(
            r.lane.thread.id,
            r.lane.thread.title,
            r.lane.thread.title,
            r.present.length,
            new EntityRef('thread', r.lane.thread.id),
            `in ${r.present.length} of ${span} ${span === 1 ? 'chapter' : 'chapters'} (${pct(r.present.length)}%): Ch ` +
              `${r.present.map((col) => col + 1).join(', ')}`,
          ),
      ),
      empty:
        model.threads.size === 0
          ? 'No plot threads yet. Start one on the Plot threads page.'
          : span === 0
            ? 'No chapters match these filters.'
            : counted.length === 0
              ? 'No thread has anything placed in these chapters yet.'
              : null,
      summary:
        counted.length > 0
          ? `${plural(counted.length, 'thread')} across ${plural(span, 'chapter')}; the most present: ` +
            `${counted[0].lane.thread.title}, in ${plural(counted[0].present.length, 'chapter')}.`
          : '',
      notes: rows.length > counted.length && counted.length > 0 ? [`${plural(rows.length - counted.length, 'thread has', 'threads have')} nothing placed in these chapters.`] : [],
      columns: ['Thread', 'Chapters', 'Share of chapters shown', 'Which'],
      rows: rows.map((r) => [r.lane.thread.title, r.present.length, `${pct(r.present.length)}%`, r.present.map((col) => `Ch ${col + 1}`).join(', ')]),
    });
  }

  // 5. Events over story time.
  {
    const context = model.timeContext;
    const perYear = model.calendar.minutesPerYear;
    const told = (nodeIds: readonly string[]) =>
      nodeIds.some((id) => {
        const c = inRange.find((x) => x.chapter.id === id || x.parts.some((p) => p.node.id === id));
        return c !== undefined && (filter.povId === null && filter.label === null ? true : passes(id));
      });
    const ranged = filter.from !== null || filter.to !== null || filter.povId !== null || filter.label !== null;
    const events = [...model.events.values()].filter((e) => (filter.threadId === null || e.threadIds.includes(filter.threadId)) && (!ranged || told(e.nodeIds)));
    const placed: { name: string; year: number }[] = [];
    let undated = 0;
    for (const e of events) {
      const span = spanOfEvent(e.id, context);
      if (span === null) {
        undated++;
        continue;
      }
      // The year it starts: the first its date allows ("some time in Year 10" is Year 10).
      const year = Math.floor(span.lo / perYear);
      if ((filter.yearFrom !== null && year < filter.yearFrom) || (filter.yearTo !== null && year > filter.yearTo)) continue;
      placed.push({ name: e.name, year });
    }
    const years = placed.map((p) => p.year);
    const min = years.length === 0 ? 0 : (filter.yearFrom ?? Math.min(...years));
    const max = years.length === 0 ? 0 : (filter.yearTo ?? Math.max(...years));
    const step = years.length === 0 ? 1 : niceStep(max - min + 1, 30);
    const start = Math.floor(min / step) * step;
    const count = years.length === 0 ? 0 : Math.floor((max - start) / step) + 1;
    const name = (y: number) => model.calendar.yearName(y);
    const bars: ChartBar[] = [];
    for (let i = 0; i < count; i++) {
      const a = start + i * step;
      const b = start + (i + 1) * step - 1;
      const here = placed.filter((p) => p.year >= a && p.year <= b);
      bars.push(
        new ChartBar(
          `y${a}`,
          step === 1 ? `${a}` : `${a}–${b}`,
          step === 1 ? name(a) : `${name(a)} to ${name(b)}`,
          here.length,
          null,
          here.length > 0
            ? `${here
                .map((p) => p.name)
                .slice(0, 8)
                .join('; ')}${here.length > 8 ? `; and ${here.length - 8} more` : ''}`
            : 'No event',
        ),
      );
    }
    let busiest: ChartBar | null = null;
    for (const b of bars) if (busiest === null || b.value > busiest.value) busiest = b;
    charts.push({
      key: 'events',
      title: `Events per ${step === 1 ? 'year' : `${grouped(step)} years`} of story time`,
      uses:
        'The timeline’s events placed by the year they start, in the novel’s calendar (an approximate date counts at ' +
        'the first year it allows; a relative date, from the event it leans on).' +
        (ranged ? ' Only events told in the chapters that pass the filters.' : '') +
        (filter.threadId !== null ? ' Only the thread’s events.' : ''),
      measure: 'Events',
      units: ['event', 'events'],
      shape: 'columns',
      bars,
      empty:
        model.events.size === 0
          ? 'No events yet. Add them on the Timeline.'
          : events.length === 0
            ? 'No events match these filters.'
            : placed.length === 0
              ? `None of the ${plural(events.length, 'event')} has a date that can be placed` +
                `${filter.yearFrom !== null || filter.yearTo !== null ? ' in these years' : ''}.`
              : null,
      summary:
        placed.length > 0
          ? `${plural(placed.length, 'event')} from ${name(min)} to ${name(max)}, in groups of ${plural(step, 'year')}; ` + `the busiest: ${busiest!.label}.`
          : '',
      notes: undated > 0 ? [`${plural(undated, 'event has', 'events have')} no date that can be placed, and ` + `${undated === 1 ? 'is' : 'are'} not counted.`] : [],
      columns: ['Story time', 'Events', 'Which'],
      rows: bars.map((b) => [b.label, b.value, b.value > 0 ? b.detail : '']),
    });
  }

  // 6. Point of view.
  {
    const docs = documents('pov');
    const by = new Map<string, { count: number; words: number }>();
    let none = 0;
    for (const d of docs) {
      const all = povOf(d.node.id);
      if (all.length === 0) none++;
      for (const id of all.filter((id) => filter.povId === null || id === filter.povId)) {
        const was = by.get(id) ?? { count: 0, words: 0 };
        by.set(id, { count: was.count + 1, words: was.words + d.node.wordCount });
      }
    }
    const rows = stableSorted(
      [...by].map(([key, value]) => ({ id: key, name: model.entries.get(key)!.name, count: value.count, words: value.words })),
      (a, b) => {
        const c = b.count - a.count;
        return c !== 0 ? c : localeCompare(a.name, b.name);
      },
    );
    const recordedAnywhere = [...model.plans.values()].some((p) => p.povIds.length > 0);
    charts.push({
      key: 'pov',
      title: 'Point of view',
      uses:
        'Whose point of view each chapter and scene is told from, as you record it on its plan (“Who appears here” → ' +
        'Point of view). A scene with none recorded is told from its chapter’s. Counted by chapter and scene; a part ' +
        'with two points of view counts for both.',
      measure: 'Chapters and scenes',
      units: ['chapter or scene', 'chapters and scenes'],
      shape: 'bars',
      bars: rows.map(
        (r) =>
          new ChartBar(
            r.id,
            r.name,
            r.name,
            r.count,
            new EntityRef('entry', r.id),
            `${plural(r.count, 'chapter or scene', 'chapters and scenes')}, ${plural(r.words, 'word')}`,
          ),
      ),
      empty: !recordedAnywhere
        ? 'No point of view is recorded. Record it on a chapter’s or scene’s plan, under “Who appears here”, and ' + 'this chart counts it.'
        : rows.length === 0
          ? 'No point of view is recorded in the chapters and scenes that match these filters.'
          : null,
      summary:
        rows.length > 0
          ? `${plural(rows.length, 'point of view', 'points of view')} across ` +
            `${plural(docs.length, 'chapter or scene', 'chapters and scenes')}; the most: ${rows[0].name}, ` +
            `${plural(rows[0].count, 'chapter or scene', 'chapters and scenes')}.`
          : '',
      notes:
        none > 0 && recordedAnywhere
          ? [`${plural(none, 'chapter or scene has', 'chapters and scenes have')} no point of view recorded, and ` + `${none === 1 ? 'is' : 'are'} not counted.`]
          : [],
      columns: ['Point of view', 'Chapters and scenes', 'Words'],
      rows: rows.map((r) => [r.name, r.count, r.words]),
    });
  }

  // 7. The author's own categories: labels on chapters and scenes.
  {
    const docs = documents('label');
    const by = new Map<string, { count: number; words: number }>();
    let none = 0;
    for (const d of docs) {
      const labels = labelsOf(d.node.id);
      if (labels.length === 0) none++;
      for (const l of labels.filter((x) => filter.label === null || dartToLowerCase(x) === dartToLowerCase(filter.label))) {
        const was = by.get(l) ?? { count: 0, words: 0 };
        by.set(l, { count: was.count + 1, words: was.words + d.node.wordCount });
      }
    }
    const rows = stableSorted(
      [...by].map(([key, value]) => ({ label: key, count: value.count, words: value.words })),
      (a, b) => {
        const c = b.count - a.count;
        return c !== 0 ? c : localeCompare(a.label, b.label);
      },
    );
    const recordedAnywhere = [...model.plans.values()].some((p) => p.labels.length > 0);
    charts.push({
      key: 'labels',
      title: 'Your scene categories',
      uses:
        'The labels you give chapters and scenes on their plans (action, dialogue, a quiet moment…), as you spell ' +
        'them. Counted by chapter and scene, each under its own labels; one with two labels counts for both.',
      measure: 'Chapters and scenes',
      units: ['chapter or scene', 'chapters and scenes'],
      shape: 'bars',
      bars: rows.map((r) => new ChartBar(r.label, r.label, r.label, r.count, null, `${plural(r.count, 'chapter or scene', 'chapters and scenes')}, ${plural(r.words, 'word')}`)),
      empty: !recordedAnywhere
        ? 'No labels yet. Give a chapter or scene labels on its plan, and this chart counts them.'
        : rows.length === 0
          ? 'No labelled chapters or scenes match these filters.'
          : null,
      summary:
        rows.length > 0
          ? `${plural(rows.length, 'label')} on ${plural(docs.length - none, 'chapter or scene', 'chapters and scenes')}; ` +
            `the most used: ${rows[0].label}, on ${plural(rows[0].count, 'chapter or scene', 'chapters and scenes')}.`
          : '',
      notes: none > 0 && recordedAnywhere ? [`${plural(none, 'chapter or scene has', 'chapters and scenes have')} no label, and ` + `${none === 1 ? 'is' : 'are'} not counted.`] : [],
      columns: ['Label', 'Chapters and scenes', 'Words'],
      rows: rows.map((r) => [r.label, r.count, r.words]),
    });
  }

  return charts;
}

/** A table as a CSV file. A cell that a spreadsheet would read as a formula (=, +, -, @) is kept as text. */
export function toCsv(columns: readonly string[], rows: readonly (readonly ChartCell[])[]): string {
  const cell = (v: ChartCell): string => {
    const text = typeof v === 'number' ? `${v}` : /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** A title as a file name: letters and digits, the rest as dashes, as the original names its downloads. */
export function fileSlug(title: string): string {
  const s = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return s.length === 0 ? 'untitled' : s;
}
