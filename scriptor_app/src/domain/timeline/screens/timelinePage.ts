// Plan → Timeline: every event in the order it happens in the story, which is never the order of the chapters. Filters
// narrow the list; a character's life path shows their age at each event, as exactly as the dates allow. The pure
// parts of flutter_app/lib/features/timeline/timeline_page.dart and widgets/chapter_seed.dart.
//
// The page, top to bottom: the Plan switch; "Dates use <calendar>." with Change the calendar (/plan/calendar), Review
// ("Review: N to look at", /review/timeline: comes with Review) and Draw it (/visualize/timeline: comes with
// Visualize); the search; the filters (on a phone behind a Filters button: "Filters", "Filters (some on)", "Hide
// filters"): Life path of, Importance, Location, Date precision (each 220/200 wide, full width on a phone); the life
// box when a character is chosen; then the chapter seed (an empty timeline in a novel with chapters), the empty state
// (no chapters either), "No results", or the chronicle (chronicle.ts) of event cards; and "Showing N of M events."
// when filtered. New event (the page's action) makes an event and opens it, given to the chosen character when one is.

import { plural } from '../../desk/format';
import type { JsonMap } from '../../json';
import type { RevealRole } from '../../records/event';
import { UnknownDate } from '../../records/event';
import type { StoryNode } from '../../records/storyNode';
import { foldText } from '../../text/fold';
import { dartTrim } from '../../text/dartString';
import { type LifeStep, birthDateOf, lifePath, lifeSummary } from '../ages';
import type { Placed } from '../chronology';
import { describeCalendar, formatDate, formatDuration, precisionLabels, precisions } from '../dates';
import type { EventChanges } from '../eventChanges';
import { nodeLabel } from '../narrative';
import type { TimelineData } from './timelineData';

const rank: Readonly<Record<string, number>> = { minor: 0, major: 1, climax: 2 };

export const importanceLabels: Readonly<Record<string, string>> = { minor: 'Minor', major: 'Major', climax: 'Climax' };
export const eventStatusLabels: Readonly<Record<string, string>> = { idea: 'Idea', planned: 'Planned', confirmed: 'Confirmed' };

/** How a chapter tells an event, as a choice. */
export const revealChoices: Readonly<Record<RevealRole, string>> = {
  told: 'Told here',
  flashback: 'As a flashback',
  flashforward: 'As a flash-forward',
  foreshadowed: 'Foreshadowed',
  mentioned: 'Only mentioned',
  revealed: 'Revealed afterwards',
};

/** The page's filters. `minimum`: 'minor' (all), 'major' (major and climax) or 'climax'. */
export type TimelineFilters = {
  query: string;
  character: string | null;
  minimum: string;
  location: string | null;
  precision: string | null;
};

export const noFilters: TimelineFilters = { query: '', character: null, minimum: 'minor', location: null, precision: null };

export const filtered = (f: TimelineFilters): boolean =>
  dartTrim(f.query).length > 0 || f.character !== null || f.minimum !== 'minor' || f.location !== null || f.precision !== null;

/** The filter button on a phone. */
export const filtersButton = (shown: boolean, f: TimelineFilters): string =>
  shown ? 'Hide filters' : filtered(f) ? 'Filters (some on)' : 'Filters';

/** The choices of the four filters. */
export function filterChoices(data: TimelineData): {
  life: { label: string; choices: { value: string; label: string }[] };
  importance: { label: string; choices: { value: string; label: string }[] };
  location: { label: string; choices: { value: string; label: string }[] };
  precision: { label: string; choices: { value: string; label: string }[] };
} {
  return {
    life: {
      label: 'Life path of',
      choices: [{ value: '', label: 'Everyone' }, ...data.cast.characters().map((c) => ({ value: c.id, label: `${c.name}’s life` }))],
    },
    importance: {
      label: 'Importance',
      choices: [
        { value: 'minor', label: 'All importance' },
        { value: 'major', label: 'Major and climax' },
        { value: 'climax', label: 'Climax only' },
      ],
    },
    location: {
      label: 'Location',
      choices: [{ value: '', label: 'Anywhere' }, ...data.places.map((l) => ({ value: l.id, label: l.name }))],
    },
    precision: {
      label: 'Date precision',
      choices: [{ value: '', label: 'Any date' }, ...precisions.map((p) => ({ value: p, label: `${precisionLabels[p]} dates` }))],
    },
  };
}

/** Events of one year (or of no known time), under its heading. */
export type ChronicleGroup = { key: string; heading: string; items: Placed[] };

