// THE RELATIONSHIP NETWORK (as in the original app). A port of
// flutter_app/lib/shared/domain/relationships/network.dart.
//
// Which characters and relationships the map shows, from the shared model and the map's filters. Reads only.
//
//  current  how each relationship stands at the end of the story so far
//  at       as of a chapter: the stage in force there (a stage whose chapter is not said is not assumed begun)
//  range    across chapters: any stage in force between two chapters, drawn as the latest
//  ever     the whole history: any stage at all

import { localeCompare } from '../collation';
import { dartRound } from '../desk/format';
import { connectionsOf, deriveConnections } from '../model/connections';
import { EntityRef } from '../model/entityRef';
import { type StoryModel } from '../model/storyModel';
import { type StoryOrder, sortedStages, stageAt } from '../model/storyOrder';
import { stableSorted } from '../reader/stableSort';
import { connectionType } from '../records/link';
import { type CharacterRelation, type RelationStage } from '../records/relation';
import { timelineOf } from './history';
import { type Affinity, type RelationCategory, affinityOf, relationCategoryOf } from './relationTypes';

/** When the map is read: a sealed choice of four. */
export abstract class When {
  abstract readonly kind: 'now' | 'at' | 'across' | 'ever';
}

export class Now extends When {
  readonly kind = 'now';
}

export class AsOf extends When {
  readonly kind = 'at';
  constructor(readonly nodeId: string) {
    super();
  }
}

export class Across extends When {
  readonly kind = 'across';
  constructor(
    readonly from: string | null,
    readonly to: string | null,
  ) {
    super();
  }
}

export class Ever extends When {
  readonly kind = 'ever';
}

/** Layers that can be hidden: each relationship group, other connections between characters, and line labels. */
export type Layer = RelationCategory | 'connection' | 'labels';

export const layers: readonly Layer[] = [
  'family',
  'social',
  'mentorship',
  'romance',
  'hierarchy',
  'custom',
  'connection',
  'labels',
];

export function layerOf(value: unknown): Layer | null {
  return layers.find((l) => l === value) ?? null;
}

export type NetworkFilter = {
  when?: When;
  /** One type, by key (`friends`, `type:<id>`). */
  type?: string | null;
  /** Characters tied to this entry (a faction, a house) by any connection. */
  factionId?: string | null;
  /** The character the map is centred on, and how many steps out (1 or 2). */
  focus?: { id: string; depth: number } | null;
  hidden?: ReadonlySet<Layer>;
  /** Show characters with no relationship too. */
  isolated?: boolean;
  /** The page's own filters, for relationships: keep this one? */
  keep?: ((relationId: string) => boolean) | null;
};

export class NetworkNode {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly degree: number,
    readonly focus: boolean,
  ) {}
}

export type EdgeKind = 'relationship' | 'connection';

export class NetworkEdge {
  /** A relationship's id, or a connection's. */
  readonly id: string;
  readonly kind: EdgeKind;
  readonly from: string;
  readonly to: string;
  readonly directed: boolean;
  /** Its type, in words: "Mentor / Student", "Distrusts". */
  readonly label: string;
  readonly fromRole: string;
  readonly toRole: string;
  /** Its group, or null for another connection. */
  readonly category: RelationCategory | null;
  readonly affinity: Affinity | null;
  readonly stage: RelationStage | null;
  /** Where the stage applies: "Chapters 3+". */
  readonly range: string;

  constructor(args: {
    id: string;
    kind: EdgeKind;
    from: string;
    to: string;
    directed: boolean;
    label: string;
    fromRole: string;
    toRole: string;
    category: RelationCategory | null;
    affinity: Affinity | null;
    stage: RelationStage | null;
    range: string;
  }) {
    this.id = args.id;
    this.kind = args.kind;
    this.from = args.from;
    this.to = args.to;
    this.directed = args.directed;
    this.label = args.label;
    this.fromRole = args.fromRole;
    this.toRole = args.toRole;
    this.category = args.category;
    this.affinity = args.affinity;
    this.stage = args.stage;
    this.range = args.range;
  }
}

export class Network {
  constructor(
    readonly nodes: readonly NetworkNode[],
    readonly edges: readonly NetworkEdge[],
    /** Relationships in the novel, and how many the filters and layers leave out. */
    readonly total: number,
    readonly hidden: number,
  ) {}
}

const startOf = (s: RelationStage, order: StoryOrder) =>
  s.startNodeId === null ? -1 : (order.position.get(s.startNodeId) ?? -1);

