// ABILITY PATHS (as in the original app). Abilities, skills, techniques, transformations, classes, upgrades (from any
// system blueprint, and from any kind of record the author marks as one) and the paths the author records between
// them. Every path says only what it says: a prerequisite must be held first; an upgrade, an evolution, a fusion or a
// replacement is something else, and is never read as a prerequisite. Nothing is worked out from names. What is wrong
// is said, never fixed. A port of flutter_app/lib/shared/domain/abilities/paths.dart.

import { fieldOf } from '../codex/capabilities';
import { displayValue } from '../codex/fieldValues';
import { localeCompare } from '../collation';
import { type Connection, deriveConnections } from '../model/connections';
import { EntityRef } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import { Anchor } from '../model/validity';
import { type ProgressSnapshot, inStoryOrder, placeOfSnapshot, stateAt } from '../progression/snapshots';
import { inOrder, progressAt, whenWords } from '../progression/track';
import { stableSorted } from '../reader/stableSort';
import { connectionType } from '../records/link';
import type { ProgressChange } from '../records/progress';
import type { StoryNode } from '../records/storyNode';
import { type SysItem, type SystemBlueprint, isSystemOn } from '../records/system';
import { checkFormula, groupNamed } from '../systems/compute';
import { type FNode, parseFormula } from '../systems/formula';
import { dartToLowerCase, dartTrim } from '../text/dartString';

export type PathRole =
  | 'prerequisite'
  | 'alternative'
  | 'rule'
  | 'upgrade'
  | 'evolution'
  | 'fusion'
  | 'replacement'
  | 'branch'
  | 'exclusive'
  | 'other';
