// The story structure of an imported manuscript (volumes, acts and arcs, chapters and scenes), the editor's document
// made from its text, and reading a file by its extension. A port of
// flutter_app/lib/shared/domain/exchange/import_structure.dart.

import type { JsonMap } from '../json';
import type { NodeKind } from '../outline';
import { measure, type Measure } from '../prose';
import { dartTrim } from '../text/dartString';
import { parseDocx } from './importDocx';
import { type ImportBlock, ImportDivider, ImportException, ImportHeading, parseMarkdown, parseRtf, parseText } from './importParse';
import { decodeUtf8Lenient } from './utf8';

/** A volume, act, arc, chapter or scene an imported file will become, with its text. */
export class ImportNode {
  readonly children: ImportNode[] = [];
  constructor(
    public kind: NodeKind,
    public title: string,
    public blocks: ImportBlock[] = [],
  ) {}
}

export type ImportOptions = {
  /** Start a new chapter at each chapter heading. Off puts everything in one chapter. */
  splitChapters: boolean;
  /** Turn scene breaks (`* * *`, `#`, a rule) into separate scenes. Off keeps them as dividers in the text. */
  splitScenes: boolean;
  /** Used when the file has no chapter headings (usually the file name). */
  fallbackTitle: string;
};

const number =
  '(?:\\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[- ]\\w+)?|thirty(?:[- ]\\w+)?|forty(?:[- ]\\w+)?|fifty(?:[- ]\\w+)?)';
