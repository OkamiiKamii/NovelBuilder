// THE DAY'S SEAL: the moment today's words reach the daily goal while the writer is writing, a gold seal is set on the
// page, as a wax seal on a finished letter: the goal's number in Cinzel, the feather, "The day's words are written",
// then it lifts away. It never takes a touch or the keyboard, and it comes only on crossing the goal in this sitting,
// never on opening a chapter after the goal was already met.

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';

import { formatNumber } from '../../domain/desk/format';
import { Icon } from '../kit';
import { motion, useReducedMotion } from '../motion';
import { colors, fonts, space, tints } from '../theme';

const holdMs = 2600;

export function DaySeal({ today, goal }: { today: number; goal: number | null }) {
  const reduced = useReducedMotion();
  const before = useRef<number | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [t] = useState(() => new Animated.Value(0));

  // The goal crossed: below it at the last reading, at or past it now.
  useEffect(() => {
    const was = before.current;
    before.current = today;
    if (goal === null || goal <= 0 || was === null || was >= goal || today < goal) return;
    setShown(goal);
    AccessibilityInfo.announceForAccessibility(`Today's goal reached: ${formatNumber(goal)} words.`);
  }, [today, goal]);

  useEffect(() => {
    if (shown === null) return;
    t.setValue(0);
    const run = Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: reduced ? 200 : 420, easing: motion.arrive, useNativeDriver: true }),
      Animated.delay(holdMs),
      Animated.timing(t, { toValue: 2, duration: 500, useNativeDriver: true }),
    ]);
    run.start(({ finished }) => finished && setShown(null));
    return () => run.stop();
  }, [shown, t, reduced]);

  if (shown === null) return null;
  const opacity = t.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  // Pressed down onto the page, as a seal is; then lifted a little as it goes. Still, with less motion.
  const scale = reduced ? 1 : t.interpolate({ inputRange: [0, 1, 2], outputRange: [1.6, 1, 0.92] });
  const lift = reduced ? 0 : t.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -16] });
  return (
    <View style={styles.spot} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.seal, { opacity, transform: [{ translateY: lift }, { scale }] }]}>
        <View style={styles.halo}>
          <LinearGradient colors={[colors.goldLight, colors.gold, colors.goldDeep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.disc}>
            <View style={styles.inner}>
              <Icon name="feather" size={22} color={colors.onGold} />
              <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
                {formatNumber(shown)}
              </Text>
              <Text style={styles.words}>WORDS</Text>
            </View>
          </LinearGradient>
        </View>
        <View style={styles.caption}>
          <Text style={styles.line}>The day&rsquo;s words are written.</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const disc = 116;

const styles = StyleSheet.create({
  spot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  seal: { alignItems: 'center', gap: space.md },
  halo: {
    padding: 5,
    borderRadius: disc,
    borderWidth: 1,
    borderColor: tints.goldRule,
    backgroundColor: tints.veil,
    shadowColor: colors.gold,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 10,
  },
  disc: { width: disc, height: disc, borderRadius: disc / 2, alignItems: 'center', justifyContent: 'center' },
  inner: {
    width: disc - 14,
    height: disc - 14,
    borderRadius: (disc - 14) / 2,
    borderWidth: 1,
    borderColor: colors.onGold,
    opacity: 0.85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { fontFamily: fonts.display, fontWeight: '700', fontSize: 26, lineHeight: 30, color: colors.onGold, maxWidth: disc - 30 },
  words: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 9, letterSpacing: 2, color: colors.onGold },
  caption: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.goldRule },
  line: { fontFamily: fonts.bookItalic, fontSize: 15, color: colors.text },
});
