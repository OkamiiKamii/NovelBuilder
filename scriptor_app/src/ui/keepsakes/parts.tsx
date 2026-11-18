// What every keepsake page shares: the full page on its own dark ground (a back arrow to Analytics, the keepsake's
// name), the book read once a moment after the page is drawn ("Reading the book…" until then), the keepsake marked as
// opened, a picture of part of the page shared, and "Read it there" (the chapter opened in Write). The Flutter app's
// keepsakes each open full screen with a Close button; here each is a route under /keepsakes, as Plan's pages are.

import { useRouter } from 'expo-router';
import { type ComponentRef, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { sharePicture } from '../../data/files';
import { type BookRead, bookRead } from '../../domain/keepsakes/inputs';
import { pictureFailed } from '../../domain/keepsakes/pages';
import { type KeepsakeId, keepsakesOpenedSettingKey, openedAfter, openedOf } from '../../domain/keepsakes/shelf';
import { type NovelSnapshot } from '../../domain/snapshot/novelSnapshot';
import { IconButton, Muted } from '../kit';
import { useLibrary } from '../LibraryContext';
import { type OpenNovel, useOpenNovel } from '../organize/useNovel';
import { fonts, space } from '../theme';

/** A keepsake's page: its ground, a back arrow to Analytics, its name, and what it shows, scrolling. */
export function KeepsakePage({
  title,
  ground,
  ink = '#F4EEDF',
  scroll = true,
  children,
}: {
  title: string;
  ground: string;
  ink?: string;
  scroll?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { backgroundColor: ground, paddingTop: insets.top }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Back to Analytics" color={ink} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/analytics'))} />
        <Text style={[styles.title, { color: ink }]} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}>{children}</ScrollView>
      ) : (
        <View style={[styles.flex, { paddingBottom: insets.bottom }]}>{children}</View>
      )}
    </View>
  );
}

/** Said where a page waits on its reading, or has no novel to read. */
export function Waiting({ ink = '#F4EEDF', text = 'Reading the book…' }: { ink?: string; text?: string }) {
  return (
    <View style={styles.waiting}>
      <ActivityIndicator color={ink} />
      <Text style={[styles.waitingText, { color: ink }]}>{text}</Text>
    </View>
  );
}

/** A line said in the middle of an empty page. */
export function Empty({ text, ink = '#F4EEDF' }: { text: string; ink?: string }) {
  return (
    <View style={styles.waiting}>
      <Text style={[styles.empty, { color: ink }]}>{text}</Text>
    </View>
  );
}

/** The open novel and the keepsake `id` marked opened (on this device, for every book). */
export function useKeepsake(id: KeepsakeId | null): OpenNovel | null {
  const open = useOpenNovel();
  const lib = useLibrary();
  useEffect(() => {
    if (id === null) return;
    const next = openedAfter(openedOf(lib.settings.read(keepsakesOpenedSettingKey)), id);
    if (next === null) return;
    lib.saves.saveNow(`setting:${keepsakesOpenedSettingKey}`, () => {
      lib.settings.write(keepsakesOpenedSettingKey, next);
      lib.novels.touchSettings();
    });
  }, [id, lib]);
  return open;
}

/** What `make` makes of the book, made once, a moment after the page is drawn (the whole book is read): null until
 * then. `again` makes it anew (a new quiz). */
export function useReading<T>(open: OpenNovel | null, make: (book: BookRead, snapshot: NovelSnapshot) => T): { value: T | null; again: () => void } {
  const [value, setValue] = useState<T | null>(null);
  const [turn, setTurn] = useState(0);
  const novelId = open?.novelId ?? null;
  const s = open?.snapshot ?? null;
  // Made from the book as it is when the page opens (or is asked again), not on every change of the library.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      if (s === null) return;
      const made = make(bookRead(s), s);
      if (live) setValue(made);
    }, 30);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [novelId, turn]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    value,
    again: () => {
      setValue(null);
      setTurn((n) => n + 1);
    },
  };
}

/** A part of the page to share as a picture: the ref to put on it, and `share` to make the picture (`scale` times its
 * size) and share it, `working` meanwhile, `message` when it could not be made. */
export function usePicture(
  size: { width: number; height: number },
  scale = 3,
): [RefObject<ComponentRef<typeof View> | null>, { working: boolean; message: string | null; share: (title: string) => Promise<void> }] {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const share = async (title: string) => {
    if (!ref.current || working) return;
    setWorking(true);
    setMessage(null);
    try {
      const uri = await captureRef(ref.current, {
        format: 'png',
        result: 'tmpfile',
        width: size.width * scale,
        height: size.height * scale,
      });
      await sharePicture(uri, title);
    } catch (e) {
      setMessage(pictureFailed(e));
    } finally {
      setWorking(false);
    }
  };
  return [ref, { working, message, share }];
}

/** A small line under a page, in its ink. */
export function Note({ text, ink = '#F4EEDF' }: { text: string; ink?: string }) {
  return <Muted style={[styles.note, { color: ink }]}>{text}</Muted>;
}

/** The book's title and author, as the keepsakes name them. */
export function bookNames(open: OpenNovel): { title: string; author: string } {
  return { title: String(open.snapshot.project['title'] ?? ''), author: String(open.snapshot.project['author'] ?? '') };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 18 },
  body: { padding: space.md, gap: space.md, alignItems: 'center' },
  waiting: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl },
  waitingText: { fontFamily: fonts.ui, fontSize: 14, opacity: 0.8 },
  empty: { fontFamily: fonts.book, fontSize: 15, lineHeight: 24, textAlign: 'center', opacity: 0.85, maxWidth: 420 },
  note: { textAlign: 'center', opacity: 0.75 },
});

