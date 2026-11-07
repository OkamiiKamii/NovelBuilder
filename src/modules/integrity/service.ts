import type { NovelDB } from '@/core/db';
import type { ProjectCollection, ProjectRegistry, Row } from '@/core/projectRegistry';
import type { LoreEntry } from '@/modules/codex/types';
import { FIXABLE, GOES_WHOLE, normalizeName, withoutReference } from './rules';
import { withoutProgressReference, type ProgressChange } from '@/modules/progression/track';
import { withoutJourneyReference } from '@/modules/travel/routes';
import type { Journey } from '@/modules/travel/types';

/** What merging one entry into another would do, before anything is done. */
export interface MergePlan {
  keep: LoreEntry;
  merge: LoreEntry;
  /** Records that point at the one merged, which would point at the one kept: how many in each place. */
  repointed: { table: string; rows: number }[];
  /** What of the merged entry is added to the one kept. */
  combined: string[];
  /** What is not kept, because the one kept already has it, or it would point at itself. */
  dropped: string[];
}

const TABLE_WORDS: Record<string, string> = {
  loreLinks: 'connections',
  characterRelations: 'character relationships',
  loreEntries: 'fields of other entries',
  chapters: 'chapters and scenes linking it in their text',
  chapterContents: 'chapters’ and scenes’ text',
  chapterRevisions: 'saved versions of chapters',
  chapterBranches: 'alternate drafts',
  chapterDrafts: 'unsaved drafts',
  chapterPlans: 'chapter and scene plans',
  timelineEvents: 'timeline events',
  plotThreads: 'plot threads',
  characterProfiles: 'character profile',
  characterSecrets: 'secrets',
  characterNotes: 'character notes',
  characterHistory: 'character history',
  systemSheets: 'system sheets',
  progressSnapshots: 'progression snapshots',
  canonFacts: 'canon facts',
  structureMarkers: 'structural markers',
  progressChanges: 'progression changes',
  journeys: 'journeys',
};
export const tableWords = (table: string) => TABLE_WORDS[table] ?? table;

