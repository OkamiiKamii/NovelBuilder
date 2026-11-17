// Visualize › Story and reading order: when things happen beside when the reader meets them. The pure parts of
// flutter_app/lib/features/timeline/order_page.dart: which chapters and events are shown through the filters, what
// each row says aloud, the lines between them (styled by how each is told, never by colour alone), the lists, and the
// legend. Linking a chapter, or marking how it tells an event, never moves the event in time or reorders a chapter.
//
// Side by side: rows 48 high; the chapters ("As the reader meets it") on the left, the events ("As it happens") on the
// right, a gutter between them 72 wide on a phone (120 otherwise) where each telling is a curve from its chapter's
// row to its event's (a cubic with both handles at the gutter's middle). A line is 1 wide when only mentioned, 3 when
// it touches the selection, 2.2 when it goes back or ahead, else 1.6; muted (outlineVariant) when something else is
// selected. A chosen row is tinted secondaryContainer, rows tied to it surfaceContainerHighest.

import type { StoryModel } from '../../model/storyModel';
import type { RevealRole } from '../../records/event';
import {
  type OrderedEvent,
  type OrderedNode,
  type StoryTelling,
  type TwoOrders,
  nodeLabel,
  ordinal,
  orderWords,
  tellingWords,
} from '../../timeline/narrative';
import { revealChoices } from '../../timeline/screens/timelinePage';

export const orderRow = 48;
export const orderGutter = (compact: boolean): number => (compact ? 72 : 120);

/** Each way of telling has a line of its own (on, off, on, off…), named in the legend. */
export const tellingDashes: Readonly<Record<RevealRole, readonly number[]>> = {
  told: [],
  flashback: [6, 4],
  flashforward: [10, 4],
  foreshadowed: [1.5, 4],
  mentioned: [],
  revealed: [7, 3, 1.5, 3],
};

export const orderLegend: readonly { role: RevealRole; words: string }[] = [
  { role: 'told', words: 'Told here (solid)' },
  { role: 'flashback', words: 'As a flashback (dashed)' },
  { role: 'flashforward', words: 'As a flash-forward (long dashes)' },
  { role: 'foreshadowed', words: 'Foreshadowed (dotted)' },
  { role: 'mentioned', words: 'Only mentioned (thin)' },
  { role: 'revealed', words: 'Revealed afterwards (dash-dot)' },
];

/** What is shown through the filters: the events kept, the tellings of them, and the chapters that tell one. Back and
 * ahead are always worked out against the whole book; filtering only narrows what is shown. */
export function orderShown(
  orders: TwoOrders,
  keep: ReadonlySet<string> | null,
): { events: OrderedEvent[]; tellings: StoryTelling[]; nodes: OrderedNode[] } {
  const events = orders.events.filter((e) => keep === null || keep.has(`event:${e.id}`));
  const shown = new Set(events.map((e) => e.id));
  return {
    events,
    tellings: orders.tellings.filter((t) => shown.has(t.eventId)),
    nodes: orders.nodes.filter((n) => n.tellings.some((t) => shown.has(t.eventId))),
  };
}

export const eventNameOf = (model: StoryModel) => (id: string): string => model.events.get(id)?.name ?? 'An event';

export const rankWords = (r: number | null): string => (r === null ? 'not placed in time' : `${ordinal(r + 1)} in story order`);

/** A chapter's row, as a screen reader hears it. */
export function nodeSaid(n: OrderedNode, eventName: (id: string) => string): string {
  return `${n.label} tells ${n.tellings
    .map((t) => `${eventName(t.eventId)} (${revealChoices[t.role].toLowerCase()}, ${orderWords(t)})`)
    .join('; ')}`;
}

/** An event's row, as a screen reader hears it. */
export function eventSaid(e: OrderedEvent): string {
  const n = e.tellings.length;
  return (
    `${e.title}, ${e.storyRank === null ? 'not placed in time' : e.when}: ` +
    `${n === 0 ? 'not told in any chapter yet' : `told in ${n} ${n === 1 ? 'place' : 'places'}`}`
  );
}

