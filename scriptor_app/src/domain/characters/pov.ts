// WHOSE EYES: the character each chapter is told through, read from the prose and never guessed at: the one the
// narration (what is not said aloud) shows thinking, feeling and noticing ("Wren knew", "Ilse felt the cold", "Wren saw
// the band of wet stone"), with the one it names most as the lesser sign. A chapter whose narration says "I" and "me"
// is told in the first person. One where no one leads clearly is left unclear, not given to anyone.
//
// And what it means for the book: how much of it each is seen through, the longest run through the same eyes, and how
// long since each was last. A port of flutter_app/lib/shared/domain/characters/pov.dart. Reads only.

import { compareNum, dartSort } from '../manuscript/dartSort';
import { dartToLowerCase } from '../text/dartString';
import { CastNames, type EyesPerson } from './castNames';
import { allMatches, matchAt, paragraphsOf, sentenceAt, storedPages } from './pageText';

export type { EyesPerson } from './castNames';

/** How a chapter is told: through someone, in the first person, or unclear. */
export type Telling = 'through' | 'firstPerson' | 'unclear';
export const tellings: readonly Telling[] = ['through', 'firstPerson', 'unclear'];

/** A chapter's point of view: the chapter (1 first), its id, its title and words; how it is told and through whom (an
 * id, for 'through'); and a sentence that shows it. */
export type ChapterEyes = {
  chapter: number;
  nodeId: string;
  title: string;
  words: number;
  telling: Telling;
  who: string | null;
  evidence: string;
};

/** The words of thinking, feeling and noticing that show whose eyes a sentence is behind. */
export const perceiving: ReadonlySet<string> = new Set([
  'thought', 'felt', 'knew', 'wondered', 'saw', 'heard', 'noticed', 'remembered', 'realised', 'realized', 'watched',
  'wanted', 'hoped', 'feared', 'guessed', 'imagined', 'smelled', 'smelt', 'tasted', 'sensed', 'decided', 'understood',
  'believed', 'considered', 'recalled', 'suspected', 'worried', 'longed', 'dreaded', 'pictured', 'could', 'couldn’t',
  "couldn't", 'did', 'didn’t', "didn't", 'had',
]);

/** The verbs that only count after "could" / "did" / "had" (so "Wren could see" counts and "Wren could run" does not). */
const helpedVerbs = new Set([
  'see', 'hear', 'feel', 'tell', 'smell', 'taste', 'remember', 'think', 'imagine', 'understand', 'not', 'seen', 'heard',
  'known', 'thought', 'wondered', 'noticed', 'remembered', 'felt', 'never',
]);

const helpers = new Set(['could', 'couldn’t', "couldn't", 'did', 'didn’t', "didn't", 'had']);

