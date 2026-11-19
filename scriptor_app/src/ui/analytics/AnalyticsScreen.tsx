// ANALYTICS (DESIGN.md: the five areas): the open novel's writing progress, its analytics, and the keepsakes made from
// it, as tabs (the owner's plan: Progress, Analytics and the Keepsakes are tabs inside Analytics). A port of the Flutter
// app's Progress area: features/progress/{progress_page,analytics_page}.dart and the keepsakes' shelf.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoldButton, Icon, type IconName, Muted, Panel } from '../kit';
import { useOpenNovel } from '../organize/useNovel';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { AnalyticsPane } from './AnalyticsPane';
import { KeepsakesPane } from './KeepsakesPane';
import { ProgressPane } from './ProgressPane';
import { AreaTools } from '../search/AreaTools';

export type Tab = 'progress' | 'analytics' | 'keepsakes';
const tabs: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'progress', label: 'Progress', icon: 'trending-up' },
  { key: 'analytics', label: 'Analytics', icon: 'chart-bar' },
  { key: 'keepsakes', label: 'Keepsakes', icon: 'gift-outline' },
];

/** The tab last chosen, kept while the app runs: coming back from a keepsake opens where you were. */
const remembered: { tab: Tab } = { tab: 'progress' };
/** Who shows it now, told when it is chosen from outside (search, the tutorial's "Take me there"). */
const heard = new Set<(v: Tab) => void>();

/** What is shown, or last shown. */
export function currentAnalyticsTab(): Tab {
  return remembered.tab;
}

/** Opens Analytics on `tab` next time it is shown, or now when it is showing. */
export function rememberAnalyticsTab(tab: Tab): void {
  remembered.tab = tab;
  for (const h of [...heard]) h(tab);
}

export function AnalyticsScreen() {
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
  const setTab = (t: Tab) => {
    remembered.tab = t;
    setTabState(t);
  };

  if (!novel) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Panel style={styles.empty}>
          <Icon name="chart-bar" size={40} />
          <Text style={styles.emptyTitle}>No novel open</Text>
          <Muted style={styles.centerText}>Analytics works inside one novel. Open one from your Library.</Muted>
          <GoldButton label="Go to Library" icon="book-open-page-variant-outline" onPress={() => router.navigate('/')} />
        </Panel>
      </View>
    );
  }
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={[styles.head, phone && styles.headPhone, styles.headRow]}>
        <View style={styles.headWords}>
          <Text style={styles.title} accessibilityRole="header">
            Analytics
          </Text>
          <Text style={styles.novel} numberOfLines={1}>
            {String(novel.snapshot.project['title'] ?? '') || 'Untitled novel'}
          </Text>
        </View>
        <AreaTools />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(t.key)} style={[styles.tab, on && styles.tabOn]}>
              <Icon name={t.icon} size={18} color={on ? colors.onGold : colors.gold} />
              <Text style={[styles.tabText, on && { color: colors.onGold }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {/* Each tab's pane sits in this page's scroll (they are made to, as Plan's and Review's are). */}
      <ScrollView key={tab} style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {tab === 'progress' ? <ProgressPane /> : tab === 'analytics' ? <AnalyticsPane /> : <KeepsakesPane />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
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
  body: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
});
