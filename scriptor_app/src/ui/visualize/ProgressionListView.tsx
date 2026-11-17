// Visualize › Character progression (FEATURES.md #289): each character's progression state at the end of the story, as
// a list — only those with something recorded (abilities on a sheet, snapshots, progression changes); nobody is assumed
// to have a level. A row selects its character (the details panel opens it). A port of
// flutter_app/lib/features/visualize/view_lists_page.dart.

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EntityRef } from '../../domain/model/entityRef';
import { relatedIds } from '../../domain/model/navigate';
import { progressionLine, progressionListWords, selectionWords } from '../../domain/visualize/screens/frame';
import { progressionRows } from '../../domain/visualize/summaries';
import { viewOf } from '../../domain/visualize/views';
import { Icon, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';
import { useCast } from '../organize/useCast';
import { VizFrame, useVizMatching, useVizSelection, useVizSetFilter } from './VizFrame';

export function ProgressionListView() {
  const open = useCast();
  return (
    <VizFrame view="progression" title={viewOf('progression')!.label} subtitle={open?.cast.novelTitle} config={() => ({ mode: 'list' })}>
      <Rows />
    </VizFrame>
  );
}

function Rows() {
  const open = useCast();
  const { selected, select } = useVizSelection();
  const keep = useVizMatching(open, ['entry']);
  const setFilter = useVizSetFilter();
  const rows = useMemo(() => (open === null ? [] : progressionRows(open.cast.model, open.cast.snapshot.rows('progressSnapshots'))), [open?.cast]); // eslint-disable-line react-hooks/exhaustive-deps
  if (open === null) return null;
  const related = selected === null ? null : relatedIds(open.cast.model, selected);
  const shown = rows.filter((r) => keep === null || keep.has(`entry:${r.id}`));
  if (rows.length === 0) {
    return (
      <Panel style={styles.empty}>
        <Icon name="chart-line" size={36} color={colors.muted} />
        <Text style={styles.emptyTitle}>{progressionListWords.empty.title}</Text>
        <Muted style={styles.center}>{progressionListWords.empty.message}</Muted>
      </Panel>
    );
  }
  if (shown.length === 0) {
    return (
      <Panel style={styles.empty}>
        <Text style={styles.emptyTitle}>No matches</Text>
        <Muted style={styles.center}>Nothing here matches the filters.</Muted>
        <OutlineButton label="Clear the filters" compact onPress={() => setFilter({})} />
      </Panel>
    );
  }
  return (
    <View style={styles.list}>
      {shown.map((r) => {
        const mark = selectionWords(selected?.id ?? null, related, r.id);
        return (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityState={{ selected: mark === 'Selected' }}
            onPress={() => select(new EntityRef('entry', r.id))}
            style={({ pressed }) => [
              styles.row,
              mark === 'Selected' && styles.selected,
              mark !== null && mark !== 'Selected' && styles.related,
              pressed && { borderColor: colors.gold },
            ]}
          >
            <Text style={styles.name}>{r.name.length === 0 ? 'Untitled' : r.name}</Text>
            <Muted>{[progressionLine(r), ...(mark !== null ? [mark] : [])].filter((s) => s.length > 0).join(' · ')}</Muted>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: space.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textAlign: 'center' },
  list: { gap: 6 },
  row: { padding: space.md, gap: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.gold, backgroundColor: 'rgba(243, 182, 58, 0.12)' },
  related: { backgroundColor: colors.elevated },
  name: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', color: colors.text },
});
