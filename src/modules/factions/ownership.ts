import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import { connectionType } from '@/modules/connections/types';
import type { StoryModel } from '@/modules/model/types';
import { historyOf, spanOfDate, spanOfEvent, timeContext, type Anchor, type Validity } from '@/modules/model/validity';
import { whenWords } from '@/modules/progression/track';
import { holdsAt } from './ties';

/**
 * WHO HELD IT, AND HOW IT PASSED
 * An item's ownership, from the "Owns" connections the author records:
 * each holding with when it began and how (made, found, given, sold,
 * stolen, inherited…), when it ended and how (passed to the next holder,
 * lost, destroyed…). Who made it comes from its "Created by". Nothing is
 * assumed: a holding with no time is said to have none; a stretch with no
 * holding recorded is said to be unknown; a holding tied to an event that
 * does not happen in this timeline (an alternate history without it) is
 * said not to happen here, and is not counted.
 */

/** How a holding begins, and how one ends with nothing after it: offered as words, never required. */
export const HOW_GAINED = ['made', 'found', 'given', 'sold', 'stolen', 'inherited', 'won', 'claimed'] as const;
export const HOW_ENDED = ['lost', 'destroyed', 'abandoned', 'hidden'] as const;

export interface Holding {
  link: LoreLink;
  holderId: string;
  holderName: string;
  /** How it began, in the author's words. */
  how: string;
  began: string;
  /** When it ended, in words; null while it still holds. */
  ended: string | null;
  /** How it ended: the author's words, or how the next holding began when it begins right there ("stolen by Mira"). */
  endHow: string;
  /** No time given at all. */
  timeless: boolean;
  /** False when it hangs on an event this timeline does not have (an alternate history without it). */
  inThisTimeline: boolean;
}

export interface Ownership {
  item: LoreEntry;
  /** "Created by" the item, with when. */
  makers: { name: string; when: string }[];
  holdings: Holding[];
  /** Stretches between holdings with no holder recorded, in words. */
  unknown: string[];
  /** Where it stands at the point asked about. */
  now: { state: 'held' | 'ended' | 'unknown' | 'none'; holders: string[]; words: string };
}

/** Items: every codex entry of the Item category, and anything the author records as owned. */
export function ownedItems(model: Pick<StoryModel, 'entries' | 'links'>): LoreEntry[] {
  const ids = new Set([...model.entries.values()].filter((e) => e.category === 'item').map((e) => e.id));
  for (const l of model.links) if (connectionType(l.type).key === 'owns' && (l.toType ?? 'entry') === 'entry' && model.entries.has(l.toId)) ids.add(l.toId);
  return [...ids].map((id) => model.entries.get(id)!).sort((a, b) => a.name.localeCompare(b.name));
}

type Point = { axis: 'story'; lo: number; hi: number } | { axis: 'reading'; at: number } | null;
function pointOf(anchor: Anchor | null, model: StoryModel): Point {
  if (!anchor) return null;
  if (anchor.kind === 'node') return model.order.position.has(anchor.nodeId) ? { axis: 'reading', at: model.order.position.get(anchor.nodeId)! } : null;
  const span = anchor.kind === 'event' ? spanOfEvent(anchor.eventId, timeContext(model)) : spanOfDate(anchor.when, timeContext(model));
  return span ? { axis: 'story', ...span } : null;
}

const missing = (a: Anchor | null | undefined, model: StoryModel) => a?.kind === 'event' && !model.events.has(a.eventId);
/**
 * A holding as this timeline has it: one that begins at an event this
 * timeline does not have does not happen here; one that ends at such an
 * event does not end there, and goes on.
 */
const asHere = (validity: Validity | undefined, model: StoryModel): Validity | undefined => (validity && missing(validity.until, model) ? { from: validity.from, until: null } : validity);

/** How it passed to the next holder: "stolen by Mira", "given to the King". */
const passed = (how: string, to: string) => (how ? `${how} ${['given', 'sold', 'bequeathed', 'lent'].includes(how.toLowerCase()) ? 'to' : 'by'} ${to}` : `passed to ${to}`);

