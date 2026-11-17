// The book as it is read: a title page, front matter, parts, chapters (each taking in its scenes, with a scene break
// between them) and back matter, laid out from what is saved. Pure TypeScript. A port of
// flutter_app/lib/shared/domain/reader/book.dart.

import { type JsonMap, isMap, listOf, mapOrNull, str, strOrNull } from '../json';
import { type StoryNode, kindLabel, storyNode } from '../outline';
import { countWords } from '../prose';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { stableSorted } from './stableSort';

/** How the book is being looked at: as a printed novel, on an e-reader, or as chapters posted to the web. */
export type BookFormat = 'novel' | 'ebook' | 'serial';

export const bookFormats: readonly { key: BookFormat; label: string; hint: string }[] = [
  {
    key: 'novel',
    label: 'Standard novel',
    hint: 'A printed page: title page, part dividers, chapter openers, turned a page at a time.',
  },
  {
    key: 'ebook',
    label: 'Ebook',
    hint: 'An e-reader: cover, a contents page that jumps, and text that reflows to the screen.',
  },
  {
    key: 'serial',
    label: 'Web serial',
    hint: 'A chapter as posted online: its number and title, your notes before and after, and Previous / Next.',
  },
];

export function bookFormatLabel(format: BookFormat): string {
  return bookFormats.find((f) => f.key === format)!.label;
}

/** The scene-break marks offered, as in the original app ('' prints a blank gap). */
export const sceneBreaks: readonly string[] = ['* * *', '***', '⁂', '—', '#', ''];

/** What goes around the story: dedication, epigraph, copyright, acknowledgements, about the author, and the mark
 * printed between scenes. One row per novel in `bookMatter`, as the original app keeps it. */
export class BookMatter {
  constructor(readonly raw: JsonMap) {}

  get dedication(): string {
    return str(this.raw['dedication']);
  }
  get epigraph(): string {
    return str(this.raw['epigraph']);
  }
  get epigraphSource(): string {
    return str(this.raw['epigraphSource']);
  }
  get copyright(): string {
    return str(this.raw['copyright']);
  }
  get acknowledgements(): string {
    return str(this.raw['acknowledgements']);
  }
  get aboutAuthor(): string {
    return str(this.raw['aboutAuthor']);
  }

  /** The cast list printed before the story, as the author keeps it: one a line, "Name — who they are", a line ending
   * in ":" heading a group (`castLines` reads it). */
  get castList(): string {
    return str(this.raw['castList']);
  }

  /** What the cast list is called on its page and in the contents. */
  get castTitle(): string {
    const t = dartTrim(str(this.raw['castTitle']));
    return t.length === 0 ? 'Dramatis Personae' : t;
  }

  /** What is printed where a scene ends and another begins. */
  get sceneBreak(): string {
    return str(this.raw['sceneBreak'], '* * *');
  }

  static readonly empty = new BookMatter(Object.freeze({ sceneBreak: '* * *' }));
}

/** One thing on the page: a block of the author's text exactly as saved (a ProseMirror node), or a scene break. */
export type TextPiece = { readonly type: 'text'; readonly node: JsonMap };
export type BreakPiece = { readonly type: 'break' };
export type Piece = TextPiece | BreakPiece;

const breakPiece: BreakPiece = Object.freeze({ type: 'break' });

export type SectionKind =
  | 'cover'
  | 'title'
  | 'copyright'
  | 'dedication'
  | 'epigraph'
  | 'contents'
  | 'cast'
  | 'part'
  | 'chapter'
  | 'acknowledgements'
  | 'about';

/** A stretch of the book that starts on its own page. */
export type Section = {
  readonly id: string;
  readonly kind: SectionKind;
  /** What it is called in the table of contents. */
  readonly title: string;
  /** "Chapter 3", "Volume 1": printed above the title when the title says something more. */
  readonly label: string;
  /** For a chapter, its number in the book. */
  readonly number: number | null;
  /** How far in it sits in the contents (a chapter inside a volume is 1). */
  readonly depth: number;
  /** The chapter or group it comes from. */
  readonly nodeId: string | null;
  readonly words: number;
  readonly pieces: readonly Piece[];
  /** Plain text, for front and back matter. */
  readonly text: string;
  readonly noteBefore: string;
  readonly noteAfter: string;
  /** For an epigraph: who said it. */
  readonly source: string;
  /** Whether the label adds anything to the title ("Chapter 3" above "The Bell", but not above "Chapter 3"). */
  readonly showsLabel: boolean;
};

