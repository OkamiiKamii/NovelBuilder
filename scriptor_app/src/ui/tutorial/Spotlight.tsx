// SHOW ME ON THIS PAGE (FEATURES.md #360): the page dims, but for a lit window around each button the lesson names, one
// at a time, with the step it belongs to on a card beside it: Next walks on, Back returns, Done (or ×, or the phone's
// Back) ends it. It only points: a press anywhere but the card's buttons does nothing, and nothing in the novel changes.
// Where the buttons are is measured as the tour begins (spots.ts); a step naming no button on the screen is left out.
// A port of flutter_app/lib/features/tutorial/spotlight.dart.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Topic } from '../../domain/tutorial/topics';
import { type TourStop, scriptorTourOf } from '../../domain/tutorial/tour';
import { GoldButton, IconButton, Muted, OutlineButton } from '../kit';
import { endTour } from '../search/opener';
import { colors, fonts, radius, space } from '../theme';
import { findOnScreen, type Rect } from './spots';

export function Spotlight({ topic, names }: { topic: Topic; names: readonly string[] }) {
  const [stops, setStops] = useState<TourStop<Rect>[] | null>(null);
  const [at, setAt] = useState(0);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [breath] = useState(() => new Animated.Value(0.5));

  // Where each button is, read once the tutorial has gone from over the page.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void findOnScreen(names).then((found) => {
        if (!live) return;
        const tour = scriptorTourOf(topic.steps, found);
        if (tour.length === 0) endTour();
        else setStops(tour);
      });
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [topic, names]);

  // A few breaths at each stop, then still; still from the start when less motion is asked for.
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (still) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(breath, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]),
        { iterations: 4 },
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [at, breath]);

  if (stops === null) return null;
  const stop = stops[at];
  const last = at === stops.length - 1;
  const hole = { x: stop.at.x - 8, y: stop.at.y - 8, width: stop.at.width + 16, height: stop.at.height + 16 };
  // The card goes on the side of the window with more room, clear of the phone's own bars.
  const roomBelow = height - insets.bottom - (hole.y + hole.height) - 30;
  const roomAbove = hole.y - insets.top - 30;
  const below = roomBelow >= roomAbove;
  const cardWidth = width < 420 ? width - 32 : 380;
  const left = Math.min(Math.max(16, hole.x + hole.width / 2 - cardWidth / 2), width - cardWidth - 16);
  const dim = 'rgba(5, 6, 8, 0.78)';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={endTour} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        {/* The page, dimmed but for the window; presses on it do nothing. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => undefined} accessible={false}>
          <View style={[styles.dim, { backgroundColor: dim, left: 0, top: 0, right: 0, height: Math.max(0, hole.y) }]} />
          <View style={[styles.dim, { backgroundColor: dim, left: 0, top: hole.y + hole.height, right: 0, bottom: 0 }]} />
          <View style={[styles.dim, { backgroundColor: dim, left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.height }]} />
          <View style={[styles.dim, { backgroundColor: dim, left: hole.x + hole.width, top: hole.y, right: 0, height: hole.height }]} />
          <Animated.View style={[styles.ring, { left: hole.x, top: hole.y, width: hole.width, height: hole.height, opacity: breath }]} />
        </Pressable>
        <View
          style={[styles.card, { left, width: cardWidth }, below ? { top: hole.y + hole.height + 14 } : { bottom: height - hole.y + 14 }]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.cardHead}>
            <Text style={styles.kicker}>{`${topic.title.toUpperCase()} · STEP ${stop.step + 1}`}</Text>
            <IconButton icon="close" label="End the tour" onPress={endTour} color={colors.muted} />
          </View>
          <Text style={styles.name}>{stop.name}</Text>
          <Text style={styles.step}>{topic.steps[stop.step]}</Text>
          <View style={styles.cardFoot}>
            <Muted>{`${at + 1} of ${stops.length}`}</Muted>
            <View style={styles.flex} />
            {at > 0 && <OutlineButton label="Back" compact tone="muted" onPress={() => setAt(at - 1)} />}
            <GoldButton label={last ? 'Done' : 'Next'} compact onPress={last ? endTour : () => setAt(at + 1)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dim: { position: 'absolute' },
  ring: { position: 'absolute', borderRadius: 12, borderWidth: 2, borderColor: colors.gold },
  card: {
    position: 'absolute',
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
    elevation: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  kicker: { flex: 1, fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.muted },
  name: { fontFamily: fonts.display, fontSize: 18, color: colors.gold },
  step: { fontFamily: fonts.book, fontSize: 15, lineHeight: 22, color: colors.text },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
});
