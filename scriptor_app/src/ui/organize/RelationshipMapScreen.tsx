// THE RELATIONSHIP MAP (FEATURES.md #199, #200): the cast as a network, lines styled by group with arrows for one-way
// ties; as of now, a chapter, across chapters or ever; filters by type, faction and focus; zoom and fit; a tap selects;
// a list form; and, on an empty map, the first tie. A port of flutter_app/lib/features/relationships/
// relationship_map_page.dart and first_tie.dart; what it shows is src/domain/relationships/screens/relationshipMap.ts.

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { type GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { newId } from '../../domain/ids';
import { relationNetwork } from '../../domain/relationships/network';
import { relationSettingsOf } from '../../domain/relationships/relationTypes';
import { drawFirstTie, type FirstTieDraft, firstTieTypes, firstTieView, initialFirstTie } from '../../domain/relationships/screens/firstTie';
import {
  arrowHead,
  clearedMapState,
  dashSegments,
  edgeLabelShown,
  edgePaint,
  edgeTapped,
  filtersShown,
  filtersToggleLabel,
  fitTooltip,
  fitTransform,
  focusedOn,
  hitTest,
  initialMapState,
  labelsShown,
  layerToggled,
  mapBody,
  mapCount,
  mapDrawingFrom,
  mapLayoutRun,
  mapFiltered,
  mapFiltersView,
  mapLegend,
  legendArrows,
  mapList,
  mapListEmpty,
  type MapSelection,
  type MapState,
  mapTitle,
  mapZoom,
  nameAt,
  networkFilterOf,
  nodePaint,
  selectionView,
  viewChoices,
} from '../../domain/relationships/screens/relationshipMap';
import { relationshipPath } from '../../domain/relationships/screens/relationshipPage';
import { Chip, Field, GoldButton, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { ChooserField } from './parts';
import { useRelate } from './RelationshipScreen';
import { useOpenNovel } from './useNovel';
import { useInSlices } from '../inSlices';
import { SvgCanonBadge, useCanonMarks } from '../review/CanonMarks';

export function RelationshipMapScreen() {
  const novel = useOpenNovel();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = sizeClassOf(width) === 'compact';
  const relate = useRelate(novel);
  const [state, setState] = useState<MapState>(initialMapState);
  const [showFilters, setShowFilters] = useState<boolean | null>(null);
  const [sel, setSel] = useState<MapSelection>({ node: null, edge: null });
  const [zoom, setZoom] = useState<number | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<FirstTieDraft>(initialFirstTie);

  const settings = novel ? relationSettingsOf(novel.snapshot.rows('relationSettings')) : null;
  const net = useMemo(() => (novel ? relationNetwork(novel.model, networkFilterOf(state)) : null), [novel, state]);
  // Laid out between frames when the cast is large (ui/inSlices.ts): the same map, without holding the screen.
  const layoutKey = net ? `${net.nodes.map((n) => `${n.id}:${n.degree}`).join(',')}|${net.edges.map((e) => `${e.from}>${e.to}`).join(',')}` : null;
  const placed = useInSlices(layoutKey, () => mapLayoutRun(net!), (net?.nodes.length ?? 0) <= 80);
  const drawing = useMemo(() => (placed ? mapDrawingFrom(placed) : null), [placed]);
  const canonMarks = useCanonMarks();
  if (novel && settings && net && !drawing) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Muted>Drawing the map…</Muted>
      </View>
    );
  }
  if (!novel || !settings || !net || !drawing) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Muted>Open a novel from your Library first.</Muted>
      </View>
    );
  }
  const filters = mapFiltersView(novel.model, settings, state);
  const body = mapBody(net, state);
  const fit = fitTransform(box.width > 0 ? box : { width: 1, height: 1 }, drawing);
  const scale = zoom ?? fit.scale;
  const view = selectionView(novel.model, net, sel);
  const shownFilters = filtersShown(showFilters, compact);
  const labels = labelsShown(net, sel);

  const tap = (e: GestureResponderEvent) => {
    const p = { x: e.nativeEvent.locationX / scale, y: e.nativeEvent.locationY / scale };
    const hit = hitTest(net, drawing.at, p);
    if (hit === null) setSel({ node: null, edge: null });
    else if ('node' in hit) setSel({ node: hit.node, edge: null });
    else {
      const t = edgeTapped(novel.model, hit.edge);
      setSel({ node: null, edge: t.selectedLink ?? (t.select?.id ?? hit.edge) });
    }
  };

  // The cast as listed, without the archived (archived characters keep a flag in their profile).
  const archived = new Set(novel.snapshot.rows('characterProfiles').filter((p) => p['archived'] === true).map((p) => String(p['entryId'])));
  const people = [...novel.model.entries.values()]
    .filter((e) => e.category === 'character' && !archived.has(e.id))
    .map((e) => ({ id: e.id, name: e.name }));
  const tie = firstTieView(people, draft);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Back to the cast" onPress={() => router.navigate('/organize')} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {mapTitle}
          </Text>
          <Muted>{mapCount(net)}</Muted>
        </View>
        <IconButton icon="cog-outline" label="Types and attributes" onPress={() => router.navigate('/organize/relationships/settings')} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          {viewChoices.map((v) => (
            <Chip key={String(v.value)} label={v.label} icon={v.value ? 'format-list-bulleted' : 'graph-outline'} selected={state.list === v.value} onPress={() => setState({ ...state, list: v.value })} />
          ))}
          {compact && (
            <OutlineButton label={filtersToggleLabel(shownFilters, mapFiltered(state))} icon="filter-variant" compact tone="muted" onPress={() => setShowFilters(!shownFilters)} />
          )}
        </View>
        {shownFilters && (
          <Panel style={styles.panel}>
            <ChooserField label={filters.when.label} value={filters.when.value} choices={filters.when.choices} onChoose={(v) => setState({ ...state, when: v })} />
            {filters.at && <ChooserField label={filters.at.label} value={filters.at.value} choices={filters.at.choices} onChoose={(v) => setState({ ...state, at: v })} />}
            {filters.across && (
              <View style={styles.row}>
                <View style={styles.half}>
                  <ChooserField label={filters.across.from.label} value={filters.across.from.value} choices={filters.across.from.choices} onChoose={(v) => setState({ ...state, from: v })} />
                </View>
                <View style={styles.half}>
                  <ChooserField label={filters.across.to.label} value={filters.across.to.value} choices={filters.across.to.choices} onChoose={(v) => setState({ ...state, to: v })} />
                </View>
              </View>
            )}
            <ChooserField label={filters.type.label} value={filters.type.value} choices={filters.type.choices} onChoose={(v) => setState({ ...state, type: v })} />
            {filters.faction && <ChooserField label={filters.faction.label} value={filters.faction.value} choices={filters.faction.choices} onChoose={(v) => setState({ ...state, faction: v })} />}
            <ChooserField label={filters.focus.label} value={filters.focus.value} choices={filters.focus.choices} onChoose={(v) => setState({ ...state, focus: v })} />
            {filters.depth && <Chip label={filters.depth.label} selected={filters.depth.selected} onPress={() => setState({ ...state, depth: filters.depth!.selected ? 1 : 2 })} />}
            <Text style={styles.label}>{filters.showLabel.toUpperCase()}</Text>
            <View style={styles.row}>
              {filters.layers.map((l) => (
                <Chip key={l.layer} label={l.label} selected={l.selected} onPress={() => setState(layerToggled(state, l.layer, !l.selected))} />
              ))}
              <Chip label={filters.isolated.label} selected={filters.isolated.selected} onPress={() => setState({ ...state, isolated: !state.isolated })} />
            </View>
            {filters.clear && <OutlineButton label={filters.clear} icon="filter-remove-outline" compact tone="muted" onPress={() => setState(clearedMapState(state))} style={styles.start} />}
          </Panel>
        )}

        {body === 'no-results' && (
          <Panel style={styles.panel}>
            <Muted>Nothing matches these filters.</Muted>
            <OutlineButton label="Clear filters" compact onPress={() => setState(clearedMapState(state))} style={styles.start} />
          </Panel>
        )}

        {body === 'first-tie' && (
          <Panel style={styles.panel}>
            <Text style={styles.kicker}>{tie.heading.toUpperCase()}</Text>
            <Muted>{tie.text}</Muted>
            {tie.kind === 'pairs' ? (
              <OutlineButton label="Open the cast" icon="account-group-outline" compact onPress={() => router.navigate('/organize')} style={styles.start} />
            ) : (
              <>
                {tie.known ? (
                  <Text style={styles.text}>{tie.known.name}</Text>
                ) : (
                  <Field label={tie.firstField!.helper} placeholder={tie.firstField!.hint} value={draft.first} onChangeText={(v) => setDraft({ ...draft, first: v })} />
                )}
                <Text style={styles.text}>{tie.and}</Text>
                <Field label={tie.secondField.helper} placeholder={tie.secondField.hint} value={draft.second} onChangeText={(v) => setDraft({ ...draft, second: v })} />
                <ChooserField label={tie.are} value={draft.preset} choices={firstTieTypes} onChoose={(v) => setDraft({ ...draft, preset: v })} />
                {tie.roles && <Muted>{tie.roles}</Muted>}
                <GoldButton
                  label={tie.draw.label}
                  icon="vector-line"
                  disabled={!tie.draw.enabled}
                  onPress={() => {
                    const said = relate.now((c) => drawFirstTie(c, people, draft, (name) => c.create({ name }).id));
                    if (said) {
                      toast(said);
                      setDraft(initialFirstTie);
                    }
                  }}
                />
              </>
            )}
          </Panel>
        )}

        {body === 'list' && (
          <Panel style={styles.panel}>
            {(() => {
              const rows = mapList(novel.model, net);
              if (rows.length === 0) return <Muted>{mapListEmpty}</Muted>;
              return rows.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole={r.opens ? 'button' : 'text'}
                  disabled={!r.opens}
                  onPress={() => r.opens && router.navigate(relationshipPath(r.opens))}
                  style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.elevated }]}
                >
                  <Text style={styles.text}>{r.title}</Text>
                  <Muted>{r.subtitle}</Muted>
                </Pressable>
              ));
            })()}
          </Panel>
        )}

        {body === 'map' && (
          <>
            <View style={[styles.mapBox, { height: compact ? 460 : 620 }]} onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
              <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ minWidth: '100%' }}>
                <ScrollView nestedScrollEnabled contentContainerStyle={{ minHeight: '100%', justifyContent: 'center' }}>
                  <Pressable onPress={tap} accessibilityLabel={`${mapTitle}. ${mapCount(net)}`} style={{ width: drawing.width * scale, height: drawing.height * scale, margin: zoom === null ? Math.max(0, fit.x) : 0 }}>
                    <Svg width={drawing.width * scale} height={drawing.height * scale}>
                      <G scale={scale}>
                        {net.edges.map((e) => {
                          const a = drawing.at.get(e.from)!;
                          const b = drawing.at.get(e.to)!;
                          const paint = edgePaint(e, sel);
                          const to = net.nodes.find((n) => n.id === e.to);
                          return (
                            <G key={e.id} opacity={paint.opacity}>
                              {dashSegments(a, b, paint.style.dash).map(([p, q], i) => (
                                <Line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={paint.style.color} strokeWidth={paint.width} strokeLinecap="round" />
                              ))}
                              {e.directed && to && (
                                <Polygon points={arrowHead(a, b, nodePaint(net, to, sel).radius).map((p) => `${p.x},${p.y}`).join(' ')} fill={paint.style.color} />
                              )}
                            </G>
                          );
                        })}
                        {/* The lines' labels on a backing of the map's own colour, over every line; the names go
                            over them, last, so a name always reads (as the Flutter map paints them). */}
                        {labels &&
                          net.edges
                            .filter((e) => edgeLabelShown(net, e, sel))
                            .map((e) => {
                              const a = drawing.at.get(e.from)!;
                              const b = drawing.at.get(e.to)!;
                              return (
                                <Backed
                                  key={`label:${e.id}`}
                                  text={e.label}
                                  x={(a.x + b.x) / 2}
                                  y={(a.y + b.y) / 2}
                                  size={11}
                                  color={colors.muted}
                                  opacity={edgePaint(e, sel).opacity}
                                />
                              );
                            })}
                        {net.nodes.map((n) => {
                          const c = drawing.at.get(n.id)!;
                          const p = nodePaint(net, n, sel);
                          const at = nameAt(c, p.radius);
                          return (
                            <G key={n.id}>
                              {p.ring && <Circle cx={c.x} cy={c.y} r={p.radius + 4} stroke={colors.gold} strokeWidth={3} fill="none" />}
                              <Circle cx={c.x} cy={c.y} r={p.radius} fill={p.accent ? colors.gold : colors.elevated} stroke={colors.gold} strokeWidth={1.5} opacity={p.opacity} />
                              <SvgText x={c.x} y={c.y + p.radius * 0.32} fontSize={p.radius * 0.9} fill={p.accent ? colors.onGold : colors.text} textAnchor="middle" opacity={p.opacity}>
                                {p.initial}
                              </SvgText>
                            </G>
                          );
                        })}
                        {net.nodes.map((n) => {
                          const p = nodePaint(net, n, sel);
                          const at = nameAt(drawing.at.get(n.id)!, p.radius);
                          return <Backed key={`name:${n.id}`} text={n.name} x={at.x} y={at.y} size={12} color={colors.text} opacity={p.nameOpacity} />;
                        })}
                        {/* Canon and continuity badges, when the marks are on (turned on in a Visualize view): beside
                            each character, and by the middle of each tie (relationship_map_page.dart). */}
                        {canonMarks !== null && (
                          <G>
                            {net.edges.map((e) => {
                              const a = drawing.at.get(e.from)!;
                              const b = drawing.at.get(e.to)!;
                              const mark = canonMarks.get(`relation:${e.id}`) ?? canonMarks.get(`link:${e.id}`);
                              return <SvgCanonBadge key={`eb:${e.id}`} mark={mark} x={(a.x + b.x) / 2 + 6} y={(a.y + b.y) / 2 + 8} />;
                            })}
                            {net.nodes.map((n) => {
                              const c = drawing.at.get(n.id)!;
                              const r = nodePaint(net, n, sel).radius;
                              return <SvgCanonBadge key={`nb:${n.id}`} mark={canonMarks.get(`entry:${n.id}`)} x={c.x + r * 0.7} y={c.y - r - 8} />;
                            })}
                          </G>
                        )}
                      </G>
                    </Svg>
                  </Pressable>
                </ScrollView>
              </ScrollView>
              <View style={styles.zoom}>
                <IconButton icon="magnify-plus-outline" label="Zoom in" onPress={() => setZoom(Math.min(mapZoom.max, scale * 1.25))} />
                <IconButton icon="magnify-minus-outline" label="Zoom out" onPress={() => setZoom(Math.max(mapZoom.min, scale / 1.25))} />
                <IconButton icon="fit-to-screen-outline" label={fitTooltip} onPress={() => setZoom(null)} />
              </View>
            </View>
            <Panel style={styles.panel}>
              {view.kind === 'connection' ? (
                <>
                  <Text style={styles.text}>{view.title}</Text>
                  {view.lines.map((l) => (
                    <Muted key={l}>{l}</Muted>
                  ))}
                  <View style={styles.row}>
                    {view.open.map((o) => (
                      <OutlineButton key={o.characterId} label={o.label} compact tone="muted" onPress={() => router.navigate(`/organize/character/${o.characterId}`)} />
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.text}>{view.text}</Text>
                  {view.kind === 'node' && (
                    <View style={styles.row}>
                      <OutlineButton label={`Open ${net.nodes.find((n) => n.id === sel.node)?.name ?? ''}`} compact onPress={() => router.navigate(`/organize/character/${sel.node}`)} />
                      <OutlineButton label={view.focus.label} compact tone="muted" onPress={() => setState(focusedOn(state, view.focus.id))} />
                    </View>
                  )}
                  {view.kind === 'relationship' && sel.edge && (
                    <OutlineButton label="Open the relationship" compact onPress={() => router.navigate(relationshipPath(sel.edge!))} style={styles.start} />
                  )}
                </>
              )}
            </Panel>
            <View style={styles.legend}>
              {mapLegend().map((l) => (
                <View key={l.label} style={styles.legendItem}>
                  <View style={{ width: 22, height: 3, backgroundColor: l.style.color, borderRadius: 2 }} />
                  <Text style={styles.legendText}>{l.label}</Text>
                </View>
              ))}
              <Text style={styles.legendText}>{legendArrows}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  body: { padding: space.md, gap: space.md },
  panel: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  half: { flex: 1, minWidth: 140 },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  text: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  start: { alignSelf: 'flex-start' },
  listRow: { minHeight: 52, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radius.field, borderBottomWidth: 1, borderBottomColor: colors.border },
  mapBox: { borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  zoom: { position: 'absolute', right: 4, top: 4, backgroundColor: 'rgba(19,22,31,0.85)', borderRadius: radius.field },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
});

/** A line of text centred on (x, y), on a rounded backing of the map's colour at 0.8 (Flutter's `_text`): at most
 * about 160 wide, cut with "…". The width is estimated from the text, as the drawing has no layout of its own. */
function Backed({ text, x, y, size, color, opacity }: { text: string; x: number; y: number; size: number; color: string; opacity: number }) {
  const max = Math.floor(160 / (size * 0.56));
  const shown = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  const width = shown.length * size * 0.56;
  const height = size * 1.25;
  return (
    <G opacity={opacity}>
      <Rect x={x - width / 2 - 3} y={y - height / 2 - 1} width={width + 6} height={height + 2} rx={3} fill={colors.surface} fillOpacity={0.8} />
      <SvgText x={x} y={y + size * 0.36} fontSize={size} fontWeight="600" fill={color} textAnchor="middle">
        {shown}
      </SvgText>
    </G>
  );
}
