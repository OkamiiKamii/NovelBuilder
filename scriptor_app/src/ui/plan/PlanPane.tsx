// PLAN (Organize › Plan): the five parts of the Flutter app's Plan area, as chips over the part shown — the timeline,
// the plot threads, the scene board, alternate histories and the story calendar
// (flutter_app/lib/features/workspace/area_switch.dart's planParts). Each part's own pages (an event, a thread, a
// chapter's plan) open as pages of their own under /plan/…, at the Flutter app's paths.

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip, type IconName } from '../kit';
import { space } from '../theme';
import { BoardPane } from './BoardPane';
import { CalendarPane } from './CalendarPane';
import { HistoriesPane } from './HistoriesPane';
import { ThreadsPane } from './ThreadsPane';
import { TimelinePane } from './TimelinePane';

export type PlanPart = 'timeline' | 'threads' | 'board' | 'histories' | 'calendar';

const parts: { key: PlanPart; label: string; icon: IconName }[] = [
  { key: 'timeline', label: 'Timeline', icon: 'timeline-outline' },
  { key: 'threads', label: 'Plot threads', icon: 'source-branch' },
  { key: 'board', label: 'Scene board', icon: 'view-column-outline' },
  { key: 'histories', label: 'Alternate histories', icon: 'call-split' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar-month-outline' },
];

/** The part last shown, kept while the app runs (coming back from an event or a thread opens where you were). */
const remembered: { part: PlanPart } = { part: 'timeline' };
/** Who shows it now, told when it is chosen from outside (search, the tutorial's "Take me there"). */
const heard = new Set<(v: PlanPart) => void>();

/** What is shown, or last shown. */
export function currentPlanPart(): PlanPart {
  return remembered.part;
}

/** Opens Plan on `part` next time it is shown (the /plan and /plan/threads routes). */
export function rememberPlanPart(part: PlanPart): void {
  remembered.part = part;
  for (const h of [...heard]) h(part);
}

export function PlanPane() {
  const [part, setPartState] = useState<PlanPart>(remembered.part);
  useEffect(() => {
    heard.add(setPartState);
    return () => {
      heard.delete(setPartState);
    };
  }, []);
  // The history open in the Alternate histories part: kept in the tab rather than in the route.
  const [history, setHistory] = useState<string | null>(null);
  const setPart = (p: PlanPart) => {
    remembered.part = p;
    setPartState(p);
  };
  return (
    <View style={styles.flex}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partsScroll} contentContainerStyle={styles.parts}>
        {parts.map((p) => (
          <Chip key={p.key} label={p.label} icon={p.icon} selected={p.key === part} onPress={() => setPart(p.key)} />
        ))}
      </ScrollView>
      {part === 'threads' ? (
        // The thread list scrolls by itself; the other parts are made to sit in a page that scrolls (PlanPage).
        <View style={styles.flex}>
          <ThreadsPane />
        </View>
      ) : (
        <ScrollView key={part} style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {part === 'timeline' ? (
            <TimelinePane />
          ) : part === 'board' ? (
            <BoardPane />
          ) : part === 'histories' ? (
            <HistoriesPane historyId={history} onSelect={setHistory} />
          ) : (
            <CalendarPane />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  partsScroll: { flexGrow: 0 },
  parts: { gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm },
  body: { padding: space.md, paddingBottom: space.xxl },
});
