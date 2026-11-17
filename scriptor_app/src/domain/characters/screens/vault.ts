// THE CHARACTER VAULT's pure helpers: the facts at the top of a profile, the symbol, and the character's web of
// relationships as data. A port of the non-visual parts of flutter_app/lib/features/characters/widgets/vault.dart.

import { displayValue } from '../../codex/fieldValues';
import { localeCompare } from '../../collation';
import { stageAt } from '../../model/storyOrder';
import { dartSort } from '../../manuscript/dartSort';
import { type FieldType } from '../../records/category';
import { type Entry } from '../../records/entry';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type CastData } from '../castData';
import { type CharacterProfile } from '../characterRecords';
import { kindOf, settled } from '../fieldKinds';
import { roleOf } from '../../relationships/history';

/** One fact in the profile's header: its name in small capitals, its value beneath. Said as `${name}: ${value}`. */
export type VaultFact = { name: string; value: string };

/** The facts shown at the top of a profile: the first fields of its first section on the Overview tab (its identity,
 * in the built-in layouts), the short kinds only, those with something written first. Read from the record; none is
 * kept anywhere else. */
export function identityFacts(
  cast: CastData,
  entry: Entry,
  profile: CharacterProfile,
  options: { max?: number } = {},
): VaultFact[] {
  const max = options.max ?? 6;
  const first = profile.sections.find((s) => s.tab === 'overview' && !s.hidden);
  if (first === undefined) return [];
  const byId = new Map(entry.fields.map((f) => [f.id, f]));
  const facts: VaultFact[] = [];
  for (const id of first.fieldIds) {
    const f = byId.get(id);
    if (f === undefined) continue;
    const def = f.defId === null ? null : (cast.characterCategory.fields.find((d) => d.id === f.defId) ?? null);
    // A field of a known shape (a Gender, an Age) is read as that shape, whatever it was made as (fieldKinds.ts).
    const kind = def === null ? kindOf(f.key) : null;
    const type: FieldType = def?.type ?? kind?.type ?? f.type ?? 'text';
    if (type === 'longtext' || type === 'references' || type === 'tags') continue;
    const name = def !== null && def.name.length > 0 ? def.name : f.key;
    const value = displayValue(type, settled(kind, f.value), (x) => cast.nameOf(x));
    // The symbol has a row of its own on the overview.
    if (dartTrim(name).length === 0 || dartTrim(value).length === 0 || dartToLowerCase(dartTrim(name)) === 'symbol') {
      continue;
    }
    facts.push({ name, value });
    if (facts.length === max) break;
  }
  return facts;
}

/** The value of the character's field called "Symbol", when they have one with something in it. */
export function symbolOf(cast: CastData, entry: Entry): string | null {
  for (const f of entry.fields) {
    const def = f.defId === null ? null : (cast.characterCategory.fields.find((d) => d.id === f.defId) ?? null);
    const name = def !== null && def.name.length > 0 ? def.name : f.key;
    if (dartToLowerCase(dartTrim(name)) === 'symbol' && dartTrim(f.value).length > 0) {
      return displayValue(def?.type ?? f.type, f.value, (x) => cast.nameOf(x));
    }
  }
  return null;
}

/** THE CHARACTER'S WEB: the character in the middle and the people they have a relationship with around them, joined
 * by a line; two of those people are joined too when they have a relationship of their own. As things stand at the end
 * of the story. Each person can be opened. */
export type RelationWeb = {
  /** Everyone they have a relationship with, by name, each with what they are to them ("Rival"). */
  around: { other: Entry; role: string }[];
  /** The first `max` of them, drawn round the character. */
  shown: { other: Entry; role: string; label: string }[];
  /** Lines between two of those shown, by their index in `shown`. */
  between: [number, number][];
  /** "Kaelen Draven, in the middle". */
  middleLabel: string;
  /** When there is no one: "No relationships recorded yet. Add one on the Relationships tab." */
  empty: string | null;
  /** "And 2 more on the Relationships tab." when not all are shown. */
  more: string | null;
};

export function relationWeb(cast: CastData, entry: Entry, options: { max?: number } = {}): RelationWeb {
  const max = options.max ?? 6;
  const order = cast.model.order;
  const around: { other: Entry; role: string }[] = [];
  const seen = new Set<string>();
  for (const r of cast.model.relations.values()) {
    if (r.fromId !== entry.id && r.toId !== entry.id) continue;
    const otherId = r.fromId === entry.id ? r.toId : r.fromId;
    const other = cast.model.entries.get(otherId);
    if (other === undefined || seen.has(otherId)) continue;
    seen.add(otherId);
    const stage = stageAt(r, null, order);
    around.push({ other, role: stage === null ? 'Related' : roleOf(stage, r, otherId) });
  }
  // Dart's List.sort, as the vault sorts them.
  dartSort(around, (a, b) => localeCompare(a.other.name, b.other.name));
  const shown = around.slice(0, max).map((a) => ({ ...a, label: `${a.other.name}: ${a.role}. Open their profile` }));
  const ids = shown.map((a) => a.other.id);
  const between: [number, number][] = [];
  for (const r of cast.model.relations.values()) {
    if (ids.includes(r.fromId) && ids.includes(r.toId) && r.fromId !== r.toId) {
      between.push([ids.indexOf(r.fromId), ids.indexOf(r.toId)]);
    }
  }
  return {
    around,
    shown,
    between,
    middleLabel: `${entry.name}, in the middle`,
    empty: around.length === 0 ? 'No relationships recorded yet. Add one on the Relationships tab.' : null,
    more: around.length > shown.length ? `And ${around.length - shown.length} more on the Relationships tab.` : null,
  };
}
