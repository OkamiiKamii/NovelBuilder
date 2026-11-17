// Visualize › Charts (FEATURES.md #290): counts and distributions of what the author records — words per chapter and
// scene, how long chapters are, character appearances, plot-thread presence, events over story time, points of view and
// the author's own scene categories. One set of filters scopes every chart; each says what it uses and what it leaves
// out, and is a table and a CSV file as well. Nothing is judged. A port of
// flutter_app/lib/features/progress/charts_page.dart; the logic is src/domain/analytics/charts.ts.

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { shareTextFile } from '../../data/files';
import { type Chart, type ChartBar, ChartFilter, analyticsCharts, fileSlug, grouped, toCsv } from '../../domain/analytics/charts';
import { localeCompare } from '../../domain/exchange/collation';
import { type JsonMap, mapOrNull, str } from '../../domain/json';
import { stableSorted } from '../../domain/reader/stableSort';
import { dartToLowerCase } from '../../domain/text/dartString';
import { Chip, Icon, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { type OpenCast, useCast } from '../organize/useCast';
import { ChooserField } from '../organize/parts';
import { VizFrame, useVizSelection } from './VizFrame';

export function ChartsView() {
  const open = useCast();
  const [list, setList] = useState(false);
  const [layout, setLayout] = useState<JsonMap>({});
  return (
    <VizFrame
      view="charts"
      title="Charts"
      subtitle={open?.cast.novelTitle}
      filters={false}
      config={() => ({ mode: list ? 'list' : 'visual', layout })}
      onApply={(c) => {
        setList(c['mode'] === 'list');
        setLayout({ ...(mapOrNull(c['layout']) ?? {}) });
      }}
    >
      {open !== null && <Charts open={open} list={list} setList={setList} layout={layout} setLayout={setLayout} />}
    </VizFrame>
  );
}

function Charts({ open, list, setList, layout, setLayout }: { open: OpenCast; list: boolean; setList: (v: boolean) => void; layout: JsonMap; setLayout: (l: JsonMap) => void }) {
  const model = open.cast.model;
  const set = (changes: JsonMap) => {
    const next = { ...layout };
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '' || v === undefined) delete next[k];
      else next[k] = v;
    }
    setLayout(next);
  };
  const filter = ChartFilter.of(layout, model);
  const filterKey = JSON.stringify(filter.toLayout());
  const charts = useMemo(() => analyticsCharts(model, filter), [model, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const chapters = model.order.chapters;
  const characters = stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'character'),
    (a, b) => localeCompare(a.name, b.name),
  );
  const threads = stableSorted(model.threads.values(), (a, b) => localeCompare(a.title, b.title));
  const spelled = new Map<string, string>();
  for (const p of model.plans.values()) for (const l of p.labels) spelled.set(dartToLowerCase(l), l);
  const labels = stableSorted(spelled.values(), localeCompare);
  const chapterChoices = chapters.map((c, i) => ({ value: c.id, label: `${i + 1}. ${c.title.trim().length === 0 ? 'Untitled chapter' : c.title}` }));
  const menu = (label: string, value: string | null, none: string, options: { value: string; label: string }[], key: string) => (
    <ChooserField key={key} label={label} value={value ?? ''} choices={[{ value: '', label: none }, ...options]} onChoose={(v) => set({ [key]: v })} />
  );
  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <Chip label="Charts" selected={!list} onPress={() => setList(false)} />
        <Chip label="List" selected={list} onPress={() => setList(true)} />
      </View>
      <Panel style={styles.gapSm}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Which part of the novel
        </Text>
        {menu('From chapter', filter.from, 'The first', chapterChoices, 'cfrom')}
        {menu('To chapter', filter.to, 'The last', chapterChoices, 'cto')}
        {menu('Plot thread', filter.threadId, 'Any, or none', threads.map((t) => ({ value: t.id, label: t.title })), 'cthread')}
        {menu('Point of view', filter.povId, 'Anyone’s, or none recorded', characters.map((c) => ({ value: c.id, label: c.name })), 'cpov')}
        {menu(
          'Scene category',
          labels.find((l) => dartToLowerCase(l) === dartToLowerCase(filter.label ?? '')) ?? null,
          'Any, or none',
          labels.map((l) => ({ value: l, label: l })),
          'clabel',
        )}
        <View style={styles.row}>
          <YearField label="Story years from" value={str(layout['cyfrom'])} onChange={(v) => set({ cyfrom: v.trim() })} />
          <YearField label="Story years to" value={str(layout['cyto'])} onChange={(v) => set({ cyto: v.trim() })} />
        </View>
        {filter.filtered && (
          <OutlineButton
            label="Clear filters"
            compact
            tone="muted"
            onPress={() => set({ cfrom: null, cto: null, cthread: null, cpov: null, clabel: null, cyfrom: null, cyto: null })}
            style={styles.start}
          />
        )}
      </Panel>
      {charts.map((chart) => (
        <ChartCard key={chart.key} open={open} chart={chart} list={list} layout={layout} set={set} />
      ))}
    </View>
  );
}

