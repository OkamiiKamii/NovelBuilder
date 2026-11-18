// POSTCARDS FROM YOUR WORLD (FEATURES.md #344): up to sixteen places the book names or the world keeps, each a painted
// postcard (the sky in its light, its land and water, its trees, towers and roofs, all from what the pages say of
// it), "Greetings from" in large letters; turned over, a line from the book where the place is, the chapter, a stamp
// with the place painted small, a postmark and a reader's address. **Send it** shares the side showing as a picture.
// A port of flutter_app/lib/features/progress/postcards_page.dart.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Circle, Defs, G, Line, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { dartToUpperCase } from '../../domain/exchange/dartUpperCase';
import { keptPlaces } from '../../domain/keepsakes/inputs';
import { backWords, frontColours, postcardPictureScale, postcardScene, postcardSize } from '../../domain/keepsakes/postcardScene';
import { type Postcard, postcardsJob } from '../../domain/manuscript/postcards';
import { GoldButton, IconButton, OutlineButton } from '../kit';
import { fonts, space } from '../theme';
import { Empty, KeepsakePage, Note, Waiting, bookNames, useKeepsake, usePicture, useReading } from './parts';
import { useOpenChapter } from '../write/pendingFind';

const ground = '#231D19';
const card = '#F8F1E2';
const light = '#F8F1E2';
const backInk = '#2B2219';

/** A postcard's painting at `width` by `height`. */
function Scene({ postcard, width, height, id }: { postcard: Postcard; width: number; height: number; id: string }) {
  const shapes = postcardScene(postcard, width, height);
  let clips = 0;
  return (
    <Svg width={width} height={height}>
      <Defs>
        {shapes.map((s, i) =>
          s.kind === 'sky' ? (
            <SvgGradient key={i} id={`${id}-sky`} x1={0} y1={0} x2={0} y2={s.to} gradientUnits="userSpaceOnUse">
              <Stop offset={0} stopColor={s.top} />
              <Stop offset={1} stopColor={s.low} />
            </SvgGradient>
          ) : s.kind === 'rect' && s.clip ? (
            <ClipPath key={i} id={`${id}-clip-${clips++}`}>
              <Path d={s.clip} />
            </ClipPath>
          ) : null,
        )}
      </Defs>
      {(() => {
        let clip = 0;
        return shapes.map((s, i) => {
          switch (s.kind) {
            case 'sky':
              return <Rect key={i} x={s.x} y={s.y} width={s.width} height={s.height} fill={`url(#${id}-sky)`} />;
            case 'rect': {
              const rect = <Rect x={s.x} y={s.y} width={s.width} height={s.height} fill={s.paint.colour} fillOpacity={s.paint.alpha} />;
              return s.clip ? (
                <G key={i} clipPath={`url(#${id}-clip-${clip++})`}>
                  {rect}
                </G>
              ) : (
                <G key={i}>{rect}</G>
              );
            }
            case 'circle':
              return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.paint.colour} fillOpacity={s.paint.alpha} />;
            case 'path':
              return <Path key={i} d={s.d} fill={s.paint.colour} fillOpacity={s.paint.alpha} />;
            case 'line':
              return (
                <Line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.paint.colour} strokeOpacity={s.paint.alpha} strokeWidth={s.width} strokeLinecap="round" />
              );
          }
        });
      })()}
    </Svg>
  );
}

function Front({ postcard, book }: { postcard: Postcard; book: string }) {
  const { letters, shadow } = frontColours(postcard);
  const inner = { width: postcardSize.width - 20, height: postcardSize.height - 20 };
  return (
    <View style={styles.card}>
      <View style={styles.paint}>
        <Scene postcard={postcard} width={inner.width} height={inner.height} id="front" />
        <View style={styles.letters}>
          <Text style={[styles.greetings, { color: letters, textShadowColor: shadow }]}>Greetings from</Text>
          <Text style={[styles.place, { color: letters, textShadowColor: shadow }]} numberOfLines={1} adjustsFontSizeToFit>
            {dartToUpperCase(postcard.place)}
          </Text>
          <View style={styles.flex} />
          <Text style={[styles.book, { color: letters, textShadowColor: shadow }]}>{book}</Text>
        </View>
      </View>
    </View>
  );
}

function Back({ postcard, book, author }: { postcard: Postcard; book: string; author: string }) {
  const words = backWords(postcard, book, author);
  return (
    <View style={[styles.card, styles.back]}>
      <View style={styles.message}>
        <Text style={styles.greet}>{words.greeting}</Text>
        <Text style={styles.line} numberOfLines={7}>
          {postcard.line}
        </Text>
        <Text style={styles.greet}>{words.chapter}</Text>
        <Text style={styles.greet} numberOfLines={1}>
          {words.from}
        </Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.address}>
        <View style={styles.stampRow}>
          <View style={styles.postmark}>
            <Text style={styles.postmarkText} numberOfLines={1}>
              {dartToUpperCase(book)}
            </Text>
            <Text style={styles.postmarkText}>CH. {postcard.chapter}</Text>
          </View>
          <View style={styles.stamp}>
            <Scene postcard={postcard} width={52} height={55} id="stamp" />
            <Text style={styles.stampWord} numberOfLines={1}>
              {words.stamp}
            </Text>
          </View>
        </View>
        <View style={styles.flex} />
        {words.address.map((a, i) => (
          <View key={i} style={styles.addressLine}>
            <Text style={[styles.addressText, { fontSize: i === 0 ? 14 : 12 }]} numberOfLines={1}>
              {a}
            </Text>
          </View>
        ))}
        <Text style={styles.foot}>{words.foot}</Text>
      </View>
    </View>
  );
}