export function createIntegrityService(db: NovelDB, registry: ProjectRegistry, onProjectChanged: (projectId: string) => Promise<unknown>) {
  return {
    forProject(projectId: string) {
      const write = <T>(task: () => Promise<T>): Promise<T> =>
        db.transaction('rw', db.tables, async () => {
          const result = await task();
          await onProjectChanged(projectId);
          return result;
        });
      async function entry(id: string): Promise<LoreEntry> {
        const found = await db.loreEntries.get(id);
        if (!found || found.projectId !== projectId) throw new Error('That entry is no longer there.');
        return found;
      }

      /** A row with one id re-pointed at another, through the same rules a copy of the novel uses: so every kind of reference follows, text links included. */
      function repointRow(collection: ProjectCollection, row: Row, fromId: string, toId: string): Row {
        const mapId = (id: string) => (id === fromId ? toId : id);
        const mapValue = (value: unknown): unknown => (typeof value === 'string' ? mapId(value) : Array.isArray(value) ? [...new Set(value.map(mapValue))] : value);
        let next: Row = { ...row };
        for (const field of collection.refs ?? []) if (field in next) next[field] = mapValue(next[field]);
        if (collection.remap) next = collection.remap(next, mapId);
        return next;
      }
      /** Every row of the novel that would change, with its new form. */
      async function repointed(fromId: string, toId: string): Promise<{ collection: ProjectCollection; before: Row; after: Row }[]> {
        const out: { collection: ProjectCollection; before: Row; after: Row }[] = [];
        for (const collection of registry.collections) {
          if (!collection.refs?.length && !collection.remap) continue;
          for (const row of (await db.table(collection.table).where('projectId').equals(projectId).toArray()) as Row[]) {
            if (collection.table === 'loreEntries' && row.id === fromId) continue;
            const after = repointRow(collection, row, fromId, toId);
            if (JSON.stringify(after) !== JSON.stringify(row)) out.push({ collection, before: row, after });
          }
        }
        return out;
      }

      return {
        /**
         * Takes one broken reference out of the record that holds it. A
         * connection or relationship whose end is gone goes whole; anything
         * else loses only the reference (a beat stays, unplaced; an event
         * keeps everything but the missing character).
         */
        removeReference: (table: string, rowId: string, missingId: string) =>
          write(async () => {
            if (!FIXABLE.has(table)) throw new Error('That reference is changed where it is kept, not from here.');
            const row = (await db.table(table).get(rowId)) as Row | undefined;
            if (!row || row.projectId !== projectId) throw new Error('That record is no longer there.');
            if (GOES_WHOLE.has(table)) return void (await db.table(table).delete(rowId));
            // A change keeps what it says: a point in time that is gone becomes "when is not known".
            const next = table === 'progressChanges' ? withoutProgressReference(row as unknown as ProgressChange, missingId) : table === 'journeys' ? withoutJourneyReference(row as unknown as Journey, missingId) : withoutReference(row, missingId);
            await db.table(table).put('updatedAt' in next ? { ...next, updatedAt: Date.now() } : next);
          }),

        /** Points a reference field holding words at the entry the author chooses. */
        pointField: (entryId: string, fieldId: string, words: string, targetId: string) =>
          write(async () => {
            const owner = await entry(entryId);
            await entry(targetId);
            const fields = owner.fields.map((f) => (f.id !== fieldId ? f : { ...f, value: f.value.split('\n').map((part) => (part.trim() === words.trim() ? targetId : part)).join('\n') }));
            await db.loreEntries.update(entryId, { fields, updatedAt: Date.now() });
          }),

        /** What merging `mergeId` into `keepId` would do. Reads only. */
        async mergePlan(keepId: string, mergeId: string): Promise<MergePlan> {
          if (keepId === mergeId) throw new Error('Choose two different entries.');
          const [keep, merge] = [await entry(keepId), await entry(mergeId)];
          if (keep.category !== merge.category) throw new Error('Only entries of the same category can be merged.');
          const changes = await repointed(mergeId, keepId);
          const counts = new Map<string, number>();
          for (const c of changes) counts.set(c.collection.table, (counts.get(c.collection.table) ?? 0) + 1);
          const dropped: string[] = [];
          const between = (await db.loreLinks.where('projectId').equals(projectId).toArray()).filter((l) => (l.fromId === keepId && l.toId === mergeId) || (l.fromId === mergeId && l.toId === keepId)).length;
          if (between) dropped.push(`${between} ${between === 1 ? 'connection' : 'connections'} between the two, which would point at itself`);
          const relations = (await db.characterRelations.where('projectId').equals(projectId).toArray()).filter((r) => (r.fromId === keepId && r.toId === mergeId) || (r.fromId === mergeId && r.toId === keepId)).length;
          if (relations) dropped.push(`${relations} ${relations === 1 ? 'relationship' : 'relationships'} between the two`);
          const profiles = (await db.characterProfiles.where('projectId').equals(projectId).toArray()).filter((p) => p.entryId === keepId || p.entryId === mergeId);
          if (profiles.length > 1) dropped.push(`the profile layout of “${merge.name}” (its name and aliases become aliases of “${keep.name}”)`);
          const sheets = (await db.systemSheets.where('projectId').equals(projectId).toArray()).filter((s) => s.entryId === keepId || s.entryId === mergeId);
          const doubled = sheets.filter((s) => s.entryId === mergeId && sheets.some((k) => k.entryId === keepId && k.systemId === s.systemId)).length;
          if (doubled) dropped.push(`${doubled} system ${doubled === 1 ? 'sheet' : 'sheets'} of “${merge.name}” in a system “${keep.name}” already has a sheet in`);
          const keys = new Set(keep.fields.map((f) => normalizeName(f.key)));
          const newFields = merge.fields.filter((f) => f.key.trim() && !keys.has(normalizeName(f.key)));
          const combined = [
            ...(newFields.length ? [`${newFields.length} ${newFields.length === 1 ? 'field' : 'fields'} “${keep.name}” does not have: ${newFields.map((f) => f.key).join(', ')}`] : []),
            ...(merge.tags.some((t) => !keep.tags.includes(t)) ? [`tags: ${merge.tags.filter((t) => !keep.tags.includes(t)).join(', ')}`] : []),
            ...(merge.description.trim() && merge.description.trim() !== keep.description.trim() ? [keep.description.trim() ? 'its description, added after the description of the one kept' : 'its description'] : []),
            ...(merge.summary.trim() && !keep.summary.trim() ? ['its summary'] : []),
            ...(merge.image && !keep.image ? ['its picture'] : []),
            `a note on “${keep.name}” saying “${merge.name}” was merged into it`,
          ];
          return { keep, merge, repointed: [...counts].map(([table, rows]) => ({ table, rows })).sort((a, b) => a.table.localeCompare(b.table)), combined, dropped };
        },

        /**
         * Merges one entry into another of the same category, once the author
         * has seen the plan and said yes. Every reference to the merged entry
         * (connections, relationships, fields, links in the text and its saved
         * versions, plans, events, plot threads, secrets, sheets…) is re-pointed
         * at the one kept; what that makes point at itself, or double, goes;
         * the merged entry's content is added; then the merged entry is
         * deleted. Nothing that referred to it is left pointing at nothing.
         */
        merge: (keepId: string, mergeId: string) =>
          write(async () => {
            if (keepId === mergeId) throw new Error('Choose two different entries.');
            const [keep, merge] = [await entry(keepId), await entry(mergeId)];
            if (keep.category !== merge.category) throw new Error('Only entries of the same category can be merged.');
            const profiles = (await db.characterProfiles.where('projectId').equals(projectId).toArray()).filter((p) => p.entryId === keepId || p.entryId === mergeId);
            const goneProfile = profiles.find((p) => p.entryId === mergeId);
            const keptProfile = profiles.find((p) => p.entryId === keepId);
            const goneSheets = new Set((await db.systemSheets.where('projectId').equals(projectId).toArray()).filter((s) => s.entryId === mergeId).map((s) => s.id));
            // 1. Every reference follows.
            for (const { collection, after } of await repointed(mergeId, keepId)) await db.table(collection.table).put(after);
            // 2. What now points at itself, or is there twice, goes.
            const links = await db.loreLinks.where('projectId').equals(projectId).toArray();
            const seen = new Set<string>();
            for (const l of links) {
              const sig = [l.fromId, l.toId, l.type ?? '', l.fromType ?? 'entry', l.toType ?? 'entry'].join('|');
              if (l.fromId === l.toId || seen.has(sig)) await db.loreLinks.delete(l.id);
              else seen.add(sig);
            }
            for (const r of await db.characterRelations.where('projectId').equals(projectId).toArray()) if (r.fromId === r.toId) await db.characterRelations.delete(r.id);
            if (goneProfile && keptProfile) {
              await db.characterProfiles.delete(goneProfile.id);
              const aliases = [...new Set([...keptProfile.aliases, merge.name, ...goneProfile.aliases].map((a) => a.trim()).filter((a) => a && a !== keep.name))];
              await db.characterProfiles.update(keptProfile.id, { aliases, updatedAt: Date.now() });
            } else if (goneProfile) {
              await db.characterProfiles.update(goneProfile.id, { aliases: [...new Set([...goneProfile.aliases, merge.name].filter((a) => a !== keep.name))], updatedAt: Date.now() });
            }
            const sheets = (await db.systemSheets.where('projectId').equals(projectId).toArray()).filter((s) => s.entryId === keepId);
            for (const s of sheets) if (goneSheets.has(s.id) && sheets.some((k) => !goneSheets.has(k.id) && k.systemId === s.systemId)) await db.systemSheets.delete(s.id);
            for (const event of await db.timelineEvents.where('projectId').equals(projectId).toArray()) {
              const characters = event.characters.filter((c, i) => event.characters.findIndex((d) => d.id === c.id) === i);
              if (characters.length !== event.characters.length) await db.timelineEvents.update(event.id, { characters });
            }
            // 3. The merged entry's own content joins the one kept.
            const keys = new Set(keep.fields.map((f) => normalizeName(f.key)));
            const description = merge.description.trim() && merge.description.trim() !== keep.description.trim() ? [keep.description.trim(), merge.description.trim()].filter(Boolean).join('\n\n') : keep.description;
            const note = `Merged “${merge.name}” into this entry.`;
            await db.loreEntries.update(keepId, {
              fields: [...keep.fields, ...merge.fields.filter((f) => f.key.trim() && !keys.has(normalizeName(f.key)))],
              tags: [...new Set([...keep.tags, ...merge.tags])],
              summary: keep.summary.trim() ? keep.summary : merge.summary,
              description,
              image: keep.image ?? merge.image,
              notes: [keep.notes.trim(), merge.notes.trim(), note].filter(Boolean).join('\n\n'),
              updatedAt: Date.now(),
            });
            await db.loreEntries.delete(mergeId);
          }),
      };
    },
  };
}

export type IntegrityService = ReturnType<typeof createIntegrityService>;
