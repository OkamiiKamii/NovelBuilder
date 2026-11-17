// THE WORD METER (FEATURES.md #119), under the page: today's words against the author's goal as a ring that closes
// when it is met (a press sets the goals), the sprint, this sitting's words, the chapter's length and reading time,
// this week against its goal, and the save status.

import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { formatNumber, plural } from '../../domain/desk/format';
import { Icon } from '../kit';
import { SavePill } from '../SavePill';
import { colors, fonts, space } from '../theme';

export function WordMeter({
  words,
  minutes,
  session,
  today,
  week,
  daily,
  weekly,
  onGoals,
  sprint,
}: {
  words: number;
  minutes: number;
  session: number;
  today: number;
  week: number;
  daily: number | null;
  weekly: number | null;
  onGoals: () => void;
  /** The Sprint button. */
  sprint?: ReactNode;
}) {
  const reached = daily !== null && today >= daily;
  const share = daily === null || daily === 0 ? 0 : Math.max(0, Math.min(1, today / daily));
  return (
    <View style={styles.meter}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          daily === null ? `Today: ${formatNumber(today)} words. Set a goal` : `Today: ${formatNumber(today)} of ${formatNumber(daily)} words`
        }
        onPress={onGoals}
        style={styles.goal}
        hitSlop={4}
      >
        {reached ? <Icon name="check-circle" size={20} color={colors.gold} /> : <Ring share={share} />}
        <Text style={[styles.text, reached && styles.strong, daily === null && styles.link]} numberOfLines={1}>
          {daily === null
            ? `Today: ${formatNumber(today)} words · Set a goal`
            : `Today: ${formatNumber(today)} of ${formatNumber(daily)} words${reached ? ' · goal reached' : ''}`}
        </Text>
      </Pressable>
      {sprint}
      {session !== 0 && (
        <Text style={[styles.text, styles.strong, { color: session > 0 ? colors.success : colors.muted }]}>
          {session > 0 ? '+' : '−'}
          {formatNumber(Math.abs(session))} this session
        </Text>
      )}
      <Text style={styles.text}>
        {plural(words, 'word')} · {minutes} min read
      </Text>
      {weekly !== null && (
        <Text style={styles.text}>
          This week: {formatNumber(week)} of {formatNumber(weekly)}
        </Text>
      )}
      <View style={styles.save}>
        <SavePill />
      </View>
    </View>
  );
}

function Ring({ share }: { share: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={20} height={20} accessibilityLabel="Today's goal">
      <Circle cx={10} cy={10} r={r} stroke={colors.border} strokeWidth={3} fill="none" />
      {share > 0 && (
        <Circle
          cx={10}
          cy={10}
          r={r}
          stroke={colors.gold}
          strokeWidth={3}
          fill="none"
          strokeDasharray={`${c * share} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 10 10)"
        />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  meter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.md,
    rowGap: 2,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  text: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  strong: { color: colors.text },
  link: { textDecorationLine: 'underline' },
  save: { marginLeft: 'auto' },
});
