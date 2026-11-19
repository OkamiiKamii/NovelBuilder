// PICK UP THE THREAD: the top of the Library, for the writer who opens the app to write. The book last worked in fills
// the top of the screen as its own jacket (its colour and genre pattern, the title over it), then the chapter they
// stopped in, the last lines they wrote there, the note they left themselves for next time, today's words against the
// day's goal, and one button that opens that chapter with the caret at its last word.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type BookDay, carryOnNode, dayBookHeadline, dayBookOf, dayLabel, weekInitials, writingSessionOf } from '../../domain/desk/dayBook';
import { formatNumber } from '../../domain/desk/format';
import { displayTitle, nextNotesKey, readNextNotes } from '../../domain/desk/pageAround';
import { dailyChoices, pagesOf } from '../../domain/goals/goalPledge';
import { readReminder, reminderChoices, reminderLabel, reminderSetting, type ReminderTime } from '../../domain/goals/reminder';
import type { Novel } from '../../domain/novel';
import { blockTexts, lastLines } from '../../domain/prose';
import type { StoryNode } from '../../domain/outline';
import { GoldButton, Icon, Muted, OutlineButton, ProgressBar } from '../kit';
import type { Library } from '../../data/library';
import { colors, fonts, glow, radius, space, tints } from '../theme';
import { lastNodeSetting } from '../write/WriteScreen';
import { NovelCover } from './NovelCover';

export type PickUpPlace = {
  novel: Novel;
  chapter: StoryNode;
  lines: string | null;
  /** The writer's own "next time" note on that chapter, if they left one. */
  note: string | null;
  today: number;
  goal: number | null;
  /** This week, Monday to Sunday, and the run of days ("3 days in a row · write today to keep it"). */
  week: BookDay[];
  run: string;
  /** The daily nudge's time, or null with none. */
  reminder: ReminderTime | null;
};

/** Where the writer left off: the most recently opened book that is not archived, and its chapter. Null when no book
 * has been opened yet, or the book has no chapter. */
export function pickUpPlace(lib: Library, novels: readonly Novel[]): PickUpPlace | null {
  const novel = novels
    .filter((n) => !n.archived && n.lastOpenedAt !== null)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0];
  if (!novel) return null;
  const chapter = carryOnNode(lib.manuscript.nodes(novel.id), lib.settings.read(lastNodeSetting(novel.id)));
  if (!chapter) return null;
  const saved = lib.novels.row(novel.id, 'chapterContents', chapter.id);
  return {
    novel,
    chapter,
    // Short enough to stand whole in four lines on a phone: the last words are the point.
    lines: lastLines(blockTexts(saved?.['doc']), 130),
    note: readNextNotes(lib.settings.read(nextNotesKey(novel.id))).get(chapter.id)?.text ?? null,
    today: lib.manuscript.wordsWritten(novel.id).today,
    reminder: readReminder(lib.settings.read(reminderSetting)),
    ...(() => {
      const book = dayBookOf(lib.novels.rowsIn(novel.id, 'writingSessions').map(writingSessionOf), Date.now(), 1);
      return { week: book.days, run: dayBookHeadline(book) };
    })(),
    goal: lib.manuscript.wordGoals(novel.id).daily,
  };
}

