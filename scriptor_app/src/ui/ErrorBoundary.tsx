// ERROR CONTAINMENT (FEATURES.md #12): a part of a screen that fails to draw is replaced by a quiet placeholder while
// the rest of the app keeps working. The error is kept in the in-memory ErrorLog, never written or sent.

import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
});
