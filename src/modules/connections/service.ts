import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import { CANON_STATUSES, type CanonStatus } from '@/modules/canon/types';
import type { LoreLink } from '@/modules/codex/types';
import type { EntityRef } from '@/modules/model/types';
import { validateRef } from '@/modules/model/validate';
import type { Anchor, Validity } from '@/modules/model/validity';
import { PRECISIONS } from '@/modules/timeline/types';

export class InvalidConnectionError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidConnectionError';
  }
}

export interface ConnectionInput {
  from: EntityRef;
  to: EntityRef;
  /** A known kind or the author's own word. `related` when empty. */
  type?: string;
  /** How the `from` side puts it, in the author's words. */
  label?: string;
  /** How the `to` side puts it, only when the author says so. */
  reverseLabel?: string;
  notes?: string;
  canon?: CanonStatus;
  /** When in the story it holds. Absent: always, as far as anyone has said. */
  validity?: Validity;
  /** How it began, and how it ended, in the author's words. */
  how?: string;
  endHow?: string;
}

export type ConnectionChanges = Partial<Pick<ConnectionInput, 'type' | 'label' | 'reverseLabel' | 'notes' | 'canon' | 'validity' | 'how' | 'endHow'>>;
const words = (value: string | undefined): string => (value ?? '').trim().slice(0, 80);

const tableOf = { node: 'chapters', entry: 'loreEntries', event: 'timelineEvents', thread: 'plotThreads', relation: 'characterRelations' } as const;
const typeKey = (type: string | undefined): string => (type ?? '').trim() || 'related';

/**
 * TYPED CONNECTIONS
 * Connections between any two records of a project, stored in the same
 * table as the codex's related entries (`loreLinks`), so there is one place
 * where connections live. A connection holds the two ids and their kinds,
 * never copies of the records. Both ends must exist in this project when it
 * is made; when either is deleted the connection goes with it (see
 * `cascade.ts`). Kinds the author makes up are kept as written.
 */
