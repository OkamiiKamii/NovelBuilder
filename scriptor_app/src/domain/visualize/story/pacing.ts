// STRUCTURE AND PACING. Charts drawn only from what is recorded: the word counts the editor keeps, the volumes, acts
// and arcs the chapters sit in, the labels the author gives chapters, scenes and events, and the markers they place.
// They describe the manuscript as it stands; they do not measure quality or whether a structure is right, and no
// formula is expected: the markers are only the ones the author adds. A port of
// flutter_app/lib/shared/domain/structure/pacing.dart (labelOrder and usedLabels are in ../../plot/labels.ts).

import { ChangeRefused, RecordChanges } from '../../codex/codexChanges';
import { localeCompare } from '../../collation';
import { type JsonMap, idOrNull, numOrNull, str } from '../../json';
import type { StoryModel } from '../../model/storyModel';
import { labelOrder } from '../../plot/labels';
import { stableSorted } from '../../reader/stableSort';
import { JsonRecord } from '../../records/jsonRecord';
import { type StoryNode, isGroup } from '../../records/storyNode';
import { dartToLowerCase, dartTrim } from '../../text/dartString';

export const suggestedMarkers: readonly string[] = [
  'Act break',
  'Inciting incident',
  'Turning point',
  'Midpoint',
  'Major reveal',
  'Climax',
  'Resolution',
];

