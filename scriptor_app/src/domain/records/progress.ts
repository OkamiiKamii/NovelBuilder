// What the novel tracks about how characters change (`progressCategories`, `progressChanges`). A port of
// flutter_app/lib/shared/domain/records/progress.dart.

import { idOrNull, numOrNull, str } from '../json';
import { Anchor } from '../model/validity';
import { JsonRecord, strings } from './jsonRecord';

/** Something the novel tracks about how characters change: a value, a named value, things held, or moments. */
export class ProgressCategory extends JsonRecord {
  get name(): string {
    return str(this.raw['name']);
  }
  /** `value`, `named`, `held` or `moment`. */
  get shape(): string {
    return str(this.raw['shape'], 'value');
  }
  get ladder(): string[] {
    return strings(this.raw['ladder']);
  }
  get characterIds(): string[] {
    return strings(this.raw['characterIds']);
  }
  get order(): number {
    return numOrNull(this.raw['order']) ?? 0;
  }
  /** No new changes; those recorded are kept and shown. */
  get archived(): boolean {
    return this.raw['archived'] === true;
  }
}

/** One change to one character, at a point in the story (or before it). */
export class ProgressChange extends JsonRecord {
  get entryId(): string {
    return str(this.raw['entryId']);
  }
  get categoryId(): string {
    return str(this.raw['categoryId']);
  }
  /** `set`, `gain`, `lose` or `happen`. */
  get action(): string {
    return str(this.raw['action']);
  }
  get subject(): string {
    return str(this.raw['subject']);
  }
  get value(): string {
    return str(this.raw['value']);
  }
  /** A codex entry the thing is (the sword gained), when there is one. */
  get refId(): string | null {
    return idOrNull(this.raw['refId']);
  }
  /** An ability it gains, loses or names (`<systemId>/<itemId>`). */
  get abilityId(): string | null {
    return idOrNull(this.raw['abilityId']);
  }
  /** When it happens. Null: before the story begins. */
  get at(): Anchor | null {
    return Anchor.fromJson(this.raw['at']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  /** What it cost, in the author's words. */
  get cost(): string {
    return str(this.raw['cost']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
}
