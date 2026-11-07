import { FIELD_LIMITS, FIELD_TYPE_LABELS, type Category, type FieldDef, type FieldType, type KindUses } from './types';

/**
 * WHAT A KIND OF RECORD CAN BE SHOWN AS
 * A category opts into a view by naming, explicitly, the fields that view
 * reads (`Category.uses`). Nothing is guessed from a field's name. Each
 * setting is checked against the field it names: whether the field still
 * exists, is not archived, and is of a type the view can read. What does not
 * suit is said in words, so the author knows what to set or add; the setting
 * itself is kept, so restoring or retyping the field brings it back.
 */

/** The ways a kind can be shown, beyond the table every kind has. */
export const KIND_VIEWS = ['timeline', 'map', 'rank', 'ownership'] as const;
export type KindView = (typeof KIND_VIEWS)[number];
export const KIND_VIEW_LABELS: Record<KindView, string> = { timeline: 'On a timeline', map: 'On a map', rank: 'By rank', ownership: 'By who holds it' };

/** Each place a setting names a field: what it is for, in words, and the field types that can fill it. */
export const SLOTS = {
  'timeline.start': { words: 'the date on the timeline', types: ['number', 'date'] },
  'timeline.end': { words: 'the end on the timeline', types: ['number', 'date'] },
  'map.x': { words: 'across on the map', types: ['number'] },
  'map.y': { words: 'up on the map', types: ['number'] },
  rank: { words: 'the rank', types: ['number', 'select'] },
  'ownership.field': { words: 'who holds it now', types: ['reference'] },
  graphLabel: { words: 'the label in the knowledge graph', types: ['text', 'number', 'select', 'date'] },
  graphLinks: { words: 'a connection drawn in the knowledge graph', types: ['reference', 'references'] },
} satisfies Record<string, { words: string; types: FieldType[] }>;
export type Slot = keyof typeof SLOTS;

/** "a Number or Date field". */
export const typeWords = (slot: Slot): string => `a ${(SLOTS[slot].types as FieldType[]).map((t) => FIELD_TYPE_LABELS[t]).join(' or ')} field`;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The fields of a category that can fill a slot: not archived, and of a type it takes. */
export const fieldsFor = (category: Pick<Category, 'fields'>, slot: Slot): FieldDef[] => category.fields.filter((f) => !f.archived && (SLOTS[slot].types as FieldType[]).includes(f.type));

/** The field a slot names, when it can be read: present, not archived, of a type the slot takes. */
export function fieldOf(category: Pick<Category, 'fields'>, slot: Slot, id: string | undefined): FieldDef | null {
  const def = id ? category.fields.find((f) => f.id === id) : undefined;
  return def && !def.archived && (SLOTS[slot].types as FieldType[]).includes(def.type) ? def : null;
}

/** Why a slot cannot be read, or null when it can. `optional` slots say nothing when unset. */
function slotProblem(category: Pick<Category, 'name' | 'fields'>, slot: Slot, id: string | undefined, optional = false): string | null {
  const { words } = SLOTS[slot];
  if (!id) {
    if (optional) return null;
    return fieldsFor(category, slot).length ? `${capital(words)} is not set: choose ${typeWords(slot)}.` : `${category.name} has no ${typeWords(slot).slice(2)} for ${words}: add one, then choose it.`;
  }
  const def = category.fields.find((f) => f.id === id);
  if (!def) return `The field chosen for ${words} no longer exists: choose another.`;
  if (def.archived) return `${def.name}, chosen for ${words}, was removed (archived): restore it or choose another.`;
  if (!(SLOTS[slot].types as FieldType[]).includes(def.type)) return `${def.name}, chosen for ${words}, is now ${FIELD_TYPE_LABELS[def.type]}; it needs to be ${typeWords(slot)}.`;
  if (slot === 'rank' && def.type === 'select' && def.options.length < 2) return `${def.name}, chosen for the rank, has fewer than two choices to rank by.`;
  return null;
}

