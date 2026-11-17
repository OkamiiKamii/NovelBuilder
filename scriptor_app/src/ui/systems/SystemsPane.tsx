// ORGANIZE › SYSTEMS (FEATURES.md #228–#229): the novel's own blueprints for how characters grow. With none yet, the
// GALLERY: your book's own system first when the pages describe one (read a moment after the page is drawn, kept while
// nothing it was read from changes; "Begin with your book's system" makes the system and the hero's sheet in one
// press), then a card for each preset with an example status window, and "Begin blank". With systems, each as a card
// (opening its page, ./SystemScreen.tsx), and a new one from blank or a preset. The pure parts are
// src/domain/systems/screens/{gallery,systemsPage}.ts; a port of flutter_app/lib/features/progression/systems_page.dart
// (its gallery half) and widgets/system_gallery.dart.

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { StoryModel } from '../../domain/model/storyModel';
import { type PagesSystem, ownSystemJob } from '../../domain/systems/fromPages';
import { type SystemPreset, blankBlueprint, systemPresets } from '../../domain/systems/systemPresets';
import { galleryColumns, galleryWords, ownSystemCard, presetCard, presetIcon } from '../../domain/systems/screens/gallery';
import { type StatusWindowView, type WindowRow, statusWindowView, windowInk } from '../../domain/systems/screens/statusWindow';
import {
  beginOwn,
  createSystem,
  ownReadingKey,
  ownSystemHolder,
  systemsModeKey,
  systemsOf,
  systemsPath,
  systemsWords,
} from '../../domain/systems/screens/systemsPage';
import type { JsonMap } from '../../domain/json';
import { ActionSheet } from '../dialogs';
import { GoldButton, Icon, type IconName, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { useCast } from '../organize/useCast';
import { useSystems } from './useSystems';
import { LevelsView } from './PageReadings';

/** Each preset's motif (Material's names in the Flutter app, Material Community's here). */
export function motifIcon(presetIconName: string): IconName {
  switch (presetIconName) {
    case 'sports_esports_outlined':
      return 'gamepad-variant-outline';
    case 'self_improvement':
      return 'meditation';
    case 'auto_fix_high':
      return 'auto-fix';
    case 'bolt':
      return 'lightning-bolt';
    default:
      return 'family-tree';
  }
}

/** The book's own system as last read, by what it was read from (a few kept; a reading is the whole book). */
const ownReadings = new Map<string, PagesSystem | null>();

export function SystemsPane() {
  const sys = useSystems();
  const open = useCast();
  const lib = useLibrary();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [choosing, setChoosing] = useState(false);
  const model = useMemo(() => (sys ? StoryModel.fromSnapshot(sys.snapshot) : null), [sys]);

  // What the book's own system is read from, and the reading (off the first frame; kept while nothing changes).
  const reading = useMemo(() => {
    if (!sys || !model) return null;
    const numbers = model.order.chapterNumber;
    const entryPowers = [...model.entries.values()].filter((e) => e.category === 'power').map((e) => e.name);
    const key = ownReadingKey(sys.novelId, lib.novels.versionOf(sys.novelId, ['chapterContents']), numbers, entryPowers);
    return { key, numbers, entryPowers };
  }, [sys, model, lib]);
  const [own, setOwn] = useState<{ key: string; system: PagesSystem | null } | null>(null);
  const empty = model !== null && model.systems.size === 0;
  useEffect(() => {
    if (!sys || !reading || !empty) return;
    if (ownReadings.has(reading.key)) {
      setOwn({ key: reading.key, system: ownReadings.get(reading.key) ?? null });
      return;
    }
    const t = setTimeout(() => {
      const stored = lib.novels.rowsIn(sys.novelId, 'chapterContents').map((r) => JSON.stringify(r));
      const found = ownSystemJob(stored, reading.numbers, reading.entryPowers)();
      if (ownReadings.size >= 8) ownReadings.clear();
      ownReadings.set(reading.key, found);
      setOwn({ key: reading.key, system: found });
    }, 30);
    return () => clearTimeout(t);
  }, [sys, reading, empty, lib]);

  if (!sys || !model) return null;
  const { systems } = systemsOf(model, null);

  /** Makes a system and shows its blueprint (a new one is built in its rules first). */
  const create = (content: JsonMap) => {
    const made = sys.now(createSystem(content));
    if (made) router.navigate(systemsPath({ systemId: made.id, tab: 'variables' }) as never);
  };
  const ownSystem = own !== null && own.key === reading?.key ? own.system : null;
  const holder = ownSystem && open ? ownSystemHolder(ownSystem, open.cast.list) : null;
  const begin = () => {
    if (!ownSystem) return;
    const made = sys.now(beginOwn(ownSystem, holder?.holderId ?? null));
    if (!made) return;
    // Begun from the pages, it already holds the hero and what they can do: shown in the story, their window first.
    lib.saves.saveNow(`setting:${systemsModeKey}`, () => {
      lib.settings.write(systemsModeKey, 'story');
      lib.novels.touchSettings();
    });
    router.navigate(systemsPath({ systemId: made.id }) as never);
  };

  const columns = galleryColumns(width - space.md * 2);
  const cardWidth = columns === 1 ? width - space.md * 2 : (width - space.md * 2 - 14) / 2;

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {systems.length > 0 ? (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {systemsWords.title}
          </Text>
          {systems.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${s.name}`}
              onPress={() => router.navigate(systemsPath({ systemId: s.id }) as never)}
              style={({ pressed }) => [styles.systemCard, pressed && { borderColor: colors.gold }]}
            >
              <View style={styles.circle}>
                <Icon name="family-tree" size={22} color={colors.onGold} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardName}>{s.name}</Text>
                {s.description.length > 0 && <Muted numberOfLines={2}>{s.description}</Muted>}
                <Muted>
                  {[
                    `${s.variables.length} attributes & resources`,
                    `${s.tracks.length} levels & realms`,
                    `${model.sheets.filter((x) => x.systemId === s.id).length} sheets`,
                  ].join(' · ')}
                </Muted>
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          ))}
          <View style={styles.row}>
            <GoldButton label={systemsWords.blank} icon="plus" compact onPress={() => create(blankBlueprint)} />
            <OutlineButton label={systemsWords.preset} compact onPress={() => setChoosing(true)} accessibilityLabel={systemsWords.presetTooltip} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {galleryWords.title}
          </Text>
          <Text style={styles.intro}>{galleryWords.intro}</Text>
          {ownSystem && (
            <OwnSystemCard own={ownSystem} holder={holder?.holderName ?? null} onBegin={begin} />
          )}
          <View style={styles.cards}>
            {systemPresets.map((p) => (
              <PresetCard key={p.id} preset={p} width={cardWidth} holder={open?.cast.list.find((l) => l.profile.roles.includes('Protagonist'))?.entry.name ?? null} onBegin={() => create(p.content)} />
            ))}
            <Panel style={[styles.card, { width: cardWidth }]}>
              <View style={styles.cardHead}>
                <View style={styles.circleMuted}>
                  <Icon name="plus" size={22} color={colors.text} />
                </View>
                <Text style={styles.cardName}>{galleryWords.blankName}</Text>
              </View>
              <Text style={styles.description}>{galleryWords.blankDescription}</Text>
              <OutlineButton label={galleryWords.blank} icon="plus" onPress={() => create(blankBlueprint)} style={styles.start} />
            </Panel>
          </View>
          {/* Levels need no system: what the chapters give a level to is kept all the same (levels_view.dart). */}
          {sys && <LevelsView sys={sys} />}
        </>
      )}
      <ActionSheet
        visible={choosing}
        title={systemsWords.presetTooltip}
        onClose={() => setChoosing(false)}
        actions={systemPresets.map((p) => ({ label: p.name, icon: motifIcon(presetIcon(p.id)), onPress: () => create(p.content) }))}
      />
    </ScrollView>
  );
}

function PresetCard({ preset, width, holder, onBegin }: { preset: SystemPreset; width: number; holder: string | null; onBegin: () => void }) {
  const card = presetCard(preset, holder);
  const view = useMemo(
    () => statusWindowView({ content: preset.content, presetId: preset.id, holder: card.holder, held: card.held, caption: card.caption, compact: true }),
    [preset, card.holder, card.held, card.caption],
  );
  return (
    <Panel style={[styles.card, { width }]}>
      <View style={styles.cardHead}>
        <View style={styles.circle}>
          <Icon name={motifIcon(card.icon)} size={22} color={colors.onGold} />
        </View>
        <Text style={styles.cardName}>{preset.name}</Text>
      </View>
      <Text style={styles.description}>{preset.description}</Text>
      {card.lines.map(([label, value]) => (
        <Text key={label} style={styles.line}>
          <Text style={styles.lineLabel}>{label}</Text>
          {'  '}
          {value}
        </Text>
      ))}
      <ExampleWindow view={view} />
      <GoldButton label={card.begin} onPress={onBegin} style={styles.start} />
    </Panel>
  );
}

function OwnSystemCard({ own, holder, onBegin }: { own: PagesSystem; holder: string | null; onBegin: () => void }) {
  const card = ownSystemCard(own, holder);
  const view = useMemo(
    () => statusWindowView({ content: own.content, presetId: own.preset.id, holder: card.holder, held: card.held, caption: card.caption, compact: true }),
    [own, card.holder, card.held, card.caption],
  );
  return (
    <Panel style={styles.own}>
      <View style={styles.cardHead}>
        <View style={[styles.circle, { width: 40, height: 40, borderRadius: 20 }]}>
          <Icon name={motifIcon(card.icon)} size={22} color={colors.onGold} />
        </View>
        <Text style={styles.cardName}>{galleryWords.ownTitle}</Text>
      </View>
      <Text style={styles.description}>{card.said}</Text>
      <View style={{ maxWidth: 560 }}>
        <ExampleWindow view={view} />
      </View>
      <GoldButton label={galleryWords.ownBegin} icon="auto-fix" onPress={onBegin} />
    </Panel>
  );
}

/** A status window shown only (a preset's example, the book's own as it would begin): the dress of its kind, its
 * head, then each part after a rule. The windows of a novel's own sheets, editable and alive, are StatusWindow.tsx's. */
function ExampleWindow({ view }: { view: StatusWindowView }) {
  const look = view.look;
  const face = look.mono ? fonts.numbers : fonts.book;
  const part = (rows: WindowRow[], key: string) =>
    rows.length === 0 ? null : (
      <View key={key}>
        <View style={[styles.rule, { backgroundColor: look.accent, opacity: 0.28 }]} />
        {rows.map((r, i) => {
          if (r.kind === 'line') {
            return (
              <View key={i} style={styles.windowLine}>
                <Text style={[styles.windowLabel, { fontFamily: face }]}>{r.label}</Text>
                <Text style={[styles.windowValue, { fontFamily: face }, (r.strong || r.raised) && styles.bold, r.raised && { color: look.accent }]}>
                  {r.value}
                  {r.raised ? ' ▲' : ''}
                </Text>
              </View>
            );
          }
          if (r.kind === 'bar') {
            return (
              <View key={i} style={styles.bar}>
                <Text style={[styles.barName, { color: look.accent, fontFamily: face }]} numberOfLines={1}>
                  {r.name}
                </Text>
                <View style={[styles.barTrack, { borderColor: look.accent }]}>
                  <View style={[styles.barFill, { width: `${Math.round(Math.max(0, Math.min(1, r.part)) * 100)}%`, backgroundColor: look.accent }]} />
                </View>
                <Text style={[styles.barValue, { fontFamily: face }]}>{r.value}</Text>
              </View>
            );
          }
          return null;
        })}
      </View>
    );
  return (
    <View style={styles.windowWrap}>
      <LinearGradient
        colors={[look.top, look.bottom]}
        style={[styles.window, { borderColor: look.accent, shadowColor: look.accent }]}
        accessible
        accessibilityLabel={view.semanticsLabel}
      >
        <View style={styles.windowHead}>
          <Text style={[styles.bracket, { color: look.accent }]}>[</Text>
          <Text style={[styles.heading, { fontFamily: face }]} numberOfLines={1}>
            {view.heading.toUpperCase()}
          </Text>
          <Text style={[styles.bracket, { color: look.accent }]}>]</Text>
        </View>
        {part(view.standing, 'standing')}
        {part(view.resources, 'resources')}
        {part(view.attributes, 'attributes')}
        {part(view.follows, 'follows')}
        {view.groups.map((g) => (
          <View key={g.id}>
            <View style={[styles.rule, { backgroundColor: look.accent, opacity: 0.28 }]} />
            <Text style={[styles.groupLabel, { color: look.accent }]}>{g.label.toUpperCase()}</Text>
            <View style={styles.chips}>
              {g.held.map((h) => (
                <View key={h.id} style={[styles.held, { borderColor: look.accent }]}>
                  <Text style={[styles.heldName, { fontFamily: face }]}>
                    <Text style={{ color: look.accent }}>[</Text>
                    {h.name}
                    <Text style={{ color: look.accent }}>]</Text>
                    {h.rank ? <Text style={[styles.heldSmall, { color: look.accent }]}>{`  ${h.rank}`}</Text> : null}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </LinearGradient>
      {view.caption.length > 0 && <Text style={styles.caption}>{view.caption}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  body: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  title: { fontFamily: fonts.display, fontSize: 18, fontWeight: '700', color: colors.text },
  intro: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 23, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { gap: space.sm },
  own: { gap: space.sm, paddingTop: 18, paddingBottom: 16, paddingHorizontal: 18 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  circle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  circleMuted: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cardName: { flexShrink: 1, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  description: { fontFamily: fonts.ui, fontSize: 16, lineHeight: 22, color: colors.text },
  line: { fontFamily: fonts.ui, fontSize: 15.5, color: colors.muted },
  lineLabel: { color: colors.gold },
  systemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // the example window
  windowWrap: { gap: 6 },
  window: { borderRadius: 6, borderWidth: 1.2, paddingHorizontal: 16, paddingVertical: 14, shadowOpacity: 0.22, shadowRadius: 18, elevation: 4 },
  windowHead: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  bracket: { fontSize: 15, fontWeight: '700' },
  heading: { fontSize: 13.5, fontWeight: '700', letterSpacing: 3, color: windowInk, flexShrink: 1 },
  rule: { height: 1, marginVertical: 8 },
  windowLine: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, paddingVertical: 2 },
  windowLabel: { flexShrink: 1, fontSize: 13, color: windowInk, opacity: 0.72 },
  windowValue: { fontSize: 13.5, color: windowInk, textAlign: 'right' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  barName: { width: 76, fontSize: 12.5, fontWeight: '700' },
  barTrack: { flex: 1, height: 9, borderRadius: 2, borderWidth: 0.8, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: '100%', opacity: 0.85 },
  barValue: { fontSize: 12.5, color: windowInk },
  groupLabel: { fontFamily: fonts.ui, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.6, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  held: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 3, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  heldName: { fontSize: 13, fontWeight: '700', color: windowInk },
  heldSmall: { fontSize: 11, fontWeight: '400' },
  caption: { fontFamily: fonts.bookItalic, fontSize: 14.5, color: colors.muted },
});
