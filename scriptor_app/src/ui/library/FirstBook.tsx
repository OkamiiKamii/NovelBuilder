// YOUR FIRST BOOK: the top of the Library while the writer has no novel of their own (only the sample, or nothing). A
// blank jacket waiting for its title, the title typed straight onto it, and one button that makes the book and opens
// Chapter 1 to write in: from opening the app to the first sentence in two steps. The full form (genre, target,
// synopsis…) stays one tap away under New Novel.

import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Novel, novelAccents } from '../../domain/novel';
import { GoldButton } from '../kit';
import { colors, fonts, glow, radius, space } from '../theme';
import { NovelCover } from './NovelCover';

export function FirstBook({ wide, onBegin }: { wide: boolean; onBegin: (title: string) => void }) {
  const [title, setTitle] = useState('');
  const height = wide ? 240 : 200;
  // A jacket with no genre yet: ruled manuscript paper, in the first of the book colours.
  const blank = useMemo(() => new Novel({ id: 'first-book', title: '', accent: novelAccents[0].hex, primaryGenre: '', secondaryGenres: [] }), []);
  const ready = title.trim().length > 0;
  return (
    <View style={styles.panel}>
      <View style={{ height }}>
        <NovelCover novel={blank} height={height} showTitle={false} backdrop />
        <LinearGradient
          colors={['rgba(10, 11, 14, 0)', 'rgba(10, 11, 14, 0.55)', colors.surface]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.heading}>
          <Text style={styles.kicker}>YOUR FIRST BOOK</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Its title…"
            placeholderTextColor="rgba(248, 250, 252, 0.45)"
            selectionColor={colors.gold}
            cursorColor={colors.gold}
            accessibilityLabel="The title of your novel"
            returnKeyType="go"
            onSubmitEditing={() => ready && onBegin(title.trim())}
            style={[styles.title, wide && styles.titleWide]}
            maxLength={120}
          />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.lines}>Every novel begins with a title and one line. Give it a name, and the first page is yours.</Text>
        <GoldButton
          label="Begin chapter one"
          icon="feather"
          disabled={!ready}
          onPress={() => onBegin(title.trim())}
          accessibilityLabel={ready ? `Make “${title.trim()}” and begin chapter one` : 'Type a title to begin'}
          style={wide ? styles.start : styles.fullWidth}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginBottom: space.lg,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    boxShadow: glow.gold,
  },
  heading: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.sm, gap: 2 },
  kicker: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, letterSpacing: 1.6, color: colors.gold },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: 30,
    minHeight: 52,
    paddingVertical: space.xs,
    paddingHorizontal: 0,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.gold,
  },
  titleWide: { fontSize: 38 },
  body: { padding: space.lg, paddingTop: space.md, gap: space.md },
  lines: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 25, color: colors.text, opacity: 0.9 },
  start: { alignSelf: 'flex-start' },
  fullWidth: { alignSelf: 'stretch' },
});