/** What stops a category being shown one way, in words: empty when nothing does. */
export function missingFor(category: Pick<Category, 'name' | 'singular' | 'fields' | 'uses'>, view: KindView | 'graphLabel' | 'graphLinks'): string[] {
  const uses = category.uses ?? {};
  const found = (...problems: (string | null)[]) => problems.filter((p): p is string => p !== null);
  switch (view) {
    case 'timeline':
      return found(slotProblem(category, 'timeline.start', uses.timeline?.start), slotProblem(category, 'timeline.end', uses.timeline?.end, true));
    case 'map':
      return found(slotProblem(category, 'map.x', uses.map?.x), slotProblem(category, 'map.y', uses.map?.y), uses.map?.x && uses.map.x === uses.map.y ? 'The same field is chosen for across and up: choose two different fields.' : null);
    case 'rank':
      return found(slotProblem(category, 'rank', uses.rank));
    case 'ownership':
      return found(uses.ownership?.type ? null : `No connection type is chosen as holding ${/^[aeiou]/i.test(category.singular) ? 'an' : 'a'} ${category.singular.toLowerCase()}: choose one, such as Owns.`, slotProblem(category, 'ownership.field', uses.ownership?.field, true));
    case 'graphLabel':
      return found(slotProblem(category, 'graphLabel', uses.graphLabel, true));
    case 'graphLinks':
      return found(...(uses.graphLinks ?? []).map((id) => slotProblem(category, 'graphLinks', id)));
  }
}

/** The views a category is set up for, and can be shown in now. */
export const readyViews = (category: Pick<Category, 'name' | 'singular' | 'fields' | 'uses'>): KindView[] => KIND_VIEWS.filter((v) => missingFor(category, v).length === 0);

// ---------------------------------------------------------------------------------------------------- stored shape

const idIn = (value: unknown, ids: ReadonlySet<string>): string | undefined => (typeof value === 'string' && ids.has(value) ? value : undefined);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * Settings as stored: only the known ones, each naming a field the category
 * has (archived ones included, so restoring a field restores its setting).
 * Anything else is left out. Undefined when nothing is set.
 */
export function cleanUses(raw: unknown, fields: Pick<FieldDef, 'id'>[]): KindUses | undefined {
  const r = obj(raw);
  const ids = new Set(fields.map((f) => f.id));
  const out: KindUses = {};
  const part = <T extends object>(value: T) => (Object.values(value).some((v) => v !== undefined) ? (Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T) : undefined);
  const timeline = part({ start: idIn(obj(r.timeline).start, ids), end: idIn(obj(r.timeline).end, ids) });
  if (timeline) out.timeline = timeline;
  const map = part({ x: idIn(obj(r.map).x, ids), y: idIn(obj(r.map).y, ids) });
  if (map) out.map = map;
  const rank = idIn(r.rank, ids);
  if (rank) out.rank = rank;
  const holding = obj(r.ownership);
  const ownership = part({ type: typeof holding.type === 'string' && holding.type.trim() ? holding.type.trim().slice(0, FIELD_LIMITS.name) : undefined, field: idIn(holding.field, ids) });
  if (ownership) out.ownership = ownership;
  const graphLabel = idIn(r.graphLabel, ids);
  if (graphLabel) out.graphLabel = graphLabel;
  if (Array.isArray(r.graphLinks)) out.graphLinks = [...new Set(r.graphLinks.flatMap((v) => idIn(v, ids) ?? []))];
  if (r.tree === true) out.tree = true;
  return Object.keys(out).length ? out : undefined;
}

/** Settings with each field id swapped for the one it became (a template's field, as added to a novel). Ids with no match are left out. */
export function remapUses(uses: KindUses | undefined, idOf: (id: string) => string | undefined): KindUses | undefined {
  if (!uses) return undefined;
  const map = (id: string | undefined) => (id ? idOf(id) : undefined);
  return cleanUses(
    {
      timeline: { start: map(uses.timeline?.start), end: map(uses.timeline?.end) },
      map: { x: map(uses.map?.x), y: map(uses.map?.y) },
      rank: map(uses.rank),
      ownership: { type: uses.ownership?.type, field: map(uses.ownership?.field) },
      graphLabel: map(uses.graphLabel),
      graphLinks: uses.graphLinks?.flatMap((id) => map(id) ?? []),
      tree: uses.tree,
    },
    [...new Set([uses.timeline?.start, uses.timeline?.end, uses.map?.x, uses.map?.y, uses.rank, uses.ownership?.field, uses.graphLabel, ...(uses.graphLinks ?? [])].flatMap((id) => map(id) ?? []))].map((id) => ({ id })),
  );
}

/** Settings added to ones that exist, only where nothing is set yet: a template never changes what an author set. */
export function mergeUses(existing: KindUses | undefined, incoming: KindUses | undefined): KindUses | undefined {
  if (!incoming) return existing;
  const out: KindUses = { ...(existing ?? {}) };
  for (const key of Object.keys(incoming) as (keyof KindUses)[]) if (out[key] === undefined) (out as Record<string, unknown>)[key] = incoming[key];
  return Object.keys(out).length ? out : undefined;
}
