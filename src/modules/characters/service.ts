import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { displayValue, isFieldType } from '@/modules/codex/schema';
import type { CodexService } from '@/modules/codex/service';
import { isEntryLink, type FieldType, type LoreEntry, type LoreField } from '@/modules/codex/types';
import { peopleOf } from './knowledge';
import { BUILTIN_TEMPLATES, sectionsOf, slug } from './templates';
import { AWARENESS, KNOWLEDGE, type CharacterHistory, type CharacterNote, type CharacterProfile, type CharacterSecret, type CharacterTemplate, type Knowledge, type KnowledgeNeed, type KnowledgeRecord, type Section } from './types';

/** Hooks the character tables into project isolation, copying, backup and sync. Each row points at its character by the entry's id. */
export function registerCharacters(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'characterProfiles',
    refs: ['entryId'],
    // Statuses are kept per codex link, by the link's id.
    remap: (row, mapId) => ({ ...row, linkStatus: Object.fromEntries(Object.entries((row.linkStatus ?? {}) as Record<string, string>).map(([linkId, status]) => [mapId(linkId), status])) }),
  });
  registry.registerCollection({
    table: 'characterSecrets',
    refs: ['entryId', 'knows', 'suspects', 'unaware', 'readerNodeId', 'firstNodeId', 'revealNodeId', 'revealEventId', 'nodeIds', 'threadIds'],
    // Knowledge records and marks name characters, chapters and events inside the row.
    remap: (row, mapId) => {
      const id = (value: string | null) => (value ? mapId(value) : null);
      const records = ((row.records ?? []) as KnowledgeRecord[]).map((r) => ({ ...r, characterId: mapId(r.characterId), nodeId: id(r.nodeId), eventId: id(r.eventId), fromId: id(r.fromId) }));
      const needs = ((row.needs ?? []) as KnowledgeNeed[]).map((n) => ({ ...n, characterId: mapId(n.characterId), nodeId: id(n.nodeId), eventId: id(n.eventId) }));
      return { ...row, records, needs };
    },
    // A timeline forked at a chapter starts without what is recorded only in the chapters after it.
    fork: (rows, reached) => rows.map((row) => ({ ...row, records: ((row.records ?? []) as KnowledgeRecord[]).filter((r) => !r.nodeId || reached(r.nodeId)), needs: ((row.needs ?? []) as KnowledgeNeed[]).filter((n) => !n.nodeId || reached(n.nodeId)) })),
  });
  registry.registerCollection({ table: 'characterNotes', refs: ['entryId', 'nodeIds'] });
  registry.registerCollection({ table: 'characterHistory', refs: ['entryId', 'nodeId'], optional: true });
  registry.registerCollection({ table: 'characterTemplates' });
  registry.registerStats(async (db, projectId) => ({ counts: { characters: await db.loreEntries.where('projectId').equals(projectId).filter((entry) => entry.category === 'character').count() } }));
}

export class NotACharacterError extends Error {
  constructor() {
    super('That character is not in this project.');
    this.name = 'NotACharacterError';
  }
}

export interface NewCharacter {
  name: string;
  epithet?: string;
  roles?: string[];
  summary?: string;
  image?: string | null;
  templateId?: string;
}
export type IdentityChanges = Partial<{ name: string; summary: string; epithet: string; aliases: string[]; roles: string[]; status: string; image: string | null; focal: { x: number; y: number }; tags: string[] }>;
export type FieldChanges = Partial<Pick<LoreField, 'key' | 'value' | 'type' | 'options'>>;
export type SecretChanges = Partial<Omit<CharacterSecret, 'id' | 'projectId' | 'entryId' | 'records' | 'needs' | 'createdAt' | 'updatedAt'>>;
export type RecordChanges = Partial<Omit<KnowledgeRecord, 'id'>>;
export type NeedChanges = Partial<Omit<KnowledgeNeed, 'id'>>;
export type NoteChanges = Partial<Pick<CharacterNote, 'title' | 'content' | 'tags' | 'pinned' | 'nodeIds'>>;

/** What refers to a character, for telling the author before they delete one. */
export interface References {
  chapters: number;
  relationships: number;
  events: number;
  threads: number;
  links: number;
  sheets: number;
  snapshots: number;
  secrets: number;
  /** Other characters' secrets that name this one: as knowing, suspecting or unaware, in a knowledge record, or as who told someone. */
  inSecrets: number;
  notes: number;
}

const clean = (list: unknown): string[] => [...new Set((Array.isArray(list) ? list : []).map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean))];
const short = (text: string): string => (text.length > 90 ? `${text.slice(0, 89)}…` : text).replace(/\s+/g, ' ');
/** Edits to the same thing within this long are one line of history, from the first value to the last. */
const SAME_EDIT_MS = 10 * 60 * 1000;

