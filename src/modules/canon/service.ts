import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { docBlocks } from '@/modules/search/extract';
import { normalize } from './review';
import { CANON_STATUSES, ESTABLISHED, FACT_KINDS, SOURCE_TYPES, type CanonFact, type CanonStatus, type Dismissal, type FactChange, type FactChanges, type FactKind, type FactSource, type SourceInput, type SourceType } from './types';

export class FactNotFoundError extends Error {
  constructor(id: string) {
    super(`Canon fact ${id} not found in this project`);
    this.name = 'FactNotFoundError';
  }
}

/** Hooks canon facts into project isolation, duplication and backup. Every reference is re-pointed at the copies; history is carried over untouched. */
export function registerCanon(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'canonFacts',
    refs: ['entryIds', 'conflictsWith', 'replacedById'],
    // Facts and their history are inherited whole; sources in chapters the new timeline does not have are left behind.
    fork: (rows, reached) => rows.map((row) => ({ ...row, sources: ((row as unknown as CanonFact).sources ?? []).filter((source) => source.type !== 'chapter' || !source.refId || reached(source.refId)) })),
    remap: (row, mapId) => {
      const fact = row as unknown as CanonFact;
      return {
        ...row,
        sources: (fact.sources ?? []).map((source) => ({ ...source, refId: source.refId ? mapId(source.refId) : null })),
        dismissed: (fact.dismissed ?? []).map((d) => ({ ...d, ...(d.factId ? { factId: mapId(d.factId) } : {}), ...(d.entryId ? { entryId: mapId(d.entryId) } : {}) })),
      };
    },
  });
}

const SOURCE_TABLES = { chapter: 'chapters', entry: 'loreEntries', event: 'timelineEvents' } as const;

