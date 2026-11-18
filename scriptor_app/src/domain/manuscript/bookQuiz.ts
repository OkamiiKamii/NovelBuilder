// THE BOOK QUIZ: how well do you know your own book? Questions made from its pages, never written for it: who said it
// (a line someone says, and the cast to choose from); which chapter (a line worth quoting, and four chapters); the
// missing word (a line with its longest word taken out, and four words of the book's own); which comes first (two
// lines from far apart). The kinds take turns, each line asked once, ten at most; a seed picks them, so every game is
// new. Reads only.
//
// A port of flutter_app/lib/shared/domain/manuscript/book_quiz.dart.

import { storedPages } from '../characters/pageText';
import { type Spoken, spokenByEach } from '../characters/voice';
import { DartRandom, dartShuffled } from '../desk/dartRandom';
import { docBlocks } from '../prose';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { countOf, lineScore, sentencePattern, startsLower, wordsOf } from './bestLines';
import { compareNum, dartSort } from './dartSort';

/** The kinds of question. */
export type QuizKind = 'whoSaid' | 'whichChapter' | 'missingWord' | 'whichFirst';

/** What the card says each kind asks, in capitals. */
export const quizKicker: Readonly<Record<QuizKind, string>> = {
  whoSaid: 'WHO SAID IT?',
  whichChapter: 'WHICH CHAPTER?',
  missingWord: 'THE MISSING WORD',
  whichFirst: 'WHICH COMES FIRST?',
};

/** A question: its kind, the line shown (with a gap for the missing word; empty for which comes first), the choices
 * and which is right, where the line is, and what is said when it is answered ("Chapter 4 · The Bell"). */
export type QuizQuestion = {
  kind: QuizKind;
  line: string;
  options: string[];
  answer: number;
  nodeId: string;
  block: number;
  where: string;
};

/** A chapter for the quiz: its id, title, and every block (a heading as `null`). */
export type QuizChapter = { id: string; title: string; paragraphs: (string | null)[] };

/** A character for the quiz: the name they are known by, and the lines they say. */
export type QuizSpeaker = { name: string; lines: Spoken[] };

/** The most questions in a game. */
export const quizLength = 10;

/** The fewest questions a game is played with. */
export const quizAtLeast = 3;

/** The gap left by the missing word. */
export const quizGap = '_____';

const plain = new Set([
  'about', 'after', 'again', 'against', 'almost', 'along', 'already', 'although', 'always', 'another', 'anything',
  'around', 'because', 'before', 'behind', 'being', 'below', 'between', 'could', 'didn’t', "didn't", 'doesn’t',
  "doesn't", 'during', 'either', 'enough', 'every', 'everything', 'nothing', 'other', 'others', 'should', 'something',
  'still', 'their', 'there', 'these', 'thing', 'things', 'those', 'though', 'through', 'under', 'until', 'where',
  'which', 'while', 'would', 'wouldn’t', "wouldn't", 'yourself', 'himself', 'herself', 'itself', 'themselves',
  'without', 'within', 'someone', 'anyone', 'everyone', 'really', 'little', 'maybe', 'perhaps',
]);

/** The chapter a line is in, said for the answer. */
export function chapterLabel(index: number, title: string): string {
  return dartTrim(title).length === 0 ? `Chapter ${index + 1}` : `Chapter ${index + 1} · ${dartTrim(title)}`;
}

const content = (w: string): boolean => w.length >= 5 && startsLower(w) && !plain.has(dartToLowerCase(w));

/** Whether `text` has been asked already, or holds a line someone says that has. */
function taken(used: ReadonlySet<string>, text: string): boolean {
  const t = dartToLowerCase(text);
  if (used.has(t)) return true;
  for (const u of used) if (t.includes(u)) return true;
  return false;
}

type Line = { text: string; chapter: number; block: number; at: number };

