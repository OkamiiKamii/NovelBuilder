// Visualize › Records by kind (FEATURES.md #287): one kind of record (the author's own kinds and the built-in ones) as a
// table (shared as CSV), or drawn the ways its category is set up for under Categories & fields: on the story's
// timeline, on a map, on a ladder of ranks, or by who holds each one (and, for a selected record, recording who holds it
// next). A way it is not set up for says what is missing and shows the table. A port of
// flutter_app/lib/features/kinds/kinds_view_page.dart; the logic is src/domain/visualize/kinds.ts and
// src/domain/visualize/screens/kindsView.ts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';

import { shareTextFile } from '../../data/files';
import { type KindView, kindViewOf, kindViews, missingFor, readyViews } from '../../domain/codex/capabilities';
import { type JsonMap, mapOrNull, strOrNull } from '../../domain/json';
import { EntityRef } from '../../domain/model/entityRef';
import { stableSorted } from '../../domain/reader/stableSort';
import { localeCompare } from '../../domain/exchange/collation';
import { type Category } from '../../domain/records/category';
import { type Entry } from '../../domain/records/entry';
import { kindHolders, kindKeyOf, kindMap, kindRanks, kindTable, kindTimeline, kindsOf, niceTicks, tableCsv, type Unplaced } from '../../domain/visualize/kinds';
import { csvName, drawnLabel, holderWords, kindLine, kindsWords, recordHolder, showChip } from '../../domain/visualize/screens/kindsView';
import { timelineRows } from '../../domain/visualize/summaries';
import { Chip, GoldButton, Icon, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { rememberOrganizeTab } from '../organize/OrganizeScreen';
import { type OpenCast, useCast } from '../organize/useCast';
import { ChooserField } from '../organize/parts';
import { VizFrame, useVizMatching, useVizSelection, useVizSetFilter } from './VizFrame';

export function KindsView() {
  const open = useCast();
  const [list, setList] = useState(false);
  const [kind, setKind] = useState<string | null>(null);
  const [show, setShow] = useState<KindView | null>(null);
  return (
    <VizFrame
      view="kinds"
      title={kindsWords.title}
      subtitle={open?.cast.novelTitle}
      config={() => ({ mode: list ? 'list' : 'visual', layout: { ...(kind !== null ? { kind } : {}), ...(show !== null ? { kshow: show } : {}) } })}
      onApply={(c: JsonMap) => {
        const layout = mapOrNull(c['layout']) ?? {};
        setList(c['mode'] === 'list');
        setKind(strOrNull(layout['kind']));
        setShow(kindViewOf(layout['kshow']));
      }}
    >
      {open !== null && <Kinds open={open} list={list} setList={setList} kind={kind} setKind={setKind} show={show} setShow={setShow} />}
    </VizFrame>
  );
}

function Kinds({
  open,
  list,
  setList,
  kind,
  setKind,
  show,
  setShow,
}: {
  open: OpenCast;
  list: boolean;
  setList: (v: boolean) => void;
  kind: string | null;
  setKind: (k: string) => void;
  show: KindView | null;
  setShow: (v: KindView | null) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { selected, select } = useVizSelection();
  const setFilter = useVizSetFilter();
  const keepKeys = useVizMatching(open, ['entry']);
  const model = open.cast.model;
  const kinds = kindsOf(model);
  const key = kindKeyOf(model, kind);
  const category = key === null ? null : (model.categories.get(key) ?? null);
  const openSettings = () => router.navigate((category === null ? '/organize/kinds' : `/organize/kinds?kind=${encodeURIComponent(category.key)}`) as never);
  if (category === null) {
    return (
      <Panel style={styles.empty}>
        <Icon name="shape-outline" size={36} color={colors.muted} />
        <Text style={styles.emptyTitle}>{kindsWords.noKinds.title}</Text>
        <Muted style={styles.center}>{kindsWords.noKinds.message}</Muted>
        <GoldButton label={kindsWords.noKinds.action} onPress={openSettings} />
      </Panel>
    );
  }
  const ready = readyViews(category);
  const count = kinds.find((k) => k.category.key === category.key)?.count ?? 0;
  const table = kindTable(model, category.key);
  const missing = show === null ? [] : missingFor(category, show);
  const keep = (id: string) => keepKeys === null || keepKeys.has(`entry:${id}`);
  const selectedId = selected?.type === 'entry' ? selected.id : null;
  const pick = (e: Entry) => select(new EntityRef('entry', e.id));
  const download = async () => {
    try {
      await shareTextFile(csvName(table.category), tableCsv(table), 'text/csv');
    } catch (e) {
      toast(`The table was not saved: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
  };
  const selectedEntry = selectedId === null ? null : (model.entries.get(selectedId) ?? null);

  let body: React.ReactNode;
  if (count === 0) {
    const words = kindsWords.noRecords(category.name);
    body = (
      <Panel style={styles.empty}>
        <Icon name="inbox-outline" size={36} color={colors.muted} />
        <Text style={styles.emptyTitle}>{words.title}</Text>
        <Muted style={styles.center}>{words.message}</Muted>
        <OutlineButton
          label={words.action}
          compact
          onPress={() => {
            rememberOrganizeTab('world');
            router.navigate('/organize');
          }}
        />
      </Panel>
    );
  } else if (!table.rows.some((r) => keep(r.entry.id))) {
    body = (
      <Panel style={styles.empty}>
        <Text style={styles.emptyTitle}>No matches</Text>
        <Muted style={styles.center}>Nothing of this kind matches the filters.</Muted>
        <OutlineButton label="Clear the filters" compact onPress={() => setFilter({})} />
      </Panel>
    );
  } else {
    const part = { open, category, list, pick, selectedId, keep };
    body = (
      <View style={styles.gap}>
        {missing.length > 0 && show !== null && (
          <Panel style={styles.gapXs}>
            <Text style={styles.text}>{kindsWords.cantShow(category.name, show)}</Text>
            {missing.map((m) => (
              <Text key={m} style={styles.text}>{`• ${m}`}</Text>
            ))}
            <Muted>{kindsWords.setUp(category.name)}</Muted>
            <OutlineButton label={kindsWords.openSettings} compact onPress={openSettings} style={styles.start} />
          </Panel>
        )}
        {show === null || missing.length > 0 ? (
          <TablePart {...part} />
        ) : show === 'timeline' ? (
          <TimelinePart {...part} />
        ) : show === 'map' ? (
          <MapPart {...part} />
        ) : show === 'rank' ? (
          <RanksPart {...part} />
        ) : (
          <HoldersPart {...part} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.gap}>
      <ChooserField
        label={kindsWords.kind}
        value={category.key}
        choices={kinds.map((k) => ({ value: k.category.key, label: `${k.category.name} (${k.count})` }))}
        onChoose={(v) => setKind(v)}
      />
      {count > 0 && <OutlineButton label={kindsWords.download} icon="download-outline" compact onPress={() => void download()} style={styles.start} />}
      <View style={styles.row} accessibilityLabel={kindsWords.ways}>
        {[null, ...kindViews].map((v) => (
          <Chip key={v ?? 'table'} label={showChip(v, ready)} selected={v === show} onPress={() => setShow(v)} />
        ))}
      </View>
      {show !== null && missing.length === 0 && (
        <View style={styles.row}>
          <Chip label={drawnLabel[show]} selected={!list} onPress={() => setList(false)} />
          <Chip label={kindsWords.list} selected={list} onPress={() => setList(true)} />
        </View>
      )}
      <Muted>{kindLine(category, count)}</Muted>
      <OutlineButton label={kindsWords.change} compact tone="muted" onPress={openSettings} style={styles.start} />
      {body}
      {show === 'ownership' && missing.length === 0 && selectedEntry !== null && selectedEntry.category === category.key && (
        <HolderEditor key={`holder:${selectedEntry.id}`} open={open} entry={selectedEntry} />
      )}
    </View>
  );
}

type PartProps = { open: OpenCast; category: Category; list: boolean; pick: (e: Entry) => void; selectedId: string | null; keep: (id: string) => boolean };

function Name({ entry, selected, onPress }: { entry: Entry; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}>
      <Text style={[styles.name, selected && { color: colors.gold }]}>{entry.name.length === 0 ? kindsWords.untitled : entry.name}</Text>
    </Pressable>
  );
}

function NotDrawn({ items, what }: { items: readonly Unplaced[]; what: string }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.notDrawn} accessibilityLabel={`Not ${what}`}>
      <Text style={styles.subTitle}>{kindsWords.notDrawn(what, items.length)}</Text>
      {items.map((u) => (
        <Text key={u.entry.id} style={styles.small}>
          <Text style={styles.bold}>{u.entry.name}</Text>
          {`: ${u.reason}`}
        </Text>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- the table

function TablePart({ open, category, pick, selectedId, keep }: PartProps) {
  const table = kindTable(open.cast.model, category.key);
  const rows = table.rows.filter((r) => keep(r.entry.id));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={kindsWords.tableLabel(category.name, rows.length)}>
      <View style={styles.table}>
        <View style={[styles.tr, styles.th]}>
          <Text style={[styles.td, styles.nameCell, styles.thText]}>Name</Text>
          {table.columns.map((c) => (
            <Text key={c.id} style={[styles.td, styles.thText]}>
              {c.name}
            </Text>
          ))}
        </View>
        {rows.map((r) => {
          const on = r.entry.id === selectedId;
          return (
            <Pressable key={r.entry.id} accessibilityRole="button" onPress={() => pick(r.entry)} style={[styles.tr, on && styles.trOn]}>
              <Text style={[styles.td, styles.nameCell, styles.bold, on && { color: colors.gold }]} numberOfLines={2}>
                {r.entry.name.length === 0 ? kindsWords.untitled : r.entry.name}
              </Text>
              {r.cells.map((cell, i) => (
                <Text key={i} style={styles.td} numberOfLines={3}>
                  {cell}
                </Text>
              ))}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------- the timeline

function TimelinePart({ open, category, list, pick, selectedId, keep }: PartProps) {
  const { width } = useWindowDimensions();
  const t = kindTimeline(open.cast.model, category.key);
  const placed = t.placed.filter((p) => keep(p.entry.id));
  const unplaced = t.unplaced.filter((u) => keep(u.entry.id));
  if (list || placed.length === 0) {
    return (
      <View style={styles.gapSm}>
        {placed.length === 0 && <Text style={styles.text}>{kindsWords.noDates}</Text>}
        {placed.map((p) => (
          <View key={p.entry.id}>
            <Name entry={p.entry} selected={p.entry.id === selectedId} onPress={() => pick(p.entry)} />
            <Muted>{p.label}</Muted>
            {p.note !== null && <Muted>{p.note}</Muted>}
          </View>
        ))}
        <NotDrawn items={unplaced} what="on the timeline" />
      </View>
    );
  }
  const lo = Math.min(...placed.map((p) => p.lo));
  const hi = Math.max(...placed.map((p) => p.hi));
  const span = hi > lo ? hi - lo : 1;
  const w = width - space.md * 4;
  const x = (v: number) => 8 + ((v - lo) / span) * (w - 16);
  return (
    <View style={styles.gapSm} accessibilityLabel={kindsWords.timelineLabel(category.name)}>
      {placed.map((p) => {
        const on = p.entry.id === selectedId;
        const x1 = x(p.lo);
        const x2 = Math.max(x(p.hi), x1 + 6);
        return (
          <Pressable key={p.entry.id} accessibilityRole="button" accessibilityLabel={`${p.entry.name}: ${p.label}`} onPress={() => pick(p.entry)} style={styles.track}>
            <Text style={[styles.name, on && { color: colors.gold }]} numberOfLines={1}>
              {p.entry.name.length === 0 ? kindsWords.untitled : p.entry.name}
            </Text>
            <Svg width={w} height={18}>
              <Line x1={8} y1={9} x2={w - 8} y2={9} stroke={colors.border} strokeWidth={1} />
              {p.end === null ? (
                <Circle cx={x1} cy={9} r={on ? 6 : 5} fill={on ? colors.gold : 'rgba(243, 182, 58, 0.7)'} />
              ) : (
                <Rect x={x1} y={3} width={x2 - x1} height={12} rx={6} fill={on ? colors.gold : 'rgba(243, 182, 58, 0.55)'} />
              )}
            </Svg>
            <Muted>{p.note === null ? p.label : `${p.label} · ${p.note}`}</Muted>
          </Pressable>
        );
      })}
      <NotDrawn items={unplaced} what="on the timeline" />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- the map

function MapPart({ open, category, list, pick, selectedId, keep }: PartProps) {
  const { width } = useWindowDimensions();
  const m = kindMap(open.cast.model, category.key);
  const points = m.points.filter((p) => keep(p.entry.id));
  const unplaced = m.unplaced.filter((u) => keep(u.entry.id));
  if (list || points.length === 0) {
    return (
      <View style={styles.gapSm}>
        {points.length === 0 && <Text style={styles.text}>{kindsWords.noPoints}</Text>}
        {points.length > 0 && (
          <View style={styles.table}>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.td, styles.nameCell, styles.thText]}>Name</Text>
              <Text style={[styles.td, styles.thText, styles.num]}>{kindsWords.across(m.axes.x)}</Text>
              <Text style={[styles.td, styles.thText, styles.num]}>{kindsWords.up(m.axes.y)}</Text>
            </View>
            {points.map((p) => (
              <Pressable key={p.entry.id} accessibilityRole="button" onPress={() => pick(p.entry)} style={[styles.tr, p.entry.id === selectedId && styles.trOn]}>
                <Text style={[styles.td, styles.nameCell, styles.bold]}>{p.entry.name}</Text>
                <Text style={[styles.td, styles.num]}>{`${p.x}`}</Text>
                <Text style={[styles.td, styles.num]}>{`${p.y}`}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <NotDrawn items={unplaced} what="on the map" />
      </View>
    );
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = (lo: number, hi: number): [number, number] => (hi > lo ? [lo, hi] : [lo - 1, hi + 1]);
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const w = Math.min(width - space.md * 4, 640);
  const h = Math.round(w * 0.75);
  const left = 40;
  const bottom = 24;
  const px = (v: number) => left + ((v - x0) / (x1 - x0)) * (w - left - 16);
  const py = (v: number) => 12 + (1 - (v - y0) / (y1 - y0)) * (h - bottom - 24);
  return (
    <View style={styles.gapSm}>
      <View style={{ width: w, height: h }}>
        <Svg width={w} height={h}>
          {niceTicks(x0, x1).map((t) => (
            <Line key={`x${t}`} x1={px(t)} y1={12} x2={px(t)} y2={h - bottom} stroke={colors.border} strokeWidth={1} />
          ))}
          {niceTicks(y0, y1).map((t) => (
            <Line key={`y${t}`} x1={left} y1={py(t)} x2={w - 16} y2={py(t)} stroke={colors.border} strokeWidth={1} />
          ))}
          {niceTicks(x0, x1).map((t) => (
            <SvgText key={`xl${t}`} x={px(t)} y={h - 8} fontSize={10} fill={colors.muted} textAnchor="middle">{`${t}`}</SvgText>
          ))}
          {niceTicks(y0, y1).map((t) => (
            <SvgText key={`yl${t}`} x={left - 6} y={py(t) + 3} fontSize={10} fill={colors.muted} textAnchor="end">{`${t}`}</SvgText>
          ))}
          {points.map((p) => {
            const on = p.entry.id === selectedId;
            return (
              <Circle key={p.entry.id} cx={px(p.x)} cy={py(p.y)} r={on ? 7 : 5} fill={on ? colors.gold : 'rgba(243, 182, 58, 0.8)'} stroke={on ? colors.text : 'none'} strokeWidth={1.5} />
            );
          })}
          {points.map((p) => (
            <SvgText key={`n${p.entry.id}`} x={px(p.x) + 8} y={py(p.y) + 4} fontSize={11} fill={colors.text}>
              {p.entry.name}
            </SvgText>
          ))}
        </Svg>
        {points.map((p) => (
          <Pressable
            key={`hit${p.entry.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${p.entry.name}: ${m.axes.x} ${p.x}, ${m.axes.y} ${p.y}`}
            onPress={() => pick(p.entry)}
            style={{ position: 'absolute', left: px(p.x) - 22, top: py(p.y) - 22, width: 44, height: 44 }}
          />
        ))}
      </View>
      <Muted>{`Across: ${m.axes.x} · Up: ${m.axes.y}`}</Muted>
      <NotDrawn items={unplaced} what="on the map" />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- the ladder

function RanksPart({ open, category, pick, selectedId, keep }: PartProps) {
  const r = kindRanks(open.cast.model, category.key);
  const unplaced = r.unplaced.filter((u) => keep(u.entry.id));
  return (
    <View style={styles.gapSm} accessibilityLabel={kindsWords.ranksLabel(category.name, r.field)}>
      {r.levels.map((l) => {
        const entries = l.entries.filter((e) => keep(e.id));
        return (
          <View key={l.label} style={styles.rung}>
            <View style={styles.rungHead}>
              <Text style={styles.rungLabel}>{l.label}</Text>
              <Muted>{`${entries.length}`}</Muted>
            </View>
            <View style={styles.row}>
              {entries.length === 0 ? (
                <Muted>{kindsWords.none}</Muted>
              ) : (
                entries.map((e) => <Chip key={e.id} label={e.name.length === 0 ? kindsWords.untitled : e.name} selected={e.id === selectedId} onPress={() => pick(e)} />)
              )}
            </View>
          </View>
        );
      })}
      <NotDrawn items={unplaced} what="ranked" />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- who holds it

function HoldersPart({ open, category, pick, selectedId, keep }: PartProps) {
  const { select } = useVizSelection();
  const held = kindHolders(open.cast.model, category.key);
  return (
    <View style={styles.gapSm} accessibilityLabel={kindsWords.holdersLabel(category.name, held.typeLabel)}>
      {held.records
        .filter((r) => keep(r.entry.id))
        .map((r) => (
          <Panel key={r.entry.id} style={[styles.gapXs, r.entry.id === selectedId && styles.panelOn]}>
            <Name entry={r.entry} selected={r.entry.id === selectedId} onPress={() => pick(r.entry)} />
            {r.history.length === 0 && <Muted>{kindsWords.noHolding}</Muted>}
            <View style={styles.row}>
              {r.history.map((h) => (
                <Chip key={h.connection.id} label={`${h.holderName} · ${h.when}`} selected={false} onPress={() => select(h.holder)} />
              ))}
              {r.current !== null && held.field !== null && (
                <Chip label={`${held.field}: ${r.current.name}`} icon="account-outline" selected={false} onPress={() => select(new EntityRef('entry', r.current!.id))} />
              )}
            </View>
            {r.note !== null && <Text style={[styles.small, { color: colors.danger }]}>{r.note}</Text>}
          </Panel>
        ))}
      <Muted>{kindsWords.selectToRecord}</Muted>
    </View>
  );
}

/** Recording who holds the selected record from a point of the story: a holder (or nobody) and when. */
function HolderEditor({ open, entry }: { open: OpenCast; entry: Entry }) {
  const toast = useToast();
  const [holder, setHolder] = useState('');
  const [when, setWhen] = useState('');
  const model = open.cast.model;
  const category = model.categories.get(entry.category);
  if (category === undefined || missingFor(category, 'ownership').length > 0) return null;
  const openHoldings = kindHolders(model, category.key)
    .records.filter((r) => r.entry.id === entry.id)
    .flatMap((r) => r.history)
    .filter((h) => h.connection.validity?.until == null);
  const chapters = stableSorted(
    [...model.nodes.values()].filter((n) => model.order.position.has(n.id)),
    (a, b) => model.order.position.get(a.id)! - model.order.position.get(b.id)!,
  );
  const events = timelineRows(model);
  const others = stableSorted(
    [...model.entries.values()].filter((e) => e.id !== entry.id),
    (a, b) => localeCompare(a.name, b.name),
  );
  const record = () => {
    const said = open.now((c) => recordHolder(c, model, entry.id, holder, when, openHoldings));
    if (said !== undefined) {
      toast(said);
      setHolder('');
      setWhen('');
    }
  };
  return (
    <Panel style={styles.gapSm}>
      <Text style={styles.subTitle}>{holderWords.title(entry.name)}</Text>
      <ChooserField
        label={holderWords.holder}
        value={holder}
        choices={[
          { value: '', label: holderWords.choose },
          ...(openHoldings.length > 0 ? [{ value: 'nobody', label: holderWords.nobody }] : []),
          ...others.map((e) => ({ value: e.id, label: e.name.length === 0 ? kindsWords.untitled : e.name })),
        ]}
        onChoose={setHolder}
      />
      <ChooserField
        label={holderWords.from}
        value={when}
        choices={[
          { value: '', label: holderWords.start },
          ...chapters.map((n) => ({ value: `n:${n.id}`, label: n.title.length === 0 ? 'Untitled' : n.title })),
          ...events.map((e) => ({ value: `e:${e.id}`, label: holderWords.event(e.title) })),
        ]}
        onChoose={setWhen}
      />
      <GoldButton label={holderWords.record} compact disabled={holder.length === 0} onPress={record} style={styles.start} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  start: { alignSelf: 'flex-start' },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  text: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 19, color: colors.muted },
  subTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  name: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.text },
  empty: { alignItems: 'center', gap: space.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textAlign: 'center' },
  notDrawn: { gap: 2, marginTop: space.md },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  trOn: { backgroundColor: 'rgba(243, 182, 58, 0.12)' },
  th: { backgroundColor: colors.elevated },
  td: { width: 150, padding: 8, fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  nameCell: { width: 170 },
  thText: { fontWeight: '700', color: colors.gold },
  num: { width: 110, textAlign: 'right' },
  track: { gap: 2, paddingVertical: 4 },
  rung: { gap: 6, padding: space.sm, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  rungHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rungLabel: { fontFamily: fonts.display, fontSize: 15, color: colors.gold },
  panelOn: { borderColor: colors.gold },
});
