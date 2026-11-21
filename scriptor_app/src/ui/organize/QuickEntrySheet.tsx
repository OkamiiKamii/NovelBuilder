// NEW ENTRY, in one step: the type (each in its colour), the name, and the few fields that type asks for up front
// (quickFields). "Save" makes the entry and opens it; "Save & add another" makes it and clears the sheet, keeping the
// type, so a run of species or items is typed without leaving. The rest of the fields are on the entry's page.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { localeCompare } from '../../domain/collation';
import { fieldValueSet } from '../../domain/codex/screens/entryPage';
import { kindColor, newEntryWith, quickFields, worldWords } from '../../domain/codex/screens/world';
import { abilityId } from '../../domain/model/entityRef';
import { StoryModel } from '../../domain/model/storyModel';
import { stableSorted } from '../../domain/reader/stableSort';
import type { Category, FieldDef } from '../../domain/records/category';
import type { Entry } from '../../domain/records/entry';
import { jobSystems, skillKindKey, untiedSkills } from '../../domain/systems/skillTies';
import { Sheet, useFocusOnShow } from '../dialogs';
import { Field, GoldButton, Icon, OutlineButton } from '../kit';
import { useSystems } from '../systems/useSystems';
import { colors, fonts, space } from '../theme';
import { ChooserField } from './parts';
import { manySystems, skillChoiceLabel, tieWords } from './skillTieWords';
import type { OpenCast } from './useCast';
import { TypedValue } from './WorldEntryScreen';

// Plain inputs keep every keystroke in this sheet's state. A date is one too: the entry page's date field saves 600 ms
// after typing stops, so a Save tapped sooner would miss it. Its calendar stays on the entry page.
const typed = (type: FieldDef['type']) =>
  type === null || type === 'text' || type === 'longtext' || type === 'number' || type === 'tags' || type === 'date';

