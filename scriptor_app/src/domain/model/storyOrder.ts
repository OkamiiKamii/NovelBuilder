// READING ORDER: where each node sits when the book is read front to back, and chapter numbers. A port of
// flutter_app/lib/shared/domain/model/story_order.dart.
//
// Not the outline's order (../outline.ts `readingOrder`, `compareSiblings`, `subtreeIds`): this is the model's, as the
// Dart model reads it. It differs in three ways: siblings tied on `order` sort by creation time and then by id in
// collation order (the outline: by id in code-unit order); a node whose parent is missing is read among the top-level
// nodes in sibling order (the outline: after everything else); and nodes caught in a parent loop are left out (the
// outline: added at the end).

import { localeCompare } from '../collation';
import { compareNum, dartSort } from '../manuscript/dartSort';
import { type CharacterRelation, type RelationStage } from '../records/relation';
import { type StoryNode } from '../records/storyNode';

export class StoryOrder {
  private constructor(
    /** Position of every node (volume, chapter, scene…) in reading order. */
    readonly position: ReadonlyMap<string, number>,
    /** For every node, the number of the chapter it is, or of the first chapter at or after it. */
    readonly chapterNumber: ReadonlyMap<string, number>,
    readonly chapters: readonly StoryNode[],
  ) {}

  static of(nodes: Iterable<StoryNode>): StoryOrder {
    const reading = readingOrder(nodes);
    const position = new Map<string, number>();
    reading.forEach((n, i) => position.set(n.id, i));
    const chapters = reading.filter((n) => n.kind === 'chapter');
    const chapterNumber = new Map<string, number>();
    let seen = 0;
    for (const node of reading) {
      if (node.kind === 'chapter') {
        chapterNumber.set(node.id, ++seen);
      } else {
        // A scene belongs to the chapter it is in; a volume or arc points at the first chapter inside or after it.
        chapterNumber.set(node.id, node.kind === 'scene' ? (seen < 1 ? 1 : seen) : seen + 1);
      }
    }
    return new StoryOrder(position, chapterNumber, chapters);
  }
}

/** Siblings by `order`, then creation time, then id, as the original app's tree sorts them. */
export function compareSiblings(a: StoryNode, b: StoryNode): number {
  const byOrder = compareNum(a.order, b.order);
  if (byOrder !== 0) return byOrder;
  const byCreated = compareNum(a.createdAt, b.createdAt);
  return byCreated !== 0 ? byCreated : localeCompare(a.id, b.id);
}

/** The nodes depth-first, parents before children. A node whose parent is missing is read at the top level rather
 * than lost. */
export function readingOrder(nodes: Iterable<StoryNode>): StoryNode[] {
  const list = [...nodes];
  const ids = new Set(list.map((n) => n.id));
  const byParent = new Map<string | null, StoryNode[]>();
  for (const node of list) {
    const key = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    let children = byParent.get(key);
    if (!children) byParent.set(key, (children = []));
    children.push(node);
  }
  const out: StoryNode[] = [];
  const walk = (parentId: string | null) => {
    const children = dartSort([...(byParent.get(parentId) ?? [])], compareSiblings);
    for (const child of children) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(null);
  return out;
}

/** The node's id followed by all of its descendants', parents before children (breadth first). */
export function subtreeIds(nodes: Iterable<StoryNode>, rootId: string): string[] {
  const list = [...nodes];
  const out = [rootId];
  // Each node taken once: the Dart's list wherever it finishes, and an end on a parent cycle (a damaged novel can hold
  // one; the Dart's loop then never ends, which on the phone freezes the app).
  const seen = new Set(out);
  for (let i = 0; i < out.length; i++) {
    for (const node of list) {
      if (node.parentId === out[i] && !seen.has(node.id)) {
        seen.add(node.id);
        out.push(node.id);
      }
    }
  }
  return out;
}

function startOf(stage: RelationStage, order: StoryOrder): number {
  return stage.startNodeId === null ? -1 : (order.position.get(stage.startNodeId) ?? -1);
}

/** A relationship's stages in reading order. Stages starting at the same point keep the order they were added in. A
 * stage whose chapter is not said stays just after the stage recorded before it. */
export function sortedStages(relation: CharacterRelation, order: StoryOrder): RelationStage[] {
  let previous = -1;
  const keyed: [RelationStage, number, number][] = [];
  relation.stages.forEach((stage, i) => {
    const key = stage.startUnknown ? previous : startOf(stage, order);
    previous = key;
    keyed.push([stage, i, key]);
  });
  dartSort(keyed, (a, b) => (a[2] !== b[2] ? compareNum(a[2], b[2]) : compareNum(a[1], b[1])));
  return keyed.map((k) => k[0]);
}

/** The state of a relationship at a point in the story: the latest stage begun by `atNodeId` (null: the end of the
 * story). Null when it has not started yet there. A stage whose chapter is not said counts only at the end. */
export function stageAt(relation: CharacterRelation, atNodeId: string | null, order: StoryOrder): RelationStage | null {
  const stages = sortedStages(relation, order);
  if (atNodeId === null) return stages.length === 0 ? null : stages[stages.length - 1];
  const at = order.position.get(atNodeId);
  let current: RelationStage | null = null;
  for (const stage of stages) {
    if (!stage.startUnknown && (at === undefined || startOf(stage, order) <= at)) current = stage;
  }
  return current;
}
