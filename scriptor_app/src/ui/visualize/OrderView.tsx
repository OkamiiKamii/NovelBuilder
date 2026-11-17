// Visualize › Story and reading order (FEATURES.md #282): when things happen beside when the reader meets them —
// chapters on the left, events on the right, joined by lines styled by how each is told — with notes on what goes
// back or ahead in time, and the same as two lists. Linking a chapter, or marking how it tells an event, never moves
// the event in time or reorders a chapter. A port of flutter_app/lib/features/timeline/order_page.dart; what is shown
// is src/domain/visualize/time/orderView.ts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { EntityRef } from '../../domain/model/entityRef';
import { orderSummary, tellingNotes, twoOrders } from '../../domain/timeline/narrative';
import { eventPath } from '../../domain/timeline/timelineService';
import {
  eventNameOf,
  eventSaid,
  lineDrawing,
  nodeSaid,
  orderGutter,
  orderLegend,
  orderLines,
  orderLists,
  orderRow,
  orderShown,
  orderWords_ as words,
  relatedTo,
} from '../../domain/visualize/time/orderView';
import { Chip, Icon, Muted, OutlineButton, Panel } from '../kit';
import { useTimeline } from '../plan/useTimeline';
import { colors, fonts, sizeClassOf, space } from '../theme';
import { eventKeys } from './TimelineView';
import { VizFrame, useVizFilter, useVizSelection } from './VizFrame';

export function OrderView() {
  const tl = useTimeline();
  return (
    <VizFrame view="order" title={words.title} subtitle={tl?.data.cast.novelTitle}>
      <OrderBody />
    </VizFrame>
  );
}

function OrderBody() {
  const tl = useTimeline();
  const router = useRouter();
  const filters = useVizFilter();
  const { selected: selection, select: selectRef } = useVizSelection();
  const compact = sizeClassOf(useWindowDimensions().width) === 'compact';
  const [list, setList] = useState(false);
  const [allNotes, setAllNotes] = useState(false);
  if (tl === null) return null;
  const model = tl.data.model;
  // Back and ahead are always worked out against the whole book; filtering only narrows what is shown.
  const orders = twoOrders(model);
  const notes = tellingNotes(orders, model);
  const { events, tellings, nodes } = orderShown(orders, eventKeys(model, filters));
  const selected = selection?.type === 'event' || selection?.type === 'node' ? selection.id : null;
  const select = (id: string) => {
    if (selected === id) return selectRef(null);
    selectRef(new EntityRef(model.events.has(id) ? 'event' : 'node', id));
  };
  const openEvent = (id: string) => router.navigate(eventPath(id) as never);
  const name = eventNameOf(model);

  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <Chip label={words.sideBySide} icon="compare-horizontal" selected={!list} onPress={() => setList(false)} />
        <Chip label={words.list} icon="format-list-bulleted" selected={list} onPress={() => setList(true)} />
      </View>
      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {orderSummary(orders)}
      </Text>
      {notes.length > 0 && (
        <Panel style={styles.gapXs}>
          <Text style={styles.heading}>{words.worth}</Text>
          {(allNotes ? notes : notes.slice(0, 5)).map((n, i) => (
            <Text key={i} style={styles.body}>
              {n.note}
            </Text>
          ))}
          {notes.length > 5 && (
            <OutlineButton label={allNotes ? words.showFewer : words.showAll(notes.length)} compact tone="muted" onPress={() => setAllNotes(!allNotes)} style={styles.start} />
          )}
        </Panel>
      )}
      {orders.events.length === 0 ? (
        <Panel style={styles.empty}>
          <Icon name="compare-horizontal" size={36} />
          <Text style={styles.emptyTitle}>{words.emptyTitle}</Text>
          <Muted style={styles.centre}>{words.emptyMessage}</Muted>
        </Panel>
      ) : list ? (
        <Lists model={model} events={events} tellings={tellings} onEvent={openEvent} />
      ) : (
        <SideBySide nodes={nodes} events={events} tellings={tellings} selected={selected} compact={compact} name={name} onSelect={select} onOpen={openEvent} />
      )}
      {!list && <Legend />}
    </View>
  );
}

