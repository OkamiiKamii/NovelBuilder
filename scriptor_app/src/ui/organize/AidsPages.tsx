// More writing aids (FEATURES.md #191–#193): "In their hand" (write as the character to a prompt from their ties and
// wants, kept as journal notes), Write them in (where a scene goes, who else, whose eyes, a spark; Start writing makes
// the chapter or scene with its plan and opens the editor; no prose is written for the author), and their card to
// share. Ports of journal_page.dart, write_them_in_page.dart and character_card_share.dart; the logic is
// src/domain/characters/aids/*.

import { useRouter } from 'expo-router';
import { type ComponentRef, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, type TextStyle, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { sharePicture } from '../../data/files';
import { isUploadedImage } from '../../domain/characters/screens/profile';
import {
  type CardLine,
  characterCardLayout,
  characterCardOf,
  characterCardPixelRatio,
  characterCardSize,
  characterCardWords,
  stampPerforations,
} from '../../domain/characters/aids/characterCard';
import { earlierPage, JournalState, journalPaper, journalPromptsFor, journalWords } from '../../domain/characters/aids/journalPage';
import { updatePlan, WriteThemInState, writeThemInDocuments, writeThemInView, writeThemInWords } from '../../domain/characters/aids/writeThemInPage';
import type { Entry } from '../../domain/records/entry';
import type { CharacterProfile } from '../../domain/characters/characterRecords';
import { lastNodeSetting } from '../write/WriteScreen';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Muted, OutlineButton } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { Cameo } from './Cameo';
import type { OpenCast } from './useCast';

// ---------------------------------------------------------------------------------------------------- in their hand

export function JournalSheet({ open, entry, onClose }: { open: OpenCast; entry: Entry; onClose: () => void }) {
  const lib = useLibrary();
  const prompts = useMemo(() => journalPromptsFor(open.cast, entry.id) ?? [], [open.cast, entry.id]);
  const [state] = useState(() => new JournalState(entry.id));
  const [, tick] = useState(0);
  const changed = () => tick((t) => t + 1);
  const notes = open.cast.notes(entry.id);
  const flush = () => lib.saves.flush();
  const type = (text: string) => {
    const w = state.typed(text, prompts);
    if (w?.kind === 'make') {
      const made = open.now(w.apply);
      if (made) state.kept(made.id);
    } else if (w?.kind === 'save') {
      open.later(w.key, (c) => {
        w.apply(c);
      });
    }
    changed();
  };
  if (prompts.length === 0) return null;
  return (
    <Sheet visible onClose={() => { flush(); onClose(); }} title={journalWords.title(entry.name)} wide>
      <Muted>{journalWords.intro(entry.name)}</Muted>
      <View style={styles.paper}>
        <Text style={styles.prompt}>{state.promptNow(prompts)}</Text>
        <View style={styles.writing}>
          <View style={styles.marginRule} />
          <TextInput
            value={state.text}
            onChangeText={type}
            placeholder={journalWords.hint}
            placeholderTextColor={journalPaper.hintInk}
            multiline
            style={styles.paperText}
            accessibilityLabel={state.promptNow(prompts)}
          />
        </View>
      </View>
      <Muted>{state.footer(entry.name)}</Muted>
      <OutlineButton
        label={state.turnLabel}
        icon="autorenew"
        compact
        onPress={() => {
          flush();
          state.turn(prompts.length);
          changed();
        }}
        style={styles.start}
      />
      {state.earlier(notes).length > 0 && <Text style={styles.label}>{journalWords.earlier}</Text>}
      {state.earlier(notes).map((p) => {
        const e = earlierPage(p);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => {
              flush();
              state.open(p);
              changed();
            }}
            style={({ pressed }) => [styles.earlier, pressed && { backgroundColor: colors.elevated }]}
          >
            <Muted>
              {e.when} · {e.prompt}
            </Muted>
            <Text style={styles.earlierText} numberOfLines={2}>
              {e.text}
            </Text>
          </Pressable>
        );
      })}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------------- write them in

