import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import { removeConnectionsOf } from '@/modules/connections/cascade';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { normalizeCover } from '@/modules/projects/service';
import { cleanUses, mergeUses, remapUses } from './capabilities';
import { isFieldType, resolveCategories, viewFields } from './schema';
import { wordingOf } from '@/modules/connections/types';
import { remapValidity, type Validity } from '@/modules/model/validity';
import { CUSTOM_COLORS, FIELD_LIMITS, isEntryLink, LORE_CATEGORIES, type Category, type CategorySchema, type FieldDef, type FieldType, type LoreCategory, type LoreEntry, type LoreField, type LoreLink, type RelatedEntry, type Template, type TemplateData } from './types';

export class EntryNotFoundError extends Error {
  constructor(id: string) {
    super(`Entry ${id} not found in this project`);
    this.name = 'EntryNotFoundError';
  }
}

export class InvalidLinkError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidLinkError';
  }
}

export type CategoryChanges = Partial<Pick<Category, 'name' | 'singular' | 'color' | 'fields' | 'archived' | 'order' | 'graph' | 'uses'>>;
export type EntryChanges = Partial<Pick<LoreEntry, 'name' | 'category' | 'summary' | 'description' | 'image' | 'notes' | 'tags' | 'fields'>>;

/** Hooks the codex tables into project isolation, duplication, backup and stats. */
export function registerCodex(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'loreEntries',
    // A field that links to other entries follows them into the copy. Whether it is a link is often said only by the
    // category (a field of the author's own kind), so every value is read line by line, and only a line that is the id
    // of one of the novel's records is changed.
    remap: (row, mapId) => ({ ...row, fields: (Array.isArray(row.fields) ? (row.fields as LoreField[]) : []).map((f) => (typeof f.value === 'string' && f.value ? { ...f, value: f.value.split('\n').map(mapId).join('\n') } : f)) }),
  });
  // A kind of record from a file is cleaned as a saved one is, so no archive can bring in a field the app cannot show.
  // What a later version added to it, its fields or its settings rides along beside what is cleaned, as on any record.
  registry.registerCollection({ table: 'loreSchemas', remap: (row) => ({ ...row, ...restoredKind(row) }) });
  registry.registerCollection({
    table: 'loreLinks',
    refs: ['fromId', 'toId'],
    // An ability is `<systemId>/<itemId>`: the blueprint gets a new id in a copy, the item inside it keeps its own.
    remap: (row, mapId) => {
      const ability = (id: unknown) => (typeof id === 'string' && id.includes('/') ? `${mapId(id.slice(0, id.indexOf('/')))}${id.slice(id.indexOf('/'))}` : id);
      return {
        ...row,
        ...(row.fromType === 'ability' ? { fromId: ability(row.fromId) } : {}),
        ...(row.toType === 'ability' ? { toId: ability(row.toId) } : {}),
        // When it holds may be tied to chapters and events of the project.
        ...(row.validity ? { validity: remapValidity(row.validity as Validity, mapId) } : {}),
      };
    },
  });
  registry.registerStats(async (db, projectId) => ({
    // Characters are counted by the Character Library, not here.
    counts: { 'codex entries': await db.loreEntries.where('projectId').equals(projectId).filter((entry) => entry.category !== 'character').count() },
  }));
}

const cleanTags = (tags: unknown): string[] =>
  Array.isArray(tags) ? [...new Set(tags.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean))] : [];

const cleanOptions = (options: unknown): string[] => [...new Set((Array.isArray(options) ? options : []).map((o) => (typeof o === 'string' ? o.trim().slice(0, FIELD_LIMITS.name) : '')).filter(Boolean))].slice(0, FIELD_LIMITS.options);
const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined);

