// ALTERNATE HISTORIES (FEATURES.md #273): other courses of events for this novel, kept apart from its main timeline.
// Each holds only what is different (an event changed, one that does not happen, one only there); the rest is the
// timeline it branches from. Nothing here changes the main timeline, merges into it, or changes a history's canon
// status by itself. With none yet, a history begins as a question (What if…?). Any two timelines can be compared. A port
// of flutter_app/lib/features/timeline/histories_page.dart and widgets/what_if.dart; the logic is
// src/domain/timeline/screens/historiesPage.ts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { JsonMap } from '../../domain/json';
import { mapOrNull, str } from '../../domain/json';
import type { TimelineEvent } from '../../domain/records/event';
import { resolveChronology } from '../../domain/timeline/chronology';
import { type AlternateHistory, comparisonSummary, historyEvents, historyKindLabel, historyKinds, historyStatusLabel, historyStatuses } from '../../domain/timeline/histories';
import {
  changeDraft,
  changePlaceChoices,
  changeWords,
  comparePair,
  compareWords,
  comparison,
  deleteHistoryDialog,
  historiesPath,
  historyCards,
  selectedHistory,
  selectedWords,
  type StartForm,
  startChoices,
  startForm,
  startWords,
  timelineChoices,
  timelineName,
  whatIfFor,
  whatIfName,
  whatIfWords,
} from '../../domain/timeline/screens/historiesPage';
import { ConfirmDelete, Sheet } from '../dialogs';
import { Field, GoldButton, Icon, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField, SavedText } from '../organize/parts';
import { colors, fonts, space } from '../theme';
import { DateEditor } from './DateEditor';
import { type OpenTimeline, useTimeline } from './useTimeline';

/** `onSelect`: where opening a history goes (by default this page's address with `?history=`); `heading` false on its
 * own page, where the page's title says it. */
