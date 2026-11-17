// A novel's own details (the file's `project`). A port of flutter_app/lib/shared/domain/records/novel.dart: the same
// fields, statuses, colours and cleaning, so novels move between the two apps unchanged.

import { type JsonMap, listOf, numOrNull, str } from './json';

export const novelStatuses = [
  { key: 'planning', label: 'Planning' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'revising', label: 'Revising' },
  { key: 'complete', label: 'Complete' },
  { key: 'on-hold', label: 'On hold' },
] as const;

export type NovelStatus = (typeof novelStatuses)[number]['key'];

export function novelStatusOf(value: unknown): NovelStatus {
  return novelStatuses.find((s) => s.key === value)?.key ?? 'planning';
}

export function novelStatusLabel(status: NovelStatus): string {
  return novelStatuses.find((s) => s.key === status)!.label;
}

/** Colours a novel can be marked with, as in the Flutter app, with their names (never told apart by colour alone). */
export const novelAccents = [
  { hex: '#b4532a', name: 'Rust' },
  { hex: '#8a6d1f', name: 'Ochre' },
  { hex: '#3f7d4e', name: 'Moss' },
  { hex: '#2b7a8c', name: 'Teal' },
  { hex: '#3d5fa8', name: 'Blue' },
  { hex: '#7a4fa3', name: 'Violet' },
  { hex: '#a8436b', name: 'Rose' },
  { hex: '#5c6370', name: 'Slate' },
] as const;

/** Genres offered while typing. Only suggestions: any genre can be typed. */
export const genreSuggestions = [
  'Fantasy',
  'Sci-Fi',
  'LitRPG',
  'Action',
  'Adventure',
  'Progression Fantasy',
  'Cultivation',
  'Romance',
  'Mystery',
  'Thriller',
  'Horror',
  'Historical',
  'Slice of Life',
  'Comedy',
  'Drama',
  'Dystopian',
];

/** A novel's details as the screens read them. `raw` keeps every field, known or not. */
export class Novel {
  constructor(readonly raw: JsonMap) {}

  get id(): string {
    return str(this.raw['id']);
  }
  get title(): string {
    return str(this.raw['title']);
  }
  get subtitle(): string {
    return str(this.raw['subtitle']);
  }
  get author(): string {
    return str(this.raw['author']);
  }
  get primaryGenre(): string {
    return str(this.raw['primaryGenre']);
  }
  get secondaryGenres(): string[] {
    return strings(this.raw['secondaryGenres']);
  }
  get tags(): string[] {
    return strings(this.raw['tags']);
  }
  get synopsis(): string {
    return str(this.raw['synopsis']);
  }
  get status(): NovelStatus {
    return novelStatusOf(this.raw['status']);
  }
  get targetWordCount(): number | null {
    const n = numOrNull(this.raw['targetWordCount']);
    return n !== null && Number.isInteger(n) ? n : null;
  }
  /** yyyy-mm-dd, or null. */
  get deadline(): string | null {
    const d = this.raw['deadline'];
    return typeof d === 'string' ? d : null;
  }
  get accent(): string {
    return str(this.raw['accent'], '#b4532a');
  }
  get pinned(): boolean {
    return this.raw['pinned'] === true;
  }
  get archived(): boolean {
    return this.raw['archived'] === true;
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  get updatedAt(): number {
    return numOrNull(this.raw['updatedAt']) ?? 0;
  }
  /** When it was last opened. Null: never. */
  get lastOpenedAt(): number | null {
    return numOrNull(this.raw['lastOpenedAt']);
  }
  /** An http(s) image address (kept, never fetched), or an uploaded image stored as a data URL. */
  get cover(): string | null {
    const c = this.raw['cover'];
    return typeof c === 'string' ? c : null;
  }
  /** Whether it is a review copy someone sent (collaboration by file): read-only for its holder. */
  get isReviewCopy(): boolean {
    return typeof this.raw['review'] === 'object' && this.raw['review'] !== null;
  }

  withFields(changes: JsonMap): Novel {
    return new Novel({ ...this.raw, ...changes });
  }
}

function strings(value: unknown): string[] {
  return listOf(value).filter((v): v is string => typeof v === 'string');
}

/** Splits "LitRPG, Action" into its parts, as the form's comma-separated fields are typed. */
export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const coverPattern = /^(https?:\/\/\S+$|data:image\/(png|jpeg|webp|gif);base64,)/i;

/** The fields of a novel the writer edits, cleaned as the Flutter app's normalizeNovelDetails cleans them (from forms
 * and from imported files alike). Other fields of the novel are not part of this and are kept as they are. */
export function normalizeNovelDetails(input: JsonMap): JsonMap {
  const list = (v: unknown): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of strings(v).map((x) => x.trim())) {
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  };
  const primary = str(input['primaryGenre']).trim() || str(input['genre']).trim();
  const rawTarget = input['targetWordCount'];
  const target = typeof rawTarget === 'number' ? rawTarget : Number.parseFloat(str(rawTarget));
  const deadline = str(input['deadline']);
  const cover = str(input['cover']);
  const accent = str(input['accent']);
  return {
    title: str(input['title']).trim() || 'Untitled novel',
    subtitle: str(input['subtitle']).trim(),
    author: str(input['author']).trim(),
    primaryGenre: primary,
    secondaryGenres: list(input['secondaryGenres']).filter((g) => g.toLowerCase() !== primary.toLowerCase()),
    cover: cover.length <= 2000000 && coverPattern.test(cover) ? cover : null,
    tags: list(input['tags']),
    synopsis: str(input['synopsis']).trim(),
    status: novelStatuses.find((s) => s.key === input['status'])?.key ?? 'planning',
    targetWordCount: Number.isFinite(target) && target > 0 ? Math.round(target) : null,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
    language: str(input['language']).trim() || 'en',
    accent: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : novelAccents[0].hex,
  };
}
