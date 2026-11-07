import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Affinity } from '@/modules/relationships/types';
import { neighbours, type Graph, type GraphEdge, type GraphNode } from './build';

export interface GraphView {
  /** Where each node was last placed, so the picture is the same when the author comes back. */
  positions: Map<string, { x: number; y: number }>;
  /** Nodes the author dragged into place; the layout leaves them where they were put. */
  pinned: Set<string>;
  transform: { x: number; y: number; k: number } | null;
}

export interface GraphHandle {
  fit: () => void;
  zoom: (factor: number) => void;
  relayout: () => void;
  centerOn: (id: string) => void;
}

interface GraphCanvasProps {
  graph: Graph;
  view: GraphView;
  focusId: string | null;
  selectedEdgeId: string | null;
  onNode: (node: GraphNode | null) => void;
  onEdge: (edge: GraphEdge) => void;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
  node: GraphNode;
}
type SimLink = SimulationLinkDatum<SimNode> & { edge: GraphEdge };

const AFFINITY: Record<Affinity, string> = { hostile: '#c2502f', reluctant: '#d98a5f', neutral: '#8b8478', friendly: '#5b9bb5', trusting: '#2f79a8' };
/** Narrative density: the more something is connected to, the larger it is drawn. */
export const radiusOf = (node: GraphNode): number => (node.ref.kind === 'cluster' ? 13 : Math.min(26, 6 + 2.6 * Math.sqrt(node.degree)));
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 4;
/** Above this many points, the layout settles in fewer, cheaper steps. */
const LARGE_GRAPH = 1000;

/**
 * The graph, drawn on a canvas. A canvas (rather than one DOM element per
 * node) is what keeps panning and zooming smooth with hundreds of nodes:
 * each frame is a single pass that skips everything outside the visible
 * area and only writes the labels that matter at the current zoom.
 *
 * The force layout runs a couple of steps per frame until it settles, so it
 * never blocks typing or clicking. Positions are remembered between visits.
 */
