import { connectionType } from '@/modules/connections/types';
import { statusOf } from '@/modules/integrity/rules';
import { fieldOf } from '@/modules/codex/capabilities';
import { displayValue, unknownCategory } from '@/modules/codex/schema';
import { isGroup } from '@/modules/manuscript/tree';
import { deriveConnections } from '@/modules/model/connections';
import { resolveRef } from '@/modules/model/model';
import type { Connection, ConnectionKind, EntityRef, StoryModel } from '@/modules/model/types';

/**
 * THE KNOWLEDGE GRAPH
 * Every record of the novel as a node (characters, places, factions, items,
 * species and any category the author makes; abilities; events; chapters
 * and scenes and the parts they sit in; plot threads) and every connection
 * the shared model reads as an edge, each with its type: owns, created by,
 * caused, took place at, appears in, knows about, the author's own types, and
 * the links the app keeps (told in, part of, takes part in…). Nothing is
 * stored for the graph: it is the records and their connections, as they are.
 */
export interface GraphNode {
  /** `entry:<id>`, `event:<id>`… unique across record types. */
  key: string;
  /** The record it is; null for a group of records folded together. */
  ref: EntityRef | null;
  /** Its node type: `entry:<category>`, `event`, `chapter`, `scene`, `part`, `thread` or `ability`. */
  type: string;
  label: string;
  /** The record's own name, when its kind labels it in the graph by a field instead. */
  aka?: string;
  color: string;
  /** Connections it has in the whole novel. */
  degree: number;
}
export interface GraphEdge {
  /** The connection's own stable id. */
  id: string;
  from: string;
  to: string;
  kind: ConnectionKind;
  /** Its edge type: `link:<type>` for a stored connection, else the kind. */
  type: string;
  /** How it reads from its `from` side, and from its `to` side when that differs. */
  label: string;
  reverseLabel?: string;
  directed: boolean;
  connection: Connection;
}
export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Connections one end of which no longer exists: left out, and counted. */
  dangling: number;
  /** Kinds of record (categories) set not to appear in the graph, and how many records that leaves out. */
  excluded?: { category: string; count: number }[];
  /** Link fields a kind of record set not to be drawn, and how many connections that leaves out. */
  undrawn?: { category: string; field: string; count: number }[];
}

export const keyOf = (ref: EntityRef) => `${ref.type}:${ref.id}`;
export function refOf(key: string): EntityRef | null {
  const at = key.indexOf(':');
  const [type, id] = [key.slice(0, at), key.slice(at + 1)];
  return at > 0 && id && ['node', 'entry', 'event', 'thread', 'relation', 'ability'].includes(type) ? ({ type, id } as EntityRef) : null;
}

const FIXED_TYPES: Record<string, { label: string; color: string }> = {
  event: { label: 'Events', color: '#c08a1e' },
  chapter: { label: 'Chapters', color: '#64748b' },
  scene: { label: 'Scenes', color: '#94a3b8' },
  part: { label: 'Volumes, acts and arcs', color: '#334155' },
  thread: { label: 'Plot threads', color: '#7a4fa3' },
  ability: { label: 'Abilities', color: '#2b7a8c' },
};

/** A node type in words: a category's plural name, or the fixed names. */
export function nodeTypeLabel(type: string, model: Pick<StoryModel, 'categories'>): string {
  if (type.startsWith('entry:')) {
    const key = type.slice(6);
    return (model.categories.get(key) ?? unknownCategory(key)).name;
  }
  return FIXED_TYPES[type]?.label ?? type;
}
export function nodeTypeColor(type: string, model: Pick<StoryModel, 'categories'>): string {
  if (type.startsWith('entry:')) {
    const key = type.slice(6);
    return (model.categories.get(key) ?? unknownCategory(key)).color;
  }
  return FIXED_TYPES[type]?.color ?? '#8a8276';
}

const KIND_LABELS: Record<ConnectionKind, string> = {
  'part-of': 'Part of',
  link: 'Related to',
  relationship: 'Character relationship',
  field: 'Named in a field',
  mentioned: 'Linked in the text of',
  present: 'Involved in (chapter plan)',
  appearance: 'Appearance record',
  participant: 'Takes part in',
  involved: 'Involved in (event)',
  'occurs-at': 'Takes place at',
  'told-in': 'Told in',
  follows: 'Comes after',
  'dated-from': 'Dated from',
  'in-thread': 'Belongs to the thread',
  'thread-entry': 'Thread involves',
  beat: 'Thread develops in',
  'resolves-in': 'Thread meant to resolve in',
  holds: 'Has the ability',
  'branches-from': 'Branches from',
  progress: 'Progression change',
  travel: 'Journey',
};

