import { buildTree, flatten, isDocument, moveError, pathTo, siblingsOf } from './tree';
import { STATUS_LABELS, type NodeStatus, type StoryNode } from './types';

/**
 * THE SCENE BOARD
 * The manuscript's chapters and scenes laid out as cards, read from the same
 * nodes the editor and the Organizer show. Nothing is copied: a card is a
 * chapter or scene itself, and moving one changes only where it sits
 * (`parentId` and `order`), through the manuscript's own `move`. Words are
 * the counts the editor keeps.
 */

export interface BoardCard {
  node: StoryNode;
  words: number;
}

/** A chapter and the scenes inside it, in reading order. */
export interface BoardColumn {
  chapter: StoryNode;
  /** The chapter's own words and its scenes'. */
  words: number;
  scenes: BoardCard[];
}

/** A run of chapters that sit directly in the same place: a volume, act or arc, or the top level. */
export interface BoardPart {
  key: string;
  /** Where its chapters sit (null: the top level). */
  parentId: string | null;
  /** The volumes, acts and arcs it is in, outermost first; empty at the top level. */
  path: StoryNode[];
  columns: BoardColumn[];
  /** Where a chapter dropped at the end of this part lands: in front of this sibling (null: last). */
  endBeforeId: string | null;
}

/**
 * The board, in reading order. Chapters next to each other in the same place
 * form one part; a volume, act or arc between them starts a new one, so the
 * board never reorders the book to group it. A volume, act or arc with
 * nothing in it is an empty part, so chapters can be moved into it.
 */
export function boardOf(nodes: StoryNode[]): BoardPart[] {
  const ids = new Set(nodes.map((n) => n.id));
  const parentOf = (node: StoryNode) => (node.parentId !== null && ids.has(node.parentId) ? node.parentId : null);
  const parts: BoardPart[] = [];
  let open: BoardPart | null = null;
  let column: BoardColumn | null = null;
  for (const item of flatten(buildTree(nodes))) {
    const { node } = item;
    if (node.kind === 'chapter') {
      const parentId = parentOf(node);
      if (!open || open.parentId !== parentId) {
        open = { key: `${parentId ?? 'top'}:${node.id}`, parentId, path: parentId ? pathTo(nodes, parentId) : [], columns: [], endBeforeId: null };
        parts.push(open);
      }
      column = { chapter: node, words: item.totalWords, scenes: [] };
      open.columns.push(column);
    } else if (node.kind === 'scene') {
      if (column && parentOf(node) === column.chapter.id) column.scenes.push({ node, words: item.totalWords });
    } else {
      open = null;
      column = null;
      if (!item.children.length) parts.push({ key: `${node.id}:empty`, parentId: node.id, path: pathTo(nodes, node.id), columns: [], endBeforeId: null });
    }
  }
  for (const part of parts) {
    const last = part.columns.at(-1)?.chapter;
    if (!last) continue;
    const siblings = siblingsOf(nodes, part.parentId);
    part.endBeforeId = siblings[siblings.findIndex((n) => n.id === last.id) + 1]?.id ?? null;
  }
  return parts;
}

export interface BoardFilter {
  status: NodeStatus | null;
  text: string;
  /** Only these chapters and scenes (where a plot thread is recorded), or null for all. */
  nodeIds?: ReadonlySet<string> | null;
}
export const NO_BOARD_FILTER: BoardFilter = { status: null, text: '' };
export const isFiltered = (filter: BoardFilter) => filter.status !== null || filter.text.trim() !== '' || Boolean(filter.nodeIds);

/** Whether a chapter or scene matches: its status, the words in its title or summary, and (with a thread chosen) whether the thread is recorded there. */
export function matches(node: StoryNode, filter: BoardFilter): boolean {
  const text = filter.text.trim().toLowerCase();
  return (filter.status === null || node.status === filter.status) && (!filter.nodeIds || filter.nodeIds.has(node.id)) && (!text || node.title.toLowerCase().includes(text) || node.summary.toLowerCase().includes(text));
}

/**
 * The board narrowed by a filter: a chapter stays when it or one of its
 * scenes matches, with only its matching scenes; parts left empty go.
 */
