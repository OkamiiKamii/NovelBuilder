// TWO ORDERS. A port of flutter_app/lib/shared/domain/timeline/narrative.dart.
//
// When something happens in the story (story time, from the timeline) and when the reader meets it (the order of
// chapters and scenes) are separate, and neither is ever worked out from the other. Comparing them shows how the book
// is told; nothing here reorders chapters or moves events, and nothing is wrong with a story told out of order.

import { localeCompare } from '../collation';
import type { StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import { type RevealRole, revealRoleLabel } from '../records/event';
import { kindLabel } from '../records/storyNode';
import { dartTrim } from '../text/dartString';
import { resolveChronology } from './chronology';

export class StoryTelling {
  readonly eventId: string;
  readonly nodeId: string;
  readonly role: RevealRole;
  /** Where the event is in story time, from 0; events at the same moment share a place. Null when it has no place. */
  readonly storyRank: number | null;
  /** Where the chapter or scene is in reading order. */
  readonly readingRank: number;
  /** It goes back in time from where the main line (what is told plainly) has got to at this point in the book. For a
   * plainly told event: it happens before something already told plainly. */
  back = false;
  /** It goes ahead of where the main line has got to (a flash-forward, a foreshadowing). Never true of the main
   * line. */
  ahead = false;

  constructor(args: {
    eventId: string;
    nodeId: string;
    role: RevealRole;
    storyRank: number | null;
    readingRank: number;
  }) {
    this.eventId = args.eventId;
    this.nodeId = args.nodeId;
    this.role = args.role;
    this.storyRank = args.storyRank;
    this.readingRank = args.readingRank;
  }
}

export class OrderedEvent {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly when: string,
    readonly storyRank: number | null,
    /** Where the reader meets it, in reading order. Empty when no chapter tells it yet. */
    readonly tellings: readonly StoryTelling[],
  ) {}
}

export class OrderedNode {
  constructor(
    readonly id: string,
    /** "Ch 3: The Gate", "Ch 3, scene: At the wall", or a volume's own title. */
    readonly label: string,
    readonly readingRank: number,
    /** What it tells, in story order. */
    readonly tellings: readonly StoryTelling[],
  ) {}
}

export class TwoOrders {
  constructor(
    /** Every event, in story order; those with no place in time last. */
    readonly events: readonly OrderedEvent[],
    /** The chapters and scenes that tell something, in reading order. */
    readonly nodes: readonly OrderedNode[],
    /** Every telling, in reading order. */
    readonly tellings: readonly StoryTelling[],
    /** How many events have a place in story time. */
    readonly placed: number,
    /** No telling goes back in time or ahead: told in story order. */
    readonly linear: boolean,
  ) {}
}