export function createCharacterService(db: NovelDB, codex: CodexService, onChanged: (projectId: string) => Promise<unknown> | void) {
  return {
    /** The layouts that come with the app. */
    builtinTemplates: BUILTIN_TEMPLATES,

    forProject(projectId: string) {
      const lore = codex.forProject(projectId);
      const write = async <T>(task: () => Promise<T>): Promise<T> => {
        const result = await db.transaction('rw', db.tables, task);
        await onChanged(projectId);
        return result;
      };
      async function character(entryId: string): Promise<LoreEntry> {
        const entry = await db.loreEntries.get(entryId);
        if (!entry || entry.projectId !== projectId || entry.category !== 'character') throw new NotACharacterError();
        return entry;
      }
      const stored = async (entryId: string): Promise<CharacterProfile | undefined> => (await db.characterProfiles.where('entryId').equals(entryId).toArray()).find((p) => p.projectId === projectId);
      /** The profile of a character that has none stored yet (one made before profiles existed, or by an import): the general layout, empty. Nothing is written by asking. */
      const fresh = (entry: Pick<LoreEntry, 'id' | 'createdAt'>, template: CharacterTemplate = BUILTIN_TEMPLATES[0]): CharacterProfile => ({
        id: `profile-${entry.id}`, projectId, entryId: entry.id, epithet: '', aliases: [], roles: [], status: '', archived: false, focal: { x: 50, y: 30 }, order: entry.createdAt, sections: sectionsOf(template), linkStatus: {}, createdAt: entry.createdAt, updatedAt: entry.createdAt,
      });
      const profileOf = async (entry: LoreEntry): Promise<CharacterProfile> => (await stored(entry.id)) ?? fresh(entry);
      const saveProfile = (profile: CharacterProfile) => db.characterProfiles.put({ ...profile, updatedAt: Date.now() });

      /** Notes a change to the record. Typing in a field is many small saves: they are folded into one line, from the first value to the last. */
      async function record(entryId: string, action: string, label: string, from = '', to = ''): Promise<void> {
        const now = Date.now();
        if (action === 'field' || action === 'identity') {
          const last = (await db.characterHistory.where('entryId').equals(entryId).toArray()).filter((h) => h.kind === 'record' && h.action === action && h.label === label).sort((a, b) => b.at - a.at)[0];
          if (last && now - last.at < SAME_EDIT_MS) {
            if (last.from === short(to)) await db.characterHistory.delete(last.id);
            else await db.characterHistory.update(last.id, { to: short(to), at: now });
            return;
          }
          if (short(from) === short(to)) return;
        }
        await db.characterHistory.add({ id: createId(), projectId, entryId, at: now, kind: 'record', action, label, from: short(from), to: short(to), text: '', nodeId: null });
      }

      /** Changes a profile as it is stored right now, so quick edits in a row build on each other. */
      async function edit(entryId: string, change: (profile: CharacterProfile, entry: LoreEntry) => CharacterProfile | Promise<CharacterProfile>): Promise<CharacterProfile> {
        return write(async () => {
          const entry = await character(entryId);
          const next = await change(await profileOf(entry), entry);
          await saveProfile(next);
          return next;
        });
      }
      const section = (profile: CharacterProfile, sectionId: string): Section => {
        const found = profile.sections.find((s) => s.id === sectionId);
        if (!found) throw new Error('That section is no longer on the profile.');
        return found;
      };
      const withSection = (profile: CharacterProfile, sectionId: string, change: (s: Section) => Section): CharacterProfile => ({ ...profile, sections: profile.sections.map((s) => (s.id === sectionId ? change(s) : s)) });
      /** Changes a secret's knowledge records or marks, as stored right now. */
      const knowledgeEdit = (entryId: string, secretId: string, change: (secret: CharacterSecret) => CharacterSecret | Promise<CharacterSecret>) =>
        write(async () => {
          await character(entryId);
          const secret = await db.characterSecrets.get(secretId);
          if (!secret || secret.projectId !== projectId || secret.entryId !== entryId) throw new Error('That secret is no longer there.');
          const current = { ...secret, records: secret.records ?? [], needs: secret.needs ?? [] };
          const next = await change(current);
          if (next === current) return current;
          const saved = { ...next, updatedAt: Date.now() };
          await db.characterSecrets.put(saved);
          return saved;
        });
      /** A chapter, scene or event given for a record must be this novel's own. */
      const placed = async (item: { nodeId: string | null; eventId: string | null }) => {
        if (item.nodeId && (await db.chapters.get(item.nodeId))?.projectId !== projectId) throw new Error('That chapter or scene is not in this novel.');
        if (item.eventId && (await db.timelineEvents.get(item.eventId))?.projectId !== projectId) throw new Error('That event is not in this novel.');
      };
      const templates = async (): Promise<CharacterTemplate[]> => [...BUILTIN_TEMPLATES,...(await db.characterTemplates.where('projectId').equals(projectId).toArray()).sort((a, b) => a.createdAt - b.createdAt)];

      return {
        // ------------------------------------------------------------ reading

        /** Every character of the project. */
        entries: async (): Promise<LoreEntry[]> => (await db.loreEntries.where('projectId').equals(projectId).toArray()).filter((entry) => entry.category === 'character'),
        profiles: async (): Promise<Map<string, CharacterProfile>> => new Map((await db.characterProfiles.where('projectId').equals(projectId).toArray()).map((p) => [p.entryId, p])),
        /** A character's profile: the stored one, or the empty general layout if it has none yet. */
        profile: async (entryId: string): Promise<CharacterProfile> => profileOf(await character(entryId)),
        fresh,
        templates,

        // ------------------------------------------------------------ the record

        /** Creates a character: a codex entry in Characters, and its profile. Only a name is needed. */
        create: (input: NewCharacter) =>
          write(async () => {
            if (!input.name.trim()) throw new Error('Give the character a name.');
            const entry = await lore.create('character', input.name.trim());
            if (input.summary?.trim() || input.image) await lore.update(entry.id, { ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}), ...(input.image ? { image: input.image } : {}) });
            const template = (await templates()).find((t) => t.id === input.templateId) ?? BUILTIN_TEMPLATES[0];
            const last = Math.max(0, ...(await db.characterProfiles.where('projectId').equals(projectId).toArray()).map((p) => p.order));
            await saveProfile({ ...fresh(entry, template), id: createId(), epithet: input.epithet?.trim() ?? '', roles: clean(input.roles), order: Math.max(last + 1, entry.createdAt) });
            await record(entry.id, 'created', input.name.trim());
            return (await db.loreEntries.get(entry.id))!;
          }),

        /** Changes who the character is: name, summary, portrait and tags on the entry; epithet, aliases, roles, status and portrait focus on the profile. */
        identity: (entryId: string, changes: IdentityChanges) =>
          write(async () => {
            const entry = await character(entryId);
            const profile = await profileOf(entry);
            const onEntry = { ...(changes.name !== undefined ? { name: changes.name } : {}), ...(changes.summary !== undefined ? { summary: changes.summary } : {}), ...(changes.image !== undefined ? { image: changes.image } : {}), ...(changes.tags !== undefined ? { tags: changes.tags } : {}) };
            if (Object.keys(onEntry).length) await lore.update(entryId, onEntry);
            const next: CharacterProfile = {
              ...profile,
              ...(changes.epithet !== undefined ? { epithet: changes.epithet.trim() } : {}), ...(changes.aliases !== undefined ? { aliases: clean(changes.aliases) } : {}), ...(changes.roles !== undefined ? { roles: clean(changes.roles) } : {}),
              ...(changes.status !== undefined ? { status: changes.status.trim() } : {}),
              ...(changes.focal ? { focal: { x: Math.min(100, Math.max(0, Math.round(changes.focal.x))), y: Math.min(100, Math.max(0, Math.round(changes.focal.y))) } } : {}),
            };
            await saveProfile(next);
            const said: [string, string, string][] = [];
            if (changes.name !== undefined && changes.name.trim() !== entry.name) said.push(['Name', entry.name, changes.name.trim()]);
            if (changes.summary !== undefined && changes.summary !== entry.summary) said.push(['Summary', entry.summary, changes.summary]);
            if (changes.epithet !== undefined && next.epithet !== profile.epithet) said.push(['Title', profile.epithet, next.epithet]);
            if (changes.aliases !== undefined && next.aliases.join() !== profile.aliases.join()) said.push(['Aliases', profile.aliases.join(', '), next.aliases.join(', ')]);
            if (changes.roles !== undefined && next.roles.join() !== profile.roles.join()) said.push(['Role', profile.roles.join(', '), next.roles.join(', ')]);
            if (changes.status !== undefined && next.status !== profile.status) said.push(['Status', profile.status, next.status]);
            for (const [label, from, to] of said) await record(entryId, 'identity', label, from, to);
            if (changes.image !== undefined && changes.image !== entry.image) await record(entryId, 'portrait', changes.image ? (entry.image ? 'replaced' : 'added') : 'removed');
          }),

        /** Puts a character away, or brings it back. Nothing is removed and nothing that refers to it changes. */
        setArchived: (entryId: string, archived: boolean) =>
          edit(entryId, async (profile) => {
            if (profile.archived !== archived) await record(entryId, archived ? 'archived' : 'restored', '');
            return { ...profile, archived };
          }),

        /** Sets the author's own order of the library. */
        reorder: (entryIds: string[]) =>
          write(async () => {
            for (const [index, entryId] of entryIds.entries()) await saveProfile({ ...(await profileOf(await character(entryId))), order: index + 1 });
          }),

        // ------------------------------------------------------------ sections

        addSection: (entryId: string, name: string, tab: Section['tab'] = 'overview') =>
          edit(entryId, async (profile) => {
            if (!name.trim()) throw new Error('Give the section a name.');
            await record(entryId, 'section', name.trim(), '', 'added');
            return { ...profile, sections: [...profile.sections, { id: createId(), name: name.trim(), tab, hidden: false, fieldIds: [] }] };
          }),
        updateSection: (entryId: string, sectionId: string, changes: Partial<Pick<Section, 'name' | 'hidden' | 'tab'>>) =>
          edit(entryId, (profile) => {
            section(profile, sectionId);
            if (changes.name !== undefined && !changes.name.trim()) throw new Error('Give the section a name.');
            return withSection(profile, sectionId, (s) => ({ ...s, ...changes, ...(changes.name !== undefined ? { name: changes.name.trim() } : {}) }));
          }),
        /** Moves a section one place earlier (-1) or later (+1) among the sections of its tab. */
        moveSection: (entryId: string, sectionId: string, by: -1 | 1) =>
          edit(entryId, (profile) => {
            const here = section(profile, sectionId);
            const peers = profile.sections.filter((s) => s.tab === here.tab);
            const other = peers[peers.indexOf(here) + by];
            if (!other) return profile;
            return { ...profile, sections: profile.sections.map((s) => (s === here ? other : s === other ? here : s)) };
          }),
        /** A copy of a section with the same fields, all empty. */
        duplicateSection: (entryId: string, sectionId: string) =>
          write(async () => {
            const entry = await character(entryId);
            const profile = await profileOf(entry);
            const source = section(profile, sectionId);
            const copies = source.fieldIds.flatMap((id) => entry.fields.find((f) => f.id === id) ?? []).map((field): LoreField => ({ id: createId(), key: field.key, value: '', ...(field.type ? { type: field.type } : {}), ...(field.options?.length ? { options: field.options } : {}) }));
            // An empty field is kept by its name; the entry stores it like any other.
            await db.loreEntries.update(entryId, { fields: [...entry.fields, ...copies], updatedAt: Date.now() });
            const copy: Section = { id: createId(), name: `${source.name} (copy)`, tab: source.tab, hidden: false, fieldIds: copies.map((f) => f.id) };
            const at = profile.sections.indexOf(source) + 1;
            await saveProfile({ ...profile, sections: [...profile.sections.slice(0, at), copy, ...profile.sections.slice(at)] });
            return copy;
          }),
        /**
         * Takes a section off the profile. With `deleteFields` its fields
         * and what was written in them go too; without, they stay on the
         * character and are listed under the fields that have no section.
         */
        removeSection: (entryId: string, sectionId: string, deleteFields = false) =>
          write(async () => {
            const entry = await character(entryId);
            const profile = await profileOf(entry);
            const gone = section(profile, sectionId);
            if (deleteFields) await db.loreEntries.update(entryId, { fields: entry.fields.filter((f) => !gone.fieldIds.includes(f.id)), updatedAt: Date.now() });
            await saveProfile({ ...profile, sections: profile.sections.filter((s) => s.id !== sectionId) });
            await record(entryId, 'section', gone.name, '', deleteFields ? 'removed with its fields' : 'removed');
          }),
        /** Adds the sections of a template that the profile does not have yet (matched by name). Nothing already there is changed or removed. */
        applyTemplate: (entryId: string, templateId: string) =>
          edit(entryId, async (profile) => {
            const template = (await templates()).find((t) => t.id === templateId);
            if (!template) throw new Error('That template is no longer there.');
            const have = new Set(profile.sections.map((s) => s.name.trim().toLowerCase()));
            const added = sectionsOf(template).filter((s) => !have.has(s.name.trim().toLowerCase())).map((s) => ({ ...s, id: createId() }));
            await record(entryId, 'template', template.name, '', `${added.length} ${added.length === 1 ? 'section' : 'sections'} added`);
            return { ...profile, sections: [...profile.sections, ...added] };
          }),
        /** Saves this profile's layout (its sections and the names and types of their fields, not what is written in them) for use on other characters of the project. */
        saveTemplate: (entryId: string, name: string) =>
          write(async () => {
            if (!name.trim()) throw new Error('Give the template a name.');
            const entry = await character(entryId);
            const profile = await profileOf(entry);
            const template: CharacterTemplate = {
              id: createId(), projectId, name: name.trim(), description: `Saved from ${entry.name}.`, createdAt: Date.now(),
              sections: profile.sections.map((s) => ({ name: s.name, tab: s.tab, fields: s.fieldIds.flatMap((id) => entry.fields.find((f) => f.id === id) ?? []).filter((f) => f.key.trim()).map((f) => ({ name: f.key, type: f.type ?? 'text', ...(f.options?.length ? { options: f.options } : {}) })) })),
            };
            await db.characterTemplates.add(template);
            return template;
          }),
        removeTemplate: (templateId: string) =>
          write(async () => {
            const template = await db.characterTemplates.get(templateId);
            if (template?.projectId === projectId) await db.characterTemplates.delete(templateId);
          }),

        // ------------------------------------------------------------ fields (stored on the entry, where the Codex also shows them)

        addField: (entryId: string, sectionId: string, field: { name: string; type?: FieldType; options?: string[]; value?: string }) =>
          write(async () => {
            const entry = await character(entryId);
            const profile = await profileOf(entry);
            section(profile, sectionId);
            if (!field.name.trim()) throw new Error('Give the field a name.');
            const made: LoreField = { id: createId(), key: field.name.trim(), value: field.value ?? '', ...(isFieldType(field.type) && field.type !== 'text' ? { type: field.type } : {}), ...(field.options?.length ? { options: clean(field.options) } : {}) };
            await db.loreEntries.update(entryId, { fields: [...entry.fields, made], updatedAt: Date.now() });
            await saveProfile(withSection(profile, sectionId, (s) => ({ ...s, fieldIds: [...s.fieldIds, made.id] })));
            return made;
          }),
        /** Changes a field's name, type, choices or value. A change of value is noted in the character's history. */
        updateField: (entryId: string, fieldId: string, changes: FieldChanges) =>
          write(async () => {
            const entry = await character(entryId);
            const field = entry.fields.find((f) => f.id === fieldId);
            if (!field) throw new Error('That field is no longer on the character.');
            if (changes.key !== undefined && !changes.key.trim() && !field.defId) throw new Error('Give the field a name.');
            const next: LoreField = {
              ...field, ...(changes.key !== undefined && !field.defId ? { key: changes.key.trim() } : {}), ...(changes.value !== undefined ? { value: changes.value } : {}),
              ...(changes.type !== undefined && isFieldType(changes.type) ? { type: changes.type } : {}), ...(changes.options !== undefined ? { options: clean(changes.options) } : {}),
            };
            await db.loreEntries.update(entryId, { fields: entry.fields.map((f) => (f.id === fieldId ? next : f)), updatedAt: Date.now() });
            if (changes.value !== undefined && changes.value !== field.value) {
              const names = new Map((await db.loreEntries.where('projectId').equals(projectId).toArray()).map((e) => [e.id, e.name]));
              const shown = (value: string) => displayValue({ type: next.type, value }, (id) => names.get(id));
              await record(entryId, 'field', next.key || 'A field', shown(field.value), shown(changes.value));
            }
          }),
        /** Moves a field one place within its section, or to the end of another section. */
        moveField: (entryId: string, fieldId: string, to: { by: -1 | 1 } | { sectionId: string }) =>
          edit(entryId, (profile) => {
            const from = profile.sections.find((s) => s.fieldIds.includes(fieldId));
            if ('by' in to) {
              if (!from) return profile;
              const at = from.fieldIds.indexOf(fieldId);
              const swap = at + to.by;
              if (swap < 0 || swap >= from.fieldIds.length) return profile;
              const ids = [...from.fieldIds];
              [ids[at], ids[swap]] = [ids[swap], ids[at]];
              return withSection(profile, from.id, (s) => ({ ...s, fieldIds: ids }));
            }
            section(profile, to.sectionId);
            return { ...profile, sections: profile.sections.map((s) => ({ ...s, fieldIds: s.id === to.sectionId ? [...s.fieldIds.filter((id) => id !== fieldId), fieldId] : s.fieldIds.filter((id) => id !== fieldId) })) };
          }),
        removeField: (entryId: string, fieldId: string) =>
          write(async () => {
            const entry = await character(entryId);
            const profile = await profileOf(entry);
            const field = entry.fields.find((f) => f.id === fieldId);
            await db.loreEntries.update(entryId, { fields: entry.fields.filter((f) => f.id !== fieldId), updatedAt: Date.now() });
            await saveProfile({ ...profile, sections: profile.sections.map((s) => ({ ...s, fieldIds: s.fieldIds.filter((id) => id !== fieldId) })) });
            if (field?.value.trim()) await record(entryId, 'field', field.key || 'A field', short(field.value), 'removed');
          }),
        /** Records how a link to another entry stands (Active, Former, Secret…). The link itself belongs to the Codex. */
        setLinkStatus: (entryId: string, linkId: string, status: string) => edit(entryId, (profile) => ({ ...profile, linkStatus: { ...profile.linkStatus, [linkId]: status.trim() } })),

        // ------------------------------------------------------------ secrets

        secrets: async (entryId: string): Promise<CharacterSecret[]> => (await db.characterSecrets.where('entryId').equals(entryId).toArray()).filter((s) => s.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt),
        saveSecret: (entryId: string, secretId: string | null, changes: SecretChanges) =>
          write(async () => {
            await character(entryId);
            const was = secretId ? await db.characterSecrets.get(secretId) : undefined;
            if (secretId && (!was || was.projectId !== projectId || was.entryId !== entryId)) throw new Error('That secret is no longer there.');
            const now = Date.now();
            const base: CharacterSecret = was ?? { id: createId(), projectId, entryId, title: '', description: '', status: 'Hidden', self: 'knows', knows: [], suspects: [], unaware: [], reader: 'unaware', readerNodeId: null, firstNodeId: null, revealNodeId: null, revealEventId: null, nodeIds: [], threadIds: [], notes: '', records: [], needs: [], createdAt: now, updatedAt: now };
            const next: CharacterSecret = { ...base, ...changes, updatedAt: now };
            if (!next.title.trim()) throw new Error('Give the secret a title.');
            const knowledge = (value: unknown, fallback: Knowledge): Knowledge => (KNOWLEDGE.includes(value as Knowledge) ? (value as Knowledge) : fallback);
            // A character knows, suspects or is unaware: the list changed last wins, and the secret's own character is not in any of them.
            const lists = { knows: clean(next.knows), suspects: clean(next.suspects), unaware: clean(next.unaware) };
            for (const moved of KNOWLEDGE.filter((k) => changes[k] !== undefined)) for (const other of KNOWLEDGE.filter((k) => k !== moved)) lists[other] = lists[other].filter((id) => !lists[moved].includes(id));
            // Someone whose knowledge has a recorded history is kept in it: a list cannot say otherwise.
            const recorded = new Set((next.records ?? []).map((r) => r.characterId));
            const added = KNOWLEDGE.flatMap((k) => (changes[k] ?? []).filter((id) => recorded.has(id) && !base[k].includes(id)));
            if (added.length) throw new Error('That character’s knowledge has a recorded history: add a record to it instead.');
            const tidy = { ...next, title: next.title.trim(), ...Object.fromEntries(KNOWLEDGE.map((k) => [k, lists[k].filter((id) => id !== entryId && !recorded.has(id))])), self: knowledge(next.self, 'knows'), reader: knowledge(next.reader, 'unaware'), nodeIds: clean(next.nodeIds), threadIds: clean(next.threadIds) } as CharacterSecret;
            await db.characterSecrets.put(tidy);
            return tidy;
          }),
        removeSecret: (secretId: string) =>
          write(async () => {
            const secret = await db.characterSecrets.get(secretId);
            if (secret?.projectId === projectId) await db.characterSecrets.delete(secretId);
          }),

        /**
         * Records what a character holds of a secret at a point: a new record
         * (`recordId` null) or a change to one. A change in what they know
         * is a new record; the ones before it stay. A character's first
         * record takes them out of the simple lists; if the list said
         * something else, that is kept as an earlier record with no chapter
         * or event, for the author to place or remove.
         */
        saveRecord: (entryId: string, secretId: string, recordId: string | null, changes: RecordChanges) =>
          knowledgeEdit(entryId, secretId, async (secret) => {
            const records = secret.records ?? [];
            const was = recordId ? records.find((r) => r.id === recordId) : undefined;
            if (recordId && !was) throw new Error('That record is no longer there.');
            const next: KnowledgeRecord = { ...(was ?? { id: createId(), characterId: '', state: 'knows', belief: '', nodeId: null, eventId: null, how: '', fromId: null }), ...changes, id: was?.id ?? createId(), characterId: was?.characterId ?? changes.characterId ?? '' };
            if (!AWARENESS.includes(next.state)) throw new Error('Choose what they know.');
            await character(next.characterId);
            await placed(next);
            if (next.fromId) {
              await character(next.fromId);
              if (next.fromId === next.characterId) throw new Error('Someone cannot learn it from themself.');
            }
            const tidy: KnowledgeRecord = { ...next, belief: next.belief.trim(), how: next.how.trim() };
            if (was) return { ...secret, records: records.map((r) => (r.id === was.id ? tidy : r)) };
            const listed = next.characterId === entryId || records.some((r) => r.characterId === next.characterId) ? undefined : KNOWLEDGE.find((k) => secret[k].includes(next.characterId));
            const before: KnowledgeRecord[] = listed && listed !== next.state ? [{ id: createId(), characterId: next.characterId, state: listed, belief: '', nodeId: null, eventId: null, how: '', fromId: null }] : [];
            return { ...secret, ...Object.fromEntries(KNOWLEDGE.map((k) => [k, secret[k].filter((id) => id !== next.characterId)])), records: [...records, ...before, tidy] };
          }),
        removeRecord: (entryId: string, secretId: string, recordId: string) => knowledgeEdit(entryId, secretId, (secret) => ({ ...secret, records: (secret.records ?? []).filter((r) => r.id !== recordId) })),
        /** Moves a record earlier or later among that character's own records: the order things happen to them. */
        moveRecord: (entryId: string, secretId: string, recordId: string, by: -1 | 1) =>
          knowledgeEdit(entryId, secretId, (secret) => {
            const records = [...(secret.records ?? [])];
            const at = records.findIndex((r) => r.id === recordId);
            if (at < 0) throw new Error('That record is no longer there.');
            const theirs = records.map((r, i) => (r.characterId === records[at].characterId ? i : -1)).filter((i) => i >= 0);
            const swap = theirs[theirs.indexOf(at) + by];
            if (swap === undefined) return secret;
            [records[at], records[swap]] = [records[swap], records[at]];
            return { ...secret, records };
          }),
        /** Marks that a character acts on knowing the secret at a chapter, scene or event: what the knowledge checks test. */
        saveNeed: (entryId: string, secretId: string, needId: string | null, changes: NeedChanges) =>
          knowledgeEdit(entryId, secretId, async (secret) => {
            const needs = secret.needs ?? [];
            const was = needId ? needs.find((n) => n.id === needId) : undefined;
            if (needId && !was) throw new Error('That mark is no longer there.');
            const next: KnowledgeNeed = { ...(was ?? { id: createId(), characterId: '', nodeId: null, eventId: null, note: '' }), ...changes, id: was?.id ?? createId(), characterId: was?.characterId ?? changes.characterId ?? '' };
            await character(next.characterId);
            await placed(next);
            if (!next.nodeId && !next.eventId) throw new Error('Say where they act on it: a chapter, scene or event.');
            const tidy = { ...next, note: next.note.trim() };
            return { ...secret, needs: was ? needs.map((n) => (n.id === was.id ? tidy : n)) : [...needs, tidy] };
          }),
        removeNeed: (entryId: string, secretId: string, needId: string) => knowledgeEdit(entryId, secretId, (secret) => ({ ...secret, needs: (secret.needs ?? []).filter((n) => n.id !== needId) })),

        // ------------------------------------------------------------ notes

        notes: async (entryId: string): Promise<CharacterNote[]> =>
          (await db.characterNotes.where('entryId').equals(entryId).toArray()).filter((n) => n.projectId === projectId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
        saveNote: (entryId: string, noteId: string | null, changes: NoteChanges) =>
          write(async () => {
            await character(entryId);
            const was = noteId ? await db.characterNotes.get(noteId) : undefined;
            if (noteId && (!was || was.projectId !== projectId || was.entryId !== entryId)) throw new Error('That note is no longer there.');
            const now = Date.now();
            const next: CharacterNote = { ...(was ?? { id: createId(), projectId, entryId, title: '', content: '', tags: [], pinned: false, nodeIds: [], createdAt: now, updatedAt: now }), ...changes, updatedAt: now };
            if (!next.title.trim() && !next.content.trim()) throw new Error('Write the note first.');
            const tidy = { ...next, title: next.title.trim() || next.content.trim().split('\n')[0].slice(0, 60), tags: clean(next.tags), nodeIds: clean(next.nodeIds) };
            await db.characterNotes.put(tidy);
            return tidy;
          }),
        removeNote: (noteId: string) =>
          write(async () => {
            const note = await db.characterNotes.get(noteId);
            if (note?.projectId === projectId) await db.characterNotes.delete(noteId);
          }),
        /**
         * Copies a note into the character's record, as a field. This is the
         * only way a note becomes part of what is established about a
         * character, and it happens only when the author asks for it. The
         * note itself is kept.
         */
        promoteNote: (noteId: string, sectionId: string, fieldName: string) =>
          write(async () => {
            const note = await db.characterNotes.get(noteId);
            if (!note || note.projectId !== projectId) throw new Error('That note is no longer there.');
            const entry = await character(note.entryId);
            const profile = await profileOf(entry);
            section(profile, sectionId);
            if (!fieldName.trim()) throw new Error('Say which field it goes into.');
            const made: LoreField = { id: createId(), key: fieldName.trim(), value: note.content.trim(), type: 'longtext' };
            await db.loreEntries.update(entry.id, { fields: [...entry.fields, made], updatedAt: Date.now() });
            await saveProfile(withSection(profile, sectionId, (s) => ({ ...s, fieldIds: [...s.fieldIds, made.id] })));
            await record(entry.id, 'note', made.key, '', `copied from the note “${note.title}”`);
            return made;
          }),

        // ------------------------------------------------------------ history

        /** Newest first. */
        history: async (entryId: string): Promise<CharacterHistory[]> => (await db.characterHistory.where('entryId').equals(entryId).toArray()).filter((h) => h.projectId === projectId).sort((a, b) => b.at - a.at),
        /** Writes down something that happens to the character in the story, optionally at a chapter. */
        addMilestone: (entryId: string, text: string, nodeId: string | null = null) =>
          write(async () => {
            await character(entryId);
            if (!text.trim()) throw new Error('Say what happens.');
            const node = nodeId ? await db.chapters.get(nodeId) : undefined;
            const entry: CharacterHistory = { id: createId(), projectId, entryId, at: Date.now(), kind: 'story', action: 'milestone', label: '', from: '', to: '', text: text.trim(), nodeId: node?.projectId === projectId ? node.id : null };
            await db.characterHistory.add(entry);
            return entry;
          }),
        removeMilestone: (historyId: string) =>
          write(async () => {
            const line = await db.characterHistory.get(historyId);
            if (line?.projectId === projectId && line.kind === 'story') await db.characterHistory.delete(historyId);
          }),

        // ------------------------------------------------------------ leaving

        /** Everything in the project that refers to this character. Reads only. */
        async references(entryId: string): Promise<References> {
          await character(entryId);
          const mine = <T extends { projectId: string }>(rows: T[]) => rows.filter((row) => row.projectId === projectId);
          const [nodes, relations, events, threads, links, sheets, snapshots, secrets, notes] = await Promise.all([
            db.chapters.where('projectId').equals(projectId).toArray(), db.characterRelations.where('projectId').equals(projectId).toArray(), db.timelineEvents.where('projectId').equals(projectId).toArray(),
            db.plotThreads.where('projectId').equals(projectId).toArray(), db.loreLinks.where('projectId').equals(projectId).filter(isEntryLink).toArray(), db.systemSheets.where('projectId').equals(projectId).toArray(),
            db.progressSnapshots.where('projectId').equals(projectId).toArray(), db.characterSecrets.where('projectId').equals(projectId).toArray(), db.characterNotes.where('entryId').equals(entryId).toArray(),
          ]);
          return {
            chapters: nodes.filter((n) => n.mentions?.includes(entryId)).length, relationships: relations.filter((r) => r.fromId === entryId || r.toId === entryId).length,
            events: events.filter((e) => e.characters.some((c) => c.id === entryId) || e.entryIds.includes(entryId)).length, threads: threads.filter((t) => t.characterIds.includes(entryId)).length,
            links: links.filter((l) => l.fromId === entryId || l.toId === entryId).length, sheets: sheets.filter((s) => s.entryId === entryId).length, snapshots: snapshots.filter((s) => s.entryId === entryId).length,
            secrets: secrets.filter((s) => s.entryId === entryId).length, inSecrets: secrets.filter((s) => s.entryId !== entryId && peopleOf(s).includes(entryId)).length, notes: mine(notes).length,
          };
        },

        /**
         * Deletes a character for good: the entry (with its links and
         * relationships, as the Codex does), its profile, secrets, notes
         * and history. Links to it in the manuscript stop being links; the
         * words stay. Timeline events and plot threads keep everything
         * else and simply no longer show the character; other characters'
         * secrets drop the character from who knows or suspects, and their
         * knowledge records and marks.
         */
        remove: (entryId: string) =>
          write(async () => {
            await character(entryId);
            for (const secret of await db.characterSecrets.where('projectId').equals(projectId).toArray()) {
              if (secret.entryId === entryId) continue;
              if (!peopleOf(secret).includes(entryId)) continue;
              // Their own records and marks go with them; a record of someone learning it from them keeps everything but who it was from.
              const records = (secret.records ?? []).filter((r) => r.characterId !== entryId).map((r) => (r.fromId === entryId ? { ...r, fromId: null } : r));
              await db.characterSecrets.update(secret.id, { knows: secret.knows.filter((id) => id !== entryId), suspects: secret.suspects.filter((id) => id !== entryId), unaware: secret.unaware.filter((id) => id !== entryId), records, needs: (secret.needs ?? []).filter((n) => n.characterId !== entryId) });
            }
            await lore.remove(entryId);
          }),
      };
    },
  };
}

export type CharacterService = ReturnType<typeof createCharacterService>;
export type ProjectCharacters = ReturnType<CharacterService['forProject']>;
export { slug };
