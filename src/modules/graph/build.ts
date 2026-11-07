import { unknownCategory } from '@/modules/codex/schema';
import type { Category, LoreEntry, LoreLink } from '@/modules/codex/types';
import { buildTree, flatten, isGroup } from '@/modules/manuscript/tree';
import { KIND_LABELS, type ChapterPlan, type StoryNode } from '@/modules/manuscript/types';
import { stageAt, type StoryOrder } from '@/modules/relationships/timeline';
import type { Affinity, CharacterRelation } from '@/modules/relationships/types';
import type { Placed } from '@/modules/timeline/chronology';

/** What kind of link an edge stands for. One edge can stand for several between the same two things. */
export type EdgeKind = 'relationship' | 'related' | 'field' | 'appears' | 'event' | 'sequence' | 'structure';

export type NodeRef = { kind: 'entry'; entry: LoreEntry } | { kind: 'event'; placed: Placed } | { kind: 'node'; node: StoryNode; words: number } | { kind: 'cluster'; hubId: string; memberIds: string[] };

export interface GraphNode {
  id: string;
  /** The filter this node belongs to: a codex category key, `event`, or `chapter`. */
  group: string;
  label: string;
  color: string;
  /** How many other things this is connected to, in the whole project. Drives its size. */
  degree: number;
  ref: NodeRef;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kinds: EdgeKind[];
  /** What the link means, in words: "Rivals", "Leader", "Appears in", "Takes place at"… */
  labels: string[];
  /** Set when the meaning runs from source to target (Mentor → Student, Follows, Part of). */
  directed: boolean;
  affinity?: Affinity;
  /** The character relationship this edge shows, for opening its history. */
  relationId?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphData {
  entries: LoreEntry[];
  links: LoreLink[];
  relations: CharacterRelation[];
  order: StoryOrder;
  events: Placed[];
  nodes: StoryNode[];
  plans: ChapterPlan[];
  categories: Category[];
}

export const EVENT_COLOR = '#c08a1e';
export const CHAPTER_COLOR = '#64748b';
export const GROUP_COLOR = '#334155';

/**
 * Builds the story graph from everything that links things together.
 *
 * Nothing is stored for the graph itself: every edge is read from where the
 * link was made (a relationship, a related-entry link, a field that points at
 * an entry, a link in a chapter's text, a planning sheet, a timeline event,
 * the manuscript's own structure). Scenes are folded into their chapter, so
 * the graph shows the story at chapter level.
 */
export function buildGraph(data: GraphData): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const categories = new Map(data.categories.map((c) => [c.key, c]));
  const entryById = new Map(data.entries.map((e) => [e.id, e]));
  const storyById = new Map(data.nodes.map((n) => [n.id, n]));
  const tree = flatten(buildTree(data.nodes));

  for (const entry of data.entries) {
    const category = categories.get(entry.category) ?? unknownCategory(entry.category);
    nodes.set(entry.id, { id: entry.id, group: entry.category, label: entry.name, color: category.color, degree: 0, ref: { kind: 'entry', entry } });
  }
  for (const placed of data.events) nodes.set(placed.event.id, { id: placed.event.id, group: 'event', label: placed.event.name, color: EVENT_COLOR, degree: 0, ref: { kind: 'event', placed } });
  for (const { node, totalWords } of tree) {
    if (node.kind === 'scene') continue;
    nodes.set(node.id, { id: node.id, group: 'chapter', label: node.title, color: isGroup(node.kind) ? GROUP_COLOR : CHAPTER_COLOR, degree: 0, ref: { kind: 'node', node, words: totalWords } });
  }
  /** A scene counts as its chapter. */
  const chapterOf = (id: string): string | null => {
    const node = storyById.get(id);
    if (!node) return null;
    return node.kind === 'scene' ? (node.parentId && nodes.has(node.parentId) ? node.parentId : null) : nodes.has(id) ? id : null;
  };