export function PickUp({
  place,
  wide,
  onContinue,
  onSprint,
  onPledge,
  onRemind,
}: {
  place: PickUpPlace;
  wide: boolean;
  onContinue: () => void;
  /** "15 min": the same chapter, with a sprint started. */
  onSprint: () => void;
  /** With no daily goal yet: the writer chose one of the paces here. */
  onPledge: (words: number) => void;
  /** A time chosen for the daily nudge, or null to stop it. */
  onRemind: (time: ReminderTime | null) => void;
}) {
  const { novel, chapter, lines, note, today, goal } = place;
  const title = novel.title || 'Untitled novel';
  // A slim strip, so the novels stand on the first screen (the owner's choice, 2026-11-18); the week, the nudge and the
  // day's goal open under it.
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${displayTitle(chapter)}. ${open ? 'Hide' : 'Show'} this week and today's goal`}
        onPress={() => setOpen(!open)}
        style={styles.strip}
      >
        <View style={styles.cover}>
          <NovelCover novel={novel} height={wide ? 104 : 88} showTitle={false} />
        </View>
        <View style={styles.text}>
          <Text style={styles.kicker} numberOfLines={1}>
            {displayTitle(chapter)}
          </Text>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.lines} numberOfLines={2}>
            {lines ?? 'The page is still blank. The first line is yours.'}
          </Text>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.gold} />
      </Pressable>
      {goal !== null && goal > 0 && (
        <View style={styles.today}>
          <Muted>
            Today: {today.toLocaleString('en-US')} of {goal.toLocaleString('en-US')} words
          </Muted>
          <ProgressBar value={today / goal} />
        </View>
      )}
      <View style={styles.actions}>
        <GoldButton
          label={lines === null ? 'Start writing' : 'Continue writing'}
          icon="feather"
          onPress={onContinue}
          accessibilityLabel={`Continue writing ${title}, ${displayTitle(chapter)}, at your last line`}
          style={styles.flex}
        />
        <OutlineButton
          label="15 min"
          icon="timer-outline"
          onPress={onSprint}
          accessibilityLabel={`Write in ${title} for 15 minutes: a sprint, from your last line`}
        />
      </View>
      {open && (
        <View style={styles.more}>
          {note !== null && (
            <View style={styles.note} accessible accessibilityLabel={`Your note for next time: ${note}`}>
              <Icon name="pin-outline" size={18} color={colors.gold} />
              <View style={styles.flex}>
                <Text style={styles.noteLabel}>Your note for next time</Text>
                <Text style={styles.noteText} numberOfLines={3}>
                  {note}
                </Text>
              </View>
            </View>
          )}
          <WeekStrip days={place.week} run={place.run} />
          <Nudge time={place.reminder} onRemind={onRemind} />
          {(goal === null || goal <= 0) && <Pledge today={today} onPledge={onPledge} />}
        </View>
      )}
    </View>
  );
}

/** This week as seven marks, Monday first: gold for a day written, a gold ring for today still to write, faint for the
 * rest; and the run of days beside them. */