export const pathRoles: readonly PathRole[] = [
  'prerequisite',
  'alternative',
  'rule',
  'upgrade',
  'evolution',
  'fusion',
  'replacement',
  'branch',
  'exclusive',
  'other',
];
export const pathRoleLabel: Readonly<Record<PathRole, string>> = {
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

/** The recorded connection types that are paths, and what each means. */
export const pathTypes: ReadonlyMap<string, PathRole> = new Map<string, PathRole>([
  ['prerequisite-for', 'prerequisite'],
  ['alternative-for', 'alternative'],
  ['upgrades-to', 'upgrade'],
  ['evolves-into', 'evolution'],
  ['fuses-into', 'fusion'],
  ['replaced-by', 'replacement'],
  ['excludes', 'exclusive'],
]);

/** What must be held first: the only paths that decide whether something can be gained. */
const requiresRoles: readonly PathRole[] = ['prerequisite', 'rule'];
/** Paths that run from one ability on to the next: the tree's layers follow them. */
const forwardRoles: readonly PathRole[] = ['prerequisite', 'alternative', 'rule', 'upgrade', 'evolution', 'fusion', 'replacement', 'branch'];
/** Paths along which one thing becomes another. */
const becomesRoles: readonly PathRole[] = ['upgrade', 'evolution', 'fusion', 'replacement', 'branch'];

export type Holder = { id: string; name: string; how: string };

/** Gained or lost by a recorded change, or first held in a snapshot. `action`: gain, lose, happen or snapshot. */
export type Acquisition = { entryId: string; name: string; action: string; when: string; changeId: string | null; snapshotId: string | null };

export type AbilityNode = {
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
};

export type PathEdge = {
  id: string;
  from: string;
  to: string;
  role: PathRole;
  /** How it reads from `from`. */
  label: string;
  directed: boolean;
  /** The recorded connection's own id (to change or remove it); null for one read from a blueprint. */
  linkId: string | null;
};

export type AbilityTree = {
  nodes: AbilityNode[];
  edges: PathEdge[];
  /** Path connections with an end that is not an ability or the like: listed, not drawn. */
  notDrawn: { connection: Connection; reason: string }[];
};

const systemColors = ['#2b7a8c', '#7a4fa3', '#a3622b', '#4f5fa3', '#6b7a2b', '#a8436b'];
const lower = (s: string) => dartToLowerCase(dartTrim(s));

/** The item a requirement names ("Skill: Fire Lance"), in the same blueprint. */
function namedItem(system: SystemBlueprint, group: string, name: string): SysItem | null {
  const wanted = lower(group);
  const found = system.groupList.find((g) => groupNamed(g, wanted));
  return found === undefined ? null : (system.items.find((i) => i.groupId === found.id && lower(i.name) === lower(name)) ?? null);
}

function holdsIn(node: FNode): { group: string; name: string }[] {
  switch (node.kind) {
    case 'holds':
      return [{ group: node.group, name: node.name }];
    case 'unary':
      return holdsIn(node.operand);
    case 'binary':
      return [...holdsIn(node.left), ...holdsIn(node.right)];
    case 'call':
      return node.args.flatMap(holdsIn);
    default:
      return [];
  }
}

const keyOfChange = (c: ProgressChange): string | null =>
  c.abilityId !== null ? `ability:${c.abilityId}` : c.refId !== null ? `entry:${c.refId}` : null;

/** Everything the ability paths are drawn from. Abilities are: every item of every system blueprint; every codex
 * record of a kind set to be shown in the ability tree; and any other record (never a character) at an end of a path
 * the author recorded. */
export function abilityTree(model: StoryModel, snapshots: readonly ProgressSnapshot[] = []): AbilityTree {
  const connections = deriveConnections(model).connections;
  const nodes = new Map<string, AbilityNode>();
  const systemIndex = new Map([...model.allSystems.keys()].map((id, i) => [id, i]));
  // An off system's abilities are on no path, and a recorded path to one is skipped quietly.
  const isOff = (ref: EntityRef): boolean => {
    const system = ref.type === 'ability' ? model.abilities.get(ref.id)?.system : undefined;
    return system !== undefined && !isSystemOn(system);
  };
  const eligible = (ref: EntityRef): boolean =>
    ref.type === 'ability'
      ? model.abilities.has(ref.id) && !isOff(ref)
      : ref.type === 'entry'
        ? (model.entries.get(ref.id)?.category ?? 'character') !== 'character'
        : false;

  const add = (ref: EntityRef) => {
    const key = ref.key;
    if (nodes.has(key) || !eligible(ref)) return;
    if (ref.type === 'ability') {
      const record = model.abilities.get(ref.id)!;
      const system = record.system;
      const item = record.item;
      const variables = new Map(system.variables.map((v) => [v.key, v.name]));
      const limits = [
        ...item.costs.filter((c) => dartTrim(c.amount).length > 0).map((c) => `Costs ${c.amount} ${variables.get(c.target) ?? c.target}`),
        ...(dartTrim(item.cooldown).length > 0 ? [`Cooldown ${dartTrim(item.cooldown)}`] : []),
      ];
      const rank = system.rankName(item);
      nodes.set(key, {
        key,
        ref,
        name: item.name,
        source: `${system.name}${record.group.length > 0 ? ` · ${record.group}` : ''}`,
        sourceKey: `system:${system.id}`,
        color: systemColors[(systemIndex.get(system.id) ?? 0) % systemColors.length],
        rank: rank.length === 0 ? null : rank,
        requires: dartTrim(item.requires),
        limits,
        holders: [],
        acquired: [],
      });
    } else {
      const entry = model.entries.get(ref.id)!;
      const category = model.categories.get(entry.category) ?? null;
      const rankDef = category === null ? null : fieldOf(category, 'rank', category.uses['rank']);
      const rankValue =
        rankDef === null ? '' : displayValue(rankDef.type, entry.fields.find((f) => f.defId === rankDef.id)?.value ?? '', () => null);
      nodes.set(key, {
        key,
        ref,
        name: entry.name,
        source: category?.name ?? 'Codex',
        sourceKey: `kind:${entry.category}`,
        color: category?.color ?? '#5c6370',
        rank: rankValue.length === 0 ? null : rankValue,
        requires: '',
        limits: [],
        holders: [],
        acquired: [],
      });
    }
  };

  for (const id of model.abilities.keys()) add(new EntityRef('ability', id));
  for (const entry of model.entries.values()) {
    if (model.categories.get(entry.category)?.uses['tree'] === true) add(new EntityRef('entry', entry.id));
  }
  const isPath = (c: Connection) => c.kind === 'link' && pathTypes.has(connectionType(c.type).key);
  const notDrawn: AbilityTree['notDrawn'] = [];
  for (const c of connections.filter(isPath)) {
    if ([c.from, c.to].some(isOff)) continue;
    const bad = [c.from, c.to].find((end) => !eligible(end));
    if (bad === undefined) {
      add(c.from);
      add(c.to);
    } else {
      notDrawn.push({
        connection: c,
        reason:
          bad.type === 'entry'
            ? 'one end is a character: who holds what is read from sheets and progression, not drawn as a path'
            : 'one end is not an ability, skill, item or the like',
      });
    }
  }

  // Paths between two abilities: recorded connections, fields, and a blueprint's branches.
  const edges: PathEdge[] = [];
  for (const c of connections) {
    const a = c.from.key;
    const b = c.to.key;
    if (!nodes.has(a) || !nodes.has(b)) continue;
    if (c.kind === 'link') {
      const role = pathTypes.get(connectionType(c.type).key) ?? 'other';
      edges.push({
        id: c.id,
        from: a,
        to: b,
        role,
        label: c.label.length > 0 ? c.label : connectionType(c.type).label,
        directed: role === 'exclusive' ? false : role === 'other' ? c.directed : true,
        linkId: c.source.id,
      });
    } else if (c.kind === 'branches-from') {
      edges.push({ id: c.id, from: b, to: a, role: 'branch', label: 'Branches into', directed: true, linkId: null });
    } else if (c.kind === 'field') {
      edges.push({ id: c.id, from: a, to: b, role: 'other', label: c.label, directed: true, linkId: null });
    }
  }
  // A blueprint item's requirement rule, where it names another of the blueprint's items.
  for (const node of nodes.values()) {
    if (node.ref.type !== 'ability' || node.requires.length === 0) continue;
    const system = model.abilities.get(node.ref.id)!.system;
    let tree: FNode;
    try {
      tree = parseFormula(node.requires);
    } catch {
      continue;
    }
    for (const { group, name } of holdsIn(tree)) {
      const item = namedItem(system, group, name);
      const from = item === null ? null : `ability:${system.id}/${item.id}`;
      if (from !== null && nodes.has(from) && !edges.some((e) => e.role === 'rule' && e.from === from && e.to === node.key)) {
        edges.push({ id: `rule:${from}>${node.key}`, from, to: node.key, role: 'rule', label: 'Named in the requirement of', directed: true, linkId: null });
      }
    }
  }

  // Who holds each, and when it was gained: system sheets, the latest snapshot, and the progression change by change.
  const nameOf = (id: string) => model.entries.get(id)?.name ?? 'Someone deleted';
  const hold = (key: string, holder: Holder) => {
    const node = nodes.get(key);
    if (node !== undefined && !node.holders.some((h) => h.id === holder.id)) node.holders.push(holder);
  };
  for (const sheet of model.sheets) {
    for (const itemId of sheet.itemIds) {
      hold(`ability:${sheet.systemId}/${itemId}`, { id: sheet.entryId, name: nameOf(sheet.entryId), how: 'on their system sheet' });
    }
  }
  const documents = [...model.nodes.values()];
  for (const entryId of new Set(snapshots.map((s) => s.entryId))) {
    if (!model.entries.has(entryId)) continue;
    const ordered = inStoryOrder(snapshots, documents, entryId);
    const firsts = new Map<string, ProgressSnapshot>();
    for (const snap of ordered) {
      for (const [systemId, state] of snap.systems) {
        for (const itemId of state.itemIds) {
          const k = `${systemId}/${itemId}`;
          if (!firsts.has(k)) firsts.set(k, snap);
        }
      }
    }
    for (const [id, snap] of firsts) {
      nodes.get(`ability:${id}`)?.acquired.push({
        entryId,
        name: nameOf(entryId),
        action: 'snapshot',
        when: `first in a snapshot at ${placeOfSnapshot(snap, documents)}`,
        changeId: null,
        snapshotId: snap.id,
      });
    }
    const latest = ordered.length === 0 ? null : ordered[ordered.length - 1];
    for (const [systemId, state] of latest?.systems ?? new Map()) {
      for (const itemId of state.itemIds) {
        hold(`ability:${systemId}/${itemId}`, {
          id: entryId,
          name: nameOf(entryId),
          how: `in their latest snapshot (${placeOfSnapshot(latest!, documents)})`,
        });
      }
    }
  }
  const changed = new Set<string>();
  for (const c of model.progress) {
    const k = keyOfChange(c);
    if (k !== null && nodes.has(k)) changed.add(c.entryId);
  }
  for (const entryId of changed) {
    if (!model.entries.has(entryId)) continue;
    for (const change of inOrder(model, entryId)) {
      const key = keyOfChange(change);
      if (key !== null && nodes.has(key)) {
        nodes.get(key)!.acquired.push({
          entryId,
          name: nameOf(entryId),
          action: change.action === 'lose' ? 'lose' : change.action === 'happen' ? 'happen' : 'gain',
          when: whenWords(change.at, model),
          changeId: change.id,
          snapshotId: null,
        });
      }
    }
    for (const state of progressAt(model, entryId, null).categories) {
      if (state.category.shape !== 'held') continue;
      for (const line of state.lines) {
        const key = keyOfChange(line.change);
        if (key !== null) hold(key, { id: entryId, name: nameOf(entryId), how: 'as of the end, by their progression' });
      }
    }
  }
  for (const node of nodes.values()) {
    const sorted = stableSorted(node.holders, (a, b) => localeCompare(a.name, b.name));
    node.holders.splice(0, node.holders.length, ...sorted);
  }
  return {
    nodes: stableSorted(nodes.values(), (a, b) => {
      const s = localeCompare(a.source, b.source);
      return s !== 0 ? s : localeCompare(a.name, b.name);
    }),
    edges,
    notDrawn,
  };
}

// ------------------------------------------------------------------------------------------- what does not add up

export type ProblemKind = 'cycle' | 'conflict' | 'unreachable' | 'rule' | 'loop' | 'fusion' | 'holder';
const problemKinds: readonly ProblemKind[] = ['cycle', 'conflict', 'unreachable', 'rule', 'loop', 'fusion', 'holder'];

export type PathProblem = {
  key: string;
  kind: ProblemKind;
  /** `problem` stops something from ever being gained, or cannot be read; a `note` may well be meant. */
  severity: 'problem' | 'note';
  message: string;
  nodes: string[];
};

/** Groups of nodes that reach each other along the edges (Tarjan), each with more than one node or a loop onto
 * itself. */
function cycles(keys: readonly string[], edges: readonly PathEdge[]): string[][] {
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
      } else if (on.has(w)) {
        low.set(v, Math.min(low.get(v)!, at.get(w)!));
      }
    }
    if (low.get(v) === at.get(v)) {
      const group: string[] = [];
      // Counted: the stack holds at most every node once.
      for (let guard = 0; guard <= keys.length; guard++) {
        const w = stack.pop()!;
        on.delete(w);
        group.push(w);
        if (w === v) break;
      }
      if (group.length > 1 || (next.get(v) ?? []).includes(v)) out.push(group.reverse());
    }
  };
  for (const k of keys) if (!at.has(k)) visit(k);
  return out;
}

