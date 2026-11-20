// THE STATUS WINDOW (FEATURES.md #239, and the Status tab's window, #175): a character's sheet in a system drawn as the
// story's own screen would draw it, in the system's dress (a game's status screen, a cultivation record, an arcane
// ledger, a threat dossier, or a plain character sheet). Every number is worked out by the system from their own; when
// `editable`, the window changes the sheet in place (a level, what is left, their own numbers, a stage, what they
// hold, one new to the system). Shareable as a picture. A port of
// flutter_app/lib/features/progression/widgets/status_window.dart and live_window.dart; what it shows is
// src/domain/systems/screens/statusWindow.ts and liveWindow.ts.

import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentRef, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Switch, Text, TextInput, type TextStyle, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { sharePicture } from '../../data/files';
import { withAlpha } from '../../domain/characters/views/common';
import { type JsonMap, mapOrNull } from '../../domain/json';
import { StoryModel } from '../../domain/model/storyModel';
import { maps } from '../../domain/records/jsonRecord';
import { type SystemBlueprint } from '../../domain/records/system';
import { SheetProfile } from '../../domain/systems/compute';
import { liveWindow, liveWindowWords } from '../../domain/systems/screens/liveWindow';
import {
  type SheetEdit,
  type StatusWindowView,
  type WindowGroup,
  type WindowHeld,
  type WindowLook,
  type WindowRow,
  heldWords,

  statusWindowView,
  stepperLimits,
  takeAwayLabel,
  windowInk,
  windowNumber,
  within,
} from '../../domain/systems/screens/statusWindow';
import { windowKindOf } from '../../domain/systems/screens/systemSpeaks';
import type { SystemChanges } from '../../domain/systems/systemChanges';
import { dartToLowerCase, dartTrim } from '../../domain/text/dartString';
import { ActionSheet, PromptSheet, Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, Muted, OutlineButton } from '../kit';
import { colors, fonts, space } from '../theme';
import type { OpenSystems } from './useSystems';

const ink = windowInk;
const faint = withAlpha(ink, 0.62);

/** A blueprint and a sheet as the model holds them. */
function systemOf(model: StoryModel, systemId: string): SystemBlueprint | null {
  return model.systems.get(systemId) ?? null;
}

/** The text style of a window: its face (JetBrains Mono when the look is mono, else the book face), ink, height 1.3. */
function textOf(look: WindowLook) {
  const family = look.mono ? fonts.numbers : fonts.book;
  return (size: number, opts: { color?: string; bold?: boolean; spacing?: number; italic?: boolean } = {}): TextStyle => ({
    fontFamily: !look.mono && opts.italic ? fonts.bookItalic : family,
    fontSize: size,
    color: opts.color ?? ink,
    fontWeight: opts.bold ? '700' : '400',
    letterSpacing: opts.spacing ?? 0,
    lineHeight: size * 1.3,
  });
}

// ------------------------------------------------------------------------------------------------- the window, drawn

/** A window drawn from what statusWindowView says (read-only unless the handlers are given). Exported for the
 * gallery's example windows. */
