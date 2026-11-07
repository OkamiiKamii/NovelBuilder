import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { remapValidity, type Anchor } from '@/modules/model/validity';
import { PRECISIONS } from '@/modules/timeline/types';
import { ACTIONS_OF, PROGRESS_PRESETS, PROGRESS_SHAPES, type ProgressAction, type ProgressCategory, type ProgressChange, type ProgressShape } from './track';

/** Hooks progression categories and changes into project isolation, duplication, forking and backup. */
export function registerTracker(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'progressCategories',
    remap: (row, mapId) => ({ ...row, characterIds: (Array.isArray(row.characterIds) ? (row.characterIds as string[]) : []).map(mapId) }),
  });
  registry.registerCollection({
    table: 'progressChanges',
    refs: ['entryId', 'categoryId', 'refId'],
    // A change at a chapter the fork has not reached is in the parent's future; changes in story time, or with no time known, come along.
    fork: (rows, reached) => rows.filter((row) => (row.at as Anchor | null)?.kind !== 'node' || reached((row.at as { nodeId: string }).nodeId)),
    remap: (row, mapId) => {
      // An ability is `<systemId>/<itemId>`: the blueprint gets a new id in a copy, the item inside it keeps its own.
      const id = typeof row.abilityId === 'string' && row.abilityId.includes('/') ? row.abilityId : null;
      const abilityId = id ? `${mapId(id.slice(0, id.indexOf('/')))}${id.slice(id.indexOf('/'))}` : null;
      return { ...row, abilityId, at: remapValidity({ from: (row.at as Anchor | null) ?? null, until: null }, mapId)?.from ?? null };
    },
  });
}

export interface CategoryInput {
  name?: string;
  shape?: ProgressShape;
  ladder?: string[];
  characterIds?: string[];
  order?: number;
  archived?: boolean;
}

export interface ChangeInput {
  entryId: string;
  categoryId: string;
  action: ProgressAction;
  subject?: string;
  value?: string;
  refId?: string | null;
  /** An ability of a system blueprint: `<systemId>/<itemId>`. */
  abilityId?: string | null;
  /** Null: before the story. Absent: when is not known. */
  at?: Anchor | null;
  cost?: string;
  note?: string;
}

const text = (value: unknown, max = 500): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const strings = (value: unknown): string[] => [...new Set((Array.isArray(value) ? value : []).map((v) => text(v, 120)).filter(Boolean))].slice(0, 100);

