import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { MarkBadge } from '@/modules/canon/components/MarkBadge';
import { markWords, type OverlayMark } from '@/modules/canon/overlay';
import type { EntityRef } from '@/modules/model/types';
import { Viewport } from '@/modules/viz/components/Viewport';
import { ArrowMarker } from '@/modules/viz/components/Arrow';
import { layoutNetwork, radiusOf, type Network, type NetworkEdge, type Placed } from '../network';
import { AFFINITY_LABELS } from '../types';

interface RelationMapProps {
  network: Network;
  /** Draw the labels on the lines (when the map is not too crowded for them). */
  labels: boolean;
  selected: EntityRef | null;
  onSelect: (ref: EntityRef) => void;
  onFocus: (characterId: string) => void;
  /** Canon and continuity markers, when they are on: a record's marks by its key (`entry:<id>`, `relation:<id>`, `link:<id>`). */
  marks?: (key: string) => OverlayMark | undefined;
}

/** A short, stable fingerprint of a long string. */
const hash = (text: string) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}-${h >>> 0}`;
};

/** More lines than this and labels are drawn only for what is selected, or once zoomed in. */
const LABEL_LIMIT = 60;
/** How far Shift and an arrow move a character, in the drawing's units. */
const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };

/** How a line reads aloud: who, what to whom, and which way. */
export function edgeWords(edge: NetworkEdge, name: (id: string) => string): string {
  const [a, b] = [name(edge.from), name(edge.to)];
  const how = edge.kind === 'connection' ? `${a} ${edge.label.toLowerCase()} ${b}` : edge.directed ? `${a} (${edge.fromRole || 'first'}) to ${b} (${edge.toRole || 'second'}): ${edge.label}` : `${a} and ${b}: ${edge.label}, both ways`;
  return `${how}${edge.affinity ? `, ${AFFINITY_LABELS[edge.affinity].toLowerCase()}` : ''}${edge.range ? `, ${edge.range}` : ''}`;
}

/**
 * The relationship network drawn: characters as circles, sized by how many
 * ties they have; relationships as lines, styled by their group (and named
 * in the legend), with an arrow for a one-way tie. Zoom and pan with the
 * kit's viewport; drag a character to move them; select one to light up
 * their ties and dim the rest. Characters are reached with the arrow keys
 * (one stop in the tab order); Enter selects, F focuses the map on them.
 */
export function RelationMap({ network, labels, selected, onSelect, onFocus, marks }: RelationMapProps) {
  // Which characters and ties are drawn, as one short string: the layout is worked out again only when it changes.
  const layoutKey = hash(`${network.nodes.map((n) => n.id).join(',')}|${network.edges.map((e) => `${e.from}>${e.to}`).join(',')}`);
  const layout = useMemo(() => layoutNetwork(network.nodes, network.edges), [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [moved, setMoved] = useState<Map<string, Placed>>(new Map());
  const [current, setCurrent] = useState(0);
  const refs = useRef(new Map<string, SVGGElement>());
  const drag = useRef<{ id: string; x: number; y: number; start: Placed; moved: number } | null>(null);
  const at = (id: string): Placed => moved.get(id) ?? layout.get(id) ?? { x: 0, y: 0 };
  const name = (id: string) => network.nodes.find((n) => n.id === id)?.name ?? 'Someone';
  const radius = new Map(network.nodes.map((n) => [n.id, radiusOf(n.degree)]));

  // What is selected, and what it touches: lit; everything else dimmed while something is selected.
  const lit = useMemo(() => {
    if (!selected) return null;
    const ids = new Set<string>();
    if (selected.type === 'entry') {
      ids.add(selected.id);
      for (const e of network.edges) if (e.from === selected.id || e.to === selected.id) ids.add(e.id).add(e.from).add(e.to);
    } else if (selected.type === 'relation') {
      const e = network.edges.find((x) => x.id === selected.id);
      if (e) ids.add(e.id).add(e.from).add(e.to);
    }
    return ids.size ? ids : null;
  }, [selected?.type, selected?.id, network]); // eslint-disable-line react-hooks/exhaustive-deps

  const points = network.nodes.map((n) => at(n.id));
  const bounds = points.length ? { minX: Math.min(...points.map((p) => p.x)) - 60, minY: Math.min(...points.map((p) => p.y)) - 60, maxX: Math.max(...points.map((p) => p.x)) + 60, maxY: Math.max(...points.map((p) => p.y)) + 70 } : null;
  const crowded = network.edges.length > LABEL_LIMIT;

  const focusNode = (index: number) => {
    const node = network.nodes[(index + network.nodes.length) % network.nodes.length];
    if (!node) return;
    setCurrent(network.nodes.indexOf(node));
    refs.current.get(node.id)?.focus();
  };
  const onNodeKey = (e: KeyboardEvent, index: number, id: string) => {
    // Shift and an arrow move the character, as dragging does.
    if (e.shiftKey && NUDGE[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      const p = at(id);
      setMoved((m) => new Map(m).set(id, { x: p.x + NUDGE[e.key][0], y: p.y + NUDGE[e.key][1] }));
      return;
    }
    const moves: Record<string, () => void> = { ArrowRight: () => focusNode(index + 1), ArrowDown: () => focusNode(index + 1), ArrowLeft: () => focusNode(index - 1), ArrowUp: () => focusNode(index - 1), Home: () => focusNode(0), End: () => focusNode(network.nodes.length - 1), Enter: () => onSelect({ type: 'entry', id }), ' ': () => onSelect({ type: 'entry', id }), f: () => onFocus(id), F: () => onFocus(id) };
    if (!moves[e.key]) return;
    e.preventDefault();
    e.stopPropagation();
    moves[e.key]();
  };
  const down = (e: PointerEvent<SVGGElement>, id: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, x: e.clientX, y: e.clientY, start: at(id), moved: 0 };
  };
  const move = (e: PointerEvent<SVGGElement>, k: number) => {
    const d = drag.current;
    if (!d) return;
    const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
    d.moved = Math.max(d.moved, Math.hypot(dx, dy));
    if (d.moved < 4) return;
    setMoved((m) => new Map(m).set(d.id, { x: d.start.x + dx / k, y: d.start.y + dy / k }));
  };
  const up = (id: string, index: number) => {
    const d = drag.current;
    drag.current = null;
    // A press that did not move is a click: select.
    if (d && d.moved < 4) {
      setCurrent(index);
      onSelect({ type: 'entry', id });
    }
  };

  return (
    <div className="stack rel-network">
      {moved.size > 0 && (
        <button type="button" className="btn ghost" onClick={() => setMoved(new Map())}>
          Put everyone back where the layout placed them
        </button>
      )}
      {/* A different set of characters or ties is a new drawing: fitted to the space again. */}
      <Viewport key={layoutKey} label={`Relationship map of ${network.nodes.length} ${network.nodes.length === 1 ? 'character' : 'characters'} and ${network.edges.length} ${network.edges.length === 1 ? 'tie' : 'ties'}. Arrow keys move between characters, Enter selects, F focuses on one, Shift and an arrow move one.`} bounds={bounds} of="the map">
        {(view) => (
          <>
            <defs>
              <ArrowMarker id="rel-arrow" className="rel-arrow" />
            </defs>
            {network.edges.map((edge) => {
              const [a, b] = [at(edge.from), at(edge.to)];
              const [dx, dy] = [b.x - a.x, b.y - a.y];
              const length = Math.hypot(dx, dy) || 1;
              const [ra, rb] = [(radius.get(edge.from) ?? 16) + 4, (radius.get(edge.to) ?? 16) + 6];
              const [x1, y1, x2, y2] = [a.x + (dx / length) * ra, a.y + (dy / length) * ra, b.x - (dx / length) * rb, b.y - (dy / length) * rb];
              const isSelected = selected?.type === 'relation' && selected.id === edge.id;
              const dim = lit && !lit.has(edge.id);
              const showLabel = labels && (!crowded || view.k >= 1.4 || (lit?.has(edge.id) ?? false));
              const selectable = edge.kind === 'relationship';
              const mark = marks?.(edge.kind === 'relationship' ? `relation:${edge.id}` : edge.id);
              return (
                <g
                  key={edge.id}
                  className={`rel-line rel-cat-${edge.category}${isSelected ? ' selected' : ''}${dim ? ' dim' : ''}`}
                  data-mark
                  role={selectable ? 'button' : 'img'}
                  tabIndex={-1}
                  aria-pressed={selectable ? isSelected : undefined}
                  aria-label={`${edgeWords(edge, name)}${markWords(mark) ? `. ${markWords(mark)}` : ''}`}
                  onClick={selectable ? () => onSelect({ type: 'relation', id: edge.id }) : undefined}
                >
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="hit" />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke" markerEnd={edge.directed ? 'url(#rel-arrow)' : undefined} />
                  {edge.category === 'custom' && <line x1={x1} y1={y1} x2={x2} y2={y2} className="inner" />}
                  {showLabel && (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle" className="rel-line-label" style={{ fontSize: 11 / Math.max(view.k, 0.6) }}>
                      {edge.label.length > 26 ? `${edge.label.slice(0, 25)}…` : edge.label}
                    </text>
                  )}
                  <MarkBadge mark={mark} x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 10} />
                </g>
              );
            })}
            {network.nodes.map((node, i) => {
              const p = at(node.id);
              const r = radius.get(node.id) ?? 16;
              const isSelected = selected?.type === 'entry' && selected.id === node.id;
              const dim = lit && !lit.has(node.id);
              const mark = marks?.(`entry:${node.id}`);
              return (
                <g
                  key={node.id}
                  ref={(el) => void (el ? refs.current.set(node.id, el) : refs.current.delete(node.id))}
                  className={`rel-dot${node.focus ? ' focus' : ''}${isSelected ? ' selected' : ''}${dim ? ' dim' : ''}`}
                  data-mark
                  role="button"
                  tabIndex={i === Math.min(current, network.nodes.length - 1) ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={`${node.name}, ${node.degree} ${node.degree === 1 ? 'tie' : 'ties'} shown${node.focus ? ', the character the map is focused on' : ''}${markWords(mark) ? `. ${markWords(mark)}` : ''}`}
                  transform={`translate(${p.x} ${p.y})`}
                  onPointerDown={(e) => down(e, node.id)}
                  onPointerMove={(e) => move(e, view.k)}
                  onPointerUp={() => up(node.id, i)}
                  onPointerCancel={() => (drag.current = null)}
                  onKeyDown={(e) => onNodeKey(e, i, node.id)}
                  onFocus={() => setCurrent(i)}
                >
                  {node.focus && <circle r={r + 6} className="ring" />}
                  <circle r={r} className="body" />
                  <text className="initial" textAnchor="middle" dy="0.35em">
                    {node.name.trim().charAt(0).toUpperCase() || '?'}
                  </text>
                  <text className="name" textAnchor="middle" y={r + 14} style={{ fontSize: 12 / Math.max(view.k, 0.6) }}>
                    {node.name.length > 22 ? `${node.name.slice(0, 21)}…` : node.name}
                  </text>
                  <MarkBadge mark={mark} x={r * 0.8} y={-r * 0.8} />
                  <title>{node.name}</title>
                </g>
              );
            })}
          </>
        )}
      </Viewport>
    </div>
  );
}
