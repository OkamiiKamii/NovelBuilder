// The novels stored on this device. Screens never touch the database: they go through this repository.
// A port of flutter_app/lib/shared/data/novel_store.dart.
//
// Every method that writes is one transaction. `revision` changes after every successful write, and listeners are
// told, so screens can refresh.
//
// REVIEW COPY GUARD (collaboration by file, FEATURES.md section 33): in a review copy every write is judged by its
// role's rule (src/domain/collab/access.ts `refusal`) before anything is written; a change the role may not make is
// refused with PermissionError and nothing of the write is saved. The keys of the changes it allows are kept in the
// copy's mark: they are what the person's feedback file carries back.

import { PermissionError, refusal } from '../domain/collab/access';
import { ReviewMark } from '../domain/collab/reviewFiles';
import { type JsonMap, jsonEquals, str } from '../domain/json';
import { NovelSnapshot } from '../domain/snapshot/novelSnapshot';
import type { AppDatabase } from './database';
import { first } from './sql';

/** A change that would overwrite something saved since it was read. Nothing is written when this is thrown. */
export class StaleWriteError extends Error {
  constructor(readonly what: string) {
    super(`${what} changed since it was opened. Nothing was saved, so the newer version is kept.`);
    this.name = 'StaleWriteError';
  }
}

/** A novel's own details (the file's `project`). Fields Scriptor does not know are kept in `raw`. */
export type NovelDetails = { readonly raw: JsonMap; readonly id: string; readonly title: string };

export function novelDetails(raw: JsonMap): NovelDetails {
  return { raw, id: str(raw['id']), title: str(raw['title']) };
}

/** What a novel holds, counted from its records. Word counts are the chapters' and scenes' own, as stored. */
export type NovelStats = {
  words: number;
  chapters: number;
  scenes: number;
  characters: number;
  entries: number;
  events: number;
  threads: number;
  /** When it was last written in: the end of its latest writing session that added or removed words. */
  lastWrittenAt: number | null;
};

/** One record to write (`value` set) or remove (`value` null), optionally only if it is still as read. */
export type RowWrite = {
  collection: string;
  id: string;
  value: JsonMap | null;
  /** What the stored record must still be (null: must not exist). Leave out for no check. */
  expect?: JsonMap | null;
};

export const putRow = (collection: string, value: JsonMap, expect?: JsonMap | null): RowWrite => ({
  collection,
  id: str(value['id']),
  value,
  ...(expect === undefined ? {} : { expect }),
});

export const deleteRow = (collection: string, id: string, expect?: JsonMap | null): RowWrite => ({
  collection,
  id,
  value: null,
  ...(expect === undefined ? {} : { expect }),
});

type Listener = () => void;

export class NovelStore {
  private rev = 0;
  private readonly listeners = new Set<Listener>();
  private readonly written = new Map<string, number>();
  private readonly wholly = new Map<string, number>();

  constructor(
    readonly db: AppDatabase,
    private readonly clock: () => number = Date.now,
  ) {}

  get revision(): number {
    return this.rev;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.rev++;
    for (const l of [...this.listeners]) l();
  }

  /** Tells the screens something they show changed outside any novel (a setting of this device). */
  touchSettings(): void {
    this.changed();
  }

  private wrote(projectId: string, collections: Iterable<string>): void {
    for (const c of collections) {
      const key = `${projectId}\u0000${c}`;
      this.written.set(key, (this.written.get(key) ?? 0) + 1);
    }
  }

  private wroteWhole(projectId: string): void {
    this.wholly.set(projectId, (this.wholly.get(projectId) ?? 0) + 1);
  }

  /** A number that moves whenever any of `collections` of the novel (or its own row, as 'project') is written, or the
   * novel is stored whole or deleted. Cheap to ask on every render: nothing is read. */
  versionOf(projectId: string, collections: Iterable<string>): number {
    let v = this.wholly.get(projectId) ?? 0;
    for (const c of collections) v += this.written.get(`${projectId}\u0000${c}`) ?? 0;
    return v;
  }

  private get sql() {
    return this.db.raw;
  }

  /** Every novel's details, most recently changed first. */
  listNovels(): NovelDetails[] {
    return this.sql
      .all<{ json: string }>('SELECT json FROM novels ORDER BY updated_at DESC, id')
      .map((r) => novelDetails(JSON.parse(r.json)));
  }

