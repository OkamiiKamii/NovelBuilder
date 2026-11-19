// THE APP FRAME (DESIGN.md, FEATURES.md section 2): the five areas of the owner's mock-ups. On a phone a bottom bar; on a
// tablet a rail on the left with the Scriptor mark, the areas (the current one filled gold), and on wide screens the
// writer's rank and level. The areas are a novel's, so the Library (outside every novel) shows neither (owner,
// 2026-11-19).

import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Image, Keyboard, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { openNovelSettingKey } from '../data/settingsStore';

import { writerRank } from '../domain/writerRank';
import { useFocusMode } from './write/deskState';
import { Icon, type IconName } from './kit';
import { useLibrary, useLibraryRevision } from './LibraryContext';
import { Backdrop } from './Backdrop';
import { SavePill } from './SavePill';
import { SearchHost } from './search/SearchSheet';
import { TutorialHost } from './tutorial/TutorialSheet';
import { colors, fonts, glow, radius, sizeClassOf, space } from './theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logo = require('../../assets/logo.png');

export const areas: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Library', icon: 'book-open-page-variant-outline' },
  { path: '/write', label: 'Write', icon: 'feather' },
  { path: '/organize', label: 'Organize', icon: 'sitemap-outline' },
  { path: '/analytics', label: 'Analytics', icon: 'chart-bar' },
  { path: '/settings', label: 'Settings', icon: 'cog-outline' },
];

export const bottomBarHeight = 64;

/** Plan's and Visualize's pages keep the Flutter app's /plan/… and /visualize/… paths, but they are part of Organize here. */
const insideOrganize = ['/plan', '/visualize', '/review'];

function areaOf(pathname: string): string {
  if (pathname === '/keepsakes' || pathname.startsWith('/keepsakes/')) return '/analytics';
  if (insideOrganize.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return '/organize';
  const found = areas.find((a) => a.path !== '/' && (pathname === a.path || pathname.startsWith(`${a.path}/`)));
  return found ? found.path : '/';
}

/** Whether the areas (bar or rail) show at `pathname`: inside a novel's areas, not in the Library, which is outside
 * every novel. */
export function showsAreas(pathname: string): boolean {
  return pathname !== '/';
}

export function AppFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const size = sizeClassOf(width);
  const areasShown = showsAreas(usePathname());
  if (size === 'compact') {
    return (
      <View style={styles.page}>
        <Backdrop />
        <View style={styles.flex}>{children}</View>
        {areasShown && <BottomBar />}
        <StatusScrim />
        <Overlays />
      </View>
    );
  }
  return (
    <View style={[styles.page, styles.row]}>
      <Backdrop />
      {areasShown && <Rail expanded={size === 'expanded'} />}
      <View style={styles.flex}>{children}</View>
      <StatusScrim />
      <Overlays />
    </View>
  );
}

/** Search and the tutorial (with its tour), over every page: opened from the buttons at the top of the areas. */
function Overlays() {
  return (
    <>
      <SearchHost />
      <TutorialHost />
    </>
  );
}

/** A dark band behind Android's status bar, so pages scrolling under it never run into the clock and icons. */
function StatusScrim() {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={[styles.scrim, { height: insets.top }]} />;
}

function useNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  const current = areaOf(pathname);
  return { current, go: (path: string) => path !== current && router.navigate(path as never) };
}

/** How tall the on-screen keyboard is (0 when it is down). Android draws apps edge to edge, so the window does not
 * shrink for the keyboard: screens that type leave this much room themselves. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** Whether the on-screen keyboard is up: the bottom bar steps aside for it, so it never sits on top of the writing. */
export function useKeyboardVisible(): boolean {
  return useKeyboardHeight() > 0;
}

