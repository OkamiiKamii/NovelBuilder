// What the reader and Book details read and keep (a port of flutter_app/lib/features/reader/reader_providers.dart):
// the book's text as saved (the chapters, their text and the book's matter, nothing else), the book's matter edited a
// field at a time, and, on this device only, the reader's look and the place reached in each novel.

import type { JsonMap } from '../domain/json';
import { str } from '../domain/json';
import { newId } from '../domain/ids';
import { matterWithChanges } from '../domain/reader/matterChanges';
import type { NovelSnapshot } from '../domain/snapshot/novelSnapshot';
import type { Library } from './library';
import { putRow } from './novelStore';

/** The collections the reader reads. READ-ONLY RENDERING RULE: the reader holds no way to write the manuscript. */
export const readerCollections = ['chapters', 'chapterContents', 'bookMatter'];

/** What the open novel's book is made from, as saved. */
export function readerSnapshot(lib: Library, novelId: string): NovelSnapshot | null {
  return lib.novels.loadPart(novelId, readerCollections);
}

/** The book's matter row as stored (the first by id), or null. */
export function readMatter(lib: Library, novelId: string): JsonMap | null {
  const rows = [...lib.novels.rowsIn(novelId, 'bookMatter')].sort((a, b) => (str(a['id']) < str(b['id']) ? -1 : str(a['id']) > str(b['id']) ? 1 : 0));
  return rows[0] ?? null;
}

/** Saves one field of the book's matter shortly after typing stops, applied to the row as stored when it is written,
 * so quick edits to several fields never undo each other. Through autosave: a failure shows and is retried. */
export function writeMatterField(lib: Library, novelId: string, field: string, value: string): void {
  lib.saves.schedule(`matter:${novelId}:${field}`, () => {
    const stored = readMatter(lib, novelId);
    const next = matterWithChanges(stored, { projectId: novelId, changes: { [field]: value }, now: Date.now(), newId });
    lib.novels.writeRows(novelId, [putRow('bookMatter', next, stored)]);
  });
}

const prefsKey = 'reader.prefs';
const bookmarkKey = (novelId: string) => `reader.place.${novelId}`;

/** The reader's look as stored on this device (read leniently by ReaderPrefs). */
export function readReaderPrefs(lib: Library): unknown {
  return lib.settings.read(prefsKey);
}

export function writeReaderPrefs(lib: Library, json: JsonMap): void {
  lib.saves.schedule(`setting:${prefsKey}`, () => lib.settings.write(prefsKey, json));
}

/** Where the reader had got to in a novel, on this device, as stored. */
export function readBookmarkJson(lib: Library, novelId: string): unknown {
  return lib.settings.read(bookmarkKey(novelId));
}

/** Remembers the place, a moment after reading stops. Not essential: a failure only loses the place. */
export function writeBookmarkJson(lib: Library, novelId: string, json: JsonMap): void {
  lib.saves.schedule(`setting:${bookmarkKey(novelId)}`, () => lib.settings.write(bookmarkKey(novelId), json));
}