/** A game of questions about the book of `chapters` (in reading order) and `speakers` (by id), chosen by `seed`. */
export function bookQuiz(
  chapters: readonly QuizChapter[],
  speakers: ReadonlyMap<string, QuizSpeaker>,
  options: { seed: number },
): QuizQuestion[] {
  const random = new DartRandom(options.seed);
  // Every sentence worth asking about, where it is and in what order.
  const lines: Line[] = [];
  chapters.forEach((chapter, c) => {
    chapter.paragraphs.forEach((text, b) => {
      if (text === null) return;
      for (const m of text.matchAll(sentencePattern)) {
        const s = dartTrim(m[0]);
        const n = wordsOf(s).length;
        if (n < 6 || n > 26) continue;
        if (countOf(s, '“') !== countOf(s, '”') || countOf(s, '"') % 2 === 1) continue;
        if (lineScore(s) <= 0) continue;
        lines.push({ text: s, chapter: c, block: b, at: lines.length });
      }
    });
  });
  const used = new Set<string>();
  const where = (c: number) => chapterLabel(c, chapters[c].title);
  const lowerChapter = (c: number) => where(c).replace('Chapter', 'chapter');

  // Who said it: a line of a speaker's, among the others with names.
  const names = new Set([...speakers.values()].map((s) => s.name));
  const said = dartShuffled(
    [...speakers.values()].flatMap((s) =>
      s.lines
        .filter((l) => {
          const n = wordsOf(l.words).length;
          return n >= 4 && n <= 22;
        })
        .map((line) => ({ speaker: s.name, line })),
    ),
    random,
  );
  const index = new Map(chapters.map((c, i) => [c.id, i] as const));
  const whoSaid = (): QuizQuestion | null => {
    if (names.size < 2) return null;
    for (const s of said) {
      const words = dartToLowerCase(s.line.words);
      // Not a line already asked, nor one inside a sentence already asked.
      if ([...used].some((u) => u.includes(words)) || used.has(words)) continue;
      used.add(words);
      const rest = [...names];
      rest.splice(rest.indexOf(s.speaker), 1);
      const others = dartShuffled(rest, random);
      const opts = dartShuffled([s.speaker, ...others.slice(0, 3)], random);
      const c = index.get(s.line.nodeId) ?? 0;
      return {
        kind: 'whoSaid',
        line: `“${dartTrim(s.line.words)}”`,
        options: opts,
        answer: opts.indexOf(s.speaker),
        nodeId: s.line.nodeId,
        block: s.line.block,
        where: `${s.speaker}, in ${lowerChapter(c)}`,
      };
    }
    return null;
  };

  const shuffled = dartShuffled(lines, random);
  const fresh = (): Line | null => {
    for (const l of shuffled) {
      if (taken(used, l.text)) continue;
      const key = dartToLowerCase(l.text);
      if (used.has(key)) continue;
      used.add(key);
      return l;
    }
    return null;
  };

  // Which chapter: a line, among its chapter and three others.
  const withLines = new Set(lines.map((l) => l.chapter));
  const whichChapter = (): QuizQuestion | null => {
    if (withLines.size < 2) return null;
    const l = fresh();
    if (l === null) return null;
    const all = chapters.map((_, i) => i);
    all.splice(all.indexOf(l.chapter), 1);
    const others = dartShuffled(all, random);
    const picked = dartSort([l.chapter, ...others.slice(0, 3)], compareNum);
    return {
      kind: 'whichChapter',
      line: l.text,
      options: picked.map(where),
      answer: picked.indexOf(l.chapter),
      nodeId: chapters[l.chapter].id,
      block: l.block,
      where: where(l.chapter),
    };
  };

  // The missing word: its longest word out, among three of the book's own of about its length.
  const pool = new Set<string>();
  for (const l of lines) {
    for (const m of wordsOf(l.text)) if (content(m[0])) pool.add(dartToLowerCase(m[0]));
  }
  const missingWord = (): QuizQuestion | null => {
    for (let tries = 0; tries < 6; tries++) {
      const l = fresh();
      if (l === null) return null;
      const words = wordsOf(l.text).filter((m) => content(m[0]));
      if (words.length === 0) continue;
      const gone = words.reduce((a, b) => (b[0].length > a[0].length ? b : a));
      const word = dartToLowerCase(gone[0]);
      const lowerLine = dartToLowerCase(l.text);
      const like = dartShuffled(
        [...pool].filter((w) => w !== word && Math.abs(w.length - word.length) <= 2 && !lowerLine.includes(w)),
        random,
      );
      if (like.length < 3) continue;
      const opts = dartShuffled([word, ...like.slice(0, 3)], random);
      const start = gone.index!;
      return {
        kind: 'missingWord',
        line: l.text.substring(0, start) + quizGap + l.text.substring(start + gone[0].length),
        options: opts,
        answer: opts.indexOf(word),
        nodeId: chapters[l.chapter].id,
        block: l.block,
        where: `“${word}”, ${lowerChapter(l.chapter)}`,
      };
    }
    return null;
  };

  // Which comes first: two lines a fair way apart.
  const whichFirst = (): QuizQuestion | null => {
    if (lines.length < 6) return null;
    const a = fresh();
    if (a === null) return null;
    const gap = Math.max(3, Math.trunc(lines.length / 4));
    const far = shuffled.filter((l) => Math.abs(l.at - a.at) >= gap && !taken(used, l.text));
    if (far.length === 0) return null;
    const b = far[0];
    used.add(dartToLowerCase(b.text));
    const pair = dartShuffled([a, b], random);
    const first = pair[0].at < pair[1].at ? 0 : 1;
    const early = pair[first];
    return {
      kind: 'whichFirst',
      line: '',
      options: pair.map((l) => l.text),
      answer: first,
      nodeId: chapters[early.chapter].id,
      block: early.block,
      where:
        early.chapter === pair[1 - first].chapter
          ? `Both in ${lowerChapter(early.chapter)}; this one first`
          : `This one is in ${lowerChapter(early.chapter)}`,
    };
  };

  const makers = [whoSaid, missingWord, whichChapter, whichFirst];
  const out: QuizQuestion[] = [];
  const spent = new Set<number>();
  // Each turn asks or spends a kind (or passes one spent): bounded well within these turns.
  for (let turn = 0; turn < 1000 && out.length < quizLength && spent.size < makers.length; turn++) {
    const k = turn % makers.length;
    if (spent.has(k)) continue;
    const q = makers[k]();
    if (q === null) spent.add(k);
    else out.push(q);
  }
  return out.length < quizAtLeast ? [] : out;
}

