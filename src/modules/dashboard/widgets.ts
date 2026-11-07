import { appearanceMatrix, type CellState } from '@/modules/characters/appearances';
import { CATEGORY_SINGULAR } from '@/modules/codex/types';
import { SEVERITIES, type Severity } from '@/modules/continuity/types';
import { KIND_LABELS } from '@/modules/manuscript/types';
import { eventRecords } from '@/modules/model/events';
import { resolveRef } from '@/modules/model/model';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { STATUS_LABELS, STATUS_ORDER, statusName, type ThreadStatus } from '@/modules/plot/types';
import type { ReviewItem } from '@/modules/review/collect';
import { lengthBars } from '@/modules/structure/pacing';
import type { RevealRole } from '@/modules/timeline/types';
import type { SavedView } from '@/modules/visualize/saved';
import type { AppearanceSettings, RecentSettings, RecentType, SavedSettings, ThreadSettings, UpcomingSettings, WarningSettings, WordSettings } from './layout';

/**
 * WHAT EACH WIDGET SHOWS
 * Worked out from the shared model (and, for warnings and saved views, from
 * the lists the review and the Visualize page read), each time a widget is
 * drawn. Nothing is estimated, scored or filled in: a widget with nothing to
 * show says what it found nothing of. Pure: these read, and change nothing.
 */

/** A chapter or scene as the dashboard names it: "Ch 3: The Seal", "Ch 3, scene: The vault". */
export function placeLabel(model: Pick<StoryModel, 'nodes' | 'order'>, nodeId: string): string {
  const node = model.nodes.get(nodeId);
  if (!node) return 'a deleted chapter';
  const n = model.order.chapterNumber.get(nodeId);
  const title = node.title.trim() || `Untitled ${KIND_LABELS[node.kind]?.toLowerCase() ?? 'chapter'}`;
  if (n && node.kind === 'chapter') return `Ch ${n}: ${title}`;
  if (n && node.kind === 'scene') return `Ch ${n}, scene: ${title}`;
  return title;
}

/** Words in every node with all it holds, as the editor counts them: a chapter with its scenes, a volume with its chapters. */
function wordTotals(model: Pick<StoryModel, 'nodes'>): (nodeId: string) => number {
  const children = new Map<string, string[]>();
  for (const node of model.nodes.values()) if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  const totals = new Map<string, number>();
  const total = (id: string, depth = 0): number => {
    const known = totals.get(id);
    if (known !== undefined) return known;
    const own = model.nodes.get(id)?.wordCount ?? 0;
    const sum = own + (depth > 50 ? 0 : (children.get(id) ?? []).reduce((n, child) => n + total(child, depth + 1), 0));
    totals.set(id, sum);
    return sum;
  };
  return total;
}

export interface UpcomingPlace {
  nodeId: string;
  label: string;
  role: RevealRole;
  /** Whether the chapter or scene has any words yet. */
  written: boolean;
}
export interface UpcomingRow {
  id: string;
  title: string;
  /** When it happens, as the author would read it. */
  when: string;
  dated: boolean;
  /** Reading order: the chapters still to be written that tell it. Story order: every chapter that tells it. */
  places: UpcomingPlace[];
}
export interface Upcoming {
  rows: UpcomingRow[];
  /** How many are upcoming in all, before the widget's count. */
  total: number;
  /** Events the order cannot place, so not counted either way: told in no chapter (reading), or with no date (story). */
  unplaced: number;
  /** Events matching the widget's thread and character, upcoming or not. */
  matching: number;
  /** Story order: the event the written chapters have reached, by date. Null when no written chapter tells a dated event as it happens. */
  reached: { id: string; title: string; when: string } | null;
  /** A thread or character the widget follows that no longer exists. */
  missing: { thread: boolean; character: boolean };
}

/**
 * Events still ahead. In reading order: the ones told in a chapter or scene
 * with no words yet, where the reader will meet them. In story order: the
 * ones that happen later than the latest event a written chapter tells as it
 * happens (not as a flashback, flash-forward or foreshadowing).
 * The two orders are kept apart; neither is worked out from the other.
 */