export const GraphCanvas = forwardRef<GraphHandle, GraphCanvasProps>(function GraphCanvas({ graph, view, focusId, selectedEdgeId, onNode, onEdge }, handle) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    nodes: [] as SimNode[],
    links: [] as SimLink[],
    byId: new Map<string, SimNode>(),
    simulation: null as Simulation<SimNode, SimLink> | null,
    transform: view.transform ?? { x: 0, y: 0, k: 1 },
    size: { width: 800, height: 600 },
    hover: null as string | null,
    first: new Set<string>(),
    second: new Set<string>(),
    labelled: new Set<string>(),
    frame: 0,
    dirty: true,
    fitted: view.transform !== null,
    colors: { text: '#222', muted: '#888', surface: '#fff', border: '#ccc' },
  });
  const props = useRef({ focusId, selectedEdgeId, onNode, onEdge, view, graph });
  props.current = { focusId, selectedEdgeId, onNode, onEdge, view, graph };

  const invalidate = () => {
    const s = state.current;
    s.dirty = true;
    if (!s.frame) s.frame = requestAnimationFrame(loop);
  };

  /** Publishes where things are on screen once movement stops (used to keep the view, and by tests). */
  const publish = () => {
    const s = state.current;
    const el = wrapper.current;
    if (!el) return;
    for (const n of s.nodes) props.current.view.positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    props.current.view.transform = { ...s.transform };
    // "Settled" means the layout has stopped moving, not merely that the pointer was released.
    el.dataset.settled = String(!s.simulation || s.simulation.alpha() <= s.simulation.alphaMin());
    el.dataset.zoom = s.transform.k.toFixed(3);
    el.dataset.layout = JSON.stringify(Object.fromEntries(s.nodes.slice(0, 500).map((n) => [n.id, [Math.round((n.x ?? 0) * s.transform.k + s.transform.x), Math.round((n.y ?? 0) * s.transform.k + s.transform.y)]])));
  };

  const fit = () => {
    const s = state.current;
    if (!s.nodes.length) return;
    const xs = s.nodes.map((n) => n.x ?? 0);
    const ys = s.nodes.map((n) => n.y ?? 0);
    const [minX, maxX, minY, maxY] = [Math.min(...xs) - 40, Math.max(...xs) + 40, Math.min(...ys) - 40, Math.max(...ys) + 50];
    const k = Math.max(MIN_ZOOM, Math.min(1.6, s.size.width / (maxX - minX), s.size.height / (maxY - minY)));
    s.transform = { k, x: s.size.width / 2 - ((minX + maxX) / 2) * k, y: s.size.height / 2 - ((minY + maxY) / 2) * k };
    s.fitted = true;
    // Remember the fitted view at once, even when nothing is moving any more.
    publish();
    invalidate();
  };

  function loop() {
    const s = state.current;
    s.frame = 0;
    const simulation = s.simulation;
    if (simulation && simulation.alpha() > simulation.alphaMin()) {
      // With reduced motion asked for, the layout settles out of sight and is drawn at rest; otherwise it is seen settling.
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) for (let i = 0; i < 600 && simulation.alpha() > simulation.alphaMin(); i++) simulation.tick();
      else simulation.tick(2);
      s.dirty = true;
      if (simulation.alpha() <= simulation.alphaMin()) {
        if (!s.fitted) fit();
        publish();
      }
    }
    if (s.dirty) {
      s.dirty = false;
      draw();
    }
    if (simulation && simulation.alpha() > simulation.alphaMin()) s.frame = requestAnimationFrame(loop);
  }

  function draw() {
    const s = state.current;
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const { focusId: focus, selectedEdgeId: selected } = props.current;
    const dpr = window.devicePixelRatio || 1;
    const { x: tx, y: ty, k } = s.transform;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s.size.width, s.size.height);
    ctx.translate(tx, ty);
    ctx.scale(k, k);
    // Only what is inside the visible area (plus a margin) is drawn.
    const view = { left: -tx / k - 60, right: (s.size.width - tx) / k + 60, top: -ty / k - 60, bottom: (s.size.height - ty) / k + 60 };
    const inView = (n: SimNode) => (n.x ?? 0) > view.left && (n.x ?? 0) < view.right && (n.y ?? 0) > view.top && (n.y ?? 0) < view.bottom;
    const lit = (id: string) => !focus || id === focus || s.first.has(id);
    const strength = (id: string) => (!focus || id === focus || s.first.has(id) ? 1 : s.second.has(id) ? 0.5 : 0.1);

    ctx.lineCap = 'round';
    for (const link of s.links) {
      const a = link.source as SimNode;
      const b = link.target as SimNode;
      if (!inView(a) && !inView(b)) continue;
      const { edge } = link;
      const touchesFocus = focus !== null && (a.id === focus || b.id === focus);
      const isSelected = edge.id === selected;
      ctx.globalAlpha = isSelected ? 1 : !focus ? 0.55 : touchesFocus ? 1 : Math.min(strength(a.id), strength(b.id)) * 0.6;
      ctx.strokeStyle = edge.affinity ? AFFINITY[edge.affinity] : s.colors.muted;
      ctx.lineWidth = (isSelected ? 3.2 : touchesFocus ? 2.2 : edge.affinity ? 1.8 : 1.1) / Math.sqrt(k);
      ctx.setLineDash(edge.affinity === 'hostile' ? [8 / k, 5 / k] : edge.kinds.length === 0 ? [2 / k, 4 / k] : []);
      const dx = (b.x ?? 0) - (a.x ?? 0);
      const dy = (b.y ?? 0) - (a.y ?? 0);
      const length = Math.hypot(dx, dy) || 1;
      const ex = (b.x ?? 0) - (dx / length) * (b.r + 2);
      const ey = (b.y ?? 0) - (dy / length) * (b.r + 2);
      ctx.beginPath();
      ctx.moveTo(a.x ?? 0, a.y ?? 0);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      if (edge.directed && k > 0.45) {
        const size = 7 / Math.sqrt(k);
        const angle = Math.atan2(dy, dx);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - size * Math.cos(angle - 0.45), ey - size * Math.sin(angle - 0.45));
        ctx.lineTo(ex - size * Math.cos(angle + 0.45), ey - size * Math.sin(angle + 0.45));
        ctx.closePath();
        ctx.fill();
      }
      if ((isSelected || touchesFocus) && k > 0.4 && edge.labels[0]) {
        const text = edge.labels[0].length > 26 ? `${edge.labels[0].slice(0, 25)}…` : edge.labels[0];
        ctx.font = `${12 / k}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4 / k;
        ctx.strokeStyle = s.colors.surface;
        ctx.strokeText(text, ((a.x ?? 0) + (b.x ?? 0)) / 2, ((a.y ?? 0) + (b.y ?? 0)) / 2 - 4 / k);
        ctx.fillStyle = s.colors.text;
        ctx.fillText(text, ((a.x ?? 0) + (b.x ?? 0)) / 2, ((a.y ?? 0) + (b.y ?? 0)) / 2 - 4 / k);
      }
    }

    for (const n of s.nodes) {
      if (!inView(n)) continue;
      const { node } = n;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      ctx.globalAlpha = strength(n.id);
      ctx.fillStyle = node.color;
      ctx.strokeStyle = n.id === focus || n.id === s.hover ? s.colors.text : s.colors.surface;
      ctx.lineWidth = (n.id === focus ? 3 : 2) / Math.sqrt(k);
      // Shape carries the kind of thing too, so it does not rest on colour alone.
      ctx.beginPath();
      if (node.group === 'event') {
        ctx.moveTo(x, y - n.r * 1.2);
        ctx.lineTo(x + n.r * 1.2, y);
        ctx.lineTo(x, y + n.r * 1.2);
        ctx.lineTo(x - n.r * 1.2, y);
        ctx.closePath();
      } else if (node.group === 'chapter' && node.ref.kind !== 'cluster') {
        ctx.roundRect(x - n.r, y - n.r, n.r * 2, n.r * 2, n.r * 0.3);
      } else ctx.arc(x, y, n.r, 0, Math.PI * 2);
      if (node.degree === 0) {
        // Nothing links to this yet: drawn hollow so it stands out as isolated.
        ctx.globalAlpha = Math.max(ctx.globalAlpha, focus ? ctx.globalAlpha : 0.9);
        ctx.setLineDash([3 / k, 3 / k]);
        ctx.strokeStyle = node.color;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fill();
        ctx.stroke();
      }
      if (node.ref.kind === 'cluster') {
        ctx.fillStyle = '#fff';
        ctx.font = `600 ${11}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(node.ref.memberIds.length), x, y + 4);
      }
      if (n.id === focus || n.id === s.hover || (lit(n.id) && focus) || k * n.r > 11 || (s.labelled.has(n.id) && k > 0.3)) {
        const text = node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label;
        ctx.font = `${n.id === focus ? '600 ' : ''}${12.5 / k}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4 / k;
        ctx.strokeStyle = s.colors.surface;
        ctx.strokeText(text, x, y + n.r + 14 / k);
        ctx.fillStyle = s.colors.text;
        ctx.fillText(text, x, y + n.r + 14 / k);
      }
    }
    ctx.globalAlpha = 1;
  }

  // (Re)build the simulation when the set of nodes or links changes. Nodes that were already placed stay where they are.
  useEffect(() => {
    const s = state.current;
    const before = new Map(s.nodes.map((n) => [n.id, n]));
    const placed = (id: string) => before.get(id) ?? view.positions.get(id);
    let fresh = 0;
    s.nodes = graph.nodes.map((node) => {
      const known = placed(node.id);
      const sim: SimNode = { id: node.id, node, r: radiusOf(node), x: known?.x, y: known?.y };
      if (!known) {
        fresh++;
        // Start next to something it is linked to, if that is already on the canvas.
        const edge = graph.edges.find((e) => (e.source === node.id && placed(e.target)) || (e.target === node.id && placed(e.source)));
        const near = edge ? placed(edge.source === node.id ? edge.target : edge.source) : undefined;
        const angle = Math.random() * Math.PI * 2;
        const spread = near ? 40 : 60 + Math.sqrt(graph.nodes.length) * 18 * Math.random();
        sim.x = (near?.x ?? 0) + Math.cos(angle) * spread;
        sim.y = (near?.y ?? 0) + Math.sin(angle) * spread;
      }
      if (view.pinned.has(node.id) && known) Object.assign(sim, { fx: known.x, fy: known.y });
      return sim;
    });
    s.byId = new Map(s.nodes.map((n) => [n.id, n]));
    s.links = graph.edges.map((edge) => ({ source: edge.source, target: edge.target, edge }));
    // The best-connected nodes are always named; the rest get names as the author zooms in.
    s.labelled = new Set([...s.nodes].sort((a, b) => b.node.degree - a.node.degree).slice(0, 30).map((n) => n.id));

    s.simulation?.stop();
    // A very large graph settles in fewer, cheaper steps (about 120, not 300), so it is still within seconds, not tens of them.
    const large = s.nodes.length > LARGE_GRAPH;
    s.simulation = forceSimulation<SimNode, SimLink>(s.nodes)
      .alphaDecay(large ? 1 - Math.pow(0.001, 1 / 120) : 1 - Math.pow(0.001, 1 / 300))
      .force('link', forceLink<SimNode, SimLink>(s.links).id((d) => d.id).distance((l) => 55 + (l.source as SimNode).r + (l.target as SimNode).r).strength(0.35))
      .force('charge', forceManyBody<SimNode>().strength((d) => -140 - d.r * 9).distanceMax(700).theta(large ? 1.2 : 0.9))
      .force('x', forceX<SimNode>(0).strength(0.045))
      .force('y', forceY<SimNode>(0).strength(0.045))
      .force('collide', forceCollide<SimNode>((d) => d.r + 8))
      .stop();
    const share = graph.nodes.length ? fresh / graph.nodes.length : 0;
    s.simulation.alpha(share > 0.5 ? 1 : fresh ? 0.35 : 0.05);
    // A brand-new layout gets a head start, off screen, so it does not unfold from a tangle.
    if (share > 0.5) s.simulation.tick(Math.min(120, Math.round(30_000 / Math.max(graph.nodes.length, 1))));
    if (wrapper.current) {
      wrapper.current.dataset.settled = 'false';
      wrapper.current.dataset.nodes = String(graph.nodes.length);
      wrapper.current.dataset.edges = String(graph.edges.length);
    }
    if (!s.fitted && s.nodes.length) fit();
    invalidate();
    return () => {
      s.simulation?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Focus: work out what is one and two steps away, then redraw.
  useEffect(() => {
    const s = state.current;
    const near = focusId ? neighbours(graph, focusId) : { first: new Set<string>(), second: new Set<string>() };
    s.first = near.first;
    s.second = near.second;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, selectedEdgeId, graph]);

  // Size, theme colours, and wheel zoom.
  useEffect(() => {
    const el = wrapper.current!;
    const cv = canvas.current!;
    const s = state.current;
    const readColors = () => {
      const css = getComputedStyle(el);
      s.colors = { text: css.getPropertyValue('--text').trim() || '#222', muted: css.getPropertyValue('--muted').trim() || '#888', surface: css.getPropertyValue('--surface').trim() || '#fff', border: css.getPropertyValue('--border').trim() || '#ccc' };
      invalidate();
    };
    const resize = () => {
      const box = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      s.size = { width: box.width, height: box.height };
      cv.width = Math.round(box.width * dpr);
      cv.height = Math.round(box.height * dpr);
      if (!s.fitted) fit();
      invalidate();
    };
    let idle: number | undefined;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = cv.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - box.left, e.clientY - box.top);
      clearTimeout(idle);
      idle = window.setTimeout(publish, 160);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', readColors);
    cv.addEventListener('wheel', wheel, { passive: false });
    readColors();
    resize();
    return () => {
      observer.disconnect();
      scheme.removeEventListener('change', readColors);
      cv.removeEventListener('wheel', wheel);
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      publish();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoomAt(factor: number, sx: number, sy: number) {
    const s = state.current;
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s.transform.k * factor));
    const ratio = k / s.transform.k;
    s.transform = { k, x: sx - (sx - s.transform.x) * ratio, y: sy - (sy - s.transform.y) * ratio };
    s.fitted = true;
    invalidate();
  }

  const toWorld = (sx: number, sy: number) => ({ x: (sx - state.current.transform.x) / state.current.transform.k, y: (sy - state.current.transform.y) / state.current.transform.k });
  const nodeAt = (sx: number, sy: number): SimNode | null => {
    const s = state.current;
    const p = toWorld(sx, sy);
    for (let i = s.nodes.length - 1; i >= 0; i--) {
      const n = s.nodes[i];
      if (Math.hypot((n.x ?? 0) - p.x, (n.y ?? 0) - p.y) <= n.r + 4 / s.transform.k) return n;
    }
    return null;
  };
  const edgeAt = (sx: number, sy: number): GraphEdge | null => {
    const s = state.current;
    const p = toWorld(sx, sy);
    let best: { edge: GraphEdge; distance: number } | null = null;
    for (const link of s.links) {
      const a = link.source as SimNode;
      const b = link.target as SimNode;
      const [ax, ay, bx, by] = [a.x ?? 0, a.y ?? 0, b.x ?? 0, b.y ?? 0];
      const along = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
      const distance = Math.hypot(p.x - (ax + along * (bx - ax)), p.y - (ay + along * (by - ay)));
      if (distance <= 7 / s.transform.k && (!best || distance < best.distance)) best = { edge: link.edge, distance };
    }
    return best?.edge ?? null;
  };

  const drag = useRef<{ node: SimNode | null; x: number; y: number; moved: boolean } | null>(null);
  const point = (e: { clientX: number; clientY: number }) => {
    const box = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  useImperativeHandle(handle, () => ({
    fit,
    zoom: (factor) => {
      zoomAt(factor, state.current.size.width / 2, state.current.size.height / 2);
      publish();
    },
    relayout: () => {
      const s = state.current;
      props.current.view.pinned.clear();
      for (const n of s.nodes) Object.assign(n, { fx: null, fy: null });
      s.simulation?.alpha(1);
      s.fitted = false;
      if (wrapper.current) wrapper.current.dataset.settled = 'false';
      invalidate();
    },
    centerOn: (id) => {
      const s = state.current;
      const n = s.byId.get(id);
      if (!n) return;
      s.transform = { ...s.transform, x: s.size.width / 2 - (n.x ?? 0) * s.transform.k, y: s.size.height / 2 - (n.y ?? 0) * s.transform.k };
      s.fitted = true;
      invalidate();
      publish();
    },
  }));

  return (
    <div ref={wrapper} className="graph-canvas" data-settled="false">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Story graph. Use the list beside it to move between nodes."
        onPointerDown={(e) => {
          const p = point(e);
          drag.current = { node: nodeAt(p.x, p.y), ...p, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const s = state.current;
          const p = point(e);
          const d = drag.current;
          if (!d) {
            const over = nodeAt(p.x, p.y);
            if ((over?.id ?? null) !== s.hover) {
              s.hover = over?.id ?? null;
              invalidate();
            }
            e.currentTarget.style.cursor = over || edgeAt(p.x, p.y) ? 'pointer' : 'grab';
            return;
          }
          if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 4) return;
          d.moved = true;
          if (d.node) {
            // Dragging a node pins it where it is dropped; the rest of the graph makes room.
            const world = toWorld(p.x, p.y);
            Object.assign(d.node, { fx: world.x, fy: world.y });
            props.current.view.pinned.add(d.node.id);
            if (s.simulation && s.simulation.alpha() < 0.3) s.simulation.alpha(0.3);
          } else {
            s.transform = { ...s.transform, x: s.transform.x + (p.x - d.x), y: s.transform.y + (p.y - d.y) };
            s.fitted = true;
            d.x = p.x;
            d.y = p.y;
          }
          invalidate();
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const p = point(e);
          if (!d.moved) {
            if (d.node) props.current.onNode(d.node.node);
            else {
              const edge = edgeAt(p.x, p.y);
              if (edge) props.current.onEdge(edge);
              else props.current.onNode(null);
            }
          }
          publish();
        }}
        onPointerLeave={() => {
          if (state.current.hover) {
            state.current.hover = null;
            invalidate();
          }
        }}
        onDoubleClick={(e) => {
          const p = point(e);
          const n = nodeAt(p.x, p.y);
          if (!n) return;
          // Double-click releases a node that was dragged into place.
          Object.assign(n, { fx: null, fy: null });
          props.current.view.pinned.delete(n.id);
          state.current.simulation?.alpha(0.3);
          invalidate();
        }}
      />
    </div>
  );
});