/** One way round a cycle, in names: "Fire Lance → Flame Wall → Fire Lance". */
function aroundCycle(group: readonly string[], edges: readonly PathEdge[], name: (key: string) => string): string {
  const inside = new Set(group);
  const path = [group[0]];
  const seen = new Set([group[0]]);
  // Counted: each step adds an unseen node of the group, or closes the loop.
  for (let guard = 0; guard <= group.length; guard++) {
    const here = path[path.length - 1];
    const step = edges.find((e) => e.from === here && inside.has(e.to) && (!seen.has(e.to) || e.to === group[0]));
    if (step === undefined) break;
    path.push(step.to);
    if (step.to === group[0]) break;
    seen.add(step.to);
  }
  return path.map(name).join(' → ');
}

/** Everything about the paths that does not add up, in words. Nothing here changes a record. */
export function pathProblems(tree: AbilityTree, model: StoryModel): PathProblem[] {
  const out: PathProblem[] = [];
  const byKey = new Map(tree.nodes.map((n) => [n.key, n]));
  const name = (key: string) => byKey.get(key)?.name ?? 'something deleted';
  const keys = tree.nodes.map((n) => n.key);
  const requires = tree.edges.filter((e) => requiresRoles.includes(e.role));
  const alternatives = tree.edges.filter((e) => e.role === 'alternative');
  const exclusive = new Set(tree.edges.filter((e) => e.role === 'exclusive').flatMap((e) => [`${e.from}|${e.to}`, `${e.to}|${e.from}`]));
  const sortedKey = (group: readonly string[]) => [...group].sort(byCodeUnits).join('|');

  // Requirement cycles: nothing in one can ever be gained.
  const inCycle = new Set<string>();
  for (const group of cycles(keys, requires)) {
    for (const k of group) inCycle.add(k);
    out.push({
      key: `paths|cycle|${sortedKey(group)}`,
      kind: 'cycle',
      severity: 'problem',
      message:
        group.length === 1
          ? `${name(group[0])} requires itself, so it can never be gained.`
          : `A cycle of requirements: ${aroundCycle(group, requires, name)}. None of them can ever be gained while each requires the next.`,
      nodes: group,
    });
  }
  // Loops of upgrades, evolutions, replacements, fusions: may be meant; a blueprint's branches may not loop.
  for (const role of ['branch', 'becomes'] as const) {
    const along = tree.edges.filter((e) => (role === 'branch' ? e.role === 'branch' : becomesRoles.includes(e.role) && e.role !== 'branch'));
    for (const group of cycles(keys, along)) {
      out.push(
        role === 'branch'
          ? {
              key: `paths|branch-cycle|${sortedKey(group)}`,
              kind: 'cycle',
              severity: 'problem',
              message: `Blueprint items branch from each other in a loop: ${aroundCycle(group, along, name)}. Each item can branch from only one that comes before it.`,
              nodes: group,
            }
          : {
              key: `paths|loop|${sortedKey(group)}`,
              kind: 'loop',
              severity: 'note',
              message: `A loop of upgrades, evolutions, fusions or replacements: ${aroundCycle(group, along, name)}. It may be meant (a form taken and left again); it is said here so it is not missed.`,
              nodes: group,
            },
      );
    }
  }

  // What can be gained at all, by the requirements as recorded.
  const needs = new Map(keys.map((k) => [k, requires.filter((e) => e.to === k).map((e) => e.from)]));
  const either = new Map(keys.map((k) => [k, alternatives.filter((e) => e.to === k).map((e) => e.from)]));
  const closure = (k: string): string[] => {
    const all = new Set([k]);
    const order = [k];
    const todo = [k];
    while (todo.length > 0) {
      for (const r of needs.get(todo.pop()!) ?? []) {
        if (!all.has(r)) {
          all.add(r);
          order.push(r);
          todo.push(r);
        }
      }
    }
    return order;
  };
  const clash = new Map<string, [string, string]>();
  for (const k of keys) {
    const all = closure(k);
    for (let i = 0; i < all.length && !clash.has(k); i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (exclusive.has(`${all[i]}|${all[j]}`)) clash.set(k, [all[i], all[j]]);
      }
    }
  }
  const gainable = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const k of keys) {
      if (gainable.has(k) || clash.has(k)) continue;
      const alts = either.get(k)!;
      if (needs.get(k)!.every((r) => gainable.has(r)) && (alts.length === 0 || alts.some((a) => gainable.has(a)))) {
        gainable.add(k);
        changed = true;
      }
    }
  }
  for (const k of keys) {
    if (gainable.has(k)) continue;
    const pair = clash.get(k);
    if (pair !== undefined) {
      const [a, b] = pair;
      out.push({
        key: `paths|conflict|${k}`,
        kind: 'conflict',
        severity: 'problem',
        message:
          a === k || b === k
            ? `${name(k)} requires ${name(a === k ? b : a)}, with which it is mutually exclusive, so it can never be gained.`
            : `${name(k)} requires both ${name(a)} and ${name(b)}, which are mutually exclusive, so it can never be gained.`,
        nodes: [...new Set([k, a, b])],
      });
      continue;
    }
    if (inCycle.has(k)) continue; // said with its cycle
    const blocked = needs.get(k)!.find((r) => !gainable.has(r));
    const alts = either.get(k)!;
    out.push({
      key: `paths|unreachable|${k}`,
      kind: 'unreachable',
      severity: 'problem',
      message:
        blocked !== undefined
          ? `${name(k)} can never be gained: it requires ${name(blocked)}, which can never be gained.`
          : `${name(k)} can never be gained: none of its alternative prerequisites (${alts.map(name).join(', ')}) can be gained.`,
      nodes: [k, ...(blocked !== undefined ? [blocked] : alts)],
    });
  }

  // A fusion of one thing.
  for (const k of keys) {
    const from = tree.edges.filter((e) => e.role === 'fusion' && e.to === k).map((e) => e.from);
    if (from.length === 1) {
      out.push({
        key: `paths|fusion|${k}`,
        kind: 'fusion',
        severity: 'note',
        message: `${name(k)} is fused from ${name(from[0])} alone. A fusion is usually of two or more: add the others, or record it as an upgrade or evolution.`,
        nodes: [k, from[0]],
      });
    }
  }

  // Requirement rules that cannot be read.
  for (const node of tree.nodes) {
    if (node.ref.type !== 'ability' || node.requires.length === 0) continue;
    const system = model.abilities.get(node.ref.id)!.system;
    const check = checkFormula(system, node.requires, { condition: true });
    if (!check.ok) {
      out.push({
        key: `paths|rule|${node.key}`,
        kind: 'rule',
        severity: 'problem',
        message: `${node.name}’s requirement rule “${node.requires}” cannot be read: ${check.error}`,
        nodes: [node.key],
      });
    }
  }

  // Holders: holding something without what it requires, or holding two things that exclude each other.
  const holds = (key: string, id: string) => byKey.get(key)?.holders.some((h) => h.id === id) ?? false;
  const becomes = (from: string, to: string): boolean => {
    const seen = new Set([from]);
    const todo = [from];
    while (todo.length > 0) {
      const here = todo.pop()!;
      for (const e of tree.edges) {
        if (e.from === here && becomesRoles.includes(e.role) && !seen.has(e.to)) {
          seen.add(e.to);
          todo.push(e.to);
        }
      }
    }
    return seen.has(to);
  };
  for (const node of tree.nodes) {
    for (const holder of node.holders) {
      for (const r of needs.get(node.key)!) {
        if (!holds(r, holder.id) && !becomes(r, node.key)) {
          out.push({
            key: `paths|holder|${holder.id}|${node.key}|${r}`,
            kind: 'holder',
            severity: 'note',
            message: `${holder.name} holds ${node.name} without ${name(r)}, which it requires.`,
            nodes: [node.key, r],
          });
        }
      }
      const alts = either.get(node.key)!;
      if (alts.length > 0 && !alts.some((a) => holds(a, holder.id) || becomes(a, node.key))) {
        out.push({
          key: `paths|holder|${holder.id}|${node.key}|alternatives`,
          kind: 'holder',
          severity: 'note',
          message: `${holder.name} holds ${node.name} without any of its alternative prerequisites (${alts.map(name).join(', ')}).`,
          nodes: [node.key, ...alts],
        });
      }
    }
  }
  for (const e of tree.edges.filter((x) => x.role === 'exclusive')) {
    for (const holder of byKey.get(e.from)?.holders ?? []) {
      if (holds(e.to, holder.id)) {
        out.push({
          key: `paths|holder|${holder.id}|${e.id}`,
          kind: 'holder',
          severity: 'note',
          message: `${holder.name} holds both ${name(e.from)} and ${name(e.to)}, which are mutually exclusive.`,
          nodes: [e.from, e.to],
        });
      }
    }
  }
  return stableSorted(out, (a, b) => {
    const k = problemKinds.indexOf(a.kind) - problemKinds.indexOf(b.kind);
    return k !== 0 ? k : localeCompare(a.message, b.message);
  });
}

