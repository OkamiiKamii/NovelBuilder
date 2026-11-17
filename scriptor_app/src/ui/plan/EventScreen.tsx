// ONE EVENT (FEATURES.md #268–#271): when (a flexible date), how important, where, how long, how it ends, its planning
// and canon status, the threads, labels, factions, items and lore it involves, what it comes after; who takes part
// (and their age then) and which chapters tell it and how; what to check (chronology, ages, travel, two places at
// once) and what happens at the same time; its connections; delete with a restore point and Undo. Every edit is
// worked out from the event as stored at that moment. A port of flutter_app/lib/features/timeline/event_page.dart;
// the logic is src/domain/timeline/screens/eventPage.ts.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type JsonMap, mapOrNull } from '../../domain/json';
import { EntityRef } from '../../domain/model/entityRef';
import type { TimelineEvent } from '../../domain/records/event';
import { cleanLabels, suggestedLabels } from '../../domain/timeline/eventChanges';
import type { DateEdit } from '../../domain/timeline/screens/dateEditor';
import {
  ageCheck,
  characterChanges,
  deleteEventDialog,
  endChanged,
  endChoices,
  endHint,
  type EndMode,
  eventPage,
  eventWords,
  lastsChanged,
  lastsCheck,
  revealRoleChoices,
  tellingChanges,
  unitChanged,
  unitChoices,
} from '../../domain/timeline/screens/eventPage';
import { eventPath } from '../../domain/timeline/timelineService';
import { ActionSheet, ConfirmDelete, PromptSheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { ConnectionsPanel } from '../organize/ConnectionsPanel';
import { ChooserField, SavedText } from '../organize/parts';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { lastNodeSetting } from '../write/WriteScreen';
import { DateEditor, NumberField } from './DateEditor';
import { PlanPage } from './PlanPage';
import { useTimeline } from './useTimeline';

const later = 'Comes in a later phase';

export function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tl = useTimeline();
  const lib = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState<'character' | 'chapter' | 'thread' | 'entry' | 'label' | null>(null);
  const [ownLabel, setOwnLabel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!tl || !id) return null;
  const view = eventPage(tl.data, id);
  const event = tl.data.placedById.get(id)?.event ?? null;

  if (!view || !event) {
    return (
      <PlanPage title={eventWords.missingTitle} back={eventWords.back}>
        <Panel style={styles.gapSm}>
          <Muted>{eventWords.missing}</Muted>
          <GoldButton label={eventWords.openTimeline} onPress={() => router.navigate('/plan' as never)} style={styles.start} />
        </Panel>
      </PlanPage>
    );
  }

  const edit = (make: (stored: TimelineEvent) => JsonMap) => tl.now((c) => c.updateEvent(id, make));
  const typed = (key: string, make: (stored: TimelineEvent) => JsonMap) => tl.later(`event:${id}:${key}`, (c) => c.updateEvent(id, make));
  const whenEdit = (e: DateEdit) => edit((s) => ({ when: e(mapOrNull(s.raw['when']) ?? {}) }));
  const endEdit = (e: DateEdit) => edit((s) => ({ end: e(mapOrNull(s.raw['end']) ?? {}) }));
  const openChapter = (nodeId: string) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(tl.novelId)}`, () => lib.settings.write(lastNodeSetting(tl.novelId), nodeId));
    router.navigate('/write');
  };
  const asked = deleteEventDialog(event, view.followers !== null);
  const remove = () => {
    setDeleting(false);
    try {
      const point = tl.service.deleteEvent(tl.novelId, id, { name: asked.name });
      router.navigate('/plan' as never);
      toast(asked.deleted, { action: { label: asked.undo, run: () => tl.service.undo(point) } });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
    }
  };
  const mode = view.endMode;
  const labels = event.labels;
  const nameOf = (options: readonly { id: string; label: string }[], x: string) => options.find((o) => o.id === x)?.label ?? x;

  return (
    <PlanPage title={view.title} subtitle={view.subtitle} back={eventWords.back}>
      <View style={styles.row}>
        <OutlineButton label={eventWords.consequences} icon="source-branch" compact tone="muted" disabled onPress={() => undefined} accessibilityLabel={`${eventWords.consequences} ${later}`} />
        <OutlineButton label={eventWords.back} icon="timeline-text-outline" compact onPress={() => router.navigate('/plan' as never)} />
      </View>

      {view.issues.length > 0 && (
        <Panel style={[styles.gapSm, styles.issues]}>
          <Text style={styles.heading}>{eventWords.thingsToCheck.toUpperCase()}</Text>
          {view.issues.map((t, i) => (
            <View key={i} style={styles.bullet}>
              <Icon name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.issue}>{t}</Text>
            </View>
          ))}
          {view.reviewLink && <Muted>{`${view.reviewLink} (${later.toLowerCase()})`}</Muted>}
        </Panel>
      )}

      <Panel style={styles.gap}>
        <SavedText label={eventWords.name} value={event.name} onSave={(v) => typed('name', () => ({ name: v }))} />
        <DateEditor when={mapOrNull(event.raw['when'])} calendar={tl.data.calendar} others={view.others} onEdit={whenEdit} />
        <View style={styles.fields}>
          <View style={styles.field}>
            <ChooserField label={eventWords.importance} value={view.importance.value} choices={view.importance.choices} onChoose={(v) => edit(() => ({ importance: v }))} />
          </View>
          <View style={styles.field}>
            <ChooserField label={eventWords.location} value={view.location.value} choices={view.location.choices} onChoose={(v) => edit(() => ({ locationId: v.length === 0 ? null : v }))} />
          </View>
          {mode === '' && (
            <>
              <NumberField label={eventWords.lasts} width={124} value={event.duration?.amount ?? null} decimals check={lastsCheck} onSave={(v) => edit(lastsChanged(v))} />
              <View style={{ width: 124 }}>
                <ChooserField label={eventWords.unit} value={event.duration?.unit ?? 'days'} choices={unitChoices} onChoose={(v) => edit(unitChanged(v))} />
              </View>
            </>
          )}
        </View>
        <ChooserField<EndMode> label={eventWords.ends} value={mode} choices={endChoices(event)} onChoose={(v) => edit(endChanged(v))} helper={endHint(mode) ?? undefined} />
        {mode === 'date' && (
          <DateEditor
            when={mapOrNull(event.raw['end'])}
            calendar={tl.data.calendar}
            others={view.others}
            legend={eventWords.endsOn}
            prefix={eventWords.endPrefix}
            offered={['exact', 'approximate', 'relative']}
            onEdit={endEdit}
          />
        )}
        <View style={styles.fields}>
          <View style={styles.field}>
            <ChooserField label={eventWords.status} value={view.status.value} choices={view.status.choices} onChoose={(v) => edit(() => ({ status: v }))} />
          </View>
          <View style={styles.field}>
            <ChooserField label={eventWords.canon} value={view.canon.value} choices={view.canon.choices} onChoose={(v) => edit(() => ({ canon: v }))} />
          </View>
        </View>
      </Panel>

      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>{eventWords.threads.toUpperCase()}</Text>
        <View style={styles.chips}>
          {view.threads.chosen.map((t) => (
            <Removable key={t} label={nameOf(view.threads.options, t)} onRemove={() => edit((s) => ({ threadIds: s.threadIds.filter((x) => x !== t) }))} />
          ))}
          {view.threads.options.length > view.threads.chosen.length && <Chip label="Add" icon="plus" selected={false} onPress={() => setAdding('thread')} />}
        </View>
        {view.threads.options.length === 0 && <Muted>No plot threads yet.</Muted>}

        <Text style={styles.heading}>LABELS</Text>
        <View style={styles.chips}>
          {labels.map((l) => (
            <Removable key={l} label={l} onRemove={() => edit((s) => ({ labels: s.labels.filter((x) => x !== l) }))} />
          ))}
          <Chip label="Add" icon="plus" selected={false} onPress={() => setAdding('label')} />
        </View>
      </Panel>

      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>{eventWords.characters.toUpperCase()}</Text>
        <Muted>{eventWords.charactersCaption}</Muted>
        {view.cast.length === 0 && <Muted>{eventWords.nobody}</Muted>}
        {view.cast.map((c) => (
          <View key={c.id} style={styles.castRow}>
            <Pressable accessibilityRole="button" onPress={() => router.navigate(`/organize/character/${c.id}` as never)} style={styles.flex}>
              <Text style={styles.name}>{c.name}</Text>
              {c.step?.label ? <Muted>{c.step.label}</Muted> : null}
            </Pressable>
            <NumberField label="Age" width={130} value={c.age} hint={c.hint} check={ageCheck} onSave={(v) => edit(characterChanges.age(c.id, v))} />
            <IconButton icon="close" label={`Remove ${c.name}`} onPress={() => edit(characterChanges.remove(c.id))} color={colors.muted} />
          </View>
        ))}
        {view.addCharacter.length > 0 && <OutlineButton label={eventWords.addCharacter} icon="account-plus-outline" compact onPress={() => setAdding('character')} style={styles.start} />}
      </Panel>

      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>{eventWords.toldTitle.toUpperCase()}</Text>
        <Muted>{eventWords.toldCaption}</Muted>
        {view.told.length === 0 && <Muted>{eventWords.notLinked}</Muted>}
        {view.told.map((t) => (
          <View key={t.nodeId} style={styles.castRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${t.label} in Write`} onPress={() => openChapter(t.nodeId)} style={styles.flex}>
              <Text style={styles.name}>{t.label}</Text>
            </Pressable>
            <View style={{ width: 210 }}>
              <ChooserField label={t.roleLabel} value={t.role} choices={revealRoleChoices} onChoose={(v) => edit(tellingChanges.role(t.nodeId, v))} />
            </View>
            <IconButton icon="link-variant-off" label={t.unlink} onPress={() => edit(tellingChanges.unlink(t.nodeId))} color={colors.muted} />
          </View>
        ))}
        <View style={styles.row}>
          {view.linkChapter.length > 0 && <OutlineButton label={eventWords.linkChapter} icon="link-variant" compact onPress={() => setAdding('chapter')} />}
          <OutlineButton label={eventWords.compareOrders} icon="compare-horizontal" compact tone="muted" disabled onPress={() => undefined} accessibilityLabel={`${eventWords.compareOrders}. ${later}`} />
        </View>
      </Panel>

      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>{eventWords.entries.toUpperCase()}</Text>
        <View style={styles.chips}>
          {view.entries.chosen.map((e) => (
            <Removable key={e} label={nameOf(view.entries.options, e)} onRemove={() => edit((s) => ({ entryIds: s.entryIds.filter((x) => x !== e) }))} />
          ))}
          {view.entries.options.length > view.entries.chosen.length && <Chip label="Add" icon="plus" selected={false} onPress={() => setAdding('entry')} />}
        </View>
        <ChooserField label={eventWords.after} value={view.after.value} choices={view.after.choices} onChoose={(v) => edit(() => ({ afterId: v.length === 0 ? null : v }))} />
        {view.followers && <Muted>{view.followers}</Muted>}
        <SavedText label={eventWords.description} value={event.description} multiline minLines={4} onSave={(v) => typed('description', () => ({ description: v }))} />
      </Panel>

      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>{eventWords.sameTime.toUpperCase()}</Text>
        {view.sameTime.empty && <Muted>{view.sameTime.empty}</Muted>}
        {view.sameTime.lines.map((l) => (
          <Pressable key={l.id} accessibilityRole="button" onPress={() => router.navigate(eventPath(l.id) as never)} style={({ pressed }) => [styles.line, pressed && { backgroundColor: colors.elevated }]}>
            <Icon name="clock-outline" size={18} color={colors.gold} />
            <Text style={styles.lineText}>{l.text}</Text>
          </Pressable>
        ))}
      </Panel>

      <ConnectionsPanel open={tl.open} self={new EntityRef('event', id)} />

      <Muted>{eventWords.footer}</Muted>
      <OutlineButton label={eventWords.delete} icon="delete-outline" tone="danger" compact onPress={() => setDeleting(true)} style={styles.start} />

      <ActionSheet
        visible={adding !== null && adding !== 'label'}
        title={adding === 'character' ? eventWords.addCharacter : adding === 'chapter' ? eventWords.linkChapter : adding === 'thread' ? eventWords.threads : eventWords.entries}
        onClose={() => setAdding(null)}
        actions={(adding === 'character'
          ? view.addCharacter.map((c) => ({ label: c.label, icon: 'account-plus-outline' as const, onPress: () => edit(characterChanges.add(c.id)) }))
          : adding === 'chapter'
            ? view.linkChapter.map((c) => ({ label: c.label, icon: 'link-variant' as const, onPress: () => edit(tellingChanges.link(c.id)) }))
            : adding === 'thread'
              ? view.threads.options
                  .filter((o) => !view.threads.chosen.includes(o.id))
                  .map((o) => ({ label: o.label, icon: 'plus' as const, onPress: () => edit((s) => ({ threadIds: [...s.threadIds, o.id] })) }))
              : view.entries.options
                  .filter((o) => !view.entries.chosen.includes(o.id))
                  .map((o) => ({ label: o.label, icon: 'plus' as const, onPress: () => edit((s) => ({ entryIds: [...s.entryIds, o.id] })) }))
        )}
      />
      <ActionSheet
        visible={adding === 'label'}
        title="Labels"
        onClose={() => setAdding(null)}
        actions={[
          ...suggestedLabels
            .filter((l) => !labels.includes(l))
            .map((l) => ({ label: l, icon: 'tag-outline' as const, onPress: () => edit((s) => ({ labels: cleanLabels([...s.labels, l]) })) })),
          { label: 'Your own…', icon: 'pencil-outline' as const, onPress: () => setOwnLabel(true) },
        ]}
      />
      <PromptSheet
        visible={ownLabel}
        title="A label of your own"
        label="Label"
        confirmLabel="Add"
        onClose={() => setOwnLabel(false)}
        onSubmit={(v) => {
          setOwnLabel(false);
          edit((s) => ({ labels: cleanLabels([...s.labels, v]) }));
        }}
      />
      <ConfirmDelete visible={deleting} title={asked.title} message={asked.message} confirmLabel={asked.confirm} onConfirm={remove} onClose={() => setDeleting(false)} />
    </PlanPage>
  );
}

function Removable({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View style={styles.removable}>
      <Text style={styles.removableText} numberOfLines={1}>
        {label}
      </Text>
      <IconButton icon="close" label={`Remove ${label}`} onPress={onRemove} color={colors.muted} />
    </View>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'flex-start' },
  field: { width: 260, maxWidth: '100%' },
  heading: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.gold },
  issues: { borderColor: colors.danger, borderWidth: 1 },
  bullet: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' },
  issue: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  castRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, borderRadius: radius.field },
  lineText: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  removable: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, maxWidth: '100%' },
  removableText: { fontFamily: fonts.ui, fontSize: 14, color: colors.text, flexShrink: 1 },
});
