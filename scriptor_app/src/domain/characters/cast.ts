// THE CAST, as the library shows it: each character with where it appears and what it belongs to; search, filters,
// sort orders and the filter menus; and counting names on the page. A port of
// flutter_app/lib/shared/domain/characters/cast.dart. Reads only.

import { localeCompare } from '../collation';
import { docBlocks } from '../prose';
import { stableSorted } from '../reader/stableSort';
import { type Entry } from '../records/entry';
import { type Link } from '../records/link';
import { type StoryNode } from '../records/storyNode';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { foldText } from '../text/fold';
import { type CharacterProfile } from './characterRecords';

/** A character as the library shows it: the record, its profile, and what is known of where it appears. */
export class Listed {
  readonly entry: Entry;
  readonly profile: CharacterProfile;
  /** Chapters and scenes whose text has a link to this character, in reading order. These are certain. */
  readonly linkedIn: readonly string[];
  /** Chapters and scenes whose text has the character's name (or alias) where it is not linked (namedIn.ts). */
  readonly namedIn: readonly string[];
  /** Position in the story of the first and latest of `seenIn`, or -1. */
  readonly first: number;
  readonly latest: number;
  /** Names of the factions and organisations it is linked to. */
  readonly factions: readonly string[];

  constructor(args: {
    entry: Entry;
    profile: CharacterProfile;
    linkedIn: readonly string[];
    first: number;
    latest: number;
    factions: readonly string[];
    namedIn?: readonly string[];
  }) {
    this.entry = args.entry;
    this.profile = args.profile;
    this.linkedIn = args.linkedIn;
    this.namedIn = args.namedIn ?? [];
    this.first = args.first;
    this.latest = args.latest;
    this.factions = args.factions;
  }

  private seen: readonly string[] | null = null;

  /** Where the character is in the book: linked or named (not in reading order across the two; `first` and `latest`
   * say where). */
  get seenIn(): readonly string[] {
    return (this.seen ??= [...this.linkedIn, ...this.namedIn.filter((id) => !this.linkedIn.includes(id))]);
  }
}

export type CastSort = 'name' | 'updated' | 'created' | 'first' | 'appearances' | 'latest' | 'custom';
export const castSorts: readonly CastSort[] = ['name', 'updated', 'created', 'first', 'appearances', 'latest', 'custom'];
export const castSortLabel: Readonly<Record<CastSort, string>> = {
  name: 'Name',
  updated: 'Recently updated',
  created: 'Recently created',
  first: 'First appearance',
  appearances: 'Most appearances',
  latest: 'Most recent appearance',
  custom: 'My order',
};

export function castSortOf(value: unknown): CastSort {
  return castSorts.find((s) => s === value) ?? 'name';
}

/** What the library is narrowed to. Empty text: not filtered on that. */
export class CastFilters {
  readonly role: string;
  readonly status: string;
  readonly tag: string;
  readonly species: string;
  readonly occupation: string;
  readonly faction: string;
  /** Only characters first linked at or before this chapter (its position in the story). */
  readonly firstBy: number | null;
  readonly archived: boolean;

  constructor(
    args: {
      role?: string;
      status?: string;
      tag?: string;
      species?: string;
      occupation?: string;
      faction?: string;
      firstBy?: number | null;
      archived?: boolean;
    } = {},
  ) {
    this.role = args.role ?? '';
    this.status = args.status ?? '';
    this.tag = args.tag ?? '';
    this.species = args.species ?? '';
    this.occupation = args.occupation ?? '';
    this.faction = args.faction ?? '';
    this.firstBy = args.firstBy ?? null;
    this.archived = args.archived ?? false;
  }

  static readonly none = new CastFilters();

  /** How many filters beyond the role tabs and the archive are set. */
  get active(): number {
    return (
      [this.status, this.tag, this.species, this.occupation, this.faction].filter((v) => v.length > 0).length +
      (this.firstBy === null ? 0 : 1)
    );
  }

  /** Only what is given changes; `firstBy: { value: null }` clears the chapter (Dart's `firstBy: () => null`). */
  copyWith(changes: {
    role?: string;
    status?: string;
    tag?: string;
    species?: string;
    occupation?: string;
    faction?: string;
    firstBy?: { value: number | null };
    archived?: boolean;
  }): CastFilters {
    return new CastFilters({
      role: changes.role ?? this.role,
      status: changes.status ?? this.status,
      tag: changes.tag ?? this.tag,
      species: changes.species ?? this.species,
      occupation: changes.occupation ?? this.occupation,
      faction: changes.faction ?? this.faction,
      firstBy: changes.firstBy === undefined ? this.firstBy : changes.firstBy.value,
      archived: changes.archived ?? this.archived,
    });
  }

  /** The same role and archive choice, with every other filter cleared. */
  cleared(): CastFilters {
    return new CastFilters({ role: this.role, archived: this.archived });
  }
}

/** The value of a field of this name on the entry, if it has one. */
export function fieldNamed(entry: Entry, name: string): string {
  const f = entry.fields.find((x) => dartToLowerCase(dartTrim(x.key)) === dartToLowerCase(name));
  return f === undefined ? '' : dartTrim(f.value);
}

