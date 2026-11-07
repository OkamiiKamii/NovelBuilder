import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import { cleanLabels } from '@/modules/structure/types';
import { removeConnectionsOf } from '@/modules/connections/cascade';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { CANON_STATUSES, type CanonStatus } from '@/modules/canon/types';
import { calendarFrom, daysIn, STANDARD_CALENDAR, type Calendar } from './calendar';
import { EVENT_STATUSES, IMPORTANCE, REVEAL_ROLES, SEASONS, TIME_UNITS, type EventStatus, type EventChanges, type EventCharacter, type EventDate, type EventDuration, type Importance, type Season, type TimeUnit, type TimelineEvent } from './types';

export class EventNotFoundError extends Error {
  constructor(id: string) {
    super(`Event ${id} not found in this project`);
    this.name = 'EventNotFoundError';
  }
}

/** Hooks the timeline into project isolation, duplication and backup. Every reference inside an event is re-pointed at the copies. */
export function registerTimeline(registry: ProjectRegistry): void {
  // The novel's calendar travels with its events: copied, backed up, forked and deleted with the project.
  registry.registerCollection({ table: 'storyCalendars' });
  registry.registerCollection({
    table: 'timelineEvents',
    refs: ['locationId', 'entryIds', 'nodeIds', 'afterId', 'threadIds'],
    // The world's history is inherited whole; only pointers to chapters that are not in the new timeline are dropped.
    fork: (rows, reached) => rows.map((row) => ({ ...row, nodeIds: ((row as unknown as TimelineEvent).nodeIds ?? []).filter(reached), reveals: ((row as unknown as TimelineEvent).reveals ?? []).filter((r) => reached(r.nodeId)) })),
    remap: (row, mapId) => {
      const event = row as unknown as TimelineEvent;
      const date = (when: EventDate | null | undefined) => (when?.precision === 'relative' && when.anchorId ? { ...when, anchorId: mapId(when.anchorId) } : when);
      return {
        ...row,
        characters: (event.characters ?? []).map((c) => ({ ...c, id: mapId(c.id) })),
        when: date(event.when),
        ...(event.end ? { end: date(event.end) } : {}),
        ...(event.reveals ? { reveals: event.reveals.map((r) => ({ ...r, nodeId: mapId(r.nodeId) })) } : {}),
      };
    },
  });
}

const int = (value: unknown, min: number, max: number): number | null => {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) && Math.round(n) >= min && Math.round(n) <= max ? Math.round(n) : null;
};
const unit = (value: unknown): TimeUnit => (TIME_UNITS.includes(value as TimeUnit) ? (value as TimeUnit) : 'years');

/**
 * Coerces a date into a valid one of its precision, in the novel's calendar:
 * a month it has, a day that month has, an hour its days have. Detail that
 * makes no sense is dropped. A date that needs a year but has none becomes
 * undated. This is checked only when a date is saved; changing the calendar
 * later never rewrites a stored date (one that no longer fits says so).
 */
export function normalizeDate(input: unknown, calendar: Calendar = STANDARD_CALENDAR): EventDate {
  const when = (input ?? {}) as Record<string, unknown>;
  const year = int(when.year, -9_999_999, 9_999_999);
  if (when.precision === 'exact' && year !== null) {
    const month = int(when.month, 1, calendar.months.length);
    const day = month ? int(when.day, 1, daysIn(month, calendar)) : null;
    const hour = day ? int(when.hour, 0, calendar.hoursPerDay - 1) : null;
    return { precision: 'exact', year, month, day, hour, minute: hour !== null ? (int(when.minute, 0, 59) ?? 0) : null };
  }
  if (when.precision === 'approximate' && year !== null) {
    const month = int(when.month, 1, calendar.months.length);
    return { precision: 'approximate', year, month, season: !month && SEASONS.includes(when.season as Season) ? (when.season as Season) : null };
  }
  if (when.precision === 'relative') {
    return { precision: 'relative', anchorId: typeof when.anchorId === 'string' && when.anchorId ? when.anchorId : null, amount: Math.abs(Number(when.amount)) || 0, unit: unit(when.unit), direction: when.direction === 'after' ? 'after' : 'before' };
  }
  return { precision: 'unknown' };
}