export function QuickEntrySheet({ open, kinds, onClose, onSaved }: { open: OpenCast; kinds: readonly Category[]; onClose: () => void; onSaved: (entryId: string) => void }) {
  const { ref: focusRef, onShow: focusOnShow } = useFocusOnShow();
  const [added, setAdded] = useState('');
  const [key, setKey] = useState(kinds[0]?.key ?? '');
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState(false);
  const [round, setRound] = useState(0);
  const [tieTo, setTieTo] = useState('');
  const [alsoJob, setAlsoJob] = useState(false);
  const sys = useSystems();
  const sysModel = useMemo(() => (sys ? StoryModel.fromSnapshot(sys.snapshot) : null), [sys?.snapshot]); // eslint-disable-line react-hooks/exhaustive-deps
  const kind = kinds.find((k) => k.key === key) ?? kinds[0];
  if (!kind) return null;
  const fields = quickFields(kind);
  const set = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));
  // A Skill is tied to a skill of a system that is On, or made new (and, if wanted, added to The Job at once).
  const skills = sys && sysModel && kind.key === skillKindKey(kinds) ? untiedSkills(sysModel) : [];
  const job = sys && sysModel && kind.key === skillKindKey(kinds) ? jobSystems(sysModel)[0] : undefined;
  const tying = tieTo !== '' && skills.some((a) => abilityId(a.system.id, a.item.id) === tieTo);

  const save = (another: boolean) => {
    if (!tying && name.trim().length === 0) {
      setRefused(true);
      return;
    }
    // Tags are typed with commas and stored one per line.
    const stored = { ...values };
    for (const f of fields) if (f.type === 'tags' && stored[f.id]) stored[f.id] = stored[f.id]!.split(',').map((x) => x.trim()).filter(Boolean).join('\n');
    let made: Entry | undefined;
    if (tying) {
      // The entry takes the skill's name; what was typed in the fields goes through the codex path.
      made = sys!.now((c) => c.logInWorld(tieTo));
      if (made) for (const [defId, v] of Object.entries(stored)) if (v.trim().length > 0) open.now(fieldValueSet(made.id, defId, v));
    } else {
      made = open.now((c) => newEntryWith(c, kind.key, name.trim(), stored));
      if (made && job && alsoJob) sys!.now((c) => c.logInSystem(made!.id, job.id));
    }
    if (!made) return;
    if (!another) {
      onClose();
      onSaved(made.id);
      return;
    }
    // The toast host lives under a Modal, so the confirmation sits in the sheet.
    setAdded(`Added “${made.name}”.`);
    setName('');
    setTieTo('');
    setValues({});
    setRefused(false);
    setRound(round + 1);
  };

  return (
    <Sheet
      visible
      title={worldWords.newEntry}
      onClose={onClose}
      onShow={focusOnShow}
      footer={<GoldButton label="Save" icon="check" onPress={() => save(false)} style={styles.save} />}
    >
      <Text style={styles.label}>TYPE</Text>
      <View style={styles.types}>
        {kinds.map((k) => {
          const on = k.key === kind.key;
          const tone = kindColor(k);
          return (
            <Pressable
              key={k.key}
              accessibilityRole="button"
              accessibilityLabel={k.singular}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setKey(k.key);
                setValues({});
                setRound(round + 1);
              }}
              style={[styles.type, on ? { borderColor: tone, backgroundColor: colors.elevated } : styles.typeOff]}
            >
              <View style={[styles.dot, { backgroundColor: tone }]} />
              <Text style={[styles.typeText, on && { color: colors.text }]}>{k.singular}</Text>
            </Pressable>
          );
        })}
      </View>
      {skills.length > 0 && (
        <View style={styles.tieGap}>
          <ChooserField
            label={tieWords.panelTitle}
            value={tieTo}
            choices={[{ value: '', label: 'A new skill' }, ...skills.map((a) => ({ value: abilityId(a.system.id, a.item.id), label: skillChoiceLabel(a, manySystems(skills)) }))]}
            helper={tieWords.chooserHelper}
            onChoose={setTieTo}
          />
        </View>
      )}
      {!tying && (
        <Field
          ref={focusRef}
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setRefused(false);
            setAdded('');
          }}
          returnKeyType="done"
          hint={refused ? 'Give the entry a name first.' : added || undefined}
          style={refused ? styles.bad : undefined}
        />
      )}
      {!tying && job && (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={tieWords.alsoAdd(job.name)}
          accessibilityState={{ checked: alsoJob }}
          onPress={() => setAlsoJob(!alsoJob)}
          style={styles.toggle}
        >
          <Icon name={alsoJob ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={alsoJob ? colors.gold : colors.muted} />
          <Text style={styles.toggleText}>{tieWords.alsoAdd(job.name)}</Text>
        </Pressable>
      )}
      {fields.map((f) => {
        const label = f.required ? `${f.name} (required)` : f.name;
        const v = values[f.id] ?? '';
        return typed(f.type) ? (
          <Field
            key={`${round}${f.id}`}
            label={label}
            value={v}
            onChangeText={(t) => set(f.id, t)}
            keyboardType={f.type === 'number' ? 'numeric' : undefined}
            hint={f.type === 'tags' ? 'Comma separated' : f.type === 'date' ? 'yyyy-mm-dd' : undefined}
          />
        ) : (
          <TypedValue
            key={`${round}${f.id}`}
            label={label}
            type={f.type!}
            value={v}
            options={f.options}
            entries={stableSorted(
              open.cast.entries.filter((e) => f.target === null || e.category === f.target),
              (a, b) => localeCompare(a.name, b.name),
            )}
            onType={(t) => set(f.id, t)}
            onChoose={(t) => set(f.id, t)}
          />
        );
      })}
      <View style={styles.more}>
        <OutlineButton label="Save & add another" icon="plus" onPress={() => save(true)} style={styles.save} />
        <OutlineButton label="Cancel" tone="muted" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  save: { flex: 1 },
  more: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.2, color: colors.muted },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tieGap: { marginTop: space.md },
  type: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, borderRadius: 22, borderWidth: 1.5 },
  typeOff: { borderColor: colors.border },
  typeText: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted },
  dot: { width: 10, height: 10, borderRadius: 5 },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  toggleText: { flex: 1, fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  bad: { borderWidth: 1, borderColor: colors.danger },
});
