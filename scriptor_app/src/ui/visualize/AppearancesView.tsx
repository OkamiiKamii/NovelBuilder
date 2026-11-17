// Visualize › Character appearances (FEATURES.md #286): characters against chapters (or scenes), from recorded
// associations only — the author's appearance records, and the other records that tie a character to a chapter, each
// shown for what it is. A blank cell is nothing recorded, never proof that a character is not in the text. A chosen
// cell can be recorded (appears, mentioned, or the record removed). A port of
// flutter_app/lib/features/plot/appearances_page.dart; the matrix is src/domain/characters/appearances.ts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  type AppearanceMatrix,
  type Grain,
  type MatrixColumn,
  type MatrixRow,
  appearanceMatrix,
  cellStateLabel,
  evidenceWords,
} from '../../domain/characters/appearances';
import { characterPath } from '../../domain/characters/screens/create';
import { localeCompare } from '../../domain/collation';
import { EntityRef } from '../../domain/model/entityRef';
import type { StoryModel } from '../../domain/model/storyModel';
import { chapterPlanPath } from '../../domain/plot/plotService';
import { stableSorted } from '../../domain/reader/stableSort';
import { type NodeStatusKey, nodeStatuses } from '../../domain/records/nodeStatus';
import { dartTrim } from '../../domain/text/dartString';
import {
  appearanceBudget,
  appearanceCell,
  appearanceGlyph,
  appearanceName,
  appearancesWords as words,
  matrixCellWords,
  matrixSummary,
  ownAppearance,
  recordAppearance,
  rowLabels,
} from '../../domain/visualize/story/screens';
import { Chip, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { ChooserField } from '../organize/parts';
import { useCast } from '../organize/useCast';
import { usePlot } from '../plan/usePlot';
import { colors, fonts, space } from '../theme';
import { lastNodeSetting } from '../write/WriteScreen';
import { VizFrame, useVizFilters, useVizSelection } from './VizFrame';

export function AppearancesView() {
  const open = useCast();
  const [list, setList] = useState(false);
  return (
    <VizFrame
      view="appearances"
      title={words.title}
      subtitle={open?.cast.novelTitle}
      actions={
        <>
          <Chip label={words.matrix} icon="grid" selected={!list} onPress={() => setList(false)} />
          <Chip label={words.list} icon="format-list-bulleted" selected={list} onPress={() => setList(true)} />
        </>
      }
    >
      <AppearancesBody list={list} />
    </VizFrame>
  );
}

function AppearancesBody({ list }: { list: boolean }) {
  const open = useCast();
  const filters = useVizFilters();
  const { select } = useVizSelection();
  const [grain, setGrain] = useState<Grain>('chapters');
  const [status, setStatus] = useState<NodeStatusKey | null>(null);
  const [all, setAll] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [threadId, setThread] = useState<string | null>(null);
  const [placeId, setPlace] = useState<string | null>(null);
  const [rowsAsked, setRowsAsked] = useState<number | null>(null);
  const [cell, setCell] = useState<{ characterId: string; nodeId: string } | null>(null);
  if (open === null) return null;
  const model = open.cast.model;
  if (![...model.entries.values()].some((e) => e.category === 'character')) {
    return <Empty title={words.noCharacters.title} message={words.noCharacters.message} />;
  }
  if (model.order.chapters.length === 0) return <Empty title={words.noChapters.title} message={words.noChapters.message} />;
  const documents = model.order.chapters;
  const threads = stableSorted(model.threads.values(), (a, b) => localeCompare(a.title, b.title));
  const places = stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'location'),
    (a, b) => localeCompare(a.name, b.name),
  );
  const matrix: AppearanceMatrix = appearanceMatrix(model, {
    grain,
    characterIds: filters.involving === null ? [] : [filters.involving],
    text: filters.query,
    from,
    to,
    threadId,
    placeId,
    status,
    all,
  });
  const { columns, rows } = matrix;
  const filtered = from !== null || to !== null || threadId !== null || placeId !== null || status !== null || filters.involving !== null || dartTrim(filters.query).length > 0;
  const chosenRow = cell === null ? -1 : rows.findIndex((r) => r.characterId === cell.characterId);
  const chosenCol = cell === null ? -1 : columns.findIndex((c) => c.nodeId === cell.nodeId);
  const step = Math.max(20, Math.floor(appearanceBudget / Math.max(1, columns.length)));
  const drawn = rows.slice(0, Math.max(rowsAsked ?? step, chosenRow + 1));
  const chapterChoices = (first: string) => [{ value: '', label: first }, ...documents.map((d, i) => ({ value: d.id, label: `${i + 1}. ${d.title}` }))];
  const clear = () => {
    setFrom(null);
    setTo(null);
    setThread(null);
    setPlace(null);
    setStatus(null);
  };

  return (
    <View style={styles.gap}>
      <Panel>
        <Text style={styles.small}>
          <Text style={styles.label}>{words.fromRecords}</Text>
          {words.fromRecordsText}
        </Text>
      </Panel>
      <View style={styles.row}>
        <Chip label="Chapters" selected={grain === 'chapters'} onPress={() => setGrain('chapters')} />
        <Chip label="Scenes" selected={grain === 'scenes'} onPress={() => setGrain('scenes')} />
      </View>
      <ChooserField label={words.from} value={from ?? ''} choices={chapterChoices(words.first)} onChoose={(v) => setFrom(v.length === 0 ? null : v)} />
      <ChooserField label={words.to} value={to ?? ''} choices={chapterChoices(words.last)} onChoose={(v) => setTo(v.length === 0 ? null : v)} />
      {threads.length > 0 && (
        <ChooserField label={words.thread} value={threadId ?? ''} choices={[{ value: '', label: words.any }, ...threads.map((t) => ({ value: t.id, label: t.title }))]} onChoose={(v) => setThread(v.length === 0 ? null : v)} />
      )}
      {places.length > 0 && (
        <ChooserField label={words.place} value={placeId ?? ''} choices={[{ value: '', label: words.any }, ...places.map((p) => ({ value: p.id, label: p.name }))]} onChoose={(v) => setPlace(v.length === 0 ? null : v)} />
      )}
      <ChooserField
        label={words.status}
        value={status ?? ''}
        choices={[{ value: '', label: words.any }, ...nodeStatuses.map((s) => ({ value: s.key, label: s.label }))]}
        onChoose={(v) => setStatus(v.length === 0 ? null : (v as NodeStatusKey))}
      />
      <View style={styles.switchRow}>
        <Text style={[styles.body, styles.flex]}>{words.showAll}</Text>
        <Switch value={all} onValueChange={setAll} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.text} accessibilityLabel={words.showAll} />
      </View>

      {columns.length === 0 ? (
        <Panel style={styles.gapSm}>
          <Text style={styles.cellTitle}>{words.nothingMatches.title}</Text>
          <Muted>{words.nothingMatches.message}</Muted>
          <OutlineButton label={words.nothingMatches.action} compact onPress={clear} style={styles.start} />
        </Panel>
      ) : (
        <>
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {matrixSummary(rows, columns.length, matrix.hidden, grain, filtered)}
          </Text>
          {rows.length === 0 ? (
            <Panel style={styles.gapSm}>
              <Text style={styles.cellTitle}>{words.nothingHere.title}</Text>
              <Muted>{words.nothingHere.message}</Muted>
              <OutlineButton label={words.showEvery} compact onPress={() => setAll(true)} style={styles.start} />
            </Panel>
          ) : !list ? (
            <>
              <Matrix
                model={model}
                columns={columns}
                rows={drawn}
                chosen={chosenRow >= 0 && chosenCol >= 0 ? { row: chosenRow, col: chosenCol } : null}
                onChoose={(r, c) => setCell({ characterId: rows[r].characterId, nodeId: columns[c].nodeId })}
                onPickCharacter={(id) => select(new EntityRef('entry', id))}
              />
              {drawn.length < rows.length && (
                <View style={styles.gapXs}>
                  <Muted>{`Showing the first ${drawn.length} of ${rows.length} characters, by name, so the table stays quick. The list shows everyone.`}</Muted>
                  <View style={styles.row}>
                    <OutlineButton label={`Show ${Math.min(step, rows.length - drawn.length)} more`} compact onPress={() => setRowsAsked(drawn.length + step)} />
                    <OutlineButton label={`Show all ${rows.length} (may be slow)`} compact tone="muted" onPress={() => setRowsAsked(rows.length)} />
                  </View>
                </View>
              )}
              <Legend />
            </>
          ) : (
            rows.map((row) => (
              <Panel key={row.characterId} style={styles.gapXs}>
                <Text style={styles.cellTitle}>{row.name}</Text>
                {(['appears', 'mentioned', 'other'] as const).map((s) => {
                  const l = rowLabels(row, columns, s);
                  return l.length === 0 ? null : <Text key={s} style={styles.body}>{`${cellStateLabel[s]}: ${l.join(', ')}`}</Text>;
                })}
                <Muted>{`Nothing recorded: ${rowLabels(row, columns, 'none').length === 0 ? 'none' : rowLabels(row, columns, 'none').join(', ')}`}</Muted>
              </Panel>
            ))
          )}
          {chosenRow >= 0 && chosenCol >= 0 && (
            <CellPanel model={model} grain={grain} row={rows[chosenRow]} column={columns[chosenCol]} col={chosenCol} novelId={open.novelId} onPickEvent={(id) => select(new EntityRef('event', id))} />
          )}
        </>
      )}
    </View>
  );
}