export function upcomingEvents(model: StoryModel, settings: UpcomingSettings): Upcoming {
  const words = wordTotals(model);
  const records = eventRecords(model);
  const missing = { thread: Boolean(settings.threadId && !model.threads.has(settings.threadId)), character: Boolean(settings.characterId && !model.entries.has(settings.characterId)) };
  const matching = records.filter((e) => (!settings.threadId || e.threads.some((t) => t.id === settings.threadId)) && (!settings.characterId || e.participants.some((p) => p.ref.id === settings.characterId)));
  const placesOf = (e: (typeof records)[number]) => e.told.filter((t) => model.nodes.has(t.ref.id)).map((t) => ({ nodeId: t.ref.id, label: placeLabel(model, t.ref.id), role: t.role, written: words(t.ref.id) > 0, position: t.position ?? Infinity }));
  const row = (e: (typeof records)[number], places: ReturnType<typeof placesOf>): UpcomingRow => ({ id: e.id, title: e.title, when: e.label, dated: e.span !== null, places: places.map((p) => ({ nodeId: p.nodeId, label: p.label, role: p.role, written: p.written })) });

  if (settings.from === 'reading') {
    const ahead = matching
      .map((e) => ({ e, places: placesOf(e).filter((p) => !p.written) }))
      .filter((x) => x.places.length)
      .sort((a, b) => a.places[0].position - b.places[0].position || a.e.title.localeCompare(b.e.title));
    return { rows: ahead.slice(0, settings.count).map((x) => row(x.e, x.places)), total: ahead.length, unplaced: matching.filter((e) => !placesOf(e).length).length, matching: matching.length, reached: null, missing };
  }

  // Only an event told as it happens marks how far the story has reached: a flash-forward or a foreshadowing is a glimpse ahead, a flashback a look back.
  const told = records.filter((e) => e.span && placesOf(e).some((p) => p.written && p.role === 'told'));
  const last = told.reduce<(typeof records)[number] | null>((best, e) => (!best || e.span!.lo > best.span!.lo || (e.span!.lo === best.span!.lo && e.title.localeCompare(best.title) > 0) ? e : best), null);
  const ahead = matching.filter((e) => e.span && (!last || e.span.lo > last.span!.lo)).sort((a, b) => a.span!.lo - b.span!.lo || a.title.localeCompare(b.title));
  return {
    rows: ahead.slice(0, settings.count).map((e) => row(e, placesOf(e))),
    total: ahead.length,
    unplaced: matching.filter((e) => !e.span).length,
    matching: matching.length,
    reached: last ? { id: last.id, title: last.title, when: last.label } : null,
    missing,
  };
}

export interface ThreadRow {
  id: string;
  title: string;
  status: ThreadStatus;
  /** The status in words: the author's own name for a custom one. */
  statusLabel: string;
  developments: number;
  /** The development latest in reading order, where it is placed. */
  latest: { nodeId: string; label: string } | null;
  /** Developments not placed in any chapter or scene yet. */
  unplaced: number;
  updatedAt: number;
}

/** Plot threads with the statuses the author gave them, and how many of each status there are. */
export function threadSummary(model: StoryModel, settings: ThreadSettings) {
  const all = [...model.threads.values()];
  const rank = (s: ThreadStatus) => STATUS_ORDER.indexOf(s);
  const rows = all
    .filter((t) => !settings.statuses.length || settings.statuses.includes(t.status))
    .map((t): ThreadRow => {
      const placed = t.beats.filter((b) => b.nodeId && model.nodes.has(b.nodeId)).sort((a, b) => (model.order.position.get(a.nodeId!) ?? 0) - (model.order.position.get(b.nodeId!) ?? 0));
      const last = placed[placed.length - 1];
      return { id: t.id, title: t.title.trim() || 'Untitled thread', status: t.status, statusLabel: statusName(t), developments: t.beats.length, latest: last ? { nodeId: last.nodeId!, label: placeLabel(model, last.nodeId!) } : null, unplaced: t.beats.length - placed.length, updatedAt: t.updatedAt };
    })
    .sort((a, b) => (settings.sort === 'changed' ? b.updatedAt - a.updatedAt : settings.sort === 'status' ? rank(a.status) - rank(b.status) : 0) || a.title.localeCompare(b.title));
  const groups = STATUS_ORDER.map((status) => ({ status, label: STATUS_LABELS[status], count: all.filter((t) => t.status === status).length })).filter((g) => g.count > 0);
  return { rows: rows.slice(0, settings.count), total: rows.length, all: all.length, groups };
}

export interface RecentRow {
  ref: EntityRef;
  label: string;
  /** What kind of record it is, in words. */
  kind: string;
  updatedAt: number;
}

