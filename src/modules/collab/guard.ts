import type { DBCore, DBCoreMutateRequest, DBCoreTable } from 'dexie';
import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import { refusal } from '@/modules/sync/access';
import { comparable, canonical } from '@/modules/sync/merge';
import type { Me } from './identity';
import type { Activity } from './types';

/** A change this person's role does not allow. The message is fit to show them. */
export class PermissionError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PermissionError';
  }
}

type Row = Record<string, unknown>;

/** How a change to each kind of record reads in the activity record. `name` picks the words that follow the verb. */
const AUDITED: Record<string, { made: string; changed: string; removed: string; name: (row: Row) => string }> = {
  chapterContents: { made: 'began writing', changed: 'edited', removed: 'cleared the text of', name: () => '' },
  chapters: { made: 'added', changed: 'changed the details of', removed: 'removed', name: (row) => String(row.title ?? '') },
  chapterPlans: { made: 'planned', changed: 'updated the plan for', removed: 'removed the plan for', name: () => '' },
  loreEntries: { made: 'added', changed: 'updated', removed: 'removed', name: (row) => (row.category === 'character' ? `${String(row.name ?? '')}'s profile` : String(row.name ?? '')) },
  characterRelations: { made: 'added a relationship', changed: 'updated a relationship', removed: 'removed a relationship', name: () => '' },
  timelineEvents: { made: 'added the event', changed: 'updated the event', removed: 'removed the event', name: (row) => String(row.title ?? '') },
  plotThreads: { made: 'started the plot thread', changed: 'updated the plot thread', removed: 'removed the plot thread', name: (row) => String(row.title ?? '') },
  canonFacts: { made: 'recorded the fact', changed: 'updated the fact', removed: 'removed the fact', name: (row) => String(row.statement ?? row.subject ?? '') },
  systems: { made: 'created the system', changed: 'changed the system', removed: 'removed the system', name: (row) => String(row.name ?? '') },
  systemSheets: { made: 'added a character sheet', changed: 'updated a character sheet', removed: 'removed a character sheet', name: () => '' },
  progressSnapshots: { made: 'recorded a progression snapshot', changed: 'updated a progression snapshot', removed: 'removed a progression snapshot', name: () => '' },
  progressCategories: { made: 'started tracking', changed: 'changed what is tracked:', removed: 'stopped tracking', name: (row) => String(row.name ?? '') },
  progressChanges: { made: 'recorded a progression change', changed: 'updated a progression change', removed: 'removed a progression change', name: () => '' },
  placeSettings: { made: 'set the levels of place', changed: 'changed the levels of place', removed: 'removed the levels of place', name: () => '' },
  worldMaps: { made: 'made the map', changed: 'changed the map', removed: 'removed the map', name: (row) => String(row.name ?? '') },
  mapPins: { made: 'put a place on a map', changed: 'moved a place on a map', removed: 'took a place off a map', name: () => '' },
  journeys: { made: 'recorded a journey', changed: 'changed a journey', removed: 'removed a journey', name: () => '' },
  travelSettings: { made: 'set the travel methods', changed: 'changed the travel methods', removed: 'removed the travel methods', name: () => '' },
};
/** Saves of the same thing by the same person within this long are one line. */
const COALESCE_MS = 15 * 60 * 1000;
/** A request touching more rows than this is a bulk job (an import, a copy), not something a person did by hand. */
const BULK = 5;

interface Options {
  /** The tables whose rows travel between people. Nothing else is looked at. */
  shared: () => string[];
  who: (projectId: string) => Me;
}

/**
 * Sits under every write to the database, for two jobs.
 *
 * PERMISSIONS. A person whose role does not allow a change is stopped here,
 * before anything is written, by the same rule the relay applies. The
 * interface hides what a role cannot do; this is what makes that true even
 * for a path the interface forgot.
 *
 * THE RECORD. Each change a person makes to the book is noted with their
 * name: who edited which chapter, who updated whose profile. Changes that
 * arrive from the cloud are not noted here; whoever made them noted them.
 */
