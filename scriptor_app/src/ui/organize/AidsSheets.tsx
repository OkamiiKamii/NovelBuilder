// The character writing aids that open over a profile (FEATURES.md #189, #190, #170, #151): the Interview (questions
// asked by name, as a conversation, each answer saved into the right field), This or that (a deck of temperament
// cards ending in their compass), Draw their face, and the Name forge. Ports of interview.dart, this_or_that.dart,
// face_sketch.dart and name_forge.dart; their logic is src/domain/characters/aids/*.

import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import type { CharacterProfile } from '../../domain/characters/characterRecords';
import { FaceSketchState, faceWords } from '../../domain/characters/aids/faceSketch';
import { InterviewTalk, interviewWords, saveInterviewAnswer } from '../../domain/characters/aids/interview';
import { NameForgeState, nameForgeWords } from '../../domain/characters/aids/nameForgeSheet';
import { swipeSide, ThisOrThatDeck, thisOrThatWords } from '../../domain/characters/aids/thisOrThatDeck';
import type { Entry } from '../../domain/records/entry';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Muted, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { Cameo } from './Cameo';
import type { OpenCast } from './useCast';

// --------------------------------------------------------------------------------------------------- the interview

export function InterviewSheet({ open, entry, profile, onClose }: { open: OpenCast; entry: Entry; profile: CharacterProfile; onClose: () => void }) {
  const [talk] = useState(() => InterviewTalk.open(entry, profile, open.cast.templates));
  const [typed, setTyped] = useState('');
  const [, tick] = useState(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const step = talk.step;
  const go = (keep: boolean) => {
    talk.next(keep, typed, (s, value) => {
      open.now((c) => saveInterviewAnswer(c, entry.id, s, value));
    });
    setTyped('');
    tick((t) => t + 1);
    if (talk.closed) onClose();
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };
  const button = talk.nextButton(typed);
  const progress = talk.progress;
  return (
    <Sheet visible onClose={onClose} title={talk.title}>
      <Muted>{talk.gauge}</Muted>
      <View style={styles.marks} accessibilityLabel={progress.label}>
        {progress.marks.map((m, i) => (
          <View key={i} style={[styles.mark, m === 'done' && { backgroundColor: colors.sky }, m === 'now' && { backgroundColor: colors.gold }]} />
        ))}
      </View>
      {step === null ? (
        <Muted>Every question already has an answer in {talk.name}’s profile.</Muted>
      ) : (
        <ScrollView ref={scroll} style={styles.talk} nestedScrollEnabled>
          {talk.said.map((x, i) => (
            <View key={i} style={styles.exchange}>
              <View style={styles.ask}>
                <Text style={styles.askText}>{x.ask}</Text>
              </View>
              {x.reply === null ? (
                <Text style={styles.passed}>{interviewWords.passedOver}</Text>
              ) : (
                <View style={styles.reply}>
                  <Text style={styles.replyText}>{x.reply}</Text>
                  <Text style={styles.went}>{interviewWords.wentInto(x.fieldName)}</Text>
                </View>
              )}
            </View>
          ))}
          <View style={styles.ask}>
            <Text style={styles.askText}>{step.ask}</Text>
          </View>
          <Text style={styles.went}>{interviewWords.goesInto(step.fieldName)}</Text>
        </ScrollView>
      )}
      {step && (
        <>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={talk.hint}
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            multiline
            style={styles.answer}
            accessibilityLabel={interviewWords.answer}
          />
          <View style={styles.row}>
            <OutlineButton label={interviewWords.skip} compact tone="muted" onPress={() => go(false)} />
            <GoldButton label={button.label} icon={button.icon === 'send' ? 'send' : 'check'} compact disabled={!button.enabled} onPress={() => go(true)} />
          </View>
          {talk.savedNote && <Muted>{talk.savedNote}</Muted>}
        </>
      )}
      <OutlineButton label={interviewWords.done} compact tone="muted" onPress={onClose} style={styles.start} />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------------- this or that

export function ThisOrThatSheet({ open, entry, onClose }: { open: OpenCast; entry: Entry; onClose: () => void }) {
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [deck] = useState(() => ThisOrThatDeck.of(entry));
  const [, tick] = useState(0);
  const changed = () => tick((t) => t + 1);
  const dx = useRef(new Animated.Value(0)).current;
  const choose = (side: number) => {
    deck.choose(side);
    dx.setValue(0);
    changed();
  };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx }], { useNativeDriver: false }),
      onPanResponderRelease: (_e, g) => {
        const side = swipeSide(g.dx, g.vx * 1000, width);
        if (side === null) Animated.spring(dx, { toValue: 0, useNativeDriver: false }).start();
        else {
          Animated.timing(dx, { toValue: side * width * 1.2, duration: 220, useNativeDriver: false }).start(() => choose(side));
        }
      },
    }),
  ).current;
  const keep = () => {
    if (open.now((c) => deck.keep(c)) !== undefined) {
      toast(deck.keptMessage);
      onClose();
    }
  };
  return (
    <Sheet visible onClose={onClose} title={thisOrThatWords.title}>
      {!deck.done && deck.axis ? (
        <>
          <Muted>{deck.count}</Muted>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(deck.progress * 100)}%` }]} />
          </View>
          <Text style={styles.question}>{deck.question}</Text>
          <Animated.View
            {...pan.panHandlers}
            style={[styles.deckCard, { transform: [{ translateX: dx }, { rotate: dx.interpolate({ inputRange: [-width, width], outputRange: ['-0.12rad', '0.12rad'] }) }] }]}
          >
            {deck.halves.map((h, i) => (
              <Pressable key={h.side} accessibilityRole="button" accessibilityLabel={h.label} accessibilityState={{ selected: h.on }} onPress={() => choose(h.side)} style={[styles.half, h.on && styles.halfOn, i === 0 && styles.halfFirst]}>
                <Text style={[styles.halfText, h.on && { color: colors.onGold }]}>{h.word}</Text>
              </Pressable>
            ))}
          </Animated.View>
          <Muted style={styles.center}>{thisOrThatWords.swipe}</Muted>
          <View style={styles.row}>
            {deck.canGoBack && (
              <OutlineButton
                label={thisOrThatWords.back}
                icon="arrow-left"
                compact
                tone="muted"
                onPress={() => {
                  deck.back();
                  changed();
                }}
              />
            )}
            <OutlineButton
              label={deck.passLabel}
              compact
              tone="muted"
              onPress={() => {
                deck.skip();
                changed();
              }}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.question}>{deck.compassTitle}</Text>
          <Muted>{thisOrThatWords.compassNote}</Muted>
          {deck.compass.map((c) => (
            <View key={c.axis.id} style={styles.axis} accessible accessibilityLabel={c.label}>
              <Text style={[styles.axisWord, c.side !== null && c.side < 0 && { color: colors.gold }]}>{c.axis.left}</Text>
              <View style={styles.axisLine}>
                <View style={styles.axisRule} />
                {c.side === null ? (
                  <View style={[styles.axisDot, { left: '50%' }]} />
                ) : (
                  <View style={[styles.axisMark, { left: `${c.mark.at * 100}%` }]} />
                )}
              </View>
              <Text style={[styles.axisWord, styles.right, c.side !== null && c.side > 0 && { color: colors.gold }]}>{c.axis.right}</Text>
            </View>
          ))}
          <View style={styles.row}>
            <OutlineButton
              label={thisOrThatWords.backToDeck}
              compact
              tone="muted"
              onPress={() => {
                deck.restart();
                changed();
              }}
            />
            <GoldButton label={thisOrThatWords.keep} compact disabled={!deck.changed} onPress={keep} />
          </View>
        </>
      )}
    </Sheet>
  );
}

// ----------------------------------------------------------------------------------------------- draw their face

export function FaceSketchSheet({ open, entry, profile, onClose }: { open: OpenCast; entry: Entry; profile: CharacterProfile; onClose: () => void }) {
  const toast = useToast();
  const [state] = useState(() => FaceSketchState.of(entry, profile));
  const [, tick] = useState(0);
  const changed = () => tick((t) => t + 1);
  const keep = () => {
    if (open.now((c) => state.keep(c)) !== undefined) {
      toast(state.keptMessage);
      onClose();
    }
  };
  const swatches = (list: { key: string; label: string; colour: string; on: boolean }[], press: (key: string) => void) => (
    <View style={styles.swatches}>
      {list.map((s) => (
        <Pressable key={s.key} accessibilityRole="radio" accessibilityState={{ checked: s.on }} accessibilityLabel={s.label} onPress={() => { press(s.key); changed(); }} style={[styles.swatch, s.on && styles.swatchOn]}>
          <View style={[styles.swatchColour, { backgroundColor: s.colour }]} />
          <Text style={styles.swatchText}>{s.label}</Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <Sheet
      visible
      onClose={onClose}
      title={faceWords.title}
      footer={
        <>
          <OutlineButton label={faceWords.cancel} onPress={onClose} tone="muted" style={styles.flex} />
          <GoldButton label={faceWords.keep} onPress={keep} disabled={!state.changed} style={styles.flex} />
        </>
      }
    >
      <View style={styles.faceBox}>
        <View style={styles.faceFrame}>
          <Cameo entry={entry} profile={profile} look={state.look} width={104} height={128} />
        </View>
      </View>
      <Muted>{faceWords.intro(entry.name)}</Muted>
      <Text style={styles.label}>{faceWords.hair}</Text>
      {swatches(state.hairSwatches(), (k) => state.pressHair(k))}
      <View style={styles.row}>
        {state.cuts().map((c) => (
          <Chip key={c.cut} label={c.label} selected={c.on} onPress={() => { state.pressCut(c.cut); changed(); }} />
        ))}
        <Chip label={faceWords.curly} selected={state.look.likeness.curly} onPress={() => { state.setCurly(!state.look.likeness.curly); changed(); }} />
      </View>
      <Text style={styles.label}>{faceWords.eyes}</Text>
      {swatches(state.eyeSwatches(), (k) => state.pressEyes(k))}
      <Text style={styles.label}>{faceWords.skin}</Text>
      {swatches(state.skinSwatches(), (k) => {
        const sw = state.skinSwatches().find((x) => x.key === k);
        if (sw?.creature) state.pressCreatureSkin(k);
        else state.pressSkin(k as never);
      })}
      <Text style={styles.label}>{faceWords.marks}</Text>
      <View style={styles.row}>
        {state.marks().map((m) => (
          <Chip key={m.key} label={m.label} selected={m.on} onPress={() => { if (!m.written) { state.setMark(m.key, !m.on); changed(); } }} />
        ))}
      </View>
    </Sheet>
  );
}

// -------------------------------------------------------------------------------------------------- the name forge

/** Names to choose from; a name pressed goes to `onPick` (nothing in the novel changes). */
export function NameForgeSheet({ open, place = false, onPick, onClose }: { open: OpenCast; place?: boolean; onPick: (name: string) => void; onClose: () => void }) {
  const [state] = useState(
    () =>
      new NameForgeState({
        people: open.cast.characters().map((e) => e.name),
        places: open.cast.entries.filter((e) => e.category === 'location').map((e) => e.name),
        place,
        nowMs: Date.now(),
      }),
  );
  const [, tick] = useState(0);
  const changed = () => tick((t) => t + 1);
  useEffect(changed, []);
  return (
    <Sheet visible onClose={onClose} title={nameForgeWords.title}>
      <View style={styles.row}>
        {state.chips().map((c) => (
          <Chip key={c.key} label={c.label} selected={c.selected} onPress={() => { if (c.enabled) { state.chooseFlavour(c.key); changed(); } }} />
        ))}
      </View>
      <View style={styles.row}>
        <Chip label={nameForgeWords.person} selected={!state.place} onPress={() => { state.choosePlace(false); changed(); }} />
        <Chip label={nameForgeWords.place} selected={state.place} onPress={() => { state.choosePlace(true); changed(); }} />
      </View>
      <TextInput
        value={state.start}
        onChangeText={(v) => {
          state.typeStart(v);
          changed();
        }}
        placeholder={nameForgeWords.startsWith}
        placeholderTextColor={colors.muted}
        style={styles.startInput}
        autoCapitalize="characters"
        maxLength={3}
        accessibilityLabel={nameForgeWords.startsWith}
      />
      <View style={styles.names}>
        {state.names().map((n) => (
          <Pressable key={n} accessibilityRole="button" onPress={() => onPick(n)} style={({ pressed }) => [styles.name, pressed && { backgroundColor: colors.elevated }]}>
            <Text style={styles.nameText}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <OutlineButton label={nameForgeWords.more} icon="refresh" compact onPress={() => { state.more(); changed(); }} style={styles.start} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', marginVertical: space.xs },
  start: { alignSelf: 'flex-start', marginTop: space.sm },
  center: { textAlign: 'center' },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold, marginTop: space.md },
  marks: { flexDirection: 'row', gap: 3, marginVertical: space.sm },
  mark: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  talk: { maxHeight: 320 },
  exchange: { gap: 4, marginBottom: space.sm },
  ask: { alignSelf: 'flex-start', maxWidth: '85%', padding: space.sm, borderRadius: radius.panel, backgroundColor: colors.elevated },
  askText: { fontFamily: fonts.book, fontSize: 15, lineHeight: 22, color: colors.text },
  reply: { alignSelf: 'flex-end', maxWidth: '85%', padding: space.sm, borderRadius: radius.panel, backgroundColor: '#3A2A08' },
  replyText: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 22, color: colors.text },
  went: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 2 },
  passed: { alignSelf: 'flex-end', fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  answer: { minHeight: 80, marginTop: space.sm, padding: space.md, borderRadius: radius.field, backgroundColor: colors.elevated, color: colors.text, fontFamily: fonts.book, fontSize: 16, textAlignVertical: 'top' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginVertical: space.sm, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.gold },
  question: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textAlign: 'center', marginVertical: space.md },
  deckCard: { flexDirection: 'row', minHeight: 180, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.surface, overflow: 'hidden' },
  half: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  halfFirst: { borderRightWidth: 1, borderRightColor: colors.border },
  halfOn: { backgroundColor: colors.gold },
  halfText: { fontFamily: fonts.display, fontSize: 24, color: colors.text, textAlign: 'center' },
  axis: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  axisWord: { width: 90, fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  right: { textAlign: 'right' },
  axisLine: { flex: 1, height: 16, justifyContent: 'center' },
  axisRule: { height: 2, backgroundColor: colors.border },
  axisDot: { position: 'absolute', width: 5, height: 5, marginLeft: -2.5, borderRadius: 2.5, backgroundColor: colors.muted },
  axisMark: { position: 'absolute', width: 14, height: 14, marginLeft: -7, borderRadius: 7, backgroundColor: colors.gold },
  faceBox: { alignItems: 'center', marginBottom: space.sm },
  faceFrame: { borderRadius: 14, overflow: 'hidden' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: space.sm, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  swatchOn: { borderColor: colors.gold, borderWidth: 2 },
  swatchColour: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
  swatchText: { fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  startInput: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.field, backgroundColor: colors.elevated, color: colors.text, fontFamily: fonts.ui, fontSize: 15, marginVertical: space.sm },
  names: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  name: { minWidth: '30%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border },
  nameText: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
});
