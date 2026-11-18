// A sheet's tools (FEATURES.md #240–#242, #246–#247): the SHEET EDITOR (where they stand on each track, their own
// values, what they hold; the experience log and the points to place; the sheet worked out), THE CLIMB (their level
// chapter by chapter, and where the pace leads), THE FACE-OFF (two sheets side by side, who would win) and THE SYSTEM
// SPEAKS (an in-story system message, filled in from the sheet, in the book's brackets). Ports of
// flutter_app/lib/features/progression/widgets/{sheet_editor,sheet_view,climb_view,face_off_view,system_speaks}.dart;
// what they show is src/domain/systems/screens/*.

import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentRef, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { sharePicture } from '../../data/files';
import { isUploadedImage } from '../../domain/characters/screens/profile';
import { withAlpha } from '../../domain/characters/views/common';
import { newId } from '../../domain/ids';
import { StoryModel } from '../../domain/model/storyModel';
import { type Entry } from '../../domain/records/entry';
import { SheetProfile } from '../../domain/systems/compute';
import { climbChart, climbSemantics, climbView, climbWords, paceDash } from '../../domain/systems/screens/climbView';
import { faceOffBars, faceOffView, faceOffWords } from '../../domain/systems/screens/faceOffView';
import {
  chooseSingle,
  givePoint,
  holdItem,
  leveling,
  levelingWords,
  logXp,
  removeSheet,
  removeXp,
  setChoice,
  setLevel,
  setNumber,
  setStage,
  sheetEditor,
} from '../../domain/systems/screens/sheetEditor';
import { reachLabel, type SheetPart, sheetView } from '../../domain/systems/screens/sheetView';
import { windowInk } from '../../domain/systems/screens/statusWindow';
import { SpeaksState, bracketKey, speaksChapter, speaksIntro, speaksWords } from '../../domain/systems/screens/systemSpeaks';
import { dartTrim } from '../../domain/text/dartString';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { Cameo } from '../organize/Cameo';
import { ChooserField, SavedText } from '../organize/parts';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import type { OpenSystems } from './useSystems';
import { FocalImage, type FocalPoint } from '../organize/FocalImage';
import { useCast } from '../organize/useCast';
import { writeAtChapterEnd } from '../write/pendingInsert';
import { lastNodeSetting } from '../write/WriteScreen';
import { useRouter } from 'expo-router';

const ink = windowInk;

function useModel(sys: OpenSystems): StoryModel {
  return useMemo(() => StoryModel.fromSnapshot(sys.snapshot), [sys.snapshot]);
}

