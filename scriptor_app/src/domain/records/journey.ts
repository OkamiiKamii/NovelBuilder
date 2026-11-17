// Journeys (`journeys`). A port of flutter_app/lib/shared/domain/records/journey.dart.

import { idOrNull, numOrNull, str } from '../json';
import { Anchor } from '../model/validity';
import { EventDuration } from './event';
import { JsonRecord, strings } from './jsonRecord';

/** A journey: who travels from where to where, by way of where, and when (as far as the author has said). */
export class Journey extends JsonRecord {
  get travellerIds(): string[] {
    return strings(this.raw['travellerIds']);
  }
  get fromId(): string | null {
    return idOrNull(this.raw['fromId']);
  }
  get toId(): string | null {
    return idOrNull(this.raw['toId']);
  }
  get via(): string[] {
    return strings(this.raw['via']);
  }
  get departure(): Anchor | null {
    return Anchor.fromJson(this.raw['departure']);
  }
  get arrival(): Anchor | null {
    return Anchor.fromJson(this.raw['arrival']);
  }
  get afterId(): string | null {
    return idOrNull(this.raw['afterId']);
  }
  get eventIds(): string[] {
    return strings(this.raw['eventIds']);
  }
  /** How they travel, in the author's words ("on foot", "by airship"), and one of the novel's travel methods when
   * chosen. */
  get method(): string {
    return str(this.raw['method']);
  }
  get methodId(): string | null {
    return idOrNull(this.raw['methodId']);
  }
  get duration(): EventDuration | null {
    return EventDuration.fromJson(this.raw['duration']);
  }
  /** How far, in the author's unit ("120 leagues"). */
  get distance(): number | null {
    return numOrNull(this.raw['distance']);
  }
  get distanceUnit(): string {
    return str(this.raw['distanceUnit']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
}
