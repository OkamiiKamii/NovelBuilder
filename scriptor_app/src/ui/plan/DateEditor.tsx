// A DATE IN THE NOVEL'S CALENDAR (FEATURES.md #269): exact to the minute, approximate (a year and its season or month),
// relative (so long before or after another event) or undated; and the number field it is typed in, which keeps what
// is typed until it is left and says why a value was not saved. A port of
// flutter_app/lib/features/timeline/widgets/date_editor.dart and number_field.dart; the logic is
// src/domain/timeline/screens/dateEditor.ts.

import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { JsonMap } from '../../domain/json';
import type { Calendar } from '../../domain/records/calendar';
import type { Placed } from '../../domain/timeline/chronology';
import { commitNumber, type DateEdit, dateEditor, setPrecision, showNumber } from '../../domain/timeline/screens/dateEditor';
import { Chip, Muted } from '../kit';
import { ChooserField } from '../organize/parts';
import { colors, fonts, radius, space } from '../theme';

export function DateEditor({
  when,
  calendar,
  others,
  legend,
  prefix,
  offered,
  onEdit,
}: {
  when: JsonMap | null;
  calendar: Calendar;
  others: readonly Placed[];
  legend?: string;
  prefix?: string;
  offered?: readonly string[];
  /** A change to the date, to be worked out from the date as stored when it is saved. */
  onEdit: (edit: DateEdit) => void;
}) {
  const view = dateEditor({ when, calendar, others, legend, prefix, offered });
  return (
    <View style={styles.box}>
      <Text style={styles.legend}>{view.legend.toUpperCase()}</Text>
      <View style={styles.chips}>
        {view.chips.map((c) => (
          <Chip key={c.precision} label={c.label} selected={c.selected} onPress={() => !c.selected && onEdit(setPrecision(c.precision, others))} />
        ))}
      </View>
      <View style={styles.fields}>
        {view.fields.map((f, i) =>
          f.kind === 'note' ? (
            <Muted key={i}>{f.text}</Muted>
          ) : f.kind === 'choice' ? (
            <View key={`${f.label}-${i}`} style={{ width: f.width, maxWidth: '100%' }}>
              <ChooserField label={f.label} value={f.value} choices={f.choices} onChoose={(v) => onEdit(f.choose(v))} />
            </View>
          ) : (
            <NumberField
              key={`${f.label}-${i}`}
              label={f.label}
              width={f.width}
              value={f.value}
              enabled={f.enabled}
              allowEmpty={f.allowEmpty}
              decimals={f.decimals}
              hint={f.hint}
              helper={f.helper}
              check={f.check}
              onSave={(v) => onEdit(f.commit(v))}
            />
          ),
        )}
      </View>
    </View>
  );
}


/** A number typed in place: saved when it is left (or Enter), with what was wrong said under it and nothing saved. */
export function NumberField({
  label,
  width,
  value,
  enabled = true,
  allowEmpty = true,
  decimals = false,
  hint,
  helper,
  check,
  onSave,
}: {
  label: string;
  width?: number;
  value: number | null;
  enabled?: boolean;
  allowEmpty?: boolean;
  decimals?: boolean;
  hint?: string | null;
  helper?: string | null;
  check?: (v: number | null) => string | null;
  onSave: (v: number | null) => void;
}) {
  const [text, setText] = useState(showNumber(value));
  const [focused, setFocused] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!focused) setText(showNumber(value));
  }, [value, focused]);
  const commit = () => {
    const done = commitNumber(text, { value, allowEmpty, decimals, check });
    if ('problem' in done) {
      setProblem(done.problem);
      return;
    }
    setProblem(null);
    if ('save' in done) onSave(done.save);
  };
  return (
    <View style={{ width: width ?? 160, maxWidth: '100%' }}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <TextInput
        value={text}
        editable={enabled}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onSubmitEditing={commit}
        keyboardType={decimals ? 'decimal-pad' : 'numeric'}
        placeholder={hint ?? undefined}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        accessibilityLabel={label}
        style={[styles.input, !enabled && { opacity: 0.45 }, problem !== null && { borderColor: colors.danger }]}
      />
      {problem !== null ? <Text style={styles.problem}>{problem}</Text> : helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, padding: space.md, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border },
  legend: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.4, color: colors.gold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'flex-start' },
  label: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.gold, marginBottom: 4 },
  input: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
  },
  helper: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 3 },
  problem: { fontFamily: fonts.ui, fontSize: 12, color: colors.danger, marginTop: 3 },
});
