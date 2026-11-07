import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import type { LoreLink } from '@/modules/codex/types';
import { parentsOf } from './explore';
import { LEVEL_PRESETS, MAP_IMAGE_LIMIT, type MapPin, type PlaceLevel, type PlaceSettings, type WorldMap } from './types';

/** Hooks place settings, maps and pins into project isolation, duplication, forking and backup. */
export function registerPlaces(registry: ProjectRegistry): void {
  registry.registerCollection({ table: 'placeSettings' });
  registry.registerCollection({ table: 'worldMaps', refs: ['placeId'] });
  registry.registerCollection({ table: 'mapPins', refs: ['mapId', 'entryId'] });
}

export interface MapInput {
  name?: string;
  placeId?: string | null;
  width?: number;
  height?: number;
  unit?: string;
  grid?: number;
}

const text = (value: unknown, max = 80): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const positive = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback);

export function createPlaceService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  function forProject(projectId: string) {
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    const settingsRow = async () => (await db.placeSettings.where('projectId').equals(projectId).toArray())[0];
    async function place(id: unknown, what = 'That place') {
      const entry = typeof id === 'string' ? await db.loreEntries.get(id) : undefined;
      if (!entry || entry.projectId !== projectId || entry.category !== 'location') throw new Error(`${what} is not a location in this project.`);
      return entry;
    }
    async function map(id: string): Promise<WorldMap> {
      const found = await db.worldMaps.get(id);
      if (!found || found.projectId !== projectId) throw new Error('That map is not in this project.');
      return found;
    }

    /** Levels as stored: each named once, ids kept, largest first. A level some place still has is never dropped. */
    async function saveLevels(levels: { id?: string; name: string }[]): Promise<PlaceSettings> {
      const clean: PlaceLevel[] = [];
      for (const level of levels) {
        const name = text(level.name, 40);
        if (name && !clean.some((l) => l.name.toLowerCase() === name.toLowerCase())) clean.push({ id: level.id || createId(), name });
      }
      const row = await settingsRow();
      const dropped = (row?.levels ?? []).filter((l) => !clean.some((c) => c.id === l.id));
      for (const level of dropped) {
        const using = await db.loreEntries.where('projectId').equals(projectId).filter((e) => e.placeLevel === level.id).count();
        if (using) throw new Error(`${using} ${using === 1 ? 'place is' : 'places are'} a ${level.name}. Give ${using === 1 ? 'it' : 'them'} another level first.`);
      }
      const now = Date.now();
      const saved: PlaceSettings = { id: row?.id ?? createId(), projectId, levels: clean, createdAt: row?.createdAt ?? now, updatedAt: now };
      await db.placeSettings.put(saved);
      return saved;
    }

    return {
      async settings(): Promise<PlaceSettings | null> {
        return (await settingsRow()) ?? null;
      },

      setLevels: (levels: { id?: string; name: string }[]) => write(() => saveLevels(levels)),

      /** Starts from a set of levels; with levels already, only adds the ones missing, after them. */
      applyPreset: (presetId: string) =>
        write(async () => {
          const preset = LEVEL_PRESETS.find((p) => p.id === presetId);
          if (!preset) throw new Error('There is no such set of levels.');
          const current = (await settingsRow())?.levels ?? [];
          return saveLevels([...current, ...preset.levels.filter((n) => !current.some((l) => l.name.toLowerCase() === n.toLowerCase())).map((name) => ({ name }))]);
        }),

      /** A place's level, or none. */
      setLevel: (entryId: string, levelId: string | null) =>
        write(async () => {
          await place(entryId);
          if (levelId !== null && !(await settingsRow())?.levels.some((l) => l.id === levelId)) throw new Error('That level is not one of this novel’s.');
          await db.loreEntries.update(entryId, { placeLevel: levelId, updatedAt: Date.now() });
        }),

      /**
       * What a place is inside: its "Located in" connection to another place,
       * or none (at the top). A place cannot go inside itself, or inside a
       * place that is inside it. A connection that has ended stays, as history.
       */
      setParent: (entryId: string, parentId: string | null) =>
        write(async () => {
          await place(entryId);
          if (parentId !== null) {
            await place(parentId, 'The place it is in');
            if (parentId === entryId) throw new Error('A place cannot be inside itself.');
            const model = { entries: new Map((await db.loreEntries.where('projectId').equals(projectId).toArray()).map((e) => [e.id, e])), links: await db.loreLinks.where('projectId').equals(projectId).toArray() };
            const { parent } = parentsOf(model);
            for (let at: string | undefined = parentId, steps = 0; at && steps < 10_000; at = parent.get(at), steps++) {
              if (at === entryId) throw new Error(`${model.entries.get(parentId)!.name} is inside ${model.entries.get(entryId)!.name}, so it cannot also be what it is in.`);
            }
          }
          const current = await db.loreLinks
            .where('projectId')
            .equals(projectId)
            .filter((l) => l.fromId === entryId && l.type === 'located-in' && (l.fromType ?? 'entry') === 'entry' && (l.toType ?? 'entry') === 'entry' && !l.validity?.until)
            .toArray();
          const places = new Set((await db.loreEntries.where('projectId').equals(projectId).filter((e) => e.category === 'location').primaryKeys()) as string[]);
          await db.loreLinks.bulkDelete(current.filter((l) => places.has(l.toId)).map((l) => l.id));
          if (parentId !== null) {
            const link: LoreLink = { id: createId(), projectId, fromId: entryId, toId: parentId, fromType: 'entry', toType: 'entry', type: 'located-in', fromLabel: '', toLabel: '', createdAt: Date.now() };
            await db.loreLinks.add(link);
          }
        }),

      maps: () => db.worldMaps.where('projectId').equals(projectId).toArray(),
      pins: () => db.mapPins.where('projectId').equals(projectId).toArray(),

      /** Creates a map (`id` null) or changes one. Its size is in its own units; a grid of 0 draws none. */
      saveMap: (id: string | null, input: MapInput) =>
        write(async () => {
          const current = id === null ? undefined : await map(id);
          const name = text(input.name ?? current?.name, 80);
          if (!name) throw new Error('Give the map a name.');
          const placeId = input.placeId !== undefined ? input.placeId : (current?.placeId ?? null);
          if (placeId !== null) await place(placeId, 'The place it is a map of');
          const grid = input.grid ?? current?.grid ?? 10;
          const now = Date.now();
          const saved: WorldMap = {
            id: current?.id ?? createId(),
            projectId,
            name,
            placeId,
            width: positive(input.width, current?.width ?? 100),
            height: positive(input.height, current?.height ?? 100),
            unit: text(input.unit ?? current?.unit, 30),
            grid: typeof grid === 'number' && Number.isFinite(grid) && grid >= 0 ? grid : 0,
            image: current?.image ?? null,
            createdAt: current?.createdAt ?? now,
            updatedAt: now,
          };
          await db.worldMaps.put(saved);
          return saved;
        }),

      /** The map's background image, chosen from the author's own device, or none. Kept in this novel; never sent anywhere. */
      setImage: (id: string, image: string | null) =>
        write(async () => {
          await map(id);
          if (image !== null) {
            if (!/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(image)) throw new Error('That is not an image this app can show.');
            if (image.length > MAP_IMAGE_LIMIT * 1.37) throw new Error(`That image is too large for a map background (more than ${MAP_IMAGE_LIMIT / 1024 / 1024} MB).`);
          }
          await db.worldMaps.update(id, { image, updatedAt: Date.now() });
        }),

      /** Removes a map and its pins. The places themselves are not touched. */
      removeMap: (id: string) =>
        write(async () => {
          await map(id);
          await db.mapPins.where('mapId').equals(id).delete();
          await db.worldMaps.delete(id);
        }),

      /** Puts a place on a map, or moves it there. Coordinates must be numbers; outside the map's edges is allowed, and said. */
      pin: (mapId: string, entryId: string, x: number, y: number) =>
        write(async () => {
          await map(mapId);
          await place(entryId);
          if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Coordinates must be numbers.');
          const existing = await db.mapPins.where('mapId').equals(mapId).filter((p) => p.entryId === entryId).first();
          const now = Date.now();
          const saved: MapPin = { id: existing?.id ?? createId(), projectId, mapId, entryId, x, y, createdAt: existing?.createdAt ?? now, updatedAt: now };
          await db.mapPins.put(saved);
          return saved;
        }),

      /** Takes a place off a map: it stays in the tree, and on other maps. */
      unpin: (mapId: string, entryId: string) =>
        write(async () => {
          await map(mapId);
          await db.mapPins.where('mapId').equals(mapId).filter((p) => p.entryId === entryId).delete();
        }),
    };
  }
  return { forProject };
}

export type PlaceService = ReturnType<typeof createPlaceService>;
export type ProjectPlaces = ReturnType<PlaceService['forProject']>;