function YearField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.year}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^-\d]/g, '').replace(/(?!^)-/g, ''))}
        keyboardType="numbers-and-punctuation"
        placeholder="Any"
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

function ChartCard({ open, chart, list, layout, set }: { open: OpenCast; chart: Chart; list: boolean; layout: JsonMap; set: (c: JsonMap) => void }) {
  const toast = useToast();
  const { selected, select } = useVizSelection();
  const [table, setTable] = useState(false);
  const words = (n: number) => `${grouped(n)} ${n === 1 ? chart.units[0] : chart.units[1]}`;
  const selectedKey = chart.bars.find((b) => b.ref !== null && b.ref.id === selected?.id)?.key ?? null;
  const onSelect = (b: ChartBar) => {
    if (b.ref !== null) select(b.ref);
  };
  const download = async () => {
    try {
      // A byte-order mark, so a spreadsheet reads names in any script.
      const name = `${fileSlug(str(open.cast.snapshot.project['title'])).toLowerCase()}-${chart.key}.csv`;
      await shareTextFile(name, `﻿${toCsv(chart.columns, chart.rows)}`, 'text/csv');
    } catch (e) {
      toast(`The data was not saved: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
  };
  return (
    <Panel style={styles.gapSm}>
      <Text style={styles.chartTitle} accessibilityRole="header">
        {chart.title}
      </Text>
      {chart.key === 'words' && (
        <ChooserField
          label="Bars for"
          value={layout['cgrain'] === 'scenes' ? 'scenes' : 'chapters'}
          choices={[
            { value: 'chapters', label: 'Each chapter' },
            { value: 'scenes', label: 'Each chapter and scene' },
          ]}
          onChoose={(v) => set({ cgrain: v === 'scenes' ? 'scenes' : null })}
        />
      )}
      {chart.key === 'appearances' && (
        <ChooserField
          label="Counted from"
          value={layout['ccount'] === 'page' ? 'page' : 'any'}
          choices={[
            { value: 'any', label: 'Any record of them' },
            { value: 'page', label: 'Appearance records: on the page' },
          ]}
          onChoose={(v) => set({ ccount: v === 'page' ? 'page' : null })}
        />
      )}
      <Text style={styles.uses}>
        <Text style={styles.bold}>Uses: </Text>
        {chart.uses}
      </Text>
      {chart.empty !== null ? (
        <View style={styles.emptyChart}>
          <Icon name="chart-bar" size={30} color={colors.muted} />
          <Text style={styles.emptyTitle}>Nothing to chart yet</Text>
          <Muted style={styles.center}>{chart.empty}</Muted>
        </View>
      ) : !list ? (
        <>
          {chart.shape === 'columns' ? (
            <ColumnChart chart={chart} words={words} selectedKey={selectedKey} onSelect={onSelect} />
          ) : (
            <BarList chart={chart} words={words} selectedKey={selectedKey} onSelect={onSelect} />
          )}
          <Text style={styles.summary}>{chart.summary}</Text>
          <OutlineButton label={table ? 'Hide the table' : 'Show as a table'} icon="table" compact tone="muted" onPress={() => setTable(!table)} style={styles.start} />
          {table && <NumbersTable chart={chart} />}
        </>
      ) : (
        <>
          <Text style={styles.summary}>{chart.summary}</Text>
          <NumbersTable chart={chart} />
        </>
      )}
      {chart.notes.map((n) => (
        <Muted key={n}>{n}</Muted>
      ))}
      {chart.empty === null && (
        <OutlineButton
          label="Download the data (CSV)"
          icon="download-outline"
          compact
          onPress={() => void download()}
          accessibilityLabel={`Download the data of “${chart.title}” as a CSV file`}
          style={styles.start}
        />
      )}
    </Panel>
  );
}

/** Bars along the story: one column a chapter (or band of years), its short name under every few, the selected one
 * outlined. A press on a column that is a record selects it. */
function ColumnChart({ chart, words, selectedKey, onSelect }: { chart: Chart; words: (n: number) => string; selectedKey: string | null; onSelect: (b: ChartBar) => void }) {
  // The room the chart really has (its panel's padding included), measured; the window less a guess cut the last bar.
  const [room, setRoom] = useState(0);
  const bars = chart.bars;
  const most = Math.max(1, ...bars.map((b) => b.value));
  const height = 180;
  const left = 44;
  const slot = Math.max(14, Math.min(48, (room - left - 8) / Math.max(1, bars.length)));
  const inner = slot * bars.length;
  const every = Math.max(1, Math.ceil(bars.length / 16));
  const [shown, setShown] = useState<ChartBar | null>(null);
  return (
    <View accessibilityLabel={`${chart.title}. ${chart.summary}`} onLayout={(e) => setRoom(e.nativeEvent.layout.width)}>
      {room > 0 && (
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: left + inner + 8 }}>
          <Svg width={left + inner + 8} height={height + 22}>
            {[0, 0.5, 1].map((f) => (
              <Line key={f} x1={left} y1={height - f * height + 2} x2={left + inner} y2={height - f * height + 2} stroke={colors.border} strokeWidth={1} />
            ))}
            <SvgText x={left - 6} y={8} fontSize={10} fill={colors.muted} textAnchor="end">
              {grouped(most)}
            </SvgText>
            <SvgText x={left - 6} y={height + 4} fontSize={10} fill={colors.muted} textAnchor="end">
              0
            </SvgText>
            {bars.map((b, i) => {
              const h = (b.value / most) * height;
              const on = b.key === selectedKey;
              return (
                <Rect
                  key={b.key}
                  x={left + i * slot + 2}
                  y={height - h + 2}
                  width={slot - 4}
                  height={Math.max(h, b.value > 0 ? 1 : 0)}
                  rx={2}
                  fill={on ? colors.gold : 'rgba(243, 182, 58, 0.55)'}
                  stroke={on ? colors.text : 'none'}
                  strokeWidth={on ? 1.5 : 0}
                />
              );
            })}
            {bars.map((b, i) =>
              i % every === 0 ? (
                <SvgText key={`l-${b.key}`} x={left + i * slot + slot / 2} y={height + 16} fontSize={10} fill={colors.muted} textAnchor="middle">
                  {b.short}
                </SvgText>
              ) : null,
            )}
          </Svg>
          <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', paddingLeft: left }]}>
            {bars.map((b) => (
              <Pressable
                key={b.key}
                accessibilityRole="button"
                accessibilityLabel={`${b.label}: ${words(b.value)}. ${b.detail}`}
                onPress={() => {
                  setShown(b);
                  onSelect(b);
                }}
                style={{ width: slot, height: height + 22 }}
              />
            ))}
          </View>
        </View>
      </ScrollView>
      )}
      {shown !== null && (
        <Text style={styles.tip}>
          <Text style={styles.bold}>{shown.label}: </Text>
          {`${words(shown.value)} · ${shown.detail}`}
        </Text>
      )}
    </View>
  );
}

/** Bars for things with names: a row each, its name, a bar to scale and its number. */
function BarList({ chart, words, selectedKey, onSelect }: { chart: Chart; words: (n: number) => string; selectedKey: string | null; onSelect: (b: ChartBar) => void }) {
  const most = Math.max(1, ...chart.bars.map((b) => b.value));
  return (
    <View style={styles.gapXs} accessibilityLabel={`${chart.title}. ${chart.summary}`}>
      {chart.bars.map((b) => {
        const on = b.key === selectedKey;
        return (
          <Pressable
            key={b.key}
            accessibilityRole={b.ref !== null ? 'button' : undefined}
            accessibilityLabel={`${b.label}: ${words(b.value)}. ${b.detail}`}
            disabled={b.ref === null}
            onPress={() => onSelect(b)}
            style={[styles.barRow, on && styles.barOn]}
          >
            <Text style={styles.barName} numberOfLines={1}>
              {b.short}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(b.value / most) * 100}%` }, on && { backgroundColor: colors.gold }]} />
            </View>
            <Text style={styles.barValue}>{grouped(b.value)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NumbersTable({ chart }: { chart: Chart }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={`${chart.title}, as a table`}>
      <View style={styles.table}>
        <View style={[styles.tr, styles.th]}>
          {chart.columns.map((c, i) => (
            <Text key={c} style={[styles.td, styles.thText, i > 0 && styles.num]}>
              {c}
            </Text>
          ))}
        </View>
        {chart.rows.map((r, i) => (
          <View key={i} style={styles.tr}>
            {r.map((cell, j) => (
              <Text key={j} style={[styles.td, typeof cell === 'number' && styles.num]} numberOfLines={3}>
                {typeof cell === 'number' ? grouped(cell) : cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  start: { alignSelf: 'flex-start' },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  sectionTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  chartTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  uses: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 19, color: colors.muted },
  summary: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.text },
  tip: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 19, color: colors.text, marginTop: 4 },
  year: { flexGrow: 1, minWidth: 140, gap: 4 },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.gold },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.md, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  emptyChart: { alignItems: 'center', gap: space.xs, paddingVertical: space.md },
  emptyTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.text },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 34, paddingHorizontal: 4, borderRadius: 6 },
  barOn: { backgroundColor: 'rgba(243, 182, 58, 0.12)' },
  barName: { width: 110, fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.elevated, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: 'rgba(243, 182, 58, 0.6)' },
  barValue: { width: 54, textAlign: 'right', fontFamily: fonts.numbers, fontSize: 12, color: colors.text },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { backgroundColor: colors.elevated },
  td: { width: 140, padding: 8, fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  thText: { fontWeight: '700', color: colors.gold },
  num: { width: 96, textAlign: 'right' },
});
