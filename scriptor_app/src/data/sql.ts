// The few things the library needs from SQLite, so the same storage code runs on the phone (expo-sqlite, in
// expoSql.ts) and in the tests on a computer (Node's built-in SQLite, in test/nodeSql.ts). Everything is synchronous,
// as in the Flutter app: a save is one short transaction, finished before the next change is taken.

export type SqlValue = string | number | null;

export interface SqlConnection {
  /** Runs statements with no parameters and no results (schema, pragmas). */
  exec(sql: string): void;
  /** Runs one statement with parameters. */
  run(sql: string, params?: readonly SqlValue[]): void;
  /** Every row, as objects keyed by column name. */
  all<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): T[];
  close(): void;
}

export function first<T = Record<string, unknown>>(
  db: SqlConnection,
  sql: string,
  params?: readonly SqlValue[],
): T | null {
  return db.all<T>(sql, params)[0] ?? null;
}
