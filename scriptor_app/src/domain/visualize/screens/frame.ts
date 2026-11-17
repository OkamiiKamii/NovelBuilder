// The pure parts of the Visualize frame and its atlas (flutter_app/lib/features/visualize/{viz_frame,view_atlas,
// view_lists_page,visualize_providers}.dart): the views a novel offers, gathered by subject; how a selection opens and
// how a row stands to it; the records the shared filters leave; the words of the saved-views menu, the views' switches
// and the lists page. Canon and continuity marks (canon_badge.dart) read Review's overlay, which comes with Review.

import { type JsonMap } from '../../json';
import { type EntityRef, type EntityType } from '../../model/entityRef';
import { Filter, select } from '../../model/query';
import { type StoryModel } from '../../model/storyModel';
import { plural } from '../../desk/format';
import { isViewOn, viewsOn } from '../modules';
import { activeFilters } from '../savedViews';
import { type ProgressionRow } from '../summaries';
import { isBuilt, scriptorPath, type VisualView } from '../views';

/** Each view's emblem (the Flutter app's Material icons, as Material Community icons). */
export const viewIcon: Readonly<Record<string, string>> = {
  timeline: 'chart-timeline-variant',
  order: 'compare-horizontal',
  relationships: 'hubspot',
  plot: 'view-column-outline',
  graph: 'graph-outline',
  places: 'map-marker-outline',
  progression: 'trending-up',
  history: 'account-search-outline',
  structure: 'chart-bar',
  appearances: 'grid',
  kinds: 'shape-outline',
  abilities: 'creation-outline',
  journeys: 'routes',
  knowledge: 'lock-outline',
  factions: 'account-group-outline',
  ownership: 'package-variant-closed',
  charts: 'chart-box-outline',
};

/** The views a novel offers now: those built that it has not turned off. */
export const offeredViews = (viewsOff: readonly string[]): VisualView[] => viewsOn(viewsOff).filter(isBuilt);

/** The subjects the views are gathered under, in order, and which view goes under which. A view not named here goes
 * under the last. */
export const atlasSubjects: readonly (readonly [string, readonly string[]])[] = [
  ['People', ['relationships', 'history', 'appearances', 'progression', 'abilities', 'knowledge']],
  ['Time', ['timeline', 'order']],
  ['The story', ['plot', 'structure']],
  ['The world', ['places', 'journeys', 'factions', 'ownership', 'kinds', 'graph']],
  ['Numbers', ['charts']],
];

/** The views offered, gathered by subject in the atlas's order (empty subjects left out). */
export function atlasOf(views: readonly VisualView[]): [string, VisualView[]][] {
  const placed = new Set<string>();
  const out: [string, VisualView[]][] = [];
  for (const [subject, keys] of atlasSubjects) {
    const here = keys.flatMap((k) => views.filter((v) => v.key === k).slice(0, 1));
    for (const v of here) placed.add(v.key);
    if (here.length > 0) out.push([subject, here]);
  }
  const rest = views.filter((v) => !placed.has(v.key));
  if (rest.length > 0) {
    const last = atlasSubjects[atlasSubjects.length - 1][0];
    if (out.length > 0 && out[out.length - 1][0] === last) out[out.length - 1][1].push(...rest);
    else out.push([last, rest]);
  }
  return out;
}

/** The atlas's words. */
export const atlasWords = {
  title: 'The views',
  intro: (n: number) => `Your records, drawn ${n} ways. Choose one to open it.`,
  showing: 'Showing now',
  close: 'Close the views',
  /** A view this version has no page for yet (Secrets and knowledge, with Review). */
  later: 'Comes in a later phase',
  plateLabel: (v: VisualView, current: boolean) => `${v.label}${current ? ', showing now' : ''}. ${v.description}`,
} as const;

/** Where a plate opens in Scriptor, or null when its page comes later. */
export const plateTarget = (v: VisualView): string | null => scriptorPath(v.key);

/** The novel's views turned off (the project's `viewsOff`). */
export const viewsOffOf = (project: JsonMap): string[] =>
  Array.isArray(project['viewsOff']) ? project['viewsOff'].filter((v): v is string => typeof v === 'string') : [];

/** Where a record is kept, as the rest of the app opens it; null when it has no page in this app. */
export function openLabel(model: StoryModel, ref: EntityRef): string | null {
  switch (ref.type) {
    case 'entry':
      return model.entries.get(ref.id)?.category === 'character' ? 'Open character profile' : 'Open in World';
    case 'node':
      return 'Open in the editor';
    case 'event':
      return 'Open the event';
    case 'relation':
      return 'Open the relationship';
    default:
      return null;
  }
}

/** How a row of a list stands to the selection, in words as well as shading. */
export function selectionWords(selectedId: string | null, related: ReadonlySet<string> | null, id: string): string | null {
  if (selectedId === id) return 'Selected';
  if (related !== null && related.has(id)) return 'Connected to the selection';
  return null;
}

