import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import { removeConnectionsOf } from '@/modules/connections/cascade';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { AFFINITIES, ATTRIBUTE_MAX, NO_SETTINGS, RELATION_CATEGORIES, RELATION_PRESETS, SUGGESTED_ATTRIBUTES, TYPE_PREFIX, typeFor, type Affinity, type AttributeValue, type CharacterRelation, type RelationCategory, type RelationPreset, type RelationSettings, type RelationStage, type RelationType, type StageChanges, type StoryPoint } from './types';
import { calendarFrom } from '@/modules/timeline/calendar';
import { normalizeDate } from '@/modules/timeline/service';

export class RelationNotFoundError extends Error {
  constructor(id: string) {
    super(`Relationship ${id} not found in this project`);
    this.name = 'RelationNotFoundError';
  }
}

/** Hooks relationships into project isolation, duplication and backup. Chapter references inside stages are re-pointed at copies. */
export function registerRelationships(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'characterRelations',
    refs: ['fromId', 'toId'],
    // A relationship is inherited as it stood: stages that begin later have not happened, and one that only begins later does not exist yet.
    fork: (rows, reached) =>
      rows.flatMap((row) => {
        // A change whose chapter is not said is kept with the stage before it; the scene that showed a change is dropped if the copy does not have it.
        const stages = ((row as unknown as CharacterRelation).stages ?? [])
          .filter((stage, i, all) => (stage.startUnknown ? all.slice(0, i).every((s) => s.startUnknown || s.startNodeId === null || reached(s.startNodeId)) : stage.startNodeId === null || reached(stage.startNodeId)))
          .map((stage) => (stage.causeNodeId && !reached(stage.causeNodeId) ? { ...stage, causeNodeId: null } : stage));
        return stages.length ? [{ ...row, stages }] : [];
      }),
    remap: (row, mapId) => ({
      ...row,
      stages: (Array.isArray(row.stages) ? (row.stages as RelationStage[]) : []).map((stage) => ({
        ...stage,
        startNodeId: stage.startNodeId ? mapId(stage.startNodeId) : null,
        ...(stage.causeNodeId ? { causeNodeId: mapId(stage.causeNodeId) } : {}),
        ...(stage.causeEventId ? { causeEventId: mapId(stage.causeEventId) } : {}),
        ...(stage.storyAt?.kind === 'event' ? { storyAt: { ...stage.storyAt, eventId: mapId(stage.storyAt.eventId) } } : {}),
        ...(stage.storyAt?.kind === 'date' && stage.storyAt.when.precision === 'relative' && stage.storyAt.when.anchorId ? { storyAt: { ...stage.storyAt, when: { ...stage.storyAt.when, anchorId: mapId(stage.storyAt.when.anchorId) } } } : {}),
      })),
    }),
  });
  // The novel's own relationship types and the attributes it tracks: one row, copied and backed up with the novel.
  registry.registerCollection({ table: 'relationSettings' });
}

const newStage = (preset: RelationPreset, startNodeId: string | null): RelationStage => ({
  id: createId(), startNodeId, preset: preset.key, category: preset.category, label: preset.key === 'custom' ? '' : preset.label,
  fromRole: preset.fromRole, toRole: preset.toRole, directional: preset.directional, title: '', affinity: 'neutral', event: '', notes: '',
});

/** The wording a stage takes from its type. */
const wordingOf = (preset: RelationPreset): Partial<RelationStage> => ({ preset: preset.key, category: preset.category, label: preset.label, fromRole: preset.fromRole, toRole: preset.toRole, directional: preset.directional });

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type TypeInput = Partial<Omit<RelationType, 'id'>>;

/** Changes to a stage: attributes may be given one way at a time. */
export type StageInput = Omit<StageChanges, 'attributes'> & { attributes?: Record<string, Partial<AttributeValue>> };

