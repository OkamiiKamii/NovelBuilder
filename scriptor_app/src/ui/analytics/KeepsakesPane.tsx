// THE KEEPSAKES (FEATURES.md #338–#347), as a tab of Analytics: everything the book can be made into, a row of tiles
// (the ones not yet opened first, each with a gold NEW ribbon until it is), "See the shelf" for all of them at once,
// and the submission kit. Each opens its own page under /keepsakes. A port of the keepsakes row and the submission
// card of the Flutter app's shell (flutter_app/lib/app/shell/{keepsakes,submission_card}.dart).
//
// It sits in the Analytics area's scroll view (no scroll of its own, but the row's).

import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { keepsakesOf, rowCount, rowOrder } from '../../domain/keepsakes/shelf';
import { KeepsakeTile, useOpened } from '../keepsakes/tiles';
import { Icon, Muted, OutlineButton, Panel } from '../kit';
import { useOpenNovel } from '../organize/useNovel';
import { colors, fonts, space } from '../theme';

export function KeepsakesPane() {
  const open = useOpenNovel();
  const router = useRouter();
  const opened = useOpened();
  if (open === null) return null;
  const keepsakes = keepsakesOf(String(open.snapshot.project['title'] ?? ''));
  const row = rowOrder(keepsakes, opened);
  return (
    <View style={styles.gap}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          KEEPSAKES
          <Text style={styles.count}>{rowCount(keepsakes, opened)}</Text>
        </Text>
        <OutlineButton compact label="See the shelf" icon="bookshelf" onPress={() => router.navigate('/keepsakes/shelf')} />
      </View>
      <Muted>Everything your book can be made into: to keep, to share, to send.</Muted>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {row.map((k) => (
          <KeepsakeTile key={k.id} k={k} isNew={!opened.has(k.id)} width={150} onPress={() => router.navigate(k.path as never)} />
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Submission kit: what an agent or a publisher asks for, and a query letter"
        onPress={() => router.navigate('/keepsakes/submission')}
      >
        <Panel style={styles.kit}>
          <Icon name="email-fast-outline" size={26} color={colors.sky} />
          <View style={styles.flex}>
            <Text style={styles.kitTitle}>Submission kit</Text>
            <Muted>What an agent or a publisher asks for, how far the book has come, and its query letter.</Muted>
          </View>
          <Icon name="chevron-right" size={22} color={colors.muted} />
        </Panel>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  flex: { flex: 1, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 2, color: colors.gold },
  count: { fontFamily: fonts.ui, fontSize: 14, letterSpacing: 0, color: colors.muted },
  row: { gap: space.md, paddingVertical: space.sm, paddingRight: space.md },
  kit: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderLeftWidth: 4, borderLeftColor: colors.sky },
  kitTitle: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
});
