// SEARCH, OR GO ANYWHERE (FEATURES.md #355–#356): one box over the whole app. What is typed finds pages first, under
// "Go to" (an area, a tab, a view, a keepsake, a chapter, a character, a place, a thread, an event: jumps.ts), then the
// passages of the novel holding every word (chapter text, headings, notes and plans, World entries: search.ts), in the
// scope chosen. A passage of a chapter opens it in Write with its words selected (pendingFind.ts); an entry opens where
// it lives. Read only: nothing is changed. A port of flutter_app/lib/features/search/search_dialog.dart.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openNovelSettingKey } from '../../data/settingsStore';
import { categoriesOf } from '../../domain/codex/codexChanges';
import { str } from '../../domain/json';
import { Category } from '../../domain/records/category';
import { Entry } from '../../domain/records/entry';
import { StoryNode } from '../../domain/records/storyNode';
import { bookJumps, type Jump, jumpScore, jumpsFor } from '../../domain/search/jumps';
import {
  type EntityResult,
  type GroupResult,
  type SearchField,
  SearchIndex,
  type SearchScope,
  type Snippet,
  entryBlocks,
  minQueryLength,
  nodeBlocks,
  searchScopeLabel,
  searchScopes,
} from '../../domain/search/search';
import type { Library } from '../../data/library';
import { useReviewMark } from '../collab/useCollab';
import { Chip, Icon, type IconName, IconButton, Muted } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { useGoTo } from './goTo';
import { closeSearch, useShown } from './opener';

type Opened = { index: SearchIndex; groups: Map<string, string>; title: string; jumps: Jump[] };

/** What search is made of: a write to anything else leaves the index as it was. */
const indexed = ['chapters', 'chapterContents', 'chapterPlans', 'loreEntries', 'loreSchemas', 'project'];

/** The index last made: the novel, the store's count of writes to what it is made of then, and the index. */
let kept: { novelId: string; version: number; opened: Opened } | null = null;

function openIndex(lib: Library, novelId: string): Opened | null {
  const version = lib.novels.versionOf(novelId, indexed);
  if (kept !== null && kept.novelId === novelId && kept.version === version) return kept.opened;
  const s = lib.novels.loadPart(novelId, ['chapters', 'chapterContents', 'chapterPlans', 'loreEntries', 'loreSchemas']);
  if (s === null) return null;
  const docs = new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']]));
  const plans = new Map(s.rows('chapterPlans').map((r) => [str(r['id']), r]));
  const categories = categoriesOf(s);
  const names = new Map(s.rows('loreEntries').map((r) => [str(r['id']), str(r['name'])]));
  const blocks = [
    ...s.rows('chapters').flatMap((r) => nodeBlocks(new StoryNode(r), docs.get(str(r['id'])), plans.get(str(r['id'])) ?? null)),
    ...s
      .rows('loreEntries')
      .flatMap((r) =>
        entryBlocks(new Entry(r), categories.get(str(r['category'])) ?? Category.unknown(str(r['category'])), (id) => names.get(id) ?? null),
      ),
  ];
  const groups = new Map<string, string>([
    ['manuscript', 'Manuscript'],
    ['notes', 'Notes and plans'],
  ]);
  for (const c of categories.values()) groups.set(c.key, c.name);
  const opened: Opened = {
    index: new SearchIndex(blocks),
    groups,
    title: str(lib.novels.novel(novelId)?.raw['title']) || 'this novel',
    jumps: bookJumps((c) => lib.novels.rowsIn(novelId, c)),
  };
  kept = { novelId, version, opened };
  return opened;
}

