// THE RELATIONSHIP MAP: characters and their relationships, drawn from the shared records, with filters that only
// choose what is shown. Selecting a character or a line opens the right record. The list shows the same as a table.
// The logic of flutter_app/lib/features/relationships/relationship_map_page.dart: the map's own state and what a saved
// view keeps of it, the filters offered, the words, where everything is drawn (from `layoutNetwork`), what lights
// up, what a tap or a key selects, and the list.

import { localeCompare } from '../../collation';
import { formatNumber, plural } from '../../desk/format';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { type JsonMap, mapOrNull, strOrNull } from '../../json';
import { dartSort } from '../../manuscript/dartSort';
import { type StoryModel } from '../../model/storyModel';
import { stableSorted } from '../../reader/stableSort';
import { strings } from '../../records/jsonRecord';
import { dartTrim } from '../../text/dartString';
import {
  Across,
  AsOf,
  Ever,
  type Layer,
  type Network,
  type NetworkEdge,
  type NetworkFilter,
  type NetworkNode,
  Now,
  type Point,
  type When,
  layerOf,
  layers,
  LayoutRun,
  layoutNetwork,
  radiusOf,
} from '../network';
import {
  type RelationCategory,
  type RelationPreset,
  type RelationSettings,
  affinityLabels,
  relationCategories,
  relationCategoryLabels,
  relationCategoryOf,
  typeFor,
} from '../relationTypes';
import { type Choice, charactersOf } from './cast';
import { relationshipPath } from './relationshipPage';

// --------------------------------------------------------------------------------------------------- line styles

/** Each group's colour and line pattern: never told by colour alone. `dash` is on, off, on, off… in pixels (empty:
 * solid). Colours are #RRGGBB. */
export type EdgeStyle = { color: string; dash: readonly number[]; width: number; pattern: string };

export function edgeStyle(c: RelationCategory | null): EdgeStyle {
  switch (c) {
    case 'family':
      return { color: '#8E4A2E', dash: [], width: 3.0, pattern: 'solid, heavier' };
    case 'social':
      return { color: '#3D5FA8', dash: [12, 6], width: 2.0, pattern: 'long dashes' };
    case 'mentorship':
      return { color: '#3F7D4E', dash: [2, 5], width: 2.2, pattern: 'dotted' };
    case 'romance':
      return { color: '#A8436B', dash: [10, 4, 2, 4], width: 2.0, pattern: 'dash-dot' };
    case 'hierarchy':
      return { color: '#7A4FA3', dash: [5, 4], width: 2.0, pattern: 'short dashes' };
    case 'custom':
      return { color: '#5C6370', dash: [], width: 1.2, pattern: 'thin' };
    default:
      return { color: '#9A9A9A', dash: [], width: 1.0, pattern: 'thin, grey' };
  }
}

/** The legend under the map: each group's line and words, then other connections, then what arrows mean. */
export function mapLegend(): { category: RelationCategory | null; style: EdgeStyle; label: string }[] {
  return [...relationCategories, null].map((c) => ({
    category: c,
    style: edgeStyle(c),
    label: `${c === null ? 'Other connections' : relationCategoryLabels[c]} (${edgeStyle(c).pattern})`,
  }));
}

export const legendArrows = 'Arrows: one-way, from the first role to the second.';

// ------------------------------------------------------------------------------------------------ the map's state

export type WhenKind = 'now' | 'at' | 'across' | 'ever';
export const whenKinds: readonly WhenKind[] = ['now', 'at', 'across', 'ever'];

/** What the map page holds of its own: when it is read, its filters, and map or list. */
export type MapState = {
  when: WhenKind;
  at: string | null;
  from: string | null;
  to: string | null;
  type: string | null;
  faction: string | null;
  focus: string | null;
  depth: 1 | 2;
  /** In the order they were hidden (a saved view keeps that order). */
  hidden: ReadonlySet<Layer>;
  isolated: boolean;
  list: boolean;
};

export const initialMapState: MapState = {
  when: 'now',
  at: null,
  from: null,
  to: null,
  type: null,
  faction: null,
  focus: null,
  depth: 1,
  hidden: new Set(),
  isolated: false,
  list: false,
};