export function HistoriesPane({
  historyId,
  onSelect,
  heading = true,
}: {
  historyId?: string | null;
  onSelect?: (id: string | null) => void;
  heading?: boolean;
}) {
  const tl = useTimeline();
  const router = useRouter();
  const [form, setForm] = useState<StartForm>(startForm);
  const [chosen, setChosen] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });
  const [showSame, setShowSame] = useState(false);
  if (!tl) return null;
  const { data } = tl;
  const selected = historyId ? (data.histories.get(historyId) ?? null) : null;
  const select = (id: string | null) => (onSelect ? onSelect(id) : router.replace(historiesPath(id) as never));
  const cards = historyCards(data, selected?.id ?? null);
  const choices = startChoices(data, form);
  const list = timelineChoices(data);

  const create = () => {
    const made = tl.now((c) =>
      c.createHistory({
        name: form.name,
        kind: form.kind,
        status: form.status,
        baseId: form.baseId,
        originEventId: form.originId,
        causeEventId: form.kind === 'time-travel' ? form.causeId : null,
        note: form.note,
      }),
    );
    if (made === undefined) return;
    setForm({ ...startForm, kind: form.kind, status: form.status, baseId: form.baseId });
    select(made);
  };

  const pair = comparePair(data, chosen, selected);
  const compared = data.historyList.length > 0 ? comparison(data, pair.a, pair.b, showSame) : null;

  return (
    <View style={styles.gap}>
      {heading && (
        <Text style={styles.title} accessibilityRole="header">
          Alternate histories
        </Text>
      )}

      {data.historyList.length === 0 && (
        <WhatIfCard
          tl={tl}
          onBranch={(name, eventId) => {
            const made = tl.now((c) => c.createHistory({ name, originEventId: eventId }));
            if (made !== undefined) select(made);
          }}
        />
      )}

      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>Histories</Text>
        {cards.empty && <Muted style={styles.italic}>{cards.empty}</Muted>}
        {cards.cards.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityState={{ selected: c.selected }}
            accessibilityLabel={`${c.name}, ${c.status}`}
            onPress={() => select(c.id)}
            style={({ pressed }) => [styles.card, c.selected && styles.cardOn, pressed && { borderColor: colors.gold }]}
          >
            <View style={styles.rowWrap}>
              <Text style={styles.cardName}>{c.name}</Text>
              <Text style={styles.small}>{c.status}</Text>
            </View>
            <Muted>{c.origin}</Muted>
            <Muted>{c.counts}</Muted>
          </Pressable>
        ))}
      </Panel>

      <Panel style={styles.gapSm}>
        <Text style={styles.heading}>{startWords.title}</Text>
        <Field label={startWords.name} placeholder={startWords.nameHint} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <ChooserField label={startWords.kind} value={form.kind} choices={choices.kind} onChoose={(v) => setForm({ ...form, kind: v })} />
        <ChooserField label={startWords.status} value={form.status} choices={choices.status} onChoose={(v) => setForm({ ...form, status: v })} />
        <ChooserField
          label={startWords.base}
          value={form.baseId ?? 'main'}
          choices={choices.base}
          onChoose={(v) => setForm({ ...form, baseId: v === 'main' ? null : v, originId: null, causeId: null })}
        />
        <ChooserField
          label={startWords.origin}
          value={form.originId ?? ''}
          choices={choices.origin}
          onChoose={(v) => setForm({ ...form, originId: v === '' ? null : v })}
        />
        {choices.cause && (
          <ChooserField label={startWords.cause} value={form.causeId ?? ''} choices={choices.cause} onChoose={(v) => setForm({ ...form, causeId: v === '' ? null : v })} />
        )}
        <Field label={startWords.note} placeholder={startWords.noteHint} value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} />
        <GoldButton label={startWords.start} icon="source-branch" onPress={create} style={styles.start} />
      </Panel>

      {selected && <SelectedHistory key={selected.id} tl={tl} h={selected} onDeleted={() => select(null)} />}

      {compared && (
        <Panel style={styles.gapSm}>
          <Text style={styles.heading}>{compareWords.title}</Text>
          <ChooserField label={compareWords.a} value={pair.a ?? 'main'} choices={list} onChoose={(v) => setChosen({ ...chosen, a: v })} />
          <ChooserField label={compareWords.b} value={pair.b ?? 'main'} choices={list} onChoose={(v) => setChosen({ ...chosen, b: v })} />
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {comparisonSummary(compared.diffs, timelineName(data, pair.a), timelineName(data, pair.b))}
          </Text>
          <View style={styles.switchRow}>
            <Switch value={showSame} onValueChange={setShowSame} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.text} accessibilityLabel={compareWords.showSame} />
            <Text style={[styles.body, styles.flex]}>{compareWords.showSame}</Text>
          </View>
          {compared.lines.map((l) => (
            <View key={l.id} style={styles.diff}>
              <Text style={styles.cardName}>{l.name}</Text>
              <Muted>{l.inA}</Muted>
              <Muted>{l.inB}</Muted>
              <Text style={styles.body}>{l.what}</Text>
            </View>
          ))}
        </Panel>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------- what if

/** WHAT IF…?: a history begun as a question; starters out of the story; Branch the story makes it (named as the
 * question, departing at the event its starter turns on). Nothing is made until the press. */
function WhatIfCard({ tl, onBranch }: { tl: OpenTimeline; onBranch: (name: string, eventId: string | null) => void }) {
  const [question, setQuestion] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const starters = whatIfFor(tl.data);
  const ready = question.trim().length > 0;
  return (
    <Panel style={styles.whatIf}>
      <Text style={styles.whatIfTitle}>{whatIfWords.title}</Text>
      <Text style={styles.whatIfLine}>{whatIfWords.line}</Text>
      <View style={styles.rule} />
      <Text style={styles.fieldLabel}>{whatIfWords.question.toUpperCase()}</Text>
      <TextInput
        value={question}
        onChangeText={(v) => {
          setQuestion(v);
          setEventId(null);
        }}
        placeholder={whatIfWords.hint}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        autoCapitalize="sentences"
        accessibilityLabel={whatIfWords.question}
        style={styles.question}
      />
      <Muted>{whatIfWords.begin}</Muted>
      <View style={styles.chips}>
        {starters.map((s) => (
          <Pressable
            key={s.question}
            accessibilityRole="button"
            onPress={() => {
              setQuestion(s.question);
              setEventId(s.eventId);
            }}
            style={({ pressed }) => [styles.starter, pressed && { borderColor: colors.gold }]}
          >
            <Icon name={s.eventId === null ? 'help-circle-outline' : 'call-split'} size={16} />
            <Text style={styles.starterText}>{s.question}</Text>
          </Pressable>
        ))}
      </View>
      <GoldButton label={whatIfWords.branch} icon="call-split" disabled={!ready} onPress={() => onBranch(whatIfName(question), eventId)} style={styles.start} />
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- the open history

function SelectedHistory({ tl, h, onDeleted }: { tl: OpenTimeline; h: AlternateHistory; onDeleted: () => void }) {
  const { data } = tl;
  const [changing, setChanging] = useState<TimelineEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newEvent, setNewEvent] = useState('');
  const view = selectedHistory(data, h);
  const mine = historyEvents(data.model.events, data.histories, h.id);
  const ask = deleteHistoryDialog(data, h);
  const statusChoices = historyStatuses.map((s) => ({ value: s, label: historyStatusLabel(s) }));
  const kindChoices = historyKinds.map((k) => ({ value: k, label: historyKindLabel[k] }));

  return (
    <Panel style={styles.gapSm}>
      <Text style={styles.heading}>{view.title}</Text>
      <Text style={styles.body} accessibilityLiveRegion="polite">
        <Text style={styles.bold}>{view.status}</Text>
        {view.rest}
      </Text>
      <Muted>{view.origin}</Muted>
      {view.cause && <Muted>{view.cause}</Muted>}
      {view.note && <Muted>{view.note}</Muted>}

      <SavedText label={selectedWords.name} value={h.name} onSave={(v) => tl.later(`history:${h.id}:name`, (c) => c.updateHistory(h.id, { name: v }))} />
      <ChooserField label={selectedWords.status} value={h.status as string} choices={statusChoices} onChoose={(v) => tl.now((c) => c.updateHistory(h.id, { status: v }))} />
      <ChooserField label={selectedWords.kind} value={h.kind as string} choices={kindChoices} onChoose={(v) => tl.now((c) => c.updateHistory(h.id, { kind: v }))} />
      <ChooserField
        label={selectedWords.departs}
        value={view.departs.value}
        choices={view.departs.choices}
        onChoose={(v) => tl.now((c) => c.updateHistory(h.id, { originEventId: v === '' ? null : v }))}
      />

      {view.stale && (
        <View style={styles.rowWrap}>
          <Text style={[styles.body, styles.flex]}>{view.stale}</Text>
          <OutlineButton label={selectedWords.forget} compact tone="muted" onPress={() => tl.now((c) => c.forgetStale(h.id))} />
        </View>
      )}
      {view.before && <Text style={styles.body}>{view.before}</Text>}

      <Text style={[styles.heading, styles.top]} accessibilityRole="header">
        {selectedWords.events}
      </Text>
      {view.events.map((e) => (
        <View key={e.id} style={styles.event}>
          <Muted>{e.label}</Muted>
          <View style={styles.rowWrap}>
            <Text style={styles.cardName}>{e.name}</Text>
            {e.added && <Text style={styles.small}>{selectedWords.onlyHere}</Text>}
            {e.changed && <Text style={styles.small}>{e.changed}</Text>}
          </View>
          <View style={styles.rowWrap}>
            <OutlineButton
              label={selectedWords.change}
              compact
              accessibilityLabel={e.changeLabel}
              onPress={() => {
                const ev = mine.get(e.id);
                if (ev) setChanging(ev);
              }}
            />
            {e.restore && (
              <OutlineButton label={selectedWords.restore} compact tone="muted" accessibilityLabel={e.restore} onPress={() => tl.now((c) => c.restoreHistoryEvent(h.id, e.id))} />
            )}
            <OutlineButton
              label={e.remove.label}
              compact
              tone={e.added ? 'danger' : 'muted'}
              accessibilityLabel={e.remove.semantics}
              onPress={() => tl.now((c) => (e.added ? c.deleteAddedEvent(h.id, e.id) : c.removeHistoryEvent(h.id, e.id)))}
            />
          </View>
        </View>
      ))}

      {view.removed.length > 0 && (
        <>
          <Text style={[styles.heading, styles.top]} accessibilityRole="header">
            {selectedWords.notHappening}
          </Text>
          {view.removed.map((r) => (
            <View key={r.id} style={styles.rowWrap}>
              <Text style={[styles.body, styles.struck]}>{r.name}</Text>
              <OutlineButton label={selectedWords.restore} compact tone="muted" accessibilityLabel={r.restore} onPress={() => tl.now((c) => c.restoreHistoryEvent(h.id, r.id))} />
            </View>
          ))}
        </>
      )}

      <Field label={selectedWords.newEvent} placeholder={selectedWords.newEventHint} value={newEvent} onChangeText={setNewEvent} />
      <OutlineButton
        label={selectedWords.addEvent}
        icon="plus"
        compact
        onPress={() => {
          const made = tl.now((c) => c.addHistoryEvent(h.id, newEvent));
          if (made !== undefined) setNewEvent('');
        }}
        style={styles.start}
      />
      <OutlineButton label={selectedWords.delete} icon="delete-outline" compact tone="danger" onPress={() => setDeleting(true)} style={[styles.start, styles.top]} />

      {changing && (
        <ChangeSheet
          tl={tl}
          event={changing}
          others={resolveChronology(mine.values(), data.calendar).filter((p) => p.event.id !== changing.id)}
          onClose={() => setChanging(null)}
          onSave={(draft) => {
            const added = view.events.find((x) => x.id === changing.id)?.added ?? false;
            tl.now((c) => (added ? c.updateAddedEvent(h.id, changing.id, draft) : c.changeHistoryEvent(h.id, changing.id, draft)));
            setChanging(null);
          }}
        />
      )}
      <ConfirmDelete
        visible={deleting}
        title={ask.title}
        message={ask.message}
        confirmLabel={ask.confirm}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          onDeleted();
          tl.now((c) => c.removeHistory(h.id));
        }}
      />
    </Panel>
  );
}