export const edgeTypeOf = (c: Pick<Connection, 'kind' | 'type'>): string => (c.kind === 'link' ? `link:${connectionType(c.type).key}` : c.kind);
/** An edge type in words: a stored connection's type ("Owns", "Created by", the author's own word), or what the app keeps. */
export const edgeTypeLabel = (type: string): string => (type.startsWith('link:') ? connectionType(type.slice(5)).label : (KIND_LABELS[type as ConnectionKind] ?? type));

/** A record's node type. */
export function nodeTypeOf(ref: EntityRef, model: StoryModel): string | null {
  switch (ref.type) {
    case 'entry': {
      const entry = model.entries.get(ref.id);
      return entry ? `entry:${entry.category}` : null;
    }
    case 'node': {
      const node = model.nodes.get(ref.id);
      return node ? (isGroup(node.kind) ? 'part' : node.kind) : null;
    }
    case 'event':
      return model.events.has(ref.id) ? 'event' : null;
    case 'thread':
      return model.threads.has(ref.id) ? 'thread' : null;
    case 'ability':
      return model.abilities.has(ref.id) ? 'ability' : null;
    default:
      return null;
  }
}

/** The whole graph of a novel: every record, every connection. */
export function knowledgeGraph(model: StoryModel): KnowledgeGraph {
  const nodes = new Map<string, GraphNode>();
  const add = (ref: EntityRef) => {
    const type = nodeTypeOf(ref, model);
    const found = resolveRef(model, ref);
    if (!type || !found.found) return;
    // A kind may label its records by one of its fields (a code name, a designation), where that field is filled in.
    const entry = ref.type === 'entry' ? model.entries.get(ref.id) : undefined;
    const category = entry ? model.categories.get(entry.category) : undefined;
    const def = category ? fieldOf(category, 'graphLabel', category.uses?.graphLabel) : null;
    const value = def && entry ? displayValue({ type: def.type, value: entry.fields.find((f) => f.defId === def.id)?.value ?? '' }, () => undefined).trim() : '';
    nodes.set(keyOf(ref), { key: keyOf(ref), ref, type, label: value || found.view.label, ...(value ? { aka: found.view.label } : {}), color: nodeTypeColor(type, model), degree: 0 });
  };
  // A category the author set not to appear in the graph leaves its entries out, and is counted, so the view can say so.
  const excluded = new Map<string, number>();
  for (const entry of model.entries.values()) {
    if (model.categories.get(entry.category)?.graph === false) excluded.set(entry.category, (excluded.get(entry.category) ?? 0) + 1);
    else add({ type: 'entry', id: entry.id });
  }
  for (const id of model.events.keys()) add({ type: 'event', id });
  for (const id of model.nodes.keys()) add({ type: 'node', id });
  for (const id of model.threads.keys()) add({ type: 'thread', id });
  for (const id of model.abilities.keys()) add({ type: 'ability', id });
  const { connections, dangling } = deriveConnections(model);
  const edges: GraphEdge[] = [];
  // A kind may choose which of its link fields are drawn; the others are left out, and counted.
  const undrawn = new Map<string, { category: string; field: string; count: number }>();
  const drawn = (c: Connection) => {
    if (c.kind !== 'field' || !c.source.field) return true;
    const entry = model.entries.get(c.source.id);
    const chosen = entry ? model.categories.get(entry.category)?.uses?.graphLinks : undefined;
    const defId = entry?.fields.find((f) => f.id === c.source.field)?.defId;
    // Fields of one entry alone are not the kind's to choose: always drawn.
    if (!entry || !chosen || !defId || chosen.includes(defId)) return true;
    const key = `${entry.category}|${defId}`;
    const name = model.categories.get(entry.category)?.fields.find((d) => d.id === defId)?.name ?? c.label;
    undrawn.set(key, { category: entry.category, field: name, count: (undrawn.get(key)?.count ?? 0) + 1 });
    return false;
  };
  for (const c of connections) {
    const [from, to] = [keyOf(c.from), keyOf(c.to)];
    if (!nodes.has(from) || !nodes.has(to) || from === to || !drawn(c)) continue;
    edges.push({ id: c.id, from, to, kind: c.kind, type: edgeTypeOf(c), label: c.label || edgeTypeLabel(edgeTypeOf(c)), ...(c.reverseLabel ? { reverseLabel: c.reverseLabel } : {}), directed: c.directed, connection: c });
    nodes.get(from)!.degree++;
    nodes.get(to)!.degree++;
  }
  return { nodes: [...nodes.values()].sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key)), edges, dangling: dangling.length, excluded: [...excluded].map(([category, count]) => ({ category, count })), undrawn: [...undrawn.values()] };
}

