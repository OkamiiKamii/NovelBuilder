// Visualize › Timeline (FEATURES.md #280–#281): the novel's events drawn along story time (dots, bars, rough edges,
// ongoing arrows), or listed; zoom from hours to millennia, move along time, jump to a date or show a stretch; split
// into tracks by any kind of record or plot thread, each shown, hidden, reordered, folded or shown alone; and any
// alternate history instead of the main timeline. Arranging and zooming only change how it looks: nothing here moves
// an event in time or writes anything. A port of flutter_app/lib/features/timeline/timeline_view_page.dart and
// widgets/timeline_chart.dart; what is drawn is src/domain/visualize/time/timelineView.ts.

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { type GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { EntityRef } from '../../domain/model/entityRef';
import type { StoryModel } from '../../domain/model/storyModel';
import type { Calendar } from '../../domain/records/calendar';
import { foldText } from '../../domain/text/fold';
import { type AxisMark, type MarkKind, domainOf, layoutAxis } from '../../domain/timeline/axis';
import { type EventRecord, eventRecords } from '../../domain/timeline/eventRecord';
import { historyStatusLabel, mainTimeline, withHistory } from '../../domain/timeline/histories';
import { atTheSameTime, togetherWords } from '../../domain/timeline/overlap';
import { type TimeWindow, panWindow, ticksFor, zoomWindow } from '../../domain/timeline/scale';
import { type TrackPrefs, arrange, decodeGrouping, groupings, moveTrack, toggleId, tracksFor } from '../../domain/timeline/tracks';
import {
  type ChartTrack,
  type MarkDrawing,
  type MarkShape,
  arrangeLabel,
  chartDrawing,
  chartHits,
  chartSemantics,
  chartSizes,
  hitAt,
  jumpTo,
  markWords,
  showRange,
  showingWords,
  timelineLegend,
  timelineSummary,
  timelineWords as words,
  trackRows,
  unplacedLines,
} from '../../domain/visualize/time/timelineView';
import { eventPath } from '../../domain/timeline/timelineService';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { useTimeline } from '../plan/useTimeline';
import { colors, fonts, sizeClassOf, space } from '../theme';
import { VizFrame, useVizFilter, useVizSelection } from './VizFrame';
import type { JsonMap } from '../../domain/json';
import { matchingKeys } from '../../domain/visualize/screens/frame';
import { SvgCanonBadge, useCanonMarks } from '../review/CanonMarks';

/** The events the shared filters keep, as record keys (`event:<id>`), or null when no filter is on. A name matches
 * when it holds the typed words (accents and case aside); a character is involved when they take part. */
/** The events the shared filters leave (by key, `event:<id>`), the same query every view uses (matchingKeys), run on
 * the model shown (an alternate history's, when one is chosen); null when nothing is filtered. */
export function eventKeys(model: StoryModel, filter: JsonMap): Set<string> | null {
  return matchingKeys(model, filter, ['event']);
}

export function TimelineView() {
  const tl = useTimeline();
  return (
    <VizFrame view="timeline" title={words.title} subtitle={tl?.data.cast.novelTitle}>
      <TimelineBody />
    </VizFrame>
  );
}

function TimelineBody() {
  const tl = useTimeline();
  const router = useRouter();
  const filters = useVizFilter();
  const { selected: selection, select: selectRef } = useVizSelection();
  const phone = sizeClassOf(useWindowDimensions().width) === 'compact';
  const [history, setHistory] = useState<string | null>(null);
  const [list, setList] = useState(false);
  const [grouping, setGrouping] = useState('none');
  const [prefs, setPrefs] = useState<TrackPrefs>({});
  const [chosenWindow, setChosenWindow] = useState<TimeWindow | null>(null);
  const [arranging, setArranging] = useState(false);
  const [goingTo, setGoingTo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [jump, setJump] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [width, setWidth] = useState(0);

  const data = tl?.data ?? null;
  const shownHistory = data !== null && history !== null && data.histories.has(history) ? history : null;
  const model = useMemo(
    () => (data === null ? null : shownHistory === null ? data.model : withHistory(data.model, data.histories, shownHistory)),
    [data, shownHistory],
  );
  const all = useMemo<EventRecord[]>(() => (data === null || model === null ? [] : shownHistory === null ? data.records : eventRecords(model)), [data, model, shownHistory]);
  if (tl === null || data === null || model === null) return null;

  const cal = data.calendar;
  const keep = eventKeys(model, filters);
  const records = all.filter((r) => keep === null || keep.has(`event:${r.id}`));
  const select = (id: string | null) => selectRef(id === null ? null : new EntityRef('event', id));
  const selectedId = selection?.type === 'event' ? selection.id : null;
  const g = decodeGrouping(grouping);
  const tracks = tracksFor(model, records, g);
  const arranged = arrange(tracks, prefs);
  const byId = new Map(records.map((r) => [r.id, r]));
  const domain = domainOf(records, { day: cal.minutesPerDay, year: cal.minutesPerYear });
  const fit: TimeWindow | null = domain === null ? null : { from: domain.from, to: domain.to };
  const window = chosenWindow ?? fit;
  const selected = selectedId === null ? null : (byId.get(selectedId) ?? null);
  const dated = records.filter((r) => r.bounds !== null).length;
  const setWindow = (w: TimeWindow | null) => {
    setChosenWindow(w);
    setMessage(null);
  };
  const ways = groupings(model);
  const said = (r: { window: TimeWindow } | { message: string }) => ('window' in r ? setWindow(r.window) : setMessage(r.message));
  const openEvent = (id: string) => router.navigate(eventPath(id) as never);

  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <Chip label={words.drawing} icon="chart-timeline" selected={!list} onPress={() => setList(false)} />
        <Chip label={words.list} icon="format-list-bulleted" selected={list} onPress={() => setList(true)} />
      </View>
      {data.historyList.length > 0 && (
        <ChooserField
          label={words.shown}
          value={shownHistory ?? ''}
          choices={[{ value: '', label: `${mainTimeline} (canon)` }, ...data.historyList.map((h) => ({ value: h.id, label: `${h.name} (${historyStatusLabel(h.status)})` }))]}
          onChoose={(v) => {
            setHistory(v.length === 0 ? null : v);
            setChosenWindow(null);
          }}
        />
      )}
      <ChooserField
        label={words.tracksBy}
        value={ways.some((w) => w.value === grouping) ? grouping : 'none'}
        choices={ways}
        onChoose={(v) => {
          setGrouping(v);
          setPrefs({});
        }}
      />
      {g.kind !== 'none' && tracks.length > 0 && (
        <TrackPanel tracks={tracks} arranged={arranged} prefs={prefs} open={arranging} onOpen={setArranging} onPrefs={setPrefs} />
      )}
      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {timelineSummary({ dated, grouping: g, shown: arranged.shown.length, filtered: keep !== null, matching: records.length, all: all.length })}
      </Text>

      {all.length === 0 ? (
        <Panel style={styles.empty}>
          <Icon name="chart-timeline" size={36} />
          <Text style={styles.emptyTitle}>{words.emptyTitle}</Text>
          <Muted style={styles.centre}>{words.emptyMessage}</Muted>
          <GoldButton
            label={words.addEvent}
            icon="plus"
            onPress={() => {
              const id = tl.now((x) => x.createEvent());
              if (id !== undefined) select(id);
            }}
          />
        </Panel>
      ) : records.length === 0 ? (
        <Muted>No events match the filters.</Muted>
      ) : arranged.shown.length === 0 ? (
        <View style={styles.gapSm}>
          <Text style={styles.body}>{words.allHidden}</Text>
          <OutlineButton label={words.showAll} compact onPress={() => setPrefs({})} style={styles.start} />
        </View>
      ) : list ? (
        <View style={styles.gapSm}>
          {arranged.shown.map((t) => (
            <View key={t.id} style={styles.gapXs}>
              <Text style={styles.trackTitle} accessibilityRole="header">
                {t.label}
              </Text>
              {t.folded ? (
                <Muted>{words.folded(t.eventIds.length)}</Muted>
              ) : (
                trackRows(t, byId).map((r) => (
                  <Pressable
                    key={`${t.id}:${r.id}`}
                    accessibilityRole="button"
                    onPress={() => select(r.id)}
                    style={({ pressed }) => [styles.listRow, (pressed || r.id === selectedId) && styles.listRowOn]}
                  >
                    <Text style={styles.rowTitle}>{r.title}</Text>
                    <Muted>{r.subtitle}</Muted>
                  </Pressable>
                ))
              )}
            </View>
          ))}
        </View>
      ) : window !== null && fit !== null ? (
        <View style={styles.gapSm}>
          <View style={styles.row}>
            <IconButton icon="magnify-plus-outline" label={words.zoomIn} onPress={() => setWindow(zoomWindow(window, 1.5, (window.from + window.to) / 2, fit))} />
            <IconButton icon="magnify-minus-outline" label={words.zoomOut} onPress={() => setWindow(zoomWindow(window, 1 / 1.5, (window.from + window.to) / 2, fit))} />
            <IconButton icon="chevron-left" label={words.back} onPress={() => setWindow(panWindow(window, -0.25))} />
            <IconButton icon="chevron-right" label={words.on} onPress={() => setWindow(panWindow(window, 0.25))} />
            <OutlineButton label={words.fit} icon="fit-to-screen-outline" compact tone="muted" onPress={() => setWindow(null)} />
            <Muted>{showingWords(window, cal)}</Muted>
          </View>
          {phone && <OutlineButton label={goingTo ? words.hide : words.goTo} icon={goingTo ? 'chevron-up' : 'calendar'} compact tone="muted" onPress={() => setGoingTo(!goingTo)} style={styles.start} />}
          {(!phone || goingTo) && (
            <View style={styles.row}>
              <Field label={words.jump} hint={words.jumpHint} value={jump} onChange={setJump} onSubmit={() => said(jumpTo(jump, cal, true))} wide={!phone} />
              <OutlineButton label={words.go} compact onPress={() => said(jumpTo(jump, cal, true))} />
              <Field label={words.from} value={from} onChange={setFrom} onSubmit={() => said(showRange(from, until, cal))} />
              <Field label={words.until} value={until} onChange={setUntil} onSubmit={() => said(showRange(from, until, cal))} />
              <OutlineButton label={words.show} compact onPress={() => said(showRange(from, until, cal))} />
            </View>
          )}
          {message !== null && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {message}
            </Text>
          )}
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {width > 0 && (
              <Chart
                records={byId}
                shown={arranged.shown.map((t) => t)}
                domain={domain}
                cal={cal}
                window={window}
                width={width}
                selected={selectedId}
                onSelect={select}
              />
            )}
          </View>
          <Legend />
        </View>
      ) : null}

      {selected !== null && (
        <SelectionPanel
          all={all}
          model={model}
          record={selected}
          day={cal.minutesPerDay}
          inHistory={shownHistory !== null}
          onOpen={() => (shownHistory === null || data.model.events.has(selected.id) ? openEvent(selected.id) : router.navigate(`/plan/histories?history=${shownHistory}` as never))}
          historyOnly={shownHistory !== null && !data.model.events.has(selected.id)}
        />
      )}
      <Unplaced
        records={arranged.shown.flatMap((t) => t.eventIds.map((id) => byId.get(id)).filter((r): r is EventRecord => r !== undefined && r.bounds === null))}
        onSelect={select}
      />
    </View>
  );
}

