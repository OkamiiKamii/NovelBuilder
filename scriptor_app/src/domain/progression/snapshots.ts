// SNAPSHOTS (as in the original app): a character's whole state at one point in the story, complete in itself, so
// reading the state at a chapter never replays history and editing one snapshot never alters another. A port of
// flutter_app/lib/shared/domain/progression/snapshots.dart: the snapshots and their reading, a snapshot worked out
// against its systems (`resolveSystem`), two compared, and the changes (log, edit, remove). And `trackLabel`: where a
// snapshot stands on a system's track, as computeSheet labels it ("12 of 100", or the stage's name), which depends only
// on the snapshot's progress, never on a formula (what the genre modules' Ranks tool reads).

import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { jsNumber } from '../codex/fieldValues';
import { localeCompare } from '../exchange/collation';
import { type JsonMap, idOrNull, listOf, mapOrNull, numOrNull, str } from '../json';
import { StoryOrder } from '../model/storyOrder';
import { stableSorted } from '../reader/stableSort';
import { JsonRecord, maps, strings } from '../records/jsonRecord';
import { StoryNode } from '../records/storyNode';
import { type SysItem, type SysTrack, type SysVariable, SystemBlueprint, SystemSheet } from '../records/system';
import { type SheetItem, type SheetTrack, SheetProfile, computeSheet, settle } from '../systems/compute';
import { formatNumber } from '../systems/formula';
import { dartToLowerCase, dartTrim } from '../text/dartString';

export const statusDimensions: readonly string[] = ['condition', 'transformations', 'reputation', 'knowledge', 'goals'];
export const dimensionLabels: Readonly<Record<string, string>> = {
  condition: 'Physical condition & injuries',
  transformations: 'Active transformations',
  reputation: 'Reputation & standing',
  knowledge: 'Knowledge & secrets known',
  goals: 'Personal goals',
};

/** What each status line could say, as the fields' hints. */
export const dimensionHints: Readonly<Record<string, string>> = {
  condition: 'Broken left arm\nExhausted',
  transformations: 'Wolf form (until dawn)',
  reputation: 'Ash Guild: trusted\nThe Crown: wanted',
  knowledge: 'Knows the prince is alive',
  goals: 'Find her brother',
};

/** How gear is held: only suggestions. */
export const gearKinds: readonly string[] = ['Equipped', 'Weapon', 'Bound artifact', 'Key item', 'Carried'];

function numbersOrLabels(value: unknown): Map<string, string | number> {
  const out = new Map<string, string | number>();
  for (const [k, v] of Object.entries(mapOrNull(value) ?? {})) {
    if (typeof v === 'string') out.set(k, v);
    else if (typeof v === 'number' && Number.isFinite(v)) out.set(k, v);
  }
  return out;
}

/** A character's standing in one system at one point. */
export class SnapshotSystem {
  constructor(readonly raw: JsonMap) {}
  get auto(): boolean {
    return this.raw['auto'] !== false;
  }
  get values(): Map<string, string | number> {
    return numbersOrLabels(this.raw['values']);
  }
  get progress(): Map<string, string | number> {
    return numbersOrLabels(this.raw['progress']);
  }
  get itemIds(): string[] {
    return strings(this.raw['itemIds']);
  }
  get overrides(): Map<string, string | number> {
    return numbersOrLabels(this.raw['overrides']);
  }
}

