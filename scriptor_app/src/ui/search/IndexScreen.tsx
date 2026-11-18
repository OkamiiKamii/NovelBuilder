// THE INDEX (FEATURES.md #357), as the back of a printed book has one (bookIndex.ts makes it): every name in the novel A
// to Z under its letter, the chapters it is in after a dotted leader, each chapter a press from the first place the name
// is in it (Write opens there, the name selected). Above, names written two ways ("Tobiah" and "Tobias"), side by side:
// perhaps a slip. A row of letters jumps through it. It only reads. A page of Write, at /write/names: it is about the
// manuscript, and it opens chapters in Write. A port of flutter_app/lib/features/search/book_index_page.dart.

import { useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openNovelSettingKey } from '../../data/settingsStore';
import { str } from '../../domain/json';
import { readingOrder } from '../../domain/model/storyOrder';
import { isDocument } from '../../domain/outline';
import { blockTexts } from '../../domain/prose';
import { StoryNode } from '../../domain/records/storyNode';
import { type BookIndex, type IndexEntry, type IndexPlace, bookIndex } from '../../domain/search/bookIndex';
import { IconButton, Muted } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { openChapterAt } from '../write/pendingFind';

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

function letterOf(term: string): string {
  const t = term.replace(/^The\s+/, '');
  return t.length === 0 ? '#' : t[0].toUpperCase();
}

export function IndexScreen() {
  const lib = useLibrary();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const novelId = lib.settings.read(openNovelSettingKey);
  const [index, setIndex] = useState<BookIndex | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const letters = useRef(new Map<string, number>());

  // Read a moment after the page is on the screen, so it shows at once.
  useEffect(() => {
    if (typeof novelId !== 'string') return;
    const t = setTimeout(() => {
      const nodes = lib.novels.rowsIn(novelId, 'chapters').map((r) => new StoryNode(r));
      const order = readingOrder(nodes)
        .filter((n) => isDocument(n.kind))
        .map((n) => n.id);
      const pages = new Map(lib.novels.rowsIn(novelId, 'chapterContents').map((r) => [str(r['id']), blockTexts(r['doc'])]));
      setIndex(bookIndex(order.map((id) => ({ id, paragraphs: pages.get(id) ?? [] }))));
    }, 30);
    return () => clearTimeout(t);
  }, [lib, novelId]);

  const title = typeof novelId === 'string' ? str(lib.novels.novel(novelId)?.raw['title']) : '';
  const open = (e: IndexEntry, p: IndexPlace) => {
    if (typeof novelId === 'string') openChapterAt(lib, router, novelId, p.nodeId, { term: e.term, block: p.block });
  };
  const groups = new Map<string, IndexEntry[]>();
  for (const e of index?.entries ?? []) {
    const l = letterOf(e.term);
    const list = groups.get(l);
    if (list === undefined) groups.set(l, [e]);
    else list.push(e);
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/write'))} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Index
          </Text>
          {title.length > 0 && <Text style={styles.subtitle}>{title}</Text>}
        </View>
      </View>
      {typeof novelId !== 'string' ? (
        <Muted style={styles.pad}>Open a novel from the Library to see its index.</Muted>
      ) : index === null ? (
        <Muted style={styles.pad}>Reading the book…</Muted>
      ) : index.entries.length === 0 ? (
        <Text style={styles.empty}>No names yet. As your chapters name people and places, they gather here, A to Z.</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.lettersScroll} contentContainerStyle={styles.letters}>
            {[...groups.keys()].map((l) => (
              <Pressable
                key={l}
                accessibilityRole="button"
                accessibilityLabel={`Names under ${l}`}
                onPress={() => scroll.current?.scrollTo({ y: Math.max(0, (letters.current.get(l) ?? 0) - 8), animated: true })}
                style={styles.letterButton}
              >
                <Text style={styles.letter}>{l}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView ref={scroll} contentContainerStyle={styles.body}>
            {index.lookAlikes.length > 0 && (
              <View style={styles.alikes}>
                <Text style={styles.alikesHead}>SPELLED TWO WAYS?</Text>
                <Text style={styles.alikesSaid}>These names are a letter apart. If they are one name, one of them is a slip.</Text>
                {index.lookAlikes.map((pair) => {
                  // The rarer spelling is the likelier slip: its first place first.
                  const [rare, common] = pair.a.count <= pair.b.count ? [pair.a, pair.b] : [pair.b, pair.a];
                  return (
                    <View key={`${rare.term}/${common.term}`} style={styles.alike}>
                      <Text style={[styles.alikeText, styles.flex]}>{`${rare.term} (${rare.count}) · ${common.term} (${common.count})`}</Text>
                      <Pressable accessibilityRole="button" onPress={() => open(rare, rare.places[0])} style={styles.see}>
                        <Text style={styles.seeText}>{`See “${rare.term}”`}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
            <Muted>{`${plural(index.entries.length, 'name')} in your pages. Press a chapter to read the name there.`}</Muted>
            {[...groups].map(([letter, entries]) => (
              <View key={letter} onLayout={(e) => letters.current.set(letter, e.nativeEvent.layout.y)}>
                <Text style={styles.groupLetter}>{letter}</Text>
                {entries.map((e) => (
                  <View key={e.term} style={styles.line}>
                    <Text style={styles.term}>{e.term}</Text>
                    <Text style={styles.count}>{`  ·  ${plural(e.count, 'time')}  `}</Text>
                    {e.places.map((p, i) => (
                      <Pressable
                        key={p.nodeId}
                        accessibilityRole="button"
                        accessibilityLabel={`${e.term} in chapter ${p.number}`}
                        onPress={() => open(e, p)}
                        style={styles.place}
                      >
                        <Text style={styles.placeText}>{`${p.number}${i < e.places.length - 1 ? ',' : ''}`}</Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.gold },
  subtitle: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.muted },
  pad: { padding: space.md },
  empty: { fontFamily: fonts.book, fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: 'center', padding: space.xxl },
  lettersScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  letters: { paddingHorizontal: space.sm },
  letterButton: { minWidth: 40, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: fonts.display, fontSize: 16, color: colors.gold },
  body: { padding: space.lg, paddingBottom: space.xxl, gap: space.xs },
  alikes: {
    padding: space.md,
    marginBottom: space.md,
    gap: space.xs,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
  },
  alikesHead: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.danger },
  alikesSaid: { fontFamily: fonts.book, fontSize: 14, lineHeight: 20, color: colors.text },
  alike: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  alikeText: { fontFamily: fonts.book, fontSize: 15, color: colors.text },
  see: { minHeight: 40, justifyContent: 'center', paddingHorizontal: space.sm },
  seeText: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold },
  groupLetter: { fontFamily: fonts.display, fontSize: 22, color: colors.gold, marginTop: space.lg, marginBottom: space.xs },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 2 },
  term: { fontFamily: fonts.book, fontSize: 17, color: colors.text },
  count: { fontFamily: fonts.book, fontSize: 13, color: colors.muted },
  place: { minWidth: 32, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  placeText: { fontFamily: fonts.book, fontSize: 16, color: colors.gold, textDecorationLine: 'underline' },
});
