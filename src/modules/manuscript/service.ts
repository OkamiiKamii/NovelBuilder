import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import { cleanLabels } from '@/modules/structure/types';
import { removeConnectionsOf } from '@/modules/connections/cascade';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { mentionsIn, remapLinks } from './editor/references';
import { canContain, isDocument, moveError, siblingsOf, subtreeIds } from './tree';
import {
  KIND_LABELS,
  emptyPlan,
  MAIN_DRAFT,
  NODE_STATUSES,
  PLAN_TEXT_FIELDS,
  upgradeStatus,
  type BranchInfo,
  type ChapterBranch,
  type ChapterContent,
  type ChapterPlan,
  type ChapterRevision,
  type DocJSON,
  type ImportItem,
  type NodeKind,
  type NodeStatus,
  type PlanBeat,
  type PlanChanges,
  type RevisionInfo,
  type RevisionReason,
  type StoryNode,
  type TextMetrics,
} from './types';

export class NodeNotFoundError extends Error {
  constructor(id: string) {
    super(`Item ${id} not found in this project`);
    this.name = 'NodeNotFoundError';
  }
}

export class InvalidMoveError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidMoveError';
  }
}

/** The text was saved somewhere else (another tab or window) after this editor loaded it. */
export class SaveConflictError extends Error {
  constructor() {
    super('This text was changed somewhere else since it was opened here.');
    this.name = 'SaveConflictError';
  }
}

/** Automatic history keeps at most one snapshot per interval, and this many per chapter or scene. */
export const REVISION_INTERVAL = 5 * 60_000;
export const MAX_REVISIONS = 50;

export interface SaveOptions {
  /** The revision the editor loaded. Omit to save unconditionally. */
  baseRev?: number;
  /** Overwrite even if the stored text has moved on (the replaced text goes to history). */
  force?: boolean;
  /** Always keep the replaced text in history, tagged with this reason. */
  reason?: RevisionReason;
}

export interface OpenedDoc {
  doc: DocJSON | null;
  rev: number;
  /** Unsaved writing rescued from an interrupted session, newer than `doc`. */
  recovered: { doc: DocJSON; updatedAt: number } | null;
}

export type NodeChanges = Partial<Pick<StoryNode, 'title' | 'summary' | 'notes' | 'status' | 'noteBefore' | 'noteAfter'>>;

/** Links inside a copied document follow the copied codex entries. */
// Links inside the text follow the copied records; whoever wrote it follows the team's copied members.
const relink: NonNullable<Parameters<ProjectRegistry['registerCollection']>[0]['remap']> = (row, mapId) => {
  const by = row.by as { id?: unknown } | null | undefined;
  return { ...row, doc: remapLinks(row.doc, mapId), ...(by && typeof by.id === 'string' ? { by: { ...by, id: mapId(by.id) } } : {}) };
};

/** Hooks the manuscript tables into project isolation, duplication, backup and stats. */
export function registerManuscript(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'chapters',
    refs: ['parentId', 'mentions'],
    fork: (rows, reached) => rows.filter((row) => reached(row.id)),
    // Backup files written before the single status pipeline are brought up to date on the way in.
    remap: ({ publication, ...row }) => ({ ...row, status: upgradeStatus(row.status, publication) }),
  });
  // Plans share their node's id; the codex entries they mention are re-pointed at the copies.
  registry.registerCollection({ table: 'chapterPlans', refs: ['entityIds', 'appearIds', 'mentionIds', 'povIds'], fork: (rows, reached) => rows.filter((row) => reached(row.id)) });
  // Alternate drafts are the author's writing, so they are copied and backed up with the book.
  registry.registerCollection({ table: 'chapterBranches', refs: ['nodeId'], remap: relink, fork: (rows, reached) => rows.filter((row) => reached(row.nodeId)) });
  // Content rows share their node's id, so they are remapped together. Links inside the text follow the copied codex entries.
  registry.registerCollection({ table: 'chapterContents', remap: relink, fork: (rows, reached) => rows.filter((row) => reached(row.id)) });
  registry.registerCollection({ table: 'chapterDrafts', transient: true });
  registry.registerCollection({ table: 'chapterRevisions', refs: ['nodeId'], optional: true, remap: relink });
  registry.registerStats(async (db, projectId) => {
    const nodes = await db.chapters.where('projectId').equals(projectId).toArray();
    const count = (kind: NodeKind) => nodes.filter((n) => n.kind === kind).length;
    return { wordCount: nodes.reduce((n, c) => n + c.wordCount, 0), counts: { chapters: count('chapter'), scenes: count('scene') } };
  });
}

