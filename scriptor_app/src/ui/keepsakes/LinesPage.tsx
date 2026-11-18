// YOUR BEST LINES (FEATURES.md #338): the twelve sentences of the book most worth quoting, as cards, one at a time; a
// card dressed as paper, night or the book's own colour, shared as a picture. A port of
// flutter_app/lib/features/progress/best_lines_page.dart.

import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Novel } from '../../domain/novel';
import { bestLinesJob } from '../../domain/manuscript/bestLines';
import { type QuoteDress, quoteAt, quoteCard, quoteCardSize, quoteColours, quoteDresses } from '../../domain/keepsakes/pages';
import { Chip, GoldButton, IconButton, OutlineButton } from '../kit';
import { fonts, space } from '../theme';
import { Empty, KeepsakePage, Note, Waiting, bookNames, useKeepsake, useOpenChapter, usePicture, useReading } from './parts';

const ground = '#15120F';
const ink = '#F4EEDF';

export function LinesPage() {
  const open = useKeepsake('lines');
  const lines = useReading(open, (b) => bestLinesJob(b.stored, b.order)()).value;
  const [at, setAt] = useState(0);
  const [dress, setDress] = useState<QuoteDress>('paper');
  const [pictureRef, picture] = usePicture(quoteCardSize);
  const openChapter = useOpenChapter(open);
  if (open === null || lines === null) {
    return (
      <KeepsakePage title="Your best lines" ground={ground} ink={ink}>
        <Waiting ink={ink} text={open === null ? 'No novel is open.' : undefined} />
      </KeepsakePage>
    );
  }
  if (lines.length === 0) {
    return (
      <KeepsakePage title="Your best lines" ground={ground} ink={ink}>
        <Empty ink={ink} text="No line to quote yet. As your chapters grow, the sentences worth underlining gather here." />
      </KeepsakePage>
    );
  }
  const i = Math.min(at, lines.length - 1);
  const line = lines[i];
  const { title, author } = bookNames(open);
  const card = quoteCard(line, title, author);
  const accent = new Novel(open.snapshot.project).accent;
  const c = quoteColours(dress, /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#b4532a');
  return (
    <KeepsakePage title="Your best lines" ground={ground} ink={ink}>
      <View ref={pictureRef} collapsable={false} style={styles.card}>
        <LinearGradient colors={c.ground} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
          <Text style={[styles.mark, { color: c.mark }]}>“</Text>
          <Text style={[styles.line, { color: c.ink, fontSize: card.size, lineHeight: card.size * 1.35 }]}>{card.text}</Text>
          <View style={[styles.rule, { backgroundColor: c.mark }]} />
          <Text style={[styles.byline, { color: c.ink }]} numberOfLines={1}>
            {card.byline}
          </Text>
        </LinearGradient>
      </View>
      <View style={styles.turns}>
        <IconButton icon="chevron-left" label="The line before" color={ink} onPress={() => setAt((i - 1 + lines.length) % lines.length)} />
        <Note ink={ink} text={quoteAt(i, lines)} />
        <IconButton icon="chevron-right" label="The next line" color={ink} onPress={() => setAt((i + 1) % lines.length)} />
      </View>
      <View style={styles.row}>
        {quoteDresses.map((d) => (
          <Chip key={d.dress} label={d.label} selected={dress === d.dress} onPress={() => setDress(d.dress)} />
        ))}
      </View>
      <View style={styles.row}>
        <GoldButton label="Share this line" icon="share-variant" disabled={picture.working} onPress={() => void picture.share('A line from your book')} />
        <OutlineButton label="Read it there" icon="book-open-variant" onPress={() => openChapter(line.nodeId)} />
      </View>
      {picture.message ? <Note ink={ink} text={picture.message} /> : null}
    </KeepsakePage>
  );
}

const styles = StyleSheet.create({
  card: { width: quoteCardSize.width, height: quoteCardSize.height, maxWidth: '100%', borderRadius: 4, overflow: 'hidden' },
  fill: { flex: 1, padding: 30, justifyContent: 'center' },
  mark: { fontFamily: fonts.book, fontSize: 64, lineHeight: 64, marginBottom: -12 },
  line: { fontFamily: fonts.bookItalic },
  rule: { width: 36, height: 2, marginTop: 22, marginBottom: 10 },
  byline: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.6, opacity: 0.8 },
  turns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
});