/** The `When` the state reads at: as of a chapter not yet chosen is now. */
export function whenOf(state: MapState): When {
  switch (state.when) {
    case 'at':
      return state.at === null ? new Now() : new AsOf(state.at);
    case 'across':
      return new Across(state.from, state.to);
    case 'ever':
      return new Ever();
    default:
      return new Now();
  }
}

/** The network's filter for the state; `keep` is the shared filters' (`matchingKeys`), for relationships. */
export function networkFilterOf(state: MapState, keep: ReadonlySet<string> | null = null): NetworkFilter {
  return {
    when: whenOf(state),
    type: state.type,
    factionId: state.faction,
    focus: state.focus === null ? null : { id: state.focus, depth: state.depth },
    hidden: state.hidden,
    isolated: state.isolated,
    keep: keep === null ? null : (id) => keep.has(`relation:${id}`),
  };
}

/** "Clear filters": back to now, any type and faction, everyone, every layer, no lone characters. The chapters chosen,
 * the depth and map or list are kept. */
export function clearedMapState(state: MapState): MapState {
  return { ...state, when: 'now', type: null, faction: null, focus: null, hidden: new Set(), isolated: false };
}

/** Whether any filter is on (other than now). */
export function mapFiltered(state: MapState): boolean {
  return (
    state.when !== 'now' ||
    state.type !== null ||
    state.faction !== null ||
    state.focus !== null ||
    state.hidden.size > 0 ||
    state.isolated
  );
}

/** What a saved view of the map keeps: its own choices, besides the shared filters. */
export function mapConfig(state: MapState): JsonMap {
  const layout: JsonMap = { when: state.when };
  if (state.at !== null) layout['at'] = state.at;
  if (state.from !== null) layout['from'] = state.from;
  if (state.to !== null) layout['to'] = state.to;
  if (state.type !== null) layout['type'] = state.type;
  if (state.faction !== null) layout['faction'] = state.faction;
  if (state.focus !== null) layout['focus'] = state.focus;
  layout['depth'] = state.depth;
  layout['isolated'] = state.isolated;
  return { mode: state.list ? 'list' : 'visual', layers: [...state.hidden], layout };
}

/** A saved view applied: its choices replace the map's own. */
export function applyMapConfig(c: JsonMap): MapState {
  const layout = mapOrNull(c['layout']) ?? {};
  const hidden = new Set<Layer>();
  for (const l of strings(c['layers'])) {
    const layer = layerOf(l);
    if (layer !== null) hidden.add(layer);
  }
  return {
    list: c['mode'] === 'list',
    hidden,
    when: whenKinds.find((w) => w === layout['when']) ?? 'now',
    at: strOrNull(layout['at']),
    from: strOrNull(layout['from']),
    to: strOrNull(layout['to']),
    type: strOrNull(layout['type']),
    faction: strOrNull(layout['faction']),
    focus: strOrNull(layout['focus']),
    depth: layout['depth'] === 2 ? 2 : 1,
    isolated: layout['isolated'] === true,
  };
}

// ---------------------------------------------------------------------------------------------------- the filters

export const whenChoices: readonly Choice<WhenKind>[] = [
  { value: 'now', label: 'Now (end of the story)' },
  { value: 'at', label: 'As of a chapter' },
  { value: 'across', label: 'Across chapters' },
  { value: 'ever', label: 'At any time' },
];

/** A layer's chip. */
export function layerLabel(layer: Layer): string {
  return layer === 'connection'
    ? 'Other connections'
    : layer === 'labels'
      ? 'Labels on lines'
      : relationCategoryLabels[relationCategoryOf(layer)];
}