/** The stage a relationship is drawn as under `when`, among those matching `type`; null when none. */
export function stageShown(
  relation: CharacterRelation,
  model: StoryModel,
  when: When,
  type: string | null = null,
): RelationStage | null {
  const fits = (s: RelationStage | null) => (s !== null && (type === null || s.preset === type) ? s : null);
  if (when instanceof AsOf) return fits(stageAt(relation, when.nodeId, model.order));
  if (when instanceof Ever) {
    const stages = sortedStages(relation, model.order).filter((s) => type === null || s.preset === type);
    return stages.length === 0 ? null : stages[stages.length - 1];
  }
  if (when instanceof Across) {
    const lo = when.from === null ? -Infinity : (model.order.position.get(when.from) ?? -Infinity);
    const hi = when.to === null ? Infinity : (model.order.position.get(when.to) ?? Infinity);
    const stages = sortedStages(relation, model.order);
    let last: RelationStage | null = null;
    stages.forEach((s, i) => {
      if (s.startUnknown) return;
      const next = stages.slice(i + 1).find((x) => !x.startUnknown) ?? null;
      const sLo = startOf(s, model.order);
      const sHi = next === null ? Infinity : startOf(next, model.order) - 1;
      if (sLo <= hi && sHi >= lo && (type === null || s.preset === type)) last = s;
    });
    return last;
  }
  return fits(stageAt(relation, null, model.order));
}

/** The network the map shows under these filters. */
export function relationNetwork(model: StoryModel, filter: NetworkFilter = {}): Network {
  const when = filter.when ?? new Now();
  const type = filter.type ?? null;
  const hiddenLayers = filter.hidden ?? new Set<Layer>();
  const keep = filter.keep ?? null;
  const characters = new Map(
    [...model.entries.values()].filter((e) => e.category === 'character').map((e) => [e.id, e]),
  );
  const connections = deriveConnections(model).connections;
  const factionId = filter.factionId ?? null;
  const members =
    factionId !== null && model.entries.has(factionId)
      ? new Set(
          connectionsOf(connections, new EntityRef('entry', factionId))
            .filter((c) => c.other.type === 'entry' && characters.has(c.other.id))
            .map((c) => c.other.id),
        )
      : null;

  let edges: NetworkEdge[] = [];
  for (const relation of model.relations.values()) {
    if (!characters.has(relation.fromId) || !characters.has(relation.toId)) continue;
    if (keep !== null && !keep(relation.id)) continue;
    const stage = stageShown(relation, model, when, type);
    if (stage === null) continue;
    const category = relationCategoryOf(stage.category);
    if (hiddenLayers.has(category)) continue;
    if (members !== null && !members.has(relation.fromId) && !members.has(relation.toId)) continue;
    const range = timelineOf(relation, model.order).find((x) => x.stage.id === stage.id)?.range ?? '';
    edges.push(
      new NetworkEdge({
        id: relation.id,
        kind: 'relationship',
        from: relation.fromId,
        to: relation.toId,
        directed: stage.directional,
        label: stage.label.length === 0 ? 'Related' : stage.label,
        fromRole: stage.fromRole,
        toRole: stage.toRole,
        category,
        affinity: affinityOf(stage.affinity),
        stage,
        range,
      }),
    );
  }
  // Other typed connections between two characters: a layer of their own, with no history.
  if (!hiddenLayers.has('connection') && type === null) {
    for (const c of connections) {
      if (
        c.kind !== 'link' ||
        c.from.type !== 'entry' ||
        c.to.type !== 'entry' ||
        !characters.has(c.from.id) ||
        !characters.has(c.to.id)
      ) {
        continue;
      }
      if (members !== null && !members.has(c.from.id) && !members.has(c.to.id)) continue;
      edges.push(
        new NetworkEdge({
          id: c.id,
          kind: 'connection',
          from: c.from.id,
          to: c.to.id,
          directed: c.directed,
          label: c.label.length > 0 ? c.label : connectionType(c.type).label,
          fromRole: '',
          toRole: '',
          category: null,
          affinity: null,
          stage: null,
          range: '',
        }),
      );
    }
  }

  // Focus: the character and those within one or two steps of them, by what is shown.
  let focusIds: Set<string> | null = null;
  const focus = filter.focus ?? null;
  if (focus !== null && characters.has(focus.id)) {
    let reached = new Set([focus.id]);
    for (let step = 0; step < focus.depth; step++) {
      const ring = new Set(reached);
      for (const e of edges) {
        if (reached.has(e.from)) ring.add(e.to);
        if (reached.has(e.to)) ring.add(e.from);
      }
      reached = ring;
    }
    focusIds = reached;
    const within = reached;
    edges = edges.filter((e) => within.has(e.from) && within.has(e.to));
  }

  const degree = new Map<string, number>();
  for (const e of edges) {
    for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  }
  const shown = new Set(degree.keys());
  if (focusIds !== null) {
    for (const id of focusIds) shown.add(id);
  } else if (filter.isolated === true) {
    for (const id of characters.keys()) {
      if (members === null || members.has(id)) shown.add(id);
    }
  }
  const nodes = stableSorted(
    [...shown].map((id) => new NetworkNode(id, characters.get(id)!.name, degree.get(id) ?? 0, id === focus?.id)),
    (a, b) => {
      const c = localeCompare(a.name, b.name);
      return c !== 0 ? c : localeCompare(a.id, b.id);
    },
  );
  const relationships = edges.filter((e) => e.kind === 'relationship').length;
  return new Network(
    nodes,
    stableSorted(edges, (a, b) => localeCompare(a.id, b.id)),
    model.relations.size,
    model.relations.size - relationships,
  );
}

