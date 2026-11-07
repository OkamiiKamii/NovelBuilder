import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { remapValidity, type Anchor } from '@/modules/model/validity';
import { PRECISIONS, TIME_UNITS, type EventDuration, type TimeUnit } from '@/modules/timeline/types';
import type { Journey, TravelMethod, TravelSettings } from './types';

/** Hooks journeys and travel methods into project isolation, duplication, forking and backup. */
export function registerTravel(registry: ProjectRegistry): void {
  registry.registerCollection({ table: 'travelSettings' });
  registry.registerCollection({
    table: 'journeys',
    refs: ['fromId', 'toId', 'afterId'],
    // A journey leaving or arriving at a chapter the fork has not reached is in the parent's future.
    fork: (rows, reached) => rows.filter((row) => [row.departure, row.arrival].every((a) => (a as Anchor | null)?.kind !== 'node' || reached((a as { nodeId: string }).nodeId))),
    remap: (row, mapId) => {
      const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).map(mapId) : []);
      const at = (a: unknown) => remapValidity({ from: (a as Anchor | null) ?? null, until: null }, mapId)?.from ?? null;
      return { ...row, travellerIds: list(row.travellerIds), via: list(row.via), eventIds: list(row.eventIds), departure: at(row.departure), arrival: at(row.arrival) };
    },
  });
}

export interface JourneyInput {
  travellerIds?: string[];
  fromId?: string | null;
  toId?: string | null;
  via?: string[];
  departure?: Anchor | null;
  arrival?: Anchor | null;
  afterId?: string | null;
  method?: string;
  methodId?: string | null;
  duration?: EventDuration | null;
  distance?: number | null;
  distanceUnit?: string;
  eventIds?: string[];
  note?: string;
}

