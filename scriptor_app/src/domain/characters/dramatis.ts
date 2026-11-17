// DRAMATIS PERSONAE: the cast list printed before the story, as epic and ensemble novels have it, made from the cast.
// One a line, "Name — who they are", in the shape `castLines` (reader/book.ts) reads back: grouped by faction or by the
// part they play (a line ending in ":" heads a group), in the order the reader meets them or by name. Who they are is
// what a reader may know from the start: the title they go by, else the first sentence of their summary, else their
// trade. Never their fate, their status or a secret.
//
// Makes text only; putting it in the book is the author's choice. A port of
// flutter_app/lib/shared/domain/characters/dramatis.dart.

import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim, dartTrimRight } from '../text/dartString';
import { foldText } from '../text/fold';

/** How the list is divided. */
export type CastGrouping = 'faction' | 'role' | 'none';
export const castGroupings: readonly CastGrouping[] = ['faction', 'role', 'none'];
export const castGroupingLabel: Readonly<Record<CastGrouping, string>> = {
  faction: 'By faction',
  role: 'By part',
  none: 'One list',
};

/** The order within a group. */
export type CastOrder = 'appearance' | 'name';
export const castOrders: readonly CastOrder[] = ['appearance', 'name'];
export const castOrderLabel: Readonly<Record<CastOrder, string>> = {
  appearance: 'As they appear',
  name: 'By name',
};

/** A character for the list: their id and name, who they are in a phrase, and their factions and roles. */
export type DramatisPerson = {
  id: string;
  name: string;
  about: string;
  factions: readonly string[];
  roles: readonly string[];
};

/** The heading for those with no faction, and for the roles. */
export const otherFaction = 'Others';
export const principalPart = 'Principal characters';
export const supportingPart = 'Supporting characters';
export const minorPart = 'And';

const codeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The cast list for `people`. `appearance` is each one's place in the order of appearance (entrances); with
 * `onlyOnPage` (the default), those not in it are left out (nobody a reader has not met is printed). */
export function composeDramatis(
  people: readonly DramatisPerson[],
  options: {
    by: CastGrouping;
    order: CastOrder;
    appearance?: ReadonlyMap<string, number>;
    onlyOnPage?: boolean;
  },
): string {
  const { by, order } = options;
  const appearance = options.appearance ?? new Map<string, number>();
  const onlyOnPage = options.onlyOnPage ?? true;
  const chosen = people.filter((p) => dartTrim(p.name).length > 0 && (!onlyOnPage || appearance.has(p.id)));
  const ordered = (a: DramatisPerson, b: DramatisPerson): number => {
    if (order === 'appearance') {
      const x = appearance.get(a.id) ?? 1 << 30;
      const y = appearance.get(b.id) ?? 1 << 30;
      if (x !== y) return x - y;
    }
    return codeUnits(foldText(a.name), foldText(b.name));
  };
  const line = (p: DramatisPerson) =>
    dartTrim(p.about).length === 0 ? dartTrim(p.name) : `${dartTrim(p.name)} — ${dartTrim(p.about)}`;

  if (by === 'none') return dartSort(chosen, ordered).map(line).join('\n');

  const groups = new Map<string, DramatisPerson[]>();
  for (const p of chosen) {
    const key = by === 'faction' ? factionOf(p) : partOf(p);
    let g = groups.get(key);
    if (g === undefined) groups.set(key, (g = []));
    g.push(p);
  }
  for (const g of groups.values()) dartSort(g, ordered);
  // Groups in the order of their first member; for parts, principal first; those with no faction last.
  const rank = [principalPart, supportingPart, minorPart];
  const names = dartSort([...groups.keys()], (a, b) => {
    if (by === 'role') return rank.indexOf(a) - rank.indexOf(b);
    if ((a === otherFaction) !== (b === otherFaction)) return a === otherFaction ? 1 : -1;
    return ordered(groups.get(a)![0], groups.get(b)![0]);
  });
  // One group alone needs no heading.
  if (names.length === 1) return groups.get(names[0])!.map(line).join('\n');
  const out: string[] = [];
  names.forEach((g, i) => {
    if (i > 0) out.push('');
    out.push(`${g}:`);
    for (const p of groups.get(g)!) out.push(line(p));
  });
  return out.join('\n');
}

function factionOf(p: DramatisPerson): string {
  const f = p.factions.find((x) => dartTrim(x).length > 0);
  return f === undefined ? otherFaction : dartTrim(f);
}

function partOf(p: DramatisPerson): string {
  const roles = p.roles.map(dartToLowerCase);
  if (roles.some((r) => r.includes('protagonist') || r.includes('antagonist') || r === 'lead' || r === 'main character')) {
    return principalPart;
  }
  if (roles.some((r) => r.includes('supporting') || r.includes('love interest') || r.includes('mentor'))) {
    return supportingPart;
  }
  return minorPart;
}

/** Who someone is in a phrase a reader may know from the start: the title they go by, else the first sentence of
 * their summary (cut at about `most` characters, UTF-16 units as Dart counts), else their trade. */
export function aboutOf(args: { epithet: string; summary: string; occupation: string; most?: number }): string {
  const most = args.most ?? 90;
  if (dartTrim(args.epithet).length > 0) return dartTrim(args.epithet);
  const s = dartTrim(args.summary);
  if (s.length > 0) {
    const end = /[.!?…](\s|$)/.exec(s);
    let first = dartTrim(end === null ? s : s.substring(0, end.index));
    if (first.length > most) {
      const cut = first.lastIndexOf(' ', most);
      first = `${dartTrimRight(first.substring(0, cut > 0 ? cut : most))}…`;
    }
    return first;
  }
  return dartTrim(args.occupation);
}
