import type { Anchor } from '@/modules/model/validity';
import type { EventDuration, TimeUnit } from '@/modules/timeline/types';

/**
 * JOURNEYS
 * Who goes from where to where, and when, as far as the author says:
 * when they leave and arrive (a chapter or scene, an event, a date, exact
 * or approximate, or not known), or only that one journey comes after
 * another; how they travel, how long it takes, how far it is, and the
 * events it belongs to. Nothing about speed is assumed: a method has a
 * speed only when the author gives it one.
 */
export interface Journey {
  id: string;
  projectId: string;
  /** Who travels: characters, or a group (a faction, a company…), by codex entry. */
  travellerIds: string[];
  /** Where from and where to, as places of the novel; null when not recorded. */
  fromId: string | null;
  toId: string | null;
  /** Places it passes through, in order. */
  via: string[];
  /** When they leave and arrive; null when not known. */
  departure: Anchor | null;
  arrival: Anchor | null;
  /** The journey this one comes after, when only the order is known. */
  afterId: string | null;
  /** How they travel, in the author's words ("on foot", "by airship"), and one of the novel's travel methods when chosen. */
  method: string;
  methodId: string | null;
  duration: EventDuration | null;
  /** How far, in the author's unit ("120 leagues"). */
  distance: number | null;
  distanceUnit: string;
  /** Events the journey belongs to: the escape it is part of, the ambush on the way. */
  eventIds: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
}

/** A way of travelling, with a speed only if the author sets one: so many units of distance per unit of time. */
export interface TravelMethod {
  id: string;
  name: string;
  /** Null: no speed set, and nothing is worked out from it. */
  speed: number | null;
  distanceUnit: string;
  per: TimeUnit;
}

/** A novel's travel methods. One row a novel. */
export interface TravelSettings {
  id: string;
  projectId: string;
  methods: TravelMethod[];
  createdAt: number;
  updatedAt: number;
}

export const PER_LABELS: Record<TimeUnit, string> = { minutes: 'a minute', hours: 'an hour', days: 'a day', weeks: 'a week', months: 'a month', years: 'a year' };
