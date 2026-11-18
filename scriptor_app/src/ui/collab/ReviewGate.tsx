// In a review copy, the author's own working pages give way to a page that says where the review is done: the
// library, the review workspace (Write), the book reader, the team page (which says it is the owner's) and the
// settings stay open. The store refuses changes elsewhere in any case (src/data/novelStore.ts); this keeps the person
// from meeting refusals. A port of flutter_app/lib/features/collab/review_gate.dart.

import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { reviewPageAllowed } from '../../domain/collab/reviewFiles';
import { GoldButton, Icon, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';
import { useReviewMark } from './useCollab';


export function ReviewGate({ children }: { children: ReactNode }) {
  const mark = useReviewMark();
  const path = usePathname();
  const router = useRouter();
  if (mark === null || reviewPageAllowed(path)) return children;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Panel style={styles.panel}>
        <Icon name="file-document-edit-outline" size={40} />
        <Text style={styles.title} accessibilityRole="header">
          Not part of a review copy
        </Text>
        <Muted style={styles.center}>
          {`“${mark.title}” is a review copy from ${mark.ownerName}. You read, comment and suggest in Write; the author’s own working pages stay with the author.`}
        </Muted>
        <View style={styles.row}>
          <GoldButton label="Go to the review" icon="feather" onPress={() => router.navigate('/write')} />
          <OutlineButton label="Library" icon="book-open-page-variant-outline" onPress={() => router.navigate('/')} />
        </View>
      </Panel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: space.lg, backgroundColor: colors.background },
  panel: { alignItems: 'center', gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textAlign: 'center' },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
});
