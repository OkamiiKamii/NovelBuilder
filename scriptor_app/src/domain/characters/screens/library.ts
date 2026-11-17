// THE CHARACTER LIBRARY: where the cast is found and managed. Every card and row is one of the novel's character
// records; searching, filtering and sorting only choose among them. The pure parts of
// flutter_app/lib/features/characters/characters_page.dart (the cast as shown, role tabs, counts, filter menus, the
// list's rows and moving them), widgets/cast_card.dart (castTone, monogram, presenceOf, the card's words) and
// widgets/vault_rail.dart's search.

import { formatNumber, plural } from '../../desk/format';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { type StoryOrder } from '../../model/storyOrder';
import { novelAccents } from '../../novel';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { foldText } from '../../text/fold';
import {
  CastFilters,
  type CastSort,
  type Facets,
  type Listed,
  facetsOf,
  matchesQuery,
  passesFilters,
  sortCharacters,
} from '../cast';
import { type CastData } from '../castData';
import { characterRoles } from '../characterRecords';

/** How many cards or rows are shown at first, and added by each "Show more". */
export const castPage = 60;

// ---------------------------------------------------------------------------------------------------- a character's card

/** A character's own colour: one of the cover colours (`#rrggbb`), chosen by their id, so it stays theirs whatever the
 * sort, filter or name. */
export function castTone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return novelAccents[h % novelAccents.length].hex;
}

/** The first character as a reader sees it: a letter with the marks that sit on it. (Dart takes the first grapheme
 * cluster; a word here starts with a letter, digit or underscore of the basic Latin set, so its marks are enough.) */
function firstLetter(word: string): string {
  const m = /^.\p{M}*/su.exec(word);
  return m === null ? word : m[0];
}

/** Up to two initials: "Kai & Ren" is "KR", "Mira" is "M". */
export function monogram(name: string): string {
  const words = dartTrim(name)
    .split(/\s+/)
    .filter((w) => w.length > 0 && /\w/.test(w[0]));
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => dartToUpperCase(firstLetter(w)))
    .join('');
}

/** Where a character is in the book: for each chapter, whether a chapter or one of its scenes has them. */
export function presenceOf(
  l: Listed,
  order: StoryOrder,
): { chapters: boolean[]; count: number; first: number | null; last: number | null } {
  const marks = order.chapters.map(() => false);
  for (const id of l.seenIn) {
    const n = order.chapterNumber.get(id);
    if (n !== undefined && n >= 1 && n <= marks.length) marks[n - 1] = true;
  }
  const first = marks.indexOf(true);
  const last = marks.lastIndexOf(true);
  return {
    chapters: marks,
    count: marks.filter((m) => m).length,
    first: first < 0 ? null : first + 1,
    last: last < 0 ? null : last + 1,
  };
}

/** Under the card: where they are in the book ("In 2 of 3 chapters · 1–3"); null in a book with no chapters. */
export function cardWhere(l: Listed, order: StoryOrder): string | null {
  const presence = presenceOf(l, order);
  if (order.chapters.length === 0) return null;
  if (presence.count === 0) return 'Not in the manuscript yet';
  if (presence.first === presence.last) return `In chapter ${presence.first}`;
  return (
    `In ${formatNumber(presence.count)} of ${formatNumber(order.chapters.length)} chapters · ` +
    `${presence.first}–${presence.last}`
  );
}

/** The card said whole, for a screen reader: "Kael, The Oathbreaker, Protagonist, In 2 of 3 chapters · 1–3". */
export function cardLabel(l: Listed, order: StoryOrder): string {
  const where = cardWhere(l, order);
  return [
    l.entry.name,
    ...(l.profile.epithet.length > 0 ? [l.profile.epithet] : []),
    ...l.profile.roles,
    ...(l.profile.status.length > 0 ? [l.profile.status] : []),
    ...(where !== null ? [where] : []),
  ].join(', ');
}

/** The card's roles line: "PROTAGONIST · MINOR". */
export function cardRoles(l: Listed): string {
  return dartToUpperCase(l.profile.roles.join(' · '));
}

// ---------------------------------------------------------------------------------------------------- the library

