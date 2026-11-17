// Visualize › Structure and pacing (FEATURES.md #285): words per chapter (or scene) in reading order with the volumes,
// acts and arcs behind them, the average, the author's structural markers as flags; words by label; and the markers,
// with a form to add one. Only what is recorded: no formula is assumed. A port of
// flutter_app/lib/features/plot/structure_page.dart; the figures are src/domain/visualize/story/pacing.ts.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { localeCompare } from '../../domain/collation';
import { formatNumber, plural } from '../../domain/desk/format';
import { EntityRef } from '../../domain/model/entityRef';
import type { StoryModel } from '../../domain/model/storyModel';
import { usedLabels } from '../../domain/plot/labels';
import { buildTree, flattenTree } from '../../domain/plot/board';
import { stableSorted } from '../../domain/reader/stableSort';
import { isGroup } from '../../domain/records/storyNode';
import { dartToLowerCase, dartTrim } from '../../domain/text/dartString';
import { nodeLabel } from '../../domain/timeline/narrative';
import {
  type Grain,
  type LabelDistribution,
  type LengthBar,
  type PartBand,
  type PlacedMarker,
  barOf,
  labelDistribution,
  lengthBars,
  lengthFacts,
  markersIn,
  markersOf,
  partBands,
  placeMarkers,
  suggestedMarkers,
} from '../../domain/visualize/story/pacing';
import {
  barWords,
  factLine,
  labelHeading,
  lengthHeading,
  markerWords,
  niceMax,
  shortName,
  structureChart as chart,
  structureWords as words,
} from '../../domain/visualize/story/screens';
import { ActionSheet } from '../dialogs';
import { Chip, GoldButton, IconButton, Muted, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { usePlot } from '../plan/usePlot';
import { useCast } from '../organize/useCast';
import { colors, fonts, space } from '../theme';
import { VizFrame, useVizSelection } from './VizFrame';

export function StructureView() {
  const open = useCast();
  const [list, setList] = useState(false);
  return (
    <VizFrame
      view="structure"
      title={words.title}
      subtitle={open?.cast.novelTitle}
      filters={false}
      actions={
        <>
          <Chip label={words.charts} icon="chart-bar" selected={!list} onPress={() => setList(false)} />
          <Chip label={words.list} icon="format-list-bulleted" selected={list} onPress={() => setList(true)} />
        </>
      }
    >
      <StructureBody list={list} />
    </VizFrame>
  );
}

function StructureBody({ list }: { list: boolean }) {
  const open = useCast();
  const { selected, select } = useVizSelection();
  const [grain, setGrain] = useState<Grain>('chapters');
  const [labelAsked, setLabel] = useState<string | null>(null);
  const [partAsked, setPart] = useState<string | null>(null);
  if (open === null) return null;
  const model = open.cast.model;
  if (model.order.chapters.length === 0) {
    return (
      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>{words.noChapters.title}</Text>
        <Muted>{words.noChapters.message}</Muted>
      </Panel>
    );
  }
  const parts = stableSorted(
    [...model.nodes.values()].filter((n) => isGroup(n.kind)),
    (a, b) => (model.order.position.get(a.id) ?? 0) - (model.order.position.get(b.id) ?? 0),
  );
  const partId = parts.some((p) => p.id === partAsked) ? partAsked : null;
  const labels = usedLabels(model);
  const label = labels.find((l) => dartToLowerCase(l) === dartToLowerCase(labelAsked ?? '')) ?? null;
  const bars = lengthBars(model, { grain, partId });
  const bands = partBands(bars, model);
  const facts = lengthFacts(bars);
  const picked = label === null ? bars : bars.filter((b) => b.labels.some((l) => dartToLowerCase(l) === dartToLowerCase(label)));
  const dist = labelDistribution(bars, model, grain);
  const placed = placeMarkers(markersOf(open.cast.snapshot.rows('structureMarkers')), model);
  const onBars = new Map<number, string[]>();
  for (const p of placed) {
    const i = barOf(p, bars, model);
    if (i >= 0) onBars.set(i, [...(onBars.get(i) ?? []), p.marker.kind]);
  }
  const selectedId = selected?.type === 'node' ? selected.id : null;
  const pick = (id: string) => select(new EntityRef('node', id));

  return (
    <View style={styles.gap}>
      <Panel>
        <Text style={styles.small}>
          <Text style={styles.label}>{words.what}</Text>
          {words.whatText}
        </Text>
      </Panel>
      <View style={styles.row}>
        <Chip label="Chapters" selected={grain === 'chapters'} onPress={() => setGrain('chapters')} />
        <Chip label="Scenes" selected={grain === 'scenes'} onPress={() => setGrain('scenes')} />
      </View>
      <ChooserField label={words.pickLabel} value={label ?? ''} choices={[{ value: '', label: words.noPick }, ...labels.map((l) => ({ value: l, label: l }))]} onChoose={(v) => setLabel(v.length === 0 ? null : v)} />
      {parts.length > 0 && (
        <ChooserField
          label={words.part}
          value={partId ?? ''}
          choices={[{ value: '', label: words.wholeBook }, ...parts.map((p) => ({ value: p.id, label: p.title.length === 0 ? 'Untitled' : p.title }))]}
          onChoose={(v) => setPart(v.length === 0 ? null : v)}
        />
      )}
      <Text style={styles.body} accessibilityLiveRegion="polite">
        {factLine(bars, facts, grain, label, picked.length)}
      </Text>
      {facts.total === 0 && bars.length > 0 && <Muted>{words.notWritten}</Muted>}

      <Text style={styles.heading} accessibilityRole="header">
        {lengthHeading(grain)}
      </Text>
      {bars.length > 0 && !list && (
        <>
          <LengthChart model={model} bars={bars} bands={bands} markers={onBars} average={facts.average} label={label} selectedId={selectedId} onSelect={pick} />
          <ChartLegend grain={grain} empty={bars.some((b) => b.words === 0)} average={facts.average > 0} markers={onBars.size > 0} bands={bands.length > 0} />
        </>
      )}
      {bars.length > 0 && list && (
        <Table
          headers={[grain === 'chapters' ? 'Chapter' : 'Chapter or scene', 'Part', 'Words', 'Labels', 'Markers']}
          rows={bars.map((bar, i) => [
            <Pressable key="n" accessibilityRole="button" onPress={() => pick(bar.nodeId)} style={bar.nodeId === selectedId ? styles.chosen : null}>
              <Text style={styles.link}>{bar.label}</Text>
            </Pressable>,
            bar.partId === null ? '—' : (model.nodes.get(bar.partId)?.title ?? '—'),
            bar.words > 0 ? formatNumber(bar.words) : 'No words yet',
            bar.labels.length === 0 ? '—' : bar.labels.join(', '),
            onBars.get(i)?.join(', ') ?? '—',
          ])}
        />
      )}

      <Text style={styles.heading} accessibilityRole="header">
        {labelHeading(grain)}
      </Text>
      {dist.labels.length === 0 ? (
        <Panel style={styles.gapSm}>
          <Text style={styles.cellTitle}>{words.noLabels.title}</Text>
          <Muted>{words.noLabels.message}</Muted>
        </Panel>
      ) : !list ? (
        <LabelGrid bars={bars} dist={dist} picked={label} />
      ) : (
        <Table
          headers={['Label', 'Words', grain === 'chapters' ? 'Chapters with it' : 'Bars with it']}
          rows={[...dist.totals.map((t) => [t.label, formatNumber(t.words), `${t.bars}`]), ['No label', formatNumber(dist.unlabelled), '']]}
        />
      )}

      <Text style={styles.heading} accessibilityRole="header">
        {words.markers}
      </Text>
      <Markers model={model} placed={placed} />
    </View>
  );
}

/** Words per bar, the parts behind them, the average, and the markers as flags. Scrolls sideways; a bar selects. */
function LengthChart({
  model,
  bars,
  bands,
  markers,
  average,
  label,
  selectedId,
  onSelect,
}: {
  model: StoryModel;
  bars: readonly LengthBar[];
  bands: readonly PartBand[];
  markers: ReadonlyMap<number, string[]>;
  average: number;
  label: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const max = niceMax(Math.max(0, ...bars.map((b) => b.words)));
  const width = chart.axis + bars.length * chart.bar + 70;
  const height = chart.top + chart.plot + chart.bottom;
  const x = (i: number) => chart.axis + i * chart.bar;
  const y = (w: number) => chart.top + chart.plot - (w / max) * chart.plot;
  const flagged = [...markers.keys()].sort((a, b) => a - b);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={{ width, height }}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          {bands.map((band, i) => {
            const w = (band.to - band.from + 1) * chart.bar;
            return (
              <G key={band.partId + band.from}>
                <Rect x={x(band.from)} y={chart.top - 4} width={w} height={chart.plot + 4} fill={i % 2 === 1 ? colors.elevated : colors.surface} />
                <SvgText x={x(band.from) + 4} y={chart.top - 28} fontSize={11} fontFamily={fonts.ui} fill={colors.muted}>
                  {band.title.length * 6 > w ? `${band.title.slice(0, Math.max(3, Math.floor(w / 6) - 1))}…` : band.title}
                </SvgText>
              </G>
            );
          })}
          {[0, max / 2, max].map((tick) => (
            <G key={tick}>
              <Line x1={chart.axis - 4} y1={y(tick)} x2={width - 8} y2={y(tick)} stroke={colors.border} strokeWidth={1} />
              <SvgText x={chart.axis - 8} y={y(tick) + 4} fontSize={11} fontFamily={fonts.ui} fill={colors.muted} textAnchor="end">
                {formatNumber(Math.floor(tick + 0.5))}
              </SvgText>
            </G>
          ))}
          {bars.map((bar, i) => {
            const dim = label !== null && !bar.labels.some((l) => dartToLowerCase(l) === dartToLowerCase(label));
            const selected = bar.nodeId === selectedId;
            const colour = selected ? colors.sky : colors.gold;
            const h = Math.max(0, chart.top + chart.plot - y(bar.words));
            return (
              <G key={bar.nodeId + i}>
                {selected && <Rect x={x(i)} y={chart.top - 4} width={chart.bar} height={chart.plot + 4} fill="rgba(56, 189, 248, 0.14)" />}
                {bar.words > 0 ? (
                  <Rect x={x(i) + 4} y={chart.top + chart.plot - h} width={chart.bar - 8} height={h} fill={colour} fillOpacity={dim ? 0.3 : 1} />
                ) : (
                  <Rect x={x(i) + 4} y={chart.top + chart.plot - 8} width={chart.bar - 8} height={8} fill="none" stroke={colors.muted} />
                )}
                <SvgText x={x(i) + chart.bar / 2} y={chart.top + chart.plot + 18} fontSize={11} fontFamily={fonts.ui} fill={colors.muted} textAnchor="middle">
                  {shortName(bars, i)}
                </SvgText>
              </G>
            );
          })}
          {average > 0 && (
            <G>
              <Line x1={chart.axis} y1={y(average)} x2={width - 8} y2={y(average)} stroke={colors.text} strokeWidth={1.5} strokeDasharray="5 5" />
              <SvgText x={width - 10} y={y(average) - 6} fontSize={11} fontFamily={fonts.ui} fill={colors.text} textAnchor="end">
                {`average ${formatNumber(average)}`}
              </SvgText>
            </G>
          )}
          {[...markers].map(([i, kinds]) => {
            const cx = x(i) + chart.bar / 2;
            const next = flagged.find((j) => j > i);
            const room = next === undefined ? 130 : Math.min(130, (next - i) * chart.bar - 14);
            const text = kinds.join(', ');
            return (
              <G key={`m${i}`}>
                <Line x1={cx} y1={chart.top - 14} x2={cx} y2={chart.top + chart.plot} stroke={colors.success} strokeWidth={1.5} />
                <Path d={`M${cx} ${chart.top - 18} l8 4 l-8 4 Z`} fill={colors.success} />
                {room >= 24 && (
                  <SvgText x={cx + 10} y={chart.top - 10} fontSize={11} fontFamily={fonts.ui} fill={colors.success}>
                    {text.length * 6 > room ? `${text.slice(0, Math.max(2, Math.floor(room / 6) - 1))}…` : text}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
        {bars.map((bar, i) => (
          <Pressable
            key={bar.nodeId + i}
            accessibilityRole="button"
            accessibilityState={{ selected: bar.nodeId === selectedId }}
            accessibilityLabel={barWords(model, bar, markers.get(i))}
            onPress={() => onSelect(bar.nodeId)}
            style={{ position: 'absolute', left: x(i), top: chart.top - 4, width: chart.bar, height: chart.plot + chart.bottom }}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function ChartLegend({ grain, empty, average, markers, bands }: { grain: Grain; empty: boolean; average: boolean; markers: boolean; bands: boolean }) {
  const item = (swatch: React.ReactNode, label: string) => (
    <View key={label} style={styles.legendItem}>
      {swatch}
      <Text style={styles.small}>{label}</Text>
    </View>
  );
  const box = (fill: string | null, border?: string) => <View style={{ width: 14, height: 14, backgroundColor: fill ?? 'transparent', borderWidth: border ? 1 : 0, borderColor: border }} />;
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.label}>{words.legend}</Text>
      {item(box(colors.gold), `Words in each ${grain === 'chapters' ? 'chapter' : 'scene'}`)}
      {empty && item(box(null, colors.muted), words.nothingWritten)}
      {average && item(<Text style={styles.small}>- - -</Text>, words.average)}
      {markers && item(<Text style={{ color: colors.success }}>⚑</Text>, words.marker)}
      {bands && item(box(colors.elevated), words.band)}
    </View>
  );
}

/** Words by label, a column for each bar: the more words, the stronger the shade. */
function LabelGrid({ bars, dist, picked }: { bars: readonly LengthBar[]; dist: LabelDistribution; picked: string | null }) {
  const most = Math.max(1, ...dist.cells.flatMap((c) => [...c.words.values(), c.unlabelled]));
  const cell = (text: string, key: string, shade = 0, bold = false) => (
    <View key={key} style={[styles.gridCell, shade > 0 && { backgroundColor: `rgba(243, 182, 58, ${0.12 + 0.6 * shade})` }]}>
      <Text style={[styles.gridText, bold && styles.bold, shade > 0.6 && { color: colors.onGold }]}>{text}</Text>
    </View>
  );
  const rows: (string | null)[] = [...dist.labels, null];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={styles.flexRow}>
          <Text style={styles.gridLabel}>Label</Text>
          {bars.map((b, i) => cell(shortName(bars, i), `h${i}`))}
          {cell('All', 'hall', 0, true)}
        </View>
        {rows.map((l) => (
          <View key={l ?? '∅'} style={[styles.flexRow, picked !== null && l !== null && dartToLowerCase(l) === dartToLowerCase(picked) && styles.chosen]}>
            <Text style={styles.gridLabel} numberOfLines={1}>
              {l ?? 'No label'}
            </Text>
            {dist.cells.map((c, i) => {
              const w = l === null ? c.unlabelled : (c.words.get(l) ?? 0);
              const has = l === null ? c.unlabelled > 0 : c.words.has(l);
              return (
                <View key={i} accessibilityLabel={`${bars[i].label}: ${l ?? 'no label'}, ${plural(w, 'word')}`}>
                  {cell(has ? formatNumber(w) : '', `c${i}`, has ? w / most : 0)}
                </View>
              );
            })}
            {cell(formatNumber(l === null ? dist.unlabelled : dist.totals.find((t) => t.label === l)!.words), 'all', 0, true)}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** The author's structural markers, in reading order, and a form to add one. None is required. */
function Markers({ model, placed }: { model: StoryModel; placed: readonly PlacedMarker[] }) {
  const plot = usePlot();
  const [kind, setKind] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [eventId, setEventId] = useState('');
  const [kinds, setKinds] = useState(false);
  const documents = flattenTree(buildTree([...model.nodes.values()])).filter((t) => t.node.kind === 'chapter' || t.node.kind === 'scene');
  const events = stableSorted(model.events.values(), (a, b) => localeCompare(a.name, b.name));
  const offered = [...new Set([...suggestedMarkers, ...placed.map((p) => p.marker.kind)])];
  const add = () => {
    if (dartTrim(kind).length === 0 || plot === null) return;
    const made = plot.now((c) =>
      markersIn(c, (m) => m.save(null, { kind, title, nodeId: nodeId.length === 0 ? null : nodeId, eventId: eventId.length === 0 ? null : eventId, note })),
    );
    // Kept on a refusal, so nothing typed is lost.
    if (made !== undefined) {
      setKind('');
      setTitle('');
      setNote('');
      setNodeId('');
      setEventId('');
    }
  };
  return (
    <View style={styles.gapSm}>
      {placed.length === 0 ? (
        <Muted>{words.noMarkers}</Muted>
      ) : (
        placed.map((p) => {
          const w = markerWords(model, p, (id) => nodeLabel(model, id));
          return (
            <View key={p.marker.id} style={styles.markerRow}>
              <Text style={{ color: colors.success, fontSize: 18 }}>⚑</Text>
              <View style={styles.flex}>
                <Text style={styles.cellTitle}>{w.title}</Text>
                <Muted>{w.subtitle}</Muted>
              </View>
              <IconButton icon="close" label={w.remove} onPress={() => plot?.now((c) => markersIn(c, (m) => m.removeMarker(p.marker.id)))} />
            </View>
          );
        })
      )}
      <Text style={styles.cellTitle}>{words.add}</Text>
      <View style={styles.field}>
        <Text style={styles.label}>{words.kind.toUpperCase()}</Text>
        <View style={styles.flexRow}>
          <TextInput
            value={kind}
            onChangeText={setKind}
            onSubmitEditing={add}
            placeholder={words.kindHint}
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            style={[styles.input, styles.flex]}
            accessibilityLabel={words.kind}
          />
          <IconButton icon="menu-down" label="Choose a kind of marker" onPress={() => setKinds(true)} />
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{words.ownWords.toUpperCase()}</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder={words.ownWordsHint} placeholderTextColor={colors.muted} selectionColor={colors.gold} style={styles.input} accessibilityLabel={words.ownWords} />
      </View>
      <ChooserField
        label={words.node}
        value={nodeId}
        choices={[{ value: '', label: words.notSaid }, ...documents.map((t) => ({ value: t.node.id, label: `${'  '.repeat(t.depth)}${t.node.title.length === 0 ? 'Untitled' : t.node.title}` }))]}
        onChoose={setNodeId}
      />
      {events.length > 0 && (
        <ChooserField label={words.event} value={eventId} choices={[{ value: '', label: words.notSaid }, ...events.map((e) => ({ value: e.id, label: e.name }))]} onChoose={setEventId} />
      )}
      <View style={styles.field}>
        <Text style={styles.label}>{words.note.toUpperCase()}</Text>
        <TextInput value={note} onChangeText={setNote} placeholder={words.noteHint} placeholderTextColor={colors.muted} selectionColor={colors.gold} style={styles.input} accessibilityLabel={words.note} />
      </View>
      <GoldButton label={words.addButton} icon="flag-plus-outline" disabled={dartTrim(kind).length === 0} onPress={add} style={styles.start} />
      <ActionSheet
        visible={kinds}
        title="Choose a kind of marker"
        onClose={() => setKinds(false)}
        actions={offered.map((k) => ({ label: k, icon: 'flag-outline', onPress: () => setKind(k) }))}
      />
    </View>
  );
}

/** A plain table that scrolls sideways. */
function Table({ headers, rows }: { headers: string[]; rows: (React.ReactNode | string)[][] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={[styles.flexRow, styles.tableHead]}>
          {headers.map((h) => (
            <Text key={h} style={[styles.tableCell, styles.label]}>
              {h}
            </Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={[styles.flexRow, styles.tableRow]}>
            {r.map((c, j) =>
              typeof c === 'string' ? (
                <Text key={j} style={[styles.tableCell, styles.body]}>
                  {c}
                </Text>
              ) : (
                <View key={j} style={styles.tableCell}>
                  {c}
                </View>
              ),
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexRow: { flexDirection: 'row', alignItems: 'center' },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.text, marginTop: space.md },
  cellTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, flexShrink: 1 },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: colors.muted },
  bold: { fontWeight: '700' },
  link: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline' },
  chosen: { backgroundColor: 'rgba(56, 189, 248, 0.14)' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 320 },
  gridCell: { width: 52, height: 32, alignItems: 'center', justifyContent: 'center' },
  gridText: { fontFamily: fonts.ui, fontSize: 11, color: colors.text },
  gridLabel: { width: 140, fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  markerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: { gap: 4 },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, paddingHorizontal: space.md, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  tableHead: { borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRow: { borderBottomWidth: 1, borderBottomColor: 'rgba(39, 46, 64, 0.6)', minHeight: 40 },
  tableCell: { width: 170, paddingHorizontal: space.sm, paddingVertical: 8 },
});
