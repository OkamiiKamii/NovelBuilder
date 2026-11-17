// Visualize › Character history (FEATURES.md #283): everything recorded about one character, put together — in story
// time, as the reader meets them, and throughout — with their age where the dates allow. Each line is a reference to
// the record it comes from (a press opens it); nothing is copied. Story time and reading order stay apart. A port of
// flutter_app/lib/features/timeline/life_history_page.dart; what is shown is src/domain/visualize/time/historyView.ts.

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lastNodeSetting } from '../write/WriteScreen';
import { characterPath } from '../../domain/characters/screens/create';
import { openRecord } from '../../domain/codex/screens/connections';
import type { HistoryItem } from '../../domain/timeline/lifeHistory';
import { eventPath } from '../../domain/timeline/timelineService';
import {
  historyIcons,
  historyKindLabel,
  historyPath,
  historyPressable,
  historySections,
  historySubtitle,
  historyWords as words,
  lifeOf,
} from '../../domain/visualize/time/historyView';
import { Icon, type IconName, Muted, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { ChooserField } from '../organize/parts';
import { useTimeline } from '../plan/useTimeline';
import { colors, fonts, space } from '../theme';
import { VizFrame } from './VizFrame';

export function HistoryView({ who }: { who: string | null }) {
  const tl = useTimeline();
  // Whose history it is is what a saved view of it keeps; the shared filters do not narrow one life.
  return (
    <VizFrame view="history" title={words.title} subtitle={tl?.data.cast.novelTitle} filters={false}>
      <HistoryBody who={who} />
    </VizFrame>
  );
}

function HistoryBody({ who }: { who: string | null }) {
  const tl = useTimeline();
  const lib = useLibrary();
  const router = useRouter();
  if (tl === null) return null;
  const cast = tl.data.cast;
  const characters = cast.characters();
  const chosen = who !== null && characters.some((c) => c.id === who) ? who : null;
  const life = lifeOf(
    tl.data.model,
    characters.map((c) => c.id),
    chosen,
    { snapshots: cast.snapshot.rows('progressSnapshots'), milestones: cast.snapshot.rows('characterHistory') },
  );

  const open = (item: HistoryItem) => {
    const ref = item.ref;
    if (ref !== null) {
      if (ref.type === 'event') return router.navigate(eventPath(ref.id) as never);
      if (ref.type === 'entry' && ref.id === chosen) return router.navigate(characterPath(ref.id) as never);
      const to = openRecord(cast, ref);
      if (to === null) return;
      if (to.kind === 'path') return router.navigate(to.path as never);
      // A chapter: open it in Write.
      const key = lastNodeSetting(tl.novelId);
      lib.saves.saveNow(`setting:${key}`, () => lib.settings.write(key, to.nodeId));
      return router.navigate('/write');
    }
    // Milestones live on the character's History tab.
    if (item.to?.page === 'history' && chosen !== null) router.navigate(characterPath(chosen, { tab: 'history' }) as never);
  };

  return (
    <View style={styles.gap}>
      <ChooserField
        label={words.whose}
        value={chosen ?? ''}
        choices={[{ value: '', label: words.choose }, ...characters.map((c) => ({ value: c.id, label: c.name || 'Unnamed' }))]}
        onChoose={(v) => router.replace(historyPath(v.length === 0 ? null : v) as never)}
      />
      {characters.length === 0 ? (
        <Panel style={styles.empty}>
          <Icon name="account-outline" size={36} />
          <Text style={styles.emptyTitle}>{words.emptyTitle}</Text>
          <Muted style={styles.centre}>{words.emptyMessage}</Muted>
        </Panel>
      ) : life === null ? (
        <Muted>{words.chooseFirst}</Muted>
      ) : (
        <>
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {life.born}
          </Text>
          {life.issues.length > 0 && (
            <Panel style={styles.gapXs}>
              <Text style={styles.heading}>{words.worth}</Text>
              <Muted>{words.worthCaption}</Muted>
              {life.issues.map((issue, i) => (
                <Text key={i} style={styles.body}>
                  {issue}
                </Text>
              ))}
            </Panel>
          )}
          {historySections(life).map((s) => (
            <Panel key={s.title} style={styles.gapXs}>
              <Text style={styles.heading}>{s.title}</Text>
              <Muted>{s.caption}</Muted>
              {s.items.length === 0 ? (
                <Muted>{s.empty}</Muted>
              ) : (
                s.items.map((i) => {
                  const pressable = historyPressable(i);
                  return (
                    <Pressable
                      key={i.key}
                      accessibilityRole={pressable ? 'button' : 'text'}
                      accessibilityLabel={`${historyKindLabel(i.kind)}: ${i.title}. ${historySubtitle(i)}`}
                      disabled={!pressable}
                      onPress={() => open(i)}
                      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
                    >
                      <Icon name={historyIcons[i.kind] as IconName} size={22} color={colors.gold} />
                      <View style={styles.flex}>
                        <Text style={styles.title}>{i.title}</Text>
                        <Muted>{historySubtitle(i)}</Muted>
                      </View>
                      {pressable && <Icon name="chevron-right" size={20} color={colors.muted} />}
                    </Pressable>
                  );
                })
              )}
            </Panel>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapXs: { gap: space.xs },
  centre: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: space.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  heading: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  title: { fontFamily: fonts.ui, fontSize: 14.5, fontWeight: '600', color: colors.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderRadius: 8 },
  pressed: { backgroundColor: colors.elevated },
});
