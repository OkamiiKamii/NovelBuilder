import type { CanonStatus } from '@/modules/canon/types';

export const TIME_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const IMPORTANCE = ['minor', 'major', 'climax'] as const;
export type Importance = (typeof IMPORTANCE)[number];
export const IMPORTANCE_LABELS: Record<Importance, string> = { minor: 'Minor', major: 'Major', climax: 'Climax' };

/** Where an event stands in the author's planning. Events made before this existed read as `confirmed`. */
export const EVENT_STATUSES = ['idea', 'planned', 'confirmed'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = { idea: 'Idea', planned: 'Planned', confirmed: 'Confirmed' };

/**
 * How a chapter or scene brings an event to the reader. `told` is the plain
 * case and the one assumed when nothing else is said: the story's main line.
 * The others are the author's own account of how the telling departs from
 * it: going back (a flashback, something revealed afterwards), going ahead
 * (a flash-forward, such as a prologue set later; a foreshadowing), or only
 * mentioning it. `flashforward` was added with Prompt 20; older rows simply
 * never have it.
 */
export const REVEAL_ROLES = ['told', 'flashback', 'flashforward', 'foreshadowed', 'mentioned', 'revealed'] as const;
export type RevealRole = (typeof REVEAL_ROLES)[number];
export const REVEAL_LABELS: Record<RevealRole, string> = { told: 'Told in', flashback: 'Flashback in', flashforward: 'Flash-forward in', foreshadowed: 'Foreshadowed in', mentioned: 'Mentioned in', revealed: 'Revealed in' };
/** The same, as a choice in a list: how this chapter tells it. */
export const REVEAL_CHOICES: Record<RevealRole, string> = { told: 'Told here', flashback: 'As a flashback', flashforward: 'As a flash-forward', foreshadowed: 'Foreshadowed', mentioned: 'Only mentioned', revealed: 'Revealed afterwards' };

export interface EventReveal {
  nodeId: string;
  role: RevealRole;
}

export const PRECISIONS = ['exact', 'approximate', 'relative', 'unknown'] as const;
export type Precision = (typeof PRECISIONS)[number];
export const PRECISION_LABELS: Record<Precision, string> = { exact: 'Exact', approximate: 'Approximate', relative: 'Relative', unknown: 'Undated' };

/**
 * When an event happens in the story's own world, at whatever precision the
 * author knows it.
 *  - exact:       a year, optionally narrowed to month, day and time
 *  - approximate: a year, optionally a month or a season ("Summer of Year 10")
 *  - relative:    an offset before or after another event ("about 20 years before the Siege")
 *  - unknown:     no date; its place comes from the event it follows
 * Years are plain numbers in the story's calendar (negative years are fine).
 */
export type EventDate =
  | { precision: 'exact'; year: number; month: number | null; day: number | null; hour: number | null; minute: number | null }
  | { precision: 'approximate'; year: number; month: number | null; season: Season | null }
  | { precision: 'relative'; anchorId: string | null; amount: number; unit: TimeUnit; direction: 'before' | 'after' }
  | { precision: 'unknown' };

export interface EventDuration {
  amount: number;
  unit: TimeUnit;
}

export interface EventCharacter {
  /** Codex entry id of the character. */
  id: string;
  /** The character's age at this event, when the author states it. Age 0 marks their birth. */
  age: number | null;
}

/**
 * INDEPENDENT CHRONOLOGY RULE
 * An event in the story's own time. It holds dates, durations, ages and
 * "comes after" dependencies as explicit values, and points at chapters,
 * scenes and codex entries by id only. Nothing about its position in time is
 * derived from the manuscript, so reordering chapters cannot change it: the
 * manuscript tree is the order the reader meets the story in, this is the
 * order it happened in.
 */
export interface TimelineEvent {
  id: string;
  projectId: string;
  name: string;
  description: string;
  when: EventDate;
  duration: EventDuration | null;
  importance: Importance;
  /** A location entry in the codex. */
  locationId: string | null;
  characters: EventCharacter[];
  /** Other codex entries involved: factions, items, lore. */
  entryIds: string[];
  /** Chapters and scenes where this event is told or mentioned. */
  nodeIds: string[];
  /** The event this one comes after ("previous event"). Used to place undated events and to check dated ones. */
  afterId: string | null;
  createdAt: number;
  // Added later. A row without them is an instant (or lasts `duration`), confirmed, canon, told plainly in each of `nodeIds`.
  /** When it ends, as a date in its own right. An event has an end date or a duration, never both. */
  end?: EventDate | null;
  /** Has no end within the story: a war still going on, a curse not yet lifted. */
  ongoing?: boolean;
  /** Plot threads it belongs to. */
  threadIds?: string[];
  /** The author's labels for it (action, a mystery clue…). */
  labels?: string[];
  status?: EventStatus;
  canon?: CanonStatus;
  /** How some of the chapters in `nodeIds` tell it, when not plainly (a flashback, a foreshadowing). */
  reveals?: EventReveal[];
  updatedAt: number;
}

export type EventChanges = Partial<Pick<TimelineEvent, 'name' | 'description' | 'when' | 'duration' | 'importance' | 'locationId' | 'characters' | 'entryIds' | 'nodeIds' | 'afterId' | 'end' | 'ongoing' | 'threadIds' | 'labels' | 'status' | 'canon' | 'reveals'>>;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const SEASON_LABELS: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
