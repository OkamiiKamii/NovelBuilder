// Timeline events (`timelineEvents`) and dates in the story's own world. A port of
// flutter_app/lib/shared/domain/records/event.dart.

import { type JsonMap, idOrNull, mapOrNull, numOrNull, str } from '../json';
import { type CanonStatus, canonStatusOf } from './canon';
import { JsonRecord, intOrNull, maps, strings } from './jsonRecord';

export type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
export const timeUnits: readonly TimeUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'];
export function timeUnitOf(value: unknown): TimeUnit | null {
  return timeUnits.find((u) => u === value) ?? null;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const seasons: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export function seasonOf(value: unknown): Season | null {
  return seasons.find((s) => s === value) ?? null;
}

/** When something happens in the story's own world, at whatever precision the author knows it. Years are plain numbers
 * in the novel's calendar (negative years are fine). Never forced into a real-world timestamp. Dart's sealed class:
 * one of ExactDate, ApproximateDate, RelativeDate, UnknownDate (tell them apart with `instanceof` or `precision`). */
export abstract class EventDate {
  /** How exact it is, as stored: `exact`, `approximate`, `relative` or `unknown`. */
  abstract readonly precision: 'exact' | 'approximate' | 'relative' | 'unknown';

  /** The date as the original app stores it, every field present. */
  abstract toJson(): JsonMap;

  /** Null when the value is not a date this version can read (an unknown precision, a missing year). */
  static fromJson(json: unknown): EventDate | null {
    const m = mapOrNull(json);
    if (m === null) return null;
    switch (m['precision']) {
      case 'exact': {
        const year = numOrNull(m['year']);
        return year === null
          ? null
          : new ExactDate(year, {
              month: intOrNull(m['month']),
              day: intOrNull(m['day']),
              hour: intOrNull(m['hour']),
              minute: intOrNull(m['minute']),
            });
      }
      case 'approximate': {
        const year = numOrNull(m['year']);
        return year === null
          ? null
          : new ApproximateDate(year, { month: intOrNull(m['month']), season: seasonOf(m['season']) });
      }
      case 'relative': {
        const unit = timeUnitOf(m['unit']);
        const amount = numOrNull(m['amount']);
        if (unit === null || amount === null) return null;
        return new RelativeDate({
          anchorId: idOrNull(m['anchorId']),
          amount,
          unit,
          before: m['direction'] === 'before',
        });
      }
      case 'unknown':
        return new UnknownDate();
    }
    return null;
  }
}

/** A year, optionally narrowed to month, day and time. */
export class ExactDate extends EventDate {
  readonly precision = 'exact' as const;
  readonly month: number | null;
  readonly day: number | null;
  readonly hour: number | null;
  readonly minute: number | null;

  constructor(
    readonly year: number,
    parts: { month?: number | null; day?: number | null; hour?: number | null; minute?: number | null } = {},
  ) {
    super();
    this.month = parts.month ?? null;
    this.day = parts.day ?? null;
    this.hour = parts.hour ?? null;
    this.minute = parts.minute ?? null;
  }

  toJson(): JsonMap {
    return {
      precision: 'exact',
      year: this.year,
      month: this.month,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
    };
  }
}

/** A year, optionally a month or a season ("Summer of Year 10"). */
export class ApproximateDate extends EventDate {
  readonly precision = 'approximate' as const;
  readonly month: number | null;
  readonly season: Season | null;

  constructor(
    readonly year: number,
    parts: { month?: number | null; season?: Season | null } = {},
  ) {
    super();
    this.month = parts.month ?? null;
    this.season = parts.season ?? null;
  }

  toJson(): JsonMap {
    return { precision: 'approximate', year: this.year, month: this.month, season: this.season };
  }
}

/** An offset before or after another event ("about 20 years before the Siege"). */
export class RelativeDate extends EventDate {
  readonly precision = 'relative' as const;
  readonly anchorId: string | null;
  readonly amount: number;
  readonly unit: TimeUnit;
  readonly before: boolean;

  constructor(args: { anchorId: string | null; amount: number; unit: TimeUnit; before: boolean }) {
    super();
    this.anchorId = args.anchorId;
    this.amount = args.amount;
    this.unit = args.unit;
    this.before = args.before;
  }

  toJson(): JsonMap {
    return {
      precision: 'relative',
      anchorId: this.anchorId,
      amount: this.amount,
      unit: this.unit,
      direction: this.before ? 'before' : 'after',
    };
  }
}

/** No date: its place comes from the event it follows, if any. */
export class UnknownDate extends EventDate {
  readonly precision = 'unknown' as const;

  toJson(): JsonMap {
    return { precision: 'unknown' };
  }
}

export class EventDuration {
  constructor(
    readonly amount: number,
    readonly unit: TimeUnit,
  ) {}

  static fromJson(json: unknown): EventDuration | null {
    const m = mapOrNull(json);
    const amount = numOrNull(m?.['amount']);
    const unit = timeUnitOf(m?.['unit']);
    return amount === null || unit === null ? null : new EventDuration(amount, unit);
  }

  toJson(): JsonMap {
    return { amount: this.amount, unit: this.unit };
  }
}

/** How a chapter or scene brings an event to the reader. `told` is the plain case; the others are the author's own
 * account of how the telling departs from chronology. */
export type RevealRole = 'told' | 'flashback' | 'flashforward' | 'foreshadowed' | 'mentioned' | 'revealed';
export const revealRoles: readonly RevealRole[] = [
  'told',
  'flashback',
  'flashforward',
  'foreshadowed',
  'mentioned',
  'revealed',
];
export const revealRoleLabel: Readonly<Record<RevealRole, string>> = {
  told: 'Told in',
  flashback: 'Flashback in',
  flashforward: 'Flash-forward in',
  foreshadowed: 'Foreshadowed in',
  mentioned: 'Mentioned in',
  revealed: 'Revealed in',
};
export function revealRoleOf(value: unknown): RevealRole | null {
  return revealRoles.find((r) => r === value) ?? null;
}

export type Importance = 'minor' | 'major' | 'climax';
export const importances: readonly Importance[] = ['minor', 'major', 'climax'];

export type EventStatus = 'idea' | 'planned' | 'confirmed';
export const eventStatuses: readonly EventStatus[] = ['idea', 'planned', 'confirmed'];

/** INDEPENDENT CHRONOLOGY RULE: an event in the story's own time. Its dates, durations and "comes after" links are
 * explicit values; it points at chapters and scenes (`nodeIds`) only to say where it is told. Reordering chapters
 * cannot change when it happens: the manuscript is the order the reader meets the story in, this is the order it
 * happened in. */
export class TimelineEvent extends JsonRecord {
  get name(): string {
    return str(this.raw['name']);
  }
  get description(): string {
    return str(this.raw['description']);
  }
  get when(): EventDate | null {
    return EventDate.fromJson(this.raw['when']);
  }
  get duration(): EventDuration | null {
    return EventDuration.fromJson(this.raw['duration']);
  }
  get importance(): Importance {
    return importances.find((i) => i === this.raw['importance']) ?? 'minor';
  }
  get importanceKey(): string {
    return str(this.raw['importance'], 'minor');
  }
  /** A location entry. */
  get locationId(): string | null {
    return idOrNull(this.raw['locationId']);
  }
  /** Characters at the event (codex entry ids), each with an age when the author states one. */
  get characters(): { id: string; age: number | null }[] {
    return maps(this.raw['characters'])
      .filter((c) => idOrNull(c['id']) !== null)
      .map((c) => ({ id: c['id'] as string, age: numOrNull(c['age']) }));
  }
  /** Other entries involved: factions, items, lore. */
  get entryIds(): string[] {
    return strings(this.raw['entryIds']);
  }
  /** Chapters and scenes where it is told or mentioned. */
  get nodeIds(): string[] {
    return strings(this.raw['nodeIds']);
  }
  /** The event this one comes after. */
  get afterId(): string | null {
    return idOrNull(this.raw['afterId']);
  }
  /** When it ends, as a date in its own right. An event has an end date or a duration, never both. */
  get end(): EventDate | null {
    return EventDate.fromJson(this.raw['end']);
  }
  /** Still going on at the end of the story. */
  get ongoing(): boolean {
    return this.raw['ongoing'] === true;
  }
  get threadIds(): string[] {
    return strings(this.raw['threadIds']);
  }
  get labels(): string[] {
    return strings(this.raw['labels']);
  }
  get statusKey(): string {
    return str(this.raw['status'], 'confirmed');
  }
  get canon(): CanonStatus | null {
    return canonStatusOf(this.raw['canon']);
  }
  get canonKey(): string {
    return str(this.raw['canon'], 'canon');
  }
  /** How some chapters in `nodeIds` tell it, when not plainly. */
  get reveals(): Map<string, RevealRole> {
    const out = new Map<string, RevealRole>();
    for (const r of maps(this.raw['reveals'])) {
      if (idOrNull(r['nodeId']) !== null) out.set(r['nodeId'] as string, revealRoleOf(r['role']) ?? 'told');
    }
    return out;
  }

  withFields(changes: JsonMap): TimelineEvent {
    return new TimelineEvent(this.merged(changes));
  }
}