export function WindowView({
  view,
  onEdit,
  onHold,
  onSwitch,
  onNew,
  frameRef,
  wide,
}: {
  view: StatusWindowView;
  onEdit?: (e: SheetEdit) => void;
  onHold?: (itemId: string, hold: boolean) => void;
  /** A held thing switched off (true) or on (false); it stays held. */
  onSwitch?: (itemId: string, off: boolean) => void;
  onNew?: (groupId: string, groupName: string) => void;
  /** The frame, for a picture of it. */
  frameRef?: RefObject<ComponentRef<typeof View> | null>;
  /** The window's own width, for the attributes' two columns (from `view.attributeColumnsFrom`). */
  wide?: number;
}) {
  const { look } = view;
  const t = textOf(look);
  const [width, setWidth] = useState(wide ?? 0);
  const fill = useBarFill();
  const rule = (key: string) => <View key={key} style={[styles.rule, { backgroundColor: withAlpha(look.accent, 0.28) }]} />;

  const row = (r: WindowRow, i: number): ReactNode => {
    switch (r.kind) {
      case 'line':
        return <Line key={i} look={look} label={r.label} value={r.value} strong={r.strong} raised={r.raised} breakdown={r.breakdown} />;
      case 'next':
        return (
          <Text key={i} style={[t(11, { color: faint }), styles.next]}>
            {r.text}
          </Text>
        );
      case 'bar':
        return <Bar key={i} look={look} name={r.name} value={r.value} part={r.part} fill={fill} />;
      case 'stepper':
        return <Stepper key={i} look={look} row={r} onSet={(v) => onEdit?.({ id: r.edit.id, track: r.edit.track, value: r.whole ? Math.round(v) : v })} />;
      case 'choose':
        return <Choose key={i} look={look} row={r} onChoose={(v) => onEdit?.({ id: r.edit.id, track: r.edit.track, value: v })} />;
    }
  };

  const columns = width >= view.attributeColumnsFrom ? 2 : 1;
  const attributesShownOnly = view.attributes.every((r) => r.kind === 'line');

  return (
    <View
      ref={frameRef}
      collapsable={false}
      accessible
      accessibilityLabel={view.semanticsLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - 32)}
      style={[
        styles.frame,
        { borderColor: withAlpha(look.accent, 0.55), boxShadow: `0px 0px 18px 1px ${withAlpha(look.accent, 0.22)}` },
      ]}
    >
      <LinearGradient colors={[look.top, look.bottom]} style={StyleSheet.absoluteFill} />
      <Corners accent={look.accent} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={t(15, { color: look.accent, bold: true })}>[</Text>
          <Text numberOfLines={1} style={[t(13.5, { bold: true, spacing: 3 }), styles.shrink]}>
            {view.heading}
          </Text>
          <Text style={t(15, { color: look.accent, bold: true })}>]</Text>
        </View>
        {rule('r0')}
        {view.standing.map(row)}
        {view.resources.length > 0 && (
          <>
            {rule('r1')}
            {view.resources.map(row)}
          </>
        )}
        {view.attributes.length > 0 && (
          <>
            {rule('r2')}
            {attributesShownOnly && columns === 2 ? (
              <View style={styles.columns}>
                {view.attributes.map((r, i) => (
                  <View key={i} style={{ width: (width - 16) / 2 }}>
                    {row(r, i)}
                  </View>
                ))}
              </View>
            ) : (
              view.attributes.map(row)
            )}
          </>
        )}
        {view.follows.length > 0 && (
          <>
            {rule('r3')}
            {view.follows.map(row)}
          </>
        )}
        {view.groups.map((g) => (
          <View key={`g-${g.id}`}>
            {rule(`rg-${g.id}`)}
            <Group look={look} group={g} onHold={onHold} onSwitch={onSwitch} onNew={onNew} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** The four corner brackets: two arms 14 long, 3 in from the edge, in the accent (stroke 1.6). */
function Corners({ accent }: { accent: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const a = 14;
  const i = 3;
  const { w, h } = size;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {w > 0 && (
        <Svg width={w} height={h}>
          <Path
            d={[
              `M${i} ${i + a} L${i} ${i} L${i + a} ${i}`,
              `M${w - i - a} ${i} L${w - i} ${i} L${w - i} ${i + a}`,
              `M${i} ${h - i - a} L${i} ${h - i} L${i + a} ${h - i}`,
              `M${w - i - a} ${h - i} L${w - i} ${h - i} L${w - i} ${h - i - a}`,
            ].join(' ')}
            stroke={accent}
            strokeWidth={1.6}
            fill="none"
          />
        </Svg>
      )}
    </View>
  );
}

/** The bars fill once, as the window opens: over about 1100 ms with a spring (stiffness 120, damping 23); at once
 * when the phone asks for less motion. */
function useBarFill(): Animated.Value {
  const [fill] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!live) return;
      if (reduced) fill.setValue(1);
      else Animated.spring(fill, { toValue: 1, stiffness: 120, damping: 23, mass: 1, useNativeDriver: false }).start();
    });
    return () => {
      live = false;
    };
  }, [fill]);
  return fill;
}

