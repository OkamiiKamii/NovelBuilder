// The manuscript's structure: volumes, acts, arcs, chapters and scenes (the `chapters` collection). Each change returns
// the novel as it would be after it; nothing is saved until the caller stores it. A port of
// flutter_app/lib/shared/domain/manuscript/outline.dart.
//
// READING ORDER ONLY: moving, reordering, splitting and merging change `parentId` and `order` (and, for split and merge,
// which node holds which text). They never touch events, so when things happen in the story stays as it was.
// STABLE IDS: renaming, reordering and moving never change an id.

import { newId } from './ids';
import { type JsonMap, isMap, jsonEquals, listOf, numOrNull, str } from './json';
import { emptyDoc, measureDoc, mentionsIn } from './prose';
import { substituteIds } from './snapshot/copy';
import type { NovelSnapshot } from './snapshot/novelSnapshot';

export type NodeKind = 'volume' | 'act' | 'arc' | 'chapter' | 'scene';
export const nodeKinds: readonly NodeKind[] = ['volume', 'act', 'arc', 'chapter', 'scene'];

export const kindLabel: Record<NodeKind, string> = {
  volume: 'Volume',
  act: 'Act',
  arc: 'Arc',
  chapter: 'Chapter',
  scene: 'Scene',
};

const rank: Record<NodeKind, number> = { volume: 0, act: 1, arc: 2, chapter: 3, scene: 4 };

/** Why a change to the structure cannot be made as asked, in words. Nothing is changed. */
export class OutlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutlineError';
  }
}

/** One volume, act, arc, chapter or scene as the screens read it. `raw` keeps every field. */
export type StoryNode = {
  raw: JsonMap;
  id: string;
  parentId: string | null;
  kind: NodeKind | null;
  title: string;
  order: number;
  status: string;
  wordCount: number;
  charCount: number;
};

export function storyNode(raw: JsonMap): StoryNode {
  const kind = str(raw['kind']);
  return {
    raw,
    id: str(raw['id']),
    parentId: typeof raw['parentId'] === 'string' && raw['parentId'] ? raw['parentId'] : null,
    kind: (nodeKinds as readonly string[]).includes(kind) ? (kind as NodeKind) : null,
    title: str(raw['title']),
    order: numOrNull(raw['order']) ?? 0,
    status: str(raw['status'], 'idea'),
    wordCount: numOrNull(raw['wordCount']) ?? 0,
    charCount: numOrNull(raw['charCount']) ?? 0,
  };
}

export function nodesOf(s: NovelSnapshot): StoryNode[] {
  return s.rows('chapters').map(storyNode);
}

export const isGroup = (kind: NodeKind | null) => kind === 'volume' || kind === 'act' || kind === 'arc';
/** Chapters and scenes hold text; volumes, acts and arcs group them. */
export const isDocument = (kind: NodeKind | null) => kind === 'chapter' || kind === 'scene';

/** Scenes go inside chapters; groups hold what is below them; anything but a scene can be at the top level. */
export function canContain(parent: NodeKind | null, child: NodeKind): boolean {
  if (child === 'scene') return parent === 'chapter';
  if (parent === null) return true;
  return isGroup(parent) && rank[parent] < rank[child];
}

/** The kinds that can be added inside a node (or at the top level, for null). */
export function kindsInside(parent: NodeKind | null): NodeKind[] {
  return nodeKinds.filter((k) => canContain(parent, k));
}

/** Siblings sort by `order`, then by id so the order is the same everywhere. */
export function compareSiblings(a: StoryNode, b: StoryNode): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function siblingsOf(nodes: readonly StoryNode[], parentId: string | null): StoryNode[] {
  return nodes.filter((n) => n.parentId === parentId).sort(compareSiblings);
}

/** A node and everything inside it, depth first. */
export function subtreeIds(nodes: readonly StoryNode[], id: string): string[] {
  const out: string[] = [];
  // Each node visited once, so a parent cycle in a damaged novel ends the walk instead of overflowing the stack.
  const seen = new Set<string>();
  const walk = (at: string) => {
    if (seen.has(at)) return;
    seen.add(at);
    out.push(at);
    for (const child of siblingsOf(nodes, at)) walk(child.id);
  };
  walk(id);
  return out;
}