export function filterBoard(parts: BoardPart[], filter: BoardFilter): BoardPart[] {
  if (!isFiltered(filter)) return parts;
  return parts
    .map((part) => ({ ...part, columns: part.columns.map((c) => ({ ...c, scenes: c.scenes.filter((s) => matches(s.node, filter)) })).filter((c) => matches(c.chapter, filter) || c.scenes.length > 0) }))
    .filter((part) => part.columns.length > 0);
}

// ---------------------------------------------------------------------------------------------------- moving

/** A place in the book: inside `parentId` (null: the top level), in front of `beforeId` (null: last). */
export interface Place {
  parentId: string | null;
  beforeId: string | null;
}

/** Where a node is now: its parent, and the sibling after it. */
export function placeOf(nodes: StoryNode[], nodeId: string): Place | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const siblings = siblingsOf(nodes, node.parentId);
  return { parentId: node.parentId, beforeId: siblings[siblings.findIndex((n) => n.id === nodeId) + 1]?.id ?? null };
}

/** Moving a node to where it already is changes nothing. */
export function samePlace(nodes: StoryNode[], nodeId: string, to: Place): boolean {
  const now = placeOf(nodes, nodeId);
  return Boolean(now) && now!.parentId === to.parentId && (to.beforeId === nodeId || now!.beforeId === to.beforeId);
}

/**
 * Where a dragged card lands: a scene in front of another scene or at the
 * end of a chapter; a chapter in front of another chapter or at the end of a
 * part. Null when that is not allowed, or would change nothing.
 */
export function dropOf(nodes: StoryNode[], dragId: string, to: Place): Place | null {
  if (to.beforeId === dragId) return null;
  if (moveError(nodes, dragId, to.parentId)) return null;
  if (to.beforeId !== null && nodes.find((n) => n.id === to.beforeId)?.parentId !== to.parentId) return null;
  return samePlace(nodes, dragId, to) ? null : to;
}

/** A move that would carry more than one card into another volume, act or arc: a chapter with its scenes. Asked about before it is made. */
export function bulkOf(nodes: StoryNode[], nodeId: string, to: Place): { scenes: number; words: number } | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.kind !== 'chapter' || node.parentId === to.parentId) return null;
  const scenes = nodes.filter((n) => n.parentId === nodeId && isDocument(n.kind));
  if (!scenes.length) return null;
  return { scenes: scenes.length, words: node.wordCount + scenes.reduce((n, s) => n + s.wordCount, 0) };
}

/** A change made on the board, and how to take it back. */
export type BoardChange = { kind: 'move'; nodeId: string; title: string; from: Place; to: Place } | { kind: 'status'; nodeId: string; title: string; from: NodeStatus; to: NodeStatus };

/**
 * Why a change can no longer be undone, or null when it can. Undo puts back
 * only what the board changed, and only while things are as the board left
 * them: if the card has been moved or its status changed since (here, in the
 * Organizer or anywhere else), or where it came from is gone, undo says so
 * instead of guessing.
 */
export function undoProblem(nodes: StoryNode[], change: BoardChange): string | null {
  const node = nodes.find((n) => n.id === change.nodeId);
  if (!node) return `“${change.title}” no longer exists.`;
  if (change.kind === 'status') return node.status === change.to ? null : `The status of “${change.title}” has been changed since.`;
  const now = placeOf(nodes, change.nodeId)!;
  if (now.parentId !== change.to.parentId || now.beforeId !== change.to.beforeId) return `“${change.title}” has been moved since.`;
  const { parentId, beforeId } = change.from;
  if (parentId !== null && !nodes.some((n) => n.id === parentId)) return `Where “${change.title}” came from no longer exists.`;
  if (beforeId !== null && nodes.find((n) => n.id === beforeId)?.parentId !== parentId) return `Where “${change.title}” came from has changed since.`;
  return moveError(nodes, change.nodeId, parentId);
}

/** A change in words, for the line that offers to undo it. */
export function changeWords(change: BoardChange, nodes: StoryNode[]): string {
  if (change.kind === 'status') return `“${change.title}” set to ${STATUS_LABELS[change.to]}.`;
  const name = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.title : undefined);
  const where = change.to.parentId ? `in “${name(change.to.parentId) ?? 'a deleted chapter'}”` : 'at the top level';
  return `Moved “${change.title}” ${where}${change.to.beforeId ? `, before “${name(change.to.beforeId) ?? '…'}”` : ', at the end'}.`;
}
