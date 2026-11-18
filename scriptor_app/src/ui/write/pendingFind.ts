// OPENING A CHAPTER AT A PASSAGE: search, the index of names and every "Read it there" ask for a chapter with the words
// to land on (the term, and the paragraph it is in). The request waits here; Write opens the chapter (WriteScreen
// listens), and the chapter's editor, once its text is in, selects the words in that paragraph (EditorPane takes it,
// once). A port of the Flutter app's `pendingFindProvider` (features/write/write_providers.dart).


import type { Library } from '../../data/library';
import { lastNodeSetting } from './WriteScreen';

/** A passage to land on: the chapter, the words as written, and the paragraph (headings and paragraphs in reading
 * order, from 0). */
export type Find = { nodeId: string; term: string; block: number };

let pending: Find | null = null;
const listeners = new Set<(f: Find) => void>();

/** Asks for `find` (null: none, a chapter opened plainly). Write and the chapter hear of it. */
export function requestFind(find: Find | null): void {
  pending = find;
  if (find !== null) for (const l of [...listeners]) l(find);
}

/** The passage asked for in chapter `nodeId`, taken: it is used once. */
export function takeFind(nodeId: string): Find | null {
  if (pending === null || pending.nodeId !== nodeId) return null;
  const f = pending;
  pending = null;
  return f;
}

/** Hears every request (Write, to open its chapter; the editor, to land on it when the chapter is already open). */
export function onFind(listener: (f: Find) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Opens chapter `nodeId` of `novelId` in Write, at `find`'s words when given (`term`, in paragraph `block`). */
export function openChapterAt(
  lib: Library,
  router: { navigate(path: never): void },
  novelId: string,
  nodeId: string,
  find?: { term: string; block: number } | null,
): void {
  lib.saves.saveNow(`setting:${lastNodeSetting(novelId)}`, () => lib.settings.write(lastNodeSetting(novelId), nodeId));
  requestFind(find && find.term.length > 0 ? { nodeId, term: find.term, block: find.block } : null);
  router.navigate('/write' as never);
}

/** Where `term` is in `blocks` (the chapter's paragraphs and headings): in paragraph `block` when it is there, else the
 * first paragraph that has it; ignoring case. Null when nowhere. */
export function findIn(blocks: readonly string[], term: string, block: number): { block: number; start: number; end: number } | null {
  const t = term.toLowerCase();
  if (t.length === 0) return null;
  const at = (i: number) => (i >= 0 && i < blocks.length ? blocks[i].toLowerCase().indexOf(t) : -1);
  const here = at(block);
  if (here >= 0) return { block, start: here, end: here + term.length };
  for (let i = 0; i < blocks.length; i++) {
    const s = at(i);
    if (s >= 0) return { block: i, start: s, end: s + term.length };
  }
  return null;
}
