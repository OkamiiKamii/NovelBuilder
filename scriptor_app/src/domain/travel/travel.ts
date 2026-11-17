// JOURNEYS (as in the original app): who goes from where to where, and when, as far as the author says. Nothing about
// speed is assumed: a method has a speed only when the author gives it one. Journeys are records/journey.ts.
// A port of flutter_app/lib/shared/domain/travel/travel.dart.

import { type JsonMap, numOrNull, str } from '../json';
import { type TimeUnit, timeUnitOf } from '../records/event';
import { JsonRecord, maps } from '../records/jsonRecord';

/** A way of travelling, with a speed only if the author sets one: so many units of distance per unit of time. */
export class TravelMethod {
  readonly id: string;
  readonly name: string;
  /** Null: no speed set, and nothing is worked out from it. */
  readonly speed: number | null;
  readonly distanceUnit: string;
  readonly per: TimeUnit;

  constructor(args: { id: string; name: string; speed?: number | null; distanceUnit?: string; per?: TimeUnit }) {
    this.id = args.id;
    this.name = args.name;
    this.speed = args.speed ?? null;
    this.distanceUnit = args.distanceUnit ?? '';
    this.per = args.per ?? 'days';
  }

  static fromJson(m: JsonMap): TravelMethod {
    const speed = numOrNull(m['speed']);
    return new TravelMethod({
      id: str(m['id']),
      name: str(m['name']),
      speed: speed === null || !Number.isFinite(speed) ? null : speed,
      distanceUnit: str(m['distanceUnit']),
      per: timeUnitOf(m['per']) ?? 'days',
    });
  }

  toJson(): JsonMap {
    return { id: this.id, name: this.name, speed: this.speed, distanceUnit: this.distanceUnit, per: this.per };
  }
}

/** A novel's travel methods. One row a novel (`travelSettings`). */
export class TravelSettings extends JsonRecord {
  get methods(): TravelMethod[] {
    return maps(this.raw['methods']).map((m) => TravelMethod.fromJson(m));
  }
}

export const perLabels: Readonly<Record<TimeUnit, string>> = {
  minutes: 'a minute',
  hours: 'an hour',
  days: 'a day',
  weeks: 'a week',
  months: 'a month',
  years: 'a year',
};
