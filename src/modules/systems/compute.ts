import { evaluate, FormulaError, formatNumber, namesIn, parse, unmet, type Node, type Scope, type Value } from './formula';
import type { BlueprintContent, Group, SysItem, SysVariable, SystemSheet, Track, XpEntry } from './types';

const lower = (text: string) => text.trim().toLowerCase();

/** What a profile brings to a blueprint. With none, formulas are checked against the blueprint's starting values. */
export type Profile = Pick<SystemSheet, 'values' | 'progress' | 'itemIds' | 'xp' | 'spent'> & {
  /**
   * Values the author has set by hand, by variable id. They win over
   * everything: starting values, what classes and skills give, and formulas.
   * Other formulas that read an overridden value read the author's number.
   */
  overrides?: Record<string, number | string>;
};
const EMPTY: Profile = { values: {}, progress: {}, itemIds: [] };

export interface SheetRow {
  variable: SysVariable;
  /** A number, or the chosen label. Null when it could not be worked out. */
  value: number | string | null;
  display: string;
  /** Classes, skills and the like that changed this value. */
  sources: string[];
  error: string | null;
}

export interface SheetTrack {
  track: Track;
  /** "12 of 100", or the stage's name. */
  label: string;
  /** The level reached, for numbered levels. Null for named stages. */
  level: number | null;
  /** What comes next and what it takes. */
  next: string | null;
  /** For a named stage: parts of its requirement that are not met. */
  unmet: string[];
  /** For numbered levels with experience logged: what was earned and how far into the current level it reaches. */
  xp: { total: number; into: number; needed: number | null; gained: number; progress: string } | null;
  error: string | null;
}

/** Points that levels have brought, and how many are placed on attributes. Never enforced: placing more than were earned is shown, not refused. */
export interface SheetPoints {
  name: string;
  earned: number;
  spent: number;
  unspent: number;
}

export interface SheetItem {
  item: SysItem;
  group: Group | undefined;
  /** Inherited from the blueprint: the condition, and the parts of it this profile does not meet. */
  requires: string;
  unmet: string[];
  costs: { label: string; error: string | null }[];
  effects: string[];
  error: string | null;
}

export interface ComputedSheet {
  rows: SheetRow[];
  tracks: SheetTrack[];
  items: SheetItem[];
  /** Things not held whose stated requirement is now met. */
  available: SysItem[];
  /** Null when no track of the blueprint gives points and none are placed. */
  points: SheetPoints | null;
}

/** Whether a variable is one that points can be placed on. */
export const takesPoints = (variable: SysVariable): boolean => variable.kind === 'number' || variable.kind === 'resource';

/**
 * Works out everything a blueprint says about a profile. Pure: it reads the
 * blueprint and the profile and returns values; it stores nothing. This is
 * what makes a character sheet "inherit" from the blueprint: nothing is
 * copied onto the character, so there is nothing to fall out of date.
 *
 * Order: levels from logged experience; starting values, the profile's own
 * numbers and the points placed on them; then what its classes, skills and
 * so on add, multiply or set; then formulas.
 */
