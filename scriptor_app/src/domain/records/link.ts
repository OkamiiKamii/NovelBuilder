// Stored connections between records (`loreLinks`) and how each kind reads from either end. A port of
// flutter_app/lib/shared/domain/records/link.dart.

import { type JsonMap, str, strOrNull } from '../json';
import { EntityRef, type EntityType, entityTypeOf } from '../model/entityRef';
import { Validity } from '../model/validity';
import { dartTrim } from '../text/dartString';
import { type CanonStatus, canonStatusOf } from './canon';
import { JsonRecord } from './jsonRecord';

/** How a kind of connection reads from the other end.
 *
 *  - ConnectionType.same: it reads the same both ways (allies are allied with each other).
 *  - a phrase: the other side is the plain converse of a fact (the Keep contains the vault, so the vault is located in
 *    the Keep). Nobody's opinion is guessed.
 *  - null: it says nothing about the other side. That Mira considers Orrin a rival does not make her his rival.
 *
 * Kinds the author makes up are kept exactly as written and read as one-sided. */
export class ConnectionType {
  static readonly same = '\u0000same';

  constructor(
    readonly key: string,
    readonly label: string,
    readonly inverse: string | null,
  ) {}

  get reciprocal(): boolean {
    return this.inverse === ConnectionType.same;
  }
}

export const connectionTypes: readonly ConnectionType[] = [
  new ConnectionType('related', 'Related to', ConnectionType.same),
  new ConnectionType('allied-with', 'Allied with', ConnectionType.same),
  new ConnectionType('member-of', 'Member of', 'Has member'),
  new ConnectionType('leads', 'Leads', 'Led by'),
  new ConnectionType('owns', 'Owns', 'Owned by'),
  new ConnectionType('located-in', 'Located in', 'Contains'),
  new ConnectionType('created-by', 'Created by', 'Created'),
  new ConnectionType('caused', 'Caused', 'Caused by'),
  new ConnectionType('occurred-at', 'Took place at', 'Scene of'),
  new ConnectionType('appears-in', 'Appears in', 'Features'),
  new ConnectionType('knows-about', 'Knows about', 'Known to'),
  new ConnectionType('considers-rival', 'Considers a rival', null),
  new ConnectionType('considers-friend', 'Considers a friend', null),
  new ConnectionType('distrusts', 'Distrusts', null),
  new ConnectionType('at-war-with', 'At war with', ConnectionType.same),
  new ConnectionType('controls', 'Controls', 'Controlled by'),
  new ConnectionType('influences', 'Influences', 'Influenced by'),
  new ConnectionType('prerequisite-for', 'Prerequisite for', 'Requires'),
  new ConnectionType('alternative-for', 'Alternative prerequisite for', 'Can be reached through'),
  new ConnectionType('upgrades-to', 'Upgrades to', 'Upgraded from'),
  new ConnectionType('evolves-into', 'Evolves into', 'Evolves from'),
  new ConnectionType('fuses-into', 'Fuses into', 'Fused from'),
  new ConnectionType('replaced-by', 'Replaced by', 'Replaces'),
  new ConnectionType('excludes', 'Mutually exclusive with', ConnectionType.same),
];

const typesByKey = new Map(connectionTypes.map((t) => [t.key, t]));

/** A connection kind, known or the author's own. An unknown key is shown as written and treated as one-sided. */
export function connectionType(key: string | null): ConnectionType {
  const name = dartTrim(key ?? '').length === 0 ? 'related' : dartTrim(key!);
  return typesByKey.get(name) ?? new ConnectionType(name, name, null);
}

/** A stored connection between two records (`loreLinks`). One row serves both directions, each side with its own
 * optional wording. Records never store their connections themselves, so removing one cannot leave the other broken.
 *
 * Without a `type` it is a plain "related entries" link between two codex entries. A typed one says what kind it is
 * ("member-of", "owns", or the author's own word), may join any two kinds of record, and reads from → to. */
export class Link extends JsonRecord {
  get fromId(): string {
    return str(this.raw['fromId']);
  }
  get toId(): string {
    return str(this.raw['toId']);
  }
  /** What each end is; `entry` when absent (and when the stored value is not a known type). */
  get fromType(): EntityType {
    return entityTypeOf(this.raw['fromType']) ?? 'entry';
  }
  get toType(): EntityType {
    return entityTypeOf(this.raw['toType']) ?? 'entry';
  }
  get from(): EntityRef {
    return new EntityRef(this.fromType, this.fromId);
  }
  get to(): EntityRef {
    return new EntityRef(this.toType, this.toId);
  }
  /** How the from side describes it, and the to side. */
  get fromLabel(): string {
    return str(this.raw['fromLabel']);
  }
  get toLabel(): string {
    return str(this.raw['toLabel']);
  }
  /** A known key or the author's own word, kept as written. Null: a plain related-entries link. */
  get type(): string | null {
    const t = strOrNull(this.raw['type']);
    return t === null || t.length === 0 ? null : t;
  }
  get notes(): string | null {
    return strOrNull(this.raw['notes']);
  }
  get canon(): CanonStatus | null {
    return canonStatusOf(this.raw['canon']);
  }
  /** When in the story it holds. Null: always, as far as anyone has said. */
  get validity(): Validity | null {
    return Validity.fromJson(this.raw['validity']);
  }
  /** How it began and ended, in the author's words ("stolen", "inherited"; "lost", "destroyed"). */
  get how(): string | null {
    return strOrNull(this.raw['how']);
  }
  get endHow(): string | null {
    return strOrNull(this.raw['endHow']);
  }
  /** Whether this is a link between two codex entries: what the codex lists as related entries. */
  get isEntryLink(): boolean {
    return this.fromType === 'entry' && this.toType === 'entry';
  }

  withFields(changes: JsonMap): Link {
    return new Link(this.merged(changes));
  }
}

/** The words each side of a stored connection reads, from its type and the author's own wording. */
export function wordingOf(link: Link): { forward: string; backward: string; reciprocal: boolean } {
  const type = link.type;
  // An untyped related-entries link has only what the author wrote on each side.
  if (type === null) return { forward: link.fromLabel, backward: link.toLabel, reciprocal: true };
  const kind = connectionType(type);
  const forward = link.fromLabel.length > 0 ? link.fromLabel : kind.label;
  const backward = link.toLabel.length > 0 ? link.toLabel : kind.reciprocal ? forward : (kind.inverse ?? '');
  return { forward, backward, reciprocal: kind.reciprocal };
}
