// The writing desk's quieter tools (FEATURES.md #102 the margin, #107 rhythm, #108 time-lapse, #113 nudges, #114 the
// first page, #116 a note for next time). All read only, except that a note is kept (on this device) when pinned.

import { useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatNumber, plural } from '../../domain/desk/format';
import { type FirstPageView, type MarginCard, nextNoteMaxLength, nextNoteSheet, canPinNote } from '../../domain/desk/pageAround';
import { type Nudge } from '../../domain/desk/nudges';
import { type LapseFrame } from '../../domain/manuscript/timeLapse';
import { type RhythmReport, type RhythmSentence, sameBeatRun } from '../../domain/text/rhythm';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';

// ------------------------------------------------------------------------------------------------------ the margin

/** THE MARGIN (#102): index cards beside the page (a sheet on a phone). */
export function MarginCards({ cards, onPlan }: { cards: MarginCard[]; onPlan: () => void }) {
  return (
    <View style={styles.cards}>
      {cards.map((c) => (
        <View key={c.card} style={styles.indexCard}>
          <Text style={styles.cardTitle}>{c.title.toUpperCase()}</Text>
          {c.card === 'lastTime' && (
            <>
              <Text style={styles.cardSub}>{c.subtitle}</Text>
              <Text style={styles.cardText}>{c.text}</Text>
            </>
          )}
          {c.card === 'noPlan' && (
            <>
              <Text style={styles.cardText}>{c.text}</Text>
              <OutlineButton label={c.action} icon="map-outline" compact onPress={onPlan} style={styles.cardButton} />
            </>
          )}
          {c.card === 'thisChapter' && (
            <>
              {c.summary ? <Text style={styles.cardText}>{c.summary}</Text> : null}
              {c.objective ? (
                <Text style={styles.cardText}>
                  <Text style={styles.cardLabel}>Goal </Text>
                  {c.objective}
                </Text>
              ) : null}
            </>
          )}
          {c.card === 'beats' &&
            c.beats.map((b) => (
              <Text key={b.number} style={styles.cardText}>
                <Text style={styles.cardLabel}>{b.number}. </Text>
                {b.text}
              </Text>
            ))}
          {c.card === 'onThePage' && (
            <>
              {c.people.map((p) => (
                <Text key={p.id} style={styles.cardText}>
                  {p.name || 'Unnamed'}
                  {p.pov ? <Text style={styles.cardLabel}> · Point of view</Text> : null}
                </Text>
              ))}
              {c.mentioned ? <Text style={styles.cardMuted}>{c.mentioned}</Text> : null}
            </>
          )}
          {c.card === 'threads' &&
            c.threads.map((t) => (
              <View key={`${t.id}:${t.development}`} style={styles.thread}>
                <Text style={styles.cardText}>{t.title}</Text>
                {t.development ? <Text style={styles.cardMuted}>{t.development}</Text> : null}
              </View>
            ))}
        </View>
      ))}
    </View>
  );
}

// --------------------------------------------------------------------------------------------------- the first page

/** THE FIRST PAGE (#114): over an empty chapter, where the story stands and what the chapter is for, and three ways
 * in. It goes with the first word. */
export function FirstPage({ view, onPlan }: { view: FirstPageView; onPlan: () => void }) {
  const [way, setWay] = useState<number | null>(null);
  return (
    <ScrollView style={styles.firstPage} contentContainerStyle={styles.firstPageBody} keyboardShouldPersistTaps="handled">
      <Text style={styles.firstIntro}>{view.intro}</Text>
      {view.before && (
        <View style={styles.firstBlock}>
          <Text style={styles.cardTitle}>{view.before.heading.toUpperCase()}</Text>
          <Text style={styles.cardSub}>{view.before.ends}</Text>
          <Text style={styles.cardText} numberOfLines={5}>
            {view.before.text}
          </Text>
        </View>
      )}
      {view.purpose ? (
        <View style={styles.firstBlock}>
          <Text style={styles.cardTitle}>THIS CHAPTER IS FOR</Text>
          <Text style={styles.cardText}>{view.purpose}</Text>
        </View>
      ) : null}
      {view.beats.length > 0 && (
        <View style={styles.firstBlock}>
          <Text style={styles.cardTitle}>PLANNED</Text>
          {view.beats.map((b) => (
            <Text key={b.number} style={styles.cardText}>
              <Text style={styles.cardLabel}>{b.number} </Text>
              {b.text}
            </Text>
          ))}
        </View>
      )}
      {view.onThePage && (
        <View style={styles.firstBlock}>
          <Text style={styles.cardTitle}>ON THE PAGE</Text>
          <Text style={styles.cardText}>{view.onThePage}</Text>
        </View>
      )}
      {view.movingHere.length > 0 && (
        <View style={styles.firstBlock}>
          <Text style={styles.cardTitle}>MOVING HERE</Text>
          {view.movingHere.map((m) => (
            <Text key={m} style={styles.cardText}>
              {m}
            </Text>
          ))}
        </View>
      )}
      {view.offerPlan && (
        <View style={styles.firstBlock}>
          <Text style={styles.cardMuted}>No plan for it yet.</Text>
          <OutlineButton label="Plan this chapter" icon="map-outline" compact onPress={onPlan} style={styles.cardButton} />
        </View>
      )}
      <Text style={[styles.cardTitle, styles.waysTitle]}>A WAY IN</Text>
      <View style={styles.chips}>
        {view.waysIn.map((w, i) => (
          <Chip key={w.label} label={w.label} selected={way === i} onPress={() => setWay(way === i ? null : i)} />
        ))}
      </View>
      {way !== null && <Text style={styles.wayPrompt}>{view.waysIn[way].prompt}</Text>}
      <Muted style={styles.firstFooter}>{view.footer}</Muted>
    </ScrollView>
  );
}

