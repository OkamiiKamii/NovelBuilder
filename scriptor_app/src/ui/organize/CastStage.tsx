// Above the cast (FEATURES.md #140–#142): with nobody yet, the PLAYBILL (the hero, who stands against them, who
// stands by them; "Raise the curtain" makes them all with their ties); with a small cast, the EMPTY CHAIRS round the
// lead (each a question, "Who taught Wren?", answered with a name that joins the cast already tied); and with a cast,
// the CAST PHOTOGRAPH (principals in front, the rest behind, with a caption; a face opens them). Ports of
// playbill.dart, empty_chairs.dart and cast_photo.dart; the logic is src/domain/characters/aids/*.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { castPhotoCaption, castPhotoRows, castPhotoStage, figureLabel } from '../../domain/characters/aids/castPhoto';
import { chairsFirstName, chairsFor, emptyChairsKey, emptyChairsWords } from '../../domain/characters/aids/emptyChairsStage';
import { curtainMessage, PlaybillState, playbillWords, raiseTheCurtain } from '../../domain/characters/aids/playbill';
import type { Listed } from '../../domain/characters/cast';
import { characterPath } from '../../domain/characters/screens/create';
import { isUploadedImage } from '../../domain/characters/screens/profile';
import { GoldButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { Cameo } from './Cameo';
import { NewCharacterSheet } from './NewCharacterSheet';
import type { OpenCast } from './useCast';
import { FocalImage } from './FocalImage';

export function CastStage({ open, onNew }: { open: OpenCast; onNew: () => void }) {
  const active = open.cast.list.filter((l) => !l.profile.archived);
  if (active.length === 0) return <Playbill open={open} onNew={onNew} />;
  return (
    <>
      <EmptyChairs open={open} active={active} />
      <CastPhoto active={active} />
    </>
  );
}

function Face({ l, width, height }: { l: Listed; width: number; height: number }) {
  if (isUploadedImage(l.entry.image)) {
    return <FocalImage uri={l.entry.image ?? ''} focal={l.profile.focal} style={{ width, height, borderRadius: 8 }} />;
  }
  return <Cameo entry={l.entry} profile={l.profile} width={width} height={height} bare />;
}

// ---------------------------------------------------------------------------------------------------- the playbill

function Playbill({ open, onNew }: { open: OpenCast; onNew: () => void }) {
  const toast = useToast();
  const [state] = useState(() => new PlaybillState());
  const [, tick] = useState(0);
  const changed = () => tick((t) => t + 1);
  const raise = () => {
    const made = open.now((c) => raiseTheCurtain(c, state.lines));
    const said = made === undefined ? null : curtainMessage(made);
    if (said) toast(said);
  };
  return (
    <Panel style={styles.playbill}>
      <Text style={styles.playbillTitle}>{playbillWords.title.toUpperCase()}</Text>
      <View style={styles.ornament}>
        <View style={styles.rule} />
        <View style={styles.diamond} />
        <View style={styles.rule} />
      </View>
      <Muted style={styles.center}>{playbillWords.intro}</Muted>
      {state.lines.map((_, i) => {
        const line = state.line(i);
        return (
          <View key={i} style={styles.line}>
            <Text style={styles.part}>{line.part}</Text>
            <View style={styles.flex}>
              <TextInput
                value={state.lines[i][1]}
                onChangeText={(v) => {
                  state.type(i, v);
                  changed();
                }}
                placeholder={line.hint}
                placeholderTextColor={colors.muted}
                selectionColor={colors.gold}
                style={styles.input}
                accessibilityLabel={line.label}
              />
              <Text style={styles.role}>{line.helper}</Text>
            </View>
          </View>
        );
      })}
      {state.canAdd && <OutlineButton label={playbillWords.add} icon="plus" compact tone="muted" onPress={() => { state.add(); changed(); }} style={styles.start} />}
      <Muted>{playbillWords.note}</Muted>
      <View style={styles.row}>
        <GoldButton label={playbillWords.raise} icon="drama-masks" disabled={!state.any} onPress={raise} />
        <OutlineButton label={playbillWords.create} icon="account-plus-outline" compact tone="muted" onPress={onNew} />
      </View>
    </Panel>
  );
}

// --------------------------------------------------------------------------------------------------- empty chairs

function EmptyChairs({ open, active }: { open: OpenCast; active: Listed[] }) {
  const lib = useLibrary();
  const router = useRouter();
  const [line, setLine] = useState<string | null>(null);
  const set = chairsFor(active, open.cast.model.relations.values(), lib.settings.read(emptyChairsKey(open.novelId)));
  if (!set) return null;
  const first = chairsFirstName(set.lead);
  const hide = () =>
    lib.saves.saveNow(`setting:${emptyChairsKey(open.novelId)}`, () => {
      lib.settings.write(emptyChairsKey(open.novelId), true);
      lib.novels.touchSettings();
    });
  return (
    <Panel style={styles.chairs}>
      <Text style={styles.heading}>{emptyChairsWords.heading(first)}</Text>
      <Muted>{emptyChairsWords.intro(first)}</Muted>
      <View style={styles.stageRow} accessibilityLabel={emptyChairsWords.label(first)}>
        <Pressable accessibilityRole="button" accessibilityLabel={set.lead.entry.name} onPress={() => router.navigate(characterPath(set.lead.entry.id))} style={styles.lead}>
          <Face l={set.lead} width={84} height={106} />
          <Text style={styles.leadName} numberOfLines={1}>
            {set.lead.entry.name}
          </Text>
        </Pressable>
        {set.chairs.map((c) => (
          <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={c.question} onPress={() => setLine(c.line)} style={({ pressed }) => [styles.chair, pressed && { borderColor: colors.gold }]}>
            <Text style={styles.chairText}>{c.question}</Text>
          </Pressable>
        ))}
      </View>
      <OutlineButton label={emptyChairsWords.hide} compact tone="muted" onPress={hide} style={styles.start} />
      {line !== null && <NewCharacterSheet visible line={line} onClose={() => setLine(null)} />}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------ the cast photo

function CastPhoto({ active }: { active: Listed[] }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const caption = castPhotoCaption(active);
  if (!caption) return null;
  const rows = castPhotoRows(active);
  const w = width - space.md * 2;
  const stage = castPhotoStage(rows, w);
  return (
    <View style={styles.photo}>
      <View style={{ width: w, height: stage.height }}>
        <Svg style={StyleSheet.absoluteFill} width={w} height={stage.height}>
          <Defs>
            <RadialGradient id="photoLight" cx="50%" cy="57.5%" r="75%">
              <Stop offset="0" stopColor={colors.gold} stopOpacity={0.16} />
              <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={w} height={stage.height} fill="url(#photoLight)" />
          <Rect x={0} y={stage.height - stage.edgeBottom - 1.5} width={w} height={1.5} fill={colors.border} />
          <Ellipse cx={w / 2} cy={stage.height - stage.edgeBottom} rx={w * 0.45} ry={4} fill={colors.gold} fillOpacity={0.05} />
        </Svg>
        {stage.figures.map((f) => (
          <Pressable
            key={f.listed.entry.id}
            accessibilityRole="button"
            accessibilityLabel={figureLabel(f.listed)}
            onPress={() => router.navigate(characterPath(f.listed.entry.id))}
            style={{ position: 'absolute', left: f.left, top: f.top, width: f.width, height: f.height }}
          >
            <Face l={f.listed} width={f.width} height={f.height} />
          </Pressable>
        ))}
      </View>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', marginTop: space.sm },
  start: { alignSelf: 'flex-start', marginTop: space.sm },
  playbill: { gap: space.sm, backgroundColor: '#15140F' },
  playbillTitle: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 3, color: colors.gold, textAlign: 'center' },
  ornament: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rule: { width: 44, height: 1, backgroundColor: colors.gold, opacity: 0.6 },
  diamond: { width: 6, height: 6, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }] },
  line: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  part: { width: 120, paddingTop: 12, fontFamily: fonts.bookItalic, fontSize: 15, color: colors.text, textAlign: 'right' },
  input: { minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.gold, color: colors.text, fontFamily: fonts.display, fontSize: 17 },
  role: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.2, color: colors.muted, marginTop: 2 },
  chairs: { gap: space.sm },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  stageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'center', marginTop: space.sm },
  lead: { alignItems: 'center', gap: 6 },
  leadName: { maxWidth: 104, fontFamily: fonts.display, fontSize: 13, color: colors.gold },
  chair: { width: 92, minHeight: 116, padding: space.sm, borderRadius: 46, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  chairText: { fontFamily: fonts.bookItalic, fontSize: 13, lineHeight: 18, color: colors.text, textAlign: 'center' },
  photo: { alignItems: 'center', gap: space.xs, marginBottom: space.sm },
  caption: { fontFamily: fonts.bookItalic, fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center', paddingHorizontal: space.md },
});