/** The records the filters leave, by key (`entry:<id>`), of the given kinds; null when no filter is set, so a view
 * shows everything. The shared query decides, the same way in every view. */
export function matchingKeys(model: StoryModel, filter: JsonMap, types: readonly EntityType[]): Set<string> | null {
  if (activeFilters(filter) === 0) return null;
  const result = select(model, Filter.fromJson({ ...filter, types: [...types] }));
  return new Set(result.items.map((v) => v.ref.key));
}

/** The frame's shared filters as the query reads them: words in a name, and the character a view is narrowed to. */
export function frameFilter(query: string, involving: string | null): JsonMap {
  return { ...(query.trim().length > 0 ? { text: query } : {}), ...(involving !== null ? { characters: [involving] } : {}) };
}

export const frameWords = {
  noNovel: { title: 'No novel open', message: 'Visualize works inside one novel. Open one from the Library.', go: 'Go to Library' },
  off: {
    title: 'This view is turned off in this novel',
    message:
      'Its records are all still there, on their own pages and in the other views, and its saved views are kept. Turning it on brings it back as it was.',
    turnOn: 'Turn this view on',
  },
  search: 'Search by name',
  involving: 'Involving character',
  anyone: 'Anyone',
  clear: (n: number) => `Clear filters (${n})`,
  missing: (n: number) =>
    n === 1 ? '1 record this saved view names no longer exists; it shows the rest.' : `${n} records this saved view names no longer exist; it shows the rest.`,
  selected: (label: string | null) => `Selected: ${label ?? 'a record no longer here'}`,
  details: 'Details',
  clearSelection: 'Clear',
  notFound: {
    title: 'Not found',
    message: 'This record is no longer in this novel; it may have been deleted. Nothing else has changed.',
    clear: 'Clear the selection',
  },
  nothingConnected: 'Not connected to anything yet.',
  closeDetails: 'Close the details',
  export: 'Export this view',
  manage: 'Turn views on or off',
  viewMenu: (label: string | null) => `View: ${label ?? 'choose a view'}. All views`,
  choose: 'Choose a view',
} as const;

export const savedWords = {
  menu: (open: string | null, count: number) => (open === null ? `Saved views (${count})` : `Saved view: ${open}`),
  none: 'No saved views of this view yet',
  saveAs: 'Save view as…',
  save: (name: string) => `Save changes to “${name}”`,
  rename: 'Rename…',
  duplicate: 'Duplicate',
  restore: 'Restore default',
  delete: 'Delete…',
  close: 'Close the saved view',
  saveTitle: 'Save this view',
  saveLabel: 'Name of the saved view',
  saveConfirm: 'Save',
  renameTitle: 'Rename the saved view',
  renameLabel: 'Name',
  renameConfirm: 'Rename',
  deleteTitle: (name: string) => `Delete the saved view “${name}”?`,
  deleteMessage: 'Only the saved view goes. No record is changed.',
} as const;

export const manageWords = {
  title: 'Views in this novel',
  intro:
    'A view that is off is hidden from Visualize. Nothing is deleted: its records stay on their own pages and in the other views, and its saved views are kept.',
  coming: 'Coming in later phases',
  stays: (label: string) => `${label} stays on`,
  staysWhy: (label: string, by: readonly { label: string; why: string }[]) =>
    `${label} stays on while ${by.map((b) => b.label).join(' and ')} ${by.length === 1 ? 'is' : 'are'} on: ${by
      .map((b) => `${b.label} needs it, because ${b.why}`)
      .join('; ')}.`,
  keep: (label: string) => `Keep ${label} on`,
  offAll: (labels: readonly string[]) => `Turn off ${labels.join(' and ')}`,
  turnedOn: (label: string, also: readonly string[]) => `${label} is on, with ${also.join(' and ')}, which it needs.`,
  done: 'Done',
} as const;

/** Whether a view is on, for the page that shows it. */
export const viewIsOn = isViewOn;

// ---------------------------------------------------------------------------------------------- the lists page

export const progressionListWords = {
  empty: {
    title: 'Nothing tracked yet',
    message:
      'Characters appear here once something about how they change is recorded: abilities on a sheet, snapshots or progression changes. Nobody is assumed to have a level.',
  },
} as const;

/** A progression row's line under the name. */
export function progressionLine(r: ProgressionRow): string {
  return [
    ...(r.now.length > 0 ? [r.now] : []),
    ...(r.abilities > 0 ? [`${plural(r.abilities, 'ability', 'abilities')} on a sheet`] : []),
    ...(r.snapshots > 0 ? [plural(r.snapshots, 'snapshot')] : []),
    ...(r.changes > 0 ? [plural(r.changes, 'change')] : []),
  ].join(' · ');
}
