// THE STORY CALENDAR (FEATURES.md #272): how this novel counts time, the standard calendar or one of its own (months,
// days, hours, weeks, eras, seasons), begun from a preset or built by hand. Changes are a draft until saved, so the author
// sees first how dates will read and which events have dates the calendar does not have; saving never changes an event.
// A port of flutter_app/lib/features/timeline/calendar_page.dart; the logic is
// src/domain/timeline/screens/calendarPage.ts.

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { JsonMap } from '../../domain/json';
import { calendarSettingsOf } from '../../domain/timeline/dates';
import { calendarView, calendarWords, draftChanges, numberOf, savedMessage } from '../../domain/timeline/screens/calendarPage';
import { eventPath } from '../../domain/timeline/timelineService';
import { GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { colors, fonts, radius, space } from '../theme';
import { useTimeline } from './useTimeline';

/** `heading` false on its own page, where the page's title says it. */
export function CalendarPane({ heading = true }: { heading?: boolean } = {}) {
  const tl = useTimeline();
  const router = useRouter();
  const [draft, setDraft] = useState<JsonMap | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Stable keys for the month and era rows, so a field keeps its place while rows move.
  const rowKeys = useRef<{ months: number[]; eras: number[]; next: number }>({ months: [], eras: [], next: 0 });
  if (!tl) return null;

  const rows = tl.data.cast.snapshot.rows('storyCalendars');
  const saved = calendarSettingsOf(rows.length === 0 ? null : rows[0]);
  const current = draft ?? saved;
  const view = calendarView(tl.data, draft);
  const kept = rowKeys.current;
  const fresh = () => kept.next++;
  const keys = (n: number) => Array.from({ length: n }, fresh);
  if (kept.months.length !== view.months.length) kept.months = keys(view.months.length);
  if (kept.eras.length !== view.eras.length) kept.eras = keys(view.eras.length);
  const months = kept.months;
  const eras = kept.eras;

  const set = (change: (c: JsonMap) => JsonMap, moved?: { months?: number[]; eras?: number[] }) => {
    if (moved?.months) kept.months = moved.months;
    if (moved?.eras) kept.eras = moved.eras;
    setDraft({ ...current, ...change(current) });
    setStatus(null);
  };
  const swap = (list: number[], i: number, by: number) => {
    const out = [...list];
    out[i] = list[i + by];
    out[i + by] = list[i];
    return out;
  };
  const save = () => {
    const made = tl.now((c) => c.saveCalendar(current));
    if (made === undefined) return;
    setDraft(null);
    setStatus(savedMessage(current));
  };

  return (
    <View style={styles.gap}>
      {heading && (
        <Text style={styles.title} accessibilityRole="header">
          {calendarWords.title}
        </Text>
      )}
      <Panel style={styles.gapSm}>
        <Radio on={!view.custom} title={calendarWords.standard} about={calendarWords.standardAbout} onPress={() => set(draftChanges.kind(false))} />
        <Radio on={view.custom} title={calendarWords.own} about={calendarWords.ownAbout} onPress={() => set(draftChanges.kind(true))} />
      </Panel>

      {view.custom && (
        <>
          <Text style={styles.heading}>{calendarWords.presets}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets}>
            {view.presets.map((p, i) => (
              <Pressable
                key={p.name}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}. ${p.about}`}
                onPress={() => {
                  const settings = draftChanges.preset(i)();
                  set(() => settings, {
                    months: keys(Array.isArray(settings['months']) ? settings['months'].length : 0),
                    eras: keys(Array.isArray(settings['eras']) ? settings['eras'].length : 0),
                  });
                }}
                style={({ pressed }) => [styles.preset, pressed && { borderColor: colors.gold }]}
              >
                <View style={styles.row}>
                  <Icon name="calendar-month-outline" size={20} />
                  <Text style={styles.presetName}>{p.name}</Text>
                </View>
                <Text style={styles.presetAbout}>{p.about}</Text>
                <Muted>{p.year}</Muted>
              </Pressable>
            ))}
          </ScrollView>

          <DraftField label={calendarWords.name} value={view.name} onChange={(v) => set(draftChanges.name(v))} />

          <Panel style={styles.gapSm}>
            <View style={styles.boxHead}>
              <Text style={styles.heading}>{calendarWords.months}</Text>
              {view.canAddMonth && (
                <OutlineButton
                  label={calendarWords.addMonth}
                  icon="plus"
                  compact
                  onPress={() => set(draftChanges.addMonth(), { months: [...months, fresh()] })}
                />
              )}
            </View>
            {view.months.map((m, i) => (
              <View key={months[i]} style={styles.rowWrap}>
                <View style={styles.monthName}>
                  <DraftField label={m.nameLabel} value={m.name} onChange={(v) => set(draftChanges.month(i, { name: v }))} />
                </View>
                <View style={styles.monthDays}>
                  <DraftField label={m.daysLabel} value={m.days} number onChange={(v) => set(draftChanges.month(i, { days: numberOf(v) }))} />
                </View>
                {m.up && <IconButton icon="arrow-up" label={m.up} onPress={() => set(draftChanges.moveMonth(i, -1), { months: swap(months, i, -1) })} />}
                {m.down && <IconButton icon="arrow-down" label={m.down} onPress={() => set(draftChanges.moveMonth(i, 1), { months: swap(months, i, 1) })} />}
                {m.remove && (
                  <IconButton icon="close" label={m.remove} onPress={() => set(draftChanges.removeMonth(i), { months: months.filter((_, j) => j !== i) })} />
                )}
              </View>
            ))}
          </Panel>

          <View style={styles.rowWrap}>
            <View style={styles.short}>
              <DraftField label={calendarWords.hours} value={view.hours} number onChange={(v) => set(draftChanges.hours(v))} />
            </View>
            <View style={styles.short}>
              <DraftField label={calendarWords.week} value={view.week} number onChange={(v) => set(draftChanges.week(v))} />
            </View>
          </View>

          <Panel style={styles.gapSm}>
            <View style={styles.boxHead}>
              <Text style={styles.heading}>{calendarWords.eras}</Text>
              {view.canAddEra && (
                <OutlineButton label={calendarWords.addEra} icon="plus" compact onPress={() => set(draftChanges.addEra(), { eras: [...eras, fresh()] })} />
              )}
            </View>
            <Muted>{calendarWords.erasCaption}</Muted>
            {view.eras.length === 0 && <Muted style={styles.italic}>{calendarWords.noEras}</Muted>}
            {view.eras.map((e, i) => (
              <View key={eras[i]} style={styles.rowWrap}>
                <View style={styles.monthName}>
                  <DraftField label={e.nameLabel} value={e.name} onChange={(v) => set(draftChanges.era(i, { name: v }))} />
                </View>
                <View style={styles.eraYear}>
                  <DraftField label={calendarWords.fromYear} value={e.startYear} number onChange={(v) => set(draftChanges.era(i, { startYear: numberOf(v) }))} />
                </View>
                <IconButton icon="close" label={e.remove} onPress={() => set(draftChanges.removeEra(i), { eras: eras.filter((_, j) => j !== i) })} />
              </View>
            ))}
          </Panel>

          <Panel style={styles.gapSm}>
            <Text style={styles.heading}>{calendarWords.seasons}</Text>
            <Muted>{calendarWords.seasonsCaption}</Muted>
            {view.seasons.map((s) => (
              <ChooserField<number | null>
                key={s.season}
                label={s.label}
                value={s.value}
                choices={[{ value: null, label: '—' }, ...s.choices]}
                onChoose={(v) => set(draftChanges.season(s.season, v))}
              />
            ))}
          </Panel>
        </>
      )}

      {view.problems.length > 0 ? (
        <View style={styles.gapXs} accessibilityLiveRegion="polite">
          <Text style={styles.heading}>{calendarWords.toFix}</Text>
          {view.problems.map((p) => (
            <Text key={p} style={styles.problem}>
              • {p}
            </Text>
          ))}
        </View>
      ) : (
        view.summary && (
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {view.summary}
          </Text>
        )
      )}

      {view.away.count && (
        <Panel style={styles.gapSm}>
          <Text style={styles.body}>{view.away.count}</Text>
          {view.away.shown.map((m) => (
            <Pressable key={m.id} accessibilityRole="button" onPress={() => router.navigate(eventPath(m.id) as never)} style={styles.away}>
              <Text style={styles.link}>{m.text}</Text>
            </Pressable>
          ))}
          {view.away.more && <Muted>{view.away.more}</Muted>}
        </Panel>
      )}

      <View style={styles.rowWrap}>
        <GoldButton label={calendarWords.save} icon="content-save-outline" disabled={!view.canSave} onPress={save} />
        <OutlineButton label={calendarWords.discard} compact tone="muted" disabled={!view.changed} onPress={() => setDraft(null)} />
      </View>
      {status && (
        <Text style={styles.body} accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
    </View>
  );
}

function Radio({ on, title, about, onPress }: { on: boolean; title: string; about: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress} style={({ pressed }) => [styles.radio, pressed && { backgroundColor: colors.elevated }]}>
      <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={on ? colors.gold : colors.muted} />
      <View style={styles.flex}>
        <Text style={[styles.radioTitle, on && { color: colors.gold }]}>{title}</Text>
        <Muted>{about}</Muted>
      </View>
    </Pressable>
  );
}

/** A field of the draft: what is typed is the draft, so it never jumps back while the author types; discarding the
 * draft, or the saved calendar changing, puts the stored value back. */
function DraftField({ label, value, onChange, number = false }: { label: string; value: string; onChange: (v: string) => void; number?: boolean }) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          onChange(v);
        }}
        keyboardType={number ? 'numeric' : 'default'}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  heading: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  boxHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  italic: { fontStyle: 'italic' },
  problem: { fontFamily: fonts.ui, fontSize: 14.5, color: colors.danger },
  link: { fontFamily: fonts.ui, fontSize: 14.5, color: colors.gold },
  away: { paddingVertical: 6 },
  radio: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.sm, borderRadius: radius.field },
  radioTitle: { fontFamily: fonts.ui, fontSize: 15.5, fontWeight: '600', color: colors.text },
  presets: { gap: 10, paddingRight: space.md },
  preset: { width: 220, gap: 6, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  presetName: { flex: 1, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  presetAbout: { fontFamily: fonts.ui, fontSize: 13.5, lineHeight: 19, color: colors.text },
  monthName: { width: 200, maxWidth: '100%' },
  monthDays: { width: 110 },
  eraYear: { width: 150 },
  short: { width: 180, maxWidth: '100%' },
  field: { gap: 6 },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.6, color: colors.gold },
  input: {
    minHeight: 46,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
});
