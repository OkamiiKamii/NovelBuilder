import { isGroup } from '@/modules/manuscript/tree';
import type { StoryNode } from '@/modules/manuscript/types';
import type { StoryModel } from '@/modules/model/types';
import { labelOrder, type StructureMarker } from './types';

/**
 * STRUCTURE AND PACING
 * Charts drawn only from what is recorded: the word counts the editor keeps,
 * the volumes, acts and arcs the chapters sit in, the labels the author gives
 * chapters, scenes and events, and the markers they place. They describe the
 * manuscript as it stands; they do not measure quality, how a passage reads,
 * or whether a structure is right, and none is expected.
 */
export type Grain = 'chapters' | 'scenes';

/** The view's own settings in the page address, kept by saved views: bars for chapters or scenes, a label to pick out, a part to keep to. */
export const STRUCTURE_PARAMS = ['sgrain', 'slabel', 'spart'] as const;
export const structureLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(STRUCTURE_PARAMS.flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])));
export type PacingInput = Pick<StoryModel, 'nodes' | 'order' | 'plans' | 'events'>;

/** One bar of the length chart: a chapter (with its scenes), or a scene. */
export interface LengthBar {
  nodeId: string;
  /** The chapter it is, or is in. */
  chapterId: string;
  chapterNumber: number;
  /** "Ch 3: The Seal", or "Ch 3, scene: The vault". */
  label: string;
  words: number;
  /** Labels given to it (for a chapter, to it or any of its scenes), in a steady order. */
  labels: string[];
  /** The volume, act or arc nearest around it, if any. */
  partId: string | null;
}
/** A run of bars inside the same volume, act or arc. Bar indexes, inclusive. */
export interface PartBand {
  partId: string;
  title: string;
  kind: string;
  from: number;
  to: number;
}

export interface PacingFilter {
  grain: Grain;
  /** Only bars inside this volume, act or arc (at any depth). */
  partId: string | null;
}

/**
 * A label is the same label whatever its capitals: each is shown as it is
 * first spelled in reading order, then on events (a suggestion's own
 * spelling is already used when saved).
 */
const spellings = new WeakMap<object, Map<string, string>>();
function spellingOf(input: PacingInput, label: string): string {
  let known = spellings.get(input.plans);
  if (!known) {
    known = new Map();
    const position = (id: string) => input.order.position.get(id) ?? Number.MAX_SAFE_INTEGER;
    const plans = [...input.plans.values()].sort((a, b) => position(a.id) - position(b.id) || a.id.localeCompare(b.id));
    const events = [...input.events.values()].sort((a, b) => a.id.localeCompare(b.id));
    for (const l of [...plans.flatMap((p) => p.labels ?? []), ...events.flatMap((e) => e.labels ?? [])]) if (!known.has(l.toLowerCase())) known.set(l.toLowerCase(), l);
    spellings.set(input.plans, known);
  }
  return known.get(label.toLowerCase()) ?? label;
}
const labelsOf = (input: PacingInput, nodeId: string) => [...new Set((input.plans.get(nodeId)?.labels ?? []).map((l) => spellingOf(input, l)))];

/** The volume, act or arc a node sits nearest inside, if any. */
function nearestPart(node: StoryNode, input: PacingInput): string | null {
  for (let at = node.parentId ? input.nodes.get(node.parentId) : undefined, seen = 0; at && seen < 50; at = at.parentId ? input.nodes.get(at.parentId) : undefined, seen++) if (isGroup(at.kind)) return at.id;
  return null;
}
function inside(node: StoryNode, partId: string, input: PacingInput): boolean {
  for (let at = node.parentId ? input.nodes.get(node.parentId) : undefined, seen = 0; at && seen < 50; at = at.parentId ? input.nodes.get(at.parentId) : undefined, seen++) if (at.id === partId) return true;
  return false;
}

/**
 * The bars of the length chart, in reading order. By chapter, a chapter's
 * words include its scenes'. By scene, each scene is a bar; a chapter with no
 * scenes is a bar of its own, and a chapter's own text beside its scenes is
 * too, so no words go uncounted.
 */
export function lengthBars(input: PacingInput, filter: PacingFilter): LengthBar[] {
  const bars: LengthBar[] = [];
  input.order.chapters.forEach((chapter, i) => {
    if (filter.partId && !inside(chapter, filter.partId, input)) return;
    const number = i + 1;
    const scenes = [...input.nodes.values()].filter((n) => n.parentId === chapter.id && n.kind === 'scene').sort((a, b) => (input.order.position.get(a.id) ?? 0) - (input.order.position.get(b.id) ?? 0));
    const partId = nearestPart(chapter, input);
    const title = chapter.title.trim() || 'Untitled chapter';
    if (filter.grain === 'chapters' || !scenes.length) {
      bars.push({ nodeId: chapter.id, chapterId: chapter.id, chapterNumber: number, label: `Ch ${number}: ${title}`, words: chapter.wordCount + scenes.reduce((n, s) => n + s.wordCount, 0), labels: labelOrder([...labelsOf(input, chapter.id), ...scenes.flatMap((s) => labelsOf(input, s.id))]), partId });
      return;
    }
    if (chapter.wordCount > 0) bars.push({ nodeId: chapter.id, chapterId: chapter.id, chapterNumber: number, label: `Ch ${number}: ${title} (chapter text)`, words: chapter.wordCount, labels: labelOrder(labelsOf(input, chapter.id)), partId });
    for (const scene of scenes) bars.push({ nodeId: scene.id, chapterId: chapter.id, chapterNumber: number, label: `Ch ${number}, scene: ${scene.title.trim() || 'Untitled scene'}`, words: scene.wordCount, labels: labelOrder(labelsOf(input, scene.id)), partId });
  });
  return bars;
}

