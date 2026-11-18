// CANON AND CONTINUITY MARKS on the views (FEATURES.md #279): turned on in a view's frame ("Canon & continuity marks",
// off by default and for each novel opened, as in the Flutter app), each record a view draws carries its canon status
// when it is not plain canon and how many findings about it are still open, as a badge of glyphs (never colour alone)
// and in words. The frame lists what is marked in this view and, for the selected record, each finding with its rule
// and where it is checked. A port of flutter_app/lib/features/visualize/widgets/canon_badge.dart and viz_frame.dart's
// _MarksBar and _SelectionMarks; the marks are src/domain/canon/overlay.ts's.

import { useRouter } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Text as SvgText, G, Rect } from 'react-native-svg';

import { canonKey, canonOverlay, badgeOf, markWords, type OverlayMark, type OverlaySource, overlaySourceLabel } from '../../domain/canon/overlay';
import { FactReview } from '../../domain/canon/review';
import { severityLabel, type Severity } from '../../domain/continuity/rules';
import { refOf } from '../../domain/graph/knowledge';
import { str } from '../../domain/json';
import { type EntityRef } from '../../domain/model/entityRef';
import { ReviewData } from '../../domain/review/reviewData';
import { Chip, Muted } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { type OpenCast, useCast } from '../organize/useCast';
import { colors, fonts, space } from '../theme';

// ------------------------------------------------------------------------------------------------- on or off

/** Whether the marks are on, for the novel they were turned on in (off again when another novel is opened). */
const store: { novelId: string | null; listeners: Set<() => void> } = { novelId: null, listeners: new Set() };
const subscribe = (l: () => void) => {
  store.listeners.add(l);
  return () => store.listeners.delete(l);
};

export function setCanonMarks(novelId: string, on: boolean): void {
  store.novelId = on ? novelId : null;
  for (const l of store.listeners) l();
}

export function useCanonMarksOn(novelId: string | null): boolean {
  const on = useSyncExternalStore(subscribe, () => store.novelId);
  return novelId !== null && on === novelId;
}

// ---------------------------------------------------------------------------------------------------- the marks

/** The review last made: kept while the app runs, so a view opened again with nothing written since is not checked
 * again (the manuscript check reads every chapter). */
const kept: { last: { key: string; marks: Map<string, OverlayMark> } | null } = { last: null };

function marksOf(open: OpenCast, lib: ReturnType<typeof useLibrary>, revision: number): Map<string, OverlayMark> {
  const key = `${open.novelId}#${revision}`;
  const was = kept.last;
  if (was !== null && was.key === key) return was.marks;
  const docs = new Map(lib.novels.rowsIn(open.novelId, 'chapterContents').map((r) => [str(r['id']), r['doc']]));
  const data = new ReviewData(open.novelId, open.cast.snapshot, open.cast.model, docs);
  const marks = canonOverlay(data.model, {
    records: data.records.filter((f) => data.isOpen(f.key)),
    timeline: data.timeline.filter((f) => data.isOpen(f.key)),
    canon: data.canon.reviews.map((r) => new FactReview(r.fact, r.flags.filter((f) => data.isOpen(canonKey(r.fact.id, f.key))))),
    continuity: data.manuscript.open,
  });
  kept.last = { key, marks };
  return marks;
}

/** The marks of the open novel, keyed as the overlay keys them (`event:<id>`, `entry:<id>`…); null while they are off. */
export function useCanonMarks(): Map<string, OverlayMark> | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const open = useCast();
  const on = useCanonMarksOn(open?.novelId ?? null);
  return useMemo(() => (open === null || !on ? null : marksOf(open, lib, revision)), [open, on, lib, revision]);
}

// ------------------------------------------------------------------------------------------------------ the badge

/** A badge's colours: filled by tone (the worst finding), or quiet for a status alone. */
function toneColours(tone: Severity | null): { bg: string; fg: string } {
  switch (tone) {
    case 'critical':
      return { bg: colors.danger, fg: colors.background };
    case 'warning':
      return { bg: 'rgba(248, 113, 113, 0.22)', fg: colors.danger };
    case 'info':
      return { bg: colors.elevated, fg: colors.text };
    default:
      return { bg: 'rgba(243, 182, 58, 0.18)', fg: colors.gold };
  }
}

/** A record's badge drawn in an SVG drawing, its top-left at (`x`, `y`) (or its top-right, with `anchorRight`). */
export function SvgCanonBadge({ mark, x, y, size = 11, anchorRight = false }: { mark: OverlayMark | null | undefined; x: number; y: number; size?: number; anchorRight?: boolean }) {
  const badge = badgeOf(mark);
  if (badge === null) return null;
  const { bg, fg } = toneColours(badge.tone);
  const w = badge.glyph.length * size * 0.7 + 8;
  const h = size + 4;
  const left = anchorRight ? x - w : x;
  return (
    <G accessibilityLabel={markWords(mark)}>
      <Rect x={left} y={y} width={w} height={h} rx={5} fill={bg} stroke={fg} strokeOpacity={0.6} strokeWidth={1} />
      <SvgText x={left + w / 2} y={y + h - 3.5} fontSize={size} fontWeight="700" fill={fg} textAnchor="middle">
        {badge.glyph}
      </SvgText>
    </G>
  );
}

