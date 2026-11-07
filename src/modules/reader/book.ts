import { countWords } from '@/modules/manuscript/metrics';
import { KIND_LABELS, type StoryNode } from '@/modules/manuscript/types';

/** How the book is being looked at: as a printed novel, on an e-reader, or as chapters posted to the web. */
export const FORMATS = ['novel', 'ebook', 'serial'] as const;
export type Format = (typeof FORMATS)[number];
export const FORMAT_LABELS: Record<Format, string> = { novel: 'Standard novel', ebook: 'Ebook', serial: 'Web serial' };
export const FORMAT_HINTS: Record<Format, string> = {
  novel: 'A printed page: title page, part dividers, chapter openers, turned a page at a time.',
  ebook: 'An e-reader: cover, a contents page that jumps, and text that reflows to the screen.',
  serial: 'A chapter as posted online: its number and title, your notes before and after, and Previous / Next.',
};

/** What goes around the story. Kept with the project; shown by the reader and nowhere else yet. */
export interface BookMatter {
  id: string;
  projectId: string;
  dedication: string;
  epigraph: string;
  epigraphSource: string;
  copyright: string;
  acknowledgements: string;
  aboutAuthor: string;
  /** What is printed where a scene ends and another begins. */
  sceneBreak: string;
  updatedAt: number;
}
export const SCENE_BREAKS = ['* * *', '***', '⁂', '—', '#', ''] as const;
export const emptyMatter = (projectId: string): BookMatter => ({ id: projectId, projectId, dedication: '', epigraph: '', epigraphSource: '', copyright: '', acknowledgements: '', aboutAuthor: '', sceneBreak: '* * *', updatedAt: 0 });

/** A node of a saved document (ProseMirror JSON), as far as the reader needs to know it. */
export interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  content?: DocNode[];
}

/** One thing on the page: a block of the author's text exactly as saved, or a scene break. */
export type Piece = { kind: 'text'; node: DocNode } | { kind: 'break' };

export type SectionKind = 'cover' | 'title' | 'copyright' | 'dedication' | 'epigraph' | 'contents' | 'part' | 'chapter' | 'acknowledgements' | 'about';

/** A stretch of the book that starts on its own page. */
export interface Section {
  id: string;
  kind: SectionKind;
  /** What it is called in the table of contents. */
  title: string;
  /** "Chapter 3", "Volume 1": printed above the title when the title says something more. */
  label: string;
  /** For a chapter, its number in the book. */
  number: number | null;
  /** How far in it sits in the contents (a chapter inside a volume is 1). */
  depth: number;
  /** The chapter or group it comes from. */
  nodeId: string | null;
  words: number;
  pieces: Piece[];
  /** Plain text, for front and back matter. */
  text: string;
  noteBefore: string;
  noteAfter: string;
  /** For an epigraph: who said it. */
  source: string;
}

export interface Book {
  title: string;
  subtitle: string;
  author: string;
  cover: string | null;
  accent: string;
  sceneBreak: string;
  sections: Section[];
  /** Words of story (front and back matter are not counted). */
  words: number;
  chapters: number;
}

export interface BookSource {
  project: { title: string; subtitle: string; author: string; cover: string | null; accent: string };
  nodes: (StoryNode & { noteBefore?: string; noteAfter?: string })[];
  docs: Map<string, unknown>;
  matter: BookMatter | null;
}

const inline = (nodes: DocNode[] | undefined): string => (nodes ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : inline(n.content))).join('');
const wordsIn = (node: DocNode): number => (node.type === 'paragraph' || node.type === 'heading' ? countWords(inline(node.content)) : (node.content ?? []).reduce((n, child) => n + wordsIn(child), 0));

