// Settings of the app itself, by key, each a JSON value. Kept on this device.
// A port of flutter_app/lib/shared/data/settings_store.dart.

import type { AppDatabase } from './database';
import { first } from './sql';

export class SettingsStore {
  constructor(private readonly db: AppDatabase) {}

  read(key: string): unknown {
    const r = first<{ json: string }>(this.db.raw, 'SELECT json FROM settings WHERE key = ?', [key]);
    if (!r) return null;
    try {
      return JSON.parse(r.json);
    } catch {
      return null; // A damaged value reads as unset; it is replaced on the next save.
    }
  }

  write(key: string, value: unknown): void {
    this.db.raw.run(
      'INSERT INTO settings (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json',
      [key, JSON.stringify(value ?? null)],
    );
  }
}

/** The novel open on this device, reopened at the next start (FEATURES.md #10). */
export const openNovelSettingKey = 'library.openNovel';