  exists(projectId: string): boolean {
    return first(this.sql, 'SELECT 1 AS x FROM novels WHERE id = ?', [projectId]) !== null;
  }

  novel(projectId: string): NovelDetails | null {
    const r = first<{ json: string }>(this.sql, 'SELECT json FROM novels WHERE id = ?', [projectId]);
    return r ? novelDetails(JSON.parse(r.json)) : null;
  }

  /** The whole novel, every collection, rows in the order they were stored. Null when there is no such novel. */
  load(projectId: string): NovelSnapshot | null {
    const head = first<{ json: string; extra: string }>(this.sql, 'SELECT json, extra FROM novels WHERE id = ?', [
      projectId,
    ]);
    if (!head) return null;
    const collections: Record<string, JsonMap[]> = {};
    for (const r of this.sql.all<{ collection: string; json: string }>(
      'SELECT collection, json FROM records WHERE project_id = ? ORDER BY collection, position',
      [projectId],
    )) {
      (collections[r.collection] ??= []).push(JSON.parse(r.json));
    }
    return new NovelSnapshot({ project: JSON.parse(head.json), collections, extra: JSON.parse(head.extra) });
  }

  /** The novel with only the named collections, for a change that touches nothing else. Save it only with
   * saveChanges, never with putNovel (which would store a novel without the rest). */
  loadPart(projectId: string, collectionNames: Iterable<string>): NovelSnapshot | null {
    const head = first<{ json: string; extra: string }>(this.sql, 'SELECT json, extra FROM novels WHERE id = ?', [
      projectId,
    ]);
    if (!head) return null;
    const collections: Record<string, JsonMap[]> = {};
    for (const name of collectionNames) collections[name] = this.rowsIn(projectId, name);
    return new NovelSnapshot({ project: JSON.parse(head.json), collections, extra: JSON.parse(head.extra) });
  }

  /** Stores a whole novel, replacing any stored version of it, in one transaction. Used by import and restore. */
  putNovel(snapshot: NovelSnapshot): void {
    const id = snapshot.projectId;
    const now = this.clock();
    this.db.transaction(() => {
      this.sql.run('DELETE FROM records WHERE project_id = ?', [id]);
      this.sql.run(
        'INSERT INTO novels (id, json, extra, updated_at) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET json = excluded.json, extra = excluded.extra, updated_at = excluded.updated_at',
        [id, JSON.stringify(snapshot.project), JSON.stringify(snapshot.extra), now],
      );
      for (const [name, rows] of Object.entries(snapshot.collections)) {
        rows.forEach((row, i) => {
          this.sql.run(
            'INSERT INTO records (project_id, collection, id, json, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [id, name, str(row['id']), JSON.stringify(row), i, now],
          );
        });
      }
    });
    this.wroteWhole(id);
    this.changed();
  }

