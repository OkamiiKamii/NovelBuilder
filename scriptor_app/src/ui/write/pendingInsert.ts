// LINES TO BE WRITTEN AT THE END OF A CHAPTER (a system's message, from Systems' "Write it in the chapter"): the
// request waits here; Write opens the chapter (WriteScreen listens), and the chapter's editor, once its text is in,
// writes the lines at its end, a paragraph each, the caret after (EditorPane takes it, once). Through the editor, so
// the lines are saved, kept in the history and taken back by Undo as any typing is; the stored chapter is never
// written behind an open editor's back. A port of the Flutter app's `pendingInsertProvider`
// (features/write/write_providers.dart).

import type { Library } from '../../data/library';
import { lastNodeSetting } from './WriteScreen';

/** The chapter, and the lines for its end. */
export type Insert = { nodeId: string; lines: string[] };

let pending: Insert | null = null;
const listeners = new Set<(i: Insert) => void>();

/** Asks for `insert`. Write and the chapter hear of it. */
export function requestInsert(insert: Insert): void {
  pending = insert;
  for (const l of [...listeners]) l(insert);
}

/** The lines asked for at the end of chapter `nodeId`, taken: they are written once. */
export function takeInsert(nodeId: string): Insert | null {
  if (pending === null || pending.nodeId !== nodeId) return null;
  const i = pending;
  pending = null;
  return i;
}

/** Hears every request (Write, to open its chapter; the editor, to write when the chapter is already open). */
export function onInsert(listener: (i: Insert) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Writes `lines` at the end of chapter `nodeId` of `novelId`: remembers it as the chapter to open, asks for the lines
 * and goes to Write (system_speaks.dart's `_write`). */
export function writeAtChapterEnd(lib: Library, router: { navigate(path: never): void }, novelId: string, nodeId: string, lines: string[]): void {
  lib.saves.saveNow(`setting:${lastNodeSetting(novelId)}`, () => lib.settings.write(lastNodeSetting(novelId), nodeId));
  requestInsert({ nodeId, lines });
  router.navigate('/write' as never);
}
