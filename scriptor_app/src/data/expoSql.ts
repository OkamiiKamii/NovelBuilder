// The library file on the phone, through expo-sqlite's synchronous API. It lives in the app's own private folder
// (`files/library/scriptor.sqlite3`), which only Scriptor can read; uninstalling the app removes it.

import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import type { LibraryFile } from './database';
import type { SqlConnection, SqlValue } from './sql';

const fileName = 'scriptor.sqlite3';

function connection(db: SQLite.SQLiteDatabase): SqlConnection {
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => {
      db.runSync(sql, params as SqlValue[]);
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) => db.getAllSync<T>(sql, params as SqlValue[]),
    close: () => db.closeSync(),
  };
}

/** A path for SQLite, which wants a plain path, from the file module's `file://` address. */
function plainPath(uri: string): string {
  return decodeURI(uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
}

export function deviceLibraryFile(): LibraryFile {
  const folder = new Directory(Paths.document, 'library');
  const file = new File(folder, fileName);
  return {
    location: plainPath(file.uri),
    existsWithData: () => file.exists && (file.size ?? 0) > 0,
    open: () => {
      if (!folder.exists) folder.create({ intermediates: true });
      return connection(SQLite.openDatabaseSync(fileName, {}, plainPath(folder.uri)));
    },
    copyBeside: (suffix) => {
      const copy = new File(folder, fileName + suffix);
      if (copy.exists) copy.delete();
      file.copySync(copy);
    },
  };
}
