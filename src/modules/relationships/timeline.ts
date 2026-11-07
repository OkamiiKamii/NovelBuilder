import type { LoreEntry } from '@/modules/codex/types';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import type { StoryNode } from '@/modules/manuscript/types';
import { AFFINITY_LABELS, type CharacterRelation, type RelationStage } from './types';

/** Where everything sits in reading order, and how chapters are numbered. */
export interface StoryOrder {
  /** Position of every node (volume, chapter, scene…) in reading order. */
  position: Map<string, number>;
  /** For every node, the number of the chapter it is, or of the first chapter at or after it. */
  chapterNumber: Map<string, number>;
  chapters: StoryNode[];
}

export function storyOrder(nodes: StoryNode[]): StoryOrder {
  const reading = flatten(buildTree(nodes)).map((t) => t.node);
  const position = new Map(reading.map((node, i) => [node.id, i]));
  const chapters = reading.filter((n) => n.kind === 'chapter');
  const chapterNumber = new Map<string, number>();
  let seen = 0;
  for (const node of reading) {
    if (node.kind === 'chapter') chapterNumber.set(node.id, ++seen);
    // A scene belongs to the chapter it is in; a volume or arc points at the first chapter inside or after it.
    else chapterNumber.set(node.id, node.kind === 'scene' ? Math.max(seen, 1) : seen + 1);
  }
  return { position, chapterNumber, chapters };
}

/** A stage whose starting chapter no longer exists counts from the start of the story. */
const startOf = (stage: RelationStage, order: StoryOrder): number => (stage.startNodeId === null ? -1 : (order.position.get(stage.startNodeId) ?? -1));

/**
 * A relationship's stages in reading order. Stages starting at the same
 * point keep the order they were added in. A stage whose chapter is not said
 * stays just after the stage recorded before it: it is never moved to a
 * chapter of its own.
 */
export function sortedStages(relation: CharacterRelation, order: StoryOrder): RelationStage[] {
  let previous = -1;
  const keyed = relation.stages.map((stage, index) => {
    const key = stage.startUnknown ? previous : startOf(stage, order);
    previous = key;
    return { stage, index, key };
  });
  return keyed.sort((a, b) => a.key - b.key || a.index - b.index).map(({ stage }) => stage);
}

/**
 * The state of a relationship at a point in the story: the latest stage that
 * has begun by `atNodeId` (null = the end of the story). Returns null when
 * the relationship has not started yet at that point. A stage whose chapter
 * is not said counts only at the end: at any chapter, whether it has begun
 * is not known, so it is not assumed.
 */
export function stageAt(relation: CharacterRelation, atNodeId: string | null, order: StoryOrder): RelationStage | null {
  const stages = sortedStages(relation, order);
  if (atNodeId === null) return stages[stages.length - 1] ?? null;
  const at = order.position.get(atNodeId) ?? Infinity;
  let current: RelationStage | null = null;
  for (const stage of stages) if (!stage.startUnknown && startOf(stage, order) <= at) current = stage;
  return current;
}

export interface TimelineEntry {
  stage: RelationStage;
  /** e.g. "Chapters 1–10", "Chapter 11", "Chapters 21+". */
  range: string;
  /** The starting point no longer exists in the manuscript. */
  orphaned: boolean;
}

/** A relationship's history as labelled chapter ranges. */
export function timelineOf(relation: CharacterRelation, order: StoryOrder): TimelineEntry[] {
  const stages = sortedStages(relation, order);
  const total = order.chapters.length;
  const first = (stage: RelationStage) => (stage.startNodeId === null ? 1 : (order.chapterNumber.get(stage.startNodeId) ?? 1));
  return stages.map((stage, i) => {
    // Where the reader meets it is not said: no range is claimed.
    if (stage.startUnknown) return { stage, range: total === 0 ? `Stage ${i + 1}` : `Stage ${i + 1}, chapter not said`, orphaned: false };
    const from = Math.min(first(stage), Math.max(total, 1));
    const following = stages.slice(i + 1);
    const next = following.find((s) => !s.startUnknown);
    // A change whose chapter is not said comes before the next known one: this stage lasts until some point not given.
    const open = following.length > 0 && following[0].startUnknown;
    const to = next ? Math.max(from, first(next) - 1) : null;
    const range =
      total === 0 ? (i === stages.length - 1 && i === 0 ? 'Whole story' : `Stage ${i + 1}`) : open ? `From chapter ${from}` : to === null ? (from >= total ? `Chapter ${from}+` : `Chapters ${from}+`) : to === from ? `Chapter ${from}` : `Chapters ${from}–${to}`;
    return { stage, range, orphaned: stage.startNodeId !== null && !order.position.has(stage.startNodeId) };
  });
}

