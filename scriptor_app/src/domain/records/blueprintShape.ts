// NAMES ARE NOT LINKS: brings a system blueprint from the original app's earlier shape (ranks and table rows/columns
// linked by name) to the one linked by id. A port of upgradeBlueprintShape in
// flutter_app/lib/shared/domain/records/system.dart.
//
// It changes nothing else and drops nothing: a rank an item names that is not in the list is added; a cell whose names
// match no row or column keeps its old key; values that are not records pass through. Safe to run twice.

import { newId } from '../ids';
import { type JsonMap, isMap, listOf, mapOrNull, str } from '../json';

export function upgradeBlueprintShape(content: JsonMap, createId: () => string = newId): JsonMap {
  const named = (value: unknown): JsonMap[] => {
    const seen = new Set<string>();
    const out: JsonMap[] = [];
    for (const x of listOf(value)) {
      const name = (typeof x === 'string' ? x : str(mapOrNull(x)?.['name'])).trim();
      if (!name) continue;
      let id = typeof x === 'string' ? '' : str(mapOrNull(x)?.['id']);
      if (!id || seen.has(id)) id = createId();
      seen.add(id);
      // Whatever else a named thing holds, known to this version or not, is kept.
      out.push(typeof x === 'string' ? { id, name } : { ...(x as JsonMap), id, name });
    }
    return out;
  };

  const ranks = named(content['ranks']);
  const rankByName = new Map<string, string>(ranks.map((r) => [r['name'] as string, r['id'] as string]));
  const rankIds = new Set<string>(ranks.map((r) => r['id'] as string));

  const items = listOf(content['items']).map((raw) => {
    if (!isMap(raw)) return raw;
    const item: JsonMap = { ...raw };
    const rank = item['rank'];
    delete item['rank'];
    const current = item['rankId'];
    if (typeof current === 'string' && rankIds.has(current)) return item;
    const label = str(rank).trim();
    if (!label) return { ...item, rankId: null };
    if (!rankByName.has(label)) {
      const added = { id: createId(), name: label };
      ranks.push(added);
      rankByName.set(label, added.id);
      rankIds.add(added.id);
    }
    return { ...item, rankId: rankByName.get(label) };
  });

  const matrices = listOf(content['matrices']).map((raw) => {
    if (!isMap(raw)) return raw;
    const rows = named(raw['rows']);
    const columns = named(raw['columns']);
    const rowIds = new Set(rows.map((r) => r['id']));
    const columnIds = new Set(columns.map((c) => c['id']));
    const cells: JsonMap = {};
    for (const [key, value] of Object.entries(mapOrNull(raw['cells']) ?? {})) {
      // A value that is not text is kept under its own key.
      if (typeof value !== 'string') {
        cells[key] = value;
        continue;
      }
      const bar = key.indexOf('|');
      const a = bar < 0 ? '' : key.substring(0, bar);
      const b = key.substring(bar + 1);
      if (rowIds.has(a) && columnIds.has(b)) {
        cells[key] = value;
        continue;
      }
      // Keyed by names: the row whose name starts the key, and the column whose name is the rest.
      const rest = (r: JsonMap) => key.substring((r['name'] as string).length + 1);
      const row = rows.find((r) => key.startsWith(`${r['name']}|`) && columns.some((c) => c['name'] === rest(r)));
      const column = row ? columns.find((c) => c['name'] === rest(row)) : undefined;
      cells[row && column ? `${row['id']}|${column['id']}` : key] = value;
    }
    return { ...raw, rows, columns, cells };
  });

  return { ...content, ranks, items, matrices };
}
