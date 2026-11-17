// Where a statement stands, and statements about the world (`canonFacts`). A port of
// flutter_app/lib/shared/domain/records/canon.dart.

import { type JsonMap, idOrNull, str } from '../json';
import { JsonRecord, maps, strings } from './jsonRecord';

/** Where a statement stands. Set by the author and by nobody else. The values are the stored keys. */
export type CanonStatus = 'canon' | 'provisional' | 'non-canon' | 'retconned' | 'conflicting';

/** In the Dart enum's order. */
export const canonStatuses: readonly CanonStatus[] = ['canon', 'provisional', 'non-canon', 'retconned', 'conflicting'];

export const canonStatusLabel: Readonly<Record<CanonStatus, string>> = {
  canon: 'Canon',
  provisional: 'Provisional',
  'non-canon': 'Non-Canon',
  retconned: 'Retconned',
  conflicting: 'Conflicting',
};

export const canonStatusHint: Readonly<Record<CanonStatus, string>> = {
  canon: 'Confirmed: officially true in the story as it stands.',
  provisional: 'A working idea, not settled yet.',
  'non-canon': 'Deliberately left out: a discarded draft or alternate version.',
  retconned: 'Was true once, and has been officially replaced.',
  conflicting: 'Contradicts another statement, and is waiting for your decision.',
};

/** Dart's `CanonStatus.of`: the status stored as `value`, or null. */
export function canonStatusOf(value: unknown): CanonStatus | null {
  return canonStatuses.find((s) => s === value) ?? null;
}

/** A statement about the fictional world and where it stands, with its sources and an append-only history.
 * It points at chapters, entries and events by id; it never holds or changes manuscript text. */
export class CanonFact extends JsonRecord {
  get subject(): string {
    return str(this.raw['subject']);
  }
  get statement(): string {
    return str(this.raw['statement']);
  }
  /** `lore`, `attribute`, `rule` or `story`. */
  get kind(): string {
    return str(this.raw['kind'], 'lore');
  }
  get status(): CanonStatus {
    return canonStatusOf(this.raw['status']) ?? 'provisional';
  }
  get entryIds(): string[] {
    return strings(this.raw['entryIds']);
  }
  get conflictsWith(): string[] {
    return strings(this.raw['conflictsWith']);
  }
  get replacedById(): string | null {
    return idOrNull(this.raw['replacedById']);
  }
  /** Each change, oldest first. Entries are only ever added. */
  get history(): JsonMap[] {
    return maps(this.raw['history']);
  }
  get sources(): JsonMap[] {
    return maps(this.raw['sources']);
  }

  withFields(changes: JsonMap): CanonFact {
    return new CanonFact(this.merged(changes));
  }
}
