// ORGANIZE (DESIGN.md: the five areas): the novel's people and world, and, as tabs, Plan and Visualize. Characters
// come first (phase 4); World, Plan and Visualize follow in their own phases and say so meanwhile.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoldButton, Icon, type IconName, Muted, Panel } from '../kit';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { CastPane } from './CastPane';
import { useOpenNovel } from './useNovel';

type Tab = 'characters' | 'world' | 'plan' | 'visualize';
const tabs: { key: Tab; label: string; icon: IconName; later?: { phase: string; holds: string[] } }[] = [
  { key: 'characters', label: 'Characters', icon: 'account-group-outline' },
  {
    key: 'world',
    label: 'World',
    icon: 'earth',
    later: { phase: 'phase 5', holds: ['Places, factions, items, powers and lore', 'Categories, fields and templates', 'Genre modules and systems'] },
  },
  {
    key: 'plan',
    label: 'Plan',
    icon: 'timeline-text-outline',
    later: { phase: 'phase 6', holds: ['Plot threads', 'The scene board and chapter plans', 'The timeline and events'] },
  },
  {
    key: 'visualize',
    label: 'Visualize',
    icon: 'graph-outline',
    later: { phase: 'phase 7', holds: ['The workspace and its views', 'Places, journeys, factions and ownership', 'The knowledge graph'] },
  },
];

export function OrganizeScreen() {
  const novel = useOpenNovel();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const phone = sizeClassOf(useWindowDimensions().width) === 'compact';
  const [tab, setTab] = useState<Tab>('characters');

  if (!novel) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Panel style={styles.empty}>
          <Icon name="account-group-outline" size={40} />
          <Text style={styles.emptyTitle}>No novel open</Text>
          <Muted style={styles.centerText}>Organize works inside one novel. Open one from your Library.</Muted>
          <GoldButton label="Go to Library" icon="book-open-page-variant-outline" onPress={() => router.navigate('/')} />
        </Panel>
      </View>
    );
  }
  const current = tabs.find((t) => t.key === tab)!;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={[styles.head, phone && styles.headPhone]}>
        <Text style={styles.title} accessibilityRole="header">
          Organize
        </Text>
        <Text style={styles.novel} numberOfLines={1}>
          {String(novel.snapshot.project['title'] ?? '') || 'Untitled novel'}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setTab(t.key)}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Icon name={t.icon} size={18} color={on ? colors.onGold : colors.gold} />
              <Text style={[styles.tabText, on && { color: colors.onGold }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {current.later ? (
        <ScrollView contentContainerStyle={styles.later}>
          <Panel>
            <Text style={styles.soon}>Coming in {current.later.phase}</Text>
            {current.later.holds.map((h) => (
              <View key={h} style={styles.item}>
                <Icon name="circle-small" size={22} color={colors.sky} />
                <Text style={styles.itemText}>{h}</Text>
              </View>
            ))}
          </Panel>
        </ScrollView>
      ) : (
        <CastPane novel={novel} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: space.md, margin: space.lg, maxWidth: 420 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  head: { paddingHorizontal: space.xl, paddingTop: space.md },
  headPhone: { paddingHorizontal: space.md },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.gold },
  novel: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  tabsScroll: { flexGrow: 0 },
  tabs: { gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  tabText: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  later: { padding: space.md },
  soon: { fontFamily: fonts.ui, fontSize: 16, letterSpacing: 1.2, color: colors.gold, marginBottom: space.sm },
  item: { flexDirection: 'row', alignItems: 'center' },
  itemText: { flex: 1, fontFamily: fonts.ui, fontSize: 15, lineHeight: 24, color: colors.text },
});
