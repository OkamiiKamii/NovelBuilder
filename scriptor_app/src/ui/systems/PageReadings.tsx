// What Systems reads in the pages (FEATURES.md #243–#245): THE LEDGER (the numbers the chapters give for a system's
// stats and levels, and where they do not add up), IN YOUR PAGES, NOT IN THE SYSTEM (skills, titles, classes and items
// the chapters name the system's way, one press from the blueprint), and LEVELS (everything the chapters give a level
// to, and whose it is; a character's own on their Overview). Each is read from the saved chapters a moment after the
// screen draws. Ports of flutter_app/lib/features/progression/widgets/{number_ledger_view,pages_names_view,levels_view}
// .dart; the logic is src/domain/progression/screens/{ledgerView,pagesNamesView,levelsView}.ts.

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { characterPath } from '../../domain/characters/screens/create';
import { StoryModel } from '../../domain/model/storyModel';
import { ledgerJob, ledgerLine, ledgerWords, slipCard, slipReadThere, slipsCount } from '../../domain/progression/screens/ledgerView';
import {
  backwardsColour,
  giveChoices,
  giveLevel,
  levelledThing,
  levelsAside,
  levelsAsideKey,
  levelsAssigned,
  levelsJob,
  levelsList,
  levelsOnSystems,
  levelsOwnersKey,
  levelsReadingKey,
  levelsWords,
  setAsideLevel,
  stepReadThere,
  stepsDrawing,
  theirLevels,
} from '../../domain/progression/screens/levelsView';
import { addNames, notPartAfter, pagesNamesJob, pagesNamesView, pagesNamesWords, setAsideKey } from '../../domain/progression/screens/pagesNamesView';
import type { Levelled } from '../../domain/systems/levelsInPages';
import type { Ledger } from '../../domain/systems/numberLedger';
import type { PageName } from '../../domain/systems/pagesNames';
import { dartToLowerCase } from '../../domain/text/dartString';
import { ActionSheet } from '../dialogs';
import { Chip, Icon, type IconName, Muted, OutlineButton, Panel, ProgressBar } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { useOpenChapter } from '../write/pendingFind';
import type { OpenCast } from '../organize/useCast';
import { useCast } from '../organize/useCast';
import type { OpenSystems } from './useSystems';
import { Skeleton } from '../states';

// ------------------------------------------------------------------------------------------------------ shared parts

/** The saved chapters as the reading jobs take them (each record as JSON text), and the version of their text. */
function useStored(novelId: string): { stored: () => string[]; version: number } {
  const lib = useLibrary();
  useLibraryRevision();
  const version = lib.novels.versionOf(novelId, ['chapterContents']);
  return { stored: () => lib.novels.rowsIn(novelId, 'chapterContents').map((r) => JSON.stringify(r)), version };
}

/** A reading made a moment after the screen draws, again whenever `key` changes; undefined while it is read. */
function useReading<T>(key: string, read: () => T): T | undefined {
  const [kept, setKept] = useState<{ key: string; value: T } | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const value = read();
      if (live) setKept({ key, value });
    }, 30);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return kept !== null && kept.key === key ? kept.value : undefined;
}

/** Writes a device setting at once, and has the screens read it again. */
function useStoreSetting(): (key: string, value: unknown) => void {
  const lib = useLibrary();
  return (key, value) =>
    lib.saves.saveNow(`setting:${key}`, () => {
      lib.settings.write(key, value);
      lib.novels.touchSettings();
    });
}

