// READ AS A BOOK (FEATURES.md #126–#130): the open novel drawn as a printed book, an ebook or a web serial, from the
// text as saved. It changes nothing in the novel; the look and the place reached belong to this device. A port of
// flutter_app/lib/features/reader/reader_page.dart; the pages themselves are reader-web/ (ReaderView).

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readBookmarkJson, readerSnapshot, readReaderPrefs, writeBookmarkJson, writeReaderPrefs } from '../../data/readerData';
import { openNovelSettingKey } from '../../data/settingsStore';
import { plural } from '../../domain/desk/format';
import { type BookFormat, bookFormats, bookSourceFromSnapshot, buildBook, progressAt, readingMinutes } from '../../domain/reader/book';
import {
  bookmarkFromJson,
  bookmarkToJson,
  type ReaderPrefs,
  readerDevices,
  readerPrefsFromJson,
  readerPrefsToJson,
  resolveLook,
} from '../../domain/reader/readerPrefs';
import { bookCss, bookSections } from '../../reader/bookHtml';
import { type ReaderMode, type ReaderPlaceReport, ReaderView, type ReaderViewHandle } from '../../reader/ReaderView';
import { ActionSheet } from '../dialogs';
import { Chip, IconButton, Muted, OutlineButton } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { colors, fonts, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { AppearanceSheet, ContentsSheet, PublishSheet } from './ReaderSheets';

export function ReaderScreen() {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const size = sizeClassOf(width);
  const compact = size === 'compact';
  const wide = size === 'expanded';

  const novelId = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' && lib.novels.exists(id) ? id : null;
  }, [lib, revision]);
  // The book as saved, read when the reader opens (it reads only; Write is where the text changes).
  const source = useMemo(() => {
    const snap = novelId ? readerSnapshot(lib, novelId) : null;
    return snap ? bookSourceFromSnapshot(snap) : null;
  }, [lib, novelId]);

  const [prefs, setPrefs] = useState<ReaderPrefs>(() => readerPrefsFromJson(readReaderPrefs(lib)));
  const changePrefs = useCallback(
    (next: ReaderPrefs) => {
      setPrefs(next);
      writeReaderPrefs(lib, readerPrefsToJson(next));
    },
    [lib],
  );
  const book = useMemo(() => (source ? buildBook(source, prefs.format) : null), [source, prefs.format]);
  const look = resolveLook(prefs);
  const mode: ReaderMode = prefs.format === 'serial' ? 'serial' : look.flow === 'paged' ? 'paged' : 'scroll';

  // Where the reader is: a section and how far through it. Opened where it was left on this device.
  const [place, setPlace] = useState<{ section: number; fraction: number }>({ section: 0, fraction: 0 });
  const furthest = useRef(0);
  const restored = useRef(false);
  if (!restored.current && book && novelId) {
    restored.current = true;
    const mark = bookmarkFromJson(readBookmarkJson(lib, novelId));
    furthest.current = mark?.furthest ?? 0;
    const at = mark ? book.sections.findIndex((s) => s.id === mark.sectionId) : -1;
    if (at >= 0) setPlace({ section: at, fraction: mark!.fraction });
  }
  // A web serial shows chapters only: from elsewhere, its first chapter.
  const shownSection = useMemo(() => {
    if (!book) return 0;
    if (mode !== 'serial' || book.sections[place.section]?.kind === 'chapter') return place.section;
    const first = book.sections.findIndex((s, i) => s.kind === 'chapter' && i >= place.section);
    return first >= 0 ? first : Math.max(0, book.sections.findIndex((s) => s.kind === 'chapter'));
  }, [book, mode, place.section]);

  const view = useRef<ReaderViewHandle>(null);
  const [ready, setReady] = useState(0);
  const css = useMemo(() => bookCss(prefs), [prefs]);
  const sections = useMemo(() => (book ? bookSections(book, prefs, mode) : []), [book, prefs, mode]);
  const placeRef = useRef(place);
  placeRef.current = place;
  // The book goes to the page when it (re)starts, and when the book or how it is set changes: at the same place.
  useEffect(() => {
    if (ready === 0 || !book) return;
    view.current?.show(sections, mode, shownSection, placeRef.current.fraction);
  }, [ready, sections, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPlace = (p: ReaderPlaceReport) => {
    if (!book || !novelId) return;
    setPlace({ section: p.section, fraction: p.fraction });
    const progress = progressAt(book, { index: p.section, fraction: p.fraction });
    furthest.current = Math.max(furthest.current, progress);
    const s = book.sections[p.section];
    if (s) writeBookmarkJson(lib, novelId, bookmarkToJson({ sectionId: s.id, fraction: p.fraction, furthest: furthest.current }));
  };
  const go = (section: number) => {
    setPlace({ section, fraction: 0 });
    view.current?.go(section, 0);
  };

  /** Keeps the reader on the same part of the story when the format changes, where the new format has it. */
  const setFormat = (format: BookFormat) => {
    if (!source || !book) return;
    const id = book.sections[Math.min(place.section, book.sections.length - 1)]?.id;
    const to = buildBook(source, format);
    const at = to.sections.findIndex((s) => s.id === id);
    setPlace({ section: Math.max(at, 0), fraction: 0 });
    placeRef.current = { section: Math.max(at, 0), fraction: 0 };
    changePrefs({ ...prefs, format });
  };

  const back = useCallback(() => {
    router.navigate('/write');
    return true;
  }, [router]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back]);

  const [formatOpen, setFormatOpen] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  if (!novelId || !source || !book) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>This novel could not be opened to read</Text>
        <Muted>Nothing in it has changed. Go back to Write and try again.</Muted>
        <OutlineButton label="Back to writing" icon="arrow-left" onPress={back} />
      </View>
    );
  }

  const progress = progressAt(book, { index: place.section, fraction: place.fraction });
  const left = Math.round(book.words * (1 - progress));
  const label =
    book.words === 0 ? 'No words yet' : `${Math.round(progress * 100)}% · about ${plural(readingMinutes(left), 'minute')} left`;
  const serial = prefs.format === 'serial';
  const noChapters = serial && book.words === 0;

  const toolbar = compact ? (
    <View style={styles.toolbar}>
      <IconButton icon="arrow-left" label="Back to writing" onPress={back} />
      <OutlineButton
        label={bookFormats.find((f) => f.key === prefs.format)!.label}
        icon="chevron-down"
        compact
        tone="muted"
        onPress={() => setFormatOpen(true)}
        style={styles.flex}
      />
      {!serial && <IconButton icon="table-of-contents" label="Contents" onPress={() => setContentsOpen(true)} />}
      <IconButton icon="format-size" label="Appearance" onPress={() => setAppearanceOpen(true)} />
      <IconButton icon="dots-vertical" label="Book details and publishing" onPress={() => setMoreOpen(true)} />
    </View>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar} style={styles.toolbarScroll}>
      <IconButton icon="arrow-left" label="Back to writing" onPress={back} />
      {bookFormats.map((f) => (
        <Chip key={f.key} label={f.label} selected={prefs.format === f.key} onPress={() => setFormat(f.key)} />
      ))}
      {!serial && <IconButton icon="table-of-contents" label="Contents" onPress={() => setContentsOpen(true)} />}
      <IconButton icon="format-size" label="Appearance" onPress={() => setAppearanceOpen(true)} />
      <OutlineButton label="Book details" icon="book-edit-outline" compact tone="muted" onPress={() => router.navigate('/write/book')} />
      <OutlineButton label="Publish…" icon="share-variant" compact onPress={() => setPublishOpen(true)} />
    </ScrollView>
  );

  const page = noChapters ? (
    <View style={[styles.center, styles.flex, { backgroundColor: look.background }]}>
      <Text style={[styles.emptyTitle, { color: look.text }]}>No chapter has text yet</Text>
      <Text style={{ color: look.text, fontFamily: fonts.ui, textAlign: 'center' }}>Write a chapter and it will appear here as a reader will see it.</Text>
    </View>
  ) : (
    <View style={[styles.flex, { backgroundColor: look.background }]}>
      <ReaderView
        ref={view}
        css={css}
        onReady={() => setReady((n) => n + 1)}
        onPlace={onPlace}
        onJump={go}
        onError={(m) => toast(`The reader reported a problem (${m}).`, { error: true })}
      />
    </View>
  );

  // On a wide screen, the book inside the device it is being read on; elsewhere, the whole screen is the device.
  const device = readerDevices.find((d) => d.key === prefs.device)!;
  const framed = wide ? (
    <View style={[styles.flex, styles.center]}>
      <FramedDevice width={device.width} height={device.height} label={device.label} background={look.background}>
        {page}
      </FramedDevice>
    </View>
  ) : (
    page
  );

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {toolbar}
      <View style={styles.progressRow} accessible accessibilityLabel={`Reading progress: ${label}`}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressText} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.rule} />
      {framed}

      <ActionSheet
        visible={formatOpen}
        title="Format"
        onClose={() => setFormatOpen(false)}
        actions={bookFormats.map((f) => ({
          label: f.label,
          icon: f.key === prefs.format ? 'check-circle' : f.key === 'serial' ? 'web' : f.key === 'ebook' ? 'tablet' : 'book-open-variant',
          onPress: () => setFormat(f.key),
        }))}
      />
      <ActionSheet
        visible={moreOpen}
        title="The book"
        onClose={() => setMoreOpen(false)}
        actions={[
          { label: 'Book details', icon: 'book-edit-outline', onPress: () => router.navigate('/write/book') },
          { label: 'Publish…', icon: 'share-variant', onPress: () => setPublishOpen(true) },
        ]}
      />
      <ContentsSheet
        visible={contentsOpen}
        book={book}
        current={place.section}
        onJump={(i) => {
          setContentsOpen(false);
          go(i);
        }}
        onClose={() => setContentsOpen(false)}
      />
      <AppearanceSheet visible={appearanceOpen} prefs={prefs} showDevice={wide} onChange={changePrefs} onClose={() => setAppearanceOpen(false)} />
      <PublishSheet visible={publishOpen} project={source.project} source={source} onClose={() => setPublishOpen(false)} />
    </View>
  );
}

/** The book in a device's frame, scaled to fit, on a wide screen. */
function FramedDevice({
  width,
  height,
  label,
  background,
  children,
}: {
  width: number;
  height: number;
  label: string;
  background: string;
  children: React.ReactNode;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const scale = box.w === 0 ? 1 : Math.min(1, (box.w - 32) / width, (box.h - 32) / height);
  return (
    <View style={[styles.flex, styles.center, { alignSelf: 'stretch' }]} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.w > 0 && (
        <View
          accessibilityLabel={`${label} preview`}
          style={{ width: width * scale, height: height * scale, borderRadius: 24, borderWidth: 6, borderColor: colors.border, backgroundColor: background, overflow: 'hidden' }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textAlign: 'center' },
  toolbarScroll: { flexGrow: 0 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: 4 },
  track: { flex: 2, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.gold },
  progressText: { flex: 3, fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  rule: { height: 1, backgroundColor: colors.border },
});

