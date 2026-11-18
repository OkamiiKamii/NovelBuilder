// THE BOOK'S FINGERPRINT (FEATURES.md #341): the whole book as a print, a column a chapter, a thread a paragraph in the
// colour of the character it is about (bright where someone speaks), the five most present named beneath. Shared as a
// picture. A port of flutter_app/lib/features/progress/book_print_page.dart.

import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { bookPrintJob } from '../../domain/analytics/bookPrint';
import { castTone } from '../../domain/characters/screens/library';
import { plural } from '../../domain/desk/format';
import { storyInputsOf } from '../../domain/keepsakes/inputs';
import { brand, printLegend, printSize, printThreads } from '../../domain/keepsakes/pages';
import { dartToUpperCase } from '../../domain/exchange/dartUpperCase';
import { GoldButton } from '../kit';
import { fonts } from '../theme';
import { KeepsakePage, Note, Waiting, useKeepsake, usePicture, useReading } from './parts';

const paper = '#14121A';
const ink = '#F4EEDF';

export function PrintPage() {
  const open = useKeepsake('print');
  const made = useReading(open, (b, s) => {
    const inputs = storyInputsOf(s);
    const print = bookPrintJob(
      inputs.chapters.map((c) => ({ id: c.id, title: c.title })),
      b.stored,
      new Map(inputs.people.map((p) => [p.id, p.names] as const)),
    )();
    return {
      print,
      title: inputs.title,
      words: inputs.chapters.reduce((n, c) => n + c.words, 0),
      names: new Map(inputs.people.map((p) => [p.id, p.name] as const)),
    };
  }).value;
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [pictureRef, picture] = usePicture(printSize);
  if (open === null || made === null) {
    return (
      <KeepsakePage title="Your book’s fingerprint" ground={paper} ink={ink}>
        <Waiting ink={ink} text={open === null ? 'No novel is open.' : undefined} />
      </KeepsakePage>
    );
  }
  const { print, title, words, names } = made;
  const drawn = printThreads(print, area.width, area.height);
  const onLayout = (e: LayoutChangeEvent) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  return (
    <KeepsakePage title="Your book’s fingerprint" ground="#0B0A0F" ink={ink}>
      <Note ink={ink} text="Every paragraph a thread, in the colour of whose it is; bright where someone speaks." />
      <View ref={pictureRef} collapsable={false} style={styles.card}>
        <Text style={styles.title} numberOfLines={1}>
          {dartToUpperCase(title.length === 0 ? 'Your novel' : title)}
        </Text>
        <Text style={styles.sub}>{`${plural(print.chapters.length, 'chapter')} · ${plural(words, 'word')}`}</Text>
        <View
          style={styles.area}
          onLayout={onLayout}
          accessible
          accessibilityLabel={`The book’s fingerprint: ${plural(print.chapters.length, 'chapter')}, each paragraph coloured by the character it is about`}
        >
          {area.width > 0 ? (
            <Svg width={area.width} height={area.height}>
              <Rect x={0} y={0} width={drawn.hairline.width} height={0.6} fill={drawn.hairline.colour} />
              {drawn.threads.map((t, i) => (
                <Rect key={i} x={t.x} y={t.y} width={t.width} height={t.height} fill={t.colour} />
              ))}
            </Svg>
          ) : null}
        </View>
        <View style={styles.legend}>
          {printLegend(print).map((l) => (
            <View key={l.id} style={styles.who}>
              <View style={[styles.dot, { backgroundColor: castTone(l.id) }]} />
              <Text style={styles.name}>{names.get(l.id) ?? ''}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.brand}>{dartToUpperCase(brand)}</Text>
      </View>
      <GoldButton label="Share the print" icon="share-variant" disabled={picture.working} onPress={() => void picture.share('Your book’s fingerprint')} />
      {picture.message ? <Note ink={ink} text={picture.message} /> : null}
    </KeepsakePage>
  );
}

const styles = StyleSheet.create({
  card: { width: printSize.width, height: printSize.height, maxWidth: '100%', backgroundColor: paper, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
  title: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 3, color: ink, textAlign: 'center' },
  sub: { fontFamily: fonts.book, fontSize: 11, color: ink, opacity: 0.6, textAlign: 'center', marginTop: 2 },
  area: { flex: 1, marginTop: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 12, rowGap: 4, marginTop: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontFamily: fonts.book, fontSize: 10.5, color: ink },
  brand: { fontFamily: fonts.display, fontSize: 6.5, letterSpacing: 2.2, color: ink, opacity: 0.4, textAlign: 'center', marginTop: 8 },
});