  /** Saves the difference between two versions of a novel (rows added, changed, removed) in one transaction.
   *
   * `before` must be what was read: if any row it touches has been saved differently since, nothing is written and
   * StaleWriteError is thrown, so a newer save is never silently overwritten. */
  saveChanges(before: NovelSnapshot, after: NovelSnapshot): void {
    const id = before.projectId;
    if (after.projectId !== id) throw new Error('Changes must stay within one novel.');
    const now = this.clock();
    const wrote = new Set<string>();
    if (!sameButTime(after.project, before.project)) wrote.add('project');
    this.db.transaction(() => {
      const stored = first<{ json: string }>(this.sql, 'SELECT json FROM novels WHERE id = ?', [id]);
      if (!stored) throw new StaleWriteError('The novel');
      const storedProject = JSON.parse(stored.json) as JsonMap;
      const mark = ReviewMark.of(storedProject);
      const changedKeys: string[] = [];
      if (mark !== null && !jsonEquals(after.project, before.project)) {
        throw new PermissionError('Only the owner changes the project itself.');
      }
      if (!jsonEquals(after.project, before.project)) {
        if (!jsonEquals(JSON.parse(stored.json), before.project)) throw new StaleWriteError('The novel');
        this.sql.run('UPDATE novels SET json = ?, updated_at = ? WHERE id = ?', [
          JSON.stringify(after.project),
          now,
          id,
        ]);
      } else {
        this.sql.run('UPDATE novels SET updated_at = ? WHERE id = ?', [now, id]);
      }
      const names = new Set([...Object.keys(before.collections), ...Object.keys(after.collections)]);
      for (const name of names) {
        const old = new Map(before.rows(name).map((r) => [str(r['id']), r]));
        const next = new Map(after.rows(name).map((r) => [str(r['id']), r]));
        const expectStored = (rowId: string) => {
          const current = this.row(id, name, rowId);
          const was = old.get(rowId);
          const same = was === undefined ? current === null : current !== null && jsonEquals(current, was);
          if (!same) throw new StaleWriteError(`A record in ${name}`);
        };
        for (const rowId of old.keys()) {
          if (next.has(rowId)) continue;
          expectStored(rowId);
          if (mark !== null) changedKeys.push(...guarded(mark, name, rowId, old.get(rowId) ?? null, null));
          this.sql.run('DELETE FROM records WHERE project_id = ? AND collection = ? AND id = ?', [id, name, rowId]);
          wrote.add(name);
        }
        let position = this.maxPosition(id, name);
        for (const [rowId, value] of next) {
          const was = old.get(rowId);
          if (was !== undefined && jsonEquals(was, value)) continue;
          expectStored(rowId);
          if (mark !== null) changedKeys.push(...guarded(mark, name, rowId, was ?? null, value));
          wrote.add(name);
          if (was === undefined) {
            this.sql.run(
              'INSERT INTO records (project_id, collection, id, json, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
              [id, name, rowId, JSON.stringify(value), ++position, now],
            );
          } else {
            this.sql.run(
              'UPDATE records SET json = ?, updated_at = ? WHERE project_id = ? AND collection = ? AND id = ?',
              [JSON.stringify(value), now, id, name, rowId],
            );
          }
        }
      }
      if (mark !== null && changedKeys.length > 0) {
        this.sql.run('UPDATE novels SET json = ? WHERE id = ?', [JSON.stringify(marked(storedProject, mark, changedKeys)), id]);
      }
    });
    this.wrote(id, wrote);
    this.changed();
  }

  /** One stored record, or null. */
  row(projectId: string, collection: string, id: string): JsonMap | null {
    const r = first<{ json: string }>(
      this.sql,
      'SELECT json FROM records WHERE project_id = ? AND collection = ? AND id = ?',
      [projectId, collection, id],
    );
    return r ? JSON.parse(r.json) : null;
  }

  /** A collection's records, in the order they were stored. */
  rowsIn(projectId: string, collection: string): JsonMap[] {
    return this.sql
      .all<{ json: string }>(
        'SELECT json FROM records WHERE project_id = ? AND collection = ? ORDER BY position',
        [projectId, collection],
      )
      .map((r) => JSON.parse(r.json));
  }

  /** The records of a collection that belong to one chapter or scene (their `nodeId`), in order, found by the index on
   * it, so a chapter's history is read without reading every chapter's. */
  rowsForNode(projectId: string, collection: string, nodeId: string): JsonMap[] {
    return this.sql
      .all<{ json: string; position: number }>(
        'SELECT json, position FROM records INDEXED BY records_by_node ' +
          "WHERE project_id = ? AND collection = ? AND json_extract(json, '$.nodeId') = ?",
        [projectId, collection, nodeId],
      )
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((r) => JSON.parse(r.json));
  }

  /** How many records a collection holds, without reading them. */
  countIn(projectId: string, collection: string): number {
    return Number(
      first<{ n: number }>(this.sql, 'SELECT COUNT(*) AS n FROM records WHERE project_id = ? AND collection = ?', [
        projectId,
        collection,
      ])?.n ?? 0,
    );
  }

  private maxPosition(projectId: string, collection: string): number {
    const p = first<{ p: number | null }>(
      this.sql,
      'SELECT MAX(position) AS p FROM records WHERE project_id = ? AND collection = ?',
      [projectId, collection],
    )?.p;
    return p === null || p === undefined ? -1 : Number(p);
  }

