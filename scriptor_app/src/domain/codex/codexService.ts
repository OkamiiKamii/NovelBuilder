// The novel's world: its entries and kinds of record, and every change the author makes to them. Each change is one
// transaction on the records as stored, refused (with nothing written) if they changed elsewhere since.
// REFERENCE ISOLATION RULE: nothing here writes manuscript text. A port of
// flutter_app/lib/features/codex/data/codex_service.dart; it is written against the parts of NovelStore and
// BackupService it uses (as CharacterService is), so it runs on the app's stores and on any stand-in.

import type { CharacterBackups, CharacterStore } from '../characters/characterService';
import { newId as makeId } from '../ids';
import { type JsonMap, str } from '../json';
import { StateError, planDelete } from '../model/deletePolicy';
import { EntityRef } from '../model/entityRef';
import { maps, strings } from '../records/jsonRecord';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { CodexChanges } from './codexChanges';

/** The collections a codex change reads and writes (deleting reaches further). */
export const codexCollections: ReadonlySet<string> = new Set(['loreEntries', 'loreSchemas', 'loreLinks']);

/** What refers to an entry, counted, for telling the author before they delete it. */
export type EntryReferences = { links: number; chapters: number; events: number; threads: number; fields: number; plans: number };

/** Everything in `s` that refers to the entry `entryId`. Reads only. */
export function entryReferences(s: NovelSnapshot, entryId: string): EntryReferences {
  const count = (collection: string, test: (row: JsonMap) => boolean) => s.rows(collection).filter(test).length;
  return {
    links: count('loreLinks', (l) => l['fromId'] === entryId || l['toId'] === entryId),
    chapters: count('chapters', (n) => strings(n['mentions']).includes(entryId)),
    events: count(
      'timelineEvents',
      (e) =>
        e['locationId'] === entryId ||
        strings(e['entryIds']).includes(entryId) ||
        maps(e['characters']).some((c) => c['id'] === entryId),
    ),
    threads: count(
      'plotThreads',
      (t) => strings(t['characterIds']).includes(entryId) || strings(t['locationIds']).includes(entryId),
    ),
    fields: count(
      'loreEntries',
      (e) => e['id'] !== entryId && maps(e['fields']).some((f) => str(f['value']).split('\n').includes(entryId)),
    ),
    plans: count('chapterPlans', (p) => strings(p['entityIds']).includes(entryId)),
  };
}

export class CodexService {
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

  /** Applies `apply` to the world as stored now and saves the result in one transaction (nothing is saved when it
   * throws). */
  change<T>(projectId: string, apply: (c: CodexChanges) => T): T {
    const before = this.store.loadPart(projectId, codexCollections);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const changes = new CodexChanges(before, { now: this.now, createId: this.createId });
    const result = apply(changes);
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: this.now } }));
    return result;
  }

  private whole(projectId: string): NovelSnapshot {
    const s = this.store.load(projectId);
    if (s === null) throw new StateError('That novel is no longer in the library.');
    return s;
  }

  /** Everything that refers to an entry. Reads only. */
  references(projectId: string, entryId: string): EntryReferences {
    return entryReferences(this.whole(projectId), entryId);
  }

  /** Deletes an entry with its links, as every entry is deleted (planDelete), after keeping a restore point.
   * Returns the restore point, for Undo. */
  delete(projectId: string, entryId: string, options: { name: string }): string {
    const kept = this.backups.keepRestorePoint(projectId, `Before deleting “${options.name}”`);
    if (kept === null) throw new StateError('That novel is no longer in the library.');
    const before = this.whole(projectId);
    const after = planDelete(before, new EntityRef('entry', entryId)).snapshot;
    this.store.saveChanges(before, after.copyWith({ project: { ...before.project, updatedAt: this.now } }));
    return kept;
  }

  undoDelete(restorePointId: string): void {
    this.backups.restore(restorePointId);
  }
}
