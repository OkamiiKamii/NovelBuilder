// THE CASTING CALL (FEATURES.md #149, #150): a new character starts as their portrait card and fills in while the
// author types: name, title or epithet, narrative roles, summary and a profile layout; or all of it from one line
// ("Mira Vance, 34, a smuggler from Glass River, Kai's sister"), which also records their age, origin and ties.
// "Add to the cast" makes them and opens their profile. A port of new_character_dialog.dart.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { characterRoles } from '../../domain/characters/characterRecords';
import { CastingCall, castingCallWords, characterPath, makeNewCharacter } from '../../domain/characters/screens/create';
import { castTone, monogram } from '../../domain/characters/screens/library';
import { Sheet, useFocusOnShow } from '../dialogs';
import { Chip, Field, GoldButton, Muted, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { ChooserField } from './parts';
import { useCast } from './useCast';

export function NewCharacterSheet({ visible, onClose, line }: { visible: boolean; onClose: () => void; line?: string }) {
  const open = useCast();
  const router = useRouter();
  const { ref: focusRef, onShow: focusOnShow } = useFocusOnShow();
  const [call, setCall] = useState<CastingCall | null>(null);
  const [, setTick] = useState(0);
  const changed = () => setTick((t) => t + 1);
  useEffect(() => {
    if (visible && open) {
      const cast = open.cast.characters().map((e) => ({ id: e.id, name: e.name }));
      setCall(new CastingCall(open.cast.templates, cast, { line: line ?? null }));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !call) return null;
  const preview = call.preview;
  const add = () => {
    const made = call.submit();
    changed();
    if (!made) return;
    const entry = open.now((c) => makeNewCharacter(c, made));
    if (entry) {
      onClose();
      router.navigate(characterPath(entry.id));
    }
  };
  return (
    <Sheet
      onShow={focusOnShow}
      visible={visible}
      onClose={onClose}
      title={castingCallWords.title}
      footer={
        <>
          <OutlineButton label={castingCallWords.cancel} onPress={onClose} tone="muted" style={styles.flex} />
          <GoldButton label={castingCallWords.add} icon="account-plus-outline" onPress={add} style={styles.flex} />
        </>
      }
    >
      <View style={styles.preview}>
        <View style={[styles.face, { backgroundColor: castTone(preview.id) }]}>
          <Text style={styles.monogram}>{preview.named ? monogram(preview.name) : '?'}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.name, !preview.named && { color: colors.muted }]}>{preview.name}</Text>
          {preview.epithet.length > 0 && <Text style={styles.epithet}>{preview.epithet}</Text>}
          {preview.roles && <Text style={styles.roles}>{preview.roles}</Text>}
          {preview.summary.length > 0 && (
            <Muted numberOfLines={2}>{preview.summary}</Muted>
          )}
        </View>
      </View>
      <Field
        ref={focusRef}
        label={castingCallWords.line}
        placeholder={castingCallWords.lineHint}
        hint={castingCallWords.lineHelper}
        value={call.line}
        onChangeText={(v) => {
          call.lineChanged(v);
          changed();
        }}
      />
      {call.also.length > 0 && (
        <View style={styles.also}>
          <Muted>{castingCallWords.alsoRecorded}</Muted>
          {call.also.map(([what, value], i) => (
            <View key={i} style={styles.alsoChip}>
              <Text style={styles.alsoText}>
                {what}: {value}
              </Text>
            </View>
          ))}
        </View>
      )}
      <Field
        label={castingCallWords.name}
        value={call.name}
        onChangeText={(v) => {
          call.name = v;
          changed();
        }}
      />
      {call.nameError && <Text style={styles.error}>{call.nameError}</Text>}
      <Field
        label={castingCallWords.epithet}
        placeholder={castingCallWords.epithetHint}
        value={call.epithet}
        onChangeText={(v) => {
          call.epithet = v;
          changed();
        }}
      />
      <Text style={styles.label}>{castingCallWords.roles.toUpperCase()}</Text>
      <View style={styles.chips}>
        {characterRoles.map((r) => (
          <Chip
            key={r}
            label={r}
            selected={call.roles.has(r)}
            onPress={() => {
              call.setRole(r, !call.roles.has(r));
              changed();
            }}
          />
        ))}
      </View>
      <Field
        label={castingCallWords.summary}
        placeholder={castingCallWords.summaryHint}
        value={call.summary}
        multiline
        onChangeText={(v) => {
          call.summary = v;
          changed();
        }}
      />
      <ChooserField
        label={castingCallWords.layout}
        value={call.templateId}
        choices={call.templates.map((t) => ({ value: t.id, label: t.name }))}
        helper={call.template.description}
        onChoose={(v) => {
          call.templateId = v;
          changed();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  preview: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    padding: space.md,
    marginBottom: space.md,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  face: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  monogram: { fontFamily: fonts.display, fontSize: 26, color: '#FFFFFF' },
  name: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  epithet: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.muted },
  roles: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.2, color: colors.gold },
  also: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', marginBottom: space.md },
  alsoChip: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.chip, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.sky },
  alsoText: { fontFamily: fonts.ui, fontSize: 13, color: colors.sky },
  error: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger, marginTop: -space.sm, marginBottom: space.sm },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
});