export function PostcardsPage() {
  const open = useKeepsake('postcards');
  const cards = useReading(open, (b, s) => postcardsJob(b.stored, b.order, b.titles, keptPlaces(s))()).value;
  const [at, setAt] = useState(0);
  const [turned, setTurned] = useState(false);
  const [pictureRef, picture] = usePicture(postcardSize, postcardPictureScale);
  const openChapter = useOpenChapter(open?.novelId ?? null);
  if (open === null || cards === null) {
    return (
      <KeepsakePage title="Postcards from your world" ground={ground} ink={light}>
        <Waiting ink={light} text={open === null ? 'No novel is open.' : undefined} />
      </KeepsakePage>
    );
  }
  if (cards.length === 0) {
    return (
      <KeepsakePage title="Postcards from your world" ground={ground} ink={light}>
        <Empty
          ink={light}
          text="No postcards yet. When your pages name a place (the Mimir Forest, the Grey Tower) or your world keeps one, its postcard is drawn here."
        />
      </KeepsakePage>
    );
  }
  const { title, author } = bookNames(open);
  const book = title.trim().length === 0 ? 'Untitled' : title.trim();
  const i = Math.min(at, cards.length - 1);
  const c = cards[i];
  const turn = (to: number) => {
    setAt(to);
    setTurned(false);
  };
  return (
    <KeepsakePage title="Postcards from your world" ground={ground} ink={light}>
      <View ref={pictureRef} collapsable={false} style={styles.holder}>
        {turned ? <Back postcard={c} book={book} author={author} /> : <Front postcard={c} book={book} />}
      </View>
      <View style={styles.turns}>
        <IconButton icon="chevron-left" label="The card before" color={light} onPress={() => turn((i - 1 + cards.length) % cards.length)} />
        <Note ink={light} text={`${i + 1} of ${cards.length} · ${c.place}`} />
        <IconButton icon="chevron-right" label="The next card" color={light} onPress={() => turn((i + 1) % cards.length)} />
      </View>
      <View style={styles.row}>
        <OutlineButton label="Turn it over" icon="rotate-3d-variant" onPress={() => setTurned(!turned)} />
        <GoldButton label="Send it" icon="send-outline" disabled={picture.working} onPress={() => void picture.share(`Greetings from ${c.place}`)} />
        <OutlineButton label="Read it there" icon="book-open-variant" onPress={() => openChapter(c.nodeId, { term: c.line, block: c.block })} />
      </View>
      {picture.message ? <Note ink={light} text={picture.message} /> : null}
    </KeepsakePage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  holder: { width: postcardSize.width, height: postcardSize.height, maxWidth: '100%' },
  card: { width: postcardSize.width, height: postcardSize.height, backgroundColor: card, borderRadius: 6, padding: 10, elevation: 8 },
  paint: { flex: 1, borderRadius: 3, overflow: 'hidden' },
  letters: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  greetings: { fontFamily: fonts.bookItalic, fontSize: 22, textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 1 },
  place: { fontFamily: fonts.display, fontSize: 46, lineHeight: 50, letterSpacing: 1.5, textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 1 },
  book: { alignSelf: 'flex-end', fontFamily: fonts.bookItalic, fontSize: 11, textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 1 },
  back: { flexDirection: 'row', paddingLeft: 20, paddingTop: 18, paddingRight: 18, paddingBottom: 14 },
  message: { flex: 11, gap: 6 },
  greet: { fontFamily: fonts.book, fontSize: 11, color: backInk, opacity: 0.7 },
  line: { flex: 1, fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 21, color: backInk },
  divider: { width: 1, marginHorizontal: 14, backgroundColor: `${backInk}55` },
  address: { flex: 8 },
  stampRow: { height: 92, flexDirection: 'row', justifyContent: 'space-between' },
  postmark: { marginTop: 22, width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: '#7A2E3A99', alignItems: 'center', justifyContent: 'center', padding: 4 },
  postmarkText: { fontFamily: fonts.display, fontSize: 6, color: '#7A2E3A', textAlign: 'center' },
  stamp: { width: 64, height: 76, backgroundColor: '#FFFFFF', padding: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D8CDB8', alignItems: 'center' },
  stampWord: { fontFamily: fonts.display, fontSize: 6, color: '#7A2E3A', letterSpacing: 1, marginTop: 3 },
  addressLine: { height: 26, justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: `${backInk}55` },
  addressText: { fontFamily: fonts.bookItalic, color: backInk, opacity: 0.85 },
  foot: { fontFamily: fonts.display, fontSize: 6.5, color: backInk, opacity: 0.5, letterSpacing: 1.2, textAlign: 'right', marginTop: 6 },
  turns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
});