const at = (position: ReadonlyMap<string, number>, id: string) => position.get(id) ?? 0;

/** Puts each character together with where it appears and what it belongs to. Reads only what it is given. `named`:
 * where each entry's name is on the page (namedIn.ts), by entry. */
export function listCharacters(
  entries: readonly Entry[],
  profiles: ReadonlyMap<string, CharacterProfile>,
  links: readonly Link[],
  nodes: Iterable<StoryNode>,
  position: ReadonlyMap<string, number>,
  fallback: (entry: Entry) => CharacterProfile,
  options: { named?: ReadonlyMap<string, readonly string[]> } = {},
): Listed[] {
  const named = options.named ?? new Map<string, readonly string[]>();
  const byId = new Map<string, Entry>();
  for (const e of entries) byId.set(e.id, e);
  const ordered = stableSorted(
    [...nodes].filter((n) => n.mentions.length > 0),
    (a, b) => at(position, a.id) - at(position, b.id),
  );
  // Read once for the whole cast, not once a character: the chapters linking to each entry, in reading order; and the
  // other end of each entry's links, in the links' order.
  const linkedBy = new Map<string, string[]>();
  for (const node of ordered) {
    for (const id of new Set(node.mentions)) {
      let list = linkedBy.get(id);
      if (list === undefined) linkedBy.set(id, (list = []));
      list.push(node.id);
    }
  }
  const ends = new Map<string, string[]>();
  const end = (id: string, other: string) => {
    let list = ends.get(id);
    if (list === undefined) ends.set(id, (list = []));
    list.push(other);
  };
  for (const link of links) {
    end(link.fromId, link.toId);
    if (link.toId !== link.fromId) end(link.toId, link.fromId);
  }
  return entries
    .filter((entry) => entry.category === 'character')
    .map((entry) =>
      listed(entry, byId, linkedBy.get(entry.id) ?? [], ends.get(entry.id) ?? [], position, profiles, fallback, named),
    );
}

function listed(
  entry: Entry,
  byId: ReadonlyMap<string, Entry>,
  linkedIn: readonly string[],
  others: readonly string[],
  position: ReadonlyMap<string, number>,
  profiles: ReadonlyMap<string, CharacterProfile>,
  fallback: (entry: Entry) => CharacterProfile,
  nameFinds: ReadonlyMap<string, readonly string[]>,
): Listed {
  const linked = new Set(linkedIn);
  // Named but not linked, in reading order; only chapters and scenes still in the book.
  const namedIn = stableSorted(
    (nameFinds.get(entry.id) ?? []).filter((id) => position.has(id) && !linked.has(id)),
    (a, b) => position.get(a)! - position.get(b)!,
  );
  const seen = stableSorted([...linkedIn, ...namedIn], (a, b) => at(position, a) - at(position, b));
  const factions: string[] = [];
  for (const id of others) {
    const other = byId.get(id);
    if (other !== undefined && other.category === 'faction') factions.push(other.name);
  }
  const value = fieldNamed(entry, 'Faction');
  const named = byId.get(value)?.name ?? value;
  const all = new Set(factions);
  if (named.length > 0 && !byId.has(named)) all.add(named);
  return new Listed({
    entry,
    profile: profiles.get(entry.id) ?? fallback(entry),
    linkedIn,
    namedIn,
    first: seen.length === 0 ? -1 : (position.get(seen[0]) ?? -1),
    latest: seen.length === 0 ? -1 : (position.get(seen[seen.length - 1]) ?? -1),
    factions: [...all],
  });
}

/** Whether a character matches what was typed. Every word has to be found somewhere in the character's name, aliases,
 * epithet, summary, roles, status, tags, factions or field values (so "The Oathbreaker" finds the character who
 * carries that title). Long passages are left to project search. It only ever finds records that exist. */
export function matchesQuery(listed: Listed, query: string, nameOf?: ((id: string) => string | null) | null): boolean {
  const words = foldText(query)
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return true;
  const entry = listed.entry;
  const profile = listed.profile;
  const haystack = foldText(
    [
      entry.name,
      profile.epithet,
      ...profile.aliases,
      entry.summary,
      ...profile.roles,
      profile.status,
      ...entry.tags,
      ...listed.factions,
      ...entry.fields.map((f) =>
        f.type === 'reference' ? (nameOf?.(f.value) ?? '') : f.type === 'longtext' ? '' : f.value,
      ),
    ].join('\n'),
  );
  return words.every((w) => haystack.includes(w));
}

export function passesFilters(listed: Listed, filters: CastFilters): boolean {
  const entry = listed.entry;
  const profile = listed.profile;
  const same = (a: string, b: string) => foldText(a) === foldText(b);
  const fits = (value: string, wanted: string) => wanted.length === 0 || same(value, wanted);
  if (profile.archived !== filters.archived) return false;
  if (filters.role.length > 0 && !profile.roles.some((r) => same(r, filters.role))) return false;
  if (!fits(profile.status, filters.status)) return false;
  if (filters.tag.length > 0 && !entry.tags.some((t) => same(t, filters.tag))) return false;
  if (!fits(fieldNamed(entry, 'Species'), filters.species)) return false;
  if (!fits(fieldNamed(entry, 'Occupation'), filters.occupation)) return false;
  if (filters.faction.length > 0 && !listed.factions.some((f) => same(f, filters.faction))) return false;
  const firstBy = filters.firstBy;
  if (firstBy !== null && (listed.first < 0 || listed.first > firstBy)) return false;
  return true;
}

