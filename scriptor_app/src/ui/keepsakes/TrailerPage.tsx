// THE TRAILER (FEATURES.md #345): the book as a film trailer cut from its own lines: between black bars, a shot at a
// time (who it is from, a line, a name, a line, the title), each fading up out of the dark in the book's own colour
// and drifting closer, and at the end the poster: the names billed, the line kept for last, the title, COMING SOON.
// Tap for the next shot; **Skip to the poster**. With reduce motion on, each shot stands still. **Share the poster**
// makes a tall picture of it. A port of flutter_app/lib/features/progress/trailer.dart.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { mix, withAlpha } from '../../domain/characters/views/common';
import { dartToUpperCase } from '../../domain/exchange/dartUpperCase';
import { trailerCast } from '../../domain/keepsakes/inputs';
import { posterSize, posterWords, shotLength } from '../../domain/keepsakes/pages';
import { type Shot, type Trailer, trailerJob } from '../../domain/manuscript/trailer';
import { Novel } from '../../domain/novel';
import { GoldButton, IconButton, OutlineButton } from '../kit';
import { fonts, space } from '../theme';
import { Empty, KeepsakePage, Note, Waiting, useKeepsake, usePicture, useReading } from './parts';

const ink = '#F7F1E4';
const gold = '#E8C46A';

