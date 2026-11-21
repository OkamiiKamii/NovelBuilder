// THE WORLD (Organize → World, FEATURES.md #201–#207): places, factions, items, powers, lore and the author's own
// kinds of record. Top to bottom: New entry and Categories & fields; FOUND IN YOUR PAGES (what the chapters name that
// the world does not hold yet); with no entries, THE FIRST PAGE OF YOUR WORLD (a paragraph to finish); else the
// VOLUMES (a kind each, a press to choose it), the WORLD CHART (with no volume chosen), the search and the tag, the
// count, and the ENCYCLOPEDIA filed by letter with its letter bar. A port of flutter_app/lib/features/codex/
// world_page.dart, widgets/encyclopedia.dart, widgets/world_charter.dart and widgets/found_in_pages.dart; what is shown
// is src/domain/codex/screens/{world,worldCharter,foundInPages}.ts.

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { PageScroll } from '../pageScroll';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { boundLook, cssOf, rgbaOf } from '../../domain/characters/aids/colour';
import { isUploadedImage } from '../../domain/characters/screens/profile';
import { firstReading, KeptReadings } from '../../domain/characters/views/keptReadings';
import { inkOn, withAlpha } from '../../domain/characters/views/common';
import { worldEntryPath } from '../../domain/codex/screens/entryPage';
import {
  addFind,
  type FindCard,
  findColumns,
  foundInPages,
  foundWords,
  notAnEntryAfter,
  notEntriesKey,
  worldFindsFor,
} from '../../domain/codex/screens/foundInPages';
import {
  type Article,
  articleColumns,
  countLine,
  dropCap,
  encyclopedia,
  kindColor,
  kindOfEntry,
  volumeColumns,
  volumePressed,
  worldShelves,
  worldVisible,
  worldVolumes,
  worldWords,
} from '../../domain/codex/screens/world';
import { blankTag, charterAny, charterAsked, charterMessage, charterParts, charterWords, blankWidth, foundWorld } from '../../domain/codex/screens/worldCharter';
import type { WorldFind } from '../../domain/codex/worldFinder';
import { ActionSheet } from '../dialogs';
import { GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { ChooserField } from './parts';
import { QuickEntrySheet } from './QuickEntrySheet';
import { SortTypesCard } from './SortTypesCard';
import { type OpenCast, useCast } from './useCast';
import { WorldChart } from './WorldChart';

const kept = new KeptReadings();

/** The world's finds in the saved chapters: read a moment after the page is drawn, kept per writes to the text. */
function useFinds(open: OpenCast): WorldFind[] | undefined {
  const lib = useLibrary();
  const known = open.cast.entries.map((e) => e.name).join('|') + [...open.cast.profiles.values()].map((p) => p.aliases.join('|')).join('|');
  const key = `world\u0000${open.novelId}\u0000${lib.novels.versionOf(open.novelId, ['chapterContents'])}\u0000${known}\u0000${open.cast.model.order.chapters.map((c) => c.id).join(',')}`;
  const [read, setRead] = useState<{ key: string; value: WorldFind[] } | null>(null);
  const job = useRef(() => worldFindsFor(open.cast, open.service.store.rowsIn(open.novelId, 'chapterContents')));
  useEffect(() => {
    job.current = () => worldFindsFor(open.cast, open.service.store.rowsIn(open.novelId, 'chapterContents'));
  });
  useEffect(() => {
    if (kept.has(key)) return;
    let live = true;
    const t = setTimeout(() => {
      kept.read(key, () => Promise.resolve().then(() => job.current())).then(
        (value) => {
          if (live) setRead({ key, value });
        },
        () => {},
      );
    }, 30);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  if (read?.key === key) return read.value;
  return firstReading(kept, key, undefined as WorldFind[] | undefined);
}

export function WorldPane() {
  const open = useCast();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const compact = sizeClassOf(width) === 'compact';
  const scroll = useRef<KeyboardAwareScrollViewRef>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [making, setMaking] = useState(false);
  const [encTop, setEncTop] = useState(0);
  const [letters] = useState(() => new Map<string, number>());

  const shelves = useMemo(() => (open ? worldShelves(open.cast) : null), [open]);
  if (!open || !shelves) return null;
  const { cast } = open;
  const visible = worldVisible(shelves.all, { category, tag, query });
  const kindOf = (e: Parameters<typeof kindOfEntry>[1]) => kindOfEntry(cast, e);
  const go = (id: string) => router.navigate(worldEntryPath(id) as never);
  const inner = width - space.md * 2;

  return (
    <View style={styles.flex}>
      <PageScroll ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.actions}>
          <GoldButton label={worldWords.newEntry} icon="plus" compact onPress={() => setMaking(true)} />
          <OutlineButton label={worldWords.kinds} icon="tune-variant" compact onPress={() => router.navigate('/organize/kinds' as never)} />
        </View>

        <SortTypesCard open={open} />

        <FoundInPages open={open} width={inner} />

        {shelves.all.length === 0 ? (
          <Charter open={open} width={inner} onMade={(n) => {
            const said = charterMessage(n);
            if (said) toast(said);
          }} />
        ) : (
          <>
            <Volumes shelves={shelves} selected={category} width={inner} compact={compact} onSelect={(k) => setCategory(volumePressed(category, k))} />
            {category === null && <WorldChart open={open} onOpen={go} />}
            <View style={[styles.searchRow, compact && styles.column]}>
              <View style={[styles.search, !compact && { width: 300 }]}>
                <Icon name="magnify" size={20} color={colors.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={worldWords.search}
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.gold}
                  style={styles.searchInput}
                  accessibilityLabel={worldWords.search}
                />
                {query.length > 0 && <IconButton icon="close" label={worldWords.clearSearch} onPress={() => setQuery('')} color={colors.muted} />}
              </View>
              {shelves.tags.length > 0 && (
                <View style={compact ? undefined : { width: 200 }}>
                  <ChooserField<string | null>
                    label={worldWords.tag}
                    value={tag}
                    choices={[{ value: null, label: worldWords.allTags }, ...shelves.tags.map((t) => ({ value: t, label: t }))]}
                    onChoose={setTag}
                  />
                </View>
              )}
            </View>
            <Muted>{countLine(visible.length, shelves.all.length)}</Muted>
            {visible.length === 0 ? (
              <View style={styles.none}>
                <Text style={styles.noneTitle}>{query.trim().length > 0 ? `Nothing matches “${query.trim()}”` : 'Nothing matches'}</Text>
                <OutlineButton
                  label="Clear the search and filters"
                  compact
                  onPress={() => {
                    setQuery('');
                    setCategory(null);
                    setTag(null);
                  }}
                />
              </View>
            ) : (
              <View onLayout={(e) => setEncTop(e.nativeEvent.layout.y)}>
                <Encyclopedia
                  entries={visible}
                  kindOf={kindOf}
                  mentions={cast.chaptersOf()}
                  chapterCount={cast.model.order.chapters.length}
                  columns={articleColumns(width, compact)}
                  width={inner}
                  onOpen={go}
                  onLetterAt={(l, y) => letters.set(l, y)}
                  onJump={(l) => {
                    const y = letters.get(l);
                    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, encTop + y - 8), animated: true });
                  }}
                />
              </View>
            )}
          </>
        )}
      </PageScroll>
      {making && <QuickEntrySheet open={open} kinds={shelves.kinds.filter((k) => !k.archived)} onClose={() => setMaking(false)} onSaved={go} />}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- found in pages

function FoundInPages({ open, width }: { open: OpenCast; width: number }) {
  const lib = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const [all, setAll] = useState(false);
  const [other, setOther] = useState<FindCard | null>(null);
  const finds = useFinds(open);
  const stored = lib.settings.read(notEntriesKey(open.novelId));
  if (!finds) return null;
  const panel = foundInPages(finds, stored, open.cast.model.categories, all);
  if (!panel) return null;
  const columns = Math.min(findColumns(width), panel.cards.length);
  const cardWidth = (width - 12 * (columns - 1)) / columns;
  const add = (card: FindCard, kind: string) => {
    const made = open.now((c) => addFind(c, card.find, kind));
    if (made) toast(made.tell, { action: { label: made.action, run: () => router.navigate(worldEntryPath(made.made.id) as never) } });
  };
  const aside = (card: FindCard) =>
    lib.saves.saveNow(`setting:${notEntriesKey(open.novelId)}`, () => {
      lib.settings.write(notEntriesKey(open.novelId), notAnEntryAfter(lib.settings.read(notEntriesKey(open.novelId)), card.find));
      lib.novels.touchSettings();
    });
  return (
    <View style={styles.found}>
      <Text style={styles.foundHeading}>{panel.heading}</Text>
      <Text style={styles.italicMuted}>{panel.intro}</Text>
      <View style={styles.cards}>
        {panel.cards.map((card) => (
          <View key={card.key} style={[styles.findCard, { width: cardWidth }]}>
            <View style={styles.findHead}>
              <View style={[styles.findMono, { backgroundColor: card.tone }]}>
                <Text style={[styles.findMonoText, { color: inkOn(card.tone) }]}>{card.monogram}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.findName} numberOfLines={2}>
                  {card.find.name}
                </Text>
                <Text style={styles.italicMuted}>{card.line}</Text>
              </View>
            </View>
            <View style={styles.findButtons}>
              <OutlineButton label={card.add} icon="plus" compact onPress={() => add(card, card.kind.key)} />
              {card.others.length > 0 && (
                <OutlineButton label={foundWords.another} compact tone="muted" accessibilityLabel={card.anotherTip} onPress={() => setOther(card)} />
              )}
              <OutlineButton label={foundWords.notAnEntry} compact tone="muted" onPress={() => aside(card)} />
            </View>
          </View>
        ))}
      </View>
      {panel.more && <OutlineButton label={panel.more} compact tone="muted" onPress={() => setAll(!all)} style={styles.start} />}
      <View style={styles.divider} />
      <ActionSheet
        visible={other !== null}
        title={other?.anotherTip ?? ''}
        onClose={() => setOther(null)}
        actions={(other?.others ?? []).map((k) => ({ label: k.label, icon: 'plus', onPress: () => other && add(other, k.key) }))}
      />
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------ the charter

function Charter({ open, width, onMade }: { open: OpenCast; width: number; onMade: (n: number) => void }) {
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const [focused, setFocused] = useState<string | null>(null);
  const kinds = open.cast.model.categories;
  const asked = charterAsked(kinds);
  if (asked.length === 0) {
    return (
      <Panel>
        <Muted>{charterWords.allArchived}</Muted>
      </Panel>
    );
  }
  const room = width - space.lg * 2;
  const parts = charterParts(asked);
  const begin = () => {
    const made = open.now((c) => foundWorld(c, names));
    if (made !== undefined) onMade(made);
  };
  return (
    <Panel style={styles.charter}>
      <Text style={styles.charterTitle}>{charterWords.title}</Text>
      <Text style={styles.italicMuted}>{charterWords.intro}</Text>
      <View style={styles.rule} />
      <View style={styles.prose}>
        {parts.map((p, i) => {
          if (p.kind === 'word') {
            return (
              <Text key={i} style={styles.proseWord}>
                {p.text}
              </Text>
            );
          }
          const kind = kinds.get(p.clause.kind)!;
          const tone = kindColor(kind);
          const value = names.get(p.clause.kind) ?? '';
          const shown = value.length > 0 ? value : p.clause.hint;
          const w = blankWidth(shown.length * 20 * 0.52, room);
          const on = focused === p.clause.kind;
          return (
            <View key={i} style={styles.blankRow}>
              <View style={{ width: w }}>
                <TextInput
                  value={value}
                  onChangeText={(v) => setNames(new Map(names).set(p.clause.kind, v))}
                  onFocus={() => setFocused(p.clause.kind)}
                  onBlur={() => setFocused(null)}
                  placeholder={p.clause.hint}
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.gold}
                  accessibilityLabel={`${kind.singular}: ${p.clause.before} … ${p.clause.after}`}
                  style={[styles.blank, { borderBottomColor: on ? tone : withAlpha(tone, 0.6), borderBottomWidth: on ? 2 : 1 }]}
                />
                <Text style={[styles.blankTag, { color: tone }]}>{blankTag(kind).toUpperCase()}</Text>
              </View>
              {p.stop && <Text style={styles.proseWord}>.</Text>}
            </View>
          );
        })}
      </View>
      <GoldButton label={charterWords.begin} icon="book-open-variant" disabled={!charterAny(asked, names)} onPress={begin} style={styles.start} />
      <Muted>{charterWords.note}</Muted>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------------- volumes

function Volumes({
  shelves,
  selected,
  width,
  compact,
  onSelect,
}: {
  shelves: ReturnType<typeof worldShelves>;
  selected: string | null;
  width: number;
  compact: boolean;
  onSelect: (key: string | null) => void;
}) {
  const vols = worldVolumes(shelves, selected);
  const columns = volumeColumns(width, compact);
  const w = (width - 12 * (columns - 1)) / columns;
  return (
    <View style={styles.cards}>
      {vols.map((v) => (
        <Pressable
          key={v.key ?? '*'}
          accessibilityRole="button"
          accessibilityLabel={v.label}
          accessibilityState={{ selected: v.selected }}
          onPress={() => onSelect(v.key)}
          style={[styles.volume, { width: w }, v.selected ? styles.volumeOn : styles.volumeOff]}
        >
          <View style={[styles.spine, { backgroundColor: v.spine ?? colors.gold }]}>
            <View style={styles.band} />
            <View style={styles.band} />
          </View>
          <View style={styles.volumeText}>
            <Text style={styles.volumeTitle} numberOfLines={2}>
              {v.title}
            </Text>
            <Text style={styles.italicMuted}>{v.count === 1 ? '1 entry' : `${v.count} entries`}</Text>
          </View>
          {v.selected && (
            <View style={styles.check}>
              <Icon name="check" size={20} />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// -------------------------------------------------------------------------------------------------- encyclopedia

function Encyclopedia({
  entries,
  kindOf,
  mentions,
  chapterCount,
  columns,
  width,
  onOpen,
  onLetterAt,
  onJump,
}: {
  entries: Parameters<typeof encyclopedia>[0];
  kindOf: Parameters<typeof encyclopedia>[1];
  mentions: Parameters<typeof encyclopedia>[2];
  chapterCount: number;
  columns: number;
  width: number;
  onOpen: (id: string) => void;
  onLetterAt: (letter: string, y: number) => void;
  onJump: (letter: string) => void;
}) {
  const enc = encyclopedia(entries, kindOf, mentions, chapterCount);
  const colWidth = (width - 32 * (columns - 1)) / columns;
  return (
    <View>
      {enc.index && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.index}>
          {enc.index.map((l) => (
            <Pressable key={l.letter} accessibilityRole="button" accessibilityLabel={l.tip} onPress={() => onJump(l.letter)} style={styles.indexLetter}>
              <Text style={styles.indexText}>{l.letter}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {enc.letters.map((group) => (
        <View key={group.letter} onLayout={(e: LayoutChangeEvent) => onLetterAt(group.letter, e.nativeEvent.layout.y)}>
          <View style={styles.letterHead} accessibilityRole="header" accessibilityLabel={group.label}>
            <Text style={styles.letter}>{group.letter}</Text>
            <View style={styles.letterRule} />
            <View style={styles.letterDiamond} />
          </View>
          <View style={styles.articles}>
            {group.articles.map((a) => (
              <ArticleView key={a.entry.id} a={a} width={colWidth} onOpen={() => onOpen(a.entry.id)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function DropCap({ a }: { a: Article }) {
  const look = boundLook(rgbaOf(a.tone), { lift: dropCap.lift, sink: dropCap.sink, tinted: true });
  const ground = look.ground.map(cssOf);
  const id = `cap${a.entry.id.replace(/[^a-zA-Z0-9]/g, '')}`;
  const s = dropCap.size;
  return (
    <View style={{ width: s, height: s }}>
      <Svg width={s} height={s} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {ground.map((c, i) => (
              <Stop key={i} offset={ground.length === 1 ? 0 : i / (ground.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width={s} height={s} rx={dropCap.radius} fill={`url(#${id})`} />
        <Rect
          x={dropCap.padding}
          y={dropCap.padding}
          width={s - dropCap.padding * 2}
          height={s - dropCap.padding * 2}
          rx={dropCap.radius - 2}
          fill="none"
          stroke={cssOf(look.frame)}
          strokeOpacity={0.6}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[styles.capLetter, { color: cssOf(look.ink) }]}>{a.initial}</Text>
      </View>
    </View>
  );
}

function ArticleView({ a, width, onOpen }: { a: Article; width: number; onOpen: () => void }) {
  const image = isUploadedImage(a.entry.image) ? a.entry.image : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a.label} onPress={onOpen} style={({ pressed }) => [styles.article, { width }, pressed && { backgroundColor: colors.elevated }]}>
      {image ? (
        <Image source={{ uri: image }} style={{ width: dropCap.size, height: dropCap.size, borderRadius: dropCap.radius }} resizeMode="cover" />
      ) : (
        <DropCap a={a} />
      )}
      <View style={styles.flex}>
        <Text style={styles.articleName} numberOfLines={2}>
          {a.entry.name}
        </Text>
        <View style={styles.kindRow}>
          <View style={[styles.kindDot, { backgroundColor: a.tone }]} />
          <Text style={[styles.italicMuted, styles.flex]} numberOfLines={1}>
            {a.kindLine}
          </Text>
        </View>
        {a.summary && (
          <Text style={styles.summary} numberOfLines={3}>
            {a.summary}
          </Text>
        )}
        {a.where !== null && (
          <View style={styles.thread}>
            <View style={styles.marks}>
              {a.marks.map((m, i) => (
                <View key={i} style={[styles.mark, { backgroundColor: m ? a.tone : colors.border }]} />
              ))}
            </View>
            <Text style={styles.small}>{a.where}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  column: { flexDirection: 'column', alignItems: 'stretch' },
  start: { alignSelf: 'flex-start' },
  body: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  italicMuted: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 21, color: colors.muted },
  small: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.muted, marginTop: 3 },
  // found in pages
  found: { gap: space.sm },
  foundHeading: { fontFamily: fonts.display, fontSize: 13, fontWeight: '700', letterSpacing: 1, color: colors.gold, textTransform: 'uppercase' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  findCard: { paddingTop: 14, paddingHorizontal: 12, paddingBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(39, 46, 64, 0.7)', backgroundColor: colors.surface, gap: 4 },
  findHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  findMono: { width: 40, height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  findMonoText: { fontFamily: fonts.display, fontSize: 13, fontWeight: '700' },
  findName: { fontFamily: fonts.display, fontSize: 15, fontWeight: '700', color: colors.text },
  findButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border, marginTop: space.md },
  // charter
  charter: { gap: 6, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 20 },
  charterTitle: { fontFamily: fonts.display, fontSize: 18, fontWeight: '700', color: colors.text },
  rule: { height: 1, backgroundColor: colors.gold, opacity: 0.45, marginVertical: space.sm },
  prose: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 8, rowGap: 10, marginBottom: 20 },
  proseWord: { fontFamily: fonts.book, fontSize: 20, lineHeight: 30, color: colors.text, paddingBottom: 16 },
  blankRow: { flexDirection: 'row', alignItems: 'flex-end' },
  blank: { fontFamily: fonts.bookItalic, fontSize: 20, color: colors.text, paddingVertical: 2 },
  blankTag: { fontFamily: fonts.display, fontSize: 10.5, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  // volumes
  volume: { minHeight: 72, flexDirection: 'row', borderTopLeftRadius: 3, borderBottomLeftRadius: 3, borderTopRightRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden' },
  volumeOn: { backgroundColor: 'rgba(243, 182, 58, 0.10)', borderWidth: 2, borderColor: colors.gold, elevation: 3 },
  volumeOff: { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(39, 46, 64, 0.6)' },
  spine: { width: 18, justifyContent: 'space-evenly' },
  band: { height: 2, marginHorizontal: 3, backgroundColor: colors.gold },
  volumeText: { flex: 1, paddingTop: 12, paddingRight: 10, paddingBottom: 10, paddingLeft: 10 },
  volumeTitle: { fontFamily: fonts.display, fontSize: 14, fontWeight: '700', color: colors.text },
  check: { justifyContent: 'center', paddingRight: 8 },
  // search
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 12, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  none: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  noneTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textAlign: 'center' },
  // encyclopedia
  index: { gap: 2, paddingVertical: 4 },
  indexLetter: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  indexText: { fontFamily: fonts.display, fontSize: 17, fontWeight: '700', color: colors.gold },
  letterHead: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 4 },
  letter: { fontFamily: fonts.display, fontSize: 34, fontWeight: '700', color: colors.gold, marginRight: 14 },
  letterRule: { flex: 1, height: 1, backgroundColor: 'rgba(243, 182, 58, 0.45)' },
  letterDiamond: { width: 6, height: 6, marginLeft: 6, backgroundColor: 'rgba(243, 182, 58, 0.7)', transform: [{ rotate: '45deg' }] },
  articles: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 32 },
  article: { flexDirection: 'row', gap: 14, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 8 },
  capLetter: { fontFamily: fonts.display, fontSize: dropCap.letter, fontWeight: '700' },
  articleName: { fontFamily: fonts.display, fontSize: 16, fontWeight: '700', color: colors.text },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kindDot: { width: 8, height: 8, borderRadius: 4 },
  summary: { fontFamily: fonts.book, fontSize: 16, lineHeight: 23, color: colors.text, marginTop: 4 },
  thread: { marginTop: 6 },
  marks: { flexDirection: 'row', gap: 2, flexWrap: 'wrap' },
  mark: { width: 6, height: 4, borderRadius: 1 },
});
