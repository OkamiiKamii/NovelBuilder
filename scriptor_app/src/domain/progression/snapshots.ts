// SNAPSHOTS (as in the original app): a character's whole state at one point in the story, complete in itself, so
// reading the state at a chapter never replays history. The reading parts of
// flutter_app/lib/shared/domain/progression/snapshots.dart that the genre modules' Ranks and Inventory tools use, and
// `trackLabel`: where a snapshot stands on a system's track, as computeSheet labels it ("12 of 100", or the stage's
// name), which depends only on the snapshot's progress, never on a formula. The rest (resolveSystem, comparisons,
// track changes) comes with the Systems phase.

import { jsNumber } from '../codex/fieldValues';
import { localeCompare } from '../exchange/collation';
import { type JsonMap, idOrNull, mapOrNull, numOrNull, str } from '../json';
import { StoryOrder } from '../model/storyOrder';
import { stableSorted } from '../reader/stableSort';
import { JsonRecord, maps, strings } from '../records/jsonRecord';
import { type StoryNode } from '../records/storyNode';
import { type SysTrack } from '../records/system';
import { dartTrim } from '../text/dartString';

export const statusDimensions: readonly string[] = ['condition', 'transformations', 'reputation', 'knowledge', 'goals'];
export const dimensionLabels: Readonly<Record<string, string>> = {
  condition: 'Physical condition & injuries',
  transformations: 'Active transformations',
  reputation: 'Reputation & standing',
  knowledge: 'Knowledge & secrets known',
  goals: 'Personal goals',
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