export function nodeLabel(model: StoryModel, nodeId: string): string {
  const node = model.nodes.get(nodeId);
  if (node === undefined) return 'A deleted chapter';
  const n = model.order.chapterNumber.get(nodeId);
  const kind = node.kind;
  const title =
    dartTrim(node.title).length > 0
      ? dartTrim(node.title)
      : `Untitled ${kind === null ? 'chapter' : kindLabel[kind].toLowerCase()}`;
  if (kind === 'chapter' && n !== undefined && n !== 0) return `Ch ${n}: ${title}`;
  if (kind === 'scene' && n !== undefined && n !== 0) return `Ch ${n}, scene: ${title}`;
  return title;
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

/** "1st", "2nd", "23rd": a place in an order, said as people say it. */
export function ordinal(n: number): string {
  const tens = mod(n, 100);
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (suffixes[mod(n, 10)] ?? 'th');
  return `${n}${suffix}`;
}

const orInf = (n: number | null) => n ?? 2 ** 52;

/** Both orders of a novel, side by side. Story order is the timeline's own; reading order is the manuscript's. A
 * chapter that no longer exists is left out. */
export function twoOrders(model: StoryModel): TwoOrders {
  const placed = resolveChronology(model.events.values(), model.calendar);
  // Events at the same moment share a place; an undated event placed after another gets its own.
  const rank = new Map<string, number | null>();
  let next = 0;
  let lastValue: number | null = null;
  let hasLast = false;
  for (const p of placed) {
    if (!p.anchored) {
      rank.set(p.event.id, null);
      continue;
    }
    const tie = hasLast && p.value !== null && lastValue === p.value;
    rank.set(p.event.id, tie ? next - 1 : next++);
    lastValue = p.value;
    hasLast = true;
  }
  const rankOf = (id: string) => rank.get(id) ?? null;

  const tellings: StoryTelling[] = [];
  for (const event of model.events.values()) {
    const roles = event.reveals;
    for (const nodeId of new Set(event.nodeIds)) {
      const readingRank = model.order.position.get(nodeId);
      if (readingRank === undefined) continue;
      tellings.push(
        new StoryTelling({
          eventId: event.id,
          nodeId,
          role: roles.get(nodeId) ?? 'told',
          storyRank: rankOf(event.id),
          readingRank,
        }),
      );
    }
  }
  const sorted = stableSorted(tellings, (a, b) => {
    const byReading = a.readingRank - b.readingRank;
    if (byReading !== 0) return byReading;
    const byStory = orInf(a.storyRank) - orInf(b.storyRank);
    return byStory !== 0 ? byStory : localeCompare(a.eventId, b.eventId);
  });

  // The main line is what is told plainly. Where it has got to at each chapter is the latest of it told so far (this
  // chapter included); before it starts, the first of it to come. Everything else is measured against that point.
  const groups = [...new Set(sorted.map((t) => t.readingRank))];
  const main = (r: number) =>
    sorted.filter((t) => t.readingRank === r && t.role === 'told' && t.storyRank !== null).map((t) => t.storyRank!);
  const before = new Map<number, number>();
  const reached = new Map<number, number | null>();
  let latest = -Infinity;
  for (const r of groups) {
    before.set(r, latest);
    for (const m of main(r)) latest = Math.max(latest, m);
    reached.set(r, Number.isFinite(latest) ? Math.trunc(latest) : null);
  }
  // Before the main line starts, nothing read so far can be later, so nothing goes back; going ahead is past its first.
  const upcoming = new Map<number, number | null>();
  let first: number | null = null;
  for (const r of [...groups].reverse()) {
    const here = main(r);
    if (here.length > 0) first = here.reduce((a, b) => Math.min(a, b));
    upcoming.set(r, first);
  }
  for (const t of sorted) {
    const story = t.storyRank;
    if (story === null) continue;
    if (t.role === 'told') {
      // The main line itself only ever goes back: a jump forward is just the story moving on.
      t.back = before.get(t.readingRank)! > story;
      continue;
    }
    const point = reached.get(t.readingRank) ?? null;
    if (point !== null) {
      t.back = story < point;
      t.ahead = story > point;
    } else {
      const upNext = upcoming.get(t.readingRank) ?? null;
      t.ahead = upNext !== null && story > upNext;
    }
  }

  const events = placed.map(
    (p) =>
      new OrderedEvent(
        p.event.id,
        p.event.name,
        p.label,
        rankOf(p.event.id),
        sorted.filter((t) => t.eventId === p.event.id),
      ),
  );
  const nodes = groups.map((r) => {
    const mine = stableSorted(
      sorted.filter((t) => t.readingRank === r),
      (a, b) => orInf(a.storyRank) - orInf(b.storyRank),
    );
    return new OrderedNode(mine[0].nodeId, nodeLabel(model, mine[0].nodeId), r, mine);
  });
  return new TwoOrders(
    events,
    nodes,
    sorted,
    placed.filter((p) => p.anchored).length,
    sorted.every((t) => !t.back && !t.ahead),
  );
}

/** Where a telling stands against the others, in a few words. */
export function orderWords(t: StoryTelling): string {
  if (t.storyRank === null) return 'not placed in time yet';
  if (t.back) return 'goes back in time';
  if (t.ahead) return 'goes ahead in time';
  return 'in story order';
}

/** How a chapter tells an event, from the event's side: "Flashback in Ch 4: The Well". */
export function tellingWords(t: StoryTelling, model: StoryModel): string {
  return `${revealRoleLabel[t.role]} ${nodeLabel(model, t.nodeId)}`;
}

/** Things worth a look, where how a telling is marked and where it falls do not seem to agree. Suggestions only: a
 * story can have every reason for either, and nothing is changed. */
export function tellingNotes(orders: TwoOrders, model: StoryModel): { telling: StoryTelling; note: string }[] {
  const notes: { telling: StoryTelling; note: string }[] = [];
  const name = (id: string) => model.events.get(id)?.name ?? 'An event';
  for (const t of orders.tellings) {
    const story = t.storyRank;
    if (story === null) continue;
    const where = nodeLabel(model, t.nodeId);
    if (t.role === 'flashback' && !t.back) {
      notes.push({
        telling: t,
        note: `“${name(t.eventId)}” is marked as a flashback in ${where}, but the story told plainly has not got past it yet there.`,
      });
    }
    if (t.role === 'flashforward' && !t.ahead) {
      notes.push({
        telling: t,
        note: `“${name(t.eventId)}” is marked as a flash-forward in ${where}, but it does not happen after what is told plainly around it.`,
      });
    }
    if (t.role === 'told' && t.back) {
      // The plainly told event already met that happens later: either this is a flashback, or that a flash-forward.
      const later = stableSorted(
        orders.tellings.filter(
          (o) => o.role === 'told' && o.readingRank < t.readingRank && (o.storyRank ?? -1) > story,
        ),
        (a, b) => a.readingRank - b.readingRank,
      )[0];
      notes.push({
        telling: t,
        note: `“${name(t.eventId)}” is told in ${where}, after “${name(later.eventId)}” (${nodeLabel(model, later.nodeId)}), which happens later. Is this a flashback, or that a flash-forward?`,
      });
    }
    if (t.role === 'foreshadowed') {
      const plain = orders.tellings.find(
        (o) => o.eventId === t.eventId && o.role === 'told' && o.readingRank < t.readingRank,
      );
      if (plain !== undefined) {
        notes.push({
          telling: t,
          note: `“${name(t.eventId)}” is foreshadowed in ${where}, after it is already told in ${nodeLabel(model, plain.nodeId)}.`,
        });
      }
    }
  }
  return notes;
}

/** The whole book's telling in one sentence. */
export function orderSummary(orders: TwoOrders): string {
  if (orders.tellings.length === 0) {
    return 'No event is linked to a chapter or scene yet, so there is no reading order to compare.';
  }
  if (orders.linear) return 'Told in story order: the reader meets the events in the order they happen.';
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const back = orders.tellings.filter((t) => t.back).length;
  const ahead = orders.tellings.filter((t) => t.ahead).length;
  const parts = [
    ...(back > 0 ? [`${count(back, 'telling goes', 'tellings go')} back in time`] : []),
    ...(ahead > 0 ? [`${count(ahead, 'goes', 'go')} ahead`] : []),
  ];
  return `Not told in story order: ${parts.join(', and ')}.`;
}
