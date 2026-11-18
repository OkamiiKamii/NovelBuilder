// The cards at the head of the contents (FEATURES.md #83): THE DAY BOOK (five weeks of writing as ink, the days in a
// row, and one press back into the chapter being written), THE ROAD TO THE DRAFT (the manuscript's length against the
// lengths fiction is measured by) and GAPS TO FILL (every [[gap]] and TK in the book, a press away); and the
// STORYBOARD's lines under each chapter (#82). They read and change nothing.
//
// The day book's "Set a daily goal" and "Share today's page" come with Analytics (goals and today's page live there).

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { milestonesFor, roadPosition, whereOnRoad } from '../../domain/analytics/milestones';
import { type DayBook, dayBookCounts, dayBookHeadline, dayBookOffers, dayLabel, dayMarkOf, weekInitials } from '../../domain/desk/dayBook';
import { formatNumber, plural } from '../../domain/desk/format';
import { displayTitle, type NextNote } from '../../domain/desk/pageAround';
import { type StoryCard } from '../../domain/manuscript/storyboard';
import { type StoryNode } from '../../domain/outline';
import { type Gap } from '../../domain/text/gaps';
import { GoldButton, Icon } from '../kit';
import { colors, fonts, radius, space } from '../theme';

/** "About 4 pages", as the Flutter app says it (a manuscript page of 250 words). */
export function pagesOf(words: number): string {
  const pages = words / 250;
  if (pages < 0.75) return 'A paragraph or two';
  const whole = Math.round(pages);
  return whole === 1 ? 'About a page' : `About ${whole} pages`;
}

// --------------------------------------------------------------------------------------------------- the day book