function Empty({ title, message }: { title: string; message: string }) {
  return (
    <Panel style={styles.gapSm}>
      <Text style={styles.cellTitle}>{title}</Text>
      <Muted>{message}</Muted>
    </Panel>
  );
}

/** Characters by chapter: a row each, a cell of 48 square each, the names fixed at the left. */
function Matrix({
  model,
  columns,
  rows,
  chosen,
  onChoose,
  onPickCharacter,
}: {
  model: StoryModel;
  columns: readonly MatrixColumn[];
  rows: readonly MatrixRow[];
  chosen: { row: number; col: number } | null;
  onChoose: (row: number, col: number) => void;
  onPickCharacter: (id: string) => void;
}) {
  return (
    <View style={styles.matrix}>
      <View style={{ width: appearanceName }}>
        <View style={styles.headCell} />
        {rows.map((row) => (
          <Pressable key={row.characterId} accessibilityRole="button" accessibilityLabel={`Select ${row.name}`} onPress={() => onPickCharacter(row.characterId)} style={styles.nameCell}>
            <Text style={styles.name} numberOfLines={1}>
              {row.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={styles.flexRow}>
            {columns.map((c) => (
              <View key={c.nodeId} style={[styles.headCell, { width: appearanceCell }]} accessibilityLabel={c.label}>
                <Text style={styles.colHead} numberOfLines={1}>
                  {c.short}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((row, r) => (
            <View key={row.characterId} style={styles.flexRow}>
              {row.cells.map((cell, c) => {
                const isChosen = chosen?.row === r && chosen.col === c;
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isChosen }}
                    accessibilityLabel={matrixCellWords(model, row, columns[c], c, evidenceWords, cellStateLabel)}
                    onPress={() => onChoose(r, c)}
                    style={[styles.cell, isChosen && styles.chosen]}
                  >
                    <Text style={[styles.glyph, cell.state === 'appears' && { color: colors.gold }]}>{appearanceGlyph[cell.state]}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Legend() {
  const item = (glyph: string, label: string) => (
    <View key={label} style={styles.legendItem}>
      <Text style={styles.legendGlyph}>{glyph}</Text>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.label}>{words.legendTitle}</Text>
      {item('●', cellStateLabel.appears)}
      {item('◐', `${cellStateLabel.mentioned}${words.notOnPage}`)}
      {item('○', words.legendOther)}
      {item('', words.legendBlank)}
    </View>
  );
}

/** The chosen cell: what ties them there, the ways to open it, and the author's own record of it. */
function CellPanel({
  model,
  grain,
  row,
  column,
  col,
  novelId,
  onPickEvent,
}: {
  model: StoryModel;
  grain: Grain;
  row: MatrixRow;
  column: MatrixColumn;
  col: number;
  novelId: string;
  onPickEvent: (id: string) => void;
}) {
  const plot = usePlot();
  const lib = useLibrary();
  const router = useRouter();
  const cell = row.cells[col];
  const who = row.characterId;
  const own = ownAppearance(model, column.nodeId, who);
  const record = (as: 'appears' | 'mentioned' | null) => plot?.now(recordAppearance(column.nodeId, who, as));
  const evidence = evidenceWords(cell.evidence, model, column.nodeId);
  const openChapter = () => {
    lib.saves.saveNow(`setting:${lastNodeSetting(novelId)}`, () => lib.settings.write(lastNodeSetting(novelId), column.nodeId));
    router.navigate('/write');
  };
  return (
    <Panel style={styles.gapSm}>
      <Text style={styles.cellTitle}>{`${row.name} in ${column.label}`}</Text>
      <Text style={styles.body}>
        <Text style={styles.bold}>{`${cellStateLabel[cell.state]}. `}</Text>
        {cell.state === 'none' ? words.nothingTies : ''}
      </Text>
      {evidence.map((w, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.small}>{`• ${w}`}</Text>
          {cell.evidence[i].eventId !== null && (
            <Pressable accessibilityRole="button" onPress={() => onPickEvent(cell.evidence[i].eventId!)}>
              <Text style={styles.link}>{words.showEvent}</Text>
            </Pressable>
          )}
        </View>
      ))}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={openChapter}>
          <Text style={styles.link}>{`Open ${column.label} to write`}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.navigate(characterPath(who) as never)}>
          <Text style={styles.link}>{`Open ${row.name}`}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.navigate(chapterPlanPath(column.nodeId) as never)}>
          <Text style={styles.link}>{words.plan}</Text>
        </Pressable>
      </View>
      <View style={styles.row} accessibilityLabel="Your record">
        <OutlineButton label={words.recordAppears} compact disabled={own === 'appears'} onPress={() => record('appears')} />
        <OutlineButton label={words.recordMentioned} compact disabled={own === 'mentioned'} onPress={() => record('mentioned')} />
        {own !== null && <OutlineButton label={words.removeRecord} compact tone="muted" onPress={() => record(null)} />}
      </View>
      {grain === 'chapters' && cell.evidence.some((e) => e.nodeId !== column.nodeId) && <Muted>{words.sceneNote}</Muted>}
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexRow: { flexDirection: 'row' },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  start: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cellTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  bold: { fontWeight: '700' },
  small: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, flexShrink: 1 },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: colors.muted },
  link: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline', paddingVertical: 6 },
  matrix: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  headCell: { height: 36, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  colHead: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', color: colors.muted },
  nameCell: { height: appearanceCell, justifyContent: 'center', paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(39, 46, 64, 0.6)' },
  name: { fontFamily: fonts.ui, fontSize: 13.5, fontWeight: '700', color: colors.text },
  cell: { width: appearanceCell, height: appearanceCell, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(39, 46, 64, 0.6)' },
  chosen: { backgroundColor: 'rgba(243, 182, 58, 0.22)' },
  glyph: { fontSize: 18, color: colors.text },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 320 },
  legendGlyph: { width: 18, textAlign: 'center', color: colors.text },
});