/** The filters as offered, for the state. On a phone (`compact`) they fold away until shown. */
export type MapFiltersView = {
  when: { label: 'When'; value: WhenKind; choices: readonly Choice<WhenKind>[] };
  /** As of a chapter: which (no choice for none). */
  at: { label: 'Chapter'; value: string | null; choices: Choice<string | null>[] } | null;
  /** Across chapters: from and to (null: the start, the end). */
  across: {
    from: { label: 'From'; value: string | null; choices: Choice<string | null>[] };
    to: { label: 'To'; value: string | null; choices: Choice<string | null>[] };
  } | null;
  /** The types used in the novel's stages, by name. */
  type: { label: 'Type'; value: string | null; choices: Choice<string | null>[] };
  /** Only when the novel has factions. */
  faction: { label: 'Faction'; value: string | null; choices: Choice<string | null>[] } | null;
  focus: { label: 'Focus on'; value: string | null; choices: Choice<string | null>[] };
  /** "and their ties' ties", when focused: selected at depth 2. */
  depth: { label: string; selected: boolean } | null;
  showLabel: 'Show:';
  /** Each layer's chip: selected while shown. */
  layers: { layer: Layer; label: string; selected: boolean }[];
  isolated: { label: string; selected: boolean };
  /** "Clear filters", when any is on. */
  clear: string | null;
};

/** The types the novel's stages use, each once, by name. */
export function typesInUse(model: StoryModel, settings: RelationSettings): RelationPreset[] {
  const keys = new Set<string>();
  for (const r of model.relations.values()) for (const s of r.stages) keys.add(s.preset);
  const types = settings.types;
  return stableSorted(
    [...keys].map((k) => typeFor(k, types)),
    (a, b) => localeCompare(a.label, b.label),
  );
}

export function mapFiltersView(model: StoryModel, settings: RelationSettings, state: MapState): MapFiltersView {
  const chapters = model.order.chapters.map((c) => ({ value: c.id as string | null, label: c.displayTitle }));
  const factions = stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'faction'),
    (a, b) => localeCompare(a.name, b.name),
  );
  return {
    when: { label: 'When', value: state.when, choices: whenChoices },
    at: state.when === 'at' ? { label: 'Chapter', value: state.at, choices: chapters } : null,
    across:
      state.when === 'across'
        ? {
            from: { label: 'From', value: state.from, choices: [{ value: null, label: 'The start' }, ...chapters] },
            to: { label: 'To', value: state.to, choices: [{ value: null, label: 'The end' }, ...chapters] },
          }
        : null,
    type: {
      label: 'Type',
      value: state.type,
      choices: [
        { value: null, label: 'Any type' },
        ...typesInUse(model, settings).map((t) => ({ value: t.key as string | null, label: t.label })),
      ],
    },
    faction:
      factions.length > 0
        ? {
            label: 'Faction',
            value: state.faction,
            choices: [
              { value: null, label: 'Any faction' },
              ...factions.map((f) => ({ value: f.id as string | null, label: f.name })),
            ],
          }
        : null,
    focus: {
      label: 'Focus on',
      value: state.focus,
      choices: [
        { value: null, label: 'Everyone' },
        ...charactersOf(model).map((p) => ({ value: p.id as string | null, label: p.name })),
      ],
    },
    depth: state.focus !== null ? { label: 'and their ties’ ties', selected: state.depth === 2 } : null,
    showLabel: 'Show:',
    layers: layers.map((layer) => ({ layer, label: layerLabel(layer), selected: !state.hidden.has(layer) })),
    isolated: { label: 'Characters with no ties', selected: state.isolated },
    clear: mapFiltered(state) ? 'Clear filters' : null,
  };
}

/** A layer's chip pressed: shown again, or hidden (added last). */
export function layerToggled(state: MapState, layer: Layer, on: boolean): MapState {
  const hidden = new Set(state.hidden);
  if (on) hidden.delete(layer);
  else hidden.add(layer);
  return { ...state, hidden };
}

/** On a phone, the button that folds the filters: its words. */
export function filtersToggleLabel(showFilters: boolean, filtered: boolean): string {
  return showFilters ? 'Hide filters' : filtered ? 'Filters (some on)' : 'Filters';
}

/** Filters show unless the author folded them; on a phone they start folded. */
export function filtersShown(chosen: boolean | null, compact: boolean): boolean {
  return chosen ?? !compact;
}

// --------------------------------------------------------------------------------------------------- the summary

export const mapTitle = 'Relationship map';

