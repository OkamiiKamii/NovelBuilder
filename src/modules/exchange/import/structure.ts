import { measure } from '@/modules/manuscript/metrics';
import type { DocJSON, NodeKind } from '@/modules/manuscript/types';
import { plainOf, type ImportBlock } from './types';

export interface ImportNode {
  kind: NodeKind;
  title: string;
  blocks: ImportBlock[];
  children: ImportNode[];
}

export interface ImportOptions {
  /** Start a new chapter at each chapter heading. Off puts everything in one chapter. */
  splitChapters: boolean;
  /** Turn scene breaks (`* * *`, `#`, a rule) into separate scenes. Off keeps them as dividers in the text. */
  splitScenes: boolean;
  /** Used when the file has no chapter headings (usually the file name). */
  fallbackTitle: string;
}

const NUMBER = String.raw`(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[- ]\w+)?|thirty(?:[- ]\w+)?|forty(?:[- ]\w+)?|fifty(?:[- ]\w+)?)`;
const CHAPTER = new RegExp(String.raw`^(?:chapter\s+${NUMBER}\b|(?:prologue|epilogue|interlude|foreword|preface|afterword|introduction)\b)`, 'i');
const GROUP = new RegExp(String.raw`^(volume|book|part|act|arc)\s+${NUMBER}\b`, 'i');
const SCENE_BREAK = /^(?:(?:\*\s*){3,}|#{1,3}|(?:-\s*){3,}|(?:~\s*){3,}|(?:•\s*){3,}|⁂|§|(?:o\s*){3}|(?:x\s*){3})$/i;
const GROUP_KIND: Record<string, NodeKind> = { volume: 'volume', book: 'volume', part: 'volume', act: 'act', arc: 'arc' };
/** Typed "Volume 2" / "Act I" lines outrank any styled heading, in this order. */
const TYPED_LEVEL: Partial<Record<NodeKind, number>> = { volume: -30, act: -20, arc: -10 };
const KIND_AT_DEPTH: NodeKind[] = ['volume', 'act', 'arc'];

const headingText = (block: ImportBlock) => (block.type === 'heading' ? block.text : block.type === 'paragraph' ? plainOf(block.runs) : '').trim();

/**
 * Works out the story structure of an imported document: volumes/acts/arcs,
 * chapters and scenes.
 *
 *  - Conventional headings are recognised by their wording, whether or not
 *    they were styled as headings: "Chapter 12", "Prologue", "PART TWO",
 *    "Act I", and the usual scene-break marks (* * *, #, ---).
 *  - For other styled headings, what follows decides: a heading followed
 *    directly by a deeper heading is a container (volume, act, arc); one
 *    followed by text is a chapter; a deeper heading inside a chapter is a
 *    named scene.
 *  - A single top heading above everything else is the book's title.
 */
export function buildStructure(blocks: ImportBlock[], options: ImportOptions): ImportNode[] {
  const headings = blocks.filter((b): b is Extract<ImportBlock, { type: 'heading' }> => b.type === 'heading');
  const firstHeading = headings[0];
  const isBookTitle = (block: ImportBlock) =>
    block.type === 'heading' && (block.level === 0 || (block === firstHeading && headings.length > 1 && headings.slice(1).every((h) => h.level > block.level) && !CHAPTER.test(block.text) && !GROUP.test(block.text)));

  const roots: ImportNode[] = [];
  const groups: { node: ImportNode; level: number }[] = [];
  let chapter: ImportNode | null = null;
  let chapterLevel = Infinity;
  let scene: ImportNode | null = null;
  let breakPending = false;

  const startGroup = (title: string, level: number, kind?: NodeKind) => {
    while (groups.length && groups[groups.length - 1].level >= level) groups.pop();
    if (groups.length >= KIND_AT_DEPTH.length) groups.length = KIND_AT_DEPTH.length - 1;
    // A typed "Act"/"Arc" keeps its name's kind when it fits; otherwise the depth decides.
    const depthKind = KIND_AT_DEPTH[groups.length];
    const fits = kind && KIND_AT_DEPTH.indexOf(kind) >= groups.length;
    const node: ImportNode = { kind: fits ? kind : depthKind, title, blocks: [], children: [] };
    (groups[groups.length - 1]?.node.children ?? roots).push(node);
    groups.push({ node, level });
    chapter = null;
    scene = null;
    chapterLevel = Infinity;
  };
  const startChapter = (title: string, level = Infinity) => {
    while (groups.length && groups[groups.length - 1].level >= level) groups.pop();
    chapter = { kind: 'chapter', title, blocks: [], children: [] };
    chapterLevel = level;
    (groups[groups.length - 1]?.node.children ?? roots).push(chapter);
    scene = null;
    breakPending = false;
    return chapter;
  };
  const startScene = (title?: string) => {
    const parent = chapter ?? startChapter(options.fallbackTitle);
    if (title === undefined && parent.blocks.length && !parent.children.length) {
      // Text before the first break becomes the first scene, so the chapter is all scenes.
      // (Before a *named* scene heading it is the chapter's own opening, and stays there.)
      parent.children.push({ kind: 'scene', title: 'Scene 1', blocks: parent.blocks, children: [] });
      parent.blocks = [];
    }
    scene = { kind: 'scene', title: title ?? `Scene ${parent.children.length + 1}`, blocks: [], children: [] };
    parent.children.push(scene);
    breakPending = false;
  };
  const addText = (block: ImportBlock) => {
    if (breakPending) startScene();
    const target = scene ?? chapter ?? startChapter(roots.length || groups.length ? 'Opening' : options.fallbackTitle);
    target.blocks.push(block);
  };
  const sceneBreak = () => {
    const target = scene ?? chapter;
    if (!target?.blocks.length) return;
    if (options.splitScenes) breakPending = true;
    else target.blocks.push({ type: 'divider' });
  };

  blocks.forEach((block, index) => {
    const text = headingText(block);
    if (block.type === 'divider' || (block.type === 'paragraph' && SCENE_BREAK.test(text))) return sceneBreak();
    if (!options.splitChapters) return addText(block);
    if (isBookTitle(block)) return;

    const group = GROUP.exec(text);
    if (block.type === 'heading') {
      // A real heading keeps its own level, so what follows at the same level closes it.
      if (group) return startGroup(text, block.level, GROUP_KIND[group[1].toLowerCase()]);
      if (CHAPTER.test(text)) return startChapter(text, block.level);
      const next = blocks[index + 1];
      const leadsToDeeper = next?.type === 'heading' && next.level > block.level;
      if (chapter && block.level > chapterLevel) return options.splitScenes ? startScene(text) : addText(block);
      return leadsToDeeper ? startGroup(text, block.level) : startChapter(text, block.level);
    }
    // An ordinary line that is worded like a heading. A typed chapter line is short and
    // does not read like a sentence ("Chapter one was the hardest.").
    if (text.length <= 80 && !text.includes('\n')) {
      if (group && text.length <= 60) return startGroup(text, TYPED_LEVEL[GROUP_KIND[group[1].toLowerCase()]]!, GROUP_KIND[group[1].toLowerCase()]);
      if (CHAPTER.test(text) && !/[.!?,;]$/.test(text.replace(/^chapter\s+\S+[.:]?\s*/i, 'x'))) return startChapter(text);
    }
    addText(block);
  });

  // Text that came before the first chapter heading is front matter, unless it is the whole document.
  const first = roots[0];
  if (first?.kind === 'chapter' && (first.title === options.fallbackTitle || first.title === 'Opening') && roots.length > 1) first.title = 'Front matter';
  return roots;
}

interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  text?: string;
  content?: PMNode[];
}

