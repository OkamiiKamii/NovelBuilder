// REVIEW (Organize › Review, the owner's choice of 2026-11-17): the Flutter app's Review area as a tab, its parts as
// chips over the part shown (flutter_app/lib/features/workspace/area_switch.dart's reviewParts, with Proofreading,
// which the Flutter app opens from its home screen). Each part also has its own page at /review/… for links.

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { TeamPane } from '../collab/TeamPane';
import { Chip, type IconName } from '../kit';
import { space } from '../theme';
import { CanonPane } from './CanonPane';
import { ConsequencesPane } from './ConsequencesPane';
import { ContinuityPane } from './ContinuityPane';
import { ProofPane } from './ProofPane';
import { RecordCheckPane } from './RecordCheckPane';
import { TimelineReviewPane } from './TimelineReviewPane';
import { WarningsPane } from './WarningsPane';

export type ReviewPart = 'warnings' | 'records' | 'timeline' | 'canon' | 'continuity' | 'proof' | 'consequences' | 'team';

const parts: { key: ReviewPart; label: string; icon: IconName }[] = [
  { key: 'warnings', label: 'All warnings', icon: 'format-list-checks' },
  { key: 'records', label: 'Record check', icon: 'clipboard-check-outline' },
  { key: 'timeline', label: 'Timeline review', icon: 'calendar-text-outline' },
  { key: 'canon', label: 'Canon', icon: 'check-decagram-outline' },
  { key: 'continuity', label: 'Continuity check', icon: 'spellcheck' },
  { key: 'proof', label: 'Proofreading', icon: 'text-search' },
  { key: 'consequences', label: 'What depends on this', icon: 'source-fork' },
  { key: 'team', label: 'Team and feedback', icon: 'account-group-outline' },
];

/** The part last shown, kept while the app runs (coming back from a record opens where you were). */
const remembered: { part: ReviewPart } = { part: 'warnings' };
/** Who shows it now, told when it is chosen from outside (search, the tutorial's "Take me there"). */
const heard = new Set<(v: ReviewPart) => void>();

/** What is shown, or last shown. */
export function currentReviewPart(): ReviewPart {
  return remembered.part;
}

/** Opens Review on `part` next time it is shown. */
export function rememberReviewPart(part: ReviewPart): void {
  remembered.part = part;
  for (const h of [...heard]) h(part);
}

export function ReviewPane() {
  const [part, setPartState] = useState<ReviewPart>(remembered.part);
  useEffect(() => {
    heard.add(setPartState);
    return () => {
      heard.delete(setPartState);
    };
  }, []);
  const setPart = (p: ReviewPart) => {
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
      {/* The parts are made to sit in a page that scrolls (PlanPage); here, the tab's own. */}
      <ScrollView key={part} style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {part === 'warnings' ? (
          <WarningsPane />
        ) : part === 'records' ? (
          <RecordCheckPane />
        ) : part === 'timeline' ? (
          <TimelineReviewPane />
        ) : part === 'canon' ? (
          <CanonPane />
        ) : part === 'continuity' ? (
          <ContinuityPane />
        ) : part === 'proof' ? (
          <ProofPane />
        ) : part === 'consequences' ? (
          <ConsequencesPane />
        ) : (
          <TeamPane />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  partsScroll: { flexGrow: 0 },
  parts: { gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm },
  body: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
});
