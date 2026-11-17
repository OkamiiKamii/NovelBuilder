// THE KNOWLEDGE GRAPH's page, its pure parts (FEATURES.md #301–#305): the view's own settings (kept as the original
// keeps them in a saved view), and everything the page shows for them: the layers with their counts, what is drawn
// (layers, words and focus; scenes folded into chapters and kinds folded together; at most so many records, always
// with the selection, the focus and a path), the line that says what is shown, everything that leaves part of the
// story out (each with its way back), the path from the selection, the pairs and the list form.
// A port of the pure parts of flutter_app/lib/features/graph/graph_page.dart and widgets/graph_canvas.dart.

import { type ConnectionStatus } from '../../codex/screens/connections';
import { formatNumber, plural } from '../../desk/format';
import { type JsonMap, str, strOrNull } from '../../json';
import type { EntityRef } from '../../model/entityRef';
import type { StoryModel } from '../../model/storyModel';
import {
  type EdgeGroup,
  type GraphEdge,
  type GraphNode,
  type KnowledgeGraph,
  type NodeShape,
  type Pair,
  type TypeCount,
  collapseGraph,
  drawLimit,
  drawStep,
  edgeTypeLabel,
  edgeWords,
  keyOf,
  limitGraph,
  nodeTypeLabel,
  pairsOf,
  pathBetween,
  queryGraph,
  refOf,
  typeCodes,
  typeCounts,
} from '../../graph/knowledge';

/** Where each connection is kept, in words. */
const sourceWords: Readonly<Record<string, string>> = {
  loreLinks: 'a connection you recorded',
  characterRelations: 'a character relationship',
  loreEntries: 'a field of the entry',
  chapters: 'the manuscript',
  chapterPlans: 'a chapter’s plan',
  timelineEvents: 'a timeline event',
  plotThreads: 'a plot thread',
  systemSheets: 'a system sheet',
  systems: 'a system blueprint',
};

export const keptIn = (e: GraphEdge): string => sourceWords[e.connection.source.collection] ?? e.connection.source.collection;

const statusLabels: Readonly<Record<ConnectionStatus, string>> = {
  confirmed: 'Confirmed',
  provisional: 'Provisional',
  disputed: 'Disputed',
  invalid: 'Invalid',
};
export const statusWords = (key: string): string => statusLabels[key as ConnectionStatus] ?? key;

/** The view's own settings, as the original keeps them in a saved view (each a string). */
export class GraphSettings {
  readonly hiddenNodes: ReadonlySet<string>;
  readonly hiddenEdges: ReadonlySet<string>;
  readonly hiddenStatuses: ReadonlySet<string>;
  readonly focus: string | null;
  readonly depth: number;
  readonly isolated: boolean;
  readonly collapsed: ReadonlySet<string>;
  readonly fold: boolean;
  /** How many records to draw at most; Infinity for all. */
  readonly limit: number;
  /** The record to show the path to, from the selection. Not kept in a saved view. */
  readonly path: string | null;

  constructor(args: Partial<GraphSettings> = {}) {
    this.hiddenNodes = args.hiddenNodes ?? new Set();
    this.hiddenEdges = args.hiddenEdges ?? new Set();
    this.hiddenStatuses = args.hiddenStatuses ?? new Set();
    this.focus = args.focus ?? null;
    this.depth = args.depth ?? 1;
    this.isolated = args.isolated ?? false;
    this.collapsed = args.collapsed ?? new Set();
    this.fold = args.fold ?? false;
    this.limit = args.limit ?? drawLimit;
    this.path = args.path ?? null;
  }

