// A full page of Plan (the scene board, a chapter's plan): a back arrow, a title and the novel's name, and the page
// scrolling under them, in the System Monolith frame of the other full pages (Categories & fields, a system).

import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Muted } from '../kit';
import { useLockableScroll } from '../scrollLock';
import { colors, fonts, space } from '../theme';

export function PlanPage({ title, subtitle, back, children }: { title: string; subtitle?: string; back: string; children: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Held still while a gesture inside needs the page to (the scene board's drag; scrollLock.tsx).
  const scroll = useLockableScroll();
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label={back} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/organize'))} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Muted numberOfLines={1}>{subtitle}</Muted> : null}
        </View>
      </View>
      <ScrollView {...scroll.scrollProps} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <scroll.Provider>{children}</scroll.Provider>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  body: { padding: space.md, gap: space.md, width: '100%', paddingBottom: space.xxl },
});
