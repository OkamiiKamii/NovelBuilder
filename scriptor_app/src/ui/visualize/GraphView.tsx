// Visualize › Knowledge graph (FEATURES.md #301–#305): every record and connection, drawn by shape and colour (a letter
// code where kinds share a shape, so none is told by colour alone), each pair of records one line styled by the
// strongest kind of connection between them, an arrow when it reads one way; zoom, pan and fit; tap a record to
// select it and light up its connections, long-press it to show the path to it, tap a line to see what it stands for.
// Layers hide kinds of record, connection or status; kinds fold into groups and scenes into chapters; the 200 most
// connected are drawn first; focus on one or two steps round a record. Whatever leaves part of the story out says so,
// with "Restore the full view". The list form says every connection in words. A port of
// flutter_app/lib/features/graph/graph_page.dart and widgets/graph_canvas.dart (a phone has no keyboard: the canvas's
// shortcuts are left out, the list form keeps every connection reachable); what is shown is
// src/domain/visualize/world/graphView.ts and src/domain/graph/knowledge.ts.

import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';

import { type GraphNode, type KnowledgeGraph, type Pair, edgeTypeLabel, edgeWords, knowledgeGraph, shapeOf } from '../../domain/graph/knowledge';
import type { StoryModel } from '../../domain/model/storyModel';
import { layoutGraph, radiusOf } from '../../domain/relationships/network';
import {
  GraphSettings,
  type GraphUndo,
  alone,
  clip,
  edgeColor,
  edgeDash,
  edgeWidth,
  graphPage,
  keptIn,
  listWords,
  pathSaid,
  pathSteps,
  shapePath,
  statusWords,
} from '../../domain/visualize/world/graphView';
import { edgeGroupLabel } from '../../domain/graph/knowledge';
import { Chip, IconButton, Icon, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { type OpenCast, useCast } from '../organize/useCast';
import { colors, fonts, radius, space } from '../theme';
import { VizFrame, useVizFilters, useVizSelection } from './VizFrame';

export function GraphView() {
  const [list, setList] = useState(false);
  const open = useCast();
  return (
    <VizFrame
      view="graph"
      title="Knowledge graph"
      subtitle={open?.cast.novelTitle}
      actions={
        <View style={styles.row}>
          <Chip label="Graph" icon="graph-outline" selected={!list} onPress={() => setList(false)} />
          <Chip label="List" icon="format-list-bulleted" selected={list} onPress={() => setList(true)} />
        </View>
      }
    >
      {open !== null && <GraphBody open={open} list={list} />}
    </VizFrame>
  );
}

function GraphBody({ open, list }: { open: OpenCast; list: boolean }) {
  const filters = useVizFilters();
  const { selected: selection, select } = useVizSelection();
  const [s, setS] = useState(() => new GraphSettings());
  const [pairKey, setPairKey] = useState<string | null>(null);
  const [layers, setLayers] = useState(false);
  const model = open.cast.model;
  const full = useMemo(() => knowledgeGraph(model), [model]);
  const set = (next: GraphSettings) => {
    setS(next);
    setPairKey(null);
  };
  if (full.nodes.length === 0) {
    return (
      <Panel style={styles.empty}>
        <Icon name="graph-outline" size={36} />
        <Text style={styles.heading}>Nothing recorded yet</Text>
        <Muted style={styles.center}>
          Characters, places, events, chapters, plot threads and every connection between them show up here as you add them.
        </Muted>
      </Panel>
    );
  }
  // A search or a character chosen in the frame narrows the graph, as the shared filters do in every view.
  const page = graphPage(model, full, s, { text: filters.query, involving: filters.involving }, selection);
  const toggleFold = (type: string) => {
    const next = new Set(s.collapsed);
    if (!next.delete(type)) next.add(type);
    set(s.with({ collapsed: next }));
  };
  const pick = (node: GraphNode) => {
    setPairKey(null);
    if (node.isGroup) return toggleFold(node.type);
    select(node.ref);
  };
  const onPath = (node: GraphNode) => {
    if (page.selected !== null && node.key !== page.selected.key && !node.isGroup) set(s.with({ path: node.key }));
    else pick(node);
  };
  const restore = () => {
    setS(new GraphSettings());
    setPairKey(null);
  };
  const run = (u: GraphUndo) => {
    if ('settings' in u) return set(u.settings);
    if (u.command === 'dropFocus') return set(s.with({ focus: null, depth: 1 }));
    if (u.command === 'restore') restore();
  };
  // The search and the character chosen are the frame's own (its fields above): cleared there, not from here.
  const shownUndo = (undo: GraphUndo[]) => undo.filter((u) => !('command' in u) || u.command !== 'clearSearch');
  const pair = page.pairs.find((p) => p.key === pairKey) ?? null;
  const drawnByKey = new Map(page.drawn.nodes.map((n) => [n.key, n]));
  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <Chip label="Show records with no connection shown" selected={s.isolated} onPress={() => set(s.with({ isolated: !s.isolated }))} />
        <Chip label="Fold scenes into their chapters" selected={s.fold} onPress={() => set(s.with({ fold: !s.fold }))} />
      </View>
      {page.focusKey !== null && (
        <View style={styles.row}>
          <View style={styles.flex}>
            <ChooserField
              label={`Around ${page.labelOf(page.focusKey)}`}
              value={s.depth}
              choices={[
                { value: 1, label: 'One step' },
                { value: 2, label: 'Two steps' },
              ]}
              onChoose={(v) => set(s.with({ depth: v }))}
            />
          </View>
          <OutlineButton label="Show the whole graph" compact onPress={() => set(s.with({ focus: null, depth: 1 }))} />
        </View>
      )}
      <Pressable accessibilityRole="button" onPress={() => setLayers(!layers)} style={styles.layersHead}>
        <Text style={[styles.body, styles.flex]}>Layers: what is shown, and what is folded together</Text>
        <Icon name={layers ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
      </Pressable>
      {(layers || s.hiddenNodes.size > 0 || s.hiddenEdges.size > 0 || s.hiddenStatuses.size > 0 || s.collapsed.size > 0) && layers && (
        <Layers s={s} page={page} set={set} onFold={toggleFold} />
      )}
      <Text style={styles.body} accessibilityLiveRegion="polite">
        {page.status}
      </Text>
      {page.partial.length > 0 && (
        <Panel style={styles.gapSm}>
          <Text style={styles.name}>This is part of the story, not all of it.</Text>
          {page.partial.map((p) => (
            <View key={p.key} style={styles.gapSm}>
              <Text style={styles.body}>{`• ${p.text}`}</Text>
              {shownUndo(p.undo).length > 0 && (
                <View style={styles.row}>
                  {shownUndo(p.undo).map((u) => (
                    <OutlineButton key={u.label} label={u.label} compact onPress={() => run(u)} />
                  ))}
                </View>
              )}
            </View>
          ))}
          {page.restorable && <OutlineButton label="Restore the full view" compact onPress={restore} style={styles.start} />}
        </Panel>
      )}
      {page.drawn.nodes.length === 0 ? (
        <Panel style={styles.empty}>
          <Text style={styles.heading}>Nothing shown</Text>
          <Muted>Nothing is shown with these layers and filters.</Muted>
          <OutlineButton label="Restore the full view" compact onPress={restore} />
        </Panel>
      ) : !list ? (
        <>
          <GraphCanvas
            model={model}
            drawn={page.drawn}
            pairs={page.pairs}
            selectedKey={page.selected === null ? null : page.mapped(page.selected.key)}
            pairKey={pairKey}
            path={page.path === null ? null : new Set(page.path.map((e) => e.id))}
            codes={page.codes}
            typeName={page.typeName}
            pairWords={page.pairWords}
            onSelect={pick}
            onPair={(p) => setPairKey(p.key)}
            onPath={onPath}
          />
          <Legend drawn={page.drawn} pairs={page.pairs} codes={page.codes} typeName={page.typeName} />
        </>
      ) : (
        <EdgeList drawn={page.drawn} selected={page.selected} labelOf={page.labelOf} onSelect={pick} />
      )}
      {pair !== null && (
        <Panel style={styles.gapSm}>
          <Text style={styles.heading}>{`${page.labelOf(pair.a)} and ${page.labelOf(pair.b)}`}</Text>
          {pair.edges.map((e) => (
            <Text key={e.id} style={styles.body}>
              {`• ${edgeWords(e, page.labelOf)} `}
              <Text style={styles.small}>{`· ${edgeTypeLabel(e.type)}, kept in ${keptIn(e)}`}</Text>
            </Text>
          ))}
          <View style={styles.row}>
            {[pair.a, pair.b].map((k) => {
              const node = drawnByKey.get(k);
              return node === undefined ? null : (
                <OutlineButton key={k} label={node.isGroup ? `Open ${page.labelOf(k)}` : `Show ${page.labelOf(k)}`} compact onPress={() => pick(node)} />
              );
            })}
            <OutlineButton label="Close" compact tone="muted" onPress={() => setPairKey(null)} />
          </View>
        </Panel>
      )}
      {page.selected !== null && (
        <Panel style={styles.gapSm}>
          <Text style={styles.heading}>{`How is ${page.selected.label} connected to…`}</Text>
          <OutlineButton
            label={`Focus on ${page.selected.label}`}
            icon="image-filter-center-focus"
            compact
            onPress={() => set(s.with({ focus: page.selected!.key }))}
            style={styles.start}
          />
          <Muted>Choose a record here, or long-press it on the graph.</Muted>
          <ChooserField
            label="Another record"
            value={page.pathTo ?? ''}
            choices={[
              { value: '', label: 'Choose…' },
              ...full.nodes.filter((n) => n.key !== page.selected!.key).map((n) => ({ value: n.key, label: `${n.label} (${page.typeName(n.type)})` })),
            ]}
            onChoose={(v) => set(s.with({ path: v.length === 0 ? null : v }))}
          />
          {page.pathTo !== null &&
            (page.path !== null ? (
              <View accessibilityLabel="The chain of connections">
                {pathSteps(page.path, page.labelOf).map((step) => (
                  <Text key={step} style={styles.body}>
                    {step}
                  </Text>
                ))}
              </View>
            ) : (
              <View style={styles.gapSm}>
                <Text style={styles.body}>{pathSaid(page.path, page.hiddenPath)}</Text>
                {page.hiddenPath !== null && (
                  <OutlineButton label="Restore the full view to see it" compact onPress={() => setS(new GraphSettings({ path: page.pathTo }))} style={styles.start} />
                )}
              </View>
            ))}
        </Panel>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------- layers

function Layers({
  s,
  page,
  set,
  onFold,
}: {
  s: GraphSettings;
  page: ReturnType<typeof graphPage>;
  set: (s: GraphSettings) => void;
  onFold: (type: string) => void;
}) {
  const toggled = (hidden: ReadonlySet<string>, type: string) => {
    const next = new Set(hidden);
    if (!next.delete(type)) next.add(type);
    return next;
  };
  const group = (title: string, types: [string, number][], hidden: ReadonlySet<string>, name: (t: string) => string, apply: (h: Set<string>) => void, folds = false) => (
    <View style={styles.gapSm}>
      <Text style={styles.label}>{title.toUpperCase()}</Text>
      {types.map(([type, count]) => (
        <View key={type} style={styles.layerRow}>
          <Chip label={`${name(type)}  ${count}`} icon={hidden.has(type) ? 'checkbox-blank-outline' : 'checkbox-marked-outline'} selected={!hidden.has(type)} onPress={() => apply(toggled(hidden, type))} />
          {folds && !hidden.has(type) && count > 1 && (
            <OutlineButton
              label={s.collapsed.has(type) ? 'Open' : 'Fold together'}
              accessibilityLabel={`${s.collapsed.has(type) ? 'Open' : 'Fold together'} ${name(type)}`}
              compact
              tone="muted"
              onPress={() => onFold(type)}
            />
          )}
        </View>
      ))}
    </View>
  );
  return (
    <Panel style={styles.gap}>
      {group('Records', page.counts.nodes, s.hiddenNodes, page.typeName, (h) => set(s.with({ hiddenNodes: h })), true)}
      {group('Connections', page.counts.edges, s.hiddenEdges, edgeTypeLabel, (h) => set(s.with({ hiddenEdges: h })))}
      {page.counts.statuses.length > 0 && group('Connection status', page.counts.statuses, s.hiddenStatuses, statusWords, (h) => set(s.with({ hiddenStatuses: h })))}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------------- canvas

/** How many lines are labelled at once; beyond it, only lit lines show their words. */
const labelLimit = 80;

function GraphCanvas({
  model,
  drawn,
  pairs,
  selectedKey,
  pairKey,
  path,
  codes,
  typeName,
  pairWords,
  onSelect,
  onPair,
  onPath,
}: {
  model: StoryModel;
  drawn: KnowledgeGraph;
  pairs: Pair[];
  selectedKey: string | null;
  pairKey: string | null;
  path: Set<string> | null;
  codes: Map<string, string>;
  typeName: (t: string) => string;
  pairWords: (p: Pair) => string;
  onSelect: (n: GraphNode) => void;
  onPair: (p: Pair) => void;
  onPath: (n: GraphNode) => void;
}) {
  const { width: screen } = useWindowDimensions();
  const boxW = Math.max(200, screen - space.md * 2 - 2);
  const boxH = 420;
  // Laid out again only when the records or lines drawn change; the same graph is always drawn the same way.
  const layoutKey = `${drawn.nodes.map((n) => n.key).join(',')}|${pairs.map((p) => p.key).join(',')}`;
  const placed = useMemo(
    () =>
      layoutGraph(
        drawn.nodes.map((n) => ({ id: n.key, degree: n.degree })),
        pairs.map((p) => ({ from: p.a, to: p.b })),
      ),
    [layoutKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fit = useMemo(() => {
    const xs = [...placed.values()].map((p) => p.x);
    const ys = [...placed.values()].map((p) => p.y);
    if (xs.length === 0) return { k: 1, tx: boxW / 2, ty: boxH / 2 };
    const minX = Math.min(...xs) - 60;
    const maxX = Math.max(...xs) + 60;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + 50;
    const k = Math.max(0.05, Math.min(2, Math.min(boxW / (maxX - minX), boxH / (maxY - minY))));
    return { k, tx: boxW / 2 - ((minX + maxX) / 2) * k, ty: boxH / 2 - ((minY + maxY) / 2) * k };
  }, [placed, boxW]);
  const [view, setView] = useState<{ k: number; tx: number; ty: number; key: string } | null>(null);
  const v = view !== null && view.key === layoutKey ? view : { ...fit, key: layoutKey };
  const start = useRef(v);
  start.current = v;
  const drag = useRef({ tx: 0, ty: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          drag.current = { tx: start.current.tx, ty: start.current.ty };
        },
        onPanResponderMove: (_, g) => setView({ ...start.current, tx: drag.current.tx + g.dx, ty: drag.current.ty + g.dy }),
      }),
    [],
  );
  const zoom = (by: number) => {
    const k = Math.max(0.05, Math.min(4, v.k * by));
    // Zoom round the middle of the box.
    setView({ k, tx: boxW / 2 - ((boxW / 2 - v.tx) / v.k) * k, ty: boxH / 2 - ((boxH / 2 - v.ty) / v.k) * k, key: layoutKey });
  };
  const at = (key: string) => {
    const p = placed.get(key) ?? { x: 0, y: 0 };
    return { x: v.tx + p.x * v.k, y: v.ty + p.y * v.k };
  };
  const lit = (p: Pair) => p.key === pairKey || (selectedKey !== null && (p.a === selectedKey || p.b === selectedKey)) || (path !== null && p.edges.some((e) => path.has(e.id)));
  const labelled = pairs.length <= labelLimit;
  // As the Flutter canvas draws at its zoom: shapes scale with it, and names by 1 / max(zoom, 0.6) in the drawing, so
  // when the whole graph is fitted onto a phone they shrink with it instead of piling up (seen 2026-11-17).
  const nameSize = (11.5 * v.k) / Math.max(v.k, 0.6);
  const namesShown = nameSize >= 5;
  return (
    <View style={styles.gapSm}>
      <View style={[styles.canvas, { width: boxW, height: boxH }]} {...pan.panHandlers} accessibilityLabel={`Knowledge graph: ${drawn.nodes.length} records, ${pairs.length} lines. The list form gives every connection in words.`}>
        <Svg width={boxW} height={boxH}>
          {pairs.map((p) => {
            const a = at(p.a);
            const b = at(p.b);
            const g = p.group;
            const on = lit(p);
            const dirs = new Set(p.edges.filter((e) => e.directed).map((e) => (e.from === p.a ? 'ab' : 'ba')));
            const oneWay = dirs.size === 1 && p.edges.every((e) => e.directed) ? [...dirs][0] : null;
            const [from, to] = oneWay === 'ba' ? [b, a] : [a, b];
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const r = (radiusOf(drawn.nodes.find((n) => n.key === (oneWay === 'ba' ? p.a : p.b))?.degree ?? 0) + 3) * v.k;
            const tip = { x: to.x - (dx / len) * r, y: to.y - (dy / len) * r };
            const ux = dx / len;
            const uy = dy / len;
            const head = 9;
            return (
              <G key={p.key}>
                <Line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={edgeColor[g]}
                  strokeOpacity={on ? 1 : selectedKey !== null ? 0.25 : 0.7}
                  strokeWidth={edgeWidth(g) * (on ? 1.6 : 1)}
                  strokeDasharray={edgeDash[g].length > 0 ? edgeDash[g].join(' ') : undefined}
                />
                <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} onPress={() => onPair(p)} />
                {oneWay !== null && (
                  <Polygon
                    points={`${tip.x},${tip.y} ${tip.x - ux * head - uy * head * 0.5},${tip.y - uy * head + ux * head * 0.5} ${tip.x - ux * head + uy * head * 0.5},${tip.y - uy * head - ux * head * 0.5}`}
                    fill={edgeColor[g]}
                  />
                )}
                {(on || (labelled && v.k >= 0.8)) && (
                  <SvgText x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} fill={colors.muted} fontFamily={fonts.ui} fontSize={11} textAnchor="middle">
                    {clip(p.edges[0].label, 24)}
                  </SvgText>
                )}
              </G>
            );
          })}
          {drawn.nodes.map((n) => {
            const c = at(n.key);
            const r = radiusOf(n.degree) * v.k;
            const on = n.key === selectedKey;
            const code = codes.get(n.type);
            return (
              <G key={n.key}>
                <Path d={shapePath(shapeOf(n.type), c.x, c.y, r)} fill={n.color} stroke={on ? colors.gold : colors.background} strokeWidth={on ? 4 : 2} />
                {code !== undefined && r >= 6 && (
                  <SvgText x={c.x} y={c.y + Math.max(7, Math.min(11, r / v.k)) * v.k * 0.35} fill="#ffffff" fontFamily={fonts.ui} fontSize={Math.max(7, Math.min(11, r / v.k)) * v.k} fontWeight="700" textAnchor="middle">
                    {code}
                  </SvgText>
                )}
                {n.isGroup && (
                  <SvgText x={c.x} y={c.y + 4} fill="#ffffff" fontFamily={fonts.ui} fontSize={12} fontWeight="700" textAnchor="middle">
                    {`${n.members?.length ?? 0}`}
                  </SvgText>
                )}
                {(namesShown || on) && (
                  <SvgText x={c.x} y={c.y + r + (on ? 14 : 10 * v.k + nameSize)} fill={colors.text} fontFamily={fonts.ui} fontSize={on ? 12 : nameSize} textAnchor="middle">
                    {clip(n.label, 22)}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
        {drawn.nodes.map((n) => {
          const c = at(n.key);
          const hit = Math.max(44, radiusOf(n.degree) * 2 * v.k);
          if (c.x < -hit || c.y < -hit || c.x > boxW + hit || c.y > boxH + hit) return null;
          return (
            <Pressable
              key={`hit-${n.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${n.label}, ${typeName(n.type)}${n.isGroup ? ', a group: press to open it' : ''}`}
              accessibilityState={{ selected: n.key === selectedKey }}
              onPress={() => onSelect(n)}
              onLongPress={() => onPath(n)}
              style={{ position: 'absolute', left: c.x - hit / 2, top: c.y - hit / 2, width: hit, height: hit }}
            />
          );
        })}
        <View style={styles.zoom}>
          <IconButton icon="plus" label="Zoom in" onPress={() => zoom(1.25)} bordered />
          <IconButton icon="minus" label="Zoom out" onPress={() => zoom(0.8)} bordered />
          <IconButton icon="fit-to-screen-outline" label="Fit to view" onPress={() => setView(null)} bordered />
        </View>
      </View>
      {pairKey !== null && (
        <Muted>{(() => {
          const p = pairs.find((x) => x.key === pairKey);
          return p === undefined ? '' : pairWords(p);
        })()}</Muted>
      )}
      <Muted>Tap a record to select it, long-press one to show the path to it from the selection, tap a line to see what it stands for. Drag to move round.</Muted>
    </View>
  );
}

function Legend({ drawn, pairs, codes, typeName }: { drawn: KnowledgeGraph; pairs: Pair[]; codes: Map<string, string>; typeName: (t: string) => string }) {
  const types = [...new Set(drawn.nodes.map((n) => n.type))];
  const color = new Map(drawn.nodes.map((n) => [n.type, n.color]));
  const groups = [...new Set(pairs.map((p) => p.group))];
  return (
    <View style={styles.gapSm}>
      <View style={styles.row}>
        {types.map((t) => (
          <View key={t} style={styles.key}>
            <Svg width={22} height={22}>
              <Path d={shapePath(shapeOf(t), 11, 11, 7)} fill={color.get(t) ?? colors.muted} />
            </Svg>
            <Text style={styles.small}>{`${typeName(t)}${codes.has(t) ? ` (${codes.get(t)})` : ''}`}</Text>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        {groups.map((g) => (
          <View key={g} style={styles.key}>
            <Svg width={30} height={10}>
              <Line x1={0} y1={5} x2={30} y2={5} stroke={edgeColor[g]} strokeWidth={edgeWidth(g)} strokeDasharray={edgeDash[g].length > 0 ? edgeDash[g].join(' ') : undefined} />
            </Svg>
            <Text style={styles.small}>{edgeGroupLabel[g]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// --------------------------------------------------------------------------------------------------- the list

function EdgeList({
  drawn,
  selected,
  labelOf,
  onSelect,
}: {
  drawn: KnowledgeGraph;
  selected: GraphNode | null;
  labelOf: (key: string) => string;
  onSelect: (n: GraphNode) => void;
}) {
  const byKey = new Map(drawn.nodes.map((n) => [n.key, n]));
  const end = (key: string) => {
    const node = byKey.get(key);
    return node === undefined ? (
      <Text style={styles.body}>{labelOf(key)}</Text>
    ) : (
      <Pressable accessibilityRole="button" onPress={() => onSelect(node)}>
        <Text style={[styles.body, styles.link]}>{labelOf(key)}</Text>
      </Pressable>
    );
  };
  const lone = alone(drawn);
  return (
    <View style={styles.gapSm}>
      {drawn.edges.map((e) => (
        <View key={e.id} style={[styles.edge, selected !== null && (e.from === selected.key || e.to === selected.key) && styles.edgeLit]}>
          <View style={styles.row}>
            {end(e.from)}
            <Text style={styles.name}>{listWords(e)}</Text>
            {end(e.to)}
          </View>
          <Text style={styles.small}>{`kept in ${keptIn(e)}`}</Text>
        </View>
      ))}
      {lone.length > 0 && <Muted>{`With no connection shown: ${lone.join(', ')}.`}</Muted>}
    </View>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  center: { textAlign: 'center' },
  start: { alignSelf: 'flex-start' },
  empty: { alignItems: 'center', gap: space.sm },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.gold },
  name: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  link: { color: colors.gold, textDecorationLine: 'underline' },
  layersHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  layerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  canvas: { alignSelf: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  zoom: { position: 'absolute', right: 8, top: 8, gap: 6 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  edge: { padding: space.sm, gap: 2, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  edgeLit: { borderColor: colors.gold, backgroundColor: 'rgba(243, 182, 58, 0.10)' },
});
