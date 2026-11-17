// What deleting a record does to each thing that refers to it. A port of
// flutter_app/lib/shared/domain/model/delete_policy.dart.
//
// Explicit, per kind, and the same as the original app:
//
// | Deleted  | Cascade (removed with it)                                                      | Detach (reference cleared, record kept)                           | Left unresolved (reported)              |
// |----------|--------------------------------------------------------------------------------|-------------------------------------------------------------------|-----------------------------------------|
// | node     | its whole subtree; their text, plans, alternate drafts, versions; their links  | none                                                              | events, threads, plans, rules naming it |
// | entry    | its links; its relationships (and their links); profile, secrets, notes,       | journeys (traveller, from, to, via); maps of the place; progress  | events, threads, plans, sheets, fields  |
// |          | history, progress changes and map pins about it                                | changes that name it as the thing gained                          | naming it                               |
// | event    | its links                                                                      | none                                                              | events that follow it or are dated from it (flagged) |
// | thread   | its links                                                                      | events' thread lists; other threads' intersections                | none                                    |
// | relation | its links                                                                      | none                                                              | none                                    |
// | ability  | its links (the item is removed from its blueprint)                             | none                                                              | sheets holding it; items branching from it |
//
// Nothing is ever prevented, but nothing is silent either: a screen shows the DeleteOutcome and asks before it is
// applied. Unresolved references stay as stored, are reported as broken links, and can be repaired or removed by the
// author. Records on the other end of a link are never modified.
//
// The outcome is the whole novel as it would be (`snapshot`). To store it: NovelStore.saveChanges(before,
// outcome.snapshot), or NovelStore.writeRows with rowWritesBetween(before, outcome.snapshot) (./rowWrites.ts).

import { type JsonMap, isMap, listOf, str } from '../json';
import { maps, strings } from '../records/jsonRecord';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { type DanglingConnection, deriveConnections } from './connections';
import { type EntityRef } from './entityRef';
import { StoryModel } from './storyModel';
import { subtreeIds } from './storyOrder';

/** Dart's StateError: a call made when the data does not allow it (here: deleting a record that is not there). */
export class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateError';
  }
}

export type DeleteEffect = 'cascade' | 'detach' | 'unresolved';

export class RowEffect {
  constructor(
    readonly collection: string,
    readonly id: string,
    readonly effect: DeleteEffect,
    readonly why: string,
  ) {}
}

export class DeleteOutcome {
  constructor(
    readonly target: EntityRef,
    /** The novel as it would be after the delete. Nothing is applied until the caller stores this. */
    readonly snapshot: NovelSnapshot,
    /** Every row removed or changed, and why. */
    readonly effects: readonly RowEffect[],
    /** Connections that will point at nothing, newly so because of this delete. */
    readonly unresolved: readonly DanglingConnection[],
  ) {}

  get removed(): RowEffect[] {
    return this.effects.filter((e) => e.effect === 'cascade');
  }

  get detached(): RowEffect[] {
    return this.effects.filter((e) => e.effect === 'detach');
  }
}

