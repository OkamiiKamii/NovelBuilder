// Organize's form pieces: a chooser (a field showing the choice, a sheet of every choice on press), and a text field
// whose typing is saved shortly after it stops (through autosave, so a failure shows and is retried), keeping what is
// typed on screen while the stored text catches up.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { Sheet } from '../dialogs';
import { GoldButton, Icon, IconButton, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';

export type Choice<T> = { value: T; label: string };

/** The most choices a list is a plain sheet for (choice_field.dart's longFrom): a longer one (the chapters, the cast,
 * the places of a book) gets a line to type in that narrows it, and builds only the rows that fit. */
export const longFrom = 12;

/** How many matching rows a long list builds at once; typing narrows to the rest. */
const longShown = 60;

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
  const [find, setFind] = useState('');
  const current = choices.find((c) => c.value === value);
  const long = choices.length > longFrom;
  const wanted = find.trim().toLowerCase().split(/s+/).filter((w) => w.length > 0);
  const matching = long && wanted.length > 0 ? choices.filter((c) => wanted.every((w) => c.label.toLowerCase().includes(w))) : choices;
  const shown = long ? matching.slice(0, longShown) : matching;
  const close = () => {
    setOpen(false);
    setFind('');
  };
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
      <Sheet visible={open} onClose={close} title={label}>
        {long && (
          <TextInput
            value={find}
            onChangeText={setFind}
            placeholder={`Type to find one of ${choices.length}`}
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            accessibilityLabel={`Find in ${label}`}
            style={[styles.input, styles.find]}
          />
        )}
        {long && matching.length === 0 && <Text style={styles.helper}>{`Nothing here holds “${find.trim()}”.`}</Text>}
        {shown.map((c, i) => {
          const on = c.value === value;
          const indent = c.label.length - c.label.trimStart().length;
          return (
            <Pressable
              key={i}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                close();
                if (!on) onChoose(c.value);
              }}
              style={({ pressed }) => [styles.choice, { paddingLeft: space.sm + indent * 4 }, pressed && { backgroundColor: colors.elevated }]}
            >
              <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={on ? colors.gold : colors.muted} />
              <Text style={[styles.choiceText, on && { color: colors.gold }]}>{c.label.trim()}</Text>
            </Pressable>
          );
        })}
        {matching.length > shown.length && (
          <Text style={styles.helper}>{`${matching.length - shown.length} more: type to narrow the list.`}</Text>
        )}
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
  keyboardType,
}: {
  label: string;
  value: string;
  onSave: (text: string) => void;
  hint?: string;
  multiline?: boolean;
  minLines?: number;
  placeholder?: string;
  /** The keyboard to type with: `numeric` for a number that may be negative or have decimals (the Flutter app's
   * numberWithOptions(decimal, signed)), `number-pad` for a whole count (TextInputType.number). */
  keyboardType?: TextInputProps['keyboardType'];
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
        keyboardType={keyboardType}
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

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
/** Monday 0 … Sunday 6, for the first of month `m` of year `y` (any year from 1, as Dart's DateTime reads it). */
function weekdayOf(y: number, m: number): number {
  const d = new Date(0);
  d.setUTCFullYear(y, m - 1, 1);
  return (d.getUTCDay() + 6) % 7;
}
const two = (n: number) => String(n).padStart(2, '0');
const dayText = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${two(m)}-${two(d)}`;

/** A date field (FieldType.date, typed_input.dart's _DateInput): typed as yyyy-mm-dd, saved as typing stops, with a
 * calendar to choose one from; a chosen date is saved at once, as the Flutter app's date picker does. */
export function DateField({ label, value, hint, onSave, onChosen }: { label: string; value: string; hint?: string; onSave: (text: string) => void; onChosen: (date: string) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <View style={styles.dateRow}>
      <View style={styles.dateText}>
        <SavedText label={label} value={value} placeholder="yyyy-mm-dd" hint={hint} keyboardType="numbers-and-punctuation" onSave={onSave} />
      </View>
      <IconButton icon="calendar-month-outline" label="Choose a date" onPress={() => setPicking(true)} />
      {picking && (
        <DatePickerSheet
          title={label}
          value={value}
          onClose={() => setPicking(false)}
          onPick={(d) => {
            setPicking(false);
            onChosen(d);
          }}
        />
      )}
    </View>
  );
}

/** A month of days to choose one from (years 1 to 9999, as the Flutter picker allows), starting on the date given or
 * today; the year is typed, the month stepped. */
function DatePickerSheet({ title, value, onClose, onPick }: { title: string; value: string; onClose: () => void; onPick: (d: string) => void }) {
  const m = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  const now = new Date();
  const start = m ? { y: Number(m[1]), mo: Number(m[2]) } : { y: now.getFullYear(), mo: now.getMonth() + 1 };
  const [year, setYear] = useState(Math.min(9999, Math.max(1, start.y)));
  const [month, setMonth] = useState(Math.min(12, Math.max(1, start.mo)));
  const [typedYear, setTypedYear] = useState(String(Math.min(9999, Math.max(1, start.y))));
  const chosen = m ? `${Number(m[1])}-${Number(m[2])}-${Number(m[3])}` : '';
  const step = (by: number) => {
    let y = year;
    let mo = month + by;
    if (mo < 1) {
      mo = 12;
      y -= 1;
    } else if (mo > 12) {
      mo = 1;
      y += 1;
    }
    if (y < 1 || y > 9999) return;
    setYear(y);
    setMonth(mo);
    setTypedYear(String(y));
  };
  const lead = weekdayOf(year, month);
  const days = daysIn(year, month);
  return (
    <Sheet visible onClose={onClose} title={title} footer={<OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.dateText} />}>
      <View style={styles.pickHead}>
        <IconButton icon="chevron-left" label="The month before" onPress={() => step(-1)} />
        <Text style={styles.pickTitle}>{monthNames[month - 1]}</Text>
        <TextInput
          value={typedYear}
          onChangeText={(t) => {
            setTypedYear(t);
            const y = Number(t);
            if (/^\d{1,4}$/.test(t) && y >= 1 && y <= 9999) setYear(y);
          }}
          keyboardType="number-pad"
          accessibilityLabel="Year"
          selectionColor={colors.gold}
          style={styles.pickYear}
        />
        <IconButton icon="chevron-right" label="The month after" onPress={() => step(1)} />
      </View>
      <View style={styles.pickGrid}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={[styles.pickCell, styles.pickDay]}>
            {d}
          </Text>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <View key={`b${i}`} style={styles.pickCell} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const on = chosen === `${year}-${month}-${day}`;
          return (
            <Pressable key={day} accessibilityRole="button" accessibilityLabel={dayText(year, month, day)} onPress={() => onPick(dayText(year, month, day))} style={[styles.pickCell, on && styles.pickOn]}>
              <Text style={[styles.pickText, on && { color: colors.onGold }]}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
      <GoldButton label="Today" compact onPress={() => onPick(dayText(now.getFullYear(), now.getMonth() + 1, now.getDate()))} style={styles.today} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  dateText: { flex: 1 },
  today: { alignSelf: 'flex-start', marginTop: space.sm },
  pickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  pickTitle: { flex: 1, fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  pickYear: { width: 76, minHeight: 44, borderRadius: radius.field, backgroundColor: colors.elevated, color: colors.text, fontFamily: fonts.ui, fontSize: 16, textAlign: 'center' },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm },
  pickCell: { width: '14.2857%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  pickDay: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, textAlign: 'center', textAlignVertical: 'center' },
  pickText: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  pickOn: { backgroundColor: colors.gold },

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
  find: { marginBottom: space.sm },
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
