import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import { connectionType } from '@/modules/connections/types';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { historyOf, timeContext, validAt, type Anchor, type Truth, type Validity } from '@/modules/model/validity';
import { whenWords } from '@/modules/progression/track';

/**
 * FACTIONS AND THEIR TIES
 * Who belongs to a faction and who leads it, who it is allied with or at
 * war with, what it controls and influences, where it is based: read from
 * the typed connections the author records, each with when it holds
 * (Prompt 8). Nothing is assumed to last: a tie with no time given is said
 * to have none, and one that has ended is history, not the present. Ties of
 * the author's own kinds are kept, under their own words.
 */

export type TieRole = 'leader' | 'member' | 'ally' | 'rival' | 'territory' | 'influence' | 'seat' | 'other';
export const ROLE_OF: Record<string, TieRole> = { leads: 'leader', 'member-of': 'member', 'allied-with': 'ally', 'at-war-with': 'rival', 'considers-rival': 'rival', controls: 'territory', influences: 'influence', 'located-in': 'seat' };
export const TIE_LABELS: Record<TieRole, string> = { leader: 'Leaders', member: 'Members', ally: 'Allies', rival: 'Rivals and enemies', territory: 'Territory', influence: 'Influence', seat: 'Based in', other: 'Other ties' };
export const TIE_ROLES: TieRole[] = ['leader', 'member', 'ally', 'rival', 'territory', 'influence', 'seat', 'other'];

export interface Tie {
  link: LoreLink;
  role: TieRole;
  /** The record at the other end. */
  other: EntityRef;
  otherName: string;
  /** The tie in words, from the faction: "Mira is a member", "Allied with The Crown", "Owes a debt to Orrin". */
  words: string;
  /** When it holds, in words: "from Year 3 until Year 8 (expelled)", or that no time is given. */
  when: string;
  /** No time given: it holds as far as anyone has said, which is not the same as for ever. */
  timeless: boolean;
  /** At the point asked about: holds, may hold (it cannot be placed against that point), or not. */
  holds: Truth;
}

const isFactionEnd = (model: Pick<StoryModel, 'entries'>, id: string) => {
  const category = model.entries.get(id)?.category;
  return category !== undefined && category !== 'character' && category !== 'location';
};

/**
 * The factions: every codex entry of the Faction category, and any other
 * record (never a character or a place) the author treats as one: what
 * someone is a member of or leads, or what controls or influences something.
 */
export function factionsOf(model: Pick<StoryModel, 'entries' | 'links'>): LoreEntry[] {
  const ids = new Set([...model.entries.values()].filter((e) => e.category === 'faction').map((e) => e.id));
  for (const l of model.links) {
    const key = connectionType(l.type).key;
    if ((key === 'member-of' || key === 'leads') && isFactionEnd(model, l.toId)) ids.add(l.toId);
    if ((key === 'controls' || key === 'influences') && isFactionEnd(model, l.fromId)) ids.add(l.fromId);
  }
  return [...ids].map((id) => model.entries.get(id)!).sort((a, b) => a.name.localeCompare(b.name));
}

const name = (model: StoryModel, ref: EntityRef) => (ref.type === 'entry' ? model.entries.get(ref.id)?.name : ref.type === 'event' ? model.events.get(ref.id)?.name : ref.type === 'node' ? model.nodes.get(ref.id)?.title : undefined) ?? 'something deleted';

/** A tie's time in words: "from Year 3 until Year 8 (expelled)", "until Ch 4", or that none is given. */
export function whenHeld(link: Pick<LoreLink, 'validity' | 'how' | 'endHow'>, model: StoryModel): string {
  const { from, until } = link.validity ?? { from: null, until: null };
  if (!link.validity || (!from && !until)) return `no time given${link.how ? ` (${link.how})` : ''}`;
  return [from ? `from ${whenWords(from, model)}${link.how ? ` (${link.how})` : ''}` : `from the start${link.how ? ` (${link.how})` : ''}`, until ? `until ${whenWords(until, model)}${link.endHow ? ` (${link.endHow})` : ''}` : ''].filter(Boolean).join(' ');
}