  static of(layout: JsonMap): GraphSettings {
    const list = (v: unknown) => new Set(str(v).split(',').filter((s) => s.length > 0));
    const limit = str(layout['glimit']);
    const asked = Number(limit);
    return new GraphSettings({
      hiddenNodes: list(layout['ghide']),
      hiddenEdges: list(layout['gedges']),
      hiddenStatuses: list(layout['gstatus']),
      focus: strOrNull(layout['gfocus']),
      depth: layout['gdepth'] === '2' ? 2 : 1,
      isolated: layout['gall'] === '1',
      collapsed: list(layout['gcollapse']),
      fold: layout['gfold'] === '1',
      limit: limit === 'all' ? Number.POSITIVE_INFINITY : limit.length > 0 && Number.isFinite(asked) && asked > drawLimit ? asked : drawLimit,
    });
  }

  toLayout(): JsonMap {
    return {
      ...(this.hiddenNodes.size > 0 ? { ghide: [...this.hiddenNodes].join(',') } : {}),
      ...(this.hiddenEdges.size > 0 ? { gedges: [...this.hiddenEdges].join(',') } : {}),
      ...(this.hiddenStatuses.size > 0 ? { gstatus: [...this.hiddenStatuses].join(',') } : {}),
      ...(this.focus !== null ? { gfocus: this.focus } : {}),
      ...(this.depth === 2 ? { gdepth: '2' } : {}),
      ...(this.isolated ? { gall: '1' } : {}),
      ...(this.collapsed.size > 0 ? { gcollapse: [...this.collapsed].join(',') } : {}),
      ...(this.fold ? { gfold: '1' } : {}),
      ...(this.limit !== drawLimit ? { glimit: Number.isFinite(this.limit) ? `${Math.trunc(this.limit)}` : 'all' } : {}),
    };
  }

  with(changes: Partial<GraphSettings>): GraphSettings {
    return new GraphSettings({ ...this, ...changes });
  }
}

/** A way back from something that leaves part of the story out: the settings it gives, or what else it does. */
export type GraphUndo =
  | { label: string; settings: GraphSettings }
  | { label: string; command: 'dropFocus' | 'clearSearch' | 'restore' };

export type Partial_ = { key: string; text: string; undo: GraphUndo[] };

export type GraphPage = {
  empty: boolean;
  byKey: Map<string, GraphNode>;
  counts: { nodes: TypeCount[]; edges: TypeCount[]; statuses: TypeCount[] };
  codes: Map<string, string>;
  focusKey: string | null;
  selected: GraphNode | null;
  pathTo: string | null;
  path: GraphEdge[] | null;
  hiddenPath: GraphEdge[] | null;
  drawn: KnowledgeGraph;
  into: Map<string, string>;
  pairs: Pair[];
  status: string;
  partial: Partial_[];
  restorable: boolean;
  labelOf: (key: string) => string;
  typeName: (type: string) => string;
  pairWords: (p: Pair) => string;
  mapped: (key: string) => string;
};

