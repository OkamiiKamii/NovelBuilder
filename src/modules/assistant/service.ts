import type { Table } from 'dexie';
import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { resolveCategories } from '@/modules/codex/schema';
import type { CodexService } from '@/modules/codex/service';
import type { PlotService } from '@/modules/plot/service';
import { calendarFrom } from '@/modules/timeline/calendar';
import { buildContext, type ProjectData } from './context';
import { buildRequest, interpret, type AssistantRequest } from './prompt';
import { MODES, type Attachments, type Brainstorm, type BrainstormItem, type BrainstormMode, type Fact, type Idea, type RouteTarget } from './types';

/** Hooks brainstorms and ideas into project isolation, duplication and backup. */
export function registerAssistant(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'brainstorms',
    refs: ['entryIds', 'threadIds', 'nodeIds'],
    remap: (row, mapId) => {
      const session = row as unknown as Brainstorm;
      return {
        ...row,
        facts: (session.facts ?? []).map((fact) => ({ ...fact, source: { ...fact.source, id: mapId(fact.source.id) } })),
        // Links to where a suggestion was added follow the copies.
        items: (session.items ?? []).map((item) => ({ ...item, added: item.added ? { ...item.added, to: item.added.to.split(/([/?=&])/).map(mapId).join('') } : null })),
      };
    },
  });
  registry.registerCollection({ table: 'ideas', refs: ['brainstormId'] });
}

const append = (existing: string, line: string): string => (existing.trim() ? `${existing.replace(/\s+$/, '')}\n\n${line}` : line);

