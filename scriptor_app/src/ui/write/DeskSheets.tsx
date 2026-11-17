// The writing desk's sheets: Writing settings (FEATURES.md #97), the Desk drawer that lists every tool by name (#99), and
// Listen's bar (#105).

import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  fontSizeRange,
  lineHeightRange,
  pageColours,
  paragraphSpacingRange,
  writingFonts,
  writingPages,
  type WritingPrefs,
  writingWidths,
} from '../../domain/writingPrefs';
import type { LensSummary } from '../../editor/ChapterEditor';
import { Sheet } from '../dialogs';
import { Chip, Icon, type IconName, IconButton, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';

const sampleFont = { serif: fonts.book, sans: fonts.ui, mono: fonts.numbers } as const;

export function Stepper({
  label,
  value,
  range,
  format,
  onChange,
}: {
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <IconButton icon="minus" label={`Less ${label.toLowerCase()}`} bordered onPress={() => onChange(Math.max(range.min, round(value - range.step)))} />
      <Text style={styles.stepValue} accessibilityLabel={`${label}: ${format(value)}`}>
        {format(value)}
      </Text>
      <IconButton icon="plus" label={`More ${label.toLowerCase()}`} bordered onPress={() => onChange(Math.min(range.max, round(value + range.step)))} />
    </View>
  );
}

/** The weather the page can be written in (#109), as the Flutter app stores it under `write.atmosphere`. */
export const atmospheres = [
  { key: 'none', label: 'None' },
  { key: 'rain', label: 'Rain' },
  { key: 'snow', label: 'Snow' },
  { key: 'fireflies', label: 'Fireflies' },
  { key: 'candle', label: 'Candlelight' },
  { key: 'stars', label: 'Stars' },
] as const;
export type AtmosphereKey = (typeof atmospheres)[number]['key'];

export function WritingSettingsSheet({
  visible,
  prefs,
  onChange,
  onClose,
  atmosphere,
  onAtmosphere,
  freshInk,
  onFreshInk,
}: {
  visible: boolean;
  prefs: WritingPrefs;
  onChange: (change: Partial<WritingPrefs> | null) => void;
  onClose: () => void;
  atmosphere: AtmosphereKey;
  onAtmosphere: (a: AtmosphereKey) => void;
  freshInk: boolean;
  onFreshInk: (on: boolean) => void;
}) {
  const page = pageColours(prefs.page);
  return (
    <Sheet visible={visible} onClose={onClose} title="Writing settings">
      <View style={[styles.sample, { backgroundColor: page.background }]}>
        <Text
          style={{
            color: page.text,
            fontFamily: sampleFont[prefs.font],
            fontSize: prefs.fontSize,
            lineHeight: prefs.fontSize * prefs.lineHeight,
          }}
        >
          The bell in the tower had not rung in thirty-one years.
        </Text>
      </View>
      <Text style={styles.label}>FONT</Text>
      <View style={styles.chips}>
        {writingFonts.map((f) => (
          <Chip key={f.key} label={f.label} selected={prefs.font === f.key} onPress={() => onChange({ font: f.key })} />
        ))}
      </View>
      <Stepper label="Text size" value={prefs.fontSize} range={fontSizeRange} format={(v) => `${v}`} onChange={(v) => onChange({ fontSize: v })} />
      <Stepper label="Line spacing" value={prefs.lineHeight} range={lineHeightRange} format={(v) => v.toFixed(1)} onChange={(v) => onChange({ lineHeight: v })} />
      <Stepper
        label="Between paragraphs"
        value={prefs.paragraphSpacing}
        range={paragraphSpacingRange}
        format={(v) => `${v.toFixed(1)} lines`}
        onChange={(v) => onChange({ paragraphSpacing: v })}
      />
      <Text style={styles.label}>TEXT WIDTH</Text>
      <View style={styles.chips}>
        {writingWidths.map((w) => (
          <Chip key={w.key} label={w.label} selected={prefs.width === w.key} onPress={() => onChange({ width: w.key })} />
        ))}
      </View>
      <Text style={styles.label}>PAGE</Text>
      <View style={styles.chips}>
        {writingPages.map((p) => (
          <Pressable
            key={p.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: prefs.page === p.key }}
            accessibilityLabel={p.label}
            onPress={() => onChange({ page: p.key })}
            style={[styles.pageSwatch, { backgroundColor: p.background }, prefs.page === p.key && styles.pageOn]}
          >
            <Text style={[styles.pageText, { color: p.text }]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.toggle}>
        <View style={styles.flex}>
          <Text style={styles.toggleTitle}>Set like a book</Text>
          <Text style={styles.toggleNote}>A raised first letter and small capitals; scene breaks as ornaments. Display only.</Text>
        </View>
        <Switch
          value={prefs.setLikeABook}
          onValueChange={(v) => onChange({ setLikeABook: v })}
          trackColor={{ true: colors.gold, false: colors.border }}
          thumbColor={colors.text}
          accessibilityLabel="Set like a book"
        />
      </View>
      <Text style={styles.label}>ATMOSPHERE</Text>
      <View style={styles.chips}>
        {atmospheres.map((a) => (
          <Chip key={a.key} label={a.label} selected={atmosphere === a.key} onPress={() => onAtmosphere(a.key)} />
        ))}
      </View>
      <View style={styles.toggle}>
        <View style={styles.flex}>
          <Text style={styles.toggleTitle}>Today’s ink</Text>
          <Text style={styles.toggleNote}>A stroke in the margin beside every paragraph written or changed today.</Text>
        </View>
        <Switch
          value={freshInk}
          onValueChange={onFreshInk}
          trackColor={{ true: colors.gold, false: colors.border }}
          thumbColor={colors.text}
          accessibilityLabel="Today’s ink"
        />
      </View>
      <OutlineButton label="Back to the defaults" icon="restore" tone="muted" compact onPress={() => onChange(null)} style={styles.start} />
    </Sheet>
  );
}

export type DeskTool = { key: string; label: string; note: string; icon: IconName; on?: boolean; onPress: () => void };

/** THE DESK (#99): every tool by name, with a line on what it does. */
export function DeskSheet({ visible, tools, onClose }: { visible: boolean; tools: DeskTool[]; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Desk">
      {tools.map((t) => (
        <Pressable
          key={t.key}
          accessibilityRole="button"
          accessibilityState={t.on === undefined ? undefined : { checked: t.on }}
          onPress={() => {
            onClose();
            t.onPress();
          }}
          style={({ pressed }) => [styles.tool, pressed && { backgroundColor: colors.elevated }]}
        >
          <View style={[styles.toolIcon, t.on && styles.toolIconOn]}>
            <Icon name={t.icon} size={22} color={t.on ? colors.onGold : colors.gold} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.toolTitle}>
              {t.label}
              {t.on ? ' · on' : ''}
            </Text>
            <Text style={styles.toolNote}>{t.note}</Text>
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}

/** LISTEN (#105): the chapter read by the device's own voice, a sentence at a time, from the caret. */
export function ListenBar({
  index,
  total,
  playing,
  rate,
  onToggle,
  onStep,
  onRate,
  onClose,
}: {
  index: number;
  total: number;
  playing: boolean;
  rate: number;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onRate: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.listen} accessibilityLabel={`${playing ? 'Reading' : 'Paused'}, sentence ${index + 1} of ${total}`}>
      <Icon name="cassette" size={22} color={colors.sky} />
      <Text style={styles.listenText}>
        {playing ? 'Reading' : 'Paused'} · {Math.min(index + 1, total)} of {total}
      </Text>
      <View style={styles.flex} />
      <IconButton icon="skip-previous" label="Back a sentence" onPress={() => onStep(-1)} />
      <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onPress={onToggle} color={colors.gold} />
      <IconButton icon="skip-next" label="Next sentence" onPress={() => onStep(1)} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Pace ${rate} times`} onPress={onRate} style={styles.rate}>
        <Text style={styles.rateText}>{rate}×</Text>
      </Pressable>
      <IconButton icon="close" label="Stop listening" onPress={onClose} color={colors.muted} />
    </View>
  );
}

/** The bar of the lens in use: the red pencil's counts (#103) or who speaks how much (#104). A chip selects the next
 * mark of its kind. */
export function LensBar({
  summary,
  speakerName,
  speakerColour,
  onNext,
  onClose,
}: {
  summary: LensSummary;
  speakerName: (id: string | null) => string;
  speakerColour: (id: string | null) => string;
  onNext: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.lens}>
      <View style={styles.lensHead}>
        <Icon name={summary.lens === 'pencil' ? 'pencil' : 'account-voice'} size={18} color={colors.gold} />
        <Text style={styles.lensTitle}>
          {summary.lens === 'pencil'
            ? 'Red pencil'
            : summary.voices
              ? `Voices · ${summary.voices.dialoguePercent}% of this chapter is dialogue`
              : 'Voices'}
        </Text>
        <IconButton icon="close" label="Close the lens" onPress={onClose} color={colors.muted} size={18} />
      </View>
      {summary.pencil && (
        <>
          <View style={styles.chips}>
            <Chip label={`Echoes · ${summary.pencil.echo}`} selected={false} onPress={() => onNext('echo')} />
            <Chip label={`Long sentences · ${summary.pencil.long}`} selected={false} onPress={() => onNext('long')} />
            <Chip label={`Fillers · ${summary.pencil.filler}`} selected={false} onPress={() => onNext('filler')} />
          </View>
          {summary.pencil.leanedOn.length > 0 && (
            <Text style={styles.leaned}>
              Leaned on: {summary.pencil.leanedOn.map((w) => `${w.word} ×${w.count}`).join(', ')}
            </Text>
          )}
        </>
      )}
      {summary.voices && (
        <>
          {summary.voices.speakers.length > 0 && (
            <View style={styles.shares}>
              {summary.voices.speakers.map((s) => (
                <View key={s.speaker ?? '-'} style={{ flex: Math.max(1, s.words), height: 6, backgroundColor: speakerColour(s.speaker) }} />
              ))}
            </View>
          )}
          <View style={styles.chips}>
            {summary.voices.speakers.length === 0 && <Text style={styles.leaned}>No dialogue in this chapter.</Text>}
            {summary.voices.speakers.map((s) => (
              <Chip
                key={s.speaker ?? '-'}
                label={`${speakerName(s.speaker)} · ${s.lines} ${s.lines === 1 ? 'line' : 'lines'}`}
                selected={false}
                onPress={() => onNext(s.speaker ?? '')}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lens: { marginHorizontal: space.md, marginBottom: space.sm, padding: space.sm, gap: space.sm, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.surface },
  lensHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  lensTitle: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  leaned: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  shares: { flexDirection: 'row', borderRadius: 3, overflow: 'hidden', gap: 2 },
  start: { alignSelf: 'flex-start', marginTop: space.md },
  sample: { padding: space.lg, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, marginBottom: space.lg },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.4, color: colors.gold, marginBottom: space.sm, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  stepLabel: { flex: 1, fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  stepValue: { minWidth: 64, textAlign: 'center', fontFamily: fonts.numbers, fontSize: 14, color: colors.text },
  pageSwatch: { minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.field, borderWidth: 2, borderColor: colors.border },
  pageOn: { borderColor: colors.gold },
  pageText: { fontFamily: fonts.ui, fontSize: 14 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  toggleTitle: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  toggleNote: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  tool: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.sm, borderRadius: radius.field },
  toolIcon: { width: 44, height: 44, borderRadius: radius.field, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A2210' },
  toolIconOn: { backgroundColor: colors.gold },
  toolTitle: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  toolNote: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingLeft: space.md,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.sky,
    backgroundColor: colors.surface,
  },
  listenText: { fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  rate: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rateText: { fontFamily: fonts.numbers, fontSize: 13, color: colors.gold },
});