export function createCanonService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  /** Every operation is bound to one project; ids from another project are treated as not found. */
  function forProject(projectId: string) {
    async function owned(factId: string): Promise<CanonFact> {
      const fact = await db.canonFacts.get(factId);
      if (!fact || fact.projectId !== projectId) throw new FactNotFoundError(factId);
      return fact;
    }
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });

    /** Keeps only ids of this project's rows in `table`. */
    async function existing(table: 'loreEntries' | 'chapters' | 'timelineEvents' | 'canonFacts', ids: unknown): Promise<string[]> {
      const wanted = [...new Set((Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && id !== ''))];
      const rows = (await db.table(table).bulkGet(wanted)) as ({ projectId: string } | undefined)[];
      return wanted.filter((_, i) => rows[i]?.projectId === projectId);
    }

    /** Applies a change to the fact as it is stored right now, so quick edits never overwrite one another. */
    const edit = (factId: string, change: (fact: CanonFact) => Promise<Partial<CanonFact>> | Partial<CanonFact>) =>
      write(async () => {
        const fact = await owned(factId);
        const changes = await change(fact);
        if (Object.keys(changes).length) await db.canonFacts.update(factId, { ...changes, updatedAt: Date.now() });
      });
    const entry = (fact: CanonFact, change: Omit<FactChange, 'id' | 'at'>): FactChange[] => [...fact.history, { id: createId(), at: Date.now(), ...change }];

    /** Finds which paragraph of a chapter or scene contains `quote`, as the text is saved now. */
    async function locate(nodeId: string, quote: string): Promise<number | null> {
      const wanted = normalize(quote);
      const node = await db.chapters.get(nodeId);
      if (!wanted || node?.projectId !== projectId) return null;
      const blocks = docBlocks((await db.chapterContents.get(nodeId))?.doc ?? null);
      const index = blocks.findIndex((block) => normalize(block.text).includes(wanted));
      return index === -1 ? null : index;
    }

    return {
      list: () => db.canonFacts.where('projectId').equals(projectId).toArray(),

      async get(factId: string): Promise<CanonFact | undefined> {
        const fact = await db.canonFacts.get(factId);
        return fact?.projectId === projectId ? fact : undefined;
      },

      /** Records a new fact. It starts as Provisional unless the author says otherwise. */
      create: (input: { subject?: string; statement?: string; status?: CanonStatus; kind?: FactKind; entryIds?: string[] } = {}) =>
        write(async () => {
          const now = Date.now();
          const status = CANON_STATUSES.includes(input.status as CanonStatus) ? input.status! : 'provisional';
          const statement = input.statement?.trim() ?? '';
          const fact: CanonFact = {
            id: createId(), projectId, subject: input.subject?.trim() || 'New fact', statement, kind: FACT_KINDS.includes(input.kind as FactKind) ? input.kind! : 'lore', status,
            entryIds: await existing('loreEntries', input.entryIds), sources: [], conflictsWith: [], replacedById: null, dismissed: [],
            history: [{ id: createId(), at: now, kind: 'created', statement, toStatus: status, reason: '' }], notes: '', createdAt: now, updatedAt: now,
          };
          await db.canonFacts.add(fact);
          return fact;
        }),

      /**
       * Updates details that are not part of the record. The wording of a
       * fact that is Canon or Conflicting cannot be changed here: use
       * `revise`, which archives what it said before.
       */
      update: (factId: string, changes: FactChanges | ((current: CanonFact) => FactChanges)) =>
        edit(factId, async (fact) => {
          const given = typeof changes === 'function' ? changes(fact) : changes;
          const next: Partial<CanonFact> = {};
          if (typeof given.subject === 'string') next.subject = given.subject.trim() || 'Untitled fact';
          if (typeof given.notes === 'string') next.notes = given.notes;
          if (FACT_KINDS.includes(given.kind as FactKind)) next.kind = given.kind;
          if (typeof given.statement === 'string' && given.statement !== fact.statement) {
            if (ESTABLISHED.includes(fact.status)) throw new Error('This statement is on the record. Revise it, so the earlier wording is kept in its history.');
            next.statement = given.statement;
          }
          if ('entryIds' in given) next.entryIds = await existing('loreEntries', given.entryIds);
          if ('replacedById' in given) next.replacedById = given.replacedById && given.replacedById !== factId ? ((await existing('canonFacts', [given.replacedById]))[0] ?? null) : null;
          return next;
        }),

      /**
       * Moves a fact to another canon status. Only ever called because the
       * author chose it; the move is added to the fact's history.
       */
      setStatus: (factId: string, status: CanonStatus, reason = '') =>
        edit(factId, (fact) => {
          if (!CANON_STATUSES.includes(status) || status === fact.status) return {};
          return { status, history: entry(fact, { kind: 'status', statement: fact.statement, fromStatus: fact.status, toStatus: status, reason: reason.trim() }) };
        }),

      /**
       * Replaces a fact's wording and keeps what it said before.
       *
       * For a fact that is Canon or Conflicting this is a retcon: the earlier
       * statement is archived as Retconned, with the time and the reason.
       * `minor` records a correction of wording (a typo, a clearer phrase)
       * instead; the earlier wording is still kept. Nothing is ever erased.
       */
      revise: (factId: string, change: { statement: string; reason?: string; minor?: boolean }) =>
        edit(factId, (fact) => {
          const statement = change.statement.trim();
          if (!statement || statement === fact.statement) return {};
          const kind = ESTABLISHED.includes(fact.status) && !change.minor ? 'retcon' : 'reworded';
          return { statement, history: entry(fact, { kind, statement: fact.statement, newStatement: statement, fromStatus: fact.status, reason: change.reason?.trim() ?? '' }) };
        }),

      /** Adds to or corrects the reason noted on a step of the history. The step itself stays as it was recorded. */
      annotate: (factId: string, changeId: string, reason: string) =>
        edit(factId, (fact) => (fact.history.some((c) => c.id === changeId) ? { history: fact.history.map((c) => (c.id === changeId ? { ...c, reason } : c)) } : {})),

      locate,

      /**
       * Records where a fact was established. For a chapter or scene, a quote
       * is looked up in the saved text to pin the source to its paragraph.
       */
      async addSource(factId: string, input: SourceInput): Promise<FactSource> {
        const type: SourceType = SOURCE_TYPES.includes(input.type as SourceType) ? input.type! : 'note';
        const refId = type === 'note' ? null : ((await existing(SOURCE_TABLES[type], [input.refId]))[0] ?? null);
        const quote = input.quote?.trim() ?? '';
        let block = Number.isInteger(input.block) && input.block! >= 0 ? input.block! : null;
        if (type !== 'chapter' || !refId) block = null;
        else if (block === null && quote) block = await locate(refId, quote);
        // A source that points nowhere is kept as the author's own note of where it came from.
        const source: FactSource = { id: createId(), type: refId ? type : 'note', refId, block, quote, note: input.note?.trim() ?? '', createdAt: Date.now() };
        await edit(factId, (fact) => ({ sources: [...fact.sources, source] }));
        return source;
      },

      removeSource: (factId: string, sourceId: string) => edit(factId, (fact) => ({ sources: fact.sources.filter((s) => s.id !== sourceId) })),

      /** The author says these two statements contradict each other. Neither status is changed. */
      linkConflict: (factId: string, otherId: string) =>
        edit(factId, async (fact) => {
          const [other] = await existing('canonFacts', [otherId]);
          return other && other !== factId && !fact.conflictsWith.includes(other) ? { conflictsWith: [...fact.conflictsWith, other] } : {};
        }),

      /** Removes the link, whichever of the two facts holds it. */
      unlinkConflict: (factId: string, otherId: string) =>
        write(async () => {
          const [fact, other] = [await owned(factId), await owned(otherId)];
          await db.canonFacts.update(fact.id, { conflictsWith: fact.conflictsWith.filter((id) => id !== otherId), updatedAt: Date.now() });
          await db.canonFacts.update(other.id, { conflictsWith: other.conflictsWith.filter((id) => id !== factId), updatedAt: Date.now() });
        }),

      /** The author has looked at a possible contradiction and set it aside. */
      dismiss: (factId: string, dismissal: Dismissal) =>
        edit(factId, (fact) => {
          const clean: Dismissal = dismissal.factId ? { factId: dismissal.factId } : { entryId: dismissal.entryId, field: dismissal.field };
          return (clean.factId || (clean.entryId && clean.field)) && !fact.dismissed.some((d) => JSON.stringify(d) === JSON.stringify(clean)) ? { dismissed: [...fact.dismissed, clean] } : {};
        }),

      /** Brings back everything set aside for this fact, including what was set aside from the other side. */
      undismiss: (factId: string) =>
        write(async () => {
          await owned(factId);
          await db.canonFacts.update(factId, { dismissed: [], updatedAt: Date.now() });
          const others = await db.canonFacts.where('projectId').equals(projectId).toArray();
          for (const other of others) {
            if (other.dismissed.some((d) => d.factId === factId)) await db.canonFacts.update(other.id, { dismissed: other.dismissed.filter((d) => d.factId !== factId) });
          }
        }),

      /** Deletes a fact and its whole history. To keep the record, mark it Non-Canon or Retconned instead. */
      remove: (factId: string) =>
        write(async () => {
          await owned(factId);
          await db.canonFacts.delete(factId);
        }),
    };
  }

  return { forProject };
}

export type CanonService = ReturnType<typeof createCanonService>;
export type ProjectCanon = ReturnType<CanonService['forProject']>;
