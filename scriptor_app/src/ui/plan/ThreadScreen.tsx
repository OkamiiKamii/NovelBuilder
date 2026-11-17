// ONE PLOT THREAD (FEATURES.md #254–#256): its title, category, status, premise, who and where it involves, where it is
// meant to resolve, its developments chapter by chapter (each with a role, and the threads an intersection crosses),
// notes, whether it is flagged, and delete with a restore point and Undo. Nothing here changes a status on the author's
// behalf, or the manuscript. A port of flutter_app/lib/features/plot/thread_page.dart; the logic is
// src/domain/plot/screens/threadPage.ts.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoryModel } from '../../domain/model/storyModel';
import { threadsPath } from '../../domain/plot/plotService';
import {
  beatSaveKey,
  type BeatEditorView,
  canAddBeat,
  type Choice,
  deletedMessage,
  deleteThreadDialog,
  newBeatHint,
  threadChanges,
  threadPage,
  threadSaveKey,
} from '../../domain/plot/screens/threadPage';
import { ActionSheet, ConfirmDelete } from '../dialogs';
import { Chip, GoldButton, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { ChooserField, SavedText } from '../organize/parts';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { lastNodeSetting } from '../write/WriteScreen';
import { type OpenPlot, usePlot } from './usePlot';

export function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const plot = usePlot();
  const lib = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ title: '', nodeId: '', role: 'development' });
  const model = useMemo(() => (plot ? StoryModel.fromSnapshot(plot.snapshot) : null), [plot]);
  if (!plot || !model || !id) return null;
  const view = threadPage(model, id);
  const back = () => (router.canGoBack() ? router.back() : router.navigate(threadsPath as never));

  if (view.missing) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Panel style={styles.missing}>
          <Text style={styles.title}>{view.title}</Text>
          <Muted style={styles.centerText}>{view.message}</Muted>
          <GoldButton label={view.action} onPress={() => router.navigate(view.actionPath as never)} />
        </Panel>
      </View>
    );
  }

  const thread = view.thread;
  const update = (fields: Record<string, unknown>) => plot.now(threadChanges.update(thread.id, fields));
  const later = (key: string, fields: Record<string, unknown>) => plot.later(threadSaveKey(thread.id, key), threadChanges.update(thread.id, fields));
  const openChapter = (nodeId: string) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(plot.novelId)}`, () => lib.settings.write(lastNodeSetting(plot.novelId), nodeId));
    router.navigate('/write');
  };
  const addBeat = () => {
    const change = threadChanges.addBeat(thread.id, form);
    if (!change) return;
    if (plot.now(change) !== undefined) setForm({ ...form, title: '' });
  };
  const asked = deleteThreadDialog(thread);
  const remove = () => {
    setDeleting(false);
    try {
      const point = plot.service.deleteThread(plot.novelId, thread.id, { title: asked.name });
      router.navigate(threadsPath as never);
      const said = deletedMessage(asked.name);
      toast(said.message, { action: { label: said.action, run: () => plot.service.undo(point) } });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
    }
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-left" label={view.back.label} onPress={back} />
        <View style={styles.flex}>
          <Text style={styles.barTitle} numberOfLines={1}>
            {view.title}
          </Text>
          <Text style={styles.barSub} numberOfLines={1}>
            {view.subtitle}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        {view.checks && (
          <Panel style={styles.gap}>
            <Text style={styles.kicker}>{view.checks.title.toUpperCase()}</Text>
            {view.checks.lines.map((l, i) => (
              <Text key={i} style={styles.text}>
                {l}
              </Text>
            ))}
          </Panel>
        )}

        <Panel style={styles.gap}>
          <SavedText key={`title:${thread.id}`} label="Thread title" value={thread.title} onSave={(v) => later('title', { title: v })} />
          <ChooserField label={view.category.label} value={view.category.value} choices={view.category.choices} onChoose={(v) => update({ category: v })} />
          <ChooserField label={view.status.label} value={view.status.value} choices={view.status.choices} onChoose={(v) => update({ status: v })} />
          {view.customStatus && (
            <SavedText
              key={`customStatus:${thread.id}`}
              label={view.customStatus.label}
              placeholder={view.customStatus.hint}
              value={view.customStatus.value}
              onSave={(v) => later('customStatus', { customStatus: v })}
            />
          )}
          {view.customCategory && (
            <SavedText
              key={`customCategory:${thread.id}`}
              label={view.customCategory.label}
              placeholder={view.customCategory.hint}
              value={view.customCategory.value}
              onSave={(v) => later('customCategory', { customCategory: v })}
            />
          )}
          <SavedText
            key={`premise:${thread.id}`}
            label={view.premise.label}
            placeholder={view.premise.hint}
            value={view.premise.value}
            multiline
            minLines={2}
            onSave={(v) => later('premise', { premise: v })}
          />
          <IdPicker label={view.characters.label} chosen={view.characters.chosen} options={view.characters.options} onChange={(ids) => update({ characterIds: ids })} />
          <IdPicker label={view.locations.label} chosen={view.locations.chosen} options={view.locations.options} onChange={(ids) => update({ locationIds: ids })} />
        </Panel>

        <Panel style={styles.gap}>
          <Text style={styles.kicker}>{view.target.title.toUpperCase()}</Text>
          <ChooserField label={view.target.label} value={view.target.value} choices={view.target.choices} onChoose={(v) => plot.now(threadChanges.target(thread.id, v))} />
          <SavedText
            key={`targetNote:${thread.id}`}
            label={view.target.note.label}
            placeholder={view.target.note.hint}
            value={view.target.note.value}
            onSave={(v) => later('targetNote', { targetNote: v })}
          />
        </Panel>

        <Panel style={styles.gap}>
          <Text style={styles.kicker}>{view.developments.title.toUpperCase()}</Text>
          {view.developments.caption && <Muted>{view.developments.caption}</Muted>}
          {view.developments.beats.map((b) => (
            <BeatEditor key={b.beatId} plot={plot} threadId={thread.id} beat={b} onOpen={openChapter} />
          ))}
          <View style={styles.newBeat}>
            <ChooserField label={view.newBeat.node.label} value={form.nodeId} choices={view.newBeat.node.choices} onChoose={(v) => setForm({ ...form, nodeId: v })} />
            <ChooserField label={view.newBeat.role.label} value={form.role} choices={view.newBeat.role.choices} onChoose={(v) => setForm({ ...form, role: v })} />
            <Text style={styles.label}>{view.newBeat.titleLabel.toUpperCase()}</Text>
            <TextInput
              value={form.title}
              onChangeText={(v) => setForm({ ...form, title: v })}
              onSubmitEditing={addBeat}
              placeholder={newBeatHint(form.role)}
              placeholderTextColor={colors.muted}
              selectionColor={colors.gold}
              style={styles.input}
              accessibilityLabel={view.newBeat.titleLabel}
            />
            <GoldButton label={view.newBeat.add} icon="plus" compact disabled={!canAddBeat(form.title, form.role)} onPress={addBeat} style={styles.start} />
          </View>
        </Panel>

        <View style={styles.row}>
          {/* The plot lanes are Visualize's (the plot board): this thread selected there. */}
          <OutlineButton
            label={view.links.lanes}
            icon="chart-timeline-variant"
            compact
            onPress={() => router.navigate('/visualize/plot' as never)}
          />
          <OutlineButton label={view.links.board.label} icon="view-column-outline" compact onPress={() => router.navigate(view.links.board.path as never)} />
        </View>

        <Panel style={styles.gap}>
          <SavedText
            key={`notes:${thread.id}`}
            label={view.notes.label}
            placeholder={view.notes.hint}
            value={view.notes.value}
            multiline
            minLines={3}
            onSave={(v) => later('notes', { notes: v })}
          />
          <View style={styles.switchRow}>
            <Text style={[styles.text, styles.flex]}>{view.muted.label}</Text>
            <Switch
              value={view.muted.value}
              onValueChange={(v) => update({ muted: v })}
              trackColor={{ true: colors.gold, false: colors.border }}
              thumbColor={colors.text}
              accessibilityLabel={view.muted.label}
            />
          </View>
        </Panel>

        <OutlineButton label={view.delete} icon="delete-outline" tone="danger" compact onPress={() => setDeleting(true)} style={styles.start} />
      </ScrollView>
      <ConfirmDelete visible={deleting} title={asked.title} message={asked.message} confirmLabel={asked.confirm} onConfirm={remove} onClose={() => setDeleting(false)} />
    </View>
  );
}

/** One development: its chapter, role, the threads it crosses (an intersection), title and note, open its chapter, remove. */
function BeatEditor({ plot, threadId, beat, onOpen }: { plot: OpenPlot; threadId: string; beat: BeatEditorView; onOpen: (nodeId: string) => void }) {
  const change = (fields: Record<string, unknown>) => plot.now(threadChanges.beat(threadId, beat.beatId, fields));
  const later = (key: string, fields: Record<string, unknown>) =>
    plot.later(beatSaveKey(threadId, beat.beatId, key), threadChanges.beat(threadId, beat.beatId, fields));
  return (
    <View style={styles.beat} accessibilityLabel={beat.name}>
      <View style={styles.beatHead}>
        <Text style={[styles.place, beat.struck && styles.struck]}>
          {beat.number}. {beat.place}
        </Text>
        <IconButton icon="close" label={beat.removeTip} onPress={() => plot.now(threadChanges.removeBeat(threadId, beat.beatId))} color={colors.muted} />
      </View>
      <ChooserField
        label={beat.node.label}
        value={beat.node.value}
        choices={beat.node.choices}
        onChoose={(v) => {
          const c = threadChanges.beatNode(threadId, beat.beatId, v);
          if (c) plot.now(c);
        }}
      />
      <ChooserField label={beat.role.label} value={beat.role.value} choices={beat.role.choices} onChoose={(v) => change({ role: v })} />
      {beat.crosses && <IdPicker label={beat.crosses.label} chosen={beat.crosses.chosen} options={beat.crosses.options} onChange={(ids) => change({ withThreadIds: ids })} />}
      <SavedText key={`beatTitle:${beat.beatId}`} label={beat.title.label} value={beat.title.value} onSave={(v) => later('title', { title: v })} />
      <SavedText
        key={`beatNote:${beat.beatId}`}
        label={beat.note.label}
        placeholder={beat.note.hint}
        value={beat.note.value}
        multiline
        onSave={(v) => later('note', { note: v })}
      />
      {beat.open && <OutlineButton label={beat.open.label} icon="feather" compact onPress={() => onOpen(beat.open!.nodeId)} style={styles.start} />}
    </View>
  );
}

/** Chosen records as chips (each removable), and Add for the rest (Flutter's IdPicker). */
function IdPicker({ label, chosen, options, onChange }: { label: string; chosen: string[]; options: Choice[]; onChange: (ids: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const nameOf = (id: string) => options.find((o) => o.value === id)?.label ?? 'A removed record';
  const rest = options.filter((o) => !chosen.includes(o.value));
  return (
    <View style={styles.gapXs}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.row}>
        {chosen.map((id) => (
          <Chip key={id} label={`${nameOf(id)}  ×`} selected onPress={() => onChange(chosen.filter((x) => x !== id))} />
        ))}
        {rest.length > 0 && <Chip label="Add" icon="plus" selected={false} onPress={() => setAdding(true)} />}
        {chosen.length === 0 && rest.length === 0 && <Muted>None to choose yet.</Muted>}
      </View>
      <ActionSheet
        visible={adding}
        title={label}
        onClose={() => setAdding(false)}
        actions={rest.map((o) => ({ label: o.label, icon: 'plus' as const, onPress: () => onChange([...chosen, o.value]) }))}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  centerText: { textAlign: 'center' },
  missing: { alignItems: 'center', gap: space.md, maxWidth: 420 },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
  barTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  barSub: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textAlign: 'center' },
  body: { padding: space.md, gap: space.md, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  gap: { gap: space.sm },
  gapXs: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
  kicker: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: colors.gold },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  text: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  input: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.field, backgroundColor: colors.elevated, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  newBeat: { gap: space.sm, marginTop: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  beat: { gap: space.sm, padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  beatHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  place: { flex: 1, fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
