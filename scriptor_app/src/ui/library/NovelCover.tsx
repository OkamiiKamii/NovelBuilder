// A novel's cover: its own picture when it has one (stored in the novel), otherwise a designed jacket in the System
// Monolith look, lit in the book's colour, with a motif from its genre. A picture given as a web address is kept in
// the novel but never fetched (the app makes no network requests), so it shows the designed jacket.

import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { Novel } from '../../domain/novel';
import { Icon, type IconName } from '../kit';
import { colors, fonts } from '../theme';

function motifOf(novel: Novel): IconName {
  const genres = [novel.primaryGenre, ...novel.secondaryGenres].join(' ').toLowerCase();
  if (/sci|space|cyber|star/.test(genres)) return 'orbit';
  if (/romance|love/.test(genres)) return 'heart-outline';
  if (/myster|detective|crime|thriller/.test(genres)) return 'magnify';
  if (/horror|dark|gothic/.test(genres)) return 'moon-waning-crescent';
  if (/adventure|sea|journey/.test(genres)) return 'compass-outline';
  if (/litrpg|progression|cultivation|system/.test(genres)) return 'sword-cross';
  if (/fantasy|magic|myth/.test(genres)) return 'castle';
  return 'book-open-variant';
}

/** Darkens a #rrggbb colour toward black. */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

export function NovelCover({ novel, height, showTitle = true }: { novel: Novel; height: number; showTitle?: boolean }) {
  const cover = novel.cover;
  if (cover && cover.startsWith('data:image/')) {
    return (
      <Image
        source={{ uri: cover }}
        style={[styles.image, { height }]}
        resizeMode="cover"
        accessibilityLabel={`Cover of ${novel.title}`}
      />
    );
  }
  const accent = /^#[0-9a-fA-F]{6}$/.test(novel.accent) ? novel.accent : '#b4532a';
  return (
    <LinearGradient
      colors={[shade(accent, 0.15), shade(accent, 0.65), colors.background]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.jacket, { height }]}
      accessible
      accessibilityLabel={`Cover of ${novel.title}`}
    >
      <View style={styles.frame} />
      <View style={styles.motif}>
        <Icon name={motifOf(novel)} size={Math.round(height * 0.32)} color="rgba(243, 182, 58, 0.85)" />
      </View>
      {showTitle && (
        <Text style={[styles.title, { fontSize: Math.max(13, Math.round(height / 11)) }]} numberOfLines={3}>
          {novel.title || 'Untitled novel'}
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', backgroundColor: colors.elevated },
  jacket: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frame: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(243, 182, 58, 0.55)',
    borderRadius: 4,
  },
  motif: { opacity: 0.9 },
  title: {
    marginTop: 8,
    paddingHorizontal: 18,
    textAlign: 'center',
    fontFamily: fonts.display,
    color: colors.text,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
});
