// What the publish dialog offers and shows before anything is made: the three kinds of file, "What it will hold" (every
// page or chapter in order, with the words of story), the file's name, and what is said after. Pure TypeScript: the
// logic of flutter_app/lib/features/reader/publish_dialog.dart, without its widgets.

import { formatNumber } from '../desk/format';
import { str, type JsonMap } from '../json';
import type { Book, BookFormat, Section } from '../reader/book';
import { dartTrim } from '../text/dartString';
import {
  type OutputNote,
  type SerialFormat,
  epubIdentifier,
  serialFileName,
  serialFormats,
  serialHeading,
} from './renderBook';

export type PublishKind = 'epub' | 'serialAll' | 'serialOne';

export const publishKinds: readonly { key: PublishKind; label: string; hint: string }[] = [
  {
    key: 'epub',
    label: 'Ebook (EPUB)',
    hint: 'One file for Apple Books, Kobo, Google Play Books, and Kindle through Send to Kindle.',
  },
  {
    key: 'serialAll',
    label: 'Web serial: every chapter',
    hint: 'Each chapter as its own file, with its heading and your notes before and after, in one zip.',
  },
  {
    key: 'serialOne',
    label: 'Web serial: one chapter',
    hint: 'One chapter, ready to paste into a serial site or save as a file.',
  },
];

/** The dialog's fixed words, as the Flutter app has them. */
export const publishTexts = {
  title: 'Publish',
  serialFormatLabel: 'Each chapter as',
  chapterLabel: 'Chapter',
  holdsHeading: 'What it will hold',
  readerHint: 'The reader shows this book drawn, page by page: choose its format there to look before you save.',
  otherFormats: 'Word, PDF, Markdown, text or a web page…',
  close: 'Close',
  copy: 'Copy',
  save: 'Save…',
  saving: 'Making…',
} as const;

/** "Web page (.html)": how a serial format is offered. */
export function serialFormatChoice(format: SerialFormat): string {
  const f = serialFormats.find((x) => x.key === format)!;
  return `${f.label} (.${f.extension})`;
}

/** The book a kind of file is made from: an ebook's, or a web serial's. */
export function publishBookFormat(kind: PublishKind): BookFormat {
  return kind === 'epub' ? 'ebook' : 'serial';
}

export function bookChapters(book: Book): Section[] {
  return book.sections.filter((s) => s.kind === 'chapter');
}

/** The chapter chosen for one-chapter publishing: the one asked for while it is still there, else the first. */
export function chosenChapter(book: Book, chapterId: string | null): Section | null {
  const chapters = bookChapters(book);
  return chapters.find((c) => c.id === chapterId) ?? chapters[0] ?? null;
}

export type PublishPreview = {
  /** The chapter one-chapter publishing would use (null when the book has none). */
  readonly chapter: Section | null;
  /** Chapters with text. */
  readonly written: number;
  /** No chapter has text: nothing can be made, and Save and Copy are off. */
  readonly empty: boolean;
  /** Every page (an ebook) or chapter file (a serial) in order, or the one chapter's heading. */
  readonly pages: readonly string[];
  /** The line under "What it will hold". */
  readonly summary: string;
  /** A note when the ebook's cover is a web address, or null. */
  readonly coverNote: string | null;
};

/** PREVIEW BEFORE EXPORT: what a publishing file will hold, shown in full before anything is made. [book] is
 * `buildBook(source, publishBookFormat(kind))`. */
export function publishPreview(
  book: Book,
  kind: PublishKind,
  format: SerialFormat,
  chapterId: string | null,
): PublishPreview {
  const chapters = bookChapters(book);
  const chapter = chosenChapter(book, chapterId);
  const written = chapters.filter((c) => c.words > 0).length;
  const pages =
    kind === 'epub'
      ? book.sections.map((s) => (s.kind === 'contents' ? 'Contents' : s.showsLabel ? `${s.label}: ${s.title}` : s.title))
      : kind === 'serialAll'
        ? chapters.map((s, i) => serialFileName(s, i, format))
        : chapter !== null
          ? [serialHeading(chapter)]
          : [];
  const empty = written === 0;
  const summary = empty
    ? 'No chapter has text yet: there is nothing to publish. Write a chapter first.'
    : `${pages.length} ${kind === 'epub' ? 'pages' : pages.length === 1 ? 'chapter' : 'chapters'}, ` +
      `${formatNumber(book.words)} words of story. Your text goes out exactly as written; ` +
      `${kind === 'epub' ? 'serial notes are left out of an ebook.' : 'your notes before and after each chapter are included.'}`;
  return {
    chapter,
    written,
    empty,
    pages,
    summary,
    coverNote:
      kind === 'epub' && (book.cover?.startsWith('http') ?? false)
        ? 'The cover is a web address, which this app never fetches, so the ebook opens on its title page instead.'
        : null,
  };
}

/** A title made safe for a file name: no characters file systems refuse, runs of white space as one space. */
export function safeFileTitle(title: string): string {
  return dartTrim(title)
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ');
}

/** The name the file is offered under: "The Drowned Road.epub", "… - web serial.zip", "… - 003-the-bell.md". */
export function publishFileName(book: Book, kind: PublishKind, format: SerialFormat, chapterId: string | null): string {
  const safe = safeFileTitle(book.title);
  const base = safe.length === 0 ? 'Untitled novel' : safe;
  switch (kind) {
    case 'epub':
      return `${base}.epub`;
    case 'serialAll':
      return `${base} - web serial.zip`;
    case 'serialOne': {
      const chapters = bookChapters(book);
      const s = chosenChapter(book, chapterId);
      return s === null ? `${base} - ` : `${base} - ${serialFileName(s, chapters.indexOf(s), format)}`;
    }
  }
}

/** What `renderEpub` is given for a novel: its own id, its language (English when it has none), and now. */
export function epubArgsFor(project: JsonMap, now: Date): { identifier: string; language: string; modified: Date } {
  return { identifier: epubIdentifier(project), language: str(project['language'], 'en'), modified: now };
}

/** Said after the file is saved ([where] is what the save reports, e.g. "Saved to Downloads"), with the ebook's notes. */
export function publishSavedMessage(where: string, notes: readonly OutputNote[]): string {
  return [`${where}. Nothing in the novel changed.`, ...notes.map((n) => n.text)].join(' ');
}

/** Said after one chapter is copied. */
export function publishCopiedMessage(chapter: Section, format: SerialFormat): string {
  const label = serialFormats.find((f) => f.key === format)!.label;
  return `Copied "${serialHeading(chapter)}" as ${label.toLowerCase()}. Nothing in the novel changed.`;
}

/** Said when making the file failed for a reason other than a BookOutputError (whose message is shown as it is). */
export function publishFailedMessage(error: unknown): string {
  return `The file could not be made: ${String(error)}. Nothing has changed.`;
}
