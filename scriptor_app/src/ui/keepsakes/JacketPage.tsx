// THE FULL JACKET (FEATURES.md #342): the book's cover as a printer lays it out, flat: the back (a pull quote, the
// blurb, what kind of book it is, the author and a barcode from the book itself), the spine (as thick as the book's
// pages, its title running down it) and the front (the book's own jacket, as the Library shows it). Shared as a
// picture. A port of flutter_app/lib/features/progress/full_jacket.dart.

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { boundLook, cssOf, lerpColour, rgbaOf, withAlpha } from '../../domain/characters/aids/colour';
import { dartToUpperCase } from '../../domain/exchange/dartUpperCase';
import { bookWords } from '../../domain/keepsakes/inputs';
import { backKind, barcodeBars, barcodeSeed, jacketSize, spineWidth } from '../../domain/keepsakes/pages';
import { jacketCopyJob } from '../../domain/manuscript/jacketCopy';
import { Novel } from '../../domain/novel';
import { NovelCover } from '../library/NovelCover';
import { GoldButton } from '../kit';
import { fonts } from '../theme';
import { KeepsakePage, Note, Waiting, useKeepsake, usePicture, useReading } from './parts';

const ink = '#F4EEDF';
const book = 156;

export function JacketPage() {
  const open = useKeepsake('jacket');
  const made = useReading(open, (b, s) => ({ copy: jacketCopyJob(b.stored, b.order, b.novel.synopsis)(), words: bookWords(s) })).value;
  const [pictureRef, picture] = usePicture(jacketSize);
  if (open === null || made === null) {
    return (
      <KeepsakePage title="The full jacket" ground="#14110F" ink={ink}>
        <Waiting ink={ink} text={open === null ? 'No novel is open.' : undefined} />
      </KeepsakePage>
    );
  }
  const novel = new Novel(open.snapshot.project);
  const accent = /^#[0-9a-fA-F]{6}$/.test(novel.accent) ? novel.accent : '#b4532a';
  const look = boundLook(rgbaOf(accent));
  const ground = look.ground.map(cssOf) as [string, string];
  const lookInk = cssOf(look.ink);
  const frame = cssOf(look.frame);
  const spine = spineWidth(made.words);
  const size = Math.min(spine * 0.42, 11);
  const title = novel.title.length === 0 ? 'Untitled novel' : novel.title;
  const author = novel.author.trim();
  const bars = barcodeBars(barcodeSeed(novel.id, made.words), 30);
  return (
    <KeepsakePage title="The full jacket" ground="#14110F" ink={ink}>
      <Note ink={ink} text="The back, the spine and the front, as a printer lays them out. The spine is as thick as your pages." />
      <View ref={pictureRef} collapsable={false} style={styles.spread}>
        <LinearGradient colors={['#2A2420', '#14110F']} start={{ x: 0.5, y: 0.2 }} end={{ x: 0.5, y: 1 }} style={styles.backdrop}>
          <View style={styles.books}>
            <LinearGradient colors={ground} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.back}>
              <View style={[styles.frame, { borderColor: cssOf(withAlpha(look.frame, 0.55)) }]}>
                {made.copy.quote.length > 0 ? (
                  <Text style={[styles.quote, { color: lookInk }]} numberOfLines={4}>
                    “{made.copy.quote}”
                  </Text>
                ) : null}
                <View style={[styles.rule, { backgroundColor: frame }]} />
                <Text style={[styles.blurb, { color: lookInk }]} numberOfLines={12}>
                  {made.copy.blurb}
                </Text>
                <View style={styles.foot}>
                  <View style={styles.flex}>
                    <Text style={[styles.kind, { color: frame }]} numberOfLines={1}>
                      {backKind(novel.primaryGenre)}
                    </Text>
                    {author.length > 0 ? (
                      <Text style={[styles.author, { color: lookInk }]} numberOfLines={1}>
                        {author}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.barcode}>
                    <Svg width={30} height={16}>
                      {bars.map((b, i) => (
                        <Rect key={i} x={b.x} y={0} width={b.width} height={16} fill="#000000" />
                      ))}
                    </Svg>
                  </View>
                </View>
              </View>
            </LinearGradient>
            <LinearGradient
              colors={[cssOf(lerpColour(look.ground[0], rgbaOf('#000000'), 0.25)), ground[0], ground[1]]}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.spine, { width: spine, paddingVertical: spine * 0.5 }]}
            >
              <View style={styles.spineTitle}>
                <Text style={[styles.spineText, { fontSize: size, color: lookInk, width: book * 1.5 - spine * 2 }]} numberOfLines={1}>
                  {dartToUpperCase(title)}
                </Text>
              </View>
              <View style={[styles.diamond, { width: spine * 0.22, height: spine * 0.22, backgroundColor: frame }]} />
            </LinearGradient>
            <View style={styles.front}>
              <NovelCover novel={novel} height={book * 1.5} />
            </View>
          </View>
        </LinearGradient>
      </View>
      <GoldButton label="Share the jacket" icon="share-variant" disabled={picture.working} onPress={() => void picture.share('The full jacket')} />
      {picture.message ? <Note ink={ink} text={picture.message} /> : null}
    </KeepsakePage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spread: { width: jacketSize.width, height: jacketSize.height, maxWidth: '100%', overflow: 'hidden' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  books: { flexDirection: 'row', shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
  back: { width: book, height: book * 1.5, padding: book * 0.07, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 },
  frame: { flex: 1, borderWidth: 0.6, padding: book * 0.06 },
  quote: { fontFamily: fonts.bookItalic, fontSize: 9.5, lineHeight: 12, textAlign: 'center' },
  rule: { width: 24, height: 0.6, alignSelf: 'center', marginVertical: 5 },
  blurb: { flex: 1, fontFamily: fonts.book, fontSize: 6.6, lineHeight: 9, opacity: 0.88 },
  foot: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  kind: { fontFamily: fonts.display, fontSize: 5, letterSpacing: 1 },
  author: { fontFamily: fonts.book, fontSize: 7 },
  barcode: { width: 34, height: 20, backgroundColor: '#FFFFFF', padding: 2 },
  spine: { height: book * 1.5, alignItems: 'center' },
  spineTitle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spineText: { fontFamily: fonts.display, letterSpacing: 1.6, textAlign: 'center', transform: [{ rotate: '90deg' }] },
  diamond: { transform: [{ rotate: '45deg' }] },
  front: { width: book, height: book * 1.5, overflow: 'hidden', borderTopRightRadius: 3, borderBottomRightRadius: 3 },
});