/** What the library shows for a search, filters and an order. */
export type LibraryView = {
  /** Everyone not archived (the photograph, the empty chairs). */
  active: Listed[];
  /** The whole cast, archived or not. */
  list: readonly Listed[];
  /** The cast on the side of the archive being looked at (what the filter menus are made from). */
  kept: Listed[];
  facets: Facets;
  /** What the search and the filters find, in the order chosen. */
  found: Listed[];
  archivedCount: number;
  /** The role tabs: the default roles in use (in their order), then every role in use. */
  roleTabs: string[];
  /** "3 characters", or "1 of 3 characters" while searching or filtering. */
  count: string;
};

export function libraryView(
  cast: CastData,
  args: { query: string; filters: CastFilters; sort: CastSort },
): LibraryView {
  const { query, filters, sort } = args;
  const list = cast.list;
  const active = list.filter((l) => !l.profile.archived);
  const kept = list.filter((l) => l.profile.archived === filters.archived);
  const facets = facetsOf(kept);
  const found = sortCharacters(
    list.filter((l) => passesFilters(l, filters) && matchesQuery(l, query, (id) => cast.nameOf(id))),
    sort,
  );
  const archivedCount = list.filter((l) => l.profile.archived).length;
  const lower = (s: string) => dartToLowerCase(s);
  const roleTabs = [
    ...new Set([
      ...characterRoles.filter((role) => facets.roles.some((r) => lower(r) === lower(role))),
      ...facets.roles,
    ]),
  ];
  return {
    active,
    list,
    kept,
    facets,
    found,
    archivedCount,
    roleTabs,
    count: countText(found.length, kept.length, query),
  };
}

/** "3 characters", or "1 of 3 characters" while searching or filtering. */
export function countText(found: number, kept: number, query: string): string {
  return found === kept && dartTrim(query).length === 0
    ? plural(found, 'character')
    : `${formatNumber(found)} of ${plural(kept, 'character')}`;
}

/** A role as a tab: the default roles read as plurals ("Protagonists"); the author's own are shown as written. */
export function roleTabLabel(role: string): string {
  return role.endsWith('s') || !characterRoles.includes(role) || ['Supporting', 'Minor', 'Background'].includes(role)
    ? role
    : `${role}s`;
}

/** The role tabs: All, each role, and Archived (while any are, or while it is the tab chosen), each with what a press
 * on it sets the filters to. */
export function roleTabs(
  filters: CastFilters,
  view: Pick<LibraryView, 'list' | 'archivedCount' | 'roleTabs'>,
): { label: string; selected: boolean; filters: CastFilters }[] {
  const isRole = (role: string) => !filters.archived && foldText(filters.role) === foldText(role);
  const count = view.list.length - view.archivedCount;
  return [
    {
      label: `All (${count})`,
      selected: filters.role.length === 0 && !filters.archived,
      filters: filters.copyWith({ role: '', archived: false }),
    },
    ...view.roleTabs.map((role) => ({
      label: roleTabLabel(role),
      selected: isRole(role),
      filters: filters.copyWith({ role, archived: false }),
    })),
    ...(view.archivedCount > 0 || filters.archived
      ? [
          {
            label: `Archived (${view.archivedCount})`,
            selected: filters.archived,
            filters: filters.copyWith({ role: '', archived: true }),
          },
        ]
      : []),
  ];
}

/** "Show 60 more" (or as many as are left). */
export function showMoreLabel(found: number, shown: number): string {
  return `Show ${formatNumber(found - shown < castPage ? found - shown : castPage)} more`;
}

/** The filters button: "Filters", or "Filters (2)". */
export function filtersLabel(active: number): string {
  return active > 0 ? `Filters (${active})` : 'Filters';
}

/** A filter menu: its label, the value chosen ('' for Any), the choices, and the filters a choice gives. */
export type FilterMenu = {
  label: string;
  value: string;
  choices: readonly string[];
  pick: (v: string) => CastFilters;
};

/** The filter menus, for the values in use (each only when there is something to choose), and the chapter the first
 * appearance is by. `anyLabel` heads each menu. */
