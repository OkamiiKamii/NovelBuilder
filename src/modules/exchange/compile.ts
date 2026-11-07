import { relatedTo } from '@/modules/codex/service';
import { builtinCategory, filledFields } from '@/modules/codex/schema';
import { LORE_CATEGORIES, type Category, type LoreEntry, type LoreLink } from '@/modules/codex/types';
import { buildTree, isDocument, isGroup, type TreeNode } from '@/modules/manuscript/tree';
import {
  KIND_LABELS,
  MAIN_DRAFT,
  PLAN_LABELS,
  STATUS_LABELS,
  type ChapterBranch,
  type ChapterPlan,
  type DocJSON,
  type PlanTextField,
  type RevisionInfo,
  type StoryNode,
} from '@/modules/manuscript/types';
import type { Project } from '@/modules/projects/types';
import { roleOf, stageAt, storyOrder } from '@/modules/relationships/timeline';
import { AFFINITY_LABELS, type CharacterRelation } from '@/modules/relationships/types';

/** What goes into an exported document. Each switch is independent. */
export interface ExportOptions {
  /** The text of chapters and scenes. */
  manuscript: boolean;
  /** Volume and chapter headings, and dividers between scenes. */
  titles: boolean;
  /** The author's private notes (on chapters, scenes and codex entries). */
  notes: boolean;
  /** Codex entries. */
  lore: boolean;
  /** Planning sheets for chapters and scenes. */
  planning: boolean;
  /** The log of saved versions, and the text of alternate drafts. */
  history: boolean;
  /** Export only this volume, arc or chapter (and what is inside it). */
  scopeId?: string | null;
}

export const PRESETS: Record<'reader' | 'bible', ExportOptions> = {
  reader: { manuscript: true, titles: true, notes: false, lore: false, planning: false, history: false },
  bible: { manuscript: true, titles: true, notes: true, lore: true, planning: true, history: false },
};

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export type HeadingRole = 'title' | 'subtitle' | 'part' | 'chapter' | 'section' | 'entry' | 'minor';

/**
 * The format-neutral document every exporter renders from. Adding a format
 * (EPUB, say) means writing one more renderer over these blocks: the
 * hierarchy is already resolved into heading roles and levels, with the
 * places a new page or section starts marked.
 */
