import { fieldOf } from '@/modules/codex/capabilities';
import { displayValue } from '@/modules/codex/schema';
import { connectionType } from '@/modules/connections/types';
import { deriveConnections } from '@/modules/model/connections';
import { refKey } from '@/modules/model/model';
import type { Connection, EntityRef, StoryModel } from '@/modules/model/types';
import { inStoryOrder, placeOf } from '@/modules/progression/state';
import { inOrder, progressAt, whenWords, type ProgressChange } from '@/modules/progression/track';
import type { ProgressSnapshot } from '@/modules/progression/types';
import { checkFormula } from '@/modules/systems/compute';
import { parse, type Node as FormulaNode } from '@/modules/systems/formula';
import { rankName, type SystemBlueprint } from '@/modules/systems/types';

/**
 * ABILITY PATHS
 * Abilities, skills, techniques, transformations, classes, upgrades — from
 * any system blueprint, and from any kind of codex record the author marks
 * as one — and the paths the author records between them. Every path says
 * only what it says: a prerequisite is something that must be held first;
 * an upgrade, an evolution, a fusion or a replacement is something else, and
 * is never read as a prerequisite. Nothing is assumed to follow a single
 * system, and nothing is worked out from names.
 *
 * Where paths come from:
 *  - connections the author records, of the path types (`connections/types.ts`),
 *    or of any type of their own between two abilities;
 *  - a blueprint item's "branches from" (its `parentId`);
 *  - a blueprint item's requirement rule, where it names another item ("Skill: Fire Lance").
 *
 * What is wrong is said, never fixed: requirement cycles, abilities that can
 * never be gained, requirements that clash with an exclusion, rules that
 * cannot be read, and holders who hold something without what it requires.
 */

export type PathRole = 'prerequisite' | 'alternative' | 'upgrade' | 'evolution' | 'fusion' | 'replacement' | 'exclusive' | 'branch' | 'rule' | 'other';
/** The recorded connection types that are paths, and what each means. */
export const PATH_TYPES: Record<string, PathRole> = { 'prerequisite-for': 'prerequisite', 'alternative-for': 'alternative', 'upgrades-to': 'upgrade', 'evolves-into': 'evolution', 'fuses-into': 'fusion', 'replaced-by': 'replacement', excludes: 'exclusive' };
export const ROLES: PathRole[] = ['prerequisite', 'alternative', 'rule', 'upgrade', 'evolution', 'fusion', 'replacement', 'branch', 'exclusive', 'other'];
export const ROLE_LABELS: Record<PathRole, string> = {
  prerequisite: 'Prerequisites',
  alternative: 'Alternative prerequisites',
  rule: 'Named in a requirement rule',
  upgrade: 'Upgrades',
  evolution: 'Evolutions',
  fusion: 'Fusions',
  replacement: 'Replacements',
  branch: 'Branches (in a blueprint)',
  exclusive: 'Mutually exclusive',
  other: 'Your own connections',
};
/** What must be held first: the only paths that decide whether something can be gained. */
const REQUIRES: PathRole[] = ['prerequisite', 'rule'];
/** Paths that run from one ability on to the next: the tree's layers follow them. */
const FORWARD: PathRole[] = ['prerequisite', 'alternative', 'rule', 'upgrade', 'evolution', 'fusion', 'replacement', 'branch'];
/** Paths along which one thing becomes another: holding the later one without the earlier is expected. */
const BECOMES: PathRole[] = ['upgrade', 'evolution', 'fusion', 'replacement', 'branch'];

export interface Holder {
  id: string;
  name: string;
  /** Where that is recorded: "on their system sheet", "in their latest snapshot (Ch 3)", "as of the end, by their progression". */
  how: string;
}
export interface Acquisition {
  entryId: string;
  name: string;
  /** Gained or lost by a recorded change, or first held in a snapshot. */
  action: 'gain' | 'lose' | 'happen' | 'snapshot';
  when: string;
  changeId?: string;
  snapshotId?: string;
}