export function computeSheet(system: BlueprintContent, profile: Profile = EMPTY): ComputedSheet {
  const byKey = new Map(system.variables.map((v) => [lower(v.key), v]));
  const held = system.items.filter((item) => profile.itemIds.includes(item.id));
  const groupOf = (item: SysItem) => system.groups.find((g) => g.id === item.groupId);

  // Where the profile stands on each track.
  const standing = new Map<string, { level: number; stage: number }>();
  for (const track of system.tracks) {
    const raw = profile.progress[track.id];
    if (track.kind === 'levels') standing.set(track.id, { level: Math.max(1, Math.min(track.cap || Infinity, Math.round(Number(raw) || 1))), stage: -1 });
    else standing.set(track.id, { level: 0, stage: Math.max(0, track.stages.findIndex((stage) => stage.id === raw)) });
  }

  const placed = (variable: SysVariable): number => {
    const n = takesPoints(variable) ? profile.spent?.[variable.id] : 0;
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  };
  const values = new Map<string, Value>();
  const errors = new Map<string, string>();
  const sources = new Map<string, string[]>();
  for (const variable of system.variables) {
    if (variable.kind === 'derived') continue;
    const own = profile.values[variable.id];
    if (variable.kind === 'choice') values.set(lower(variable.key), typeof own === 'string' && variable.options.includes(own) ? own : (variable.options[0] ?? ''));
    else values.set(lower(variable.key), (typeof own === 'number' && Number.isFinite(own) ? own : variable.base) + placed(variable));
  }

  const computing = new Set<string>();
  const valueOf = (name: string): Value | undefined => {
    const key = lower(name);
    const track = system.tracks.find((t) => lower(t.key) === key || lower(t.name) === key);
    // A stage ladder counts from 1, so `realm >= 3` means "third stage or beyond".
    if (track) return track.kind === 'levels' ? standing.get(track.id)!.level : track.stages.length ? standing.get(track.id)!.stage + 1 : 0;
    const variable = byKey.get(key) ?? system.variables.find((v) => lower(v.name) === key);
    if (!variable) return undefined;
    const id = lower(variable.key);
    if (values.has(id)) return values.get(id);
    if (errors.has(id)) throw new FormulaError(`“${variable.name}” could not be worked out.`);
    if (computing.has(id)) throw new FormulaError(`“${variable.name}” depends on itself.`);
    computing.add(id);
    try {
      const result = evaluate(parse(variable.formula), scope);
      values.set(id, typeof result === 'boolean' ? (result ? 1 : 0) : result);
      return values.get(id);
    } catch (err) {
      errors.set(id, err instanceof FormulaError ? err.message : 'This formula could not be worked out.');
      throw err;
    } finally {
      computing.delete(id);
    }
  };
  const scope: Scope = {
    value: valueOf,
    holds: (groupName, name) => {
      const wanted = lower(groupName);
      const track = system.tracks.find((t) => t.kind === 'stages' && (lower(t.name) === wanted || lower(t.key) === wanted));
      if (track) return lower(track.stages[standing.get(track.id)!.stage]?.name ?? '') === lower(name);
      // "Class: Mage" also finds the group called "Classes".
      const group = system.groups.find((g) => lower(g.name) === wanted || lower(g.name) === `${wanted}s` || lower(g.name) === `${wanted}es` || lower(g.name).replace(/ies$/, 'y') === wanted);
      const variable = system.variables.find((v) => v.kind === 'choice' && (lower(v.name) === wanted || lower(v.key) === wanted));
      if (variable) return lower(String(values.get(lower(variable.key)) ?? '')) === lower(name);
      if (!group) return undefined;
      return held.some((item) => item.groupId === group.id && lower(item.name) === lower(name));
    },
  };
  const work = (formula: string): number => {
    const result = evaluate(parse(formula), scope);
    if (typeof result === 'string') throw new FormulaError(`“${formula}” gives a label, not a number.`);
    return typeof result === 'boolean' ? (result ? 1 : 0) : result;
  };
  const message = (err: unknown) => (err instanceof FormulaError ? err.message : 'This could not be worked out.');

  // Levels bought with logged experience. Each level is paid for at the curve's price for that level, starting from where the sheet says the character began.
  const forget = () => {
    for (const variable of system.variables) {
      if (variable.kind !== 'derived') continue;
      values.delete(lower(variable.key));
      errors.delete(lower(variable.key));
    }
  };
  const earned = new Map<string, NonNullable<SheetTrack['xp']>>();
  const curveErrors = new Map<string, string>();
  for (const track of system.tracks) {
    const mine = (profile.xp ?? []).filter((e) => e.trackId === track.id && Number.isFinite(e.amount));
    if (track.kind !== 'levels' || !mine.length) continue;
    const at = standing.get(track.id)!;
    const start = at.level;
    const total = Math.max(0, mine.reduce((n, e) => n + e.amount, 0));
    let left = total;
    let needed: number | null = null;
    while (track.curve.trim() && !(track.cap && at.level >= track.cap) && at.level - start < 100000) {
      // A curve may read formulas that read the level, so nothing worked out for the last level is reused.
      forget();
      try {
        needed = work(track.curve);
      } catch (err) {
        curveErrors.set(track.id, message(err));
        needed = null;
        break;
      }
      // A curve that asks for nothing cannot be climbed by earning.
      if (needed === null || !(needed > 0) || !Number.isFinite(needed)) {
        needed = null;
        break;
      }
      if (left < needed) break;
      left -= needed;
      at.level += 1;
      needed = null;
    }
    forget();
    const unit = track.curveUnit ? ` ${track.curveUnit}` : '';
    earned.set(track.id, { total, into: left, needed, gained: at.level - start, progress: needed === null ? `${formatNumber(total)}${unit} earned` : `${formatNumber(left)} of ${formatNumber(needed)}${unit} to the next` });
  }

  // What classes, skills and the like change. Their amounts are worked out from the values before any of them apply.
  const changes: { item: SysItem; target: SysVariable; op: string; amount: number }[] = [];
  const itemErrors = new Map<string, string>();
  for (const item of held) {
    for (const modifier of item.modifiers) {
      const target = byKey.get(lower(modifier.target));
      if (!target || target.kind === 'choice') continue;
      try {
        changes.push({ item, target, op: modifier.op, amount: work(modifier.value) });
      } catch (err) {
        itemErrors.set(item.id, message(err));
      }
    }
  }
  const apply = (variable: SysVariable) => {
    const mine = changes.filter((c) => c.target.id === variable.id);
    const id = lower(variable.key);
    const before = values.get(id);
    if (!mine.length || typeof before !== 'number') return;
    const set = mine.filter((c) => c.op === 'set').at(-1);
    const added = mine.filter((c) => c.op === 'add').reduce((n, c) => n + c.amount, set ? set.amount : before);
    values.set(id, mine.filter((c) => c.op === 'multiply').reduce((n, c) => n * c.amount, added));
    sources.set(id, [...new Set(mine.map((c) => c.item.name))]);
  };
  const byHand = (variable: SysVariable): boolean => {
    const set = profile.overrides?.[variable.id];
    const ok = variable.kind === 'choice' ? typeof set === 'string' : typeof set === 'number' && Number.isFinite(set);
    if (ok) values.set(lower(variable.key), set as number | string);
    return ok;
  };
  for (const variable of system.variables) {
    if (variable.kind === 'derived') continue;
    apply(variable);
    if (byHand(variable)) sources.delete(lower(variable.key));
  }
  // Formulas read while working out those amounts saw the values from before; work them out afresh.
  for (const variable of system.variables) {
    if (variable.kind !== 'derived') continue;
    values.delete(lower(variable.key));
    errors.delete(lower(variable.key));
  }
  for (const variable of system.variables) if (variable.kind === 'derived') byHand(variable);
  for (const variable of system.variables) {
    if (variable.kind !== 'derived' || values.has(lower(variable.key))) continue;
    try {
      valueOf(variable.key);
      apply(variable);
    } catch {
      // Recorded in `errors` by valueOf.
    }
  }

  const rows = system.variables.map((variable): SheetRow => {
    const id = lower(variable.key);
    const value = values.get(id);
    const shown = typeof value === 'number' ? formatNumber(value) : typeof value === 'string' ? value : null;
    return { variable, value: typeof value === 'boolean' || value === undefined ? null : value, display: shown === null ? '—' : `${shown}${variable.unit && shown !== '' ? ` ${variable.unit}` : ''}`, sources: sources.get(id) ?? [], error: errors.get(id) ?? null };
  });

  const check = (condition: string): { unmet: string[]; error: string | null } => {
    if (!condition.trim()) return { unmet: [], error: null };
    try {
      return { unmet: unmet(parse(condition), scope), error: null };
    } catch (err) {
      return { unmet: [], error: message(err) };
    }
  };

  const tracks = system.tracks.map((track): SheetTrack => {
    const at = standing.get(track.id)!;
    if (track.kind === 'stages') {
      const current = track.stages[at.stage];
      const upcoming = track.stages[at.stage + 1];
      const gate = upcoming ? check(upcoming.requires) : { unmet: [], error: null };
      return { track, label: current?.name ?? 'No stages yet', next: upcoming ? `Next: ${upcoming.name}${upcoming.requires.trim() ? ` (needs ${upcoming.requires.trim()})` : ''}` : null, unmet: gate.unmet, level: null, xp: null, error: gate.error };
    }
    const xp = earned.get(track.id) ?? null;
    let next: string | null = null;
    let error: string | null = curveErrors.get(track.id) ?? null;
    if (track.cap && at.level >= track.cap) next = 'At the cap';
    else if (xp?.needed != null) next = xp.progress;
    else if (track.curve.trim() && !error) {
      try {
        next = `Next level: ${formatNumber(work(track.curve))}${track.curveUnit ? ` ${track.curveUnit}` : ''}`;
      } catch (err) {
        error = message(err);
      }
    }
    return { track, label: `${at.level}${track.cap ? ` of ${track.cap}` : ''}`, next, unmet: [], level: at.level, xp, error };
  });

  const nameOf = (key: string) => byKey.get(lower(key));
  const items = held.map((item): SheetItem => {
    const gate = check(item.requires);
    const costs = item.costs.map((cost) => {
      const target = nameOf(cost.target);
      try {
        return { label: `${formatNumber(work(cost.amount))} ${target?.name ?? cost.target}`, error: null };
      } catch (err) {
        return { label: `${cost.amount} ${target?.name ?? cost.target}`, error: message(err) };
      }
    });
    const effects = item.modifiers.flatMap((modifier) => {
      const change = changes.find((c) => c.item.id === item.id && lower(c.target.key) === lower(modifier.target) && c.op === modifier.op);
      if (!change) return [];
      const amount = formatNumber(Math.abs(change.amount));
      return [`${change.target.name} ${modifier.op === 'add' ? `${change.amount < 0 ? '−' : '+'}${amount}` : `${modifier.op === 'multiply' ? '×' : '='} ${formatNumber(change.amount)}`}`];
    });
    return { item, group: groupOf(item), requires: item.requires.trim(), unmet: gate.unmet, costs, effects, error: gate.error ?? itemErrors.get(item.id) ?? null };
  });

  const available = system.items.filter((item) => {
    if (profile.itemIds.includes(item.id) || !item.requires.trim()) return false;
    const gate = check(item.requires);
    return !gate.error && gate.unmet.length === 0;
  });

  // Points: each level after the first on a track brings that track's points; placing them is the author's call.
  const granted = system.tracks.reduce((n, track) => n + (track.kind === 'levels' ? Math.max(0, track.points ?? 0) * (standing.get(track.id)!.level - 1) : 0), 0);
  const spent = system.variables.reduce((n, variable) => n + placed(variable), 0);
  const points = granted || spent ? { name: 'Points', earned: granted, spent, unspent: granted - spent } : null;

  return { rows, tracks, items, available, points };
}

