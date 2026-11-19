// THE SHELF: the Library's third view. Every novel stands as a book on a shelf, its spine in the book's own colour with
// gold bands and its title up the spine in Cinzel, as thick as it is written: each chapter written makes the spine on
// the shelf a little thicker. A press opens the book; a long press, its menu.

import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import type { NovelStats } from '../../data/novelStore';
import { shelfRows, spineHeight, spineThickness } from '../../domain/libraryView';
import type { Novel } from '../../domain/novel';
import { Icon } from '../kit';
import { colors, fonts, space } from '../theme';
import { shade } from './NovelCover';

const gap = 5;
const band = 'rgba(243, 182, 58, 0.8)';

type Book = { novel: Novel; words: number; thickness: number; height: number };

export function ShelfView({
  novels,
  stats,
  onOpen,
  onMenu,
}: {
  novels: readonly Novel[];
  stats: ReadonlyMap<string, NovelStats>;
  onOpen: (n: Novel) => void;
  onMenu: (n: Novel) => void;
}) {
  const [width, setWidth] = useState(0);
  const books: Book[] = novels.map((novel) => {
    const words = stats.get(novel.id)?.words ?? 0;
    return { novel, words, thickness: spineThickness(words), height: spineHeight(novel.id) };
  });
  const rows = width > 0 ? shelfRows(books, width - space.lg * 2, gap) : [];
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))} style={styles.case}>
      {rows.map((row, i) => (
        <View key={i}>
          <View style={styles.row}>
            {row.map((b) => (
              <Spine key={b.novel.id} book={b} onOpen={onOpen} onMenu={onMenu} />
            ))}
          </View>
          <LinearGradient colors={['#4A3510', '#2A1E08', '#120D04']} style={styles.board} />
        </View>
      ))}
      <Text style={styles.caption}>Each book stands as thick as it is written.</Text>
    </View>
  );
}

function Spine({ book, onOpen, onMenu }: { book: Book; onOpen: (n: Novel) => void; onMenu: (n: Novel) => void }) {
  const { novel, words, thickness: t, height: h } = book;
  const accent = /^#[0-9a-fA-F]{6}$/.test(novel.accent) ? novel.accent : '#b4532a';
  const title = novel.title || 'Untitled novel';
  // The title reads up the spine: laid out across the spine's height, then turned a quarter.
  const length = h - 42;
  // As large as the spine is thick, and small enough for the whole title to fit up it (Cinzel's capitals run wide).
  const size = Math.max(10, Math.min(16, Math.round(t * 0.34), Math.floor(length / (title.length * 0.72))));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${words.toLocaleString('en-US')} words${novel.pinned ? ', a favorite' : ''}. Opens it; hold for more.`}
      onPress={() => onOpen(novel)}
      onLongPress={() => onMenu(novel)}
      style={({ pressed }) => [{ width: t, height: h }, pressed && styles.pulled]}
    >
      <LinearGradient
        colors={[shade(accent, 0.55), shade(accent, 0.1), shade(accent, 0.3), shade(accent, 0.6)]}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, styles.spine]}
      />
      <View style={[styles.band, { top: 12 }]} />
      <View style={[styles.band, styles.bandThin, { top: 17 }]} />
      <View style={[styles.band, styles.bandThin, { bottom: 17 }]} />
      <View style={[styles.band, { bottom: 12 }]} />
      {novel.pinned && (
        <View style={styles.star}>
          <Icon name="star" size={Math.min(14, t - 14)} color={colors.gold} />
        </View>
      )}
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[
          styles.title,
          { width: length, height: t, lineHeight: t, fontSize: size, left: (t - length) / 2, top: (h - t) / 2 },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  case: { paddingTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap, paddingHorizontal: space.lg, minHeight: 200 },
  board: {
    height: 12,
    borderRadius: 2,
    borderTopWidth: 1,
    borderTopColor: colors.gold,
    marginBottom: space.lg,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  spine: { borderTopLeftRadius: 3, borderTopRightRadius: 3, borderWidth: 0.5, borderColor: 'rgba(0, 0, 0, 0.5)' },
  pulled: { transform: [{ translateY: -10 }] },
  band: { position: 'absolute', left: 3, right: 3, height: 2, backgroundColor: band },
  bandThin: { height: 1 },
  star: { position: 'absolute', top: 22, left: 0, right: 0, alignItems: 'center' },
  title: {
    position: 'absolute',
    textAlign: 'center',
    fontFamily: fonts.display,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.text,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowRadius: 3,
    transform: [{ rotate: '-90deg' }],
  },
  caption: { fontFamily: fonts.bookItalic, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