/** Dart's `List<String>.sort()`: by UTF-16 code units. */
function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ----------------------------------------------------------------------------------------------- the tree's shape

export const pathColumn = 190;
export const pathRow = 120;

export type TreeLayout = {
  at: Map<string, { x: number; y: number; layer: number }>;
  /** Paths that run against the layers (part of a loop): drawn, but bent back. */
  back: Set<string>;
  width: number;
  height: number;
};

/** Layers from the top: each ability one layer below the furthest of those its forward paths come from (a loop is
 * broken where it closes, and that path is drawn bending back). Within a layer, each sits near what it is joined to
 * (a few passes of the barycentre method). The same records give the same layout every time. */
export function treeLayout(keys: readonly string[], edges: readonly PathEdge[]): TreeLayout {
  const order = [...keys].sort(byCodeUnits);
  const known = new Set(order);
  const forward = stableSorted(
    edges.filter((e) => forwardRoles.includes(e.role) && known.has(e.from) && known.has(e.to) && e.from !== e.to),
    (a, b) => localeCompare(a.id, b.id),
  );
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
  const layer = new Map(order.map((k) => [k, 0]));
  for (let i = 0; i < order.length; i++) {
    let moved = false;
    for (const e of dag) {
      if (layer.get(e.to)! < layer.get(e.from)! + 1) {
        layer.set(e.to, layer.get(e.from)! + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const depth = order.length === 0 ? 0 : Math.max(...order.map((k) => layer.get(k)!)) + 1;
  const layers: string[][] = Array.from({ length: depth }, () => []);
  for (const k of order) layers[layer.get(k)!].push(k);
  // Near what each is joined to.
  const joined = new Map<string, string[]>(order.map((k) => [k, []]));
  for (const e of dag) {
    joined.get(e.from)!.push(e.to);
    joined.get(e.to)!.push(e.from);
  }
  const position = new Map<string, number>();
  const place = () => {
    for (const l of layers) l.forEach((k, i) => position.set(k, i));
  };
  place();
  for (let pass = 0; pass < 4; pass++) {
    const sweep = pass % 2 === 0 ? layers.slice(1) : layers.slice(0, Math.max(0, layers.length - 1)).reverse();
    for (const l of sweep) {
      const centre = (k: string): number => {
        const near = joined.get(k)!.filter((o) => Math.abs(layer.get(o)! - layer.get(k)!) === 1);
        return near.length === 0 ? position.get(k)! : near.reduce((s, o) => s + position.get(o)!, 0) / near.length;
      };
      // Dart's List.sort is not stable either way; the key ties break by name, so the order is the same.
      const centres = new Map(l.map((k) => [k, centre(k)]));
      l.sort((a, b) => {
        const c = centres.get(a)! - centres.get(b)!;
        return c !== 0 ? Math.sign(c) : localeCompare(a, b);
      });
      place();
    }
  }
  const widest = Math.max(1, layers.reduce((m, l) => Math.max(m, l.length), 0));
  const at = new Map<string, { x: number; y: number; layer: number }>();
  layers.forEach((l, li) => {
    l.forEach((k, i) => {
      at.set(k, { x: (i - (l.length - 1) / 2) * pathColumn + ((widest - 1) / 2) * pathColumn, y: li * pathRow, layer: li });
    });
  });
  return { at, back, width: widest * pathColumn, height: layers.length * pathRow };
}

/** Everything one ability is joined to along its paths, both ways and as far as they go. */
export function pathsOf(tree: AbilityTree, key: string): Set<string> {
  const seen = new Set([key]);
  for (const down of [false, true]) {
    const todo = [key];
    while (todo.length > 0) {
      const here = todo.pop()!;
      for (const e of tree.edges) {
        if (e.role === 'exclusive' || e.role === 'other') continue;
        const [a, b] = down ? [e.from, e.to] : [e.to, e.from];
        if (a === here && !seen.has(b)) {
          seen.add(b);
          todo.push(b);
        }
      }
    }
  }
  for (const e of tree.edges) {
    if ((e.role === 'exclusive' || e.role === 'other') && (e.from === key || e.to === key)) {
      seen.add(e.from);
      seen.add(e.to);
    }
  }
  return seen;
}

/** The story nodes, for `inStoryOrder` and the like. */
export function documentsOf(model: StoryModel): StoryNode[] {
  return [...model.nodes.values()];
}

// ---------------------------------------------------------------------------------------------------- one character

/** Where an ability stands for one character, as the tree is seen through them. */
export type Standing = 'held' | 'available' | 'locked';
export const standingsInOrder: readonly Standing[] = ['held', 'available', 'locked'];
export const standingLabel: Readonly<Record<Standing, string>> = { held: 'Held', available: 'Can be gained', locked: 'Locked' };

/** What a character holds, as of a chapter or scene (`atNodeId`; null for the end of the story). */
export function heldBy(model: StoryModel, snapshots: readonly ProgressSnapshot[], entryId: string, atNodeId: string | null = null): Set<string> {
  const keys = new Set<string>();
  for (const sheet of model.sheets) {
    if (sheet.entryId !== entryId) continue;
    for (const itemId of sheet.itemIds) keys.add(`ability:${sheet.systemId}/${itemId}`);
  }
  const documents = [...model.nodes.values()];
  const ordered = atNodeId === null ? inStoryOrder(snapshots, documents, entryId) : null;
  const snap =
    atNodeId === null ? (ordered!.length === 0 ? null : ordered![ordered!.length - 1]) : stateAt(snapshots, documents, entryId, atNodeId);
  for (const [systemId, state] of snap?.systems ?? new Map()) {
    for (const itemId of state.itemIds) keys.add(`ability:${systemId}/${itemId}`);
  }
  if (model.progress.some((c) => c.entryId === entryId)) {
    for (const state of progressAt(model, entryId, atNodeId === null ? null : Anchor.node(atNodeId)).categories) {
      if (state.category.shape !== 'held') continue;
      for (const line of state.lines) {
        const key = keyOfChange(line.change);
        if (key !== null) keys.add(key);
      }
    }
  }
  return keys;
}

/** Where each ability of `tree` stands for someone who holds `held`. Only the paths recorded decide it. */
export function standings(tree: AbilityTree, held: ReadonlySet<string>): Map<string, Standing> {
  const requires = new Map<string, string[]>(tree.nodes.map((n) => [n.key, []]));
  const alternatives = new Map<string, string[]>(tree.nodes.map((n) => [n.key, []]));
  const excludes = new Map<string, Set<string>>(tree.nodes.map((n) => [n.key, new Set()]));
  for (const e of tree.edges) {
    if (requiresRoles.includes(e.role)) requires.get(e.to)?.push(e.from);
    if (e.role === 'alternative') alternatives.get(e.to)?.push(e.from);
    if (e.role === 'exclusive') {
      excludes.get(e.from)?.add(e.to);
      excludes.get(e.to)?.add(e.from);
    }
  }
  return new Map(
    tree.nodes.map((n): [string, Standing] => [
      n.key,
      held.has(n.key)
        ? 'held'
        : requires.get(n.key)!.every((r) => held.has(r)) &&
            (alternatives.get(n.key)!.length === 0 || alternatives.get(n.key)!.some((a) => held.has(a))) &&
            ![...excludes.get(n.key)!].some((x) => held.has(x))
          ? 'available'
          : 'locked',
    ]),
  );
}

/** Why an ability is locked for someone who holds `held`, in words: what is missing, or what excludes it. */
export function lockedBecause(tree: AbilityTree, key: string, held: ReadonlySet<string>, name: (key: string) => string): string {
  const missing = tree.edges.filter((e) => e.to === key && requiresRoles.includes(e.role) && !held.has(e.from)).map((e) => name(e.from));
  const alternatives = tree.edges.filter((e) => e.to === key && e.role === 'alternative').map((e) => e.from);
  const excluded = tree.edges
    .filter((e) => e.role === 'exclusive' && (e.from === key || e.to === key))
    .map((e) => (e.from === key ? e.to : e.from))
    .filter((other) => held.has(other))
    .map(name);
  return [
    ...(missing.length > 0 ? [`Needs ${missing.join(', ')}.`] : []),
    ...(alternatives.length > 0 && !alternatives.some((a) => held.has(a)) ? [`Needs one of ${alternatives.map(name).join(', ')}.`] : []),
    ...(excluded.length > 0 ? [`Excluded by ${excluded.join(', ')}, which is held.`] : []),
  ].join(' ');
}