/** "Showing 3 characters and 2 of 2 relationships, with 1 other connection." */
export function mapCount(net: Network): string {
  const connections = net.edges.filter((e) => e.kind === 'connection').length;
  const relationships = net.edges.length - connections;
  return (
    `Showing ${plural(net.nodes.length, 'character')} and ${formatNumber(relationships)} of ` +
    `${plural(net.total, 'relationship')}${connections > 0 ? `, with ${plural(connections, 'other connection')}` : ''}.`
  );
}

/** What the page shows below the filters: no results (with "Clear filters"), the first tie (an empty map), the
 * list, or the map. */
export function mapBody(net: Network, state: MapState): 'no-results' | 'first-tie' | 'list' | 'map' {
  if (net.edges.length === 0 && net.nodes.length === 0) return mapFiltered(state) ? 'no-results' : 'first-tie';
  return state.list ? 'list' : 'map';
}

/** The map's height: 460 on a phone, 620 otherwise. */
export const mapHeight = (compact: boolean): number => (compact ? 460 : 620);

/** The view switch. */
export const viewChoices: readonly Choice<boolean>[] = [
  { value: false, label: 'Map' },
  { value: true, label: 'List' },
];

// -------------------------------------------------------------------------------------------------- the selection

/** What is selected: a character or a relationship is the workspace's selection; a connection line is the map's own
 * (it is not a record of its own). */
export type MapSelection = { node: string | null; edge: string | null };

/** The selected node and line, from the workspace's selection (an entry or a relation) and the map's own line. */
export function selectionOf(selected: { type: string; id: string } | null, selectedLink: string | null): MapSelection {
  return {
    node: selected?.type === 'entry' ? selected.id : null,
    edge: selected?.type === 'relation' ? selected.id : selectedLink,
  };
}

/** A line tapped (or none): a relationship becomes the workspace's selection (`relation`); a connection, the map's
 * own `selectedLink`. */
export function edgeTapped(
  model: StoryModel,
  id: string | null,
): { select: { type: 'relation'; id: string } | null; selectedLink: string | null } {
  const relation = id !== null && model.relations.has(id);
  return { select: relation ? { type: 'relation', id: id! } : null, selectedLink: relation ? null : id };
}

/** A character tapped (or none): the workspace's selection (`entry`); the map's own line is let go. */
export function nodeTapped(id: string | null): { select: { type: 'entry'; id: string } | null; selectedLink: null } {
  return { select: id === null ? null : { type: 'entry', id }, selectedLink: null };
}

/** The words under the map for what is selected. */
export type SelectionView =
  | { kind: 'none'; text: string }
  | { kind: 'node'; text: string; focus: { label: string; id: string } }
  | { kind: 'relationship'; text: string }
  | {
      kind: 'connection';
      title: string;
      lines: string[];
      /** Open each end's profile. */
      open: { label: string; characterId: string }[];
    };

export function selectionView(model: StoryModel, net: Network, sel: MapSelection): SelectionView {
  const node = net.nodes.find((n) => n.id === sel.node) ?? null;
  const edge = net.edges.find((e) => e.id === sel.edge) ?? null;
  const name = (id: string) => model.entries.get(id)?.name ?? '?';
  // A character or a relationship has its details in the workspace's panel; the map adds what only it can do.
  if (node !== null) {
    return {
      kind: 'node',
      text: `${node.name}: ${plural(node.degree, 'tie')} shown on the map.`,
      focus: { label: `Focus the map on ${node.name}`, id: node.id },
    };
  }
  if (edge !== null && edge.kind === 'relationship') {
    return {
      kind: 'relationship',
      text:
        edge.range.length === 0
          ? `Shown as “${edge.label}”.`
          : `Shown as “${edge.label}”, which applies ${edge.range}.`,
    };
  }
  if (edge !== null) {
    const direction = edge.directed
      ? `${name(edge.from)} (${edge.fromRole}) → ${name(edge.to)} (${edge.toRole})`
      : `${name(edge.from)} and ${name(edge.to)}`;
    return {
      kind: 'connection',
      title: edge.label,
      lines: [
        `Direction: ${direction}`,
        ...(edge.affinity !== null ? [`Feeling: ${affinityLabels[edge.affinity]}`] : []),
        ...(edge.range.length > 0 ? [`Applies: ${edge.range}`] : []),
        'A connection you recorded; it has no history of its own.',
      ],
      open: [
        { label: `Open ${name(edge.from)}`, characterId: edge.from },
        { label: `Open ${name(edge.to)}`, characterId: edge.to },
      ],
    };
  }
  return {
    kind: 'none',
    text: 'Select a character or a line for its details. Drag to move around; pinch or scroll to zoom.',
  };
}

