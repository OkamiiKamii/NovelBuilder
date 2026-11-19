// What the Library shows: filters by status, collections, search and order. Pure functions over the novels' details
// and their counts, so they are tested without a screen.

import type { Novel, NovelStatus } from './novel';

/** The filter chips of the Library (DESIGN.md, the owner's mock-ups). */
export const libraryFilters = [
  { key: 'all', label: 'All' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
  { key: 'on-hold', label: 'On Hold' },
  { key: 'archived', label: 'Archived' },
] as const;

export type LibraryFilter = (typeof libraryFilters)[number]['key'];

const ongoing: ReadonlySet<NovelStatus> = new Set(['planning', 'drafting', 'revising']);

export function passesFilter(novel: Novel, filter: LibraryFilter): boolean {
  if (filter === 'archived') return novel.archived;
  if (novel.archived) return false;
  switch (filter) {
    case 'all':
      return true;
    case 'ongoing':
      return ongoing.has(novel.status);
    case 'completed':
      return novel.status === 'complete';
    case 'on-hold':
      return novel.status === 'on-hold';
  }
}

/** A collection the writer made, by name, holding novels by id. Kept on this device (settings). */
export type CustomCollection = { id: string; name: string; novelIds: string[] };

/** The Library's collections: the automatic ones, then the writer's own. */
export type CollectionKey =
  | { kind: 'favorites' }
  | { kind: 'drafts' }
  | { kind: 'completed' }
  | { kind: 'on-hold' }
  | { kind: 'custom'; id: string };

export function inCollection(novel: Novel, key: CollectionKey, custom: readonly CustomCollection[]): boolean {
  if (novel.archived) return false;
  switch (key.kind) {
    case 'favorites':
      return novel.pinned;
    case 'drafts':
      return novel.status === 'planning' || novel.status === 'drafting';
    case 'completed':
      return novel.status === 'complete';
    case 'on-hold':
      return novel.status === 'on-hold';
    case 'custom':
      return custom.find((c) => c.id === key.id)?.novelIds.includes(novel.id) ?? false;
  }
}

/** Ignores case and accents: "élan" matches "Elan". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Search over title, subtitle, author, genres, tags and synopsis: every typed word must appear. */
export function matchesSearch(novel: Novel, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(
    [novel.title, novel.subtitle, novel.author, novel.primaryGenre, ...novel.secondaryGenres, ...novel.tags, novel.synopsis].join(
      '\n',
    ),
  );
  return words.every((w) => hay.includes(w));
}

export const librarySorts = [
  { key: 'edited', label: 'Last edited' },
  { key: 'opened', label: 'Last opened' },
  { key: 'title', label: 'Title' },
  { key: 'created', label: 'Date created' },
  { key: 'words', label: 'Word count' },
] as const;

export type LibrarySort = (typeof librarySorts)[number]['key'];

/** Pinned books always come first, then the chosen order. */
export function sortNovels(novels: readonly Novel[], sort: LibrarySort, wordsOf: (id: string) => number): Novel[] {
  const by = (n: Novel): number | string => {
    switch (sort) {
      case 'edited':
        return -n.updatedAt;
      case 'opened':
        return -(n.lastOpenedAt ?? 0);
      case 'title':
        return fold(n.title);
      case 'created':
        return -n.createdAt;
      case 'words':
        return -wordsOf(n.id);
    }
  };
  return [...novels].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const x = by(a);
    const y = by(b);
    if (x < y) return -1;
    if (x > y) return 1;
    return fold(a.title) < fold(b.title) ? -1 : 1;
  });
}

/** How far a novel is: words against its target, 0–1. Null when it has no target. Complete books are whole. */
export function progressOf(novel: Novel, words: number): number | null {
  if (novel.status === 'complete') return 1;
  const target = novel.targetWordCount;
  if (!target) return null;
  return Math.min(1, words / target);
}

/** Reading time at 250 words a minute, as "245h 30m" or "12m". */
export function readingTime(words: number): string {
  const minutes = Math.round(words / 250);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Whether the Library should offer the first book: no novel of the writer's own that is not archived. The sample is
 * marked by sampleNovel.ts (`scriptorSample`). */
export function wantsFirstBook(novels: readonly Novel[]): boolean {
  return !novels.some((n) => !n.archived && n.raw['scriptorSample'] !== true);
}

// ---------------------------------------------------------------------------------------------------- the shelf

/** How thick a book's spine stands on the Library's shelf: thicker as it is written (the square root, so a first
 * chapter shows and a long novel does not crowd the rest), from 30 to 78 points. */
export function spineThickness(words: number): number {
  return Math.round(Math.min(78, 30 + Math.sqrt(Math.max(0, words)) / 5));
}

/** A spine's height: a little different for every book, as real books are, the same every time for the same book. */
export function spineHeight(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 168 + (h % 5) * 8;
}

/** The books in rows that fit `width`, left to right, `gap` between spines; every row holds at least one book. */
export function shelfRows<T extends { thickness: number }>(books: readonly T[], width: number, gap: number): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  let used = 0;
  for (const b of books) {
    const need = (row.length > 0 ? gap : 0) + b.thickness;
    if (row.length > 0 && used + need > width) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += row.length > 0 ? gap + b.thickness : b.thickness;
    row.push(b);
  }
  if (row.length > 0) rows.push(row);
  return rows;
}
