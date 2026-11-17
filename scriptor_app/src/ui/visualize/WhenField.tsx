// A point in the story for the world views' forms (FEATURES.md #297, #299, #300): when it is not known, a chapter or
// scene, an event, or a date (year, month and day, or approximately); and the "as of" chooser (the end of the story,
// a chapter or an event). A port of flutter_app/lib/features/places/widgets/when_picker.dart.

import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { JsonMap } from '../../domain/json';
import type { StoryModel } from '../../domain/model/storyModel';
import { Anchor, EventAnchor, NodeAnchor } from '../../domain/model/validity';
import { anchorOfValue, whenItems } from '../../domain/progression/screens/tracker';
import { dateAnchor } from '../../domain/visualize/world/worldViews';
import { Chip } from '../kit';
import { ChooserField } from '../organize/parts';
import { colors, fonts, radius, space } from '../theme';

export function WhenField({
  model,
  label,
  value,
  onChange,
}: {
  model: StoryModel;
  label: string;
  value: JsonMap | null;
  onChange: (v: JsonMap | null) => void;
}) {
  const date = value?.['kind'] === 'date' ? ((value['when'] as JsonMap | undefined) ?? null) : null;
  const part = (key: string) => (typeof date?.[key] === 'number' ? `${date[key] as number}` : '');
  const [year, setYear] = useState(part('year'));
  const [month, setMonth] = useState(part('month'));
  const [day, setDay] = useState(part('day'));
  const approx = date?.['precision'] === 'approximate';
  const points = whenItems(model);
  const kind =
    value?.['kind'] === 'node' ? `n:${value['nodeId'] as string}` : value?.['kind'] === 'event' ? `e:${value['eventId'] as string}` : value?.['kind'] === 'date' ? 'date' : '';
  const known = kind === '' || kind === 'date' || points.some((p) => p.value === kind);
  const set = (y: string, m: string, d: string, a: boolean) => onChange(dateAnchor(y, m, d, a));
  return (
    <View style={styles.gap}>
      <ChooserField
        label={label}
        value={known ? kind : ''}
        choices={[{ value: '', label: 'When is not known' }, { value: 'date', label: 'On a date' }, ...points]}
        onChoose={(v) => {
          if (v === '') return onChange(null);
          if (v === 'date') {
            const y = year.trim().length === 0 ? '1' : year;
            setYear(y);
            return set(y, month, day, approx);
          }
          onChange(anchorOfValue(v));
        }}
      />
      {kind === 'date' && (
        <View style={styles.row}>
          {(
            [
              ['Year', year, setYear],
              ['Month', month, setMonth],
              ...(approx ? [] : [['Day', day, setDay]]),
            ] as [string, string, (v: string) => void][]
          ).map(([name, v, setV]) => (
            <TextInput
              key={name}
              value={v}
              onChangeText={(t) => {
                const clean = t.replace(/[^-\d]/g, '');
                setV(clean);
                set(name === 'Year' ? clean : year, name === 'Month' ? clean : month, name === 'Day' ? clean : day, approx);
              }}
              keyboardType="numbers-and-punctuation"
              placeholder={name}
              placeholderTextColor={colors.muted}
              accessibilityLabel={`${label}: ${name.toLowerCase()}`}
              style={styles.number}
            />
          ))}
          <Chip label="approximately" selected={approx} onPress={() => set(year, month, day, !approx)} />
        </View>
      )}
    </View>
  );
}

/** A point to look at the story from: the end of the story (null), a chapter or scene, or an event. */
export function AsOfField({
  model,
  label,
  value,
  onChange,
}: {
  model: StoryModel;
  label: string;
  value: Anchor | null;
  onChange: (v: Anchor | null) => void;
}) {
  const points = whenItems(model);
  const current = value instanceof NodeAnchor ? `n:${value.nodeId}` : value instanceof EventAnchor ? `e:${value.eventId}` : '';
  return (
    <ChooserField
      label={label}
      value={points.some((p) => p.value === current) ? current : ''}
      choices={[{ value: '', label: 'The end of the story' }, ...points]}
      onChoose={(v) => onChange(v === '' ? null : Anchor.fromJson(anchorOfValue(v)))}
    />
  );
}


const styles = StyleSheet.create({
  gap: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  number: {
    width: 90,
    minHeight: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
});