/** Builds the editor's document format from imported blocks, text and formatting intact. */
export function toDoc(blocks: ImportBlock[]): DocJSON | null {
  const content: PMNode[] = [];
  for (const block of blocks) {
    if (block.type === 'divider') content.push({ type: 'horizontalRule' });
    else if (block.type === 'heading') content.push({ type: 'heading', attrs: { level: Math.min(3, Math.max(1, block.level)), textAlign: null }, content: [{ type: 'text', text: block.text }] });
    else {
      const inline: PMNode[] = [];
      for (const run of block.runs) {
        const marks = [run.bold && 'bold', run.italic && 'italic', run.underline && 'underline', run.strike && 'strike'].filter(Boolean).map((type) => ({ type: type as string }));
        run.text.split('\n').forEach((piece, i) => {
          if (i) inline.push({ type: 'hardBreak' });
          if (piece) inline.push({ type: 'text', text: piece, ...(marks.length ? { marks } : {}) });
        });
      }
      const paragraph: PMNode = { type: 'paragraph', attrs: { textAlign: block.align && block.align !== 'left' ? block.align : null }, ...(inline.length ? { content: inline } : {}) };
      content.push(block.quote ? { type: 'blockquote', content: [paragraph] } : paragraph);
    }
  }
  return content.length ? ({ type: 'doc', content } as unknown as DocJSON) : null;
}

export const metricsOf = (blocks: ImportBlock[]) => measure(blocks.map((b) => (b.type === 'paragraph' ? plainOf(b.runs) : b.type === 'heading' ? b.text : '')));

export interface ImportSummary {
  volumes: number;
  chapters: number;
  scenes: number;
  words: number;
}

export function summarise(nodes: ImportNode[]): ImportSummary {
  const summary = { volumes: 0, chapters: 0, scenes: 0, words: 0 };
  const walk = (node: ImportNode) => {
    if (node.kind === 'chapter') summary.chapters++;
    else if (node.kind === 'scene') summary.scenes++;
    else summary.volumes++;
    summary.words += metricsOf(node.blocks).words;
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return summary;
}
