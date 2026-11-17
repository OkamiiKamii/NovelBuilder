// Works out everything a blueprint says about a profile: a port of flutter_app/lib/shared/domain/systems/compute.dart.
// Pure: it reads the blueprint and the profile and returns values; it stores nothing. A character sheet "inherits"
// from its blueprint this way: nothing is copied onto the character, so there is nothing to fall out of date.
//
// Numbers: the Dart works in doubles (a sheet's numbers are read as doubles, `records/system.dart`); JavaScript has
// one kind of number, so a "double" here is any finite or infinite number, and a label is a string. Every loop is
// counted (the Hermes lesson): the levels bought with experience stop at 100 000 levels, as the Dart's do.

import { jsNumber } from '../codex/fieldValues';
import { type SysGroup, type SysItem, type SysTrack, type SysVariable, type SystemBlueprint, type SystemSheet, XpEntry } from '../records/system';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type FNode, type FValue, type FormulaScope, FormulaError, evaluateFormula, formatNumber, jsRound, jsString, namesIn, parseFormula, unmet } from './formula';

const lower = (text: string): string => dartToLowerCase(dartTrim(text));

/** What a profile brings to a blueprint: its own values, where it stands on each track, what it holds, experience
 * logged, points placed, and values the author set by hand (which win over everything). With none, formulas are
 * checked against the blueprint's starting values. */
export class SheetProfile {
  readonly values: ReadonlyMap<string, string | number>;
  readonly progress: ReadonlyMap<string, string | number>;
  readonly itemIds: readonly string[];
  readonly xp: readonly XpEntry[];
  readonly spent: ReadonlyMap<string, number>;
  /** Values the author has set by hand, by variable id. Other formulas that read an overridden value read the
   * author's number. */
  readonly overrides: ReadonlyMap<string, unknown>;

  constructor(
    args: {
      values?: ReadonlyMap<string, string | number>;
      progress?: ReadonlyMap<string, string | number>;
      itemIds?: readonly string[];
      xp?: readonly XpEntry[];
      spent?: ReadonlyMap<string, number>;
      overrides?: ReadonlyMap<string, unknown>;
    } = {},
  ) {
    this.values = args.values ?? new Map();
    this.progress = args.progress ?? new Map();
    this.itemIds = args.itemIds ?? [];
    this.xp = args.xp ?? [];
    this.spent = args.spent ?? new Map();
    this.overrides = args.overrides ?? new Map();
  }

  static of(sheet: SystemSheet, xp?: readonly XpEntry[]): SheetProfile {
    return new SheetProfile({ values: sheet.values, progress: sheet.progress, itemIds: sheet.itemIds, xp: xp ?? sheet.xp, spent: sheet.spent });
  }

  withXp(xp: readonly XpEntry[]): SheetProfile {
    return new SheetProfile({ values: this.values, progress: this.progress, itemIds: this.itemIds, xp, spent: this.spent, overrides: this.overrides });
  }
}

export type SheetRow = {
  variable: SysVariable;
  /** A number, or the chosen label. Null when it could not be worked out. */
  value: number | string | null;
  display: string;
  /** Classes, skills and the like that changed this value. */
  sources: string[];
  error: string | null;
};

export type SheetXp = { total: number; into: number; needed: number | null; gained: number; progress: string };

export type SheetTrack = {
  track: SysTrack;
  /** "12 of 100", or the stage's name. */
  label: string;
  /** The level reached, for numbered levels. Null for named stages. */
  level: number | null;
  /** What comes next and what it takes. */
  next: string | null;
  /** For a named stage: parts of its requirement that are not met. */
  unmet: string[];
  /** For numbered levels with experience logged: what was earned and how far into the current level it reaches. */
  xp: SheetXp | null;
  error: string | null;
};

/** Points that levels have brought, and how many are placed on attributes. Never enforced. */
export type SheetPoints = { name: string; earned: number; spent: number; unspent: number };