const text = (value: unknown, max = 120): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function createTravelService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  function forProject(projectId: string) {
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    const settingsRow = async () => (await db.travelSettings.where('projectId').equals(projectId).toArray())[0];
    const journeys = () => db.journeys.where('projectId').equals(projectId).toArray();
    const entry = async (id: unknown) => {
      const found = typeof id === 'string' ? await db.loreEntries.get(id) : undefined;
      return found?.projectId === projectId ? found : undefined;
    };
    async function place(id: unknown, what: string): Promise<string | null> {
      if (id === null || id === undefined || id === '') return null;
      const found = await entry(id);
      if (found?.category !== 'location') throw new Error(`${what} is not a place in this project.`);
      return found.id;
    }
    /** A point in the story: a chapter or scene or event of this project, or a date the timeline can read; null when not known. */
    async function point(at: unknown, which: string): Promise<Anchor | null> {
      if (at === null || at === undefined) return null;
      const a = at as Anchor;
      const mine = async (table: string, id: unknown) => typeof id === 'string' && ((await db.table(table).get(id)) as { projectId?: string } | undefined)?.projectId === projectId;
      if (a.kind === 'node' && (await mine('chapters', a.nodeId))) return { kind: 'node', nodeId: a.nodeId };
      if (a.kind === 'event' && (await mine('timelineEvents', a.eventId))) return { kind: 'event', eventId: a.eventId };
      if (a.kind === 'date' && PRECISIONS.includes(a.when?.precision)) {
        if (a.when.precision === 'relative' && !(await mine('timelineEvents', a.when.anchorId))) throw new Error(`When it ${which}: the event the date counts from is not in this project.`);
        return a.when.precision === 'unknown' ? null : { kind: 'date', when: a.when };
      }
      throw new Error(`When it ${which}: that chapter, scene or event is not in this project.`);
    }

    async function clean(input: JourneyInput, current?: Journey): Promise<Omit<Journey, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>> {
      const next = { ...current, ...input };
      const travellerIds: string[] = [];
      for (const id of [...new Set(next.travellerIds ?? [])]) {
        const found = await entry(id);
        if (!found || found.category === 'location') throw new Error('Who travels must be characters, factions or other records of this project, not places.');
        travellerIds.push(found.id);
      }
      if (!travellerIds.length) throw new Error('Say who travels.');
      const via: string[] = [];
      for (const id of next.via ?? []) {
        const p = await place(id, 'A place it passes through');
        if (p) via.push(p);
      }
      const all = await journeys();
      let afterId = next.afterId ?? null;
      if (afterId !== null) {
        if (!all.some((j) => j.id === afterId)) throw new Error('The journey it comes after is not in this project.');
        // It cannot come after itself, or after one that comes after it.
        for (let at: string | null = afterId, n = 0; at && n < 10_000; at = all.find((j) => j.id === at)?.afterId ?? null, n++) if (at === current?.id) throw new Error('A journey cannot come after itself, or after one that comes after it.');
      }
      if (current && afterId === current.id) afterId = null;
      const methods = (await settingsRow())?.methods ?? [];
      const methodId = next.methodId && methods.some((m) => m.id === next.methodId) ? next.methodId : null;
      if (next.methodId && !methodId) throw new Error('That travel method is not one of this novel’s.');
      const duration = next.duration && Number.isFinite(next.duration.amount) && next.duration.amount >= 0 && TIME_UNITS.includes(next.duration.unit) ? { amount: next.duration.amount, unit: next.duration.unit } : null;
      if (next.duration && !duration) throw new Error('A duration is a number of minutes, hours, days, weeks, months or years.');
      const distance = typeof next.distance === 'number' && Number.isFinite(next.distance) && next.distance >= 0 ? next.distance : null;
      if (next.distance !== null && next.distance !== undefined && distance === null) throw new Error('A distance is a number, 0 or more.');
      const eventIds: string[] = [];
      for (const id of [...new Set(next.eventIds ?? [])]) {
        const e = await db.timelineEvents.get(id);
        if (e?.projectId !== projectId) throw new Error('A related event is not in this project.');
        eventIds.push(id);
      }
      return {
        travellerIds,
        fromId: await place(next.fromId, 'Where it starts'),
        toId: await place(next.toId, 'Where it ends'),
        via,
        departure: await point(next.departure, 'leaves'),
        arrival: await point(next.arrival, 'arrives'),
        afterId,
        method: text(next.method),
        methodId,
        duration,
        distance,
        distanceUnit: text(next.distanceUnit, 30),
        eventIds,
        note: text(next.note, 4000),
      };
    }

    return {
      journeys,
      async settings(): Promise<TravelSettings | null> {
        return (await settingsRow()) ?? null;
      },

      /** Records a journey (`id` null) or changes one. Only who travels is needed; everything else is as far as the author says. */
      saveJourney: (id: string | null, input: JourneyInput) =>
        write(async () => {
          const current = id === null ? undefined : await db.journeys.get(id);
          if (id !== null && (!current || current.projectId !== projectId)) throw new Error('That journey is not in this project.');
          const now = Date.now();
          const saved: Journey = { id: current?.id ?? createId(), projectId, ...(await clean(input, current)), createdAt: current?.createdAt ?? now, updatedAt: now };
          await db.journeys.put(saved);
          return saved;
        }),

      /** Removes a journey. One that came after it now comes after what it came after. */
      removeJourney: (id: string) =>
        write(async () => {
          const gone = await db.journeys.get(id);
          if (!gone || gone.projectId !== projectId) throw new Error('That journey is not in this project.');
          for (const j of (await journeys()).filter((j) => j.afterId === id)) await db.journeys.update(j.id, { afterId: gone.afterId, updatedAt: Date.now() });
          await db.journeys.delete(id);
        }),

      /** The novel's travel methods. A speed is only ever the author's; a method some journey uses cannot be removed. */
      setMethods: (methods: Partial<TravelMethod>[]) =>
        write(async () => {
          const clean: TravelMethod[] = [];
          for (const m of methods) {
            const name = text(m.name, 60);
            if (!name || clean.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue;
            const speed = typeof m.speed === 'number' && Number.isFinite(m.speed) && m.speed > 0 ? m.speed : null;
            clean.push({ id: m.id || createId(), name, speed, distanceUnit: text(m.distanceUnit, 30), per: TIME_UNITS.includes(m.per as TimeUnit) ? (m.per as TimeUnit) : 'days' });
          }
          const row = await settingsRow();
          for (const gone of (row?.methods ?? []).filter((m) => !clean.some((c) => c.id === m.id))) {
            const using = (await journeys()).filter((j) => j.methodId === gone.id).length;
            if (using) throw new Error(`${using} ${using === 1 ? 'journey uses' : 'journeys use'} “${gone.name}”. Change ${using === 1 ? 'it' : 'them'} first.`);
          }
          const now = Date.now();
          const saved: TravelSettings = { id: row?.id ?? createId(), projectId, methods: clean, createdAt: row?.createdAt ?? now, updatedAt: now };
          await db.travelSettings.put(saved);
          return saved;
        }),
    };
  }
  return { forProject };
}

export type TravelService = ReturnType<typeof createTravelService>;
export type ProjectTravel = ReturnType<TravelService['forProject']>;