export function installCollab(db: NovelDB, options: Options) {
  const exempt = new Map<string, number>();
  let quiet = 0;
  const queue: { me: Me; projectId: string; verb: string; table: string; rowId: string; name: string }[] = [];
  const recent = new Map<string, { id: string; at: number; count: number }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing: Promise<void> = Promise.resolve();
  // A line is written in the same transaction as the change it records whenever that transaction can take it, so the
  // two are saved together or not at all; otherwise as soon as the change is out of the way.
  type Item = (typeof queue)[number];
  /** The line for one change: a new one, or the line this person's last change of the same thing is folded into. */
  const lineFor = (item: Item, label: string): Activity => {
    const key = `${item.projectId}|${item.me.id}|${item.verb}|${item.table}|${item.rowId}`;
    const last = recent.get(key);
    const now = Date.now();
    const entry = last && now - last.at < COALESCE_MS ? { id: last.id, at: now, count: last.count + 1 } : { id: createId(), at: now, count: 1 };
    recent.set(key, entry);
    return { id: entry.id, projectId: item.projectId, at: entry.at, actorId: item.me.id, actorName: item.me.name, actorRole: item.me.role, verb: item.verb, table: item.table, rowId: item.rowId, label: label.trim(), count: entry.count };
  };
  const merge = (rows: Activity[], row: Activity) => {
    const at = rows.findIndex((r) => r.id === row.id);
    if (at >= 0) rows[at] = row;
    else rows.push(row);
  };

  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    const batch = queue.splice(0);
    if (!batch.length) return flushing;
    flushing = flushing.then(async () => {
      const rows: Activity[] = [];
      for (const item of batch) {
        let label = item.name;
        // The text, plan and sheet of something are named after the thing itself.
        if (!label && (item.table === 'chapterContents' || item.table === 'chapterPlans')) label = (await db.chapters.get(item.rowId))?.title ?? 'a chapter';
        merge(rows, lineFor(item, label));
      }
      await db.table<Activity>('activity').bulkPut(rows).catch(() => {});
    });
    return flushing;
  };

  const projectOf = (table: string, row: Row | undefined): string | undefined => (row ? ((table === 'projects' || table === 'timelines' ? row.id : row.projectId) as string | undefined) : undefined);
  const unchanged = (table: string, before: Row, after: Row): boolean => canonical(comparable(table, before)) === canonical(comparable(table, after));

  async function mutate(core: DBCoreTable, table: string, req: DBCoreMutateRequest) {
    if (req.type === 'deleteRange') return core.mutate(req);
    const afters: (Row | null)[] = req.type === 'delete' ? req.keys.map(() => null) : (req.values as Row[]);
    const ids = req.type === 'delete' ? (req.keys as string[]) : afters.map((row, i) => String(row?.id ?? req.keys?.[i] ?? ''));
    const first = projectOf(table, afters.find(Boolean) ?? undefined);
    // Most writes are the owner's own, to a project nobody is exempting: for an add, nothing needs looking up.
    const befores: (Row | undefined)[] = req.type === 'add' ? ids.map(() => undefined) : ((await core.getMany({ trans: req.trans, keys: ids, cache: 'immutable' })) as (Row | undefined)[]);
    const audited = AUDITED[table];
    const stamp = table === 'chapterContents' || table === 'chapterRevisions';
    let values: (Row | null)[] | null = req.type === 'delete' ? null : afters;
    const mine: Item[] = [];

    for (let i = 0; i < ids.length; i++) {
      const [before, after] = [befores[i], afters[i]];
      const projectId = projectOf(table, after ?? before) ?? first;
      if (!projectId || exempt.get(projectId)) continue;
      const me = options.who(projectId);
      if (before && after && unchanged(table, before, after)) continue;
      if (me.role !== 'owner') {
        const reason = refusal(me.role, me.id, `${table}:${ids[i]}`, before ?? null, after);
        if (reason) throw new PermissionError(reason);
      }
      // Text carries the name of whoever saved it; a version put into history carries the name of whoever had written it.
      // A copy or a restored file arrives whole, signed by whoever wrote it, not by whoever restored it.
      if (stamp && after && values && !quiet) {
        const next: (Row | null)[] = values === afters ? [...afters] : values;
        values = next;
        if (table === 'chapterContents') next[i] = { ...after, by: { id: me.id, name: me.name } };
        else if (after.by === undefined) {
          // Only when the text itself is part of the same piece of work; a version saved on its own (a recovered draft) is left unsigned.
          if ([...(req.trans as IDBTransaction).objectStoreNames].includes('chapterContents')) {
            const [was] = (await db.table('chapterContents').core.getMany({ trans: req.trans, keys: [String(after.nodeId)], cache: 'immutable' })) as (Row | undefined)[];
            if (was?.by) next[i] = { ...after, by: was.by };
          }
        }
      }
      if (audited && !quiet && ids.length <= BULK) mine.push({ me, projectId, verb: !before ? audited.made : !after ? audited.removed : audited.changed, table, rowId: ids[i], name: audited.name(after ?? before ?? {}) });
    }
    const result = await core.mutate(values && values !== afters ? ({ ...req, values } as DBCoreMutateRequest) : req);
    if (mine.length) {
      const stores = [...(req.trans as IDBTransaction).objectStoreNames];
      if (stores.includes('activity') && (req.trans as IDBTransaction).mode !== 'readonly') {
        // Recorded with the change itself.
        const rows: Activity[] = [];
        for (const item of mine) {
          let label = item.name;
          if (!label && (item.table === 'chapterContents' || item.table === 'chapterPlans')) {
            const [chapter] = stores.includes('chapters') ? ((await db.table('chapters').core.getMany({ trans: req.trans, keys: [item.rowId], cache: 'immutable' })) as (Row | undefined)[]) : [];
            label = String(chapter?.title ?? 'a chapter');
          }
          merge(rows, lineFor(item, label));
        }
        await db.table('activity').core.mutate({ type: 'put', trans: req.trans, values: rows });
      } else {
        queue.push(...mine);
        if (!timer) timer = setTimeout(() => void flush(), 0);
      }
    }
    return result;
  }

  db.use({
    stack: 'dbcore',
    name: 'collab',
    create(core: DBCore): DBCore {
      return {
        ...core,
        table(name: string) {
          const table = core.table(name);
          return options.shared().includes(name) ? { ...table, mutate: (req) => mutate(table, name, req) } : table;
        },
      };
    },
  });

  return {
    /** Runs something that is not a person's change to the book (taking in the cloud's rows, removing a local copy), unchecked and unrecorded. */
    async exempt<T>(projectId: string, task: () => Promise<T>): Promise<T> {
      exempt.set(projectId, (exempt.get(projectId) ?? 0) + 1);
      try {
        return await task();
      } finally {
        const left = (exempt.get(projectId) ?? 1) - 1;
        if (left) exempt.set(projectId, left);
        else exempt.delete(projectId);
      }
    },
    /** Runs a job that makes a whole project at once (a copy, a new timeline, an import). Nobody wrote those chapters today: nothing is recorded. */
    async quietly<T>(task: () => Promise<T>): Promise<T> {
      quiet++;
      try {
        return await task();
      } finally {
        quiet--;
      }
    },
    /** Writes what is waiting to the activity record now. */
    flush,
    /** Notes something a service did on a person's behalf that is not a plain change to a row (a comment, a verdict). */
    async note(projectId: string, verb: string, table: string, rowId: string, label: string): Promise<void> {
      const me = options.who(projectId);
      if (me.role === 'viewer') return;
      // A plain write: called inside a service's transaction, it is saved together with what it records.
      await db.table<Activity>('activity').put(lineFor({ me, projectId, verb, table, rowId, name: label }, label));
    },
  };
}

export type CollabGuard = ReturnType<typeof installCollab>;