/** Every node in reading order (depth first), with its depth. Nodes whose parent is missing come last, at the top. */
export function readingOrder(nodes: readonly StoryNode[]): { node: StoryNode; depth: number }[] {
  const out: { node: StoryNode; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const n of siblingsOf(nodes, parentId)) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push({ node: n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const n of nodes) if (!seen.has(n.id)) out.push({ node: n, depth: 0 });
  return out;
}

function requireNode(nodes: readonly StoryNode[], id: string): StoryNode {
  const n = nodes.find((x) => x.id === id);
  if (!n) throw new OutlineError('That item no longer exists.');
  return n;
}

export function moveError(nodes: readonly StoryNode[], nodeId: string, parentId: string | null): string | null {
  const node = nodes.find((n) => n.id === nodeId);
  const parent = parentId === null ? null : nodes.find((n) => n.id === parentId);
  if (!node || (parentId !== null && !parent)) return 'That item no longer exists.';
  if (parent && subtreeIds(nodes, nodeId).includes(parent.id)) return 'An item cannot be moved inside itself.';
  if (node.kind === null || !canContain(parent?.kind ?? null, node.kind)) {
    return node.kind === 'scene'
      ? 'A scene must be inside a chapter.'
      : `A ${node.kind} cannot go inside ${parent ? `a ${parent.kind}` : 'the top level'}.`;
  }
  return null;
}

function withFields(node: StoryNode, changes: JsonMap): JsonMap {
  return { ...node.raw, ...changes };
}

/** A new chapter, scene or group, last among its parent's children. Its default title numbers it: scenes within their
 * chapter, everything else across the book ("Chapter 12"). */
export function createNode(
  s: NovelSnapshot,
  kind: NodeKind,
  options: { parentId?: string | null; title?: string; now: number; createId?: () => string },
): { snapshot: NovelSnapshot; node: StoryNode } {
  const nodes = nodesOf(s);
  const parentId = options.parentId ?? null;
  const parent = parentId === null ? null : requireNode(nodes, parentId);
  if (!canContain(parent?.kind ?? null, kind)) {
    throw new OutlineError(kind === 'scene' ? 'A scene must be inside a chapter.' : `A ${kind} cannot be created there.`);
  }
  const siblings = siblingsOf(nodes, parentId);
  const peers = kind === 'scene' ? siblings : nodes;
  const title = options.title?.trim();
  const row: JsonMap = {
    id: (options.createId ?? newId)(),
    projectId: s.projectId,
    parentId,
    kind,
    title: title || `${kindLabel[kind]} ${peers.filter((n) => n.kind === kind).length + 1}`,
    order: siblings.length === 0 ? 0 : siblings[siblings.length - 1].order + 1,
    summary: '',
    notes: '',
    status: 'idea',
    wordCount: 0,
    charCount: 0,
    createdAt: options.now,
    updatedAt: options.now,
  };
  return { snapshot: s.putRow('chapters', row), node: storyNode(row) };
}

function update(s: NovelSnapshot, id: string, changes: JsonMap): NovelSnapshot {
  return s.putRow('chapters', withFields(requireNode(nodesOf(s), id), changes));
}

export function renameNode(s: NovelSnapshot, id: string, title: string, now: number): NovelSnapshot {
  return update(s, id, { title: title.trim() || 'Untitled', updatedAt: now });
}

export function setNodeStatus(s: NovelSnapshot, id: string, status: string, now: number): NovelSnapshot {
  return update(s, id, { status, updatedAt: now });
}

/** The only change to structure: the node under `parentId`, in front of `beforeId` (null: last). Siblings are
 * renumbered; no other field of any node, and no text, is touched. */
export function placeNode(
  s: NovelSnapshot,
  nodeId: string,
  parentId: string | null,
  beforeId: string | null,
  now: number,
): NovelSnapshot {
  const nodes = nodesOf(s);
  const problem = moveError(nodes, nodeId, parentId);
  if (problem) throw new OutlineError(problem);
  const siblings = siblingsOf(nodes, parentId).filter((n) => n.id !== nodeId);
  const at = beforeId === null ? siblings.length : siblings.findIndex((n) => n.id === beforeId);
  if (at === -1) throw new OutlineError('The place it was meant to go no longer exists.');
  const ordered = [...siblings.slice(0, at).map((n) => n.id), nodeId, ...siblings.slice(at).map((n) => n.id)];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let out = s;
  ordered.forEach((id, order) => {
    const node = byId.get(id)!;
    if (id === nodeId) out = out.putRow('chapters', withFields(node, { parentId, order, updatedAt: now }));
    else if (node.order !== order) out = out.putRow('chapters', withFields(node, { order }));
  });
  return out;
}

/** One place up (−1) or down (+1) among its siblings. At either end, nothing changes. */
export function nudgeNode(s: NovelSnapshot, nodeId: string, delta: number, now: number): NovelSnapshot {
  const nodes = nodesOf(s);
  const node = requireNode(nodes, nodeId);
  const siblings = siblingsOf(nodes, node.parentId);
  const from = siblings.findIndex((n) => n.id === nodeId);
  const to = from + delta;
  if (to < 0 || to >= siblings.length) return s;
  const before = delta < 0 ? siblings[to] : to + 1 < siblings.length ? siblings[to + 1] : null;
  return placeNode(s, nodeId, node.parentId, before?.id ?? null, now);
}

/** A copy of a node with everything inside it (children, text, plans, alternate drafts), placed right after it. */
export function duplicateNode(
  s: NovelSnapshot,
  nodeId: string,
  now: number,
  createId: () => string = newId,
): { snapshot: NovelSnapshot; id: string } {
  const nodes = nodesOf(s);
  const source = requireNode(nodes, nodeId);
  const ids = subtreeIds(nodes, nodeId);
  const newIds = new Map(ids.map((id) => [id, createId()]));
  let out = s;
  for (const id of ids) {
    const original = nodes.find((n) => n.id === id)!;
    out = out.putRow('chapters', {
      ...original.raw,
      id: newIds.get(id),
      parentId: id === nodeId ? original.parentId : newIds.get(original.parentId!),
      title: id === nodeId ? `${original.title} (Copy)` : original.title,
      createdAt: now,
      updatedAt: now,
    });
  }
  for (const c of ['chapterContents', 'chapterPlans']) {
    for (const r of s.rows(c)) {
      const to = newIds.get(str(r['id']));
      if (to) out = out.putRow(c, { ...r, id: to });
    }
  }
  for (const r of s.rows('chapterBranches')) {
    const to = newIds.get(str(r['nodeId']));
    if (to) out = out.putRow('chapterBranches', { ...r, id: createId(), nodeId: to });
  }
  const siblings = siblingsOf(nodes, source.parentId);
  const next = siblings.findIndex((n) => n.id === nodeId) + 1;
  const id = newIds.get(nodeId)!;
  return { snapshot: placeNode(out, id, source.parentId, next < siblings.length ? siblings[next].id : null, now), id };
}

export function contentOf(s: NovelSnapshot, nodeId: string): JsonMap | null {
  return s.rows('chapterContents').find((r) => r['id'] === nodeId) ?? null;
}

/** Stores `doc` as the node's text, with its counts and the entries it links. Its `rev` goes up by one. */
function withText(s: NovelSnapshot, node: StoryNode, doc: JsonMap, now: number): NovelSnapshot {
  const previous = contentOf(s, node.id);
  const m = measureDoc(doc);
  return s
    .putRow('chapterContents', {
      ...(previous ?? {}),
      id: node.id,
      projectId: s.projectId,
      doc,
      rev: (numOrNull(previous?.['rev']) ?? 0) + 1,
      savedAt: now,
    })
    .putRow(
      'chapters',
      withFields(node, { wordCount: m.words, charCount: m.characters, mentions: mentionsIn(doc), updatedAt: now }),
    );
}

/** Splits a chapter or scene in two: it keeps `head`; a new one right after it, titled "… (continued)", gets `tail`.
 * Scenes inside a split chapter stay with the first part. */
export function splitNode(
  s: NovelSnapshot,
  nodeId: string,
  head: JsonMap,
  tail: JsonMap,
  now: number,
  createId: () => string = newId,
): { snapshot: NovelSnapshot; id: string } {
  const node = requireNode(nodesOf(s), nodeId);
  if (!isDocument(node.kind)) throw new OutlineError('Only a chapter or a scene can be split.');
  const created = createNode(s, node.kind!, { parentId: node.parentId, title: `${node.title} (continued)`, now, createId });
  let out = withText(created.snapshot, node, head, now);
  out = withText(out, created.node, tail, now);
  const siblings = siblingsOf(nodesOf(s), node.parentId);
  const next = siblings.findIndex((n) => n.id === nodeId) + 1;
  out = placeNode(out, created.node.id, node.parentId, next < siblings.length ? siblings[next].id : null, now);
  return { snapshot: out, id: created.node.id };
}

/** The sibling a node would merge with: the next one, when it is the same kind. */
export function mergeCandidate(s: NovelSnapshot, nodeId: string): StoryNode | null {
  const nodes = nodesOf(s);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || !isDocument(node.kind)) return null;
  const siblings = siblingsOf(nodes, node.parentId);
  const next = siblings[siblings.findIndex((n) => n.id === nodeId) + 1];
  return next && next.kind === node.kind ? next : null;
}

