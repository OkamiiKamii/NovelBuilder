// THE SCENE BOARD. The manuscript's chapters and scenes laid out as cards, read from the same nodes the editor and the
// outline show. Nothing is copied: a card is a chapter or scene itself, and moving one changes only where it sits
// (`parentId` and `order`), through the outline's own move. Words are the counts the editor keeps. A port of
// flutter_app/lib/shared/domain/manuscript/board.dart, and of the board page's undo history (the last 20 changes).
//
// The siblings here are ordered as the Flutter app orders them (by order, then creation time, then id: the model's
// compareSiblings), which src/domain/outline.ts's own copy does not do for ties.

import { kindLabel, moveError as outlineMoveError } from '../outline';
import { dartToLowerCase } from '../text/dartString';
import { compareSiblings } from '../model/storyOrder';
import { nodeStatuses } from '../records/nodeStatus';
import { type NodeStatus, type StoryNode, asOutlineNode } from '../records/storyNode';

export class TreeItem {
  constructor(
    readonly node: StoryNode,
    readonly children: TreeItem[],
    readonly depth: number,
    /** Its own words and everything inside it. */
    readonly totalWords: number,
  ) {}
}

/** The manuscript as a tree, siblings in order. A node whose parent is missing is shown at the top level, not lost. */
export function buildTree(nodes: readonly StoryNode[]): TreeItem[] {
  const ids = new Set(nodes.map((n) => n.id));
  const byParent = new Map<string | null, StoryNode[]>();
  for (const node of nodes) {
    const key = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    let list = byParent.get(key);
    if (list === undefined) byParent.set(key, (list = []));
    list.push(node);
  }
  const build = (parentId: string | null, depth: number): TreeItem[] =>
    [...(byParent.get(parentId) ?? [])].sort(compareSiblings).map((node) => {
      const children = build(node.id, depth + 1);
      return new TreeItem(node, children, depth, node.wordCount + children.reduce((n, c) => n + c.totalWords, 0));
    });
  return build(null, 0);
}

/** Depth-first reading order. */
export function flattenTree(tree: readonly TreeItem[]): TreeItem[] {
  const out: TreeItem[] = [];
  const walk = (items: readonly TreeItem[]) => {
    for (const item of items) {
      out.push(item);
      walk(item.children);
    }
  };
  walk(tree);
  return out;
}

/** The siblings under `parentId` (null: the top level), in order. */
export function siblingsOf(nodes: readonly StoryNode[], parentId: string | null): StoryNode[] {
  return nodes.filter((n) => n.parentId === parentId).sort(compareSiblings);
}

/** Why `nodeId` cannot go inside `parentId` (null: the top level), or null when it can. */
export function moveError(nodes: readonly StoryNode[], nodeId: string, parentId: string | null): string | null {
  return outlineMoveError(nodes.map(asOutlineNode), nodeId, parentId);
}

/** The node and the volumes, acts and arcs above it, outermost first. */
export function pathTo(nodes: readonly StoryNode[], id: string): StoryNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: StoryNode[] = [];
  for (
    let node = byId.get(id);
    node !== undefined && !path.includes(node);
    node = node.parentId === null ? undefined : byId.get(node.parentId)
  ) {
    path.unshift(node);
  }
  return path;
}

export class BoardCard {
  constructor(
    readonly node: StoryNode,
    readonly words: number,
  ) {}
}

/** A chapter and the scenes inside it, in reading order. */
export class BoardColumn {
  constructor(
    readonly chapter: StoryNode,
    /** The chapter's own words and its scenes'. */
    readonly words: number,
    readonly scenes: BoardCard[],
  ) {}
}

/** A run of chapters that sit directly in the same place: a volume, act or arc, or the top level. */
export class BoardPart {
  constructor(
    readonly key: string,
    /** Where its chapters sit (null: the top level). */
    readonly parentId: string | null,
    /** The volumes, acts and arcs it is in, outermost first; empty at the top level. */
    readonly path: StoryNode[],
    readonly columns: BoardColumn[],
    /** Where a chapter dropped at the end of this part lands: in front of this sibling (null: last). */
    public endBeforeId: string | null = null,
  ) {}
}

/** The board, in reading order. Chapters next to each other in the same place form one part; a volume, act or arc
 * between them starts a new one, so the board never reorders the book to group it. A volume, act or arc with nothing in
 * it is an empty part, so chapters can be moved into it. */