/** A section, with what is not given at its default, as the Flutter app's `Section` constructor has them. */
export function makeSection(fields: {
  id: string;
  kind: SectionKind;
  title: string;
  label?: string;
  number?: number | null;
  depth?: number;
  nodeId?: string | null;
  words?: number;
  pieces?: readonly Piece[];
  text?: string;
  noteBefore?: string;
  noteAfter?: string;
  source?: string;
}): Section {
  const label = fields.label ?? '';
  return Object.freeze({
    id: fields.id,
    kind: fields.kind,
    title: fields.title,
    label,
    number: fields.number ?? null,
    depth: fields.depth ?? 0,
    nodeId: fields.nodeId ?? null,
    words: fields.words ?? 0,
    pieces: Object.freeze([...(fields.pieces ?? [])]),
    text: fields.text ?? '',
    noteBefore: fields.noteBefore ?? '',
    noteAfter: fields.noteAfter ?? '',
    source: fields.source ?? '',
    showsLabel: label.length > 0 && dartToLowerCase(label) !== dartToLowerCase(dartTrim(fields.title)),
  });
}

export type Book = {
  readonly title: string;
  readonly subtitle: string;
  readonly author: string;
  readonly cover: string | null;
  readonly accent: string;
  readonly sceneBreak: string;
  readonly sections: readonly Section[];
  /** Words of story (front and back matter are not counted). */
  readonly words: number;
  readonly chapters: number;
};

/** What the book is made from: the novel's details, its chapters and scenes, their saved text, and its matter. */
export type BookSource = {
  readonly project: JsonMap;
  /** In the order they are stored (by id), as the original read them. */
  readonly nodes: readonly StoryNode[];
  readonly docs: ReadonlyMap<string, unknown>;
  readonly matter: BookMatter | null;
};