export type SheetItem = {
  item: SysItem;
  group: SysGroup | null;
  requires: string;
  unmet: string[];
  costs: { label: string; error: string | null }[];
  effects: string[];
  error: string | null;
  /** The stage that gives it ("C Tier"), when it is held because the sheet reached that stage (and not chosen as
   * well); null for what the sheet holds of its own. */
  from: string | null;
};

export type ComputedSheet = {
  rows: SheetRow[];
  tracks: SheetTrack[];
  items: SheetItem[];
  /** Things not held whose stated requirement is now met. */
  available: SysItem[];
  /** Null when no track of the blueprint gives points and none are placed. */
  points: SheetPoints | null;
};

/** Whether a variable is one that points can be placed on. */
export function takesPoints(v: SysVariable): boolean {
  return v.kind === 'number' || v.kind === 'resource';
}

/** "Class: Mage" also finds the group called "Classes". */
export function groupNamed(g: SysGroup, wanted: string): boolean {
  const name = lower(g.name);
  return name === wanted || name === `${wanted}s` || name === `${wanted}es` || name.replace(/ies$/, 'y') === wanted;
}

function numberOf(raw: unknown): number | null {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return jsNumber(dartTrim(raw));
  return null;
}

const messageOf = (err: unknown): string => (err instanceof FormulaError ? err.message : 'This could not be worked out.');
const isNumber = (v: unknown): v is number => typeof v === 'number';
const lastOrNull = <T>(list: readonly T[]): T | null => (list.length === 0 ? null : list[list.length - 1]);

type Change = { item: SysItem; target: SysVariable; op: string; amount: number };

/** Works out everything a blueprint says about a profile. Order: levels from logged experience; starting values, the
 * profile's own numbers and the points placed on them; then what its classes, skills and so on add, multiply or
 * set; then formulas. */
