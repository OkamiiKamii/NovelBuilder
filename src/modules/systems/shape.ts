import { createId } from '@/core/id';
import type { Named } from './types';

type Row = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Names stored as plain text by earlier versions become named things with ids; ones that already have ids keep them. */
function named(value: unknown): Named[] {
  const seen = new Set<string>();
  return list(value).flatMap((x) => {
    const name = (typeof x === 'string' ? x : text((x as Named | null)?.name)).trim();
    if (!name) return [];
    let id = typeof x === 'string' ? '' : text((x as Named).id);
    if (!id || seen.has(id)) id = createId();
    seen.add(id);
    // Whatever else a named thing holds, known to this version or not, is kept.
    return [typeof x === 'string' ? { id, name } : { ...(x as Named), id, name }];
  });
}

/**
 * NAMES ARE NOT LINKS
 * Brings a blueprint's ranks and tables to the shape where they are linked
 * by id: ranks and the rows and columns of tables have ids, an item names
 * its rank by `rankId`, and a cell is keyed `rowId|columnId`. Earlier
 * versions linked them by their names, so renaming one cut it loose.
 *
 * It changes nothing else and drops nothing: a rank an item names that is
 * not in the list is added to it, and a cell whose names match no row or
 * column keeps its old key. Safe to run on a blueprint already in shape.
 */
export function upgradeShape<T extends Row>(content: T): T {
  const ranks = named(content.ranks);
  const rankByName = new Map(ranks.map((r) => [r.name, r.id]));
  const rankIds = new Set(ranks.map((r) => r.id));
  const isRow = (x: unknown): x is Row => typeof x === 'object' && x !== null && !Array.isArray(x);
  // Anything that is not a record is passed through untouched: it is not this function's to judge or drop.
  const items = list(content.items).map((raw) => {
    if (!isRow(raw)) return raw;
    const { rank, ...item } = raw as Row & { rank?: unknown; rankId?: unknown };
    if (typeof item.rankId === 'string' && rankIds.has(item.rankId)) return item;
    const label = text(rank).trim();
    if (!label) return { ...item, rankId: null };
    if (!rankByName.has(label)) {
      const added = { id: createId(), name: label };
      ranks.push(added);
      rankByName.set(label, added.id);
      rankIds.add(added.id);
    }
    return { ...item, rankId: rankByName.get(label)! };
  });
  const matrices = list(content.matrices).map((raw) => {
    if (!isRow(raw)) return raw;
    const m = raw;
    const rows = named(m.rows);
    const columns = named(m.columns);
    const rowIds = new Set(rows.map((r) => r.id));
    const columnIds = new Set(columns.map((c) => c.id));
    const cells: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(m.cells && typeof m.cells === 'object' ? (m.cells as Record<string, unknown>) : {})) {
      // A value that is not text is kept under its own key; it is not this function's to drop.
      if (typeof value !== 'string') {
        cells[key] = value;
        continue;
      }
      const [a, b] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
      if (rowIds.has(a) && columnIds.has(b)) {
        cells[key] = value;
        continue;
      }
      // Keyed by names: the row whose name starts the key, and the column whose name is the rest.
      const row = rows.find((r) => key.startsWith(`${r.name}|`) && columns.some((c) => c.name === key.slice(r.name.length + 1)));
      const column = row && columns.find((c) => c.name === key.slice(row.name.length + 1));
      cells[row && column ? `${row.id}|${column.id}` : key] = value;
    }
    return { ...m, rows, columns, cells };
  });
  return { ...content, ranks, items, matrices };
}