/** The same badge as a tag, for lists and cards. */
export function CanonBadgeChip({ mark }: { mark: OverlayMark | null | undefined }) {
  const badge = badgeOf(mark);
  if (badge === null) return null;
  const { bg, fg } = toneColours(badge.tone);
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: fg }]} accessibilityLabel={markWords(mark)}>
      <Text style={[styles.chipText, { color: fg }]}>{badge.glyph}</Text>
    </View>
  );
}

// --------------------------------------------------------------------------------------------- the frame's parts

/** The views that mark records, and the kinds of record each marks (none: every kind). */
export const markedViews: Readonly<Record<string, readonly string[]>> = {
  timeline: ['event'],
  relationships: ['entry', 'relation', 'link'],
  plot: ['thread', 'node'],
  graph: [],
};

/** Turning the marks on, and what is marked in this view, in words: every marked record, its status and how many
 * findings are still open about it, each selectable. */
export function MarksBar({ view, onSelect }: { view: string; onSelect: (ref: EntityRef) => void }) {
  const open = useCast();
  const marks = useCanonMarks();
  const on = useCanonMarksOn(open?.novelId ?? null);
  const kinds = markedViews[view];
  if (open === null || kinds === undefined) return null;
  const model = open.cast.model;
  const shown = marks === null ? [] : [...marks.entries()].filter(([key, m]) => (kinds.length === 0 || kinds.includes(key.split(':')[0])) && badgeOf(m) !== null);
  const name = (key: string) => {
    const ref = refOf(key);
    if (ref !== null) {
      const label = model.resolve(ref)?.label;
      if (label) return label;
    }
    if (key.startsWith('link:')) {
      const link = model.links.find((l) => `link:${l.id}` === key);
      if (link) return `${model.resolve(link.from)?.label ?? '?'} – ${model.resolve(link.to)?.label ?? '?'}`;
    }
    return 'A record';
  };
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Chip label="Canon & continuity marks" icon="flag-outline" selected={on} onPress={() => setCanonMarks(open.novelId, !on)} />
        {on && (
          <Muted>
            {shown.length === 0
              ? 'Nothing marked here: no canon status set, and no open finding.'
              : `${shown.length} ${shown.length === 1 ? 'record' : 'records'} marked here.`}
          </Muted>
        )}
      </View>
      {on && shown.length > 0 && (
        <View style={styles.list}>
          <Text style={styles.heading}>Marked records, in words</Text>
          <Muted>
            A mark is a record’s canon status when it is not plain canon (? provisional, ≠ conflicting, ↺ retconned, ✕
            non-canon, A an alternate branch), and ! with how many findings about it are still open. Decided findings are
            left out.
          </Muted>
          {shown.map(([key, m]) => {
            const ref = refOf(key);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                disabled={ref === null}
                onPress={() => ref !== null && onSelect(ref)}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.elevated }]}
              >
                <CanonBadgeChip mark={m} />
                <View style={styles.flex}>
                  <Text style={styles.name}>{name(key)}</Text>
                  <Muted>{markWords(m)}</Muted>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const pages: Readonly<Record<OverlaySource, string>> = {
  records: '/review/records',
  timeline: '/review/timeline',
  canon: '/review/canon',
  continuity: '/review/continuity',
};

/** The selected record's canon status and open findings, when the marks are on: each with its rule and where it is
 * checked. */
export function SelectionMarks({ selected }: { selected: EntityRef }) {
  const router = useRouter();
  const marks = useCanonMarks();
  const mark = marks?.get(`${selected.type}:${selected.id}`) ?? null;
  if (mark === null || (mark.status === null && mark.warnings.length === 0)) return null;
  return (
    <View style={styles.selection}>
      <Text style={styles.heading} accessibilityRole="header">
        Canon and continuity
      </Text>
      {mark.status !== null && (
        <Text style={styles.body}>
          Canon status: {mark.status.label}. {mark.status.hint}
        </Text>
      )}
      {mark.warnings.map((w) => (
        <View key={w.key} style={styles.warning}>
          <Text style={styles.body}>
            {severityLabel[w.severity]} · {w.title}. {w.message}
          </Text>
          <Muted>The rule: {w.rule}</Muted>
          <Muted>Because: {w.because}</Muted>
          <Pressable accessibilityRole="link" onPress={() => router.navigate(pages[w.source] as never)} hitSlop={6}>
            <Text style={styles.link}>Where it is checked: {overlaySourceLabel[w.source]}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  list: { gap: space.xs },
  heading: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, borderRadius: 6 },
  name: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  chip: { minWidth: 22, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, borderWidth: 1, alignItems: 'center' },
  chipText: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700' },
  selection: { gap: space.sm, marginTop: space.sm },
  warning: { gap: 2 },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21, color: colors.text },
  link: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline' },
});