function Head({ icon, heading, right }: { icon: IconName; heading: string; right?: React.ReactNode }) {
  return (
    <View style={styles.head}>
      <Icon name={icon} size={18} />
      <Text style={styles.heading}>{heading}</Text>
      <View style={styles.flex} />
      {right}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------- ledger

export function NumberLedgerView({ sys, systemId }: { sys: OpenSystems; systemId: string }) {
  const model = useMemo(() => StoryModel.fromSnapshot(sys.snapshot), [sys.snapshot]);
  const system = model.systems.get(systemId) ?? null;
  const { stored, version } = useStored(sys.novelId);
  const openChapter = useOpenChapter(sys.novelId);
  const key = system === null ? '' : `${systemId}\u0000${version}\u0000${JSON.stringify(system.raw)}\u0000${model.sheets.length}`;
  const ledger = useReading<Ledger | null>(key, () => (system === null ? null : ledgerJob(model, system, stored())()));
  if (system === null) return null;
  const count = slipsCount(ledger ?? null);
  return (
    <Panel style={styles.box}>
      <Head
        icon="receipt"
        heading={ledgerWords.heading}
        right={count ? <Text style={styles.pill}>{count}</Text> : null}
      />
      <Text style={styles.line}>{ledgerWords.line}</Text>
      {ledger === undefined ? (
        <ProgressBar value={0.3} showPercent={false} />
      ) : ledger === null || ledger.lines.length === 0 ? (
        <Muted>{ledgerWords.empty}</Muted>
      ) : (
        <View style={styles.gapSm}>
          {ledger.slips.length === 0 ? (
            <View style={styles.row}>
              <Icon name="check-circle-outline" size={18} color={colors.success} />
              <Text style={styles.body}>{ledgerWords.allGood}</Text>
            </View>
          ) : (
            ledger.slips.map((slip, i) => {
              const card = slipCard(slip);
              const there = slipReadThere(slip);
              return (
                <View key={i} style={styles.slip}>
                  <Text style={styles.kicker}>{card.kicker}</Text>
                  <Text style={styles.says}>{card.says}</Text>
                  <Text style={styles.said} numberOfLines={2}>
                    {card.said}
                  </Text>
                  <OutlineButton label={card.read} icon="book-open-outline" compact tone="muted" onPress={() => openChapter(there.nodeId, there)} style={styles.end} />
                </View>
              );
            })
          )}
          {ledger.lines.map((l) => {
            const shown = ledgerLine(l);
            return (
              <View key={l.name} style={styles.ledgerRow} accessibilityLabel={shown.semanticsLabel}>
                <Text style={styles.ledgerName} numberOfLines={2}>
                  {shown.name}
                </Text>
                <Text style={styles.flex}>
                  {shown.more && <Text style={styles.small}>… </Text>}
                  {shown.numbers.map((n, i) => (
                    <Text key={i}>
                      {i > 0 && <Text style={styles.small}> → </Text>}
                      <Text style={[styles.number, n.last && styles.numberLast]}>{n.value}</Text>
                      <Text style={styles.small}>{n.chapter}</Text>
                    </Text>
                  ))}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------- in your pages, not in it

export function PagesNamesView({ sys, systemId }: { sys: OpenSystems; systemId: string }) {
  const lib = useLibrary();
  const toast = useToast();
  const storeSetting = useStoreSetting();
  const model = useMemo(() => StoryModel.fromSnapshot(sys.snapshot), [sys.snapshot]);
  const system = model.systems.get(systemId) ?? null;
  const { stored, version } = useStored(sys.novelId);
  const aside = lib.settings.read(setAsideKey(systemId));
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const known = system === null ? '' : system.items.map((i) => i.name).join('|');
  const key = `${systemId}\u0000${version}\u0000${known}\u0000${JSON.stringify(aside ?? null)}`;
  const found = useReading<PageName[]>(key, () => (system === null ? [] : pagesNamesJob(model, system, stored(), aside)()));
  if (system === null || found === undefined) return null;
  const view = pagesNamesView(system, found, done);
  if (view === null) return null;
  const add = (names: readonly PageName[]) => {
    const made = addNames(model, systemId, names);
    if (sys.now(made.change) !== undefined) {
      setDone(new Set([...done, ...names.map((n) => dartToLowerCase(n.name))]));
      toast(made.said);
    }
  };
  return (
    <Panel style={styles.box}>
      <Head
        icon="auto-fix"
        heading={pagesNamesWords.heading}
        right={view.addAll ? <OutlineButton label={view.addAll} compact onPress={() => add(view.names)} /> : null}
      />
      <Text style={styles.line}>{pagesNamesWords.line}</Text>
      {view.shown.map((s) => (
        <View key={s.name.name} style={styles.nameCard}>
          <Text style={styles.bracket}>{s.title}</Text>
          <Text style={styles.kind}>{s.kind}</Text>
          <Text style={styles.said} numberOfLines={2}>
            {s.said}
          </Text>
          <View style={styles.row}>
            <OutlineButton label={s.add} icon="plus" compact onPress={() => add([s.name])} />
            <OutlineButton
              label={pagesNamesWords.notPart}
              compact
              tone="muted"
              onPress={() => {
                setDone(new Set([...done, dartToLowerCase(s.name.name)]));
                storeSetting(setAsideKey(systemId), notPartAfter(lib.settings.read(setAsideKey(systemId)), s.name));
              }}
            />
          </View>
        </View>
      ))}
      {view.more && <Muted>{view.more}</Muted>}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------- levels

/** What the chapters give a level to, read for the open novel (with the author's word on what is not a level, and
 * whose each is). */
function useLevels(open: OpenCast | null): { levels: Levelled[] | undefined; aside: unknown; owners: unknown } {
  const lib = useLibrary();
  const novelId = open?.novelId ?? '';
  const { stored, version } = useStored(novelId);
  const aside = lib.settings.read(levelsAsideKey(novelId));
  const owners = lib.settings.read(levelsOwnersKey(novelId));
  const cast = open?.cast ?? null;
  const key = cast === null ? '' : levelsReadingKey(cast, levelsAside(aside), levelsAssigned(owners), version);
  const levels = useReading<Levelled[]>(key, () =>
    cast === null ? [] : levelsJob(cast, stored(), levelsAside(aside), levelsAssigned(owners))(),
  );
  return { levels, aside, owners };
}

/** LEVELS on Systems: who holds what, and what is no one's. `sys` only names the novel (the reading is the cast's). */
export function LevelsView({ sys }: { sys: OpenSystems }) {
  const open = useCast();
  const { levels, aside, owners } = useLevels(open);
  if (!open || open.novelId !== sys.novelId) return null;
  const on = levels === undefined ? null : levelsOnSystems(open.cast, levels);
  return (
    <Panel style={styles.box}>
      <Head icon="stairs" heading={levelsWords.heading} />
      <Text style={styles.line}>{levelsWords.systemsLine}</Text>
      {levels === undefined || on === null ? (
        <Skeleton label={levelsWords.reading} lines={3} heading={false} caption />
      ) : levels.length === 0 ? (
        <Text style={styles.emptyLine}>{levelsWords.empty}</Text>
      ) : (
        <>
          {on.holders.length > 0 && (
            <View style={styles.gapSm}>
              <Text style={styles.sub}>{levelsWords.onTheirPages}</Text>
              <View style={styles.wrap}>
                {on.holders.map((h) => (
                  <HolderChip key={h.key} id={h.id} label={h.label} />
                ))}
              </View>
            </View>
          )}
          {on.noOnes.length > 0 && (
            <View style={styles.gapSm}>
              <Text style={styles.sub}>{levelsWords.noOnes}</Text>
              <LevelsList open={open} things={on.noOnes} aside={aside} owners={owners} />
            </View>
          )}
        </>
      )}
    </Panel>
  );
}

function HolderChip({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return <Chip label={label} selected={false} onPress={() => router.navigate(characterPath(id))} />;
}

/** A character's levels, on their Overview: their own level first, then those of what they carry. */
export function TheirLevelsView({ open, entryId }: { open: OpenCast; entryId: string }) {
  const { levels, aside, owners } = useLevels(open);
  if (levels === undefined) return null;
  const theirs = theirLevels(open.cast, entryId, levels);
  if (theirs === null) return null;
  return (
    <Panel style={styles.box}>
      <Head icon="stairs" heading={levelsWords.heading} />
      <Text style={styles.line}>{theirs.line}</Text>
      <LevelsList open={open} things={theirs.things} aside={aside} owners={owners} titleOf={theirs.titleOf} notTheirsSaid={theirs.notTheirsSaid} />
    </Panel>
  );
}

function LevelsList({
  open,
  things,
  aside,
  owners,
  titleOf,
  notTheirsSaid,
}: {
  open: OpenCast;
  things: Levelled[];
  aside: unknown;
  owners: unknown;
  titleOf?: (l: Levelled) => string;
  notTheirsSaid?: (l: Levelled) => string;
}) {
  const list = levelsList(things);
  return (
    <View style={styles.gapSm}>
      {list.slips && <Text style={styles.slipLine}>{list.slips}</Text>}
      {list.groups.map((g) => (
        <View key={g.key} style={styles.levelGroup}>
          {g.heading && <Text style={styles.sub}>{g.heading}</Text>}
          {g.things.map((l, i) => (
            <View key={l.name}>
              {i > 0 && <View style={styles.divider} />}
              <LevelledRow open={open} l={l} title={titleOf ? titleOf(l) : l.name} aside={aside} owners={owners} notTheirsSaid={notTheirsSaid} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function LevelledRow({
  open,
  l,
  title,
  aside,
  owners,
  notTheirsSaid,
}: {
  open: OpenCast;
  l: Levelled;
  title: string;
  aside: unknown;
  owners: unknown;
  notTheirsSaid?: (l: Levelled) => string;
}) {
  const toast = useToast();
  const storeSetting = useStoreSetting();
  const openChapter = useOpenChapter(open.novelId);
  const [opened, setOpened] = useState(false);
  const [giving, setGiving] = useState(false);
  const shown = levelledThing(l);
  const drawing = l.steps.length > 1 ? stepsDrawing(l.steps) : null;
  const give = giveChoices(open.cast, l);
  return (
    <View style={styles.gapSm}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: opened }} onPress={() => setOpened(!opened)} style={styles.levelHead}>
        <View style={styles.flex}>
          <Text style={styles.levelTitle}>{title}</Text>
          <Text style={styles.small}>{shown.since}</Text>
        </View>
        {drawing && (
          <Svg width={70} height={28}>
            <Path d={drawing.path} stroke={colors.gold} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {drawing.dots.map((d, i) => (
              <Circle key={i} cx={d.x} cy={d.y} r={2.5} fill={d.backwards ? backwardsColour : colors.gold} />
            ))}
          </Svg>
        )}
        <View style={styles.levelBox}>
          <Text style={styles.levelLabel}>LEVEL</Text>
          <Text style={styles.levelNumber}>{shown.level}</Text>
        </View>
        <Icon name={opened ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
      </Pressable>
      {opened && (
        <View style={styles.gapSm}>
          {shown.steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <Text style={[styles.stepWhen, s.backwards !== null && { color: colors.danger }]}>{s.when}</Text>
              <View style={[styles.flex, styles.gapXs]}>
                <Text style={styles.said}>{s.sentence}</Text>
                {s.up && <Muted>{s.up}</Muted>}
                {s.backwards && <Text style={styles.slipLine}>{s.backwards}</Text>}
                <OutlineButton label={levelsWords.readThere} icon="book-open-outline" compact tone="muted" onPress={() => openChapter(stepReadThere(s.step).nodeId, stepReadThere(s.step))} style={styles.start} />
              </View>
            </View>
          ))}
          <View style={styles.wrap}>
            {l.owner !== null && (
              <OutlineButton
                label={levelsWords.notTheirs}
                compact
                tone="muted"
                onPress={() => {
                  storeSetting(levelsOwnersKey(open.novelId), giveLevel(owners, l, null));
                  if (notTheirsSaid) toast(notTheirsSaid(l));
                }}
              />
            )}
            <OutlineButton label={levelsWords.give} compact tone="muted" onPress={() => setGiving(true)} />
            <OutlineButton
              label={levelsWords.notALevel}
              compact
              tone="muted"
              onPress={() => {
                const s = setAsideLevel(aside, l);
                storeSetting(levelsAsideKey(open.novelId), s.store);
                toast(s.said);
              }}
            />
          </View>
        </View>
      )}
      {giving && (
        <ActionSheet
          visible
          title={give.title}
          onClose={() => setGiving(false)}
          actions={give.people.map((p) => ({
            label: p.name,
            icon: 'account-outline' as IconName,
            onPress: () => {
              storeSetting(levelsOwnersKey(open.novelId), giveLevel(owners, l, p.id));
              toast(give.said(p.id));
            },
          }))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  start: { alignSelf: 'flex-start' },
  end: { alignSelf: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  box: { gap: space.sm, borderRadius: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heading: { fontFamily: fonts.display, fontSize: 12, fontWeight: '700', letterSpacing: 2, color: colors.gold },
  sub: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.gold },
  line: { fontFamily: fonts.bookItalic, fontSize: 14.5, lineHeight: 21, color: colors.muted },
  emptyLine: { fontFamily: fonts.bookItalic, fontSize: 14.5, lineHeight: 21, color: colors.muted },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  pill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.danger, color: colors.background, fontFamily: fonts.ui, fontSize: 12, fontWeight: '700' },
  slip: { gap: 4, padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(248, 113, 113, 0.4)', backgroundColor: 'rgba(248, 113, 113, 0.12)' },
  kicker: { fontFamily: fonts.ui, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.danger },
  says: { fontFamily: fonts.ui, fontSize: 15.5, color: colors.text },
  said: { fontFamily: fonts.bookItalic, fontSize: 14, lineHeight: 20, color: colors.text },
  ledgerRow: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
  ledgerName: { width: 96, fontFamily: fonts.display, fontSize: 13, fontWeight: '700', color: colors.text },
  number: { fontFamily: fonts.numbers, fontSize: 14, color: colors.text },
  numberLast: { fontWeight: '700', color: colors.gold },
  nameCard: { gap: 4, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  bracket: { fontFamily: fonts.numbers, fontSize: 16, fontWeight: '700', color: colors.text },
  kind: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold },
  slipLine: { fontFamily: fonts.ui, fontSize: 14, color: colors.danger },
  levelGroup: { gap: space.sm, padding: space.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
  levelHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  levelTitle: { fontFamily: fonts.display, fontSize: 16, fontWeight: '700', color: colors.text },
  levelBox: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(243, 182, 58, 0.16)' },
  levelLabel: { fontFamily: fonts.ui, fontSize: 9, fontWeight: '700', letterSpacing: 1.2, color: colors.gold },
  levelNumber: { fontFamily: fonts.numbers, fontSize: 20, fontWeight: '900', color: colors.text },
  step: { flexDirection: 'row', gap: space.sm },
  stepWhen: { width: 74, fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
});