/** The graph page for the whole graph, the view's settings, the shared filters and the selection. */
export function graphPage(
  model: StoryModel,
  full: KnowledgeGraph,
  s: GraphSettings,
  filters: { text: string; involving: string | null },
  selection: EntityRef | null,
): GraphPage {
  const byKey = new Map(full.nodes.map((n) => [n.key, n]));
  const text = filters.text;
  const asked = filters.involving;
  const focusKey =
    s.focus !== null && byKey.has(s.focus) ? s.focus : asked !== null && byKey.has(`entry:${asked}`) ? `entry:${asked}` : null;
  const focus = focusKey === null ? null : { key: focusKey, depth: s.depth };

  // 1. Layers, words and focus.
  const query = (isolated: boolean) => ({
    hiddenNodes: s.hiddenNodes,
    hiddenEdges: s.hiddenEdges,
    hiddenStatuses: s.hiddenStatuses,
    text,
    focus,
    isolated,
  });
  const filtered = queryGraph(full, query(s.isolated));
  // The same, with records that have no connection shown: the difference is what that leaves out.
  const withIsolated = s.isolated ? filtered.nodes.length : queryGraph(full, query(true)).nodes.length;

  // 2. Folding: scenes into their chapters, kinds of record into one group each.
  const folder = (key: string): string | null => {
    const ref = refOf(key);
    const node = ref?.type === 'node' ? model.nodes.get(ref.id) : undefined;
    return node?.kindKey === 'scene' && node.parentId !== null && model.nodes.get(node.parentId)?.kindKey === 'chapter'
      ? `node:${node.parentId}`
      : null;
  };
  const collapsed = collapseGraph(filtered, {
    types: s.collapsed,
    fold: s.fold ? folder : null,
    groupLabel: (type, count) => `${count} ${nodeTypeLabel(type, model).toLowerCase()}`,
  });
  const selected = selection === null ? null : (byKey.get(keyOf(selection)) ?? null);
  const pathTo = s.path !== null && byKey.has(s.path) ? s.path : null;
  const path = selected !== null && pathTo !== null ? pathBetween(filtered.edges, selected.key, pathTo) : null;
  const hiddenPath = selected !== null && pathTo !== null && path === null ? pathBetween(full.edges, selected.key, pathTo) : null;
  const mapped = (key: string) => collapsed.into.get(key) ?? key;

  // 3. The limit, always keeping the selection, the focus and a path in.
  const keep = new Set<string>([
    ...(selected !== null ? [mapped(selected.key)] : []),
    ...(focusKey !== null ? [mapped(focusKey)] : []),
    ...(path ?? []).flatMap((e) => [mapped(e.from), mapped(e.to)]),
  ]);
  const limited = limitGraph(collapsed.graph, s.limit, keep);
  const drawn = limited.graph;
  const counts = typeCounts(full);
  // Kinds of record that share a shape carry a letter code, from every kind in the novel so a filter never changes it.
  const codes = typeCodes(
    full.nodes.map((n) => n.type),
    (t) => nodeTypeLabel(t, model),
  );
  const drawnByKey = new Map(drawn.nodes.map((n) => [n.key, n]));
  const labelOf = (key: string) => byKey.get(key)?.label ?? drawnByKey.get(key)?.label ?? 'Something deleted';
  const typeName = (t: string) => nodeTypeLabel(t, model);
  const pairs = pairsOf(drawn.edges);
  const pairWords = (p: Pair) => p.edges.map((e) => edgeWords(e, labelOf)).join('; ');

  const records = drawn.nodes.reduce((n, x) => n + (x.isGroup ? x.members!.length : 1), 0);
  const groupCount = drawn.nodes.filter((n) => n.isGroup).length;
  const status =
    `Showing ${formatNumber(records)} of ${formatNumber(full.nodes.length)} records and ` +
    `${formatNumber(drawn.edges.length)} of ${formatNumber(full.edges.length)} connections` +
    `${focusKey !== null ? `, around ${labelOf(focusKey)}` : ''}` +
    `${groupCount > 0 ? `, ${groupCount} ${groupCount === 1 ? 'group' : 'groups'} folded together` : ''}.` +
    (full.dangling > 0
      ? ` ${full.dangling} ${full.dangling === 1 ? 'connection points' : 'connections point'} at something deleted, and ` +
        `${full.dangling === 1 ? 'is' : 'are'} left out.`
      : '');
  const unconnected = withIsolated - filtered.nodes.length;
  const names = (types: ReadonlySet<string>, label: (t: string) => string) => [...types].map(label).join(', ');

  // Everything that leaves part of the story out, each with its way back.
  const partial: Partial_[] = [];
  if (limited.cut > 0) {
    partial.push({
      key: 'limit',
      text:
        `Only the ${formatNumber(drawn.nodes.length)} most connected of ${formatNumber(limited.total)} records ` +
        `and groups are drawn, so the graph stays readable and quick; ${formatNumber(limited.cut)} more are left out.`,
      undo: [
        {
          label: `Draw ${formatNumber(limited.cut < drawStep ? limited.cut : drawStep)} more`,
          settings: s.with({ limit: drawn.nodes.length + drawStep }),
        },
        { label: `Draw all ${formatNumber(limited.total)} (may be slow)`, settings: s.with({ limit: Number.POSITIVE_INFINITY }) },
      ],
    });
  }
  if (s.hiddenNodes.size > 0) {
    partial.push({
      key: 'nodes',
      text: `Hidden kinds of record: ${names(s.hiddenNodes, typeName)}.`,
      undo: [{ label: 'Show them', settings: s.with({ hiddenNodes: new Set() }) }],
    });
  }
  if ((full.excluded ?? []).length > 0) {
    const ex = full.excluded!;
    partial.push({
      key: 'excluded',
      text:
        'Set, under World → Categories & fields, not to appear in the graph: ' +
        `${ex.map((x) => `${typeName(`entry:${x.category}`)} (${x.count})`).join(', ')}, ` +
        `${plural(ex.reduce((n, x) => n + x.count, 0), 'record')} in all.`,
      undo: [],
    });
  }
  if ((full.undrawn ?? []).length > 0) {
    const un = full.undrawn!;
    partial.push({
      key: 'undrawn',
      text:
        'Link fields set, under World → Categories & fields, not to be drawn: ' +
        `${un.map((x) => `${typeName(`entry:${x.category}`)}: ${x.field} (${x.count})`).join(', ')}, ` +
        `${plural(un.reduce((n, x) => n + x.count, 0), 'connection')} in all.`,
      undo: [],
    });
  }
  if (s.hiddenStatuses.size > 0) {
    partial.push({
      key: 'statuses',
      text: `Connections hidden by status: ${names(s.hiddenStatuses, statusWords)}.`,
      undo: [{ label: 'Show them', settings: s.with({ hiddenStatuses: new Set() }) }],
    });
  }
  if (s.hiddenEdges.size > 0) {
    partial.push({
      key: 'edges',
      text: `Hidden kinds of connection: ${names(s.hiddenEdges, edgeTypeLabel)}.`,
      undo: [{ label: 'Show them', settings: s.with({ hiddenEdges: new Set() }) }],
    });
  }
  if (focusKey !== null) {
    partial.push({
      key: 'focus',
      text: `Only what is within ${s.depth === 1 ? 'one step' : 'two steps'} of ${labelOf(focusKey)}.`,
      undo: [{ label: 'Drop the focus', command: 'dropFocus' }],
    });
  }
  if (text.trim().length > 0) {
    partial.push({
      key: 'text',
      text: `Only records named “${text.trim()}”, and what they are connected to.`,
      undo: [{ label: 'Clear the search', command: 'clearSearch' }],
    });
  }
  if (s.collapsed.size > 0) {
    partial.push({
      key: 'groups',
      text: `Folded together, one node each: ${names(s.collapsed, typeName)}. Connections inside a group are not drawn.`,
      undo: [{ label: 'Open them', settings: s.with({ collapsed: new Set() }) }],
    });
  }
  if (s.fold) {
    partial.push({
      key: 'fold',
      text: 'Scenes are folded into their chapters: a scene’s connections are drawn on its chapter.',
      undo: [{ label: 'Unfold them', settings: s.with({ fold: false }) }],
    });
  }
  if (!s.isolated && unconnected > 0) {
    partial.push({
      key: 'isolated',
      text:
        `${formatNumber(unconnected)} ${unconnected === 1 ? 'record has' : 'records have'} no connection shown, ` +
        `and ${unconnected === 1 ? 'is' : 'are'} not drawn.`,
      undo: [{ label: 'Draw them', settings: s.with({ isolated: true }) }],
    });
  }
  const restorable = partial.some((p) => p.key !== 'limit' && p.key !== 'isolated') || s.limit !== drawLimit || s.isolated;
  return {
    empty: full.nodes.length === 0,
    byKey,
    counts,
    codes,
    focusKey,
    selected,
    pathTo,
    path,
    hiddenPath,
    drawn,
    into: collapsed.into,
    pairs,
    status,
    partial,
    restorable,
    labelOf,
    typeName,
    pairWords,
    mapped,
  };
}