export interface AbilityNode {
  key: string;
  ref: EntityRef;
  name: string;
  /** Where it comes from: a blueprint's group ("Ember Arts · Skills"), or its kind of record ("Techniques"). */
  source: string;
  sourceKey: string;
  color: string;
  rank: string | null;
  /** A blueprint item's requirement rule, as written. */
  requires: string;
  /** Costs, cooldown and the like, in words. */
  limits: string[];
  holders: Holder[];
  acquired: Acquisition[];
}

export interface PathEdge {
  id: string;
  from: string;
  to: string;
  role: PathRole;
  /** How it reads from `from`: "Prerequisite for", "Evolves into", the author's own wording. */
  label: string;
  directed: boolean;
  /** The recorded connection's own id, when it is one (to change or remove it); null for one read from a blueprint. */
  linkId: string | null;
}

export interface AbilityTree {
  nodes: AbilityNode[];
  edges: PathEdge[];
  /** Path connections with an end that is not an ability or the like (a character, a chapter): listed, not drawn. */
  notDrawn: { connection: Connection; reason: string }[];
}

const SYSTEM_COLORS = ['#2b7a8c', '#7a4fa3', '#a3622b', '#4f5fa3', '#6b7a2b', '#a8436b'];
const lower = (s: string) => s.trim().toLowerCase();

/** The item a requirement names ("Skill: Fire Lance"), in the same blueprint: the group is matched as the blueprint's rules match it. */
function namedItem(system: SystemBlueprint, group: string, name: string) {
  const wanted = lower(group);
  const found = system.groups.find((g) => lower(g.name) === wanted || lower(g.name) === `${wanted}s` || lower(g.name) === `${wanted}es` || lower(g.name).replace(/ies$/, 'y') === wanted);
  return found ? system.items.find((i) => i.groupId === found.id && lower(i.name) === lower(name)) : undefined;
}
const holdsIn = (node: FormulaNode): { group: string; name: string }[] =>
  node.type === 'holds' ? [{ group: node.group, name: node.name }] : node.type === 'unary' ? holdsIn(node.operand) : node.type === 'binary' ? [...holdsIn(node.left), ...holdsIn(node.right)] : node.type === 'call' ? node.args.flatMap(holdsIn) : [];

/**
 * Everything the ability paths are drawn from. Abilities are: every item of
 * every system blueprint; every codex record of a kind set to be shown in
 * the ability tree; and any other record (never a character) at an end of a
 * path the author recorded.
 */
