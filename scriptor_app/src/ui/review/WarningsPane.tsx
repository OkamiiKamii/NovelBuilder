// ALL WARNINGS (FEATURES.md #306–#309): every warning the checks raise, in one place, worked through one at a time or
// as the whole list, filtered and grouped, each decided with a note; "In good order" when nothing is raised. Only the
// decision is stored: no record, no canon, no word of the manuscript changes. A port of
// flutter_app/lib/features/review/review_page.dart, widgets/review_parts.dart and widgets/all_clear.dart; the logic is
// src/domain/review/screens/warnings.ts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { type Severity, severityHint, severityLabel } from '../../domain/continuity/rules';
import { openRecord } from '../../domain/codex/screens/connections';
import type { EntityRef } from '../../domain/model/entityRef';
import { threadPath } from '../../domain/plot/plotService';
import { type ReviewDecision, reviewDecisionLabel, reviewDecisions } from '../../domain/records/review';
import { type ReviewedWarning, type Warning, reviewSourceWords } from '../../domain/review/collect';
import { intentionalReasons } from '../../domain/continuity/rules';
import {
  type Show,
  type WarningFilters,
  afterDecision,
  allClear,
  categoryChoices,
  certaintyChoices,
  clampAt,
  decisionHints,
  decisionNode,
  filterWords as fw,
  focusDecisions,
  goneLine,
  noWarningFilters,
  openHint,
  scriptorPlace,
  severityChoices,
  showLabel,
  shows,
  sourceChoices,
  warningTags,
  warningsView,
  whatWasChecked,
  whereChecked,
  worldWords,
} from '../../domain/review/screens/warnings';
import { Chip, GoldButton, Icon, IconButton, type IconName, Muted, OutlineButton, Panel, ProgressBar } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { ChooserField } from '../organize/parts';
import { lastNodeSetting } from '../write/WriteScreen';
import { type OpenReview, useReview } from './useReview';
import { requestFind } from '../write/pendingFind';
import { allIssues } from '../../domain/continuity/audit';
import { Skeleton } from '../states';

// ------------------------------------------------------------------------------------------------ shared pieces

/** A severity, in words and colour together (never colour alone). */
export function SeverityChip({ severity }: { severity: Severity }) {
  const [bg, fg] =
    severity === 'critical' ? [colors.danger, colors.background] : severity === 'warning' ? ['rgba(248, 113, 113, 0.18)', colors.danger] : [colors.elevated, colors.text];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]} accessibilityLabel={`${severityLabel[severity]}. ${severityHint[severity]}`}>
      <Text style={[styles.chipText, { color: fg }]}>{severityLabel[severity]}</Text>
    </View>
  );
}