export function DayBookCard({
  book,
  goal,
  next,
  note,
  onCarryOn,
  onSetGoal,
  onShare,
}: {
  book: DayBook;
  goal: number | null;
  next: StoryNode | null;
  note: NextNote | undefined;
  onCarryOn: () => void;
  onSetGoal: () => void;
  onShare: () => void;
}) {
  const offers = dayBookOffers(book, goal);
  return (
    <View style={[styles.card, styles.dayCard]}>
      <Text style={styles.kicker}>THE DAY BOOK</Text>
      <Text style={styles.headline} accessibilityRole="header">
        {dayBookHeadline(book)}
      </Text>
      <Text style={styles.muted}>{dayBookCounts(book, goal)}</Text>
      <Weeks book={book} goal={goal} />
      {next && note && (
        <View style={styles.pinned}>
          <Text style={styles.pinnedLabel}>NEXT TIME</Text>
          <Text style={styles.pinnedText}>{note.text}</Text>
        </View>
      )}
      {next && <GoldButton label={`Carry on in “${displayTitle(next)}”`} icon="feather" onPress={onCarryOn} />}
      {(offers.setGoal || offers.share) && (
        <View style={styles.offers}>
          {offers.setGoal && (
            <Pressable accessibilityRole="button" onPress={onSetGoal} style={styles.offer}>
              <Icon name="flag-outline" size={18} />
              <Text style={styles.offerText}>Set a daily goal</Text>
            </Pressable>
          )}
          {offers.share && (
            <Pressable accessibilityRole="button" onPress={onShare} style={styles.offer}>
              <Icon name="share-variant-outline" size={18} />
              <Text style={styles.offerText}>Share today’s page</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Weeks({ book, goal }: { book: DayBook; goal: number | null }) {
  const [width, setWidth] = useState(0);
  const cell = Math.min(width / 7, 40);
  const height = Math.min(cell, 32);
  const rows: (typeof book.days)[] = [];
  for (let i = 0; i < book.days.length; i += 7) rows.push(book.days.slice(i, i + 7));
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.weeks}>
      {cell > 0 && (
        <>
          <View style={styles.weekRow}>
            {weekInitials.map((d, i) => (
              <Text key={i} style={[styles.initial, { width: cell }]}>
                {d}
              </Text>
            ))}
          </View>
          {rows.map((row, r) => (
            <View key={r} style={styles.weekRow}>
              {row.map((day) => (
                <View key={day.key} style={{ width: cell, height }} accessible={!day.ahead} accessibilityLabel={dayLabel(day) ?? undefined}>
                  <DayInk day={day} most={book.most} goal={goal} width={cell} height={height} />
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function DayInk({ day, most, goal, width, height }: { day: DayBook['days'][number]; most: number; goal: number | null; width: number; height: number }) {
  const mark = dayMarkOf(day, most, goal);
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 3;
  return (
    <Svg width={width} height={height}>
      {mark.kind === 'ahead' && <Circle cx={cx} cy={cy} r={1.2} fill={colors.border} />}
      {mark.kind === 'unwritten' && <Circle cx={cx} cy={cy} r={r * 0.32} stroke={colors.border} strokeWidth={1.2} fill="none" />}
      {mark.kind === 'blot' && (
        <>
          <Circle cx={cx} cy={cy} r={r * mark.scale} fill={colors.gold} opacity={mark.alpha} />
          {mark.droplets.map((d, i) => {
            const dist = r * mark.scale + d.beyond;
            return <Circle key={i} cx={cx + Math.cos(d.angle) * dist} cy={cy + Math.sin(d.angle) * dist} r={d.radius} fill={colors.gold} opacity={mark.alpha} />;
          })}
        </>
      )}
      {mark.ring !== null && (
        <>
          <Circle cx={cx} cy={cy} r={r + 1} stroke={colors.border} strokeWidth={1.5} fill="none" />
          {mark.ring > 0 && <Path d={arc(cx, cy, r + 1, mark.ring)} stroke={colors.gold} strokeWidth={2} fill="none" strokeLinecap="round" />}
        </>
      )}
    </Svg>
  );
}

/** A ring closed this far (0 to 1), clockwise from the top. */
function arc(cx: number, cy: number, r: number, share: number): string {
  if (share >= 1) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`;
  const a = share * Math.PI * 2 - Math.PI / 2;
  const x = cx + Math.cos(a) * r;
  const y = cy + Math.sin(a) * r;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${x} ${y}`;
}

// --------------------------------------------------------------------------------------------- the road to the draft

export function DraftRoad({ words, target }: { words: number; target: number | null }) {
  const [width, setWidth] = useState(0);
  const road = milestonesFor(target);
  const at = whereOnRoad(words, road);
  const next = at.next;
  const end = road[road.length - 1].words;
  const ahead = next === null ? `The whole draft is written. ${formatNumber(words)} words.` : `${plural(next.words - words, 'word')} to ${next.name}`;
  const y = 16;
  const left = 6;
  const right = width - 10;
  const xOf = (w: number) => left + (right - left) * roadPosition(w, end);
  const here = xOf(words);
  // The marks' lengths under them, kept from running into each other.
  let lastLabelEnd = -Infinity;
  const labels: { x: number; text: string; passed: boolean }[] = [];
  for (const m of road) {
    const x = xOf(m.words);
    const w = m.short.length * 6.2;
    const lx = Math.min(Math.max(x - w / 2, 0), width - w);
    if (lx > lastLabelEnd + 4) {
      labels.push({ x: lx + w / 2, text: m.short, passed: words >= m.words });
      lastLabelEnd = lx + w;
    }
  }
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`The road to the draft: ${formatNumber(words)} of ${formatNumber(end)} words. ${at.passed ? `Passed ${at.passed.name}. ` : ''}${ahead}.`}
    >
      <View style={styles.roadHead}>
        <Text style={styles.kicker}>THE ROAD TO THE DRAFT</Text>
        <Text style={styles.count}>
          {formatNumber(words)} of {formatNumber(end)}
        </Text>
      </View>
      <View style={styles.road} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={48}>
            {Array.from({ length: Math.max(0, Math.ceil((right - left) / 7)) }, (_, i) => {
              const x = left + i * 7;
              return <Line key={i} x1={x} y1={y} x2={Math.min(x + 3.5, right)} y2={y} stroke={colors.border} strokeWidth={2} strokeLinecap="round" />;
            })}
            {words > 0 && <Line x1={left} y1={y} x2={here} y2={y} stroke={colors.gold} strokeWidth={3.5} strokeLinecap="round" />}
            {road.map((m, i) => {
              const x = xOf(m.words);
              const r = i === road.length - 1 ? 6 : 4.5;
              const passed = words >= m.words;
              return (
                <Path
                  key={m.words}
                  d={`M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`}
                  fill={passed ? colors.gold : 'none'}
                  stroke={passed ? colors.gold : colors.border}
                  strokeWidth={1.5}
                />
              );
            })}
            {labels.map((l) => (
              <SvgText fontFamily={fonts.ui} key={l.text} x={l.x} y={y + 22} fontSize={10} textAnchor="middle" fill={l.passed ? colors.gold : colors.muted} fontWeight={l.passed ? '700' : '400'}>
                {l.text}
              </SvgText>
            ))}
            {words > 0 && (
              <>
                <Path d={`M ${here} ${y + 1} L ${here - 5} ${y - 10} Q ${here} ${y - 15} ${here + 5} ${y - 10} Z`} fill={colors.gold} />
                <Circle cx={here} cy={y - 8} r={1.3} fill={colors.background} />
              </>
            )}
          </Svg>
        )}
      </View>
      <Text style={styles.muted}>{next === null ? ahead : `${ahead} · ${pagesOf(next.words - words).toLowerCase()}`}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- gaps to fill

const gapsShown = 4;

export function GapsCard({ gaps, titleOf, onOpen }: { gaps: Gap[]; titleOf: (nodeId: string) => string; onOpen: (g: Gap) => void }) {
  const [all, setAll] = useState(false);
  if (gaps.length === 0) return null;
  const chapters = new Set(gaps.map((g) => g.nodeId)).size;
  const shown = all ? gaps : gaps.slice(0, gapsShown);
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>GAPS TO FILL</Text>
      <Text style={styles.headline} accessibilityRole="header">
        {plural(gaps.length, 'gap')} left to fill{chapters > 1 ? ` in ${chapters} chapters` : ''}
      </Text>
      <Text style={styles.muted}>You wrote past them. Press one to fill it in.</Text>
      {shown.map((g) => (
        <Pressable
          key={`${g.nodeId}:${g.block}:${g.start}`}
          accessibilityRole="button"
          accessibilityLabel={`Gap in ${titleOf(g.nodeId)}: ${g.note || `${g.before} ${g.written} ${g.after}`}`}
          onPress={() => onOpen(g)}
          style={({ pressed }) => [styles.gap, pressed && { backgroundColor: colors.elevated }]}
        >
          <Icon name="note-text-outline" size={18} color={colors.gold} />
          <View style={styles.flex}>
            {g.note ? (
              <Text style={styles.gapNote} numberOfLines={2}>
                {g.note}
              </Text>
            ) : (
              <Text style={styles.gapText} numberOfLines={2}>
                <Text style={styles.gapFaint}>{g.before}</Text>
                <Text style={styles.gapSticky}>{g.written}</Text>
                <Text style={styles.gapFaint}>{g.after}</Text>
              </Text>
            )}
            <Text style={styles.gapWhere}>{titleOf(g.nodeId)}</Text>
          </View>
        </Pressable>
      ))}
      {gaps.length > gapsShown && (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} style={styles.more}>
          <Text style={styles.moreText}>{all ? 'Show fewer' : `Show all ${gaps.length}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- the storyboard

/** A chapter's card under its line in the contents: how it opens, how it ends, who is there, and how long it runs. */
export function StoryLines({
  card,
  names,
  share,
  selected,
}: {
  card: StoryCard | undefined;
  names: (id: string) => string;
  share: number;
  selected: boolean;
}) {
  const empty = !card || card.opening === '';
  const present = card?.present ?? [];
  return (
    <View style={styles.story}>
      {empty ? (
        <Text style={[styles.storyLine, { color: colors.muted }]}>Not begun.</Text>
      ) : (
        <>
          <Said tag="OPENS" text={card.opening} />
          {card.closing !== '' && <Said tag="ENDS" text={card.closing} />}
        </>
      )}
      {present.length > 0 && (
        <Text style={styles.storyPresent} numberOfLines={1}>
          {present.map(names).join(', ')}
        </Text>
      )}
      <View style={[styles.storyRule, { width: `${Math.max(2, Math.min(1, share) * 100)}%`, opacity: selected ? 0.75 : 0.4 }]} />
    </View>
  );
}

function Said({ tag, text }: { tag: string; text: string }) {
  return (
    <View style={styles.said}>
      <Text style={styles.saidTag}>{tag}</Text>
      <Text style={styles.storyLine} numberOfLines={3}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: 4,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  dayCard: { backgroundColor: '#15140F', gap: 6 },
  kicker: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.6, color: colors.gold },
  headline: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  muted: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 19, color: colors.muted },
  count: { fontFamily: fonts.numbers, fontSize: 12, color: colors.muted },
  weeks: { marginVertical: space.sm },
  weekRow: { flexDirection: 'row', alignSelf: 'center' },
  initial: { fontFamily: fonts.ui, fontSize: 10, color: colors.muted, textAlign: 'center', marginBottom: 2 },
  offers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.xs },
  offerText: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold },
  pinned: { gap: 2, padding: space.sm, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: 'rgba(243,182,58,0.08)', borderRadius: 4, marginBottom: space.xs },
  pinnedLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.6, color: colors.gold },
  pinnedText: { fontFamily: fonts.bookItalic, fontSize: 14, lineHeight: 21, color: colors.text },
  roadHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: space.sm },
  road: { height: 48, marginTop: 4 },
  gap: { flexDirection: 'row', gap: space.sm, minHeight: 48, paddingVertical: 6, paddingHorizontal: 2, borderRadius: radius.field },
  gapNote: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 21, color: colors.text },
  gapText: { fontFamily: fonts.book, fontSize: 14, lineHeight: 21 },
  gapFaint: { color: colors.muted },
  gapSticky: { color: colors.gold, backgroundColor: 'rgba(243,182,58,0.2)', fontWeight: '700' },
  gapWhere: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 2 },
  more: { minHeight: 40, justifyContent: 'center' },
  moreText: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold },
  story: { gap: 4, paddingTop: 2, paddingBottom: space.sm, paddingRight: 4 },
  said: { flexDirection: 'row', gap: 6 },
  saidTag: { width: 44, paddingTop: 3, fontFamily: fonts.ui, fontSize: 9.5, letterSpacing: 1.3, color: colors.gold },
  storyLine: { flex: 1, fontFamily: fonts.bookItalic, fontSize: 14, lineHeight: 19, color: 'rgba(248,250,252,0.82)' },
  storyPresent: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 2 },
  storyRule: { height: 3, borderRadius: 2, backgroundColor: colors.gold, marginTop: 4 },
});
