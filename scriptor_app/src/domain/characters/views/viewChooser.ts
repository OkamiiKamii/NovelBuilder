// THE VIEW CHOOSER, on a phone: the view in use, by its icon and name, in place of a strip of icons that runs off the
// screen. Pressed, **Ways to see your cast**: every view by name, what it shows in a line, in its group, the one in use
// marked (a check, its tile tinted in the accent); a press on one shows it (and is remembered, castViewKey).
//
// The pure parts of flutter_app/lib/features/characters/widgets/view_chooser.dart. (The CastView union and its stored
// key are in castData.ts, in the views' own order there; here they are in the order they are offered.)

import { type CastView } from '../castData';

/** A way to see the cast: the view, its icon (Material Icons' name) and name, the group it is in, and what it shows,
 * in a line. */
export type CastViewInfo = { view: CastView; icon: string; name: string; group: string; about: string };

/** The ways to see the cast, in the order they are offered, grouped: the cast itself, what is between them, and what
 * the pages say of them. */
export const castViewInfos: readonly CastViewInfo[] = [
  {
    view: 'cards',
    icon: 'grid_view',
    name: 'Cards',
    group: 'The cast',
    about: 'Their portraits, how well each is known, and whom to interview next.',
  },
  { view: 'list', icon: 'view_list', name: 'List', group: 'The cast', about: 'A compact list, in the order you choose.' },
  {
    view: 'roll',
    icon: 'table_rows_outlined',
    name: 'Roll call',
    group: 'The cast',
    about: 'Everyone’s basics in one table, written in place.',
  },
  {
    view: 'names',
    icon: 'sort_by_alpha',
    name: 'Names',
    group: 'The cast',
    about: 'Every name on a board of the alphabet: the look-alikes and the free letters.',
  },
  {
    view: 'ties',
    icon: 'hub_outlined',
    name: 'Ties',
    group: 'Between them',
    about: 'Every pair, who they are to each other, one press to record it.',
  },
  {
    view: 'stakes',
    icon: 'flag_outlined',
    name: 'Stakes',
    group: 'Between them',
    about: 'What drives each of them, and where their wants collide.',
  },
  {
    view: 'compass',
    icon: 'explore_outlined',
    name: 'Compass',
    group: 'Between them',
    about: 'Their temperaments side by side: the foils, the ones too alike, what all share.',
  },
  {
    view: 'orbit',
    icon: 'track_changes',
    name: 'Orbit',
    group: 'Between them',
    about: 'The cast circling the heart of the book, and the one to know next.',
  },
  {
    view: 'eyes',
    icon: 'visibility_outlined',
    name: 'Eyes',
    group: 'In your pages',
    about: 'Whose eyes each chapter is told through.',
  },
  {
    view: 'entrances',
    icon: 'door_front_door_outlined',
    name: 'Entrances',
    group: 'In your pages',
    about: 'The order a reader meets them, and what each first moment gives.',
  },
  {
    view: 'tableRead',
    icon: 'theater_comedy_outlined',
    name: 'Table read',
    group: 'In your pages',
    about: 'A chapter as a script, read aloud by the cast, each in a voice of their own.',
  },
  {
    view: 'arcs',
    icon: 'show_chart',
    name: 'Arcs',
    group: 'In your pages',
    about: 'Each one’s line through the book, from the feeling in the words around them.',
  },
];

/** The way of seeing `view`. */
export function infoOf(view: CastView): CastViewInfo {
  return castViewInfos.find((v) => v.view === view)!;
}

/** The button that opens the chooser (test key `cast-views`): the view in use by its icon and name, and a drop-down
 * arrow; what a screen reader says of it. */
export function castViewButton(view: CastView): { icon: string; label: string; semanticsLabel: string } {
  const info = infoOf(view);
  return { icon: info.icon, label: info.name, semanticsLabel: `Seeing the cast as ${info.name}. Ways to see your cast` };
}

/** The sheet of every view (over the whole app, at most 85% of the screen high): its title and caption, then each
 * group under its heading in capitals, each view a tile (test key `view-<view>`) marked when it is the one in use. */
export function castViewSheet(current: CastView): {
  title: string;
  caption: string;
  groups: { group: string; heading: string; views: (CastViewInfo & { chosen: boolean; key: string })[] }[];
} {
  const groups = new Map<string, (CastViewInfo & { chosen: boolean; key: string })[]>();
  for (const v of castViewInfos) {
    let list = groups.get(v.group);
    if (list === undefined) groups.set(v.group, (list = []));
    list.push({ ...v, chosen: v.view === current, key: `view-${v.view}` });
  }
  return {
    title: 'Ways to see your cast',
    caption: 'The same cast, many ways: each shows something the others do not.',
    groups: [...groups].map(([group, views]) => ({ group, heading: group.toUpperCase(), views })),
  };
}

/** The view to show after the sheet closes with `picked` (null: closed without a choice): null when nothing changes. */
export function castViewPicked(current: CastView, picked: CastView | null): CastView | null {
  return picked !== null && picked !== current ? picked : null;
}