/** A small outlined tag: a certainty, a source, a decision. */
export function Tag({ label, hint }: { label: string; hint?: string | null }) {
  return (
    <View style={styles.tag} accessibilityLabel={hint ? `${label}. ${hint}` : label}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

/** Opens a record, a page or a passage a warning points at. */
export function useOpenFromReview(r: OpenReview) {
  const router = useRouter();
  const lib = useLibrary();
  const openChapter = (nodeId: string, find?: { term: string; block: number } | null) => {
    // At the words when the warning names them (a passage the continuity check read): pendingFind.ts.
    requestFind(find && find.term.length > 0 ? { nodeId, term: find.term, block: find.block } : null);
    lib.saves.saveNow(`setting:${lastNodeSetting(r.novelId)}`, () => lib.settings.write(lastNodeSetting(r.novelId), nodeId));
    router.navigate('/write');
  };
  const openPath = (path: string, find?: { term: string; block: number } | null) => {
    const place = scriptorPlace(path);
    if (place.kind === 'chapter') openChapter(place.nodeId, find);
    else if (place.kind === 'route') router.navigate(place.path as never);
  };
  const openRef = (ref: EntityRef) => {
    if (ref.type === 'thread') return router.navigate(threadPath(ref.id) as never);
    if (ref.type === 'ability') return router.navigate('/visualize/abilities' as never);
    const to = openRecord(r.open.cast, ref);
    if (to === null) return;
    if (to.kind === 'chapter') openChapter(to.nodeId);
    else router.navigate(to.path as never);
  };
  return { openPath, openRef, openChapter };
}

function Links({ r, w }: { r: OpenReview; w: Warning }) {
  const go = useOpenFromReview(r);
  const model = r.open.cast.model;
  return (
    <View style={styles.links}>
      {w.refs.map((ref) => (
        <LinkButton key={`${ref.type}:${ref.id}`} label={model.resolve(ref)?.label ?? 'something deleted'} onPress={() => go.openRef(ref)} />
      ))}
      {w.links.map((l) => (
        <LinkButton key={l.label + l.path} label={worldWords(l.label)} onPress={() => go.openPath(l.path, passageOf(r, w))} />
      ))}
      {w.context !== null && <LinkButton label={w.context.label} onPress={() => go.openPath(w.context!.path)} />}
    </View>
  );
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

function RuleBecause({ w }: { w: Warning }) {
  return (
    <View style={styles.ruleBox}>
      <Text style={styles.small}>
        <Text style={styles.bold}>{fw.rule}</Text>
        {worldWords(w.rule)}
      </Text>
      <Text style={styles.small}>
        <Text style={styles.bold}>{fw.because}</Text>
        {worldWords(w.because)}
      </Text>
    </View>
  );
}

/** Choosing a status for a finding: open (no decision), or one of the author's decisions, with a note. */
export function DecisionEditor({
  current,
  note,
  onSave,
  onCancel,
}: {
  current: ReviewDecision | null;
  note: string;
  onSave: (decision: ReviewDecision | null, note: string) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ReviewDecision | null>(current);
  const [text, setText] = useState(note);
  return (
    <View style={styles.gapSm}>
      <View style={styles.wrap}>
        <Chip label={fw.open} selected={kind === null} onPress={() => setKind(null)} />
        {reviewDecisions.map((d) => (
          <Chip key={d} label={reviewDecisionLabel[d]} selected={kind === d} onPress={() => setKind(d)} />
        ))}
      </View>
      <Muted>{kind === null ? openHint : decisionHints[kind]}</Muted>
      {kind !== null && (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={fw.noteHint}
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            accessibilityLabel={fw.note}
            style={styles.input}
          />
          <View style={styles.wrap}>
            {intentionalReasons.map((reason) => (
              <Chip key={reason} label={reason} selected={false} onPress={() => setText(reason)} />
            ))}
          </View>
        </>
      )}
      <View style={styles.wrap}>
        <GoldButton label={fw.saveStatus} compact onPress={() => onSave(kind, text)} />
        <OutlineButton label={fw.cancel} compact tone="muted" onPress={onCancel} />
      </View>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- the pane

const decisionIcon: Readonly<Record<ReviewDecision, IconName>> = {
  resolved: 'check-circle-outline',
  intentional: 'auto-fix',
  review: 'flag-outline',
  dismissed: 'eye-off-outline',
};

export function WarningsPane() {
  const r = useReview();
  const [show, setShow] = useState<Show>('todo');
  const [byCategory, setByCategory] = useState(false);
  const [filters, setFilters] = useState<WarningFilters>(noWarningFilters);
  const [editing, setEditing] = useState<string | null>(null);
  const [oneAtATime, setOneAtATime] = useState(true);
  const [atRaw, setAt] = useState(0);
  const [note, setNote] = useState('');
  const [checkedOpen, setCheckedOpen] = useState(false);
  if (r === null) return <Muted>{fw.noNovel}</Muted>;
  const data = r.data;
  if (data === null) return <Skeleton label="Reading the book…" caption />;
  const items = data.status.items;
  const v = warningsView(items, show, byCategory, filters);
  const focusing = oneAtATime && v.queue.length > 0;
  const at = clampAt(atRaw, v.queue.length);
  const set = (patch: Partial<WarningFilters>) => setFilters({ ...filters, ...patch });
  const scanned = data.manuscript.scanned;

  const decideFocused = (item: ReviewedWarning, kind: ReviewDecision) => {
    const w = item.warning;
    if (r.decide(w.key, w.message, kind, note.trim(), decisionNode(w))) {
      setNote('');
      setAt(afterDecision(at, kind));
    }
  };

  const card = (item: ReviewedWarning) => {
    const w = item.warning;
    const decision = item.decision;
    return (
      <Panel key={w.key} style={styles.card}>
        <View style={styles.wrap}>
          <SeverityChip severity={w.severity} />
          {warningTags(item).map((t) => (
            <Tag key={t.label} label={t.label} hint={t.hint} />
          ))}
        </View>
        <Text style={styles.body}>
          <Text style={styles.bold}>{`${worldWords(w.title)}. `}</Text>
          {worldWords(w.message)}
        </Text>
        <RuleBecause w={w} />
        {decision !== null && decision.note.length > 0 && <Muted>{`${fw.yourNote}${decision.note}`}</Muted>}
        <Links r={r} w={w} />
        <WhereChecked r={r} w={w} />
        {editing === w.key ? (
          <DecisionEditor
            current={decision?.decision ?? null}
            note={decision?.note ?? ''}
            onCancel={() => setEditing(null)}
            onSave={(kind, text) => {
              if (kind === null) {
                if (decision !== null) r.reopen(decision.id);
              } else {
                r.decide(w.key, w.message, kind, text, decisionNode(w));
              }
              setEditing(null);
            }}
          />
        ) : (
          <OutlineButton label={fw.setStatus} compact tone="muted" onPress={() => setEditing(w.key)} accessibilityLabel={`Set the status of: ${w.message}`} style={styles.start} />
        )}
      </Panel>
    );
  };

  const focusCard = (item: ReviewedWarning) => {
    const w = item.warning;
    return (
      <Panel key={`focus:${w.key}`} style={styles.focus}>
        <View style={styles.focusHead}>
          <Text style={styles.count}>{`${at + 1} of ${v.queue.length}`}</Text>
          <IconButton icon="chevron-left" label={fw.previous} onPress={() => setAt(Math.max(0, at - 1))} />
          <IconButton icon="chevron-right" label={fw.next} onPress={() => setAt(v.queue.length < 2 ? at : (at + 1) % v.queue.length)} />
        </View>
        <View style={styles.wrap}>
          <SeverityChip severity={w.severity} />
          {warningTags(item).map((t) => (
            <Tag key={t.label} label={t.label} hint={t.hint} />
          ))}
        </View>
        <Text style={styles.focusTitle} accessibilityRole="header">
          {worldWords(w.title)}
        </Text>
        <Text style={styles.focusMessage}>{worldWords(w.message)}</Text>
        <RuleBecause w={w} />
        <Links r={r} w={w} />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={fw.noteHint}
          placeholderTextColor={colors.muted}
          selectionColor={colors.gold}
          accessibilityLabel={fw.note}
          style={styles.input}
        />
        <View style={styles.wrap}>
          {focusDecisions.map((d) =>
            d === 'resolved' ? (
              <GoldButton key={d} label={reviewDecisionLabel[d]} icon={decisionIcon[d]} compact onPress={() => decideFocused(item, d)} />
            ) : (
              <OutlineButton key={d} label={reviewDecisionLabel[d]} icon={decisionIcon[d]} compact tone="muted" onPress={() => decideFocused(item, d)} />
            ),
          )}
        </View>
      </Panel>
    );
  };

  const clear = allClear(data.model, scanned);
  return (
    <View style={styles.gap}>
      {items.length > 0 ? (
        <Panel style={styles.header}>
          <View style={styles.headline}>
            <Text style={styles.big}>{v.headline.count}</Text>
            <Text style={styles.headlineWords}>{v.headline.words}</Text>
          </View>
          {v.bySeverity.length > 0 && <Muted>{v.bySeverity}</Muted>}
          <ProgressBar value={v.decidedShare} showPercent={false} />
          <Text style={styles.small} accessibilityLiveRegion="polite">
            {v.status}
          </Text>
        </Panel>
      ) : (
        <Text style={styles.body}>{v.status}</Text>
      )}
      {v.queue.length > 0 && (
        <View style={styles.wrap}>
          <Chip label={fw.oneAtATime} icon="numeric-1-box-outline" selected={oneAtATime} onPress={() => setOneAtATime(true)} />
          <Chip label={fw.wholeList} icon="view-list-outline" selected={!oneAtATime} onPress={() => setOneAtATime(false)} />
        </View>
      )}
      {focusing ? (
        focusCard(v.queue[at])
      ) : items.length === 0 ? (
        <Panel style={styles.clear}>
          <Seal />
          <Text style={styles.focusTitle} accessibilityRole="header">
            {clear.title}
          </Text>
          <Text style={styles.clearSaid}>{clear.said}</Text>
          <View style={styles.rule} />
          {clear.checks.map((c) => (
            <View key={c.label} style={styles.checkLine}>
              <Icon name="check-circle-outline" size={20} />
              <View style={styles.flex}>
                <Text style={styles.checkLabel}>{c.label}</Text>
                <Muted>{c.what}</Muted>
              </View>
            </View>
          ))}
          <Muted style={styles.center}>{clear.footer}</Muted>
        </Panel>
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => setCheckedOpen(!checkedOpen)} style={styles.expander}>
            <Text style={styles.body}>{fw.whatWasChecked}</Text>
            <Icon name={checkedOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
          </Pressable>
          {checkedOpen && whatWasChecked(data.warnings, scanned).map((line) => <Muted key={line}>{line}</Muted>)}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrapRow}>
            {shows.map((s) => (
              <Chip key={s} label={`${showLabel[s]} (${v.showCounts[s]})`} selected={show === s} onPress={() => setShow(s)} />
            ))}
          </ScrollView>
          <ChooserField
            label={fw.groupBy}
            value={byCategory}
            choices={[
              { value: false, label: fw.bySeverity },
              { value: true, label: fw.byCategory },
            ]}
            onChoose={setByCategory}
          />
          <ChooserField label={fw.certainty} value={filters.certainty} choices={[{ value: null, label: fw.both }, ...certaintyChoices]} onChoose={(c) => set({ certainty: c })} />
          <ChooserField label={fw.severity} value={filters.severity} choices={[{ value: null, label: fw.any }, ...severityChoices]} onChoose={(s) => set({ severity: s })} />
          <ChooserField label={fw.category} value={filters.category} choices={[{ value: null, label: fw.any }, ...categoryChoices]} onChoose={(c) => set({ category: c })} />
          <ChooserField label={fw.check} value={filters.source} choices={[{ value: null, label: fw.any }, ...sourceChoices]} onChoose={(s) => set({ source: s })} />
          <View style={styles.search}>
            <Icon name="magnify" size={20} color={colors.muted} />
            <TextInput
              value={filters.text}
              onChangeText={(t) => set({ text: t })}
              placeholder={fw.search}
              placeholderTextColor={colors.muted}
              selectionColor={colors.gold}
              accessibilityLabel={fw.search}
              style={styles.searchInput}
            />
          </View>
          {(filters.certainty !== null || filters.severity !== null || filters.category !== null || filters.source !== null || filters.text.length > 0) && (
            <OutlineButton label={fw.clear} compact tone="muted" onPress={() => setFilters(noWarningFilters)} style={styles.start} />
          )}
          {v.empty !== null ? (
            <Panel style={styles.empty}>
              <Icon name="check-all" size={36} />
              <Text style={styles.focusTitle}>{v.empty.title}</Text>
              <Muted style={styles.center}>{v.empty.message}</Muted>
              {v.empty.clear && <OutlineButton label={fw.clear} compact onPress={() => setFilters(noWarningFilters)} />}
            </Panel>
          ) : (
            v.groups.map((g) => (
              <View key={g.heading} style={styles.gapSm}>
                <Text style={styles.groupHeading} accessibilityRole="header">{`${g.heading} (${g.count})`}</Text>
                {g.inner.map((inner) => (
                  <View key={inner.heading} style={styles.gapSm}>
                    <Text style={styles.innerHeading}>{`${inner.heading} (${inner.items.length})`}</Text>
                    {inner.items.map(card)}
                  </View>
                ))}
              </View>
            ))
          )}
        </>
      )}
      {data.status.gone.length > 0 && (
        <View style={styles.gapSm}>
          <Text style={styles.innerHeading} accessibilityRole="header">
            {fw.goneHeading}
          </Text>
          <Muted>{fw.goneCaption}</Muted>
          {data.status.gone.map((d) => {
            const line = goneLine(d);
            return (
              <View key={d.id} style={styles.goneRow}>
                <View style={styles.flex}>
                  <Text style={styles.body}>{line.title}</Text>
                  <Muted>{line.subtitle}</Muted>
                </View>
                <OutlineButton label={fw.remove} compact tone="muted" onPress={() => r.reopen(d.id)} />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** "Where it is checked": the check's own page (in Scriptor's routes). */
function WhereChecked({ r, w }: { r: OpenReview; w: Warning }) {
  const go = useOpenFromReview(r);
  return <LinkButton label={whereChecked(w)} onPress={() => go.openPath(reviewSourceWords[w.source].page)} />;
}

/** A wax seal in the accent: a scalloped disc, a ring pressed into it, and a tick. */
function Seal() {
  const size = 84;
  const c = size / 2;
  const rr = size / 2;
  const bumps = 18;
  const steps = bumps * 8;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const k = rr * (0.92 + 0.08 * Math.cos(a * bumps));
    d += `${i === 0 ? 'M' : 'L'}${(c + Math.cos(a) * k).toFixed(2)} ${(c + Math.sin(a) * k).toFixed(2)} `;
  }
  return (
    <View style={styles.seal} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Path d={`${d}Z`} fill={colors.gold} />
        <Circle cx={c} cy={c} r={rr * 0.68} fill="none" stroke="rgba(10, 11, 14, 0.55)" strokeWidth={1.5} />
      </Svg>
      <View style={styles.sealTick}>
        <Icon name="check" size={38} color={colors.background} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  center: { textAlign: 'center' },
  start: { alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  wrapRow: { gap: 6 },
  bold: { fontWeight: '700' },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 19, color: colors.muted },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  chipText: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700' },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: colors.muted },
  tagText: { fontFamily: fonts.ui, fontSize: 12, color: colors.text },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  link: { paddingVertical: 6, paddingHorizontal: 4, minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline' },
  ruleBox: { gap: 4, padding: space.md, borderRadius: radius.field, backgroundColor: colors.elevated },
  input: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
  card: { gap: space.sm },
  focus: { gap: space.sm, borderColor: colors.gold },
  focusHead: { flexDirection: 'row', alignItems: 'center' },
  count: { flex: 1, fontFamily: fonts.ui, fontSize: 13, letterSpacing: 1, color: colors.muted },
  focusTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textAlign: 'left' },
  focusMessage: { fontFamily: fonts.book, fontSize: 16, lineHeight: 24, color: colors.text },
  header: { gap: space.sm },
  headline: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, flexWrap: 'wrap' },
  big: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, color: colors.gold },
  headlineWords: { fontFamily: fonts.ui, fontSize: 17, color: colors.text, paddingBottom: 6 },
  expander: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 48,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  empty: { alignItems: 'center', gap: space.sm },
  groupHeading: { fontFamily: fonts.display, fontSize: 20, color: colors.text, marginTop: space.sm },
  innerHeading: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: colors.gold },
  goneRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  clear: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  clearSaid: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 24, color: colors.text, textAlign: 'center' },
  rule: { width: 120, height: 1, backgroundColor: colors.gold, opacity: 0.5, marginVertical: space.sm },
  checkLine: { flexDirection: 'row', gap: space.md, alignSelf: 'stretch', paddingVertical: 4 },
  checkLabel: { fontFamily: fonts.ui, fontSize: 12.5, fontWeight: '700', letterSpacing: 1, color: colors.text },
  seal: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  sealTick: { position: 'absolute' },
});

/** The words a warning's passage is about, when the continuity check found it (the warning's key is the issue's): the
 * matched words in their paragraph, so "Open the passage" lands on them. Null for any other warning. */
function passageOf(r: OpenReview, w: Warning): { term: string; block: number } | null {
  if (w.source !== 'continuity' || r.data === null) return null;
  const issue = allIssues(r.data.manuscript).find((i) => i.key === w.key);
  return issue === undefined ? null : { term: issue.match, block: issue.block };
}
