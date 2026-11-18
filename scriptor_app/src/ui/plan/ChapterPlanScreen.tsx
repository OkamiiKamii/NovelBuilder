// A CHAPTER'S OR SCENE'S PLAN (FEATURES.md #261–#264): status, objective, summary, labels, the beats in order, the
// entries involved, who appears (appears, mentioned, point of view; one press for characters linked in the text), the
// narrative dynamics, the ending, a web serial's notes before and after, its timeline events and plot threads, and
// private notes. All of it is kept in the planning layer and never written into the manuscript. A port of
// flutter_app/lib/features/plot/chapter_plan_page.dart and widgets/label_picker.dart; what it shows is
// src/domain/plot/screens/planPage.ts.

import { useRouter } from 'expo-router';

import { consequencesPath } from '../../domain/consequences/consequences';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { characterPath } from '../../domain/characters/screens/create';
import { worldEntryPath } from '../../domain/codex/screens/entryPage';
import { newId } from '../../domain/ids';
import { StoryModel } from '../../domain/model/storyModel';
import { threadPath } from '../../domain/plot/plotService';
import {
  type LabelPickerView,
  type PlanField,
  nodeSaveKey,
  planChanges,
  planPage,
  planSaveKey,
  withLabel,
  withoutLabel,
} from '../../domain/plot/screens/planPage';
import type { NodeStatus } from '../../domain/records/storyNode';
import { ActionSheet, PromptSheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { SavedText } from '../organize/parts';
import { colors, fonts, space } from '../theme';
import { lastNodeSetting } from '../write/WriteScreen';
import { PlanPage } from './PlanPage';
import { type OpenPlot, usePlot } from './usePlot';

type Menu = { title: string; actions: { label: string; icon: React.ComponentProps<typeof Icon>['name']; onPress: () => void }[] } | null;

export function ChapterPlanScreen({ nodeId }: { nodeId: string }) {
  const plot = usePlot();
  if (!plot) return null;
  return <Plan plot={plot} nodeId={nodeId} />;
}

function Plan({ plot, nodeId }: { plot: OpenPlot; nodeId: string }) {
  const lib = useLibrary();
  const router = useRouter();
  const [menu, setMenu] = useState<Menu>(null);
  const [ownLabel, setOwnLabel] = useState(false);
  const [beat, setBeat] = useState('');
  const model = useMemo(() => StoryModel.fromSnapshot(plot.snapshot), [plot.snapshot]);
  const view = useMemo(() => planPage(model, plot.snapshot, nodeId), [model, plot.snapshot, nodeId]);

  if (view.missing) {
    return (
      <PlanPage title={view.title} back="Back">
        <Muted>{view.message}</Muted>
        <GoldButton label={view.action} onPress={() => router.navigate(view.actionPath as never)} style={styles.start} />
      </PlanPage>
    );
  }

  const id = view.node.id;
  const plan = view.plan;
  const openInWrite = () => {
    lib.saves.saveNow(`setting:${lastNodeSetting(plot.novelId)}`, () => lib.settings.write(lastNodeSetting(plot.novelId), id));
    router.navigate('/write');
  };
  const openEntry = (entryId: string, character: boolean) => router.navigate((character ? characterPath(entryId) : worldEntryPath(entryId)) as never);
  const field = (f: PlanField) => (
    <SavedText
      key={f.field}
      label={f.label}
      value={f.value}
      placeholder={f.hint}
      multiline
      minLines={f.lines}
      onSave={(v) => plot.later(planSaveKey(id, f.field), planChanges.plan(id, { [f.field]: v }))}
    />
  );
  const labels: LabelPickerView = view.labels;
  const currentLabels = plan?.labels ?? [];
  const setLabels = (next: string[] | null) => {
    if (next !== null) plot.now(planChanges.plan(id, { labels: next }));
  };
  const addBeat = () => {
    const change = planChanges.addBeat(id, beat, newId);
    if (change && plot.now(change) !== undefined) setBeat('');
  };

  return (
    <PlanPage title={view.title} subtitle={view.subtitle} back="Back">
      <View style={styles.row}>
        <GoldButton label={view.actions.write} icon="pencil-outline" compact onPress={openInWrite} />
        <OutlineButton label={view.actions.consequences} icon="source-branch" compact onPress={() => router.navigate(consequencesPath({ nodeId }) as never)} />
        <OutlineButton label={view.actions.board.label} icon="view-column-outline" compact onPress={() => router.navigate(view.actions.board.path as never)} />
      </View>

      {/* Status: the steps from idea to final, the ones passed marked. */}
      <Panel style={styles.panel}>
        <Text style={styles.heading}>{view.status.label.toUpperCase()}</Text>
        <View style={styles.wrap}>
          {view.status.steps.map((s) => (
            <Chip
              key={s.status}
              label={s.label}
              icon={s.done ? 'check' : undefined}
              selected={s.selected}
              onPress={() => plot.now(planChanges.node(id, { status: s.status as NodeStatus }))}
            />
          ))}
        </View>
      </Panel>

      <Panel style={styles.panel}>
        {field(view.objective)}
        <SavedText
          label={view.summary.label}
          value={view.summary.value}
          placeholder={view.summary.hint}
          multiline
          minLines={2}
          onSave={(v) => plot.later(nodeSaveKey(id, 'summary'), planChanges.node(id, { summary: v }))}
        />
        {/* Labels: the suggestions, the novel's own, or the author's words. */}
        <Text style={styles.label}>{labels.label.toUpperCase()}</Text>
        <View style={styles.wrap}>
          {labels.none && <Muted>{labels.none}</Muted>}
          {labels.labels.map((l) => (
            <View key={l.label} style={styles.tag}>
              <Text style={styles.tagText}>{l.label}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={l.removeTip} onPress={() => setLabels(withoutLabel(currentLabels, l.label))} hitSlop={8}>
                <Icon name="close" size={14} color={colors.muted} />
              </Pressable>
            </View>
          ))}
          <IconButton
            icon="tag-plus-outline"
            label={labels.addTip}
            size={20}
            onPress={() =>
              setMenu({
                title: labels.addTip,
                actions: [
                  ...labels.offered.map((l) => ({ label: l, icon: 'tag-outline' as const, onPress: () => setLabels(withLabel(currentLabels, l)) })),
                  { label: labels.own, icon: 'pencil-outline' as const, onPress: () => setOwnLabel(true) },
                ],
              })
            }
          />
        </View>
      </Panel>

      {/* The beats, in order. */}
      <Panel style={styles.panel}>
        <Text style={styles.heading}>{view.beats.title.toUpperCase()}</Text>
        {view.beats.items.map((b) => (
          <View key={b.id} style={styles.beat}>
            <Text style={styles.beatNumber}>{b.number}</Text>
            <View style={styles.flex}>
              <SavedText
                label={b.label}
                value={b.text}
                multiline
                onSave={(v) => {
                  const change = planChanges.beatText(id, b.id, v);
                  if (change) plot.later(planSaveKey(id, `beat:${b.id}`), change);
                }}
              />
            </View>
            <View>
              {b.up && <IconButton icon="arrow-up" label={b.up} size={18} onPress={() => plot.now(planChanges.moveBeat(id, b.id, -1))} />}
              {b.down && <IconButton icon="arrow-down" label={b.down} size={18} onPress={() => plot.now(planChanges.moveBeat(id, b.id, 1))} />}
              <IconButton icon="delete-outline" label={b.remove} size={18} color={colors.danger} onPress={() => plot.now(planChanges.removeBeat(id, b.id))} />
            </View>
          </View>
        ))}
        <View style={styles.addRow}>
          <TextInput
            value={beat}
            onChangeText={setBeat}
            onSubmitEditing={addBeat}
            placeholder="Add a beat"
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            style={styles.input}
            accessibilityLabel="Add a beat"
          />
          <OutlineButton label="Add" icon="plus" compact disabled={beat.trim().length === 0} onPress={addBeat} />
        </View>
      </Panel>

      {/* The records involved. */}
      <Panel style={styles.panel}>
        {'none' in view.entities ? (
          <Muted>{view.entities.none}</Muted>
        ) : (
          (() => {
            const ent = view.entities;
            const chosen = ent.chosen;
            const label = (v: string) => ent.options.find((o) => o.value === v)?.label ?? v;
            return (
              <>
                <Text style={styles.label}>{ent.label.toUpperCase()}</Text>
                <View style={styles.wrap}>
                  {chosen.map((e) => (
                    <View key={e} style={styles.tag}>
                      <Text style={styles.tagText}>{label(e)}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${label(e)}`}
                        onPress={() => plot.now(planChanges.plan(id, { entityIds: chosen.filter((x) => x !== e) }))}
                        hitSlop={8}
                      >
                        <Icon name="close" size={14} color={colors.muted} />
                      </Pressable>
                    </View>
                  ))}
                  <IconButton
                    icon="plus"
                    label={`Add to ${ent.label}`}
                    size={20}
                    onPress={() =>
                      setMenu({
                        title: ent.label,
                        actions: ent.options
                          .filter((o) => !chosen.includes(o.value))
                          .map((o) => ({ label: o.label, icon: 'plus' as const, onPress: () => plot.now(planChanges.plan(id, { entityIds: [...chosen, o.value] })) })),
                      })
                    }
                  />
                </View>
              </>
            );
          })()
        )}
        {view.inText && (
          <>
            <Text style={styles.label}>{view.inText.title.toUpperCase()}</Text>
            <View style={styles.wrap}>
              {view.inText.entries.map((e) => (
                <Chip key={e.id} label={e.name} icon={e.character ? 'account-outline' : 'earth'} selected={false} onPress={() => openEntry(e.id, e.character)} />
              ))}
            </View>
          </>
        )}
      </Panel>

      {/* Who appears here. */}
      {view.appearances && (
        <Panel style={styles.panel}>
          <Text style={styles.heading}>{view.appearances.title.toUpperCase()}</Text>
          <Muted>{view.appearances.caption}</Muted>
          {view.appearances.lists.map((list) => {
            const name = (v: string) => list.options.find((o) => o.value === v)?.label.replace(' (moves from the other list)', '') ?? v;
            return (
              <View key={list.field} style={styles.list}>
                <Text style={styles.label}>{list.label.toUpperCase()}</Text>
                <View style={styles.wrap}>
                  {list.chosen.map((c) => (
                    <View key={c} style={styles.tag}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name(c)}`} onPress={() => openEntry(c, true)}>
                        <Text style={styles.tagText}>{name(c)}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${name(c)} from ${list.label}`}
                        onPress={() => plot.now(planChanges.plan(id, { [list.field]: list.chosen.filter((x) => x !== c) }))}
                        hitSlop={8}
                      >
                        <Icon name="close" size={14} color={colors.muted} />
                      </Pressable>
                    </View>
                  ))}
                  <IconButton
                    icon="account-plus-outline"
                    label={list.addTip}
                    size={20}
                    onPress={() =>
                      setMenu({
                        title: list.addTip,
                        actions: list.options
                          .filter((o) => !list.chosen.includes(o.value))
                          .map((o) => ({
                            label: o.label,
                            icon: 'account-outline' as const,
                            onPress: () => plot.now(planChanges.plan(id, { [list.field]: [...list.chosen, o.value] })),
                          })),
                      })
                    }
                  />
                </View>
              </View>
            );
          })}
          {view.appearances.linked && (
            <View style={styles.list}>
              <Text style={styles.label}>{view.appearances.linked.title.toUpperCase()}</Text>
              {view.appearances.linked.people.map((p) => {
                const lists = view.appearances!.lists;
                const appear = lists.find((l) => l.field === 'appearIds')!.chosen;
                const mention = lists.find((l) => l.field === 'mentionIds')!.chosen;
                return (
                  <View key={p.id} style={styles.linked}>
                    <Text style={[styles.tagText, styles.flex]}>{p.name}</Text>
                    <OutlineButton label="Appears" compact accessibilityLabel={p.appears} onPress={() => plot.now(planChanges.record(id, 'appearIds', appear, p.id))} />
                    <OutlineButton label="Mentioned" compact tone="muted" accessibilityLabel={p.mentioned} onPress={() => plot.now(planChanges.record(id, 'mentionIds', mention, p.id))} />
                  </View>
                );
              })}
            </View>
          )}
        </Panel>
      )}

      <Panel style={styles.panel}>
        <Text style={styles.heading}>{view.dynamics.title.toUpperCase()}</Text>
        {view.dynamics.fields.map(field)}
        {field(view.ending)}
      </Panel>

      {view.serial && (
        <Panel style={styles.panel}>
          <Text style={styles.heading}>{view.serial.title.toUpperCase()}</Text>
          <Muted>{view.serial.caption}</Muted>
          {view.serial.fields.map((f) => (
            <SavedText
              key={f.field}
              label={f.label}
              value={f.value}
              placeholder={f.hint}
              multiline
              minLines={2}
              onSave={(v) => plot.later(nodeSaveKey(id, f.field), planChanges.node(id, { [f.field]: v }))}
            />
          ))}
        </Panel>
      )}

      <Panel style={styles.panel}>
        <Text style={styles.heading}>{view.events.title.toUpperCase()}</Text>
        {view.events.caption && <Muted>{view.events.caption}</Muted>}
        <View style={styles.wrap}>
          {view.events.items.map((e) => (
            <Chip key={e.id} label={e.name} icon="timeline-outline" selected={false} onPress={() => router.navigate(`/plan/event/${e.id}` as never)} />
          ))}
        </View>
        <Text style={styles.heading}>{view.threads.title.toUpperCase()}</Text>
        {view.threads.caption && <Muted>{view.threads.caption}</Muted>}
        {view.threads.items.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${t.title}`}
            onPress={() => router.navigate(threadPath(t.id) as never)}
            style={({ pressed }) => [styles.threadLine, pressed && { backgroundColor: colors.elevated }]}
          >
            <Icon name="vector-polyline" size={18} color={colors.sky} />
            <View style={styles.flex}>
              <Text style={styles.tagText}>{t.title}</Text>
              {t.beats && <Muted numberOfLines={2}>{t.beats}</Muted>}
            </View>
          </Pressable>
        ))}
      </Panel>

      <Panel style={styles.panel}>
        <SavedText
          label={view.notes.label}
          value={view.notes.value}
          placeholder={view.notes.hint}
          multiline
          minLines={3}
          onSave={(v) => plot.later(nodeSaveKey(id, 'notes'), planChanges.node(id, { notes: v }))}
        />
      </Panel>

      {menu && <ActionSheet visible title={menu.title} actions={menu.actions} onClose={() => setMenu(null)} />}
      <PromptSheet
        visible={ownLabel}
        title={labels.ownPrompt.title}
        label={labels.ownPrompt.label}
        confirmLabel={labels.ownPrompt.confirm}
        onClose={() => setOwnLabel(false)}
        onSubmit={(v) => {
          setOwnLabel(false);
          setLabels(withLabel(currentLabels, v));
        }}
      />
    </PlanPage>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  panel: { gap: space.sm },
  heading: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.gold },
  label: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.gold, marginTop: space.xs },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  tagText: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  beat: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  beatNumber: { width: 22, paddingTop: 30, fontFamily: fonts.numbers, fontSize: 14, color: colors.gold, textAlign: 'right' },
  addRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: { flex: 1, minHeight: 44, paddingHorizontal: space.md, borderRadius: 8, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  list: { gap: 6 },
  linked: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  threadLine: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.sm, borderRadius: 8 },
});