export function boardOf(nodes: readonly StoryNode[]): BoardPart[] {
  const ids = new Set(nodes.map((n) => n.id));
  const parentOf = (node: StoryNode) => (node.parentId !== null && ids.has(node.parentId) ? node.parentId : null);
  const parts: BoardPart[] = [];
  let open: BoardPart | null = null;
  let column: BoardColumn | null = null;
  for (const item of flattenTree(buildTree(nodes))) {
    const node = item.node;
    if (node.kind === 'chapter') {
      const parentId = parentOf(node);
      if (open === null || open.parentId !== parentId) {
        open = new BoardPart(`${parentId ?? 'top'}:${node.id}`, parentId, parentId === null ? [] : pathTo(nodes, parentId), []);
        parts.push(open);
      }
      column = new BoardColumn(node, item.totalWords, []);
      open.columns.push(column);
    } else if (node.kind === 'scene') {
      if (column !== null && parentOf(node) === column.chapter.id) column.scenes.push(new BoardCard(node, item.totalWords));
    } else {
      open = null;
      column = null;
      if (item.children.length === 0) parts.push(new BoardPart(`${node.id}:empty`, node.id, pathTo(nodes, node.id), []));
    }
  }
  for (const part of parts) {
    const last = part.columns.length === 0 ? null : part.columns[part.columns.length - 1].chapter;
    if (last === null) continue;
    const siblings = siblingsOf(nodes, part.parentId);
    const at = siblings.findIndex((n) => n.id === last.id) + 1;
    part.endBeforeId = at < siblings.length ? siblings[at].id : null;
  }
  return parts;
}

export type BoardFilter = {
  status?: NodeStatus | null;
  text?: string;
  /** Only these chapters and scenes (where a plot thread is recorded), or null for all. */
  nodeIds?: ReadonlySet<string> | null;
};

/** Whether a filter narrows the board at all. */
export function isFiltered(filter: BoardFilter): boolean {
  return (filter.status ?? null) !== null || (filter.text ?? '').trim().length > 0 || (filter.nodeIds ?? null) !== null;
}

const lower = dartToLowerCase;

/** Whether a chapter or scene matches: its status, the words in its title or summary, and (with a thread chosen)
 * whether the thread is recorded there. */
export function matchesBoard(node: StoryNode, filter: BoardFilter): boolean {
  const text = lower((filter.text ?? '').trim());
  const status = filter.status ?? null;
  const nodeIds = filter.nodeIds ?? null;
  return (
    (status === null || node.status === status) &&
    (nodeIds === null || nodeIds.has(node.id)) &&
    (text.length === 0 || lower(node.title).includes(text) || lower(node.summary).includes(text))
  );
}

/** The board narrowed by a filter: a chapter stays when it or one of its scenes matches, with only its matching scenes;
 * parts left empty go. */
export function filterBoard(parts: readonly BoardPart[], filter: BoardFilter): BoardPart[] {
  if (!isFiltered(filter)) return [...parts];
  return parts.flatMap((part) => {
    const columns = part.columns.flatMap((c) => {
      const scenes = c.scenes.filter((s) => matchesBoard(s.node, filter));
      return matchesBoard(c.chapter, filter) || scenes.length > 0 ? [new BoardColumn(c.chapter, c.words, scenes)] : [];
    });
    return columns.length === 0 ? [] : [new BoardPart(part.key, part.parentId, part.path, columns, part.endBeforeId)];
  });
}

/** A place in the book: inside `parentId` (null: the top level), in front of `beforeId` (null: last). */
export type Place = { parentId: string | null; beforeId: string | null };

/** Where a node is now: its parent, and the sibling after it. */
export function placeOf(nodes: readonly StoryNode[], nodeId: string): Place | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (node === undefined) return null;
  const siblings = siblingsOf(nodes, node.parentId);
  const at = siblings.findIndex((n) => n.id === nodeId) + 1;
  return { parentId: node.parentId, beforeId: at < siblings.length ? siblings[at].id : null };
}

/** Moving a node to where it already is changes nothing. */
export function samePlace(nodes: readonly StoryNode[], nodeId: string, to: Place): boolean {
  const now = placeOf(nodes, nodeId);
  return now !== null && now.parentId === to.parentId && (to.beforeId === nodeId || now.beforeId === to.beforeId);
}

/** Where a moved card lands: a scene in front of another scene or at the end of a chapter; a chapter in front of another
 * chapter or at the end of a part. Null when that is not allowed, or would change nothing. */
export function dropOf(nodes: readonly StoryNode[], dragId: string, to: Place): Place | null {
  if (to.beforeId === dragId) return null;
  if (moveError(nodes, dragId, to.parentId) !== null) return null;
  if (to.beforeId !== null && nodes.find((n) => n.id === to.beforeId)?.parentId !== to.parentId) return null;
  return samePlace(nodes, dragId, to) ? null : to;
}

/** A move that would carry more than one card into another volume, act or arc: a chapter with its scenes. Asked about
 * before it is made. */
export function bulkOf(nodes: readonly StoryNode[], nodeId: string, to: Place): { scenes: number; words: number } | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (node === undefined || node.kind !== 'chapter' || node.parentId === to.parentId) return null;
  const scenes = nodes.filter((n) => n.parentId === nodeId && (n.kind === 'chapter' || n.kind === 'scene'));
  if (scenes.length === 0) return null;
  return { scenes: scenes.length, words: node.wordCount + scenes.reduce((n, s) => n + s.wordCount, 0) };
}

