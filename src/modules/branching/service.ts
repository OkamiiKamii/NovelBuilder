import type { NovelDB } from '@/core/db';
import { remapLinks } from '@/modules/manuscript/editor/references';
import { measure } from '@/modules/manuscript/metrics';
import type { ManuscriptService } from '@/modules/manuscript/service';
import { buildTree, flatten, isDocument, subtreeIds } from '@/modules/manuscript/tree';
import type { DocJSON, StoryNode } from '@/modules/manuscript/types';
import type { ProjectService } from '@/modules/projects/service';
import { docBlocks } from '@/modules/search/extract';
import { buildFamilies, familyOf, flattenFamily } from './tree';
import { BRANCH_STATUSES, type BranchStatus, type TimelineNode, type TimelineRecord } from './types';

export interface Divergence {
  /** The chapter or scene in this timeline. */
  nodeId: string;
  title: string;
  /** `new`: written in this timeline. `changed`: inherited, and its text differs from the parent's now. `same`: inherited and identical. */
  state: 'new' | 'changed' | 'same';
  /** The parent's chapter it lines up with, when there is one. */
  parentNodeId: string | null;
  parentTitle: string | null;
  words: number;
}

export interface MergeResult {
  mode: 'replaced' | 'added';
  /** The chapter or scene in the parent that now holds the text. */
  nodeId: string;
  title: string;
}

const metricsOf = (doc: unknown) => measure(docBlocks(doc).map((block) => block.text));
const same = (a: unknown, b: unknown): boolean => JSON.stringify(docBlocks(a)) === JSON.stringify(docBlocks(b));