/** The volumes, acts and arcs as bands over the bars they hold. */
export function partBands(bars: LengthBar[], input: PacingInput): PartBand[] {
  const bands: PartBand[] = [];
  bars.forEach((bar, i) => {
    const last = bands[bands.length - 1];
    if (bar.partId && last?.partId === bar.partId && last.to === i - 1) last.to = i;
    else if (bar.partId) {
      const part = input.nodes.get(bar.partId)!;
      bands.push({ partId: bar.partId, title: part.title.trim() || 'Untitled', kind: part.kind, from: i, to: i });
    }
  });
  return bands;
}

/** Plain facts about the bars: totals, middle values, the longest and shortest, and what is not written or labelled yet. */
export function lengthFacts(bars: LengthBar[]) {
  const written = bars.filter((b) => b.words > 0);
  const total = bars.reduce((n, b) => n + b.words, 0);
  const sorted = written.map((b) => b.words).sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)) : 0;
  const by = (pick: (a: LengthBar, b: LengthBar) => boolean) => written.reduce<LengthBar | null>((best, b) => (!best || pick(b, best) ? b : best), null);
  return {
    count: bars.length,
    total,
    /** Over the bars with any words: an empty chapter is not written yet, not short. */
    average: written.length ? Math.round(total / written.length) : 0,
    median,
    longest: by((a, b) => a.words > b.words),
    shortest: by((a, b) => a.words < b.words),
    empty: bars.length - written.length,
    labelled: bars.filter((b) => b.labels.length).length,
  };
}

/**
 * Words by label, bar by bar. A chapter or scene counts its words under each
 * of its labels, so one with two labels counts toward both; unlabelled words
 * are counted apart. At chapter level, each of a chapter's scenes (and its
 * own text) counts under its own labels.
 */
export function labelDistribution(bars: LengthBar[], input: PacingInput, grain: Grain) {
  const parts = (bar: LengthBar): { words: number; labels: string[] }[] => {
    if (grain === 'scenes' || bar.nodeId !== bar.chapterId) return [{ words: bar.words, labels: labelsOf(input, bar.nodeId) }];
    const chapter = input.nodes.get(bar.chapterId)!;
    const scenes = [...input.nodes.values()].filter((n) => n.parentId === chapter.id && n.kind === 'scene');
    return [{ words: chapter.wordCount, labels: labelsOf(input, chapter.id) }, ...scenes.map((s) => ({ words: s.wordCount, labels: labelsOf(input, s.id) }))];
  };
  const cells = bars.map((bar) => {
    const words = new Map<string, number>();
    let unlabelled = 0;
    for (const p of parts(bar)) {
      if (!p.labels.length) unlabelled += p.words;
      for (const label of p.labels) words.set(label, (words.get(label) ?? 0) + p.words);
    }
    return { nodeId: bar.nodeId, words, unlabelled };
  });
  const labels = labelOrder(cells.flatMap((c) => [...c.words.keys()]));
  const totals = labels.map((label) => ({ label, words: cells.reduce((n, c) => n + (c.words.get(label) ?? 0), 0), bars: cells.filter((c) => c.words.has(label)).length }));
  return { labels, cells, totals, unlabelled: cells.reduce((n, c) => n + c.unlabelled, 0) };
}

/** Every label used in the novel, on chapters, scenes and events, in a steady order. For pickers and filters. */
export const usedLabels = (input: PacingInput): string[] => labelOrder([...[...input.plans.values()].flatMap((p) => p.labels ?? []), ...[...input.events.values()].flatMap((e) => e.labels ?? [])].map((l) => spellingOf(input, l)));

/** A marker placed in the book: at its chapter or scene, else at the first that tells its event; or not placed. */
export interface PlacedMarker {
  marker: StructureMarker;
  nodeId: string | null;
  /** How it got its place. */
  via: 'node' | 'event' | null;
  /** It names a chapter or scene that has since been removed. */
  missing: boolean;
}
export function placeMarkers(markers: StructureMarker[], input: PacingInput): PlacedMarker[] {
  const position = (id: string) => input.order.position.get(id) ?? Number.MAX_SAFE_INTEGER;
  return markers
    .map((marker): PlacedMarker => {
      if (marker.nodeId && input.nodes.has(marker.nodeId)) return { marker, nodeId: marker.nodeId, via: 'node', missing: false };
      const told = marker.eventId ? [...(input.events.get(marker.eventId)?.nodeIds ?? [])].filter((id) => input.nodes.has(id)).sort((a, b) => position(a) - position(b))[0] : undefined;
      return { marker, nodeId: told ?? null, via: told ? 'event' : null, missing: Boolean(marker.nodeId) };
    })
    .sort((a, b) => (a.nodeId ? position(a.nodeId) : Number.MAX_SAFE_INTEGER) - (b.nodeId ? position(b.nodeId) : Number.MAX_SAFE_INTEGER) || a.marker.createdAt - b.marker.createdAt);
}

/** The bar a placed marker falls on: its own bar, or the bar of the chapter it is in. */
export function barOf(placed: PlacedMarker, bars: LengthBar[], input: PacingInput): number {
  if (!placed.nodeId) return -1;
  const own = bars.findIndex((b) => b.nodeId === placed.nodeId);
  if (own >= 0) return own;
  const node = input.nodes.get(placed.nodeId);
  const chapterId = node?.kind === 'scene' ? node.parentId : placed.nodeId;
  return bars.findIndex((b) => b.chapterId === chapterId);
}