/** How an event goes in a history: its name, date, place, whether it is still going on, and what happens. Only what
 * differs from the base is kept (by the change, on saving). */
function ChangeSheet({
  tl,
  event,
  others,
  onClose,
  onSave,
}: {
  tl: OpenTimeline;
  event: TimelineEvent;
  others: ReturnType<typeof resolveChronology>;
  onClose: () => void;
  onSave: (draft: JsonMap) => void;
}) {
  const [draft, setDraft] = useState<JsonMap>(() => changeDraft(event));
  const place = changePlaceChoices(tl.data, draft);
  return (
    <Sheet
      visible
      onClose={onClose}
      title={changeWords.title(event)}
      wide
      footer={
        <View style={styles.rowWrap}>
          <OutlineButton label={changeWords.cancel} compact tone="muted" onPress={onClose} />
          <GoldButton label={changeWords.save} onPress={() => onSave(draft)} />
        </View>
      }
    >
      <Field label={changeWords.name} value={str(draft['name'])} onChangeText={(v) => setDraft({ ...draft, name: v })} />
      <DateEditor
        when={mapOrNull(draft['when'])}
        calendar={tl.data.calendar}
        others={others}
        onEdit={(edit) => setDraft((d) => ({ ...d, when: edit(mapOrNull(d['when']) ?? {}) }))}
      />
      <ChooserField label={changeWords.place} value={place.value} choices={place.choices} onChoose={(v) => setDraft({ ...draft, locationId: v === '' ? null : v })} />
      <View style={styles.switchRow}>
        <Switch
          value={draft['ongoing'] === true}
          onValueChange={(v) => setDraft({ ...draft, ongoing: v })}
          trackColor={{ true: colors.gold, false: colors.border }}
          thumbColor={colors.text}
          accessibilityLabel={changeWords.ongoing}
        />
        <Text style={[styles.body, styles.flex]}>{changeWords.ongoing}</Text>
      </View>
      <Field label={changeWords.description} multiline value={str(draft['description'])} onChangeText={(v) => setDraft({ ...draft, description: v })} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  top: { marginTop: space.sm },
  start: { alignSelf: 'flex-start' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  heading: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  small: { fontFamily: fonts.ui, fontSize: 12, color: colors.gold },
  card: { gap: 4, padding: space.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardOn: { borderColor: colors.gold, backgroundColor: 'rgba(243, 182, 58, 0.08)' },
  cardName: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  diff: { gap: 2, paddingBottom: space.sm },
  event: { gap: 4, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  whatIf: { gap: space.sm, paddingTop: 20, paddingHorizontal: 22, paddingBottom: 18 },
  whatIfTitle: { fontFamily: fonts.display, fontSize: 20, fontWeight: '700', color: colors.text },
  whatIfLine: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 23, color: colors.muted },
  rule: { height: 1, backgroundColor: colors.gold, opacity: 0.4, marginVertical: space.xs },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.6, color: colors.gold },
  question: {
    minHeight: 50,
    paddingHorizontal: space.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    color: colors.text,
    fontFamily: fonts.book,
    fontSize: 19,
  },
  starter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, maxWidth: '100%' },
  starterText: { flexShrink: 1, fontFamily: fonts.ui, fontSize: 13.5, color: colors.text },
});