/** The steps of a path in words: "1. Mira takes part in The siege". */
export function pathSteps(path: readonly GraphEdge[], labelOf: (key: string) => string): string[] {
  return path.map((e, i) => `${i + 1}. ${edgeWords(e, labelOf)}`);
}

/** What the path panel says once another record is chosen. */
export function pathSaid(path: readonly GraphEdge[] | null, hiddenPath: readonly GraphEdge[] | null): string | null {
  if (path !== null) return null;
  if (hiddenPath !== null) {
    return `Connected only through what this view hides (${hiddenPath.length} ${hiddenPath.length === 1 ? 'step' : 'steps'}).`;
  }
  return 'Not connected within eight steps.';
}

/** One connection in the list form: how it reads, its kind when that differs, and an arrow when it reads one way. */
export const listWords = (e: GraphEdge): string =>
  `${e.label}${e.label !== edgeTypeLabel(e.type) ? ` · ${edgeTypeLabel(e.type)}` : ''}${e.directed ? ' →' : ''}`;

/** The records the list form shows with no connection. */
export const alone = (drawn: KnowledgeGraph): string[] =>
  drawn.nodes.filter((n) => !drawn.edges.some((e) => e.from === n.key || e.to === n.key)).map((n) => n.label);

// ------------------------------------------------------------------------------------------------- how it is drawn