/** A glow behind the words, in the book's colour, its centre at `cx` (0 to 1 across). */
function Glow({ accent, cx, strong, id }: { accent: string; cx: number; strong: number; id: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <RadialGradient id={id} cx={`${cx * 100}%`} cy="47%" r="65%">
          <Stop offset="0" stopColor={accent} stopOpacity={0.32 * strong + 0.23 * (1 - strong)} />
          <Stop offset="0.55" stopColor={mix(accent, '#000000', 0.85, 1)} stopOpacity={0.5} />
          <Stop offset="1" stopColor="#000000" stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

function Flare({ accent }: { accent: string }) {
  return <View style={[styles.flare, { backgroundColor: accent, shadowColor: accent }]} />;
}

function ShotWords({ shot, wide }: { shot: Shot; wide: boolean }) {
  switch (shot.kind) {
    case 'from':
      return <Text style={styles.from}>{dartToUpperCase(shot.text)}</Text>;
    case 'line':
      return <Text style={[styles.line, { fontSize: wide ? 34 : 28, lineHeight: (wide ? 34 : 28) * 1.3 }]}>{shot.text}</Text>;
    case 'name':
      return (
        <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
          {dartToUpperCase(shot.text)}
        </Text>
      );
    case 'title':
      return <Text style={[styles.title, { fontSize: wide ? 48 : 36, lineHeight: (wide ? 48 : 36) * 1.15 }]}>{dartToUpperCase(shot.text)}</Text>;
  }
}

function Poster({ trailer, accent, title, author, words, chapters }: { trailer: Trailer; accent: string; title: string; author: string; words: number; chapters: number }) {
  const w = posterWords({ title, author, cast: trailer.cast, words, chapters });
  return (
    <View style={styles.poster}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="poster" cx="50%" cy="42%" r="75%">
            <Stop offset="0" stopColor={withAlpha(accent, 0.55)} />
            <Stop offset="0.55" stopColor={mix(accent, '#000000', 0.88, 1)} />
            <Stop offset="1" stopColor="#000000" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#poster)" />
      </Svg>
      <Text style={styles.billed} numberOfLines={2}>
        {w.top}
      </Text>
      <View style={{ flex: 3 }} />
      {trailer.sting.length > 0 ? (
        <Text style={styles.sting} numberOfLines={4}>
          {trailer.sting}
        </Text>
      ) : null}
      <View style={{ flex: 2 }} />
      <Flare accent={accent} />
      <Text style={styles.posterTitle} numberOfLines={3}>
        {w.title}
      </Text>
      <Flare accent={accent} />
      {w.byline !== null ? <Text style={styles.byline}>{w.byline}</Text> : null}
      <View style={{ flex: 3 }} />
      <Text style={styles.soon}>COMING SOON</Text>
      <Text style={styles.billing} numberOfLines={3}>
        {w.billing}
      </Text>
    </View>
  );
}

export function TrailerPage() {
  const open = useKeepsake('trailer');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= 420;
  const made = useReading(open, (b, s) => ({
    trailer: trailerJob(b.stored, b.order, { title: b.novel.title, author: b.novel.author, cast: trailerCast(s) })(),
    words: b.documents.reduce((n, d) => n + d.wordCount, 0),
    chapters: b.documents.length,
  })).value;
  const [at, setAt] = useState(0);
  const [still, setStill] = useState<boolean | null>(null);
  const [t] = useState(() => new Animated.Value(0));
  const [pictureRef, picture] = usePicture(posterSize);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (live) setStill(reduced);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => setStill(reduced));
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const shots = made?.trailer.shots ?? [];
  const playing = made !== null && still !== null && at < shots.length;
  // Each shot runs its length, then the next; after the last, the poster.
  useEffect(() => {
    if (!playing) return;
    const shot = shots[at];
    t.setValue(still ? 0.5 : 0);
    const run = still
      ? Animated.delay(shotLength(shot))
      : Animated.timing(t, { toValue: 1, duration: shotLength(shot), easing: Easing.linear, useNativeDriver: true });
    run.start(({ finished }) => {
      if (finished) setAt((n) => n + 1);
    });
    return () => run.stop();
  }, [playing, at, still]); // eslint-disable-line react-hooks/exhaustive-deps

  if (open === null || made === null) {
    return (
      <KeepsakePage title="The trailer" ground="#000000" ink={ink}>
        <Waiting ink={ink} text={open === null ? 'No novel is open.' : undefined} />
      </KeepsakePage>
    );
  }
  if (shots.length === 0) {
    return (
      <KeepsakePage title="The trailer" ground="#000000" ink={ink}>
        <Empty ink={ink} text="Not enough to cut a trailer from yet. Once your chapters have lines in them, the trailer is cut here." />
      </KeepsakePage>
    );
  }
  const novel = new Novel(open.snapshot.project);
  const accent = /^#[0-9a-fA-F]{6}$/.test(novel.accent) ? novel.accent : '#b4532a';

  if (at >= shots.length) {
    return (
      <KeepsakePage title="The trailer" ground="#000000" ink={ink}>
        <View ref={pictureRef} collapsable={false}>
          <Poster trailer={made.trailer} accent={accent} title={novel.title} author={novel.author} words={made.words} chapters={made.chapters} />
        </View>
        <View style={styles.row}>
          <OutlineButton label="Play again" icon="replay" onPress={() => setAt(0)} />
          <GoldButton label="Share the poster" icon="share-variant" disabled={picture.working} onPress={() => void picture.share('The trailer’s poster')} />
          <OutlineButton label="Keep writing" icon="pencil-outline" onPress={() => router.navigate('/write')} />
        </View>
        {picture.message ? <Note ink={ink} text={picture.message} /> : null}
      </KeepsakePage>
    );
  }

  const shot = shots[at];
  const fades = shot.kind === 'title' ? [0, 1, 1, 1] : [0, 1, 1, 0];
  const opacity = still ? 1 : t.interpolate({ inputRange: [0, 0.16, 0.84, 1], outputRange: fades });
  const scale = still ? 1 : t.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.03] });
  const bar = 56;
  return (
    <View style={styles.cinema}>
      <Pressable
        style={styles.flex}
        accessibilityRole="button"
        accessibilityLabel={`Next shot. ${shot.text}`}
        onPress={() => setAt((n) => n + 1)}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
          <Glow accent={accent} cx={0.5} strong={1} id={`shot-${at}`} />
        </Animated.View>
        <View style={[styles.bar, { height: bar + insets.top }]} />
        <View style={styles.screen}>
          <Animated.View style={{ opacity, transform: [{ scale }], alignItems: 'center', gap: 18 }}>
            {shot.kind === 'title' ? <Flare accent={accent} /> : null}
            <ShotWords shot={shot} wide={wide} />
            {shot.kind === 'title' ? <Flare accent={accent} /> : null}
          </Animated.View>
        </View>
        <View style={[styles.bar, { height: bar + insets.bottom }]} />
      </Pressable>
      <View style={[styles.controls, { top: insets.top + space.sm }]}>
        <IconButton icon="arrow-left" label="Back to Analytics" color={ink} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/analytics'))} />
        <Pressable accessibilityRole="button" onPress={() => setAt(shots.length)} style={styles.skip}>
          <Text style={styles.skipText}>Skip to the poster</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cinema: { flex: 1, backgroundColor: '#000000' },
  bar: { backgroundColor: '#000000' },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  controls: { position: 'absolute', left: space.sm, right: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 44, justifyContent: 'center' },
  skipText: { fontFamily: fonts.ui, fontSize: 14, color: ink, opacity: 0.8 },
  from: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 5.5, color: ink, opacity: 0.85, textAlign: 'center' },
  line: { fontFamily: fonts.book, color: ink, textAlign: 'center', maxWidth: 560 },
  name: { fontFamily: fonts.display, fontSize: 34, letterSpacing: 8, color: gold },
  title: { fontFamily: fonts.display, color: ink, letterSpacing: 5, textAlign: 'center' },
  flare: { width: 160, height: 1.5, borderRadius: 1, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  poster: { width: posterSize.width, height: posterSize.height, maxWidth: '100%', overflow: 'hidden', alignItems: 'center', paddingHorizontal: 26, paddingTop: 30, paddingBottom: 22, gap: 12, backgroundColor: '#000000' },
  billed: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 3, color: ink, opacity: 0.85, textAlign: 'center' },
  sting: { fontFamily: fonts.bookItalic, fontSize: 21, lineHeight: 27, color: ink, textAlign: 'center' },
  posterTitle: { fontFamily: fonts.display, fontSize: 34, lineHeight: 39, letterSpacing: 4, color: ink, textAlign: 'center' },
  byline: { fontFamily: fonts.display, fontSize: 11, letterSpacing: 3, color: ink, opacity: 0.8, textAlign: 'center' },
  soon: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 6, color: gold },
  billing: { fontFamily: fonts.display, fontSize: 8, lineHeight: 10.5, letterSpacing: 0.4, color: ink, opacity: 0.55, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
});
