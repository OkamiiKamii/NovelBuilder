// A character's PROGRESSION tab and STATUS tab (FEATURES.md #175, #246–#249). Progression: the tracker (what they are
// like at a point, the changes in order with the chart over the story, recording a change, "What is tracked"), their
// system sheets (each with the sheet editor, "Add X to a system…"), and system snapshots (log one, the state at a
// chapter, edit one, compare two). Status: their sheet drawn as the system's own status window, changed in place, with
// the profile summary beside it. Ports of flutter_app/lib/features/progression/{progression_tab,widgets/tracker,
// widgets/progress_chart,widgets/snapshots}.dart and features/characters/tabs/status_tab.dart; the logic is
// src/domain/progression/screens/*.

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import type { ProfilePage } from '../../domain/characters/screens/profile';
import { newId } from '../../domain/ids';
import type { StoryModel } from '../../domain/model/storyModel';
import type { ProgressChange } from '../../domain/records/progress';
import {
  type ChartSeries,
  chartCaption,
  chartHeight,
  chartLabel,
  chartLeft,
  chartMarks,
  chartOffset,
  chartPath,
  nearestPoint,
} from '../../domain/progression/screens/progressChart';
import { addSheet, progressionSheets, statusView } from '../../domain/progression/screens/progressionTab';
import {
  type SnapshotEdit,
  type SnapshotsState,
  type SystemEdit,
  comparisonLines,
  inSystem,
  logSnapshot,
  snapshotEdits,
  snapshotEditor,
  snapshotsStart,
  snapshotsView,
  stateCard,
} from '../../domain/progression/screens/snapshotsView';
import {
  type ChangeFormState,
  changeForm,
  changeFormStart,
  clearedForm,
  removeChange,
  submitChange,
  trackedChanges,
  trackedView,
  trackerView,
} from '../../domain/progression/screens/tracker';
import type { ProgressSnapshot } from '../../domain/progression/snapshots';
import { snapshotsOf } from '../../domain/systems/systemsService';
import { ActionSheet, ConfirmDelete, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, IconButton, type IconName, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { SheetEditor } from '../systems/SheetTools';
import { StatusWindow } from '../systems/StatusWindow';
import { useSystems } from '../systems/useSystems';
import { rememberOrganizeTab } from './OrganizeScreen';
import { ChooserField, SavedText } from './parts';
import type { OpenCast } from './useCast';
import { type ProgressActions, useProgress } from './useProgress';

/** Scriptor calls the Flutter app's "codex" World: its labels say so. */
const worldWords = (s: string): string => s.replace('Not in the codex', 'Not in World').replace('Codex item', 'World item');

// ------------------------------------------------------------------------------------------------------ progression

export function ProgressionTab({ open, entryId }: { open: OpenCast; entryId: string }) {
  const actions = useProgress(open.novelId);
  const model = open.cast.model;
  if (!model.entries.has(entryId)) return null;
  return (
    <View style={styles.gap}>
      <ProgressTracker model={model} entryId={entryId} actions={actions} />
      <SystemSheets open={open} entryId={entryId} />
      <SnapshotsSection open={open} entryId={entryId} actions={actions} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- the tracker

function ProgressTracker({ model, entryId, actions }: { model: StoryModel; entryId: string; actions: ProgressActions }) {
  const toast = useToast();
  const [asOf, setAsOf] = useState('end');
  const [tracked, setTracked] = useState(false);
  const [editing, setEditing] = useState<ProgressChange | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const view = trackerView(model, entryId, asOf);
  if (view === null) return null;
  const deletingRow = view.log?.rows.find((r) => r.change.id === deleting) ?? null;
  return (
    <Panel style={styles.box}>
      <Text style={styles.boxTitle}>{view.title}</Text>
      <Muted>{view.caption}</Muted>
      <OutlineButton label={view.chooseLabel} icon="tune-variant" compact onPress={() => setTracked(true)} style={styles.start} />
      {view.nothingTracked ? (
        <>
          <Text style={styles.body}>{view.nothingTracked.line}</Text>
          <Muted>{view.nothingTracked.more}</Muted>
        </>
      ) : (
        <>
          <ChooserField label={view.asOfLabel} value={view.asOf} choices={view.asOfChoices} onChoose={setAsOf} />
          {view.nothing ? (
            <Muted>{view.nothing}</Muted>
          ) : (
            <View style={styles.gapSm} accessibilityLabel={view.semanticsLabel}>
              {view.categories.map((c) => (
                <View key={c.name} style={styles.gapXs}>
                  <Text style={styles.label}>{c.name.toUpperCase()}</Text>
                  {c.lines.map((l, i) => (
                    <Text key={i} style={styles.body}>
                      {l.lead}
                      <Text style={styles.bold}>{l.value}</Text>
                      {l.step}
                      {l.uncertain && <Text style={{ color: colors.danger }}>{l.uncertain}</Text>}
                    </Text>
                  ))}
                  {c.moments && <Text style={styles.body}>{c.moments}</Text>}
                  {c.lost && <Muted>{c.lost}</Muted>}
                </View>
              ))}
            </View>
          )}
          {view.unplaced && <Muted>{view.unplaced}</Muted>}
          {view.untracked && <Muted>{view.untracked}</Muted>}
          {view.overTheStory && (
            <View style={styles.gapSm}>
              <Text style={styles.subTitle}>{view.overTheStory.heading}</Text>
              {view.overTheStory.series.map((s) => (
                <ProgressChart key={s.name} series={s} length={view.overTheStory!.length} />
              ))}
            </View>
          )}
          {view.log && (
            <View style={styles.gapSm}>
              <Text style={styles.subTitle}>{view.log.heading}</Text>
              {view.log.rows.map((r) => (
                <View key={r.change.id} style={styles.logRow}>
                  <View style={styles.flex}>
                    <Text style={styles.body}>
                      <Text style={styles.bold}>{r.words}</Text>
                      {r.before}
                      <Text style={styles.muted}>{r.category}</Text>
                    </Text>
                    {r.subtitle.length > 0 && <Muted>{r.subtitle}</Muted>}
                  </View>
                  <IconButton icon="pencil-outline" label={r.editTooltip} onPress={() => setEditing(r.change)} />
                  <IconButton icon="delete-outline" label={r.deleteTooltip} onPress={() => setDeleting(r.change.id)} color={colors.danger} />
                </View>
              ))}
            </View>
          )}
          {view.record ? (
            <View style={styles.gapSm}>
              <Text style={styles.subTitle}>{editing ? 'Change the recorded change' : view.record}</Text>
              <ChangeFormView
                key={editing?.id ?? 'new'}
                model={model}
                entryId={entryId}
                initial={editing}
                actions={actions}
                onDone={() => setEditing(null)}
              />
            </View>
          ) : (
            view.noneApplies && <Muted>{view.noneApplies}</Muted>
          )}
        </>
      )}
      {tracked && <TrackedSheet model={model} actions={actions} onClose={() => setTracked(false)} />}
      {deletingRow && (
        <ConfirmDelete
          visible
          title={deletingRow.confirm.title}
          message={deletingRow.confirm.message}
          confirmLabel={deletingRow.confirm.confirmLabel}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            setDeleting(null);
            if (actions.track(removeChange(deletingRow.change.id))) toast(deletingRow.deleted);
          }}
        />
      )}
    </Panel>
  );
}

/** One line over the story (progressChart.ts): held flat until the next setting, then up or down; a tap chooses the
 * nearest setting within 40. */
function ProgressChart({ series, length }: { series: ChartSeries; length: number }) {
  const [width, setWidth] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const tap = (e: GestureResponderEvent) => setChosen(nearestPoint(series, length, width, e.nativeEvent.locationX, e.nativeEvent.locationY));
  const marks = width > 0 ? chartMarks(series, length, width) : [];
  return (
    <View style={styles.gapXs}>
      <Text style={styles.label}>{series.name}</Text>
      <Pressable
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        onPress={tap}
        accessibilityLabel={chartLabel(series)}
        style={{ height: chartHeight }}
      >
        {width > 0 && (
          <Svg width={width} height={chartHeight}>
            {marks.map((m, i) => (
              <Line key={`g${i}`} x1={chartLeft} x2={width - 12} y1={m.y} y2={m.y} stroke={colors.border} strokeWidth={1} />
            ))}
            {marks
              .filter((m) => m.labelled)
              .map((m, i) => (
                <SvgText key={`t${i}`} x={chartLeft - 8} y={m.y + 4} fontSize={11} fill={colors.muted} textAnchor="end" fontFamily={fonts.ui}>
                  {m.text.length > 10 ? `${m.text.slice(0, 9)}…` : m.text}
                </SvgText>
              ))}
            <Path d={chartPath(series, length, width)} stroke={colors.gold} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {series.points.map((p, i) => {
              const o = chartOffset(p, series, Math.max(length, 1), width);
              return i === chosen ? (
                <Circle key={i} cx={o.x} cy={o.y} r={10} stroke={colors.gold} strokeWidth={2} fill={colors.gold} fillOpacity={0.9} />
              ) : (
                <Circle key={i} cx={o.x} cy={o.y} r={4.5} fill={colors.gold} />
              );
            })}
          </Svg>
        )}
      </Pressable>
      <Muted>{chartCaption(series, chosen)}</Muted>
    </View>
  );
}

function ChangeFormView({
  model,
  entryId,
  initial,
  actions,
  onDone,
}: {
  model: StoryModel;
  entryId: string;
  initial: ProgressChange | null;
  actions: ProgressActions;
  onDone: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<ChangeFormState>(() => changeFormStart(initial));
  const view = changeForm(model, entryId, form, initial, initial !== null);
  if (view === null) return null;
  const set = (patch: Partial<ChangeFormState>) => setForm({ ...form, ...patch });
  const submit = () => {
    const made = submitChange(model, entryId, view, form, initial);
    const saved = actions.track(made.change);
    if (saved === undefined) return;
    toast(made.said(saved));
    if (initial === null) setForm(clearedForm(form));
    else onDone();
  };
  return (
    <View style={styles.gapSm} accessibilityLabel={view.semanticsLabel}>
      {view.categoryLocked ? (
        <Text style={styles.body}>
          <Text style={styles.label}>WHAT CHANGES </Text>
          {view.category.name}
        </Text>
      ) : (
        <ChooserField label="What changes" value={view.category.id} choices={view.categoryChoices} onChoose={(v) => set({ categoryId: v })} />
      )}
      <ChooserField label="When" value={form.when} choices={view.whenChoices} onChoose={(v) => set({ when: v })} />
      {view.gainedOrLost && (
        <View style={styles.wrap}>
          {view.gainedOrLost.map((c) => (
            <Chip key={c.value} label={c.label} selected={view.action === c.value} onPress={() => set({ action: c.value })} />
          ))}
        </View>
      )}
      {view.subject && (
        <>
          <Field label={view.subject.label} placeholder={view.subject.hint} value={form.subject} onChangeText={(v) => set({ subject: v })} />
          {view.subject.before.length > 0 && (
            <View style={styles.wrap}>
              {view.subject.before.map((b) => (
                <Chip key={b} label={b} selected={form.subject === b} onPress={() => set({ subject: b })} />
              ))}
            </View>
          )}
        </>
      )}
      {view.value && (
        <>
          <Field label={view.value.label} value={form.value} onChangeText={(v) => set({ value: v })} />
          {view.value.steps.length > 0 && (
            <View style={styles.wrap}>
              {view.value.steps.map((s) => (
                <Chip key={s} label={s} selected={form.value === s} onPress={() => set({ value: s })} />
              ))}
            </View>
          )}
        </>
      )}
      {view.refChoices && (
        <ChooserField label="Its World entry (optional)" value={view.refValue} choices={view.refChoices} onChoose={(v) => set({ refId: v })} />
      )}
      {view.abilityChoices && (
        <ChooserField label="Its ability in a system (optional)" value={view.abilityValue} choices={view.abilityChoices} onChoose={(v) => set({ abilityId: v })} />
      )}
      <Field label="Cost" value={form.cost} onChangeText={(v) => set({ cost: v })} />
      <Field label="Note" value={form.note} onChangeText={(v) => set({ note: v })} multiline />
      <View style={styles.wrap}>
        <GoldButton label={view.submitLabel} icon="check" compact onPress={submit} />
        {view.cancel && <OutlineButton label={view.cancel} compact tone="muted" onPress={onDone} />}
      </View>
    </View>
  );
}

function TrackedSheet({ model, actions, onClose }: { model: StoryModel; actions: ProgressActions; onClose: () => void }) {
  const toast = useToast();
  const view = trackedView(model);
  const [name, setName] = useState('');
  const [shape, setShape] = useState(view.own.shapes[0]?.value ?? 'value');
  const said = (r: { change: Parameters<ProgressActions['track']>[0]; said: string }) => {
    if (actions.track(r.change) !== undefined) toast(r.said);
  };
  return (
    <Sheet visible onClose={onClose} title={view.title} footer={<GoldButton label={view.done} onPress={onClose} style={styles.flex} />}>
      <Muted>{view.intro}</Muted>
      {view.empty && <Text style={styles.body}>{view.empty}</Text>}
      {view.rows.map((r) => (
        <View key={r.category.id} style={styles.trackedRow}>
          <SavedText label={r.nameLabel} value={r.category.name} onSave={(v) => actions.track(trackedChanges.rename(r.category, v))} />
          {r.shapeLocked ? (
            <Muted>{r.shapeChoices.find((c) => c.value === r.category.shape)?.label}</Muted>
          ) : (
            <ChooserField label={r.shapeLabel} value={r.category.shape} choices={r.shapeChoices} onChoose={(v) => actions.track(trackedChanges.reshape(r.category, v))} />
          )}
          <Muted>{r.count}</Muted>
          {r.ladder && <SavedText label={r.ladder.label} hint={r.ladder.hint} value={r.ladder.text} onSave={(v) => actions.track(trackedChanges.ladder(r.category, v))} />}
          {r.forWhom && (
            <View style={styles.gapXs}>
              <Text style={styles.label}>{r.forWhom.title}</Text>
              <View style={styles.wrap}>
                {r.forWhom.characters.map((p) => (
                  <Chip key={p.id} label={p.name} selected={p.on} onPress={() => actions.track(trackedChanges.forCharacter(r.category, p.id, !p.on))} />
                ))}
              </View>
              <Muted>{r.forWhom.note}</Muted>
            </View>
          )}
          <View style={styles.wrap}>
            <OutlineButton label={r.archiveLabel} compact tone="muted" onPress={() => actions.track(trackedChanges.archive(r.category))} />
            {r.removeLabel && <OutlineButton label={r.removeLabel} compact tone="danger" onPress={() => said(trackedChanges.remove(r.category))} />}
          </View>
        </View>
      ))}
      {view.startFrom && (
        <View style={styles.gapSm}>
          <Text style={styles.subTitle}>{view.startFrom.heading}</Text>
          {view.startFrom.presets.map((p) => (
            <Pressable key={p.name} accessibilityRole="button" onPress={() => said(trackedChanges.preset(p.name))} style={({ pressed }) => [styles.preset, pressed && { backgroundColor: colors.elevated }]}>
              <Icon name="plus" size={18} />
              <View style={styles.flex}>
                <Text style={styles.body}>{p.name}</Text>
                <Muted>{p.hint}</Muted>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.gapSm}>
        <Text style={styles.subTitle}>{view.own.heading}</Text>
        <Field label={view.own.nameLabel} placeholder={view.own.nameHint} value={name} onChangeText={setName} />
        <ChooserField label={view.own.shapeLabel} value={shape} choices={view.own.shapes} onChoose={setShape} />
        <OutlineButton
          label={view.own.add}
          icon="plus"
          compact
          onPress={() => {
            const own = trackedChanges.own(name, shape);
            if (own === null) return;
            said(own);
            setName('');
          }}
          style={styles.start}
        />
      </View>
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------ system sheets

function SystemSheets({ open, entryId }: { open: OpenCast; entryId: string }) {
  const sys = useSystems();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openSheets, setOpenSheets] = useState<ReadonlySet<string>>(new Set());
  const name = open.cast.nameOf(entryId) ?? '';
  const view = progressionSheets(open.cast.model, entryId, name);
  const shown = (id: string, first: boolean) => openSheets.has(id) !== first;
  return (
    <Panel style={styles.box}>
      <Text style={styles.boxTitle}>{view.title}</Text>
      <Muted>{view.caption}</Muted>
      {view.none && (
        <View style={styles.row}>
          <Muted>{view.none.line}</Muted>
          <OutlineButton
            label={view.none.open}
            compact
            onPress={() => {
              rememberOrganizeTab('systems');
              router.navigate('/organize');
            }}
          />
        </View>
      )}
      {sys &&
        view.sheets.map((s) => {
          const on = shown(s.sheet.id, s.open);
          return (
            <View key={s.sheet.id} style={styles.gapSm}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                onPress={() => {
                  const next = new Set(openSheets);
                  if (next.has(s.sheet.id)) next.delete(s.sheet.id);
                  else next.add(s.sheet.id);
                  setOpenSheets(next);
                }}
                style={styles.expandRow}
              >
                <Text style={[styles.body, styles.flex]}>{s.title}</Text>
                <Icon name={on ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
              </Pressable>
              {on && <SheetEditor sys={sys} systemId={s.system.id} sheetId={s.sheet.id} />}
            </View>
          );
        })}
      {view.add && sys && (
        <OutlineButton label={view.add.label} icon="plus" compact onPress={() => setAdding(true)} style={styles.start} accessibilityLabel={view.add.tooltip} />
      )}
      {adding && view.add && sys && (
        <ActionSheet
          visible
          title={view.add.tooltip}
          onClose={() => setAdding(false)}
          actions={view.add.systems.map((s) => ({
            label: s.name,
            icon: 'chart-box-plus-outline' as IconName,
            onPress: () => sys.now(addSheet(s.id, entryId)),
          }))}
        />
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- snapshots

function SnapshotsSection({ open, entryId, actions }: { open: OpenCast; entryId: string; actions: ProgressActions }) {
  const [state, setState] = useState<SnapshotsState>(snapshotsStart);
  const model = open.cast.model;
  const snapshots = useMemo(() => snapshotsOf(open.cast.snapshot), [open.cast.snapshot]);
  const view = snapshotsView(model, snapshots, entryId, state);
  if (view === null) return null;
  const nodes = [...model.nodes.values()];
  const set = (patch: Partial<SnapshotsState>) => setState({ ...state, ...patch });
  const log = () => {
    const l = logSnapshot(entryId, { ...state, at: view.at });
    const made = actions.snapshot(l.change);
    if (made !== undefined) setState(l.after(made));
  };
  return (
    <Panel style={styles.box}>
      <Text style={styles.boxTitle}>{view.title}</Text>
      <Muted>{view.caption}</Muted>
      <ChooserField label={view.atLabel} value={view.at} choices={view.atChoices} onChoose={(v) => set({ at: v })} />
      <Field label={view.labelLabel} placeholder={view.labelHint} value={state.label} onChangeText={(v) => set({ label: v })} />
      <GoldButton label={view.log} icon="camera-outline" compact onPress={log} style={styles.start} />
      <Muted>{view.hint}</Muted>
      {view.chips.length > 0 && (
        <>
          <View style={styles.wrap}>
            {view.chips.map((c) => (
              <Chip key={c.id} label={c.label} selected={c.selected} onPress={() => set({ selected: c.id, view: 'edit' })} />
            ))}
          </View>
          <View style={styles.wrap}>
            {view.views.map((v) => (
              <Chip key={v.value} label={v.label} selected={state.view === v.value} onPress={() => set({ view: v.value as SnapshotsState['view'] })} />
            ))}
          </View>
        </>
      )}
      {view.inspect && (
        <View style={styles.gapSm}>
          <ChooserField label={view.inspect.label} value={view.inspect.asOf} choices={view.inspect.choices} onChoose={(v) => set({ asOf: v })} />
          {view.inspect.found ? <StateCardView model={model} snapshot={view.inspect.found} nodes={nodes} /> : <Muted>{view.inspect.nothing}</Muted>}
        </View>
      )}
      {view.edit && <SnapshotEditor key={view.edit.id} model={model} snapshot={view.edit} name={view.name} actions={actions} onRemoved={() => set({ selected: null, view: 'inspect' })} />}
      {view.compare &&
        ('none' in view.compare ? (
          <Muted>{view.compare.none}</Muted>
        ) : (
          <View style={styles.gapSm}>
            <ChooserField label="From" value={view.compare.from.id} choices={view.compare.choices} onChoose={(v) => set({ from: v })} />
            <ChooserField label="To" value={view.compare.to.id} choices={view.compare.choices} onChoose={(v) => set({ to: v })} />
            <ComparisonView lines={comparisonLines(view.compare.comparison)} />
          </View>
        ))}
    </Panel>
  );
}

function StateCardView({ model, snapshot, nodes }: { model: StoryModel; snapshot: ProgressSnapshot; nodes: Parameters<typeof stateCard>[2] }) {
  const card = stateCard(model, snapshot, nodes);
  return (
    <View style={styles.card}>
      <Text style={styles.subTitle}>{card.heading}</Text>
      {card.systems.map((s) => (
        <View key={s.name} style={styles.gapXs}>
          <Text style={styles.label}>{s.name.toUpperCase()}</Text>
          {s.tracks.map((t) => (
            <Text key={t} style={styles.body}>
              {t}
            </Text>
          ))}
          {s.rows.map((r) => (
            <Text key={r.name} style={styles.body}>
              {r.name}
              <Text style={styles.bold}>{r.display}</Text>
              {r.byHand && <Text style={styles.muted}>{r.byHand}</Text>}
              {r.systemSays && <Text style={styles.muted}>{r.systemSays}</Text>}
            </Text>
          ))}
          {s.holds && <Text style={styles.body}>{s.holds}</Text>}
        </View>
      ))}
      {card.gear && (
        <View style={styles.gapXs}>
          <Text style={styles.label}>{card.gear.heading.toUpperCase()}</Text>
          {card.gear.lines.map((l, i) => (
            <Text key={i} style={styles.body}>
              {l}
            </Text>
          ))}
        </View>
      )}
      {card.status.map((s) => (
        <View key={s.heading} style={styles.gapXs}>
          <Text style={styles.label}>{s.heading.toUpperCase()}</Text>
          {s.lines.map((l, i) => (
            <Text key={i} style={styles.body}>
              {l}
            </Text>
          ))}
        </View>
      ))}
      {card.notes && <Muted>{card.notes}</Muted>}
    </View>
  );
}

function ComparisonView({ lines }: { lines: ReturnType<typeof comparisonLines> }) {
  if ('same' in lines) return <Muted>{lines.same}</Muted>;
  return (
    <View style={styles.card}>
      {lines.groups.map((g) => (
        <View key={g.heading} style={styles.gapXs}>
          <Text style={styles.label}>{g.heading.toUpperCase()}</Text>
          {g.lines.map((l, i) => (
            <Text key={i} style={styles.body}>
              {l}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function SnapshotEditor({
  model,
  snapshot,
  name,
  actions,
  onRemoved,
}: {
  model: StoryModel;
  snapshot: ProgressSnapshot;
  name: string;
  actions: ProgressActions;
  onRemoved: () => void;
}) {
  const view = snapshotEditor(model, snapshot, name);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [gearName, setGearName] = useState('');
  const [gearEntry, setGearEntry] = useState('');
  const [gearKind, setGearKind] = useState('');
  const edit = (e: SnapshotEdit | null) => {
    if (e !== null) actions.snapshot((x) => x.updateSnapshot(snapshot.id, e));
  };
  const inSys = (systemId: string, e: SystemEdit) => edit(inSystem(systemId, e));
  return (
    <View style={styles.card}>
      <ChooserField label={view.atLabel} value={view.at} choices={view.atChoices} onChoose={(v) => edit(snapshotEdits.nodeId(v))} />
      <SavedText label={view.label.label} placeholder={view.label.hint} value={view.label.value} onSave={(v) => edit(snapshotEdits.label(v))} />
      {view.systems.map((part) => (
        <View key={part.system.id} style={styles.systemPart}>
          <Text style={styles.subTitle}>{part.title}</Text>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.body}>{part.autoTitle}</Text>
              <Muted>{part.autoSubtitle}</Muted>
            </View>
            <Switch
              value={part.auto}
              onValueChange={(on) => inSys(part.system.id, snapshotEdits.auto(on))}
              trackColor={{ true: colors.gold, false: colors.border }}
              thumbColor={colors.text}
              accessibilityLabel={part.autoTitle}
            />
          </View>
          {part.tracks.map((t) =>
            t.kind === 'levels' ? (
              <SavedText key={t.track.id} label={t.label} value={t.value} onSave={(v) => inSys(part.system.id, snapshotEdits.level(t.track, v))} />
            ) : (
              <ChooserField
                key={t.track.id}
                label={t.label}
                value={t.value ?? ''}
                choices={t.choices}
                onChoose={(v) => inSys(part.system.id, snapshotEdits.stage(t.track, v))}
              />
            ),
          )}
          {part.rows.map((r) => (
            <View key={r.variable.id} style={styles.gapXs}>
              <Text style={styles.label}>{r.name.toUpperCase()}</Text>
              {r.choice && (
                <ChooserField
                  label={r.choice.label}
                  value={r.choice.value ?? ''}
                  choices={r.choice.choices}
                  onChoose={(v) => inSys(part.system.id, snapshotEdits.choice(r.variable, part.auto, v))}
                />
              )}
              {r.own && (
                <SavedText label={r.own.label} placeholder={r.own.hint} value={r.own.value} onSave={(v) => inSys(part.system.id, snapshotEdits.own(r.variable, part.auto, v))} />
              )}
              {r.shown && <Text style={[styles.body, r.shown.error && { color: colors.danger }]}>{r.shown.text}</Text>}
              {r.byHand && <SavedText label={r.byHand.label} value={r.byHand.value} onSave={(v) => inSys(part.system.id, snapshotEdits.byHand(r.variable, v))} />}
            </View>
          ))}
          {part.groups.map((g) => (
            <View key={g.group.id} style={styles.gapXs}>
              <Text style={styles.label}>{g.heading}</Text>
              <View style={styles.wrap}>
                {g.options.map((item) => {
                  const held = g.held.includes(item.id);
                  return (
                    <Chip
                      key={item.id}
                      label={item.name}
                      selected={held}
                      onPress={() => inSys(part.system.id, snapshotEdits.hold(g.group, g.options, item, !held))}
                    />
                  );
                })}
              </View>
            </View>
          ))}
          {part.reach && <Muted>{part.reach}</Muted>}
        </View>
      ))}
      {view.addSystem && (
        <OutlineButton label={view.addSystem.label} icon="plus" compact onPress={() => setAdding(true)} style={styles.start} accessibilityLabel={view.addSystem.tooltip} />
      )}
      <View style={styles.gapSm}>
        <Text style={styles.subTitle}>{view.gear.title}</Text>
        {view.gear.items.map((g) => (
          <View key={g.id} style={styles.gearRow}>
            <View style={styles.flex}>
              <SavedText label={g.nameLabel} value={g.name} onSave={(v) => edit(snapshotEdits.gearName(g.id, v))} />
              <SavedText label={g.kindLabel} placeholder={g.kindHint} value={g.kind} onSave={(v) => edit(snapshotEdits.gearKind(g.id, v))} />
            </View>
            <IconButton icon="close" label={g.removeTooltip} onPress={() => edit(snapshotEdits.removeGear(g.id))} color={colors.muted} />
          </View>
        ))}
        <Field label={view.gear.newLabel} placeholder={view.gear.newHint} value={gearName} onChangeText={setGearName} />
        {view.gear.codexItems && (
          <ChooserField
            label="World item"
            value={gearEntry}
            choices={view.gear.codexItems.map((c) => ({ value: c.value, label: worldWords(c.label) }))}
            onChoose={setGearEntry}
          />
        )}
        <Field label={view.gear.kindLabel} placeholder={view.gear.kindHint} value={gearKind} onChangeText={setGearKind} />
        <View style={styles.wrap}>
          {view.gear.kindSuggestions.map((k) => (
            <Chip key={k} label={k} selected={gearKind === k} onPress={() => setGearKind(k)} />
          ))}
        </View>
        <OutlineButton
          label={view.gear.add}
          icon="plus"
          compact
          onPress={() => {
            const e = snapshotEdits.addGear(model, gearName, gearEntry, gearKind, newId);
            if (e === null) return;
            edit(e);
            setGearName('');
            setGearEntry('');
            setGearKind('');
          }}
          style={styles.start}
        />
      </View>
      <View style={styles.gapSm}>
        <Text style={styles.subTitle}>{view.status.title}</Text>
        {view.status.fields.map((f) => (
          <SavedText key={f.dimension} label={f.label} placeholder={f.hint} value={f.value} multiline onSave={(v) => edit(snapshotEdits.status(f.dimension, v))} />
        ))}
      </View>
      <SavedText label={view.notes.label} value={view.notes.value} multiline minLines={3} onSave={(v) => edit(snapshotEdits.notes(v))} />
      <Muted>{view.footer}</Muted>
      <OutlineButton label={view.delete.label} icon="delete-outline" compact tone="danger" onPress={() => setDeleting(true)} style={styles.start} />
      {adding && view.addSystem && (
        <ActionSheet
          visible
          title={view.addSystem.tooltip}
          onClose={() => setAdding(false)}
          actions={view.addSystem.systems.map((s) => ({
            label: s.label,
            icon: 'chart-box-plus-outline' as IconName,
            onPress: () => edit(snapshotEdits.addSystem(s.value)),
          }))}
        />
      )}
      <ConfirmDelete
        visible={deleting}
        title={view.delete.title}
        message={view.delete.message}
        confirmLabel={view.delete.confirmLabel}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          if (actions.snapshot(snapshotEdits.remove(snapshot.id))) onRemoved();
        }}
      />
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------------- status

const goToIcon: Record<string, IconName> = {
  trending_up: 'trending-up',
  hub_outlined: 'hubspot',
  badge_outlined: 'card-account-details-outline',
  history: 'history',
};

/** The Status tab: their sheet as the system's own window, changed in place; the profile summary beside it. Nothing in
 * a novel without systems. */
export function StatusTab({ open, entryId, onTab }: { open: OpenCast; entryId: string; onTab?: (tab: ProfilePage) => void }) {
  const sys = useSystems();
  const { width } = useWindowDimensions();
  const [systemId, setSystemId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const listed = open.cast.listed(entryId);
  if (!listed || !sys) return null;
  const view = statusView(open.cast, listed, systemId, editing);
  if (view === null) return null;
  const wide = width >= 760;
  const window = (
    <View style={[styles.gapSm, wide && { flex: 3 }]}>
      {view.chips && (
        <View style={styles.wrap}>
          {view.systems.map((s) => (
            <Chip key={s.id} label={s.name} selected={s.selected} onPress={() => setSystemId(s.id)} />
          ))}
        </View>
      )}
      {/* The window says the caption itself; named for this character even before they have a sheet. */}
      <StatusWindow
        sys={sys}
        systemId={view.system.id}
        sheetId={view.sheet?.id ?? null}
        editable={editing && view.sheet !== null}
        holder={listed.entry.name}
        caption={view.caption}
      />
      <View style={styles.wrap}>
        {view.give && <GoldButton label={view.give} icon="chart-box-plus-outline" compact onPress={() => sys.now(addSheet(view.system.id, entryId))} />}
        {view.change && (
          <OutlineButton
            label={view.change.label}
            icon={view.change.done ? 'check' : 'tune-variant'}
            compact
            onPress={() => setEditing(!editing)}
          />
        )}
        {view.wholeSheet && <OutlineButton label={view.wholeSheet} icon="pencil-outline" compact tone="muted" onPress={() => onTab?.('progression')} />}
      </View>
    </View>
  );
  const summary = (
    <Panel style={[styles.box, wide && { flex: 2 }]}>
      <View style={styles.row}>
        <Icon name="star-four-points-outline" size={18} />
        <Text style={styles.summaryHeading}>{view.summary.heading}</Text>
      </View>
      <Text style={[styles.summary, view.summary.empty && styles.summaryEmpty]}>{view.summary.text}</Text>
      <View style={styles.rule} />
      {view.summary.counts.map((c) => (
        <View key={c.label} style={styles.countRow}>
          <Text style={[styles.body, styles.flex]}>{c.label}</Text>
          <Text style={[styles.body, styles.bold]}>{c.value}</Text>
        </View>
      ))}
      <View style={styles.rule} />
      <Text style={styles.summaryHeading}>{view.summary.goTo}</Text>
      {view.summary.tabs.map((t) => (
        <OutlineButton
          key={t.tab}
          label={t.label}
          icon={goToIcon[t.icon] ?? 'arrow-right'}
          compact
          tone="muted"
          onPress={() => onTab?.(t.tab as ProfilePage)}
          style={styles.start}
        />
      ))}
    </Panel>
  );
  return (
    <View style={wide ? styles.side : styles.gap}>
      {window}
      {summary}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  start: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  side: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  box: { gap: space.sm },
  card: { gap: space.sm, padding: space.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  boxTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  subTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  label: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: colors.gold },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21, color: colors.text },
  bold: { fontWeight: '700' },
  muted: { color: colors.muted },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  trackedRow: { gap: space.sm, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  preset: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  expandRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderTopWidth: 1, borderTopColor: colors.border },
  systemPart: { gap: space.sm, padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  gearRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  summaryHeading: { fontFamily: fonts.display, fontSize: 12, fontWeight: '700', letterSpacing: 2, color: colors.gold },
  summary: { fontFamily: fonts.ui, fontSize: 16, lineHeight: 23, color: colors.text },
  summaryEmpty: { fontStyle: 'italic', color: colors.muted },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
  countRow: { flexDirection: 'row', alignItems: 'center' },
});
