// The areas still to be rebuilt (Write, Organize, Analytics): what they will hold, and which novel is open.

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openNovelSettingKey } from '../data/settingsStore';

import { Icon, type IconName, Muted, Panel } from './kit';
import { useLibrary, useLibraryRevision } from './LibraryContext';
import { colors, fonts, sizeClassOf, space } from './theme';

export function ComingSoon({ icon, title, phase, holds }: { icon: IconName; title: string; phase: string; holds: string[] }) {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const insets = useSafeAreaInsets();
  const phone = sizeClassOf(useWindowDimensions().width) === 'compact';
  const open = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' ? lib.library.novel(id) : null;
    // revision: read again after every write.
  }, [lib, revision]);
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: (phone ? 0 : insets.bottom) + space.xl,
        paddingHorizontal: phone ? space.md : space.xl,
      }}
    >
      <View style={styles.heading}>
        <Icon name={icon} size={28} />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {open && (
        <Panel active style={styles.block}>
          <Muted>OPEN NOVEL</Muted>
          <Text style={styles.novel}>{open.title || 'Untitled novel'}</Text>
        </Panel>
      )}
      <Panel style={styles.block}>
        <Text style={styles.soon}>Coming in {phase}</Text>
        {holds.map((h) => (
          <View key={h} style={styles.item}>
            <Icon name="circle-small" size={22} color={colors.sky} />
            <Text style={styles.itemText}>{h}</Text>
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.text },
  block: { marginTop: space.lg },
  novel: { marginTop: 4, fontFamily: fonts.display, fontSize: 22, color: colors.text },
  soon: { fontFamily: fonts.ui, fontSize: 16, letterSpacing: 1.2, color: colors.gold, marginBottom: space.sm },
  item: { flexDirection: 'row', alignItems: 'center' },
  itemText: { flex: 1, fontFamily: fonts.ui, fontSize: 15, lineHeight: 24, color: colors.text },
});
