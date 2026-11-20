// Fictional systems (`systems`) and the sheets that put entries on them (`systemSheets`). A port of
// flutter_app/lib/shared/domain/records/system.dart. `upgradeBlueprintShape` was ported before, in ./blueprintShape.ts,
// and is re-exported from there.

import { type JsonMap, idOrNull, mapOrNull, numOrNull, str } from '../json';
import { foldText } from '../text/fold';
import { JsonRecord, firstOrNull, freezeMap, maps, strings } from './jsonRecord';

export { upgradeBlueprintShape } from './blueprintShape';

/** One class, skill, title, power… inside a blueprint. Everything except the name is optional; no RPG rules are
 * assumed. It is an ability record named `<systemId>/<itemId>`. */
export class SysItem {
  readonly raw: JsonMap;
  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  get id(): string {
    return str(this.raw['id']);
  }
  get groupId(): string {
    return str(this.raw['groupId']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  /** What it branches from or evolves out of, within the same blueprint. */
  get parentId(): string | null {
    return idOrNull(this.raw['parentId']);
  }
  /** One of the blueprint's ranks, by id, so renaming the rank keeps the item on it. */
  get rankId(): string | null {
    return idOrNull(this.raw['rankId']);
  }
  get description(): string {
    return str(this.raw['description']);
  }
  /** A condition: `Class: Void Mage AND level >= 50`. */
  get requires(): string {
    return str(this.raw['requires']);
  }
  get modifiers(): SysModifier[] {
    return maps(this.raw['modifiers']).map((m) => new SysModifier(m));
  }
  get costs(): SysCost[] {
    return maps(this.raw['costs']).map((c) => new SysCost(c));
  }
  get cooldown(): string {
    return str(this.raw['cooldown']);
  }
  /** Element, school, affinity, origin: whatever the author sorts by. */
  get affinity(): string {
    return str(this.raw['affinity']);
  }
  /** When and into what it evolves, in words or as a condition. */
  get evolution(): string {
    return str(this.raw['evolution']);
  }
}

/** What a held item does to a variable: adds to it, multiplies it, or sets it. The value is a number or a formula. */
export class SysModifier {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  /** Key of the variable it changes. */
  get target(): string {
    return str(this.raw['target']);
  }
  /** `add`, `multiply` or `set`. */
  get op(): string {
    return str(this.raw['op'], 'add');
  }
  get value(): string {
    return str(this.raw['value']);
  }
  /** The amount is the item's rank power (and `value` is ignored). */
  get byRank(): boolean {
    return this.raw['byRank'] === true;
  }
}

/** What using an item spends: an amount (a number or a formula) of a variable, by key. */
export class SysCost {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  get target(): string {
    return str(this.raw['target']);
  }
  get amount(): string {
    return str(this.raw['amount']);
  }
}

/** A named value: an attribute, a resource pool, a formula worked out from others, or one of a list of labels. */
export class SysVariable {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  /** How formulas refer to it. Stays the same when the name is changed, so formulas keep working. */
  get key(): string {
    return str(this.raw['key']);
  }
  /** `number` (an attribute), `resource`, `derived` (a formula) or `choice`. */
  get kind(): string {
    return str(this.raw['kind'], 'number');
  }
  get unit(): string {
    return str(this.raw['unit']);
  }
  get base(): number {
    return numOrNull(this.raw['base']) ?? 0;
  }
  get formula(): string {
    return str(this.raw['formula']);
  }
  get options(): string[] {
    return strings(this.raw['options']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
}

/** A step on a ladder of named stages: a realm, a rank, a tier. */
export class SysStage {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  /** A condition for reaching it: `qi >= 1000 AND Item: Foundation Pill`. */
  get requires(): string {
    return str(this.raw['requires']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
  /** What reaching it gives (items of the system, by id): "every new tier, a new power". A sheet at this stage or one
   * after it holds them, as given by the stage. */
  get grants(): string[] {
    return strings(this.raw['grants']);
  }
}

/** A way of advancing: numbered levels with a curve, or named stages in order. */
export class SysTrack {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get key(): string {
    return str(this.raw['key']);
  }
  /** `levels` or `stages`. */
  get kind(): 'levels' | 'stages' {
    return this.raw['kind'] === 'stages' ? 'stages' : 'levels';
  }
  /** Dart's `toInt()`: the fraction cut off. */
  get cap(): number {
    return Math.trunc(numOrNull(this.raw['cap']) ?? 0);
  }
  /** What it takes to go from one level to the next, as a formula of this track's key. */
  get curve(): string {
    return str(this.raw['curve']);
  }
  get curveUnit(): string {
    return str(this.raw['curveUnit']);
  }
  /** Points to place on attributes that each level after the first brings. */
  get points(): number {
    return numOrNull(this.raw['points']) ?? 0;
  }
  /** What experience comes from, in the author's words. Offered when logging; never enforced. */
  get sources(): string[] {
    return strings(this.raw['sources']);
  }
  get stages(): SysStage[] {
    return maps(this.raw['stages']).map((s) => new SysStage(s));
  }
}

/** A kind of thing a profile can hold: "Classes", "Skills", "Titles". `single`: one at a time (a class). */
export class SysGroup {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get single(): boolean {
    return this.raw['single'] === true;
  }
}

const named = (value: unknown): { id: string; name: string }[] =>
  maps(value).map((r) => ({ id: str(r['id']), name: str(r['name']) }));

/** A grid of free text: an elemental interaction chart, an affix table. Cells are keyed `rowId|columnId`. */
export class SysMatrix {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get rows(): { id: string; name: string }[] {
    return named(this.raw['rows']);
  }
  get columns(): { id: string; name: string }[] {
    return named(this.raw['columns']);
  }
  get cells(): Map<string, string> {
    const out = new Map<string, string>();
    for (const [key, value] of Object.entries(mapOrNull(this.raw['cells']) ?? {})) {
      if (typeof value === 'string') out.set(key, value);
    }
    return out;
  }
}

/** A fictional system: the author's own variables, tracks, ranks, groups ("Classes", "Mutations"…), items and
 * tables. */
export class SystemBlueprint extends JsonRecord {
  get name(): string {
    return str(this.raw['name']);
  }
  get groups(): { id: string; name: string }[] {
    return named(this.raw['groups']);
  }
  get ranks(): { id: string; name: string }[] {
    return named(this.raw['ranks']);
  }
  /** Ranks with their power: the number a boost "by rank" uses (Super Strength rank S, power 20, is ×20). */
  get rankList(): { id: string; name: string; power: number | null }[] {
    return maps(this.raw['ranks']).map((r) => ({ id: str(r['id']), name: str(r['name']), power: numOrNull(r['power']) }));
  }
  get items(): SysItem[] {
    return maps(this.raw['items']).map((i) => new SysItem(i));
  }
  get description(): string {
    return str(this.raw['description']);
  }
  get variables(): SysVariable[] {
    return maps(this.raw['variables']).map((v) => new SysVariable(v));
  }
  get tracks(): SysTrack[] {
    return maps(this.raw['tracks']).map((t) => new SysTrack(t));
  }
  get groupList(): SysGroup[] {
    return maps(this.raw['groups']).map((g) => new SysGroup(g));
  }
  get matrices(): SysMatrix[] {
    return maps(this.raw['matrices']).map((m) => new SysMatrix(m));
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  /** Set aside: hidden from characters and checks, nothing deleted. Stored as `off: true`; absent reads as on. */
  get off(): boolean {
    return this.raw['off'] === true;
  }

  /** The name of an item's rank as it is now; empty when it has none. */
  rankName(item: SysItem): string {
    const rankId = item.rankId;
    return rankId === null ? '' : (firstOrNull(this.ranks.filter((r) => r.id === rankId))?.name ?? '');
  }

  /** The power of an item's rank; null when it has no rank or its rank has no power. */
  rankPower(item: SysItem): number | null {
    return this.rankList.find((r) => r.id === item.rankId)?.power ?? null;
  }

  withFields(changes: JsonMap): SystemBlueprint {
    return new SystemBlueprint(this.merged(changes));
  }
}

/** Whether a system row (or blueprint) is on: only `off: true` turns it off. */
export const isSystemOn = (system: JsonMap | SystemBlueprint): boolean =>
  (system instanceof SystemBlueprint ? system.raw : system)['off'] !== true;

/** A sheet as it begins: `entryId` on the system `systemId`, with nothing of its own yet (every number read from the
 * blueprint), holding nothing. Made when a character is put on a system, by hand or as they are created. */
export function blankSheet(args: {
  id: string;
  projectId: string;
  systemId: string;
  entryId: string;
  now: number;
}): JsonMap {
  return {
    id: args.id,
    projectId: args.projectId,
    systemId: args.systemId,
    entryId: args.entryId,
    values: {},
    progress: {},
    itemIds: [],
    xp: [],
    spent: {},
    note: '',
    createdAt: args.now,
    updatedAt: args.now,
  };
}

function numbersOrLabels(value: unknown): Map<string, string | number> {
  const out = new Map<string, string | number>();
  for (const [key, v] of Object.entries(mapOrNull(value) ?? {})) {
    if (typeof v === 'string') out.set(key, v);
    else if (typeof v === 'number' && Number.isFinite(v)) out.set(key, v);
  }
  return out;
}

/** A codex entry's place in a system: its own values, progress, and the items it holds (by id). */
export class SystemSheet extends JsonRecord {
  get systemId(): string {
    return str(this.raw['systemId']);
  }
  get entryId(): string {
    return str(this.raw['entryId']);
  }
  get itemIds(): string[] {
    return strings(this.raw['itemIds']);
  }
  /** Held items switched off: still held and listed, but their modifiers do nothing. Absent reads as none. */
  get offIds(): string[] {
    return strings(this.raw['offIds']);
  }
  /** This entry's own value for a variable, by variable id: a number or a label. */
  get values(): Map<string, string | number> {
    return numbersOrLabels(this.raw['values']);
  }
  /** Where it stands on each track, by track id: a level number, or a stage id. */
  get progress(): Map<string, string | number> {
    return numbersOrLabels(this.raw['progress']);
  }
  /** Experience logged against numbered-level tracks. */
  get xp(): XpEntry[] {
    return maps(this.raw['xp']).map((e) => new XpEntry(e));
  }
  /** Points placed on attributes, by variable id. */
  get spent(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [key, v] of Object.entries(mapOrNull(this.raw['spent']) ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) out.set(key, v);
    }
    return out;
  }
  get note(): string {
    return str(this.raw['note']);
  }
}

/** Experience gained (or lost) at a point in the story. */
export class XpEntry {
  constructor(readonly raw: JsonMap) {}
  get id(): string {
    return str(this.raw['id']);
  }
  get trackId(): string {
    return str(this.raw['trackId']);
  }
  /** Negative for a loss. NaN when it is not a number. */
  get amount(): number {
    return numOrNull(this.raw['amount']) ?? NaN;
  }
  get source(): string {
    return str(this.raw['source']);
  }
  /** The chapter or scene it was earned in. Null: before the story. */
  get nodeId(): string | null {
    return idOrNull(this.raw['nodeId']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
}

const ligatures: Record<string, string> = { ﬀ: 'ff', ﬁ: 'fi', ﬂ: 'fl', ﬃ: 'ffi', ﬄ: 'ffl', ﬅ: 'st', ﬆ: 'st' };

/** Turns a name into something a formula can use: "Max Health" becomes `max_health`. */
export function toFormulaKey(name: string): string {
  // As NFKD would: the common ligatures come apart.
  const key = foldText(
    name
      .split('')
      .map((c) => ligatures[c] ?? c)
      .join(''),
  )
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return key.length === 0 ? 'value' : key;
}