  /** Writes several records in one transaction: all of them, or (if any check fails) none. A write with an `expect` is
   * refused with StaleWriteError when the stored record is no longer what was read. With `touchNovel`, the novel's
   * `updatedAt` becomes now. */
  writeRows(projectId: string, writes: readonly RowWrite[], touchNovel = true): void {
    const now = this.clock();
    let markChanged = false;
    this.db.transaction(() => {
      const head = first<{ json: string }>(this.sql, 'SELECT json FROM novels WHERE id = ?', [projectId]);
      if (!head) throw new Error('That novel is no longer in the library.');
      const project = JSON.parse(head.json) as JsonMap;
      const mark = ReviewMark.of(project);
      const changedKeys: string[] = [];
      for (const w of writes) {
        if (mark !== null) changedKeys.push(...guarded(mark, w.collection, w.id, this.row(projectId, w.collection, w.id), w.value));
        if (w.expect !== undefined) {
          const stored = this.row(projectId, w.collection, w.id);
          const same = w.expect === null ? stored === null : stored !== null && jsonEquals(stored, w.expect);
          if (!same) throw new StaleWriteError(`A record in ${w.collection}`);
        }
        if (w.value === null) {
          this.sql.run('DELETE FROM records WHERE project_id = ? AND collection = ? AND id = ?', [
            projectId,
            w.collection,
            w.id,
          ]);
        } else if (this.row(projectId, w.collection, w.id) !== null) {
          this.sql.run(
            'UPDATE records SET json = ?, updated_at = ? WHERE project_id = ? AND collection = ? AND id = ?',
            [JSON.stringify(w.value), now, projectId, w.collection, w.id],
          );
        } else {
          this.sql.run(
            'INSERT INTO records (project_id, collection, id, json, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [projectId, w.collection, w.id, JSON.stringify(w.value), this.maxPosition(projectId, w.collection) + 1, now],
          );
        }
      }
      markChanged = mark !== null && changedKeys.length > 0;
      const withMark = mark !== null && markChanged ? marked(project, mark, changedKeys) : project;
      if (touchNovel) {
        this.sql.run('UPDATE novels SET json = ?, updated_at = ? WHERE id = ?', [
          JSON.stringify({ ...withMark, updatedAt: now }),
          now,
          projectId,
        ]);
      } else if (withMark !== project) {
        this.sql.run('UPDATE novels SET json = ? WHERE id = ?', [JSON.stringify(withMark), projectId]);
      }
    });
    // The novel's own row: only when the review copy's mark changed, not for its time.
    this.wrote(projectId, [...(markChanged ? ['project'] : []), ...writes.map((w) => w.collection)]);
    this.changed();
  }

  /** Replaces the novel's own details (title, author…). Fields Scriptor does not know are kept by the caller. */
  putNovelDetails(raw: JsonMap): void {
    const id = str(raw['id']);
    const stored = first<{ json: string }>(this.sql, 'SELECT json FROM novels WHERE id = ?', [id]);
    if (!stored) throw new StaleWriteError('The novel');
    const was = JSON.parse(stored.json) as JsonMap;
    if (ReviewMark.of(was) !== null) {
      // On a review copy the person may change only what they keep for themselves (pinned, archived…).
      const keys = new Set([...Object.keys(was), ...Object.keys(raw)]);
      const others = [...keys].filter((k) => !personal.has(k) && !jsonEquals(was[k], raw[k]));
      if (others.length > 0) throw new PermissionError('Only the owner changes the project itself.');
    }
    this.sql.run('UPDATE novels SET json = ?, updated_at = ? WHERE id = ?', [JSON.stringify(raw), this.clock(), id]);
    this.wrote(id, ['project']);
    this.changed();
  }

  /** What each novel holds, for the library: counted in the database, without loading any novel. */
  stats(): Map<string, NovelStats> {
    const rows = this.sql.all<Record<string, number | string | null>>(`
      SELECT project_id,
        SUM(CASE WHEN collection = 'chapters' THEN COALESCE(json_extract(json, '$.wordCount'), 0) ELSE 0 END) AS words,
        SUM(CASE WHEN collection = 'chapters' AND json_extract(json, '$.kind') = 'chapter' THEN 1 ELSE 0 END) AS chapters,
        SUM(CASE WHEN collection = 'chapters' AND json_extract(json, '$.kind') = 'scene' THEN 1 ELSE 0 END) AS scenes,
        SUM(CASE WHEN collection = 'loreEntries' AND json_extract(json, '$.category') = 'character' THEN 1 ELSE 0 END) AS characters,
        SUM(CASE WHEN collection = 'loreEntries' THEN 1 ELSE 0 END) AS entries,
        SUM(CASE WHEN collection = 'timelineEvents' THEN 1 ELSE 0 END) AS events,
        SUM(CASE WHEN collection = 'plotThreads' THEN 1 ELSE 0 END) AS threads,
        MAX(CASE WHEN collection = 'writingSessions' AND (COALESCE(json_extract(json, '$.added'), 0) > 0
          OR COALESCE(json_extract(json, '$.removed'), 0) > 0) THEN json_extract(json, '$.lastActiveAt') END) AS last_written
      FROM records GROUP BY project_id`);
    const out = new Map<string, NovelStats>();
    for (const r of rows) {
      out.set(String(r['project_id']), {
        words: Math.trunc(Number(r['words'] ?? 0)),
        chapters: Number(r['chapters'] ?? 0),
        scenes: Number(r['scenes'] ?? 0),
        characters: Number(r['characters'] ?? 0),
        entries: Number(r['entries'] ?? 0),
        events: Number(r['events'] ?? 0),
        threads: Number(r['threads'] ?? 0),
        lastWrittenAt: r['last_written'] === null || r['last_written'] === undefined ? null : Number(r['last_written']),
      });
    }
    return out;
  }

