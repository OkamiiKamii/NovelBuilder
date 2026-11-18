// THE SUBMISSION KIT: what an agent or a publisher asks a novelist for, and how far the book has come: its title, the
// author's name, its genre, a length the genre expects, a synopsis of about a page, and opening chapters without the
// slips a proofreader marks (proof/proof.ts). And the query letter that goes with them, laid out from the book's own
// details in the shape agents ask for, with the parts only the author can write left as gaps ("[[ ]]", as the editor
// marks a gap). Nothing is written for the author. Reads only.
//
// A port of flutter_app/lib/shared/domain/manuscript/submission.dart.

import { dartEscape } from '../characters/pageText';
import { dartToUpperCase } from '../exchange/dartUpperCase';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** A genre's usual length, in words, for a first novel sent to agents (adult fiction unless it says otherwise). */
export type GenreLength = { genre: string; low: number; high: number };

const lengths: readonly [readonly string[], GenreLength][] = [
  [['middle grade'], { genre: 'Middle grade', low: 30000, high: 55000 }],
  [['young adult', 'ya'], { genre: 'Young adult', low: 60000, high: 90000 }],
  [
    ['fantasy', 'science fiction', 'sci-fi', 'scifi', 'litrpg', 'progression', 'space opera'],
    { genre: 'Fantasy and science fiction', low: 90000, high: 120000 },
  ],
  [['romance'], { genre: 'Romance', low: 70000, high: 100000 }],
  [['mystery', 'thriller', 'crime', 'suspense'], { genre: 'Mystery and thriller', low: 70000, high: 90000 }],
  [['horror'], { genre: 'Horror', low: 80000, high: 100000 }],
  [['literary'], { genre: 'Literary fiction', low: 80000, high: 100000 }],
  [['historical'], { genre: 'Historical fiction', low: 80000, high: 100000 }],
];

/** What `genre` usually runs to; most adult fiction when the genre says nothing. */
export function lengthFor(genre: string): GenreLength {
  const g = dartToLowerCase(genre);
  for (const [words, length] of lengths) {
    if (words.some((w) => new RegExp(`\\b${dartEscape(w)}\\b`).test(g))) return { ...length };
  }
  return { genre: 'Most adult fiction', low: 70000, high: 100000 };
}

/** What the kit holds. */
export type KitItem = 'title' | 'author' | 'genre' | 'length' | 'synopsis' | 'opening';

export const kitItems: readonly KitItem[] = ['title', 'author', 'genre', 'length', 'synopsis', 'opening'];

export const kitItemLabel: Readonly<Record<KitItem, string>> = {
  title: 'A title',
  author: 'Your name',
  genre: 'A genre',
  length: 'A length the genre expects',
  synopsis: 'A synopsis of about a page',
  opening: 'Clean opening chapters',
};

/** One thing in the kit: what it is, whether it is ready, and what is said of it. */
export type KitCheck = { item: KitItem; ready: boolean; said: string };

/** The words a one-page synopsis runs to, about. */
export const synopsisLow = 300;
export const synopsisHigh = 600;

/** The chapters an agent asks to see first. */
export const openingChapters = 3;

