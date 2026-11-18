// The app's shared states (FEATURES.md #363–#364): a SKELETON while something is read (soft bars where the words will
// stand, a light passing over them, held still when the device asks for less motion), and the standard loading, empty,
// error (with Try again) and no-results states. Ports of flutter_app/lib/core/widgets/{skeleton,states}.dart.

import { type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { GoldButton, Icon, type IconName, Muted, OutlineButton, Panel } from './kit';
import { colors, fonts, space } from './theme';

/** The lengths of lines of prose: most full, the last of a paragraph short. */
const lengths = [1.0, 0.94, 0.97, 0.62, 1.0, 0.9, 0.78, 0.98, 0.55];

/** Bars where the words will stand while something is read. `label` is said to a screen reader (and, with `caption`,
 * written under the bars). */
export function Skeleton({
  label = 'Loading…',
  lines = 4,
  caption = false,
  heading = true,
}: {
  label?: string;
  lines?: number;
  caption?: boolean;
  heading?: boolean;
}) {
  const [light] = useState(() => new Animated.Value(0.5));
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (live) setReduced(r);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (reduced) {
      light.setValue(0.5);
      return;
    }
    // The light passes and fades back, again and again (1.4 s a pass), on the native driver.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(light, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(light, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [light, reduced]);
  const opacity = light.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.16] });
  const bar = (width: number, height: number, key: number) => (
    <Animated.View key={key} style={{ width: `${width * 100}%`, height, borderRadius: height / 2, backgroundColor: colors.text, opacity }} />
  );
  return (
    <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite" style={styles.skeleton}>
      <View importantForAccessibility="no-hide-descendants" style={styles.bars}>
        {heading && <View style={styles.headingBar}>{bar(0.45, 18, -1)}</View>}
        {Array.from({ length: Math.max(0, lines) }, (_, i) => bar(lengths[i % lengths.length], 11, i))}
      </View>
      {caption && <Muted style={styles.caption}>{label}</Muted>}
    </View>
  );
}

/** While a whole page is read. */
export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return <Skeleton label={message} caption />;
}

/** Nothing here yet: its sign, a title, what to do, and an action. */
export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  return <StateCard icon={icon} title={title} message={message} action={action} />;
}

/** Something went wrong: what, and Try again. */
export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <StateCard
      icon="alert-circle-outline"
      tone={colors.danger}
      title={title}
      message={message}
      action={onRetry ? <OutlineButton label="Try again" icon="refresh" compact onPress={onRetry} /> : undefined}
    />
  );
}

/** A search or filters that leave nothing: the records are unchanged, only hidden. */
export function NoResultsState({ query, onClear }: { query?: string | null; onClear?: () => void }) {
  const q = query?.trim() ?? '';
  return (
    <StateCard
      icon="magnify-close"
      title={q.length === 0 ? 'Nothing matches these filters' : `Nothing matches “${q}”`}
      message="Your records are unchanged; they are only hidden by the current search or filters."
      action={onClear ? <GoldButton label="Clear the search and filters" icon="filter-remove-outline" compact onPress={onClear} /> : undefined}
    />
  );
}

function StateCard({ icon, title, message, action, tone = colors.gold }: { icon: IconName; title: string; message?: string; action?: ReactNode; tone?: string }) {
  return (
    <Panel style={styles.card}>
      <View style={[styles.medallion, { borderColor: tone }]}>
        <Icon name={icon} size={22} color={tone} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {message !== undefined && <Muted style={styles.center}>{message}</Muted>}
      {action}
    </Panel>
  );
}

const styles = StyleSheet.create({
  skeleton: { padding: space.lg },
  bars: { gap: 12 },
  headingBar: { marginBottom: 6 },
  caption: { textAlign: 'center', marginTop: space.xs },
  card: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  medallion: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textAlign: 'center' },
  center: { textAlign: 'center' },
});