function WeekStrip({ days, run }: { days: BookDay[]; run: string }) {
  return (
    <View style={styles.week} accessible accessibilityLabel={`This week. ${run}. ${days.map(dayLabel).filter(Boolean).join('. ')}`}>
      <View style={styles.weekDays} importantForAccessibility="no-hide-descendants">
        {days.map((d, i) => (
          <View key={d.key} style={styles.weekDay}>
            <View
              style={[
                styles.dot,
                d.written ? styles.dotWritten : d.today ? styles.dotToday : d.ahead ? styles.dotAhead : styles.dotMissed,
              ]}
            />
            <Text style={[styles.weekInitial, d.today && styles.weekInitialToday]}>{weekInitials[i]}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.run} numberOfLines={2}>
        {run}
      </Text>
    </View>
  );
}

/** The daily nudge: the three times to choose from, or the time chosen and Off. */
function Nudge({ time, onRemind }: { time: ReminderTime | null; onRemind: (time: ReminderTime | null) => void }) {
  if (time !== null) {
    return (
      <View style={styles.nudge}>
        <Icon name="bell-ring-outline" size={18} color={colors.gold} />
        <Text style={styles.nudgeText}>A nudge at {reminderLabel(time)}, never on a day you have written</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Stop the daily nudge" onPress={() => onRemind(null)} hitSlop={8}>
          <Text style={styles.nudgeOff}>Off</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.nudgeAsk}>
      <View style={styles.nudge}>
        <Icon name="bell-outline" size={18} color={colors.muted} />
        <Text style={styles.nudgeText}>A nudge each day, at the hour you write?</Text>
      </View>
      <View style={styles.nudgeTimes}>
        {reminderChoices.map((c) => (
          <Pressable
            key={c.label}
            accessibilityRole="button"
            accessibilityLabel={`Nudge me each day at ${reminderLabel(c.time)}`}
            onPress={() => onRemind(c.time)}
            style={({ pressed }) => [styles.nudgeTime, pressed && styles.pacePressed]}
          >
            <Text style={styles.nudgeTimeLabel}>{c.label}</Text>
            <Text style={styles.nudgeTimeAt}>{reminderLabel(c.time)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** No daily goal yet: the question, and the four paces as cards to press, each its words and what that is in pages.
 * One press sets the goal; the ring on Write and the day's seal follow from it. */
function Pledge({ today, onPledge }: { today: number; onPledge: (words: number) => void }) {
  return (
    <View style={styles.pledge}>
      <Text style={styles.pledgeTitle}>HOW MUCH A DAY?</Text>
      <View style={styles.paces}>
        {dailyChoices.map((w) => (
          <Pressable
            key={w}
            accessibilityRole="button"
            accessibilityLabel={`Set a daily goal of ${formatNumber(w)} words: ${pagesOf(w)}`}
            onPress={() => onPledge(w)}
            style={({ pressed }) => [styles.pace, pressed && styles.pacePressed]}
          >
            <Text style={styles.paceWords} numberOfLines={1} adjustsFontSizeToFit>
              {formatNumber(w)}
            </Text>
            <Text style={styles.pacePages} numberOfLines={2}>
              {pagesOf(w).replace('About ', '')}
            </Text>
          </Pressable>
        ))}
      </View>
      <Muted>
        Today so far: {formatNumber(today)} {today === 1 ? 'word' : 'words'}. Your own numbers are under the Today line as you write.
      </Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  panel: {
    marginBottom: space.lg,
    padding: space.md,
    gap: space.md,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: tints.panel,
    boxShadow: glow.gold,
  },
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cover: { width: 64, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: tints.goldRule },
  text: { flex: 1, gap: 2 },
  kicker: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 1.4, color: colors.gold, textTransform: 'uppercase' },
  title: { fontFamily: fonts.display, fontWeight: '700', fontSize: 20, lineHeight: 25, color: colors.text },
  lines: { fontFamily: fonts.bookItalic, fontSize: 14, lineHeight: 20, color: colors.text, opacity: 0.85 },
  today: { gap: 4 },
  actions: { flexDirection: 'row', gap: space.sm },
  more: { gap: space.md, paddingTop: space.xs, borderTopWidth: 1, borderTopColor: colors.border },
  note: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: tints.goldRule,
    backgroundColor: colors.elevated,
  },
  noteLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, color: colors.gold, marginBottom: 2 },
  noteText: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 22, color: colors.text },
  pledge: { gap: space.sm },
  nudgeAsk: { gap: space.sm },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  nudgeText: { flex: 1, fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.text },
  nudgeOff: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.gold, textDecorationLine: 'underline' },
  nudgeTimes: { flexDirection: 'row', gap: space.sm },
  nudgeTime: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 6,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: tints.goldRule,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeTimeLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.gold },
  nudgeTimeAt: { fontFamily: fonts.numbers, fontSize: 11, color: colors.muted },
  week: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  weekDays: { flexDirection: 'row', gap: 6 },
  weekDay: { alignItems: 'center', gap: 3, width: 20 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  dotWritten: { backgroundColor: colors.gold },
  dotToday: { borderWidth: 2, borderColor: colors.gold },
  dotMissed: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated },
  dotAhead: { borderWidth: 1, borderColor: colors.border, opacity: 0.5 },
  weekInitial: { fontFamily: fonts.ui, fontSize: 10, color: colors.muted },
  weekInitialToday: { color: colors.gold, fontWeight: '700' },
  run: { flex: 1, fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.text },
  pledgeTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  paces: { flexDirection: 'row', gap: space.sm },
  pace: {
    flex: 1,
    minHeight: 72,
    paddingVertical: space.sm,
    paddingHorizontal: 4,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: tints.goldRule,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pacePressed: { borderColor: colors.gold, transform: [{ scale: 0.96 }] },
  paceWords: { fontFamily: fonts.display, fontWeight: '700', fontSize: 22, color: colors.gold },
  pacePages: { fontFamily: fonts.ui, fontSize: 11, lineHeight: 14, color: colors.muted, textAlign: 'center' },
});