function SideBySide({
  nodes,
  events,
  tellings,
  selected,
  compact,
  name,
  onSelect,
  onOpen,
}: {
  nodes: ReturnType<typeof orderShown>['nodes'];
  events: ReturnType<typeof orderShown>['events'];
  tellings: ReturnType<typeof orderShown>['tellings'];
  selected: string | null;
  compact: boolean;
  name: (id: string) => string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const rows = Math.max(1, Math.max(nodes.length, events.length));
  const gutter = orderGutter(compact);
  const related = relatedTo(tellings, selected);
  const lines = orderLines(nodes, events, tellings, selected);
  const item = (id: string, label: string, said: string, onLong?: () => void) => {
    const on = id === selected;
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={said}
        onPress={() => onSelect(id)}
        onLongPress={onLong}
        style={[styles.item, on ? styles.itemOn : related.has(id) ? styles.itemNear : null]}
      >
        <Text style={styles.itemText} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.gapXs}>
      <View style={styles.columns}>
        <Text style={[styles.columnHead, styles.flex]}>{words.reading}</Text>
        <View style={{ width: gutter }} />
        <Text style={[styles.columnHead, styles.flex]}>{words.story}</Text>
      </View>
      <View style={[styles.columns, { height: rows * orderRow }]}>
        <View style={styles.flex}>{nodes.map((n) => item(n.id, n.label, nodeSaid(n, name)))}</View>
        <Svg width={gutter} height={rows * orderRow}>
          {lines.map((l, i) => {
            const d = lineDrawing(l, gutter);
            return (
              <Path
                key={i}
                d={d.d}
                fill="none"
                stroke={d.muted ? colors.border : colors.gold}
                strokeWidth={d.width}
                strokeDasharray={d.dashes.length === 0 ? undefined : d.dashes.join(' ')}
              />
            );
          })}
        </Svg>
        <View style={styles.flex}>{events.map((e) => item(e.id, e.title === '' ? 'Untitled event' : e.title, eventSaid(e), () => onOpen(e.id)))}</View>
      </View>
      {selected !== null && events.some((e) => e.id === selected) && (
        <OutlineButton label={words.open(name(selected))} compact onPress={() => onOpen(selected)} style={styles.end} />
      )}
    </View>
  );
}

function Legend() {
  return (
    <View style={styles.gapXs}>
      {orderLegend.map((item) => {
        const d = lineDrawing({ a: 0, b: 0, role: item.role, out: false, on: null }, 36);
        return (
          <View key={item.role} style={styles.legendItem}>
            <Svg width={36} height={12}>
              <Path d="M0 6 L36 6" stroke={colors.gold} strokeWidth={d.width} strokeDasharray={d.dashes.length === 0 ? undefined : d.dashes.join(' ')} />
            </Svg>
            <Text style={styles.small}>{item.words}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Lists({
  model,
  events,
  tellings,
  onEvent,
}: {
  model: Parameters<typeof orderLists>[0];
  events: ReturnType<typeof orderShown>['events'];
  tellings: ReturnType<typeof orderShown>['tellings'];
  onEvent: (id: string) => void;
}) {
  const lists = orderLists(model, events, tellings);
  const row = (r: { eventId: string; title: string; subtitle: string }, i: number) => (
    <Pressable key={`${r.eventId}:${i}`} accessibilityRole="button" onPress={() => onEvent(r.eventId)} style={({ pressed }) => [styles.listRow, pressed && styles.itemNear]}>
      <Text style={styles.rowTitle}>{r.title}</Text>
      <Muted>{r.subtitle}</Muted>
    </Pressable>
  );
  return (
    <View style={styles.gap}>
      <Panel style={styles.gapXs}>
        <Text style={styles.heading}>{words.reading}</Text>
        {lists.reading.length === 0 ? <Muted>{words.noTellings}</Muted> : lists.reading.map(row)}
      </Panel>
      <Panel style={styles.gapXs}>
        <Text style={styles.heading}>{words.story}</Text>
        {lists.story.map(row)}
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapXs: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  start: { alignSelf: 'flex-start' },
  end: { alignSelf: 'flex-end' },
  centre: { textAlign: 'center' },
  summary: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  heading: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  small: { flexShrink: 1, fontFamily: fonts.ui, fontSize: 12.5, color: colors.muted },
  empty: { alignItems: 'center', gap: space.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  columns: { flexDirection: 'row' },
  columnHead: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.gold },
  item: { height: orderRow, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: 8 },
  itemOn: { backgroundColor: 'rgba(243, 182, 58, 0.22)' },
  itemNear: { backgroundColor: colors.elevated },
  itemText: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.text },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listRow: { paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: 8, gap: 2 },
  rowTitle: { fontFamily: fonts.ui, fontSize: 14.5, fontWeight: '700', color: colors.text },
});
