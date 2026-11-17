// Records by their stable id. A port of flutter_app/lib/shared/domain/model/entity_ref.dart.

import { isMap } from '../json';

/** The kinds of record a view can point at.
 *
 *  node      a volume, act, arc, chapter or scene (`chapters` collection)
 *  entry     a codex entry: character, location, faction, item, power, lore, or a kind the author made (`loreEntries`)
 *  event     a timeline event (`timelineEvents`)
 *  thread    a plot thread (`plotThreads`)
 *  relation  a relationship between two characters (`characterRelations`)
 *  ability   a class, skill, title… inside a system blueprint (`systems`), named `<systemId>/<itemId>` */
export type EntityType = 'node' | 'entry' | 'event' | 'thread' | 'relation' | 'ability';

/** In the Dart enum's order. */
export const entityTypes: readonly EntityType[] = ['node', 'entry', 'event', 'thread', 'relation', 'ability'];

export function entityTypeOf(value: unknown): EntityType | null {
  return entityTypes.find((t) => t === value) ?? null;
}

/** A record, by its stable id. Never by its name, title or position. Compare with `equals` or by `key` (JavaScript
 * sets and maps compare objects by identity, so key them by `key`). */
export class EntityRef {
  constructor(
    readonly type: EntityType,
    readonly id: string,
  ) {}

  /** One string (`entry:<id>`), for addresses and map keys. */
  get key(): string {
    return `${this.type}:${this.id}`;
  }

  /** Reads a ref back from `key`. Null for anything that is not one. */
  static parse(key: string): EntityRef | null {
    const at = key.indexOf(':');
    if (at <= 0) return null;
    const type = entityTypeOf(key.substring(0, at));
    const id = key.substring(at + 1);
    return type === null || id.length === 0 ? null : new EntityRef(type, id);
  }

  toJson(): { type: EntityType; id: string } {
    return { type: this.type, id: this.id };
  }

  static fromJson(json: unknown): EntityRef | null {
    if (!isMap(json)) return null;
    const type = entityTypeOf(json['type']);
    const id = json['id'];
    return type === null || typeof id !== 'string' ? null : new EntityRef(type, id);
  }

  equals(other: unknown): boolean {
    return other instanceof EntityRef && other.type === this.type && other.id === this.id;
  }

  toString(): string {
    return this.key;
  }
}

/** What a view shows for any record: its name as it is now, and what kind of thing it is. */
export class EntityView {
  constructor(
    readonly ref: EntityRef,
    readonly label: string,
    /** The node kind (`chapter`, `scene`…), the codex category key (`character`, `custom-…`), or the entity type. */
    readonly kind: string,
  ) {}
}

/** An ability's id: the blueprint and the item, since items live inside their blueprint. */
export function abilityId(systemId: string, itemId: string): string {
  return `${systemId}/${itemId}`;
}
