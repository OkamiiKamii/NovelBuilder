// PROJECT ANALYTICS (FEATURES.md #337): counts taken from the novel and stated as they are: plain statements of fact,
// writing output, sessions and streaks, the manuscript's structure, where each character appears and where each plot
// thread develops, with charts and tables. Nothing is scored or judged; whether any of it is as intended is the
// author's to say. Worked out only while this page is open, from what is already saved, a moment after it is drawn.
// A port of flutter_app/lib/features/progress/analytics_page.dart (and the pieces of widgets/bars.dart it draws with);
// the counting is src/domain/analytics/analytics.ts. It sits in the scroll view the Analytics area gives it.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { type Analytics, computeAnalytics, type PlaceWords } from '../../domain/analytics/analytics';
import { Goal, grouped, mediumDay, type TrendPoint, WritingSession } from '../../domain/analytics/progress';
import { characterPath } from '../../domain/characters/screens/create';
import { str } from '../../domain/json';
import { threadPath } from '../../domain/plot/plotService';
import { ProgressSnapshot } from '../../domain/progression/snapshots';
import { intOrNull } from '../../domain/records/jsonRecord';
import { Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { lastNodeSetting } from '../write/WriteScreen';
import { type OpenCast, useCast } from '../organize/useCast';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const countOf = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "−1,200": a minus sign, not a hyphen, as the original writes a cut. */
const signed = (n: number) => `${n < 0 ? '−' : ''}${grouped(Math.abs(n))}`;
const duration = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.trunc(minutes / 60)} h ${minutes % 60} min`);

/** Colours for things told apart by kind (bars.dart's seriesColors for dark surfaces); always shown with names. */
const series = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181'];
/** Stages run in order: one hue, light to dark. */
const stages = [0.3, 0.5, 0.75, 1].map((o) => `rgba(243, 182, 58, ${o})`);

/** The analytics of the open novel, worked out a moment after the page is drawn and again after every change. */
function useAnalytics(open: OpenCast | null): Analytics | null {
  const lib = useLibrary();
  const [result, setResult] = useState<{ novelId: string; analytics: Analytics } | null>(null);
  // Read again when the cast is read again (after any change: useCast reads it anew per library revision), not on
  // every render: useCast's result is a new object each time.
  const cast = open?.cast ?? null;
  const novelId = open?.novelId ?? null;
  useEffect(() => {
    if (cast === null || novelId === null) return;
    const t = setTimeout(() => {
      const s = cast.snapshot;
      const analytics = computeAnalytics(cast.model, {
        targetWordCount: intOrNull(s.project['targetWordCount']),
        docs: new Map(lib.novels.rowsIn(novelId, 'chapterContents').map((r) => [str(r['id']), r['doc']])),
        snapshots: s.rows('progressSnapshots').map((r) => new ProgressSnapshot(r)),
        sessions: s.rows('writingSessions').map((r) => new WritingSession(r)),
        goals: s.rows('goals').map((r) => new Goal(r)),
        now: Date.now(),
        // By every name Characters finds them by, so the two agree on where each one is.
        names: cast.findNames,
      });
      setResult({ novelId, analytics });
    }, 30);
    return () => clearTimeout(t);
  }, [cast, novelId, lib]);
  // While a change is read again, the last reading of the same novel stays; another novel's never shows.
  return result !== null && result.novelId === novelId ? result.analytics : null;
}

export function AnalyticsPane() {
  const open = useCast();
  const lib = useLibrary();
  const router = useRouter();
  const a = useAnalytics(open);
  const [allCast, setAllCast] = useState(false);
  if (open === null) return <Muted>Open a novel from the Library to see its analytics.</Muted>;
  if (a === null) return <Muted>Counting…</Muted>;

  const { output, sessions, structure, cast, threads } = a;
  const openChapter = (nodeId: string) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(open.novelId)}`, () => lib.settings.write(lastNodeSetting(open.novelId), nodeId));
    router.navigate('/write');
  };
  const most = cast.rows.reduce((m, r) => (r.chapters.length > m ? r.chapters.length : m), 1);
  const shown = allCast ? cast.rows : cast.rows.slice(0, 12);
  const chapterTile = (label: string, place: PlaceWords | null) => (
    <Tile key={label} label={label} value={place === null ? '—' : grouped(place.words)} detail={place?.title ?? null}>
      {place !== null && (
        <Pressable accessibilityRole="button" onPress={() => openChapter(place.nodeId)} hitSlop={8}>
          <Text style={styles.link}>Open Ch. {place.number}</Text>
        </Pressable>
      )}
    </Tile>
  );

  return (
    <View style={styles.gap}>
      <Text style={styles.title} accessibilityRole="header">
        Analytics
      </Text>
      <Muted>
        {`${grouped(output.totalWords)} ${output.totalWords === 1 ? 'word' : 'words'}` +
          `${output.targetWords !== null ? ` · ${output.percent}% of ${grouped(output.targetWords)}` : ''}` +
          ` · ${countOf(structure.chapters, 'chapter', 'chapters')} · ${countOf(cast.total, 'character', 'characters')}` +
          ` · ${countOf(threads.total, 'plot thread', 'plot threads')}`}
      </Muted>

      <Panel style={styles.panel}>
        <Text style={styles.panelTitle} accessibilityRole="header">
          Observations
        </Text>
        {a.observations.length === 0 ? (
          <Text style={styles.body}>Nothing stands out in the numbers below.</Text>
        ) : (
          a.observations.map((line, i) => (
            <Text key={i} style={styles.body}>
              • {line}
            </Text>
          ))
        )}
      </Panel>

      <Heading text="Writing output" />
      <Tiles>
        <Tile
          label="Words in the manuscript"
          value={grouped(output.totalWords)}
          detail={output.targetWords !== null ? `${output.percent}% of the ${grouped(output.targetWords)} target` : 'No target set'}
        />
        <Tile label="Words today" value={signed(output.today.net)} detail={countOf(output.today.sessions, 'session', 'sessions')} />
        <Tile label="This week" value={signed(output.week.net)} detail={`${days(output.week.activeDays)} with writing`} />
        <Tile label="This month" value={signed(output.month.net)} detail={`${days(output.month.activeDays)} with writing`} />
        <Tile label="Average per writing day" value={signed(output.averagePerWritingDay)} detail={`over ${days(sessions.writingDays)}`} />
        <Tile label="Average per day, last 30 days" value={signed(output.averagePerDayLast30)} />
      </Tiles>
      <TrendChart title="Net words per day, last 30 days" periodLabel="On" points={output.days} labelEvery={5} />
      <TrendChart title="Net words per week, last 8 weeks" periodLabel="Week of" points={output.weeks} labelEvery={1} />

      <Heading text="Sessions" />
      <Tiles>
        <Tile label="Writing sessions" value={`${sessions.count}`} detail={`${duration(sessions.totalMinutes)} in all`} />
        <Tile label="Words per session" value={signed(sessions.averageWords)} />
        <Tile label="Average session length" value={duration(sessions.averageMinutes)} />
        <Tile
          label="Most words in a session"
          value={sessions.longestByWords === null ? '—' : grouped(sessions.longestByWords.words)}
          detail={sessions.longestByWords === null ? null : mediumDay(sessions.longestByWords.day)}
        />
        <Tile
          label="Longest session"
          value={sessions.longestByTime === null ? '—' : duration(sessions.longestByTime.minutes)}
          detail={sessions.longestByTime === null ? null : mediumDay(sessions.longestByTime.day)}
        />
        <Tile label="Current streak" value={days(sessions.currentStreak)} detail={`longest: ${days(sessions.longestStreak)}`} />
      </Tiles>

      <Heading text="Manuscript structure" />
      <Tiles>
        <Tile label="Chapters" value={`${structure.chapters}`} />
        <Tile label="Scenes" value={`${structure.scenes}`} />
        <Tile label="Average chapter length" value={grouped(structure.averageChapter)} detail="words, chapters with text" />
        <Tile label="Average scene length" value={grouped(structure.averageScene)} detail="words, scenes with text" />
        {chapterTile('Longest chapter', structure.longest)}
        {chapterTile('Shortest chapter with text', structure.shortest)}
      </Tiles>
      <Panel style={styles.panel}>
        <Text style={styles.panelTitle} accessibilityRole="header">
          Chapters by stage
        </Text>
        <PartsBar label="Chapters by stage" parts={structure.pipeline} palette={stages} />
      </Panel>
      {structure.lengths.length > 0 && (
        <Panel style={styles.panel}>
          <Text style={styles.panelTitle} accessibilityRole="header">
            Words per chapter, in reading order
          </Text>
          <ColumnChart
            label="Words per chapter, in reading order"
            words={(n) => `${grouped(n)} ${n === 1 ? 'word' : 'words'}`}
            labelEvery={Math.max(1, Math.ceil(structure.lengths.length / 12))}
            bars={structure.lengths.map((c) => ({
              key: c.nodeId,
              short: `${c.number}`,
              label: `Chapter ${c.number}: ${c.title.trim().length === 0 ? 'Untitled chapter' : c.title}`,
              value: c.words,
              current: false,
            }))}
          />
          <TableFold
            label="Words per chapter, as a table"
            columns={['Chapter', 'Words']}
            rows={structure.lengths.map((c) => [`${c.number}. ${c.title}`, c.words])}
          />
        </Panel>
      )}

      <Heading text="Characters" />
      <Muted>
        {`${countOf(cast.total, 'character', 'characters')} · ${cast.appearing} ${cast.appearing === 1 ? 'appears' : 'appear'} in the ` +
          'manuscript. A chapter counts when the character is linked in it, listed in its plan or named in its text: by their ' +
          'name, an alias, or a part of their name no one else has (“Ilse” for Ilse Marrow), as Characters finds them.'}
      </Muted>
      {shown.map((row) => (
        <Row key={row.id} title={row.name} subtitle={null} line={row.line} onOpen={() => router.navigate(characterPath(row.id) as never)}>
          <View style={styles.gaugeRow}>
            <View style={{ width: 80 }}>
              <Gauge value={row.chapters.length / most} />
            </View>
            <Text style={styles.small}>{countOf(row.chapters.length, 'chapter', 'chapters')}</Text>
          </View>
          <ChapterStrip total={structure.chapters} chapters={row.chapters} />
          <Text style={styles.small}>
            {[
              row.distribution.length === 0 ? 'No appearances recorded' : `Chapters ${row.distribution}`,
              ...(row.first !== null ? [`first Ch. ${row.first.number}`] : []),
              ...(row.latest !== null ? [`latest Ch. ${row.latest.number}`] : []),
              countOf(row.relationships, 'relationship', 'relationships'),
              countOf(row.milestones, 'snapshot', 'snapshots'),
            ].join(' · ')}
          </Text>
        </Row>
      ))}
      {cast.rows.length > 12 && (
        <OutlineButton
          label={allCast ? 'Show the twelve who appear most' : `Show all ${cast.rows.length}`}
          compact
          onPress={() => setAllCast(!allCast)}
          style={styles.start}
        />
      )}

      <Heading text="Plot threads" />
      <Tiles>
        <Tile label="Plot threads" value={`${threads.total}`} />
        <Tile label="Open mysteries" value={`${threads.openMysteries}`} />
        <Tile label="Character arcs" value={`${threads.characterArcs}`} />
      </Tiles>
      <Panel style={styles.panel}>
        <Text style={styles.panelTitle} accessibilityRole="header">
          Threads by status
        </Text>
        <PartsBar label="Threads by status" parts={threads.groups} palette={series} />
      </Panel>
      {threads.rows.map((row) => (
        <Row
          key={row.id}
          title={row.title}
          subtitle={`${row.category} · ${row.statusLabel}`}
          line={row.line}
          onOpen={() => router.navigate(threadPath(row.id) as never)}
        >
          <ChapterStrip total={structure.chapters} chapters={row.chapters} />
          <Text style={styles.small}>
            {[
              countOf(row.beats, 'development', 'developments'),
              `${row.chapters.length} of ${structure.chapters} chapters (${Math.floor(row.density * 100 + 0.5)}%)`,
              `written chapters since the latest: ${row.quietFor ?? '—'}`,
            ].join(' · ')}
          </Text>
        </Row>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- pieces

function Heading({ text }: { text: string }) {
  return (
    <Text style={styles.heading} accessibilityRole="header">
      {text}
    </Text>
  );
}

function Tiles({ children }: { children: React.ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

/** A number with what it is and a line more about it: gold for the number, as the design has key numbers. */
function Tile({ label, value, detail = null, children }: { label: string; value: string; detail?: string | null; children?: React.ReactNode }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      {detail !== null && (
        <Text style={styles.small} numberOfLines={2}>
          {detail}
        </Text>
      )}
      {children}
    </View>
  );
}

/** A share of a whole as a filled track, 0 to 1. */
function Gauge({ value }: { value: number }) {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${v * 100}%` }]} />
    </View>
  );
}

/** Parts of a whole as one bar, with every part named and counted beside it so colour is never the only cue. */
function PartsBar({ label, parts, palette }: { label: string; parts: readonly { key: string; label: string; count: number }[]; palette: readonly string[] }) {
  const total = parts.reduce((n, p) => n + p.count, 0);
  return (
    <View style={styles.gapSm}>
      <View style={styles.partsBar} accessibilityLabel={`${label}: ${parts.map((p) => `${p.label} ${p.count}`).join(', ')}`}>
        {total === 0 ? (
          <View style={[styles.flex, { backgroundColor: colors.elevated }]} />
        ) : (
          parts.map((p, i) =>
            p.count > 0 ? <View key={p.key} style={{ flex: p.count, marginRight: 2, backgroundColor: palette[i % palette.length] }} /> : null,
          )
        )}
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants">
        {parts.map((p, i) => (
          <View key={p.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: palette[i % palette.length] }]} />
            <Text style={styles.body}>
              {p.label} <Text style={styles.bold}>{p.count}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One cell per chapter, filled where something is present: where in the book, at a glance. Measured, not guessed. */
function ChapterStrip({ total, chapters }: { total: number; chapters: readonly number[] }) {
  const [width, setWidth] = useState(0);
  const n = Math.max(total, 1);
  const cell = width / n;
  const filled = new Set(chapters);
  // Narrower than 4, a chapter's cell has no gap after it: the track whole and the filled chapters on it as runs, each
  // at least 2 wide (as bars.dart's StripPainter paints a long book).
  const runs: { from: number; to: number }[] = [];
  const sorted = [...filled].filter((c) => c >= 1 && c <= n).sort((a, b) => a - b);
  for (const c of sorted) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.to === c - 1) last.to = c;
    else runs.push({ from: c, to: c });
  }
  return (
    <View style={styles.strip} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} importantForAccessibility="no-hide-descendants">
      {width > 0 && (
        <Svg width={width} height={12}>
          {cell >= 4 ? (
            Array.from({ length: n }, (_, i) => (
              <Rect key={i} x={i * cell} y={0} width={Math.max(1, cell - 2)} height={12} rx={2} fill={filled.has(i + 1) ? colors.gold : colors.border} />
            ))
          ) : (
            <>
              <Rect x={0} y={0} width={width} height={12} rx={2} fill={colors.border} />
              {runs.map((r) => (
                <Rect key={r.from} x={(r.from - 1) * cell} y={0} width={Math.max(2, (r.to - r.from + 1) * cell)} height={12} fill={colors.gold} />
              ))}
            </>
          )}
        </Svg>
      )}
    </View>
  );
}

type Bar = { key: string; short: string; label: string; value: number; current: boolean };

/** Columns along a period or the book, measured to the room they have; a column pressed is said in words below. Net
 * words can be negative: those columns hang below the zero line. */
function ColumnChart({ label, bars, words, labelEvery }: { label: string; bars: readonly Bar[]; words: (n: number) => string; labelEvery: number }) {
  const [room, setRoom] = useState(0);
  const [picked, setPicked] = useState<Bar | null>(null);
  const top = Math.max(0, ...bars.map((b) => b.value));
  const bottom = Math.min(0, ...bars.map((b) => b.value));
  const span = Math.max(1, top - bottom);
  const height = 160;
  const left = 44;
  const slot = Math.max(12, Math.min(48, (room - left - 8) / Math.max(1, bars.length)));
  const inner = slot * bars.length;
  const y = (v: number) => 4 + ((top - v) / span) * height;
  return (
    <View onLayout={(e) => setRoom(e.nativeEvent.layout.width)} accessibilityLabel={label}>
      {room > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: left + inner + 8 }}>
            <Svg width={left + inner + 8} height={height + 26}>
              <Line x1={left} y1={y(0)} x2={left + inner} y2={y(0)} stroke={colors.border} strokeWidth={1} />
              <Line x1={left} y1={y(top)} x2={left + inner} y2={y(top)} stroke={colors.border} strokeWidth={1} strokeDasharray="3 3" />
              <SvgText x={left - 6} y={y(top) + 4} fontSize={10} fill={colors.muted} textAnchor="end">
                {signed(top)}
              </SvgText>
              {bottom < 0 && (
                <SvgText x={left - 6} y={y(bottom)} fontSize={10} fill={colors.muted} textAnchor="end">
                  {signed(bottom)}
                </SvgText>
              )}
              <SvgText x={left - 6} y={y(0) + 4} fontSize={10} fill={colors.muted} textAnchor="end">
                0
              </SvgText>
              {bars.map((b, i) => {
                const from = y(Math.max(0, b.value));
                const to = y(Math.min(0, b.value));
                const on = picked?.key === b.key;
                return (
                  <Rect
                    key={b.key}
                    x={left + i * slot + 2}
                    y={from}
                    width={slot - 4}
                    height={Math.max(to - from, b.value !== 0 ? 1 : 0)}
                    rx={2}
                    fill={b.value < 0 ? colors.danger : on || b.current ? colors.gold : 'rgba(243, 182, 58, 0.55)'}
                    stroke={on ? colors.text : 'none'}
                    strokeWidth={on ? 1.5 : 0}
                  />
                );
              })}
              {bars.map((b, i) =>
                i % labelEvery === 0 ? (
                  <SvgText key={`l-${b.key}`} x={left + i * slot + slot / 2} y={height + 22} fontSize={10} fill={colors.muted} textAnchor="middle">
                    {b.short}
                  </SvgText>
                ) : null,
              )}
            </Svg>
            <View style={[StyleSheet.absoluteFill, styles.hits, { paddingLeft: left }]}>
              {bars.map((b) => (
                <Pressable
                  key={b.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.label}: ${words(b.value)}`}
                  onPress={() => setPicked(picked?.key === b.key ? null : b)}
                  style={{ width: slot, height: height + 26 }}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      )}
      {picked !== null && (
        <Text style={styles.body}>
          <Text style={styles.bold}>{picked.label}: </Text>
          {words(picked.value)}
        </Text>
      )}
    </View>
  );
}

/** A period's net words, drawn, with the same numbers as a table under it. */
function TrendChart({ title, periodLabel, points, labelEvery }: { title: string; periodLabel: string; points: readonly TrendPoint[]; labelEvery: number }) {
  const empty = points.every((p) => p.net === 0);
  return (
    <Panel style={styles.panel}>
      <Text style={styles.panelTitle} accessibilityRole="header">
        {title}
      </Text>
      {empty ? (
        <Muted>Nothing logged in this period yet. It fills in as you write.</Muted>
      ) : (
        <ColumnChart
          label={title}
          labelEvery={labelEvery}
          words={(n) => `${signed(n)} ${Math.abs(n) === 1 ? 'word' : 'words'}`}
          bars={points.map((p) => ({
            key: p.key,
            short: p.label,
            label: `${periodLabel.length === 0 ? '' : `${periodLabel} `}${p.label}${p.current ? ' (so far)' : ''}`,
            value: p.net,
            current: p.current,
          }))}
        />
      )}
      <TableFold label={`${title}, as a table`} columns={[periodLabel.length === 0 ? 'Day' : periodLabel, 'Net words']} rows={points.map((p) => [p.label, p.net])} />
    </Panel>
  );
}

/** The numbers behind a chart, folded until asked for. */
function TableFold({ label, columns, rows }: { label: string; columns: readonly string[]; rows: readonly (readonly (string | number)[])[] }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.gapSm}>
      <OutlineButton label={shown ? 'Hide the table' : 'Show as a table'} icon="table" compact tone="muted" onPress={() => setShown(!shown)} style={styles.start} />
      {shown && (
        <View style={styles.table} accessibilityLabel={label}>
          <View style={[styles.tr, styles.th]}>
            {columns.map((c, i) => (
              <Text key={c} style={[styles.td, styles.thText, i > 0 && styles.num]}>
                {c}
              </Text>
            ))}
          </View>
          {rows.map((r, i) => (
            <View key={i} style={styles.tr}>
              {r.map((cell, j) => (
                <Text key={j} style={[styles.td, typeof cell === 'number' && styles.num]} numberOfLines={2}>
                  {typeof cell === 'number' ? signed(cell) : cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** A character's or thread's row: its name opens it; the whole row is said in one sentence to a screen reader. */
function Row({
  title,
  subtitle,
  line,
  onOpen,
  children,
}: {
  title: string;
  subtitle: string | null;
  line: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onOpen} hitSlop={6}>
          <Text style={styles.rowTitle}>{title}</Text>
        </Pressable>
        {subtitle !== null && <Text style={styles.small}>{subtitle}</Text>}
      </View>
      <View style={styles.gapXs} accessible accessibilityLabel={line}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  start: { alignSelf: 'flex-start' },
  bold: { fontWeight: '700' },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  heading: { fontFamily: fonts.display, fontSize: 19, color: colors.text, marginTop: space.md },
  panel: { gap: space.sm },
  panelTitle: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', letterSpacing: 1.4, color: colors.gold, textTransform: 'uppercase' },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.muted },
  link: { fontFamily: fonts.ui, fontSize: 13, color: colors.sky, marginTop: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 150,
    padding: space.md,
    gap: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileLabel: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 0.6, color: colors.muted },
  tileValue: { fontFamily: fonts.numbers, fontSize: 22, color: colors.gold },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.elevated },
  fill: { height: 8, backgroundColor: colors.gold },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  partsBar: { flexDirection: 'row', height: 14, borderRadius: 4, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  strip: { height: 12, alignSelf: 'stretch' },
  hits: { flexDirection: 'row' },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { backgroundColor: colors.elevated },
  td: { flex: 1, paddingHorizontal: space.sm, paddingVertical: 6, fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  thText: { fontWeight: '700', color: colors.muted },
  num: { textAlign: 'right', flex: 0, minWidth: 90 },
  row: { gap: space.xs, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.sm },
  rowTitle: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.gold },
});
