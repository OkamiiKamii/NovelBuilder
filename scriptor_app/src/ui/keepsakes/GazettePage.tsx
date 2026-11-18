// THE GAZETTE (FEATURES.md #343): each chapter the front page of its world's newspaper: the masthead (named for the
// book's chief place), the edition, a headline and the line beneath it, the lead story in two columns, what was said
// about town, the weather and who is in the news. A page at a time, and after the last, tomorrow's edition, still
// blank. **Print it** shares the page as a picture; **Read it there** opens the chapter. A port of
// flutter_app/lib/features/progress/gazette_page.dart.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatNumber } from '../../domain/desk/format';
import { dartToUpperCase } from '../../domain/exchange/dartUpperCase';
import { gazetteCast } from '../../domain/keepsakes/inputs';
import {
  editionAt,
  firstWords,
  leadFirstSentence,
  frontPageWidth,
  pressLine,
  saidWords,
  secondColumn,
  tomorrowLine,
  twoColumns,
  weatherIcon,
} from '../../domain/keepsakes/pages';
import { type Edition, forecastOf, gazetteJob } from '../../domain/manuscript/gazette';
import { GoldButton, Icon, type IconName, IconButton, OutlineButton } from '../kit';
import { fonts, space } from '../theme';
import { Empty, KeepsakePage, Note, Waiting, bookNames, useKeepsake, useOpenChapter, usePicture, useReading } from './parts';

const ground = '#2A241F';
const paper = '#F1EBDD';
const ink = '#1D1A16';
const light = '#F1EBDD';

function FrontPage({ name, book, e }: { name: string; book: string; e: Edition }) {
  const columns = twoColumns(e.lead);
  const rule = (thick = 0.8, gap = 7) => <View style={{ height: thick, backgroundColor: ink, marginVertical: gap }} />;
  const paragraph = (p: string, i: number, first: boolean) => {
    if (first && i === 0) {
      const [caps, rest] = firstWords(p);
      return (
        <Text key={i} style={styles.lead}>
          <Text style={styles.leadCaps}>{caps}</Text>
          {rest}
        </Text>
      );
    }
    return (
      <Text key={i} style={styles.lead}>
        {p}
      </Text>
    );
  };
  return (
    <View style={styles.front}>
      <View style={styles.line}>
        <Text style={styles.caps8}>No. {e.chapter}</Text>
        <Text style={styles.caps8}>ONE COPPER</Text>
      </View>
      <Text style={styles.masthead} numberOfLines={1} adjustsFontSizeToFit>
        {dartToUpperCase(name)}
      </Text>
      {rule(2.2, 5)}
      <View style={styles.line}>
        <Text style={styles.caps8}>CHAPTER {e.chapter} EDITION</Text>
        <Text style={[styles.caps8, styles.book]} numberOfLines={1}>
          {dartToUpperCase(book)}
        </Text>
        <Text style={styles.caps8}>{formatNumber(e.words)} WORDS</Text>
      </View>
      <View style={styles.hair} />
      <Text style={styles.headline}>{dartToUpperCase(e.headline)}</Text>
      {e.deck.length > 0 ? <Text style={styles.deck}>{e.deck}</Text> : null}
      {rule(0.8, 9)}
      <View style={styles.columns}>
        <View style={styles.column}>{columns[0].map((p, i) => paragraph(p, i, true))}</View>
        <View style={[styles.column, styles.second]}>{secondColumn(columns, e).map((p, i) => paragraph(p, i, false))}</View>
      </View>
      {rule(1.4, 9)}
      <View style={styles.boxes}>
        <View style={styles.said}>
          <Text style={styles.caps9}>SAID ABOUT TOWN</Text>
          {e.said.length === 0 ? <Text style={[styles.small, styles.faint]}>Not a word was said.</Text> : null}
          {e.said.map((s, i) => (
            <Text key={i} style={[styles.small, styles.italic]}>
              {saidWords(s.words)}
              <Text style={styles.speaker}>— {s.speaker}</Text>
            </Text>
          ))}
        </View>
        <View style={styles.vrule} />
        <View style={styles.weather}>
          <Text style={styles.caps9}>WEATHER</Text>
          <View style={styles.forecast}>
            <Icon name={weatherIcon[e.weather] as IconName} size={18} color={ink} />
            <Text style={[styles.small, styles.flex]}>{forecastOf(e.weather)}</Text>
          </View>
          {e.weatherCount > 0 ? <Text style={[styles.tiny, styles.faint]}>“{e.weatherWord}”, {e.weatherCount} times in the chapter</Text> : null}
          <View style={styles.hrule} />
          <Text style={styles.caps9}>IN THE NEWS</Text>
          {e.inTheNews.length === 0 ? <Text style={[styles.small, styles.faint]}>A quiet day.</Text> : null}
          {e.inTheNews.map((p, i) => (
            <View key={i} style={styles.line}>
              <Text style={[styles.small, styles.flex]} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.caps9}>{p.count}</Text>
            </View>
          ))}
        </View>
      </View>
      {rule(0.8, 9)}
      <Text style={styles.press}>{pressLine(name)}</Text>
    </View>
  );
}