/** "Focus the map on …": the state focused on that character. */
export const focusedOn = (state: MapState, id: string): MapState => ({ ...state, focus: id });

// ------------------------------------------------------------------------------------------------------ the drawing

/** Room around the drawing, and its least size. */
const pad = 90.0;

/** Where everything is drawn: each character's centre (from `layoutNetwork`, moved so the drawing starts at 0, 0) and
 * the drawing's size (at least 300 × 300). */
export function mapDrawing(net: Network): MapDrawing {
  return mapDrawingFrom(layoutNetwork(net.nodes, net.edges));
}

export type MapDrawing = {
  at: Map<string, Point>;
  width: number;
  height: number;
  /** Ids in layout order, then the box size: when it changes, the map is fitted again. */
  placed: string[];
};

/** The map's layout laid out a few steps at a time (the screen runs it between frames): layoutNetwork's, step by step. */
export function mapLayoutRun(net: Network): LayoutRun {
  return new LayoutRun(
    net.nodes.map((n) => ({ id: n.id, degree: n.degree })),
    net.edges.map((e) => ({ from: e.from, to: e.to })),
  );
}

/** mapDrawing from a layout already made (mapLayoutRun's result, or layoutNetwork's). */
export function mapDrawingFrom(placed: ReadonlyMap<string, Point>): MapDrawing {
  const xs = [...placed.values()].map((p) => p.x);
  const ys = [...placed.values()].map((p) => p.y);
  const minX = (xs.length === 0 ? 0.0 : Math.min(...xs)) - pad;
  const minY = (ys.length === 0 ? 0.0 : Math.min(...ys)) - pad;
  const width = (xs.length === 0 ? 0.0 : Math.max(...xs)) + pad - minX;
  const height = (ys.length === 0 ? 0.0 : Math.max(...ys)) + pad - minY;
  const at = new Map<string, Point>();
  for (const [id, p] of placed) at.set(id, { x: p.x - minX, y: p.y - minY });
  return { at, width: Math.max(width, 300), height: Math.max(height, 300), placed: [...placed.keys()] };
}

/** When the map is fitted again: whenever what is drawn, or the room for it, changes. */
export function fitKey(placed: readonly string[], box: { width: number; height: number }): string {
  return `${placed.join(',')}|${Math.round(box.width)}x${Math.round(box.height)}`;
}

/** "Fit to view": scales the drawing down (never up, and not below a fifth) so all of it shows, centred in the box. */
export function fitTransform(
  box: { width: number; height: number },
  drawing: { width: number; height: number },
): { scale: number; x: number; y: number } {
  const scale = Math.min(
    Math.max(Math.min(1.0, Math.min(box.width / drawing.width, box.height / drawing.height)), 0.2),
    1.0,
  );
  return { scale, x: (box.width - drawing.width * scale) / 2, y: (box.height - drawing.height * scale) / 2 };
}

export const fitTooltip = 'Fit to view';

/** The zoom the map allows, and how far it may be dragged past its edges. */
export const mapZoom = { min: 0.2, max: 4, boundaryMargin: 400 } as const;

/** Labels on lines: with 60 lines or fewer, or once something is selected. */
export function labelsShown(net: Network, sel: MapSelection): boolean {
  return net.edges.length <= 60 || sel.edge !== null || sel.node !== null;
}

/** A line is lit when nothing is selected, it is the one selected, or it touches the character selected. */
export function edgeLit(e: NetworkEdge, sel: MapSelection): boolean {
  return (sel.node === null && sel.edge === null) || sel.edge === e.id || sel.node === e.from || sel.node === e.to;
}

/** A character is lit when nothing is selected, it is selected, or one of its lines touches what is selected. */
export function nodeLit(net: Network, n: NetworkNode, sel: MapSelection): boolean {
  return (
    (sel.node === null && sel.edge === null) ||
    sel.node === n.id ||
    net.edges.some(
      (e) => (e.from === n.id || e.to === n.id) && (e.from === sel.node || e.to === sel.node || e.id === sel.edge),
    )
  );
}

