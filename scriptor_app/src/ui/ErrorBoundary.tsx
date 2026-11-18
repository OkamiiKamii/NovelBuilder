// ERROR CONTAINMENT (FEATURES.md #12): a part of a screen that fails to draw is replaced by a quiet placeholder while
// the rest of the app keeps working, with Try again (FEATURES.md #364) to draw it afresh. The error is kept in the
// in-memory ErrorLog, never written or sent.

import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorLog } from '../data/errorLog';
import { colors, fonts, radius, space } from './theme';

type Props = { children: ReactNode; where: string };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    ErrorLog.instance.record(error, this.props.where);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.broken} accessibilityRole="alert">
        <Text style={styles.title}>This part could not be shown</Text>
        <Text style={styles.body}>The rest of the app keeps working, and nothing you have written was changed.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => this.setState({ failed: false })}
          hitSlop={6}
          style={({ pressed }) => [styles.retry, pressed && { backgroundColor: colors.elevated }]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  broken: {
    margin: space.lg,
    padding: space.lg,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  body: { marginTop: space.xs, fontFamily: fonts.ui, fontSize: 14, color: colors.muted },
  retry: { alignSelf: 'flex-start', marginTop: space.md, minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.field, borderWidth: 1, borderColor: colors.gold },
  retryText: { fontFamily: fonts.ui, fontSize: 15, color: colors.gold },
});
