// THE DRAMATIS PERSONAE for the book (FEATURES.md #143): the cast list printed before chapter one, made from the cast
// and shown on a page as it will be printed. Grouped by faction, by part, or as one list; as they appear or by name;
// only those on the page or everyone. "Put it in the book" keeps it with the book's matter (asking before a different
// list there is replaced); Copy takes the text. A port of dramatis_page.dart; the logic is aids/dramatisPage.ts.

import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { putRow } from '../../data/novelStore';
import { readMatter } from '../../data/readerData';
import {
  appearanceFrom,
  asksToReplace,
  bookMatterOf,
  castListMatter,
  castListPage,
  type DramatisChoices,
  dramatisEntranceInput,
  dramatisPeople,
  dramatisStart,
  dramatisView,
  dramatisWords,
  replaceDialog,
} from '../../domain/characters/aids/dramatisPage';
import { castGroupingLabel, castGroupings, castOrderLabel, castOrders } from '../../domain/characters/dramatis';
import { entrancesJob } from '../../domain/characters/entrances';
import { newId } from '../../domain/ids';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Muted, OutlineButton } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import type { OpenCast } from './useCast';
import { Skeleton } from '../states';

export function DramatisSheet({ open, onClose }: { open: OpenCast; onClose: () => void }) {
  const lib = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const [choices, setChoices] = useState<DramatisChoices>(dramatisStart);
  const [appearance, setAppearance] = useState<Map<string, number> | null>(null);
  const [asking, setAsking] = useState(false);
  const people = useMemo(() => dramatisPeople(open.cast), [open.cast]);

  // The order of appearance, read a moment after the sheet opens so the page shows first.
  useEffect(() => {
    const t = setTimeout(() => {
      const input = dramatisEntranceInput(open.cast);
      const read = entrancesJob(open.service.storedChapters(open.novelId), input.nodeIds, input.people)();
      setAppearance(appearanceFrom(read.order));
    }, 30);
    return () => clearTimeout(t);
  }, [open]);

  const stored = readMatter(lib, open.novelId);
  const view = dramatisView(people, choices, appearance, bookMatterOf(stored ? [stored] : []));
  const page = castListPage(view.title, view.text);

  const put = () => {
    const before = readMatter(lib, open.novelId);
    const next = castListMatter(before, { projectId: open.novelId, text: view.text, now: Date.now(), newId });
    try {
      lib.novels.writeRows(open.novelId, [putRow('bookMatter', next, before)]);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
      return;
    }
    setAsking(false);
    toast(dramatisWords.putMessage, { action: { label: dramatisWords.readTheBook, run: () => { onClose(); router.navigate(dramatisWords.readTheBookPath); } } });
  };
  const pressPut = () => (asksToReplace(bookMatterOf(stored ? [stored] : []), view.text) ? setAsking(true) : put());
  const copy = () => {
    if (!view.copyText) return;
    void Clipboard.setStringAsync(view.copyText);
    toast(dramatisWords.copied);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={dramatisWords.title}
      wide
      footer={
        asking ? (
          <View style={styles.ask}>
            <Text style={styles.askTitle}>{replaceDialog.title}</Text>
            <Muted>{replaceDialog.message}</Muted>
            <View style={styles.row}>
              <OutlineButton label={replaceDialog.keep} compact tone="muted" onPress={() => setAsking(false)} />
              <GoldButton label={replaceDialog.replace} compact onPress={put} />
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            {view.put && <GoldButton label={view.put} icon="book-plus-outline" onPress={pressPut} />}
            <OutlineButton label={dramatisWords.copy} icon="content-copy" compact tone="muted" disabled={!view.copyText} onPress={copy} />
          </View>
        )
      }
    >
      <Muted>{dramatisWords.intro}</Muted>
      <View style={styles.chips}>
        {castGroupings.map((g) => (
          <Chip key={g} label={castGroupingLabel[g]} selected={view.by === g} onPress={() => setChoices({ ...choices, by: g })} />
        ))}
      </View>
      {view.showOrder && (
        <>
          <View style={styles.chips}>
            {castOrders.map((o) => (
              <Chip key={o} label={castOrderLabel[o]} selected={choices.order === o} onPress={() => setChoices({ ...choices, order: o })} />
            ))}
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{view.onlyLabel}</Text>
            <Switch
              value={view.onlyOnPage}
              onValueChange={(v) => setChoices({ ...choices, onlyOnPage: v })}
              trackColor={{ true: colors.gold, false: colors.border }}
              thumbColor={colors.text}
              accessibilityLabel={view.onlyLabel}
            />
          </View>
        </>
      )}
      {appearance === null ? (
        <Skeleton label={dramatisWords.reading} lines={5} caption />
      ) : (
        <>
          {appearance.size === 0 && people.length > 0 && <Muted>{dramatisWords.nobodyOnPage}</Muted>}
          {view.text.length === 0 ? (
            <Muted>{dramatisWords.nobody}</Muted>
          ) : (
            <View style={[styles.paper, { backgroundColor: page.paper }]}>
              <Text style={[styles.title, { color: page.ink }]}>{page.title}</Text>
              <View style={styles.ornament}>
                <View style={[styles.rule, { backgroundColor: page.faint }]} />
                <View style={[styles.diamond, { backgroundColor: page.faint }]} />
                <View style={[styles.rule, { backgroundColor: page.faint }]} />
              </View>
              {page.lines.map((l, i) =>
                l.kind === 'group' ? (
                  <Text key={i} style={[styles.group, { color: page.faint, marginTop: l.top }]}>
                    {l.text}
                  </Text>
                ) : (
                  <Text key={i} style={[styles.person, { color: page.ink }]}>
                    <Text style={styles.bold}>{l.name}</Text>
                    {l.about}
                  </Text>
                ),
              )}
            </View>
          )}
          {view.inBook.length > 0 && <Muted>{view.same ? dramatisWords.same : dramatisWords.replaces}</Muted>}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  switchText: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  ask: { gap: space.xs },
  askTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  paper: {
    marginTop: space.md,
    borderRadius: 4,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 36,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  title: { fontFamily: fonts.book, fontSize: 21, letterSpacing: 3.2, fontWeight: '600', textAlign: 'center' },
  ornament: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, marginBottom: 16 },
  rule: { width: 44, height: 1 },
  diamond: { width: 6, height: 6, transform: [{ rotate: '45deg' }] },
  group: { fontFamily: fonts.book, fontSize: 13, letterSpacing: 2, textAlign: 'center', marginBottom: 6 },
  person: { fontFamily: fonts.book, fontSize: 16.5, lineHeight: 16.5 * 1.35, marginBottom: 5 },
  bold: { fontWeight: '700' },
});