export function computeSheet(system: SystemBlueprint, profile: SheetProfile = new SheetProfile()): ComputedSheet {
  const variables = system.variables;
  const tracks = system.tracks;
  const groups = system.groupList;
  const allItems = system.items;
  const byKey = new Map<string, SysVariable>();
  for (const v of variables) byKey.set(lower(v.key), v);
  // What the stages reached give ("every new tier, a new power"): held as given by the stage, the first stage that
  // gives each. A sheet with no stage chosen is at a track's first.
  const grantedBy = new Map<string, string>();
  for (const track of tracks) {
    if (track.kind !== 'stages' || track.stages.length === 0) continue;
    const at = Math.max(0, track.stages.findIndex((s) => s.id === profile.progress.get(track.id)));
    for (const s of track.stages.slice(0, at + 1)) {
      for (const id of s.grants) if (!grantedBy.has(id)) grantedBy.set(id, s.name);
    }
  }
  const holds = (itemId: string): boolean => profile.itemIds.includes(itemId) || grantedBy.has(itemId);
  const held = allItems.filter((item) => holds(item.id));
  const groupOf = (item: SysItem): SysGroup | null => groups.find((g) => g.id === item.groupId) ?? null;

  // Where the profile stands on each track.
  const level = new Map<string, number>();
  const stage = new Map<string, number>();
  for (const track of tracks) {
    const raw = profile.progress.get(track.id);
    if (track.kind === 'levels') {
      const n = numberOf(raw);
      const given = n === null || Number.isNaN(n) || n === 0 ? 1 : jsRound(n);
      const capped = track.cap > 0 ? Math.min(track.cap, given) : given;
      level.set(track.id, Math.trunc(Math.max(1, capped)));
    } else {
      level.set(track.id, 0);
      stage.set(track.id, Math.max(0, track.stages.findIndex((s) => s.id === raw)));
    }
  }

  const placed = (v: SysVariable): number => {
    const n = takesPoints(v) ? profile.spent.get(v.id) : undefined;
    return n !== undefined && Number.isFinite(n) ? n : 0;
  };

  const values = new Map<string, number | string>();
  const errors = new Map<string, string>();
  const sources = new Map<string, string[]>();
  for (const v of variables) {
    if (v.kind === 'derived') continue;
    const own = profile.values.get(v.id);
    if (v.kind === 'choice') {
      values.set(lower(v.key), typeof own === 'string' && v.options.includes(own) ? own : (v.options[0] ?? ''));
    } else {
      values.set(lower(v.key), (isNumber(own) && Number.isFinite(own) ? own : v.base) + placed(v));
    }
  }

  const computing = new Set<string>();
  const valueOf = (name: string): FValue | null => {
    const key = lower(name);
    const track = tracks.find((t) => lower(t.key) === key || lower(t.name) === key);
    // A stage ladder counts from 1, so `realm >= 3` means "third stage or beyond".
    if (track !== undefined) {
      return track.kind === 'levels' ? level.get(track.id)! : track.stages.length > 0 ? stage.get(track.id)! + 1 : 0;
    }
    const variable = byKey.get(key) ?? variables.find((v) => lower(v.name) === key);
    if (variable === undefined) return null;
    const id = lower(variable.key);
    if (values.has(id)) return values.get(id)!;
    if (errors.has(id)) throw new FormulaError(`“${variable.name}” could not be worked out.`);
    if (computing.has(id)) throw new FormulaError(`“${variable.name}” depends on itself.`);
    computing.add(id);
    try {
      const result = evaluateFormula(parseFormula(variable.formula), scope);
      values.set(id, typeof result === 'boolean' ? (result ? 1 : 0) : result);
      return values.get(id)!;
    } catch (err) {
      errors.set(id, err instanceof FormulaError ? err.message : 'This formula could not be worked out.');
      throw err;
    } finally {
      computing.delete(id);
    }
  };

  const scope: FormulaScope = {
    value: valueOf,
    holds: (groupName, name) => {
      const wanted = lower(groupName);
      const track = tracks.find((t) => t.kind === 'stages' && (lower(t.name) === wanted || lower(t.key) === wanted));
      if (track !== undefined) {
        const at = stage.get(track.id)!;
        const current = at < track.stages.length ? track.stages[at].name : '';
        return lower(current) === lower(name);
      }
      const group = groups.find((g) => groupNamed(g, wanted)) ?? null;
      const variable = variables.find((v) => v.kind === 'choice' && (lower(v.name) === wanted || lower(v.key) === wanted));
      if (variable !== undefined) {
        const v = values.get(lower(variable.key));
        return lower(v === undefined ? '' : jsString(v)) === lower(name);
      }
      if (group === null) return null;
      return held.some((item) => item.groupId === group.id && lower(item.name) === lower(name));
    },
  };
  const work = (formula: string): number => {
    const result = evaluateFormula(parseFormula(formula), scope);
    if (typeof result === 'string') throw new FormulaError(`“${formula}” gives a label, not a number.`);
    return typeof result === 'boolean' ? (result ? 1 : 0) : result;
  };

  // Levels bought with logged experience. Each level is paid for at the curve's price for that level, starting from
  // where the sheet says the character began.
  const forget = (): void => {
    for (const v of variables) {
      if (v.kind !== 'derived') continue;
      values.delete(lower(v.key));
      errors.delete(lower(v.key));
    }
  };

  const earned = new Map<string, SheetXp>();
  const curveErrors = new Map<string, string>();
  for (const track of tracks) {
    const mine = profile.xp.filter((e) => e.trackId === track.id && Number.isFinite(e.amount));
    if (track.kind !== 'levels' || mine.length === 0) continue;
    const start = level.get(track.id)!;
    const total = Math.max(0, mine.reduce((n, e) => n + e.amount, 0));
    let left = total;
    let needed: number | null = null;
    // Counted: at most 100 000 levels, as the Dart's own bound.
    while (dartTrim(track.curve).length > 0 && !(track.cap > 0 && level.get(track.id)! >= track.cap) && level.get(track.id)! - start < 100000) {
      // A curve may read formulas that read the level, so nothing worked out for the last level is reused.
      forget();
      try {
        needed = work(track.curve);
      } catch (err) {
        curveErrors.set(track.id, messageOf(err));
        needed = null;
        break;
      }
      // A curve that asks for nothing cannot be climbed by earning.
      if (!(needed > 0) || !Number.isFinite(needed)) {
        needed = null;
        break;
      }
      if (left < needed) break;
      left -= needed;
      level.set(track.id, level.get(track.id)! + 1);
      needed = null;
    }
    forget();
    const unit = track.curveUnit.length > 0 ? ` ${track.curveUnit}` : '';
    earned.set(track.id, {
      total,
      into: left,
      needed,
      gained: level.get(track.id)! - start,
      progress: needed === null ? `${formatNumber(total)}${unit} earned` : `${formatNumber(left)} of ${formatNumber(needed)}${unit} to the next`,
    });
  }

  // What classes, skills and the like change. Their amounts are worked out from the values before any of them apply.
  const changes: Change[] = [];
  const itemErrors = new Map<string, string>();
  for (const item of held) {
    for (const modifier of item.modifiers) {
      const target = byKey.get(lower(modifier.target));
      if (target === undefined || target.kind === 'choice') continue;
      try {
        changes.push({ item, target, op: modifier.op, amount: work(modifier.value) });
      } catch (err) {
        itemErrors.set(item.id, messageOf(err));
      }
    }
  }
  const apply = (variable: SysVariable): void => {
    const mine = changes.filter((c) => c.target.id === variable.id);
    const id = lower(variable.key);
    const before = values.get(id);
    if (mine.length === 0 || !isNumber(before)) return;
    const set = lastOrNull(mine.filter((c) => c.op === 'set'));
    const added = mine.filter((c) => c.op === 'add').reduce((n, c) => n + c.amount, set?.amount ?? before);
    values.set(
      id,
      mine.filter((c) => c.op === 'multiply').reduce((n, c) => n * c.amount, added),
    );
    sources.set(id, [...new Set(mine.map((c) => c.item.name))]);
  };

  const byHand = (variable: SysVariable): boolean => {
    const set = profile.overrides.get(variable.id);
    const ok = variable.kind === 'choice' ? typeof set === 'string' : isNumber(set) && Number.isFinite(set);
    if (ok) values.set(lower(variable.key), set as number | string);
    return ok;
  };

  for (const v of variables) {
    if (v.kind === 'derived') continue;
    apply(v);
    if (byHand(v)) sources.delete(lower(v.key));
  }
  // Formulas read while working out those amounts saw the values from before; work them out afresh.
  for (const v of variables) {
    if (v.kind !== 'derived') continue;
    values.delete(lower(v.key));
    errors.delete(lower(v.key));
  }
  for (const v of variables) if (v.kind === 'derived') byHand(v);
  for (const v of variables) {
    if (v.kind !== 'derived' || values.has(lower(v.key))) continue;
    try {
      valueOf(v.key);
      apply(v);
    } catch {
      // Recorded in `errors` by valueOf.
    }
  }

  const rows: SheetRow[] = variables.map((v) => {
    const id = lower(v.key);
    const value = values.get(id);
    const shown = isNumber(value) ? formatNumber(value) : typeof value === 'string' ? value : null;
    return {
      variable: v,
      value: value ?? null,
      display: shown === null ? '—' : `${shown}${v.unit.length > 0 && shown.length > 0 ? ` ${v.unit}` : ''}`,
      sources: sources.get(id) ?? [],
      error: errors.get(id) ?? null,
    };
  });

  const check = (condition: string): { unmet: string[]; error: string | null } => {
    if (dartTrim(condition).length === 0) return { unmet: [], error: null };
    try {
      return { unmet: unmet(parseFormula(condition), scope), error: null };
    } catch (err) {
      return { unmet: [], error: messageOf(err) };
    }
  };

  const sheetTracks: SheetTrack[] = tracks.map((track) => {
    if (track.kind === 'stages') {
      const at = stage.get(track.id)!;
      const stages = track.stages;
      const current = at < stages.length ? stages[at] : null;
      const upcoming = at + 1 < stages.length ? stages[at + 1] : null;
      const gate = upcoming !== null ? check(upcoming.requires) : { unmet: [] as string[], error: null };
      return {
        track,
        label: current?.name ?? 'No stages yet',
        level: null,
        next:
          upcoming !== null
            ? `Next: ${upcoming.name}${dartTrim(upcoming.requires).length > 0 ? ` (needs ${dartTrim(upcoming.requires)})` : ''}`
            : null,
        unmet: gate.unmet,
        xp: null,
        error: gate.error,
      };
    }
    const reached = level.get(track.id)!;
    const xp = earned.get(track.id) ?? null;
    let next: string | null = null;
    let error: string | null = curveErrors.get(track.id) ?? null;
    if (track.cap > 0 && reached >= track.cap) {
      next = 'At the cap';
    } else if (xp?.needed !== null && xp?.needed !== undefined) {
      next = xp.progress;
    } else if (dartTrim(track.curve).length > 0 && error === null) {
      try {
        next = `Next level: ${formatNumber(work(track.curve))}${track.curveUnit.length > 0 ? ` ${track.curveUnit}` : ''}`;
      } catch (err) {
        error = messageOf(err);
      }
    }
    return { track, label: `${reached}${track.cap > 0 ? ` of ${track.cap}` : ''}`, level: reached, next, unmet: [], xp, error };
  });

  const nameOf = (key: string): SysVariable | null => byKey.get(lower(key)) ?? null;
  const items: SheetItem[] = held.map((item) => {
    const gate = check(item.requires);
    const costs = item.costs.map((cost) => {
      const target = nameOf(cost.target);
      try {
        return { label: `${formatNumber(work(cost.amount))} ${target?.name ?? cost.target}`, error: null };
      } catch (err) {
        return { label: `${cost.amount} ${target?.name ?? cost.target}`, error: messageOf(err) };
      }
    });
    const effects: string[] = [];
    for (const modifier of item.modifiers) {
      const change = changes.find((c) => c.item.id === item.id && lower(c.target.key) === lower(modifier.target) && c.op === modifier.op);
      if (change === undefined) continue;
      const amount = formatNumber(Math.abs(change.amount));
      effects.push(
        `${change.target.name} ${modifier.op === 'add' ? `${change.amount < 0 ? '−' : '+'}${amount}` : `${modifier.op === 'multiply' ? '×' : '='} ${formatNumber(change.amount)}`}`,
      );
    }
    return {
      item,
      group: groupOf(item),
      requires: dartTrim(item.requires),
      unmet: gate.unmet,
      costs,
      effects,
      error: gate.error ?? itemErrors.get(item.id) ?? null,
      from: profile.itemIds.includes(item.id) ? null : (grantedBy.get(item.id) ?? null),
    };
  });

  const available = allItems.filter((item) => {
    if (holds(item.id) || dartTrim(item.requires).length === 0) return false;
    const gate = check(item.requires);
    return gate.error === null && gate.unmet.length === 0;
  });

  // Points: each level after the first on a track brings that track's points; placing them is the author's call.
  const granted = tracks.reduce((n, t) => n + (t.kind === 'levels' ? Math.max(0, t.points) * (level.get(t.id)! - 1) : 0), 0);
  const spent = variables.reduce((n, v) => n + placed(v), 0);
  const points = granted !== 0 || spent !== 0 ? { name: 'Points', earned: granted, spent, unspent: granted - spent } : null;

  return { rows, tracks: sheetTracks, items, available, points };
}

