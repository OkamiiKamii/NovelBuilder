// PROOFREADING (FEATURES.md #318), "Before a reader sees it": every slip a proofreader would mark in the book (name
// slips, doubled words, a past form after "didn't", unclosed quotations, the odd straight or curly quote, spacing,
// small letters, chapters with no title or no words), each in its sentence with the slip marked in red, what it is,
// and where; a kind at a time or all. "Read it there" opens the chapter in Write, to be put right by hand: nothing
// here changes a word. A port of flutter_app/lib/features/review/proof_page.dart (and the reading its More card does);
// the logic is src/domain/proof/.

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type Proof, type Slip } from '../../domain/proof/proof';
import { proofCard, proofChipPressed, proofReading, proofRed, proofTitle, proofView } from '../../domain/proof/screens/proofPage';
import { Chip, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { useCast } from '../organize/useCast';
import { useContinuity } from './useContinuity';
import { Skeleton } from '../states';

/** `heading` false when the page around it already says "Before a reader sees it" (its route). */
export function ProofPane({ heading = true }: { heading?: boolean } = {}) {
  const lib = useLibrary();
  const open = useCast();
  const c = useContinuity();
  const [only, setOnly] = useState<Slip | null>(null);
  const novelId = open?.novelId ?? null;
  const text = novelId === null ? 0 : lib.novels.versionOf(novelId, ['chapterContents']);
  const [kept, setKept] = useState<{ key: string; proofs: Proof[]; titles: ReadonlyMap<string, string> } | null>(null);
  const key = `${novelId}|${text}|${open?.cast === undefined ? '' : String(open.cast.snapshot.rows('chapters').length)}`;
  // The whole book is read: a moment after the screen is drawn, and again when the text or the chapters change.
  useEffect(() => {
    if (open === null) return;
    let live = true;
    const t = setTimeout(() => {
      const reading = proofReading(
        open.service.storedChapters(open.novelId),
        open.cast.snapshot.rows('chapters'),
        open.cast.snapshot.rows('loreEntries'),
      );
      const proofs = reading.run();
      if (live) setKept({ key, proofs, titles: reading.titles });
    }, 30);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open?.cast, text]); // eslint-disable-line react-hooks/exhaustive-deps

  if (open === null || c === null) return null;
  const title = proofTitle(String(open.cast.snapshot.project['title'] ?? ''));
  if (kept === null) {
    return (
      <View style={styles.gap}>
        {heading && (
          <Text style={styles.title} accessibilityRole="header">
            Before a reader sees it
          </Text>
        )}
        <Skeleton label="Reading…" caption />
      </View>
    );
  }
  const view = proofView(kept.proofs, title, only);
  return (
    <View style={styles.gap}>
      {heading && (
        <Text style={styles.title} accessibilityRole="header">
          {view.heading}
        </Text>
      )}
      <Text style={styles.said} accessibilityLiveRegion="polite">
        {view.said}
      </Text>
      {view.chips.length > 0 && (
        <View style={styles.wrap}>
          {view.chips.map((chip) => (
            <Chip key={chip.label} label={chip.label} selected={chip.selected} onPress={() => setOnly(proofChipPressed(only, chip.kind))} />
          ))}
        </View>
      )}
      {view.shown.map((p, i) => {
        const card = proofCard(p, kept.titles.get(p.nodeId) ?? '');
        return (
          <Panel key={`${p.nodeId}-${p.block}-${p.start}-${p.kind}-${i}`} style={styles.card}>
            <Text style={styles.kind}>{card.kind}</Text>
            <Text style={styles.sentence}>
              {card.before}
              {card.marked.length > 0 && <Text style={styles.marked}>{card.marked}</Text>}
              {card.after}
            </Text>
            <Text style={styles.note}>{card.note}</Text>
            <View style={styles.row}>
              <Muted numberOfLines={1} style={styles.flex}>
                {card.where}
              </Muted>
              <OutlineButton label={card.read} icon="book-open-variant" compact tone="muted" onPress={() => c.openChapter(p.nodeId, { term: p.find, block: p.block })} />
            </View>
          </Panel>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  said: { fontFamily: fonts.book, fontSize: 15, lineHeight: 22, color: colors.muted },
  card: { gap: 6 },
  kind: { fontFamily: fonts.ui, fontSize: 10, fontWeight: '700', letterSpacing: 1.8, color: proofRed },
  sentence: { fontFamily: fonts.book, fontSize: 15.5, lineHeight: 15.5 * 1.4, color: colors.text },
  marked: {
    color: proofRed,
    fontWeight: '700',
    backgroundColor: 'rgba(181, 64, 47, 0.12)',
    textDecorationLine: 'underline',
    textDecorationColor: proofRed,
    textDecorationStyle: 'dotted',
  },
  note: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.text },
});