export type Block =
  | { type: 'heading'; role: HeadingRole; level: number; text: string; pageBreak?: boolean }
  | { type: 'paragraph'; runs: Run[]; align?: 'left' | 'center' | 'right' | 'justify'; quote?: boolean }
  /** A scene break. */
  | { type: 'divider' }
  /** A labelled line in a planning sheet or codex profile. */
  | { type: 'field'; label: string; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

export interface Compiled {
  title: string;
  author: string;
  blocks: Block[];
  /** Words of manuscript text included. */
  wordCount: number;
  chapterCount: number;
}

/** Everything about a project an export might draw on. */
export interface ExportData {
  project: Project;
  nodes: StoryNode[];
  docs: Map<string, DocJSON>;
  plans: Map<string, ChapterPlan>;
  entries: LoreEntry[];
  links: LoreLink[];
  revisions: RevisionInfo[];
  branches: ChapterBranch[];
  relations?: CharacterRelation[];
  /** The project's categories with their field sets. Defaults to the built-ins. */
  categories?: Category[];
}

interface PMJson {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  content?: PMJson[];
}

function runsOf(nodes: PMJson[] | undefined): Run[] {
  const runs: Run[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') runs.push({ text: '\n' });
    else if (node.type === 'text' && node.text) {
      const has = (mark: string) => node.marks?.some((m) => m.type === mark) || undefined;
      runs.push({ text: node.text, bold: has('bold'), italic: has('italic'), underline: has('underline'), strike: has('strike') });
    } else runs.push(...runsOf(node.content));
  }
  return runs;
}

const plain = (runs: Run[]) => runs.map((r) => r.text).join('');
const ALIGNMENTS = ['left', 'center', 'right', 'justify'];

/** Turns a saved chapter document into blocks, keeping its formatting and every blank line. */
export function docToBlocks(doc: unknown, headingLevel: number): Block[] {
  const blocks: Block[] = [];
  const walk = (node: PMJson, quote: boolean) => {
    if (node.type === 'paragraph') {
      const align = ALIGNMENTS.includes(node.attrs?.textAlign as string) ? (node.attrs!.textAlign as 'left') : undefined;
      blocks.push({ type: 'paragraph', runs: runsOf(node.content), ...(align && align !== 'left' ? { align } : {}), ...(quote ? { quote } : {}) });
    } else if (node.type === 'heading') {
      blocks.push({ type: 'heading', role: 'minor', level: Math.min(6, headingLevel + Number(node.attrs?.level ?? 1) - 1), text: plain(runsOf(node.content)) });
    } else if (node.type === 'horizontalRule') {
      blocks.push({ type: 'divider' });
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      blocks.push({ type: 'list', ordered: node.type === 'orderedList', items: (node.content ?? []).map((item) => plain(runsOf(item.content))) });
    } else {
      for (const child of node.content ?? []) walk(child, quote || node.type === 'blockquote');
    }
  };
  walk((doc ?? {}) as PMJson, false);
  return blocks;
}

const wordsOf = (blocks: Block[]) =>
  blocks.reduce((n, b) => n + (b.type === 'paragraph' ? (plain(b.runs).match(/\S+/g)?.length ?? 0) : 0), 0);

const text = (value: string): Block[] => value.split('\n').map((line) => ({ type: 'paragraph', runs: line ? [{ text: line }] : [] }));

const PLAN_ORDER: PlanTextField[] = ['objective', 'conflict', 'emotionalArc', 'dialogue', 'foreshadowing', 'reveals', 'openQuestions', 'ending'];

/**
 * Builds the export document. Every optional kind of content is added in
 * exactly one place below, behind its own switch, so an unticked box can be
 * verified by reading this function: private notes, planning, lore and
 * history cannot reach the output any other way.
 */
export function compile(data: ExportData, options: ExportOptions): Compiled {
  const { project, nodes } = data;
  const blocks: Block[] = [];
  let wordCount = 0;
  let chapterCount = 0;

  const fullTree = buildTree(nodes);
  const find = (items: TreeNode[], id: string): TreeNode | undefined => {
    for (const item of items) {
      if (item.node.id === id) return item;
      const inside = find(item.children, id);
      if (inside) return inside;
    }
  };
  const scope = options.scopeId ? find(fullTree, options.scopeId) : undefined;
  const roots = scope ? [scope] : fullTree;
  const baseDepth = scope ? scope.depth : 0;
  const entryById = new Map(data.entries.map((e) => [e.id, e]));

  const heading = (role: HeadingRole, level: number, value: string, pageBreak = false) => blocks.push({ type: 'heading', role, level: Math.min(6, level), text: value, ...(pageBreak ? { pageBreak } : {}) });
  const field = (label: string, value: string) => value.trim() && blocks.push({ type: 'field', label, text: value });

  // ----- Title page -----
  if (options.titles) {
    heading('title', 1, scope ? `${project.title}: ${scope.node.title}` : project.title);
    if (project.subtitle && !scope) heading('subtitle', 2, project.subtitle);
    if (project.author) blocks.push({ type: 'paragraph', runs: [{ text: project.author }], align: 'center' });
  }

  // ----- Planning sheet and private notes for one chapter or scene -----
  const sheets = (node: StoryNode, level: number) => {
    if (options.planning && isDocument(node.kind)) {
      const plan = data.plans.get(node.id);
      const entities = (plan?.entityIds ?? []).flatMap((id) => entryById.get(id)?.name ?? []);
      const filled = plan && (PLAN_ORDER.some((f) => plan[f].trim()) || plan.beats.length || entities.length);
      if (filled || node.summary.trim()) {
        heading('minor', level, `Planning: ${node.title}`);
        field('Status', STATUS_LABELS[node.status]);
        if (plan) field(PLAN_LABELS.objective, plan.objective);
        field('Summary', node.summary);
        if (plan?.beats.length) {
          blocks.push({ type: 'field', label: 'Key events & plot beats', text: '' });
          blocks.push({ type: 'list', ordered: true, items: plan.beats.map((b) => b.text) });
        }
        field('Entities involved', entities.join(', '));
        if (plan) for (const f of PLAN_ORDER.slice(1)) field(PLAN_LABELS[f], plan[f]);
      }
    }
    if (options.notes && node.notes.trim()) {
      heading('minor', level, `Author notes: ${node.title}`);
      blocks.push(...text(node.notes));
    }
  };

  // ----- Manuscript, in reading order -----
  const visit = (item: TreeNode, previous: StoryNode | null) => {
    const { node } = item;
    const depth = item.depth - baseDepth;
    const hasSheets = (options.planning || options.notes) && (node.notes.trim() || node.summary.trim() || data.plans.has(node.id));

    if (isGroup(node.kind)) {
      if (options.titles) heading('part', 2 + depth, node.title, true);
      if (options.notes && node.notes.trim()) sheets(node, 3 + depth);
    } else {
      const level = 2 + depth;
      // Headings typed inside the text sit one level below the chapter title (a scene has no title of its own).
      const body = options.manuscript ? docToBlocks(data.docs.get(node.id), node.kind === 'scene' ? level : level + 1) : [];
      const hasText = body.some((b) => b.type !== 'paragraph' || plain(b.runs).trim());
      if (node.kind === 'chapter') {
        chapterCount++;
        if (options.titles || (!options.manuscript && hasSheets)) heading('chapter', level, node.title, options.titles);
        else if (previous && options.manuscript) blocks.push({ type: 'paragraph', runs: [] });
      } else if (options.titles && options.manuscript && previous && hasText) {
        // Scenes are separated by a divider rather than announced by name.
        blocks.push({ type: 'divider' });
      } else if (!options.manuscript && hasSheets && !options.titles) {
        heading('minor', level, node.title);
      }
      if (hasText) {
        blocks.push(...body);
        wordCount += wordsOf(body);
      }
      sheets(node, Math.min(6, level + 1));
    }
    let before: StoryNode | null = isDocument(node.kind) && options.manuscript && data.docs.has(node.id) ? node : null;
    for (const child of item.children) {
      visit(child, child.node.kind === 'scene' ? before : null);
      before = child.node;
    }
  };
  let last: StoryNode | null = null;
  for (const root of roots) {
    visit(root, last);
    last = root.node;
  }

  // ----- Worldbuilding appendix -----
  if (options.lore && data.entries.length && !scope) {
    heading('section', 2, 'Worldbuilding', true);
    const order = storyOrder(nodes);
    for (const category of data.categories ?? LORE_CATEGORIES.map(builtinCategory)) {
      const entries = data.entries.filter((e) => e.category === category.key).sort((a, b) => a.name.localeCompare(b.name));
      if (!entries.length) continue;
      heading('section', 3, category.name);
      for (const entry of entries) {
        heading('entry', 4, entry.name);
        if (entry.summary.trim()) blocks.push(...text(entry.summary));
        for (const f of filledFields(entry, category, (id) => entryById.get(id)?.name)) field(f.label, f.text);
        if (entry.description.trim()) blocks.push(...text(entry.description));
        field('Tags', entry.tags.join(', '));
        field('Related entries', relatedTo(entry.id, data.entries, data.links).map((r) => (r.label ? `${r.entry.name} (${r.label})` : r.entry.name)).join(', '));
        // How this character stands with others at the end of the story.
        field(
          'Relationships',
          (data.relations ?? [])
            .flatMap((relation) => {
              const other = entryById.get(relation.fromId === entry.id ? relation.toId : relation.toId === entry.id ? relation.fromId : '');
              const stage = other && stageAt(relation, null, order);
              return other && stage ? [`${other.name} (${roleOf(stage, relation, other.id)}, ${AFFINITY_LABELS[stage.affinity].toLowerCase()})`] : [];
            })
            .join('; '),
        );
        if (options.notes) field('Author notes', entry.notes);
      }
    }
  }

  // ----- Revision history appendix -----
  if (options.history) {
    const inScope = new Set(roots.flatMap((root) => [root, ...flattenAll(root)]).map((t) => t.node.id));
    const versions = data.revisions.filter((r) => inScope.has(r.nodeId)).sort((a, b) => b.savedAt - a.savedAt);
    const drafts = data.branches.filter((b) => inScope.has(b.nodeId));
    if (versions.length || drafts.length) {
      heading('section', 2, 'Revision history', true);
      const titled = new Map(nodes.map((n) => [n.id, n]));
      for (const node of nodes.filter((n) => versions.some((r) => r.nodeId === n.id) || drafts.some((b) => b.nodeId === n.id))) {
        heading('entry', 3, `${KIND_LABELS[node.kind]}: ${titled.get(node.id)!.title}`);
        const own = versions.filter((r) => r.nodeId === node.id);
        if (own.length) {
          blocks.push({
            type: 'list',
            ordered: false,
            items: own.map((r) => `${r.label || 'Automatic version'} — ${new Date(r.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} — ${r.wordCount.toLocaleString()} words — ${r.branchName ?? MAIN_DRAFT}`),
          });
        }
        for (const draft of drafts.filter((b) => b.nodeId === node.id)) {
          heading('minor', 4, `Alternate draft: ${draft.name}`);
          blocks.push(...docToBlocks(draft.doc, 5));
        }
      }
    }
  }

  return { title: project.title, author: project.author, blocks, wordCount, chapterCount };
}

function flattenAll(item: TreeNode): TreeNode[] {
  return item.children.flatMap((child) => [child, ...flattenAll(child)]);
}
