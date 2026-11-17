// The save-status pill (FEATURES.md #6): "Saved on this device", "Unsaved changes", "Saving…" or "Not saved" with the
// reason and Retry.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { saveLabel } from '../data/autosave';
import { useLibrary, useSaveStatus } from './LibraryContext';
import { colors, fonts, radius, space } from './theme';

export function SavePill() {
  const { saves } = useLibrary();
  const status = useSaveStatus();
  const failed = status.state === 'failed';
  const tone = failed ? colors.danger : status.state === 'saved' ? colors.sky : colors.gold;
  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={failed ? `${saveLabel(status.state)}. ${status.error ?? ''}` : saveLabel(status.state)}
      style={[styles.pill, { borderColor: tone }]}
    >
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <View style={styles.words}>
        <Text style={[styles.label, { color: tone }]}>{saveLabel(status.state)}</Text>
        {failed && (
          <Text style={styles.reason} numberOfLines={2}>
            {status.error} It will be tried again.
          </Text>
        )}
      </View>
      {failed && (
        <Pressable accessibilityRole="button" onPress={() => saves.retry()} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.chip,
    borderWidth: 1,
    backgroundColor: colors.elevated,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  words: { flexShrink: 1 },
  label: { fontFamily: fonts.ui, fontSize: 13, letterSpacing: 0.3 },
  reason: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  retry: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    backgroundColor: colors.danger,
  },
  retryText: { fontFamily: fonts.ui, fontSize: 13, color: colors.onGold },
});