export function createRelationshipService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  /** Every operation is bound to one project; ids from another project are treated as not found. */
  function forProject(projectId: string) {
    async function owned(relationId: string): Promise<CharacterRelation> {
      const relation = await db.characterRelations.get(relationId);
      if (!relation || relation.projectId !== projectId) throw new RelationNotFoundError(relationId);
      return relation;
    }
    async function character(entryId: string) {
      const entry = await db.loreEntries.get(entryId);
      if (!entry || entry.projectId !== projectId) throw new Error('That character no longer exists.');
      if (entry.category !== 'character') throw new Error(`${entry.name} is not a character.`);
      return entry;
    }
    /** A stage may start at any volume, arc or chapter of this project; anything else means "from the start". */
    async function validStart(nodeId: string | null | undefined): Promise<string | null> {
      if (!nodeId) return null;
      const node = await db.chapters.get(nodeId);
      return node?.projectId === projectId ? nodeId : null;
    }
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    const save = (relation: CharacterRelation, stages: RelationStage[]) => db.characterRelations.update(relation.id, { stages, updatedAt: Date.now() });
    const settingsRow = async (): Promise<RelationSettings | undefined> => (await db.relationSettings.where('projectId').equals(projectId).toArray())[0];
    /** The novel's settings, filled in: rows from before a field existed read it as empty. */
    const settings = async (): Promise<RelationSettings> => {
      const row = await settingsRow();
      return { id: row?.id ?? createId(), projectId, ...NO_SETTINGS, ...row, types: row?.types ?? [], hidden: row?.hidden ?? [], attributes: row?.attributes ?? [], updatedAt: row?.updatedAt ?? 0 };
    };
    const saveSettings = async (changes: Partial<RelationSettings>) => db.relationSettings.put({ ...(await settings()), ...changes, updatedAt: Date.now() });
    /** A type by its key, built in or the author's own; a missing one of the author's is refused rather than guessed. */
    async function typeOf(key: string): Promise<RelationPreset> {
      const types = (await settings()).types;
      if (key.startsWith(TYPE_PREFIX) && !types.some((t) => `${TYPE_PREFIX}${t.id}` === key)) throw new Error('That relationship type no longer exists.');
      return typeFor(key, types);
    }
    /** Every stage of every relationship that uses a type, given new wording (or Custom, keeping its wording, when the type is deleted). */
    async function restage(key: string, wording: Partial<RelationStage>) {
      for (const relation of await db.characterRelations.where('projectId').equals(projectId).toArray()) {
        if (!relation.stages.some((s) => s.preset === key)) continue;
        await save(relation, relation.stages.map((s) => (s.preset === key ? { ...s, ...wording } : s)));
      }
    }

    async function appendStage(relation: CharacterRelation, startNodeId: string | null, unknown: boolean): Promise<RelationStage> {
      const previous = relation.stages[relation.stages.length - 1];
      const stage: RelationStage = {
        ...newStage(typeFor(previous?.preset ?? 'friends', (await settings()).types), unknown ? null : await validStart(startNodeId)),
        ...(previous ? { preset: previous.preset, category: previous.category, label: previous.label, fromRole: previous.fromRole, toRole: previous.toRole, directional: previous.directional, affinity: previous.affinity, ...(previous.attributes ? { attributes: structuredClone(previous.attributes) } : {}) } : {}),
        ...(unknown ? { startUnknown: true } : {}),
      };
      await save(relation, [...relation.stages, stage]);
      return stage;
    }

    /** An event of this project, or null. */
    async function ownEvent(id: string | null | undefined): Promise<string | null> {
      if (!id) return null;
      const event = await db.timelineEvents.get(id);
      return event?.projectId === projectId ? id : null;
    }

    /** The stages with one changed, every field checked; the others exactly as they were. */
    async function changed(relation: CharacterRelation, stageId: string, changes: StageInput): Promise<RelationStage[]> {
      if (!relation.stages.some((s) => s.id === stageId)) throw new RelationNotFoundError(stageId);
      const start = 'startNodeId' in changes ? await validStart(changes.startNodeId) : undefined;
      const chosen = typeof changes.preset === 'string' ? await typeOf(changes.preset) : null;
      const tracked = (await settings()).attributes;
      for (const [key, value] of Object.entries(changes.attributes ?? {})) {
        const attribute = tracked.find((a) => a.key === key);
        if (!attribute) throw new Error('That attribute is not tracked. Choose to track it first.');
        for (const side of [value.from, value.to]) if (side !== undefined && side !== null && !(Number.isInteger(side) && side >= 0 && side <= ATTRIBUTE_MAX)) throw new Error(`${attribute.label} is given as a whole number from 0 to ${ATTRIBUTE_MAX}.`);
      }
      // When it changed in story time, and what brought it about: only what the author names, and only records that exist.
      let storyAt: StoryPoint | null | undefined;
      if ('storyAt' in changes) {
        const point = changes.storyAt;
        if (!point) storyAt = null;
        else if (point.kind === 'event') {
          if (!(await ownEvent(point.eventId))) throw new Error('That event is not in this novel’s timeline.');
          storyAt = { kind: 'event', eventId: point.eventId };
        } else {
          const calendar = calendarFrom((await db.storyCalendars.where('projectId').equals(projectId).toArray())[0]);
          const when = normalizeDate(point.when, calendar);
          if (when.precision === 'relative' && when.anchorId && !(await ownEvent(when.anchorId))) when.anchorId = null;
          storyAt = when.precision === 'unknown' ? null : { kind: 'date', when };
        }
      }
      if ('causeEventId' in changes && changes.causeEventId && !(await ownEvent(changes.causeEventId))) throw new Error('That event is not in this novel’s timeline.');
      const causeNode = 'causeNodeId' in changes ? await validStart(changes.causeNodeId) : undefined;
      if (changes.causeNodeId && causeNode === null) throw new Error('That chapter or scene is not in this novel.');
      return relation.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        const next = { ...stage };
        if (chosen && chosen.key !== stage.preset) {
          // Choosing a type sets its wording; switching to Custom keeps the current wording to edit.
          next.preset = chosen.key;
          next.category = chosen.category;
          if (chosen.key !== 'custom') Object.assign(next, wordingOf(chosen));
        }
        if (changes.attributes) {
          const attributes = { ...(stage.attributes ?? {}) };
          for (const [key, value] of Object.entries(changes.attributes)) {
            const merged: AttributeValue = { from: value.from === undefined ? (attributes[key]?.from ?? null) : value.from, to: value.to === undefined ? (attributes[key]?.to ?? null) : value.to };
            if (merged.from === null && merged.to === null) delete attributes[key];
            else attributes[key] = merged;
          }
          next.attributes = attributes;
        }
        if (next.preset === 'custom') {
          if (typeof changes.label === 'string') next.label = changes.label.trim();
          if (typeof changes.fromRole === 'string') next.fromRole = changes.fromRole.trim();
          if (typeof changes.toRole === 'string') next.toRole = changes.toRole.trim();
          if (typeof changes.directional === 'boolean') next.directional = changes.directional;
          if (RELATION_CATEGORIES.includes(changes.category as RelationCategory)) next.category = changes.category as RelationCategory;
        }
        if (typeof changes.title === 'string') next.title = changes.title.trim();
        if (typeof changes.event === 'string') next.event = changes.event;
        if (typeof changes.notes === 'string') next.notes = changes.notes;
        if (AFFINITIES.includes(changes.affinity as Affinity)) next.affinity = changes.affinity as Affinity;
        // A chapter given makes the reader's point known; "not said" clears the chapter.
        if (start !== undefined) Object.assign(next, { startNodeId: start, startUnknown: undefined });
        if (changes.startUnknown === true) Object.assign(next, { startNodeId: null, startUnknown: true });
        if (changes.startUnknown === false) delete next.startUnknown;
        if (storyAt !== undefined) next.storyAt = storyAt;
        if ('causeEventId' in changes) next.causeEventId = changes.causeEventId || null;
        if (causeNode !== undefined) next.causeNodeId = causeNode;
        return next;
      });
    }

    return {
      /** The novel's own types, hidden built-in types and tracked attributes. */
      settings,

      /**
       * Makes or changes a relationship type of the novel's own. Its name must
       * be new (no built-in or other type of the novel's has it), and a one-way
       * type needs both roles. Changing a type changes every relationship
       * stage that uses it.
       */
      saveType: (input: TypeInput, typeId?: string) =>
        write(async () => {
          const current = await settings();
          const was = typeId ? current.types.find((t) => t.id === typeId) : undefined;
          if (typeId && !was) throw new Error('That relationship type no longer exists.');
          const label = (input.label ?? was?.label ?? '').trim();
          if (!label) throw new Error('Give the type a name.');
          if (RELATION_PRESETS.some((p) => p.key !== 'custom' && same(p.label, label)) || current.types.some((t) => t.id !== typeId && same(t.label, label))) throw new Error(`There is already a type called “${label}”.`);
          const directional = typeof input.directional === 'boolean' ? input.directional : (was?.directional ?? false);
          const fromRole = (input.fromRole ?? was?.fromRole ?? '').trim();
          const toRole = (input.toRole ?? was?.toRole ?? '').trim();
          if (directional && (!fromRole || !toRole)) throw new Error('A one-way type needs both roles: what the first character is, and what the second is.');
          const category = RELATION_CATEGORIES.includes(input.category as RelationCategory) ? (input.category as RelationCategory) : (was?.category ?? 'custom');
          // A mutual type is the same both ways: one role, or its name.
          const type: RelationType = { id: was?.id ?? createId(), label, category, directional, fromRole: fromRole || label, toRole: directional ? toRole : fromRole || label };
          await saveSettings({ types: was ? current.types.map((t) => (t.id === was.id ? type : t)) : [...current.types, type] });
          if (was) await restage(`${TYPE_PREFIX}${type.id}`, wordingOf(typeFor(`${TYPE_PREFIX}${type.id}`, [type])));
          return type;
        }),

      /** Deletes a type of the novel's own. Relationships that used it keep their wording, as Custom: nothing about them is lost. */
      removeType: (typeId: string) =>
        write(async () => {
          const current = await settings();
          if (!current.types.some((t) => t.id === typeId)) return;
          await saveSettings({ types: current.types.filter((t) => t.id !== typeId) });
          await restage(`${TYPE_PREFIX}${typeId}`, { preset: 'custom' });
        }),

      /** Whether a built-in type is offered when choosing a type. Hiding one changes no relationship that uses it. */
      offerBuiltIn: (presetKey: string, offered: boolean) =>
        write(async () => {
          if (presetKey === 'custom' || !RELATION_PRESETS.some((p) => p.key === presetKey)) return;
          const current = await settings();
          await saveSettings({ hidden: offered ? current.hidden.filter((k) => k !== presetKey) : [...new Set([...current.hidden, presetKey])] });
        }),

      /** Starts tracking an attribute: a suggested one by its key, or one of the author's own by its name. */
      trackAttribute: (keyOrLabel: string) =>
        write(async () => {
          const current = await settings();
          const suggested = SUGGESTED_ATTRIBUTES.find((a) => a.key === keyOrLabel || same(a.label, keyOrLabel));
          const label = suggested?.label ?? keyOrLabel.trim();
          if (!label) throw new Error('Give the attribute a name.');
          const existing = current.attributes.find((a) => same(a.label, label));
          if (existing) throw new Error(`“${existing.label}” is already tracked.`);
          const attribute = suggested ?? { key: `own-${createId()}`, label };
          await saveSettings({ attributes: [...current.attributes, attribute] });
          return attribute;
        }),

      /** Stops tracking an attribute. Values already given are kept in the stages; a suggested attribute tracked again shows them again. */
      untrackAttribute: (key: string) =>
        write(async () => {
          const current = await settings();
          await saveSettings({ attributes: current.attributes.filter((a) => a.key !== key) });
        }),
      list: () => db.characterRelations.where('projectId').equals(projectId).toArray(),

      async get(relationId: string): Promise<CharacterRelation | undefined> {
        const relation = await db.characterRelations.get(relationId);
        return relation?.projectId === projectId ? relation : undefined;
      },

      /** Links two characters. For a directional type, the first is the first-named role (the Parent, the Mentor). */
      create: (fromId: string, toId: string, presetKey = 'friends') =>
        write(async () => {
          if (fromId === toId) throw new Error('Pick two different characters.');
          await character(fromId);
          await character(toId);
          const involving = await db.characterRelations.where('fromId').equals(fromId).or('toId').equals(fromId).toArray();
          const existing = involving.find((r) => r.fromId === toId || r.toId === toId);
          if (existing) throw new Error('These two characters already have a relationship. Add a stage to it to record a change.');
          const now = Date.now();
          const relation: CharacterRelation = { id: createId(), projectId, fromId, toId, stages: [newStage(await typeOf(presetKey), null)], createdAt: now, updatedAt: now };
          await db.characterRelations.add(relation);
          return relation;
        }),

      /**
       * Adds a new stage: how things stand from `startNodeId` onward, or from a
       * point in the book not said (`unknown`). It begins as things stood (the
       * same type, feeling and tracked attributes) for the author to change;
       * when and why it changed are its own, so they start empty.
       */
      addStage: (relationId: string, startNodeId: string | null, options: { unknown?: boolean } = {}) => write(async () => appendStage(await owned(relationId), startNodeId, options.unknown === true)),

      /**
       * Records a change: a new stage, from a point in the book (or one not
       * said), holding the changes given. Every earlier stage is kept exactly
       * as it was, so how the relationship stood before can always be read.
       */
      recordChange: (relationId: string, at: { nodeId?: string | null; unknown?: boolean }, changes: StageInput) =>
        write(async () => {
          const stage = await appendStage(await owned(relationId), at.nodeId ?? null, at.unknown === true);
          const relation = await owned(relationId);
          await save(relation, await changed(relation, stage.id, changes));
          return (await owned(relationId)).stages.find((s) => s.id === stage.id)!;
        }),

      /**
       * Changes one stage: a correction to it. Tracked attributes are given as
       * numbers from 0 to the maximum, or null for "not said", one way or
       * both; one that is not tracked, or a value outside the scale, is
       * refused with the reason. When and why it changed are the author's:
       * an event or chapter that does not exist is refused, never guessed.
       */
      updateStage: (relationId: string, stageId: string, changes: StageInput) =>
        write(async () => {
          const relation = await owned(relationId);
          await save(relation, await changed(relation, stageId, changes));
        }),

      /** Moves a stage whose chapter is not said earlier or later among the others; a stage at a chapter keeps its place. */
      moveStage: (relationId: string, stageId: string, by: -1 | 1) =>
        write(async () => {
          const relation = await owned(relationId);
          const i = relation.stages.findIndex((s) => s.id === stageId);
          const j = i + by;
          if (i < 0 || j < 0 || j >= relation.stages.length || !relation.stages[i].startUnknown) return;
          const stages = [...relation.stages];
          [stages[i], stages[j]] = [stages[j], stages[i]];
          await save(relation, stages);
        }),

      /** Removes one stage of the history. The last remaining stage cannot be removed; delete the relationship instead. */
      removeStage: (relationId: string, stageId: string) =>
        write(async () => {
          const relation = await owned(relationId);
          if (relation.stages.length <= 1) throw new Error('A relationship needs at least one stage. Delete the relationship instead.');
          await save(relation, relation.stages.filter((s) => s.id !== stageId));
        }),

      /** Swaps who is who (the Mentor becomes the Student and the Student the Mentor), across the whole history. */
      reverse: (relationId: string) =>
        write(async () => {
          const relation = await owned(relationId);
          // The roles stay in their slots; the two characters trade places.
          await db.characterRelations.update(relationId, { fromId: relation.toId, toId: relation.fromId, updatedAt: Date.now() });
        }),

      remove: (relationId: string) =>
        write(async () => {
          await owned(relationId);
          await removeConnectionsOf(db, [relationId]);
          await db.characterRelations.delete(relationId);
        }),
    };
  }

  return { forProject };
}

export type RelationshipService = ReturnType<typeof createRelationshipService>;
export type ProjectRelationships = ReturnType<RelationshipService['forProject']>;
