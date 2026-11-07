import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { calendarFrom } from './calendar';
import { CHANGEABLE, fieldValue, HISTORY_KINDS, HISTORY_STATUSES, historyEvents, lineage, staleChanges, type AlternateHistory, type EventChange, type HistoryKind, type HistoryStatus } from './histories';
import { normalizeDate } from './service';
import { IMPORTANCE, TIME_UNITS, type EventDate, type Importance, type TimeUnit, type TimelineEvent } from './types';

export class HistoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Alternate history ${id} not found in this project`);
    this.name = 'HistoryNotFoundError';
  }
}

/** Every id inside a history follows its record into a copy of the project. */
function remapHistory(row: AlternateHistory, mapId: (id: string) => string): AlternateHistory {
  const date = (when: EventDate | null | undefined) => (when?.precision === 'relative' && when.anchorId ? { ...when, anchorId: mapId(when.anchorId) } : when);
  const fields = <T extends EventChange>(change: T): T => ({
    ...change,
    ...(change.when ? { when: date(change.when) } : {}),
    ...(change.end ? { end: date(change.end) } : {}),
    ...(change.locationId ? { locationId: mapId(change.locationId) } : {}),
    ...(change.characters ? { characters: change.characters.map((c) => ({ ...c, id: mapId(c.id) })) } : {}),
    ...(change.entryIds ? { entryIds: change.entryIds.map(mapId) } : {}),
    ...(change.afterId ? { afterId: mapId(change.afterId) } : {}),
  });
  return {
    ...row,
    baseId: row.baseId ? mapId(row.baseId) : null,
    originEventId: row.originEventId ? mapId(row.originEventId) : null,
    causeEventId: row.causeEventId ? mapId(row.causeEventId) : null,
    changed: Object.fromEntries(Object.entries(row.changed ?? {}).map(([id, change]) => [mapId(id), fields(change)])),
    removed: (row.removed ?? []).map(mapId),
    added: (row.added ?? []).map((e) => ({ ...fields(e), id: mapId(e.id), nodeIds: (e.nodeIds ?? []).map(mapId) }) as TimelineEvent),
  };
}

/** Alternate histories travel with their novel: copied, backed up, forked and deleted with it. */
export function registerHistories(registry: ProjectRegistry): void {
  registry.registerCollection({ table: 'alternateHistories', remap: (row, mapId) => remapHistory(row as unknown as AlternateHistory, mapId) as never });
}

export type HistoryInput = Partial<Pick<AlternateHistory, 'name' | 'baseId' | 'kind' | 'status' | 'originEventId' | 'causeEventId' | 'note'>>;

export function createHistoryService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  return {
    forProject(projectId: string) {
      const write = <T>(task: () => Promise<T>): Promise<T> =>
        db.transaction('rw', db.tables, async () => {
          const result = await task();
          await onProjectChanged(projectId);
          return result;
        });
      const all = async () => new Map((await db.alternateHistories.where('projectId').equals(projectId).toArray()).map((h) => [h.id, h]));
      const main = async () => new Map((await db.timelineEvents.where('projectId').equals(projectId).toArray()).map((e) => [e.id, e]));
      async function owned(id: string): Promise<AlternateHistory> {
        const history = await db.alternateHistories.get(id);
        if (!history || history.projectId !== projectId) throw new HistoryNotFoundError(id);
        return history;
      }
      /** The events a history's own changes are made against: its base's. */
      async function baseOf(history: Pick<AlternateHistory, 'baseId'>) {
        return historyEvents(await main(), await all(), history.baseId);
      }
      const save = (id: string, changes: Partial<AlternateHistory>) => db.alternateHistories.update(id, { ...changes, updatedAt: Date.now() });

      /**
       * A change as it can be stored: each field checked as the timeline
       * checks it, ids kept only when they name a record of this novel (an
       * event, when this history has it), and the length said one way at a
       * time. Fields the same as `against` are dropped, so a history only
       * ever holds what is different.
       */
      async function clean(change: EventChange, events: Map<string, TimelineEvent>, against: TimelineEvent | null): Promise<EventChange> {
        const calendar = calendarFrom((await db.storyCalendars.where('projectId').equals(projectId).toArray())[0]);
        const entries = new Map((await db.loreEntries.where('projectId').equals(projectId).toArray()).map((e) => [e.id, e]));
        const anchored = (when: EventDate): EventDate => (when.precision === 'relative' && when.anchorId && !events.has(when.anchorId) ? { ...when, anchorId: null } : when);
        const out: EventChange = {};
        if ('name' in change) out.name = String(change.name ?? '').trim() || 'Untitled event';
        if ('description' in change) out.description = String(change.description ?? '');
        if ('when' in change) out.when = anchored(normalizeDate(change.when, calendar));
        if ('end' in change) out.end = change.end ? anchored(normalizeDate(change.end, calendar)) : null;
        if ('duration' in change) {
          const amount = Number(change.duration?.amount);
          out.duration = Number.isFinite(amount) && amount > 0 ? { amount, unit: TIME_UNITS.includes(change.duration?.unit as TimeUnit) ? change.duration!.unit : 'days' } : null;
        }
        if ('ongoing' in change) out.ongoing = change.ongoing === true;
        if ('importance' in change) out.importance = IMPORTANCE.includes(change.importance as Importance) ? change.importance : 'minor';
        if ('locationId' in change) out.locationId = change.locationId && entries.get(change.locationId)?.category === 'location' ? change.locationId : null;
        if ('characters' in change) out.characters = (change.characters ?? []).filter((c, i, list) => entries.get(c.id)?.category === 'character' && list.findIndex((x) => x.id === c.id) === i).map((c) => ({ id: c.id, age: Number.isInteger(c.age) && c.age! >= 0 ? c.age : null }));
        if ('entryIds' in change) out.entryIds = [...new Set(change.entryIds ?? [])].filter((id) => entries.has(id));
        if ('afterId' in change) out.afterId = change.afterId && events.has(change.afterId) ? change.afterId : null;
        // How long it lasts is said one way at a time, as on the timeline.
        if (out.duration) Object.assign(out, { end: null, ongoing: false });
        if (out.end) Object.assign(out, { duration: null, ongoing: false });
        if (out.ongoing) Object.assign(out, { end: null, duration: null });
        if (against) for (const field of CHANGEABLE) if (field in out && JSON.stringify(fieldValue(out, field)) === JSON.stringify(fieldValue(against, field))) delete out[field];
        return out;
      }

      return {
        list: async (): Promise<AlternateHistory[]> => [...(await all()).values()].sort((a, b) => a.createdAt - b.createdAt),
        get: (id: string) => owned(id),

        /** Starts a history: no differences yet, so it reads exactly as its base until the author changes something. */
        create: (input: HistoryInput = {}) =>
          write(async () => {
            const histories = await all();
            const baseId = input.baseId && histories.has(input.baseId) ? input.baseId : null;
            const base = historyEvents(await main(), histories, baseId);
            const now = Date.now();
            const history: AlternateHistory = {
              id: createId(),
              projectId,
              name: input.name?.trim() || 'Untitled alternate history',
              baseId,
              kind: HISTORY_KINDS.includes(input.kind as HistoryKind) ? input.kind! : 'hypothetical',
              status: HISTORY_STATUSES.includes(input.status as HistoryStatus) ? input.status! : 'experimental',
              originEventId: input.originEventId && base.has(input.originEventId) ? input.originEventId : null,
              causeEventId: input.causeEventId && base.has(input.causeEventId) ? input.causeEventId : null,
              note: input.note?.trim() ?? '',
              changed: {},
              removed: [],
              added: [],
              createdAt: now,
              updatedAt: now,
            };
            await db.alternateHistories.add(history);
            return history;
          }),

        /** Its name, kind, canon status, where it departs and why. Its base is fixed once it is made. */
        update: (id: string, input: Omit<HistoryInput, 'baseId'>) =>
          write(async () => {
            const history = await owned(id);
            const base = await baseOf(history);
            const next: Partial<AlternateHistory> = {};
            if (typeof input.name === 'string') next.name = input.name.trim() || history.name;
            if (HISTORY_KINDS.includes(input.kind as HistoryKind)) next.kind = input.kind;
            if (HISTORY_STATUSES.includes(input.status as HistoryStatus)) next.status = input.status;
            if ('originEventId' in input) next.originEventId = input.originEventId && base.has(input.originEventId) ? input.originEventId : null;
            if ('causeEventId' in input) next.causeEventId = input.causeEventId && base.has(input.causeEventId) ? input.causeEventId : null;
            if (typeof input.note === 'string') next.note = input.note.trim();
            await save(id, next);
          }),

        /** A base event goes differently in this history. Only the fields that differ from the base are kept; none left restores it. */
        changeEvent: (id: string, eventId: string, change: EventChange) =>
          write(async () => {
            const history = await owned(id);
            const base = await baseOf(history);
            const event = base.get(eventId);
            if (!event) throw new Error('That event is not in the timeline this history branches from.');
            const merged = await clean({ ...history.changed[eventId], ...change }, historyEvents(await main(), await all(), id), event);
            const changed = { ...history.changed };
            if (Object.keys(merged).length) changed[eventId] = merged;
            else delete changed[eventId];
            await save(id, { changed, removed: history.removed.filter((r) => r !== eventId) });
          }),

        /** A base event does not happen in this history. */
        removeEvent: (id: string, eventId: string) =>
          write(async () => {
            const history = await owned(id);
            if (!(await baseOf(history)).has(eventId)) throw new Error('That event is not in the timeline this history branches from.');
            const changed = { ...history.changed };
            delete changed[eventId];
            await save(id, { changed, removed: [...new Set([...history.removed, eventId])] });
          }),

        /** Back as the base has it: the history's change or removal is dropped. */
        restoreEvent: (id: string, eventId: string) =>
          write(async () => {
            const history = await owned(id);
            const changed = { ...history.changed };
            delete changed[eventId];
            await save(id, { changed, removed: history.removed.filter((r) => r !== eventId) });
          }),

        /** An event that happens only in this history. It is kept in the history, never in the main timeline. */
        addEvent: (id: string, name?: string) =>
          write(async () => {
            const history = await owned(id);
            const now = Date.now();
            const event: TimelineEvent = { id: createId(), projectId, name: name?.trim() || 'New event', description: '', when: { precision: 'unknown' }, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: now, updatedAt: now };
            await save(id, { added: [...history.added, event] });
            return event;
          }),

        updateAdded: (id: string, eventId: string, change: EventChange) =>
          write(async () => {
            const history = await owned(id);
            const event = history.added.find((e) => e.id === eventId);
            if (!event) throw new Error('That event is not one this history adds.');
            const cleaned = await clean(change, historyEvents(await main(), await all(), id), null);
            await save(id, { added: history.added.map((e) => (e.id === eventId ? { ...e, ...cleaned, updatedAt: Date.now() } : e)) });
          }),

        deleteAdded: (id: string, eventId: string) =>
          write(async () => {
            const history = await owned(id);
            await save(id, { added: history.added.filter((e) => e.id !== eventId) });
          }),

        /** Drops changes and removals that point at events the base no longer has. */
        forgetStale: (id: string) =>
          write(async () => {
            const history = await owned(id);
            const stale = new Set(staleChanges(await main(), await all(), history));
            await save(id, { changed: Object.fromEntries(Object.entries(history.changed).filter(([eventId]) => !stale.has(eventId))), removed: history.removed.filter((r) => !stale.has(r)) });
          }),

        /** Deletes a history. Histories based on it are based on its base instead, keeping their own differences; the main timeline is untouched. */
        remove: (id: string) =>
          write(async () => {
            const history = await owned(id);
            const histories = await all();
            for (const other of histories.values()) if (other.baseId === id) await save(other.id, { baseId: history.baseId });
            await db.alternateHistories.delete(id);
          }),

        /** Whether basing a history on `baseId` would loop back to itself. */
        loops: async (id: string, baseId: string) => lineage(await all(), baseId).some((h) => h.id === id),
      };
    },
  };
}

export type HistoryService = ReturnType<typeof createHistoryService>;