/** The records changed most recently, by the time each one last saved. */
export function recentRecords(model: StoryModel, settings: RecentSettings) {
  const kinds: Record<RecentType, () => { ref: EntityRef; kind: string; updatedAt: number }[]> = {
    node: () => [...model.nodes.values()].map((n) => ({ ref: { type: 'node', id: n.id }, kind: KIND_LABELS[n.kind] ?? 'Chapter', updatedAt: n.updatedAt })),
    entry: () => [...model.entries.values()].map((e) => ({ ref: { type: 'entry', id: e.id }, kind: model.categories.get(e.category)?.singular || CATEGORY_SINGULAR[e.category] || 'Codex entry', updatedAt: e.updatedAt })),
    event: () => [...model.events.values()].map((e) => ({ ref: { type: 'event', id: e.id }, kind: 'Event', updatedAt: e.updatedAt })),
    thread: () => [...model.threads.values()].map((t) => ({ ref: { type: 'thread', id: t.id }, kind: 'Plot thread', updatedAt: t.updatedAt })),
    relation: () => [...model.relations.values()].map((r) => ({ ref: { type: 'relation', id: r.id }, kind: 'Relationship', updatedAt: r.updatedAt })),
  };
  const rows = settings.types
    .flatMap((type) => kinds[type]())
    .filter((r) => Number.isFinite(r.updatedAt) && r.updatedAt > 0)
    .map((r): RecentRow => {
      const found = resolveRef(model, r.ref);
      return { ...r, label: found.found ? found.view.label : r.ref.id };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt || a.label.localeCompare(b.label));
  return { rows: rows.slice(0, settings.count), total: rows.length };
}

/** Words per chapter or scene, as the editor counts them. A chapter with no words is not written yet, not short. */
export function wordRows(model: StoryModel, settings: WordSettings) {
  const missingPart = Boolean(settings.partId && !model.nodes.has(settings.partId));
  const bars = missingPart ? [] : lengthBars(model, { grain: settings.grain, partId: settings.partId });
  const written = bars.filter((b) => b.words > 0);
  const ordered = settings.sort === 'longest' ? [...bars].sort((a, b) => b.words - a.words) : settings.sort === 'shortest' ? [...written].sort((a, b) => a.words - b.words) : bars;
  const rows = ordered.map((b) => ({ nodeId: b.nodeId, label: b.label, words: b.words }));
  return { rows: rows.slice(0, settings.count), total: rows.length, words: bars.reduce((n, b) => n + b.words, 0), bars: bars.length, empty: bars.length - written.length, most: Math.max(0, ...bars.map((b) => b.words)), missingPart };
}

const countStates = (cells: { state: CellState }[]) => ({ appears: cells.filter((c) => c.state === 'appears').length, mentioned: cells.filter((c) => c.state === 'mentioned').length, other: cells.filter((c) => c.state === 'other').length });

/**
 * Who is recorded in which chapters. Only what is recorded counts: the
 * author's appearance records, and the other records that tie a character
 * to a chapter, kept apart. A chapter with nothing recorded is "not
 * recorded", never "absent".
 */
export function appearanceSummary(model: StoryModel, settings: AppearanceSettings) {
  const chapters = model.order.chapters.length;
  if (settings.characterId) {
    const entry = model.entries.get(settings.characterId);
    if (!entry || entry.category !== 'character') return { mode: 'one' as const, missing: true, name: '', chapters, columns: [], appears: 0, mentioned: 0, other: 0 };
    const matrix = appearanceMatrix(model, { grain: 'chapters', characterIds: [entry.id], all: true });
    const cells = matrix.rows[0]?.cells ?? [];
    const columns = matrix.columns.map((c, i) => ({ nodeId: c.nodeId, short: c.short, label: c.label, state: cells[i]?.state ?? ('none' as CellState) }));
    return { mode: 'one' as const, missing: false, name: entry.name, chapters, columns, ...countStates(columns) };
  }
  const matrix = appearanceMatrix(model, { grain: 'chapters' });
  const rows = matrix.rows
    .map((r) => ({ characterId: r.characterId, name: r.name, recorded: r.recorded, ...countStates(r.cells) }))
    .sort((a, b) => b.appears - a.appears || b.recorded - a.recorded || a.name.localeCompare(b.name));
  return { mode: 'top' as const, missing: false, chapters, characters: matrix.characters, rows: rows.slice(0, settings.count), total: rows.length };
}

/** The warnings still to look at (no decision yet, or marked to review), most serious first. */
export function warningSummary(items: ReviewItem[], settings: WarningSettings) {
  const todo = items.filter((i) => i.status === 'open' || i.status === 'review');
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, todo.filter((i) => i.severity === s).length])) as Record<Severity, number>;
  const rows = todo
    .filter((i) => !settings.severities.length || settings.severities.includes(i.severity))
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || (a.certainty === b.certainty ? 0 : a.certainty === 'error' ? -1 : 1) || a.title.localeCompare(b.title));
  return { rows: rows.slice(0, settings.count), total: rows.length, todo: todo.length, bySeverity };
}

/** The saved views, of one kind of view or all, by name. */
export function savedRows(list: SavedView[], settings: SavedSettings) {
  const rows = list.filter((s) => !settings.view || s.view === settings.view).sort((a, b) => a.name.localeCompare(b.name) || a.createdAt - b.createdAt);
  return { rows: rows.slice(0, settings.count), total: rows.length, all: list.length };
}