/**
 * A sheet with its experience and placed points worked into plain numbers:
 * the level each track has reached, and each attribute with its points in.
 * It is what a progression snapshot keeps, so a snapshot stays true whatever
 * is logged afterwards. `reached` leaves out experience from later in the story.
 */
export function settle(system: BlueprintContent, sheet: Profile, reached: (nodeId: string | null) => boolean = () => true): Pick<SystemSheet, 'values' | 'progress' | 'itemIds'> {
  const xp = (sheet.xp ?? []).filter((e) => reached(e.nodeId));
  const { tracks } = computeSheet(system, { ...sheet, xp });
  const progress = { ...sheet.progress };
  for (const { track, level, xp: logged } of tracks) if (logged && level !== null) progress[track.id] = level;
  const values = { ...sheet.values };
  for (const variable of system.variables) {
    const n = takesPoints(variable) ? sheet.spent?.[variable.id] : undefined;
    if (typeof n === 'number' && Number.isFinite(n) && n !== 0) values[variable.id] = (typeof values[variable.id] === 'number' ? (values[variable.id] as number) : variable.base) + n;
  }
  return { values, progress, itemIds: [...sheet.itemIds] };
}

/** A sheet's experience in story order, with the level each gain left the character at: the level history, read from the log rather than kept beside it. */
export function xpHistory(system: BlueprintContent, sheet: Profile, position: (nodeId: string | null) => number): { entry: XpEntry; level: number; track: Track }[] {
  const ordered = [...(sheet.xp ?? [])].map((entry, i) => ({ entry, i })).sort((a, b) => position(a.entry.nodeId) - position(b.entry.nodeId) || a.i - b.i).map((x) => x.entry);
  return ordered.flatMap((entry, i) => {
    const track = system.tracks.find((t) => t.id === entry.trackId && t.kind === 'levels');
    if (!track) return [];
    const upTo = new Set(ordered.slice(0, i + 1));
    const at = computeSheet(system, { ...sheet, xp: (sheet.xp ?? []).filter((e) => upTo.has(e)) }).tracks.find((t) => t.track.id === track.id)!;
    return [{ entry, level: at.level ?? 1, track }];
  });
}