function compareIds(a: JsonMap, b: JsonMap): number {
  const x = str(a['id']);
  const y = str(b['id']);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** From a novel as stored. Rows are taken by id, the order the original's database gave them. */
export function bookSourceFromSnapshot(snapshot: NovelSnapshot): BookSource {
  const byId = (collection: string) => [...snapshot.rows(collection)].sort(compareIds);
  const matter = byId('bookMatter');
  const docs = new Map<string, unknown>();
  for (const r of snapshot.rows('chapterContents')) docs.set(str(r['id']), r['doc']);
  return {
    project: snapshot.project,
    nodes: byId('chapters').map(storyNode),
    docs,
    matter: matter.length === 0 ? null : new BookMatter(matter[0]),
  };
}

/** A parent id as the Flutter app reads one: a string that is not blank. */
function parentOf(node: StoryNode): string | null {
  const v = node.raw['parentId'];
  return typeof v === 'string' && dartTrim(v).length > 0 ? v : null;
}

function maps(value: unknown): JsonMap[] {
  return listOf(value).filter(isMap);
}

function inline(nodes: unknown): string {
  return maps(nodes)
    .map((n) => (n['type'] === 'text' ? str(n['text']) : n['type'] === 'hardBreak' ? '\n' : inline(n['content'])))
    .join('');
}

function wordsIn(node: JsonMap): number {
  return node['type'] === 'paragraph' || node['type'] === 'heading'
    ? countWords(inline(node['content']))
    : maps(node['content']).reduce((n, child) => n + wordsIn(child), 0);
}

const breakLine = /^(?:(?:\*\s*){3,}|#|-{3,}|~{3,}|⁂)$/;

/** A line an author typed to mark a scene break: `***`, `* * *`, `#`, `---`, `~~~` or `⁂`, alone in its paragraph. */
export function isBreakLine(text: string): boolean {
  return breakLine.test(dartTrim(text));
}

/** The blocks of one saved document, with typed scene breaks and horizontal rules recognised as breaks. */
function piecesOf(doc: unknown): Piece[] {
  return maps(mapOrNull(doc)?.['content']).map((node) =>
    node['type'] === 'horizontalRule' || (node['type'] === 'paragraph' && isBreakLine(inline(node['content'])))
      ? breakPiece
      : { type: 'text', node },
  );
}

function hasText(pieces: Piece[]): boolean {
  return pieces.some((p) => p.type === 'text' && dartTrim(inline([p.node])).length > 0);
}

/** Joins the parts of a chapter with a break between each, never two in a row and never one at either end. */
function join(parts: Piece[][]): Piece[] {
  const out: Piece[] = [];
  for (const part of parts.filter(hasText)) {
    if (out.length > 0) out.push(breakPiece);
    out.push(...part);
  }
  // Blank paragraphs at the start or end of a chapter, or beside a scene break, are the editor's spacing, not the page's.
  const blank = (p: Piece | null) =>
    p !== null && p.type === 'text' && p.node['type'] === 'paragraph' && dartTrim(inline(p.node['content'])) === '';
  const edge = (p: Piece | null) => p === null || p.type === 'break';
  let kept = out;
  for (let before = -1; before !== kept.length; ) {
    before = kept.length;
    const current = kept;
    kept = current.filter(
      (p, i) =>
        !(
          blank(p) &&
          (edge(i > 0 ? current[i - 1] : null) || edge(i + 1 < current.length ? current[i + 1] : null))
        ),
    );
  }
  const tidy = kept.filter((p, i) => !(p.type === 'break' && (i === 0 || kept[i - 1].type === 'break')));
  while (tidy.length > 0 && tidy[tidy.length - 1].type === 'break') tidy.pop();
  return tidy;
}

/** Dart's `num.compareTo` for the orders JSON holds. */
function compareOrder(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * READ-ONLY RENDERING RULE
 * Lays the manuscript out as a book. It is a pure function of what is saved: it reads the chapters, scenes and their
 * text and returns a new description of pages, holding nothing that could write back. A port of the original app's
 * `buildBook`.
 *
 * The order is the manuscript's own. Volumes, acts and arcs become part dividers; each chapter starts a new page and
 * takes in its scenes, with a scene break between them; what each format puts around the story (a cover, a title
 * page, a contents page) is added here.
 */
export function buildBook(source: BookSource, format: BookFormat): Book {
  const matter = source.matter ?? BookMatter.empty;
  const kids = (parentId: string | null) =>
    stableSorted(
      source.nodes.filter((n) => parentOf(n) === parentId),
      (a, b) => compareOrder(a.order, b.order),
    );
  const body: Section[] = [];
  let chapters = 0;
  const partCount = new Map<string, number>();

  const walk = (parentId: string | null, depth: number): void => {
    for (const node of kids(parentId)) {
      const kind = str(node.raw['kind']);
      if (kind === 'chapter' || kind === 'scene') {
        // A scene outside any chapter stands as a section of its own, unnumbered.
        const scenes = kind === 'chapter' ? kids(node.id).filter((c) => str(c.raw['kind']) === 'scene') : [];
        const pieces = join([piecesOf(source.docs.get(node.id)), ...scenes.map((s) => piecesOf(source.docs.get(s.id)))]);
        const number = kind === 'chapter' ? ++chapters : null;
        const label = number !== null ? `Chapter ${number}` : '';
        const title = dartTrim(node.title);
        body.push(
          makeSection({
            id: node.id,
            kind: 'chapter',
            nodeId: node.id,
            depth,
            number,
            label,
            // A chapter still called "Chapter 3" has no title of its own to print under the number.
            title: title.length > 0 ? title : label.length > 0 ? label : 'Untitled',
            pieces,
            words: pieces.reduce((n, p) => n + (p.type === 'text' ? wordsIn(p.node) : 0), 0),
            noteBefore: dartTrim(str(node.raw['noteBefore'])),
            noteAfter: dartTrim(str(node.raw['noteAfter'])),
          }),
        );
      } else {
        const count = (partCount.get(kind) ?? 0) + 1;
        partCount.set(kind, count);
        const name = `${node.kind !== null ? kindLabel[node.kind] : kind} ${count}`;
        // A web serial is a run of chapters: the parts they sit in are not pages of their own.
        if (format !== 'serial') {
          const title = dartTrim(node.title);
          body.push(
            makeSection({
              id: node.id,
              kind: 'part',
              nodeId: node.id,
              depth,
              label: name,
              title: title.length > 0 ? title : name,
            }),
          );
        }
        walk(node.id, depth + 1);
      }
    }
  };

  walk(null, 0);

  const page = (kind: SectionKind, title: string, text: string): Section[] =>
    dartTrim(text).length === 0 ? [] : [makeSection({ id: kind, kind, title, text: dartTrim(text) })];
  const front: Section[] = [];
  const back: Section[] = [];
  if (format !== 'serial') {
    if (format === 'ebook') front.push(makeSection({ id: 'cover', kind: 'cover', title: 'Cover' }));
    front.push(makeSection({ id: 'title', kind: 'title', title: 'Title page' }));
    front.push(...page('copyright', 'Copyright', matter.copyright), ...page('dedication', 'Dedication', matter.dedication));
    if (dartTrim(matter.epigraph).length > 0) {
      front.push(
        makeSection({
          id: 'epigraph',
          kind: 'epigraph',
          title: 'Epigraph',
          text: dartTrim(matter.epigraph),
          source: dartTrim(matter.epigraphSource),
        }),
      );
    }
    if (format === 'ebook') front.push(makeSection({ id: 'contents', kind: 'contents', title: 'Contents' }));
    // The cast, last before the story, where a reader turns back to it.
    front.push(...page('cast', matter.castTitle, matter.castList));
    back.push(
      ...page('acknowledgements', 'Acknowledgements', matter.acknowledgements),
      ...page('about', 'About the author', matter.aboutAuthor),
    );
  }
  return Object.freeze({
    title: str(source.project['title']),
    subtitle: str(source.project['subtitle']),
    author: str(source.project['author']),
    cover: strOrNull(source.project['cover']),
    accent: str(source.project['accent'], '#b4532a'),
    sceneBreak: matter.sceneBreak,
    sections: Object.freeze([...front, ...body, ...back]),
    words: body.reduce((n, s) => n + s.words, 0),
    chapters,
  });
}

/** The plain text of a piece, as the original reads it for counting and for plain outputs. */
export function pieceText(piece: TextPiece): string {
  return inline(piece.node['content']);
}

/** A place in the book: which section, and how far through it (0 to 1). */
export type BookPlace = { index: number; fraction: number };

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** How much of the story lies before a place, from 0 to 1, by words. Front matter counts as the start and back matter
 * as the end. */
export function progressAt(book: Book, place: BookPlace): number {
  const sections = book.sections;
  if (book.words === 0) return sections.length > 1 ? clamp01(place.index / (sections.length - 1)) : 0;
  let before = 0;
  for (let i = 0; i < place.index && i < sections.length; i++) before += sections[i].words;
  const here = place.index < sections.length ? sections[place.index].words : 0;
  return clamp01((before + here * clamp01(place.fraction)) / book.words);
}

/** One line of a cast list: a group's heading, or a person with who they are (empty when the line gives only a name). */
export type CastLine = { group: boolean; name: string; about: string };

const castDash = /\s+[—–-]\s+/;

/** The lines of a cast list as the author writes it: "Name — who they are" (an em dash, an en dash or a hyphen with
 * spaces round it), a line ending in ":" heading a group, a line with neither a name alone. Blank lines are skipped. */
export function castLines(text: string): CastLine[] {
  const out: CastLine[] = [];
  for (const raw of text.split('\n')) {
    const line = dartTrim(raw);
    if (line.length === 0) continue;
    const dash = castDash.exec(line);
    if (dash) {
      out.push({
        group: false,
        name: dartTrim(line.substring(0, dash.index)),
        about: dartTrim(line.substring(dash.index + dash[0].length)),
      });
    } else if (line.endsWith(':')) {
      out.push({ group: true, name: dartTrim(line.substring(0, line.length - 1)), about: '' });
    } else {
      out.push({ group: false, name: line, about: '' });
    }
  }
  return out;
}

/** Minutes to read some words, at an unhurried 250 a minute. */
export function readingMinutes(words: number): number {
  const m = Math.round(words / 250);
  return m < 1 ? 1 : m;
}
