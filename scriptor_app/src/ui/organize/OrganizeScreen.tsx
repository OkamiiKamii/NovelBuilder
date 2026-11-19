// ORGANIZE (DESIGN.md: the five areas): the novel's people and world, the systems characters grow by and the genre
// modules (the Flutter app's Organize parts), and, as tabs, Plan and Visualize. Characters (phase 4), the World (5a),
// Modules (5b), Systems (5c), Plan (6a) and Visualize, the atlas of views (6b), are all here.

import { useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoldButton, Icon, type IconName, Muted, Panel } from '../kit';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { CastPane } from './CastPane';
import { SystemsPane } from '../systems/SystemsPane';
import { ModulesPane } from './ModulesPane';
import { PlanPane } from '../plan/PlanPane';
import { ReviewPane } from '../review/ReviewPane';
import { AreaTools } from '../search/AreaTools';
import { VisualizePane } from '../visualize/VisualizePane';
import { WorldPane } from './WorldPane';
import { useOpenNovel } from './useNovel';

export type Tab = 'characters' | 'world' | 'systems' | 'modules' | 'plan' | 'visualize' | 'review';
const tabs: { key: Tab; label: string; icon: IconName; later?: { phase: string; holds: string[] } }[] = [
  { key: 'characters', label: 'Characters', icon: 'account-group-outline' },
  {
    key: 'world',
    label: 'World',
    icon: 'earth',
  },
  {
    key: 'systems',
    label: 'Systems',
    icon: 'family-tree',
  },
  { key: 'modules', label: 'Modules', icon: 'puzzle-outline' },
  {
    key: 'plan',
    label: 'Plan',
    icon: 'timeline-text-outline',
  },
  {
    key: 'visualize',
    label: 'Visualize',
    icon: 'graph-outline',
  },
  { key: 'review', label: 'Review', icon: 'check-decagram-outline' },
];

/** The tab last chosen, kept while the app runs: coming back from an entry or a character opens where you were. */
const remembered: { tab: Tab } = { tab: 'characters' };
/** Who shows it now, told when it is chosen from outside (search, the tutorial's "Take me there"). */
const heard = new Set<(v: Tab) => void>();

/** What is shown, or last shown. */
export function currentOrganizeTab(): Tab {
  return remembered.tab;
}

/** Opens Organize on `tab` next time it is shown (the modules route, "All modules", lands on the Modules tab). */
export function rememberOrganizeTab(tab: Tab): void {
  remembered.tab = tab;
  for (const h of [...heard]) h(tab);
}

export function OrganizeScreen() {
  const novel = useOpenNovel();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const phone = sizeClassOf(useWindowDimensions().width) === 'compact';
  const [tab, setTabState] = useState<Tab>(remembered.tab);
  useEffect(() => {
    heard.add(setTabState);
    return () => {
      heard.delete(setTabState);
    };
  }, []);
  const tabRow = useRef<ComponentRef<typeof ScrollView>>(null);
  const setTab = (t: Tab) => {
    remembered.tab = t;
    setTabState(t);
  };

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
      <View style={[styles.head, phone && styles.headPhone, styles.headRow]}>
        <View style={styles.headWords}>
          <Text style={styles.title} accessibilityRole="header">
            Organize
          </Text>
          <Text style={styles.novel} numberOfLines={1}>
            {String(novel.snapshot.project['title'] ?? '') || 'Untitled novel'}
          </Text>
        </View>
        <AreaTools />
      </View>
      <ScrollView ref={tabRow} horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setTab(t.key)}
              // Coming back on a tab off the right of the row (Plan, Visualize): the row is brought round to it.
              onLayout={on ? (e) => tabRow.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - space.md), animated: false }) : undefined}
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
      ) : tab === 'world' ? (
        <WorldPane />
      ) : tab === 'systems' ? (
        <SystemsPane />
      ) : tab === 'modules' ? (
        <ModulesPane />
      ) : tab === 'visualize' ? (
        <VisualizePane />
      ) : tab === 'plan' ? (
        <PlanPane />
      ) : tab === 'review' ? (
        <ReviewPane />
      ) : (
        <CastPane novel={novel} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: space.md, margin: space.lg, maxWidth: 420 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  head: { paddingHorizontal: space.xl, paddingTop: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  headWords: { flex: 1 },
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