export function createTimelineService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  /** Every operation is bound to one project; ids from another project are treated as not found. */
  function forProject(projectId: string) {
    async function owned(eventId: string): Promise<TimelineEvent> {
      const event = await db.timelineEvents.get(eventId);
      if (!event || event.projectId !== projectId) throw new EventNotFoundError(eventId);
      return event;
    }
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    const all = () => db.timelineEvents.where('projectId').equals(projectId).toArray();

    /** Keeps only ids of this project's rows in `table` (optionally of one codex category). */
    async function existing(table: 'loreEntries' | 'chapters' | 'timelineEvents' | 'plotThreads', ids: unknown, category?: string): Promise<string[]> {
      const wanted = [...new Set((Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && id !== ''))];
      const rows = (await db.table(table).bulkGet(wanted)) as ({ projectId: string; category?: string } | undefined)[];
      return wanted.filter((_, i) => rows[i]?.projectId === projectId && (!category || rows[i]?.category === category));
    }

    return {
      list: all,

      async get(eventId: string): Promise<TimelineEvent | undefined> {
        const event = await db.timelineEvents.get(eventId);
        return event?.projectId === projectId ? event : undefined;
      },

      create: (name?: string) =>
        write(async () => {
          const now = Date.now();
          const event: TimelineEvent = {
            id: createId(), projectId, name: name?.trim() || 'New event', description: '', when: { precision: 'unknown' }, duration: null, importance: 'minor',
            locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: now, updatedAt: now,
          };
          await db.timelineEvents.add(event);
          return event;
        }),

      /**
       * Updates an event. This is the only way an event's date, duration,
       * ages or order ever change: by the author editing the event.
       *
       * Pass a function to base the change on the event as it is stored right
       * now (inside the same transaction), so two quick edits in a row can
       * never overwrite each other with stale values.
       */
      update: (eventId: string, edit: EventChanges | ((current: TimelineEvent) => EventChanges)) =>
        write(async () => {
          const current = await owned(eventId);
          const changes = typeof edit === 'function' ? edit(current) : edit;
          const next: EventChanges & { updatedAt: number } = { updatedAt: Date.now() };
          if (typeof changes.name === 'string') next.name = changes.name.trim() || 'Untitled event';
          if (typeof changes.description === 'string') next.description = changes.description;
          if (IMPORTANCE.includes(changes.importance as Importance)) next.importance = changes.importance;
          const calendar = 'when' in changes || 'end' in changes ? calendarFrom((await db.storyCalendars.where('projectId').equals(projectId).toArray())[0]) : STANDARD_CALENDAR;
          if ('when' in changes) {
            const when = normalizeDate(changes.when, calendar);
            // A relative date must point at another event of this project.
            if (when.precision === 'relative') when.anchorId = when.anchorId && when.anchorId !== eventId ? ((await existing('timelineEvents', [when.anchorId]))[0] ?? null) : null;
            next.when = when;
          }
          if ('duration' in changes) {
            const amount = Number((changes.duration as EventDuration | null)?.amount);
            next.duration = Number.isFinite(amount) && amount > 0 ? { amount, unit: unit(changes.duration?.unit) } : null;
          }
          if ('locationId' in changes) next.locationId = (await existing('loreEntries', [changes.locationId], 'location'))[0] ?? null;
          if ('characters' in changes) {
            const given = (Array.isArray(changes.characters) ? changes.characters : []) as Partial<EventCharacter>[];
            const ids = await existing('loreEntries', given.map((c) => c?.id), 'character');
            next.characters = ids.map((id) => ({ id, age: int(given.find((c) => c?.id === id)?.age, 0, 100_000) }));
          }
          if ('entryIds' in changes) next.entryIds = await existing('loreEntries', changes.entryIds);
          if ('nodeIds' in changes) next.nodeIds = await existing('chapters', changes.nodeIds);
          if ('afterId' in changes) next.afterId = changes.afterId && changes.afterId !== eventId ? ((await existing('timelineEvents', [changes.afterId]))[0] ?? null) : null;
          // How long it lasts is said one way at a time: a duration, an end date, or "still going on".
          if (next.duration) Object.assign(next, { end: null, ongoing: false });
          if ('end' in changes) {
            const end = changes.end ? normalizeDate(changes.end, calendar) : null;
            if (end?.precision === 'relative') end.anchorId = end.anchorId && end.anchorId !== eventId ? ((await existing('timelineEvents', [end.anchorId]))[0] ?? null) : null;
            next.end = end;
            if (end) Object.assign(next, { duration: null, ongoing: false });
          }
          if ('ongoing' in changes) {
            next.ongoing = changes.ongoing === true;
            if (next.ongoing) Object.assign(next, { end: null, duration: null });
          }
          if ('threadIds' in changes) next.threadIds = await existing('plotThreads', changes.threadIds);
          if ('labels' in changes) next.labels = cleanLabels(changes.labels);
          if ('status' in changes) next.status = EVENT_STATUSES.includes(changes.status as EventStatus) ? changes.status : 'confirmed';
          if ('canon' in changes) next.canon = CANON_STATUSES.includes(changes.canon as CanonStatus) ? changes.canon : 'canon';
          // A chapter's role in telling the event lasts as long as the event is told there; "told" is the plain case and is not stored.
          if ('reveals' in changes || 'nodeIds' in changes) {
            const told = new Set(next.nodeIds ?? current.nodeIds ?? []);
            const given = 'reveals' in changes ? (Array.isArray(changes.reveals) ? changes.reveals : []) : (current.reveals ?? []);
            const seen = new Set<string>();
            next.reveals = given.filter((r) => r && told.has(r.nodeId) && REVEAL_ROLES.includes(r.role) && r.role !== 'told' && !seen.has(r.nodeId) && seen.add(r.nodeId)).map((r) => ({ nodeId: r.nodeId, role: r.role }));
          }
          await db.timelineEvents.update(eventId, next);
        }),

      /** Deletes an event. Events that followed it or were dated relative to it keep everything else, and are flagged. */
      remove: (eventId: string) =>
        write(async () => {
          await owned(eventId);
          await removeConnectionsOf(db, [eventId]);
          await db.timelineEvents.delete(eventId);
        }),
    };
  }

  return { forProject };
}

export type TimelineService = ReturnType<typeof createTimelineService>;
export type ProjectTimeline = ReturnType<TimelineService['forProject']>;
