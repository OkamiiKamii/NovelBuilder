// PICK UP THE THREAD: the top of the Library, for the writer who opens the app to write. The book last worked in fills
// the top of the screen as its own jacket (its colour and genre pattern, the title over it), then the chapter they
// stopped in, the last lines they wrote there, the note they left themselves for next time, today's words against the
// day's goal, and one button that opens that chapter with the caret at its last word.

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { carryOnNode } from '../../domain/desk/dayBook';
import { displayTitle, nextNotesKey, readNextNotes } from '../../domain/desk/pageAround';
import type { Novel } from '../../domain/novel';
import { blockTexts, lastLines } from '../../domain/prose';
import type { StoryNode } from '../../domain/outline';
import { GoldButton, Icon, Muted, ProgressBar } from '../kit';
import type { Library } from '../../data/library';
import { colors, fonts, radius, space, tints } from '../theme';
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
    goal: lib.manuscript.wordGoals(novel.id).daily,
  };
}

const banner = { phone: 200, wide: 240 };

export function PickUp({ place, wide, onContinue }: { place: PickUpPlace; wide: boolean; onContinue: () => void }) {
  const { novel, chapter, lines, note, today, goal } = place;
  const title = novel.title || 'Untitled novel';
  const height = wide ? banner.wide : banner.phone;
  return (
    <View style={styles.panel}>
      <View style={{ height }}>
        <NovelCover novel={novel} height={height} showTitle={false} backdrop />
        {/* The jacket darkens toward its foot, so the title reads and the banner runs into the page below. */}
        <LinearGradient
          colors={['rgba(10, 11, 14, 0)', 'rgba(10, 11, 14, 0.55)', colors.surface]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.heading}>
          <Text style={styles.kicker} numberOfLines={1}>
            {displayTitle(chapter)}
          </Text>
          <Text style={[styles.title, wide && styles.titleWide]} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        {lines !== null ? (
          <Text style={styles.lines} numberOfLines={4} accessibilityLabel={`Where you stopped: ${lines}`}>
            {lines}
          </Text>
        ) : (
          <Text style={styles.lines}>The page is still blank. The first line is yours.</Text>
        )}
        {note !== null && (
          <View style={styles.note} accessible accessibilityLabel={`Your note for next time: ${note}`}>
            <Icon name="pin-outline" size={18} color={colors.gold} />
            <View style={styles.flex}>
              <Text style={styles.noteLabel}>YOUR NOTE FOR NEXT TIME</Text>
              <Text style={styles.noteText} numberOfLines={3}>
                {note}
              </Text>
            </View>
          </View>
        )}
        <View style={styles.ornament} importantForAccessibility="no-hide-descendants">
          <View style={styles.rule} />
          <View style={styles.diamond} />
          <View style={styles.rule} />
        </View>
        <View style={[styles.foot, wide && styles.footWide]}>
          <View style={styles.today}>
            {goal !== null && goal > 0 ? (
              <>
                <Muted>
                  Today: {today.toLocaleString('en-US')} of {goal.toLocaleString('en-US')} words
                </Muted>
                <ProgressBar value={today / goal} />
              </>
            ) : (
              <Muted>
                Today: {today.toLocaleString('en-US')} {today === 1 ? 'word' : 'words'}
              </Muted>
            )}
          </View>
          <GoldButton
            label={lines === null ? 'Start writing' : 'Continue writing'}
            icon="feather"
            onPress={onContinue}
            accessibilityLabel={`Continue writing ${title}, ${displayTitle(chapter)}, at your last line`}
            style={wide ? undefined : styles.fullWidth}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  panel: {
    marginBottom: space.lg,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    shadowColor: colors.gold,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  heading: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.md, gap: 2 },
  kicker: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, letterSpacing: 1.6, color: colors.gold, textTransform: 'uppercase' },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: 30,
    lineHeight: 36,
    color: colors.text,
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowRadius: 10,
  },
  titleWide: { fontSize: 38, lineHeight: 44 },
  body: { padding: space.lg, paddingTop: space.sm, gap: space.md },
  lines: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 25, color: colors.text, opacity: 0.9 },
  note: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: tints.goldRule,
    backgroundColor: colors.elevated,
  },
  noteLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 11, letterSpacing: 1.4, color: colors.gold, marginBottom: 2 },
  noteText: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 22, color: colors.text },
  ornament: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rule: { flex: 1, height: 1, backgroundColor: colors.gold, opacity: 0.45 },
  diamond: { width: 7, height: 7, borderWidth: 1, borderColor: colors.gold, transform: [{ rotate: '45deg' }] },
  foot: { gap: space.md },
  footWide: { flexDirection: 'row', alignItems: 'center' },
  today: { flex: 1, gap: 6 },
  fullWidth: { alignSelf: 'stretch' },
});
