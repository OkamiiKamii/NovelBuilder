// The characters of one novel: reading them for the screens, and every change the author makes to them. A port of
// flutter_app/lib/features/characters/data/character_service.dart.
//
// Each change is one transaction, made on the records as stored at that moment (so quick edits in a row build on each
// other) and refused, with nothing written, if they changed elsewhere since they were read (NovelStore.saveChanges
// throws StaleWriteError). It is written against the parts of NovelStore and BackupService it uses, so it runs on the
// app's stores (src/data) and on any stand-in.

import { newId as makeId } from '../ids';
import { type JsonMap } from '../json';
import { StateError } from '../model/deletePolicy';
import { docBlocks } from '../prose';
import { novelCollections } from '../snapshot/collections';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { countMentions } from './cast';
import {
  CharacterChanges,
  type CharacterReferences,
  characterCollections,
  planCharacterDelete,
  referencesTo,
} from './characterChanges';

/** What the service needs of the novel store (src/data/novelStore.ts). */
export type CharacterStore = {
  load(projectId: string): NovelSnapshot | null;
  loadPart(projectId: string, collectionNames: Iterable<string>): NovelSnapshot | null;
  saveChanges(before: NovelSnapshot, after: NovelSnapshot): void;
  rowsIn(projectId: string, collection: string): JsonMap[];
};

/** What the service needs of the backups (src/data/backupService.ts): restore points, for deleting. */
export type CharacterBackups = {
  keepRestorePoint(projectId: string, reason: string): string | null;
  restore(restorePointId: string): void;
};

/** Collections no character screen reads: chapter text and its history. Left out when the cast is read, so a long
 * book's manuscript is not loaded to show its characters. */
const manuscriptText = new Set(['chapterContents', 'chapterRevisions', 'chapterBranches']);

export class CharacterService {
  /** The collections `read` reads (everything but the chapter text). */
  static readonly readCollections: ReadonlySet<string> = new Set(
    novelCollections.map(([name]) => name).filter((name) => !manuscriptText.has(name)),
  );

  /** What the cast is made of (`readCollections` and the novel's own row), so a cast made from it can be kept until
   * one of these is written: NovelStore.versionOf(projectId, CharacterService.castSource). */
  static readonly castSource: ReadonlySet<string> = new Set([...CharacterService.readCollections, 'project']);

  private readonly clock: () => number;
  private readonly createId: () => string;

  constructor(
    readonly store: CharacterStore,
    readonly backups: CharacterBackups,
    options: { clock?: () => number; createId?: () => string } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.createId = options.createId ?? makeId;
  }

  private get now(): number {
    return this.clock();
  }

  /** The novel without its chapter text: what the character screens show and search (make a CastData of it). */
  read(projectId: string): NovelSnapshot | null {
    return this.store.loadPart(projectId, CharacterService.readCollections);
  }

  /** Applies `apply` to the character records as stored now, and saves the result in one transaction. A refused
   * change (ChangeRefused) or a stale write (StaleWriteError) throws, and nothing is saved. */
  change<T>(projectId: string, apply: (c: CharacterChanges) => T): T {
    const before = this.store.loadPart(projectId, characterCollections);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const changes = new CharacterChanges(before, { now: this.now, createId: this.createId });
    const result = apply(changes);
    // The novel shows as changed, as the original app marks it after any change to its content.
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: this.now } }));
    return result;
  }

  private whole(projectId: string): NovelSnapshot {
    const s = this.store.load(projectId);
    if (s === null) throw new StateError('That novel is no longer in the library.');
    return s;
  }

  /** Everything in the novel that refers to the character. Reads only. */
  references(projectId: string, entryId: string): CharacterReferences {
    return referencesTo(this.whole(projectId), entryId);
  }

  /** Deletes a character, after keeping a restore point. Returns the restore point, for Undo. */
  delete(projectId: string, entryId: string, options: { name: string }): string {
    const kept = this.backups.keepRestorePoint(projectId, `Before deleting the character “${options.name}”`);
    if (kept === null) throw new StateError('That novel is no longer in the library.');
    const before = this.whole(projectId);
    const after = planCharacterDelete(before, entryId).snapshot;
    this.store.saveChanges(before, after.copyWith({ project: { ...before.project, updatedAt: this.now } }));
    return kept;
  }

  undoDelete(restorePointId: string): void {
    this.backups.restore(restorePointId);
  }

  /** Each chapter's record as JSON text, for the jobs that read the book (mentionsJob, namedInJob, sightingsJob).
   * (The Flutter app reads them undecoded from its database; Scriptor's store hands rows back decoded, so they are
   * written out again here.) */
  storedChapters(projectId: string): string[] {
    return this.store.rowsIn(projectId, 'chapterContents').map((r) => JSON.stringify(r));
  }

  /** How many times any of `names` occurs in the saved text, as whole words. Words on the page, not appearances. */
  nameMentions(projectId: string, names: readonly string[]): number {
    return countMentions(
      this.store.rowsIn(projectId, 'chapterContents').flatMap((content) => docBlocks(content['doc']).map((b) => b.text)),
      names,
    );
  }
}