const sign = (n: number) => (n < 0 ? -1 : n > 0 ? 1 : 0);

export function sortCharacters(list: readonly Listed[], sort: CastSort): Listed[] {
  const name = (a: Listed, b: Listed) => localeCompare(a.entry.name, b.entry.name);
  // Characters that never appear go after those that do, whichever way appearances are ordered.
  const seen =
    (pick: (l: Listed) => number, direction: number) =>
    (a: Listed, b: Listed): number => {
      const unseen = (pick(a) < 0 ? 1 : 0) - (pick(b) < 0 ? 1 : 0);
      if (unseen !== 0) return unseen;
      const by = direction * (pick(a) - pick(b));
      return by !== 0 ? by : name(a, b);
    };
  const touched = (l: Listed) => (l.entry.updatedAt > l.profile.updatedAt ? l.entry.updatedAt : l.profile.updatedAt);
  const then = (difference: number, a: Listed, b: Listed) => (difference !== 0 ? sign(difference) : name(a, b));
  let compare: (a: Listed, b: Listed) => number;
  switch (sort) {
    case 'name':
      compare = name;
      break;
    case 'updated':
      compare = (a, b) => then(touched(b) - touched(a), a, b);
      break;
    case 'created':
      compare = (a, b) => then(b.entry.createdAt - a.entry.createdAt, a, b);
      break;
    case 'first':
      compare = seen((l) => l.first, 1);
      break;
    case 'latest':
      compare = seen((l) => l.latest, -1);
      break;
    case 'appearances':
      compare = (a, b) => then(b.seenIn.length - a.seenIn.length, a, b);
      break;
    case 'custom':
      compare = (a, b) => {
        const byOrder = a.profile.order - b.profile.order;
        if (byOrder !== 0) return sign(byOrder);
        return then(a.entry.createdAt - b.entry.createdAt, a, b);
      };
      break;
  }
  return stableSorted(list, compare);
}

/** The values in use across the cast for each thing that can be filtered on, for the filter menus. */
export class Facets {
  constructor(
    readonly roles: readonly string[],
    readonly statuses: readonly string[],
    readonly tags: readonly string[],
    readonly species: readonly string[],
    readonly occupations: readonly string[],
    readonly factions: readonly string[],
  ) {}

  get isEmpty(): boolean {
    return [this.statuses, this.tags, this.species, this.occupations, this.factions].every((l) => l.length === 0);
  }
}

export function facetsOf(list: readonly Listed[]): Facets {
  const distinct = (values: Iterable<string>): string[] => {
    const byFold = new Map<string, string>();
    for (const v of values) {
      if (dartTrim(v).length > 0) byFold.set(foldText(v), dartTrim(v));
    }
    return stableSorted(byFold.values(), localeCompare);
  };
  return new Facets(
    distinct(list.flatMap((l) => l.profile.roles)),
    distinct(list.map((l) => l.profile.status)),
    distinct(list.flatMap((l) => l.entry.tags)),
    distinct(list.map((l) => fieldNamed(l.entry, 'Species'))),
    distinct(list.map((l) => fieldNamed(l.entry, 'Occupation'))),
    distinct(list.flatMap((l) => l.factions)),
  );
}

// As Dart's RegExp.escape (and the original's `_escape`): the characters with a meaning in a pattern.
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** How many times a character's name, aliases or epithet occur in some text, as whole words. A count of words on the
 * page and nothing more: a name spoken in someone else's dialogue is counted, and it says nothing about whether the
 * character is present. Links are what record that. */
export function countMentions(texts: Iterable<string>, names: Iterable<string>): number {
  const wanted = stableSorted(
    [...new Set([...names].map((n) => dartTrim(n)))].filter((n) => n.length >= 2),
    (a, b) => b.length - a.length,
  );
  if (wanted.length === 0) return 0;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${wanted.map(escape).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  let n = 0;
  for (const text of texts) n += [...text.matchAll(pattern)].length;
  return n;
}

/** countMentions over the chapters as stored (each chapter's record as JSON text), as a job to run away from the
 * screen: decoding the book and reading out its text is done in the job. A record that cannot be read counts as an
 * empty chapter. */
export function mentionsJob(storedContents: readonly string[], names: readonly string[]): () => number {
  return () =>
    countMentions(
      storedContents.flatMap((json) => docBlocks(docOf(json)).map((b) => b.text)),
      names,
    );
}

function docOf(json: string): unknown {
  try {
    const row: unknown = JSON.parse(json);
    return typeof row === 'object' && row !== null && !Array.isArray(row) ? (row as Record<string, unknown>)['doc'] : null;
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}