/** Something the character has at this point. May point at an item in the codex; never changes it. */
export class GearItem {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get kind(): string {
    return str(this.raw['kind']);
  }
  get entryId(): string | null {
    return idOrNull(this.raw['entryId']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
}

export class ProgressSnapshot extends JsonRecord {
  get entryId(): string {
    return str(this.raw['entryId']);
  }
  /** The chapter or scene it is true from. Null: before the story begins. */
  get nodeId(): string | null {
    return idOrNull(this.raw['nodeId']);
  }
  get label(): string {
    return str(this.raw['label']);
  }
  get systems(): Map<string, SnapshotSystem> {
    const out = new Map<string, SnapshotSystem>();
    for (const [k, v] of Object.entries(mapOrNull(this.raw['systems']) ?? {})) {
      const m = mapOrNull(v);
      if (m !== null) out.set(k, new SnapshotSystem(m));
    }
    return out;
  }
  get gear(): GearItem[] {
    return maps(this.raw['gear']).map((g) => new GearItem(g));
  }
  status(dimension: string): string {
    return str(mapOrNull(this.raw['status'])?.[dimension]);
  }
  get notes(): string {
    return str(this.raw['notes']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
}

const compareNum = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);

/** Snapshots of one entry in story order: "before the story" first, then by chapter; within a chapter, in the order
 * they were logged. One whose chapter was deleted is kept, after everything that still has a place. */
export function inStoryOrder(snapshots: readonly ProgressSnapshot[], nodes: readonly StoryNode[], entryId: string): ProgressSnapshot[] {
  const position = StoryOrder.of(nodes).position;
  const at = (s: ProgressSnapshot) => (s.nodeId === null ? -1 : (position.get(s.nodeId) ?? 9007199254740991));
  return stableSorted(
    snapshots.filter((s) => s.entryId === entryId),
    (a, b) => {
      const p = compareNum(at(a), at(b));
      if (p !== 0) return p;
      const c = compareNum(a.createdAt, b.createdAt);
      return c !== 0 ? c : localeCompare(a.id, b.id);
    },
  );
}

/** The state valid at a point in the manuscript: the latest snapshot at or before that chapter or scene. `nodeId`
 * null asks for the end of the story. Null when nothing has been logged by then. */
export function stateAt(
  snapshots: readonly ProgressSnapshot[],
  nodes: readonly StoryNode[],
  entryId: string,
  nodeId: string | null,
): ProgressSnapshot | null {
  const position = StoryOrder.of(nodes).position;
  const ordered = inStoryOrder(snapshots, nodes, entryId).filter((s) => s.nodeId === null || position.has(s.nodeId));
  if (nodeId === null) return ordered[ordered.length - 1] ?? null;
  const limit = position.get(nodeId);
  if (limit === undefined) return null;
  const upTo = ordered.filter((s) => s.nodeId === null || position.get(s.nodeId)! <= limit);
  return upTo[upTo.length - 1] ?? null;
}

/** "Before the story", the chapter's title, or what became of it. */
export function placeOfSnapshot(s: ProgressSnapshot, nodes: readonly StoryNode[]): string {
  return s.nodeId === null ? 'Before the story' : (nodes.find((n) => n.id === s.nodeId)?.title ?? 'A chapter that was removed');
}

/** compute.dart's `_numberOf`: a number, or a number written as text. */
function numberOf(raw: unknown): number | null {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return jsNumber(dartTrim(raw));
  return null;
}

/** Where a snapshot's progress stands on `track`, as computeSheet labels it: a level ("12", "12 of 100" with a cap;
 * none given reads as 1) or the stage reached ("No stages yet" when the track has none). */
export function trackLabel(track: SysTrack, progress: ReadonlyMap<string, string | number>): string {
  const raw = progress.get(track.id);
  if (track.kind === 'levels') {
    const n = numberOf(raw);
    const given = n === null || Number.isNaN(n) || n === 0 ? 1 : Math.floor(n + 0.5);
    const capped = track.cap > 0 ? Math.min(track.cap, given) : given;
    const reached = Math.trunc(Math.max(1, capped));
    return `${reached}${track.cap > 0 ? ` of ${track.cap}` : ''}`;
  }
  const stages = track.stages;
  const at = Math.max(0, stages.findIndex((s) => s.id === raw));
  return at < stages.length ? stages[at].name : 'No stages yet';
}

// ---------------------------------------------------------------------------------------------------- worked out

export class StateRow {
  constructor(
    readonly variable: SysVariable,
    readonly value: number | string | null,
    readonly display: string,
    /** The author set this by hand. */
    readonly byHand: boolean,
    /** What the system works out, when the author's value differs from it. */
    readonly systemSays: string | null,
    readonly sources: string[],
    readonly error: string | null,
  ) {}
}

export class SystemState {
  constructor(
    readonly system: SystemBlueprint,
    readonly auto: boolean,
    readonly rows: StateRow[],
    readonly tracks: SheetTrack[],
    readonly items: SheetItem[],
    /** With the calculator on: things not held whose requirement is now met. */
    readonly available: SysItem[],
  ) {}
}

/** compute.dart's `SheetTrack.plain()`: the label and level as they are, nothing unmet, no error. */
const plainTrack = (t: SheetTrack): SheetTrack => ({ ...t, unmet: [], error: null });
/** compute.dart's `SheetItem.plain()`: the item as it is, nothing unmet, no effects, no error. */
const plainItem = (i: SheetItem): SheetItem => ({ ...i, unmet: [], effects: [], error: null });

function show(variable: SysVariable, value: number | string | null): string {
  if (value === null || value === '') return '—';
  const isNumber = typeof value === 'number';
  return `${isNumber ? formatNumber(value) : value}${variable.unit.length > 0 && isNumber ? ` ${variable.unit}` : ''}`;
}

/** AUTHOR PRIMACY & MANUAL OVERRIDE RULE: works out what a snapshot says about one system. With the calculator on, the
 * blueprint's formulas and class effects are applied, and any value the author set by hand replaces the worked-out
 * one (and is what other formulas then read). With it off, nothing is worked out: every value is what the author
 * entered. */
export function resolveSystem(system: SystemBlueprint, snapshot?: SnapshotSystem | null): SystemState {
  const snap = snapshot ?? new SnapshotSystem({});
  const profile = new SheetProfile({ values: snap.values, progress: snap.progress, itemIds: snap.itemIds });
  const plain = computeSheet(system, profile);
  const overrides = snap.overrides;
  const set = (v: SysVariable): number | string | null => {
    const value = overrides.get(v.id);
    if (v.kind === 'choice') return typeof value === 'string' ? value : null;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  if (!snap.auto) {
    const rows = system.variables.map((v) => {
      const own = snap.values.get(v.id);
      const value =
        set(v) ??
        (v.kind === 'derived'
          ? null
          : v.kind === 'choice'
            ? typeof own === 'string'
              ? own
              : (v.options[0] ?? '')
            : typeof own === 'number'
              ? own
              : v.base);
      return new StateRow(v, value, show(v, value), true, null, [], null);
    });
    return new SystemState(system, false, rows, plain.tracks.map(plainTrack), plain.items.map(plainItem), []);
  }
  const worked = computeSheet(
    system,
    new SheetProfile({ values: snap.values, progress: snap.progress, itemIds: snap.itemIds, overrides }),
  );
  const rows = worked.rows.map((row, i) => {
    const byHand = set(row.variable) !== null;
    return new StateRow(
      row.variable,
      row.value,
      row.display,
      byHand,
      byHand && plain.rows[i].display !== row.display ? plain.rows[i].display : null,
      row.sources,
      byHand ? null : row.error,
    );
  });
  return new SystemState(system, true, rows, worked.tracks, worked.items, worked.available);
}

/** Lines of a status field: one thing per line, blanks ignored. */
export function linesOf(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => dartTrim(line).length > 0)
    .map((line) => dartTrim(line));
}

export class Comparison {
  readonly stats: { system: string; name: string; from: string; to: string; delta: number | null }[] = [];
  readonly advancement: { system: string; name: string; from: string; to: string }[] = [];
  readonly gained: { group: string; name: string }[] = [];
  readonly lost: { group: string; name: string }[] = [];
  readonly gear: { change: string; name: string; detail: string }[] = [];
  readonly status: { dimension: string; label: string; added: string[]; removed: string[] }[] = [];

  /** Nothing differs between the two. */
  get same(): boolean {
    return (
      this.stats.length === 0 &&
      this.advancement.length === 0 &&
      this.gained.length === 0 &&
      this.lost.length === 0 &&
      this.gear.length === 0 &&
      this.status.length === 0
    );
  }
}

const gearKey = (g: GearItem): string => dartToLowerCase(dartTrim(g.name));
const gearDetail = (g: GearItem): string => [dartTrim(g.kind), dartTrim(g.note)].filter((x) => x.length > 0).join(' · ');

/** What is different between two snapshots, read from `from` to `to`: stat changes with their size, advancement,
 * abilities and titles gained or lost, gear that changed hands, and status lines that came or went. */
export function compareSnapshots(
  from: ProgressSnapshot,
  to: ProgressSnapshot,
  systems: readonly SystemBlueprint[],
): Comparison {
  const result = new Comparison();
  const fromSystems = from.systems;
  const toSystems = to.systems;
  for (const system of systems) {
    if (!fromSystems.has(system.id) && !toSystems.has(system.id)) continue;
    const a = resolveSystem(system, fromSystems.get(system.id));
    const b = resolveSystem(system, toSystems.get(system.id));
    a.rows.forEach((row, i) => {
      const next = b.rows[i];
      if (row.display === next.display) return;
      result.stats.push({
        system: system.name,
        name: row.variable.name,
        from: row.display,
        to: next.display,
        delta: typeof row.value === 'number' && typeof next.value === 'number' ? next.value - row.value : null,
      });
    });
    a.tracks.forEach((t, i) => {
      if (t.label !== b.tracks[i].label) {
        result.advancement.push({ system: system.name, name: t.track.name, from: t.label, to: b.tracks[i].label });
      }
    });
    const groups = system.groupList;
    const group = (item: SysItem) => groups.find((g) => g.id === item.groupId)?.name ?? system.name;
    const heldA = new Set(a.items.map((i) => i.item.id));
    const heldB = new Set(b.items.map((i) => i.item.id));
    for (const i of b.items) if (!heldA.has(i.item.id)) result.gained.push({ group: group(i.item), name: i.item.name });
    for (const i of a.items) if (!heldB.has(i.item.id)) result.lost.push({ group: group(i.item), name: i.item.name });
  }
  const before = new Map(from.gear.map((g) => [gearKey(g), g]));
  const after = new Map(to.gear.map((g) => [gearKey(g), g]));
  for (const [key, item] of after) {
    const old = before.get(key);
    if (old === undefined) {
      result.gear.push({ change: 'gained', name: item.name, detail: gearDetail(item) });
    } else if (gearDetail(old) !== gearDetail(item)) {
      const was = gearDetail(old).length === 0 ? 'no details' : gearDetail(old);
      const now = gearDetail(item).length === 0 ? 'no details' : gearDetail(item);
      result.gear.push({ change: 'changed', name: item.name, detail: `${was} → ${now}` });
    }
  }
  for (const [key, item] of before) {
    if (!after.has(key)) result.gear.push({ change: 'lost', name: item.name, detail: gearDetail(item) });
  }
  for (const d of statusDimensions) {
    const old = linesOf(from.status(d));
    const now = linesOf(to.status(d));
    const lowerOf = (lines: string[]) => new Set(lines.map((l) => dartToLowerCase(l)));
    const added = now.filter((l) => !lowerOf(old).has(dartToLowerCase(l)));
    const removed = old.filter((l) => !lowerOf(now).has(dartToLowerCase(l)));
    if (added.length > 0 || removed.length > 0) {
      result.status.push({ dimension: d, label: dimensionLabels[d], added, removed });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------- changes

const plainObject = (m: ReadonlyMap<string, unknown>): JsonMap => Object.fromEntries(m);

/** Snapshots: logged, changed one at a time, removed. Nothing about their contents is judged. */
export class SnapshotChanges extends RecordChanges {
  snapshots(): ProgressSnapshot[] {
    return this.rows('progressSnapshots').map((r) => new ProgressSnapshot(r));
  }

  private get nodes(): StoryNode[] {
    return this.rows('chapters').map((r) => new StoryNode(r));
  }

  private mine(collection: string, id: unknown): string | null {
    return typeof id === 'string' && id.length > 0 && this.row(collection, id) !== null ? id : null;
  }

  private record(value: unknown): JsonMap {
    const out: JsonMap = {};
    for (const [k, v] of Object.entries(mapOrNull(value) ?? {})) {
      if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
    }
    return out;
  }

  /** Keeps a snapshot well formed without judging its contents. */
  private clean(systems: unknown, gear: unknown, status: unknown): JsonMap {
    const outSystems: JsonMap = {};
    for (const [key, value] of Object.entries(mapOrNull(systems) ?? {})) {
      if (this.mine('systems', key) === null) continue;
      const raw = mapOrNull(value);
      if (raw === null) continue;
      outSystems[key] = {
        auto: raw['auto'] !== false,
        values: this.record(raw['values']),
        progress: this.record(raw['progress']),
        itemIds: [...new Set(listOf(raw['itemIds']).filter((id): id is string => typeof id === 'string'))],
        overrides: this.record(raw['overrides']),
      };
    }
    return {
      systems: outSystems,
      gear: maps(gear)
        .filter((g) => dartTrim(str(g['name'])).length > 0)
        .map((g) => ({
          id: str(g['id']).length > 0 ? g['id'] : this.newId(),
          name: dartTrim(str(g['name'])),
          kind: dartTrim(str(g['kind'])),
          entryId: this.mine('loreEntries', g['entryId']),
          note: str(g['note']),
        })),
      status: Object.fromEntries(statusDimensions.map((d) => [d, str(mapOrNull(status)?.[d])])),
    };
  }

  /** Logs a character's state at a chapter or scene (`nodeId` null: before the story). It starts as a copy of the
   * state valid at that point, so only what changed needs entering; with nothing logged yet, it starts from the
   * character's system sheets. */
  createSnapshot(entryId: string, args: { nodeId?: string | null; label?: string } = {}): ProgressSnapshot {
    if (this.mine('loreEntries', entryId) === null) throw new ChangeRefused('That codex entry is not in this novel.');
    const at = this.mine('chapters', args.nodeId ?? null);
    const nodes = this.nodes;
    const previous = stateAt(this.snapshots(), nodes, entryId, at);
    const position = StoryOrder.of(nodes).position;
    const limit = at === null ? -1 : (position.get(at) ?? 9007199254740991);
    const reached = (id: string | null) => id === null || (position.get(id) ?? 9007199254740991) <= limit;
    const blueprints = new Map(this.rows('systems').map((r) => [str(r['id']), new SystemBlueprint(r)]));
    const fromSheets: JsonMap = {};
    for (const r of this.rows('systemSheets')) {
      const sheet = new SystemSheet(r);
      if (sheet.entryId !== entryId) continue;
      const system = blueprints.get(sheet.systemId);
      if (system === undefined) continue;
      const settled = settle(system, SheetProfile.of(sheet), reached);
      const before = mapOrNull(mapOrNull(previous?.raw['systems'])?.[sheet.systemId]);
      // With an earlier snapshot, its numbers stand; only levels with experience logged move on.
      const levels: JsonMap = {};
      for (const t of system.tracks) {
        if (t.kind === 'levels' && sheet.xp.some((e) => e.trackId === t.id)) levels[t.id] = settled.progress.get(t.id) ?? null;
      }
      fromSheets[sheet.systemId] =
        before !== null
          ? { ...before, progress: { ...(mapOrNull(before['progress']) ?? {}), ...levels } }
          : {
              auto: true,
              values: plainObject(settled.values),
              progress: plainObject(settled.progress),
              itemIds: settled.itemIds,
              overrides: {},
            };
    }
    // The snapshot's id first, then its gear's, in the order the original makes them.
    const id = this.newId();
    const gear = previous === null ? [] : previous.gear.map((g) => ({ ...g.raw, id: this.newId() }));
    const saved: JsonMap = {
      id,
      projectId: this.projectId,
      entryId,
      nodeId: at,
      label: dartTrim(args.label ?? ''),
      // Systems the character has since been put on join in with their sheet as it stands.
      ...this.clean({ ...(mapOrNull(previous?.raw['systems']) ?? {}), ...fromSheets }, gear, previous?.raw['status'] ?? {}),
      notes: '',
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('progressSnapshots', saved);
    return new ProgressSnapshot(saved);
  }

  /** Changes one snapshot, worked out from it as stored right now. Other snapshots are never touched. */
  updateSnapshot(snapshotId: string, change: (current: ProgressSnapshot) => JsonMap): void {
    const row = this.row('progressSnapshots', snapshotId);
    if (row === null) throw new ChangeRefused('That snapshot is not in this novel.');
    const current = new ProgressSnapshot(row);
    const edit = change(current);
    const next = { ...current.raw, ...edit };
    this.put('progressSnapshots', {
      ...current.raw,
      nodeId: 'nodeId' in edit && edit['nodeId'] !== current.nodeId ? this.mine('chapters', edit['nodeId']) : current.nodeId,
      label: dartTrim(str(next['label'])),
      notes: str(next['notes']),
      ...this.clean(next['systems'], next['gear'], next['status']),
      updatedAt: this.now,
    });
  }

  removeSnapshot(snapshotId: string): void {
    if (this.row('progressSnapshots', snapshotId) === null) throw new ChangeRefused('That snapshot is not in this novel.');
    this.remove('progressSnapshots', snapshotId);
  }
}