/** What a score says: `right` of `of`. */
export function quizVerdict(right: number, of: number): string {
  const share = of === 0 ? 0 : right / of;
  if (share >= 0.9) return 'Every word of it. You know this book by heart.';
  if (share >= 0.7) return 'You know it well. A few lines slipped by.';
  if (share >= 0.4) return 'Some of it has gone quiet. A reread would bring it back.';
  return 'Time to read it again, the way a reader would.';
}

/** `bookQuiz` over the chapters as stored (JSON text, a row each): `order` the chapters' ids in reading order, `titles`
 * their titles, `people` each character's names to find (the first the one they are known by). A job. */
export function bookQuizJob(
  storedContents: readonly string[],
  order: readonly string[],
  titles: ReadonlyMap<string, string>,
  people: ReadonlyMap<string, readonly string[]>,
  options: { seed: number },
): () => QuizQuestion[] {
  return () => {
    const blocks = storedPages(storedContents, new Set(order), docBlocks);
    const pages = new Map(order.map((id) => [id, (blocks.get(id) ?? []).map((b) => b.text)] as const));
    // Everyone's lines in one reading of the book's lines, not a reading a person.
    const named = new Map([...people].filter(([, names]) => names.length > 0));
    const spoken = spokenByEach(pages, order, named, { limit: 60 });
    const speakers = new Map(
      [...named].map(([id, names]) => [id, { name: names[0], lines: spoken.get(id)! }] as const),
    );
    return bookQuiz(
      order.map((id) => ({
        id,
        title: titles.get(id) ?? '',
        paragraphs: (blocks.get(id) ?? []).map((b) => (b.heading ? null : b.text)),
      })),
      speakers,
      options,
    );
  };
}
