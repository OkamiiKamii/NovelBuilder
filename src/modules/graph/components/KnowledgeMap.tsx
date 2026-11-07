import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { MarkBadge } from '@/modules/canon/components/MarkBadge';
import { markWords, type OverlayMark } from '@/modules/canon/overlay';
import { layoutNetwork, radiusOf, type Placed } from '@/modules/relationships/network';
import type { SwatchShape } from '@/modules/viz/components/Legend';
import { Viewport } from '@/modules/viz/components/Viewport';
import { ArrowMarker } from '@/modules/viz/components/Arrow';
import { statusOf } from '@/modules/integrity/rules';
import { isGroupNode, type GraphEdge, type GraphNode } from '../knowledge';

/** How each kind of record is drawn: a shape as well as a colour, named in the legend. */
export type Shape = 'circle' | 'diamond' | 'square' | 'triangle';
export const shapeOf = (type: string): Shape => (type === 'event' ? 'diamond' : type === 'chapter' || type === 'scene' || type === 'part' ? 'square' : type === 'thread' || type === 'ability' ? 'triangle' : 'circle');
export const SHAPE_SWATCH: Record<Shape, SwatchShape> = { circle: 'circle', diamond: 'diamond', square: 'square', triangle: 'triangle' };

/**
 * Letter codes for the kinds of record that share a shape (characters,
 * places and factions are all circles), so no kind is told by its colour
 * alone: the first letter of its name, or as many as tell them apart.
 */
export function typeCodes(types: string[], label: (type: string) => string): Map<string, string> {
  const codes = new Map<string, string>();
  const byShape = new Map<Shape, string[]>();
  for (const type of [...new Set(types)].sort()) byShape.set(shapeOf(type), [...(byShape.get(shapeOf(type)) ?? []), type]);
  for (const group of byShape.values()) {
    if (group.length < 2) continue;
    const words = group.map((t) => label(t).replace(/[^\p{L}\p{N}]/gu, '') || '?');
    for (let length = 1; length <= 3; length++) {
      const tries = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1, length).toLowerCase());
      const unique = new Set(tries).size === tries.length;
      if (unique || length === 3) {
        group.forEach((t, i) => codes.set(t, unique ? tries[i] : `${tries[i]}${i + 1}`));
        break;
      }
    }
  }
  return codes;
}