/** A heading with its icon, as the Systems views have them: "THE CLIMB", "THE FACE-OFF". */
function Kicker({ icon, text }: { icon: 'trending-up' | 'sword-cross' | 'message-text-outline'; text: string }) {
  return (
    <View style={styles.kickerRow}>
      <Icon name={icon} size={18} />
      <Text style={styles.kicker}>{text}</Text>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------ the sheet

/** One entry's sheet on one system: its fields, the levelling, what it holds, the sheet as worked out, and "Take
 * <Name> off <System>". */
export function SheetEditor({ sys, systemId, sheetId }: { sys: OpenSystems; systemId: string; sheetId: string }) {
  const model = useModel(sys);
  const system = model.systems.get(systemId) ?? null;
  const sheet = model.sheets.find((s) => s.id === sheetId) ?? null;
  if (!system || !sheet) return null;
  const name = dartTrim(model.entries.get(sheet.entryId)?.name ?? '') || 'Unnamed';
  const editor = sheetEditor(system, sheet, name);
  const view = sheetView(system, SheetProfile.of(sheet));
  return (
    <View style={styles.gap}>
      <View style={styles.wrap}>
        {editor.fields.map((f) => {
          switch (f.kind) {
            case 'level':
              return (
                <View key={f.key} style={styles.field240}>
                  <SavedText label={f.label} value={f.value} onSave={(t) => sys.now(setLevel(sheet.id, f.trackId, t))} />
                </View>
              );
            case 'stage':
              return (
                <View key={f.key} style={styles.field240}>
                  <ChooserField label={f.label} value={f.value ?? ''} choices={f.options} onChoose={(v) => sys.now(setStage(sheet.id, f.trackId, v))} />
                </View>
              );
            case 'choice':
              return (
                <View key={f.key} style={styles.field200}>
                  <ChooserField
                    label={f.label}
                    value={f.value ?? ''}
                    choices={f.options.map((o) => ({ value: o, label: o }))}
                    onChoose={(v) => sys.now(setChoice(sheet.id, f.variableId, v))}
                  />
                </View>
              );
            case 'number':
              return (
                <View key={f.key} style={styles.field200}>
                  <SavedText label={f.label} value={f.value} placeholder={f.hint} onSave={(t) => sys.now(setNumber(sheet.id, f.variableId, t))} />
                </View>
              );
          }
        })}
      </View>
      <Leveling sys={sys} model={model} systemId={system.id} sheetId={sheet.id} name={name} />
      {editor.groups.map((g) =>
        g.kind === 'single' ? (
          <View key={g.groupId} style={styles.field300}>
            <ChooserField
              label={g.label}
              value={g.value}
              choices={g.options}
              onChoose={(v) => sys.now(chooseSingle(sheet.id, g.options.map((o) => o.value).filter((o) => o.length > 0), v))}
            />
          </View>
        ) : (
          <View key={g.groupId} style={styles.gapXs}>
            <Text style={styles.label}>{g.label}</Text>
            <View style={styles.wrap6}>
              {g.chips.map((c) => (
                <Chip key={c.id} label={c.label} selected={c.selected} icon={c.selected ? 'check' : undefined} onPress={() => sys.now(holdItem(sheet.id, c.id, !c.selected))} />
              ))}
            </View>
          </View>
        ),
      )}
      <Panel style={styles.gapXs}>
        <Text style={styles.boxTitle}>{editor.title}</Text>
        {'empty' in view ? (
          <Muted>{view.empty}</Muted>
        ) : (
          <>
            {[...view.tracks, ...(view.points ? [view.points] : []), ...view.rows].map((l, i) => (
              <Text key={i} style={styles.sheetLine}>
                <Text style={styles.sheetName}>{`${l.name}  `}</Text>
                {l.parts.map((p, j) => (
                  <Text key={j} style={partStyle(p)}>
                    {p.text}
                  </Text>
                ))}
              </Text>
            ))}
            {view.groups.map((g) => (
              <View key={g.name} style={styles.sheetGroup}>
                <Text style={styles.sheetGroupName}>{g.name}</Text>
                {g.things.map((t, i) => (
                  <View key={i} style={styles.thing}>
                    <View style={styles.thingHead}>
                      <Text style={styles.thingName}>{t.name}</Text>
                      {t.badges.map((b) => (
                        <Text key={b} style={styles.badge}>
                          {b}
                        </Text>
                      ))}
                    </View>
                    {t.facts && <Text style={styles.small}>{t.facts}</Text>}
                    {t.requires && <Text style={[styles.small, !t.requires.met && { color: colors.danger }]}>{t.requires.text}</Text>}
                    {t.evolution && <Text style={styles.small}>{t.evolution}</Text>}
                    {t.error && <Text style={[styles.small, { color: colors.danger }]}>{t.error}</Text>}
                  </View>
                ))}
              </View>
            ))}
            {view.reach && (
              <Text style={styles.sheetLine}>
                <Text style={styles.sheetName}>{reachLabel}</Text>
                {view.reach}
              </Text>
            )}
          </>
        )}
      </Panel>
      <OutlineButton label={editor.takeOff} compact tone="danger" onPress={() => sys.now(removeSheet(sheet.id))} style={styles.start} />
    </View>
  );
}

function partStyle(p: SheetPart) {
  switch (p.style) {
    case 'strong':
      return styles.partStrong;
    case 'small':
      return styles.small;
    case 'error':
      return [styles.small, { color: colors.danger }];
    case 'strongError':
      return [styles.partStrong, { color: colors.danger }];
    default:
      return styles.partPlain;
  }
}

/** LEVELLING: experience logged (the level read off the curve) and points placed by hand. */
function Leveling({ sys, model, systemId, sheetId, name }: { sys: OpenSystems; model: StoryModel; systemId: string; sheetId: string; name: string }) {
  const [track, setTrack] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const system = model.systems.get(systemId);
  const sheet = model.sheets.find((s) => s.id === sheetId);
  if (!system || !sheet) return null;
  const lv = leveling(model, system, sheet, name, track);
  if (!lv) return null;
  const xp = lv.experience;
  const log = () => {
    if (!xp) return;
    const change = logXp(sheet.id, { trackId: xp.track.id, amountText: amount, source, nodeId: place, note }, newId);
    if (!change) return;
    sys.now(change);
    setAmount('');
    setSource('');
    setNote('');
  };
  return (
    <View style={styles.gap}>
      {xp && (
        <Panel style={styles.gapXs}>
          <Text style={styles.boxTitle}>{levelingWords.experience}</Text>
          {xp.tracks && <ChooserField label={levelingWords.countsTowards} value={xp.track.id} choices={xp.tracks} onChoose={setTrack} />}
          <Field label={xp.amountLabel} value={amount} onChange={setAmount} placeholder={xp.amountHint} numeric />
          <Field label={levelingWords.source} value={source} onChange={setSource} placeholder={xp.sourceHint} />
          <ChooserField label={levelingWords.where} value={place} choices={xp.places} onChoose={setPlace} />
          <Field label={levelingWords.note} value={note} onChange={setNote} />
          <GoldButton label={levelingWords.log} icon="plus" compact disabled={amount.trim().length === 0} onPress={log} style={styles.start} />
          {xp.empty && <Muted>{xp.empty}</Muted>}
          {xp.log.map((r) => (
            <View key={r.entryId} style={styles.logRow}>
              <View style={styles.flex}>
                <Text style={styles.logTitle}>{r.title}</Text>
                <Text style={[styles.small, r.rose && { color: colors.gold }]}>{r.subtitle}</Text>
              </View>
              <IconButton icon="close" label={r.removeLabel} onPress={() => sys.now(removeXp(sheet.id, r.entryId))} color={colors.muted} />
            </View>
          ))}
        </Panel>
      )}
      {lv.points && (
        <Panel style={styles.gapXs}>
          <Text style={styles.boxTitle}>{lv.points.title}</Text>
          <Muted>{lv.points.caption}</Muted>
          {lv.points.rows.map((r) => (
            <View key={r.variableId} style={styles.pointRow} accessibilityLabel={r.semanticsLabel}>
              <Text style={[styles.partPlain, styles.flex]}>{r.name}</Text>
              <IconButton icon="minus" label={r.take} onPress={() => r.canTake && sys.now(givePoint(sheet.id, r.variableId, -1))} color={r.canTake ? colors.gold : colors.border} />
              <Text style={styles.pointNumber}>{r.placed}</Text>
              <IconButton icon="plus" label={r.place} onPress={() => sys.now(givePoint(sheet.id, r.variableId, 1))} color={colors.gold} />
            </View>
          ))}
        </Panel>
      )}
    </View>
  );
}

function Field({ label, value, onChange, placeholder, numeric = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  return (
    <View style={styles.gapXs}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        keyboardType={numeric ? 'numeric' : 'default'}
        accessibilityLabel={label}
        style={styles.input}
      />
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------ the climb

/** THE CLIMB: a sheet's level chapter by chapter, stepping up where they rise, carried on dashed at the pace so far,
 * the cap ruled across; and what it says. `sheetId` null: the first who has climbed, with a row of names. Nothing when
 * no one has experience logged. */
export function ClimbView({ sys, systemId, sheetId }: { sys: OpenSystems; systemId: string; sheetId: string | null }) {
  const model = useModel(sys);
  const [chosen, setChosen] = useState<string | null>(sheetId);
  const [width, setWidth] = useState(0);
  const system = model.systems.get(systemId);
  if (!system) return null;
  const v = climbView(model, system, chosen ?? sheetId);
  if (!v) return null;
  return (
    <View style={styles.box} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 32)}>
      <Kicker icon="trending-up" text={climbWords.heading} />
      <Text style={styles.caption}>{v.caption}</Text>
      {sheetId === null && v.chips.length > 0 && (
        <View style={styles.wrap6}>
          {v.chips.map((c) => (
            <Chip key={c.id} label={c.label} selected={c.selected} onPress={() => setChosen(c.id)} />
          ))}
        </View>
      )}
      {width > 0 &&
        v.shown.climbs.map((climb, i) => {
          const chart = climbChart(climb, width, 160);
          return (
            <View key={i} style={styles.gapXs}>
              <View accessible accessibilityLabel={climbSemantics(climb)}>
                <Svg width={width} height={160}>
                  {chart.axes.map((a, k) => (
                    <Line key={k} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={colors.border} strokeWidth={1} />
                  ))}
                  {chart.cap?.dashes.map(([x1, x2], k) => (
                    <Line key={`c${k}`} x1={x1} y1={chart.cap!.y} x2={x2} y2={chart.cap!.y} stroke={withAlpha(colors.danger, 0.7)} strokeWidth={1} />
                  ))}
                  {chart.pace && <Path d={chart.pace} stroke={withAlpha(colors.gold, 0.55)} strokeWidth={1.6} strokeDasharray={paceDash} fill="none" />}
                  <Path d={chart.steps} stroke={colors.gold} strokeWidth={2.4} strokeLinejoin="round" fill="none" />
                  <Circle cx={chart.here.x} cy={chart.here.y} r={4} fill={colors.gold} />
                  {chart.labels.map((l, k) => (
                    <SvgText
                      key={`l${k}`}
                      x={l.x}
                      y={l.middle ? l.y + 3.5 : l.y + 10}
                      fontSize={10}
                      fontFamily={fonts.book}
                      fill={colors.text}
                      textAnchor={l.anchor}
                    >
                      {l.text}
                    </SvgText>
                  ))}
                </Svg>
              </View>
              {climb.says.map((s) => (
                <View key={s} style={styles.says}>
                  <View style={styles.dot} />
                  <Text style={[styles.saysText, styles.flex]}>{s}</Text>
                </View>
              ))}
            </View>
          );
        })}
    </View>
  );
}

// --------------------------------------------------------------------------------------------------- the face-off

function Portrait({ entry, focal }: { entry: Entry | undefined; focal?: FocalPoint | null }) {
  if (!entry) return <View style={styles.portrait} />;
  // The point the author chose in the portrait stays in view (FocalImage), as on the character's own page.
  if (isUploadedImage(entry.image)) return <FocalImage uri={entry.image ?? ''} focal={focal} style={styles.portrait} />;
  return (
    <View style={styles.portrait}>
      <Cameo entry={entry} profile={null} width={64} height={78} bare />
    </View>
  );
}

/** THE FACE-OFF: two of the system's sheets side by side, each number a bar out to each side, the longer lit; what
 * it says beneath; in the system's own window dress. Shareable as a picture. Nothing with fewer than two sheets. */
export function FaceOffView({ sys, systemId }: { sys: OpenSystems; systemId: string }) {
  const model = useModel(sys);
  // The cast, for each one's portrait focal point (the systems' own records don't carry profiles).
  const cast = useCast();
  const [sides, setSides] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });
  const [said, setSaid] = useState<string | null>(null);
  const card = useRef<ComponentRef<typeof View>>(null);
  const system = model.systems.get(systemId);
  if (!system) return null;
  const v = faceOffView(model, system, sides);
  if (!v) return null;
  const { look } = v;
  const share = async () => {
    setSaid(null);
    try {
      if (!card.current) return;
      const uri = await captureRef(card.current, { format: 'png', result: 'tmpfile' });
      await sharePicture(uri, faceOffWords.share);
    } catch (e) {
      setSaid(`The picture could not be made: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const t = (size: number, color = ink, bold = false) => ({ fontFamily: look.mono ? fonts.numbers : fonts.book, fontSize: size, color, fontWeight: bold ? ('700' as const) : ('400' as const) });
  return (
    <View style={styles.gap}>
      <Kicker icon="sword-cross" text={faceOffWords.heading} />
      <Text style={styles.caption}>{faceOffWords.caption}</Text>
      {v.pickers ? (
        <View style={styles.gapXs}>
          <View style={styles.wrap6}>
            {v.pickers.a.map((c) => (
              <Chip key={c.id} label={c.label} selected={c.selected} onPress={() => setSides({ ...sides, a: c.id })} />
            ))}
          </View>
          <Text style={styles.against}>{faceOffWords.against}</Text>
          <View style={styles.wrap6}>
            {v.pickers.b.map((c) => (
              <Chip key={c.id} label={c.label} selected={c.selected} onPress={() => setSides({ ...sides, b: c.id })} />
            ))}
          </View>
        </View>
      ) : (
        <OutlineButton label={faceOffWords.swap} icon="swap-horizontal" compact tone="muted" onPress={() => setSides({ a: v.b.id, b: v.a.id })} style={styles.start} />
      )}
      <View ref={card} collapsable={false} accessible accessibilityLabel={v.semanticsLabel} style={[styles.card, { borderColor: withAlpha(look.accent, 0.55) }]}>
        <LinearGradient colors={[look.top, look.bottom]} style={StyleSheet.absoluteFill} />
        <View style={styles.cardBody}>
          <View style={styles.faces}>
            <View style={styles.face}>
              <Portrait entry={model.entries.get(v.a.entryId)} focal={cast?.cast.profiles.get(v.a.entryId)?.focal} />
              <Text numberOfLines={2} style={[t(14, ink, true), styles.centerText]}>
                {v.aName}
              </Text>
            </View>
            <Text style={[t(26, look.accent, true), styles.vs, { textShadowColor: withAlpha(look.accent, 0.6) }]}>{faceOffWords.vs}</Text>
            <View style={styles.face}>
              <Portrait entry={model.entries.get(v.b.entryId)} focal={cast?.cast.profiles.get(v.b.entryId)?.focal} />
              <Text numberOfLines={2} style={[t(14, ink, true), styles.centerText]}>
                {v.bName}
              </Text>
            </View>
          </View>
          {v.face.rows.map((row) => {
            const b = faceOffBars(row);
            const lit = (leads: boolean) => (leads ? { backgroundColor: look.accent, boxShadow: `0px 0px 6px 0px ${withAlpha(look.accent, 0.5)}` } : { backgroundColor: withAlpha(ink, 0.28) });
            return (
              <View key={row.name} style={styles.faceRow}>
                <Text style={[t(10.5, withAlpha(ink, 0.75)), styles.faceName]}>{b.name}</Text>
                <View style={styles.barsRow}>
                  <Text style={[t(13, b.aLeads ? look.accent : withAlpha(ink, 0.7), b.aLeads), styles.faceValue]}>{b.aValue}</Text>
                  <View style={[styles.half, styles.halfLeft]}>
                    <View style={[styles.faceBar, { width: `${b.aPart * 100}%` }, lit(b.aLeads)]} />
                  </View>
                  <View style={styles.half}>
                    <View style={[styles.faceBar, { width: `${b.bPart * 100}%` }, lit(b.bLeads)]} />
                  </View>
                  <Text style={[t(13, b.bLeads ? look.accent : withAlpha(ink, 0.7), b.bLeads), styles.faceValue, styles.right]}>{b.bValue}</Text>
                </View>
              </View>
            );
          })}
          <View style={[styles.cardRule, { backgroundColor: withAlpha(look.accent, 0.28) }]} />
          {v.face.says.map((s) => (
            <Text key={s} style={[t(13.5), styles.cardSays]}>
              {s}
            </Text>
          ))}
        </View>
      </View>
      {said && <Text style={styles.saysText}>{said}</Text>}
      <OutlineButton label={faceOffWords.share} icon="share-variant-outline" compact onPress={() => void share()} style={styles.end} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------- the system speaks

/** THE SYSTEM SPEAKS: a message from the system to a character (or "You"), filled in from their sheet, in the book's
 * brackets (remembered on this device), shown as the system's window shows it; Copy, or Write it in the chapter: the
 * lines at the end of the chapter open in Write (else the first), each a paragraph, the caret after, through the
 * chapter's editor (pendingInsert.ts). `onWrite` closes what holds this before Write opens. */
export function SystemSpeaks({
  sys,
  systemId,
  sheetId,
  onWrite,
}: {
  sys: OpenSystems;
  systemId: string;
  sheetId: string | null;
  onWrite?: () => void;
}) {
  const lib = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const model = useModel(sys);
  const system = model.systems.get(systemId) ?? null;
  const [state] = useState(() => {
    if (!system) return null;
    const s = new SpeaksState(model, system, lib.settings.read(bracketKey(sys.novelId)));
    if (sheetId !== null && s.sheets.some((x) => x.id === sheetId)) s.chooseSheet(sheetId);
    return s;
  });
  const [, tick] = useState(0);
  const changed = () => tick((n) => n + 1);
  if (!system || !state) return null;
  const v = state.view();
  const { look } = v;
  // The chapter the lines go to: the one open in Write (the one last opened there), else the first.
  const chapter = speaksChapter(model, null, lib.settings.read(lastNodeSetting(sys.novelId)), (id) => model.nodes.has(id));
  const face = look.mono ? fonts.numbers : fonts.book;
  const keepBracket = (value: string) =>
    lib.saves.saveNow(`setting:${bracketKey(sys.novelId)}`, () => {
      lib.settings.write(bracketKey(sys.novelId), value);
      lib.novels.touchSettings();
    });
  return (
    <View style={styles.gap}>
      <Kicker icon="message-text-outline" text={speaksWords.title.toUpperCase()} />
      <Text style={styles.caption}>{speaksIntro(system)}</Text>
      <Text style={styles.fieldLabel}>{speaksWords.to.toUpperCase()}</Text>
      <View style={styles.wrap6}>
        {v.to.map((c) => (
          <Chip key={c.id ?? 'you'} label={c.label} selected={c.selected} onPress={() => { state.chooseSheet(c.id); changed(); }} />
        ))}
      </View>
      <Text style={styles.fieldLabel}>{speaksWords.says.toUpperCase()}</Text>
      <View style={styles.wrap6}>
        {v.kinds.map((k) => (
          <Chip key={k.kind} label={k.label} selected={k.selected} onPress={() => { state.chooseKind(k.kind); changed(); }} />
        ))}
      </View>
      {v.tracks.length > 0 && (
        <View style={styles.wrap6}>
          {v.tracks.map((c) => (
            <Chip key={c.id} label={c.label} selected={c.selected} onPress={() => { state.chooseTrack(c.id); changed(); }} />
          ))}
        </View>
      )}
      {v.stats.length > 0 && (
        <View style={styles.wrap6}>
          {v.stats.map((c) => (
            <Chip key={c.id} label={c.label} selected={c.selected} onPress={() => { state.chooseStat(c.id); changed(); }} />
          ))}
        </View>
      )}
      {v.fields.map((f) => (
        <View key={`${state.kind}-${f.key}`} style={styles.gapXs}>
          <Text style={styles.fieldLabel}>{f.label.toUpperCase()}</Text>
          <TextInput
            value={state[f.key]}
            onChangeText={(text) => {
              state.type(f.key, text);
              changed();
            }}
            placeholder={f.hint ?? undefined}
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            multiline={f.lines > 1}
            keyboardType={f.number ? 'numeric' : 'default'}
            accessibilityLabel={f.label}
            style={[styles.input, f.lines > 1 && styles.multi]}
          />
        </View>
      ))}
      <Text style={styles.fieldLabel}>{speaksWords.brackets.toUpperCase()}</Text>
      <View style={styles.wrap6}>
        {v.brackets.map((b) => (
          <Pressable
            key={b.bracket}
            accessibilityRole="button"
            accessibilityLabel={b.tooltip}
            accessibilityState={{ selected: b.selected }}
            onPress={() => {
              keepBracket(state.chooseBracket(b.bracket));
              changed();
            }}
            style={[styles.bracket, b.selected && styles.bracketOn]}
          >
            <Text style={[styles.bracketText, b.selected && { color: colors.gold }]}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
      <View
        accessible
        accessibilityLabel={v.semanticsLabel}
        style={[styles.message, { borderColor: withAlpha(look.accent, 0.7), boxShadow: `0px 0px 14px 0px ${withAlpha(look.accent, 0.25)}` }]}
      >
        <LinearGradient colors={[look.top, look.bottom]} style={StyleSheet.absoluteFill} />
        <View style={styles.messageBody}>
          <Text style={[styles.messageKicker, { color: look.accent, fontFamily: face }]}>{speaksWords.systemLabel}</Text>
          {v.lines.map((line, i) => (
            <Text key={i} style={[styles.messageLine, { fontFamily: face, color: i === 0 ? look.accent : ink, fontWeight: i === 0 ? '700' : '400' }]}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <OutlineButton
          label={speaksWords.copy}
          icon="content-copy"
          compact
          onPress={() => {
            void Clipboard.setStringAsync(state.copied());
            toast(speaksWords.copied);
            changed();
          }}
        />
        <GoldButton
          label={speaksWords.write}
          icon="note-edit-outline"
          compact
          disabled={chapter === null}
          onPress={() => {
            if (chapter === null) return;
            onWrite?.();
            writeAtChapterEnd(lib, router, sys.novelId, chapter.id, state.lines);
          }}
        />
      </View>
      {chapter !== null && <Text style={styles.atEnd}>{chapter.said}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapXs: { gap: space.xs },
  start: { alignSelf: 'flex-start' },
  end: { alignSelf: 'flex-end' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-end' },
  atEnd: { fontFamily: fonts.ui, fontSize: 13.5, color: colors.muted, textAlign: 'right' },
  centerText: { textAlign: 'center' },
  right: { textAlign: 'right' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  wrap6: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  field240: { width: 240, maxWidth: '100%' },
  field200: { width: 200, maxWidth: '100%' },
  field300: { width: 300, maxWidth: '100%' },
  label: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '600', color: colors.text },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.2, color: colors.gold },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, color: colors.text, fontFamily: fonts.ui, fontSize: 15, paddingHorizontal: space.md },
  multi: { minHeight: 72, textAlignVertical: 'top', paddingTop: space.sm },
  boxTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  sheetLine: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.text, marginBottom: 4 },
  sheetName: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '600', color: colors.muted },
  partPlain: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  partStrong: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '600', color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  sheetGroup: { marginTop: 8, gap: 4 },
  sheetGroupName: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.text },
  thing: { gap: 2 },
  thingHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  thingName: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '600', color: colors.text },
  badge: { fontFamily: fonts.ui, fontSize: 11, color: colors.text, backgroundColor: colors.elevated, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logTitle: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  pointRow: { flexDirection: 'row', alignItems: 'center' },
  pointNumber: { width: 36, textAlign: 'center', fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  box: { gap: space.sm, padding: 16, paddingBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.gold },
  caption: { fontFamily: fonts.bookItalic, fontSize: 14.5, lineHeight: 21, color: colors.muted },
  says: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold, marginTop: 8 },
  saysText: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21, color: colors.text },
  against: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.muted },
  card: { alignSelf: 'center', width: '100%', maxWidth: 520, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  cardBody: { padding: 14 },
  faces: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  face: { flex: 1, alignItems: 'center', gap: 6 },
  portrait: { width: 64, height: 78, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  vs: { marginTop: 22, letterSpacing: 2, fontWeight: '900', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  faceRow: { paddingVertical: 5 },
  faceName: { letterSpacing: 1.4, marginBottom: 3, textAlign: 'center' },
  barsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  faceValue: { width: 54 },
  half: { flex: 1, height: 8 },
  halfLeft: { alignItems: 'flex-end' },
  faceBar: { height: 8, borderRadius: 4 },
  cardRule: { height: 1, marginVertical: 8 },
  cardSays: { lineHeight: 13.5 * 1.35, marginBottom: 4 },
  bracket: { minWidth: 56, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  bracketOn: { borderColor: colors.gold, backgroundColor: 'rgba(243,182,58,0.1)' },
  bracketText: { fontFamily: fonts.numbers, fontSize: 15, color: colors.text },
  message: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  messageBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  messageKicker: { fontSize: 11, letterSpacing: 3, fontWeight: '700', marginBottom: 6 },
  messageLine: { fontSize: 15, lineHeight: 15 * 1.35, marginVertical: 2 },
});