function Line({ look, label, value, strong, raised, breakdown }: { look: WindowLook; label: string; value: string; strong: boolean; raised: boolean; breakdown?: string }) {
  const t = textOf(look);
  return (
    <View>
      <View style={styles.line}>
        <Text style={[t(13, { color: withAlpha(ink, 0.72) }), styles.shrink]}>{label}</Text>
        <Text style={[t(13.5, { bold: strong || raised, color: raised ? look.accent : ink }), styles.value]}>
          {value}
          {raised ? ' ▲' : ''}
        </Text>
      </View>
      {breakdown !== undefined && <Text style={t(11, { color: faint })}>{breakdown}</Text>}
    </View>
  );
}

function Bar({ look, name, value, part, fill }: { look: WindowLook; name: string; value: string; part: number; fill: Animated.Value }) {
  const t = textOf(look);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.max(0, Math.min(1, part)) * 100}%`] });
  return (
    <View style={styles.barRow}>
      <Text numberOfLines={1} style={[t(12.5, { bold: true, color: look.accent }), styles.barName]}>
        {name}
      </Text>
      <View style={[styles.track, { borderColor: withAlpha(look.accent, 0.35) }]}>
        <Animated.View style={[styles.fill, { width, boxShadow: `0px 0px 6px 0px ${withAlpha(look.accent, 0.5)}` }]}>
          <LinearGradient colors={[withAlpha(look.accent, 0.65), look.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
      <Text style={t(12.5)}>{value}</Text>
    </View>
  );
}

/** A number changed in place: −, the number (a press asks for one: "Set", "Cancel"), +. */
function Stepper({ look, row, onSet }: { look: WindowLook; row: Extract<WindowRow, { kind: 'stepper' }>; onSet: (v: number) => void }) {
  const t = textOf(look);
  const [asking, setAsking] = useState(false);
  const shown = row.whole ? String(Math.round(row.value)) : windowNumber(row.value);
  const to = (v: number) => within(row.whole ? Math.round(v) : v, row.min, row.max);
  const button = (icon: 'minus' | 'plus', label: string, v: number) => {
    const off = to(v) === row.value;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={() => onSet(to(v))}
        style={styles.stepButton}
      >
        <Icon name={icon} size={20} color={off ? withAlpha(ink, 0.25) : look.accent} />
      </Pressable>
    );
  };
  return (
    <View style={styles.stepper}>
      <View style={styles.flex}>
        <Text style={t(13, { color: withAlpha(ink, 0.72) })}>{row.label}</Text>
        {row.of !== null && <Text style={t(11.5, { color: withAlpha(ink, 0.6) })}>{row.of}</Text>}
        {row.breakdown !== undefined && <Text style={t(11, { color: faint })}>{row.breakdown}</Text>}
      </View>
      {button('minus', row.less, row.value - 1)}
      <Pressable accessibilityRole="button" accessibilityLabel={row.semanticsLabel} onPress={() => setAsking(true)} style={styles.stepNumber}>
        <Text style={t(14, { bold: true })}>{shown}</Text>
      </Pressable>
      {button('plus', row.more, row.value + 1)}
      {asking && (
        <NumberPrompt
          label={row.label}
          initial={shown}
          whole={row.whole}
          limits={stepperLimits(row.min, row.max)}
          onClose={() => setAsking(false)}
          onSet={(typed) => {
            setAsking(false);
            const n = Number(typed.trim());
            if (typed.trim().length > 0 && Number.isFinite(n) && to(n) !== row.value) onSet(to(n));
          }}
        />
      )}
    </View>
  );
}

/** A number typed: the field, what it must be ("at least 1, at most 100"), Cancel and Set. */
function NumberPrompt({ label, initial, whole, limits, onClose, onSet }: { label: string; initial: string; whole: boolean; limits: string; onClose: () => void; onSet: (text: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <Sheet
      visible
      onClose={onClose}
      title={label}
      footer={
        <View style={styles.row}>
          <OutlineButton label="Cancel" compact tone="muted" onPress={onClose} />
          <GoldButton label="Set" compact onPress={() => onSet(text)} />
        </View>
      }
    >
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        keyboardType={whole ? 'number-pad' : 'numeric'}
        onSubmitEditing={() => onSet(text)}
        selectionColor={colors.gold}
        accessibilityLabel={label}
        style={styles.numberField}
      />
      {limits.length > 0 && <Muted>{limits}</Muted>}
    </Sheet>
  );
}

/** A stage or a choice changed in place: its name, and the one it is (a press offers all of them). */
function Choose({ look, row, onChoose }: { look: WindowLook; row: Extract<WindowRow, { kind: 'choose' }>; onChoose: (v: string) => void }) {
  const t = textOf(look);
  const [open, setOpen] = useState(false);
  const current = row.options.find((o) => o.value === row.current)?.label ?? row.current;
  return (
    <View style={styles.stepper}>
      <Text style={[t(13, { color: withAlpha(ink, 0.72) }), styles.flex]}>{row.label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${row.label}: ${current}. Change`}
        onPress={() => setOpen(true)}
        style={[styles.choose, { borderBottomColor: withAlpha(look.accent, 0.5) }]}
      >
        <Text numberOfLines={1} style={[t(13.5, { bold: true }), styles.shrink]}>
          {current}
        </Text>
        <Icon name="menu-down" size={20} color={look.accent} />
      </Pressable>
      <ActionSheet
        visible={open}
        title={row.label}
        onClose={() => setOpen(false)}
        actions={row.options.map((o) => ({
          label: o.label,
          icon: o.value === row.current ? 'radiobox-marked' : 'radiobox-blank',
          onPress: () => {
            if (o.value !== row.current) onChoose(o.value);
          },
        }))}
      />
    </View>
  );
}

