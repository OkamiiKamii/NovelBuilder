// WHO HELD IT, AND HOW IT PASSED (as in the original app): an item's ownership, from the "Owns" connections the author
// records: each holding with when it began and how, when it ended and how. Who made it comes from its "Created by".
// Nothing is assumed: a holding with no time is said to have none; a stretch with no holding recorded is said to be
// unknown; a holding tied to an event that does not happen in this timeline is said not to happen here, and is not
// counted. A port of flutter_app/lib/shared/domain/factions/ownership.dart.

import { localeCompare } from '../collation';
import { numOrNull } from '../json';
import { compareNum } from '../manuscript/dartSort';
import type { StoryModel } from '../model/storyModel';
import { type Anchor, EventAnchor, type Truth, Validity, historyOf } from '../model/validity';
import { whenWords } from '../progression/track';
import { stableSorted } from '../reader/stableSort';
import type { Entry } from '../records/entry';
import { type Link, connectionType } from '../records/link';
import { type TravelPoint, pointOf } from '../travel/routes';
import { holdsAt } from './ties';

/** How a holding begins, and how one ends with nothing after it: offered as words, never required. */
export const howGained = ['made', 'found', 'given', 'sold', 'stolen', 'inherited', 'won', 'claimed'];
export const howEnded = ['lost', 'destroyed', 'abandoned', 'hidden'];

export class Holding {
  constructor(
    readonly link: Link,
    readonly holderId: string,
    readonly holderName: string,
    /** How it began, in the author's words. */
    readonly how: string,
    readonly began: string,
    /** When it ended, in words; null while it still holds. */
    readonly ended: string | null,
    /** How it ended: the author's words, or how the next holding began when it begins right there. */
    readonly endHow: string,
    /** No time given at all. */
    readonly timeless: boolean,
    /** False when it hangs on an event this timeline does not have. */
    readonly inThisTimeline: boolean,
  ) {}
}

export type OwnershipNow = { state: 'held' | 'ended' | 'unknown' | 'none'; holders: string[]; words: string };

export class Ownership {
  constructor(
    readonly item: Entry,
    /** "Created by" the item, with when. */
    readonly makers: { name: string; when: string }[],
    readonly holdings: Holding[],
    /** Stretches between holdings with no holder recorded, in words. */
    readonly unknown: string[],
    /** Where it stands at the point asked about. */
    readonly now: OwnershipNow,
  ) {}
}

/** Items: every codex entry of the Item or Artifact category, and anything the author records as owned. */
export function ownedItems(model: StoryModel): Entry[] {
  const ids = new Set<string>();
  for (const e of model.entries.values()) if (e.category === 'item' || e.category === 'artifact') ids.add(e.id);
  for (const l of model.links) {
    if (connectionType(l.type).key === 'owns' && l.toType === 'entry' && model.entries.has(l.toId)) ids.add(l.toId);
  }
  return stableSorted([...ids].map((id) => model.entries.get(id)!), (a, b) => localeCompare(a.name, b.name));
}

const missing = (a: Anchor | null | undefined, model: StoryModel): boolean => a instanceof EventAnchor && !model.events.has(a.eventId);

/** A holding as this timeline has it: one that ends at an event this timeline lacks does not end there. */
const asHere = (validity: Validity | null, model: StoryModel): Validity | null =>
  validity !== null && missing(validity.until, model) ? new Validity(validity.from, null) : validity;

/** How it passed to the next holder: "stolen by Mira", "given to the King". */
const passed = (how: string, to: string): string =>
  how.length > 0 ? `${how} ${['given', 'sold', 'bequeathed', 'lent'].includes(how.toLowerCase()) ? 'to' : 'by'} ${to}` : `passed to ${to}`;

const createdAt = (l: Link): number => numOrNull(l.raw['createdAt']) ?? 0;