function BottomBar() {
  const insets = useSafeAreaInsets();
  const { current, go } = useNavigate();
  const keyboardUp = useKeyboardVisible();
  const focused = useFocusMode();
  const day = useTodayGoal();
  // The bar steps aside for the keyboard, and for focus mode.
  if (keyboardUp || focused) return null;
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, height: bottomBarHeight + insets.bottom }]} accessibilityRole="tablist">
      {areas.map((a) => {
        const selected = a.path === current;
        return (
          <Pressable
            key={a.path}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={areaLabel(a, day)}
            onPress={() => go(a.path)}
            style={styles.barItem}
          >
            {selected && <View style={styles.barGlow} />}
            <AreaIcon area={a} color={selected ? colors.gold : colors.muted} day={day} />
            <Text style={[styles.barLabel, { color: selected ? colors.gold : colors.muted }]}>{a.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Rail({ expanded }: { expanded: boolean }) {
  const insets = useSafeAreaInsets();
  const { current, go } = useNavigate();
  const day = useTodayGoal();
  return (
    <View
      style={[
        styles.rail,
        expanded ? styles.railWide : styles.railNarrow,
        { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg, paddingLeft: insets.left },
      ]}
      accessibilityRole="tablist"
    >
      <Brand compact={!expanded} />
      <View style={styles.railItems}>
        {areas.map((a) => {
          const selected = a.path === current;
          return (
            <Pressable
              key={a.path}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={areaLabel(a, day)}
              onPress={() => go(a.path)}
              style={[styles.railItem, !expanded && styles.railItemNarrow]}
            >
              {selected && (
                <LinearGradient
                  colors={['#3A2A08', '#6B4B10', '#3A2A08']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[StyleSheet.absoluteFill, styles.railSelected]}
                />
              )}
              <AreaIcon area={a} color={selected ? colors.gold : colors.text} day={day} />
              <Text
                style={[
                  expanded ? styles.railLabel : styles.railLabelNarrow,
                  { color: selected ? colors.gold : colors.text },
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.flex} />
      {expanded ? (
        <>
          <RankPanel />
          <Text style={styles.quote}>“Every story builds a greater you.”</Text>
          <View style={styles.railPill}>
            <SavePill />
          </View>
        </>
      ) : (
        <RankBadge />
      )}
    </View>
  );
}

/** Today's words in the open novel against its daily goal, for the Write area's ring. Null with no novel open or no
 * daily goal set. Read again after every save, so the ring fills as the writer types. */
function useTodayGoal(): { today: number; goal: number } | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  return useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    if (typeof id !== 'string' || !lib.novels.exists(id)) return null;
    const goal = lib.manuscript.wordGoals(id).daily;
    if (goal === null || goal <= 0) return null;
    return { today: lib.manuscript.wordsWritten(id).today, goal };
    // revision: read again after every write.
  }, [lib, revision]); // eslint-disable-line react-hooks/exhaustive-deps
}

function areaLabel(a: (typeof areas)[number], day: { today: number; goal: number } | null): string {
  if (a.path !== '/write' || day === null) return a.label;
  return day.today >= day.goal
    ? `${a.label}: today's goal met, ${day.today} words`
    : `${a.label}: ${day.today} of ${day.goal} words today`;
}

const ring = { size: 34, stroke: 2.5 };

/** An area's icon. Write's sits in a ring of today's words against the daily goal, filling gold as the writer writes;
 * with the goal met, the feather stands on a gold disc. */
function AreaIcon({ area, color, day }: { area: (typeof areas)[number]; color: string; day: { today: number; goal: number } | null }) {
  const icon = <Icon name={area.icon} size={24} color={color} />;
  if (area.path !== '/write' || day === null) return <View style={styles.areaIcon}>{icon}</View>;
  const met = day.today >= day.goal;
  const c = ring.size / 2;
  const r = c - ring.stroke / 2;
  const length = 2 * Math.PI * r;
  const part = Math.max(0, Math.min(1, day.today / day.goal));
  return (
    <View style={styles.areaIcon}>
      <Svg width={ring.size} height={ring.size} style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={r} stroke={met ? colors.gold : colors.border} strokeWidth={ring.stroke} fill={met ? colors.gold : 'none'} />
        {!met && part > 0 && (
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={colors.gold}
            strokeWidth={ring.stroke}
            strokeLinecap="round"
            strokeDasharray={`${length * part} ${length}`}
            fill="none"
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
      </Svg>
      <Icon name={area.icon} size={18} color={met ? colors.onGold : color} />
    </View>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.brand, compact && styles.brandCompact]} accessibilityRole="header" accessibilityLabel="Scriptor">
      {/* The Scriptor emblem: a phoenix rising from an open book (the owner's logo, assets/logo.png). */}
      <Image source={logo} style={styles.brandMark} accessibilityIgnoresInvertColors />

      {!compact && (
        <View>
          <Text style={styles.brandName}>SCRIPTOR</Text>
          <Text style={styles.brandTag}>CREATE • ORGANIZE • ASCEND</Text>
        </View>
      )}
    </View>
  );
}

export function useWriterRank() {
  const { novels } = useLibrary();
  const revision = useLibraryRevision();
  return useMemo(() => writerRank(novels.writingLog(), novels.finishedChapters()), [novels, revision]);
}

/** "Rank: SSS · Lv. 125" with the way to the next level (FEATURES.md, New in Scriptor). */
export function RankPanel() {
  const r = useWriterRank();
  return (
    <View
      style={styles.rank}
      accessible
      accessibilityLabel={`Writer rank ${r.rank}, level ${r.level}. ${r.xpToNext} experience to the next level.`}
    >
      <View style={styles.rankRow}>
        <Icon name="crown" size={30} color={colors.gold} />
        <View style={styles.flex}>
          <Text style={styles.rankName}>Rank: {r.rank}</Text>
          <Text style={styles.rankLevel}>Lv. {r.level}</Text>
        </View>
      </View>
      <View style={styles.rankTrack}>
        <LinearGradient
          colors={[colors.goldDeep, colors.gold]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.rankFill, { width: `${Math.round(r.progress * 100)}%` }]}
        />
      </View>
      <Text style={styles.rankNext}>{r.xpToNext.toLocaleString('en-US')} XP to Lv. {r.level + 1}</Text>
    </View>
  );
}

function RankBadge() {
  const r = useWriterRank();
  return (
    <View style={styles.rankBadge} accessible accessibilityLabel={`Writer rank ${r.rank}, level ${r.level}`}>
      <Icon name="crown" size={22} color={colors.gold} />
      <Text style={styles.rankBadgeText}>{r.rank}</Text>
      <Text style={styles.rankBadgeLevel}>Lv. {r.level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: 'row' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(10, 11, 14, 0.94)' },
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: bottomBarHeight },
  barGlow: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: colors.gold,
    shadowColor: colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  barLabel: { fontFamily: fonts.ui, fontSize: 12 },
  areaIcon: { width: ring.size, height: ring.size, alignItems: 'center', justifyContent: 'center' },
  rail: { borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  railWide: { width: 236, paddingHorizontal: space.md },
  railNarrow: { width: 96, paddingHorizontal: space.sm, alignItems: 'stretch' },
  railItems: { marginTop: space.xl, gap: space.xs },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    overflow: 'hidden',
  },
  railItemNarrow: { flexDirection: 'column', gap: 4, paddingHorizontal: 0, paddingVertical: space.sm, justifyContent: 'center' },
  railSelected: { borderRadius: radius.field, borderWidth: 1, borderColor: colors.gold },
  railLabel: { fontFamily: fonts.ui, fontSize: 17 },
  railLabelNarrow: { fontFamily: fonts.ui, fontSize: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brandCompact: { justifyContent: 'center' },
  brandMark: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: colors.gold },
  brandName: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 2.5, color: colors.text },
  brandTag: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.2, color: colors.muted },
  rank: {
    padding: space.md,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: '#15110A',
    boxShadow: glow.gold,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rankName: { fontFamily: fonts.ui, fontSize: 18, color: colors.gold },
  rankLevel: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  rankTrack: { marginTop: space.sm, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  rankFill: { height: 6, borderRadius: 3 },
  rankNext: { marginTop: 4, fontFamily: fonts.ui, fontSize: 11, color: colors.muted },
  quote: {
    marginTop: space.lg,
    fontFamily: fonts.bookItalic,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    color: colors.muted,
  },
  railPill: { marginTop: space.lg, alignItems: 'center' },
  rankBadge: {
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: '#15110A',
  },
  rankBadgeText: { fontFamily: fonts.ui, fontSize: 16, color: colors.gold },
  rankBadgeLevel: { fontFamily: fonts.ui, fontSize: 11, color: colors.text },
});
