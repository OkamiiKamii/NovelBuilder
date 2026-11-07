import { filledFields, unknownCategory } from '@/modules/codex/schema';
import type { Category, LoreEntry } from '@/modules/codex/types';
import { PLAN_LABELS, PLAN_TEXT_FIELDS, type ChapterPlan, type DocJSON, type StoryNode } from '@/modules/manuscript/types';
import type { SearchBlock, SearchField, SearchGroup } from './types';

interface PMJson {
  type?: string;
  text?: string;
  content?: PMJson[];
}

const inlineText = (nodes: PMJson[] | undefined): string =>
  (nodes ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : inlineText(n.content))).join('');

/**
 * The paragraphs and headings of a saved document, in reading order. The
 * position of each item is the same paragraph number the editor uses, which
 * is what lets a search result jump to the exact place.
 */
export function docBlocks(doc: unknown): { heading: boolean; text: string }[] {
  const blocks: { heading: boolean; text: string }[] = [];
  const walk = (node: PMJson | null | undefined) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'paragraph' || node.type === 'heading') blocks.push({ heading: node.type === 'heading', text: inlineText(node.content) });
    else for (const child of node.content ?? []) walk(child);
  };
  walk(doc as PMJson);
  return blocks;
}

const lines = (text: string): string[] => text.split('\n');

/** Every searchable block of a chapter, scene or structural node. */
export function nodeBlocks(node: StoryNode, doc: DocJSON | null, plan?: ChapterPlan | null): SearchBlock[] {
  const blocks: SearchBlock[] = [];
  const add = (group: SearchGroup, field: SearchField, index: number, text: string, label = '') => {
    if (!text.trim()) return;
    blocks.push({
      id: `${node.id}:${field}:${index}`, projectId: node.projectId, entityType: 'node', entityId: node.id,
      entityTitle: node.title, entityKind: node.kind, group, field, label, index, text,
    });
  };
  add('manuscript', 'title', 0, node.title);
  docBlocks(doc).forEach((block, index) => add('manuscript', block.heading ? 'heading' : 'body', index, block.text));
  lines(node.summary).forEach((text, index) => add('notes', 'summary', index, text));
  lines(node.notes).forEach((text, index) => add('notes', 'notes', index, text));
  if (plan) {
    PLAN_TEXT_FIELDS.forEach((field, index) => add('notes', 'plan', index, plan[field], PLAN_LABELS[field]));
    plan.beats.forEach((beat, index) => add('notes', 'plan', 100 + index, beat.text, `Beat ${index + 1}`));
  }
  return blocks;
}

/** Every searchable block of a codex entry. Field values are indexed as a reader sees them (choices, linked entries' names). */
export function entryBlocks(entry: LoreEntry, category: Category = unknownCategory(entry.category), nameOf: (entryId: string) => string | undefined = () => undefined): SearchBlock[] {
  const blocks: SearchBlock[] = [];
  const add = (group: SearchGroup, field: SearchField, index: number, text: string, label = '') => {
    if (!text.trim()) return;
    blocks.push({
      id: `${entry.id}:${field}:${index}`, projectId: entry.projectId, entityType: 'entry', entityId: entry.id,
      entityTitle: entry.name, entityKind: entry.category, group, field, label, index, text,
    });
  };
  add(entry.category, 'name', 0, entry.name);
  lines(entry.summary).forEach((text, index) => add(entry.category, 'summary', index, text));
  lines(entry.description).forEach((text, index) => add(entry.category, 'description', index, text));
  add(entry.category, 'tags', 0, entry.tags.join(', '));
  filledFields(entry, category, nameOf).forEach((field, index) => add(entry.category, 'attribute', index, field.text, field.label));
  lines(entry.notes).forEach((text, index) => add('notes', 'notes', index, text));
  return blocks;
}
