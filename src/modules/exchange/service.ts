import type { NovelDB } from '@/core/db';
import { resolveCategories } from '@/modules/codex/schema';
import { isEntryLink } from '@/modules/codex/types';
import type { ManuscriptService } from '@/modules/manuscript/service';
import type { ImportItem } from '@/modules/manuscript/types';
import { compile, type Compiled, type ExportData, type ExportOptions } from './compile';
import { parseDocx } from './import/docx';
import { parseMarkdown, parseRtf, parseText } from './import/parse';
import { metricsOf, toDoc, type ImportNode } from './import/structure';
import type { ImportBlock } from './import/types';
import { renderDocx } from './render/docx';
import { renderPdf } from './render/pdf';
import { renderHtml, renderMarkdown, renderText } from './render/text';

export const EXPORT_FORMATS = ['docx', 'pdf', 'md', 'txt', 'html'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const FORMAT_LABELS: Record<ExportFormat, string> = { docx: 'Word (.docx)', pdf: 'PDF (.pdf)', md: 'Markdown (.md)', txt: 'Plain text (.txt)', html: 'Web page (.html)' };
const MIME: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
  html: 'text/html',
};

export const IMPORT_EXTENSIONS = ['txt', 'md', 'markdown', 'docx', 'rtf'];

/** Renders a compiled document in the chosen format. */
export async function renderExport(compiled: Compiled, format: ExportFormat): Promise<Blob> {
  const body: BlobPart =
    format === 'docx' ? (renderDocx(compiled) as BlobPart)
    : format === 'pdf' ? ((await renderPdf(compiled)) as BlobPart)
    : format === 'md' ? renderMarkdown(compiled)
    : format === 'html' ? renderHtml(compiled)
    : renderText(compiled);
  return new Blob([body], { type: `${MIME[format]}${format === 'docx' || format === 'pdf' ? '' : ';charset=utf-8'}` });
}

/** Reads a manuscript file into neutral blocks, by its extension. */
export function parseFile(name: string, bytes: Uint8Array): ImportBlock[] {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'docx') return parseDocx(bytes);
  if (extension === 'doc') throw new Error('Old-style .doc files cannot be read. Open it in Word and save it as .docx, then import that.');
  const text = new TextDecoder('utf-8').decode(bytes);
  if (extension === 'rtf') return parseRtf(text);
  if (extension === 'md' || extension === 'markdown') return parseMarkdown(text);
  if (extension === 'txt' || extension === '') return parseText(text);
  throw new Error(`“.${extension}” files cannot be imported. Use .txt, .md, .docx or .rtf.`);
}

const toItem = (node: ImportNode): ImportItem => {
  const { words, characters } = metricsOf(node.blocks);
  return { kind: node.kind, title: node.title, doc: toDoc(node.blocks), words, characters, children: node.children.map(toItem) };
};

export function createExchangeService(db: NovelDB, manuscript: ManuscriptService) {
  /** Every operation is bound to one project. */
  function forProject(projectId: string) {
    /** Reads everything an export might include. Read-only. */
    async function gather(): Promise<ExportData> {
      const project = await db.projects.get(projectId);
      if (!project) throw new Error('Project not found.');
      const [nodes, contents, plans, entries, links, revisions, branches, relations, schemas] = await Promise.all([
        db.chapters.where('projectId').equals(projectId).toArray(),
        db.chapterContents.where('projectId').equals(projectId).toArray(),
        db.chapterPlans.where('projectId').equals(projectId).toArray(),
        db.loreEntries.where('projectId').equals(projectId).toArray(),
        db.loreLinks.where('projectId').equals(projectId).filter(isEntryLink).toArray(),
        db.chapterRevisions.where('projectId').equals(projectId).toArray(),
        db.chapterBranches.where('projectId').equals(projectId).toArray(),
        db.characterRelations.where('projectId').equals(projectId).toArray(),
        db.loreSchemas.where('projectId').equals(projectId).toArray(),
      ]);
      return {
        project,
        nodes,
        docs: new Map(contents.map((c) => [c.id, c.doc])),
        plans: new Map(plans.map((p) => [p.id, p])),
        entries,
        links,
        revisions: revisions.map(({ doc: _doc, ...info }) => info),
        branches,
        relations,
        categories: resolveCategories(schemas),
      };
    }

    return {
      gather,
      /** Compiles the export document for the given choices. */
      compile: async (options: ExportOptions): Promise<Compiled> => compile(await gather(), options),
      /** Adds an imported structure to the manuscript. Returns the ids created, in reading order. */
      importNodes: (parentId: string | null, nodes: ImportNode[]) => manuscript.forProject(projectId).importTree(parentId, nodes.map(toItem)),
    };
  }

  return { forProject };
}

export type ExchangeService = ReturnType<typeof createExchangeService>;
