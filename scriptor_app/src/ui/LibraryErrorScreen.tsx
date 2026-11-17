// Shown instead of the app when the library cannot be opened (FEATURES.md #1). The file is not touched, so nothing is
// lost by stopping here; the app never carries on with an empty library in its place.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space } from './theme';

export function LibraryErrorScreen({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <View style={styles.page}>
      <View style={styles.panel} accessibilityRole="alert">
        <Text style={styles.title}>YOUR LIBRARY COULD NOT BE OPENED</Text>
        <Text style={styles.reason}>{reason}</Text>
        <Text style={styles.safe}>Your novels have not been changed.</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: space.xl },
  panel: {
    padding: space.xl,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontFamily: fonts.ui, fontSize: 18, letterSpacing: 1.5, color: colors.gold },
  reason: { marginTop: space.md, fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  safe: { marginTop: space.md, fontFamily: fonts.ui, fontSize: 15, color: colors.sky },
  button: {
    marginTop: space.xl,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.field,
    backgroundColor: colors.gold,
  },
  buttonText: { fontFamily: fonts.ui, fontSize: 16, color: colors.onGold },
});