export interface GraphQuery {
  /** Node types not shown. */
  hiddenNodes?: ReadonlySet<string>;
  /** Edge types not shown. */
  hiddenEdges?: ReadonlySet<string>;
  /** Statuses of stored connections not shown (confirmed, provisional, disputed, invalid). Other connections have none, and stay. */
  hiddenStatuses?: ReadonlySet<string>;
  /** Only records whose name has these words, and what they are directly connected to. */
  text?: string;
  /** Only this record's neighbourhood: one step, or two. */
  focus?: { key: string; depth: 1 | 2 } | null;
  /** Show records with no connection shown, too. */
  isolated?: boolean;
}

/** The records a record reaches in up to `depth` steps over these edges, itself included. */
export function neighbourhood(edges: GraphEdge[], key: string, depth: number): Set<string> {
  const reached = new Set([key]);
  let frontier = new Set([key]);
  for (let step = 0; step < depth; step++) {
    const next = new Set<string>();
    for (const e of edges) {
      if (frontier.has(e.from) && !reached.has(e.to)) next.add(e.to);
      if (frontier.has(e.to) && !reached.has(e.from)) next.add(e.from);
    }
    for (const k of next) reached.add(k);
    frontier = next;
  }
  return reached;
}

/** The graph a query leaves: the types shown, then the words, then the focus; edges only between what remains. */
export function queryGraph(graph: KnowledgeGraph, query: GraphQuery): KnowledgeGraph {
  let nodes = graph.nodes.filter((n) => !query.hiddenNodes?.has(n.type));
  let keep = new Set(nodes.map((n) => n.key));
  let edges = graph.edges.filter((e) => !query.hiddenEdges?.has(e.type) && !query.hiddenStatuses?.has(statusOf(e.connection) ?? '') && keep.has(e.from) && keep.has(e.to));
  const text = query.text?.trim().toLowerCase();
  if (text) {
    const hits = new Set(nodes.filter((n) => n.label.toLowerCase().includes(text) || n.aka?.toLowerCase().includes(text)).map((n) => n.key));
    keep = new Set([...hits].flatMap((k) => [...neighbourhood(edges, k, 1)]));
  }
  if (query.focus && keep.has(query.focus.key)) {
    const near = neighbourhood(edges.filter((e) => keep.has(e.from) && keep.has(e.to)), query.focus.key, query.focus.depth);
    keep = new Set([...keep].filter((k) => near.has(k)));
  }
  edges = edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  nodes = nodes.filter((n) => keep.has(n.key) && (query.isolated || linked.has(n.key) || n.key === query.focus?.key));
  return { nodes, edges, dangling: graph.dangling };
}

/**
 * How two records are connected: the shortest chain of connections between
 * them, either way along each, over the edges given. Null when they are not
 * connected at all within `limit` steps.
 */
export function pathBetween(edges: GraphEdge[], fromKey: string, toKey: string, limit = 8): GraphEdge[] | null {
  if (fromKey === toKey) return [];
  const via = new Map<string, GraphEdge>();
  const seen = new Set([fromKey]);
  let frontier = [fromKey];
  for (let step = 0; step < limit && frontier.length; step++) {
    const next: string[] = [];
    for (const key of frontier) {
      for (const e of edges) {
        const other = e.from === key ? e.to : e.to === key ? e.from : null;
        if (!other || seen.has(other)) continue;
        seen.add(other);
        via.set(other, e);
        if (other === toKey) {
          const path: GraphEdge[] = [];
          for (let at = toKey; at !== fromKey; ) {
            const edge = via.get(at)!;
            path.unshift(edge);
            at = edge.from === at ? edge.to : edge.from;
          }
          return path;
        }
        next.push(other);
      }
    }
    frontier = next;
  }
  return null;
}

