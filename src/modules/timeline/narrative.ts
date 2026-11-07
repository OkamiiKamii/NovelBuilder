import type { StoryModel } from '@/modules/model/types';
import { KIND_LABELS } from '@/modules/manuscript/types';
import { resolveChronology } from './chronology';
import { REVEAL_LABELS, type RevealRole } from './types';

/**
 * TWO ORDERS
 * When something happens in the story (story time, from the timeline) and
 * when the reader meets it (the order of chapters and scenes) are separate,
 * and neither is ever worked out from the other. An event is told in any
 * number of chapters and scenes, each with how: told plainly, as a
 * flashback, foreshadowed, mentioned, or revealed afterwards.
 *
 * Comparing the two shows how the book is told: a prologue that jumps ahead,
 * flashbacks that go back, a secret revealed long after it happened. All of
 * it is read from the records as they are; nothing here reorders chapters or
 * moves events, and nothing is wrong with a story told out of order.
 */
export interface Telling {
  eventId: string;
  nodeId: string;
  role: RevealRole;
  /** Where the event is in story time, from 0; events at the same moment share a place. Null when it has no place in time yet. */
  storyRank: number | null;
  /** Where the chapter or scene is in reading order. */
  readingRank: number;
  /**
   * It goes back in time from where the main line (what is told plainly) has
   * got to at this point in the book. For a plainly told event: it happens
   * before something already told plainly.
   */
  back: boolean;
  /** It goes ahead of where the main line has got to (a flash-forward, a foreshadowing). Never true of the main line itself. */
  ahead: boolean;
}

export interface OrderedEvent {
  id: string;
  title: string;
  when: string;
  storyRank: number | null;
  /** Where the reader meets it, in reading order. Empty when no chapter tells it yet. */
  tellings: Telling[];
}

export interface OrderedNode {
  id: string;
  /** "Ch 3: The Gate", "Ch 3, scene: At the wall", or a volume's own title. */
  label: string;
  readingRank: number;
  /** What it tells, in story order. */
  tellings: Telling[];
}

export interface TwoOrders {
  /** Every event, in story order; those with no place in time last. */
  events: OrderedEvent[];
  /** The chapters and scenes that tell something, in reading order. */
  nodes: OrderedNode[];
  /** Every telling, in reading order. */
  tellings: Telling[];
  /** How many events have a place in story time. */
  placed: number;
  /** No telling goes back in time or ahead: told in story order. */
  linear: boolean;
}

export const nodeLabel = (model: StoryModel, nodeId: string): string => {
  const node = model.nodes.get(nodeId);
  if (!node) return 'A deleted chapter';
  const n = model.order.chapterNumber.get(nodeId);
  const title = node.title.trim() || `Untitled ${KIND_LABELS[node.kind]?.toLowerCase() ?? 'chapter'}`;
  if (node.kind === 'chapter' && n) return `Ch ${n}: ${title}`;
  if (node.kind === 'scene' && n) return `Ch ${n}, scene: ${title}`;
  return title;
};

/** "1st", "2nd", "23rd": a place in an order, said as people say it. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * Both orders of a novel, side by side. Story order is the timeline's own
 * (`resolveChronology`, in the novel's calendar, with "comes after" for
 * events at the same moment and for undated ones). Reading order is the
 * manuscript's. A chapter that no longer exists is left out.
 */