export function createAssistantService(db: NovelDB, codex: CodexService, plot: PlotService, onProjectChanged: (projectId: string) => Promise<unknown>) {
  /** Every operation is bound to one project; nothing from another project can be read into a prompt or written from one. */
  function forProject(projectId: string) {
    const mine = <T>(table: Table<T, string>): Promise<T[]> => table.where('projectId').equals(projectId).toArray();
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    async function owned(sessionId: string): Promise<Brainstorm> {
      const session = await db.brainstorms.get(sessionId);
      if (!session || session.projectId !== projectId) throw new Error('That brainstorm is not in this project.');
      return session;
    }
    const setItem = async (session: Brainstorm, itemId: string, changes: Partial<BrainstormItem>) =>
      db.brainstorms.update(session.id, { items: session.items.map((item) => (item.id === itemId ? { ...item, ...changes } : item)), updatedAt: Date.now() });

    /** The project's records as they are saved right now. Reads only. */
    async function gather(): Promise<ProjectData> {
      const [entries, nodes, plans, relations, threads, events, canon, systems, sheets, schemas] = await Promise.all([
        mine(db.loreEntries), mine(db.chapters), mine(db.chapterPlans), mine(db.characterRelations), mine(db.plotThreads), mine(db.timelineEvents), mine(db.canonFacts), mine(db.systems), mine(db.systemSheets), mine(db.loreSchemas),
      ]);
      const [calendar] = await mine(db.storyCalendars);
      const categories = new Map(resolveCategories(schemas).map((c) => [c.key, c]));
      return { entries, nodes, plans, relations, threads, events, canon, systems, sheets, categoryOf: (key) => categories.get(key), calendar: calendarFrom(calendar) };
    }

    return {
      gather,

      /**
       * What would be sent for a question: the numbered facts and the full
       * text of the request. Building it changes nothing, so the author can
       * read every word before anything leaves the device.
       */
      async prepare(mode: BrainstormMode, prompt: string, attached: Attachments): Promise<{ facts: Fact[]; request: AssistantRequest }> {
        const facts = buildContext(await gather(), attached);
        return { facts, request: buildRequest(mode, prompt, facts) };
      },

      /**
       * Keeps an answer as a brainstorm. This stores the conversation only:
       * the manuscript, the Codex, threads and canon are untouched until
       * the author approves a suggestion with `route`.
       */
      record: (input: { mode: BrainstormMode; prompt: string; attached: Attachments; facts: Fact[]; answer: unknown; model: string }) =>
        write(async () => {
          const items = interpret(input.answer, input.facts);
          if (!items.length) throw new Error('The answer could not be read as a brainstorm. Nothing was saved.');
          const now = Date.now();
          const session: Brainstorm = {
            id: createId(), projectId, mode: MODES.includes(input.mode) ? input.mode : 'plot', prompt: input.prompt.trim(), entryIds: input.attached.entryIds, threadIds: input.attached.threadIds, nodeIds: input.attached.nodeIds,
            facts: input.facts, items, model: input.model, createdAt: now, updatedAt: now,
          };
          await db.brainstorms.add(session);
          return session;
        }),

      list: () => mine(db.brainstorms),
      remove: (sessionId: string) =>
        write(async () => {
          await owned(sessionId);
          await db.brainstorms.delete(sessionId);
        }),

      discard: (sessionId: string, itemId: string) => write(async () => setItem(await owned(sessionId), itemId, { status: 'discarded' })),
      restore: (sessionId: string, itemId: string) =>
        write(async () => {
          const session = await owned(sessionId);
          if (session.items.find((i) => i.id === itemId)?.status === 'discarded') await setItem(session, itemId, { status: 'open' });
        }),

      /**
       * NO SILENT CANVAS MODIFICATION RULE
       * The one way anything from the assistant enters the project: the
       * author picks a suggestion and says where it goes. It is added as a
       * draft note (never to the manuscript, a description or canon), marked
       * as an idea, and the suggestion records where it went.
       */
      route: (sessionId: string, itemId: string, target: RouteTarget) =>
        write(async () => {
          const session = await owned(sessionId);
          const item = session.items.find((i) => i.id === itemId);
          if (!item || item.kind !== 'suggestion') throw new Error('Only a suggestion can be added to the project.');
          if (item.status !== 'open') throw new Error('That suggestion has already been dealt with.');
          const line = `Idea: ${item.title ? `${item.title}. ` : ''}${item.text}`;
          let added: BrainstormItem['added'];

          if (target.kind === 'ideas') {
            const now = Date.now();
            await db.ideas.add({ id: createId(), projectId, text: `${item.title ? `${item.title}. ` : ''}${item.text}`, brainstormId: session.id, createdAt: now, updatedAt: now });
            added = { label: 'Notes / Ideas', to: `/project/${projectId}/assistant?tab=ideas` };
          } else if (target.kind === 'thread') {
            const threads = plot.forProject(projectId);
            const thread = 'threadId' in target ? await threads.get(target.threadId) : await threads.create(target.newTitle.trim() || item.title || 'New thread');
            if (!thread) throw new Error('That plot thread is not in this project.');
            await threads.update(thread.id, (current) => ({ notes: append(current.notes, line) }));
            added = { label: `the plot thread “${thread.title}”`, to: `/project/${projectId}/plot?thread=${thread.id}` };
          } else {
            const entries = codex.forProject(projectId);
            const entry = 'entryId' in target ? await entries.get(target.entryId) : await entries.create(target.kind === 'character' ? 'character' : target.category, target.newName.trim() || item.title || 'New entry');
            if (!entry) throw new Error('That codex entry is not in this project.');
            if ((target.kind === 'character') !== (entry.category === 'character')) throw new Error(target.kind === 'character' ? 'Choose a character.' : 'Choose an entry that is not a character.');
            if (entry.category === 'character') {
              // A character's notes are their own records, apart from the profile: an idea is not yet a fact about them.
              const now = Date.now();
              await db.characterNotes.add({ id: createId(), projectId, entryId: entry.id, title: item.title || 'Idea', content: item.text, tags: ['brainstorm'], pinned: false, nodeIds: [], createdAt: now, updatedAt: now });
              added = { label: `${entry.name}’s notes`, to: `/project/${projectId}/characters/${entry.id}/notes` };
            } else {
              await entries.update(entry.id, { notes: append(entry.notes, line) });
              added = { label: `${entry.name}’s notes`, to: `/project/${projectId}/codex/${entry.id}` };
            }
          }
          await setItem((await owned(sessionId)) as Brainstorm, itemId, { status: 'added', added });
          return added;
        }),

      ideas: () => mine(db.ideas),
      addIdea: (text: string) =>
        write(async () => {
          const now = Date.now();
          const idea: Idea = { id: createId(), projectId, text: text.trim(), brainstormId: null, createdAt: now, updatedAt: now };
          if (!idea.text) throw new Error('Write the idea first.');
          await db.ideas.add(idea);
          return idea;
        }),
      updateIdea: (ideaId: string, text: string) =>
        write(async () => {
          const idea = await db.ideas.get(ideaId);
          if (!idea || idea.projectId !== projectId) throw new Error('That idea is not in this project.');
          await db.ideas.update(ideaId, { text, updatedAt: Date.now() });
        }),
      removeIdea: (ideaId: string) =>
        write(async () => {
          const idea = await db.ideas.get(ideaId);
          if (!idea || idea.projectId !== projectId) throw new Error('That idea is not in this project.');
          await db.ideas.delete(ideaId);
        }),
    };
  }
  return { forProject };
}

export type AssistantService = ReturnType<typeof createAssistantService>;
export type ProjectAssistant = ReturnType<AssistantService['forProject']>;