/** Works out what deleting `target` would do. Throws StateError when the record does not exist. */
export function planDelete(before: NovelSnapshot, target: EntityRef): DeleteOutcome {
  const model = StoryModel.fromSnapshot(before);
  if (!model.exists(target)) throw new StateError(`No ${target.type} ${target.id} to delete.`);
  const effects: RowEffect[] = [];
  let s = before;

  const removeWhere = (collection: string, test: (row: JsonMap) => boolean, why: string) => {
    const rows = s.rows(collection);
    const kept: JsonMap[] = [];
    for (const r of rows) {
      if (test(r)) effects.push(new RowEffect(collection, str(r['id']), 'cascade', why));
      else kept.push(r);
    }
    if (kept.length !== rows.length) s = s.withRows(collection, kept);
  };

  const updateWhere = (
    collection: string,
    change: (row: JsonMap) => JsonMap | null,
    why: string,
    as: DeleteEffect = 'detach',
  ) => {
    let changed = false;
    const rows: JsonMap[] = [];
    for (const r of s.rows(collection)) {
      const next = change(r);
      if (next === null) {
        rows.push(r);
        continue;
      }
      changed = true;
      effects.push(new RowEffect(collection, str(r['id']), as, why));
      rows.push(next);
    }
    if (changed) s = s.withRows(collection, rows);
  };

  const has = (ids: ReadonlySet<string>, value: unknown) => typeof value === 'string' && ids.has(value);
  const removeLinksOf = (ids: ReadonlySet<string>, why: string) =>
    removeWhere('loreLinks', (r) => has(ids, r['fromId']) || has(ids, r['toId']), why);

  switch (target.type) {
    case 'node': {
      const ids = new Set(subtreeIds(model.nodes.values(), target.id));
      removeWhere('chapterContents', (r) => has(ids, r['id']), 'text of a deleted chapter or scene');
      removeWhere('chapterPlans', (r) => has(ids, r['id']), 'plan of a deleted chapter or scene');
      removeWhere('chapterBranches', (r) => has(ids, r['nodeId']), 'alternate draft of a deleted chapter or scene');
      removeWhere('chapterRevisions', (r) => has(ids, r['nodeId']), 'version of a deleted chapter or scene');
      removeLinksOf(ids, 'connection to a deleted chapter or scene');
      removeWhere('chapters', (r) => has(ids, r['id']), 'the deleted node or a part of it');
      break;
    }

    case 'entry': {
      const id = target.id;
      removeLinksOf(new Set([id]), 'connection to the deleted entry');
      const relationIds = new Set(
        s
          .rows('characterRelations')
          .filter((r) => r['fromId'] === id || r['toId'] === id)
          .map((r) => str(r['id'])),
      );
      removeLinksOf(relationIds, 'connection to a relationship of the deleted entry');
      removeWhere('characterRelations', (r) => has(relationIds, r['id']), 'relationship of the deleted entry');
      for (const c of [
        'characterProfiles',
        'characterSecrets',
        'characterNotes',
        'characterHistory',
        'progressChanges',
        'mapPins',
      ]) {
        removeWhere(c, (r) => r['entryId'] === id, 'kept about the deleted entry');
      }
      // A journey keeps what it says without whoever or wherever is gone.
      updateWhere(
        'journeys',
        (j) => {
          const travellers = strings(j['travellerIds']);
          const via = strings(j['via']);
          if (!travellers.includes(id) && j['fromId'] !== id && j['toId'] !== id && !via.includes(id)) return null;
          return {
            ...j,
            travellerIds: listOf(j['travellerIds']).filter((t) => t !== id),
            fromId: j['fromId'] === id ? null : (j['fromId'] ?? null),
            toId: j['toId'] === id ? null : (j['toId'] ?? null),
            via: listOf(j['via']).filter((v) => v !== id),
          };
        },
        'travelled with, from, to or through the deleted entry',
      );
      // A map of a place that goes is kept, as a map of the whole world.
      updateWhere(
        'worldMaps',
        (m) => (m['placeId'] === id ? { ...m, placeId: null } : null),
        'was a map of the deleted place',
      );
      // A change that names it (a sword gained) keeps its words and stops linking to it.
      updateWhere(
        'progressChanges',
        (c) => (c['refId'] === id ? { ...c, refId: null } : null),
        'named the deleted entry',
      );
      removeWhere('loreEntries', (r) => r['id'] === id, 'the deleted entry');
      break;
    }

    case 'event':
      removeLinksOf(new Set([target.id]), 'connection to the deleted event');
      removeWhere('timelineEvents', (r) => r['id'] === target.id, 'the deleted event');
      break;

    case 'thread': {
      const id = target.id;
      removeLinksOf(new Set([id]), 'connection to the deleted thread');
      updateWhere(
        'timelineEvents',
        (e) => {
          const threads = listOf(e['threadIds']);
          return threads.includes(id) ? { ...e, threadIds: threads.filter((t) => t !== id) } : null;
        },
        'belonged to the deleted thread',
      );
      updateWhere(
        'plotThreads',
        (t) => {
          if (t['id'] === id) return null;
          const beats = maps(t['beats']);
          if (!beats.some((b) => listOf(b['withThreadIds']).includes(id))) return null;
          return {
            ...t,
            beats: listOf(t['beats']).map((b) =>
              isMap(b) && listOf(b['withThreadIds']).includes(id)
                ? { ...b, withThreadIds: listOf(b['withThreadIds']).filter((w) => w !== id) }
                : b,
            ),
          };
        },
        'crossed the deleted thread',
      );
      removeWhere('plotThreads', (r) => r['id'] === id, 'the deleted thread');
      break;
    }

    case 'relation':
      removeLinksOf(new Set([target.id]), 'connection to the deleted relationship');
      removeWhere('characterRelations', (r) => r['id'] === target.id, 'the deleted relationship');
      break;

    case 'ability': {
      const slash = target.id.indexOf('/');
      const systemId = target.id.substring(0, slash);
      const itemId = target.id.substring(slash + 1);
      removeWhere(
        'loreLinks',
        (r) =>
          (r['fromType'] === 'ability' && r['fromId'] === target.id) ||
          (r['toType'] === 'ability' && r['toId'] === target.id),
        'connection to the deleted ability',
      );
      updateWhere(
        'systems',
        (b) => {
          if (b['id'] !== systemId) return null;
          return { ...b, items: listOf(b['items']).filter((i) => !isMap(i) || i['id'] !== itemId) };
        },
        'the deleted ability (an item of this blueprint)',
        'cascade',
      );
      break;
    }
  }

  const danglingBefore = new Set(deriveConnections(model).dangling.map((d) => d.connection.id));
  const after = deriveConnections(StoryModel.fromSnapshot(s)).dangling;
  return new DeleteOutcome(
    target,
    s,
    effects,
    after.filter((d) => !danglingBefore.has(d.connection.id)),
  );
}
