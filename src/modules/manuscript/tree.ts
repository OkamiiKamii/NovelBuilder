import { GROUP_KINDS, type NodeKind, type StoryNode } from './types';

export interface TreeNode {
  node: StoryNode;
  children: TreeNode[];
  depth: number;
  /** Own words plus every descendant's. */
  totalWords: number;
}

const RANK: Record<NodeKind, number> = { volume: 0, act: 1, arc: 2, chapter: 3, scene: 4 };

export const isGroup = (kind: NodeKind): boolean => (GROUP_KINDS as readonly string[]).includes(kind);
/** Chapters and scenes hold manuscript text. */
export const isDocument = (kind: NodeKind): boolean => kind === 'chapter' || kind === 'scene';

/**
 * The shape of the hierarchy: Volume › Act › Arc › Chapter › Scene. Levels may
 * be skipped (a chapter can sit at the top level or directly in a volume),
 * but a scene always belongs to a chapter.
 */
export function canContain(parent: NodeKind | null, child: NodeKind): boolean {
  if (child === 'scene') return parent === 'chapter';
  if (parent === null) return true;
  return isGroup(parent) && RANK[parent] < RANK[child];
}

export const childKinds = (parent: NodeKind | null): NodeKind[] =>
  (Object.keys(RANK) as NodeKind[]).filter((kind) => canContain(parent, kind));

export const bySiblingOrder = (a: StoryNode, b: StoryNode): number =>
  a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);

export const siblingsOf = (nodes: StoryNode[], parentId: string | null): StoryNode[] =>
  nodes.filter((n) => n.parentId === parentId).sort(bySiblingOrder);

export function buildTree(nodes: StoryNode[]): TreeNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const byParent = new Map<string | null, StoryNode[]>();
  for (const node of nodes) {
    // A node whose parent is missing is shown at the top level rather than lost.
    const key = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), node]);
  }
  const build = (parentId: string | null, depth: number): TreeNode[] =>
    (byParent.get(parentId) ?? []).sort(bySiblingOrder).map((node) => {
      const children = build(node.id, depth + 1);
      return { node, children, depth, totalWords: node.wordCount + children.reduce((n, c) => n + c.totalWords, 0) };
    });
  return build(null, 0);
}

/** Depth-first reading order. Children of collapsed nodes are skipped. */
export function flatten(tree: TreeNode[], collapsed?: ReadonlySet<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (items: TreeNode[]) => {
    for (const item of items) {
      out.push(item);
      if (!collapsed?.has(item.node.id)) walk(item.children);
    }
  };
  walk(tree);
  return out;
}

/** The node's id followed by all of its descendants', parents before children. */
export function subtreeIds(nodes: StoryNode[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) {
    for (const node of nodes) if (node.parentId === out[i]) out.push(node.id);
  }
  return out;
}

export function pathTo(nodes: StoryNode[], id: string): StoryNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: StoryNode[] = [];
  for (let node = byId.get(id); node && !path.includes(node); node = node.parentId ? byId.get(node.parentId) : undefined) {
    path.unshift(node);
  }
  return path;
}

/** Why a node cannot be placed under a parent, or null when it can. */
export function moveError(nodes: StoryNode[], nodeId: string, parentId: string | null): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  const parent = parentId === null ? null : byId.get(parentId);
  if (!node || parent === undefined) return 'That item no longer exists.';
  if (parent && subtreeIds(nodes, nodeId).includes(parent.id)) return 'An item cannot be moved inside itself.';
  if (!canContain(parent?.kind ?? null, node.kind)) {
    return node.kind === 'scene' ? 'A scene must be inside a chapter.' : `A ${node.kind} cannot go inside ${parent ? `a ${parent.kind}` : 'the top level'}.`;
  }
  return null;
}

/** Every place a node may be moved to (`null` is the top level). */
export function validParents(nodes: StoryNode[], nodeId: string): (StoryNode | null)[] {
  const options: (StoryNode | null)[] = moveError(nodes, nodeId, null) === null ? [null] : [];
  for (const { node } of flatten(buildTree(nodes))) {
    if (moveError(nodes, nodeId, node.id) === null) options.push(node);
  }
  return options;
}

export type DropZone = 'before' | 'inside' | 'after';

export interface DropTarget {
  parentId: string | null;
  /** The sibling the node lands in front of; null means last. */
  beforeId: string | null;
  zone: DropZone;
}

/**
 * Turns "dragged X onto the top/middle/bottom of row Y" into a destination
 * expressed purely in ids. Returns null when that drop is not allowed.
 */
export function resolveDrop(nodes: StoryNode[], dragId: string, targetId: string, zone: DropZone): DropTarget | null {
  if (dragId === targetId) return null;
  const target = nodes.find((n) => n.id === targetId);
  if (!target || subtreeIds(nodes, dragId).includes(targetId)) return null;

  if (zone === 'inside') return moveError(nodes, dragId, targetId) === null ? { parentId: targetId, beforeId: null, zone } : null;
  if (moveError(nodes, dragId, target.parentId) !== null) return null;
  if (zone === 'before') return { parentId: target.parentId, beforeId: targetId, zone };
  const siblings = siblingsOf(nodes, target.parentId).filter((n) => n.id !== dragId);
  const next = siblings[siblings.findIndex((n) => n.id === targetId) + 1];
  return { parentId: target.parentId, beforeId: next?.id ?? null, zone };
}

/** Picks the drop for a pointer at `ratio` (0 = top edge, 1 = bottom edge) of a row. */
export function dropAt(nodes: StoryNode[], dragId: string, targetId: string, ratio: number): DropTarget | null {
  const edge: DropZone = ratio < 0.5 ? 'before' : 'after';
  const preference: DropZone[] = ratio < 0.3 || ratio > 0.7 ? [edge, 'inside'] : ['inside', edge];
  for (const zone of preference) {
    const drop = resolveDrop(nodes, dragId, targetId, zone);
    if (drop) return drop;
  }
  return null;
}
