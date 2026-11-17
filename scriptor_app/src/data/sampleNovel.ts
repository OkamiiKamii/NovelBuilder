// THE SAMPLE NOVEL: "The Drowned Road", fifteen chapters in three parts (about 10,000 words) with cast, places,
// factions, relationships, plot threads, chapter plans and a timeline, so every part of the app has something in it
// from the first start (FEATURES.md #3).
//
// The file is the Flutter app's own sample (flutter_app/lib/shared/data/sample_novel.dart), written out once as a
// `.novel.json`. Each time it is added it gets new ids for everything, so a second copy is wholly separate.

import type { JsonMap } from '../domain/json';
import { copyNovel } from '../domain/snapshot/copy';
import { NovelSnapshot } from '../domain/snapshot/novelSnapshot';
import type { NovelStore } from './novelStore';
import type { SettingsStore } from './settingsStore';

export const sampleNovelTitle = 'The Drowned Road';

/** Set once the first start on this device has been dealt with, whether the sample was added or not: it is never
 * added again by itself (a writer who deletes it keeps it deleted). */
export const sampleNovelSetting = 'library.sampleNovel';

/** Marks the sample novel in its details, so the writer's rank never counts what Scriptor wrote. A field the Flutter
 * app does not know, so it keeps it unchanged. */
export const sampleMarker = 'scriptorSample';

export function sampleNovel(file: unknown, now: number, title = sampleNovelTitle): NovelSnapshot {
  const source = NovelSnapshot.fromJson(file);
  const copy = copyNovel(source, { title, now });
  // The sample is credited to the app it ships with.
  return copy.copyWith({ project: { ...copy.project, author: 'Scriptor', [sampleMarker]: true } as JsonMap });
}

export function addSampleNovel(store: NovelStore, file: unknown, now: number, title = sampleNovelTitle): string {
  const s = sampleNovel(file, now, title);
  store.putNovel(s);
  return s.projectId;
}

/** On the first start on this device, an empty library gets the sample novel; a library with novels in it is never
 * touched. Returns the new novel's id, or null when it was not added. */
export function addSampleNovelOnFirstStart(
  store: NovelStore,
  settings: SettingsStore,
  file: unknown,
  now: number,
): string | null {
  if (settings.read(sampleNovelSetting) !== null) return null;
  const empty = store.listNovels().length === 0;
  // Recorded first: if adding fails, the app still starts, and does not try again on every start.
  settings.write(sampleNovelSetting, empty ? 'added' : 'not added (the library had novels)');
  return empty ? addSampleNovel(store, file, now) : null;
}
