// FACTIONS AND THEIR TIES (as in the original app): who belongs to a faction and who leads it, who it is allied with
// or at war with, what it controls and influences, where it is based: read from the typed connections the author
// records, each with when it holds. Nothing is assumed to last: a tie with no time given is said to have none, and
// one that has ended is history, not the present. A port of flutter_app/lib/shared/domain/factions/ties.dart.

import { localeCompare } from '../collation';
import { numOrNull } from '../json';
import { compareNum } from '../manuscript/dartSort';
import { EntityRef } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import { type Anchor, type Truth, Validity, historyOf, validAt } from '../model/validity';
import { whenWords } from '../progression/track';
import { stableSorted } from '../reader/stableSort';
import type { Entry } from '../records/entry';
import { type Link, connectionType } from '../records/link';

export type TieRole = 'leader' | 'member' | 'ally' | 'rival' | 'territory' | 'influence' | 'seat' | 'other';
export const tieRoles: readonly TieRole[] = ['leader', 'member', 'ally', 'rival', 'territory', 'influence', 'seat', 'other'];
export const tieRoleLabel: Readonly<Record<TieRole, string>> = {
  leader: 'Leaders',
  member: 'Members',
  ally: 'Allies',
  rival: 'Rivals and enemies',
  territory: 'Territory',
  influence: 'Influence',
  seat: 'Based in',
  other: 'Other ties',
};

export const roleOf: Readonly<Record<string, TieRole>> = {
  leads: 'leader',
  'member-of': 'member',
  'allied-with': 'ally',
  'at-war-with': 'rival',
  'considers-rival': 'rival',
  controls: 'territory',
  influences: 'influence',
  'located-in': 'seat',
};

export class Tie {
  constructor(
    readonly link: Link,
    readonly role: TieRole,
    /** The record at the other end. */
    readonly other: EntityRef,
    readonly otherName: string,
    /** The tie in words, from the faction: "Mira is a member", "Allied with The Crown". */
    readonly words: string,
    /** When it holds, in words: "from Year 3 until Year 8 (expelled)", or that no time is given. */
    readonly when: string,
    /** No time given: it holds as far as anyone has said, which is not the same as for ever. */
    readonly timeless: boolean,
    /** At the point asked about: holds, may hold, or not. */
    readonly holds: Truth,
  ) {}
}

function isFactionEnd(model: StoryModel, id: string): boolean {
  const category = model.entries.get(id)?.category;
  return category !== undefined && category !== 'character' && category !== 'location';
}

/** The factions: every codex entry of the Faction category, and any other record (never a character or a place) the
 * author treats as one: what someone is a member of or leads, or what controls or influences something. */
export function factionsOf(model: StoryModel): Entry[] {
  const ids = new Set<string>();
  for (const e of model.entries.values()) if (e.category === 'faction') ids.add(e.id);
  for (const l of model.links) {
    const key = connectionType(l.type).key;
    if ((key === 'member-of' || key === 'leads') && isFactionEnd(model, l.toId)) ids.add(l.toId);
    if ((key === 'controls' || key === 'influences') && isFactionEnd(model, l.fromId)) ids.add(l.fromId);
  }
  return stableSorted([...ids].map((id) => model.entries.get(id)!), (a, b) => localeCompare(a.name, b.name));
}

function nameOf(model: StoryModel, ref: EntityRef): string {
  const found =
    ref.type === 'entry'
      ? model.entries.get(ref.id)?.name
      : ref.type === 'event'
        ? model.events.get(ref.id)?.name
        : ref.type === 'node'
          ? model.nodes.get(ref.id)?.title
          : undefined;
  return found ?? 'something deleted';
}

/** A tie's time in words: "from Year 3 until Year 8 (expelled)", "until Ch 4", or that none is given. */
export function whenHeld(link: Link, model: StoryModel): string {
  const validity = link.validity;
  const how = link.how;
  const from = validity?.from ?? null;
  const until = validity?.until ?? null;
  const began = how !== null ? ` (${how})` : '';
  if (validity === null || (from === null && until === null)) return `no time given${began}`;
  return [
    from !== null ? `from ${whenWords(from, model)}${began}` : `from the start${began}`,
    ...(until !== null ? [`until ${whenWords(until, model)}${link.endHow !== null ? ` (${link.endHow})` : ''}`] : []),
  ].join(' ');
}

/** Whether a tie holds at a point; at the end of the story (`at` null), whatever has not ended holds. */
export function holdsAt(validity: Validity | null, at: Anchor | null, model: StoryModel): Truth {
  if (at === null) return (validity?.until ?? null) !== null ? 'no' : 'yes';
  return validAt(validity ?? Validity.always, at, model.timeContext);
}

const createdAt = (l: Link): number => numOrNull(l.raw['createdAt']) ?? 0;

const lowerFirst = (s: string): string => (s.length === 0 ? s : `${s[0].toLowerCase()}${s.substring(1)}`);

/** Each record's links, by record (from it or to it, in the model's order, each once), kept with the model. */
const linksByEntry = new WeakMap<StoryModel, Map<string, Link[]>>();

function linksOf(model: StoryModel, id: string): readonly Link[] {
  let index = linksByEntry.get(model);
  if (index === undefined) {
    index = new Map();
    for (const link of model.links) {
      const from = link.fromType === 'entry' ? link.fromId : null;
      const to = link.toType === 'entry' ? link.toId : null;
      if (from !== null) (index.get(from) ?? index.set(from, []).get(from)!).push(link);
      if (to !== null && to !== from) (index.get(to) ?? index.set(to, []).get(to)!).push(link);
    }
    linksByEntry.set(model, index);
  }
  return index.get(id) ?? [];
}