/** A change made on the board, and how to take it back. */
export type BoardChange =
  | { kind: 'move'; nodeId: string; title: string; from: Place; to: Place }
  | { kind: 'status'; nodeId: string; title: string; from: NodeStatus; to: NodeStatus };

/** A status's name: "Draft Complete". */
export function statusLabel(status: NodeStatus): string {
  return nodeStatuses.find((s) => s.key === status)?.label ?? status;
}

/** Why a change can no longer be undone, or null when it can. Undo puts back only what the board changed, and only
 * while things are as the board left them: if the card has been moved or its status changed since, or where it came
 * from is gone, undo says so instead of guessing. */
export function undoProblem(nodes: readonly StoryNode[], change: BoardChange): string | null {
  const node = nodes.find((n) => n.id === change.nodeId);
  if (node === undefined) return `“${change.title}” no longer exists.`;
  if (change.kind === 'status') return node.status === change.to ? null : `The status of “${change.title}” has been changed since.`;
  const { from, to } = change;
  const now = placeOf(nodes, change.nodeId)!;
  if (now.parentId !== to.parentId || now.beforeId !== to.beforeId) return `“${change.title}” has been moved since.`;
  if (from.parentId !== null && !nodes.some((n) => n.id === from.parentId)) return `Where “${change.title}” came from no longer exists.`;
  if (from.beforeId !== null && nodes.find((n) => n.id === from.beforeId)?.parentId !== from.parentId) {
    return `Where “${change.title}” came from has changed since.`;
  }
  return moveError(nodes, change.nodeId, from.parentId);
}

/** A change in words, for the line that offers to undo it. */
export function boardChangeWords(change: BoardChange, nodes: readonly StoryNode[]): string {
  if (change.kind === 'status') return `“${change.title}” set to ${statusLabel(change.to)}.`;
  const name = (id: string | null) => (id === null ? null : (nodes.find((n) => n.id === id)?.title ?? null));
  const { to } = change;
  const where = to.parentId !== null ? `in “${name(to.parentId) ?? 'a deleted chapter'}”` : 'at the top level';
  return `Moved “${change.title}” ${where}${to.beforeId !== null ? `, before “${name(to.beforeId) ?? '…'}”` : ', at the end'}.`;
}

/** How many changes the board can take back, newest first. */
export const undoLimit = 20;

/** The board's undo history: the last 20 moves and status changes, newest last. Pure: each step returns a new one. */
export class BoardHistory {
  static readonly empty = new BoardHistory([], '');

  constructor(
    readonly changes: readonly BoardChange[],
    /** What was just done (or undone), in words; '' for nothing. */
    readonly said: string,
  ) {}

  get last(): BoardChange | null {
    return this.changes.length === 0 ? null : this.changes[this.changes.length - 1];
  }

  /** The Undo button's words for the newest change, or null when there is none. */
  get undoLabel(): string | null {
    const last = this.last;
    return last === null ? null : `Undo ${last.kind === 'move' ? 'move' : 'status'} of “${last.title}”`;
  }

  /** A change made: kept (the oldest dropped past 20) and said. */
  remember(change: BoardChange, nodes: readonly StoryNode[]): BoardHistory {
    const changes = [...this.changes, change];
    if (changes.length > undoLimit) changes.shift();
    return new BoardHistory(changes, boardChangeWords(change, nodes));
  }

  /** The newest change taken off: what to undo (or why it cannot be), and the history after. `nodes` as they are now;
   * `said` is filled in by `undone` once the undo is made. */
  takeLast(nodes: readonly StoryNode[]): { history: BoardHistory; change: BoardChange; problem: string | null; words: string } | null {
    const change = this.last;
    if (change === null) return null;
    return {
      history: new BoardHistory(this.changes.slice(0, -1), this.said),
      change,
      problem: undoProblem(nodes, change),
      words: boardChangeWords(change, nodes),
    };
  }

  /** The history after an undo was made: "Undone: <words>". */
  undone(words: string): BoardHistory {
    return new BoardHistory(this.changes, `Undone: ${words}`);
  }
}

/** One place earlier (-1) or later (1) among the same siblings, or null at either end. */
export function nudgePlace(nodes: readonly StoryNode[], node: StoryNode, by: number): Place | null {
  const siblings = siblingsOf(nodes, node.parentId);
  const at = siblings.findIndex((n) => n.id === node.id);
  if (by < 0 && at <= 0) return null;
  if (by > 0 && at === siblings.length - 1) return null;
  const before = by < 0 ? siblings[at - 1] : at + 2 < siblings.length ? siblings[at + 2] : null;
  return { parentId: node.parentId, beforeId: before?.id ?? null };
}

/** A volume, act or arc in words, with what it sits in: "Volume One › Act II". */
export function pathLabel(path: readonly StoryNode[]): string {
  return path.map((n) => n.title).join(' › ');
}

/** A kind's name: "Volume". */
export function kindName(node: StoryNode): string {
  return node.kind === null ? '' : kindLabel[node.kind];
}
