// Crash-recovery drafts and restore points. A port of flutter_app/lib/shared/data/draft_store.dart.

import { type JsonMap, mapOrNull, str } from '../domain/json';
import type { AppDatabase } from './database';
import { first } from './sql';

/** Work not saved yet, kept so a crash cannot lose it: what was in an editor moments ago. */
export type Draft = {
  projectId: string;
  /** What it is a draft of, e.g. `chapter:<id>`. */
  key: string;
  value: unknown;
  /** The saved revision it was typed on top of, when the thing has revisions. */
  baseRev: number | null;
  updatedAt: number;
};

type DraftRow = { project_id: string; key: string; json: string; base_rev: number | null; updated_at: number };

/** Crash-recovery copies. An editor writes one often while there is unsaved work, and removes it once that work is
 * saved. On the next opening, a draft still here is offered back ("keep or discard"). Drafts never replace saved work
 * on their own. */
export class DraftStore {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: () => number = Date.now,
  ) {}

  put(projectId: string, key: string, value: unknown, baseRev: number | null = null): void {
    this.db.raw.run(
      'INSERT INTO drafts (project_id, key, json, base_rev, updated_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(project_id, key) DO UPDATE SET json = excluded.json, base_rev = excluded.base_rev, ' +
        'updated_at = excluded.updated_at',
      [projectId, key, JSON.stringify(value ?? null), baseRev, this.clock()],
    );
  }

  get(projectId: string, key: string): Draft | null {
    const r = first<DraftRow>(this.db.raw, 'SELECT * FROM drafts WHERE project_id = ? AND key = ?', [projectId, key]);
    return r ? toDraft(r) : null;
  }

  /** Every draft left in a novel: work that was not saved before the app stopped. */
  leftIn(projectId: string): Draft[] {
    return this.db.raw
      .all<DraftRow>('SELECT * FROM drafts WHERE project_id = ? ORDER BY updated_at', [projectId])
      .map(toDraft);
  }

  discard(projectId: string, key: string): void {
    this.db.raw.run('DELETE FROM drafts WHERE project_id = ? AND key = ?', [projectId, key]);
  }
}

function toDraft(r: DraftRow): Draft {
  let value: unknown;
  try {
    value = JSON.parse(r.json);
  } catch {
    value = r.json; // Kept as text rather than lost.
  }
  return {
    projectId: r.project_id,
    key: r.key,
    value,
    baseRev: r.base_rev === null ? null : Number(r.base_rev),
    updatedAt: Number(r.updated_at),
  };
}

/** A whole-novel copy kept before something replaces the novel (a delete, an import over it, a restore). */
export type RestorePoint = { id: string; projectId: string; title: string; reason: string; createdAt: number };

type PointRow = { id: string; project_id: string; title: string; reason: string; created_at: number };

export class RestorePointStore {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: () => number = Date.now,
    /** How many restore points each novel keeps; the oldest beyond this are removed. */
    readonly keepPerNovel = 20,
  ) {}

  add(id: string, snapshotJson: JsonMap, title: string, reason: string): void {
    const projectId = str(mapOrNull(snapshotJson['project'])?.['id']);
    this.db.transaction(() => {
      this.db.raw.run(
        'INSERT INTO restore_points (id, project_id, title, reason, created_at, snapshot) VALUES (?, ?, ?, ?, ?, ?)',
        [id, projectId, title, reason, this.clock(), JSON.stringify(snapshotJson)],
      );
      this.db.raw.run(
        'DELETE FROM restore_points WHERE project_id = ? AND id NOT IN ' +
          '(SELECT id FROM restore_points WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)',
        [projectId, projectId, this.keepPerNovel],
      );
    });
  }

  list(projectId?: string): RestorePoint[] {
    const sql =
      'SELECT id, project_id, title, reason, created_at FROM restore_points ' +
      (projectId === undefined ? '' : 'WHERE project_id = ? ') +
      'ORDER BY created_at DESC, rowid DESC';
    return this.db.raw.all<PointRow>(sql, projectId === undefined ? [] : [projectId]).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      reason: r.reason,
      createdAt: Number(r.created_at),
    }));
  }

  /** The novel as it was, as a `.novel.json` document. Null when there is no such restore point. */
  snapshotJson(id: string): unknown {
    const r = first<{ snapshot: string }>(this.db.raw, 'SELECT snapshot FROM restore_points WHERE id = ?', [id]);
    return r ? JSON.parse(r.snapshot) : null;
  }

  remove(id: string): void {
    this.db.raw.run('DELETE FROM restore_points WHERE id = ?', [id]);
  }
}