/** Each group of connections has a colour and a line of its own, so colour is never the only difference. */
export const edgeColor: Readonly<Record<EdgeGroup, string>> = {
  typed: '#3f6fb5',
  relationship: '#b4532a',
  field: '#6b7a2b',
  timeline: '#c08a1e',
  plot: '#7a4fa3',
  manuscript: '#64748b',
  system: '#2b7a8c',
};

/** Dash and gap lengths for a group's line; empty for a solid line. */
export const edgeDash: Readonly<Record<EdgeGroup, readonly number[]>> = {
  typed: [],
  relationship: [],
  system: [],
  field: [12, 5],
  timeline: [6, 4],
  plot: [9, 3, 2, 3],
  manuscript: [2, 3],
};

export const edgeWidth = (g: EdgeGroup): number => (g === 'system' ? 1 : g === 'relationship' ? 3.5 : 1.8);

/** A record's shape as an SVG path: circle, diamond (events), square (chapters, scenes, parts), triangle. */
export function shapePath(shape: NodeShape, x: number, y: number, r: number): string {
  switch (shape) {
    case 'diamond':
      return `M${x} ${y - r - 2}L${x + r + 2} ${y}L${x} ${y + r + 2}L${x - r - 2} ${y}Z`;
    case 'square':
      return `M${x - r + 4} ${y - r}H${x + r - 4}Q${x + r} ${y - r} ${x + r} ${y - r + 4}V${y + r - 4}Q${x + r} ${y + r} ${x + r - 4} ${y + r}H${x - r + 4}Q${x - r} ${y + r} ${x - r} ${y + r - 4}V${y - r + 4}Q${x - r} ${y - r} ${x - r + 4} ${y - r}Z`;
    case 'triangle':
      return `M${x} ${y - r - 3}L${x + r + 2} ${y + r}L${x - r - 2} ${y + r}Z`;
    default:
      return `M${x - r} ${y}A${r} ${r} 0 1 0 ${x + r} ${y}A${r} ${r} 0 1 0 ${x - r} ${y}Z`;
  }
}

/** A label clipped to so many characters, with an ellipsis. */
export const clip = (s: string, n: number): string => (s.length > n ? `${s.substring(0, n - 1)}…` : s);
