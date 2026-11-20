// THE KNOWLEDGE GRAPH (as in the original app): every record of the novel as a node (characters, places, factions,
// items, species and any category the author makes; abilities; events; chapters and scenes and the parts they sit in;
// plot threads) and every connection the shared model reads as an edge, each with its type. Nothing is stored for the
// graph: it is the records and their connections, as they are.
// A port of flutter_app/lib/shared/domain/graph/knowledge.dart.

import { statusOf } from '../codex/screens/connections';
import { displayValue } from '../codex/fieldValues';
import { localeCompare } from '../collation';
import { compareNum } from '../manuscript/dartSort';
import { type Connection, type ConnectionKind, connectionKindOf, deriveConnections } from '../model/connections';
import { EntityRef, entityTypeOf } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import { Category, type FieldType } from '../records/category';
import { strings } from '../records/jsonRecord';
import { isSystemOn } from '../records/system';
import { connectionType } from '../records/link';
import { isGroup } from '../records/storyNode';
import { dartTrim } from '../text/dartString';

export class GraphNode {
  /** `entry:<id>`, `event:<id>`… unique across record types. A group of records folded together starts `group:`. */
  readonly key: string;
  /** The record it is; null for a group. */
  readonly ref: EntityRef | null;
  /** `entry:<category>`, `event`, `chapter`, `scene`, `part`, `thread` or `ability`. */
  readonly type: string;
  label: string;
  /** The record's own name, when its kind labels it in the graph by a field instead. */
  readonly aka: string | null;
  readonly color: string;
  /** Connections it has in the whole novel (for a group: those shown). */
  degree: number;
  /** For a group: the records folded into it. */
  readonly members: string[] | null;

  constructor(args: {
    key: string;
    ref: EntityRef | null;
    type: string;
    label: string;
    color: string;
    aka?: string | null;
    degree?: number;
    members?: string[] | null;
  }) {
    this.key = args.key;
    this.ref = args.ref;
    this.type = args.type;
    this.label = args.label;
    this.color = args.color;
    this.aka = args.aka ?? null;
    this.degree = args.degree ?? 0;
    this.members = args.members ?? null;
  }

  get isGroup(): boolean {
    return this.key.startsWith('group:');
  }
}

export class GraphEdge {
  constructor(
    /** The connection's own stable id. */
    readonly id: string,
    readonly from: string,
    readonly to: string,
    readonly kind: ConnectionKind,
    /** `link:<type>` for a stored connection, else the kind. */
    readonly type: string,
    /** How it reads from its `from` side, and from its `to` side when that differs. */
    readonly label: string,
    readonly directed: boolean,
    readonly connection: Connection,
    readonly reverseLabel: string | null = null,
  ) {}

  between(from: string, to: string): GraphEdge {
    return new GraphEdge(this.id, from, to, this.kind, this.type, this.label, this.directed, this.connection, this.reverseLabel);
  }
}

export type Excluded = { category: string; count: number };
export type Undrawn = { category: string; field: string; count: number };

export class KnowledgeGraph {
  constructor(
    readonly nodes: GraphNode[],
    readonly edges: GraphEdge[],
    /** Connections one end of which no longer exists: left out, and counted. */
    readonly dangling: number,
    /** Kinds of record set not to appear in the graph, and how many records that leaves out. */
    readonly excluded: Excluded[] | null = null,
    /** Link fields a kind of record set not to be drawn, and how many connections that leaves out. */
    readonly undrawn: Undrawn[] | null = null,
  ) {}
}

export const keyOf = (ref: EntityRef): string => `${ref.type}:${ref.id}`;

export function refOf(key: string): EntityRef | null {
  const at = key.indexOf(':');
  if (at <= 0 || at === key.length - 1) return null;
  const type = entityTypeOf(key.substring(0, at));
  return type === null ? null : new EntityRef(type, key.substring(at + 1));
}

const fixedTypes: Readonly<Record<string, { label: string; color: string }>> = {
  event: { label: 'Events', color: '#c08a1e' },
  chapter: { label: 'Chapters', color: '#64748b' },
  scene: { label: 'Scenes', color: '#94a3b8' },
  part: { label: 'Volumes, acts and arcs', color: '#334155' },
  thread: { label: 'Plot threads', color: '#7a4fa3' },
  ability: { label: 'Abilities', color: '#2b7a8c' },
};

const categoryOf = (model: StoryModel, key: string): Category => model.categories.get(key) ?? Category.unknown(key);