/** Whether a tie holds at a point; at the end of the story, whatever has not ended holds. */
export function holdsAt(validity: Validity | undefined, at: Anchor | 'end', model: StoryModel): Truth {
  if (at === 'end') return validity?.until ? false : true;
  return validAt(validity ?? { from: null, until: null }, at, timeContext(model));
}

/** Every tie of one faction, each with its role, its words and when it holds; `at` marks which hold at that point. */
export function factionTies(model: StoryModel, factionId: string, at: Anchor | 'end' = 'end'): Tie[] {
  const out: Tie[] = [];
  for (const link of model.links) {
    if (!link.type) continue;
    const outgoing = link.fromId === factionId && (link.fromType ?? 'entry') === 'entry';
    const incoming = link.toId === factionId && (link.toType ?? 'entry') === 'entry';
    if (!outgoing && !incoming) continue;
    const kind = connectionType(link.type);
    const other: EntityRef = outgoing ? { type: link.toType ?? 'entry', id: link.toId } : { type: link.fromType ?? 'entry', id: link.fromId };
    const role: TieRole = ROLE_OF[kind.key] ?? 'other';
    // A role reads one way: a member is someone's tie TO the faction; territory is the faction's tie TO a place.
    const fits = role === 'leader' || role === 'member' ? incoming : role === 'territory' || role === 'influence' || role === 'seat' ? outgoing : true;
    const otherName = name(model, other);
    const words =
      !fits || role === 'other' || role === 'ally' || role === 'rival'
        ? outgoing
          ? `${link.fromLabel || kind.label} ${otherName}`
          : `${otherName} ${(link.fromLabel || kind.label).charAt(0).toLowerCase()}${(link.fromLabel || kind.label).slice(1)} this`
        : role === 'leader'
          ? `${otherName} leads it`
          : role === 'member'
            ? `${otherName} is a member`
            : `${link.fromLabel || kind.label} ${otherName}`;
    out.push({ link, role: fits ? role : 'other', other, otherName, words, when: whenHeld(link, model), timeless: !link.validity || (!link.validity.from && !link.validity.until), holds: holdsAt(link.validity, at, model) });
  }
  const context = timeContext(model);
  return historyOf(out.sort((a, b) => a.link.createdAt - b.link.createdAt || a.link.id.localeCompare(b.link.id)), (t) => t.link.validity ?? { from: null, until: null }, context);
}

/** A faction at a point: its ties by role, only those that hold there or may (marked), and how many have ended or not yet begun. */
export function factionAt(model: StoryModel, factionId: string, at: Anchor | 'end'): { byRole: Map<TieRole, Tie[]>; notNow: number } {
  const ties = factionTies(model, factionId, at);
  const byRole = new Map<TieRole, Tie[]>();
  for (const t of ties.filter((t) => t.holds !== false)) byRole.set(t.role, [...(byRole.get(t.role) ?? []), t]);
  return { byRole, notNow: ties.filter((t) => t.holds === false).length };
}

/** Ties between factions, and from factions to what they control or influence, holding at a point: what the faction map draws. */
export function factionNetwork(model: StoryModel, at: Anchor | 'end'): { factions: LoreEntry[]; edges: Tie[]; territories: LoreEntry[] } {
  const factions = factionsOf(model);
  const ids = new Set(factions.map((f) => f.id));
  const edges: Tie[] = [];
  const seen = new Set<string>();
  for (const f of factions) {
    for (const t of factionTies(model, f.id, at)) {
      if (t.holds === false || seen.has(t.link.id)) continue;
      const between = t.other.type === 'entry' && ids.has(t.other.id) && (t.role === 'ally' || t.role === 'rival' || t.role === 'influence' || t.role === 'other');
      const over = t.role === 'territory' || (t.role === 'influence' && t.other.type === 'entry');
      if (between || over) {
        edges.push(t);
        seen.add(t.link.id);
      }
    }
  }
  const territories = [...new Set(edges.filter((e) => e.other.type === 'entry' && !ids.has(e.other.id)).map((e) => e.other.id))].map((id) => model.entries.get(id)!).filter(Boolean);
  return { factions, edges, territories };
}
