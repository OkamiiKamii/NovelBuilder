// HOW MUCH A DAY (FEATURES.md #121): setting a writing goal is a choice of four cards, each a number of words a day,
// what it is in manuscript pages, and (when the novel has a target) the day the draft would be done at that pace. One
// press chooses; "No daily goal" and the author's own numbers (a day, a week) stay beneath. Goals are the author's;
// none is assumed. A port of flutter_app/lib/features/write/goal_pledge.dart.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayKeyAt } from '../../domain/goals/days';
import {
  noGoalLabel,
  ownDailyField,
  ownNumbersLabel,
  ownWeeklyField,
  pledgeCancel,
  pledgeCards,
  pledgeChoose,
  pledgeNote,
  pledgeOpen,
  pledgeResult,
  pledgeSaveLabel,
  type PledgeState,
  pledgeTitle,
} from '../../domain/goals/goalPledge';
import { Sheet } from '../dialogs';
import { Field, GoldButton, Icon, Muted, OutlineButton } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';

export function GoalPledgeSheet({
  visible,
  novelId,
  words,
  target,
  onClose,
}: {
  visible: boolean;
  novelId: string;
  /** The manuscript's words now, and its target, for the day each pace would finish the draft. */
  words: number;
  target: number | null;
  onClose: () => void;
}) {
  const lib = useLibrary();
  const toast = useToast();
  const [state, setState] = useState<PledgeState>(() => pledgeOpen(lib.manuscript.wordGoals(novelId)));
  useEffect(() => {
    if (visible) setState(pledgeOpen(lib.manuscript.wordGoals(novelId)));
  }, [visible, lib, novelId]);

  const cards = pledgeCards(state, { words, target, today: dayKeyAt(Date.now()) });
  const save = () => {
    const goals = pledgeResult(state);
    try {
      lib.manuscript.setWordGoal(novelId, 'daily', goals.daily);
      lib.manuscript.setWordGoal(novelId, 'weekly', goals.weekly);
      onClose();
    } catch (e) {
      toast(`The goals could not be saved (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={pledgeTitle}
      footer={
        <>
          <OutlineButton label={pledgeCancel} onPress={onClose} tone="muted" style={styles.flex} />
          <GoldButton label={pledgeSaveLabel} onPress={save} style={styles.flex} />
        </>
      }
    >
      <Muted>{pledgeNote}</Muted>
      <View style={styles.cards}>
        {cards.map((c) => (
          <Pressable
            key={c.words}
            accessibilityRole="radio"
            accessibilityState={{ checked: c.chosen }}
            accessibilityLabel={c.semanticsLabel}
            onPress={() => setState(pledgeChoose(state, c.words))}
            style={({ pressed }) => [styles.card, c.chosen && styles.cardOn, pressed && { backgroundColor: colors.elevated }]}
          >
            <View style={styles.numberRow}>
              <Text style={styles.number}>{c.number}</Text>
              <Text style={styles.unit}>{c.unit}</Text>
            </View>
            <Text style={styles.pages}>{c.pages}</Text>
            {c.finish && <Text style={styles.finish}>{c.finish}</Text>}
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => setState(pledgeChoose(state, null))} style={styles.text}>
          <Text style={styles.textLabel}>{noGoalLabel(state)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setState({ ...state, ownOpen: !state.ownOpen })} style={styles.text}>
          <Icon name={state.ownOpen ? 'chevron-up' : 'pencil-outline'} size={18} />
          <Text style={styles.textLabel}>{ownNumbersLabel}</Text>
        </Pressable>
      </View>
      {state.ownOpen && (
        <>
          <Field
            label={ownDailyField.label}
            placeholder={ownDailyField.hint}
            keyboardType="number-pad"
            value={state.own}
            onChangeText={(v) => setState({ ...state, own: v.replace(/[^0-9]/g, '') })}
          />
          <Field
            label={ownWeeklyField.label}
            placeholder={ownWeeklyField.hint}
            keyboardType="number-pad"
            value={state.weekly}
            onChangeText={(v) => setState({ ...state, weekly: v.replace(/[^0-9]/g, '') })}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: space.md },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 2,
    padding: space.md,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardOn: { borderColor: colors.gold, borderWidth: 2, backgroundColor: '#1F1A0D' },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  number: { fontFamily: fonts.display, fontSize: 28, color: colors.gold },
  unit: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted },
  pages: { fontFamily: fonts.bookItalic, fontSize: 15, color: colors.text },
  finish: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.sm },
  text: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.sm },
  textLabel: { fontFamily: fonts.ui, fontSize: 15, color: colors.gold },
});