/**
 * What a stage changes from the one before it, in words: its type, its
 * feeling, its tracked attributes (each way) and its title. Empty for the
 * first stage, and for a stage that records the same state again.
 */
export function stageDifferences(before: RelationStage | null, stage: RelationStage, names: { from: string; to: string }, attributes: { key: string; label: string }[] = []): string[] {
  if (!before) return [];
  const out: string[] = [];
  const said = (v: number | null | undefined) => (v === null || v === undefined ? 'not said' : String(v));
  if ((before.label || 'Related') !== (stage.label || 'Related')) out.push(`type: ${before.label || 'Related'} → ${stage.label || 'Related'}`);
  if (before.affinity !== stage.affinity) out.push(`feeling: ${AFFINITY_LABELS[before.affinity]} → ${AFFINITY_LABELS[stage.affinity]}`);
  for (const a of attributes) {
    for (const [side, who, toward] of [['from', names.from, names.to], ['to', names.to, names.from]] as const) {
      const [was, now] = [before.attributes?.[a.key]?.[side], stage.attributes?.[a.key]?.[side]];
      if ((was ?? null) !== (now ?? null)) out.push(`${who}’s ${a.label.toLowerCase()} toward ${toward}: ${said(was)} → ${said(now)}`);
    }
  }
  if (before.title !== stage.title && stage.title) out.push(`now called “${stage.title}”`);
  return out;
}

/** How one side describes the other under a stage: "Mentor", "Rival"… */
export const roleOf = (stage: RelationStage, relation: CharacterRelation, entryId: string): string =>
  (relation.fromId === entryId ? stage.fromRole : stage.toRole) || stage.label || 'Related';

export interface MapNode {
  entry: LoreEntry;
  x: number;
  y: number;
  focus: boolean;
}

export const MAP = { width: 800, height: 560, radius: 30 };

/**
 * Places characters for the network map. With a focus character, they sit in
 * the centre with everyone they are connected to around them; without one,
 * every character with a relationship sits on a ring. Positions depend only
 * on names, so the map does not jump around between visits.
 */
export function layoutMap(entries: LoreEntry[], relations: CharacterRelation[], focusId: string | null): MapNode[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const linked = new Set(relations.flatMap((r) => [r.fromId, r.toId]));
  const centre = { x: MAP.width / 2, y: MAP.height / 2 };
  const ring = (items: LoreEntry[], radiusX: number, radiusY: number): MapNode[] =>
    items.map((entry, i) => {
      const angle = (2 * Math.PI * i) / items.length - Math.PI / 2;
      return { entry, x: Math.round(centre.x + radiusX * Math.cos(angle)), y: Math.round(centre.y + radiusY * Math.sin(angle)), focus: false };
    });
  const byName = (a: LoreEntry, b: LoreEntry) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

  const focus = focusId ? byId.get(focusId) : undefined;
  if (focus) {
    const around = relations.flatMap((r) => (r.fromId === focus.id ? [r.toId] : r.toId === focus.id ? [r.fromId] : [])).flatMap((id) => byId.get(id) ?? []);
    return [{ entry: focus, ...centre, focus: true }, ...ring([...new Set(around)].sort(byName), 300, 205)];
  }
  const everyone = entries.filter((e) => linked.has(e.id)).sort(byName);
  if (everyone.length === 1) return [{ entry: everyone[0], ...centre, focus: false }];
  return ring(everyone, 310, 215);
}