/** A structural marker: where in the book something the author considers structural happens. */
export class StructureMarker extends JsonRecord {
  get kind(): string {
    return str(this.raw['kind']);
  }
  get title(): string {
    return str(this.raw['title']);
  }
  get nodeId(): string | null {
    return idOrNull(this.raw['nodeId']);
  }
  get eventId(): string | null {
    return idOrNull(this.raw['eventId']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
}

export type Grain = 'chapters' | 'scenes';

/** One bar of the length chart: a chapter (with its scenes), or a scene. */
export type LengthBar = {
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
};

/** A run of bars inside the same volume, act or arc. Bar indexes, inclusive. */
export type PartBand = { partId: string; title: string; kind: string; from: number; to: number };

const spellings = new WeakMap<StoryModel, Map<string, string>>();

/** A label is the same whatever its capitals: each as first spelled in reading order, then on events. */
function spellingOf(model: StoryModel, label: string): string {
  let known = spellings.get(model);
  if (known === undefined) {
    known = new Map();
    const last = 9007199254740991;
    const plans = stableSorted(model.plans.values(), (a, b) => {
      const byPosition = Math.sign((model.order.position.get(a.id) ?? last) - (model.order.position.get(b.id) ?? last));
      return byPosition !== 0 ? byPosition : localeCompare(a.id, b.id);
    });
    const events = stableSorted(model.events.values(), (a, b) => localeCompare(a.id, b.id));
    for (const l of [...plans.flatMap((p) => p.labels), ...events.flatMap((e) => e.labels)]) {
      const key = dartToLowerCase(l);
      if (!known.has(key)) known.set(key, l);
    }
    spellings.set(model, known);
  }
  return known.get(dartToLowerCase(label)) ?? label;
}

function labelsOf(model: StoryModel, nodeId: string): string[] {
  return [...new Set((model.plans.get(nodeId)?.labels ?? []).map((l) => spellingOf(model, l)))];
}

/** The volume, act or arc a node sits nearest inside, if any. */
function nearestPart(node: StoryNode, model: StoryModel): string | null {
  let at = node.parentId === null ? undefined : model.nodes.get(node.parentId);
  for (let seen = 0; at !== undefined && seen < 50; seen++) {
    if (isGroup(at.kind)) return at.id;
    at = at.parentId === null ? undefined : model.nodes.get(at.parentId);
  }
  return null;
}

function inside(node: StoryNode, partId: string, model: StoryModel): boolean {
  let at = node.parentId === null ? undefined : model.nodes.get(node.parentId);
  for (let seen = 0; at !== undefined && seen < 50; seen++) {
    if (at.id === partId) return true;
    at = at.parentId === null ? undefined : model.nodes.get(at.parentId);
  }
  return false;
}

function scenesOf(model: StoryModel, chapterId: string): StoryNode[] {
  return stableSorted(
    [...model.nodes.values()].filter((n) => n.parentId === chapterId && n.kind === 'scene'),
    (a, b) => (model.order.position.get(a.id) ?? 0) - (model.order.position.get(b.id) ?? 0),
  );
}

/** The bars of the length chart, in reading order. By chapter, a chapter's words include its scenes'. By scene, each
 * scene is a bar; a chapter with no scenes is a bar of its own, and a chapter's own text beside its scenes is too. */
export function lengthBars(model: StoryModel, options: { grain?: Grain; partId?: string | null } = {}): LengthBar[] {
  const grain = options.grain ?? 'chapters';
  const partId = options.partId ?? null;
  const bars: LengthBar[] = [];
  model.order.chapters.forEach((chapter, i) => {
    if (partId !== null && !inside(chapter, partId, model)) return;
    const number = i + 1;
    const scenes = scenesOf(model, chapter.id);
    const part = nearestPart(chapter, model);
    const title = dartTrim(chapter.title).length === 0 ? 'Untitled chapter' : dartTrim(chapter.title);
    if (grain === 'chapters' || scenes.length === 0) {
      bars.push({
        nodeId: chapter.id,
        chapterId: chapter.id,
        chapterNumber: number,
        label: `Ch ${number}: ${title}`,
        words: chapter.wordCount + scenes.reduce((n, s) => n + s.wordCount, 0),
        labels: labelOrder([...labelsOf(model, chapter.id), ...scenes.flatMap((s) => labelsOf(model, s.id))]),
        partId: part,
      });
      return;
    }
    if (chapter.wordCount > 0) {
      bars.push({
        nodeId: chapter.id,
        chapterId: chapter.id,
        chapterNumber: number,
        label: `Ch ${number}: ${title} (chapter text)`,
        words: chapter.wordCount,
        labels: labelOrder(labelsOf(model, chapter.id)),
        partId: part,
      });
    }
    for (const scene of scenes) {
      bars.push({
        nodeId: scene.id,
        chapterId: chapter.id,
        chapterNumber: number,
        label: `Ch ${number}, scene: ${dartTrim(scene.title).length === 0 ? 'Untitled scene' : dartTrim(scene.title)}`,
        words: scene.wordCount,
        labels: labelOrder(labelsOf(model, scene.id)),
        partId: part,
      });
    }
  });
  return bars;
}

/** The volumes, acts and arcs as bands over the bars they hold. */
export function partBands(bars: readonly LengthBar[], model: StoryModel): PartBand[] {
  const bands: PartBand[] = [];
  bars.forEach((bar, i) => {
    const last = bands.length === 0 ? null : bands[bands.length - 1];
    if (bar.partId !== null && last !== null && last.partId === bar.partId && last.to === i - 1) {
      last.to = i;
    } else if (bar.partId !== null) {
      const part = model.nodes.get(bar.partId)!;
      bands.push({ partId: bar.partId, title: dartTrim(part.title).length === 0 ? 'Untitled' : dartTrim(part.title), kind: part.kindKey, from: i, to: i });
    }
  });
  return bands;
}

const jsRound = (n: number): number => Math.floor(n + 0.5);

export type LengthFacts = {
  count: number;
  total: number;
  average: number;
  median: number;
  longest: LengthBar | null;
  shortest: LengthBar | null;
  empty: number;
  labelled: number;
};

/** Plain facts about the bars: totals, middle values, the longest and shortest, and what is not written or labelled. */
export function lengthFacts(bars: readonly LengthBar[]): LengthFacts {
  const written = bars.filter((b) => b.words > 0);
  const total = bars.reduce((n, b) => n + b.words, 0);
  const sorted = written.map((b) => b.words).sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : jsRound((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const by = (pick: (a: LengthBar, b: LengthBar) => boolean): LengthBar | null => {
    let best: LengthBar | null = null;
    for (const b of written) if (best === null || pick(b, best)) best = b;
    return best;
  };
  return {
    count: bars.length,
    total,
    // Over the bars with any words: an empty chapter is not written yet, not short.
    average: written.length === 0 ? 0 : jsRound(total / written.length),
    median,
    longest: by((a, b) => a.words > b.words),
    shortest: by((a, b) => a.words < b.words),
    empty: bars.length - written.length,
    labelled: bars.filter((b) => b.labels.length > 0).length,
  };
}

export type LabelCell = { nodeId: string; words: Map<string, number>; unlabelled: number };

export type LabelDistribution = {
  labels: string[];
  cells: LabelCell[];
  totals: { label: string; words: number; bars: number }[];
  unlabelled: number;
};

/** Words by label, bar by bar. A chapter or scene counts its words under each of its labels; unlabelled words are
 * counted apart. At chapter level, each of a chapter's scenes (and its own text) counts under its own labels. */
export function labelDistribution(bars: readonly LengthBar[], model: StoryModel, grain: Grain): LabelDistribution {
  const parts = (bar: LengthBar): { words: number; labels: string[] }[] => {
    if (grain === 'scenes' || bar.nodeId !== bar.chapterId) return [{ words: bar.words, labels: labelsOf(model, bar.nodeId) }];
    const chapter = model.nodes.get(bar.chapterId)!;
    const scenes = [...model.nodes.values()].filter((n) => n.parentId === chapter.id && n.kind === 'scene');
    return [
      { words: chapter.wordCount, labels: labelsOf(model, chapter.id) },
      ...scenes.map((s) => ({ words: s.wordCount, labels: labelsOf(model, s.id) })),
    ];
  };
  const cells: LabelCell[] = bars.map((bar) => {
    const words = new Map<string, number>();
    let unlabelled = 0;
    for (const p of parts(bar)) {
      if (p.labels.length === 0) unlabelled += p.words;
      for (const label of p.labels) words.set(label, (words.get(label) ?? 0) + p.words);
    }
    return { nodeId: bar.nodeId, words, unlabelled };
  });
  const labels = labelOrder(cells.flatMap((c) => [...c.words.keys()]));
  return {
    labels,
    cells,
    totals: labels.map((label) => ({
      label,
      words: cells.reduce((n, c) => n + (c.words.get(label) ?? 0), 0),
      bars: cells.filter((c) => c.words.has(label)).length,
    })),
    unlabelled: cells.reduce((n, c) => n + c.unlabelled, 0),
  };
}

/** A marker placed in the book: at its chapter or scene, else at the first that tells its event; or not placed. */
export type PlacedMarker = {
  marker: StructureMarker;
  nodeId: string | null;
  /** How it got its place: `node`, `event`, or null. */
  via: 'node' | 'event' | null;
  /** It names a chapter or scene that has since been removed. */
  missing: boolean;
};

export function placeMarkers(markers: readonly StructureMarker[], model: StoryModel): PlacedMarker[] {
  const last = 9007199254740991;
  const position = (id: string) => model.order.position.get(id) ?? last;
  const placed = markers.map((marker): PlacedMarker => {
    if (marker.nodeId !== null && model.nodes.has(marker.nodeId)) return { marker, nodeId: marker.nodeId, via: 'node', missing: false };
    const told =
      marker.eventId === null
        ? null
        : (stableSorted(
            (model.events.get(marker.eventId)?.nodeIds ?? []).filter((id) => model.nodes.has(id)),
            (a, b) => Math.sign(position(a) - position(b)),
          )[0] ?? null);
    return { marker, nodeId: told, via: told === null ? null : 'event', missing: marker.nodeId !== null };
  });
  return stableSorted(placed, (a, b) => {
    const byPlace = Math.sign((a.nodeId === null ? last : position(a.nodeId)) - (b.nodeId === null ? last : position(b.nodeId)));
    return byPlace !== 0 ? byPlace : Math.sign(a.marker.createdAt - b.marker.createdAt);
  });
}

/** The bar a placed marker falls on: its own bar, or the bar of the chapter it is in. */
export function barOf(placed: PlacedMarker, bars: readonly LengthBar[], model: StoryModel): number {
  const nodeId = placed.nodeId;
  if (nodeId === null) return -1;
  const own = bars.findIndex((b) => b.nodeId === nodeId);
  if (own >= 0) return own;
  const node = model.nodes.get(nodeId);
  const chapterId = node?.kind === 'scene' ? node.parentId : nodeId;
  return bars.findIndex((b) => b.chapterId === chapterId);
}

/** The markers as stored, oldest first. */
export function markersOf(rows: readonly JsonMap[]): StructureMarker[] {
  return stableSorted(
    rows.map((r) => new StructureMarker(r)),
    (a, b) => Math.sign(a.createdAt - b.createdAt),
  );
}

/** Changes to a novel's structural markers. A marker needs a kind; where it is may be a chapter or scene, an event,
 * both or neither. */
export class MarkerChanges extends RecordChanges {
  list(): StructureMarker[] {
    return markersOf(this.rows('structureMarkers'));
  }

  /** Adds a marker (`markerId` null) or changes one. */
  save(markerId: string | null, changes: JsonMap): string {
    const was = markerId === null ? null : this.row('structureMarkers', markerId);
    if (markerId !== null && was === null) throw new ChangeRefused('That marker is no longer there.');
    const next: Record<string, unknown> = {
      ...(was ?? { id: this.newId(), projectId: this.projectId, kind: '', title: '', nodeId: null, eventId: null, note: '', createdAt: this.now }),
      ...changes,
      updatedAt: this.now,
    };
    let kind = dartTrim(String(next['kind'] ?? '')).replace(/\s+/g, ' ');
    if (kind.length > 40) kind = kind.substring(0, 40);
    if (kind.length === 0) throw new ChangeRefused('Say what kind of marker it is.');
    next['kind'] = kind;
    const title = dartTrim(String(next['title'] ?? ''));
    next['title'] = title.length > 120 ? title.substring(0, 120) : title;
    next['note'] = next['note'] ?? '';
    const nodeId = idOrNull(next['nodeId']);
    if (nodeId !== null) {
      const node = this.row('chapters', nodeId);
      if (node === null || (node['kind'] !== 'chapter' && node['kind'] !== 'scene')) {
        throw new ChangeRefused('That chapter or scene is not in this novel.');
      }
    }
    const eventId = idOrNull(next['eventId']);
    if (eventId !== null && this.row('timelineEvents', eventId) === null) throw new ChangeRefused('That event is not in this novel.');
    this.put('structureMarkers', next as JsonMap);
    return next['id'] as string;
  }

  removeMarker(markerId: string): void {
    if (this.row('structureMarkers', markerId) !== null) this.remove('structureMarkers', markerId);
  }
}

/** Changes the markers inside another change of the same novel (a plot change): what `apply` changes is kept. */
export function markersIn<T>(c: RecordChanges, apply: (m: MarkerChanges) => T): T {
  const m = new MarkerChanges(c.snapshot, { now: c.now, createId: () => c.newId() });
  const result = apply(m);
  c.snapshot = m.snapshot;
  return result;
}
