// THE SUBMISSION KIT (FEATURES.md #347): what an agent or a publisher asks for, and how far the book has come: a title,
// the author's name, a genre, a length the genre expects, a synopsis of about a page, and clean opening chapters (the
// proofreader's slips in the first three, from Review's proofreading); a way to make each ready where it is not. Then
// the query letter laid out from the book's own details, its gaps (what only the author can write) marked. **Copy the
// letter**, or **Save it** as text. Nothing here writes into the book. A port of
// flutter_app/lib/features/progress/submission_page.dart.

import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { shareTextFile } from '../../data/files';
import { bookWords } from '../../domain/keepsakes/inputs';
import { kitAction, kitActionLabel, kitHead, letterFile, letterFinished, letterParts, openingSlipsOf } from '../../domain/keepsakes/pages';
import { kitItemLabel, lengthFor, queryLetter, submissionKit } from '../../domain/manuscript/submission';
import { Novel } from '../../domain/novel';
import { proofReading } from '../../domain/proof/screens/proofPage';
import { GoldButton, Icon, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';
import { KeepsakePage, Waiting, useKeepsake, useReading } from './parts';

export function SubmissionPage() {
  const open = useKeepsake(null);
  const router = useRouter();
  const slips = useReading(open, (b, s) => openingSlipsOf(proofReading(b.stored, s.rows('chapters'), s.rows('loreEntries')).run())).value;
  const [message, setMessage] = useState<string | null>(null);
  if (open === null || slips === null) {
    return (
      <KeepsakePage title="Submission kit" ground={colors.background} ink={colors.text}>
        <Waiting ink={colors.text} text={open === null ? 'No novel is open.' : undefined} />
      </KeepsakePage>
    );
  }
  const novel = new Novel(open.snapshot.project);
  const words = bookWords(open.snapshot);
  const kit = submissionKit({
    title: novel.title,
    author: novel.author,
    genre: novel.primaryGenre,
    words,
    synopsis: novel.synopsis,
    openingSlips: slips,
  });
  const length = lengthFor(novel.primaryGenre);
  const letter = queryLetter({
    title: novel.title,
    author: novel.author,
    genre: novel.primaryGenre,
    more: novel.secondaryGenres,
    words,
    finished: letterFinished(words, length.low, novel.targetWordCount),
    synopsis: novel.synopsis,
  });
  const act = (to: 'details' | 'slips' | 'sampler') =>
    router.navigate(to === 'details' ? '/' : to === 'slips' ? '/review/proof' : '/keepsakes/sampler');
  const copy = async () => {
    await Clipboard.setStringAsync(letter);
    setMessage('The letter is copied, gaps and all.');
  };
  const save = async () => {
    try {
      await shareTextFile(letterFile(novel.title), letter, 'text/plain');
    } catch (e) {
      setMessage(`The letter could not be saved: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <KeepsakePage title="Submission kit" ground={colors.background} ink={colors.text}>
      <View style={styles.column}>
        <Text style={styles.said}>{kitHead(novel.title, kit)}</Text>
        <Panel style={styles.kit}>
          {kit.map((k) => {
            const action = kitAction(k, slips);
            return (
              <View key={k.item} style={styles.item}>
                <View accessible accessibilityLabel={k.ready ? 'Ready' : 'Not yet'}>
                  <Icon name={k.ready ? 'check-circle' : 'circle-outline'} size={22} color={k.ready ? colors.success : colors.muted} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.label}>{kitItemLabel[k.item]}</Text>
                  <Text style={styles.said}>{k.said}</Text>
                  {action !== null ? (
                    <OutlineButton compact label={kitActionLabel[action]} icon={action === 'details' ? 'pencil-outline' : action === 'slips' ? 'spellcheck' : 'file-document-outline'} onPress={() => act(action)} style={styles.action} />
                  ) : null}
                </View>
              </View>
            );
          })}
        </Panel>
        <Text style={styles.heading} accessibilityRole="header">
          The query letter
        </Text>
        <Text style={styles.said}>Laid out from the book’s details. The marked parts are yours to write: no one else can.</Text>
        <Panel style={styles.letterPanel}>
          <Text style={styles.letter}>
            {letterParts(letter).map((p, i) =>
              p.gap ? (
                <Text key={i} style={styles.gap}>
                  {p.text}
                </Text>
              ) : (
                <Text key={i}>{p.text}</Text>
              ),
            )}
          </Text>
        </Panel>
        <View style={styles.row}>
          <GoldButton label="Copy the letter" icon="content-copy" onPress={() => void copy()} />
          <OutlineButton label="Save it" icon="content-save-outline" onPress={() => void save()} />
        </View>
        {message ? <Text style={styles.said}>{message}</Text> : null}
      </View>
    </KeepsakePage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  column: { width: '100%', maxWidth: 720, gap: space.md },
  kit: { gap: space.md },
  item: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  label: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  said: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.muted },
  action: { alignSelf: 'flex-start', marginTop: space.xs },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.text, marginTop: space.md },
  letterPanel: { backgroundColor: '#FBF8F1' },
  letter: { fontFamily: fonts.book, fontSize: 14.5, lineHeight: 22, color: '#221D17' },
  gap: { backgroundColor: '#F3B63A55', color: '#5A3B00' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
