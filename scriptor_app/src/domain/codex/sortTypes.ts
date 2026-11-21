// SORTING THE MERGED TYPES: a novel made before faction/species, item/artifact, power/rule and lore/history were
// separate has entries filed under the first of each pair. The author is shown each one (`entriesToSort`) and taps
// "keep" or "move" (or "keep all the rest"); nothing changes on its own. A decision is the entry's `typeSorted: true`.
// Moving rebinds values by field name; whatever has no home stays on the entry as its own field, never lost.

import { localeCompare } from '../collation';
import type { JsonMap } from '../json';
import { type Category, type FieldType, standIn, typePartners } from '../records/category';
import type { Entry } from '../records/entry';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { ChangeRefused, type CodexChanges } from './codexChanges';

/** The category an entry of `key` can move to: the newer built-in, or the author's own category of the same name that
 * stands in for it. Null when there is none (or it is archived). */
export function partnerOf(key: string, categories: Iterable<Category>): Category | null {
  const list = [...categories];
  const want = typePartners.get(key);
  if (want === undefined) return null;
  const found = list.find((c) => c.key === want) ?? standIn(want, list);
  return found === null || found.key === key || found.archived ? null : found;
}

export type SortChoice = { action: 'keep' | 'move'; label: string };
export type SortItem = { entry: Entry; from: Category; to: Category; choices: [SortChoice, SortChoice] };

/** Entries still in the first type of a pair and not yet decided, by name, each with its two choices. */
export function entriesToSort(entries: Iterable<Entry>, categories: Iterable<Category>): SortItem[] {
  const list = [...categories];
  const items: SortItem[] = [];
  for (const entry of entries) {
    if (entry.typeSorted || !typePartners.has(entry.category)) continue;
    const from = list.find((c) => c.key === entry.category);
    const to = partnerOf(entry.category, list);
    if (from === undefined || to === null) continue;
    items.push({
      entry,
      from,
      to,
      choices: [
        { action: 'keep', label: `Keep as ${from.singular}` },
        { action: 'move', label: `Move to ${to.name}` },
      ],
    });
  }
  return items.sort((a, b) => localeCompare(a.entry.name, b.entry.name));
}

/** "Stay": the entry is decided and left where it is. */
export function keepType(c: CodexChanges, entryId: string): void {
  c.putEntry(c.owned(entryId), { typeSorted: true });
}

/** "Keep all the rest": every one given is decided and left where it is. */
export function keepRest(c: CodexChanges, entryIds: readonly string[]): void {
  for (const id of entryIds) keepType(c, id);
}

const textual = (t: FieldType | null) => t === null || t === 'text' || t === 'longtext';
const named = (a: string, b: string) => dartToLowerCase(dartTrim(a)) === dartToLowerCase(dartTrim(b));

/** "Move": the entry changes to its partner type and is decided. Each value goes to the field of the same name there
 * when the new field can hold text of that kind; any other stays on the entry as a field of its own. */
export function moveType(c: CodexChanges, entryId: string): void {
  const to = partnerOf(c.owned(entryId).category, c.categories());
  if (to === null) throw new ChangeRefused('There is no type to move this entry to.');
  moveTypeTo(c, entryId, to);
}

/** The same move to any category; `marker` is the decision written on the entry (the merged-type sort by default). */
export function moveTypeTo(c: CodexChanges, entryId: string, to: Category, marker: JsonMap = { typeSorted: true }): void {
  const entry = c.owned(entryId);
  const from = c.category(entry.category);
  const oldDefs = new Map(from.fields.map((d) => [d.id, d]));
  const targets = to.fields.filter((d) => !d.archived);
  const taken = new Set<string>();
  const moved = entry.fields.map((f): JsonMap => {
    const oldDef = f.defId === null ? undefined : oldDefs.get(f.defId);
    const label = oldDef?.name ?? f.key;
    const def = targets.find((d) => !taken.has(d.id) && named(d.name, label));
    const oldType = oldDef !== undefined ? oldDef.type : f.type;
    if (def !== undefined && (textual(def.type) || def.type === oldType)) {
      taken.add(def.id);
      return { ...f.raw, key: def.name, type: def.raw['type'] ?? null, defId: def.id };
    }
    const { defId: _gone, ...own } = f.raw;
    // A name the new type has for a different kind of value would claim this one by name; keep them apart.
    const clash = def !== undefined || targets.some((d) => named(d.name, label));
    return { ...own, key: clash ? `${label} (from ${from.name})` : label };
  });
  c.putEntry(entry, { category: to.key, ...marker, fields: moved });
}
