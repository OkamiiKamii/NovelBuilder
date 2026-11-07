import { splitChoices } from '@/modules/codex/schema';
import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import type { CharacterProfile } from './types';

/** A character as the library shows it: the record, its profile, and what is known of where it appears. */
export interface Listed {
  entry: LoreEntry;
  profile: CharacterProfile;
  /** Chapters and scenes whose text has a link to this character, in reading order. These are certain. */
  linkedIn: string[];
  /** Position in the story of the first and latest of those, or -1. */
  first: number;
  latest: number;
  /** Names of the factions and organisations it is linked to. */
  factions: string[];
}

export const SORTS = ['name', 'updated', 'created', 'first', 'appearances', 'latest', 'custom'] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABELS: Record<Sort, string> = { name: 'Name', updated: 'Recently updated', created: 'Recently created', first: 'First appearance', appearances: 'Most appearances', latest: 'Most recent appearance', custom: 'My order' };

export interface Filters {
  role: string;
  status: string;
  tag: string;
  species: string;
  occupation: string;
  faction: string;
  /** Only characters first linked at or before this chapter (its position in the story). */
  firstBy: number | null;
  archived: boolean;
}
export const NO_FILTERS: Filters = { role: '', status: '', tag: '', species: '', occupation: '', faction: '', firstBy: null, archived: false };

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** The value of a field of this name on the entry, if it has one. */
export const fieldNamed = (entry: LoreEntry, name: string): string => entry.fields.find((field) => field.key.trim().toLowerCase() === name.toLowerCase())?.value.trim() ?? '';

/** Puts each character together with where it appears and what it belongs to. Reads only what it is given. */
export function listCharacters(entries: LoreEntry[], profiles: Map<string, CharacterProfile>, links: LoreLink[], nodes: StoryNode[], position: Map<string, number>, fallback: (entry: LoreEntry) => CharacterProfile): Listed[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ordered = [...nodes].filter((node) => node.mentions?.length).sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  return entries.filter((entry) => entry.category === 'character').map((entry) => {
    const linkedIn = ordered.filter((node) => node.mentions!.includes(entry.id)).map((node) => node.id);
    const factions = links.flatMap((link) => {
      const other = byId.get(link.fromId === entry.id ? link.toId : link.toId === entry.id ? link.fromId : '');
      return other?.category === 'faction' ? [other.name] : [];
    });
    const named = byId.get(fieldNamed(entry, 'Faction'))?.name ?? fieldNamed(entry, 'Faction');
    return {
      entry, profile: profiles.get(entry.id) ?? fallback(entry), linkedIn,
      first: linkedIn.length ? (position.get(linkedIn[0]) ?? -1) : -1, latest: linkedIn.length ? (position.get(linkedIn[linkedIn.length - 1]) ?? -1) : -1,
      factions: [...new Set([...factions, ...(named && !byId.has(named) ? [named] : [])])],
    };
  });
}

/**
 * Whether a character matches what was typed. Every word has to be found
 * somewhere in the character's name, aliases, epithet, summary, roles,
 * tags, factions or field values (so "The Oathbreaker" finds the character
 * who carries that title). It only ever finds records that exist.
 */
export function matches(listed: Listed, query: string, nameOf: (id: string) => string | undefined = () => undefined): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const { entry, profile } = listed;
  const haystack = fold([entry.name, profile.epithet, ...profile.aliases, entry.summary, ...profile.roles, profile.status, ...entry.tags, ...listed.factions, ...entry.fields.map((field) => (field.type === 'reference' ? (nameOf(field.value) ?? '') : field.type === 'longtext' ? '' : field.value))].join('\n'));
  return words.every((word) => haystack.includes(word));
}

export function passes(listed: Listed, filters: Filters): boolean {
  const { entry, profile } = listed;
  const is = (value: string, wanted: string) => !wanted || fold(value) === fold(wanted);
  if (profile.archived !== filters.archived) return false;
  if (filters.role && !profile.roles.some((role) => fold(role) === fold(filters.role))) return false;
  if (!is(profile.status, filters.status)) return false;
  if (filters.tag && !entry.tags.some((tag) => fold(tag) === fold(filters.tag))) return false;
  if (!is(fieldNamed(entry, 'Species'), filters.species) || !is(fieldNamed(entry, 'Occupation'), filters.occupation)) return false;
  if (filters.faction && !listed.factions.some((name) => fold(name) === fold(filters.faction))) return false;
  if (filters.firstBy !== null && (listed.first < 0 || listed.first > filters.firstBy)) return false;
  return true;
}

export function sortCharacters(list: Listed[], sort: Sort): Listed[] {
  const name = (a: Listed, b: Listed) => a.entry.name.localeCompare(b.entry.name);
  // Characters that never appear go after those that do, whichever way appearances are ordered.
  const seen = (pick: (l: Listed) => number, direction: 1 | -1) => (a: Listed, b: Listed) => Number(pick(a) < 0) - Number(pick(b) < 0) || direction * (pick(a) - pick(b)) || name(a, b);
  const by: Record<Sort, (a: Listed, b: Listed) => number> = {
    name,
    updated: (a, b) => Math.max(b.entry.updatedAt, b.profile.updatedAt) - Math.max(a.entry.updatedAt, a.profile.updatedAt) || name(a, b),
    created: (a, b) => b.entry.createdAt - a.entry.createdAt || name(a, b),
    first: seen((l) => l.first, 1),
    latest: seen((l) => l.latest, -1),
    appearances: (a, b) => b.linkedIn.length - a.linkedIn.length || name(a, b),
    custom: (a, b) => a.profile.order - b.profile.order || a.entry.createdAt - b.entry.createdAt || name(a, b),
  };
  return [...list].sort(by[sort]);
}

/** The values in use across the cast for each thing that can be filtered on, for the filter menus. */
export function facets(list: Listed[]): { roles: string[]; statuses: string[]; tags: string[]; species: string[]; occupations: string[]; factions: string[] } {
  const distinct = (values: string[]) => [...new Map(values.filter((v) => v.trim()).map((v) => [fold(v), v.trim()])).values()].sort((a, b) => a.localeCompare(b));
  return {
    roles: distinct(list.flatMap((l) => l.profile.roles)), statuses: distinct(list.map((l) => l.profile.status)), tags: distinct(list.flatMap((l) => l.entry.tags)),
    species: distinct(list.map((l) => fieldNamed(l.entry, 'Species'))), occupations: distinct(list.map((l) => fieldNamed(l.entry, 'Occupation'))), factions: distinct(list.flatMap((l) => l.factions)),
  };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * How many times a character's name, aliases or epithet occur in some text,
 * as whole words. This is a count of words on the page and nothing more: a
 * name spoken in someone else's dialogue is counted, and it says nothing
 * about whether the character is present. Links are what record that.
 */
export function countMentions(texts: string[], names: string[]): number {
  const wanted = [...new Set(names.map((name) => name.trim()).filter((name) => name.length >= 2))].sort((a, b) => b.length - a.length);
  if (!wanted.length) return 0;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${wanted.map(escape).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  return texts.reduce((n, text) => n + (text.match(pattern)?.length ?? 0), 0);
}

export const tagsOf = (value: string): string[] => splitChoices(value);
