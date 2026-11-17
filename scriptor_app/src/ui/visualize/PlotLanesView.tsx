// Visualize › Plot board (FEATURES.md #284): each plot thread as a lane across the chapters, from what the author
// records — where it is introduced, develops, crosses another thread and is resolved, and the events that belong to
// it. Chapters in between with nothing recorded are shown, and counted, as just that. As lanes (drawn, scrolling
// sideways) or as a list. A port of flutter_app/lib/features/plot/plot_lanes_page.dart; what it says is
// src/domain/visualize/story/screens.ts, the lanes src/domain/plot/lanes.ts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { localeCompare } from '../../domain/collation';
import { EntityRef } from '../../domain/model/entityRef';
import type { StoryModel } from '../../domain/model/storyModel';
import { type Lane, type Lanes, beatRoleKeys, beatRoleLabels, endsOf, gapWords, roleKey, threadLanes } from '../../domain/plot/lanes';
import { categoryName } from '../../domain/plot/plotChanges';
import { boardPath, threadPath } from '../../domain/plot/plotService';
import { threadStatusName } from '../../domain/plot/screens/threads';
import { stableSorted } from '../../domain/reader/stableSort';
import { foldText } from '../../domain/text/fold';
import { dartTrim } from '../../domain/text/dartString';
import { nodeLabel } from '../../domain/timeline/narrative';
import {
  laneCellWords,
  laneColumn,
  laneLines,
  laneNameWidth,
  laneRow,
  laneSequence,
  lanesHead,
  lanesLabel,
  lanesWords as words,
} from '../../domain/visualize/story/screens';
import { Chip, Muted, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { useCast } from '../organize/useCast';
import { colors, fonts, sizeClassOf, space } from '../theme';
import { lastNodeSetting } from '../write/WriteScreen';
import { VizFrame, type VizFilters, useVizFilters, useVizSelection } from './VizFrame';

/** The colour of a beat's role. Each role also has its own shape, so colour is never the only difference. */
export function roleColor(role: string | null): string {
  switch (role) {
    case 'introduction':
      return colors.success;
    case 'development':
      return colors.gold;
    case 'intersection':
      return colors.sky;
    case 'resolution':
      return colors.danger;
    case 'appears':
      return colors.muted;
    default:
      return colors.text;
  }
}

/** A beat's role as a shape: a ring, a dot, a diamond, a square or a small dot; only events, a triangle. */
export function RoleMark({ role, x, y }: { role: string | null; x: number; y: number }) {
  const fill = roleColor(role);
  switch (role) {
    case 'introduction':
      return <Circle cx={x} cy={y} r={6} fill="none" stroke={fill} strokeWidth={3} />;
    case 'development':
      return <Circle cx={x} cy={y} r={6} fill={fill} />;
    case 'intersection':
      return <Path d={`M${x} ${y - 8} L${x + 8} ${y} L${x} ${y + 8} L${x - 8} ${y} Z`} fill={fill} />;
    case 'resolution':
      return <Rect x={x - 6.5} y={y - 6.5} width={13} height={13} fill={fill} />;
    case 'appears':
      return <Circle cx={x} cy={y} r={3.5} fill={fill} />;
    default:
      return <Path d={`M${x} ${y - 7} L${x + 7} ${y + 6} L${x - 7} ${y + 6} Z`} fill={fill} />;
  }
}

/** The threads the shared filters keep, by id, or null when no filter is on. */
function threadIds(model: StoryModel, filters: VizFilters): Set<string> | null {
  const query = foldText(dartTrim(filters.query));
  if (query.length === 0 && filters.involving === null) return null;
  const out = new Set<string>();
  for (const t of model.threads.values()) {
    if (query.length > 0 && !foldText(t.title).includes(query)) continue;
    if (filters.involving !== null && !t.characterIds.includes(filters.involving)) continue;
    out.add(t.id);
  }
  return out;
}

export function PlotLanesView() {
  const open = useCast();
  const [list, setList] = useState(false);
  return (
    <VizFrame
      view="plot"
      title={words.title}
      subtitle={open?.cast.novelTitle}
      actions={
        <>
          <Chip label={words.lanes} icon="view-stream-outline" selected={!list} onPress={() => setList(false)} />
          <Chip label={words.list} icon="format-list-bulleted" selected={list} onPress={() => setList(true)} />
        </>
      }
    >
      <LanesBody list={list} />
    </VizFrame>
  );
}

function LanesBody({ list }: { list: boolean }) {
  const open = useCast();
  const filters = useVizFilters();
  const { selected, select } = useVizSelection();
  const [chosen, setChosen] = useState<{ key: string; lane: number; col: number } | null>(null);
  if (open === null) return null;
  const model = open.cast.model;
  if (model.threads.size === 0) {
    return (
      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>{words.noThreads.title}</Text>
        <Muted>{words.noThreads.message}</Muted>
      </Panel>
    );
  }
  const keep = threadIds(model, filters);
  const ids = stableSorted(model.threads.values(), (a, b) => localeCompare(a.title, b.title))
    .filter((t) => keep === null || keep.has(t.id))
    .map((t) => t.id);
  if (ids.length === 0) return <Muted>Nothing matches these filters.</Muted>;
  const lanes = threadLanes(model, ids);
  const key = ids.join(',');
  const here = chosen?.key === key ? chosen : null;
  const selectedId = selected?.type === 'thread' ? selected.id : null;
  const selectedLane = lanes.lanes.find((l) => l.thread.id === selectedId);
  if (lanes.chapters.length === 0) {
    return (
      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>{words.noChapters.title}</Text>
        <Muted>{words.noChapters.message}</Muted>
      </Panel>
    );
  }
  if (list) {
    return (
      <View style={styles.gap}>
        {lanes.lanes.map((lane) => (
          <Sequence key={lane.thread.id} model={model} lane={lane} lanes={lanes} novelId={open.novelId} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.gap}>
      <LanesDrawing
        lanes={lanes}
        selectedId={selectedId}
        chosen={here}
        words={(lane, col) => laneCellWords(model, lanes, lane, col)}
        onChoose={(lane, col) => setChosen({ key, lane, col })}
        onSelectThread={(id) => select(new EntityRef('thread', id))}
      />
      <Legend />
      <Panel style={styles.gapSm}>
        {here === null ? (
          <Muted>{words.choose}</Muted>
        ) : (
          <>
            <Text style={styles.cellTitle}>{laneCellWords(model, lanes, lanes.lanes[here.lane], here.col)}</Text>
            <Places model={model} lane={lanes.lanes[here.lane]} col={here.col} novelId={open.novelId} />
          </>
        )}
      </Panel>
      {selectedLane !== undefined && <Sequence model={model} lane={selectedLane} lanes={lanes} novelId={open.novelId} />}
    </View>
  );
}

function useOpenChapter(novelId: string) {
  const lib = useLibrary();
  const router = useRouter();
  return (nodeId: string) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(novelId)}`, () => lib.settings.write(lastNodeSetting(novelId), nodeId));
    router.navigate('/write');
  };
}

/** What a chapter holds for a lane: each place, its beats and events. */
function Places({ model, lane, col, novelId }: { model: StoryModel; lane: Lane; col: number; novelId: string }) {
  const openChapter = useOpenChapter(novelId);
  const { select } = useVizSelection();
  return (
    <View style={styles.gapSm}>
      {lane.cells[col].places.map((p) => (
        <View key={p.nodeId} style={styles.gapXs}>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" onPress={() => openChapter(p.nodeId)}>
              <Text style={styles.link}>Open {nodeLabel(model, p.nodeId)}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => select(new EntityRef('node', p.nodeId))}>
              <Text style={styles.link}>Show details</Text>
            </Pressable>
          </View>
          {p.beats.map((b) => {
            const crosses = b.withThreadIds.filter((id) => model.threads.has(id)).map((id) => model.threads.get(id)!.title);
            return (
              <Text key={b.id} style={styles.indent}>
                <Text style={styles.label}>{beatRoleLabels[roleKey(b)]}</Text>
                {`  ${dartTrim(b.title).length === 0 ? 'No title' : dartTrim(b.title)}`}
                {dartTrim(b.note).length > 0 ? <Text style={styles.muted}>{` · ${dartTrim(b.note)}`}</Text> : null}
                {roleKey(b) === 'intersection' && crosses.length > 0 ? ` · crosses ${crosses.join(', ')}` : ''}
              </Text>
            );
          })}
          {p.eventIds.map((id) => (
            <Pressable key={id} accessibilityRole="button" onPress={() => select(new EntityRef('event', id))} style={styles.indentRow}>
              <Text style={styles.label}>Event</Text>
              <Text style={styles.link}>{model.events.get(id)?.name ?? 'an event'}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

/** A thread from start to end: each chapter with something recorded, and the gaps between, in reading order. */
function Sequence({ model, lane, lanes, novelId }: { model: StoryModel; lane: Lane; lanes: Lanes; novelId: string }) {
  const router = useRouter();
  const { select } = useVizSelection();
  const ends = endsOf(lane, lanes);
  const thread = lane.thread;
  const seq = laneSequence(model, lane);
  const steps: React.ReactNode[] = [];
  lane.cells.forEach((c, col) => {
    if (c.places.length > 0) {
      steps.push(
        <View key={`c${col}`} style={styles.gapXs}>
          <Text style={styles.cellTitle}>Ch {lanes.chapters[col].number}</Text>
          <Places model={model} lane={lane} col={col} novelId={novelId} />
        </View>,
      );
    }
    const gap = lane.gaps.find((g) => g.from === col);
    if (gap !== undefined) {
      steps.push(
        <Muted key={`g${col}`}>{gapWords(lanes, gap)}</Muted>,
      );
    }
  });
  return (
    <Panel style={styles.gapSm}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => select(new EntityRef('thread', thread.id))}>
          <Text style={styles.threadTitle}>{thread.title.length === 0 ? 'Untitled thread' : thread.title}</Text>
        </Pressable>
        <Text style={styles.label}>{threadStatusName(thread) ?? ''}</Text>
        <Muted>{categoryName(thread)}</Muted>
      </View>
      <Text style={styles.body}>
        Introduced: {ends.introduced} · Resolved: {ends.resolved}
      </Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => router.navigate(boardPath(thread.id) as never)}>
          <Text style={styles.link}>{words.board}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.navigate(threadPath(thread.id) as never)}>
          <Text style={styles.link}>{words.edit}</Text>
        </Pressable>
      </View>
      {steps.length === 0 ? <Muted>{words.nothingPlaced}</Muted> : steps}
      {seq.unplaced !== null && <Muted>{seq.unplaced}</Muted>}
      {seq.untold !== null && <Muted>{seq.untold}</Muted>}
    </Panel>
  );
}

/** The lanes, drawn: a lane for each thread, a column for each chapter, the marks, the lines, the crossings. Each cell
 * is its own tap target (48 square); the threads' names select them. */
function LanesDrawing({
  lanes,
  selectedId,
  chosen,
  words: cellWords,
  onChoose,
  onSelectThread,
}: {
  lanes: Lanes;
  selectedId: string | null;
  chosen: { lane: number; col: number } | null;
  words: (lane: Lane, col: number) => string;
  onChoose: (lane: number, col: number) => void;
  onSelectThread: (id: string) => void;
}) {
  const compact = sizeClassOf(useWindowDimensions().width) === 'compact';
  const nameW = laneNameWidth(compact);
  const cols = lanes.chapters.length;
  const width = nameW + cols * laneColumn + 10;
  const height = lanesHead + lanes.lanes.length * laneRow + 6;
  const x = (col: number) => nameW + col * laneColumn + laneColumn / 2;
  const y = (lane: number) => lanesHead + lane * laneRow + laneRow / 2;
  const laneOf = new Map(lanes.lanes.map((l, i) => [l.thread.id, i]));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={lanesLabel(lanes)}>
      <View style={{ width, height }}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          {lanes.chapters.map((c, i) => (
            <SvgText key={c.id} x={x(i)} y={lanesHead - 14} fontSize={11} fontFamily={fonts.ui} fill={colors.muted} textAnchor="middle">
              {`${c.number}`}
            </SvgText>
          ))}
          {lanes.lanes.map((lane, l) => {
            const top = lanesHead + l * laneRow;
            const selected = lane.thread.id === selectedId;
            return (
              <G key={lane.thread.id}>
                <Rect x={0} y={top + 2} width={width} height={laneRow - 4} fill={selected ? 'rgba(56, 189, 248, 0.14)' : colors.surface} />
                <Rect x={4} y={top + 4} width={nameW - 10} height={laneRow - 8} rx={6} fill={colors.background} stroke={selected ? colors.sky : colors.border} />
                {laneLines(lane).map((ln) => {
                  if (!ln.gap) return <Line key={`l${ln.from}`} x1={x(ln.from)} y1={y(l)} x2={x(ln.to)} y2={y(l)} stroke={colors.text} strokeWidth={2} />;
                  return (
                    <G key={`l${ln.from}`}>
                      <Line x1={x(ln.from)} y1={y(l)} x2={x(ln.to)} y2={y(l)} stroke={colors.muted} strokeWidth={2} strokeDasharray="4 4" />
                      <SvgText x={(x(ln.from) + x(ln.to)) / 2} y={y(l) - 10} fontSize={11} fontFamily={fonts.ui} fill={colors.muted} textAnchor="middle">
                        {`${ln.between} ch.`}
                      </SvgText>
                    </G>
                  );
                })}
                {lane.crossings.map((c) => {
                  const other = laneOf.get(c.otherId);
                  if (other === undefined) return null;
                  return (
                    <G key={`x${c.beatId}${c.otherId}`}>
                      <Line x1={x(c.column)} y1={y(l)} x2={x(c.column)} y2={y(other)} stroke={colors.sky} strokeWidth={1.5} strokeDasharray="5 5" />
                      <Circle cx={x(c.column)} cy={y(other)} r={4.5} fill={colors.sky} />
                    </G>
                  );
                })}
                {lane.cells.map((cell, col) => {
                  const isChosen = chosen?.lane === l && chosen.col === col;
                  const count = cell.beats.length + cell.eventIds.length;
                  return (
                    <G key={`c${col}`}>
                      {isChosen && <Rect x={nameW + col * laneColumn + 2} y={top + 4} width={laneColumn - 4} height={laneRow - 8} rx={4} fill="rgba(243, 182, 58, 0.22)" />}
                      {cell.places.length > 0 && <RoleMark role={cell.role} x={x(col)} y={y(l)} />}
                      {count > 1 && (
                        <SvgText x={x(col) + 9} y={y(l) - 10} fontSize={11} fontFamily={fonts.ui} fill={colors.muted}>
                          {`${count}`}
                        </SvgText>
                      )}
                    </G>
                  );
                })}
              </G>
            );
          })}
        </Svg>
        {lanes.lanes.map((lane, l) => (
          <View key={lane.thread.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: lane.thread.id === selectedId }}
              accessibilityLabel={`${lane.thread.title}, ${threadStatusName(lane.thread) ?? ''}. Select the thread`}
              onPress={() => onSelectThread(lane.thread.id)}
              style={[styles.name, { top: lanesHead + l * laneRow + 4, width: nameW - 10 }]}
            >
              <Text style={styles.nameText} numberOfLines={1}>
                {lane.thread.title}
              </Text>
              <Text style={styles.nameStatus} numberOfLines={1}>
                {threadStatusName(lane.thread) ?? ''}
              </Text>
            </Pressable>
            {lane.cells.map((_, col) => (
              <Pressable
                key={col}
                accessibilityRole="button"
                accessibilityLabel={cellWords(lane, col)}
                onPress={() => onChoose(l, col)}
                style={{ position: 'absolute', left: nameW + col * laneColumn, top: lanesHead + l * laneRow, width: laneColumn, height: laneRow }}
              />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** What the lanes show: each role, events, and the lines. */
function Legend() {
  const item = (mark: React.ReactNode, label: string, key: string) => (
    <View key={key} style={styles.legendItem}>
      <Svg width={22} height={18}>
        {mark}
      </Svg>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.label}>{words.legend}</Text>
      {beatRoleKeys.map((r) => item(<RoleMark role={r} x={11} y={9} />, beatRoleLabels[r], r))}
      {item(<RoleMark role={null} x={11} y={9} />, words.event, 'event')}
      {item(<Line x1={2} y1={9} x2={20} y2={9} stroke={colors.text} strokeWidth={2} />, words.neighbours, 'line')}
      {item(<Line x1={2} y1={9} x2={20} y2={9} stroke={colors.muted} strokeWidth={2} strokeDasharray="4 4" />, words.between, 'gap')}
      {item(<Line x1={11} y1={1} x2={11} y2={17} stroke={colors.sky} strokeWidth={1.5} strokeDasharray="3 3" />, words.crossing, 'cross')}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  cellTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  threadTitle: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.gold },
  body: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: colors.muted },
  muted: { color: colors.muted },
  small: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, flexShrink: 1 },
  link: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline', paddingVertical: 6 },
  indent: { marginLeft: space.md, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  indentRow: { marginLeft: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { position: 'absolute', left: 4, height: laneRow - 8, justifyContent: 'center', paddingHorizontal: 8 },
  nameText: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.text },
  nameStatus: { fontFamily: fonts.ui, fontSize: 11, color: colors.muted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 320 },
});