export function createBranchingService(db: NovelDB, projects: ProjectService, manuscript: ManuscriptService) {
  const record = (projectId: string) => db.timelines.get(projectId);
  /** The record for a project, creating the one an original gets the first time it is needed. */
  async function ensure(projectId: string): Promise<TimelineRecord> {
    const existing = await record(projectId);
    if (existing) return existing;
    const created: TimelineRecord = { id: projectId, parentId: null, forkNodeId: null, forkLabel: '', status: 'main', note: '', origins: {}, createdAt: Date.now() };
    await db.timelines.put(created);
    return created;
  }
  const families = async (): Promise<TimelineNode[]> => buildFamilies(await db.projects.toArray(), await db.timelines.toArray());
  async function family(projectId: string): Promise<TimelineNode> {
    const found = familyOf(await families(), projectId);
    if (!found) throw new Error('That project does not exist.');
    return found;
  }
  /** A timeline and the parent it can be compared with and merged into. */
  async function withParent(projectId: string) {
    const mine = await record(projectId);
    const parent = mine?.parentId ? await db.projects.get(mine.parentId) : undefined;
    if (!mine || !parent) throw new Error('This timeline has no parent to compare with or merge into.');
    return { mine, parent };
  }

  return {
    records: () => db.timelines.toArray(),
    families,
    /** The whole tree of timelines a project belongs to. */
    family,

    /**
     * Starts a new timeline from this project as it stood after `nodeId`
     * (a chapter, a scene, or a volume or arc, meaning the end of it; null
     * for "before the story begins").
     *
     * The new timeline inherits everything up to that point: the
     * manuscript, and whatever each module holds to be true by then:
     * character snapshots, relationships as they stood, plot threads with
     * the developments so far, canon, tracked rules, the whole codex and
     * every system. It is a separate project from the first moment, and
     * nothing done in it afterwards can reach the parent.
     */
    async fork(projectId: string, nodeId: string | null, options: { name?: string; status?: BranchStatus; note?: string } = {}) {
      const parent = await db.projects.get(projectId);
      if (!parent) throw new Error('That project does not exist.');
      const nodes = await db.chapters.where('projectId').equals(projectId).toArray();
      const order = flatten(buildTree(nodes)).map((t) => t.node.id);
      const node = nodeId === null ? null : nodes.find((n) => n.id === nodeId);
      if (node === undefined) throw new Error('That chapter is not in this project.');
      // Everything up to the end of the chosen node is carried over.
      const last = node ? Math.max(...subtreeIds(nodes, node.id).map((id) => order.indexOf(id))) : -1;
      const reached = new Set(order.slice(0, last + 1));
      const status = BRANCH_STATUSES.includes(options.status as BranchStatus) && options.status !== 'main' ? options.status! : 'experimental';
      await ensure(projectId);
      const { project, idMap } = await projects.fork(projectId, reached, { title: options.name?.trim() || `${parent.title} (alternate)` });

      const lore = new Set((await db.loreEntries.where('projectId').equals(projectId).primaryKeys()) as string[]);
      const origins: Record<string, string> = {};
      for (const [from, to] of idMap) if (reached.has(from) || lore.has(from)) origins[to] = from;
      await db.timelines.put({ id: project.id, parentId: projectId, forkNodeId: node?.id ?? null, forkLabel: node?.title ?? 'before the story begins', status, note: options.note?.trim() ?? '', origins, createdAt: Date.now() });
      return project;
    },

    /** Classifies a timeline. Making one the main canon is done with `promote`, so there is never more than one. */
    async setStatus(projectId: string, status: BranchStatus): Promise<void> {
      if (!BRANCH_STATUSES.includes(status)) return;
      if (status === 'main') throw new Error('Promote this timeline to make it the main canon.');
      await db.timelines.update((await ensure(projectId)).id, { status });
    },

    async setNote(projectId: string, note: string): Promise<void> {
      await db.timelines.update((await ensure(projectId)).id, { note });
    },

    /**
     * Makes this timeline the main canon. The one that was main becomes
     * alternate canon. Only the labels change: no text or data moves
     * between timelines.
     */
    async promote(projectId: string): Promise<void> {
      const members = flattenFamily(await family(projectId));
      await db.transaction('rw', db.timelines, async () => {
        for (const member of members) {
          if (member.projectId === projectId) await db.timelines.update((await ensure(member.projectId)).id, { status: 'main' });
          else if (member.status === 'main') await db.timelines.update((await ensure(member.projectId)).id, { status: 'alternate' });
        }
      });
    },

    /** How each chapter and scene of a timeline stands against its parent now. Reads only. */
    async divergence(projectId: string): Promise<Divergence[]> {
      const { mine, parent } = await withParent(projectId);
      const [nodes, parentNodes, contents, parentContents] = await Promise.all([
        db.chapters.where('projectId').equals(projectId).toArray(),
        db.chapters.where('projectId').equals(parent.id).toArray(),
        db.chapterContents.where('projectId').equals(projectId).toArray(),
        db.chapterContents.where('projectId').equals(parent.id).toArray(),
      ]);
      const text = new Map(contents.map((c) => [c.id, c.doc]));
      const parentText = new Map(parentContents.map((c) => [c.id, c.doc]));
      const parentNode = new Map(parentNodes.map((n) => [n.id, n]));
      return flatten(buildTree(nodes)).filter((t) => isDocument(t.node.kind)).map(({ node }): Divergence => {
        const origin = parentNode.get(mine.origins[node.id] ?? '');
        const doc = text.get(node.id) ?? null;
        const state = !origin ? 'new' : same(doc, parentText.get(origin.id) ?? null) ? 'same' : 'changed';
        return { nodeId: node.id, title: node.title, state, parentNodeId: origin?.id ?? null, parentTitle: origin?.title ?? null, words: node.wordCount };
      });
    },

    /**
     * The one deliberate crossing between timelines: copies the text of one
     * chapter or scene into the parent, because the author asked for exactly
     * that. An inherited chapter replaces the parent's text for the same
     * chapter, whose current text is first kept in its version history; a
     * chapter written in this timeline is added to the parent as a new one.
     * Nothing else in the parent is touched, and this timeline is not
     * changed at all.
     */
    async mergeChapter(projectId: string, nodeId: string): Promise<MergeResult> {
      const { mine, parent } = await withParent(projectId);
      const node = await db.chapters.get(nodeId);
      if (!node || node.projectId !== projectId || !isDocument(node.kind)) throw new Error('Choose a chapter or scene of this timeline.');
      const here = await db.projects.get(projectId);
      // Links in the text point at this timeline's codex entries; in the parent they must point at the parent's.
      const doc = remapLinks((await db.chapterContents.get(nodeId))?.doc ?? ({ type: 'doc', content: [{ type: 'paragraph' }] } as DocJSON), (id) => mine.origins[id] ?? id);
      const target = manuscript.forProject(parent.id);
      const existing = await db.chapters.get(mine.origins[nodeId] ?? '');

      if (existing && existing.projectId === parent.id) {
        const current = (await db.chapterContents.get(existing.id))?.doc;
        if (current) await target.keepInHistory(existing.id, current, metricsOf(current), 'restore', `Before merging from “${here?.title ?? 'another timeline'}”`);
        await target.saveDoc(existing.id, doc, metricsOf(doc), { force: true });
        return { mode: 'replaced', nodeId: existing.id, title: existing.title };
      }
      // A new chapter goes under the same volume or chapter it sits in here, when the parent has that one too.
      const container = node.parentId ? await db.chapters.get(mine.origins[node.parentId] ?? '') : undefined;
      const created: StoryNode = await target.create(node.kind, container?.projectId === parent.id ? container.id : null, node.title);
      await target.saveDoc(created.id, doc, metricsOf(doc));
      await db.timelines.update(projectId, { origins: { ...mine.origins, [nodeId]: created.id } });
      return { mode: 'added', nodeId: created.id, title: created.title };
    },

    /** Deletes a timeline's project and its record. Timelines forked from it move up to its parent. */
    async remove(projectId: string): Promise<void> {
      const removed = await record(projectId);
      await projects.remove(projectId);
      await db.transaction('rw', db.timelines, async () => {
        for (const child of await db.timelines.where('parentId').equals(projectId).toArray()) {
          await db.timelines.update(child.id, { parentId: removed?.parentId ?? null, forkNodeId: null, forkLabel: `${child.forkLabel} of “a timeline since deleted”` });
        }
        await db.timelines.delete(projectId);
      });
    },
  };
}

export type BranchingService = ReturnType<typeof createBranchingService>;