export function createManuscriptService(
  db: NovelDB,
  onProjectChanged: (projectId: string) => Promise<unknown>,
  /** Told about every save of manuscript text and how many words it added or removed. */
  onWritten?: (projectId: string, wordDelta: number) => Promise<unknown>,
) {
  /**
   * Every operation is bound to one project. A node id from another project
   * is treated as not found, so a stale link or id can never read or write
   * across the project boundary.
   */
  function forProject(projectId: string) {
    const all = () => db.chapters.where('projectId').equals(projectId).toArray();

    async function owned(nodeId: string): Promise<StoryNode> {
      const node = await db.chapters.get(nodeId);
      if (!node || node.projectId !== projectId) throw new NodeNotFoundError(nodeId);
      return node;
    }

    async function ownedDocument(nodeId: string): Promise<StoryNode> {
      const node = await owned(nodeId);
      if (!isDocument(node.kind)) throw new NodeNotFoundError(nodeId);
      return node;
    }

    const write = <T>(task: () => Promise<T>): Promise<T> =>
      // All tables are in scope because refreshing project totals reads every module's counts.
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });

    /**
     * The only code that changes structure. It sets `parentId` on the moved
     * node and renumbers `order` within the destination; no other field of
     * any node, and no content row, is touched.
     */
    async function place(nodeId: string, parentId: string | null, beforeId: string | null): Promise<void> {
      const nodes = await all();
      const problem = moveError(nodes, nodeId, parentId);
      if (problem) throw new InvalidMoveError(problem);
      const siblings = siblingsOf(nodes, parentId).filter((n) => n.id !== nodeId);
      const at = beforeId === null ? siblings.length : siblings.findIndex((n) => n.id === beforeId);
      if (at === -1) throw new InvalidMoveError('The place you dropped it no longer exists.');
      const ordered = [...siblings.slice(0, at).map((n) => n.id), nodeId, ...siblings.slice(at).map((n) => n.id)];
      const current = new Map(nodes.map((n) => [n.id, n]));
      await Promise.all(
        ordered.map((id, order) => {
          const node = current.get(id)!;
          if (id === nodeId) return db.chapters.update(id, { parentId, order, updatedAt: Date.now() });
          return node.order === order ? null : db.chapters.update(id, { order });
        }),
      );
    }

    /** A node's versions, oldest first. Ties in time fall back to the revision number, so the order is always the same. */
    const history = async (nodeId: string) =>
      (await db.chapterRevisions.where('nodeId').equals(nodeId).toArray()).sort((a, b) => a.capturedAt - b.capturedAt || a.sourceRev - b.sourceRev || a.id.localeCompare(b.id));

    /**
     * Copies a saved state into history before it is replaced. Automatic
     * captures are rate-limited; a `reason` forces one.
     */
    async function capture(node: StoryNode, content: ChapterContent, reason?: RevisionReason, label = ''): Promise<void> {
      const revisions = await history(node.id);
      const latest = revisions[revisions.length - 1];
      const sourceRev = content.rev ?? 0;
      const now = Date.now();
      if (latest?.sourceRev === sourceRev) {
        // Already in history; a deliberate capture just relabels it.
        if (reason) await db.chapterRevisions.update(latest.id, { reason, label: label || latest.label });
        return;
      }
      if (!reason && latest && now - latest.capturedAt < REVISION_INTERVAL) return;
      const revision: ChapterRevision = {
        id: createId(),
        projectId,
        nodeId: node.id,
        doc: content.doc,
        wordCount: node.wordCount,
        charCount: node.charCount,
        savedAt: content.savedAt ?? node.updatedAt,
        capturedAt: now,
        sourceRev,
        reason: reason ?? 'auto',
        label,
        branchName: node.branchName ?? MAIN_DRAFT,
      };
      await db.chapterRevisions.add(revision);
      // Oldest automatic snapshots make room first; deliberate ones last.
      const all = [...revisions, revision];
      const excess = all.length - MAX_REVISIONS;
      if (excess > 0) {
        const expendable = [...all.filter((r) => r.reason === 'auto'), ...all.filter((r) => r.reason !== 'auto')];
        await db.chapterRevisions.bulkDelete(expendable.slice(0, excess).map((r) => r.id));
      }
    }

    /** Replaces a node's text and counts, and clears its crash draft, in the caller's transaction. */
    async function writeContent(node: StoryNode, doc: DocJSON, words: number, characters: number, previous: ChapterContent | undefined): Promise<number> {
      const rev = (previous?.rev ?? 0) + 1;
      const now = Date.now();
      await db.chapterContents.put({ id: node.id, projectId, doc, rev, savedAt: now });
      await db.chapters.update(node.id, { wordCount: words, charCount: characters, mentions: mentionsIn(doc), updatedAt: now });
      await db.chapterDrafts.delete(node.id);
      return rev;
    }

    return {
      /** Every node in the project, unordered. Build the hierarchy with `buildTree`. */
      list: all,

      async get(nodeId: string): Promise<StoryNode | undefined> {
        const node = await db.chapters.get(nodeId);
        return node?.projectId === projectId ? node : undefined;
      },

      /** Adds a node as the last child of `parentId` (null = top level). */
      create: (kind: NodeKind, parentId: string | null = null, title?: string) =>
        write(async () => {
          const parent = parentId === null ? null : await owned(parentId);
          if (!canContain(parent?.kind ?? null, kind)) {
            throw new InvalidMoveError(kind === 'scene' ? 'A scene must be inside a chapter.' : `A ${kind} cannot be created there.`);
          }
          const nodes = await all();
          const siblings = siblingsOf(nodes, parentId);
          // Scenes are numbered within their chapter; everything else across the book.
          const peers = kind === 'scene' ? siblings : nodes;
          const now = Date.now();
          const node: StoryNode = {
            id: createId(),
            projectId,
            parentId,
            kind,
            title: title?.trim() || `${KIND_LABELS[kind]} ${peers.filter((n) => n.kind === kind).length + 1}`,
            order: siblings.length ? siblings[siblings.length - 1].order + 1 : 0,
            summary: '',
            notes: '',
            status: 'idea',
            wordCount: 0,
            charCount: 0,
            createdAt: now,
            updatedAt: now,
          };
          await db.chapters.add(node);
          return node;
        }),

      update: (nodeId: string, changes: NodeChanges) =>
        write(async () => {
          await owned(nodeId);
          const next: NodeChanges & { updatedAt: number } = { updatedAt: Date.now() };
          if (changes.title !== undefined) next.title = changes.title.trim() || 'Untitled';
          if (changes.summary !== undefined) next.summary = changes.summary;
          if (changes.notes !== undefined) next.notes = changes.notes;
          if (changes.noteBefore !== undefined) next.noteBefore = changes.noteBefore;
          if (changes.noteAfter !== undefined) next.noteAfter = changes.noteAfter;
          if (NODE_STATUSES.includes(changes.status as NodeStatus)) next.status = changes.status;
          await db.chapters.update(nodeId, next);
        }),

      /** Moves a node under `parentId`, in front of sibling `beforeId` (null = last). */
      move: (nodeId: string, parentId: string | null, beforeId: string | null = null) =>
        write(async () => {
          await owned(nodeId);
          if (parentId !== null) await owned(parentId);
          await place(nodeId, parentId, beforeId);
        }),

      /** Moves a node one place up (-1) or down (+1) among its siblings. */
      nudge: (nodeId: string, delta: -1 | 1) =>
        write(async () => {
          const node = await owned(nodeId);
          const siblings = siblingsOf(await all(), node.parentId);
          const from = siblings.findIndex((n) => n.id === nodeId);
          const to = from + delta;
          if (to < 0 || to >= siblings.length) return;
          const before = delta === -1 ? siblings[to] : siblings[to + 1];
          await place(nodeId, node.parentId, before?.id ?? null);
        }),

      /**
       * Deep-copies a node with everything inside it (children, text, notes).
       * Every copy gets a fresh id; the originals are not modified.
       */
      duplicate: (nodeId: string) =>
        write(async () => {
          const source = await owned(nodeId);
          const nodes = await all();
          const ids = subtreeIds(nodes, nodeId);
          const newIds = new Map(ids.map((id) => [id, createId()]));
          const byId = new Map(nodes.map((n) => [n.id, n]));
          const now = Date.now();

          const copies = ids.map((id): StoryNode => {
            const original = byId.get(id)!;
            const isRoot = id === nodeId;
            return {
              ...original,
              id: newIds.get(id)!,
              parentId: isRoot ? original.parentId : newIds.get(original.parentId!)!,
              title: isRoot ? `${original.title} (Copy)` : original.title,
              createdAt: now,
              updatedAt: now,
            };
          });
          const contents = (await db.chapterContents.bulkGet(ids)).flatMap((content) =>
            content ? [{ ...content, id: newIds.get(content.id)! }] : [],
          );
          const plans = (await db.chapterPlans.bulkGet(ids)).flatMap((plan) => (plan ? [{ ...plan, id: newIds.get(plan.id)! }] : []));
          const branches = (await db.chapterBranches.where('nodeId').anyOf(ids).toArray()).map((branch) => ({ ...branch, id: createId(), nodeId: newIds.get(branch.nodeId)! }));
          await db.chapterBranches.bulkAdd(branches);
          await db.chapters.bulkAdd(copies);
          await db.chapterContents.bulkAdd(contents);
          await db.chapterPlans.bulkAdd(plans);

          const siblings = siblingsOf(nodes, source.parentId);
          const next = siblings[siblings.findIndex((n) => n.id === nodeId) + 1];
          await place(newIds.get(nodeId)!, source.parentId, next?.id ?? null);
          return (await db.chapters.get(newIds.get(nodeId)!))!;
        }),

      /** Deletes a node and everything inside it. Returns how many nodes were removed. */
      remove: (nodeId: string) =>
        write(async () => {
          await owned(nodeId);
          const ids = subtreeIds(await all(), nodeId);
          await db.chapterContents.bulkDelete(ids);
          await db.chapterPlans.bulkDelete(ids);
          await db.chapterBranches.where('nodeId').anyOf(ids).delete();
          await db.chapterDrafts.bulkDelete(ids);
          await db.chapterRevisions.where('nodeId').anyOf(ids).delete();
          await removeConnectionsOf(db, ids);
          await db.chapters.bulkDelete(ids);
          return ids.length;
        }),

      /** The plan for a chapter or scene; a blank one if nothing has been planned yet. */
      async getPlan(nodeId: string): Promise<ChapterPlan> {
        await ownedDocument(nodeId);
        return (await db.chapterPlans.get(nodeId)) ?? emptyPlan(nodeId, projectId);
      },

      /** Every plan in the project (for outline views). */
      plans: () => db.chapterPlans.where('projectId').equals(projectId).toArray(),

      /**
       * Updates planning fields. This writes the plan table and the node's
       * "last edited" time, and nothing else: manuscript text is out of reach.
       */
      updatePlan: (nodeId: string, changes: PlanChanges) =>
        write(async () => {
          await ownedDocument(nodeId);
          const now = Date.now();
          const plan: ChapterPlan = { ...((await db.chapterPlans.get(nodeId)) ?? emptyPlan(nodeId, projectId)), updatedAt: now };
          for (const field of PLAN_TEXT_FIELDS) {
            const value = changes[field];
            if (typeof value === 'string') plan[field] = value;
          }
          if (Array.isArray(changes.beats)) {
            plan.beats = changes.beats.flatMap((beat: Partial<PlanBeat> | null) =>
              typeof beat?.text === 'string' && beat.text.trim() ? [{ id: typeof beat.id === 'string' && beat.id ? beat.id : createId(), text: beat.text }] : [],
            );
          }
          if (Array.isArray(changes.entityIds)) {
            // Only this project's codex entries can be attached; unknown or foreign ids are dropped.
            const wanted = [...new Set(changes.entityIds.filter((id): id is string => typeof id === 'string'))];
            const entries = await db.loreEntries.bulkGet(wanted);
            plan.entityIds = wanted.filter((_, i) => entries[i]?.projectId === projectId);
          }
          if ('labels' in changes) plan.labels = cleanLabels(changes.labels);
          // Who appears and who is only mentioned: only this project's characters, each in one list; the list changed now wins.
          for (const [field, other] of [['appearIds', 'mentionIds'], ['mentionIds', 'appearIds']] as const) {
            if (!Array.isArray(changes[field])) continue;
            const wanted = [...new Set(changes[field]!.filter((id): id is string => typeof id === 'string'))];
            const entries = await db.loreEntries.bulkGet(wanted);
            plan[field] = wanted.filter((_, i) => entries[i]?.projectId === projectId && entries[i]?.category === 'character');
            plan[other] = (plan[other] ?? []).filter((id) => !plan[field]!.includes(id));
          }
          // Whose point of view: only this project's characters.
          if (Array.isArray(changes.povIds)) {
            const wanted = [...new Set(changes.povIds.filter((id): id is string => typeof id === 'string'))];
            const entries = await db.loreEntries.bulkGet(wanted);
            plan.povIds = wanted.filter((_, i) => entries[i]?.projectId === projectId && entries[i]?.category === 'character');
          }
          await db.chapterPlans.put(plan);
          await db.chapters.update(nodeId, { updatedAt: now });
          return plan;
        }),

      async loadDoc(nodeId: string): Promise<DocJSON | null> {
        await ownedDocument(nodeId);
        return (await db.chapterContents.get(nodeId))?.doc ?? null;
      },

      /**
       * Loads text for editing. If an interrupted session left unsaved writing
       * that is newer than the saved text, it comes back as `recovered`.
       */
      async openDoc(nodeId: string): Promise<OpenedDoc> {
        const node = await ownedDocument(nodeId);
        const [content, draft] = await Promise.all([db.chapterContents.get(nodeId), db.chapterDrafts.get(nodeId)]);
        const rev = content?.rev ?? 0;
        if (draft && draft.baseRev !== rev) {
          // The saved text moved on after this draft was typed (another tab).
          // Keep the draft in history rather than guess which one is wanted.
          await db.transaction('rw', db.chapterDrafts, db.chapterRevisions, async () => {
            await db.chapterRevisions.add({
              id: createId(), projectId, nodeId, doc: draft.doc, wordCount: node.wordCount, charCount: node.charCount,
              savedAt: draft.updatedAt, capturedAt: Date.now(), sourceRev: -1, reason: 'recovery', label: 'Unsaved draft from an earlier session',
            });
            await db.chapterDrafts.delete(nodeId);
          });
          return { doc: content?.doc ?? null, rev, recovered: null };
        }
        return { doc: content?.doc ?? null, rev, recovered: draft ? { doc: draft.doc, updatedAt: draft.updatedAt } : null };
      },

      /**
       * Persists the document exactly as given, with the counts measured from
       * it. Text, counts, project totals, history and the draft cleanup all
       * commit together or not at all. Returns the new revision number.
       */
      saveDoc: (nodeId: string, doc: DocJSON, metrics: Pick<TextMetrics, 'words' | 'characters'>, options: SaveOptions = {}) =>
        write(async () => {
          const node = await ownedDocument(nodeId);
          const previous = await db.chapterContents.get(nodeId);
          if (options.baseRev !== undefined && options.baseRev !== (previous?.rev ?? 0) && !options.force) throw new SaveConflictError();
          if (previous) await capture(node, previous, options.reason);
          await onWritten?.(projectId, metrics.words - node.wordCount);
          return writeContent(node, doc, metrics.words, metrics.characters, previous);
        }),

      /**
       * Cheap, frequent copy of what is in the editor right now. It touches
       * nothing else, so it can run several times a second while typing.
       */
      async saveDraft(nodeId: string, doc: DocJSON, baseRev: number): Promise<void> {
        await db.transaction('rw', db.chapters, db.chapterDrafts, async () => {
          await ownedDocument(nodeId);
          await db.chapterDrafts.put({ id: nodeId, projectId, doc, baseRev, updatedAt: Date.now() });
        });
      },

      async discardDraft(nodeId: string): Promise<void> {
        await owned(nodeId);
        await db.chapterDrafts.delete(nodeId);
      },

      /** Version history, newest first, without the text. */
      async revisions(nodeId: string): Promise<RevisionInfo[]> {
        await owned(nodeId);
        return (await history(nodeId)).reverse().map(({ doc: _doc, ...info }) => info);
      },

      async getRevision(revisionId: string): Promise<ChapterRevision | undefined> {
        const revision = await db.chapterRevisions.get(revisionId);
        return revision?.projectId === projectId ? revision : undefined;
      },

      /** Keeps the current saved text as a named version. */
      saveVersion: (nodeId: string, label = '') =>
        write(async () => {
          const node = await ownedDocument(nodeId);
          const content = await db.chapterContents.get(nodeId);
          if (!content) throw new Error('There is no saved text to keep a version of yet.');
          await capture(node, content, 'manual', label.trim());
        }),

      /** Files text into history without changing what is saved (used to keep the losing side of a conflict). */
      keepInHistory: (nodeId: string, doc: DocJSON, metrics: Pick<TextMetrics, 'words' | 'characters'>, reason: RevisionReason, label: string) =>
        write(async () => {
          await ownedDocument(nodeId);
          await db.chapterRevisions.add({
            id: createId(), projectId, nodeId, doc, wordCount: metrics.words, charCount: metrics.characters,
            savedAt: Date.now(), capturedAt: Date.now(), sourceRev: -1, reason, label,
          });
        }),

      /** Makes an earlier version current. The text it replaces goes to history first, so this can be undone. */
      restoreRevision: (nodeId: string, revisionId: string) =>
        write(async () => {
          const node = await ownedDocument(nodeId);
          const revision = await db.chapterRevisions.get(revisionId);
          if (!revision || revision.projectId !== projectId || revision.nodeId !== nodeId) throw new NodeNotFoundError(revisionId);
          const previous = await db.chapterContents.get(nodeId);
          if (previous) await capture(node, previous, 'restore', `Before restoring the version from ${new Date(revision.savedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`);
          return writeContent(node, revision.doc, revision.wordCount, revision.charCount, previous);
        }),

      /**
       * Adds a whole imported structure (volumes, chapters, scenes with their
       * text) at the end of `parentId`, all at once or not at all. Importing is
       * not logged as writing.
       */
      importTree: (parentId: string | null, items: ImportItem[]) =>
        write(async () => {
          const parent = parentId === null ? null : await owned(parentId);
          const siblings = siblingsOf(await all(), parentId);
          let order = siblings.length ? siblings[siblings.length - 1].order + 1 : 0;
          const created: string[] = [];
          const now = Date.now();
          const add = async (item: ImportItem, into: string | null, intoKind: NodeKind | null, position: number) => {
            if (!canContain(intoKind, item.kind)) throw new InvalidMoveError(`A ${item.kind} cannot be placed inside ${intoKind ? `a ${intoKind}` : 'the top level'}.`);
            const id = createId();
            const hasText = item.doc !== null && isDocument(item.kind);
            await db.chapters.add({
              id, projectId, parentId: into, kind: item.kind, title: item.title.trim() || `Untitled ${item.kind}`, order: position, summary: '', notes: '',
              status: hasText && item.words > 0 ? 'drafting' : 'idea', wordCount: hasText ? item.words : 0, charCount: hasText ? item.characters : 0, mentions: hasText ? mentionsIn(item.doc) : [], createdAt: now, updatedAt: now,
            });
            if (hasText) await db.chapterContents.put({ id, projectId, doc: item.doc!, rev: 1, savedAt: now });
            created.push(id);
            for (const [index, child] of item.children.entries()) await add(child, id, item.kind, index);
          };
          for (const item of items) await add(item, parentId, parent?.kind ?? null, order++);
          return created;
        }),

      // ----- Alternate drafts -----

      /** The name of the draft that is in the manuscript now. */
      activeDraft: async (nodeId: string): Promise<string> => (await ownedDocument(nodeId)).branchName ?? MAIN_DRAFT,

      /** Alternate drafts of this chapter or scene that are not in the manuscript, oldest first, without their text. */
      async branches(nodeId: string): Promise<BranchInfo[]> {
        await ownedDocument(nodeId);
        return (await db.chapterBranches.where('nodeId').equals(nodeId).sortBy('createdAt')).map(({ doc: _doc, ...info }) => info);
      },

      async getBranch(branchId: string): Promise<ChapterBranch | undefined> {
        const branch = await db.chapterBranches.get(branchId);
        return branch?.projectId === projectId ? branch : undefined;
      },

      /**
       * Sets the current text aside as an alternate draft under `name`, and
       * carries on in the manuscript with a copy of it (or a blank page) as a
       * new draft called `newName`. Nothing is lost: both drafts now exist.
       */
      createBranch: (nodeId: string, newName: string, start: 'copy' | 'blank' = 'copy') =>
        write(async () => {
          const node = await ownedDocument(nodeId);
          const name = newName.trim();
          if (!name) throw new Error('Give the new draft a name.');
          const current = node.branchName ?? MAIN_DRAFT;
          const taken = [current, ...(await db.chapterBranches.where('nodeId').equals(nodeId).toArray()).map((b) => b.name)];
          if (taken.some((n) => n.toLowerCase() === name.toLowerCase())) throw new Error(`This ${node.kind} already has a draft called "${name}".`);

          const content = await db.chapterContents.get(nodeId);
          const now = Date.now();
          await db.chapterBranches.add({ id: createId(), projectId, nodeId, name: current, doc: content?.doc ?? null, wordCount: node.wordCount, charCount: node.charCount, createdAt: now, updatedAt: now });
          await db.chapters.update(nodeId, { branchName: name, updatedAt: now });
          if (start === 'blank') {
            await writeContent({ ...node, branchName: name }, { type: 'doc', content: [{ type: 'paragraph' }] }, 0, 0, content);
          }
        }),

      /**
       * Makes an alternate draft the one in the manuscript. The outgoing text
       * is stored as an alternate under its own name in the same transaction,
       * so a swap can always be swapped back. Word counts follow the swap.
       */
      switchBranch: (nodeId: string, branchId: string) =>
        write(async () => {
          const node = await ownedDocument(nodeId);
          const incoming = await db.chapterBranches.get(branchId);
          if (!incoming || incoming.projectId !== projectId || incoming.nodeId !== nodeId) throw new NodeNotFoundError(branchId);
          const content = await db.chapterContents.get(nodeId);
          const now = Date.now();
          await db.chapterBranches.put({
            ...incoming,
            name: node.branchName ?? MAIN_DRAFT,
            doc: content?.doc ?? null,
            wordCount: node.wordCount,
            charCount: node.charCount,
            updatedAt: now,
          });
          await db.chapters.update(nodeId, { branchName: incoming.name });
          return writeContent(node, incoming.doc ?? { type: 'doc', content: [{ type: 'paragraph' }] }, incoming.wordCount, incoming.charCount, content);
        }),

      /** Renames a draft: pass a branch id for an alternate, or null for the one in the manuscript. */
      renameDraft: (nodeId: string, branchId: string | null, newName: string) =>
        write(async () => {
          const node = await ownedDocument(nodeId);
          const name = newName.trim();
          if (!name) throw new Error('Give the draft a name.');
          const others = await db.chapterBranches.where('nodeId').equals(nodeId).toArray();
          const taken = [...(branchId ? [node.branchName ?? MAIN_DRAFT] : []), ...others.filter((b) => b.id !== branchId).map((b) => b.name)];
          if (taken.some((n) => n.toLowerCase() === name.toLowerCase())) throw new Error(`This ${node.kind} already has a draft called "${name}".`);
          if (branchId === null) return void (await db.chapters.update(nodeId, { branchName: name }));
          if (!others.some((b) => b.id === branchId && b.projectId === projectId)) throw new NodeNotFoundError(branchId);
          await db.chapterBranches.update(branchId, { name });
        }),

      /** Permanently deletes an alternate draft. The draft in the manuscript cannot be deleted this way. */
      deleteBranch: (branchId: string) =>
        write(async () => {
          const branch = await db.chapterBranches.get(branchId);
          if (!branch || branch.projectId !== projectId) throw new NodeNotFoundError(branchId);
          await db.chapterBranches.delete(branchId);
        }),
    };
  }

  return { forProject };
}

export type ManuscriptService = ReturnType<typeof createManuscriptService>;
export type ProjectManuscript = ReturnType<ManuscriptService['forProject']>;