/** A sheet with its experience and placed points worked into plain numbers: the level each track has reached, and
 * each attribute with its points in. It is what a progression snapshot keeps, so a snapshot stays true whatever is
 * logged afterwards. `reached` leaves out experience from later in the story. */
export function settle(
  system: SystemBlueprint,
  sheet: SheetProfile,
  reached?: (nodeId: string | null) => boolean,
): { values: Map<string, string | number>; progress: Map<string, string | number>; itemIds: string[] } {
  const xp = sheet.xp.filter((e) => reached === undefined || reached(e.nodeId));
  const computed = computeSheet(system, sheet.withXp(xp));
  const progress = new Map(sheet.progress);
  for (const t of computed.tracks) {
    if (t.xp !== null && t.level !== null) progress.set(t.track.id, t.level);
  }
  const values = new Map(sheet.values);
  for (const v of system.variables) {
    const n = takesPoints(v) ? sheet.spent.get(v.id) : undefined;
    if (n !== undefined && Number.isFinite(n) && n !== 0) {
      const own = values.get(v.id);
      values.set(v.id, (isNumber(own) ? own : v.base) + n);
    }
  }
  return { values, progress, itemIds: [...sheet.itemIds] };
}

/** A sheet's experience in story order, with the level each gain left the character at: the level history, read
 * from the log rather than kept beside it. */