export interface FormulaCheck {
  ok: boolean;
  /** Why not, in words for the author. */
  error: string | null;
  /** What it comes to with the blueprint's starting values. */
  preview: string | null;
}

/** Checks a formula or condition as the author types it, against the blueprint's starting values. Empty is fine. */
export function checkFormula(system: BlueprintContent, text: string, kind: 'number' | 'condition', extra: Record<string, number> = {}): FormulaCheck {
  if (!text.trim()) return { ok: true, error: null, preview: null };
  let tree: Node;
  try {
    tree = parse(text);
  } catch (err) {
    return { ok: false, error: err instanceof FormulaError ? err.message : 'This cannot be read.', preview: null };
  }
  // A scope that knows every name in the blueprint and holds nothing: enough to catch misspelt names and groups.
  const sheet = computeSheet(system);
  const known = new Map<string, Value>();
  for (const row of sheet.rows) {
    // A formula that leans on a broken one is reported as broken itself, rather than given a made-up number.
    if (row.value !== null) known.set(lower(row.variable.key), row.value);
    else if (!namesIn(tree).some((n) => lower(n) === lower(row.variable.key) || lower(n) === lower(row.variable.name))) known.set(lower(row.variable.key), 0);
  }
  for (const track of system.tracks) known.set(lower(track.key), 1);
  for (const [name, value] of Object.entries(extra)) known.set(lower(name), value);
  const find = (name: string): Value | undefined => known.get(lower(name)) ?? known.get(lower(system.variables.find((v) => lower(v.name) === lower(name))?.key ?? system.tracks.find((t) => lower(t.name) === lower(name))?.key ?? ' '));
  const scope: Scope = {
    value: find,
    holds: (group, name) => {
      const wanted = lower(group);
      const track = system.tracks.find((t) => t.kind === 'stages' && (lower(t.name) === wanted || lower(t.key) === wanted));
      if (track) {
        if (!track.stages.some((s) => lower(s.name) === lower(name))) throw new FormulaError(`“${track.name}” has no stage called “${name}”.`);
        return false;
      }
      const choice = system.variables.find((v) => v.kind === 'choice' && (lower(v.name) === wanted || lower(v.key) === wanted));
      if (choice) {
        if (!choice.options.some((o) => lower(o) === lower(name))) throw new FormulaError(`“${choice.name}” has no choice called “${name}”.`);
        return false;
      }
      const found = system.groups.find((g) => lower(g.name) === wanted || lower(g.name) === `${wanted}s` || lower(g.name) === `${wanted}es` || lower(g.name).replace(/ies$/, 'y') === wanted);
      if (!found) return undefined;
      if (!system.items.some((i) => i.groupId === found.id && lower(i.name) === lower(name))) throw new FormulaError(`“${found.name}” has nothing called “${name}”.`);
      return false;
    },
  };
  try {
    // Every branch is read, so a misspelt name is caught even behind an AND that is already false.
    const visit = (node: Node): void => {
      if (node.type === 'name') {
        if (!['true', 'false', 'yes', 'no'].includes(lower(node.name)) && find(node.name) === undefined) throw new FormulaError(`Nothing here is called “${node.name}”.`);
      } else if (node.type === 'holds') {
        if (scope.holds(node.group, node.name) === undefined) throw new FormulaError(`There is no “${node.group}” to look in for “${node.name}”.`);
      } else if (node.type === 'unary') visit(node.operand);
      else if (node.type === 'binary') [node.left, node.right].forEach(visit);
      else if (node.type === 'call') node.args.forEach(visit);
    };
    visit(tree);
    const result = evaluate(tree, scope);
    if (kind === 'number' && typeof result === 'string') return { ok: false, error: 'This gives a label, not a number.', preview: null };
    return { ok: true, error: null, preview: kind === 'condition' ? null : formatNumber(typeof result === 'number' ? result : result ? 1 : 0) };
  } catch (err) {
    return { ok: false, error: err instanceof FormulaError ? err.message : 'This could not be worked out.', preview: null };
  }
}

/** What it takes to pass each of the first few levels of a track, for showing the curve. */
export function curveTable(system: BlueprintContent, track: Track, levels: number[]): { level: number; cost: string }[] {
  if (track.kind !== 'levels' || !track.curve.trim()) return [];
  return levels.filter((level) => level >= 1 && (!track.cap || level < track.cap)).map((level) => {
    const { preview, error } = checkFormula(system, track.curve, 'number', { [track.key]: level, [track.name]: level });
    return { level, cost: error ? '?' : `${preview}${track.curveUnit ? ` ${track.curveUnit}` : ''}` };
  });
}