export function GazettePage() {
  const open = useKeepsake('gazette');
  const router = useRouter();
  const paper = useReading(open, (b, s) => {
    const cast = gazetteCast(s);
    return gazetteJob(b.novel.title, b.stored, b.order, b.titles, cast.people, cast.places)();
  }).value;
  const [at, setAt] = useState(0);
  const [height, setHeight] = useState(600);
  const [pictureRef, picture] = usePicture({ width: frontPageWidth, height });
  const openChapter = useOpenChapter(open);
  if (open === null || paper === null) {
    return (
      <KeepsakePage title="The Gazette" ground={ground} ink={light}>
        <Waiting ink={light} text={open === null ? 'No novel is open.' : undefined} />
      </KeepsakePage>
    );
  }
  const editions = paper.editions;
  if (editions.length === 0) {
    return (
      <KeepsakePage title="The Gazette" ground={ground} ink={light}>
        <Empty ink={light} text="No news yet. Once a chapter has words, it is set here as a front page." />
      </KeepsakePage>
    );
  }
  const { title } = bookNames(open);
  const i = Math.min(at, editions.length);
  const tomorrow = i === editions.length;
  const e = tomorrow ? null : editions[i];
  return (
    <KeepsakePage title="The Gazette" ground={ground} ink={light}>
      <Note ink={light} text="Every chapter the front page of its world’s newspaper." />
      <View style={styles.turns}>
        <IconButton icon="chevron-left" label="Earlier edition" color={light} onPress={() => setAt(Math.max(0, i - 1))} />
        <Note ink={light} text={e === null ? 'Tomorrow’s edition' : editionAt(e, i, editions.length)} />
        <IconButton icon="chevron-right" label="Later edition" color={light} onPress={() => setAt(Math.min(editions.length, i + 1))} />
      </View>
      {e === null ? (
        <View style={styles.tomorrow}>
          <Text style={styles.tomorrowHead}>TOMORROW’S EDITION</Text>
          <Text style={styles.tomorrowLine}>{tomorrowLine(editions.length + 1)}</Text>
          <GoldButton label="Keep writing" icon="pencil-outline" onPress={() => router.navigate('/write')} />
        </View>
      ) : (
        <>
          <View ref={pictureRef} collapsable={false} onLayout={(ev) => setHeight(Math.round(ev.nativeEvent.layout.height))}>
            <FrontPage name={paper.name} book={title.trim().length === 0 ? 'Untitled' : title.trim()} e={e} />
          </View>
          <View style={styles.row}>
            <OutlineButton label="Read it there" icon="book-open-variant" onPress={() => openChapter(e.nodeId, { term: leadFirstSentence(e), block: 0 })} />
            <GoldButton label="Print it" icon="printer-outline" disabled={picture.working} onPress={() => void picture.share(paper.name)} />
          </View>
        </>
      )}
      {picture.message ? <Note ink={light} text={picture.message} /> : null}
    </KeepsakePage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  front: { width: frontPageWidth, maxWidth: '100%', backgroundColor: paper, paddingHorizontal: 18, paddingVertical: 14 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  caps8: { fontFamily: fonts.display, fontSize: 8, color: ink, letterSpacing: 0.8 },
  caps9: { fontFamily: fonts.display, fontSize: 9, color: ink, letterSpacing: 0.8, marginBottom: 3 },
  book: { flex: 1, textAlign: 'center' },
  masthead: { fontFamily: fonts.display, fontSize: 34, color: ink, textAlign: 'center', letterSpacing: 0.5, marginTop: 4 },
  hair: { height: 0.8, backgroundColor: ink, marginTop: 4, marginBottom: 10 },
  headline: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: ink, textAlign: 'center', letterSpacing: 0.4 },
  deck: { fontFamily: fonts.bookItalic, fontSize: 13.5, color: ink, textAlign: 'center', marginTop: 6 },
  columns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1, gap: 5 },
  second: { borderLeftWidth: 0.6, borderLeftColor: ink, paddingLeft: 10 },
  lead: { fontFamily: fonts.book, fontSize: 10.5, lineHeight: 14, color: ink },
  leadCaps: { fontFamily: fonts.display },
  boxes: { flexDirection: 'row' },
  said: { flex: 3 },
  vrule: { width: 0.6, backgroundColor: ink, marginHorizontal: 10 },
  weather: { flex: 2 },
  forecast: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  small: { fontFamily: fonts.book, fontSize: 10.5, lineHeight: 14, color: ink, marginBottom: 5 },
  tiny: { fontFamily: fonts.bookItalic, fontSize: 8.5, color: ink },
  italic: { fontFamily: fonts.bookItalic },
  speaker: { fontFamily: fonts.book, fontWeight: '700' },
  faint: { opacity: 0.7 },
  hrule: { height: 0.6, backgroundColor: ink, marginVertical: 7 },
  press: { fontFamily: fonts.display, fontSize: 7, color: ink, textAlign: 'center', letterSpacing: 1, opacity: 0.8 },
  turns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  tomorrow: { width: frontPageWidth, maxWidth: '100%', padding: space.xl, gap: space.md, alignItems: 'center', borderWidth: 1, borderColor: `${light}55` },
  tomorrowHead: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 2, color: light },
  tomorrowLine: { fontFamily: fonts.book, fontSize: 15, lineHeight: 23, color: light, textAlign: 'center' },
});

