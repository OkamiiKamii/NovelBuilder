// YOUR BOOK SO FAR (FEATURES.md #340): the book told as a story in pages, each a deep colour: what you have written,
// the days at the desk, the biggest chapter, who the book is about and who talks most, the words you lean on, how it
// begins and where it stands, and the next stop. Each page shares as a tall picture; the last leads back to the
// writing. A port of flutter_app/lib/features/progress/book_story.dart.

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { bookStoryJob } from '../../domain/analytics/bookStory';
import { storyInputsOf } from '../../domain/keepsakes/inputs';
import { type StoryLine, storyFoot, storyPageSize, storyPages, storyPalette } from '../../domain/keepsakes/pages';
import { GoldButton, IconButton, OutlineButton } from '../kit';
import { fonts, space } from '../theme';
import { KeepsakePage, Note, Waiting, useKeepsake, usePicture, useReading } from './parts';

const ground = '#0C0B12';
const ink = '#FFF8EC';
const gold = '#F2C76E';

function Line({ line }: { line: StoryLine }) {
  switch (line.kind) {
    case 'gap':
      return <View style={{ height: line.height }} />;
    case 'kicker':
      return <Text style={styles.kicker}>{line.text}</Text>;
    case 'big':
      return (
        <Text
          style={[styles.big, { fontSize: line.size, lineHeight: line.size * 1.15, color: line.gold ? gold : ink, fontFamily: line.heavy ? fonts.display : fonts.book }]}
          adjustsFontSizeToFit
          numberOfLines={3}
        >
          {line.text}
        </Text>
      );
    case 'small':
      return <Text style={styles.small}>{line.text}</Text>;
    case 'quote':
      return (
        <Text style={styles.quote} numberOfLines={line.lines}>
          {line.text}
        </Text>
      );
  }
}

export function StoryPage() {
  const open = useKeepsake('story');
  const router = useRouter();
  const story = useReading(open, (b, s) => bookStoryJob(storyInputsOf(s), b.stored)()).value;
  const [at, setAt] = useState(0);
  const [pictureRef, picture] = usePicture(storyPageSize);
  if (open === null || story === null) {
    return (
      <KeepsakePage title="Your book so far" ground={ground} ink={ink}>
        <Waiting ink={ink} text={open === null ? 'No novel is open.' : undefined} />
      </KeepsakePage>
    );
  }
  const pages = storyPages(story);
  const i = Math.min(at, pages.length - 1);
  const [top, low] = storyPalette[i % storyPalette.length];
  const last = i === pages.length - 1;
  return (
    <KeepsakePage title="Your book so far" ground={ground} ink={ink}>
      <View ref={pictureRef} collapsable={false} style={styles.page}>
        <LinearGradient colors={[top, low]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
          <View style={styles.lines}>
            {pages[i].map((l, n) => (
              <Line key={n} line={l} />
            ))}
          </View>
          <Text style={styles.foot}>{storyFoot(i, pages.length)}</Text>
        </LinearGradient>
      </View>
      <View style={styles.turns}>
        <IconButton icon="chevron-left" label="The page before" color={ink} onPress={() => setAt(Math.max(0, i - 1))} />
        <Note ink={ink} text={`${i + 1} of ${pages.length}`} />
        <IconButton icon="chevron-right" label="The next page" color={ink} onPress={() => setAt(Math.min(pages.length - 1, i + 1))} />
      </View>
      <View style={styles.row}>
        <GoldButton label="Share this page" icon="share-variant" disabled={picture.working} onPress={() => void picture.share('Your book so far')} />
        {last ? <OutlineButton label="Keep writing" icon="pencil-outline" onPress={() => router.navigate('/write')} /> : null}
      </View>
      {picture.message ? <Note ink={ink} text={picture.message} /> : null}
    </KeepsakePage>
  );
}

const styles = StyleSheet.create({
  page: { width: storyPageSize.width, height: storyPageSize.height, maxWidth: '100%', borderRadius: 14, overflow: 'hidden' },
  fill: { flex: 1, padding: 32, justifyContent: 'space-between' },
  lines: { flex: 1, justifyContent: 'center' },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 2.6, color: gold },
  big: { color: ink },
  small: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: ink, opacity: 0.85 },
  quote: { fontFamily: fonts.bookItalic, fontSize: 18, lineHeight: 27, color: ink },
  foot: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.6, color: ink, opacity: 0.55 },
  turns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
});
