import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { connectionType } from '@/modules/connections/types';
import { connectionsOf, deriveConnections } from '@/modules/model/connections';
import type { StoryModel } from '@/modules/model/types';
import { sortedStages, stageAt, timelineOf } from './timeline';
import { RELATION_CATEGORIES, type Affinity, type CharacterRelation, type RelationCategory, type RelationStage } from './types';

/**
 * THE RELATIONSHIP NETWORK
 * Which characters and relationships the map shows, worked out from the
 * shared model and the map's filters; and where to draw them. Reads only:
 * filtering, focusing and hiding layers change nothing stored.
 *
 * When the map looks:
 *  current  how each relationship stands at the end of the story so far
 *  at       as of a chapter: the stage in force there (a stage whose chapter
 *           is not said is not assumed to have begun)
 *  range    across chapters: any stage in force between two chapters; each
 *           relationship is drawn as the latest such stage
 *  ever     the whole history: any stage at all
 * A relationship is shown when the stage it is drawn as matches the type
 * filter and its group's layer is shown.
 */
export type When = { kind: 'current' } | { kind: 'at'; nodeId: string } | { kind: 'range'; from: string | null; to: string | null } | { kind: 'ever' };

/** Layers that can be hidden: each relationship group, other connections between characters, and the labels on the lines. */
export const LAYERS = [...RELATION_CATEGORIES, 'connection', 'labels'] as const;
export type Layer = (typeof LAYERS)[number];

export interface NetworkFilter {
  when?: When;
  /** One type, by key (`friends`, `type:<id>`). */
  type?: string | null;
  /** Characters tied to this entry (a faction, a house, a guild) by any connection. */
  factionId?: string | null;
  /** The character the map is centred on, and how many steps out from them it shows. */
  focus?: { id: string; depth: 1 | 2 } | null;
  /** Layers hidden. */
  hidden?: Layer[];
  /** Show characters with no relationship on the map too. */
  isolated?: boolean;
  /** The page's own filters (search, involving a character), for relationships: keep this one? */
  keep?: (relationId: string) => boolean;
}

export interface NetworkNode {
  id: string;
  name: string;
  /** How many edges it has on the map. */
  degree: number;
  focus: boolean;
}

export interface NetworkEdge {
  /** A relationship's id, or a connection's. */
  id: string;
  kind: 'relationship' | 'connection';
  from: string;
  to: string;
  directed: boolean;
  /** Its type, in words: "Mentor / Student", "Distrusts". */
  label: string;
  fromRole: string;
  toRole: string;
  category: RelationCategory | 'connection';
  affinity: Affinity | null;
  /** The stage it is drawn as, and where that stage applies: "Chapters 3+". */
  stage: RelationStage | null;
  range: string;
}

export interface Network {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  /** Relationships in the novel, and how many the filters and layers leave out. */
  total: number;
  hidden: number;
}

/** Each stage's interval in reading order: from its start to the next known stage's start. Unknown-chapter stages have none. */
function intervals(relation: CharacterRelation, model: StoryModel) {
  const stages = sortedStages(relation, model.order);
  const start = (s: RelationStage) => (s.startNodeId === null ? -1 : (model.order.position.get(s.startNodeId) ?? -1));
  return stages.map((stage, i) => {
    if (stage.startUnknown) return { stage, lo: null, hi: null };
    const next = stages.slice(i + 1).find((s) => !s.startUnknown);
    return { stage, lo: start(stage), hi: next ? start(next) - 1 : Infinity };
  });
}

/** The stage a relationship is drawn as under `when`, among those matching `type`; null when none. */
export function stageShown(relation: CharacterRelation, model: StoryModel, when: When, type: string | null = null): RelationStage | null {
  const fits = (s: RelationStage | null) => (s && (!type || s.preset === type) ? s : null);
  if (when.kind === 'current') return fits(stageAt(relation, null, model.order));
  if (when.kind === 'at') return fits(stageAt(relation, when.nodeId, model.order));
  const stages = sortedStages(relation, model.order).filter((s) => !type || s.preset === type);
  if (when.kind === 'ever') return stages[stages.length - 1] ?? null;
  const lo = when.from ? (model.order.position.get(when.from) ?? -Infinity) : -Infinity;
  const hi = when.to ? (model.order.position.get(when.to) ?? Infinity) : Infinity;
  const inForce = intervals(relation, model).filter((x) => x.lo !== null && x.lo <= hi && x.hi! >= lo && (!type || x.stage.preset === type));
  return inForce[inForce.length - 1]?.stage ?? null;
}