// -------------------------------------------------------------------------------------------------- note for next time

/** A NOTE FOR NEXT TIME (#116): one line pinned to the chapter, with starter phrases. */
export function NextNoteSheet({
  visible,
  title,
  leaving,
  initial,
  onPin,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  leaving: boolean;
  initial: string;
  onPin: (text: string) => void;
  onDismiss: () => void;
}) {
  const words = nextNoteSheet(title, leaving);
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);
  return (
    <Sheet
      visible={visible}
      onClose={onDismiss}
      title={words.heading}
      footer={
        <>
          <OutlineButton label={words.dismiss} onPress={onDismiss} tone="muted" style={styles.flex} />
          <GoldButton label={words.pin} icon="pin-outline" onPress={() => onPin(text)} disabled={!canPinNote(text)} style={styles.flex} />
        </>
      }
    >
      <Text style={styles.noteBody}>{words.body}</Text>
      <View style={styles.chips}>
        {words.starts.map((s) => (
          <Chip key={s.label} label={s.label} selected={false} onPress={() => setText(s.text)} />
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={words.hint}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        maxLength={nextNoteMaxLength}
        multiline
        autoFocus
        style={styles.noteInput}
        accessibilityLabel="The note"
      />
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------------- the nudge

/** STUCK? (#113): after the page has sat still a while, a chip; pressed, one prompt at a time. Never writes. */
export function NudgeChip({
  nudges,
  onDismiss,
}: {
  nudges: Nudge[];
  onDismiss: () => void;
}) {
  const [at, setAt] = useState<number | null>(null);
  if (nudges.length === 0) return null;
  if (at === null) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setAt(0)} style={styles.nudgeChip}>
        <Icon name="lightbulb-on-outline" size={16} color={colors.gold} />
        <Text style={styles.nudgeChipText}>Stuck? A nudge</Text>
      </Pressable>
    );
  }
  const n = nudges[at % nudges.length];
  return (
    <View style={styles.nudge} accessibilityLiveRegion="polite">
      <Text style={styles.nudgeText}>{n.text}</Text>
      <View style={styles.nudgeButtons}>
        <OutlineButton label="Another" icon="refresh" compact onPress={() => setAt(at + 1)} />
        <OutlineButton label="Back to it" compact tone="muted" onPress={onDismiss} />
      </View>
    </View>
  );
}

// --------------------------------------------------------------------------------------------------------- rhythm

const bar = 4;
const gap = 2;
const paragraphGap = 5;

/** RHYTHM (#107): the chapter as a waveform, a bar to a sentence as tall as it is long; dialogue in gold, the telling
 * quieter; runs that keep one beat underlined. A press on a bar selects that sentence on the page. */
export function RhythmSheet({
  visible,
  title,
  report,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  report: RhythmReport;
  onPick: (s: RhythmSentence) => void;
  onClose: () => void;
}) {
  const [box, setBox] = useState(0);
  const s = report.sentences;
  const xs = useMemo(() => {
    const out: number[] = [];
    let x = 0;
    for (let i = 0; i < s.length; i++) {
      if (i > 0) x += s[i].block !== s[i - 1].block ? paragraphGap + gap : gap;
      out.push(x);
      x += bar;
    }
    return out;
  }, [s]);
  const width = xs.length === 0 ? 0 : xs[xs.length - 1] + bar;
  const k = Math.min(2.5, Math.max(0.35, box / Math.max(width, 1)));
  const height = 150;
  const mid = (height - 12) / 2;
  const most = Math.sqrt(Math.max(1, report.longest));
  const runs = report.runs;
  const summary =
    s.length === 0
      ? 'No sentences here yet.'
      : `${plural(s.length, 'sentence')} · ${report.shortest}–${report.longest} words, most about ${report.usual}${
          runs.length === 0 ? '' : ` · ${plural(runs.length, 'run')} keeping one beat`
        }`;
  const pick = (x: number) => {
    if (xs.length === 0) return;
    let best = 0;
    for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] + bar / 2 - x) < Math.abs(xs[best] + bar / 2 - x)) best = i;
    onPick(s[best]);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Rhythm" wide>
      <Text style={styles.headLine}>How “{title}” runs</Text>
      <Muted>{summary}</Muted>
      {s.length > 0 && (
        <>
          <View onLayout={(e: LayoutChangeEvent) => setBox(e.nativeEvent.layout.width)} style={styles.waveBox}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Pressable
                accessibilityLabel={`The chapter’s sentences as a waveform. ${summary}. Press a bar to go to its sentence.`}
                onPress={(e) => pick(e.nativeEvent.locationX / k)}
                style={{ width: Math.max(width * k, 1), height }}
              >
                {s.map((sentence, i) => {
                  const h = Math.max(2, ((mid - 2) * Math.sqrt(sentence.words)) / most);
                  return (
                    <View
                      key={i}
                      style={[
                        styles.bar,
                        { left: xs[i] * k, width: bar * k, top: mid - h, height: h * 2, backgroundColor: sentence.spoken ? colors.gold : 'rgba(148,163,184,0.7)' },
                      ]}
                    />
                  );
                })}
                {runs.map((r) => (
                  <View key={r.from} style={[styles.bar, { left: xs[r.from] * k, width: (xs[r.to - 1] + bar - xs[r.from]) * k, top: height - 6, height: 4, backgroundColor: colors.sky }]} />
                ))}
              </Pressable>
            </ScrollView>
          </View>
          <View style={styles.keyRow}>
            <Key colour={colors.gold} label="Dialogue" />
            <Key colour="rgba(148,163,184,0.7)" label="Telling" />
            {runs.length > 0 && <Key colour={colors.sky} label={`One beat, ${sameBeatRun}+ in a row`} line />}
          </View>
          {runs.length > 0 && (
            <>
              <Text style={styles.subHead}>Runs that keep one beat</Text>
              <Muted>Sentences of nearly one length, one after another. Sometimes the scene wants that; often a short line or a long one breaks it.</Muted>
              <View style={styles.chips}>
                {runs.map((r) => (
                  <Chip
                    key={r.from}
                    icon="waveform"
                    label={`${r.to - r.from} at about ${s[r.from].words} words · paragraph ${s[r.from].block + 1}`}
                    selected={false}
                    onPress={() => onPick(s[r.from])}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function Key({ colour, label, line = false }: { colour: string; label: string; line?: boolean }) {
  return (
    <View style={styles.key}>
      <View style={{ width: line ? 16 : 8, height: line ? 3 : 14, borderRadius: 2, backgroundColor: colour }} />
      <Text style={styles.keyText}>{label}</Text>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------ time-lapse

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Nov 9, 8:14 PM". */
export function lapseWhen(ms: number): string {
  const d = new Date(ms);
  return `${months[d.getMonth()]} ${d.getDate()}, ${clock.format(d)}`;
}

/** TIME-LAPSE (#108): the chapter growing across its saved copies, played a copy a second, with a scrub bar and the
 * growth of its words. */
export function TimeLapseSheet({ visible, title, frames, onClose }: { visible: boolean; title: string; frames: LapseFrame[]; onClose: () => void }) {
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  };
  const start = () => {
    stop();
    setAt((a) => (a >= frames.length - 1 ? 0 : a));
    setPlaying(true);
    timer.current = setInterval(() => {
      setAt((a) => {
        if (a >= frames.length - 1) {
          stop();
          return a;
        }
        return a + 1;
      });
    }, 1100);
  };
  useEffect(() => {
    if (visible) {
      setAt(0);
      if (frames.length > 1) start();
    } else stop();
    return stop;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = frames[Math.min(at, frames.length - 1)];
  const before = at === 0 || !frame ? 0 : frames[at - 1].words;
  const line = frame
    ? [lapseWhen(frame.at), plural(frame.words, 'word'), ...(at > 0 ? [`${frame.words - before >= 0 ? '+' : '−'}${formatNumber(Math.abs(frame.words - before))}`] : [])].join(' · ')
    : 'Nothing has been saved here yet.';
  const most = Math.max(1, ...frames.map((f) => f.words));
  const scrub = (x: number) => {
    if (frames.length < 2 || track <= 0) return;
    stop();
    setAt(Math.round(Math.max(0, Math.min(1, x / track)) * (frames.length - 1)));
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Time-lapse"
      wide
      footer={
        frames.length > 0 ? (
          <View style={styles.lapseFoot}>
            <View
              style={styles.growth}
              onLayout={(e) => setTrack(e.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onResponderGrant={(e) => scrub(e.nativeEvent.locationX)}
              onResponderMove={(e) => scrub(e.nativeEvent.locationX)}
              accessibilityLabel={`Copy ${at + 1} of ${frames.length}, ${line}`}
            >
              {frames.map((f, i) => (
                <View
                  key={i}
                  style={[
                    styles.growthBar,
                    { height: Math.max(2, (f.words / most) * 40), backgroundColor: i === at ? colors.gold : i < at ? 'rgba(243,182,58,0.45)' : colors.border },
                  ]}
                />
              ))}
            </View>
            <View style={styles.lapseControls}>
              <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onPress={playing ? stop : start} color={colors.gold} bordered />
              <IconButton icon="chevron-left" label="The copy before" onPress={() => { stop(); setAt(Math.max(0, at - 1)); }} />
              <IconButton icon="chevron-right" label="The copy after" onPress={() => { stop(); setAt(Math.min(frames.length - 1, at + 1)); }} />
              <View style={styles.flex} />
              <Muted>
                {at + 1} / {frames.length}
              </Muted>
            </View>
          </View>
        ) : undefined
      }
    >
      <Text style={styles.headLine}>How “{title}” grew</Text>
      <Muted>{line}</Muted>
      <View style={styles.rule} />
      {!frame ? (
        <Text style={styles.cardText}>Write a little, and its story starts here.</Text>
      ) : (
        frame.paragraphs.map((p, i) => {
          const fresh = frame.fresh.has(i);
          return (
            <View key={i} style={[styles.lapsePara, fresh && styles.lapseFresh]}>
              <Text style={[styles.lapseText, fresh && { color: '#F8E6BE' }]}>{p}</Text>
            </View>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cards: { gap: space.md },
  indexCard: {
    gap: 6,
    padding: space.md,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  cardTitle: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.6, color: colors.gold },
  cardSub: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.muted },
  cardText: { fontFamily: fonts.book, fontSize: 15, lineHeight: 23, color: colors.text },
  cardLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.gold },
  cardMuted: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 19, color: colors.muted },
  cardButton: { alignSelf: 'flex-start', marginTop: 4 },
  thread: { gap: 2 },
  firstPage: { maxHeight: '55%', flexGrow: 0, marginHorizontal: space.md, marginBottom: space.sm, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  firstPageBody: { padding: space.md, gap: space.md },
  firstIntro: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 23, color: colors.muted },
  firstBlock: { gap: 4 },
  waysTitle: { marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.sm },
  wayPrompt: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 23, color: colors.text },
  firstFooter: { fontSize: 12 },
  noteBody: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  noteInput: {
    minHeight: 88,
    padding: space.md,
    borderRadius: radius.field,
    backgroundColor: colors.elevated,
    color: colors.text,
    fontFamily: fonts.book,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  nudgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
  nudgeChipText: { fontFamily: fonts.ui, fontSize: 13, color: colors.gold },
  nudge: { gap: space.sm, padding: space.md, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.surface },
  nudgeText: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 23, color: colors.text },
  nudgeButtons: { flexDirection: 'row', gap: space.sm },
  headLine: { fontFamily: fonts.display, fontSize: 18, color: colors.text, marginBottom: 2 },
  subHead: { fontFamily: fonts.ui, fontSize: 14, color: colors.text, marginTop: space.md },
  waveBox: { marginTop: space.md },
  bar: { position: 'absolute', borderRadius: 2 },
  keyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyText: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
  lapsePara: { marginBottom: space.md, paddingLeft: space.md, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  lapseFresh: { borderLeftColor: colors.gold },
  lapseText: { fontFamily: fonts.book, fontSize: 16, lineHeight: 25, color: colors.muted },
  lapseFoot: { flex: 1, gap: space.xs },
  growth: { height: 44, flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  growthBar: { flex: 1, borderRadius: 1 },
  lapseControls: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