export function createTrackerService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  function forProject(projectId: string) {
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    const mine = async (table: string, id: unknown): Promise<boolean> => typeof id === 'string' && Boolean(id) && ((await db.table(table).get(id)) as { projectId?: string } | undefined)?.projectId === projectId;
    const categories = async () => (await db.progressCategories.where('projectId').equals(projectId).toArray()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const changes = () => db.progressChanges.where('projectId').equals(projectId).toArray();
    async function category(id: string): Promise<ProgressCategory> {
      const found = await db.progressCategories.get(id);
      if (!found || found.projectId !== projectId) throw new Error('That progression category is not in this project.');
      return found;
    }
    async function change(id: string): Promise<ProgressChange> {
      const found = await db.progressChanges.get(id);
      if (!found || found.projectId !== projectId) throw new Error('That change is not in this project.');
      return found;
    }

    /** A point in the story must be a chapter or scene or event of this project, or a date; null is before the story. */
    async function cleanAt(at: unknown): Promise<Anchor | null> {
      if (at === null) return null;
      const a = at as Anchor | undefined;
      if (!a || typeof a !== 'object') return { kind: 'date', when: { precision: 'unknown' } };
      if (a.kind === 'node' && (await mine('chapters', a.nodeId))) return { kind: 'node', nodeId: a.nodeId };
      if (a.kind === 'event' && (await mine('timelineEvents', a.eventId))) return { kind: 'event', eventId: a.eventId };
      if (a.kind === 'date' && PRECISIONS.includes(a.when?.precision)) {
        if (a.when.precision === 'relative' && !(await mine('timelineEvents', a.when.anchorId))) throw new Error('When it happens: the event the date counts from is not in this project.');
        return { kind: 'date', when: a.when };
      }
      throw new Error('When it happens: that chapter, scene or event is not in this project.');
    }

    /** An ability of one of this project's blueprints, by `<systemId>/<itemId>`; null for none. One that is not there is refused. */
    async function abilityOf(id: unknown): Promise<{ name: string } | null> {
      if (!id) return null;
      const [systemId, itemId] = typeof id === 'string' && id.includes('/') ? [id.slice(0, id.indexOf('/')), id.slice(id.indexOf('/') + 1)] : ['', ''];
      const system = systemId ? await db.systems.get(systemId) : undefined;
      const item = system?.projectId === projectId ? system.items.find((i) => i.id === itemId) : undefined;
      if (!item) throw new Error('That ability is not in any of this project’s systems.');
      return { name: item.name };
    }

    /** What the change says, checked against its category's shape. Nothing about the values themselves is judged. */
    async function cleanChange(input: ChangeInput, current?: ProgressChange) {
      if (!(await mine('loreEntries', input.entryId))) throw new Error('That character is not in this project.');
      const cat = await category(input.categoryId);
      if (cat.archived && input.categoryId !== current?.categoryId) throw new Error(`“${cat.name}” is archived: restore it to record changes in it.`);
      if (!ACTIONS_OF[cat.shape].includes(input.action)) throw new Error(`A change in “${cat.name}” is ${ACTIONS_OF[cat.shape].map((a) => (a === 'set' ? 'a value set' : a === 'happen' ? 'something that happened' : a === 'gain' ? 'something gained' : 'something lost')).join(' or ')}.`);
      const refId = input.refId && (await mine('loreEntries', input.refId)) ? input.refId : null;
      const ability = await abilityOf(input.abilityId);
      // Named by its codex entry or ability alone, it keeps that name, so it still says what it was if the record goes.
      const subject = text(input.subject, 120) || (refId ? ((await db.loreEntries.get(refId))?.name ?? '') : (ability?.name ?? ''));
      const value = text(input.value, 120);
      if (cat.shape !== 'value' && !subject && !refId && !ability) throw new Error(cat.shape === 'named' ? 'Say which value changes, such as Strength.' : cat.shape === 'held' ? 'Say what is gained or lost, or choose its codex entry.' : 'Say what happened.');
      if (input.action === 'set' && !value) throw new Error('Say what it is set to.');
      return { entryId: input.entryId, categoryId: cat.id, action: input.action, subject: cat.shape === 'value' ? '' : subject, value: input.action === 'set' ? value : '', refId, abilityId: ability ? (input.abilityId as string) : null, at: await cleanAt('at' in input ? input.at : undefined), cost: text(input.cost), note: text(input.note, 4000) };
    }

    return {
      categories,
      changes,

      /** Creates a category (`id` null) or changes one. Its shape is fixed once changes are recorded in it, so none of them stops making sense. */
      saveCategory: (id: string | null, input: CategoryInput) =>
        write(async () => {
          const all = await categories();
          const current = id === null ? undefined : await category(id);
          const name = text(input.name ?? current?.name, 60);
          if (!name) throw new Error('Give the category a name.');
          const clash = all.find((c) => c.id !== current?.id && c.name.toLowerCase() === name.toLowerCase());
          if (clash) throw new Error(`There is already a category called “${clash.name}”.`);
          const shape = input.shape ?? current?.shape ?? 'held';
          if (!PROGRESS_SHAPES.includes(shape)) throw new Error('That is not a shape a category can have.');
          if (current && shape !== current.shape && (await changes()).some((c) => c.categoryId === current.id)) throw new Error(`“${current.name}” has changes recorded in it, so its shape stays as it is.`);
          const people: string[] = [];
          for (const characterId of strings(input.characterIds ?? current?.characterIds)) if (await mine('loreEntries', characterId)) people.push(characterId);
          const now = Date.now();
          const saved: ProgressCategory = {
            id: current?.id ?? createId(),
            projectId,
            name,
            shape,
            ladder: shape === 'value' ? strings(input.ladder ?? current?.ladder) : [],
            characterIds: people,
            order: typeof input.order === 'number' && Number.isFinite(input.order) ? input.order : (current?.order ?? Math.max(-1, ...all.map((c) => c.order)) + 1),
            ...((input.archived ?? current?.archived) ? { archived: true } : {}),
            createdAt: current?.createdAt ?? now,
            updatedAt: now,
          };
          await db.progressCategories.put(saved);
          return saved;
        }),

      /** Adds one of the offered categories, by name; one already here by that name is returned as it is. */
      addPreset: (name: string) =>
        write(async () => {
          const preset = PROGRESS_PRESETS.find((p) => p.name === name);
          if (!preset) throw new Error('There is no such category to start from.');
          const all = await categories();
          const here = all.find((c) => c.name.toLowerCase() === preset.name.toLowerCase());
          if (here) return here;
          const now = Date.now();
          const saved: ProgressCategory = { id: createId(), projectId, name: preset.name, shape: preset.shape, ladder: [], characterIds: [], order: Math.max(-1, ...all.map((c) => c.order)) + 1, createdAt: now, updatedAt: now };
          await db.progressCategories.add(saved);
          return saved;
        }),

      /** Removes a category with nothing recorded in it. One with changes is archived instead, so nothing recorded is lost. */
      removeCategory: (id: string) =>
        write(async () => {
          const cat = await category(id);
          const used = (await changes()).filter((c) => c.categoryId === id).length;
          if (used) throw new Error(`“${cat.name}” has ${used} ${used === 1 ? 'change' : 'changes'} recorded. Archive it instead: they are kept.`);
          await db.progressCategories.delete(id);
        }),

      /** Records a change. With no time given, its time is "not known": nothing is assumed. */
      record: (input: ChangeInput) =>
        write(async () => {
          const now = Date.now();
          const saved: ProgressChange = { id: createId(), projectId, ...(await cleanChange(input)), createdAt: now, updatedAt: now };
          await db.progressChanges.add(saved);
          return saved;
        }),

      /** Changes a recorded change, worked out from it as stored. */
      update: (id: string, edit: Partial<Omit<ChangeInput, 'entryId'>>) =>
        write(async () => {
          const current = await change(id);
          const next = await cleanChange({ entryId: current.entryId, categoryId: current.categoryId, action: current.action, subject: current.subject, value: current.value, refId: current.refId, abilityId: current.abilityId ?? null, at: current.at, cost: current.cost, note: current.note, ...edit }, current);
          const saved: ProgressChange = { ...current, ...next, updatedAt: Date.now() };
          await db.progressChanges.put(saved);
          return saved;
        }),

      remove: (id: string) =>
        write(async () => {
          await change(id);
          await db.progressChanges.delete(id);
        }),
    };
  }
  return { forProject };
}

export type TrackerService = ReturnType<typeof createTrackerService>;
export type ProjectTracker = ReturnType<TrackerService['forProject']>;
