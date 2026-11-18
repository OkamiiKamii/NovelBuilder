// TIMELINE REVIEW (FEATURES.md #313): what the timeline's own records do not agree on (dates, ages, and where
// characters are when), each finding with its rule, what it rests on and the records to open. Nothing here changes the
// story or canon: the author fixes a record (and the finding goes), or keeps a decision about it (marked intentional
// with a reason, dismissed, reopened). A port of flutter_app/lib/features/timeline/timeline_review_page.dart; the
// findings are src/domain/timeline/review.ts's.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { decisionWord, timelineReviewSubtitle, timelineReviewWords as w } from '../../domain/canon/screens';
import { type ReviewFinding, reviewRuleWords, reviewRules } from '../../domain/timeline/review';
import { eventPath } from '../../domain/timeline/timelineService';
import { Icon, Muted, OutlineButton, Panel } from '../kit';
import { useTimeline } from '../plan/useTimeline';
import { colors } from '../theme';
import { Box, ReasonSheet, reviewStyles as s } from './parts';
import { useCanon } from './useCanon';

/** The page's subtitle, for its route's header. */
export function useTimelineReviewSubtitle(): string | undefined {
  const tl = useTimeline();
  if (!tl) return undefined;
  return timelineReviewSubtitle(tl.data.review.open.length, tl.data.findings.length, tl.data.model.events.size);
}

export function TimelineReviewPane() {
  const tl = useTimeline();
  const canon = useCanon();
  const router = useRouter();
  const [explaining, setExplaining] = useState<ReviewFinding | null>(null);
  if (!tl || !canon) return null;
  const data = tl.data;
  const { open, decided, gone } = data.review;
  const decide = (f: ReviewFinding, kind: 'intentional' | 'dismissed', note = '') => canon.decide(f.key, f.message, kind, note);

  return (
    <View style={s.gap}>
      {open.length === 0 && (
        <Panel style={s.gapSm}>
          <View style={s.row}>
            <Icon name="check-circle-outline" size={28} color={colors.success} />
            <Text style={s.strong}>{w.allClear}</Text>
          </View>
          <Muted>{w.allClearMessage}</Muted>
        </Panel>
      )}
      {reviewRules
        .filter((rule) => open.some((f) => f.rule === rule))
        .map((rule) => {
          const words = reviewRuleWords[rule];
          return (
            <Box key={rule} title={words.title} caption={`The rule: ${words.rule} It needs: ${words.needs}`}>
              {open
                .filter((f) => f.rule === rule)
                .map((f) => (
                  <View key={f.key} style={s.finding}>
                    <Text style={s.strong}>{f.message}</Text>
                    <Text style={s.small}>Because: {f.because}</Text>
                    <View style={s.row}>
                      <Text style={s.small}>{w.toResolve}</Text>
                      {f.eventIds.map((id) => (
                        <Pressable key={id} accessibilityRole="link" onPress={() => router.navigate(eventPath(id) as never)} hitSlop={6}>
                          <Text style={s.link}>Open “{data.eventName(id) ?? 'an event'}”</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={s.row}>
                      <OutlineButton label={w.intentional} compact onPress={() => setExplaining(f)} accessibilityLabel={`Mark as intentional: ${f.message}`} />
                      <OutlineButton label={w.dismiss} compact tone="muted" onPress={() => decide(f, 'dismissed')} accessibilityLabel={`Dismiss: ${f.message}`} />
                    </View>
                  </View>
                ))}
            </Box>
          );
        })}
      {(decided.length > 0 || gone.length > 0) && (
        <Box title={w.decided} caption={w.decidedCaption}>
          {decided.map(({ finding, decision }) => (
            <View key={decision.id} style={s.finding}>
              <Text style={s.body}>
                <Text style={s.strong}>{decisionWord(decision.decision)} </Text>
                {finding.message}
              </Text>
              <Text style={s.small}>The rule: {reviewRuleWords[finding.rule].rule}</Text>
              {decision.note.length > 0 && <Text style={s.small}>Your note: {decision.note}</Text>}
              <OutlineButton label={w.reopen} compact tone="muted" onPress={() => canon.reopen(decision.id)} accessibilityLabel={`Reopen: ${finding.message}`} />
            </View>
          ))}
          {gone.length > 0 && (
            <>
              <Text style={s.label}>{w.gone}</Text>
              {gone.map((d) => (
                <View key={d.id} style={s.row}>
                  <Muted>{d.message}</Muted>
                  <OutlineButton label={w.removeDecision} compact tone="muted" onPress={() => canon.reopen(d.id)} />
                </View>
              ))}
            </>
          )}
        </Box>
      )}
      {explaining && (
        <ReasonSheet
          onClose={() => setExplaining(null)}
          onSave={(note) => {
            decide(explaining, 'intentional', note);
            setExplaining(null);
          }}
        />
      )}
    </View>
  );
}