export function createConnectionService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  function forProject(projectId: string) {
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });

    /** Whether the record exists in this project. */
    async function exists(ref: EntityRef): Promise<boolean> {
      if (ref.type === 'ability') {
        const [systemId, itemId] = ref.id.split('/');
        const system = await db.systems.get(systemId);
        return system?.projectId === projectId && (system.items ?? []).some((item) => item.id === itemId);
      }
      const row = await db.table<{ projectId: string }>(tableOf[ref.type]).get(ref.id);
      return row?.projectId === projectId;
    }

    async function check(from: EntityRef, to: EntityRef): Promise<void> {
      const shape = [...validateRef(from).map((p) => `The first end: ${p}.`), ...validateRef(to).map((p) => `The second end: ${p}.`)];
      if (shape.length) throw new InvalidConnectionError(shape.join(' '));
      if (from.type === to.type && from.id === to.id) throw new InvalidConnectionError('A record cannot be connected to itself.');
      for (const [which, end] of [['first', from], ['second', to]] as const) {
        if (!(await exists(end))) throw new InvalidConnectionError(`The ${which} end (${end.type} ${end.id}) is not in this project.`);
      }
    }

    /** A point in the story must name a chapter or event of this project, or be a date the timeline can read. */
    async function checkAnchor(anchor: Anchor | null, which: string): Promise<void> {
      if (!anchor) return;
      const wrong = (why: string) => new InvalidConnectionError(`When it ${which}: ${why}`);
      if (anchor.kind === 'node' && !(await exists({ type: 'node', id: anchor.nodeId }))) throw wrong('that chapter or scene is not in this project.');
      if (anchor.kind === 'event' && !(await exists({ type: 'event', id: anchor.eventId }))) throw wrong('that event is not in this project.');
      if (anchor.kind === 'date') {
        if (!PRECISIONS.includes(anchor.when?.precision)) throw wrong('that is not a date.');
        if (anchor.when.precision === 'relative' && (!anchor.when.anchorId || !(await exists({ type: 'event', id: anchor.when.anchorId })))) throw wrong('the event the date counts from is not in this project.');
      }
      if (anchor.kind !== 'node' && anchor.kind !== 'event' && anchor.kind !== 'date') throw wrong('that is not a point in the story.');
    }

    async function checkValidity(validity: Validity | undefined): Promise<void> {
      if (!validity) return;
      await checkAnchor(validity.from, 'starts');
      await checkAnchor(validity.until, 'stops');
    }

    async function owned(connectionId: string): Promise<LoreLink> {
      const link = await db.loreLinks.get(connectionId);
      if (!link || link.projectId !== projectId) throw new InvalidConnectionError('That connection is not in this project.');
      return link;
    }

    const canonOf = (canon: unknown): CanonStatus | undefined => (CANON_STATUSES.includes(canon as CanonStatus) ? (canon as CanonStatus) : undefined);

    return {
      list: () => db.loreLinks.where('projectId').equals(projectId).toArray(),

      /** The connections with this record at either end. */
      async of(ref: EntityRef): Promise<LoreLink[]> {
        const rows = await db.loreLinks.where('fromId').equals(ref.id).or('toId').equals(ref.id).toArray();
        return rows.filter((l) => l.projectId === projectId && ((l.fromId === ref.id && (l.fromType ?? 'entry') === ref.type) || (l.toId === ref.id && (l.toType ?? 'entry') === ref.type)));
      },

      create: (input: ConnectionInput) =>
        write(async () => {
          await check(input.from, input.to);
          await checkValidity(input.validity);
          const type = typeKey(input.type);
          // The same statement again; one with a different time is a different state and is kept.
          const twin = (await db.loreLinks.where('fromId').equals(input.from.id).toArray()).find((l) => l.projectId === projectId && l.toId === input.to.id && typeKey(l.type) === type && (l.fromType ?? 'entry') === input.from.type && (l.toType ?? 'entry') === input.to.type && JSON.stringify(l.validity ?? null) === JSON.stringify(input.validity ?? null));
          if (twin) throw new InvalidConnectionError('That connection already exists.');
          const now = Date.now();
          const canon = canonOf(input.canon);
          const link: LoreLink = {
            id: createId(), projectId, fromId: input.from.id, toId: input.to.id, fromLabel: (input.label ?? '').trim(), toLabel: (input.reverseLabel ?? '').trim(), createdAt: now,
            fromType: input.from.type, toType: input.to.type, type, notes: (input.notes ?? '').trim(), ...(canon ? { canon } : {}), ...(input.validity ? { validity: input.validity } : {}), ...(words(input.how) ? { how: words(input.how) } : {}), ...(words(input.endHow) ? { endHow: words(input.endHow) } : {}), updatedAt: now,
          };
          await db.loreLinks.add(link);
          return link;
        }),

      update: (connectionId: string, changes: ConnectionChanges) =>
        write(async () => {
          const current = await owned(connectionId);
          const next: Partial<LoreLink> = { updatedAt: Date.now() };
          if (changes.type !== undefined) next.type = typeKey(changes.type);
          if (changes.label !== undefined) next.fromLabel = changes.label.trim();
          if (changes.reverseLabel !== undefined) next.toLabel = changes.reverseLabel.trim();
          if (changes.notes !== undefined) next.notes = changes.notes.trim();
          if (changes.canon !== undefined) next.canon = canonOf(changes.canon);
          if (changes.how !== undefined) next.how = words(changes.how) || undefined;
          if (changes.endHow !== undefined) next.endHow = words(changes.endHow) || undefined;
          if (changes.validity !== undefined) {
            await checkValidity(changes.validity);
            next.validity = changes.validity;
          }
          await db.loreLinks.update(connectionId, next);
          return { ...current, ...next } as LoreLink;
        }),

      /**
       * Records that something changed at a point in the story, keeping what
       * was true before: this connection stops there, and a new one, with the
       * changes, starts there. The new holder of a sword, the faction someone
       * moves to, a new name for the tie. Returns the new connection.
       */
      change: (connectionId: string, at: Anchor, changes: Partial<Pick<ConnectionInput, 'from' | 'to' | 'type' | 'label' | 'reverseLabel' | 'notes' | 'canon' | 'how'>>) =>
        write(async () => {
          const current = await owned(connectionId);
          await checkAnchor(at, 'changes');
          const from = changes.from ?? { type: current.fromType ?? 'entry', id: current.fromId };
          const to = changes.to ?? { type: current.toType ?? 'entry', id: current.toId };
          await check(from, to);
          const now = Date.now();
          await db.loreLinks.update(connectionId, { validity: { from: current.validity?.from ?? null, until: at }, updatedAt: now });
          const canon = canonOf(changes.canon ?? current.canon);
          const next: LoreLink = {
            id: createId(), projectId, fromId: from.id, toId: to.id, fromType: from.type, toType: to.type, type: changes.type !== undefined ? typeKey(changes.type) : typeKey(current.type),
            fromLabel: (changes.label ?? current.fromLabel).trim(), toLabel: (changes.reverseLabel ?? current.toLabel).trim(), notes: (changes.notes ?? current.notes ?? '').trim(),
            ...(canon ? { canon } : {}), validity: { from: at, until: current.validity?.until ?? null }, ...(words(changes.how) ? { how: words(changes.how) } : {}), createdAt: now, updatedAt: now,
          };
          await db.loreLinks.add(next);
          return next;
        }),

      /** Records that it stopped holding at a point in the story, and how, when the author says. The connection stays, as history. */
      end: (connectionId: string, at: Anchor, endHow?: string) =>
        write(async () => {
          const current = await owned(connectionId);
          await checkAnchor(at, 'stops');
          const validity = { from: current.validity?.from ?? null, until: at };
          await db.loreLinks.update(connectionId, { validity, ...(words(endHow) ? { endHow: words(endHow) } : {}), updatedAt: Date.now() });
          return { ...current, validity, ...(words(endHow) ? { endHow: words(endHow) } : {}) } as LoreLink;
        }),

      /** Removes the connection. The records at its ends are not touched. */
      remove: (connectionId: string) =>
        write(async () => {
          await owned(connectionId);
          await db.loreLinks.delete(connectionId);
        }),
    };
  }
  return { forProject };
}

export type ConnectionService = ReturnType<typeof createConnectionService>;