const fieldLabels: Partial<Record<SearchField, string>> = {
  title: 'Title',
  heading: 'Heading',
  summary: 'Summary',
  notes: 'Notes',
  name: 'Name',
  description: 'Description',
  tags: 'Tags',
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Held by the app frame: search, when it is open. */
export function SearchHost() {
  const { search } = useShown();
  const lib = useLibrary();
  const toast = useToast();
  const review = useReviewMark();
  const novelId = lib.settings.read(openNovelSettingKey);
  // Says why it cannot open, as the Flutter app does, and closes again.
  useEffect(() => {
    if (!search) return;
    if (typeof novelId !== 'string') {
      toast('Open a novel from the Library to search it.');
      closeSearch();
    } else if (review !== null) {
      toast('A review copy is read and searched from its chapters in Write.');
      closeSearch();
    }
  }, [search, novelId, review, toast]);
  if (!search || typeof novelId !== 'string' || review !== null) return null;
  return <SearchSheet novelId={novelId} />;
}

/** The main places to go, before anything is typed (Scriptor keeps no trail of where you were). */
const firstPlaces = ['Write', 'Plan', 'Review', 'Analytics', 'Keepsakes', 'The index'];

function SearchSheet({ novelId }: { novelId: string }) {
  const lib = useLibrary();
  const goTo = useGoTo();
  const insets = useSafeAreaInsets();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [query, setQuery] = useState('');
  const [settled, setSettled] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The book is read a moment after the box is on the screen, so the box comes first.
  useEffect(() => {
    const t = setTimeout(() => setOpened(openIndex(lib, novelId)), 30);
    return () => clearTimeout(t);
  }, [lib, novelId]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const typed = (text: string) => {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSettled(text), 150);
  };

  const results = useMemo<GroupResult[]>(() => (opened === null ? [] : opened.index.search(settled, scope)), [opened, settled, scope]);
  const empty = settled.trim().length === 0;
  const going = useMemo(() => {
    if (opened === null) return [];
    if (empty) return firstPlaces.map((t) => opened.jumps.find((j) => j.title === t)).filter((j): j is Jump => j !== undefined);
    return jumpsFor(settled, opened.jumps);
  }, [opened, settled, empty]);
  const total = results.reduce((n, g) => n + g.matchCount, 0);
  const places = results.reduce((n, g) => n + g.items.length, 0);
  const tooShort = settled.trim().length < minQueryLength;

  const close = () => closeSearch();
  const jump = (j: Jump) => {
    close();
    goTo(j.to);
  };
  const open = (item: EntityResult, snippet: Snippet | null) => {
    close();
    if (item.entityType === 'node') {
      const text = snippet !== null && (snippet.field === 'body' || snippet.field === 'heading');
      goTo({ kind: 'chapter', nodeId: item.entityId, find: text && snippet.term.length > 0 ? { term: snippet.term, block: snippet.index } : undefined });
    } else {
      goTo({ kind: 'route', path: item.kind === 'character' ? `/organize/character/${item.entityId}` : `/organize/world/entry/${item.entityId}` });
    }
  };
  const submit = () => {
    if (opened === null) return;
    // Return goes to a place named by what was typed; else to the first match in the text.
    const place = jumpsFor(query, opened.jumps)[0];
    if (place !== undefined && jumpScore(place, query) >= 40) return jump(place);
    const first = opened.index.search(query, scope)[0]?.items[0];
    if (first !== undefined) open(first, first.snippets[0] ?? null);
  };

  const said = empty
    ? 'Type to search the words, or go to a page by its name.'
    : tooShort
      ? 'Type at least two letters. Every word must appear in a chapter or entry for it to be found.'
      : results.length === 0
        ? `Nothing matches “${settled.trim()}”${scope === 'all' ? '' : ` in ${searchScopeLabel[scope].toLowerCase()}`}.`
        : `${plural(total, 'match', 'matches')} in ${plural(places, 'place', 'places')}. Read only: nothing is changed.`;

  return (
    <Modal visible animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={[styles.page, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom }]} accessibilityViewIsModal>
        <View style={styles.head}>
          <View style={styles.box}>
            <Icon name="magnify" size={22} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={typed}
              onSubmitEditing={submit}
              autoFocus
              returnKeyType="search"
              placeholder="A word, a name, or a page…"
              placeholderTextColor={colors.muted}
              selectionColor={colors.gold}
              style={styles.input}
              accessibilityLabel="Search the whole novel"
            />
          </View>
          <IconButton icon="close" label="Close search" onPress={close} color={colors.muted} />
        </View>
        <View style={styles.scopes}>
          {searchScopes.map((s) => (
            <Chip key={s} label={searchScopeLabel[s]} selected={scope === s} onPress={() => setScope(s)} />
          ))}
        </View>
        <Text style={styles.said} accessibilityLiveRegion="polite">
          {opened === null ? 'Reading the book…' : said}
        </Text>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
          {going.length > 0 && (
            <>
              <Text style={styles.heading} accessibilityRole="header">
                Go to
              </Text>
              {going.map((j, i) => (
                <Pressable
                  key={`${j.title}-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${j.title}, ${j.kind}`}
                  onPress={() => jump(j)}
                  style={({ pressed }) => [styles.jump, pressed && { backgroundColor: colors.elevated }]}
                >
                  <View style={styles.jumpIcon}>
                    <Icon name={j.icon as IconName} size={18} color={colors.gold} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.jumpTitle} numberOfLines={1}>
                      {j.title}
                    </Text>
                    <Muted>{j.kind}</Muted>
                  </View>
                  <Icon name="arrow-top-right" size={18} color={colors.muted} />
                </Pressable>
              ))}
              {results.length > 0 && <View style={styles.rule} />}
            </>
          )}
          {results.map((g) => (
            <View key={g.group}>
              <Text style={styles.heading} accessibilityRole="header">
                {`${opened?.groups.get(g.group) ?? g.group} · ${plural(g.matchCount, 'match', 'matches')}`}
              </Text>
              {g.items.map((item) => (
                <ResultView key={`${item.entityId}|${item.group}`} item={item} onOpen={open} />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ResultView({ item, onOpen }: { item: EntityResult; onOpen: (item: EntityResult, s: Snippet | null) => void }) {
  return (
    <View style={styles.result}>
      <Pressable accessibilityRole="button" onPress={() => onOpen(item, item.snippets[0] ?? null)} style={({ pressed }) => [styles.resultHead, pressed && { backgroundColor: colors.elevated }]}>
        <Text style={styles.resultTitle}>{item.title.length === 0 ? 'Untitled' : item.title}</Text>
        <Muted>{plural(item.matchCount, 'match', 'matches')}</Muted>
      </Pressable>
      {item.snippets.map((s) => {
        const label = s.label.length > 0 ? s.label : fieldLabels[s.field];
        return (
          <Pressable
            key={s.blockId}
            accessibilityRole="button"
            accessibilityLabel={[label, s.parts.map((p) => p.text).join(''), `Open ${item.title}`].filter(Boolean).join('. ')}
            onPress={() => onOpen(item, s)}
            style={({ pressed }) => [styles.snippet, pressed && { backgroundColor: colors.elevated }]}
          >
            <Text style={styles.snippetText}>
              {label !== undefined && <Text style={styles.snippetLabel}>{`${label} · `}</Text>}
              {s.before.length > 0 && <Text style={styles.muted}>{`${s.before} `}</Text>}
              {s.parts.map((p, i) => (
                <Text key={i} style={p.hit ? styles.hit : undefined}>
                  {p.text}
                </Text>
              ))}
              {s.after.length > 0 && <Text style={styles.muted}>{` ${s.after}`}</Text>}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  box: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontFamily: fonts.ui, fontSize: 16, color: colors.text, paddingVertical: 8 },
  scopes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingHorizontal: space.md, paddingTop: space.sm },
  said: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, paddingHorizontal: space.md, paddingVertical: space.sm },
  list: { paddingHorizontal: space.md, paddingBottom: space.xxl },
  heading: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.gold, marginTop: space.md, marginBottom: space.xs },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: space.sm },
  jump: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.sm, borderRadius: radius.field },
  jumpIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243, 182, 58, 0.14)' },
  jumpTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  result: { marginBottom: space.sm, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  resultHead: { paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48, justifyContent: 'center' },
  resultTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  snippet: { paddingLeft: space.xl, paddingRight: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  snippetText: { fontFamily: fonts.book, fontSize: 14, lineHeight: 21, color: colors.text },
  snippetLabel: { fontFamily: fonts.ui, fontWeight: '600', color: colors.muted },
  muted: { color: colors.muted },
  hit: { fontWeight: '700', color: colors.gold, textDecorationLine: 'underline' },
});