export function abilityTree(model: StoryModel, snapshots: ProgressSnapshot[] = []): AbilityTree {
  const { connections } = deriveConnections(model);
  const nodes = new Map<string, AbilityNode>();
  const systemIndex = new Map([...model.systems.keys()].map((id, i) => [id, i]));
  const eligible = (ref: EntityRef) => (ref.type === 'ability' ? model.abilities.has(ref.id) : ref.type === 'entry' ? (model.entries.get(ref.id)?.category ?? 'character') !== 'character' : false);

  const add = (ref: EntityRef) => {
    const key = refKey(ref);
    if (nodes.has(key) || !eligible(ref)) return;
    if (ref.type === 'ability') {
      const { system, item, group } = model.abilities.get(ref.id)!;
      const variables = new Map(system.variables.map((v) => [v.key, v.name]));
      const limits = [...item.costs.filter((c) => c.amount.trim()).map((c) => `Costs ${c.amount} ${variables.get(c.target) ?? c.target}`), ...(item.cooldown.trim() ? [`Cooldown ${item.cooldown.trim()}`] : [])];
      nodes.set(key, { key, ref, name: item.name, source: `${system.name}${group ? ` · ${group}` : ''}`, sourceKey: `system:${system.id}`, color: SYSTEM_COLORS[(systemIndex.get(system.id) ?? 0) % SYSTEM_COLORS.length], rank: rankName(system, item) || null, requires: item.requires.trim(), limits, holders: [], acquired: [] });
    } else {
      const entry = model.entries.get(ref.id)!;
      const category = model.categories.get(entry.category);
      const rankDef = category ? fieldOf(category, 'rank', category.uses?.rank) : null;
      const rank = rankDef ? displayValue({ type: rankDef.type, value: entry.fields.find((f) => f.defId === rankDef.id)?.value ?? '' }, () => undefined) || null : null;
      nodes.set(key, { key, ref, name: entry.name, source: category?.name ?? 'Codex', sourceKey: `kind:${entry.category}`, color: category?.color ?? '#5c6370', rank, requires: '', limits: [], holders: [], acquired: [] });
    }
  };
  for (const id of model.abilities.keys()) add({ type: 'ability', id });
  for (const entry of model.entries.values()) if (model.categories.get(entry.category)?.uses?.tree) add({ type: 'entry', id: entry.id });
  const isPath = (c: Connection) => c.kind === 'link' && PATH_TYPES[connectionType(c.type).key] !== undefined;
  const notDrawn: AbilityTree['notDrawn'] = [];
  for (const c of connections.filter(isPath)) {
    const bad = [c.from, c.to].find((end) => !eligible(end));
    if (!bad) [c.from, c.to].forEach(add);
    else notDrawn.push({ connection: c, reason: bad.type === 'entry' ? 'one end is a character: who holds what is read from sheets and progression, not drawn as a path' : 'one end is not an ability, skill, item or the like' });
  }

  // Paths between two abilities: recorded connections (of the path types, or of any type of the author's own), fields, and a blueprint's branches.
  const edges: PathEdge[] = [];
  for (const c of connections) {
    const [a, b] = [refKey(c.from), refKey(c.to)];
    if (!nodes.has(a) || !nodes.has(b)) continue;
    if (c.kind === 'link') {
      const role = PATH_TYPES[connectionType(c.type).key] ?? 'other';
      edges.push({ id: c.id, from: a, to: b, role, label: c.label || connectionType(c.type).label, directed: role === 'exclusive' ? false : role === 'other' ? c.directed : true, linkId: c.source.id });
    } else if (c.kind === 'branches-from') edges.push({ id: c.id, from: b, to: a, role: 'branch', label: 'Branches into', directed: true, linkId: null });
    else if (c.kind === 'field') edges.push({ id: c.id, from: a, to: b, role: 'other', label: c.label, directed: true, linkId: null });
  }
  // A blueprint item's requirement rule, where it names another of the blueprint's items.
  for (const node of nodes.values()) {
    if (node.ref.type !== 'ability' || !node.requires) continue;
    const { system } = model.abilities.get(node.ref.id)!;
    let tree: FormulaNode;
    try {
      tree = parse(node.requires);
    } catch {
      continue;
    }
    for (const { group, name } of holdsIn(tree)) {
      const item = namedItem(system, group, name);
      const from = item ? `ability:${system.id}/${item.id}` : null;
      if (from && nodes.has(from) && !edges.some((e) => e.role === 'rule' && e.from === from && e.to === node.key)) edges.push({ id: `rule:${from}>${node.key}`, from, to: node.key, role: 'rule', label: 'Named in the requirement of', directed: true, linkId: null });
    }
  }

  // Who holds each, and when it was gained: system sheets, the latest snapshot, and the progression recorded change by change.
  const nameOf = (id: string) => model.entries.get(id)?.name ?? 'Someone deleted';
  const hold = (key: string, holder: Holder) => {
    const node = nodes.get(key);
    if (node && !node.holders.some((h) => h.id === holder.id)) node.holders.push(holder);
  };
  for (const sheet of model.sheets) for (const itemId of sheet.itemIds) hold(`ability:${sheet.systemId}/${itemId}`, { id: sheet.entryId, name: nameOf(sheet.entryId), how: 'on their system sheet' });
  const documents = [...model.nodes.values()];
  for (const entryId of new Set(snapshots.map((s) => s.entryId))) {
    if (!model.entries.has(entryId)) continue;
    const ordered = inStoryOrder(snapshots, documents, entryId);
    const firsts = new Map<string, ProgressSnapshot>();
    for (const snap of ordered) for (const [systemId, state] of Object.entries(snap.systems)) for (const itemId of state.itemIds) if (!firsts.has(`${systemId}/${itemId}`)) firsts.set(`${systemId}/${itemId}`, snap);
    for (const [id, snap] of firsts) nodes.get(`ability:${id}`)?.acquired.push({ entryId, name: nameOf(entryId), action: 'snapshot', when: `first in a snapshot at ${placeOf(snap, documents)}`, snapshotId: snap.id });
    const latest = ordered.at(-1);
    for (const [systemId, state] of Object.entries(latest?.systems ?? {})) for (const itemId of state.itemIds) hold(`ability:${systemId}/${itemId}`, { id: entryId, name: nameOf(entryId), how: `in their latest snapshot (${placeOf(latest!, documents)})` });
  }
  const keyOfChange = (c: Pick<ProgressChange, 'refId' | 'abilityId'>) => (c.abilityId ? `ability:${c.abilityId}` : c.refId ? `entry:${c.refId}` : null);
  for (const entryId of new Set(model.progress.filter((c) => keyOfChange(c) && nodes.has(keyOfChange(c)!)).map((c) => c.entryId))) {
    if (!model.entries.has(entryId)) continue;
    for (const change of inOrder(model, entryId)) {
      const key = keyOfChange(change);
      if (key && nodes.has(key)) nodes.get(key)!.acquired.push({ entryId, name: nameOf(entryId), action: change.action === 'lose' ? 'lose' : change.action === 'happen' ? 'happen' : 'gain', when: whenWords(change.at, model), changeId: change.id });
    }
    for (const { category, lines } of progressAt(model, entryId, 'end').categories) {
      if (category.shape !== 'held') continue;
      for (const line of lines) {
        const key = keyOfChange(line.change);
        if (key) hold(key, { id: entryId, name: nameOf(entryId), how: 'as of the end, by their progression' });
      }
    }
  }
  for (const node of nodes.values()) node.holders.sort((a, b) => a.name.localeCompare(b.name));

  return { nodes: [...nodes.values()].sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name)), edges, notDrawn };
}