  /** Every writing session in the library (words added and the day), for the writer's rank. Read from the index: no
   * novel is loaded. The sample novel is left out: the writer did not write it. */
  writingLog(): { added: number; day: string | null }[] {
    return this.sql
      .all<{ added: number | null; day: string | null }>(
        "SELECT json_extract(r.json, '$.added') AS added, json_extract(r.json, '$.day') AS day FROM records r " +
          `WHERE r.collection = 'writingSessions' AND ${notSample}`,
      )
      .map((r) => ({ added: Number(r.added ?? 0), day: typeof r.day === 'string' ? r.day : null }));
  }

  /** How many chapters and scenes the writer has finished (Final or Published), the sample novel's left out. */
  finishedChapters(): number {
    return Number(
      first<{ n: number }>(
        this.sql,
        "SELECT COUNT(*) AS n FROM records r WHERE r.collection = 'chapters' " +
          `AND json_extract(r.json, '$.status') IN ('final', 'published') AND ${notSample}`,
      )?.n ?? 0,
    );
  }

  /** One novel's most recently written records, newest first, for its Recent Activity (in Analytics). */
  recentRows(projectId: string, limit = 60): { projectId: string; collection: string; json: JsonMap; updatedAt: number }[] {
    return this.sql
      .all<{ project_id: string; collection: string; json: string; updated_at: number }>(
        'SELECT project_id, collection, json, updated_at FROM records ' +
          "WHERE project_id = ? AND collection NOT IN ('writingSessions', 'chapterRevisions', 'activity') " +
          'ORDER BY updated_at DESC LIMIT ?',
        [projectId, limit],
      )
      .map((r) => ({
        projectId: r.project_id,
        collection: r.collection,
        json: JSON.parse(r.json),
        updatedAt: Number(r.updated_at),
      }));
  }

  /** Deletes a novel and everything it owns (its drafts too). Restore points are kept, so it can be brought back. */
  deleteNovel(projectId: string): void {
    this.db.transaction(() => this.sql.run('DELETE FROM novels WHERE id = ?', [projectId]));
    this.wroteWhole(projectId);
    this.changed();
  }
}

/** Records (as `r`) of novels that are not the sample novel (sampleNovel.ts marks it `scriptorSample`). */
const notSample =
  "r.project_id NOT IN (SELECT id FROM novels WHERE json_extract(json, '$.scriptorSample') = 1)";

/** Whether two versions of a novel's own row differ in nothing but when it was last written. */
/** In a review copy, a change judged by its role's rule: refused with PermissionError, or the key it is kept under in
 * the copy's mark (what the person's feedback file carries back). */
function guarded(mark: ReviewMark, collection: string, id: string, before: JsonMap | null, after: JsonMap | null): string[] {
  const reason = refusal(mark.role, mark.memberId, `${collection}:${id}`, before, after);
  if (reason !== null) throw new PermissionError(reason);
  return [`${collection}:${id}`];
}

/** The project with the keys of a review copy's newly allowed changes added to its mark. */
function marked(project: JsonMap, mark: ReviewMark, keys: readonly string[]): JsonMap {
  return { ...project, review: { ...mark.toJson(), changed: [...new Set([...mark.changed, ...keys])] } };
}

/** The details a person keeps for themselves on a review copy: they may change these, and nothing else of it. */
const personal = new Set(['pinned', 'archived', 'lastOpenedAt', 'updatedAt']);

function sameButTime(a: JsonMap, b: JsonMap): boolean {
  const { updatedAt: _a, ...ra } = a;
  const { updatedAt: _b, ...rb } = b;
  return jsonEquals(ra, rb);
}
