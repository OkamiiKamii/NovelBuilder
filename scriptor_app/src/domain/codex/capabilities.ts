// WHAT A KIND OF RECORD CAN BE SHOWN AS (as in the original app). A port of
// flutter_app/lib/shared/domain/codex/capabilities.dart.
//
// A category opts into a view by naming, explicitly, the fields that view reads (`uses`): when its records are on a
// timeline, where on a map, their rank, who holds them, their graph label and links. Nothing is guessed from a field's
// name. Settings are kept and carried, by field id.

import { type JsonMap, listOf, mapOrNull } from '../json';
import { type Category, type FieldDef, type FieldType, fieldTypeLabel } from '../records/category';
import { firstOrNull, strings } from '../records/jsonRecord';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { dartToUpperCase } from '../exchange/dartUpperCase';

export const fieldNameLimit = 60;

const idIn = (value: unknown, ids: ReadonlySet<string>): string | null =>
  typeof value === 'string' && ids.has(value) ? value : null;
const obj = (value: unknown): JsonMap => mapOrNull(value) ?? {};

/** Settings as stored: only the known ones, each naming a field the category has (archived ones included, so
 * restoring a field restores its setting). Null when nothing is set. */
export function cleanUses(raw: unknown, fieldIds: Iterable<string>): JsonMap | null {
  const r = obj(raw);
  const ids = new Set(fieldIds);
  const out: JsonMap = {};
  const part = (value: JsonMap): JsonMap | null => {
    const kept: JsonMap = {};
    for (const [k, v] of Object.entries(value)) if (v !== null && v !== undefined) kept[k] = v;
    return Object.keys(kept).length === 0 ? null : kept;
  };

  const timeline = part({
    start: idIn(obj(r['timeline'])['start'], ids),
    end: idIn(obj(r['timeline'])['end'], ids),
  });
  if (timeline !== null) out['timeline'] = timeline;
  const map = part({ x: idIn(obj(r['map'])['x'], ids), y: idIn(obj(r['map'])['y'], ids) });
  if (map !== null) out['map'] = map;
  const rank = idIn(r['rank'], ids);
  if (rank !== null) out['rank'] = rank;
  const holding = obj(r['ownership']);
  const type = holding['type'];
  const trimmed = typeof type === 'string' ? dartTrim(type) : '';
  const ownership = part({
    type: trimmed.length > 0 ? (trimmed.length > fieldNameLimit ? trimmed.substring(0, fieldNameLimit) : trimmed) : null,
    field: idIn(holding['field'], ids),
  });
  if (ownership !== null) out['ownership'] = ownership;
  const graphLabel = idIn(r['graphLabel'], ids);
  if (graphLabel !== null) out['graphLabel'] = graphLabel;
  if (Array.isArray(r['graphLinks'])) {
    const links = new Set<string>();
    for (const v of listOf(r['graphLinks'])) {
      const id = idIn(v, ids);
      if (id !== null) links.add(id);
    }
    out['graphLinks'] = [...links];
  }
  if (r['tree'] === true) out['tree'] = true;
  return Object.keys(out).length === 0 ? null : out;
}

/** Settings with each field id swapped for the one it became (a template's field, as added to a novel). Ids with no
 * match are left out. */
export function remapUses(uses: JsonMap | null, idOf: (id: string) => string | null): JsonMap | null {
  if (uses === null) return null;
  const map = (id: unknown): string | null => (typeof id === 'string' ? idOf(id) : null);
  const timeline = obj(uses['timeline']);
  const mapPart = obj(uses['map']);
  const ownership = obj(uses['ownership']);
  const links = strings(uses['graphLinks']);
  const mentioned = [
    timeline['start'],
    timeline['end'],
    mapPart['x'],
    mapPart['y'],
    uses['rank'],
    ownership['field'],
    uses['graphLabel'],
    ...links,
  ];
  const known = new Set<string>();
  for (const id of mentioned) {
    const m = map(id);
    if (m !== null) known.add(m);
  }
  return cleanUses(
    {
      timeline: { start: map(timeline['start']), end: map(timeline['end']) },
      map: { x: map(mapPart['x']), y: map(mapPart['y']) },
      rank: map(uses['rank']),
      ownership: { type: ownership['type'] ?? null, field: map(ownership['field']) },
      graphLabel: map(uses['graphLabel']),
      ...(Array.isArray(uses['graphLinks'])
        ? { graphLinks: links.map(map).filter((id): id is string => id !== null) }
        : {}),
      tree: uses['tree'] ?? null,
    },
    known,
  );
}

/** Settings added to ones that exist, only where nothing is set yet: a template never changes what an author set. */
export function mergeUses(existing: JsonMap | null, incoming: JsonMap | null): JsonMap | null {
  if (incoming === null) return existing;
  const out: JsonMap = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(incoming)) {
    if (out[k] === null || out[k] === undefined) out[k] = v;
  }
  return Object.keys(out).length === 0 ? null : out;
}

// ---------------------------------------------------------------------------------------------------- what is missing

/** The ways a kind can be shown, beyond the table every kind has. */
export type KindView = 'timeline' | 'map' | 'rank' | 'ownership';
export const kindViews: readonly KindView[] = ['timeline', 'map', 'rank', 'ownership'];
export const kindViewLabel: Readonly<Record<KindView, string>> = {
  timeline: 'On a timeline',
  map: 'On a map',
  rank: 'By rank',
  ownership: 'By who holds it',
};
export function kindViewOf(key: unknown): KindView | null {
  return kindViews.find((v) => v === key) ?? null;
}