export function filterMenus(
  cast: CastData,
  facets: Facets,
  filters: CastFilters,
): {
  menus: FilterMenu[];
  anyLabel: string;
  firstBy: { label: string; anyLabel: string; value: number | null; chapters: { value: number; label: string }[] } | null;
  /** Shown when there is no menu at all. */
  empty: string | null;
  clear: { label: string; filters: CastFilters } | null;
} {
  const menu = (label: string, value: string, choices: readonly string[], set: (v: string) => CastFilters) => ({
    label,
    value: choices.includes(value) ? value : '',
    choices,
    pick: set,
  });
  const menus: FilterMenu[] = [];
  if (facets.statuses.length > 0) {
    menus.push(menu('Status', filters.status, facets.statuses, (v) => filters.copyWith({ status: v })));
  }
  if (facets.tags.length > 0) menus.push(menu('Tag', filters.tag, facets.tags, (v) => filters.copyWith({ tag: v })));
  if (facets.species.length > 0) {
    menus.push(menu('Species', filters.species, facets.species, (v) => filters.copyWith({ species: v })));
  }
  if (facets.occupations.length > 0) {
    menus.push(menu('Occupation', filters.occupation, facets.occupations, (v) => filters.copyWith({ occupation: v })));
  }
  if (facets.factions.length > 0) {
    menus.push(menu('Faction', filters.faction, facets.factions, (v) => filters.copyWith({ faction: v })));
  }
  const chapters = cast.model.order.chapters;
  const firstBy =
    chapters.length === 0
      ? null
      : {
          label: 'First appears by',
          anyLabel: 'Any chapter',
          value: filters.firstBy,
          chapters: chapters.map((c) => ({ value: cast.model.order.position.get(c.id)!, label: c.displayTitle })),
        };
  const none = menus.length === 0 && firstBy === null;
  return {
    menus,
    anyLabel: 'Any',
    firstBy,
    empty: none
      ? 'Filters appear as your characters gain a status, tags, a species, an occupation or a faction.'
      : null,
    clear: filters.active > 0 ? { label: 'Clear filters', filters: filters.cleared() } : null,
  };
}

/** When nothing is found: what to say, and what Clear gives (the same side of the archive, nothing else). */
export function noResults(query: string, filters: CastFilters): {
  title: string;
  message: string;
  clearLabel: string;
  cleared: CastFilters;
} {
  const q = dartTrim(query);
  return {
    title: q.length === 0 ? 'Nothing matches these filters' : `Nothing matches “${q}”`,
    message: 'Your records are unchanged; they are only hidden by the current search or filters.',
    clearLabel: 'Clear search and filters',
    cleared: new CastFilters({ archived: filters.archived }),
  };
}

/** Under the cast, when the book has chapters. */
export const whereNote =
  'Where each character is in the book is read from the text: a link to them, or their name, a part of it that is ' +
  'theirs alone, an alias or their title on the page.';

/** A row of the list view: its title and the line under it. */
export function listRow(l: Listed): { title: string; subtitle: string } {
  return {
    title: [l.entry.name, ...(l.profile.epithet.length > 0 ? [l.profile.epithet] : [])].join(' · '),
    subtitle: [
      ...(l.profile.roles.length > 0 ? [l.profile.roles.join(', ')] : []),
      ...(l.entry.summary.length > 0 ? [l.entry.summary] : []),
      l.seenIn.length === 0
        ? 'Not in the manuscript yet'
        : `In ${formatNumber(l.seenIn.length)} ${l.seenIn.length === 1 ? 'chapter' : 'chapters'}`,
    ].join(' · '),
  };
}

/** Whether the list's rows can be moved: in "My order", while not searching. */
export function canReorder(sort: CastSort, query: string): boolean {
  return sort === 'custom' && dartTrim(query).length === 0;
}

/** The ids in their new order after moving `l` one place (`by` -1 or +1) among `found`, for
 * CharacterChanges.reorder; null at either end. */
export function moveInOrder(found: readonly Listed[], l: Listed, by: number): string[] | null {
  const ids = found.map((x) => x.entry.id);
  const at = ids.indexOf(l.entry.id);
  if (at + by < 0 || at + by >= ids.length) return null;
  const other = ids[at + by];
  ids[at + by] = l.entry.id;
  ids[at] = other;
  return ids;
}

/** Tooltips of a row's move buttons. */
export function moveTooltips(l: Listed): { up: string; down: string } {
  return { up: `Move ${l.entry.name} up`, down: `Move ${l.entry.name} down` };
}

/** The library's words. */
export const libraryWords = {
  newCharacter: 'New character',
  search: 'Search characters',
  clearSearch: 'Clear search',
  sortBy: 'Sort by',
  castList: 'Cast list for the book',
  noNovel: {
    title: 'No novel open',
    message: 'Characters and the rest of what Organize holds belong to a novel. Open one from the Library.',
    action: 'Go to Library',
  },
  inTheCast: (name: string) => `${name} is in the cast.`,
} as const;
