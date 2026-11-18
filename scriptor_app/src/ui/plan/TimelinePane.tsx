// PLAN › TIMELINE (FEATURES.md #265–#267): every event in the order it happens in the story, never the order of the
// chapters. A line of time runs down the page with each year a mark on it and each event hanging from it by a node
// sized by its importance; a jump of years is said on the line; events not yet placed follow on a broken line. Filters
// narrow it; a character's life path shows their age at each event. An empty timeline in a novel with chapters offers
// to make one event per chapter. A port of flutter_app/lib/features/timeline/timeline_page.dart and
// widgets/{chronicle,chapter_seed}.dart; the logic is src/domain/timeline/screens/{timelinePage,chronicle}.ts.

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import type { LifeStep } from '../../domain/timeline/ages';
import type { Placed } from '../../domain/timeline/chronology';
import { chronicleRows, chronicleWide, type ChronicleRow, lineOf, narrowGutter, wideGutter } from '../../domain/timeline/screens/chronicle';
import {
  chapterSeed,
  eventCard,
  filterChoices,
  filtersButton,
  firstOf,
  newEvent,
  noFilters,
  seededMessage,
  type TimelineFilters,
  timelineView,
} from '../../domain/timeline/screens/timelinePage';
import { eventPath } from '../../domain/timeline/timelineService';
import { GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { type OpenTimeline, useTimeline } from './useTimeline';

/** How many events are drawn at first; more a press at a time (the Flutter chronicle builds a screenful at a time). */
const page = 80;

export function TimelinePane() {
  const tl = useTimeline();
  const router = useRouter();
  const toast = useToast();
  const { width: screen } = useWindowDimensions();
  const phone = sizeClassOf(screen) === 'compact';
  const [filters, setFilters] = useState<TimelineFilters>(noFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [shown, setShown] = useState(page);
  const [width, setWidth] = useState(0);
  const view = useMemo(() => (tl ? timelineView(tl.data, filters) : null), [tl, filters]);
  if (!tl || !view) return null;
  const data = tl.data;
  const choices = filterChoices(data);
  const set = (f: Partial<TimelineFilters>) => {
    setFilters({ ...filters, ...f });
    setShown(page);
  };
  const create = () => {
    const id = tl.now(newEvent(view.character));
    if (id !== undefined) router.navigate(eventPath(id) as never);
  };
  const stepOf = new Map<string, LifeStep>(view.life.map((s) => [s.placed.event.id, s]));
  const wide = width >= chronicleWide;
  const groups = firstOf(view.groups, shown);
  const rows = chronicleRows(groups, wide);
  const filterFields = (
    <View style={styles.filters}>
      {(
        [
          ['life', choices.life, filters.character ?? '', (v: string) => set({ character: v.length === 0 ? null : v })],
          ['importance', choices.importance, filters.minimum, (v: string) => set({ minimum: v })],
          ['location', choices.location, filters.location ?? '', (v: string) => set({ location: v.length === 0 ? null : v })],
          ['precision', choices.precision, filters.precision ?? '', (v: string) => set({ precision: v.length === 0 ? null : v })],
        ] as const
      ).map(([key, c, value, choose]) => (
        <View key={key} style={phone ? styles.full : styles.filter}>
          <ChooserField label={c.label} value={value} choices={c.choices} onChoose={choose} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.gap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {view.title}
          </Text>
          <Muted>{view.subtitle}</Muted>
        </View>
        <GoldButton label="New event" icon="plus" compact onPress={create} />
      </View>
      <View style={styles.row}>
        <Muted>{view.calendarLine}</Muted>
      </View>
      <View style={styles.row}>
        <OutlineButton label="Story calendar" icon="calendar-month-outline" compact onPress={() => router.navigate('/plan/calendar' as never)} />
        <OutlineButton label={view.review} icon="check-decagram-outline" compact onPress={() => router.navigate('/review/timeline' as never)} />
        <OutlineButton label="Draw it" icon="chart-timeline" compact onPress={() => router.navigate('/visualize/timeline' as never)} />
      </View>
      <View style={styles.search}>
        <Icon name="magnify" size={20} color={colors.muted} />
        <TextInput
          value={filters.query}
          onChangeText={(v) => set({ query: v })}
          placeholder={view.search}
          placeholderTextColor={colors.muted}
          selectionColor={colors.gold}
          style={styles.searchInput}
          accessibilityLabel={view.search}
        />
        {filters.query.length > 0 && <IconButton icon="close" label="Clear search" onPress={() => set({ query: '' })} color={colors.muted} />}
      </View>
      {phone ? (
        <>
          <OutlineButton label={filtersButton(showFilters, filters)} icon="tune-variant" compact tone="muted" onPress={() => setShowFilters(!showFilters)} style={styles.start} />
          {showFilters && filterFields}
        </>
      ) : (
        filterFields
      )}
      {view.lifeBox && (
        <Panel style={styles.gapSm}>
          <Text style={styles.boxTitle}>{view.lifeBox.title}</Text>
          {view.lifeBox.summary && <Text style={styles.body}>{view.lifeBox.summary}</Text>}
          {view.lifeBox.empty && <Muted>{view.lifeBox.empty}</Muted>}
          {view.lifeBox.notes.map((n) => (
            <Muted key={n}>{n}</Muted>
          ))}
          <OutlineButton
            label={view.lifeBox.whole}
            icon="account-clock-outline"
            compact
            onPress={() => router.navigate((filters.character ? `/visualize/history?who=${encodeURIComponent(filters.character)}` : '/visualize/history') as never)}
            style={styles.start}
          />
        </Panel>
      )}

      {view.instead === 'seed' ? (
        <ChapterSeed tl={tl} onMade={(n) => toast(seededMessage(n))} onNew={create} />
      ) : view.instead === 'empty' ? (
        <Panel style={styles.gapSm}>
          <Text style={styles.boxTitle}>{view.empty.title}</Text>
          <Muted>{view.empty.message}</Muted>
          <GoldButton label={view.empty.action} icon="plus" compact onPress={create} style={styles.start} />
        </Panel>
      ) : view.instead === 'none' ? (
        <Panel style={styles.gapSm}>
          <Text style={styles.boxTitle}>No results</Text>
          <Muted>No event matches these filters.</Muted>
          <OutlineButton label="Clear the filters" compact onPress={() => set(noFilters)} style={styles.start} />
        </Panel>
      ) : (
        width > 0 && (
          <View>
            {rows.map((row, i) => (
              <ChronicleRowView
                key={row.kind === 'event' ? row.placed.event.id : `${row.kind}-${i}`}
                row={row}
                wide={wide}
                width={width}
                tl={tl}
                step={row.kind === 'event' ? (stepOf.get(row.placed.event.id) ?? null) : null}
                onOpen={(p) => router.navigate(eventPath(p.event.id) as never)}
              />
            ))}
          </View>
        )
      )}
      {view.instead === null && view.visible.length > shown && (
        <OutlineButton label={`Show ${Math.min(page, view.visible.length - shown)} more`} compact onPress={() => setShown(shown + page)} style={styles.start} />
      )}
      {view.showing && <Muted>{view.showing}</Muted>}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- the chronicle

function ChronicleRowView({
  row,
  wide,
  width,
  tl,
  step,
  onOpen,
}: {
  row: ChronicleRow;
  wide: boolean;
  width: number;
  tl: OpenTimeline;
  step: LifeStep | null;
  onOpen: (p: Placed) => void;
}) {
  const [height, setHeight] = useState(0);
  const line = height > 0 ? lineOf(row, wide, width, height) : null;
  const ink = row.kind === 'year' && row.undated ? colors.muted : colors.gold;
  return (
    <View onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {line && (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          {line.dashed ? (
            line.dashes.map((d, i) => <Line key={i} x1={line.x} y1={d.from} x2={line.x} y2={d.to} stroke={colors.border} strokeWidth={2} />)
          ) : (
            <Line x1={line.x} y1={line.top} x2={line.x} y2={height} stroke={colors.border} strokeWidth={2} />
          )}
          {line.reach && <Line x1={line.reach.from} y1={line.y} x2={line.reach.to} y2={line.y} stroke={colors.border} strokeWidth={1.5} />}
          {line.node === 'minor' && <Circle cx={line.x} cy={line.y} r={5} fill={colors.background} stroke={colors.gold} strokeWidth={2} />}
          {line.node === 'major' && <Circle cx={line.x} cy={line.y} r={7} fill={colors.gold} />}
          {line.node === 'climax' && (
            <>
              <Circle cx={line.x} cy={line.y} r={14} fill={colors.gold} fillOpacity={0.22} />
              <Circle cx={line.x} cy={line.y} r={9} fill={colors.gold} stroke={colors.background} strokeWidth={2} />
            </>
          )}
          {line.node === 'year' && (
            <>
              <Circle cx={line.x} cy={line.y} r={8} fill={colors.background} stroke={ink} strokeWidth={2} />
              <Circle cx={line.x} cy={line.y} r={3.5} fill={ink} />
            </>
          )}
        </Svg>
      )}
      {row.kind === 'gap' ? (
        <View style={[styles.gapRow, wide ? styles.centred : { paddingLeft: narrowGutter }]}>
          <Text style={[styles.gapText, wide && styles.onPage]}>{row.text}</Text>
        </View>
      ) : row.kind === 'year' ? (
        wide ? (
          <View style={[styles.centred, { marginTop: row.first ? 4 : 14, marginBottom: 14 }]}>
            <View style={[styles.pill, { borderColor: row.undated ? colors.border : 'rgba(243, 182, 58, 0.6)' }]}>
              <Text style={[styles.year, row.undated && styles.undated]}>{row.heading}</Text>
            </View>
          </View>
        ) : (
          <View style={{ paddingLeft: narrowGutter, marginTop: (row.first ? 4 : 14) + 12, marginBottom: 2 }}>
            <Text style={[styles.year, row.undated && styles.undated]}>{row.heading}</Text>
          </View>
        )
      ) : (
        <View style={[styles.eventRow, wide && { flexDirection: row.left ? 'row' : 'row-reverse' }]}>
          <View style={wide ? { width: (width - wideGutter) / 2 } : { marginLeft: narrowGutter, flex: 1 }}>
            <EventCardView tl={tl} placed={row.placed} step={step} onOpen={() => onOpen(row.placed)} />
          </View>
        </View>
      )}
    </View>
  );
}

function EventCardView({ tl, placed, step, onOpen }: { tl: OpenTimeline; placed: Placed; step: LifeStep | null; onOpen: () => void }) {
  const card = eventCard(tl.data, placed, step);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.name}. ${card.when}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && { borderColor: colors.gold }]}
    >
      <Text style={styles.when}>
        {card.age && <Text style={styles.bold}>{card.age}</Text>}
        {card.when}
      </Text>
      <Text style={styles.name}>
        {card.name}
        {card.importance && <Text style={{ color: card.importance.climax ? colors.danger : colors.gold }}>{`  ${card.importance.label}`}</Text>}
      </Text>
      {card.details.length > 0 && <Muted numberOfLines={3}>{card.details}</Muted>}
      {card.problems && (
        <View style={styles.problems}>
          <Icon name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.problemText}>{card.problems}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------------------------------------------ the chapter seed

function ChapterSeed({ tl, onMade, onNew }: { tl: OpenTimeline; onMade: (n: number) => void; onNew: () => void }) {
  const chapters = tl.data.model.order.chapters;
  const seed = chapterSeed(chapters);
  const make = () => {
    const made = tl.now((c) => c.eventsFromChapters(chapters.map((ch) => ch.id)));
    if (made !== undefined) onMade(made.length);
  };
  return (
    <Panel style={styles.seed}>
      <Text style={styles.seedHeading}>{seed.heading}</Text>
      <Text style={styles.seedLine}>{seed.line}</Text>
      <View style={styles.rule} />
      {seed.rows.map((r, i) => (
        <View key={i} style={styles.seedRow}>
          <View style={styles.seedColumn}>
            <View style={[styles.stem, !r.stemAbove && styles.noStem]} />
            <View style={styles.ring} />
            <View style={[styles.stem, !r.stemBelow && styles.noStem]} />
          </View>
          <Text style={styles.seedTitle} numberOfLines={1}>
            {r.title}
          </Text>
        </View>
      ))}
      {seed.more && <Text style={styles.more}>{seed.more}</Text>}
      <View style={styles.row}>
        <GoldButton label={seed.seed} icon="timeline-plus-outline" compact onPress={make} />
        <OutlineButton label={seed.newEvent} icon="plus" compact tone="muted" onPress={onNew} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  full: { width: '100%' },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
  bold: { fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  boxTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 48,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  filter: { width: 220 },
  centred: { alignItems: 'center' },
  gapRow: { paddingVertical: 10 },
  gapText: { fontFamily: fonts.bookItalic, fontSize: 15, color: colors.muted },
  onPage: { backgroundColor: colors.background, paddingHorizontal: space.sm },
  pill: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: colors.background, borderWidth: 1 },
  year: { fontFamily: fonts.book, fontSize: 20, fontWeight: '700', color: colors.text },
  undated: { fontSize: 16, color: colors.muted },
  eventRow: { marginBottom: 12 },
  card: { padding: space.md, gap: 4, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  when: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  name: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text },
  problems: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  problemText: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger },
  seed: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20, gap: space.sm },
  seedHeading: { fontFamily: fonts.ui, fontSize: 18, fontWeight: '700', color: colors.text },
  seedLine: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 23, color: colors.muted },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
  seedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seedColumn: { width: 24, alignItems: 'center' },
  stem: { width: 2, height: 10, backgroundColor: 'rgba(243, 182, 58, 0.4)' },
  noStem: { backgroundColor: 'transparent' },
  ring: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.gold },
  seedTitle: { flex: 1, fontFamily: fonts.ui, fontSize: 17, color: colors.text },
  more: { fontFamily: fonts.bookItalic, fontSize: 15, color: colors.muted, marginLeft: 36 },
});