export function ownershipOf(model: StoryModel, itemId: string, at: Anchor | 'end' = 'end'): Ownership | null {
  const item = model.entries.get(itemId);
  if (!item) return null;
  const owns = model.links.filter((l) => connectionType(l.type).key === 'owns' && l.toId === itemId && (l.toType ?? 'entry') === 'entry' && (l.fromType ?? 'entry') === 'entry');
  const ordered = historyOf(owns.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), (l) => l.validity ?? { from: null, until: null }, timeContext(model));
  const nameOf = (id: string) => model.entries.get(id)?.name ?? 'someone deleted';
  const holdings: Holding[] = ordered.map((link, i) => {
    const until = asHere(link.validity, model)?.until ?? null;
    // The next holding beginning right where this one ends says how it passed on.
    const next = ordered.slice(i + 1).find((n) => until && JSON.stringify(n.validity?.from) === JSON.stringify(until));
    const endsElsewhere = missing(link.validity?.until, model);
    return {
      link,
      holderId: link.fromId,
      holderName: nameOf(link.fromId),
      how: link.how ?? '',
      began: missing(link.validity?.from, model) ? 'at an event this timeline does not have' : link.validity?.from ? whenWords(link.validity.from, model) : link.validity ? 'from the start' : 'no time given',
      ended: until ? whenWords(until, model) : null,
      endHow: endsElsewhere ? 'the event it ends at does not happen in this timeline, so it goes on' : (link.endHow ?? (next ? passed(next.how ?? '', nameOf(next.fromId)) : '')),
      timeless: !link.validity || (!link.validity.from && !link.validity.until),
      inThisTimeline: !missing(link.validity?.from, model),
    };
  });
  // Stretches with no holder recorded: one holding ends and the next begins later, in the same order of time.
  const unknown: string[] = [];
  const counted = holdings.filter((h) => h.inThisTimeline);
  for (let i = 0; i < counted.length - 1; i++) {
    const [a, b] = [counted[i], counted[i + 1]];
    const end = pointOf(asHere(a.link.validity, model)?.until ?? null, model);
    const start = pointOf(b.link.validity?.from ?? null, model);
    if (!end || !start || end.axis !== start.axis) continue;
    const later = end.axis === 'story' ? (start as { lo: number }).lo > end.hi : (start as { at: number }).at > end.at;
    if (later) unknown.push(`Not known between ${a.ended}${a.endHow ? ` (${a.endHow})` : ''} and ${b.began}`);
  }
  const makers = model.links.filter((l) => connectionType(l.type).key === 'created-by' && l.fromId === itemId).map((l) => ({ name: nameOf(l.toId), when: l.validity?.from ? whenWords(l.validity.from, model) : 'no time given' }));
  // Where it stands: the holdings that hold at that point, in this timeline.
  const holding = counted.filter((h) => holdsAt(asHere(h.link.validity, model), at, model) !== false);
  // Held for certain, or perhaps: it changes hands during the point asked about, or a time cannot be compared with it.
  const surely = holding.filter((h) => holdsAt(asHere(h.link.validity, model), at, model) === true).map((h) => h.holderName);
  const perhaps = holding.filter((h) => holdsAt(asHere(h.link.validity, model), at, model) === 'unknown').map((h) => h.holderName);
  const heldWords = [surely.length ? `Held by ${surely.join(' and ')}` : '', perhaps.length ? `${surely.length ? '; perhaps also' : 'Perhaps held by'} ${perhaps.join(' and ')} (it changes hands at this point, or a time cannot be compared with it)` : ''].join('');
  const last = counted.at(-1);
  const now: Ownership['now'] = !counted.length
    ? { state: 'none', holders: [], words: 'No owner recorded.' }
    : holding.length
      ? { state: 'held', holders: holding.map((h) => h.holderName), words: `${heldWords}.` }
      : at === 'end' && last?.link.endHow
        ? { state: 'ended', holders: [], words: `${last.link.endHow.charAt(0).toUpperCase()}${last.link.endHow.slice(1)} (${last.ended}, by ${last.holderName}).` }
        : { state: 'unknown', holders: [], words: 'Who holds it then is not recorded.' };
  return { item, makers, holdings, unknown, now };
}