/** A node type in words: a category's plural name, or the fixed names. */
export function nodeTypeLabel(type: string, model: StoryModel): string {
  return type.startsWith('entry:') ? categoryOf(model, type.substring(6)).name : (fixedTypes[type]?.label ?? type);
}

export function nodeTypeColor(type: string, model: StoryModel): string {
  return type.startsWith('entry:') ? categoryOf(model, type.substring(6)).color : (fixedTypes[type]?.color ?? '#8a8276');
}

const kindLabels: Readonly<Record<ConnectionKind, string>> = {
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

export const edgeTypeOf = (c: Connection): string => (c.kind === 'link' ? `link:${connectionType(c.type).key}` : c.kind);

/** An edge type in words: a stored connection's type ("Owns", "Created by", the author's own word), or what the app
 * keeps. */
export function edgeTypeLabel(type: string): string {
  if (type.startsWith('link:')) return connectionType(type.substring(5)).label;
  const kind = connectionKindOf(type);
  return kind === null ? type : kindLabels[kind];
}

/** A record's node type. */
export function nodeTypeOf(ref: EntityRef, model: StoryModel): string | null {
  switch (ref.type) {
    case 'entry': {
      const entry = model.entries.get(ref.id);
      return entry === undefined ? null : `entry:${entry.category}`;
    }
    case 'node': {
      const node = model.nodes.get(ref.id);
      if (node === undefined) return null;
      return isGroup(node.kind) ? 'part' : node.kindKey;
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

const labelTypes: ReadonlySet<FieldType> = new Set<FieldType>(['text', 'number', 'select', 'date']);

/** The whole graph of a novel: every record, every connection. */
export function knowledgeGraph(model: StoryModel): KnowledgeGraph {
  const nodes = new Map<string, GraphNode>();
  const add = (ref: EntityRef) => {
    const type = nodeTypeOf(ref, model);
    const found = model.resolve(ref);
    if (type === null || found === null) return;
    // A kind may label its records by one of its fields (a code name, a designation), where that field is filled in.
    const entry = ref.type === 'entry' ? (model.entries.get(ref.id) ?? null) : null;
    const category = entry === null ? null : (model.categories.get(entry.category) ?? null);
    const defId = category?.uses['graphLabel'];
    const def =
      typeof defId === 'string'
        ? (category!.fields.find((f) => f.id === defId && !f.archived && f.type !== null && labelTypes.has(f.type)) ?? null)
        : null;
    const value =
      def === null || entry === null
        ? ''
        : dartTrim(displayValue(def.type, entry.fields.find((f) => f.defId === def.id)?.value ?? '', () => null));
    nodes.set(
      keyOf(ref),
      new GraphNode({
        key: keyOf(ref),
        ref,
        type,
        label: value.length > 0 ? value : found.label,
        aka: value.length > 0 ? found.label : null,
        color: nodeTypeColor(type, model),
      }),
    );
  };

  // A category the author set not to appear in the graph leaves its entries out, and is counted.
  const excluded = new Map<string, number>();
  for (const entry of model.entries.values()) {
    if (model.categories.get(entry.category)?.raw['graph'] === false) {
      excluded.set(entry.category, (excluded.get(entry.category) ?? 0) + 1);
    } else {
      add(new EntityRef('entry', entry.id));
    }
  }
  for (const id of model.events.keys()) add(new EntityRef('event', id));
  for (const id of model.nodes.keys()) add(new EntityRef('node', id));
  for (const id of model.threads.keys()) add(new EntityRef('thread', id));
  for (const [id, a] of model.abilities) if (isSystemOn(a.system)) add(new EntityRef('ability', id));
  const { connections, dangling } = deriveConnections(model);
  const edges: GraphEdge[] = [];
  // A kind may choose which of its link fields are drawn; the others are left out, and counted.
  const undrawn = new Map<string, Undrawn>();
  const drawn = (c: Connection): boolean => {
    if (c.kind !== 'field' || c.source.field === null) return true;
    const entry = model.entries.get(c.source.id) ?? null;
    const uses = entry === null ? null : (model.categories.get(entry.category)?.uses ?? null);
    const chosen = uses !== null && Array.isArray(uses['graphLinks']) ? strings(uses['graphLinks']) : null;
    const defId = entry?.fields.find((f) => f.id === c.source.field)?.defId ?? null;
    // Fields of one entry alone are not the kind's to choose: always drawn.
    if (entry === null || chosen === null || defId === null || chosen.includes(defId)) return true;
    const key = `${entry.category}|${defId}`;
    const name = model.categories.get(entry.category)?.fields.find((d) => d.id === defId)?.name ?? c.label;
    undrawn.set(key, { category: entry.category, field: name, count: (undrawn.get(key)?.count ?? 0) + 1 });
    return false;
  };

  for (const c of connections) {
    const from = keyOf(c.from);
    const to = keyOf(c.to);
    if (!nodes.has(from) || !nodes.has(to) || from === to || !drawn(c)) continue;
    const type = edgeTypeOf(c);
    edges.push(
      new GraphEdge(
        c.id,
        from,
        to,
        c.kind,
        type,
        c.label.length > 0 ? c.label : edgeTypeLabel(type),
        c.directed,
        c,
        c.reverseLabel !== null && c.reverseLabel.length > 0 ? c.reverseLabel : null,
      ),
    );
    nodes.get(from)!.degree++;
    nodes.get(to)!.degree++;
  }
  return new KnowledgeGraph(
    stableSorted(nodes.values(), (a, b) => {
      const byLabel = localeCompare(a.label, b.label);
      return byLabel !== 0 ? byLabel : localeCompare(a.key, b.key);
    }),
    edges,
    dangling.length,
    [...excluded].map(([category, count]) => ({ category, count })),
    [...undrawn.values()],
  );
}

/** What a query leaves of the graph: types hidden, words, a focus. */
export type GraphQuery = {
  /** Node types not shown. */
  hiddenNodes?: ReadonlySet<string>;
  /** Edge types not shown. */
  hiddenEdges?: ReadonlySet<string>;
  /** Statuses of stored connections not shown. Other connections have none, and stay. */
  hiddenStatuses?: ReadonlySet<string>;
  /** Only records whose name has these words, and what they are directly connected to. */
  text?: string;
  /** Only this record's neighbourhood: one step, or two. */
  focus?: { key: string; depth: number } | null;
  /** Show records with no connection shown, too. */
  isolated?: boolean;
};

/** The records a record reaches in up to `depth` steps over these edges, itself included. */
export function neighbourhood(edges: readonly GraphEdge[], key: string, depth: number): Set<string> {
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
  const hiddenNodes = query.hiddenNodes ?? new Set();
  const hiddenEdges = query.hiddenEdges ?? new Set();
  const hiddenStatuses = query.hiddenStatuses ?? new Set();
  let nodes = graph.nodes.filter((n) => !hiddenNodes.has(n.type));
  let keep = new Set(nodes.map((n) => n.key));
  let edges = graph.edges.filter(
    (e) => !hiddenEdges.has(e.type) && !hiddenStatuses.has(statusOf(e.connection) ?? '') && keep.has(e.from) && keep.has(e.to),
  );
  const text = (query.text ?? '').trim().toLowerCase();
  if (text.length > 0) {
    const hits = nodes.filter((n) => n.label.toLowerCase().includes(text) || (n.aka?.toLowerCase().includes(text) ?? false)).map((n) => n.key);
    const kept = new Set<string>();
    for (const k of hits) for (const n of neighbourhood(edges, k, 1)) kept.add(n);
    keep = kept;
  }
  const focus = query.focus ?? null;
  if (focus !== null && keep.has(focus.key)) {
    const near = neighbourhood(
      edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
      focus.key,
      focus.depth,
    );
    keep = new Set([...keep].filter((k) => near.has(k)));
  }
  edges = edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  nodes = nodes.filter((n) => keep.has(n.key) && ((query.isolated ?? false) || linked.has(n.key) || n.key === focus?.key));
  return new KnowledgeGraph(nodes, edges, graph.dangling);
}

/** How two records are connected: the shortest chain of connections between them, either way along each. Null when
 * they are not connected within `limit` steps. */
export function pathBetween(edges: readonly GraphEdge[], fromKey: string, toKey: string, limit = 8): GraphEdge[] | null {
  if (fromKey === toKey) return [];
  const via = new Map<string, GraphEdge>();
  const seen = new Set([fromKey]);
  let frontier = [fromKey];
  for (let step = 0; step < limit && frontier.length > 0; step++) {
    const next: string[] = [];
    for (const key of frontier) {
      for (const e of edges) {
        const other = e.from === key ? e.to : e.to === key ? e.from : null;
        if (other === null || seen.has(other)) continue;
        seen.add(other);
        via.set(other, e);
        if (other === toKey) {
          const path: GraphEdge[] = [];
          // At most one edge per node reached: bounded by how many were reached.
          for (let at = toKey, n = 0; at !== fromKey && n <= via.size; n++) {
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

export type TypeCount = [string, number];

/** How many nodes and edges of each type, most first: for the layers and legends. */
export function typeCounts(graph: KnowledgeGraph): { nodes: TypeCount[]; edges: TypeCount[]; statuses: TypeCount[] } {
  const count = (types: Iterable<string>): TypeCount[] => {
    const m = new Map<string, number>();
    for (const t of types) m.set(t, (m.get(t) ?? 0) + 1);
    return stableSorted([...m], (a, b) => {
      const byCount = compareNum(b[1], a[1]);
      return byCount !== 0 ? byCount : localeCompare(a[0], b[0]);
    });
  };
  return {
    nodes: count(graph.nodes.map((n) => n.type)),
    edges: count(graph.edges.map((e) => e.type)),
    statuses: count(graph.edges.map((e) => statusOf(e.connection)).filter((s): s is NonNullable<typeof s> => s !== null)),
  };
}

const lowerFirst = (s: string): string => (s.length === 0 ? s : `${s[0].toLowerCase()}${s.substring(1)}`);

/** One edge read aloud: "Mira owns The Ember Blade", "The siege took place at The Keep". */
export function edgeWords(edge: GraphEdge, labelOf: (key: string) => string): string {
  return (
    `${labelOf(edge.from)} ${lowerFirst(edge.label)} ${labelOf(edge.to)}` +
    (edge.reverseLabel !== null ? ` (from the other side: ${edge.reverseLabel.toLowerCase()})` : '')
  );
}

// ------------------------------------------------------------------------------------------------- against clutter

/** The graph with records folded together: scenes into their chapters (`fold`), and whole kinds of record (`types`)
 * into one group node each. Connections follow what they joined, keeping their own ids; those inside one group, or
 * between a scene and its chapter, are left out (and counted). `into` says where each record went. */
export function collapseGraph(
  graph: KnowledgeGraph,
  args: { types?: ReadonlySet<string>; fold?: ((key: string) => string | null) | null; groupLabel: (type: string, count: number) => string },
): { graph: KnowledgeGraph; into: Map<string, string>; inside: number } {
  const types = args.types ?? new Set<string>();
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const into = new Map<string, string>();
  for (const node of graph.nodes) {
    const target = args.fold?.(node.key) ?? null;
    into.set(node.key, target !== null && target !== node.key && byKey.has(target) ? target : node.key);
  }
  // A record folded into another follows it into a group, too.
  const groups = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    const host = byKey.get(into.get(node.key)!) ?? node;
    if (!types.has(host.type)) continue;
    const key = `group:${host.type}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = new GraphNode({ key, ref: null, type: host.type, label: '', color: host.color, members: [] });
      groups.set(key, group);
    }
    group.members!.push(node.key);
    into.set(node.key, key);
  }
  for (const group of groups.values()) {
    group.label = args.groupLabel(group.type, group.members!.filter((k) => byKey.get(k)?.type === group.type).length);
  }
  let inside = 0;
  const edges: GraphEdge[] = [];
  for (const e of graph.edges) {
    const from = into.get(e.from) ?? e.from;
    const to = into.get(e.to) ?? e.to;
    if (from === to) inside++;
    else edges.push(from === e.from && to === e.to ? e : e.between(from, to));
  }
  const nodes = [...graph.nodes.filter((n) => into.get(n.key) === n.key), ...groups.values()];
  for (const group of groups.values()) group.degree = edges.filter((e) => e.from === group.key || e.to === group.key).length;
  return { graph: new KnowledgeGraph(nodes, edges, graph.dangling), into, inside };
}

/** How many records the graph draws at most, unless the author asks for more. */
export const drawLimit = 200;
export const drawStep = 100;

/** At most `limit` records: the most connected first (by the connections shown), always with the records in `keep`.
 * The rest are not drawn, and are counted, so a partial view is never taken for the whole story. */
export function limitGraph(
  graph: KnowledgeGraph,
  limit: number,
  keep: ReadonlySet<string> = new Set(),
): { graph: KnowledgeGraph; total: number; cut: number } {
  const total = graph.nodes.length;
  if (total <= limit) return { graph, total, cut: 0 };
  const degree = new Map<string, number>();
  for (const e of graph.edges) for (const k of [e.from, e.to]) degree.set(k, (degree.get(k) ?? 0) + 1);
  const ranked = stableSorted(graph.nodes, (a, b) => {
    const byDegree = compareNum(degree.get(b.key) ?? 0, degree.get(a.key) ?? 0);
    if (byDegree !== 0) return byDegree;
    const byLabel = localeCompare(a.label, b.label);
    return byLabel !== 0 ? byLabel : localeCompare(a.key, b.key);
  });
  const present = new Set(graph.nodes.map((n) => n.key));
  const taken = new Set([...keep].filter((k) => present.has(k)));
  for (const node of ranked) {
    if (taken.size >= limit) break;
    taken.add(node.key);
  }
  const nodes = graph.nodes.filter((n) => taken.has(n.key));
  return {
    graph: new KnowledgeGraph(nodes, graph.edges.filter((e) => taken.has(e.from) && taken.has(e.to)), graph.dangling),
    total,
    cut: total - nodes.length,
  };
}

// --------------------------------------------------------------------------------------------------- how it is drawn

/** How each kind of record is drawn: a shape as well as a colour, named in the legend. */
export type NodeShape = 'circle' | 'diamond' | 'square' | 'triangle';

export function shapeOf(type: string): NodeShape {
  switch (type) {
    case 'event':
      return 'diamond';
    case 'chapter':
    case 'scene':
    case 'part':
      return 'square';
    case 'thread':
    case 'ability':
      return 'triangle';
    default:
      return 'circle';
  }
}

const notWord = /[^\p{L}\p{N}]/gu;

function code(word: string, length: number): string {
  const runes = [...word];
  return `${runes.slice(0, 1).join('').toUpperCase()}${runes.slice(1, length).join('').toLowerCase()}`;
}

/** Letter codes for the kinds of record that share a shape, so no kind is told by its colour alone: the first letter
 * of its name, or as many as tell them apart. */
export function typeCodes(types: Iterable<string>, label: (type: string) => string): Map<string, string> {
  const codes = new Map<string, string>();
  const byShape = new Map<NodeShape, string[]>();
  const sorted = [...new Set(types)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const type of sorted) {
    const shape = shapeOf(type);
    (byShape.get(shape) ?? byShape.set(shape, []).get(shape)!).push(type);
  }
  // Dart's map keeps the order shapes were first met.
  for (const group of byShape.values()) {
    if (group.length < 2) continue;
    const words = group.map((t) => {
      const w = label(t).replace(notWord, '');
      return w.length === 0 ? '?' : w;
    });
    for (let length = 1; length <= 3; length++) {
      const tries = words.map((w) => code(w, length));
      const unique = new Set(tries).size === tries.length;
      if (unique || length === 3) {
        group.forEach((t, i) => codes.set(t, unique ? tries[i] : `${tries[i]}${i + 1}`));
        break;
      }
    }
  }
  return codes;
}

/** Connections fall in groups, each with a line of its own, named in the legend; the strongest first. */
export type EdgeGroup = 'typed' | 'relationship' | 'field' | 'timeline' | 'plot' | 'manuscript' | 'system';
export const edgeGroups: readonly EdgeGroup[] = ['typed', 'relationship', 'field', 'timeline', 'plot', 'manuscript', 'system'];
export const edgeGroupLabel: Readonly<Record<EdgeGroup, string>> = {
  typed: 'Connections you recorded (owns, created by, your own…)',
  relationship: 'Character relationships',
  field: 'Named in a field',
  timeline: 'Timeline (takes part in, takes place at, comes after…)',
  plot: 'Plot threads',
  manuscript: 'Manuscript (told in, linked in the text, part of…)',
  system: 'Abilities',
};

export function groupOf(kind: ConnectionKind): EdgeGroup {
  switch (kind) {
    case 'link':
      return 'typed';
    case 'relationship':
      return 'relationship';
    case 'field':
      return 'field';
    case 'participant':
    case 'involved':
    case 'occurs-at':
    case 'follows':
    case 'dated-from':
      return 'timeline';
    case 'in-thread':
    case 'thread-entry':
    case 'beat':
    case 'resolves-in':
      return 'plot';
    case 'holds':
    case 'branches-from':
      return 'system';
    default:
      return 'manuscript';
  }
}

/** The connections between one pair of records, drawn as one line. */
export class Pair {
  readonly edges: GraphEdge[] = [];
  constructor(
    readonly key: string,
    readonly a: string,
    readonly b: string,
  ) {}
  /** The strongest group among its connections: how its line is drawn. */
  get group(): EdgeGroup {
    return edgeGroups.find((g) => this.edges.some((e) => groupOf(e.kind) === g))!;
  }
}

export function pairsOf(edges: readonly GraphEdge[]): Pair[] {
  const pairs = new Map<string, Pair>();
  for (const e of edges) {
    const [a, b] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
    const key = `${a}~${b}`;
    (pairs.get(key) ?? pairs.set(key, new Pair(key, a, b)).get(key)!).edges.push(e);
  }
  return [...pairs.values()];
}

