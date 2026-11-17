// Managing the novels in the library: create, edit details, pin, archive, duplicate, delete with Undo, import as a copy,
// start writing. A port of flutter_app/lib/shared/data/library_service.dart and the library's actions.
//
// Every novel is isolated: its records are stored under its own id, copies get new ids for everything, and nothing one
// novel holds points into another. Deleting keeps a restore point first, so it can be undone.

import { newId } from '../domain/ids';
import type { JsonMap } from '../domain/json';
import { Novel, type NovelStatus, normalizeNovelDetails } from '../domain/novel';
import { firstWritable, newChapterRow } from '../domain/outline';
import { copyNovel, duplicateNovel, foreignReferences, setupCollections } from '../domain/snapshot/copy';
import { NovelSnapshot } from '../domain/snapshot/novelSnapshot';
import type { BackupService, ImportPreview } from './backupService';
import type { NovelStore } from './novelStore';

export class LibraryService {
  constructor(
    private readonly store: NovelStore,
    private readonly backups: BackupService,
    private readonly clock: () => number = Date.now,
    private readonly createId: () => string = newId,
  ) {}

  novels(): Novel[] {
    return this.store.listNovels().map((n) => new Novel(n.raw));
  }

  novel(id: string): Novel | null {
    const n = this.store.novel(id);
    return n ? new Novel(n.raw) : null;
  }

  private require(id: string): Novel {
    const n = this.novel(id);
    if (!n) throw new Error('That novel is no longer in the library.');
    return n;
  }

  /** `base` if no novel has that title, otherwise "`base` 2", "`base` 3"… */
  uniqueTitle(base: string): string {
    const taken = new Set(this.store.listNovels().map((n) => n.title));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  }

  /** A new novel with these details. With `setupFrom`, it starts organised like that novel (its record kinds and
   * fields, relationship types, calendar, progress tracking and systems), with none of its story. With `firstChapter`,
   * it starts with Chapter 1, whose id is returned too. */
  create(details: JsonMap, options: { setupFrom?: string; firstChapter?: boolean } = {}): { novel: Novel; chapterId: string | null } {
    const now = this.clock();
    const project: JsonMap = {
      ...normalizeNovelDetails(details),
      id: this.createId(),
      pinned: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
    };
    let snapshot: NovelSnapshot;
    if (options.setupFrom) {
      const source = this.store.load(options.setupFrom);
      if (!source) throw new Error('The novel to copy the setup from no longer exists.');
      const copy = copyNovel(source.copyWith({ project: { ...project, id: source.projectId } }), {
        title: String(project['title']),
        now,
        createId: this.createId,
        include: (c) => setupCollections.has(c),
      });
      // What would point at story records (the characters a progress category is for) is cleared.
      snapshot = copy.withRows(
        'progressCategories',
        copy.rows('progressCategories').map((r) => ({ ...r, characterIds: [] })),
      );
    } else {
      snapshot = new NovelSnapshot({ project, collections: {} });
    }
    let chapterId: string | null = null;
    if (options.firstChapter) {
      const chapter = newChapterRow(snapshot, now, this.createId);
      chapterId = String(chapter['id']);
      snapshot = snapshot.putRow('chapters', chapter);
    }
    this.store.putNovel(snapshot);
    return { novel: new Novel(snapshot.project), chapterId };
  }

  /** Changes the details the writer edits. Every other field of the novel, known to Scriptor or not, is kept. */
  updateDetails(id: string, details: JsonMap): void {
    const current = this.require(id);
    this.store.putNovelDetails(
      current.withFields({ ...normalizeNovelDetails({ ...current.raw, ...details }), updatedAt: this.clock() }).raw,
    );
  }

  setPinned(id: string, pinned: boolean): void {
    this.store.putNovelDetails(this.require(id).withFields({ pinned }).raw);
  }

  /** Archiving hides a novel from the main list; nothing in it changes. An archived novel is not pinned. */
  setArchived(id: string, archived: boolean): void {
    this.store.putNovelDetails(
      this.require(id).withFields({ archived, ...(archived ? { pinned: false } : {}), updatedAt: this.clock() }).raw,
    );
  }

  markOpened(id: string): void {
    this.store.putNovelDetails(this.require(id).withFields({ lastOpenedAt: this.clock() }).raw);
  }

  /** Moves the novel to another stage. Only `status` changes. */
  setStatus(id: string, status: NovelStatus): void {
    this.store.putNovelDetails(this.require(id).withFields({ status, updatedAt: this.clock() }).raw);
  }

  /** "Start writing it": the novel becomes Drafting, and its first chapter or scene is returned (Chapter 1 is made
   * when it has none). Returns the previous status, for Undo. */
  startWriting(id: string): { chapterId: string; previousStatus: NovelStatus } {
    const before = this.require(id).status;
    const snapshot = this.store.loadPart(id, ['chapters']);
    if (!snapshot) throw new Error('That novel is no longer in the library.');
    let chapter = firstWritable(snapshot);
    if (!chapter) {
      chapter = newChapterRow(snapshot, this.clock(), this.createId);
      this.store.saveChanges(snapshot, snapshot.putRow('chapters', chapter));
    }
    this.setStatus(id, 'drafting');
    return { chapterId: String(chapter['id']), previousStatus: before };
  }

  /** A separate copy, titled "… (Copy)": new ids for everything, every link kept within the copy. Version history
   * stays with the original. */
  duplicate(id: string): Novel {
    const source = this.store.load(id);
    if (!source) throw new Error('That novel is no longer in the library.');
    const copy = duplicateNovel(source, {
      title: this.uniqueTitle(`${new Novel(source.project).title} (Copy)`),
      now: this.clock(),
      createId: this.createId,
    });
    checkIsolated(source, copy);
    this.store.putNovel(copy);
    return new Novel(copy.project);
  }

  /** Imports a backup as a separate novel, beside any novel it came from: new ids, title made unique. */
  importAsCopy(preview: ImportPreview): Novel {
    const source = preview.snapshot;
    const copy = copyNovel(source, {
      title: this.uniqueTitle(new Novel(source.project).title),
      now: this.clock(),
      createId: this.createId,
    });
    checkIsolated(source, copy);
    this.store.putNovel(copy);
    return new Novel(copy.project);
  }

  /** Deletes a novel. A restore point is kept first, and its id returned for Undo; if it cannot be kept, nothing is
   * deleted. */
  delete(id: string): string {
    return this.backups.deleteWithRestorePoint(id);
  }

  /** Brings back a novel deleted with delete(). */
  undoDelete(restorePointId: string): void {
    this.backups.restore(restorePointId);
  }
}

function checkIsolated(source: NovelSnapshot, copy: NovelSnapshot): void {
  const foreign = foreignReferences(source, copy);
  if (foreign.length > 0) {
    throw new Error(`The copy would still point into the original (${foreign[0]}). Nothing was saved.`);
  }
}