const quoted = /“[^”]*”|"[^"]*"/g;
const word = /[\p{L}][\p{L}’'\-]*/gu;
const firstPersonWord = /\b(I|me|my|myself|I’m|I'm|I’d|I'd)\b/g;

/** What follows a name that counts: a word, and perhaps the word after it. And a possessive, which does not. */
const following = /\s+([\p{L}’']+)(?:\s+([\p{L}’']+))?/uy;
const possessive = /[’']/y;

const wordsIn = (text: string) => allMatches(word, text).length;

/** The point of view of each of `chapters` (each its id, title and paragraphs, in reading order), among `people`. A
 * chapter without a word is left out. */
export function chapterEyes(
  chapters: readonly { id: string; title: string; paragraphs: readonly string[] }[],
  people: readonly EyesPerson[],
): ChapterEyes[] {
  const out: ChapterEyes[] = [];
  const finder = new CastNames(people);
  chapters.forEach((chapter, c) => {
    const words = chapter.paragraphs.reduce((n, p) => n + wordsIn(p), 0);
    if (words === 0) return;
    // The narration: everything not said aloud.
    const narration = chapter.paragraphs.map((p) => p.replace(quoted, ' '));
    const narrated = narration.reduce((n, p) => n + wordsIn(p), 0);
    const firstPerson = narration.reduce((n, p) => n + allMatches(firstPersonWord, p).length, 0);

    // The cast's names, found in one reading of each paragraph: a name counts with a word after it (not "Kade’s").
    const perceives = new Map<string, number>();
    const named = new Map<string, number>();
    // The sentence that shows each one, the first by paragraph, then by which of their names, then by place.
    const shown = new Map<string, { paragraph: number; name: number; start: number; sentence: string }>();
    narration.forEach((paragraph, pi) => {
      for (const h of finder.all(paragraph)) {
        if (h.end < paragraph.length && matchAt(possessive, paragraph, h.end) !== null) continue;
        const m = matchAt(following, paragraph, h.end);
        if (m === null) continue;
        named.set(h.id, (named.get(h.id) ?? 0) + 1);
        const verb = dartToLowerCase(m.groups[0]!);
        const next = m.groups[1] === undefined ? '' : dartToLowerCase(m.groups[1]);
        const helped = helpers.has(verb);
        if (perceiving.has(verb) && (!helped || helpedVerbs.has(next) || perceiving.has(next))) {
          perceives.set(h.id, (perceives.get(h.id) ?? 0) + 1);
          const was = shown.get(h.id);
          const earlier =
            was === undefined ||
            pi < was.paragraph ||
            (pi === was.paragraph && (h.name < was.name || (h.name === was.name && h.start < was.start)));
          if (earlier) {
            shown.set(h.id, { paragraph: pi, name: h.name, start: h.start, sentence: sentenceAt(paragraph, h.start) });
          }
        }
      }
    });
    const scores = new Map<string, number>();
    const shows = new Map<string, string>();
    for (const person of people) {
      const score = (perceives.get(person.id) ?? 0) * 3 + (named.get(person.id) ?? 0) * 0.5;
      if (score > 0) scores.set(person.id, score);
      const s = shown.get(person.id);
      if (s !== undefined) shows.set(person.id, s.sentence);
    }
    const ranked = dartSort([...scores.entries()], (a, b) => compareNum(b[1], a[1]));
    const top = ranked[0] ?? null;
    const second = ranked.length > 1 ? ranked[1][1] : 0;

    let telling: Telling;
    let who: string | null = null;
    let evidence = '';
    if (narrated > 0 && firstPerson / narrated >= 0.015) {
      telling = 'firstPerson';
      for (const p of narration) {
        const m = allMatches(firstPersonWord, p)[0];
        if (m !== undefined) {
          evidence = sentenceAt(p, m.start);
          break;
        }
      }
    } else if (top !== null && top[1] >= 3 && top[1] >= second * 1.5 && shows.has(top[0])) {
      telling = 'through';
      who = top[0];
      evidence = shows.get(top[0])!;
    } else {
      telling = 'unclear';
    }
    out.push({ chapter: c + 1, nodeId: chapter.id, title: chapter.title, words, telling, who, evidence });
  });
  return out;
}

/** What the eyes mean for the book: each one's chapters and share of its words (by who, in the order first seen
 * through), the book's words, the longest run through the same eyes, and how many chapters since each was last seen
 * through. */
export type EyesSummary = {
  each: Map<string, { chapters: number; words: number }>;
  words: number;
  longestRun: { who: string; from: number; to: number } | null;
  since: Map<string, number>;
};

export function eyesSummary(eyes: readonly ChapterEyes[]): EyesSummary {
  const each = new Map<string, { chapters: number; words: number }>();
  const last = new Map<string, number>();
  let longest: { who: string; from: number; to: number } | null = null;
  let run: { who: string; from: number; to: number } | null = null;
  eyes.forEach((e, i) => {
    const who = e.who;
    if (who === null) {
      run = null;
      return;
    }
    const had = each.get(who);
    each.set(who, { chapters: (had?.chapters ?? 0) + 1, words: (had?.words ?? 0) + e.words });
    last.set(who, i);
    run =
      run !== null && run.who === who
        ? { who, from: run.from, to: e.chapter }
        : { who, from: e.chapter, to: e.chapter };
    if (longest === null || run.to - run.from > longest.to - longest.from) longest = run;
  });
  const since = new Map<string, number>();
  for (const [who, i] of last) since.set(who, eyes.length - 1 - i);
  return { each, words: eyes.reduce((n, e) => n + e.words, 0), longestRun: longest, since };
}

/** chapterEyes over the chapters as stored (each record as JSON text, CharacterService.storedChapters): `order` is the
 * chapters' ids in reading order, `titles` their titles. A job to run away from the screen. */
export function chapterEyesJob(
  storedContents: readonly string[],
  order: readonly string[],
  titles: ReadonlyMap<string, string>,
  people: readonly EyesPerson[],
): () => ChapterEyes[] {
  return () => {
    const pages = storedPages(storedContents, new Set(order), paragraphsOf);
    return chapterEyes(
      order.map((id) => ({ id, title: titles.get(id) ?? '', paragraphs: pages.get(id) ?? [] })),
      people,
    );
  };
}
