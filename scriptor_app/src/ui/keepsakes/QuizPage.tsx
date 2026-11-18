// THE BOOK QUIZ (FEATURES.md #339): up to ten questions from the book's own lines (who said it, which chapter, the
// missing word, which comes first), one at a time; an answer shown right or wrong at once, **Read it there** opening
// the chapter at it. At the end the score as a card: **Share your score** makes a square picture of it, **Play again**
// asks other lines. A port of flutter_app/lib/features/progress/book_quiz_page.dart.

import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { quizPeople } from '../../domain/keepsakes/inputs';
import { choiceState, quizAsk, quizParts, quizProgress, quoteCardSize, scoreFoot } from '../../domain/keepsakes/pages';
import { bookQuizJob, quizAtLeast, quizKicker, quizVerdict } from '../../domain/manuscript/bookQuiz';
import { GoldButton, OutlineButton } from '../kit';
import { fonts, space } from '../theme';
import { Empty, KeepsakePage, Note, Waiting, bookNames, useKeepsake, useOpenChapter, usePicture, useReading } from './parts';

const night = '#0F1622';
const ink = '#F2EDE2';
const gold = '#E8C46A';
const right = '#6FBF8E';
const wrong = '#E07A6F';

export function QuizPage() {
  const open = useKeepsake('quiz');
  const reading = useReading(open, (b, s) =>
    bookQuizJob(b.stored, b.order, b.titles, quizPeople(s), { seed: Date.now() * 1000 })(),
  );
  const quiz = reading.value;
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [pictureRef, picture] = usePicture(quoteCardSize);
  const openChapter = useOpenChapter(open);
  const page = (body: ReactNode) => (
    <KeepsakePage title="The book quiz" ground={night} ink={ink}>
      {body}
    </KeepsakePage>
  );
  if (open === null || quiz === null) return page(<Waiting ink={ink} text={open === null ? 'No novel is open.' : undefined} />);
  if (quiz.length < quizAtLeast) {
    return page(<Empty ink={ink} text="Not enough to ask about yet. As your chapters grow, the quiz makes its questions from them: who said it, which chapter, the missing word." />);
  }
  const { title, author } = bookNames(open);
  const again = () => {
    setAt(0);
    setPicked(null);
    setScore(0);
    setDone(false);
    reading.again();
  };
  if (done) {
    return page(
      <>
        <View ref={pictureRef} collapsable={false} style={styles.score}>
          <Text style={styles.kicker}>THE BOOK QUIZ</Text>
          <Text style={styles.big}>
            {score}
            <Text style={styles.of}> / {quiz.length}</Text>
          </Text>
          <Text style={styles.ofTitle}>of {title.trim().length === 0 ? 'Untitled' : title.trim()}</Text>
          <Text style={styles.verdict}>{quizVerdict(score, quiz.length)}</Text>
          <Text style={styles.foot}>{scoreFoot(author)}</Text>
        </View>
        <View style={styles.row}>
          <GoldButton label="Share your score" icon="share-variant" disabled={picture.working} onPress={() => void picture.share('Your quiz score')} />
          <OutlineButton label="Play again" icon="refresh" onPress={again} />
        </View>
        {picture.message ? <Note ink={ink} text={picture.message} /> : null}
      </>,
    );
  }
  const q = quiz[at];
  const last = at === quiz.length - 1;
  const parts = q.kind === 'missingWord' ? quizParts(q.line) : [q.line];
  return page(
    <>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: quiz.length, now: at + (picked === null ? 0 : 1) }}>
        <View style={[styles.fill, { width: `${quizProgress(at + 1, quiz.length, picked !== null) * 100}%` }]} />
      </View>
      <Note ink={ink} text={`Question ${at + 1} of ${quiz.length}`} />
      <View style={styles.card}>
        <Text style={styles.kicker}>{quizKicker[q.kind]}</Text>
        <Text style={styles.line}>
          {parts.map((p, i) => (
            <Text key={i}>
              {i > 0 ? <Text style={styles.gap}>{picked === null ? ' _____ ' : ` ${q.options[q.answer]} `}</Text> : null}
              {p}
            </Text>
          ))}
        </Text>
        <Text style={styles.ask}>{quizAsk[q.kind]}</Text>
      </View>
      <View style={styles.choices}>
        {q.options.map((o, i) => {
          const state = choiceState(i, q.answer, picked);
          const tone = state === 'right' ? right : state === 'wrong' ? wrong : ink;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ disabled: picked !== null }}
              accessibilityLabel={state === 'right' ? `${o}, the answer` : state === 'wrong' ? `${o}, not it` : o}
              disabled={picked !== null}
              onPress={() => {
                setPicked(i);
                if (i === q.answer) setScore((n) => n + 1);
              }}
              style={[styles.choice, { borderColor: state === 'open' ? `${ink}55` : tone, opacity: state === 'passed' ? 0.5 : 1 }]}
            >
              <Text style={[styles.choiceText, { color: tone }]}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
      {picked !== null ? (
        <View style={styles.row}>
          <OutlineButton label="Read it there" icon="book-open-variant" onPress={() => openChapter(q.nodeId)} />
          <GoldButton
            label={last ? 'See your score' : 'Next'}
            icon={last ? 'trophy-outline' : 'arrow-right'}
            onPress={() => {
              if (last) setDone(true);
              else {
                setAt(at + 1);
                setPicked(null);
              }
            }}
          />
        </View>
      ) : null}
      {picked !== null ? <Note ink={ink} text={q.where} /> : null}
    </>,
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', maxWidth: 480, height: 4, borderRadius: 2, backgroundColor: `${ink}22`, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: gold },
  card: { width: '100%', maxWidth: 480, padding: space.lg, gap: space.md, borderRadius: 12, backgroundColor: '#172133' },
  kicker: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 2.2, color: gold },
  line: { fontFamily: fonts.bookItalic, fontSize: 19, lineHeight: 28, color: ink },
  gap: { fontFamily: fonts.book, color: gold },
  ask: { fontFamily: fonts.ui, fontSize: 14, color: ink, opacity: 0.75 },
  choices: { width: '100%', maxWidth: 480, gap: space.sm },
  choice: { borderWidth: 1, borderRadius: 10, paddingVertical: 14, paddingHorizontal: space.md, minHeight: 48 },
  choiceText: { fontFamily: fonts.ui, fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  score: {
    width: quoteCardSize.width,
    height: quoteCardSize.height,
    maxWidth: '100%',
    backgroundColor: night,
    borderWidth: 1,
    borderColor: `${gold}66`,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  big: { fontFamily: fonts.display, fontSize: 72, color: gold },
  of: { fontSize: 30, color: ink },
  ofTitle: { fontFamily: fonts.bookItalic, fontSize: 18, color: ink, textAlign: 'center' },
  verdict: { fontFamily: fonts.book, fontSize: 15, color: ink, opacity: 0.85, textAlign: 'center' },
  foot: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.4, color: ink, opacity: 0.6, marginTop: 8 },
});
