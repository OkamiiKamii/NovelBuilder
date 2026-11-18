// Bringing manuscripts in and taking them out in standard formats. Everything is made on the phone; nothing is sent
// anywhere: a file goes only where the author chooses. A manuscript export is the text (and whatever the author ticks
// in); the full backup of a novel is Library → Backup. A port of flutter_app/lib/features/exchange/exchange_service.dart.

import { type Compiled, type ExportOptions, compileNovel } from '../domain/exchange/compile';
import { parseFile } from '../domain/exchange/importStructure';
import type { ImportBlock } from '../domain/exchange/importParse';
import type { ImportNode } from '../domain/exchange/importStructure';
import { addImportedTree, importItemOf } from '../domain/exchange/importTree';
import { renderDocx } from '../domain/exchange/renderDocx';
import { renderPdf } from '../domain/exchange/renderPdf';
import { renderHtml, renderMarkdown, renderText } from '../domain/exchange/renderText';
import { newId } from '../domain/ids';
import { type TreeItem, buildTree, flattenTree } from '../domain/plot/board';
import { StoryNode } from '../domain/records/storyNode';
import type { NovelStore } from './novelStore';

/** The formats a manuscript can be exported in, as the Flutter app offers them. */
export type ExportFormat = 'docx' | 'pdf' | 'md' | 'txt' | 'html';
export const exportFormats: readonly ExportFormat[] = ['docx', 'pdf', 'md', 'txt', 'html'];
export const exportFormatLabel: Readonly<Record<ExportFormat, string>> = {
  docx: 'Word (.docx)',
  pdf: 'PDF (.pdf)',
  md: 'Markdown (.md)',
  txt: 'Plain text (.txt)',
  html: 'Web page (.html)',
};
/** "Export Word document". */
export const exportFormatNoun: Readonly<Record<ExportFormat, string>> = {
  docx: 'Word document',
  pdf: 'PDF',
  md: 'Markdown',
  txt: 'text',
  html: 'web page',
};
export const exportFormatMime: Readonly<Record<ExportFormat, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
  html: 'text/html',
};

/** Text with characters a file name cannot hold taken out, and runs of spaces made one. */
export function safeName(text: string): string {
  return (
    text
      .trim()
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, '')
      .replace(/\s+/g, ' ')
  );
}

export class ExchangeService {
  constructor(
    private readonly store: NovelStore,
    private readonly clock: () => number = Date.now,
    private readonly createId: () => string = newId,
  ) {}

  /** The export document for the given choices. Read-only. */
  compile(projectId: string, options: ExportOptions): Compiled {
    const snapshot = this.store.load(projectId);
    if (snapshot === null) throw new Error('That novel is no longer in the library.');
    return compileNovel(snapshot, options);
  }

  /** The parts of the book an export can be limited to: volumes, acts, arcs and chapters, in reading order. */
  scopes(projectId: string): TreeItem[] {
    const nodes = this.store.rowsIn(projectId, 'chapters').map((r) => new StoryNode(r));
    return flattenTree(buildTree(nodes)).filter((item) => item.node.kindKey !== 'scene');
  }

  /** The volumes, acts and arcs an import can be added into, in reading order. */
  groups(projectId: string): TreeItem[] {
    const nodes = this.store.rowsIn(projectId, 'chapters').map((r) => new StoryNode(r));
    return flattenTree(buildTree(nodes)).filter((item) => ['volume', 'act', 'arc'].includes(item.node.kindKey));
  }

  /** The file's bytes. Throws PdfCannotDraw when a PDF would lose letters. */
  render(compiled: Compiled, format: ExportFormat): Uint8Array {
    const encode = (text: string) => new TextEncoder().encode(text);
    switch (format) {
      case 'docx':
        return renderDocx(compiled);
      case 'pdf':
        return renderPdf(compiled, { creator: 'Scriptor' });
      case 'md':
        return encode(renderMarkdown(compiled));
      case 'txt':
        return encode(renderText(compiled));
      case 'html':
        return encode(renderHtml(compiled));
    }
  }

  /** "The Ember Crown.docx", or "The Ember Crown - Book One.docx" for one part: safe on any file system. */
  static fileName(title: string, format: ExportFormat, part: string | null = null): string {
    const base = safeName(title).length === 0 ? 'Untitled novel' : safeName(title);
    const scope = part === null || safeName(part).length === 0 ? '' : ` - ${safeName(part)}`;
    return `${base}${scope}.${format}`;
  }

  /** Reads a manuscript file. Throws ImportException with a reason; nothing is added either way. */
  read(fileName: string, bytes: Uint8Array): ImportBlock[] {
    return parseFile(fileName, bytes);
  }

  /** Adds an imported structure to the manuscript, after everything under `parentId`, in one transaction (all or
   * nothing). Returns the ids created, in reading order. */
  importNodes(projectId: string, parentId: string | null, nodes: readonly ImportNode[]): string[] {
    const before = this.store.loadPart(projectId, ['chapters', 'chapterContents']);
    if (before === null) throw new Error('That novel is no longer in the library.');
    const r = addImportedTree(before, parentId, nodes.map(importItemOf), { now: this.clock(), createId: this.createId });
    this.store.saveChanges(before, r.snapshot);
    return r.created;
  }
}