export type OrderLine = { a: number; b: number; role: RevealRole; out: boolean; on: boolean | null };

/** The lines between the two columns: one per telling whose chapter and event are both shown. */
export function orderLines(
  nodes: readonly OrderedNode[],
  events: readonly OrderedEvent[],
  tellings: readonly StoryTelling[],
  selected: string | null,
): OrderLine[] {
  const nodeRow = new Map(nodes.map((n, i) => [n.id, i]));
  const eventRow = new Map(events.map((e, i) => [e.id, i]));
  const out: OrderLine[] = [];
  for (const t of tellings) {
    const a = nodeRow.get(t.nodeId);
    const b = eventRow.get(t.eventId);
    if (a === undefined || b === undefined) continue;
    out.push({ a, b, role: t.role, out: t.back || t.ahead, on: selected === null ? null : touches(t, selected) });
  }
  return out;
}

export const touches = (t: StoryTelling, selected: string | null): boolean => t.nodeId === selected || t.eventId === selected;

/** The rows tied to the selection (tinted). */
export function relatedTo(tellings: readonly StoryTelling[], selected: string | null): Set<string> {
  const out = new Set<string>();
  for (const t of tellings) {
    if (touches(t, selected)) {
      out.add(t.nodeId);
      out.add(t.eventId);
    }
  }
  return out;
}

/** A line as drawn in a gutter `width` wide: its path, width, and dashes (empty: solid). */
export function lineDrawing(l: OrderLine, width: number): { d: string; width: number; dashes: readonly number[]; muted: boolean } {
  const y = (i: number) => i * orderRow + orderRow / 2;
  const ya = y(l.a);
  const yb = y(l.b);
  return {
    d: `M0 ${ya} C${width / 2} ${ya} ${width / 2} ${yb} ${width} ${yb}`,
    width: l.role === 'mentioned' ? 1 : l.on === true ? 3 : l.out ? 2.2 : 1.6,
    dashes: tellingDashes[l.role],
    muted: l.on === false,
  };
}

/** The lists form: "As the reader meets it" (one line a telling) and "As it happens" (one line an event). */
export function orderLists(
  model: StoryModel,
  events: readonly OrderedEvent[],
  tellings: readonly StoryTelling[],
): {
  reading: { eventId: string; title: string; subtitle: string }[];
  story: { eventId: string; title: string; subtitle: string }[];
} {
  const name = eventNameOf(model);
  const whenOf = new Map(events.map((e) => [e.id, e.when]));
  return {
    reading: tellings.map((t) => ({
      eventId: t.eventId,
      title: `${nodeLabel(model, t.nodeId)}: ${name(t.eventId)}`,
      subtitle: `${revealChoices[t.role]} · ${t.storyRank === null ? 'not placed in time' : whenOf.get(t.eventId)} · ${rankWords(t.storyRank)} · ${orderWords(t)}`,
    })),
    story: events.map((e) => ({
      eventId: e.id,
      title: e.title === '' ? 'Untitled event' : e.title,
      subtitle:
        `${e.storyRank === null ? 'Not placed in time' : e.when} · ` +
        `${e.tellings.length === 0 ? 'Not told in any chapter yet' : e.tellings.map((t) => tellingWords(t, model)).join('; ')}`,
    })),
  };
}

export const orderWords_ = {
  title: 'Story and reading order',
  sideBySide: 'Side by side',
  list: 'List',
  reading: 'As the reader meets it',
  story: 'As it happens',
  worth: 'Worth a look',
  showFewer: 'Show fewer',
  showAll: (n: number) => `Show all ${n}`,
  emptyTitle: 'No events yet',
  emptyMessage: 'Add events on the timeline and link them to the chapters that tell them.',
  noTellings: 'No event is linked to a chapter or scene yet.',
  open: (name: string) => `Open “${name}”`,
} as const;