/** Keeps the author's fields as written; only rows that are completely empty are dropped. */
const cleanFields = (fields: unknown): LoreField[] =>
  (Array.isArray(fields) ? fields : []).flatMap((field: Partial<LoreField> | null) => {
    const key = typeof field?.key === 'string' ? field.key.trim() : '';
    const value = typeof field?.value === 'string' ? field.value : '';
    if (!key && !value.trim() && !field?.defId) return [];
    return [{
      id: typeof field?.id === 'string' && field.id ? field.id : createId(),
      key,
      value,
      ...(isFieldType(field?.type) ? { type: field.type } : {}),
      ...(field?.options?.length ? { options: cleanOptions(field.options) } : {}),
      ...(typeof field?.defId === 'string' && field.defId ? { defId: field.defId } : {}),
    }];
  });

/**
 * A field set as stored: whatever is given, each field has an id, a name, a
 * known type and clean choices; the rules a field may carry (required, help,
 * a number range, the kind of record a link points at) are kept only where
 * they fit its type. Custom fields can never reach past these shapes.
 */
const cleanDefs = (defs: unknown): FieldDef[] =>
  (Array.isArray(defs) ? defs : []).map((def: Partial<FieldDef> | null) => {
    const type: FieldType = isFieldType(def?.type) ? def.type : 'text';
    const [min, max] = type === 'number' ? [finite(def?.min), finite(def?.max)] : [undefined, undefined];
    const help = typeof def?.help === 'string' ? def.help.trim().slice(0, FIELD_LIMITS.help) : '';
    return {
      id: typeof def?.id === 'string' && def.id ? def.id : createId(),
      name: ((typeof def?.name === 'string' && def.name.trim()) || 'Untitled field').slice(0, FIELD_LIMITS.name),
      type,
      options: cleanOptions(def?.options),
      ...(def?.archived ? { archived: true } : {}),
      ...(def?.required === true ? { required: true } : {}),
      ...(help ? { help } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined && (min === undefined || max >= min) ? { max } : {}),
      ...((type === 'reference' || type === 'references') && typeof def?.target === 'string' && def.target ? { target: def.target } : {}),
    };
  });

/** A stored category's own parts, whatever a file held: names, a colour, a place in the order, a clean field set. */
const cleanKind = (row: Record<string, unknown>) => {
  const fields = cleanDefs(row.fields);
  return {
    name: ((typeof row.name === 'string' && row.name.trim()) || 'Untitled category').slice(0, FIELD_LIMITS.name),
    singular: ((typeof row.singular === 'string' && row.singular.trim()) || 'Entry').slice(0, FIELD_LIMITS.name),
    color: typeof row.color === 'string' && row.color.length <= 32 ? row.color : '#5c6370',
    order: finite(row.order) ?? 9999,
    graph: row.graph === false ? false : undefined,
    fields,
    uses: cleanUses(row.uses, fields),
  };
};

/** The parts of a value this version does not know: kept beside the cleaned ones when a category comes from a file. */
const unknownOf = (value: unknown, known: readonly string[]): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => !known.includes(key))) : {};
const FIELD_KEYS = ['id', 'name', 'type', 'options', 'archived', 'required', 'help', 'min', 'max', 'target'] as const;
const USES_PARTS: Record<string, readonly string[]> = { timeline: ['start', 'end'], map: ['x', 'y'], ownership: ['type', 'field'] };
const USES_KEYS = [...Object.keys(USES_PARTS), 'rank', 'graphLabel', 'graphLinks', 'tree'];

/** A category from a backup file or a copy: cleaned as a saved one is, with whatever a later version added kept beside it. */
const restoredKind = (row: Record<string, unknown>) => {
  const clean = cleanKind(row);
  const defs = Array.isArray(row.fields) ? row.fields : [];
  const raw = (row.uses && typeof row.uses === 'object' ? row.uses : {}) as Record<string, unknown>;
  const settings: Record<string, unknown> = { ...unknownOf(raw, USES_KEYS), ...clean.uses };
  for (const [part, keys] of Object.entries(USES_PARTS)) if (settings[part]) settings[part] = { ...unknownOf(raw[part], keys), ...(settings[part] as object) };
  return { ...clean, fields: clean.fields.map((def, i) => ({ ...unknownOf(defs[i], FIELD_KEYS), ...def })), uses: Object.keys(settings).length ? settings : undefined };
};