const chapterPattern = new RegExp(`^(?:chapter\\s+${number}\\b|(?:prologue|epilogue|interlude|foreword|preface|afterword|introduction)\\b)`, 'i');
const groupPattern = new RegExp(`^(volume|book|part|act|arc)\\s+${number}\\b`, 'i');
const sceneBreakPattern = /^(?:(?:\*\s*){3,}|#{1,3}|(?:-\s*){3,}|(?:~\s*){3,}|(?:•\s*){3,}|⁂|§|(?:o\s*){3}|(?:x\s*){3})$/i;
const groupKind: Readonly<Record<string, NodeKind>> = { volume: 'volume', book: 'volume', part: 'volume', act: 'act', arc: 'arc' };

/** Typed "Volume 2" / "Act I" lines outrank any styled heading, in this order. */
const typedLevel: Partial<Record<NodeKind, number>> = { volume: -30, act: -20, arc: -10 };
const kindAtDepth: readonly NodeKind[] = ['volume', 'act', 'arc'];

const headingText = (block: ImportBlock) => dartTrim(block.type === 'divider' ? '' : block.text);

/** Works out the story structure of an imported document. A port of the original app's `buildStructure`:
 *  - Conventional headings are recognised by their wording, whether or not they were styled as headings: "Chapter 12",
 *    "Prologue", "PART TWO", "Act I", and the usual scene-break marks (* * *, #, ---).
 *  - For other styled headings, what follows decides: a heading followed directly by a deeper heading is a container
 *    (volume, act, arc); one followed by text is a chapter; a deeper heading inside a chapter is a named scene.
 *  - A single top heading above everything else is the book's title. */
export function buildStructure(blocks: readonly ImportBlock[], options: ImportOptions): ImportNode[] {
  const headings = blocks.filter((b): b is ImportHeading => b.type === 'heading');
  const firstHeading = headings.length === 0 ? null : headings[0];
  const isBookTitle = (block: ImportBlock) =>
    block.type === 'heading' &&
    (block.level === 0 ||
      (block === firstHeading &&
        headings.length > 1 &&
        headings.slice(1).every((h) => h.level > block.level) &&
        !chapterPattern.test(block.text) &&
        !groupPattern.test(block.text)));

  const roots: ImportNode[] = [];
  const groups: { node: ImportNode; level: number }[] = [];
  let chapter: ImportNode | null = null;
  let chapterLevel = Infinity;
  let scene: ImportNode | null = null;
  let breakPending = false;

  const siblings = () => (groups.length === 0 ? roots : groups[groups.length - 1].node.children);

  const startGroup = (title: string, level: number, kind: NodeKind | null = null) => {
    while (groups.length > 0 && groups[groups.length - 1].level >= level) groups.pop();
    if (groups.length >= kindAtDepth.length) groups.splice(kindAtDepth.length - 1, groups.length);
    // A typed "Act"/"Arc" keeps its name's kind when it fits; otherwise the depth decides.
    const depthKind = kindAtDepth[groups.length];
    const fits = kind !== null && kindAtDepth.indexOf(kind) >= groups.length;
    const node = new ImportNode(fits ? kind : depthKind, title);
    siblings().push(node);
    groups.push({ node, level });
    chapter = null;
    scene = null;
    chapterLevel = Infinity;
  };

  const startChapter = (title: string, level = Infinity): ImportNode => {
    while (groups.length > 0 && groups[groups.length - 1].level >= level) groups.pop();
    const made = new ImportNode('chapter', title);
    chapter = made;
    chapterLevel = level;
    siblings().push(made);
    scene = null;
    breakPending = false;
    return made;
  };

  const startScene = (title: string | null = null) => {
    const parent = chapter ?? startChapter(options.fallbackTitle);
    if (title === null && parent.blocks.length > 0 && parent.children.length === 0) {
      // Text before the first break becomes the first scene, so the chapter is all scenes.
      // (Before a *named* scene heading it is the chapter's own opening, and stays there.)
      parent.children.push(new ImportNode('scene', 'Scene 1', parent.blocks));
      parent.blocks = [];
    }
    const made = new ImportNode('scene', title ?? `Scene ${parent.children.length + 1}`);
    scene = made;
    parent.children.push(made);
    breakPending = false;
  };

  const addText = (block: ImportBlock) => {
    if (breakPending) startScene();
    const target = scene ?? chapter ?? startChapter(roots.length > 0 || groups.length > 0 ? 'Opening' : options.fallbackTitle);
    target.blocks.push(block);
  };

  const sceneBreak = () => {
    const target = scene ?? chapter;
    if (target === null || target.blocks.length === 0) return;
    if (options.splitScenes) {
      breakPending = true;
    } else {
      target.blocks.push(new ImportDivider());
    }
  };

  blocks.forEach((block, index) => {
    const text = headingText(block);
    if (block.type === 'divider' || (block.type === 'paragraph' && sceneBreakPattern.test(text))) {
      sceneBreak();
      return;
    }
    if (!options.splitChapters) {
      addText(block);
      return;
    }
    if (isBookTitle(block)) return;

    const group = groupPattern.exec(text);
    if (block.type === 'heading') {
      // A real heading keeps its own level, so what follows at the same level closes it.
      if (group !== null) {
        startGroup(text, block.level, groupKind[group[1].toLowerCase()] ?? null);
        return;
      }
      if (chapterPattern.test(text)) {
        startChapter(text, block.level);
        return;
      }
      const next = index + 1 < blocks.length ? blocks[index + 1] : null;
      const leadsToDeeper = next !== null && next.type === 'heading' && next.level > block.level;
      if (chapter !== null && block.level > chapterLevel) {
        if (options.splitScenes) startScene(text);
        else addText(block);
        return;
      }
      if (leadsToDeeper) startGroup(text, block.level);
      else startChapter(text, block.level);
      return;
    }
    // An ordinary line that is worded like a heading. A typed chapter line is short and does not read like a
    // sentence ("Chapter one was the hardest.").
    if (text.length <= 80 && !text.includes('\n')) {
      if (group !== null && text.length <= 60) {
        const kind = groupKind[group[1].toLowerCase()];
        startGroup(text, typedLevel[kind]!, kind);
        return;
      }
      if (chapterPattern.test(text) && !/[.!?,;]$/.test(text.replace(/^chapter\s+\S+[.:]?\s*/i, 'x'))) {
        startChapter(text);
        return;
      }
    }
    addText(block);
  });

  // Text that came before the first chapter heading is front matter, unless it is the whole document.
  const first = roots.length === 0 ? null : roots[0];
  if (first !== null && first.kind === 'chapter' && (first.title === options.fallbackTitle || first.title === 'Opening') && roots.length > 1) {
    first.title = 'Front matter';
  }
  return roots;
}

/** Builds the editor's document format (ProseMirror JSON) from imported blocks, text and formatting intact. Null when
 * there is no text. */
export function toDoc(blocks: readonly ImportBlock[]): JsonMap | null {
  const content: JsonMap[] = [];
  for (const block of blocks) {
    if (block.type === 'divider') {
      content.push({ type: 'horizontalRule' });
    } else if (block.type === 'heading') {
      content.push({
        type: 'heading',
        attrs: { level: Math.min(3, Math.max(1, block.level)), textAlign: null },
        content: [{ type: 'text', text: block.text }],
      });
    } else {
      const inline: JsonMap[] = [];
      for (const run of block.runs) {
        const marks = [
          ...(run.bold ? [{ type: 'bold' }] : []),
          ...(run.italic ? [{ type: 'italic' }] : []),
          ...(run.underline ? [{ type: 'underline' }] : []),
          ...(run.strike ? [{ type: 'strike' }] : []),
        ];
        run.text.split('\n').forEach((piece, i) => {
          if (i > 0) inline.push({ type: 'hardBreak' });
          if (piece.length > 0) inline.push(marks.length > 0 ? { type: 'text', text: piece, marks } : { type: 'text', text: piece });
        });
      }
      const paragraph: JsonMap = {
        type: 'paragraph',
        attrs: { textAlign: block.align !== null && block.align !== 'left' ? block.align : null },
        ...(inline.length > 0 ? { content: inline } : {}),
      };
      content.push(block.quote ? { type: 'blockquote', content: [paragraph] } : paragraph);
    }
  }
  return content.length === 0 ? null : { type: 'doc', content };
}

export function metricsOf(blocks: readonly ImportBlock[]): Measure {
  return measure(blocks.map((b) => (b.type === 'divider' ? '' : b.text)));
}

export type ImportSummary = { volumes: number; chapters: number; scenes: number; words: number };

export function summarise(nodes: readonly ImportNode[]): ImportSummary {
  const summary: ImportSummary = { volumes: 0, chapters: 0, scenes: 0, words: 0 };
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

/** Reads a manuscript file into neutral blocks, by its extension. Throws ImportException with a reason. */
export function parseFile(name: string, bytes: Uint8Array): ImportBlock[] {
  const dot = name.lastIndexOf('.');
  const extension = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  if (extension === 'docx') return parseDocx(bytes);
  if (extension === 'doc') {
    throw new ImportException('Old-style .doc files cannot be read. Open it in Word and save it as .docx, then import that.');
  }
  // A byte-order mark is dropped, as a browser's decoder drops it.
  const text = decodeUtf8Lenient(bytes).replace(/^﻿/, '');
  if (extension === 'rtf') return parseRtf(text);
  if (extension === 'md' || extension === 'markdown') return parseMarkdown(text);
  if (extension === 'txt' || extension.length === 0) return parseText(text);
  throw new ImportException(`“.${extension}” files cannot be imported. Use .txt, .md, .docx or .rtf.`);
}