export type TimelineView = {
  title: string;
  subtitle: string;
  calendarLine: string;
  /** The Review button: "Review: N to look at", or "Review". */
  review: string;
  search: string;
  /** The character whose life is shown (null: everyone), and their life. */
  character: string | null;
  life: LifeStep[];
  lifeBox: { title: string; whole: string; empty: string | null; summary: string | null; notes: string[] } | null;
  visible: Placed[];
  groups: ChronicleGroup[];
  /** What the page shows in place of the chronicle: the chapter seed, the empty state, or "No results". */
  instead: 'seed' | 'empty' | 'none' | null;
  empty: { title: string; message: string; action: string };
  showing: string | null;
};

/** The timeline page for the novel and the filters chosen. */
export function timelineView(data: TimelineData, f: TimelineFilters): TimelineView {
  const model = data.model;
  const cal = data.calendar;
  const characters = data.cast.characters();
  const character = characters.some((c) => c.id === f.character) ? f.character : null;
  const placed = data.placed;
  const life =
    character === null
      ? []
      : lifePath(placed, character, { calendar: cal, birthDate: birthDateOf(model.entries.get(character)) });
  const needle = foldText(dartTrim(f.query));
  const visible = placed.filter(
    (p) =>
      (character === null || p.event.characters.some((c) => c.id === character)) &&
      (rank[p.event.importanceKey] ?? 0) >= rank[f.minimum] &&
      (f.location === null || p.event.locationId === f.location) &&
      (f.precision === null || (p.event.when?.precision ?? 'unknown') === f.precision) &&
      (needle.length === 0 || foldText(p.event.name).includes(needle) || foldText(p.event.description).includes(needle)),
  );
  // Grouped by year; an undated event that follows another sits with it, under the same year.
  const groups: ChronicleGroup[] = [];
  for (const item of visible) {
    const last = groups.length === 0 ? null : groups[groups.length - 1];
    const key = item.year !== null ? `${item.year}` : item.anchored && last !== null ? last.key : 'undated';
    if (last?.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, heading: key === 'undated' ? 'Not yet placed in time' : cal.yearName(Number(key)), items: [item] });
    }
  }
  const toCheck = placed.filter((p) => p.issues.length > 0).length + life.filter((s) => s.issue !== null).length;
  const open = data.review.open.length;
  const characterName = character === null ? '' : (model.entries.get(character)?.name ?? '');
  const instead =
    placed.length === 0 && model.order.chapters.length > 0
      ? 'seed'
      : placed.length === 0
        ? 'empty'
        : visible.length === 0
          ? 'none'
          : null;
  return {
    title: 'Timeline',
    subtitle: `${data.cast.novelTitle} · ${plural(placed.length, 'event')} in the order they happen${toCheck > 0 ? ` · ${toCheck} to check` : ''}`,
    calendarLine: `Dates use ${cal.standard ? 'the standard calendar' : describeCalendar(cal)}.`,
    review: open > 0 ? `Review: ${open} to look at` : 'Review',
    search: 'Search events',
    character,
    life,
    lifeBox:
      character === null
        ? null
        : {
            title: `${characterName}’s life`,
            whole: `${characterName}’s whole life history`,
            empty: life.length === 0 ? `No events involve ${characterName} yet. Add them to an event, or create one now.` : null,
            summary: life.length === 0 ? null : lifeSummary(life),
            notes:
              life.length === 0
                ? []
                : [
                    ...(!life.some((s) => s.label.length > 0)
                      ? [
                          `To see ages, give ${characterName} a date of birth on their profile, or an age at any dated event (0 for their birth); the rest are worked out from the dates, as exactly as they allow.`,
                        ]
                      : []),
                    ...(life.some((s) => s.ageAt.kind === 'range')
                      ? [
                          'An age like 25–26 means the dates are not exact enough to say which: born some time in a year, someone may not have had their birthday yet.',
                        ]
                      : []),
                  ],
          },
    visible,
    groups,
    instead,
    empty: {
      title: 'What happened, and when',
      message:
        'The timeline is the story’s own chronology, separate from the order chapters are told in. Record events with an exact date, a rough one, or just “about twenty years before the Siege”.',
      action: 'New event',
    },
    showing: filtered(f) && placed.length > 0 ? `Showing ${visible.length} of ${placed.length} events.` : null,
  };
}

/** One event's card in the chronicle: the age (bold) and when, the name and its importance (Major in the accent,
 * Climax in the error colour), what it involves, and how many things to check. */
export type EventCard = {
  age: string | null;
  when: string;
  name: string;
  importance: { label: string; climax: boolean } | null;
  details: string;
  problems: string | null;
};