export function twoOrders(model: StoryModel): TwoOrders {
  const placed = resolveChronology([...model.events.values()], model.calendar);
  // Events at the same moment share a place; an undated event placed after another gets its own.
  const rank = new Map<string, number | null>();
  let next = 0;
  let last: { value: number | null } | null = null;
  for (const p of placed) {
    if (!p.anchored) {
      rank.set(p.event.id, null);
      continue;
    }
    const tie = last !== null && p.value !== null && last.value === p.value;
    rank.set(p.event.id, tie ? next - 1 : next++);
    last = { value: p.value };
  }

  const tellings: Telling[] = [];
  for (const event of model.events.values()) {
    const roles = new Map((event.reveals ?? []).map((r) => [r.nodeId, r.role]));
    for (const nodeId of new Set(event.nodeIds)) {
      const readingRank = model.order.position.get(nodeId);
      if (readingRank === undefined) continue;
      tellings.push({ eventId: event.id, nodeId, role: roles.get(nodeId) ?? 'told', storyRank: rank.get(event.id) ?? null, readingRank, back: false, ahead: false });
    }
  }
  tellings.sort((a, b) => a.readingRank - b.readingRank || (a.storyRank ?? Infinity) - (b.storyRank ?? Infinity) || a.eventId.localeCompare(b.eventId));

  // The main line is what is told plainly. Where it has got to at each chapter is the latest of it told so far (this chapter
  // included); before it starts, the first of it to come. Everything else is measured against that point.
  const groups = [...new Set(tellings.map((t) => t.readingRank))];
  const main = (r: number) => tellings.filter((t) => t.readingRank === r && t.role === 'told' && t.storyRank !== null).map((t) => t.storyRank!);
  const before = new Map<number, number>();
  const reached = new Map<number, number | null>();
  let latest = -Infinity;
  for (const r of groups) {
    before.set(r, latest);
    latest = Math.max(latest, ...main(r));
    reached.set(r, Number.isFinite(latest) ? latest : null);
  }
  // Before the main line starts, nothing read so far can be later, so nothing goes back; going ahead is past its first event.
  const upcoming = new Map<number, number | null>();
  let first: number | null = null;
  for (const r of [...groups].reverse()) {
    const here = main(r);
    if (here.length) first = Math.min(...here);
    upcoming.set(r, first);
  }
  for (const t of tellings) {
    if (t.storyRank === null) continue;
    if (t.role === 'told') {
      // The main line itself only ever goes back: a jump forward is just the story moving on.
      t.back = before.get(t.readingRank)! > t.storyRank;
      continue;
    }
    const point = reached.get(t.readingRank) ?? null;
    if (point !== null) {
      t.back = t.storyRank < point;
      t.ahead = t.storyRank > point;
    } else {
      const next = upcoming.get(t.readingRank) ?? null;
      t.ahead = next !== null && t.storyRank > next;
    }
  }

  const events: OrderedEvent[] = placed.map((p) => ({ id: p.event.id, title: p.event.name, when: p.label, storyRank: rank.get(p.event.id) ?? null, tellings: tellings.filter((t) => t.eventId === p.event.id) }));
  const nodes: OrderedNode[] = groups.map((r) => {
    const mine = tellings.filter((t) => t.readingRank === r).sort((a, b) => (a.storyRank ?? Infinity) - (b.storyRank ?? Infinity));
    return { id: mine[0].nodeId, label: nodeLabel(model, mine[0].nodeId), readingRank: r, tellings: mine };
  });
  return { events, nodes, tellings, placed: placed.filter((p) => p.anchored).length, linear: tellings.every((t) => !t.back && !t.ahead) };
}

/** Where a telling stands against the others, in a few words. */
export function orderWords(t: Telling): string {
  if (t.storyRank === null) return 'not placed in time yet';
  if (t.back) return 'goes back in time';
  if (t.ahead) return 'goes ahead in time';
  return 'in story order';
}

/** How a chapter tells an event, from the event's side: "Flashback in Ch 4: The Well". */
export const tellingWords = (t: Telling, model: StoryModel): string => `${REVEAL_LABELS[t.role]} ${nodeLabel(model, t.nodeId)}`;

/**
 * Things worth a look, where how a telling is marked and where it falls do
 * not seem to agree. Suggestions only: a story can have every reason for
 * either, and nothing is changed.
 */
export function tellingNotes(orders: TwoOrders, model: StoryModel): { telling: Telling; note: string }[] {
  const notes: { telling: Telling; note: string }[] = [];
  const name = (id: string) => model.events.get(id)?.name ?? 'An event';
  for (const t of orders.tellings) {
    if (t.storyRank === null) continue;
    const where = nodeLabel(model, t.nodeId);
    if (t.role === 'flashback' && !t.back) notes.push({ telling: t, note: `“${name(t.eventId)}” is marked as a flashback in ${where}, but the story told plainly has not got past it yet there.` });
    if (t.role === 'flashforward' && !t.ahead) notes.push({ telling: t, note: `“${name(t.eventId)}” is marked as a flash-forward in ${where}, but it does not happen after what is told plainly around it.` });
    if (t.role === 'told' && t.back) {
      // The plainly told event already met that happens later: either this is a flashback, or that one was a flash-forward.
      const later = orders.tellings.filter((o) => o.role === 'told' && o.readingRank < t.readingRank && (o.storyRank ?? -1) > t.storyRank!).sort((a, b) => a.readingRank - b.readingRank)[0];
      notes.push({ telling: t, note: `“${name(t.eventId)}” is told in ${where}, after “${name(later.eventId)}” (${nodeLabel(model, later.nodeId)}), which happens later. Is this a flashback, or that a flash-forward?` });
    }
    if (t.role === 'foreshadowed') {
      const plain = orders.tellings.find((o) => o.eventId === t.eventId && o.role === 'told' && o.readingRank < t.readingRank);
      if (plain) notes.push({ telling: t, note: `“${name(t.eventId)}” is foreshadowed in ${where}, after it is already told in ${nodeLabel(model, plain.nodeId)}.` });
    }
  }
  return notes;
}

/** The whole book's telling in one sentence. */
export function orderSummary(orders: TwoOrders): string {
  if (!orders.tellings.length) return 'No event is linked to a chapter or scene yet, so there is no reading order to compare.';
  if (orders.linear) return 'Told in story order: the reader meets the events in the order they happen.';
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const back = orders.tellings.filter((t) => t.back).length;
  const ahead = orders.tellings.filter((t) => t.ahead).length;
  const parts = [back ? `${count(back, 'telling goes', 'tellings go')} back in time` : '', ahead ? `${count(ahead, 'goes', 'go')} ahead` : ''].filter(Boolean);
  return `Not told in story order: ${parts.join(', and ')}.`;
}