/** Who has held `itemId`, at a point (`at` null for the end of the story). */
export function ownershipOf(model: StoryModel, itemId: string, at: Anchor | null = null): Ownership | null {
  const item = model.entries.get(itemId);
  if (item === undefined) return null;
  const owns = stableSorted(
    model.links.filter((l) => connectionType(l.type).key === 'owns' && l.toId === itemId && l.toType === 'entry' && l.fromType === 'entry'),
    (a, b) => {
      const c = compareNum(createdAt(a), createdAt(b));
      return c !== 0 ? c : localeCompare(a.id, b.id);
    },
  );
  const ordered = historyOf(owns, (l) => l.validity ?? Validity.always, model.timeContext);
  const nameOf = (id: string) => model.entries.get(id)?.name ?? 'someone deleted';
  const holdings: Holding[] = [];
  ordered.forEach((link, i) => {
    const until = asHere(link.validity, model)?.until ?? null;
    // The next holding beginning right where this one ends says how it passed on.
    const next =
      until === null ? null : (ordered.slice(i + 1).find((n) => (n.validity?.from ?? null) !== null && n.validity!.from!.equals(until)) ?? null);
    const endsElsewhere = missing(link.validity?.until, model);
    const from = link.validity?.from ?? null;
    holdings.push(
      new Holding(
        link,
        link.fromId,
        nameOf(link.fromId),
        link.how ?? '',
        missing(from, model)
          ? 'at an event this timeline does not have'
          : from !== null
            ? whenWords(from, model)
            : link.validity !== null
              ? 'from the start'
              : 'no time given',
        until !== null ? whenWords(until, model) : null,
        endsElsewhere
          ? 'the event it ends at does not happen in this timeline, so it goes on'
          : (link.endHow ?? (next !== null ? passed(next.how ?? '', nameOf(next.fromId)) : '')),
        link.validity === null || (link.validity.from === null && link.validity.until === null),
        !missing(from, model),
      ),
    );
  });
  // Stretches with no holder recorded: one holding ends and the next begins later, in the same order of time.
  const unknown: string[] = [];
  const counted = holdings.filter((h) => h.inThisTimeline);
  for (let i = 0; i < counted.length - 1; i++) {
    const a = counted[i];
    const b = counted[i + 1];
    const end: TravelPoint | null = pointOf(asHere(a.link.validity, model)?.until ?? null, model);
    const start: TravelPoint | null = pointOf(b.link.validity?.from ?? null, model);
    if (end === null || start === null || end.isStory !== start.isStory) continue;
    const later = end.isStory ? start.lo! > end.hi! : start.at! > end.at!;
    if (later) unknown.push(`Not known between ${a.ended}${a.endHow.length > 0 ? ` (${a.endHow})` : ''} and ${b.began}`);
  }
  const makers = model.links
    .filter((l) => connectionType(l.type).key === 'created-by' && l.fromId === itemId)
    .map((l) => ({ name: nameOf(l.toId), when: (l.validity?.from ?? null) !== null ? whenWords(l.validity!.from, model) : 'no time given' }));
  // Where it stands: the holdings that hold at that point, in this timeline.
  const holds = (h: Holding): Truth => holdsAt(asHere(h.link.validity, model), at, model);
  const holding = counted.filter((h) => holds(h) !== 'no');
  const surely = holding.filter((h) => holds(h) === 'yes').map((h) => h.holderName);
  const perhaps = holding.filter((h) => holds(h) === 'unknown').map((h) => h.holderName);
  const heldWords = [
    surely.length > 0 ? `Held by ${surely.join(' and ')}` : '',
    perhaps.length > 0
      ? `${surely.length > 0 ? '; perhaps also' : 'Perhaps held by'} ${perhaps.join(' and ')} (it changes hands at this ` +
        'point, or a time cannot be compared with it)'
      : '',
  ].join('');
  const last = counted.length === 0 ? null : counted[counted.length - 1];
  const lastEnd = last?.link.endHow ?? null;
  const now: OwnershipNow =
    counted.length === 0
      ? { state: 'none', holders: [], words: 'No owner recorded.' }
      : holding.length > 0
        ? { state: 'held', holders: holding.map((h) => h.holderName), words: `${heldWords}.` }
        : at === null && lastEnd !== null
          ? { state: 'ended', holders: [], words: `${lastEnd[0].toUpperCase()}${lastEnd.substring(1)} (${last!.ended}, by ${last!.holderName}).` }
          : { state: 'unknown', holders: [], words: 'Who holds it then is not recorded.' };
  return new Ownership(item, makers, holdings, unknown, now);
}