/** A line's label is drawn (at its middle, 11 px) when labels are shown and it is lit, unless nothing is selected on a
 * map of more than 60 lines. */
export function edgeLabelShown(net: Network, e: NetworkEdge, sel: MapSelection): boolean {
  return labelsShown(net, sel) && edgeLit(e, sel) && !(sel.node === null && sel.edge === null && net.edges.length > 60);
}

/** How a line is drawn: its style, faded to 0.18 when not lit, two wider when selected. */
export function edgePaint(e: NetworkEdge, sel: MapSelection): { style: EdgeStyle; opacity: number; width: number } {
  const style = edgeStyle(e.category);
  return { style, opacity: edgeLit(e, sel) ? 1 : 0.18, width: e.id === sel.edge ? style.width + 2 : style.width };
}

/** How a character is drawn: its radius, the accent colour when it is the focus, faded to 0.25 (its name to 0.35)
 * when not lit, a ring (radius + 4, 3 wide, accent) when selected, and the first letter of its name (r × 0.9). */
export function nodePaint(
  net: Network,
  n: NetworkNode,
  sel: MapSelection,
): { radius: number; accent: boolean; opacity: number; nameOpacity: number; ring: boolean; initial: string } {
  const lit = nodeLit(net, n, sel);
  return {
    radius: radiusOf(n.degree),
    accent: n.focus,
    opacity: lit ? 1 : 0.25,
    nameOpacity: lit ? 1 : 0.35,
    ring: n.id === sel.node,
    initial: initialOf(n.name),
  };
}

/** The first letter of a name, in capitals (its first character as a reader sees it); "?" for none. */
export function initialOf(name: string): string {
  const trimmed = dartTrim(name);
  if (trimmed.length === 0) return '?';
  return dartToUpperCase(firstGrapheme(trimmed));
}

