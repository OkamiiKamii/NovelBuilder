// The DRAWN VIEWS of the cast (FEATURES.md #144–#156): the ORBIT (the cast circling the heart of the book), whose EYES
// each chapter is told through, the ENTRANCES (the order a reader meets them), the TABLE READ (a chapter as a script,
// read aloud in the cast's voices) and the ARCS (each one's line of feeling through the book). Ports of cast_orbit.dart,
// whose_eyes.dart, entrances_view.dart, table_read_view.dart and cast_arcs.dart; every number, colour and word is the
// pure logic in src/domain/characters/views/*. The readings of the book run a moment after the view shows, and are
// kept by what they are made of and the count of writes to the text, so a view opened again shows them at once.

import { useRouter } from 'expo-router';
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Image, type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { DeviceSpeaker } from '../../data/speech';
import { acquaintance } from '../../domain/characters/aids/interview';
import type { Listed } from '../../domain/characters/cast';
import { entrancesJob, type Entrances } from '../../domain/characters/entrances';
import { feelingArcsJob, type FeelingArcs } from '../../domain/characters/feelingArcs';
import { chapterEyesJob, type ChapterEyes } from '../../domain/characters/pov';
import { characterPath } from '../../domain/characters/screens/create';
import { isUploadedImage } from '../../domain/characters/screens/profile';
import { castTone } from '../../domain/characters/screens/library';
import { tableReadJob, type ReadPart } from '../../domain/characters/tableRead';
import { arcLine, arcPicked, arcsReading, castArcs, nearestChapter } from '../../domain/characters/views/castArcs';
import { type Body, knownRing, type Known, orbitLegend, orbitSky, tetherColour } from '../../domain/characters/views/castOrbit';
import { mix, withAlpha } from '../../domain/characters/views/common';
import { castEntrances, doorPicked, entrancesReading } from '../../domain/characters/views/entrancesView';
import { firstReading, KeptReadings, readingKey } from '../../domain/characters/views/keptReadings';
import { type ReadThere, readingTheBook } from '../../domain/characters/views/readings';
import {
  castTableRead,
  nudgedAfter,
  partVoices,
  TableReadPlayer,
  tableReadChapter,
  tableReadChapters,
  tableReadReading,
  tableReadVoicesKey,
} from '../../domain/characters/views/tableReadView';
import { type EyesColour, eyesInk, eyesPicked, eyesReading, whoseEyes } from '../../domain/characters/views/whoseEyes';
import { Chip, GoldButton, Icon, type IconName, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { lastNodeSetting } from '../write/WriteScreen';
import { InterviewSheet } from './AidsSheets';
import { Cameo } from './Cameo';
import type { OpenCast } from './useCast';

type ViewProps = { open: OpenCast; found: Listed[] };

// The Flutter theme's colours, in the System Monolith's.
const theme = {
  lowest: colors.background,
  low: colors.surface,
  high: colors.elevated,
  outline: colors.muted,
  outlineVariant: colors.border,
  onSurface: colors.text,
  onSurfaceVariant: colors.muted,
  accent: colors.gold,
  error: colors.danger,
  tertiaryContainer: '#3A2E52',
};

/** The Material icons the views name, as MaterialCommunityIcons. */
const iconOf: Record<string, IconName> = {
  record_voice_over_outlined: 'account-voice',
  label_outline: 'label-outline',
  face_outlined: 'face-man-outline',
  chat_bubble_outline: 'chat-outline',
  directions_run: 'run',
  psychology_outlined: 'head-cog-outline',
  groups_outlined: 'account-group-outline',
  door_front_door_outlined: 'door',
  schedule: 'clock-outline',
  theater_comedy_outlined: 'drama-masks',
  play_arrow: 'play',
  pause: 'pause',
};
const icon = (name: string): IconName => iconOf[name] ?? 'circle-small';

// ------------------------------------------------------------------------------------------------- shared parts

/** The readings of the book, kept for the whole app (the last 64). */
const kept = new KeptReadings();

/** A reading of the whole book: shown at once when kept; else read a moment after the first frame. `inputs` null:
 * nothing to read (`nothing`). Undefined while it is read. */
function useBookReading<T>(open: OpenCast, kind: string, inputs: string | null, run: () => T, nothing: T): T | undefined {
  const lib = useLibrary();
  const version = lib.novels.versionOf(open.novelId, ['chapterContents']);
  const key = readingKey(inputs === null ? null : `${open.novelId}\u0000${kind}\u0000${inputs}`, version);
  const [got, setGot] = useState<{ key: string | null; value: T } | null>(null);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(() => {
    if (key === null || kept.has(key)) return;
    let live = true;
    kept
      .read(key, () => new Promise<T>((resolve, reject) => setTimeout(() => {
        try {
          resolve(runRef.current());
        } catch (e) {
          reject(e);
        }
      }, 30)))
      .then((value) => {
        if (live) setGot({ key, value });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  const first = firstReading<T>(kept, key, nothing);
  if (first !== undefined) return first;
  return got !== null && got.key === key ? got.value : undefined;
}

/** "Read it there": the chapter opened in Write. */
function useReadThere(open: OpenCast) {
  const lib = useLibrary();
  const router = useRouter();
  return (r: ReadThere) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(open.novelId)}`, () => lib.settings.write(lastNodeSetting(open.novelId), r.nodeId));
    router.navigate(r.path as '/write');
  };
}

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  return [width, (e) => setWidth(Math.round(e.nativeEvent.layout.width))];
}

/** A face: their picture, or their cameo. */
const Face = memo(function Face({ l, width, height, round = 9 }: { l: Listed; width: number; height: number; round?: number }) {
  if (isUploadedImage(l.entry.image)) {
    return <Image source={{ uri: l.entry.image ?? undefined }} style={{ width, height, borderRadius: round }} resizeMode="cover" />;
  }
  return (
    <View style={{ width, height, borderRadius: round, overflow: 'hidden' }}>
      <Cameo entry={l.entry} profile={l.profile} width={width} height={height} bare />
    </View>
  );
});

function PressFace({ l, width = 40, height = 48 }: { l: Listed; width?: number; height?: number }) {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={l.entry.name} onPress={() => router.navigate(characterPath(l.entry.id))}>
      <Face l={l} width={width} height={height} />
    </Pressable>
  );
}

function Reading() {
  return (
    <View style={styles.reading}>
      <Muted>{readingTheBook}</Muted>
    </View>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <Muted style={styles.caption}>{children}</Muted>;
}

function ReadButton({ read, label = 'Read it there', onRead }: { read: ReadThere; label?: string; onRead: (r: ReadThere) => void }) {
  return <OutlineButton label={label} icon="book-open-page-variant-outline" compact onPress={() => onRead(read)} style={styles.start} />;
}

// ------------------------------------------------------------------------------------------------------- the orbit

const riseMs = 1400;

export function OrbitView({ open, found }: ViewProps) {
  const router = useRouter();
  const [width, onLayout] = useWidth();
  const [rise, setRise] = useState(0);
  const [interview, setInterview] = useState<Listed | null>(null);
  const cast = open.cast;
  const order = cast.model.order;
  const active = useMemo(() => found.filter((l) => !l.profile.archived), [found]);
  const known = useMemo(() => {
    const k = new Map(active.map((l) => [l.entry.id, acquaintance(l.entry, l.profile, cast.templates)]));
    return (l: Listed): Known => k.get(l.entry.id) ?? { known: 0, of: 0 };
  }, [active, cast.templates]);

  // The rise: once, as the view opens (at once with reduced motion).
  useEffect(() => {
    if (width === 0) return;
    let frame = 0;
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!live) return;
      if (reduced) {
        setRise(1);
        return;
      }
      const start = Date.now();
      const step = () => {
        const t = Math.min(1, (Date.now() - start) / riseMs);
        setRise(t);
        if (t < 1 && live) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
    // Whatever the frames do, the orbit has risen once the rise is over.
    const done = setTimeout(() => {
      if (live) setRise(1);
    }, riseMs + 100);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [width]);

  const final = useMemo(() => (width > 0 && active.length > 0 ? orbitSky(active, order, width, 1, { known }) : null), [active, order, width, known]);
  const legend = useMemo(() => (active.length > 0 ? orbitLegend(active, order, { known, canInterview: true }) : null), [active, order, known]);
  if (active.length === 0) {
    return (
      <View style={styles.flexGrow}>
        <Caption>No one to put in orbit yet.</Caption>
      </View>
    );
  }
  const sky = width > 0 ? (rise >= 1 && final ? final : orbitSky(active, order, width, rise, { known })) : null;
  const finalOf = new Map((final ? [...final.bodies, ...final.hearts] : []).map((b) => [b.listed.entry.id, b]));
  const r = sky ? (Math.min(sky.width, sky.height) / 2) * 0.9 : 0;

  return (
    <View onLayout={onLayout}>
      {sky && (
        <View style={[styles.orbitBox, { width: sky.width, height: sky.height }]}>
          <Svg width={sky.width} height={sky.height} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="orbitBack" cx={sky.centre.x} cy={sky.centre.y} r={r} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={mix(theme.high, theme.accent, 0.08, 1)} />
                <Stop offset="1" stopColor={theme.low} />
              </RadialGradient>
              <RadialGradient id="orbitGlow" cx={sky.heartAt.x} cy={sky.heartAt.y} r={sky.glow.radius} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={sky.glow.tone ?? theme.accent} stopOpacity={0.28} />
                <Stop offset="1" stopColor={sky.glow.tone ?? theme.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={sky.width} height={sky.height} fill="url(#orbitBack)" />
            {sky.stars.map((s, i) => (
              <Circle key={i} cx={s.x} cy={s.y} r={s.radius} fill={theme.onSurfaceVariant} fillOpacity={s.alpha} />
            ))}
            <Circle cx={sky.heartAt.x} cy={sky.heartAt.y} r={sky.glow.radius} fill="url(#orbitGlow)" />
            {sky.orbits.map((o) => (
              <Ellipse
                key={o.ring}
                cx={sky.centre.x}
                cy={sky.centre.y}
                rx={o.rx}
                ry={o.ry}
                fill="none"
                stroke={theme.outlineVariant}
                strokeOpacity={o.alpha}
                strokeWidth={1.2}
                strokeDasharray={o.dashed ? '6 6' : undefined}
              />
            ))}
            {sky.tethers.map((t) => (
              <Path
                key={t.id}
                d={`M${sky.heartAt.x} ${sky.heartAt.y} Q${t.bend.x} ${t.bend.y} ${t.to.x} ${t.to.y}`}
                fill="none"
                stroke={tetherColour(t, theme.outlineVariant)}
                strokeWidth={t.width}
                strokeLinecap="round"
              />
            ))}
          </Svg>
          {[...sky.bodies, ...sky.hearts].map((b) => {
            const f = finalOf.get(b.listed.entry.id);
            return f ? <OrbitBody key={b.listed.entry.id} b={b} f={f} onPress={() => router.navigate(characterPath(b.listed.entry.id))} /> : null;
          })}
          {[...sky.bodies, ...sky.hearts]
            .filter((b) => b.named || b.heart)
            .map((b) => (
              <View
                key={`plate-${b.listed.entry.id}`}
                pointerEvents="none"
                style={[styles.plate, { left: b.at.x - 70, top: b.plateTop, opacity: b.shown }]}
              >
                <Text numberOfLines={1} style={[styles.plateText, b.heart && styles.plateHeart]}>
                  {b.plate}
                </Text>
              </View>
            ))}
        </View>
      )}
      {legend && (
        <View style={styles.legend}>
          <View style={styles.wrapRow}>
            {legend.rings.map((g) => (
              <View key={g.ring} style={styles.legendRing}>
                <Svg width={22} height={6}>
                  <Line x1={0} y1={3} x2={22} y2={3} stroke={theme.outline} strokeWidth={1.5} strokeDasharray={g.dashed ? '4 3' : undefined} />
                </Svg>
                <Text style={styles.small}>{g.label}</Text>
              </View>
            ))}
          </View>
          <Caption>{legend.caption}</Caption>
          {legend.next && (
            <Panel style={styles.next}>
              <Text style={styles.body}>
                <Text style={styles.bold}>{legend.next.said.name}</Text>
                {legend.next.said.rest}
              </Text>
              <GoldButton label={legend.next.button} icon="microphone-outline" compact onPress={() => setInterview(legend.next!.listed)} style={styles.start} />
            </Panel>
          )}
          {legend.wings && <Caption>{legend.wings}</Caption>}
        </View>
      )}
      {interview && <InterviewSheet open={open} entry={interview.entry} profile={interview.profile} onClose={() => setInterview(null)} />}
    </View>
  );
}

/** A body, drawn at its final size (so its face is drawn once) and scaled to this frame's. */
function OrbitBody({ b, f, onPress }: { b: Body; f: Body; onPress: () => void }) {
  const scale = f.size === 0 ? 1 : b.size / f.size;
  const opacity = b.shown * (b.faint ? 0.6 : 1);
  const inset = f.band > 0 ? f.band + 1.5 : 0;
  const face = f.size - inset * 2;
  const ring = f.known !== null && f.known.of > 0 && f.band > 0 ? knownRing(f.band, f.known) : null;
  const c = f.size / 2;
  const rr = c - (ring?.inset ?? 0);
  const arc = ring && ring.sweep > 0 ? arcPath(c, c, rr, ring.sweep) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={b.semanticsLabel}
      onPress={onPress}
      style={{
        position: 'absolute',
        left: b.at.x - f.hit / 2,
        top: b.at.y - f.hit / 2,
        width: f.hit,
        height: f.hit,
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        transform: [{ scale }],
      }}
    >
      <View
        style={[
          { width: f.size, height: f.size, borderRadius: f.size / 2, backgroundColor: theme.lowest, alignItems: 'center', justifyContent: 'center' },
          b.heart && { shadowColor: f.tone, shadowOpacity: 0.55, shadowRadius: f.size * 0.45, elevation: 8 },
        ]}
      >
        {f.size < 22 ? (
          <View style={{ width: face, height: face, borderRadius: face / 2, backgroundColor: f.tone }} />
        ) : (
          <Face l={f.listed} width={face} height={face} round={face / 2} />
        )}
        {ring && (
          <Svg width={f.size} height={f.size} style={StyleSheet.absoluteFill}>
            <Circle cx={c} cy={c} r={rr} fill="none" stroke={theme.outlineVariant} strokeOpacity={0.7} strokeWidth={ring.width} />
            {arc && <Path d={arc} fill="none" stroke={theme.accent} strokeWidth={ring.width} strokeLinecap="round" />}
          </Svg>
        )}
      </View>
    </Pressable>
  );
}

/** An arc from the top of a circle, clockwise, `sweep` radians (a whole circle as two halves). */
function arcPath(cx: number, cy: number, r: number, sweep: number): string {
  const at = (a: number) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
  if (sweep >= 2 * Math.PI - 1e-6) return `M${at(0)} A${r} ${r} 0 1 1 ${at(Math.PI)} A${r} ${r} 0 1 1 ${at(0)}`;
  return `M${at(0)} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${at(sweep)}`;
}

// -------------------------------------------------------------------------------------------------- whose eyes

function eyesFill(c: EyesColour): string {
  return c.kind === 'character' ? c.hex : c.kind === 'firstPerson' ? withAlpha(theme.onSurface, 0.55) : withAlpha(theme.outlineVariant, 0.5);
}

export function EyesView({ open }: ViewProps) {
  const onRead = useReadThere(open);
  const [picked, setPicked] = useState<number | null>(null);
  const what = useMemo(() => eyesReading(open.cast), [open.cast]);
  const eyes = useBookReading<ChapterEyes[]>(
    open,
    'eyes',
    what.key,
    () => chapterEyesJob(open.service.storedChapters(open.novelId), what.order, what.titles, what.people)(),
    [],
  );
  if (eyes === undefined) return <Reading />;
  const view = whoseEyes(open.cast, eyes, picked);
  if ('empty' in view) return <Caption>{view.empty}</Caption>;
  return (
    <View style={styles.gap}>
      <Caption>{view.caption}</Caption>
      <View style={styles.ribbon} accessibilityLabel={view.semanticsLabel}>
        {view.ribbon.map((band) => (
          <Pressable
            key={band.key}
            accessibilityRole="button"
            accessibilityLabel={`Chapter ${band.chapter}`}
            onPress={() => setPicked(eyesPicked(picked, band.chapter))}
            style={[
              styles.band,
              { flex: band.flex, backgroundColor: eyesFill(band.colour) },
              band.picked && { borderWidth: 2.5, borderColor: theme.onSurface },
            ]}
          >
            {band.numbered && (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.bandNumber, { color: band.colour.kind === 'character' ? eyesInk(band.colour.hex) : theme.onSurface }]}
              >
                {band.chapter}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
      {view.hint.length > 0 && <Muted>{view.hint}</Muted>}
      {view.picked && (
        <View style={[styles.picked, { borderLeftColor: eyesFill(view.picked.colour) }]}>
          <Text style={styles.pickedHead}>{view.picked.heading}</Text>
          {view.picked.quote && <Text style={styles.quote}>{view.picked.quote}</Text>}
          <ReadButton read={view.picked.read} label={view.picked.button} onRead={onRead} />
        </View>
      )}
      {view.rows.map((row) => (
        <View key={row.listed?.entry.id ?? row.kind} style={styles.eyesRow}>
          {row.listed ? (
            <PressFace l={row.listed} />
          ) : (
            <View style={styles.faceIcon}>
              <Icon name={row.kind === 'firstPerson' ? 'account-outline' : 'blur'} size={22} color={theme.onSurfaceVariant} />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.name}>{row.name}</Text>
            <Text style={styles.said}>{row.said}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  { width: `${Math.round(row.share * 1000) / 10}%`, backgroundColor: row.kind === 'unclear' ? theme.outlineVariant : eyesFill(row.colour) },
                ]}
              />
            </View>
          </View>
        </View>
      ))}
      {view.notes.map((n, i) => (
        <View key={i} style={styles.note}>
          <Icon name="eye-outline" size={18} />
          <Text style={[styles.noteText, styles.flex]}>{n}</Text>
        </View>
      ))}
    </View>
  );
}

// --------------------------------------------------------------------------------------------------- entrances

export function EntrancesView({ open }: ViewProps) {
  const onRead = useReadThere(open);
  const [door, setDoor] = useState<number | null>(null);
  const [width, onLayout] = useWidth();
  const what = useMemo(() => entrancesReading(open.cast), [open.cast]);
  const read = useBookReading<Entrances | null>(
    open,
    'entrances',
    what.key,
    () => entrancesJob(open.service.storedChapters(open.novelId), what.order, what.people)(),
    null,
  );
  if (read === undefined) return <Reading />;
  if (read === null) return <Caption>No chapter has words yet. Once there are, the cast is read in the order a reader meets them.</Caption>;
  const view = castEntrances(open.cast, read, door);
  if ('empty' in view) return <Caption>{view.empty}</Caption>;
  const count = view.doors.doors.length;
  const doorWidth = count > 0 && width > 0 ? width / count - 1 : 0;
  const bead = Math.max(3, Math.min(11, doorWidth - 4));
  return (
    <View style={styles.gap}>
      <Caption>{view.caption}</Caption>
      <View onLayout={onLayout} accessibilityLabel={view.doors.semanticsLabel}>
        <View style={styles.doors}>
          {doorWidth > 0 &&
            view.doors.doors.map((d) => {
              const empty = d.ids.length === 0;
              return (
                <Pressable
                  key={d.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Chapter ${d.chapter}: ${d.ids.length}`}
                  onPress={() => setDoor(doorPicked(door, d.chapter))}
                  style={[
                    styles.door,
                    {
                      width: doorWidth,
                      borderTopLeftRadius: doorWidth / 2,
                      borderTopRightRadius: doorWidth / 2,
                      borderWidth: d.picked ? 2 : 1,
                      borderColor: d.picked ? theme.accent : empty ? withAlpha(theme.outlineVariant, 0.35) : theme.outline,
                      backgroundColor: d.picked ? withAlpha(theme.accent, 0.12) : d.crowded ? withAlpha(theme.tertiaryContainer, 0.7) : 'transparent',
                    },
                  ]}
                >
                  {d.beads.map((id) => (
                    <View
                      key={id}
                      style={{ width: bead, height: bead, borderRadius: bead / 2, backgroundColor: castTone(id), borderWidth: 0.8, borderColor: theme.low, marginTop: 1 }}
                    />
                  ))}
                  {d.more && (
                    <Text numberOfLines={1} adjustsFontSizeToFit style={styles.more}>
                      {d.more}
                    </Text>
                  )}
                </Pressable>
              );
            })}
        </View>
        <View style={styles.doorRule} />
        <View style={styles.spread}>
          <Text style={styles.tiny}>Chapter 1</Text>
          {view.doors.last && <Text style={styles.tiny}>{view.doors.last}</Text>}
        </View>
      </View>
      <Muted>{view.hint}</Muted>
      <Panel style={styles.gap}>
        <Text style={styles.billingHead}>{view.heading}</Text>
        <View style={styles.shortRule} />
        {view.none && <Muted>{view.none}</Muted>}
        {view.billing.map((b) => (
          <View key={b.key} style={styles.billing}>
            <Text style={styles.number}>{b.number}</Text>
            <PressFace l={b.listed} />
            <View style={styles.flex}>
              <View style={styles.spread}>
                <Text style={[styles.billName, styles.flex]}>{b.name}</Text>
                <Text style={styles.said}>{b.chapter}</Text>
              </View>
              <View style={styles.wrapRow}>
                {b.chips.map((c) => (
                  <View key={c.label} style={[styles.gives, { backgroundColor: c.warn ? theme.tertiaryContainer : withAlpha(theme.accent, 0.1) }]}>
                    <Icon name={icon(c.icon)} size={13} color={c.warn ? theme.onSurface : theme.accent} />
                    <Text style={styles.givesText}>{c.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.quote} numberOfLines={4}>
                {b.sentence}
              </Text>
              {b.talkedFirst && <Text style={styles.small}>{b.talkedFirst}</Text>}
              <ReadButton read={b.read} label={b.button} onRead={onRead} />
            </View>
          </View>
        ))}
      </Panel>
      {view.editor && (
        <View style={styles.gap}>
          <Text style={styles.billingHead}>{view.editor}</Text>
          {view.notes.map((n, i) => (
            <View key={i} style={styles.note}>
              <Icon name={icon(n.icon)} size={18} />
              <Text style={[styles.noteText, styles.flex]}>{n.text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// -------------------------------------------------------------------------------------------------- table read

const speaker = new DeviceSpeaker();

export function TableReadView({ open }: ViewProps) {
  const lib = useLibrary();
  const [chosen, setChosen] = useState<string | null>(null);
  const [stored, setStored] = useState<unknown>(() => lib.settings.read(tableReadVoicesKey(open.novelId)));
  const [, tick] = useState(0);
  const [p] = useState(() => new TableReadPlayer(speaker, () => tick((t) => t + 1)));

  useEffect(() => {
    let live = true;
    void speaker.available().then((ok) => {
      if (!live) return;
      p.voiced = ok;
      tick((t) => t + 1);
    });
    return () => {
      live = false;
      p.dispose();
    };
  }, [p]);

  const chapters = useMemo(() => tableReadChapters(open.cast), [open.cast]);
  const chapter = tableReadChapter(chapters, chosen);
  const what = useMemo(() => (chapter === null ? null : tableReadReading(open.cast, chapter)), [open.cast, chapter]);
  const parts = useBookReading<ReadPart[]>(
    open,
    'tableRead',
    chapter === null || what === null ? null : what.key,
    () => tableReadJob(open.service.storedChapters(open.novelId), chapter!, what!.people, { genders: what!.genders })(),
    [],
  );
  const view = castTableRead(open.cast, { chosen, parts: parts ?? null, stored, at: p.at, playing: p.playing, voiced: p.voiced });
  if ('empty' in view) return <Caption>{view.empty}</Caption>;
  const voices = parts ? partVoices(open.cast, parts, stored) : new Map();

  const choose = (id: string) => {
    if (id === chapter) return;
    p.chapterChosen();
    setChosen(id);
  };
  const nudge = (id: string, by: number) => {
    const next = nudgedAfter(stored, id, by);
    setStored(next);
    const key = tableReadVoicesKey(open.novelId);
    lib.saves.saveNow(`setting:${key}`, () => lib.settings.write(key, next));
  };

  return (
    <View style={styles.gap}>
      <Caption>{view.caption}</Caption>
      <Text style={styles.label}>{view.chooser.label.toUpperCase()}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {view.chooser.choices.map((c) => (
          <Chip key={c.value} label={c.label} selected={c.value === view.chapter} onPress={() => choose(c.value)} />
        ))}
      </ScrollView>
      <View style={styles.wrapRow}>
        {view.play && (
          <GoldButton
            label={view.play.label}
            icon={icon(view.play.icon)}
            compact
            disabled={!view.play.enabled}
            onPress={() => (p.playing ? p.pause() : parts && void p.play(parts, voices))}
          />
        )}
        {view.fromStart && parts && <OutlineButton label={view.fromStart} icon="skip-previous" compact tone="muted" onPress={() => p.from(0, parts, voices)} />}
      </View>
      {view.noVoice && <Muted>{view.noVoice}</Muted>}
      {view.script === null ? (
        <Reading />
      ) : (
        <>
          {view.script.voicesHeading && <Text style={styles.label}>{view.script.voicesHeading}</Text>}
          <View style={styles.wrapRow}>
            {view.script.voices.map((v) => (
              <View key={v.key} style={[styles.voice, { borderColor: withAlpha(v.tone, 0.6) }]}>
                <Face l={v.listed} width={30} height={30} round={15} />
                <Text style={styles.voiceText} numberOfLines={1}>
                  {v.label}
                </Text>
                <Step icon="minus" label={v.lower.tooltip} enabled={v.lower.enabled} onPress={() => nudge(v.id, -1)} />
                <Step icon="plus" label={v.higher.tooltip} enabled={v.higher.enabled} onPress={() => nudge(v.id, 1)} />
              </View>
            ))}
          </View>
          <Text style={[styles.body, view.script.saidPlain && { color: theme.onSurfaceVariant }]}>{view.script.said}</Text>
          {view.script.parts.map((s, i) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={s.semanticsLabel}
              onPress={() => parts && p.from(i, parts, voices)}
              style={[styles.part, s.part.line && styles.partLine, s.lit && styles.partLit]}
            >
              {s.who !== null && <Text style={[styles.who, { color: s.colour ?? theme.error }]}>{s.who}</Text>}
              <Text style={s.part.line ? styles.line : styles.narration}>{s.part.text}</Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

function Step({ icon: name, label, enabled, onPress }: { icon: IconName; label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={8}
      onPress={onPress}
      style={styles.step}
    >
      <Icon name={name} size={18} color={enabled ? theme.onSurface : withAlpha(theme.onSurface, 0.3)} />
    </Pressable>
  );
}

// -------------------------------------------------------------------------------------------------------- arcs

export function ArcsView({ open }: ViewProps) {
  const router = useRouter();
  const onRead = useReadThere(open);
  const [picked, setPicked] = useState<ReadonlyMap<string, number>>(new Map());
  const [width, onLayout] = useWidth();
  const what = useMemo(() => arcsReading(open.cast), [open.cast]);
  const arcs = useBookReading<FeelingArcs>(
    open,
    'arcs',
    what.key,
    () => feelingArcsJob(open.service.storedChapters(open.novelId), what.order, what.people)(),
    { chapters: 0, arcs: [], thin: [] },
  );
  if (arcs === undefined) return <Reading />;
  const view = castArcs(open.cast, arcs, picked);
  if ('empty' in view) return <Caption>{view.empty}</Caption>;
  const lineWidth = Math.max(0, width - space.md * 2 - 2);
  return (
    <View style={styles.gap} onLayout={onLayout}>
      <Caption>{view.caption}</Caption>
      {view.cards.map((card) => {
        const line = lineWidth > 0 ? arcLine(card.arc, arcs.chapters, view.scale, lineWidth, picked.get(card.arc.id) ?? null) : null;
        const clip = `arc${card.arc.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        const tone = castTone(card.arc.id);
        return (
          <Panel key={card.key} style={styles.gap}>
            <View style={styles.eyesRow}>
              <PressFace l={card.listed} />
              <View style={styles.flex}>
                <Text style={styles.arcName}>{card.name}</Text>
                <Text style={styles.shape}>{card.shape}</Text>
              </View>
            </View>
            {line && (
              <Pressable
                accessibilityLabel={card.semanticsLabel}
                onPress={(e) => {
                  const c = nearestChapter(card.arc, arcs.chapters, lineWidth, e.nativeEvent.locationX);
                  if (c !== null) setPicked(arcPicked(picked, card.arc.id, c));
                }}
              >
                <Svg width={line.width} height={line.height}>
                  <Defs>
                    <ClipPath id={`${clip}up`}>
                      <Rect x={0} y={0} width={line.width} height={line.mid} />
                    </ClipPath>
                    <ClipPath id={`${clip}down`}>
                      <Rect x={0} y={line.mid} width={line.width} height={line.height - line.mid} />
                    </ClipPath>
                  </Defs>
                  {line.dashes.map((d, i) => (
                    <Line key={i} x1={d.x1} y1={line.mid} x2={d.x2} y2={line.mid} stroke={theme.outlineVariant} strokeWidth={1} />
                  ))}
                  {line.ticks.map((t, i) => (
                    <Line key={`t${i}`} x1={t.x} y1={t.top} x2={t.x} y2={t.bottom} stroke={tone} strokeOpacity={0.55} strokeWidth={2} />
                  ))}
                  {line.area && (
                    <>
                      <G clipPath={`url(#${clip}up)`}>
                        <Path d={line.area} fill={theme.accent} fillOpacity={0.18} />
                      </G>
                      <G clipPath={`url(#${clip}down)`}>
                        <Path d={line.area} fill={theme.error} fillOpacity={0.16} />
                      </G>
                    </>
                  )}
                  {line.path && <Path d={line.path} fill="none" stroke={tone} strokeWidth={2.5} strokeLinecap="round" />}
                  {line.points.map((pt) => (
                    <G key={pt.chapter}>
                      {pt.ring !== null && <Circle cx={pt.x} cy={pt.y} r={pt.ring} fill="none" stroke={theme.onSurface} strokeWidth={1.5} />}
                      <Circle cx={pt.x} cy={pt.y} r={pt.radius} fill={tone} />
                    </G>
                  ))}
                </Svg>
              </Pressable>
            )}
            <Text style={styles.said}>{card.said}</Text>
            {'hint' in card.picked ? (
              <Muted>{card.picked.hint}</Muted>
            ) : (
              <View style={[styles.picked, { borderLeftColor: tone }]}>
                <Text style={styles.pickedHead}>{card.picked.heading}</Text>
                {card.picked.none && <Muted>{card.picked.none}</Muted>}
                {card.picked.lines.map((l, i) => (
                  <Pressable key={i} accessibilityRole="button" accessibilityHint={l.tooltip} onPress={() => onRead(l.read)} style={styles.arcQuote}>
                    <Text style={[styles.quote, styles.flex]}>{l.quote}</Text>
                    <Icon name="book-open-page-variant-outline" size={18} />
                  </Pressable>
                ))}
              </View>
            )}
            {card.flat && <Muted>{card.flat}</Muted>}
            {'heading' in card.planned ? (
              <View style={styles.planned}>
                <Text style={styles.label}>{card.planned.heading}</Text>
                {card.planned.lines.map((l) => (
                  <Text key={l.label} style={styles.body}>
                    <Text style={styles.bold}>{l.label}: </Text>
                    {l.text}
                  </Text>
                ))}
              </View>
            ) : (
              <OutlineButton label={card.planned.plan} icon="pencil-outline" compact tone="muted" onPress={() => router.navigate((card.planned as { path: string }).path as '/organize')} style={styles.start} />
            )}
          </Panel>
        );
      })}
      {view.thin && <Muted>{view.thin}</Muted>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  gap: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  chips: { gap: space.xs },
  reading: { paddingVertical: space.lg },
  caption: { fontSize: 13.5, lineHeight: 19 },
  body: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: theme.onSurface },
  bold: { fontWeight: '700' },
  small: { fontFamily: fonts.ui, fontSize: 13, color: theme.onSurfaceVariant },
  tiny: { fontFamily: fonts.ui, fontSize: 11.5, color: theme.onSurfaceVariant },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: theme.onSurfaceVariant },
  name: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: theme.onSurface },
  said: { fontFamily: fonts.ui, fontSize: 13.5, color: theme.onSurfaceVariant },
  quote: { fontFamily: fonts.bookItalic, fontSize: 14.5, lineHeight: 21, color: theme.onSurface },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  noteText: { fontFamily: fonts.ui, fontSize: 14.5, lineHeight: 20, color: theme.onSurface },
  // the orbit
  orbitBox: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(theme.outlineVariant, 0.6) },
  plate: { position: 'absolute', width: 140, alignItems: 'center' },
  plateText: {
    maxWidth: 140,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: withAlpha(theme.low, 0.88),
    fontFamily: fonts.ui,
    fontSize: 11,
    fontWeight: '600',
    color: theme.onSurface,
  },
  plateHeart: { fontSize: 14, fontWeight: '700' },
  legend: { gap: space.sm, marginTop: space.sm },
  legendRing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  next: { gap: space.sm },
  // eyes
  ribbon: { flexDirection: 'row', height: 44, gap: 1.5, borderRadius: 8, overflow: 'hidden' },
  band: { minWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bandNumber: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700' },
  picked: { backgroundColor: theme.high, borderRadius: 10, borderLeftWidth: 4, padding: space.md, gap: space.xs },
  pickedHead: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: theme.onSurface },
  eyesRow: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  faceIcon: { width: 40, height: 48, borderRadius: 9, backgroundColor: theme.high, alignItems: 'center', justifyContent: 'center' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: withAlpha(theme.onSurface, 0.08), marginTop: 4, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  // entrances
  doors: { flexDirection: 'row', height: 74, alignItems: 'flex-end', gap: 1 },
  door: { height: 74, borderBottomWidth: 0, alignItems: 'center', justifyContent: 'flex-start', flexDirection: 'column-reverse', paddingBottom: 2, overflow: 'hidden' },
  more: { fontFamily: fonts.ui, fontSize: 9, color: theme.onSurface },
  doorRule: { height: 2, backgroundColor: withAlpha(theme.outline, 0.6) },
  billingHead: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', letterSpacing: 2.4, color: theme.accent },
  shortRule: { width: 64, height: 1.5, backgroundColor: theme.accent },
  billing: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', marginTop: space.sm },
  number: { width: 28, textAlign: 'right', fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: theme.accent },
  billName: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', letterSpacing: 1.2, color: theme.onSurface },
  gives: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  givesText: { fontFamily: fonts.ui, fontSize: 12.5, color: theme.onSurface },
  // table read
  voice: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 6, paddingVertical: 4, borderRadius: 28, borderWidth: 1, backgroundColor: theme.high, maxWidth: '100%' },
  voiceText: { flexShrink: 1, fontFamily: fonts.ui, fontSize: 14, color: theme.onSurface },
  step: { padding: 4 },
  part: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  partLine: { paddingLeft: 24 },
  partLit: { backgroundColor: withAlpha(theme.accent, 0.14), borderLeftColor: theme.accent },
  who: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  line: { fontFamily: fonts.book, fontSize: 16.5, lineHeight: 24, color: theme.onSurface },
  narration: { fontFamily: fonts.bookItalic, fontSize: 14.5, lineHeight: 21, color: theme.onSurfaceVariant },
  // arcs
  arcName: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: theme.onSurface },
  shape: { fontFamily: fonts.bookItalic, fontSize: 14.5, color: theme.accent },
  arcQuote: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingVertical: 4 },
  planned: { gap: 4, paddingTop: space.xs },
});
