// The manuscript's structure: what the Library needs of it so far (a novel's first chapter). The rest comes with Write
// (FEATURES.md section 6). Records have the shape the Flutter app's createNode writes.

import { newId } from './ids';
import { type JsonMap, numOrNull, str } from './json';
import type { NovelSnapshot } from './snapshot/novelSnapshot';

export type NodeKind = 'volume' | 'act' | 'arc' | 'chapter' | 'scene';

const kindLabel: Record<NodeKind, string> = {
  volume: 'Volume',
  act: 'Act',
  arc: 'Arc',
  chapter: 'Chapter',
  scene: 'Scene',
};

/** A new chapter at the top level, last among them, numbered across the book ("Chapter 1"). */
export function newChapterRow(
  snapshot: NovelSnapshot,
  now: number,
  createId: () => string = newId,
): JsonMap {
  const nodes = snapshot.rows('chapters');
  const topLevel = nodes.filter((n) => n['parentId'] === null || n['parentId'] === undefined);
  const lastOrder = Math.max(-1, ...topLevel.map((n) => numOrNull(n['order']) ?? 0));
  const chapters = nodes.filter((n) => str(n['kind']) === 'chapter').length;
  return {
    id: createId(),
    projectId: snapshot.projectId,
    parentId: null,
    kind: 'chapter',
    title: `${kindLabel.chapter} ${chapters + 1}`,
    order: topLevel.length === 0 ? 0 : lastOrder + 1,
    summary: '',
    notes: '',
    status: 'idea',
    wordCount: 0,
    charCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** The first chapter or scene in reading order: by `order` within parents, depth first. Null when there is none. */
export function firstWritable(snapshot: NovelSnapshot): JsonMap | null {
  const nodes = snapshot.rows('chapters');
  const children = (parentId: string | null) =>
    nodes
      .filter((n) => (n['parentId'] ?? null) === parentId)
      .sort((a, b) => (numOrNull(a['order']) ?? 0) - (numOrNull(b['order']) ?? 0));
  const walk = (parentId: string | null): JsonMap | null => {
    for (const n of children(parentId)) {
      const kind = str(n['kind']);
      if (kind === 'chapter') return walk(str(n['id'])) ?? n;
      if (kind === 'scene') return n;
      const inside = walk(str(n['id']));
      if (inside) return inside;
    }
    return null;
  };
  return walk(null);
}