/** Every tie of one faction, each with its role, its words and when it holds; `at` (null for the end of the story)
 * marks which hold at that point. */
export function factionTies(model: StoryModel, factionId: string, at: Anchor | null = null): Tie[] {
  const out: Tie[] = [];
  for (const link of linksOf(model, factionId)) {
    if (link.type === null) continue;
    const outgoing = link.fromId === factionId && link.fromType === 'entry';
    const incoming = link.toId === factionId && link.toType === 'entry';
    if (!outgoing && !incoming) continue;
    const kind = connectionType(link.type);
    const other = outgoing ? link.to : link.from;
    const role: TieRole = roleOf[kind.key] ?? 'other';
    // A role reads one way: a member is someone's tie TO the faction; territory is the faction's tie TO a place.
    const fits =
      role === 'leader' || role === 'member'
        ? incoming
        : role === 'territory' || role === 'influence' || role === 'seat'
          ? outgoing
          : true;
    const otherName = nameOf(model, other);
    const said = link.fromLabel.length > 0 ? link.fromLabel : kind.label;
    const words =
      !fits || role === 'other' || role === 'ally' || role === 'rival'
        ? outgoing
          ? `${said} ${otherName}`
          : `${otherName} ${lowerFirst(said)} this`
        : role === 'leader'
          ? `${otherName} leads it`
          : role === 'member'
            ? `${otherName} is a member`
            : `${said} ${otherName}`;
    const validity = link.validity;
    out.push(
      new Tie(
        link,
        fits ? role : 'other',
        other,
        otherName,
        words,
        whenHeld(link, model),
        validity === null || (validity.from === null && validity.until === null),
        holdsAt(validity, at, model),
      ),
    );
  }
  const sorted = stableSorted(out, (a, b) => {
    const c = compareNum(createdAt(a.link), createdAt(b.link));
    return c !== 0 ? c : localeCompare(a.link.id, b.link.id);
  });
  return historyOf(sorted, (t) => t.link.validity ?? Validity.always, model.timeContext);
}

/** A faction at a point: its ties by role, only those that hold there or may (marked), and how many have ended or not
 * yet begun. */
export function factionAt(model: StoryModel, factionId: string, at: Anchor | null): { byRole: Map<TieRole, Tie[]>; notNow: number } {
  const ties = factionTies(model, factionId, at);
  const byRole = new Map<TieRole, Tie[]>();
  for (const t of ties.filter((t) => t.holds !== 'no')) (byRole.get(t.role) ?? byRole.set(t.role, []).get(t.role)!).push(t);
  return { byRole, notNow: ties.filter((t) => t.holds === 'no').length };
}

/** How many factions the map draws at most when none is looked at. */
export const mapMost = 24;

/** Ties between factions, and from factions to what they control or influence, holding at a point: what the faction
 * map draws. Around a faction: it, the factions tied to it and what it holds in sway, by its own ties only. Otherwise
 * every faction; or, when there are more than `most`, the `most` with the most ties holding there (the rest in
 * `left`), with the ties among them and what they hold. */
export function factionNetwork(
  model: StoryModel,
  at: Anchor | null,
  options: { around?: string | null; most?: number } = {},
): { factions: Entry[]; edges: Tie[]; territories: Entry[]; left: number } {
  const around = options.around ?? null;
  const most = options.most ?? mapMost;
  const all = factionsOf(model);
  const ids = new Set(all.map((f) => f.id));
  const edges: Tie[] = [];
  const seen = new Set<string>();
  for (const f of around === null ? all : all.filter((f) => f.id === around)) {
    for (const t of factionTies(model, f.id, at)) {
      if (t.holds === 'no' || seen.has(t.link.id)) continue;
      const between =
        t.other.type === 'entry' &&
        ids.has(t.other.id) &&
        (t.role === 'ally' || t.role === 'rival' || t.role === 'influence' || t.role === 'other');
      const over = t.role === 'territory' || (t.role === 'influence' && t.other.type === 'entry');
      if (between || over) {
        edges.push(t);
        seen.add(t.link.id);
      }
    }
  }
  let factions = all;
  let drawn = edges;
  if (around !== null) {
    const near = new Set([around, ...edges.map((e) => e.link.fromId), ...edges.map((e) => e.link.toId)]);
    factions = [...all.filter((f) => f.id === around), ...all.filter((f) => f.id !== around && near.has(f.id))];
  } else if (all.length > most) {
    const ties = new Map<string, number>();
    for (const e of edges) {
      for (const id of new Set([e.link.fromId, e.link.toId])) if (ids.has(id)) ties.set(id, (ties.get(id) ?? 0) + 1);
    }
    const kept = new Set(stableSorted(all, (a, b) => compareNum(ties.get(b.id) ?? 0, ties.get(a.id) ?? 0)).slice(0, most));
    factions = all.filter((f) => kept.has(f));
    const keptIds = new Set(factions.map((f) => f.id));
    // Ties among those drawn, and what those drawn hold; a tie to a faction left out is not drawn.
    drawn = edges.filter((e) => [e.link.fromId, e.link.toId].filter((id) => ids.has(id)).every((id) => keptIds.has(id)));
  }
  const territories: string[] = [];
  for (const e of drawn) {
    if (e.other.type === 'entry' && !ids.has(e.other.id) && !territories.includes(e.other.id)) territories.push(e.other.id);
  }
  return {
    factions,
    edges: drawn,
    territories: territories.map((id) => model.entries.get(id)).filter((e): e is Entry => e !== undefined),
    left: all.length - factions.length,
  };
}