export function WriteThemInSheet({ open, entry, onClose }: { open: OpenCast; entry: Entry; onClose: () => void }) {
  const lib = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const view = useMemo(() => writeThemInView(open.cast, entry.id), [open.cast, entry.id]);
  const [state] = useState(() => new WriteThemInState());
  const [, tick] = useState(0);
  const changed = () => tick((t) => t + 1);
  if (!view) return null;
  const start = () => {
    try {
      const s = state.start(view, writeThemInDocuments(open.cast));
      const nodeId = s.create ? lib.manuscript.create(open.novelId, s.create.kind, s.create.parentId).id : s.nodeId;
      if (!nodeId) return;
      open.now((c) => updatePlan(c, nodeId, s.edit));
      lib.saves.saveNow(`setting:${lastNodeSetting(open.novelId)}`, () => lib.settings.write(lastNodeSetting(open.novelId), nodeId));
      onClose();
      router.navigate('/write');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
    }
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title={writeThemInWords.title(view.name)}
      footer={<GoldButton label={writeThemInWords.start} icon="feather" disabled={!state.ready(view.sparks.length)} onPress={start} style={styles.flex} />}
    >
      <Muted>{writeThemInWords.intro(view.name)}</Muted>
      <Text style={styles.label}>{writeThemInWords.where}</Text>
      {view.places.map((p, i) => (
        <Chip key={i} label={p.label} selected={state.place === i} onPress={() => { state.place = i; changed(); }} />
      ))}
      <Text style={styles.label}>{writeThemInWords.who}</Text>
      {view.others.length === 0 ? (
        <Muted>{writeThemInWords.alone(view.name)}</Muted>
      ) : (
        <View style={styles.row}>
          {view.others.map((o) => (
            <Chip key={o.id} label={o.label} selected={state.with.has(o.id)} onPress={() => { state.toggle(o.id, !state.with.has(o.id)); changed(); }} />
          ))}
        </View>
      )}
      <View style={styles.toggle}>
        <Text style={[styles.text, styles.flex]}>{writeThemInWords.eyes(view.name)}</Text>
        <Switch value={state.eyes} onValueChange={(v) => { state.eyes = v; changed(); }} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.text} />
      </View>
      <Text style={styles.label}>{writeThemInWords.spark}</Text>
      {view.sparks.map((s, i) => (
        <Pressable key={i} accessibilityRole="radio" accessibilityState={{ checked: state.spark === i }} onPress={() => { state.spark = i; changed(); }} style={[styles.spark, state.spark === i && styles.sparkOn]}>
          <Text style={styles.sparkFrom}>{s.from}</Text>
          <Text style={styles.sparkText}>{s.text}</Text>
        </Pressable>
      ))}
      <TextInput
        value={state.own}
        onChangeText={(v) => { state.typeOwn(v, view.sparks.length); changed(); }}
        onFocus={() => { state.typeOwn(state.own, view.sparks.length); changed(); }}
        placeholder={writeThemInWords.own}
        placeholderTextColor={colors.muted}
        style={[styles.own, state.spark === view.sparks.length && { borderColor: colors.gold }]}
        multiline
      />
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------------- their card

/** Scriptor's own name on the card's foot (the Flutter app's cards say NOVEL BUILDER). */
const brand = 'SCRIPTOR';

export function CharacterCardSheet({ open, entry, profile, line, onClose }: { open: OpenCast; entry: Entry; profile: CharacterProfile | null; line: string | null; onClose: () => void }) {
  const [withLine, setWithLine] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const card = useRef<ComponentRef<typeof View>>(null);
  const of = characterCardOf(open.cast, entry.id);
  if (!of) return null;
  const layout = characterCardLayout({ card: of.card, book: of.book, tone: of.tone, line, withLine });
  const share = async () => {
    if (!card.current) return;
    setWorking(true);
    setMessage(null);
    try {
      const uri = await captureRef(card.current, {
        format: 'png',
        result: 'tmpfile',
        width: characterCardSize.width * characterCardPixelRatio,
        height: characterCardSize.height * characterCardPixelRatio,
      });
      await sharePicture(uri, characterCardWords.title(entry.name));
    } catch (e) {
      setMessage(characterCardWords.failed(e instanceof Error ? e.message : String(e)));
    } finally {
      setWorking(false);
    }
  };
  const scale = 300 / characterCardSize.width;
  const perf = stampPerforations(layout.stamp.size);
  const s = layout.stamp;
  return (
    <Sheet
      visible
      onClose={onClose}
      title={characterCardWords.title(entry.name)}
      footer={
        <>
          <OutlineButton label={characterCardWords.close} onPress={onClose} tone="muted" style={styles.flex} />
          <GoldButton label={characterCardWords.share} icon="share-variant" disabled={working} onPress={() => void share()} style={styles.flex} />
        </>
      }
    >
      <View style={{ width: characterCardSize.width * scale, height: characterCardSize.height * scale, alignSelf: 'center', borderRadius: 10, overflow: 'hidden' }}>
        <View style={{ transform: [{ scale }], transformOrigin: 'top left' }}>
          <View ref={card} collapsable={false} style={[styles.card, { width: characterCardSize.width, height: characterCardSize.height }]}>
            <Svg style={StyleSheet.absoluteFill} width={characterCardSize.width} height={characterCardSize.height}>
              <Defs>
                <LinearGradient id="cardGround" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={layout.ground[0]} />
                  <Stop offset="1" stopColor={layout.ground[1]} />
                </LinearGradient>
              </Defs>
              <Rect width={characterCardSize.width} height={characterCardSize.height} fill="url(#cardGround)" />
              {[layout.outerRule, layout.innerRule].map((r, i) => (
                <Rect key={i} x={r.inset} y={r.inset} width={characterCardSize.width - 2 * r.inset} height={characterCardSize.height - 2 * r.inset} fill="none" stroke={r.color} strokeWidth={r.width} />
              ))}
            </Svg>
            <View style={{ flex: 1, paddingLeft: 10 + layout.padding.left, paddingRight: 10 + layout.padding.right, paddingTop: 10 + layout.padding.top, paddingBottom: 10 + layout.padding.bottom, alignItems: 'center' }}>
              <CardText line={layout.book} />
              <View style={{ height: 12 }} />
              <View style={{ width: s.size, height: s.size, transform: [{ rotate: `${s.tilt}rad` }] }}>
                <Svg style={StyleSheet.absoluteFill} width={s.size} height={s.size}>
                  <Rect width={s.size} height={s.size} fill={s.paper} />
                  {perf.holes.map((h, i) => (
                    <Circle key={i} cx={h.x} cy={h.y} r={perf.radius} fill={layout.ground[0]} />
                  ))}
                  <Rect x={s.inset} y={s.inset} width={s.size - 2 * s.inset} height={s.size - 2 * s.inset} fill="none" stroke={s.frame} strokeWidth={s.frameWidth} />
                </Svg>
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                  <View style={{ width: s.size - 2 * s.inset - 4, height: s.size - 2 * s.inset - 4, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                    {isUploadedImage(entry.image) ? (
                      <Image source={{ uri: entry.image ?? undefined }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <Cameo entry={entry} profile={profile} width={s.size - 2 * s.inset - 4} height={s.size - 2 * s.inset - 4} />
                    )}
                  </View>
                </View>
              </View>
              <View style={{ height: 12 }} />
              <CardText line={layout.name} />
              {layout.epithet && <CardText line={layout.epithet} />}
              {layout.what && (
                <>
                  <View style={{ height: 6 }} />
                  <CardText line={layout.what} />
                </>
              )}
              <View style={styles.ruleRow}>
                <View style={{ width: layout.rule.length, height: layout.rule.thickness, backgroundColor: layout.rule.lineColor }} />
                <View style={{ width: layout.rule.diamond, height: layout.rule.diamond, backgroundColor: layout.rule.color, transform: [{ rotate: '45deg' }], marginHorizontal: layout.rule.gap }} />
                <View style={{ width: layout.rule.length, height: layout.rule.thickness, backgroundColor: layout.rule.lineColor }} />
              </View>
              {layout.facts && <CardText line={layout.facts} />}
              {layout.ties && (
                <>
                  <View style={{ height: 4 }} />
                  <CardText line={layout.ties} />
                </>
              )}
              <View style={styles.flex} />
              {layout.words && <CardText line={layout.words} />}
              <View style={styles.flex} />
              <CardText line={{ ...layout.brand, text: brand }} />
            </View>
          </View>
        </View>
      </View>
      <View style={styles.toggle}>
        <View style={styles.flex}>
          <Text style={styles.text}>{characterCardWords.withLine}</Text>
          <Muted>{characterCardWords.withLineNote}</Muted>
        </View>
        <Switch value={withLine} onValueChange={setWithLine} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.text} accessibilityLabel={characterCardWords.withLine} />
      </View>
      {message && <Muted>{message}</Muted>}
    </Sheet>
  );
}

function CardText({ line }: { line: CardLine }) {
  const style: TextStyle = {
    fontFamily: line.face === 'heading' ? fonts.display : line.italic ? fonts.bookItalic : fonts.book,
    fontSize: line.size,
    lineHeight: line.size * 1.3,
    color: line.color,
    fontWeight: line.weight === 400 ? '400' : line.weight === 600 ? '600' : '700',
    letterSpacing: line.letterSpacing,
    textAlign: 'center',
  };
  return (
    <Text style={style} numberOfLines={line.maxLines ?? undefined}>
      {line.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start', marginVertical: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold, marginTop: space.md, marginBottom: space.xs },
  text: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  paper: { marginVertical: space.md, padding: 18, borderRadius: 6, backgroundColor: journalPaper.paper, elevation: 6 },
  prompt: { fontFamily: fonts.bookItalic, fontSize: 17, lineHeight: 23, color: journalPaper.promptInk, marginBottom: space.sm },
  writing: { position: 'relative' },
  marginRule: { position: 'absolute', left: 42, top: 0, bottom: 0, width: 1.2, backgroundColor: journalPaper.margin },
  paperText: { minHeight: 12 * 30.4, paddingLeft: 52, paddingRight: 18, paddingTop: 12, fontFamily: fonts.bookItalic, fontSize: 19, lineHeight: 30.4, color: journalPaper.ink, textAlignVertical: 'top' },
  earlier: { paddingVertical: space.sm, paddingHorizontal: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: radius.field },
  earlierText: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.text },
  spark: { padding: space.sm, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, marginBottom: space.xs },
  sparkOn: { borderColor: colors.gold, backgroundColor: '#1F1A0D' },
  sparkFrom: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1, color: colors.muted },
  sparkText: { fontFamily: fonts.book, fontSize: 15, lineHeight: 22, color: colors.text },
  own: { minHeight: 60, padding: space.md, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, color: colors.text, fontFamily: fonts.book, fontSize: 15, textAlignVertical: 'top' },
  card: { overflow: 'hidden' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
});