/** Each place a setting names a field (the values are the Dart enum's keys): what it is for, in words, and the field
 * types that can fill it. */
export type Slot =
  | 'timeline.start'
  | 'timeline.end'
  | 'map.x'
  | 'map.y'
  | 'rank'
  | 'ownership.field'
  | 'graphLabel'
  | 'graphLinks';

export const slots: ReadonlyMap<Slot, { readonly words: string; readonly types: readonly FieldType[] }> = new Map<
  Slot,
  { readonly words: string; readonly types: readonly FieldType[] }
>([
  ['timeline.start', { words: 'the date on the timeline', types: ['number', 'date'] }],
  ['timeline.end', { words: 'the end on the timeline', types: ['number', 'date'] }],
  ['map.x', { words: 'across on the map', types: ['number'] }],
  ['map.y', { words: 'up on the map', types: ['number'] }],
  ['rank', { words: 'the rank', types: ['number', 'select'] }],
  ['ownership.field', { words: 'who holds it now', types: ['reference'] }],
  ['graphLabel', { words: 'the label in the knowledge graph', types: ['text', 'number', 'select', 'date'] }],
  ['graphLinks', { words: 'a connection drawn in the knowledge graph', types: ['reference', 'references'] }],
]);

const typeOf = (def: FieldDef): FieldType => def.type ?? 'text';

/** "a Number or Date field". */
export function typeWords(slot: Slot): string {
  return `a ${slots
    .get(slot)!
    .types.map((t) => fieldTypeLabel[t])
    .join(' or ')} field`;
}

// Dart's `s[0].toUpperCase()`: the first UTF-16 code unit.
const capital = (s: string) => (s.length === 0 ? s : `${dartToUpperCase(s[0])}${s.substring(1)}`);

/** The fields of a category that can fill a slot: not archived, and of a type it takes. */
export function fieldsFor(category: Category, slot: Slot): FieldDef[] {
  const types = slots.get(slot)!.types;
  return category.fields.filter((f) => !f.archived && types.includes(typeOf(f)));
}

/** The field a slot names, when it can be read: present, not archived, of a type the slot takes. */
export function fieldOf(category: Category, slot: Slot, id: unknown): FieldDef | null {
  if (typeof id !== 'string' || id.length === 0) return null;
  const def = firstOrNull(category.fields.filter((f) => f.id === id));
  return def !== null && !def.archived && slots.get(slot)!.types.includes(typeOf(def)) ? def : null;
}

/** Why a slot cannot be read, or null when it can. Optional slots say nothing when unset. */
function slotProblem(category: Category, slot: Slot, id: unknown, optional = false): string | null {
  const { words, types } = slots.get(slot)!;
  if (typeof id !== 'string' || id.length === 0) {
    if (optional) return null;
    return fieldsFor(category, slot).length > 0
      ? `${capital(words)} is not set: choose ${typeWords(slot)}.`
      : `${category.name} has no ${typeWords(slot).substring(2)} for ${words}: add one, then choose it.`;
  }
  const def = firstOrNull(category.fields.filter((f) => f.id === id));
  if (def === null) return `The field chosen for ${words} no longer exists: choose another.`;
  if (def.archived) return `${def.name}, chosen for ${words}, was removed (archived): restore it or choose another.`;
  if (!types.includes(typeOf(def))) {
    return `${def.name}, chosen for ${words}, is now ${fieldTypeLabel[typeOf(def)]}; it needs to be ${typeWords(slot)}.`;
  }
  if (slot === 'rank' && def.type === 'select' && def.options.length < 2) {
    return `${def.name}, chosen for the rank, has fewer than two choices to rank by.`;
  }
  return null;
}

/** What stops a category being shown one way, in words: empty when nothing does. `view` is a KindView, or
 * `graphLabel` / `graphLinks`. */
export function missingFor(category: Category, view: KindView | 'graphLabel' | 'graphLinks'): string[] {
  const uses = category.uses;
  const timeline = obj(uses['timeline']);
  const map = obj(uses['map']);
  const ownership = obj(uses['ownership']);
  const found = (problems: (string | null)[]) => problems.filter((p): p is string => p !== null);
  switch (view) {
    case 'timeline':
      return found([
        slotProblem(category, 'timeline.start', timeline['start']),
        slotProblem(category, 'timeline.end', timeline['end'], true),
      ]);
    case 'map':
      return found([
        slotProblem(category, 'map.x', map['x']),
        slotProblem(category, 'map.y', map['y']),
        typeof map['x'] === 'string' && map['x'].length > 0 && map['x'] === map['y']
          ? 'The same field is chosen for across and up: choose two different fields.'
          : null,
      ]);
    case 'rank':
      return found([slotProblem(category, 'rank', uses['rank'])]);
    case 'ownership':
      return found([
        typeof ownership['type'] === 'string' && ownership['type'].length > 0
          ? null
          : 'No connection type is chosen as holding ' +
            `${/^[aeiou]/i.test(category.singular) ? 'an' : 'a'} ` +
            `${dartToLowerCase(category.singular)}: choose one, such as Owns.`,
        slotProblem(category, 'ownership.field', ownership['field'], true),
      ]);
    case 'graphLabel':
      return found([slotProblem(category, 'graphLabel', uses['graphLabel'], true)]);
    case 'graphLinks':
      return found(strings(uses['graphLinks']).map((id) => slotProblem(category, 'graphLinks', id)));
    default:
      return [];
  }
}

/** The views a category is set up for, and can be shown in now. */
export function readyViews(category: Category): KindView[] {
  return kindViews.filter((v) => missingFor(category, v).length === 0);
}