// ---------------------------------------------------------------------------------------------------- what does not add up

export type ProblemKind = 'cycle' | 'loop' | 'conflict' | 'unreachable' | 'fusion' | 'rule' | 'holder';
export interface PathProblem {
  key: string;
  kind: ProblemKind;
  /** A problem stops something from ever being gained, or cannot be read; a note may well be meant, and is said so it is not missed. */
  severity: 'problem' | 'note';
  message: string;
  nodes: string[];
}

/** Groups of nodes that reach each other along the given edges (Tarjan), each with more than one node or a loop onto itself. */
function cycles(keys: string[], edges: PathEdge[]): string[][] {
  const next = new Map<string, string[]>(keys.map((k) => [k, []]));
  for (const e of edges) next.get(e.from)?.push(e.to);
  let index = 0;
  const at = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const out: string[][] = [];
  const visit = (v: string) => {
    at.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const w of next.get(v) ?? []) {
      if (!at.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, at.get(w)!));
    }
    if (low.get(v) === at.get(v)) {
      const group: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        group.push(w);
      } while (w !== v);
      if (group.length > 1 || (next.get(v) ?? []).includes(v)) out.push(group.reverse());
    }
  };
  for (const k of keys) if (!at.has(k)) visit(k);
  return out;
}

/** One way round a cycle, in names: "Fire Lance → Flame Wall → Fire Lance". */
function aroundCycle(group: string[], edges: PathEdge[], name: (key: string) => string): string {
  const inside = new Set(group);
  const path = [group[0]];
  const seen = new Set(path);
  for (;;) {
    const here = path.at(-1)!;
    const step = edges.find((e) => e.from === here && inside.has(e.to) && (!seen.has(e.to) || e.to === group[0]));
    if (!step) break;
    path.push(step.to);
    if (step.to === group[0]) break;
    seen.add(step.to);
  }
  return path.map(name).join(' → ');
}

/**
 * Everything about the paths that does not add up, in words. Nothing here
 * changes a record: each is for the author to look at.
 */