/** Entries related to `entryId`, each with this side's wording of the relationship. */
export function relatedTo(entryId: string, entries: LoreEntry[], links: LoreLink[]): RelatedEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return links
    .flatMap((link): RelatedEntry[] => {
      const outgoing = link.fromId === entryId;
      if (!outgoing && link.toId !== entryId) return [];
      const entry = byId.get(outgoing ? link.toId : link.fromId);
      if (!entry || !isEntryLink(link)) return [];
      // A typed link ("Member of") reads in the kind's words where the author wrote none; each side keeps its own.
      const { forward, backward } = wordingOf(link);
      return [{ linkId: link.id, entry, label: outgoing ? forward : backward, theirLabel: outgoing ? backward : forward }];
    })
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name));
}

/**
 * REFERENCE ISOLATION RULE
 * The codex is the author's reference shelf. This service writes only the
 * codex tables (plus the project's "last edited" time and totals). Nothing
 * here reads or writes manuscript text, and nothing here may ever be made
 * to: lore never writes itself into the story.
 */
export function createCodexService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  /** Every operation is bound to one project; ids from another project are treated as not found. */
  function forProject(projectId: string) {

    async function owned(entryId: string): Promise<LoreEntry> {
      const entry = await db.loreEntries.get(entryId);
      if (!entry || entry.projectId !== projectId) throw new EntryNotFoundError(entryId);
      return entry;
    }

    async function ownedLink(linkId: string): Promise<LoreLink> {
      const link = await db.loreLinks.get(linkId);
      if (!link || link.projectId !== projectId) throw new InvalidLinkError('That link no longer exists.');
      return link;
    }

    const linksOf = (entryId: string) => db.loreLinks.where('fromId').equals(entryId).or('toId').equals(entryId);

    const categories = async (): Promise<Category[]> => resolveCategories(await db.loreSchemas.where('projectId').equals(projectId).toArray());
    async function categoryOf(key: string): Promise<Category> {
      const category = (await categories()).find((c) => c.key === key);
      if (!category) throw new Error('Unknown category.');
      return category;
    }

    const write = <T>(task: () => Promise<T>): Promise<T> =>
      // All tables are in scope because refreshing project totals reads every module's counts.
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });

    return {
      list: () => db.loreEntries.where('projectId').equals(projectId).toArray(),
      /** Links between two entries. Connections to events, chapters, threads or abilities are not the codex's to list. */
      links: async () => (await db.loreLinks.where('projectId').equals(projectId).toArray()).filter(isEntryLink),

      async get(entryId: string): Promise<LoreEntry | undefined> {
        const entry = await db.loreEntries.get(entryId);
        return entry?.projectId === projectId ? entry : undefined;
      },

      create: (category: LoreCategory, name?: string) =>
        write(async () => {
          const kind = await categoryOf(category);
          if (kind.archived) throw new Error(`${kind.name} is archived. Restore it to add entries.`);
          const now = Date.now();
          const entry: LoreEntry = {
            id: createId(),
            projectId,
            category,
            name: name?.trim() || `New ${kind.singular.toLowerCase()}`,
            summary: '',
            description: '',
            image: null,
            notes: '',
            tags: [],
            // The category's field set appears on the entry by itself; only values the author writes are stored.
            fields: [],
            createdAt: now,
            updatedAt: now,
          };
          await db.loreEntries.add(entry);
          return entry;
        }),

      update: (entryId: string, changes: EntryChanges) =>
        write(async () => {
          await owned(entryId);
          const next: EntryChanges & { updatedAt: number } = { updatedAt: Date.now() };
          if (changes.name !== undefined) next.name = changes.name.trim() || 'Untitled entry';
          if (typeof changes.category === 'string' && (await categories()).some((c) => c.key === changes.category)) next.category = changes.category;
          if (changes.summary !== undefined) next.summary = changes.summary;
          if (changes.description !== undefined) next.description = changes.description;
          if (changes.notes !== undefined) next.notes = changes.notes;
          if (changes.image !== undefined) next.image = normalizeCover(changes.image);
          if (changes.tags !== undefined) next.tags = cleanTags(changes.tags);
          if (changes.fields !== undefined) next.fields = cleanFields(changes.fields);
          await db.loreEntries.update(entryId, next);
        }),

      /** Sets this entry's value for one field of its category. Based on the entry as stored, so quick edits never overwrite each other. */
      setFieldValue: (entryId: string, defId: string, value: string) =>
        write(async () => {
          const entry = await owned(entryId);
          const category = await categoryOf(entry.category);
          const slot = viewFields(entry, category).category.find((c) => c.def.id === defId);
          if (!slot) throw new Error('That field is not part of this category.');
          const stored: LoreField = { id: slot.field?.id ?? createId(), key: slot.def.name, value, type: slot.def.type, defId };
          const fields = slot.field ? entry.fields.map((f) => (f.id === slot.field!.id ? stored : f)) : [...entry.fields, stored];
          await db.loreEntries.update(entryId, { fields, updatedAt: Date.now() });
        }),

      /** Replaces the fields that belong to this entry alone. Values for the category's fields, current or archived, are left as they are. */
      setOwnFields: (entryId: string, own: LoreField[]) =>
        write(async () => {
          const entry = await owned(entryId);
          const view = viewFields(entry, await categoryOf(entry.category));
          const kept = new Set([...view.category.flatMap((c) => c.field?.id ?? []), ...view.archived.map((a) => a.field.id)]);
          const mine = cleanFields(own).map(({ defId: _defId, ...field }) => field).filter((f) => !kept.has(f.id));
          await db.loreEntries.update(entryId, { fields: [...entry.fields.filter((f) => kept.has(f.id)), ...mine], updatedAt: Date.now() });
        }),

      // ----- Categories and their field sets -----

      /** This project's categories, built-in and custom, each with its field set. */
      categories,

      /**
       * Creates a category (`key` null) or changes one. Fields are never
       * removed by this: a field left out of `fields` is kept, archived, so
       * every value entries hold for it survives and can be restored.
       */
      saveCategory: (key: string | null, edit: CategoryChanges | ((current: Category) => CategoryChanges)) =>
        write(async () => {
          const all = await categories();
          const rows = await db.loreSchemas.where('projectId').equals(projectId).toArray();
          const current = key === null ? undefined : all.find((c) => c.key === key);
          if (key !== null && !current) throw new Error('Unknown category.');
          // A function is given the category as stored right now, so quick edits in a row build on each other.
          const changes = typeof edit === 'function' ? (current ? edit(current) : {}) : edit;
          const row = current ? rows.find((r) => r.key === current.key) : undefined;
          const now = Date.now();

          const name = (changes.name ?? current?.name ?? '').trim();
          if (!name) throw new Error('Give the category a name.');
          const clash = all.find((c) => c.key !== current?.key && c.name.trim().toLowerCase() === name.toLowerCase());
          if (clash) throw new Error(`There is already a category called “${clash.name}”.`);

          let fields = current?.fields ?? [];
          if (changes.fields !== undefined) {
            // A link may only be limited to a category that exists.
            const next = cleanDefs(changes.fields).map((def) => (def.target && !all.some((c) => c.key === def.target) ? { ...def, target: undefined } : def));
            if (next.filter((d) => !d.archived).length > FIELD_LIMITS.fields) throw new Error(`A category can have at most ${FIELD_LIMITS.fields} fields.`);
            const dropped = fields.filter((def) => !next.some((n) => n.id === def.id));
            fields = [...next, ...dropped.map((def) => ({ ...def, archived: true }))];
          }
          // Which fields the views read: only fields the category has, so a setting can never point outside it.
          const uses = cleanUses(changes.uses !== undefined ? changes.uses : current?.uses, fields);
          const saved: CategorySchema = {
            id: row?.id ?? createId(),
            projectId,
            key: current?.key ?? `custom-${createId()}`,
            name,
            singular: (changes.singular ?? current?.singular ?? '').trim() || name,
            color: changes.color || current?.color || CUSTOM_COLORS[all.filter((c) => !c.builtin).length % CUSTOM_COLORS.length],
            builtin: current?.builtin ?? false,
            order: changes.order ?? current?.order ?? Math.max(-1, ...all.map((c) => c.order)) + 1,
            ...((changes.archived ?? current?.archived) && !(current?.builtin ?? false) ? { archived: true } : {}),
            ...((changes.graph ?? current?.graph) === false ? { graph: false } : {}),
            fields,
            ...(uses ? { uses } : {}),
            createdAt: row?.createdAt ?? now,
            updatedAt: now,
          };
          await db.loreSchemas.put(saved);
          return saved as Category;
        }),

      /** The project's current categories and fields as template data (archived ones left out). */
      async schemaSnapshot(): Promise<TemplateData> {
        return {
          categories: (await categories()).filter((c) => !c.archived).map(({ key, name, singular, color, builtin, fields, uses }) => ({ key, name, singular, color, builtin, fields: fields.filter((f) => !f.archived), ...(uses ? { uses } : {}) })),
        };
      },

      /**
       * Adds a template's categories and fields to this project. It only ever
       * adds: a category or field that already exists (by name) is left
       * exactly as it is, and nothing is removed or retyped.
       */
      applyTemplate: (template: TemplateData) =>
        write(async () => {
          const rows = await db.loreSchemas.where('projectId').equals(projectId).toArray();
          let all = resolveCategories(rows);
          const now = Date.now();
          const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
          const matching = (incoming: TemplateData['categories'][number]) => (incoming.builtin && LORE_CATEGORIES.includes(incoming.key as never) ? all.find((c) => c.key === incoming.key) : all.find((c) => same(c.name, incoming.name)));
          // The key each of the template's categories has here, in order; and, where a template key names just one of them, that key's here,
          // so a link limited to another of the template's categories points at the right one.
          const incomingAll = template.categories ?? [];
          const here = incomingAll.map((incoming) => matching(incoming)?.key ?? `custom-${createId()}`);
          const keys = new Map<string, string>();
          incomingAll.forEach((incoming, i) => {
            if (incoming.key && incomingAll.filter((x) => x.key === incoming.key).length === 1) keys.set(incoming.key, here[i]);
          });
          const known = (key: string) => all.some((c) => c.key === key) || here.includes(key);
          for (const [index, incoming] of incomingAll.entries()) {
            const target = matching(incoming);
            const cleaned = cleanDefs(incoming.fields);
            const fresh = cleaned.map((def) => {
              const limitedTo = def.target ? (keys.get(def.target) ?? def.target) : undefined;
              return { ...def, id: createId(), archived: undefined, target: limitedTo && known(limitedTo) ? limitedTo : undefined };
            });
            if (!target && !incoming.name?.trim()) continue;
            const base: Category = target ?? { key: here[index], name: incoming.name.trim(), singular: incoming.singular?.trim() || incoming.name.trim(), color: incoming.color || CUSTOM_COLORS[all.filter((c) => !c.builtin).length % CUSTOM_COLORS.length], builtin: false, order: Math.max(-1, ...all.map((c) => c.order)) + 1, fields: [] };
            const fields = [...base.fields, ...fresh.filter((def) => !base.fields.some((existing) => same(existing.name, def.name)))];
            // The template's view settings, pointed at the fields as they are here (one already here by that name, or the one just added), and only where nothing is set yet.
            const idOf = (id: string) => {
              const i = cleaned.findIndex((d) => d.id === id);
              return i < 0 ? undefined : (base.fields.find((existing) => same(existing.name, fresh[i].name)) ?? fresh[i]).id;
            };
            const uses = mergeUses(base.uses, remapUses(incoming.uses, idOf));
            if (target && fields.length === base.fields.length && JSON.stringify(uses) === JSON.stringify(base.uses)) continue; // nothing new for this category
            const row = rows.find((r) => r.key === base.key);
            const saved: CategorySchema = { ...base, fields, ...(uses ? { uses } : {}), id: row?.id ?? createId(), projectId, createdAt: row?.createdAt ?? now, updatedAt: now };
            await db.loreSchemas.put(saved);
            if (!row) rows.push(saved);
            else Object.assign(row, saved);
            all = resolveCategories(rows);
          }
          return all;
        }),

      /** Deletes an entry with every link and relationship to or from it. The entries on the other end are not modified. */
      remove: (entryId: string) =>
        write(async () => {
          await owned(entryId);
          await linksOf(entryId).delete();
          // A character's relationships go with them; the other character in each is left untouched.
          const relations = db.characterRelations.where('fromId').equals(entryId).or('toId').equals(entryId);
          await removeConnectionsOf(db, await relations.primaryKeys());
          await relations.delete();
          // …and so does what the character profile keeps about them.
          for (const table of ['characterProfiles', 'characterSecrets', 'characterNotes', 'characterHistory', 'progressChanges', 'mapPins']) await db.table(table).where('entryId').equals(entryId).delete();
          // A journey keeps what it says without whoever or wherever is gone.
          for (const journey of await db.journeys.where('projectId').equals(projectId).toArray()) {
            if (journey.travellerIds.includes(entryId) || journey.fromId === entryId || journey.toId === entryId || journey.via.includes(entryId)) await db.journeys.update(journey.id, { travellerIds: journey.travellerIds.filter((t) => t !== entryId), fromId: journey.fromId === entryId ? null : journey.fromId, toId: journey.toId === entryId ? null : journey.toId, via: journey.via.filter((v) => v !== entryId) });
          }
          // A map of a place that goes is kept, as a map of the whole world.
          for (const map of await db.worldMaps.where('projectId').equals(projectId).filter((m) => m.placeId === entryId).toArray()) await db.worldMaps.update(map.id, { placeId: null });
          // A change elsewhere that names it (a sword gained) keeps its words, and stops linking to it.
          for (const change of await db.progressChanges.where('projectId').equals(projectId).filter((c) => c.refId === entryId).toArray()) await db.progressChanges.update(change.id, { refId: null });
          await db.loreEntries.delete(entryId);
        }),

      /** Relates two entries. Each will list the other; `label` is the first entry's wording. */
      link: (entryId: string, otherId: string, label = '') =>
        write(async () => {
          if (entryId === otherId) throw new InvalidLinkError('An entry cannot be linked to itself.');
          await owned(entryId);
          await owned(otherId);
          // Two entries have one plain link; typed connections between them ("owns", "created by") are separate.
          const existing = (await linksOf(entryId).toArray()).find((l) => !l.type && isEntryLink(l) && (l.fromId === otherId || l.toId === otherId));
          if (existing) throw new InvalidLinkError('These entries are already linked.');
          const link: LoreLink = { id: createId(), projectId, fromId: entryId, toId: otherId, fromLabel: label.trim(), toLabel: '', createdAt: Date.now() };
          await db.loreLinks.add(link);
          return link;
        }),

      /** Sets how `entryId` describes one of its links. */
      labelLink: (linkId: string, entryId: string, label: string) =>
        write(async () => {
          const link = await ownedLink(linkId);
          if (link.fromId !== entryId && link.toId !== entryId) throw new InvalidLinkError('That link does not belong to this entry.');
          await db.loreLinks.update(linkId, link.fromId === entryId ? { fromLabel: label.trim() } : { toLabel: label.trim() });
        }),

      /** Removes the relationship from both entries. */
      unlink: (linkId: string) =>
        write(async () => {
          await ownedLink(linkId);
          await db.loreLinks.delete(linkId);
        }),
    };
  }

  return { forProject };
}

export type CodexService = ReturnType<typeof createCodexService>;
export type ProjectCodex = ReturnType<CodexService['forProject']>;

/**
 * Templates the author has saved. They are not tied to a project: they sit
 * alongside the library so any new project can start from one.
 */
export function createTemplateService(db: NovelDB) {
  return {
    list: async (): Promise<Template[]> => (await db.templates.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    async save(name: string, description: string, data: TemplateData): Promise<Template> {
      if (!name.trim()) throw new Error('Give the template a name.');
      const template: Template = { id: createId(), name: name.trim(), description: description.trim(), categories: data.categories, createdAt: Date.now() };
      await db.templates.add(template);
      return template;
    },
    remove: (templateId: string) => db.templates.delete(templateId),
  };
}