export function xpHistory(
  system: SystemBlueprint,
  sheet: SheetProfile,
  position: (nodeId: string | null) => number,
): { entry: XpEntry; level: number; track: SysTrack }[] {
  const indexed = sheet.xp.map((e, i) => ({ e, i }));
  indexed.sort((a, b) => {
    const pa = position(a.e.nodeId);
    const pb = position(b.e.nodeId);
    const p = pa < pb ? -1 : pa > pb ? 1 : 0;
    return p !== 0 ? p : a.i - b.i;
  });
  const ordered = indexed.map((x) => x.e);
  const out: { entry: XpEntry; level: number; track: SysTrack }[] = [];
  ordered.forEach((entry, i) => {
    const track = system.tracks.find((t) => t.id === entry.trackId && t.kind === 'levels');
    if (track === undefined) return;
    const upTo = new Set(ordered.slice(0, i + 1));
    const at = computeSheet(system, sheet.withXp(sheet.xp.filter((e) => upTo.has(e)))).tracks.find((t) => t.track.id === track.id)!;
    out.push({ entry, level: at.level ?? 1, track });
  });
  return out;
}

export type FormulaCheck = { ok: boolean; error: string | null; preview: string | null };

const plainWords = ['true', 'false', 'yes', 'no'];

/** Checks a formula or condition as the author types it, against the blueprint's starting values. Empty is fine. */
export function checkFormula(
  system: SystemBlueprint,
  text: string,
  options: { condition: boolean; extra?: ReadonlyMap<string, number> },
): FormulaCheck {
  if (dartTrim(text).length === 0) return { ok: true, error: null, preview: null };
  let tree: FNode;
  try {
    tree = parseFormula(text);
  } catch (err) {
    return { ok: false, error: err instanceof FormulaError ? err.message : 'This cannot be read.', preview: null };
  }
  // A scope that knows every name in the blueprint and holds nothing: enough to catch misspelt names and groups.
  const sheet = computeSheet(system);
  const known = new Map<string, FValue>();
  const names = namesIn(tree).map(lower);
  for (const row of sheet.rows) {
    // A formula that leans on a broken one is reported as broken itself, rather than given a made-up number.
    if (row.value !== null) {
      known.set(lower(row.variable.key), row.value);
    } else if (!names.some((n) => n === lower(row.variable.key) || n === lower(row.variable.name))) {
      known.set(lower(row.variable.key), 0);
    }
  }
  for (const t of system.tracks) known.set(lower(t.key), 1);
  for (const [key, value] of options.extra ?? new Map<string, number>()) known.set(lower(key), value);
  const find = (name: string): FValue | null => {
    const direct = known.get(lower(name));
    if (direct !== undefined) return direct;
    const key =
      system.variables.find((v) => lower(v.name) === lower(name))?.key ??
      system.tracks.find((t) => lower(t.name) === lower(name))?.key ??
      ' ';
    return known.get(lower(key)) ?? null;
  };

  const scope: FormulaScope = {
    value: find,
    holds: (group, name) => {
      const wanted = lower(group);
      const track = system.tracks.find((t) => t.kind === 'stages' && (lower(t.name) === wanted || lower(t.key) === wanted));
      if (track !== undefined) {
        if (!track.stages.some((s) => lower(s.name) === lower(name))) throw new FormulaError(`“${track.name}” has no stage called “${name}”.`);
        return false;
      }
      const choice = system.variables.find((v) => v.kind === 'choice' && (lower(v.name) === wanted || lower(v.key) === wanted));
      if (choice !== undefined) {
        if (!choice.options.some((o) => lower(o) === lower(name))) throw new FormulaError(`“${choice.name}” has no choice called “${name}”.`);
        return false;
      }
      const found = system.groupList.find((g) => groupNamed(g, wanted));
      if (found === undefined) return null;
      if (!system.items.some((i) => i.groupId === found.id && lower(i.name) === lower(name))) {
        throw new FormulaError(`“${found.name}” has nothing called “${name}”.`);
      }
      return false;
    },
  };
  try {
    // Every branch is read, so a misspelt name is caught even behind an AND that is already false.
    const visit = (node: FNode): void => {
      switch (node.kind) {
        case 'name':
          if (!plainWords.includes(lower(node.name)) && find(node.name) === null) throw new FormulaError(`Nothing here is called “${node.name}”.`);
          break;
        case 'holds':
          if (scope.holds(node.group, node.name) === null) throw new FormulaError(`There is no “${node.group}” to look in for “${node.name}”.`);
          break;
        case 'unary':
          visit(node.operand);
          break;
        case 'binary':
          visit(node.left);
          visit(node.right);
          break;
        case 'call':
          node.args.forEach(visit);
          break;
        default:
          break;
      }
    };
    visit(tree);
    const result = evaluateFormula(tree, scope);
    if (!options.condition && typeof result === 'string') return { ok: false, error: 'This gives a label, not a number.', preview: null };
    return {
      ok: true,
      error: null,
      preview: options.condition ? null : formatNumber(isNumber(result) ? result : result === true ? 1 : 0),
    };
  } catch (err) {
    return { ok: false, error: err instanceof FormulaError ? err.message : 'This could not be worked out.', preview: null };
  }
}

/** What it takes to pass each of the first few levels of a track, for showing the curve. */
export function curveTable(system: SystemBlueprint, track: SysTrack, levels: readonly number[]): { level: number; cost: string }[] {
  if (track.kind !== 'levels' || dartTrim(track.curve).length === 0) return [];
  return levels
    .filter((l) => l >= 1 && (track.cap === 0 || l < track.cap))
    .map((l) => {
      const c = checkFormula(system, track.curve, { condition: false, extra: new Map([[track.key, l], [track.name, l]]) });
      return { level: l, cost: c.error !== null ? '?' : `${c.preview}${track.curveUnit.length > 0 ? ` ${track.curveUnit}` : ''}` };
    });
}

/** An experience entry made on the fly (a climb's look ahead). */
export function xpEntry(raw: { id: string; trackId: string; amount: number; nodeId?: string | null }): XpEntry {
  return new XpEntry({ id: raw.id, trackId: raw.trackId, amount: raw.amount, source: '', nodeId: raw.nodeId ?? null, note: '' });
}