/** A group of what the sheet holds: its label (with Add when editing), and its chips. */
function Group({ look, group, onHold, onSwitch, onNew }: { look: WindowLook; group: WindowGroup; onHold?: (itemId: string, hold: boolean) => void; onSwitch?: (itemId: string, off: boolean) => void; onNew?: (groupId: string, groupName: string) => void }) {
  const t = textOf(look);
  const [adding, setAdding] = useState(false);
  const editing = group.more !== null;
  const name = group.label.replace(/ · one at a time$/, '');
  return (
    <View>
      <View style={styles.groupHead}>
        <Text style={[t(10.5, { bold: true, color: look.accent, spacing: 1.6 }), styles.flex]}>{group.label.toUpperCase()}</Text>
        {editing && group.addLabel !== null && (
          <Pressable accessibilityRole="button" accessibilityLabel={group.addLabel} onPress={() => setAdding(true)} style={styles.add}>
            <Icon name="plus" size={18} color={look.accent} />
            <Text style={t(13, { bold: true, color: look.accent })}>Add</Text>
          </Pressable>
        )}
      </View>
      {editing && group.held.length === 0 ? (
        <Text style={t(12, { color: faint })}>None held</Text>
      ) : (
        <View style={styles.chips}>
          {group.held.map((h) => (
            <View key={h.id} style={styles.heldRow}>
              <Held look={look} held={h} />
              {editing && onSwitch !== undefined && (
                <Switch
                  value={!h.off}
                  onValueChange={(on) => onSwitch(h.id, !on)}
                  trackColor={{ true: look.accent, false: colors.border }}
                  thumbColor={colors.text}
                  accessibilityLabel={`${h.name}: ${h.off ? 'off' : 'on'}`}
                  accessibilityHint="Switches it on or off; it stays held"
                />
              )}
              {editing && h.from === null && (
                <Pressable accessibilityRole="button" accessibilityLabel={takeAwayLabel(h.name)} onPress={() => onHold?.(h.id, false)} style={styles.takeAway}>
                  <Icon name="close" size={18} color={withAlpha(ink, 0.7)} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
      {adding && group.more !== null && (
        <ActionSheet
          visible
          title={group.addLabel ?? name}
          onClose={() => setAdding(false)}
          actions={[
            ...group.more.map((m) => ({ label: m.label, icon: 'plus' as const, onPress: () => onHold?.(m.id, true) })),
            ...(group.canMake ? [{ label: `New in ${name}…`, icon: 'star-plus-outline' as const, onPress: () => onNew?.(group.id, name) }] : []),
          ]}
        />
      )}
    </View>
  );
}

/** A held thing: "[Name]", its rank, its effects, "from <stage>". */
function Held({ look, held }: { look: WindowLook; held: WindowHeld }) {
  const t = textOf(look);
  return (
    <View accessible accessibilityLabel={heldWords(held)} style={[styles.held, { backgroundColor: withAlpha(look.accent, 0.08), borderColor: withAlpha(look.accent, 0.45) }, held.off && styles.dim]}>
      <Text style={t(13, { bold: true })}>
        <Text style={{ color: look.accent }}>[</Text>
        {held.name}
        <Text style={{ color: look.accent }}>]</Text>
        {held.rank !== null && <Text style={t(11, { color: look.accent })}>{`  ${held.rank}`}</Text>}
      </Text>
      {held.effects.length > 0 && <Text style={t(11, { color: withAlpha(ink, 0.65) })}>{held.effects.join(' · ')}</Text>}
      {held.from !== null && <Text style={[t(10.5, { color: withAlpha(look.accent, 0.85) }), styles.from]}>{`from ${held.from}`}</Text>}
      {held.off && <Text style={t(10.5, { color: faint, italic: true })}>switched off</Text>}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ a sheet's window

/** The changes the window makes, as the Status tab makes them (status_tab.dart). */
function applyEdit(c: SystemChanges, sheetId: string, e: SheetEdit): void {
  c.updateSheet(sheetId, (cur) =>
    e.track
      ? { progress: { ...(mapOrNull(cur.raw['progress']) ?? {}), [e.id]: e.value } }
      : { values: { ...(mapOrNull(cur.raw['values']) ?? {}), [e.id]: e.value } },
  );
}

function applyHold(c: SystemChanges, sheetId: string, itemId: string, hold: boolean): void {
  c.updateSheet(sheetId, (cur) => ({ itemIds: [...cur.itemIds.filter((id) => id !== itemId), ...(hold ? [itemId] : [])] }));
}

/** One new to the system, named: made in the group and held, in one change. A name the group has already (letter
 * case aside) is that one, held: never two of the same. */
function applyNew(c: SystemChanges, systemId: string, sheetId: string, groupId: string, named: string): void {
  const system = c.systems().find((s) => s.id === systemId);
  if (!system) return;
  const same = system.items.find((i) => i.groupId === groupId && dartToLowerCase(dartTrim(i.name)) === dartToLowerCase(named));
  const id = same?.id ?? c.newId();
  if (same === undefined) {
    c.updateSystem(systemId, (cur) => ({ items: [...maps(cur.raw['items']), { id, groupId, name: named } as JsonMap] }));
  }
  c.updateSheet(sheetId, (cur) => ({ itemIds: [...cur.itemIds.filter((i) => i !== id), id] }));
}

/** A picture of `frame`, shared (three times over, as the Flutter app makes it). */
async function shareFrame(frame: ComponentRef<typeof View> | null, title: string): Promise<void> {
  if (!frame) throw new Error('Nothing to picture yet.');
  const uri = await captureRef(frame, { format: 'png', result: 'tmpfile' });
  await sharePicture(uri, title);
}

/** A character's (or any entry's) sheet in a system, as its window. `sheetId` null: as they would begin, holding
 * nothing (or `holder`'s name, when given). `editable`: changed in place. `share`: "Share the window" under it. */
export function StatusWindow({
  sys,
  systemId,
  sheetId,
  compact = false,
  editable = false,
  holder,
  caption,
  share = false,
}: {
  sys: OpenSystems;
  systemId: string;
  sheetId: string | null;
  compact?: boolean;
  editable?: boolean;
  /** Who the window is for when there is no sheet (else the sheet's entry). */
  holder?: string;
  /** The caption under it (else the Status tab's words). */
  caption?: string;
  share?: boolean;
}) {
  const model = useMemo(() => StoryModel.fromSnapshot(sys.snapshot), [sys.snapshot]);
  const frame = useRef<ComponentRef<typeof View>>(null);
  const [naming, setNaming] = useState<{ groupId: string; group: string } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const system = systemOf(model, systemId);
  if (!system) return null;
  const sheet = sheetId === null ? null : (model.sheets.find((s) => s.id === sheetId) ?? null);
  const name = sheet !== null ? dartTrim(model.entries.get(sheet.entryId)?.name ?? '') || 'Unnamed' : (holder ?? 'Your hero');
  const editing = editable && sheet !== null;
  const words =
    caption ??
    (sheet === null
      ? `As ${name} would begin in ${system.name}: not on a sheet yet.`
      : editing
        ? 'Each change is kept at once: a number, a stage, a power given or taken away. What follows (the most of each, damage…) the system works out.'
        : `${name} in ${system.name}. Their numbers and what they hold are changed here; experience and points, on their whole sheet.`);
  const view = statusWindowView({
    content: system.raw,
    presetId: windowKindOf(system),
    holder: name,
    held: sheet?.itemIds ?? [],
    caption: words,
    compact,
    profile: sheet === null ? null : SheetProfile.of(sheet),
    editing,
    holding: editing,
    canMakeNew: editing,
  });
  return (
    <View style={styles.gap}>
      <WindowView
        key={`status-${system.id}-${sheet?.id ?? 'none'}`}
        view={view}
        frameRef={frame}
        onEdit={editing ? (e) => sys.now((c) => applyEdit(c, sheet!.id, e)) : undefined}
        onHold={editing ? (id, hold) => sys.now((c) => applyHold(c, sheet!.id, id, hold)) : undefined}
        onSwitch={editing ? (id, off) => sys.now((c) => c.setItemOff(sheet!.id, id, off)) : undefined}
        onNew={editing ? (groupId, group) => setNaming({ groupId, group }) : undefined}
      />
      {view.caption.length > 0 && <Text style={styles.caption}>{view.caption}</Text>}
      {share && (
        <>
          {said && <Text style={styles.said}>{said}</Text>}
          <OutlineButton
            label={liveWindowWords.share}
            icon="share-variant-outline"
            compact
            onPress={() => {
              setSaid(null);
              shareFrame(frame.current, liveWindowWords.share).catch((e: unknown) => setSaid(liveWindowWords.failed(e instanceof Error ? e.message : e)));
            }}
            style={styles.end}
          />
        </>
      )}
      {naming && sheet && (
        <PromptSheet
          visible
          title={`New in ${naming.group}`}
          label={`Name (held by ${name}, and in the system for anyone after)`}
          confirmLabel={`Give it to ${name}`}
          onClose={() => setNaming(null)}
          onSubmit={(typed) => {
            const named = typed.trim();
            const at = naming;
            setNaming(null);
            if (named.length > 0) sys.now((c) => applyNew(c, system.id, sheet.id, at.groupId, named));
          }}
        />
      )}
    </View>
  );
}

// ----------------------------------------------------------------------------------------------- the live window

/** THE WINDOW, on Systems: the system's window as the story would show it, live: a sheet as it stands (chosen in a
 * row of names), or with no sheet a hero holding the system's first things. Only reads; "Share the window" makes a
 * picture of it. */
export function LiveWindow({ sys, systemId, where = 'below' }: { sys: OpenSystems; systemId: string; where?: 'below' | 'beside' | 'here' }) {
  const model = useMemo(() => StoryModel.fromSnapshot(sys.snapshot), [sys.snapshot]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const frame = useRef<ComponentRef<typeof View>>(null);
  const system = systemOf(model, systemId);
  if (!system) return null;
  const live = liveWindow(model, system, chosen, where);
  const view = statusWindowView({ content: system.raw, presetId: live.presetId, holder: live.holder, held: live.held, caption: '', profile: live.profile });
  return (
    <View style={styles.gap}>
      <View style={styles.headRow}>
        <Icon name="application-outline" size={18} />
        <Text style={styles.kicker}>{liveWindowWords.heading}</Text>
      </View>
      <Text style={styles.caption}>{live.caption}</Text>
      {live.chips.length > 0 && (
        <View style={styles.chipRow}>
          {live.chips.map((c) => (
            <Chip key={c.id} label={c.label} selected={c.selected} onPress={() => setChosen(c.id)} />
          ))}
        </View>
      )}
      <View style={styles.centred}>
        <WindowView key={`live-${system.id}-${live.sheet?.id ?? 'none'}`} view={view} frameRef={frame} />
      </View>
      {said && <Text style={styles.said}>{said}</Text>}
      <OutlineButton
        label={liveWindowWords.share}
        icon="share-variant-outline"
        compact
        onPress={() => {
          setSaid(null);
          shareFrame(frame.current, liveWindowWords.share).catch((e: unknown) => setSaid(liveWindowWords.failed(e instanceof Error ? e.message : e)));
        }}
        style={styles.end}
      />
    </View>
  );
}

/** For the gallery: a preset's (or any blueprint content's) window, as an example sheet would begin. */
export function ExampleWindow({ content, presetId, holder, held, compact = true }: { content: JsonMap; presetId: string; holder: string; held: readonly string[]; compact?: boolean }) {
  const view = statusWindowView({ content, presetId, holder, held, caption: '', compact });
  return <WindowView view={view} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  gap: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  end: { alignSelf: 'flex-end' },
  centred: { alignSelf: 'center', width: '100%', maxWidth: 480 },
  frame: { borderRadius: 6, borderWidth: 1.2, overflow: 'hidden' },
  body: { paddingHorizontal: 16, paddingVertical: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rule: { height: 1, marginVertical: 8 },
  next: { marginTop: 1, marginBottom: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 2 },
  value: { textAlign: 'right' },
  columns: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  barName: { width: 76 },
  track: { flex: 1, height: 9, borderRadius: 2, borderWidth: 0.8, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, overflow: 'hidden' },
  stepper: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  stepButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { minWidth: 56, minHeight: 48, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  choose: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '60%', minHeight: 44, borderBottomWidth: 1, backgroundColor: '#0B1626', paddingHorizontal: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', minHeight: 24, marginBottom: 6 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, minWidth: 48, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heldRow: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  held: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 3, borderWidth: 1, flexShrink: 1 },
  from: { fontWeight: '600' },
  dim: { opacity: 0.55 },
  takeAway: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  caption: { fontFamily: fonts.bookItalic, fontSize: 14.5, lineHeight: 21, color: colors.muted },
  said: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.gold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  numberField: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.gold, color: colors.text, fontFamily: fonts.ui, fontSize: 18 },
});