export function pathProblems(tree: AbilityTree, model: StoryModel): PathProblem[] {
  const out: PathProblem[] = [];
  const byKey = new Map(tree.nodes.map((n) => [n.key, n]));
  const name = (key: string) => byKey.get(key)?.name ?? 'something deleted';
  const keys = tree.nodes.map((n) => n.key);
  const requires = tree.edges.filter((e) => REQUIRES.includes(e.role));
  const alternatives = tree.edges.filter((e) => e.role === 'alternative');
  const exclusive = new Set(tree.edges.filter((e) => e.role === 'exclusive').flatMap((e) => [`${e.from}|${e.to}`, `${e.to}|${e.from}`]));

  // Requirement cycles: nothing in one can ever be gained.
  const inCycle = new Set<string>();
  for (const group of cycles(keys, requires)) {
    group.forEach((k) => inCycle.add(k));
    out.push({ key: `paths|cycle|${[...group].sort().join('|')}`, kind: 'cycle', severity: 'problem', message: group.length === 1 ? `${name(group[0])} requires itself, so it can never be gained.` : `A cycle of requirements: ${aroundCycle(group, requires, name)}. None of them can ever be gained while each requires the next.`, nodes: group });
  }
  // Loops of upgrades, evolutions, replacements, fusions: may be meant; a blueprint's branches may not loop.
  for (const role of ['branch', 'becomes'] as const) {
    const along = tree.edges.filter((e) => (role === 'branch' ? e.role === 'branch' : BECOMES.includes(e.role) && e.role !== 'branch'));
    for (const group of cycles(keys, along))
      out.push(
        role === 'branch'
          ? { key: `paths|branch-cycle|${[...group].sort().join('|')}`, kind: 'cycle', severity: 'problem', message: `Blueprint items branch from each other in a loop: ${aroundCycle(group, along, name)}. Each item can branch from only one that comes before it.`, nodes: group }
          : { key: `paths|loop|${[...group].sort().join('|')}`, kind: 'loop', severity: 'note', message: `A loop of upgrades, evolutions, fusions or replacements: ${aroundCycle(group, along, name)}. It may be meant (a form taken and left again); it is said here so it is not missed.`, nodes: group },
      );
  }

  // What can be gained at all, by the requirements as recorded.
  const needs = new Map<string, string[]>(keys.map((k) => [k, requires.filter((e) => e.to === k).map((e) => e.from)]));
  const either = new Map<string, string[]>(keys.map((k) => [k, alternatives.filter((e) => e.to === k).map((e) => e.from)]));
  const closure = (k: string) => {
    const all = new Set([k]);
    const todo = [k];
    while (todo.length) for (const r of needs.get(todo.pop()!) ?? []) if (!all.has(r)) all.add(r) && todo.push(r);
    return [...all];
  };
  const clash = new Map<string, [string, string]>();
  for (const k of keys) {
    const all = closure(k);
    for (let i = 0; i < all.length && !clash.has(k); i++) for (let j = i + 1; j < all.length; j++) if (exclusive.has(`${all[i]}|${all[j]}`)) clash.set(k, [all[i], all[j]]);
  }
  const gainable = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const k of keys) {
      if (gainable.has(k) || clash.has(k)) continue;
      const alts = either.get(k)!;
      if (needs.get(k)!.every((r) => gainable.has(r)) && (!alts.length || alts.some((a) => gainable.has(a)))) {
        gainable.add(k);
        changed = true;
      }
    }
  }
  for (const k of keys) {
    if (gainable.has(k)) continue;
    const pair = clash.get(k);
    if (pair) {
      const [a, b] = pair;
      out.push({ key: `paths|conflict|${k}`, kind: 'conflict', severity: 'problem', message: a === k || b === k ? `${name(k)} requires ${name(a === k ? b : a)}, with which it is mutually exclusive, so it can never be gained.` : `${name(k)} requires both ${name(a)} and ${name(b)}, which are mutually exclusive, so it can never be gained.`, nodes: [k, a, b].filter((x, i, l) => l.indexOf(x) === i) });
      continue;
    }
    if (inCycle.has(k)) continue; // said with its cycle
    const blocked = needs.get(k)!.find((r) => !gainable.has(r));
    const alts = either.get(k)!;
    out.push({ key: `paths|unreachable|${k}`, kind: 'unreachable', severity: 'problem', message: blocked ? `${name(k)} can never be gained: it requires ${name(blocked)}, which can never be gained.` : `${name(k)} can never be gained: none of its alternative prerequisites (${alts.map(name).join(', ')}) can be gained.`, nodes: [k, ...(blocked ? [blocked] : alts)] });
  }

  // A fusion of one thing.
  for (const k of keys) {
    const from = tree.edges.filter((e) => e.role === 'fusion' && e.to === k).map((e) => e.from);
    if (from.length === 1) out.push({ key: `paths|fusion|${k}`, kind: 'fusion', severity: 'note', message: `${name(k)} is fused from ${name(from[0])} alone. A fusion is usually of two or more: add the others, or record it as an upgrade or evolution.`, nodes: [k, from[0]] });
  }

  // Requirement rules that cannot be read.
  for (const node of tree.nodes) {
    if (node.ref.type !== 'ability' || !node.requires) continue;
    const { system } = model.abilities.get(node.ref.id)!;
    const check = checkFormula(system, node.requires, 'condition');
    if (!check.ok) out.push({ key: `paths|rule|${node.key}`, kind: 'rule', severity: 'problem', message: `${node.name}’s requirement rule “${node.requires}” cannot be read: ${check.error}`, nodes: [node.key] });
  }

  // Holders: holding something without what it requires, or holding two things that exclude each other.
  const holds = (key: string, id: string) => byKey.get(key)?.holders.some((h) => h.id === id) ?? false;
  const becomes = (from: string, to: string) => {
    const seen = new Set([from]);
    const todo = [from];
    while (todo.length) {
      const here = todo.pop()!;
      for (const e of tree.edges) if (e.from === here && BECOMES.includes(e.role) && !seen.has(e.to)) (seen.add(e.to), todo.push(e.to));
    }
    return seen.has(to);
  };
  for (const node of tree.nodes) {
    for (const holder of node.holders) {
      for (const r of needs.get(node.key)!) {
        // What became this one (an evolution of it, its upgrade) is not expected to be held still.
        if (!holds(r, holder.id) && !becomes(r, node.key)) out.push({ key: `paths|holder|${holder.id}|${node.key}|${r}`, kind: 'holder', severity: 'note', message: `${holder.name} holds ${node.name} without ${name(r)}, which it requires.`, nodes: [node.key, r] });
      }
      const alts = either.get(node.key)!;
      if (alts.length && !alts.some((a) => holds(a, holder.id) || becomes(a, node.key))) out.push({ key: `paths|holder|${holder.id}|${node.key}|alternatives`, kind: 'holder', severity: 'note', message: `${holder.name} holds ${node.name} without any of its alternative prerequisites (${alts.map(name).join(', ')}).`, nodes: [node.key, ...alts] });
    }
  }
  for (const e of tree.edges.filter((x) => x.role === 'exclusive')) {
    for (const holder of byKey.get(e.from)?.holders ?? []) if (holds(e.to, holder.id)) out.push({ key: `paths|holder|${holder.id}|${e.id}`, kind: 'holder', severity: 'note', message: `${holder.name} holds both ${name(e.from)} and ${name(e.to)}, which are mutually exclusive.`, nodes: [e.from, e.to] });
  }
  const order: ProblemKind[] = ['cycle', 'conflict', 'unreachable', 'rule', 'loop', 'fusion', 'holder'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.message.localeCompare(b.message));
}