/** Merges the next chapter or scene into this one: its text follows this one's, its scenes move in after this one's,
 * its plan joins this one's, and everything that pointed at it now points here. The merged node is removed. */
export function mergeWithNext(s: NovelSnapshot, nodeId: string, now: number): NovelSnapshot {
  const nodes = nodesOf(s);
  const node = requireNode(nodes, nodeId);
  const next = mergeCandidate(s, nodeId);
  if (!next) throw new OutlineError(`There is no ${node.kind} of the same kind after this one.`);
  const a = (contentOf(s, node.id)?.['doc'] as JsonMap | undefined) ?? emptyDoc();
  const b = (contentOf(s, next.id)?.['doc'] as JsonMap | undefined) ?? emptyDoc();
  const merged: JsonMap = { ...a, content: [...listOf(a['content']), ...listOf(b['content'])] };

  let out = s;
  const children = siblingsOf(nodes, node.id);
  let order = children.length === 0 ? 0 : children[children.length - 1].order + 1;
  for (const child of siblingsOf(nodes, next.id)) {
    out = out.putRow('chapters', withFields(child, { parentId: node.id, order: order++ }));
  }
  const planA = out.rows('chapterPlans').find((r) => r['id'] === node.id);
  const planB = out.rows('chapterPlans').find((r) => r['id'] === next.id);
  if (planB) {
    const plan: JsonMap = planA ? { ...planA } : { ...planB, id: node.id };
    if (planA) {
      for (const [key, y] of Object.entries(planB)) {
        if (key === 'id' || key === 'projectId') continue;
        const x = plan[key];
        if (Array.isArray(x) && Array.isArray(y)) plan[key] = [...x, ...y.filter((v) => !x.some((u) => jsonEquals(u, v)))];
        else if (typeof x === 'string' && typeof y === 'string') plan[key] = [x, y].filter((t) => t.trim()).join('\n\n');
        else if (!(key in plan)) plan[key] = y;
      }
    }
    out = out.putRow('chapterPlans', { ...plan, updatedAt: now });
  }
  out = out
    .withRows('chapterContents', out.rows('chapterContents').filter((r) => r['id'] !== next.id))
    .withRows('chapterPlans', out.rows('chapterPlans').filter((r) => r['id'] !== next.id))
    .withRows('chapters', out.rows('chapters').filter((r) => r['id'] !== next.id));
  // Whatever pointed at the merged node (events told in it, threads developing in it…) points here now.
  const map = new Map([[next.id, node.id]]);
  const collections: Record<string, readonly JsonMap[]> = {};
  for (const [name, rows] of Object.entries(out.collections)) {
    collections[name] =
      name === 'chapters' || name === 'chapterContents'
        ? rows
        : rows.map((r) => dedupe(substituteIds(r, map), node.id) as JsonMap);
  }
  out = out.copyWith({ collections });
  return withText(out, storyNode(out.rows('chapters').find((r) => r['id'] === node.id)!), merged, now);
}