/** Connections fall in groups, each with a line of its own (and a colour), named in the legend. */
export const EDGE_GROUPS = ['typed', 'relationship', 'field', 'timeline', 'plot', 'manuscript', 'system'] as const;
export type EdgeGroup = (typeof EDGE_GROUPS)[number];
export const EDGE_GROUP_LABELS: Record<EdgeGroup, string> = { typed: 'Connections you recorded (owns, created by, your own…)', relationship: 'Character relationships', field: 'Named in a field', timeline: 'Timeline (takes part in, takes place at, comes after…)', plot: 'Plot threads', manuscript: 'Manuscript (told in, linked in the text, part of…)', system: 'Abilities' };
export const EDGE_GROUP_SWATCH: Record<EdgeGroup, SwatchShape> = { typed: 'line', relationship: 'double', field: 'longdash', timeline: 'dashed', plot: 'dashdot', manuscript: 'dotted', system: 'thin' };
export function groupOf(edge: Pick<GraphEdge, 'kind'>): EdgeGroup {
  switch (edge.kind) {
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
export interface Pair {
  key: string;
  a: string;
  b: string;
  edges: GraphEdge[];
}
export function pairsOf(edges: GraphEdge[]): Pair[] {
  const pairs = new Map<string, Pair>();
  for (const e of edges) {
    const [a, b] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
    const key = `${a}~${b}`;
    if (!pairs.has(key)) pairs.set(key, { key, a, b, edges: [] });
    pairs.get(key)!.edges.push(e);
  }
  return [...pairs.values()];
}

interface KnowledgeMapProps {
  /** Canon and continuity markers, when they are on: a record's, and a line's (all its connections'). */
  nodeMark?: (node: GraphNode) => OverlayMark | null | undefined;
  pairMark?: (pair: Pair) => OverlayMark | null | undefined;
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedKey: string | null;
  /** The pair of records whose connections are open. */
  pairKey: string | null;
  /** Edges on a path being shown: lit, and everything else dimmed. */
  path: Set<string> | null;
  onSelect: (node: GraphNode) => void;
  onPair: (pair: Pair) => void;
  onFocus: (node: GraphNode) => void;
  /** Shift-click, or P: show the path from the selected record to this one. */
  onPath?: (node: GraphNode) => void;
  /** A pair's line read aloud. */
  pairWords: (pair: Pair) => string;
  /** A kind of record's name, and its letter code where kinds share a shape. */
  typeName?: (type: string) => string;
  typeCode?: (type: string) => string | undefined;
}

const hash = (text: string) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}-${h >>> 0}`;
};
const LABEL_LIMIT = 80;
/** How far Shift and an arrow move a record, in the drawing's units. */
const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
const STRENGTH: EdgeGroup[] = ['typed', 'relationship', 'field', 'timeline', 'plot', 'manuscript', 'system'];

function NodeShape({ shape, r }: { shape: Shape; r: number }) {
  if (shape === 'diamond') return <path d={`M0 ${-r - 2} L${r + 2} 0 L0 ${r + 2} L${-r - 2} 0 Z`} className="body" />;
  if (shape === 'square') return <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={4} className="body" />;
  if (shape === 'triangle') return <path d={`M0 ${-r - 3} L${r + 2} ${r} L${-r - 2} ${r} Z`} className="body" />;
  return <circle r={r} className="body" />;
}

/**
 * The knowledge graph drawn: each record a shape (by its kind) in its
 * type's colour, each pair of connected records one line (styled by the
 * strongest kind of connection between them, an arrow when it reads one
 * way). Zoom and pan with the kit's viewport; drag a record to move it;
 * select one to light up its connections. Records are reached with the
 * arrow keys (one stop in the tab order); Enter selects, F focuses on it.
 */
export function KnowledgeMap({ nodes, edges, selectedKey, pairKey, path, onSelect, onPair, onFocus, onPath, pairWords, nodeMark, pairMark, typeName, typeCode }: KnowledgeMapProps) {
  const pairs = useMemo(() => pairsOf(edges), [edges]);
  const layoutKey = hash(`${nodes.map((n) => n.key).join(',')}|${pairs.map((p) => p.key).join(',')}`);
  const layout = useMemo(() => layoutNetwork(nodes.map((n) => ({ id: n.key, degree: n.degree })), pairs.map((p) => ({ from: p.a, to: p.b }))), [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [moved, setMoved] = useState<Map<string, Placed>>(new Map());
  const [current, setCurrent] = useState(0);
  const refs = useRef(new Map<string, SVGGElement>());
  const drag = useRef<{ key: string; x: number; y: number; start: Placed; moved: number } | null>(null);
  const at = (key: string): Placed => moved.get(key) ?? layout.get(key) ?? { x: 0, y: 0 };
  const shownDegree = useMemo(() => {
    const d = new Map<string, number>();
    for (const p of pairs) for (const k of [p.a, p.b]) d.set(k, (d.get(k) ?? 0) + 1);
    return d;
  }, [pairs]);
  const radius = (key: string) => radiusOf(shownDegree.get(key) ?? 0) - 2;

  const lit = useMemo(() => {
    if (path) {
      const keys = new Set<string>();
      for (const e of edges) if (path.has(e.id)) keys.add(e.from).add(e.to);
      return { nodes: keys, pairs: new Set(pairs.filter((p) => p.edges.some((e) => path.has(e.id))).map((p) => p.key)) };
    }
    if (!selectedKey && !pairKey) return null;
    const keys = new Set<string>();
    const lines = new Set<string>();
    for (const p of pairs) {
      if (p.key === pairKey || p.a === selectedKey || p.b === selectedKey) {
        lines.add(p.key);
        keys.add(p.a).add(p.b);
      }
    }
    if (selectedKey) keys.add(selectedKey);
    return { nodes: keys, pairs: lines };
  }, [selectedKey, pairKey, path, pairs, edges]);

  const points = nodes.map((n) => at(n.key));
  const bounds = points.length ? { minX: Math.min(...points.map((p) => p.x)) - 60, minY: Math.min(...points.map((p) => p.y)) - 60, maxX: Math.max(...points.map((p) => p.x)) + 60, maxY: Math.max(...points.map((p) => p.y)) + 70 } : null;
  const crowded = pairs.length > LABEL_LIMIT;

  const focusNode = (index: number) => {
    const node = nodes[(index + nodes.length) % nodes.length];
    if (!node) return;
    setCurrent(nodes.indexOf(node));
    refs.current.get(node.key)?.focus();
  };
  const onNodeKey = (e: KeyboardEvent, index: number, node: GraphNode) => {
    // Shift and an arrow move the record, as dragging does.
    if (e.shiftKey && NUDGE[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      const p = at(node.key);
      setMoved((m) => new Map(m).set(node.key, { x: p.x + NUDGE[e.key][0], y: p.y + NUDGE[e.key][1] }));
      return;
    }
    const moves: Record<string, () => void> = { ArrowRight: () => focusNode(index + 1), ArrowDown: () => focusNode(index + 1), ArrowLeft: () => focusNode(index - 1), ArrowUp: () => focusNode(index - 1), Home: () => focusNode(0), End: () => focusNode(nodes.length - 1), Enter: () => onSelect(node), ' ': () => onSelect(node), f: () => onFocus(node), F: () => onFocus(node), ...(onPath && !isGroupNode(node) ? { p: () => onPath(node), P: () => onPath(node) } : {}) };
    if (!moves[e.key]) return;
    e.preventDefault();
    e.stopPropagation();
    moves[e.key]();
  };
  const down = (e: PointerEvent<SVGGElement>, key: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { key, x: e.clientX, y: e.clientY, start: at(key), moved: 0 };
  };
  const move = (e: PointerEvent<SVGGElement>, k: number) => {
    const d = drag.current;
    if (!d) return;
    const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
    d.moved = Math.max(d.moved, Math.hypot(dx, dy));
    if (d.moved < 4) return;
    setMoved((m) => new Map(m).set(d.key, { x: d.start.x + dx / k, y: d.start.y + dy / k }));
  };
  const up = (node: GraphNode, index: number, shift: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved < 4) {
      setCurrent(index);
      if (shift && onPath && !isGroupNode(node)) onPath(node);
      else onSelect(node);
    }
  };

  return (
    <div className="stack kg-map">
      {moved.size > 0 && (
        <button type="button" className="btn ghost" onClick={() => setMoved(new Map())}>
          Put everything back where the layout placed it
        </button>
      )}
      <Viewport key={layoutKey} label={`Knowledge graph of ${nodes.length} ${nodes.length === 1 ? 'record' : 'records'} and ${edges.length} ${edges.length === 1 ? 'connection' : 'connections'}. Arrow keys move between records, Enter selects, F focuses on one, P (or Shift-click) shows the path to it from the selected record, Shift and an arrow move it.`} bounds={bounds} of="the graph">
        {(view) => (
          <>
            <defs>
              <ArrowMarker id="kg-arrow" className="kg-arrow" />
            </defs>
            {pairs.map((pair) => {
              const [a, b] = [at(pair.a), at(pair.b)];
              const [dx, dy] = [b.x - a.x, b.y - a.y];
              const length = Math.hypot(dx, dy) || 1;
              const [ra, rb] = [radius(pair.a) + 4, radius(pair.b) + 6];
              const [x1, y1, x2, y2] = [a.x + (dx / length) * ra, a.y + (dy / length) * ra, b.x - (dx / length) * rb, b.y - (dy / length) * rb];
              const group = STRENGTH.find((g) => pair.edges.some((e) => groupOf(e) === g))!;
              // One way when every connection here reads one way, the same way: from a to b, or from b to a.
              const forward = pair.edges.every((e) => e.directed && e.from === pair.a);
              const backward = pair.edges.every((e) => e.directed && e.from === pair.b);
              const isLit = lit?.pairs.has(pair.key) ?? false;
              // A stored connection's status shows on its line: dashed while provisional, marked when disputed, faded when invalid.
              const status = group === 'typed' ? statusOf(pair.edges.find((e) => e.kind === 'link')!.connection) : null;
              const dim = lit && !isLit;
              const showLabel = !crowded || view.k >= 1.4 || isLit;
              const label = pair.edges.length > 1 ? `${pair.edges[0].label} +${pair.edges.length - 1}` : pair.edges[0].label;
              const mark = pairMark?.(pair);
              return (
                <g key={pair.key} className={`kg-line kg-${group}${status && status !== 'confirmed' ? ` st-${status}` : ''}${pair.key === pairKey ? ' selected' : ''}${path && isLit ? ' on-path' : ''}${dim ? ' dim' : ''}`} data-mark role="button" tabIndex={-1} aria-pressed={pair.key === pairKey} aria-label={`${pairWords(pair)}${markWords(mark) ? `. ${markWords(mark)}` : ''}`} onClick={() => onPair(pair)}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="hit" />
                  <line x1={forward || !backward ? x1 : x2} y1={forward || !backward ? y1 : y2} x2={forward || !backward ? x2 : x1} y2={forward || !backward ? y2 : y1} className="stroke" markerEnd={forward || backward ? 'url(#kg-arrow)' : undefined} />
                  {group === 'relationship' && <line x1={x1} y1={y1} x2={x2} y2={y2} className="inner" />}
                  {showLabel && (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle" className="kg-line-label" style={{ fontSize: 10.5 / Math.max(view.k, 0.6) }}>
                      {label.length > 24 ? `${label.slice(0, 23)}…` : label}
                    </text>
                  )}
                  <MarkBadge mark={mark} x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 10} />
                </g>
              );
            })}
            {nodes.map((node, i) => {
              const p = at(node.key);
              const r = radius(node.key);
              const isSelected = node.key === selectedKey;
              const dim = lit && !lit.nodes.has(node.key);
              const mark = nodeMark?.(node);
              const marked = `${typeName ? ` (${typeName(node.type)})` : ''}${markWords(mark) ? `. ${markWords(mark)}` : ''}`;
              const code = typeCode?.(node.type);
              return (
                <g
                  key={node.key}
                  ref={(el) => void (el ? refs.current.set(node.key, el) : refs.current.delete(node.key))}
                  className={`kg-node${isGroupNode(node) ? ' group' : ''}${isSelected ? ' selected' : ''}${dim ? ' dim' : ''}`}
                  style={{ ['--kg-color' as string]: node.color }}
                  data-mark
                  role="button"
                  tabIndex={i === Math.min(current, nodes.length - 1) ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={isGroupNode(node) ? `${node.label}, folded together, ${shownDegree.get(node.key) ?? 0} ${(shownDegree.get(node.key) ?? 0) === 1 ? 'connection' : 'connections'} shown. Enter opens the group.${marked}` : `${node.label}, ${shownDegree.get(node.key) ?? 0} ${(shownDegree.get(node.key) ?? 0) === 1 ? 'connection' : 'connections'} shown${marked}`}
                  transform={`translate(${p.x} ${p.y})`}
                  onPointerDown={(e) => down(e, node.key)}
                  onPointerMove={(e) => move(e, view.k)}
                  onPointerUp={(e) => up(node, i, e.shiftKey)}
                  onPointerCancel={() => (drag.current = null)}
                  onKeyDown={(e) => onNodeKey(e, i, node)}
                  onFocus={() => setCurrent(i)}
                >
                  {isGroupNode(node) && <circle r={r + 6} className="ring" />}
                  <NodeShape shape={shapeOf(node.type)} r={r} />
                  {code && (
                    <text className="kg-code" textAnchor="middle" dy="0.35em" aria-hidden="true" style={{ fontSize: Math.max(7, Math.min(11, r)) }}>
                      {code}
                    </text>
                  )}
                  <text className="name" textAnchor="middle" y={r + 14} style={{ fontSize: 11.5 / Math.max(view.k, 0.6) }}>
                    {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                  </text>
                  <MarkBadge mark={mark} x={r * 0.9} y={-r * 0.9} />
                  <title>{node.label}</title>
                </g>
              );
            })}
          </>
        )}
      </Viewport>
    </div>
  );
}
