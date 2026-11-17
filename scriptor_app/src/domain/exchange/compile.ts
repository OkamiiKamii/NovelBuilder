// The format-neutral document every exporter renders from, and the manuscript compiled into it. Pure TypeScript. A port
// of flutter_app/lib/shared/domain/exchange/compile.dart, without the worldbuilding appendix (codex entries, their
// fields, links and relationships), which needs the story model, continuity and relationship rules Scriptor does not
// have yet: asking for it with codex entries present throws CompileNotPortedError rather than leave it out unsaid.

import { type JsonMap, isMap, listOf, mapOrNull, numOrNull, str } from '../json';
import { dartSort, compareNum } from '../manuscript/dartSort';
import { type NodeKind, type StoryNode, isDocument, isGroup, kindLabel, storyNode } from '../outline';
import { nodeStatuses, upgradeNodeStatus } from '../records/nodeStatus';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartTrim } from '../text/dartString';
import { localeCompare } from './collation';

/** What goes into an exported document. Each switch is independent. */
export type ExportOptions = {
  /** The text of chapters and scenes. */
  readonly manuscript: boolean;
  /** Volume and chapter headings, and dividers between scenes. */
  readonly titles: boolean;
  /** The author's private notes (on chapters, scenes and codex entries). */
  readonly notes: boolean;
  /** Codex entries. Not ported yet: see CompileNotPortedError. */
  readonly lore: boolean;
  /** Planning sheets for chapters and scenes. */
  readonly planning: boolean;
  /** The log of saved versions, and the text of alternate drafts. */
  readonly history: boolean;
  /** Export only this volume, arc or chapter (and what is inside it). */
  readonly scopeId?: string | null;
};

/** The clean manuscript for readers. */
export const readerExport: ExportOptions = Object.freeze({
  manuscript: true,
  titles: true,
  notes: false,
  lore: false,
  planning: false,
  history: false,
});

/** Everything an author works from: text, planning, notes and lore. */
export const bibleExport: ExportOptions = Object.freeze({
  manuscript: true,
  titles: true,
  notes: true,
  lore: true,
  planning: true,
  history: false,
});

/** Whether the switches (not the part chosen) are the same. */
export function sameSwitches(a: ExportOptions, b: ExportOptions): boolean {
  return (
    a.manuscript === b.manuscript &&
    a.titles === b.titles &&
    a.notes === b.notes &&
    a.lore === b.lore &&
    a.planning === b.planning &&
    a.history === b.history
  );
}

/** The worldbuilding appendix was asked for and the novel has codex entries: that part of the export is not ported. */
export class CompileNotPortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileNotPortedError';
  }
}

/** A stretch of text with one formatting. */
export class Run {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;

  constructor(
    readonly text: string,
    style: { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean } = {},
  ) {
    this.bold = style.bold ?? false;
    this.italic = style.italic ?? false;
    this.underline = style.underline ?? false;
    this.strike = style.strike ?? false;
  }

  sameStyle(other: Run): boolean {
    return (
      this.bold === other.bold &&
      this.italic === other.italic &&
      this.underline === other.underline &&
      this.strike === other.strike
    );
  }

  toJson(): JsonMap {
    return {
      text: this.text,
      ...(this.bold ? { bold: true } : {}),
      ...(this.italic ? { italic: true } : {}),
      ...(this.underline ? { underline: true } : {}),
      ...(this.strike ? { strike: true } : {}),
    };
  }
}

export type HeadingRole = 'title' | 'subtitle' | 'part' | 'chapter' | 'section' | 'entry' | 'minor';
export type Align = 'left' | 'center' | 'right' | 'justify';

/** The format-neutral document every exporter renders from: the hierarchy already resolved into heading roles and
 * levels, with the places a new page starts marked. Adding a format means writing one more renderer over these. */
export type Block = HeadingBlock | ParagraphBlock | DividerBlock | FieldBlock | ListBlock;

export class HeadingBlock {
  readonly type = 'heading' as const;
  constructor(
    readonly role: HeadingRole,
    readonly level: number,
    readonly text: string,
    readonly pageBreak: boolean = false,
  ) {}

  toJson(): JsonMap {
    return {
      type: 'heading',
      role: this.role,
      level: this.level,
      text: this.text,
      ...(this.pageBreak ? { pageBreak: true } : {}),
    };
  }
}