/** The network the map shows under these filters. */
export function relationNetwork(model: StoryModel, filter: NetworkFilter = {}): Network {
  const when = filter.when ?? { kind: 'current' };
  const hidden = new Set(filter.hidden ?? []);
  const characters = new Map([...model.entries.values()].filter((e) => e.category === 'character').map((e) => [e.id, e]));
  const connections = deriveConnections(model).connections;

  // A faction's people: every character tied to it by any connection.
  const members = filter.factionId && model.entries.has(filter.factionId) ? new Set(connectionsOf(connections, { type: 'entry', id: filter.factionId }).filter((c) => c.other.type === 'entry' && characters.has(c.other.id)).map((c) => c.other.id)) : null;

  let edges: NetworkEdge[] = [];
  for (const relation of model.relations.values()) {
    if (!characters.has(relation.fromId) || !characters.has(relation.toId)) continue;
    if (filter.keep && !filter.keep(relation.id)) continue;
    const stage = stageShown(relation, model, when, filter.type ?? null);
    if (!stage || hidden.has(stage.category)) continue;
    if (members && !members.has(relation.fromId) && !members.has(relation.toId)) continue;
    const range = timelineOf(relation, model.order).find((x) => x.stage.id === stage.id)?.range ?? '';
    edges.push({ id: relation.id, kind: 'relationship', from: relation.fromId, to: relation.toId, directed: stage.directional, label: stage.label || 'Related', fromRole: stage.fromRole, toRole: stage.toRole, category: stage.category, affinity: stage.affinity, stage, range });
  }
  // Other typed connections between two characters (one may distrust another): a layer of their own, with no history.
  if (!hidden.has('connection') && !filter.type) {
    for (const c of connections) {
      if (c.kind !== 'link' || c.from.type !== 'entry' || c.to.type !== 'entry' || !characters.has(c.from.id) || !characters.has(c.to.id)) continue;
      if (members && !members.has(c.from.id) && !members.has(c.to.id)) continue;
      edges.push({ id: c.id, kind: 'connection', from: c.from.id, to: c.to.id, directed: c.directed, label: c.label || connectionType(c.type).label, fromRole: '', toRole: '', category: 'connection', affinity: null, stage: null, range: '' });
    }
  }

  // Focus: the character and those within one or two steps of them, by what is shown.
  let focusIds: Set<string> | null = null;
  if (filter.focus && characters.has(filter.focus.id)) {
    let reached = new Set<string>([filter.focus.id]);
    for (let step = 0; step < filter.focus.depth; step++) {
      const ring = new Set<string>(reached);
      for (const e of edges) {
        if (reached.has(e.from)) ring.add(e.to);
        if (reached.has(e.to)) ring.add(e.from);
      }
      reached = ring;
    }
    focusIds = reached;
    edges = edges.filter((e) => reached.has(e.from) && reached.has(e.to));
  }

  const degree = new Map<string, number>();
  for (const e of edges) for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const shownIds = new Set(degree.keys());
  // A focused map shows the whole neighbourhood; otherwise characters with nothing shown are left out unless asked for.
  if (focusIds) for (const id of focusIds) shownIds.add(id);
  else if (filter.isolated) for (const [id] of characters) if (!members || members.has(id)) shownIds.add(id);
  const nodes = [...shownIds].map((id) => ({ id, name: characters.get(id)!.name, degree: degree.get(id) ?? 0, focus: id === filter.focus?.id })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const relationships = edges.filter((e) => e.kind === 'relationship').length;
  return { nodes, edges: edges.sort((a, b) => a.id.localeCompare(b.id)), total: model.relations.size, hidden: model.relations.size - relationships };
}

export interface Placed {
  x: number;
  y: number;
}

type SimNode = SimulationNodeDatum & { id: string; r: number };

/**
 * A node's size on a map, in three steps any reader can tell apart at a glance
 * (the views' design system): one tie or none, a few (2–5), many (6 or more).
 */
export const radiusOf = (degree: number) => (degree >= 6 ? 25 : degree >= 2 ? 19 : 14);

/**
 * Where each character goes: a force layout from a fixed start (everyone on
 * a circle in name order) for a fixed number of steps, so the same network
 * is always drawn the same way. Bigger networks get fewer steps. Any
 * network can be laid out this way: it needs only each node's id and degree,
 * and each edge's ends.
 */
export function layoutNetwork(nodes: Pick<NetworkNode, 'id' | 'degree'>[], edges: Pick<NetworkEdge, 'from' | 'to'>[]): Map<string, Placed> {
  const sim: SimNode[] = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
    const ring = 40 + nodes.length * 9;
    return { id: n.id, r: radiusOf(n.degree), x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
  });
  if (nodes.length > 1) {
    const ids = new Set(nodes.map((n) => n.id));
    const links: SimulationLinkDatum<SimNode>[] = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to).map((e) => ({ source: e.from, target: e.to }));
    const simulation = forceSimulation<SimNode>(sim)
      .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance((l) => 70 + (l.source as SimNode).r + (l.target as SimNode).r).strength(0.4))
      .force('charge', forceManyBody<SimNode>().strength(-260).distanceMax(900))
      .force('x', forceX<SimNode>(0).strength(0.05))
      .force('y', forceY<SimNode>(0).strength(0.05))
      .force('collide', forceCollide<SimNode>((d) => d.r + 22))
      .stop();
    simulation.tick(Math.max(60, Math.min(300, Math.round(40_000 / nodes.length))));
  }
  return new Map(sim.map((n) => [n.id, { x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) }]));
}