const word = /[\p{L}\p{N}][\p{L}\p{N}’'\-]*/gu;
const count = (text: string): number => Array.from(text.matchAll(word)).length;

/** A whole number with commas between its thousands ("80,000"). */
export function thousands(n: number): string {
  return `${n}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The kit of a book called `title` by `author`, of `genre`, `words` long, its `synopsis`, with `openingSlips` slips in
 * its first chapters. */
export function submissionKit(args: {
  title: string;
  author: string;
  genre: string;
  words: number;
  synopsis: string;
  openingSlips: number;
}): KitCheck[] {
  const { title, author, genre, words, synopsis, openingSlips } = args;
  const length = lengthFor(genre);
  const s = count(synopsis);
  const named = dartTrim(title).length > 0 && dartToLowerCase(dartTrim(title)) !== 'untitled';
  return [
    { item: 'title', ready: named, said: named ? dartTrim(title) : 'The book has no title yet.' },
    {
      item: 'author',
      ready: dartTrim(author).length > 0,
      said: dartTrim(author).length === 0 ? 'The name the book goes out under.' : dartTrim(author),
    },
    {
      item: 'genre',
      ready: dartTrim(genre).length > 0,
      said: dartTrim(genre).length === 0 ? 'Agents look for books in the genres they sell.' : dartTrim(genre),
    },
    {
      item: 'length',
      ready: words >= length.low && words <= length.high,
      said:
        `${thousands(words)} words. ${length.genre} usually runs ${thousands(length.low)} to ` +
        `${thousands(length.high)}${words > length.high ? ': some cutting first' : words < length.low ? ', when the draft is done' : ''}.`,
    },
    {
      item: 'synopsis',
      ready: s >= synopsisLow && s <= synopsisHigh + 200,
      said:
        s === 0
          ? `None yet. Agents ask for the whole story, ending and all, in about ${synopsisLow} to ${synopsisHigh} words.`
          : `${s} words. ${
              s < synopsisLow
                ? `A page is about ${synopsisLow} to ${synopsisHigh}, the ending told.`
                : s > synopsisHigh + 200
                  ? `Longer than a page: about ${synopsisLow} to ${synopsisHigh}.`
                  : 'About a page.'
            }`,
    },
    {
      item: 'opening',
      ready: openingSlips === 0,
      said:
        openingSlips === 0
          ? `Nothing a proofreader would mark in the first ${openingChapters} chapters.`
          : `${openingSlips === 1 ? 'One slip' : `${openingSlips} slips`} to put right in the first ${openingChapters} chapters.`,
    },
  ];
}

/** The query letter of a book called `title` by `author` of `genre` (and `more` genres), `words` long (`finished` when
 * the draft is done), told by its `synopsis`. The parts only the author can write are gaps. */
export function queryLetter(args: {
  title: string;
  author: string;
  genre: string;
  more?: readonly string[];
  words: number;
  finished: boolean;
  synopsis: string;
}): string {
  const { title, author, genre, words, finished, synopsis } = args;
  const more = args.more ?? [];
  const name = dartTrim(title).length === 0 ? '[[the title]]' : dartToUpperCase(dartTrim(title));
  const kind = dartTrim(genre).length === 0 ? '[[genre]]' : dartToLowerCase(dartTrim(genre));
  const also = more
    .filter((g) => dartTrim(g).length > 0 && dartToLowerCase(dartTrim(g)) !== kind)
    .map((g) => dartToLowerCase(dartTrim(g)));
  const article = /^[aeiou]/.test(kind) ? 'an' : 'a';
  const elements =
    also.length === 0
      ? ''
      : ` with elements of ${also.length === 1 ? also[0] : `${also.slice(0, also.length - 1).join(', ')} and ${also[also.length - 1]}`}`;
  const length = finished
    ? `complete at ${thousands(dartRoundWhole(words / 1000) * 1000)} words`
    : 'complete at [[its length]] words';
  // The pitch: the synopsis, cut at a sentence near the length a query gives it.
  let pitch = '';
  let n = 0;
  for (const m of dartTrim(synopsis).matchAll(/[^.!?…]+[.!?…]+["”’]*\s*|[^.!?…]+$/g)) {
    const c = count(m[0]);
    if (n > 0 && n + c > 220) break;
    pitch += m[0];
    n += c;
  }
  const story =
    pitch.length === 0
      ? '[[the story in two short paragraphs: who it is about, what they want, what stands in the way, and what is ' +
        'at stake]]'
      : dartTrim(pitch);
  return [
    'Dear [[the agent’s name]],',
    `I am seeking representation for ${name}, ${article} ${kind} novel${elements}, ${length}. It will appeal to readers of ` +
      '[[two or three recent books like it]].',
    story,
    '[[a few lines about you: what you have written, and why you are the one to write this book]]',
    'Thank you for your time. The opening chapters and a synopsis are ready to send.',
    `With best wishes,\n${dartTrim(author).length === 0 ? '[[your name]]' : dartTrim(author)}`,
  ].join('\n\n');
}

/** Dart's `double.round()` (half away from zero) for the whole-number counts here. */
function dartRoundWhole(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}