function Field({ label, hint, value, onChange, onSubmit, wide = false }: { label: string; hint?: string; value: string; onChange: (v: string) => void; onSubmit: () => void; wide?: boolean }) {
  return (
    <View style={{ width: wide ? 200 : 140 }}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={hint}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        returnKeyType="go"
        accessibilityLabel={label}
        style={styles.input}
      />
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------ the drawing

/** At least this wide on a phone, so names have room; the drawing then scrolls sideways. */
const leastWidth = 640;

function Chart({
  records,
  shown,
  domain,
  cal,
  window,
  width: available,
  selected,
  onSelect,
}: {
  records: ReadonlyMap<string, EventRecord>;
  shown: ReturnType<typeof arrange>['shown'];
  domain: ReturnType<typeof domainOf>;
  cal: Calendar;
  window: TimeWindow;
  width: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const width = Math.max(available, leastWidth);
  // Rows are worked out once, for the whole story at this width, so zooming never moves a mark to another row; every
  // track is laid out against the same stretch of time.
  const tracks = useMemo<ChartTrack[]>(
    () =>
      shown.map((t) => ({
        track: t,
        axis: layoutAxis(
          t.eventIds.map((id) => records.get(id)).filter((r): r is EventRecord => r !== undefined),
          { width, domain, useDomain: true, day: cal.minutesPerDay, year: cal.minutesPerYear },
        ),
      })),
    [shown, records, width, domain, cal],
  );
  const drawing = chartDrawing(tracks, window, width, selected);
  const hits = chartHits(tracks, window, width);
  const ticks = ticksFor(window, width, cal);
  const marks = new Map<string, AxisMark>();
  for (const t of tracks) for (const m of t.axis.marks) marks.set(m.id, m);
  const tap = (e: GestureResponderEvent) => onSelect(hitAt(hits, e.nativeEvent.locationX, e.nativeEvent.locationY));
  // Canon and continuity badges, when the marks are on: before each mark, as the Flutter chart paints them.
  const canonMarks = useCanonMarks();
  return (
    <View style={styles.frame}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <Pressable onPress={tap} accessible accessibilityLabel={chartSemantics} style={{ width, height: drawing.height }}>
          <Svg width={width} height={drawing.height}>
            {ticks.map((tick, i) => {
              const x = ((tick.t - window.from) / (window.to - window.from)) * width;
              return (
                <G key={`tick${i}`}>
                  <Line x1={x} y1={chartSizes.ticks - 6} x2={x} y2={drawing.height} stroke={colors.border} strokeWidth={1} />
                  <SvgText x={x + 3} y={16} fontFamily={fonts.ui} fontSize={11} fill={colors.muted}>
                    {tick.label}
                  </SvgText>
                </G>
              );
            })}
            {drawing.bands.map((b, i) => (
              <G key={`band${i}`}>
                <Line x1={0} y1={b.top} x2={width} y2={b.top} stroke={colors.muted} strokeOpacity={0.5} strokeWidth={1} />
                <SvgText x={4} y={b.top + 19} fontFamily={fonts.ui} fontWeight="700" fontSize={13} fill={colors.text}>
                  {b.heading}
                </SvgText>
                {b.marks.map((m) => (
                  <MarkView key={m.id} m={m} width={width} />
                ))}
              </G>
            ))}
            {canonMarks !== null &&
              hits.map((h, i) => {
                const centre = h.rect.top - 2 + chartSizes.lane / 2 + (h.mark.kind === 'lasting' || h.mark.kind === 'ongoing' ? 8 : 0);
                return <SvgCanonBadge key={`badge${i}`} mark={canonMarks.get(`event:${h.mark.id}`)} x={h.rect.left + 6 - 8} y={centre - 8} anchorRight />;
              })}
          </Svg>
        </Pressable>
      </ScrollView>
      {/* Every mark as a button too, for screen readers (the drawing is one image to them). */}
      <View style={styles.hidden} accessibilityElementsHidden={false}>
        {hits.map((h, i) => (
          <Pressable key={`${h.mark.id}:${i}`} accessibilityRole="button" accessibilityLabel={`${markWords(h.mark)}, on the ${h.track} track`} accessibilityState={{ selected: h.mark.id === selected }} onPress={() => onSelect(h.mark.id)} />
        ))}
      </View>
    </View>
  );
}

function clipLine(l: { x1: number; y1: number; x2: number; y2: number }, left: number, right: number) {
  const dx = l.x2 - l.x1;
  if (dx === 0) return l.x1 >= left && l.x1 <= right ? l : null;
  const s0 = Math.max(0, (left - l.x1) / dx);
  const s1 = Math.min(1, (right - l.x1) / dx);
  if (s1 <= s0) return null;
  return { x1: l.x1 + s0 * dx, y1: l.y1 + s0 * (l.y2 - l.y1), x2: l.x1 + s1 * dx, y2: l.y1 + s1 * (l.y2 - l.y1) };
}

/** A name, cut to its room with "…" (about 6.6 per letter at 12). */
function fitted(text: string, maxWidth: number): string {
  const most = Math.max(1, Math.floor(maxWidth / 6.6));
  return text.length <= most ? text : `${text.slice(0, most - 1)}…`;
}

function MarkView({ m, width }: { m: MarkDrawing; width: number }) {
  const accent = colors.gold;
  const ring = { stroke: colors.text, strokeWidth: 3, fill: 'none' };
  const gradient = `fade-${m.id.replace(/[^a-zA-Z0-9]/g, '')}`;
  const shape = (s: MarkShape, i: number) => {
    switch (s.kind) {
      case 'circle':
        return s.paint === 'fill' ? <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={accent} /> : <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...ring} />;
      case 'rrect': {
        const box = { x: s.left, y: s.top, width: Math.max(0, s.right - s.left), height: s.bottom - s.top, rx: s.radius };
        if (s.paint === 'fill') return <Rect key={i} {...box} fill={accent} />;
        if (s.paint === 'tint') return <Rect key={i} {...box} fill={accent} fillOpacity={0.18} />;
        if (s.paint === 'dashed') return <Rect key={i} {...box} fill="none" stroke={accent} strokeWidth={1.5} strokeDasharray="4 4" />;
        return <Rect key={i} {...box} {...ring} />;
      }
      case 'hatch':
        return (
          <G key={i}>
            <Rect x={s.left} y={s.top} width={s.right - s.left} height={s.bottom - s.top} fill={accent} fillOpacity={0.2} />
            {s.lines.map((l, k) => {
              const c = clipLine(l, s.left, s.right);
              return c === null ? null : <Line key={k} {...c} stroke={accent} strokeWidth={1.2} />;
            })}
          </G>
        );
      case 'arrow':
        return <Path key={i} d={`M${s.points.map((p) => p.join(' ')).join(' L')} Z`} fill={accent} />;
      case 'fade':
        return (
          <G key={i}>
            <Defs>
              <LinearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={accent} stopOpacity={1} />
                <Stop offset="1" stopColor={accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={s.left} y={s.top} width={s.right - s.left} height={s.bottom - s.top} fill={`url(#${gradient})`} />
          </G>
        );
      case 'question':
        return (
          <SvgText key={i} x={s.x} y={s.y + 14} fontFamily={fonts.ui} fontWeight="700" fontSize={14} fill={accent}>
            ?
          </SvgText>
        );
    }
  };
  const l = m.label;
  const room = Math.min(l.maxWidth, Math.max(10, width - l.x - 2));
  return (
    <G>
      {m.shapes.map(shape)}
      <SvgText
        x={l.x}
        y={l.above ? l.y - 3 : l.y + 4}
        fontFamily={fonts.ui}
        fontWeight={l.bold ? '700' : '400'}
        fontSize={12}
        fill={colors.text}
      >
        {fitted(l.text, room)}
      </SvgText>
    </G>
  );
}

function Swatch({ kind }: { kind: MarkKind }) {
  const accent = colors.gold;
  const y = 8;
  return (
    <Svg width={40} height={16}>
      {kind === 'moment' && <Circle cx={20} cy={y} r={5} fill={accent} />}
      {kind === 'uncertain' && (
        <>
          <Rect x={2} y={y - 5} width={36} height={10} rx={5} fill={accent} fillOpacity={0.2} />
          <Circle cx={20} cy={y} r={3.5} fill={accent} />
        </>
      )}
      {kind === 'lasting' && <Rect x={2} y={y - 5} width={36} height={10} fill={accent} />}
      {kind === 'ongoing' && (
        <>
          <Rect x={2} y={y - 5} width={28} height={10} fill={accent} />
          <Path d={`M30 ${y - 7} L40 ${y} L30 ${y + 7} Z`} fill={accent} />
        </>
      )}
      {kind === 'unended' && (
        <>
          <Defs>
            <LinearGradient id="swatchFade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={accent} stopOpacity={1} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={2} y={y - 5} width={36} height={10} fill="url(#swatchFade)" />
        </>
      )}
    </Svg>
  );
}

function Legend() {
  return (
    <View style={styles.legend}>
      {timelineLegend.map((item) => (
        <View key={item.kind} style={styles.legendItem}>
          <Swatch kind={item.kind} />
          <Text style={styles.small}>{item.words}</Text>
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ around the drawing

function TrackPanel({
  tracks,
  arranged,
  prefs,
  open,
  onOpen,
  onPrefs,
}: {
  tracks: ReturnType<typeof tracksFor>;
  arranged: ReturnType<typeof arrange>;
  prefs: TrackPrefs;
  open: boolean;
  onOpen: (v: boolean) => void;
  onPrefs: (p: TrackPrefs) => void;
}) {
  const order = [...arranged.shown.map((t) => t.id), ...arranged.hidden.map((t) => t.id)];
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const hidden = prefs.hidden ?? [];
  const folded = prefs.folded ?? [];
  return (
    <View style={styles.gapXs}>
      {arranged.focused !== null && (
        <View style={styles.row}>
          <Text style={styles.body}>{words.showingOnly(arranged.focused.label)}</Text>
          <OutlineButton label={words.showAll} compact tone="muted" onPress={() => onPrefs({ ...prefs, focus: null })} />
        </View>
      )}
      <OutlineButton label={arrangeLabel(arranged.shown.length, tracks.length)} icon={open ? 'chevron-up' : 'tune-variant'} compact tone="muted" onPress={() => onOpen(!open)} style={styles.start} />
      {open &&
        order.map((id, i) => {
          const t = byId.get(id);
          if (t === undefined) return null;
          const on = !hidden.includes(id);
          return (
            <View key={id} style={styles.trackRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${t.label}, ${t.eventIds.length} ${t.eventIds.length === 1 ? 'event' : 'events'}`}
                onPress={() => onPrefs({ ...prefs, hidden: toggleId(hidden, id) })}
                style={styles.check}
              >
                <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={on ? colors.gold : colors.muted} />
                <Text style={styles.body} numberOfLines={1}>{`${t.label} (${t.eventIds.length})`}</Text>
              </Pressable>
              <IconButton icon="arrow-up" label={`Move ${t.label} up`} onPress={() => i > 0 && onPrefs({ ...prefs, order: moveTrack(order, id, -1) })} color={i === 0 ? colors.border : colors.text} />
              <IconButton icon="arrow-down" label={`Move ${t.label} down`} onPress={() => i < order.length - 1 && onPrefs({ ...prefs, order: moveTrack(order, id, 1) })} color={i === order.length - 1 ? colors.border : colors.text} />
              <Chip label={words.fold} selected={folded.includes(id)} onPress={() => onPrefs({ ...prefs, folded: toggleId(folded, id) })} />
              <Chip label={words.onlyThis} selected={prefs.focus === id} onPress={() => onPrefs({ ...prefs, focus: prefs.focus === id ? null : id })} />
            </View>
          );
        })}
    </View>
  );
}

function SelectionPanel({
  all,
  model,
  record,
  day,
  inHistory,
  historyOnly,
  onOpen,
}: {
  all: readonly EventRecord[];
  model: StoryModel;
  record: EventRecord;
  day: number;
  inHistory: boolean;
  historyOnly: boolean;
  onOpen: () => void;
}) {
  const same = atTheSameTime(all, record.id, day);
  const place = record.event.locationId === null ? null : (model.entries.get(record.event.locationId)?.name ?? null);
  return (
    <Panel style={styles.gapXs}>
      <Text style={styles.rowTitle}>{record.title === '' ? 'Untitled event' : record.title}</Text>
      <Muted>{record.bounds === null ? words.notPlaced : record.label}</Muted>
      {place !== null && <Text style={styles.body}>At {place}</Text>}
      {record.event.characters.length > 0 && (
        <Text style={styles.body}>With {record.event.characters.map((c) => model.entries.get(c.id)?.name ?? 'someone deleted').join(', ')}</Text>
      )}
      {same.length > 0 && (
        <View style={styles.gapXs}>
          <Text style={styles.trackTitle}>{words.sameTime}</Text>
          {same.map((x) => {
            const p = x.record.event.locationId === null ? null : model.entries.get(x.record.event.locationId)?.name;
            return <Text key={x.record.id} style={styles.body}>{[x.record.title, togetherWords[x.how], ...(p ? [`at ${p}`] : [])].join(' · ')}</Text>;
          })}
        </View>
      )}
      {inHistory && historyOnly ? (
        <OutlineButton label={words.inHistory} compact onPress={onOpen} style={styles.start} />
      ) : (
        <GoldButton label={inHistory ? words.edit : 'Open the event'} icon="pencil-outline" compact onPress={onOpen} style={styles.start} />
      )}
    </Panel>
  );
}

function Unplaced({ records, onSelect }: { records: EventRecord[]; onSelect: (id: string) => void }) {
  const lines = unplacedLines(layoutAxis(records).unplaced);
  if (lines.length === 0) return null;
  return (
    <Panel style={styles.gapXs}>
      <Text style={styles.trackTitle}>{words.unplaced(lines.length)}</Text>
      {lines.map((u) => (
        <Pressable key={u.id} accessibilityRole="button" onPress={() => onSelect(u.id)} style={styles.link}>
          <Text style={styles.linkText}>{u.text}</Text>
        </Pressable>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
  centre: { textAlign: 'center' },
  body: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  small: { flexShrink: 1, fontFamily: fonts.ui, fontSize: 12.5, color: colors.muted },
  summary: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  error: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger },
  empty: { alignItems: 'center', gap: space.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  trackTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text, marginTop: space.xs },
  rowTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  listRow: { paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: 8, gap: 2 },
  listRowOn: { backgroundColor: colors.elevated },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.2, color: colors.gold, marginBottom: 4 },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.sm, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  frame: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  hidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  legend: { gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trackRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, flexShrink: 1 },
  link: { paddingVertical: 6 },
  linkText: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold },
});
