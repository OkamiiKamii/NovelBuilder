// A MILESTONE ON THE ROAD: the moment the whole book passes one of the lengths on the road to the draft (the first
// thousand words, a short story's length, a novelette's, a novella's, the whole draft) while the writer is writing, the
// page dims and the milestone stands over it: its number in Cinzel gold, what the book has become, and the road with
// this milestone lit. It holds a few seconds and goes; it never takes a touch or the keyboard, so writing goes on under
// it. The milestones are the Contents' road (domain/analytics/milestones.ts).

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';

import { type Milestone, milestoneCrossed, milestonesFor } from '../../domain/analytics/milestones';
import { formatNumber } from '../../domain/desk/format';
import { motion, useReducedMotion } from '../motion';
import { colors, fonts, radius, space, tints } from '../theme';

const holdMs = 3800;

/** What the book has become, in a line. */
function becomes(m: Milestone): string {
  if (m.name === 'the whole draft') return 'The whole draft. Your book is written.';
  if (m.name === 'the first thousand') return 'The first thousand words of your book.';
  return `Your book is ${m.name} now.`;
}

export function MilestoneMoment({ bookWords, target }: { bookWords: number | null; target: number | null }) {
  const reduced = useReducedMotion();
  const before = useRef<number | null>(null);
  const [shown, setShown] = useState<{ m: Milestone; road: Milestone[] } | null>(null);
  const [t] = useState(() => new Animated.Value(0));

  // Passed in this sitting: below a milestone at the last reading, at or past it now.
  useEffect(() => {
    const was = before.current;
    before.current = bookWords;
    if (bookWords === null || was === null) return;
    const road = milestonesFor(target);
    const m = milestoneCrossed(was, bookWords, road);
    if (m === null) return;
    setShown({ m, road });
    AccessibilityInfo.announceForAccessibility(`${formatNumber(m.words)} words. ${becomes(m)}`);
  }, [bookWords, target]);

  useEffect(() => {
    if (shown === null) return;
    t.setValue(0);
    const run = Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: reduced ? 250 : 700, easing: motion.arrive, useNativeDriver: true }),
      Animated.delay(holdMs),
      Animated.timing(t, { toValue: 2, duration: 600, useNativeDriver: true }),
    ]);
    run.start(({ finished }) => finished && setShown(null));
    return () => run.stop();
  }, [shown, t, reduced]);

  if (shown === null) return null;
  const { m, road } = shown;
  const veil = t.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0.72, 0] });
  const card = t.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const rise = reduced ? 0 : t.interpolate({ inputRange: [0, 1, 2], outputRange: [28, 0, -12] });
  return (
    <View style={styles.fill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.fill, styles.veil, { opacity: veil }]} />
      <Animated.View style={[styles.card, { opacity: card, transform: [{ translateY: rise }] }]}>
        <Text style={styles.kicker}>THE ROAD TO THE DRAFT</Text>
        <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
          {formatNumber(m.words)}
        </Text>
        <Text style={styles.words}>WORDS</Text>
        <Text style={styles.line}>{becomes(m)}</Text>
        <View style={styles.road}>
          {road.map((r, i) => {
            const lit = r.words <= m.words;
            const here = r.words === m.words;
            return (
              <View key={r.words} style={styles.stop}>
                {i > 0 && <View style={[styles.rule, lit && styles.ruleLit]} />}
                <View style={[styles.mark, lit && styles.markLit, here && styles.markHere]} />
                <Text style={[styles.short, here && styles.shortHere]}>{r.short}</Text>
              </View>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  veil: { backgroundColor: colors.background },
  card: {
    width: '86%',
    maxWidth: 420,
    alignItems: 'center',
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
    shadowColor: colors.gold,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  kicker: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 11, letterSpacing: 2.4, color: colors.gold },
  number: { marginTop: space.md, fontFamily: fonts.display, fontWeight: '700', fontSize: 56, lineHeight: 64, color: colors.gold },
  words: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 3, color: colors.muted },
  line: { marginTop: space.md, fontFamily: fonts.bookItalic, fontSize: 18, lineHeight: 26, color: colors.text, textAlign: 'center' },
  road: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.xl, alignSelf: 'stretch', justifyContent: 'center' },
  stop: { flex: 1, alignItems: 'center' },
  rule: { position: 'absolute', top: 6, right: '50%', width: '100%', height: 1, backgroundColor: colors.border },
  ruleLit: { backgroundColor: colors.gold },
  mark: { width: 12, height: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, transform: [{ rotate: '45deg' }] },
  markLit: { borderColor: colors.gold, backgroundColor: tints.goldRule },
  markHere: { backgroundColor: colors.gold, borderColor: colors.goldLight },
  short: { marginTop: 8, fontFamily: fonts.numbers, fontSize: 10, color: colors.muted },
  shortHere: { color: colors.gold, fontWeight: '700' },
});
