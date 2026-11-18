// A keepsake's tile, as the row and the shelf show it: its colours, its icon, the capitals at its head and its line,
// black bars (the trailer's film) or threads of colour (the fingerprint) along it, and a gold NEW ribbon until it has
// been opened. A port of the tile in flutter_app/lib/app/shell/keepsakes.dart.

import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type Keepsake, keepsakesOpenedSettingKey, openedOf, tileLabel, tileThreads } from '../../domain/keepsakes/shelf';
import { Icon, type IconName } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { fonts } from '../theme';

/** Material's icon names (the Flutter app's) as Material Community's. */
const icons: Readonly<Record<string, IconName>> = {
  newspaper: 'newspaper-variant-outline',
  quiz_outlined: 'head-question-outline',
  local_post_office_outlined: 'mailbox-outline',
  play_circle_outline: 'play-circle-outline',
  format_quote: 'format-quote-close',
  picture_as_pdf_outlined: 'file-pdf-box',
  auto_stories_outlined: 'book-open-page-variant-outline',
  fingerprint: 'fingerprint',
  menu_book_outlined: 'book-open-outline',
};

export const keepsakeIcon = (k: Keepsake): IconName => icons[k.icon] ?? 'gift-outline';

/** The keepsakes opened on this device, read again whenever a setting changes. */
export function useOpened(): Set<string> {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  return useMemo(() => openedOf(lib.settings.read(keepsakesOpenedSettingKey)), [lib, revision]); // eslint-disable-line react-hooks/exhaustive-deps
}

const ink = '#FFF8EC';

export function KeepsakeTile({ k, isNew, width, onPress, tilt = 0 }: { k: Keepsake; isNew: boolean; width: number; onPress: () => void; tilt?: number }) {
  const colours = (k.colours.length >= 2 ? k.colours : [k.colours[0] ?? '#333333', k.colours[0] ?? '#333333']) as [string, string, ...string[]];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tileLabel(k, isNew)}
      onPress={onPress}
      style={({ pressed }) => [{ width, transform: [{ rotate: `${tilt}rad` }], opacity: pressed ? 0.85 : 1 }]}
    >
      <LinearGradient colors={colours} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tile, { height: width * 1.2 }]}>
        {k.bars ? (
          <>
            <View style={[styles.bar, styles.barTop]} />
            <View style={[styles.bar, styles.barLow]} />
          </>
        ) : null}
        {k.stripes ? (
          <View style={styles.threads}>
            {tileThreads.map((t, i) => (
              <View key={i} style={{ flex: 1, height: t.height, backgroundColor: t.colour, opacity: t.alpha }} />
            ))}
          </View>
        ) : null}
        <Icon name={keepsakeIcon(k)} size={30} color={ink} />
        <View style={styles.words}>
          <Text style={styles.kicker} numberOfLines={1}>
            {k.kicker}
          </Text>
          <Text style={styles.line} numberOfLines={3}>
            {k.line}
          </Text>
        </View>
        {isNew ? (
          <View style={styles.ribbon}>
            <Text style={styles.ribbonText}>NEW</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 12, padding: 12, justifyContent: 'space-between', overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, right: 0, height: 10, backgroundColor: '#000000' },
  barTop: { top: 0 },
  barLow: { bottom: 0 },
  threads: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 2, opacity: 0.9 },
  words: { gap: 4, marginBottom: 14 },
  kicker: { fontFamily: fonts.display, fontSize: 11, letterSpacing: 1.6, color: '#F2C76E' },
  line: { fontFamily: fonts.book, fontSize: 12, lineHeight: 17, color: ink },
  ribbon: { position: 'absolute', top: 10, right: -22, width: 80, paddingVertical: 2, backgroundColor: '#E8C46A', transform: [{ rotate: '35deg' }], alignItems: 'center' },
  ribbonText: { fontFamily: fonts.ui, fontSize: 9, fontWeight: '700', letterSpacing: 1.4, color: '#2A1E05' },
});
