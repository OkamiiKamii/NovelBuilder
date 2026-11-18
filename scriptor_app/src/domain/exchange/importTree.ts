// Adding an imported manuscript to a novel: the structure buildStructure found becomes chapters and scenes after
// everything already under the chosen part, in one change. Text is stored exactly as given; a chapter or scene with
// words in it starts as "Drafting", one without as "Idea". Nothing already in the manuscript is changed. A port of
// `ImportItem` and `addImportedTree` in flutter_app/lib/shared/domain/manuscript/outline.dart.

import { newId } from '../ids';
import type { JsonMap } from '../json';
import { type NodeKind, OutlineError, canContain, isDocument, nodesOf, siblingsOf } from '../outline';
import { measureDoc, mentionsIn } from '../prose';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartTrim } from '../text/dartString';
import { type ImportNode, toDoc } from './importStructure';

export type ImportItem = { kind: NodeKind; title: string; doc: JsonMap | null; children: ImportItem[] };

/** An imported node as an item to add, its text made into the editor's document. */
export function importItemOf(node: ImportNode): ImportItem {
  return { kind: node.kind, title: node.title, doc: toDoc(node.blocks), children: node.children.map(importItemOf) };
}

/** Adds `items` after everything already under `parentId` (null: the top level). Returns the ids created, in reading
 * order. Throws OutlineError when an item cannot go where it would; nothing is changed then (the caller saves only a
 * snapshot that came back). */
export function addImportedTree(
  s: NovelSnapshot,
  parentId: string | null,
  items: readonly ImportItem[],
  args: { now: number; createId?: () => string },
): { snapshot: NovelSnapshot; created: string[] } {
  const createId = args.createId ?? newId;
  const nodes = nodesOf(s);
  const parent = parentId === null ? null : (nodes.find((n) => n.id === parentId) ?? null);
  if (parentId !== null && parent === null) throw new OutlineError('That item no longer exists.');
  const siblings = siblingsOf(nodes, parentId);
  let order = siblings.length === 0 ? 0 : siblings[siblings.length - 1].order + 1;
  const created: string[] = [];
  let out = s;
  const add = (item: ImportItem, into: string | null, intoKind: NodeKind | null, position: number) => {
    if (!canContain(intoKind, item.kind)) {
      throw new OutlineError(`A ${item.kind} cannot be placed inside ${intoKind === null ? 'the top level' : `a ${intoKind}`}.`);
    }
    const id = createId();
    const doc = isDocument(item.kind) ? item.doc : null;
    const m = doc === null ? null : measureDoc(doc);
    const title = dartTrim(item.title);
    out = out.putRow('chapters', {
      id,
      projectId: s.projectId,
      parentId: into,
      kind: item.kind,
      title: title.length > 0 ? title : `Untitled ${item.kind}`,
      order: position,
      summary: '',
      notes: '',
      status: m !== null && m.words > 0 ? 'drafting' : 'idea',
      wordCount: m?.words ?? 0,
      charCount: m?.characters ?? 0,
      mentions: doc === null ? [] : mentionsIn(doc),
      createdAt: args.now,
      updatedAt: args.now,
    });
    if (doc !== null) out = out.putRow('chapterContents', { id, projectId: s.projectId, doc, rev: 1, savedAt: args.now });
    created.push(id);
    item.children.forEach((child, index) => add(child, id, item.kind, index));
  };
  for (const item of items) add(item, parentId, parent?.kind ?? null, order++);
  return { snapshot: out, created };
}