export function eventCard(data: TimelineData, p: Placed, step: LifeStep | null): EventCard {
  const event = p.event;
  const model = data.model;
  const cast = event.characters.flatMap((c) => {
    const name = model.entries.get(c.id)?.name;
    return name === undefined ? [] : [name];
  });
  const told = event.nodeIds
    .filter((id) => model.nodes.has(id))
    .map((id) => {
      const role = event.reveals.get(id);
      return role === undefined || role === 'told'
        ? nodeLabel(model, id)
        : `${nodeLabel(model, id)} (${revealChoices[role].toLowerCase()})`;
    });
  const place = event.locationId === null ? undefined : model.entries.get(event.locationId)?.name;
  const hasEnd = event.raw['end'] !== null && event.raw['end'] !== undefined;
  const when = [
    p.label,
    ...(event.duration !== null ? [`lasts ${formatDuration(event.duration)}`] : []),
    ...(event.ongoing ? ['still going on'] : []),
    ...(hasEnd
      ? [event.end instanceof UnknownDate ? 'end not known' : `until ${formatDate(event.end, (id) => data.eventName(id), data.calendar)}`]
      : []),
  ].join(' · ');
  const details = [
    ...(place !== undefined ? [place] : []),
    ...(cast.length > 0 ? [cast.join(', ')] : []),
    ...(told.length > 0 ? [`Told in ${told.join(', ')}`] : []),
  ].join(' · ');
  const importance = event.importanceKey;
  const problems = p.issues.length + (step?.issue == null ? 0 : 1) + data.findingsOf(event.id).length;
  return {
    age: step !== null && step.label.length > 0 ? `${step.label} · ` : null,
    when,
    name: event.name.length === 0 ? 'Untitled event' : event.name,
    importance: importance === 'minor' ? null : { label: importanceLabels[importance] ?? importance, climax: importance === 'climax' },
    details,
    problems: problems > 0 ? `${problems} ${problems === 1 ? 'thing' : 'things'} to check` : null,
  };
}

/** The first `count` events of `groups`, in their years: the years they reach, the last one cut where they stop (the
 * chronicle is built a screenful at a time). */
export function firstOf(groups: readonly ChronicleGroup[], count: number): ChronicleGroup[] {
  const out: ChronicleGroup[] = [];
  let left = count;
  for (const g of groups) {
    if (left <= 0) break;
    out.push(g.items.length <= left ? g : { key: g.key, heading: g.heading, items: g.items.slice(0, left) });
    left -= g.items.length;
  }
  return out;
}

/** New event, from the page: made, and given to the character whose life is shown. Returns its id. */
export function newEvent(character: string | null): (x: EventChanges) => string {
  return (x) => {
    const id = x.createEvent();
    // A new event made while looking at a character's life belongs to that life.
    if (character !== null) x.updateEvent(id, () => ({ characters: [{ id: character, age: null }] }) as JsonMap);
    return id;
  };
}

// ------------------------------------------------------------------------------------------------- the chapter seed

/** THE STORY AS TOLD, AS A FIRST TIMELINE: an empty timeline in a novel with chapters shows those chapters as a faint
 * timeline (a dot and the title of each, the first five, "and 9 more chapters"), with one press to make them its
 * events. In a frame padded 24/24/24/20: the heading (18, bold), the line (16, italic, faint), a rule, the chapters
 * (a column 24 wide: a stem 2 wide in the accent at 40% above and below a ring of 11 with a 2 border in the accent;
 * then 12, the title, 17, one line), "and N more chapters" (15, italic, faint, 36 in), then the two buttons. */
export function chapterSeed(chapters: readonly StoryNode[]): {
  heading: string;
  line: string;
  rows: { title: string; stemAbove: boolean; stemBelow: boolean }[];
  more: string | null;
  seed: string;
  newEvent: string;
} {
  const shown = 5;
  const more = chapters.length - shown;
  return {
    heading: 'What happened, and when',
    line: 'The timeline is the story’s own chronology, apart from the order chapters are told in. Begin with the story as you tell it, then move each event to when it happens.',
    rows: chapters.slice(0, shown).map((c, i) => ({
      title: c.displayTitle,
      stemAbove: i > 0,
      stemBelow: (i < chapters.length - 1 && i < shown - 1) || more > 0,
    })),
    more: more > 0 ? `and ${plural(more, 'more chapter')}` : null,
    seed: chapters.length === 1 ? 'Make an event from the chapter' : `Make ${chapters.length} events from the chapters`,
    newEvent: 'New event',
  };
}

/** The toast once the chapters are made events. */
export const seededMessage = (made: number): string =>
  `${plural(made, 'event')} made from your chapters, in the order they are told. Give each a date to place it in time.`;