/** A node's size, in three steps a reader can tell apart: one tie or none, a few (2–5), many (6 or more). */
export function radiusOf(degree: number): number {
  return degree >= 6 ? 25 : degree >= 2 ? 19 : 14;
}

export type Point = { x: number; y: number };

/** Where each character goes: a force layout from a fixed start (everyone on a circle in the order given) for a fixed
 * number of steps, so the same network is always drawn the same way. Ties pull, everyone pushes everyone apart, a
 * gentle pull keeps the whole near the centre, and nobody overlaps. */
export function layoutNetwork(
  nodes: readonly NetworkNode[],
  edges: readonly NetworkEdge[],
  trig: Trig = Math,
): Map<string, Point> {
  return layoutGraph(
    nodes.map((n) => ({ id: n.id, degree: n.degree })),
    edges.map((e) => ({ from: e.from, to: e.to })),
    trig,
  );
}

/** The cosine and sine the layout starts from (everyone on a circle). Dart's math.cos and math.sin are the platform's
 * C library's, and so is JavaScript's on Hermes; libraries differ in the last bit for a few angles (Windows' from
 * Android's and from V8's), and a force layout can carry that to a pixel. Tests pass the Flutter app's own values. */
export type Trig = { cos(a: number): number; sin(a: number): number };

/** How far one record may move in one step of the layout. */
const maxStep = 40.0;

/** The same layout for any network: each node by its id and how many it is tied to, each tie by its two ends. Every
 * position is a whole number (Dart's `roundToDouble`, halves away from zero; -0 stays -0). */
export function layoutGraph(
  nodes: readonly { id: string; degree: number }[],
  edges: readonly { from: string; to: string }[],
  trig: Trig = Math,
): Map<string, Point> {
  const n = nodes.length;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const r = nodes.map((node) => radiusOf(node.degree));
  const ring = 40.0 + n * 9;
  const x = nodes.map((_, i) => trig.cos((2 * Math.PI * i) / Math.max(n, 1)) * ring);
  const y = nodes.map((_, i) => trig.sin((2 * Math.PI * i) / Math.max(n, 1)) * ring);
  const links: [number, number][] = [];
  for (const e of edges) {
    if (index.has(e.from) && index.has(e.to) && e.from !== e.to) links.push([index.get(e.from)!, index.get(e.to)!]);
  }
  const ties = new Array<number>(n).fill(0);
  for (const [a, b] of links) {
    ties[a]++;
    ties[b]++;
  }
  if (n > 1) {
    const steps = Math.max(60, Math.min(300, dartRound(40000 / n)));
    for (let step = 0; step < steps; step++) {
      const alpha = 1.0 - step / steps;
      const dx = new Array<number>(n).fill(0);
      const dy = new Array<number>(n).fill(0);
      // Everyone pushes everyone apart, less with distance.
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let vx = x[j] - x[i];
          let vy = y[j] - y[i];
          let d2 = vx * vx + vy * vy;
          if (d2 < 1e-6) {
            vx = j - i;
            vy = 1;
            d2 = vx * vx + vy * vy;
          }
          if (d2 > 900 * 900) continue;
          // As d3 does: never as if closer than one unit, so two records nearly on top of each other are not flung.
          const f = 260 / Math.max(d2, 1);
          dx[i] -= vx * f;
          dy[i] -= vy * f;
          dx[j] += vx * f;
          dy[j] += vy * f;
        }
      }
      // Ties pull towards their length. As d3 does, each tie moves the end with fewer ties more, so a record tied to
      // many is not pulled every way at once (and set swinging further each step).
      for (const [a, b] of links) {
        const vx = x[b] - x[a];
        const vy = y[b] - y[a];
        const d = Math.max(Math.sqrt(vx * vx + vy * vy), 1e-6);
        const want = 70 + r[a] + r[b];
        const f = ((d - want) / d) * 0.4;
        const bias = ties[a] / (ties[a] + ties[b]);
        dx[a] += vx * f * (1 - bias);
        dy[a] += vy * f * (1 - bias);
        dx[b] -= vx * f * bias;
        dy[b] -= vy * f * bias;
      }
      for (let i = 0; i < n; i++) {
        dx[i] -= x[i] * 0.05;
        dy[i] -= y[i] * 0.05;
        // No step further than maxStep: the layout settles instead of running away.
        const moved = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) * alpha;
        const scale = moved > maxStep ? maxStep / moved : 1.0;
        x[i] += dx[i] * alpha * scale;
        y[i] += dy[i] * alpha * scale;
      }
      // Nobody overlaps.
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const vx = x[j] - x[i];
          const vy = y[j] - y[i];
          const d = Math.sqrt(vx * vx + vy * vy);
          const min = r[i] + r[j] + 22;
          if (d < min && d > 1e-6) {
            const push = (min - d) / d / 2;
            x[i] -= vx * push;
            y[i] -= vy * push;
            x[j] += vx * push;
            y[j] += vy * push;
          }
        }
      }
    }
  }
  return new Map(nodes.map((node, i) => [node.id, { x: dartRound(x[i]), y: dartRound(y[i]) }]));
}
