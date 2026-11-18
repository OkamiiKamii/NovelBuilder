// PICK UP THE THREAD: the top of the Library, for the writer who opens the app to write. The book last worked in, the
// chapter they stopped in, the last lines they wrote there (set as a page, to step back into), today's words against
// the day's goal, and one button that opens that chapter with the caret at its last word.

import { StyleSheet, Text, View } from 'react-native';

import { carryOnNode } from '../../domain/desk/dayBook';
import { displayTitle } from '../../domain/desk/pageAround';
import type { Novel } from '../../domain/novel';
import { blockTexts, lastLines } from '../../domain/prose';
import type { StoryNode } from '../../domain/outline';
import { GoldButton, Muted, Panel, ProgressBar } from '../kit';
import type { Library } from '../../data/library';
import { colors, fonts, space } from '../theme';
import { lastNodeSetting } from '../write/WriteScreen';
import { NovelCover } from './NovelCover';

export type PickUpPlace = { novel: Novel; chapter: StoryNode; lines: string | null; today: number; goal: number | null };

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
    today: lib.manuscript.wordsWritten(novel.id).today,
    goal: lib.manuscript.wordGoals(novel.id).daily,
  };
}

export function PickUp({ place, wide, onContinue }: { place: PickUpPlace; wide: boolean; onContinue: () => void }) {
  const { novel, chapter, lines, today, goal } = place;
  const title = novel.title || 'Untitled novel';
  return (
    <Panel active style={styles.panel}>
      <View style={styles.row}>
        <View style={[styles.cover, wide && styles.coverWide]}>
          <NovelCover novel={novel} height={wide ? 150 : 112} showTitle={false} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.chapter} numberOfLines={1}>
            {displayTitle(chapter)}
          </Text>
          {lines !== null ? (
            <Text style={styles.lines} numberOfLines={4} accessibilityLabel={`Where you stopped: ${lines}`}>
              {lines}
            </Text>
          ) : (
            <Text style={styles.lines}>The page is still blank. The first line is yours.</Text>
          )}
        </View>
      </View>
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
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: space.lg, gap: space.md },
  row: { flexDirection: 'row', gap: space.lg },
  cover: { width: 76, alignSelf: 'flex-start', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  coverWide: { width: 100 },
  text: { flex: 1, gap: space.xs },
  title: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.text },
  chapter: { fontFamily: fonts.ui, fontSize: 13, letterSpacing: 1.2, color: colors.gold },
  lines: { marginTop: space.xs, fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 23, color: colors.text, opacity: 0.88 },
  ornament: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rule: { flex: 1, height: 1, backgroundColor: colors.gold, opacity: 0.45 },
  diamond: { width: 7, height: 7, borderWidth: 1, borderColor: colors.gold, transform: [{ rotate: '45deg' }] },
  foot: { gap: space.md },
  footWide: { flexDirection: 'row', alignItems: 'center' },
  today: { flex: 1, gap: 6 },
  fullWidth: { alignSelf: 'stretch' },
});
