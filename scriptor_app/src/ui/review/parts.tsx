// Review's shared pieces: a box with a title and caption (the Flutter app's ProfileBox), and the "Why is this
// intentional?" sheet with its usual reasons (timeline_review_page.dart's _ReasonDialog).

import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { intentionalReasons, timelineReviewWords } from '../../domain/canon/screens';
import { Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';

export function Box({ title, caption, children }: { title: string; caption?: string; children?: ReactNode }) {
  return (
    <Panel style={styles.box}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {caption ? <Muted>{caption}</Muted> : null}
      {children}
    </Panel>
  );
}

/** Asks why a finding is intentional: one of the usual reasons (when `reasons`), or the author's own words. */
export function ReasonSheet({
  onSave,
  onClose,
  hint = timelineReviewWords.reasonHint,
  reasons = true,
}: {
  onSave: (note: string) => void;
  onClose: () => void;
  hint?: string;
  reasons?: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <Sheet
      visible
      onClose={onClose}
      title={timelineReviewWords.reasonTitle}
      footer={
        <>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton label={timelineReviewWords.saveIntentional} onPress={() => onSave(text.trim())} style={styles.flex} />
        </>
      }
    >
      <Field label={timelineReviewWords.reasonTitle} placeholder={hint} value={text} onChangeText={setText} autoFocus />
      {reasons && (
        <View style={styles.chips}>
          {intentionalReasons.map((r) => (
            <Chip key={r} label={r} selected={text === r} onPress={() => setText(r)} />
          ))}
        </View>
      )}
    </Sheet>
  );
}

export const reviewStyles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  strong: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.muted },
  link: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline', paddingVertical: 4 },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.gold },
  finding: { gap: 4, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  warn: { gap: 4, padding: space.sm, borderRadius: 8, borderWidth: 1, borderColor: colors.danger, backgroundColor: 'rgba(248, 113, 113, 0.08)' },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: { gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
