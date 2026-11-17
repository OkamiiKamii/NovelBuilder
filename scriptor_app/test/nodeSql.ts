// The library's SQL connection on a computer, for tests: Node's built-in SQLite (node:sqlite). Read with
// process.getBuiltinModule so Jest's module resolver is not involved.

import { copyFileSync, existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LibraryFile } from '../src/data/database';
import type { SqlConnection, SqlValue } from '../src/data/sql';

type Statement = { run(...p: SqlValue[]): unknown; all(...p: SqlValue[]): unknown[] };
type DatabaseSync = { exec(sql: string): void; prepare(sql: string): Statement; close(): void };
const sqlite = (process as unknown as { getBuiltinModule(n: string): unknown }).getBuiltinModule('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

export function nodeConnection(path: string): SqlConnection {
  const db = new sqlite.DatabaseSync(path);
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    // Rows come back as plain objects, as expo-sqlite's do.
    all: <T>(sql: string, params: readonly SqlValue[] = []) =>
      db.prepare(sql).all(...params).map((r) => ({ ...(r as object) })) as T[],
    close: () => db.close(),
  };
}

/** A library in memory: nothing on disk, no WAL. */
export function memoryLibrary(): LibraryFile {
  return { location: null, existsWithData: () => false, open: () => nodeConnection(':memory:'), copyBeside: () => {} };
}

/** A library file in a fresh temporary folder. */
export function diskLibrary(path = join(mkdtempSync(join(tmpdir(), 'scriptor-')), 'scriptor.sqlite3')): LibraryFile {
  return {
    location: path,
    existsWithData: () => existsSync(path) && statSync(path).size > 0,
    open: () => nodeConnection(path),
    copyBeside: (suffix) => copyFileSync(path, path + suffix),
  };
}
