// Backup and restore of whole novels as `.novel.json` files, the same format the Flutter app writes, so its backups
// import directly. A port of flutter_app/lib/shared/data/backup_service.dart.
//
// Not ported yet: the import preview's list of references to missing records (it needs Review → Record check,
// FEATURES.md section 32). The screens that pick and save files come with the Library (section 4).

import { newId } from '../domain/ids';
import { jsonEquals, str } from '../domain/json';
import { currentSnapshotVersion, NovelSnapshot, SnapshotError } from '../domain/snapshot/novelSnapshot';
import type { RestorePointStore } from './draftStore';
import type { NovelDetails, NovelStore } from './novelStore';

/** How one kind of record would change if a backup replaced the stored novel. */
export type CollectionChange = { added: number; changed: number; removed: number; kept: number };

/** What importing a file would do, worked out before anything is written. */
export class ImportPreview {
  constructor(
    readonly snapshot: NovelSnapshot,
    /** The stored novel with the same id: importing replaces it (after keeping a restore point). */
    readonly existing: NovelDetails | null,
    readonly stored: NovelSnapshot | null,
    /** The format version the file was written in. Older files are upgraded as they are read. */
    readonly fromVersion: number,
  ) {}

  get title(): string {
    return str(this.snapshot.project['title']);
  }

  /** Per kind of record, what replacing the stored novel with the file would add, change and remove. */
  get changes(): Map<string, CollectionChange> {
    const out = new Map<string, CollectionChange>();
    const before = this.stored;
    if (!before) return out;
    const names = new Set([...Object.keys(before.collections), ...Object.keys(this.snapshot.collections)]);
    for (const name of names) {
      const old = new Map(before.rows(name).map((r) => [r['id'], r]));
      const now = new Map(this.snapshot.rows(name).map((r) => [r['id'], r]));
      let added = 0;
      let changed = 0;
      let kept = 0;
      for (const [id, row] of now) {
        const was = old.get(id);
        if (was === undefined) added++;
        else if (jsonEquals(was, row)) kept++;
        else changed++;
      }
      const removed = [...old.keys()].filter((id) => !now.has(id)).length;
      if (added || changed || removed) out.set(name, { added, changed, removed, kept });
    }
    return out;
  }

  /** How many records of each kind the file holds, for the confirmation screen. */
  get counts(): Map<string, number> {
    return new Map(
      Object.entries(this.snapshot.collections)
        .filter(([, rows]) => rows.length > 0)
        .map(([name, rows]) => [name, rows.length]),
    );
  }

  get unknownCollections(): string[] {
    return this.snapshot.unknownCollections;
  }
}

export class BackupService {
  constructor(
    private readonly novels: NovelStore,
    private readonly restorePoints: RestorePointStore,
    private readonly clock: () => number = Date.now,
  ) {}

  /** The novel as a backup file's text. */
  exportBackup(projectId: string): string {
    const snapshot = this.novels.load(projectId);
    if (!snapshot) throw new Error('There is no novel to export.');
    return JSON.stringify(snapshot.toJson(this.clock()), null, 2);
  }

  /** A file name for a novel's backup: its title, made safe for any file system. */
  static fileNameFor(title: string): string {
    const base = title
      .trim()
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, '')
      .replace(/\s+/g, ' ');
    return `${base || 'Untitled novel'}.novel.json`;
  }

  /** Reads a backup file's text and says what importing it would do. Throws SnapshotError with a reason when it cannot
   * be read; nothing is written either way. */
  previewImport(text: string): ImportPreview {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new SnapshotError('it is not a JSON file');
    }
    const snapshot = NovelSnapshot.fromJson(json);
    const existing = this.novels.novel(snapshot.projectId);
    const version = (json as { version?: unknown }).version;
    return new ImportPreview(
      snapshot,
      existing,
      existing ? this.novels.load(snapshot.projectId) : null,
      typeof version === 'number' ? Math.trunc(version) : currentSnapshotVersion,
    );
  }

  /** Imports a previewed file. When it replaces a stored novel, that novel is first kept as a restore point, so the
   * import can be undone. Returns the id of the restore point made, if any. */
  importBackup(preview: ImportPreview): string | null {
    let kept: string | null = null;
    if (preview.existing) kept = this.keepRestorePoint(preview.snapshot.projectId, 'Before importing a backup over it');
    this.novels.putNovel(preview.snapshot);
    return kept;
  }

  /** Keeps the stored novel as a restore point. Returns its id, or null when there is no such novel. */
  keepRestorePoint(projectId: string, reason: string): string | null {
    const current = this.novels.load(projectId);
    if (!current) return null;
    const id = newId();
    this.restorePoints.add(id, current.toJson(this.clock()), str(current.project['title']), reason);
    return id;
  }

  /** Brings a novel back as it was at a restore point. The version it replaces is kept as a restore point first. */
  restore(restorePointId: string): void {
    const json = this.restorePoints.snapshotJson(restorePointId);
    if (json === null) throw new Error('That restore point no longer exists.');
    const snapshot = NovelSnapshot.fromJson(json);
    this.keepRestorePoint(snapshot.projectId, 'Before restoring an earlier version');
    this.novels.putNovel(snapshot);
  }

  /** Deletes a novel. A restore point is kept first, and its id returned for Undo; if it cannot be kept, nothing is
   * deleted. (FEATURES.md #9; the Library's Delete uses it.) */
  deleteWithRestorePoint(projectId: string): string {
    const kept = this.keepRestorePoint(projectId, 'Before deleting it');
    if (kept === null) throw new Error('That novel is no longer in the library.');
    this.novels.deleteNovel(projectId);
    return kept;
  }
}