// ---------------------------------------------------------------------------------------------------- the tree's shape

export interface TreeLayout {
  at: Map<string, { x: number; y: number; layer: number }>;
  /** Paths that run against the layers (part of a loop): drawn, but bent back. */
  back: Set<string>;
  width: number;
  height: number;
}
export const COLUMN = 190;
export const ROW = 120;

/**
 * Layers from the top: each ability one layer below the furthest of those
 * its forward paths come from (a loop is broken where it closes, and that
 * path is drawn bending back). Within a layer, each sits near what it is
 * joined to (a few passes of the barycentre method). The same records give
 * the same layout every time.
 */
export function treeLayout(keys: string[], edges: PathEdge[]): TreeLayout {
  const order = [...keys].sort();
  const known = new Set(order);
  const forward = edges.filter((e) => FORWARD.includes(e.role) && known.has(e.from) && known.has(e.to) && e.from !== e.to).sort((a, b) => a.id.localeCompare(b.id));
  const next = new Map<string, PathEdge[]>(order.map((k) => [k, []]));
  for (const e of forward) next.get(e.from)!.push(e);
  // Break loops where they close: a depth-first walk, from those nothing leads into first.
  const back = new Set<string>();
  const state = new Map<string, 'open' | 'done'>();
  const walk = (k: string) => {
    state.set(k, 'open');
    for (const e of next.get(k)!) {
      if (state.get(e.to) === 'open') back.add(e.id);
      else if (!state.has(e.to)) walk(e.to);
    }
    state.set(k, 'done');
  };
  const into = new Set(forward.map((e) => e.to));
  for (const k of [...order.filter((k) => !into.has(k)), ...order]) if (!state.has(k)) walk(k);
  const dag = forward.filter((e) => !back.has(e.id));
  // Longest path from the top.
  const layer = new Map<string, number>(order.map((k) => [k, 0]));
  for (let i = 0; i < order.length; i++) {
    let moved = false;
    for (const e of dag) if (layer.get(e.to)! < layer.get(e.from)! + 1) (layer.set(e.to, layer.get(e.from)! + 1), (moved = true));
    if (!moved) break;
  }
  const layers: string[][] = [];
  for (const k of order) (layers[layer.get(k)!] ??= []).push(k);
  // Near what each is joined to.
  const joined = new Map<string, string[]>(order.map((k) => [k, []]));
  for (const e of dag) (joined.get(e.from)!.push(e.to), joined.get(e.to)!.push(e.from));
  const position = new Map<string, number>();
  const place = () => layers.forEach((l) => l.forEach((k, i) => position.set(k, i)));
  place();
  for (let pass = 0; pass < 4; pass++) {
    const sweep = pass % 2 === 0 ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const l of sweep) {
      const centre = (k: string) => {
        const near = joined.get(k)!.filter((o) => Math.abs(layer.get(o)! - layer.get(k)!) === 1);
        return near.length ? near.reduce((s, o) => s + position.get(o)!, 0) / near.length : position.get(k)!;
      };
      l.sort((a, b) => centre(a) - centre(b) || a.localeCompare(b));
      place();
    }
  }
  const widest = Math.max(1, ...layers.map((l) => l.length));
  const at = new Map<string, { x: number; y: number; layer: number }>();
  layers.forEach((l, li) => l.forEach((k, i) => at.set(k, { x: (i - (l.length - 1) / 2) * COLUMN + ((widest - 1) / 2) * COLUMN, y: li * ROW, layer: li })));
  return { at, back, width: widest * COLUMN, height: layers.length * ROW };
}

/** Everything one ability is joined to along its paths, both ways and as far as they go: what leads to it, what it leads to, what it excludes. */
export function pathsOf(tree: AbilityTree, key: string): Set<string> {
  const seen = new Set([key]);
  for (const dir of ['up', 'down'] as const) {
    const todo = [key];
    while (todo.length) {
      const here = todo.pop()!;
      for (const e of tree.edges) {
        if (e.role === 'exclusive' || e.role === 'other') continue;
        const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
        if (a === here && !seen.has(b)) (seen.add(b), todo.push(b));
      }
    }
  }
  for (const e of tree.edges) if ((e.role === 'exclusive' || e.role === 'other') && (e.from === key || e.to === key)) (seen.add(e.from), seen.add(e.to));
  return seen;
}
