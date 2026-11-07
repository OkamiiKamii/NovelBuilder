/**
 * HOW A CONNECTION READS FROM THE OTHER END
 * A connection is one statement, made from its `from` side: "Mira considers
 * Orrin a rival". What that says about the other side depends on the kind:
 *
 *  - `same`: it reads the same both ways. Allies are allied with each other.
 *  - a phrase: the other side is the plain converse of a fact. If the Keep
 *    contains the vault, the vault is located in the Keep. Nobody's opinion
 *    is being guessed.
 *  - `null`: it says nothing about the other side. That Mira considers Orrin
 *    a rival does not make Mira Orrin's rival; for that, Orrin needs a
 *    statement of his own (he may consider her a friend).
 *
 * Kinds the author makes up are kept exactly as written and read as `null`:
 * one-sided, unless the author adds the other side's own statement.
 */
export interface ConnectionType {
  key: string;
  label: string;
  inverse: 'same' | string | null;
}

export const CONNECTION_TYPES: ConnectionType[] = [
  { key: 'related', label: 'Related to', inverse: 'same' },
  { key: 'allied-with', label: 'Allied with', inverse: 'same' },
  { key: 'member-of', label: 'Member of', inverse: 'Has member' },
  { key: 'leads', label: 'Leads', inverse: 'Led by' },
  { key: 'owns', label: 'Owns', inverse: 'Owned by' },
  { key: 'located-in', label: 'Located in', inverse: 'Contains' },
  { key: 'created-by', label: 'Created by', inverse: 'Created' },
  { key: 'caused', label: 'Caused', inverse: 'Caused by' },
  { key: 'occurred-at', label: 'Took place at', inverse: 'Scene of' },
  { key: 'appears-in', label: 'Appears in', inverse: 'Features' },
  { key: 'knows-about', label: 'Knows about', inverse: 'Known to' },
  { key: 'considers-rival', label: 'Considers a rival', inverse: null },
  { key: 'considers-friend', label: 'Considers a friend', inverse: null },
  { key: 'distrusts', label: 'Distrusts', inverse: null },
  // Between factions and what they hold sway over (see `factions/ties.ts`).
  { key: 'at-war-with', label: 'At war with', inverse: 'same' },
  { key: 'controls', label: 'Controls', inverse: 'Controlled by' },
  { key: 'influences', label: 'Influences', inverse: 'Influenced by' },
  // Paths between abilities, skills, classes, items… (see `abilities/paths.ts`). Each says only what it says: an evolution is not a prerequisite.
  { key: 'prerequisite-for', label: 'Prerequisite for', inverse: 'Requires' },
  { key: 'alternative-for', label: 'Alternative prerequisite for', inverse: 'Can be reached through' },
  { key: 'upgrades-to', label: 'Upgrades to', inverse: 'Upgraded from' },
  { key: 'evolves-into', label: 'Evolves into', inverse: 'Evolves from' },
  { key: 'fuses-into', label: 'Fuses into', inverse: 'Fused from' },
  { key: 'replaced-by', label: 'Replaced by', inverse: 'Replaces' },
  { key: 'excludes', label: 'Mutually exclusive with', inverse: 'same' },
];

const byKey = new Map(CONNECTION_TYPES.map((t) => [t.key, t]));

/** A connection kind, known or the author's own. An unknown key is shown as written and treated as one-sided. */
export function connectionType(key: string | undefined): ConnectionType {
  const name = (key ?? '').trim() || 'related';
  return byKey.get(name) ?? { key: name, label: name, inverse: null };
}

/** The words each side of a stored connection reads, given the type and the author's own wording. */
export function wordingOf(link: { type?: string; fromLabel: string; toLabel: string }): { forward: string; backward: string; reciprocal: boolean } {
  const kind = connectionType(link.type);
  // An untyped related-entries link has only what the author wrote on each side.
  if (!link.type) return { forward: link.fromLabel, backward: link.toLabel, reciprocal: true };
  const forward = link.fromLabel || kind.label;
  const backward = link.toLabel || (kind.inverse === 'same' ? forward : (kind.inverse ?? ''));
  return { forward, backward, reciprocal: kind.inverse === 'same' };
}