function firstGrapheme(text: string): string {
  const Segmenter = (
    Intl as {
      Segmenter?: new (
        l?: string,
        o?: { granularity: string },
      ) => { segment(t: string): Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Segmenter !== undefined) {
    for (const s of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) return s.segment;
  }
  // Without the platform's segmenter: the first code point and the marks that combine with it.
  const points = Array.from(text);
  let out = points[0];
  for (let i = 1; i < points.length && /[̀-ͯ‍️᪰-᫿⃐-⃿]/.test(points[i]); i++) {
    out += points[i];
  }
  return out;
}

/** Where a character's name sits: 12 px text, centred just under its circle. */
export function nameAt(centre: Point, radius: number): Point {
  return { x: centre.x, y: centre.y + radius + 12 };
}

/** The arrowhead of a one-way line: its tip just outside the second character's circle, 10 long, 10 wide. */
export function arrowHead(a: Point, b: Point, toRadius: number): [Point, Point, Point] {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = Math.max(Math.sqrt(vx * vx + vy * vy), 1);
  const dir = { x: vx / len, y: vy / len };
  const tip = { x: b.x - dir.x * (toRadius + 3), y: b.y - dir.y * (toRadius + 3) };
  const side = { x: -dir.y, y: dir.x };
  return [
    tip,
    { x: tip.x - dir.x * 10 + side.x * 5, y: tip.y - dir.y * 10 + side.y * 5 },
    { x: tip.x - dir.x * 10 - side.x * 5, y: tip.y - dir.y * 10 - side.y * 5 },
  ];
}

/** A dashed line's pieces, as the map draws them (dashes from `a`, the last cut at `b`). Solid: the whole line. */
export function dashSegments(a: Point, b: Point, dash: readonly number[]): [Point, Point][] {
  if (dash.length === 0) return [[a, b]];
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const total = Math.sqrt(vx * vx + vy * vy);
  const dir = { x: vx / Math.max(total, 1), y: vy / Math.max(total, 1) };
  const out: [Point, Point][] = [];
  let d = 0.0;
  let i = 0;
  while (d < total) {
    const len = dash[i % dash.length];
    if (i % 2 === 0) {
      const end = Math.min(d + len, total);
      out.push([
        { x: a.x + dir.x * d, y: a.y + dir.y * d },
        { x: a.x + dir.x * end, y: a.y + dir.y * end },
      ]);
    }
    d += len;
    i++;
  }
  return out;
}

/** Dart's `Offset.distance`. */
const distance = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);

/** How far a point is from a line between two points. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return distance(p.x - a.x, p.y - a.y);
  const t = Math.min(Math.max(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2, 0.0), 1.0);
  return distance(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** A tap on the drawing (in its own coordinates): the first character within its circle (+ 4), else the first line
 * within 8, else nothing (which lets go). */
export function hitTest(
  net: Network,
  at: ReadonlyMap<string, Point>,
  p: Point,
): { node: string } | { edge: string } | null {
  for (const n of net.nodes) {
    const c = at.get(n.id)!;
    if (distance(c.x - p.x, c.y - p.y) <= radiusOf(n.degree) + 4) return { node: n.id };
  }
  for (const e of net.edges) {
    if (distanceToSegment(p, at.get(e.from)!, at.get(e.to)!) <= 8) return { edge: e.id };
  }
  return null;
}

/** What a screen reader hears: the first 40 lines in words, and the selected character. */
export function mapSemantics(net: Network, sel: MapSelection): { label: string; value: string | null } {
  const nameOf = (id: string) => `${net.nodes.find((n) => n.id === id)?.name ?? null}`;
  const described = net.edges
    .slice(0, 40)
    .map((e) => `${nameOf(e.from)} ${e.label} ${nameOf(e.to)}`)
    .join('; ');
  const chosen = net.nodes.find((n) => n.id === sel.node) ?? null;
  return {
    label: `Relationship map. ${described}. Use the arrow keys to move from one character to the next. The List view shows the same as a table.`,
    value:
      chosen === null ? null : `Selected: ${chosen.name}, ${chosen.degree} ${chosen.degree === 1 ? 'tie' : 'ties'}`,
  };
}

export type MapKey = 'ArrowRight' | 'ArrowDown' | 'ArrowLeft' | 'ArrowUp' | 'Home' | 'End' | 'Escape';

/** From the keyboard: the arrows move from one character to the next, by name; Escape lets go. The answer is the
 * character to select (`select`, null to let go), or null when the key is not the map's. */
export function mapKey(net: Network, sel: MapSelection, key: string): { select: string | null } | null {
  const people = dartSort([...net.nodes], (a, b) => localeCompare(a.name, b.name));
  if (people.length === 0) return null;
  const at = people.findIndex((n) => n.id === sel.node);
  if (key === 'Escape' && (sel.node !== null || sel.edge !== null)) return { select: null };
  let next: number | null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = at + 1;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = at < 0 ? people.length - 1 : at - 1;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = people.length - 1;
      break;
    default:
      next = null;
  }
  if (next === null) return null;
  return { select: people[Math.min(Math.max(next, 0), people.length - 1)].id };
}

// --------------------------------------------------------------------------------------------------------- the list

/** One line of the list. A relationship opens its page; a connection does not open. */
export type MapListRow = { id: string; title: string; subtitle: string; opens: string | null };

/** The list: the same lines as the map, as a table. Empty: `mapListEmpty`. */
export function mapList(model: StoryModel, net: Network): MapListRow[] {
  const name = (id: string) => model.entries.get(id)?.name ?? '?';
  return net.edges.map((e) => ({
    id: e.id,
    title:
      `${name(e.from)}${e.fromRole.length > 0 && e.directed ? ` (${e.fromRole})` : ''} · ${e.label} · ` +
      `${name(e.to)}${e.toRole.length > 0 && e.directed ? ` (${e.toRole})` : ''}`,
    subtitle: [
      ...(e.affinity !== null ? [affinityLabels[e.affinity]] : []),
      ...(e.range.length > 0 ? [e.range] : []),
      e.kind === 'connection'
        ? 'a connection you recorded'
        : e.category === null
          ? ''
          : relationCategoryLabels[e.category],
    ].join(' · '),
    opens: e.kind === 'relationship' ? relationshipPath(e.id) : null,
  }));
}

export const mapListEmpty = 'Nothing to list.';
