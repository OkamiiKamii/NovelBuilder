// WRITING SPRINTS (FEATURES.md #122): a stretch of time to write in without stopping. The author picks a length, the
// desk clears into focus mode, a ring of time runs out beside the words added in the sprint, and when it ends a card
// says what was written. Words are counted from the chapters themselves, net, across every chapter written in during
// the sprint. Nothing is stored but the best sprint on this device (`write.bestSprint`). A port of
// flutter_app/lib/features/write/sprint.dart; the reckoning is src/domain/goals/sprint.ts.

import { useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { Library } from '../../data/library';
import {
  bestSprintKey,
  finishSprint,
  reportSprint,
  type Sprint,
  sprintBarOf,
  sprintButtonLabel,
  sprintButtonTooltip,
  sprintCardOf,
  sprintLengths,
  sprintMenuLabel,
  type SprintResult,
  startSprint,
  stopSprint,
  tickSprint,
} from '../../domain/goals/sprint';
import { ActionSheet } from '../dialogs';
import { Icon, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { setFocusMode } from './deskState';

// ------------------------------------------------------------------------------------------------- the sprint itself

type State = { sprint: Sprint | null; result: SprintResult | null };
let state: State = { sprint: null, result: null };
let timer: ReturnType<typeof setInterval> | null = null;
let library: Library | null = null;
const listeners = new Set<() => void>();

function set(next: State): void {
  state = next;
  for (const l of [...listeners]) l();
}

function finish(finished: boolean, elapsed: number): void {
  const s = state.sprint;
  if (timer) clearInterval(timer);
  timer = null;
  if (!s) return;
  const lib = library;
  const { result, newBest } = finishSprint(s, { finished, elapsed, stored: lib?.settings.read(bestSprintKey) });
  if (newBest && lib) {
    lib.saves.saveNow(`setting:${bestSprintKey}`, () => {
      lib.settings.write(bestSprintKey, newBest);
      lib.novels.touchSettings();
    });
  }
  set({ sprint: null, result });
  setFocusMode(false);
}

/** Starts a sprint of `minutes` (clearing any card) and clears the desk into focus mode. */
export function startWritingSprint(lib: Library, minutes: number): void {
  library = lib;
  if (timer) clearInterval(timer);
  set({ sprint: startSprint(minutes), result: null });
  setFocusMode(true);
  timer = setInterval(() => {
    const s = state.sprint;
    if (!s) return;
    const t = tickSprint(s);
    if (t.kind === 'running') set({ ...state, sprint: t.sprint });
    else finish(true, t.elapsed);
  }, 1000);
}

/** Stop: under a minute in, the sprint is dropped and nothing said; after that, its card. */
export function stopWritingSprint(): void {
  const s = state.sprint;
  if (!s) return;
  const stop = stopSprint(s);
  if (stop.kind === 'drop') {
    if (timer) clearInterval(timer);
    timer = null;
    set({ sprint: null, result: null });
    setFocusMode(false);
  } else {
    finish(false, stop.elapsed);
  }
}

/** A chapter's words now, while a sprint runs. Its first report is where it starts from. */
export function reportSprintWords(nodeId: string, words: number): void {
  const s = state.sprint;
  if (!s) return;
  const next = reportSprint(s, nodeId, words);
  if (next !== s) set({ ...state, sprint: next });
}

export function dismissSprintCard(): void {
  set({ ...state, result: null });
}

export function sprintRunning(): boolean {
  return state.sprint !== null;
}

export function useSprint(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// ------------------------------------------------------------------------------------------------------ on screen

/** "Sprint": a press that offers the lengths, then starts one and clears the desk. */
export function SprintButton({ lib }: { lib: Library }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={sprintButtonTooltip} onPress={() => setOpen(true)} style={styles.button} hitSlop={4}>
        <Icon name="timer-outline" size={18} />
        <Text style={styles.buttonText}>{sprintButtonLabel}</Text>
      </Pressable>
      <ActionSheet
        visible={open}
        title="Writing sprint"
        onClose={() => setOpen(false)}
        actions={sprintLengths.map((m) => ({ label: sprintMenuLabel(m), icon: 'timer-outline', onPress: () => startWritingSprint(lib, m) }))}
      />
    </>
  );
}

/** The sprint under way, at the foot of the page: the ring of time left, the clock, the words added, and Stop. */
export function SprintBar({ sprint }: { sprint: Sprint }) {
  const view = sprintBarOf(sprint);
  const r = 12;
  const c = 2 * Math.PI * r;
  return (
    <View style={styles.bar}>
      <Svg width={30} height={30} accessibilityLabel={`${view.ringLabel}: ${view.ringValueLabel}`}>
        <Circle cx={15} cy={15} r={r} stroke={colors.border} strokeWidth={4} fill="none" />
        <Circle
          cx={15}
          cy={15}
          r={r}
          stroke={colors.gold}
          strokeWidth={4}
          fill="none"
          strokeDasharray={`${c * Math.max(0, view.ringValue)} ${c}`}
          transform="rotate(-90 15 15)"
        />
      </Svg>
      <Text style={styles.clock}>{view.clock}</Text>
      <Text style={styles.words} numberOfLines={1}>
        {view.words}
      </Text>
      <OutlineButton label={view.stop} compact tone="muted" onPress={stopWritingSprint} />
    </View>
  );
}

/** The sprint done: what was written, in how long, at what pace, and whether it is the best yet; another, or done. */
export function SprintCard({ lib, result }: { lib: Library; result: SprintResult }) {
  const view = sprintCardOf(result);
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.ticket}>
        <View style={styles.ticketMain}>
          <Text style={styles.heading}>{view.heading.toUpperCase()}</Text>
          <Text style={styles.won}>{view.words}</Text>
        </View>
        <View style={styles.stub}>
          <Text style={styles.time}>{view.time}</Text>
          {view.pace && <Text style={styles.pace}>{view.pace}</Text>}
        </View>
      </View>
      {view.best && (
        <View style={styles.best}>
          <Icon name="trophy-outline" size={16} />
          <Text style={styles.bestText}>{view.best}</Text>
        </View>
      )}
      <View style={styles.actions}>
        <OutlineButton label={view.again} compact onPress={() => startWritingSprint(lib, result.minutes)} />
        <OutlineButton label={view.done} compact tone="muted" onPress={dismissSprintCard} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 },
  buttonText: { fontFamily: fonts.ui, fontSize: 13, color: colors.gold },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  clock: { fontFamily: fonts.numbers, fontSize: 18, color: colors.text },
  words: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(243,182,58,0.6)',
    backgroundColor: colors.surface,
  },
  ticket: { flexDirection: 'row', borderRadius: radius.field, backgroundColor: '#1F1C14', overflow: 'hidden' },
  ticketMain: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRightWidth: 1, borderRightColor: colors.border, borderStyle: 'dashed' },
  heading: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.gold },
  won: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  stub: { justifyContent: 'center', paddingHorizontal: space.md },
  time: { fontFamily: fonts.book, fontSize: 15, color: colors.text },
  pace: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  best: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.gold },
  bestText: { fontFamily: fonts.ui, fontSize: 13, color: colors.gold },
  actions: { flexDirection: 'row', gap: space.sm },
});
