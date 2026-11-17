// Everything the app keeps on this device, opened once at startup and shared by every screen.

import { newId } from '../domain/ids';
import { SaveController } from './autosave';
import { BackupService } from './backupService';
import { CollectionsStore } from './collectionsStore';
import { AppDatabase, type LibraryFile } from './database';
import { DraftStore, RestorePointStore } from './draftStore';
import { LibraryService } from './libraryService';
import { NovelStore } from './novelStore';
import { SettingsStore } from './settingsStore';

export type Library = {
  db: AppDatabase;
  novels: NovelStore;
  settings: SettingsStore;
  drafts: DraftStore;
  restorePoints: RestorePointStore;
  backups: BackupService;
  saves: SaveController;
  library: LibraryService;
  collections: CollectionsStore;
};

/** Opens the library. Throws DatabaseOpenError (with the reason in words) when it cannot; the file is left as it was. */
export function openLibrary(
  file: LibraryFile,
  clock: () => number = Date.now,
  createId: () => string = newId,
): Library {
  const db = AppDatabase.open(file);
  const novels = new NovelStore(db, clock);
  const restorePoints = new RestorePointStore(db, clock);
  const settings = new SettingsStore(db);
  const backups = new BackupService(novels, restorePoints, clock);
  return {
    db,
    novels,
    settings,
    drafts: new DraftStore(db, clock),
    restorePoints,
    backups,
    saves: new SaveController(),
    library: new LibraryService(novels, backups, clock, createId),
    collections: new CollectionsStore(settings, createId),
  };
}