/** A line an author typed to mark a scene break: `***`, `* * *`, `#`, `---`, `~~~` or `⁂`, alone in its paragraph. */
export const isBreakLine = (text: string): boolean => /^(?:(?:\*\s*){3,}|#|-{3,}|~{3,}|⁂)$/.test(text.trim());

/** The blocks of one saved document, with typed scene breaks and horizontal rules recognised as breaks. */
function piecesOf(doc: unknown): Piece[] {
  const blocks = ((doc as DocNode | null)?.content ?? []) as DocNode[];
  return blocks.map((node): Piece => (node.type === 'horizontalRule' || (node.type === 'paragraph' && isBreakLine(inline(node.content))) ? { kind: 'break' } : { kind: 'text', node }));
}
const hasText = (pieces: Piece[]): boolean => pieces.some((piece) => piece.kind === 'text' && inline([piece.node]).trim() !== '');

/** Joins the parts of a chapter with a break between each, never two in a row and never one at either end. */
function join(parts: Piece[][]): Piece[] {
  const out: Piece[] = [];
  for (const part of parts.filter(hasText)) {
    if (out.length) out.push({ kind: 'break' });
    out.push(...part);
  }
  // Blank paragraphs at the start or end of a chapter, or beside a scene break, are the editor's spacing, not the page's.
  const blank = (piece: Piece | undefined) => piece?.kind === 'text' && piece.node.type === 'paragraph' && inline(piece.node.content).trim() === '';
  const edge = (piece: Piece | undefined) => !piece || piece.kind === 'break';
  let kept = out;
  for (let before = -1; before !== kept.length; ) {
    before = kept.length;
    kept = kept.filter((piece, i) => !(blank(piece) && (edge(kept[i - 1]) || edge(kept[i + 1]))));
  }
  const tidy = kept.filter((piece, i) => !(piece.kind === 'break' && (i === 0 || kept[i - 1].kind === 'break')));
  while (tidy.length && tidy[tidy.length - 1].kind === 'break') tidy.pop();
  return tidy;
}

const section = (partial: Partial<Section> & Pick<Section, 'id' | 'kind' | 'title'>): Section => ({ label: '', number: null, depth: 0, nodeId: null, words: 0, pieces: [], text: '', noteBefore: '', noteAfter: '', source: '', ...partial });

/**
 * READ-ONLY RENDERING RULE
 * Lays the manuscript out as a book. It is a pure function of what is
 * saved: it reads the chapters, scenes and their text and returns a new
 * description of pages. It holds no reference back to the database and has
 * no way to write to it; nothing shown by the reader can reach the
 * manuscript through here.
 *
 * The order is the manuscript's own. Volumes, acts and arcs become part
 * dividers; each chapter starts a new page and takes in its scenes, with a
 * scene break between them; what each format puts around the story (a
 * cover, a title page, a contents page) is added here.
 */
export function buildBook(source: BookSource, format: Format): Book {
  const { project, nodes, docs } = source;
  const matter = source.matter ?? emptyMatter('');
  const kids = (parentId: string | null) => nodes.filter((node) => node.parentId === parentId).sort((a, b) => a.order - b.order);
  const body: Section[] = [];
  let chapters = 0;
  const partCount = new Map<string, number>();

  const walk = (parentId: string | null, depth: number) => {
    for (const node of kids(parentId)) {
      if (node.kind === 'chapter' || node.kind === 'scene') {
        // A scene outside any chapter stands as a section of its own, unnumbered.
        const scenes = node.kind === 'chapter' ? kids(node.id).filter((child) => child.kind === 'scene') : [];
        const pieces = join([piecesOf(docs.get(node.id)), ...scenes.map((scene) => piecesOf(docs.get(scene.id)))]);
        const number = node.kind === 'chapter' ? ++chapters : null;
        const label = number ? `Chapter ${number}` : '';
        body.push(
          section({
            id: node.id, kind: 'chapter', nodeId: node.id, depth, number, label,
            // A chapter still called "Chapter 3" has no title of its own to print under the number.
            title: node.title.trim() || label || 'Untitled',
            pieces, words: pieces.reduce((n, piece) => n + (piece.kind === 'text' ? wordsIn(piece.node) : 0), 0),
            noteBefore: (node.noteBefore ?? '').trim(), noteAfter: (node.noteAfter ?? '').trim(),
          }),
        );
      } else {
        const count = (partCount.get(node.kind) ?? 0) + 1;
        partCount.set(node.kind, count);
        // A web serial is a run of chapters: the parts they sit in are not pages of their own.
        if (format !== 'serial') body.push(section({ id: node.id, kind: 'part', nodeId: node.id, depth, label: `${KIND_LABELS[node.kind]} ${count}`, title: node.title.trim() || `${KIND_LABELS[node.kind]} ${count}` }));
        walk(node.id, depth + 1);
      }
    }
  };
  walk(null, 0);

  const page = (kind: SectionKind, title: string, text: string): Section[] => (text.trim() ? [section({ id: kind, kind, title, text: text.trim() })] : []);
  const front: Section[] = [];
  const back: Section[] = [];
  if (format !== 'serial') {
    if (format === 'ebook') front.push(section({ id: 'cover', kind: 'cover', title: 'Cover' }));
    front.push(section({ id: 'title', kind: 'title', title: 'Title page' }));
    front.push(...page('copyright', 'Copyright', matter.copyright), ...page('dedication', 'Dedication', matter.dedication));
    if (matter.epigraph.trim()) front.push(section({ id: 'epigraph', kind: 'epigraph', title: 'Epigraph', text: matter.epigraph.trim(), source: matter.epigraphSource.trim() }));
    if (format === 'ebook') front.push(section({ id: 'contents', kind: 'contents', title: 'Contents' }));
    back.push(...page('acknowledgements', 'Acknowledgements', matter.acknowledgements), ...page('about', 'About the author', matter.aboutAuthor));
  }
  return {
    title: project.title, subtitle: project.subtitle, author: project.author, cover: project.cover, accent: project.accent, sceneBreak: matter.sceneBreak,
    sections: [...front, ...body, ...back], words: body.reduce((n, s) => n + s.words, 0), chapters,
  };
}

/** Whether a section's label adds anything to its title ("Chapter 3" above "The Bell", but not above "Chapter 3"). */
export const showsLabel = (s: Pick<Section, 'label' | 'title'>): boolean => Boolean(s.label) && s.label.toLowerCase() !== s.title.trim().toLowerCase();

/** A place in the book: which section, and how far through it (0 to 1). */
export interface Place {
  index: number;
  fraction: number;
}

/** How much of the story lies before a place, from 0 to 1, by words. Front matter counts as the start and back matter as the end. */
export function progressAt(book: Book, place: Place): number {
  if (!book.words) return book.sections.length > 1 ? Math.min(1, place.index / (book.sections.length - 1)) : 0;
  let before = 0;
  for (let i = 0; i < Math.min(place.index, book.sections.length); i++) before += book.sections[i].words;
  const here = book.sections[place.index]?.words ?? 0;
  return Math.min(1, (before + here * Math.min(1, Math.max(0, place.fraction))) / book.words);
}

/** Minutes to read some words, at an unhurried 250 a minute. */
export const readingMinutes = (words: number): number => Math.max(1, Math.round(words / 250));