/** After a merge, a list that named both merged nodes names the survivor twice: once is enough. */
function dedupe(v: unknown, id: string): unknown {
  if (Array.isArray(v)) return v.filter((x, i) => !(x === id && v.indexOf(x) < i)).map((x) => dedupe(x, id));
  if (isMap(v)) {
    const out: JsonMap = {};
    for (const [k, x] of Object.entries(v)) out[k] = dedupe(x, id);
    return out;
  }
  return v;
}

/** Deleting a node removes it with its whole subtree: their text, plans, alternate drafts, versions and links (as the
 * Flutter app's delete rules for a node). Events, threads and plans that name it are left as they are. */
export function deleteNodeTree(s: NovelSnapshot, nodeId: string): NovelSnapshot {
  const ids = new Set(subtreeIds(nodesOf(s), nodeId));
  if (!ids.has(nodeId) || !nodesOf(s).some((n) => n.id === nodeId)) throw new OutlineError('That item no longer exists.');
  return s
    .withRows('chapterContents', s.rows('chapterContents').filter((r) => !ids.has(str(r['id']))))
    .withRows('chapterPlans', s.rows('chapterPlans').filter((r) => !ids.has(str(r['id']))))
    .withRows('chapterBranches', s.rows('chapterBranches').filter((r) => !ids.has(str(r['nodeId']))))
    .withRows('chapterRevisions', s.rows('chapterRevisions').filter((r) => !ids.has(str(r['nodeId']))))
    .withRows('loreLinks', s.rows('loreLinks').filter((r) => !ids.has(str(r['fromId'])) && !ids.has(str(r['toId']))))
    .withRows('chapters', s.rows('chapters').filter((r) => !ids.has(str(r['id']))));
}

// ------------------------------------------------------------------------------------------- what the Library needs

/** A new chapter at the top level, last among them, numbered across the book ("Chapter 1"). */
export function newChapterRow(snapshot: NovelSnapshot, now: number, createId: () => string = newId): JsonMap {
  return createNode(snapshot, 'chapter', { now, createId }).node.raw;
}

/** The first chapter or scene in reading order. Null when there is none. */
export function firstWritable(snapshot: NovelSnapshot): JsonMap | null {
  return readingOrder(nodesOf(snapshot)).find((e) => isDocument(e.node.kind))?.node.raw ?? null;
}