export class ParagraphBlock {
  readonly type = 'paragraph' as const;
  constructor(
    readonly runs: readonly Run[],
    readonly align: Align | null = null,
    readonly quote: boolean = false,
  ) {}

  get text(): string {
    return this.runs.map((r) => r.text).join('');
  }

  toJson(): JsonMap {
    return {
      type: 'paragraph',
      runs: this.runs.map((r) => r.toJson()),
      ...(this.align !== null ? { align: this.align } : {}),
      ...(this.quote ? { quote: true } : {}),
    };
  }
}

/** A scene break. */
export class DividerBlock {
  readonly type = 'divider' as const;
  toJson(): JsonMap {
    return { type: 'divider' };
  }
}

/** A labelled line in a planning sheet or codex profile. */
export class FieldBlock {
  readonly type = 'field' as const;
  constructor(
    readonly label: string,
    readonly text: string,
  ) {}
  toJson(): JsonMap {
    return { type: 'field', label: this.label, text: this.text };
  }
}

export class ListBlock {
  readonly type = 'list' as const;
  constructor(
    readonly items: readonly string[],
    readonly ordered: boolean,
  ) {}
  toJson(): JsonMap {
    return { type: 'list', ordered: this.ordered, items: [...this.items] };
  }
}

export type Compiled = {
  readonly title: string;
  readonly author: string;
  readonly blocks: readonly Block[];
  /** Words of manuscript text included. */
  readonly wordCount: number;
  readonly chapterCount: number;
};

export function compiledToJson(c: Compiled): JsonMap {
  return {
    title: c.title,
    author: c.author,
    blocks: c.blocks.map((b) => b.toJson()),
    wordCount: c.wordCount,
    chapterCount: c.chapterCount,
  };
}

function maps(value: unknown): JsonMap[] {
  return listOf(value).filter(isMap);
}

function runsOf(nodes: unknown): Run[] {
  const runs: Run[] = [];
  for (const node of maps(nodes)) {
    if (node['type'] === 'hardBreak') {
      runs.push(new Run('\n'));
    } else if (node['type'] === 'text' && str(node['text']).length > 0) {
      const marks = new Set(maps(node['marks']).map((m) => m['type']));
      runs.push(
        new Run(str(node['text']), {
          bold: marks.has('bold'),
          italic: marks.has('italic'),
          underline: marks.has('underline'),
          strike: marks.has('strike'),
        }),
      );
    } else {
      runs.push(...runsOf(node['content']));
    }
  }
  return runs;
}

function plain(runs: readonly Run[]): string {
  return runs.map((r) => r.text).join('');
}

const min6 = (n: number) => (n < 6 ? n : 6);

/** Turns a saved chapter document into blocks, keeping its formatting and every blank line. */
export function docToBlocks(doc: unknown, headingLevel: number): Block[] {
  const blocks: Block[] = [];
  const walk = (node: JsonMap, quote: boolean): void => {
    switch (node['type']) {
      case 'paragraph': {
        const a = mapOrNull(node['attrs'])?.['textAlign'];
        const align: Align | null = a === 'center' ? 'center' : a === 'right' ? 'right' : a === 'justify' ? 'justify' : null;
        blocks.push(new ParagraphBlock(runsOf(node['content']), align, quote));
        break;
      }
      case 'heading': {
        const level = numOrNull(mapOrNull(node['attrs'])?.['level']) ?? 1;
        blocks.push(new HeadingBlock('minor', min6(headingLevel + Math.trunc(level) - 1), plain(runsOf(node['content']))));
        break;
      }
      case 'horizontalRule':
        blocks.push(new DividerBlock());
        break;
      case 'bulletList':
      case 'orderedList':
        blocks.push(
          new ListBlock(
            maps(node['content']).map((item) => plain(runsOf(item['content']))),
            node['type'] === 'orderedList',
          ),
        );
        break;
      default:
        for (const child of maps(node['content'])) walk(child, quote || node['type'] === 'blockquote');
    }
  };
  walk(mapOrNull(doc) ?? {}, false);
  return blocks;
}