  const link = (source: string | null | undefined, target: string | null | undefined, kind: EdgeKind, label: string, extra: Partial<Pick<GraphEdge, 'directed' | 'affinity' | 'relationId'>> = {}) => {
    if (!source || !target || source === target || !nodes.has(source) || !nodes.has(target)) return;
    const [a, b] = source < target ? [source, target] : [target, source];
    const id = `${a}|${b}`;
    const edge = edges.get(id);
    if (!edge) return void edges.set(id, { id, source, target, kinds: [kind], labels: [label], directed: extra.directed ?? false, ...(extra.affinity ? { affinity: extra.affinity } : {}), ...(extra.relationId ? { relationId: extra.relationId } : {}) });
    if (!edge.kinds.includes(kind)) edge.kinds.push(kind);
    if (!edge.labels.includes(label)) edge.labels.push(label);
    if (extra.relationId) Object.assign(edge, { relationId: extra.relationId, affinity: extra.affinity, source, target, directed: extra.directed ?? edge.directed });
  };

  for (const relation of data.relations) {
    const stage = stageAt(relation, null, data.order);
    if (stage) link(relation.fromId, relation.toId, 'relationship', stage.title || stage.label || 'Related', { directed: stage.directional, affinity: stage.affinity, relationId: relation.id });
  }
  for (const l of data.links) link(l.fromId, l.toId, 'related', l.fromLabel || l.toLabel || 'Related');
  for (const entry of data.entries) {
    const category = categories.get(entry.category) ?? unknownCategory(entry.category);
    // A field that points at another entry ("Leader", "Owner", "Current stage") is a link named after the field.
    const typed = new Map(category.fields.map((def) => [def.id, def]));
    for (const field of entry.fields) {
      const type = field.defId ? typed.get(field.defId)?.type : field.type;
      const name = (field.defId && typed.get(field.defId)?.name) || field.key || 'Linked';
      // A field that names several ("Known users", "Members") is a link to each.
      if (type === 'references') for (const id of new Set(field.value.split('\n'))) if (id !== entry.id && entryById.has(id)) link(entry.id, id, 'field', name, { directed: true });
      if (type === 'reference' && entryById.has(field.value)) link(entry.id, field.value, 'field', (field.defId && typed.get(field.defId)?.name) || field.key || 'Linked', { directed: true });
    }
  }
  for (const node of data.nodes) for (const entryId of node.mentions ?? []) link(entryId, chapterOf(node.id), 'appears', 'Appears in');
  for (const plan of data.plans) for (const entryId of plan.entityIds) link(entryId, chapterOf(plan.id), 'appears', 'Planned in');
  for (const { event } of data.events) {
    for (const character of event.characters) link(character.id, event.id, 'event', 'Involved in');
    link(event.id, event.locationId, 'event', 'Takes place at');
    for (const entryId of event.entryIds) link(entryId, event.id, 'event', 'Involved in');
    for (const nodeId of event.nodeIds) link(event.id, chapterOf(nodeId), 'event', 'Told in');
    link(event.id, event.afterId, 'sequence', 'Follows', { directed: true });
    if (event.when.precision === 'relative') link(event.id, event.when.anchorId, 'sequence', 'Dated from', { directed: true });
  }
  for (const node of data.nodes) if (node.kind !== 'scene' && node.parentId) link(node.id, node.parentId, 'structure', 'Part of', { directed: true });

  for (const edge of edges.values()) {
    nodes.get(edge.source)!.degree++;
    nodes.get(edge.target)!.degree++;
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export interface GraphFilter {
  /** Node groups switched off (category keys, `event`, `chapter`). */
  hidden: ReadonlySet<string>;
  /** Show character relationships. */
  relationships: boolean;
  /** Show only one volume/arc and what it touches, or one entry and what it touches. */
  scope: { type: 'group' | 'around'; id: string } | null;
}

/** Applies the author's filters. It only chooses what is drawn; sizes still reflect the whole project. */
export function filterGraph(graph: Graph, filter: GraphFilter, storyNodes: StoryNode[] = []): Graph {
  let keep = new Set(graph.nodes.filter((n) => !filter.hidden.has(n.group)).map((n) => n.id));
  let edges = graph.edges.flatMap((edge): GraphEdge[] => {
    if (!keep.has(edge.source) || !keep.has(edge.target)) return [];
    if (filter.relationships || !edge.kinds.includes('relationship')) return [edge];
    // With relationships off, an edge that is also something else stays, as that something else.
    const kinds = edge.kinds.filter((k) => k !== 'relationship');
    return kinds.length ? [{ ...edge, kinds, labels: edge.kinds[0] === 'relationship' ? edge.labels.slice(1) : edge.labels, affinity: undefined, relationId: undefined }] : [];
  });

  if (filter.scope && graph.nodes.some((n) => n.id === filter.scope!.id)) {
    const seeds = new Set([filter.scope.id]);
    if (filter.scope.type === 'group') {
      for (let grew = true; grew; ) {
        grew = false;
        for (const node of storyNodes) if (node.parentId && seeds.has(node.parentId) && !seeds.has(node.id)) grew = !!seeds.add(node.id);
      }
    }
    const inScope = new Set(seeds);
    for (const edge of edges) {
      if (seeds.has(edge.source)) inScope.add(edge.target);
      if (seeds.has(edge.target)) inScope.add(edge.source);
    }
    keep = new Set([...keep].filter((id) => inScope.has(id)));
    edges = edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target));
  }
  return { nodes: graph.nodes.filter((n) => keep.has(n.id)), edges };
}

