// Organize's form pieces: a chooser (a field showing the choice, a sheet of every choice on press), and a text field
// whose typing is saved shortly after it stops (through autosave, so a failure shows and is retried), keeping what is
// typed on screen while the stored text catches up.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Sheet } from '../dialogs';
import { Icon } from '../kit';
import { colors, fonts, radius, space } from '../theme';

export type Choice<T> = { value: T; label: string };

export function ChooserField<T>({
  label,
  value,
  choices,
  onChoose,
  helper,
}: {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChoose: (value: T) => void;
  helper?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = choices.find((c) => c.value === value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label.trim() ?? ''}. Change`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.box, pressed && { backgroundColor: colors.border }]}
      >
        <Text style={styles.value} numberOfLines={1}>
          {current?.label.trim() ?? ''}
        </Text>
        <Icon name="chevron-down" size={20} color={colors.muted} />
      </Pressable>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {choices.map((c, i) => {
          const on = c.value === value;
          const indent = c.label.length - c.label.trimStart().length;
          return (
            <Pressable
              key={i}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                setOpen(false);
                if (!on) onChoose(c.value);
              }}
              style={({ pressed }) => [styles.choice, { paddingLeft: space.sm + indent * 4 }, pressed && { backgroundColor: colors.elevated }]}
            >
              <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={on ? colors.gold : colors.muted} />
              <Text style={[styles.choiceText, on && { color: colors.gold }]}>{c.label.trim()}</Text>
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

/** A text field saved as typed: `onSave` runs a moment after typing stops (and when the field is left). */
export function SavedText({
  label,
  value,
  onSave,
  hint,
  multiline = false,
  minLines = 1,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (text: string) => void;
  hint?: string;
  multiline?: boolean;
  minLines?: number;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const typing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onSave);
  latest.current = onSave;
  // The stored value replaces what is shown only while nothing is being typed.
  useEffect(() => {
    if (!typing.current) setText(value);
  }, [value]);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (typing.current) {
      typing.current = false;
      latest.current(text);
    }
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          typing.current = true;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            typing.current = false;
            latest.current(v);
          }, 600);
        }}
        onBlur={flush}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        cursorColor={colors.gold}
        accessibilityLabel={label}
        style={[styles.input, multiline && { minHeight: 22 * minLines + 22, textAlignVertical: 'top' }]}
      />
      {hint ? <Text style={styles.helper}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, marginBottom: space.md },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: { flex: 1, fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  helper: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 17, color: colors.muted },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingRight: space.sm, borderRadius: radius.field },
  choiceText: { flex: 1, fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  input: {
    minHeight: 48,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.field,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
});
