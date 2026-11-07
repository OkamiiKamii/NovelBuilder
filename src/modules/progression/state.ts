import type { StoryNode } from '@/modules/manuscript/types';
import { storyOrder } from '@/modules/relationships/timeline';
import { computeSheet, type SheetItem, type SheetTrack } from '@/modules/systems/compute';
import { formatNumber } from '@/modules/systems/formula';
import type { SysItem, SysVariable, SystemBlueprint } from '@/modules/systems/types';
import { DIMENSION_LABELS, STATUS_DIMENSIONS, emptySystem, type GearItem, type ProgressSnapshot, type SnapshotSystem, type StatusDimension } from './types';

/** Snapshots of one entry in story order: "before the story" first, then by chapter; within a chapter, in the order they were logged. */
export function inStoryOrder(snapshots: ProgressSnapshot[], nodes: StoryNode[], entryId: string): ProgressSnapshot[] {
  const { position } = storyOrder(nodes);
  // A snapshot whose chapter was deleted is kept, after everything that still has a place.
  const at = (s: ProgressSnapshot) => (s.nodeId === null ? -1 : (position.get(s.nodeId) ?? Number.MAX_SAFE_INTEGER));
  return snapshots.filter((s) => s.entryId === entryId).sort((a, b) => at(a) - at(b) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/**
 * The state valid at a point in the manuscript: the latest snapshot at or
 * before that chapter or scene. `nodeId` null asks for the end of the story.
 * Returns null when nothing has been logged by then.
 */
export function stateAt(snapshots: ProgressSnapshot[], nodes: StoryNode[], entryId: string, nodeId: string | null): ProgressSnapshot | null {
  const { position } = storyOrder(nodes);
  const ordered = inStoryOrder(snapshots, nodes, entryId).filter((s) => s.nodeId === null || position.has(s.nodeId));
  if (nodeId === null) return ordered.at(-1) ?? null;
  const limit = position.get(nodeId);
  if (limit === undefined) return null;
  return ordered.filter((s) => s.nodeId === null || position.get(s.nodeId)! <= limit).at(-1) ?? null;
}

/** "Before the story", "Chapter 12", or what became of it. */
export const placeOf = (snapshot: Pick<ProgressSnapshot, 'nodeId'>, nodes: StoryNode[]): string =>
  snapshot.nodeId === null ? 'Before the story' : (nodes.find((n) => n.id === snapshot.nodeId)?.title ?? 'A chapter that was removed');

export interface StateRow {
  variable: SysVariable;
  value: number | string | null;
  display: string;
  /** The author set this by hand. */
  byHand: boolean;
  /** What the system works out, when the author's value differs from it. */
  systemSays: string | null;
  sources: string[];
  error: string | null;
}

export interface SystemState {
  system: SystemBlueprint;
  auto: boolean;
  rows: StateRow[];
  tracks: SheetTrack[];
  items: SheetItem[];
  /** With the calculator on: things not held whose requirement is now met. */
  available: SysItem[];
}

const show = (variable: SysVariable, value: number | string | null): string => (value === null || value === '' ? '—' : `${typeof value === 'number' ? formatNumber(value) : value}${variable.unit && typeof value === 'number' ? ` ${variable.unit}` : ''}`);

/**
 * AUTHOR PRIMACY & MANUAL OVERRIDE RULE
 * Works out what a snapshot says about one system.
 *
 * With the calculator on, the blueprint's formulas and class effects are
 * applied, and any value the author set by hand replaces the worked-out one
 * (and is what other formulas then read). With it off, nothing is worked
 * out at all: every value is exactly what the author entered.
 */
export function resolveSystem(system: SystemBlueprint, snapshot: SnapshotSystem = emptySystem()): SystemState {
  const profile = { values: snapshot.values, progress: snapshot.progress, itemIds: snapshot.itemIds };
  const plain = computeSheet(system, profile);
  const set = (variable: SysVariable): number | string | undefined => {
    const value = snapshot.overrides[variable.id];
    return variable.kind === 'choice' ? (typeof value === 'string' ? value : undefined) : typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  if (!snapshot.auto) {
    const rows = system.variables.map((variable): StateRow => {
      const own = snapshot.values[variable.id];
      const value = set(variable) ?? (variable.kind === 'derived' ? null : variable.kind === 'choice' ? (typeof own === 'string' ? own : (variable.options[0] ?? '')) : typeof own === 'number' ? own : variable.base);
      return { variable, value, display: show(variable, value), byHand: true, systemSays: null, sources: [], error: null };
    });
    return { system, auto: false, rows, tracks: plain.tracks.map((t) => ({ ...t, unmet: [], error: null })), items: plain.items.map((i) => ({ ...i, unmet: [], effects: [], error: null })), available: [] };
  }
  const worked = computeSheet(system, { ...profile, overrides: snapshot.overrides });
  const rows = worked.rows.map((row, i): StateRow => {
    const byHand = set(row.variable) !== undefined;
    return { variable: row.variable, value: row.value, display: row.display, byHand, systemSays: byHand && plain.rows[i].display !== row.display ? plain.rows[i].display : null, sources: row.sources, error: byHand ? null : row.error };
  });
  return { system, auto: true, rows, tracks: worked.tracks, items: worked.items, available: worked.available };
}

/** Lines of a status field: one thing per line, blanks ignored. */
export const linesOf = (text: string): string[] => text.split('\n').map((line) => line.trim()).filter(Boolean);

export interface Comparison {
  stats: { system: string; name: string; from: string; to: string; delta: number | null }[];
  advancement: { system: string; name: string; from: string; to: string }[];
  gained: { group: string; name: string }[];
  lost: { group: string; name: string }[];
  gear: { change: 'gained' | 'lost' | 'changed'; name: string; detail: string }[];
  status: { dimension: StatusDimension; label: string; added: string[]; removed: string[] }[];
  /** Nothing differs between the two. */
  same: boolean;
}

const gearKey = (item: GearItem) => item.name.trim().toLowerCase();
const gearDetail = (item: GearItem) => [item.kind.trim(), item.note.trim()].filter(Boolean).join(' · ');

/**
 * What is different between two snapshots, read from `from` to `to`: stat
 * changes with their size, advancement, abilities and titles gained or lost,
 * gear that changed hands, and status lines that came or went.
 */
export function compare(from: ProgressSnapshot, to: ProgressSnapshot, systems: SystemBlueprint[]): Comparison {
  const result: Comparison = { stats: [], advancement: [], gained: [], lost: [], gear: [], status: [], same: true };
  for (const system of systems) {
    if (!from.systems[system.id] && !to.systems[system.id]) continue;
    const [a, b] = [resolveSystem(system, from.systems[system.id]), resolveSystem(system, to.systems[system.id])];
    a.rows.forEach((row, i) => {
      const next = b.rows[i];
      if (row.display === next.display) return;
      result.stats.push({ system: system.name, name: row.variable.name, from: row.display, to: next.display, delta: typeof row.value === 'number' && typeof next.value === 'number' ? next.value - row.value : null });
    });
    a.tracks.forEach((track, i) => {
      if (track.label !== b.tracks[i].label) result.advancement.push({ system: system.name, name: track.track.name, from: track.label, to: b.tracks[i].label });
    });
    const group = (item: SysItem) => system.groups.find((g) => g.id === item.groupId)?.name ?? system.name;
    const held = (state: typeof a) => new Set(state.items.map((i) => i.item.id));
    for (const { item } of b.items) if (!held(a).has(item.id)) result.gained.push({ group: group(item), name: item.name });
    for (const { item } of a.items) if (!held(b).has(item.id)) result.lost.push({ group: group(item), name: item.name });
  }
  const before = new Map(from.gear.map((g) => [gearKey(g), g]));
  const after = new Map(to.gear.map((g) => [gearKey(g), g]));
  for (const [key, item] of after) {
    const old = before.get(key);
    if (!old) result.gear.push({ change: 'gained', name: item.name, detail: gearDetail(item) });
    else if (gearDetail(old) !== gearDetail(item)) result.gear.push({ change: 'changed', name: item.name, detail: `${gearDetail(old) || 'no details'} → ${gearDetail(item) || 'no details'}` });
  }
  for (const [key, item] of before) if (!after.has(key)) result.gear.push({ change: 'lost', name: item.name, detail: gearDetail(item) });
  for (const dimension of STATUS_DIMENSIONS) {
    const [old, now] = [linesOf(from.status[dimension] ?? ''), linesOf(to.status[dimension] ?? '')];
    const lower = (lines: string[]) => new Set(lines.map((l) => l.toLowerCase()));
    const added = now.filter((line) => !lower(old).has(line.toLowerCase()));
    const removed = old.filter((line) => !lower(now).has(line.toLowerCase()));
    if (added.length || removed.length) result.status.push({ dimension, label: DIMENSION_LABELS[dimension], added, removed });
  }
  result.same = !(result.stats.length || result.advancement.length || result.gained.length || result.lost.length || result.gear.length || result.status.length);
  return result;
}