/** How many nodes and edges of each type: for the layers and legends. */
export function typeCounts(graph: KnowledgeGraph) {
  const count = (items: { type: string }[]) => [...items.reduce((m, i) => m.set(i.type, (m.get(i.type) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { nodes: count(graph.nodes), edges: count(graph.edges), statuses: count(graph.edges.flatMap((e) => (statusOf(e.connection) ? [{ type: statusOf(e.connection)! }] : []))) };
}

/** One edge read aloud: "Mira owns The Ember Blade", "The siege took place at The Keep". */
export function edgeWords(edge: GraphEdge, labelOf: (key: string) => string): string {
  return `${labelOf(edge.from)} ${edge.label.charAt(0).toLowerCase()}${edge.label.slice(1)} ${labelOf(edge.to)}${edge.reverseLabel ? ` (from the other side: ${edge.reverseLabel.toLowerCase()})` : ''}`;
}

// ---------------------------------------------------------------------------------------------------- against clutter

/** A group node standing for several records folded together. Its key starts `group:`; it is no record of its own. */
export interface GroupNode extends GraphNode {
  members: string[];
}
export const isGroupNode = (node: GraphNode): node is GroupNode => node.key.startsWith('group:');

export interface Collapse {
  /** Node types folded into one group node each. */
  types?: ReadonlySet<string>;
  /** Folds one node into another (a scene into its chapter): the key it goes into, or null to leave it. */
  fold?: (key: string) => string | null;
}

/**
 * The graph with records folded together: scenes into their chapters, and
 * whole kinds of record into one group node each. Connections follow what
 * they joined, keeping their own ids; those inside one group, or between a
 * scene and its chapter, are left out (and counted). `into` says where each
 * record went, for lighting up a path or a selection inside a group.
 */
export function collapseGraph(graph: KnowledgeGraph, collapse: Collapse, groupLabel: (type: string, count: number) => string): { graph: KnowledgeGraph; into: Map<string, string>; inside: number } {
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const into = new Map<string, string>();
  for (const node of graph.nodes) {
    const target = collapse.fold?.(node.key);
    into.set(node.key, target && target !== node.key && byKey.has(target) ? target : node.key);
  }
  // A record folded into another follows it into a group, too.
  const groups = new Map<string, GroupNode>();
  for (const node of graph.nodes) {
    const host = byKey.get(into.get(node.key)!) ?? node;
    if (!collapse.types?.has(host.type)) continue;
    const key = `group:${host.type}`;
    if (!groups.has(key)) groups.set(key, { key, ref: null, type: host.type, label: '', color: host.color, degree: 0, members: [] });
    groups.get(key)!.members.push(node.key);
    into.set(node.key, key);
  }
  for (const group of groups.values()) group.label = groupLabel(group.type, group.members.filter((k) => byKey.get(k)?.type === group.type).length);
  let inside = 0;
  const edges: GraphEdge[] = [];
  for (const e of graph.edges) {
    const [from, to] = [into.get(e.from) ?? e.from, into.get(e.to) ?? e.to];
    if (from === to) inside++;
    else edges.push(from === e.from && to === e.to ? e : { ...e, from, to });
  }
  const nodes = [...graph.nodes.filter((n) => into.get(n.key) === n.key), ...groups.values()];
  for (const group of groups.values()) group.degree = edges.filter((e) => e.from === group.key || e.to === group.key).length;
  return { graph: { nodes, edges, dangling: graph.dangling }, into, inside };
}

/** How many records the graph draws at most, unless the author asks for more: beyond this, it is too crowded to read and slow to lay out. */
export const DRAW_LIMIT = 200;
export const DRAW_STEP = 100;

/**
 * At most `limit` records: the most connected first (by the connections
 * shown), always with the records in `keep` (the selection, the focus, a
 * path). The rest are not drawn, and are counted, so a partial view is
 * never taken for the whole story.
 */
export function limitGraph(graph: KnowledgeGraph, limit: number, keep: ReadonlySet<string> = new Set()): { graph: KnowledgeGraph; total: number; cut: number } {
  const total = graph.nodes.length;
  if (total <= limit) return { graph, total, cut: 0 };
  const degree = new Map<string, number>();
  for (const e of graph.edges) for (const k of [e.from, e.to]) degree.set(k, (degree.get(k) ?? 0) + 1);
  const ranked = [...graph.nodes].sort((a, b) => (degree.get(b.key) ?? 0) - (degree.get(a.key) ?? 0) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  const present = new Set(graph.nodes.map((n) => n.key));
  const taken = new Set([...keep].filter((k) => present.has(k)));
  for (const node of ranked) {
    if (taken.size >= limit) break;
    taken.add(node.key);
  }
  const nodes = graph.nodes.filter((n) => taken.has(n.key));
  return { graph: { nodes, edges: graph.edges.filter((e) => taken.has(e.from) && taken.has(e.to)), dangling: graph.dangling }, total, cut: total - nodes.length };
}

/** The graph's own settings in the page address, kept by saved views: hidden node and edge types, a focus and its depth, records with no connection, collapsed kinds, folded scenes, and how many records to draw. */
export const GRAPH_PARAMS = ['ghide', 'gedges', 'gstatus', 'gfocus', 'gdepth', 'gall', 'gcollapse', 'gfold', 'glimit'] as const;
export const graphLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(GRAPH_PARAMS.flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])));