/** What a node is directly connected to, and what those are connected to in turn. */
export function neighbours(graph: Graph, id: string): { first: Set<string>; second: Set<string> } {
  const adjacent = (ids: Set<string>) => {
    const out = new Set<string>();
    for (const edge of graph.edges) {
      if (ids.has(edge.source)) out.add(edge.target);
      if (ids.has(edge.target)) out.add(edge.source);
    }
    return out;
  };
  const first = adjacent(new Set([id]));
  first.delete(id);
  const second = adjacent(first);
  second.delete(id);
  for (const one of first) second.delete(one);
  return { first, second };
}

export const CLUSTER_ABOVE = 150;
const CLUSTER_MIN = 4;

/**
 * Keeps a large graph readable and fast: when there are more than
 * `threshold` nodes, the minor ones (things connected to exactly one hub and
 * nothing else) are folded into a single "12 chapters" node per hub and
 * kind. `expanded` lists the hubs the author has opened up again.
 */
export function clusterLeaves(graph: Graph, expanded: ReadonlySet<string>, labelOf: (group: string, count: number) => string, threshold = CLUSTER_ABOVE): Graph {
  if (graph.nodes.length <= threshold) return graph;
  const visibleDegree = new Map<string, number>();
  const only = new Map<string, string>();
  for (const edge of graph.edges) {
    for (const [me, other] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      visibleDegree.set(me, (visibleDegree.get(me) ?? 0) + 1);
      only.set(me, other);
    }
  }
  const buckets = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    if (visibleDegree.get(node.id) !== 1) continue;
    const hub = only.get(node.id)!;
    if (expanded.has(hub) || (visibleDegree.get(hub) ?? 0) < 2) continue;
    const key = `${hub}|${node.group}`;
    buckets.set(key, [...(buckets.get(key) ?? []), node]);
  }
  const folded = new Set<string>();
  const clusters: GraphNode[] = [];
  const clusterEdges: GraphEdge[] = [];
  for (const [key, members] of buckets) {
    if (members.length < CLUSTER_MIN) continue;
    const [hubId, group] = key.split('|');
    const id = `cluster:${key}`;
    for (const member of members) folded.add(member.id);
    clusters.push({ id, group, label: labelOf(group, members.length), color: members[0].color, degree: members.length, ref: { kind: 'cluster', hubId, memberIds: members.map((m) => m.id) } });
    clusterEdges.push({ id: `${hubId}|${id}`, source: id, target: hubId, kinds: [], labels: [`${members.length} folded together: click to open`], directed: false });
  }
  if (!folded.size) return graph;
  return { nodes: [...graph.nodes.filter((n) => !folded.has(n.id)), ...clusters], edges: [...graph.edges.filter((e) => !folded.has(e.source) && !folded.has(e.target)), ...clusterEdges] };
}

export const GROUP_LABELS: Record<string, string> = { event: 'Events', chapter: 'Chapters & arcs' };

/** A plain description of a node for the inspector and for search-by-name. */
export function describe(node: GraphNode, categories: Map<string, Category>): string {
  if (node.ref.kind === 'entry') return (categories.get(node.ref.entry.category) ?? unknownCategory(node.ref.entry.category)).singular;
  if (node.ref.kind === 'event') return 'Event';
  if (node.ref.kind === 'node') return KIND_LABELS[node.ref.node.kind];
  return 'Group of minor nodes';
}

