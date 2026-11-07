import type { LoreEntry } from '@/modules/codex/types';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import type { ChapterPlan, StoryNode } from '@/modules/manuscript/types';

/**
 * The cross-reference graph is not stored anywhere on its own. Every link
 * lives with the thing that makes it (a link in a chapter's text, an entity
 * on a planning sheet, a timeline event's cast, a related-entry link, a
 * relationship), always as a permanent id. These functions read those sources
 * and answer "what points at this?", so backlinks can never drift out of date
 * and deleting something leaves nothing to clean up here.
 */

export interface ChapterReference {
  node: StoryNode;
  /** Linked inside the chapter's or scene's text. */
  inText: boolean;
  /** Listed under "Entities involved" on its planning sheet. */
  inPlan: boolean;
  /** The author's appearance record: on the page here, or only mentioned (Prompt 31). */
  appears: boolean;
  mentionedOnly: boolean;
}

/** Every chapter and scene that refers to a codex entry, in reading order. */
export function chaptersReferencing(entryId: string, nodes: StoryNode[], plans: ChapterPlan[]): ChapterReference[] {
  const planned = new Set(plans.filter((p) => p.entityIds.includes(entryId)).map((p) => p.id));
  const appears = new Set(plans.filter((p) => (p.appearIds ?? []).includes(entryId)).map((p) => p.id));
  const mentionedOnly = new Set(plans.filter((p) => (p.mentionIds ?? []).includes(entryId)).map((p) => p.id));
  return flatten(buildTree(nodes))
    .map((t) => t.node)
    .filter((node) => isDocument(node.kind))
    .map((node) => ({ node, inText: node.mentions?.includes(entryId) ?? false, inPlan: planned.has(node.id), appears: appears.has(node.id), mentionedOnly: mentionedOnly.has(node.id) }))
    .filter((ref) => ref.inText || ref.inPlan || ref.appears || ref.mentionedOnly);
}

export interface EntryReference {
  entry: LoreEntry;
  inText: boolean;
  inPlan: boolean;
}

/** Every codex entry a chapter or scene refers to. Entries that no longer exist are left out. */
export function entriesReferencedBy(node: StoryNode, plan: ChapterPlan | undefined, entries: LoreEntry[]): EntryReference[] {
  const inText = new Set(node.mentions ?? []);
  const inPlan = new Set(plan?.entityIds ?? []);
  return entries
    .filter((entry) => inText.has(entry.id) || inPlan.has(entry.id))
    .map((entry) => ({ entry, inText: inText.has(entry.id), inPlan: inPlan.has(entry.id) }))
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name));
}
