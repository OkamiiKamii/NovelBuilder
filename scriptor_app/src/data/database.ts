// The app's local library: one SQLite file on this device. Nothing here talks to a network.
// A port of flutter_app/lib/shared/data/database.dart, with the same schema.
//
// Every save is a transaction, and the file is opened so that a committed save is on disk before it counts as saved
// (synchronous = FULL with write-ahead logging): a crash or power cut leaves either the old state or the new one,
// never half of a change.

import { first, type SqlConnection } from './sql';

/** Thrown when the library cannot be opened. The file is left exactly as it was. */
export class DatabaseOpenError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'DatabaseOpenError';
  }
}

/** One schema step: the statements that take the database from the previous version to `version`. */
export type Migration = { version: number; name: string; statements: readonly string[] };

/** The library's schema, version by version. A step is never edited once released: changes are new steps.
 *
 * Records are stored whole, as the JSON they were read or written as, one row per record, so fields and collections
 * Scriptor does not know survive saving exactly as they survive import and export. */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'library, records, settings, drafts and restore points',
    statements: [
      'CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      // A novel's own details (the file's `project`), and anything else the file carried at its top level.
      'CREATE TABLE novels (id TEXT PRIMARY KEY, json TEXT NOT NULL, extra TEXT NOT NULL, updated_at INTEGER NOT NULL)',
      // Every other record. `position` keeps the order records were stored in, which views rely on.
      'CREATE TABLE records (' +
        'project_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE, ' +
        'collection TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, position INTEGER NOT NULL, ' +
        'updated_at INTEGER NOT NULL, PRIMARY KEY (project_id, collection, id)) WITHOUT ROWID',
      'CREATE INDEX records_in_order ON records (project_id, collection, position)',
      // Settings of the app itself (appearance…), not of one novel.
      'CREATE TABLE settings (key TEXT PRIMARY KEY, json TEXT NOT NULL)',
      // Crash-recovery copies of work not yet saved (text being typed). Deleted with their novel.
      'CREATE TABLE drafts (' +
        'project_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE, key TEXT NOT NULL, json TEXT NOT NULL, ' +
        'base_rev INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (project_id, key))',
      // Whole-novel copies taken before anything replaces a novel. Not tied to the novel row: they outlive it.
      'CREATE TABLE restore_points (' +
        'id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, reason TEXT NOT NULL, ' +
        'created_at INTEGER NOT NULL, snapshot TEXT NOT NULL)',
      'CREATE INDEX restore_points_by_novel ON restore_points (project_id, created_at)',
    ],
  },
  {
    version: 2,
    name: 'records found by the chapter they belong to',
    statements: [
      // A chapter's history found without reading every chapter's. Nothing stored changes.
      "CREATE INDEX records_by_node ON records (project_id, collection, json_extract(json, '$.nodeId'))",
    ],
  },
];

export const latestSchemaVersion = migrations[migrations.length - 1].version;

/** How to reach the library file: opening it, and keeping a copy of it before an upgrade. */
export interface LibraryFile {
  /** Whether the file already exists and holds something. */
  existsWithData(): boolean;
  open(): SqlConnection;
  /** Copies the (closed or checkpointed) file to `<file><suffix>` beside it. */
  copyBeside(suffix: string): void;
  /** Where it is, for Settings. Null for an in-memory library. */
  readonly location: string | null;
}

export class AppDatabase {
  private depth = 0;

  private constructor(
    readonly raw: SqlConnection,
    readonly location: string | null,
  ) {}

  /** Opens (and if needed creates or upgrades) the library.
   *
   * Before upgrading an existing library, a copy of the file is kept next to it (`<file>.before-v<N>`), so a failed or
   * unwanted upgrade can be undone by hand. A library made by a newer version of the app is refused, untouched. */
  static open(file: LibraryFile, steps: readonly Migration[] = migrations): AppDatabase {
    const latest = steps[steps.length - 1].version;
    const existed = file.existsWithData();
    let raw: SqlConnection;
    try {
      raw = file.open();
    } catch (e) {
      throw new DatabaseOpenError(`The library file could not be opened (${describe(e)}).`);
    }
    try {
      const version = userVersion(raw);
      if (version > latest) {
        throw new DatabaseOpenError(
          `This library was saved by a newer version of Scriptor (schema ${version}; this app knows up to ` +
            `${latest}). Update the app to open it. Nothing was changed.`,
        );
      }
      if (existed && version < latest && version > 0) {
        raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        file.copyBeside(`.before-v${latest}`);
      }
      const app = new AppDatabase(raw, file.location);
      app.configure(file.location !== null);
      app.migrate(version, steps);
      return app;
    } catch (e) {
      raw.close();
      throw e;
    }
  }

  get schemaVersion(): number {
    return userVersion(this.raw);
  }

  private configure(onDisk: boolean): void {
    this.raw.exec('PRAGMA foreign_keys = ON');
    if (onDisk) {
      this.raw.exec('PRAGMA journal_mode = WAL');
      this.raw.exec('PRAGMA synchronous = FULL');
    }
  }

  private migrate(from: number, steps: readonly Migration[]): void {
    for (const step of steps.filter((m) => m.version > from)) {
      this.transaction(() => {
        for (const sql of step.statements) this.raw.exec(sql);
        this.raw.exec(`PRAGMA user_version = ${step.version}`);
      });
    }
  }

  /** Runs `action` as one transaction: all of it is saved, or (if it throws) none of it. A transaction started inside
   * another joins the outer one. */
  transaction<T>(action: () => T): T {
    if (this.depth > 0) return action();
    this.raw.exec('BEGIN IMMEDIATE');
    this.depth++;
    try {
      const result = action();
      this.raw.exec('COMMIT');
      return result;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    } finally {
      this.depth--;
    }
  }

  close(): void {
    this.raw.close();
  }
}

function userVersion(db: SqlConnection): number {
  return Number(first<{ user_version: number }>(db, 'PRAGMA user_version')?.user_version ?? 0);
}

export function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