/** Words as the original export counted them: runs of non-space characters in paragraphs. */
function wordsOf(blocks: readonly Block[]): number {
  return blocks.reduce((n, b) => n + (b instanceof ParagraphBlock ? (b.text.match(/\S+/g)?.length ?? 0) : 0), 0);
}

function textBlocks(value: string): Block[] {
  return value.split('\n').map((line) => new ParagraphBlock(line.length === 0 ? [] : [new Run(line)]));
}

/** Dart's `intOrNull`: an int, or a double that is a whole number. */
function intOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) ? value : null;
}

/** The record of a saved version that an export lists (not its text). */
type Revision = { nodeId: string; savedAt: number; label: string; wordCount: number; branchName: string | null };

function revisionOf(raw: JsonMap): Revision {
  return {
    nodeId: str(raw['nodeId']),
    savedAt: numOrNull(raw['savedAt']) ?? 0,
    label: str(raw['label']),
    wordCount: intOrNull(raw['wordCount']) ?? 0,
    branchName: typeof raw['branchName'] === 'string' ? raw['branchName'] : null,
  };
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 25, 2026, 12:34 PM", as an English browser writes a medium date and short time (in local time). */
function when(millis: number): string {
  const d = new Date(Math.trunc(millis));
  const h = d.getHours();
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${hour}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The planning sheet's text fields, in order, and their labels (`planTextFields` and `planLabels` in the Flutter
 * app's plot/plot_changes.dart). */
export const planTextFields: readonly string[] = [
  'objective',
  'conflict',
  'emotionalArc',
  'dialogue',
  'foreshadowing',
  'reveals',
  'openQuestions',
  'ending',
];
export const planLabels: Readonly<Record<string, string>> = {
  objective: 'Objective',
  conflict: 'Main conflict',
  emotionalArc: 'Emotional arc',
  dialogue: 'Key dialogue',
  foreshadowing: 'Foreshadowing',
  reveals: 'Information revealed',
  openQuestions: 'Open questions',
  ending: 'Ending target',
};

/** The manuscript as a tree, siblings in order (`buildTree` in the Flutter app's manuscript/board.dart). */
type TreeItem = { node: StoryNode; children: TreeItem[]; depth: number };

function createdAt(n: StoryNode): number {
  return numOrNull(n.raw['createdAt']) ?? 0;
}

/** Siblings as the Flutter app orders them (`compareSiblings` in model/story_order.dart): by order, then when made,
 * then by id. */
function compareSiblings(a: StoryNode, b: StoryNode): number {
  const byOrder = compareNum(a.order, b.order);
  if (byOrder !== 0) return byOrder;
  const byCreated = compareNum(createdAt(a), createdAt(b));
  return byCreated !== 0 ? byCreated : localeCompare(a.id, b.id);
}

/** A parent id as the Flutter app reads one: a string that is not blank. */
function parentOf(node: StoryNode): string | null {
  const v = node.raw['parentId'];
  return typeof v === 'string' && dartTrim(v).length > 0 ? v : null;
}

function buildTree(nodes: readonly StoryNode[]): TreeItem[] {
  const ids = new Set(nodes.map((n) => n.id));
  const byParent = new Map<string | null, StoryNode[]>();
  for (const node of nodes) {
    const p = parentOf(node);
    const key = p !== null && ids.has(p) ? p : null;
    const list = byParent.get(key);
    if (list) list.push(node);
    else byParent.set(key, [node]);
  }
  const build = (parentId: string | null, depth: number): TreeItem[] =>
    dartSort([...(byParent.get(parentId) ?? [])], compareSiblings).map((node) => ({
      node,
      children: build(node.id, depth + 1),
      depth,
    }));
  return build(null, 0);
}

function flattenTree(tree: readonly TreeItem[]): TreeItem[] {
  const out: TreeItem[] = [];
  const walk = (items: readonly TreeItem[]) => {
    for (const item of items) {
      out.push(item);
      walk(item.children);
    }
  };
  walk(tree);
  return out;
}

function compareIds(a: JsonMap, b: JsonMap): number {
  const x = str(a['id']);
  const y = str(b['id']);
  return x < y ? -1 : x > y ? 1 : 0;
}

const statusLabel = (raw: JsonMap) =>
  nodeStatuses.find((s) => s.key === upgradeNodeStatus(raw['status'], raw['publication']))!.label;

/** Builds the export document from a whole novel. Every optional kind of content is added in exactly one place below,
 * behind its own switch, so an unticked box can be verified by reading this function: private notes, planning, lore
 * and history cannot reach the output any other way. A port of the original app's `compile`.
 *
 * Not ported: the worldbuilding appendix (`lore`). When it is asked for, the novel has codex entries and the whole
 * novel is exported (no `scopeId`), this throws CompileNotPortedError; in every other case the Flutter app adds nothing
 * for it either, and the result is the same as the Flutter app's. */
export function compileNovel(snapshot: NovelSnapshot, options: ExportOptions): Compiled {
  const project = snapshot.project;
  const title = str(project['title']);
  const blocks: Block[] = [];
  let wordCount = 0;
  let chapterCount = 0;

  // Rows in the order the original read them: by id.
  const byId = (collection: string) => [...snapshot.rows(collection)].sort(compareIds);
  const docs = new Map<string, unknown>();
  for (const r of snapshot.rows('chapterContents')) docs.set(str(r['id']), r['doc']);
  // The story model indexes rows by id, a later row with the same id replacing an earlier one.
  const lastById = (collection: string) => {
    const m = new Map<string, JsonMap>();
    for (const r of snapshot.rows(collection)) m.set(str(r['id']), r);
    return m;
  };
  const nodeRows = lastById('chapters');
  const nodesById = byId('chapters').map((r) => storyNode(nodeRows.get(str(r['id']))!));
  const plans = lastById('chapterPlans');
  const entryRows = lastById('loreEntries');
  const entries = byId('loreEntries').map((r) => entryRows.get(str(r['id']))!);
  const entryById = new Map<string, JsonMap>();
  for (const e of entries) entryById.set(str(e['id']), e);

  const fullTree = buildTree(nodesById);
  const find = (items: readonly TreeItem[], id: string): TreeItem | null => {
    for (const item of items) {
      if (item.node.id === id) return item;
      const inside = find(item.children, id);
      if (inside) return inside;
    }
    return null;
  };

  const scope = options.scopeId === undefined || options.scopeId === null ? null : find(fullTree, options.scopeId);
  const roots = scope !== null ? [scope] : fullTree;
  const baseDepth = scope?.depth ?? 0;

  if (options.lore && entries.length > 0 && scope === null) {
    throw new CompileNotPortedError(
      'The worldbuilding appendix (codex entries) is not in Scriptor yet: export without the codex.',
    );
  }

  const heading = (role: HeadingRole, level: number, value: string, pageBreak = false) =>
    blocks.push(new HeadingBlock(role, min6(level), value, pageBreak));
  const field = (label: string, value: string) => {
    if (dartTrim(value).length > 0) blocks.push(new FieldBlock(label, value));
  };
  const notesOf = (node: StoryNode) => str(node.raw['notes']);
  const summaryOf = (node: StoryNode) => str(node.raw['summary']);

  // ----- Title page -----
  if (options.titles) {
    heading('title', 1, scope !== null ? `${title}: ${scope.node.title}` : title);
    const subtitle = str(project['subtitle']);
    if (subtitle.length > 0 && scope === null) heading('subtitle', 2, subtitle);
    const author = str(project['author']);
    if (author.length > 0) blocks.push(new ParagraphBlock([new Run(author)], 'center'));
  }

  // ----- Planning sheet and private notes for one chapter or scene -----
  const sheets = (node: StoryNode, level: number) => {
    if (options.planning && isDocument(node.kind)) {
      const plan = plans.get(node.id) ?? null;
      const entities: string[] = [];
      for (const id of listOf(plan?.['entityIds'])) {
        if (typeof id !== 'string') continue;
        const entry = entryById.get(id);
        if (entry) entities.push(str(entry['name']));
      }
      const beats = plan === null ? [] : maps(plan['beats']).map((b) => str(b['text']));
      const filled =
        plan !== null &&
        (planTextFields.some((f) => dartTrim(str(plan[f])).length > 0) || beats.length > 0 || entities.length > 0);
      if (filled || dartTrim(summaryOf(node)).length > 0) {
        heading('minor', level, `Planning: ${node.title}`);
        field('Status', statusLabel(node.raw));
        if (plan !== null) field(planLabels['objective'], str(plan['objective']));
        field('Summary', summaryOf(node));
        if (plan !== null && beats.length > 0) {
          blocks.push(new FieldBlock('Key events & plot beats', ''));
          blocks.push(new ListBlock(beats, true));
        }
        field('Entities involved', entities.join(', '));
        if (plan !== null) {
          for (const f of planTextFields.slice(1)) field(planLabels[f], str(plan[f]));
        }
      }
    }
    if (options.notes && dartTrim(notesOf(node)).length > 0) {
      heading('minor', level, `Author notes: ${node.title}`);
      blocks.push(...textBlocks(notesOf(node)));
    }
  };

  // ----- Manuscript, in reading order -----
  const visit = (item: TreeItem, previous: StoryNode | null): void => {
    const node = item.node;
    const depth = item.depth - baseDepth;
    const hasSheets =
      (options.planning || options.notes) &&
      (dartTrim(notesOf(node)).length > 0 || dartTrim(summaryOf(node)).length > 0 || plans.has(node.id));

    if (isGroup(node.kind)) {
      if (options.titles) heading('part', 2 + depth, node.title, true);
      if (options.notes && dartTrim(notesOf(node)).length > 0) sheets(node, 3 + depth);
    } else {
      const level = 2 + depth;
      // Headings typed inside the text sit one level below the chapter title (a scene has no title of its own).
      const body = options.manuscript ? docToBlocks(docs.get(node.id), node.kind === 'scene' ? level : level + 1) : [];
      const hasText = body.some((b) => !(b instanceof ParagraphBlock) || dartTrim(b.text).length > 0);
      if (node.kind === 'chapter') {
        chapterCount++;
        if (options.titles || (!options.manuscript && hasSheets)) {
          heading('chapter', level, node.title, options.titles);
        } else if (previous !== null && options.manuscript) {
          blocks.push(new ParagraphBlock([]));
        }
      } else if (options.titles && options.manuscript && previous !== null && hasText) {
        // Scenes are separated by a divider rather than announced by name.
        blocks.push(new DividerBlock());
      } else if (!options.manuscript && hasSheets && !options.titles) {
        heading('minor', level, node.title);
      }
      if (hasText) {
        blocks.push(...body);
        wordCount += wordsOf(body);
      }
      sheets(node, min6(level + 1));
    }
    let before: StoryNode | null = isDocument(node.kind) && options.manuscript && docs.has(node.id) ? node : null;
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

  // ----- Revision history appendix -----
  if (options.history) {
    const inScope = new Set<string>();
    for (const root of roots) for (const t of [root, ...flattenTree(root.children)]) inScope.add(t.node.id);
    const versions = dartSort(
      byId('chapterRevisions')
        .filter((r) => inScope.has(str(r['nodeId'])))
        .map(revisionOf),
      (a, b) => compareNum(b.savedAt, a.savedAt),
    );
    const drafts = byId('chapterBranches').filter((r) => inScope.has(str(r['nodeId'])));
    if (versions.length > 0 || drafts.length > 0) {
      heading('section', 2, 'Revision history', true);
      for (const node of nodesById.filter(
        (n) => versions.some((r) => r.nodeId === n.id) || drafts.some((b) => b['nodeId'] === n.id),
      )) {
        const kind: NodeKind | null = node.kind;
        heading('entry', 3, `${kind !== null ? kindLabel[kind] : str(node.raw['kind'])}: ${node.title}`);
        const own = versions.filter((r) => r.nodeId === node.id);
        if (own.length > 0) {
          blocks.push(
            new ListBlock(
              own.map(
                (r) =>
                  `${r.label.length > 0 ? r.label : 'Automatic version'} — ${when(r.savedAt)} — ${thousands(r.wordCount)} words — ${r.branchName ?? 'Main draft'}`,
              ),
              false,
            ),
          );
        }
        for (const draft of drafts.filter((b) => b['nodeId'] === node.id)) {
          heading('minor', 4, `Alternate draft: ${str(draft['name'])}`);
          blocks.push(...docToBlocks(draft['doc'], 5));
        }
      }
    }
  }

  return Object.freeze({
    title,
    author: str(project['author']),
    blocks: Object.freeze(blocks),
    wordCount,
    chapterCount,
  });
}
