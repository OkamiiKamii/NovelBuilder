// The keepsake pages' pure parts: what each card says and where its parts go, ported from the widgets of
// flutter_app/lib/features/progress/{best_lines_page,book_quiz_page,book_story,book_print_page,full_jacket,
// gazette_page,trailer,sampler_page,submission_page}.dart. The words are the Flutter app's, but for its name: Scriptor
// signs its keepsakes as Scriptor (`brand`), as the character card does.

import { type BookPrint } from '../analytics/bookPrint';
import { type BookStory } from '../analytics/bookStory';
import { fileSlug } from '../analytics/charts';
import { castTone } from '../characters/screens/library';
import { mix, withAlpha } from '../characters/views/common';
import { DartRandom, dartStringHash } from '../desk/dartRandom';
import { formatNumber, plural } from '../desk/format';
import { mediumDay } from '../goals/days';
import { type Block, type Compiled, DividerBlock, HeadingBlock } from '../exchange/compile';
import { dartToUpperCase } from '../exchange/dartUpperCase';
import { type BestLine } from '../manuscript/bestLines';
import { dartSort } from '../manuscript/dartSort';
import { type Edition, type Weather } from '../manuscript/gazette';
import { type QuizKind, quizGap } from '../manuscript/bookQuiz';
import { type KitCheck, openingChapters } from '../manuscript/submission';
import { type Shot } from '../manuscript/trailer';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** The name a keepsake is signed with. */
export const brand = 'Scriptor';

/** "The picture could not be made: …", as every page says it. */
export const pictureFailed = (e: unknown) => `The picture could not be made: ${e instanceof Error ? e.message : String(e)}`;

// ------------------------------------------------------------------------------------------------- best lines

/** A quote card's size; the picture is three times it (1080 by 1080). */
export const quoteCardSize = { width: 360, height: 360 } as const;

/** How a card is dressed. */
export type QuoteDress = 'paper' | 'night' | 'book';
export const quoteDresses: readonly { dress: QuoteDress; label: string }[] = [
  { dress: 'paper', label: 'Paper' },
  { dress: 'night', label: 'Night' },
  { dress: 'book', label: 'The book' },
];

/** A card's colours in `dress`, on a book of colour `accent` (#rrggbb): its ground top left to bottom right, ink, mark. */
export function quoteColours(dress: QuoteDress, accent: string): { ground: [string, string]; ink: string; mark: string } {
  switch (dress) {
    case 'paper':
      return { ground: ['#F7F1E4', '#EDE3CF'], ink: '#2A221B', mark: mix(accent, '#000000', 0.2, 1) };
    case 'night':
      return { ground: ['#1C2230', '#0B0E15'], ink: '#EDE7DA', mark: '#E8C46A' };
    case 'book':
      return { ground: [mix(accent, '#FFFFFF', 0.08, 1), mix(accent, '#000000', 0.45, 1)], ink: '#FFFBF2', mark: '#FFE7A8' };
  }
}

/** The card's words: the line without its outer quotes, set larger the shorter it is. */
export function quoteCard(line: BestLine, title: string, author: string): { text: string; size: number; byline: string } {
  const words = line.text.split(/\s+/).length;
  const name = dartTrim(title).length === 0 ? 'Untitled' : dartTrim(title);
  const by = dartTrim(author);
  return {
    text: line.text.replace(/^[“"]|[”"]$/g, ''),
    size: words <= 10 ? 26 : words <= 16 ? 22 : 19,
    byline: by.length === 0 ? dartToUpperCase(name) : `${dartToUpperCase(by)} · ${dartToUpperCase(name)}`,
  };
}

/** Under the cards: which, of how many, and its chapter. */
export const quoteAt = (at: number, lines: readonly BestLine[]) => `${at + 1} of ${lines.length} · chapter ${lines[at].chapter}`;

// ------------------------------------------------------------------------------------------------------ the quiz

/** What each kind asks, under its line. */
export const quizAsk: Readonly<Record<QuizKind, string>> = {
  whoSaid: 'Who says it?',
  whichChapter: 'Which chapter is it in?',
  missingWord: 'Which word is missing?',
  whichFirst: 'Which comes first in the book?',
};

/** A choice once (or before) answered. */
export type ChoiceState = 'open' | 'right' | 'wrong' | 'passed';
export function choiceState(i: number, answer: number, picked: number | null): ChoiceState {
  return picked === null ? 'open' : i === answer ? 'right' : i === picked ? 'wrong' : 'passed';
}

/** How far through the game the bar is. */
export const quizProgress = (number: number, of: number, answered: boolean) => (number - (answered ? 0 : 1)) / of;

/** The score card's foot: the author (unless it is the app's own name) and where it was made, in capitals. */
export function scoreFoot(author: string): string {
  const by = dartTrim(author);
  return [
    ...(by.length > 0 && dartToLowerCase(by) !== 'novel builder' && dartToLowerCase(by) !== 'scriptor' ? [dartToUpperCase(by)] : []),
    `MADE WITH ${dartToUpperCase(brand)}`,
  ].join(' · ');
}

/** A quiz line's parts around its gap (the missing word's place). */
export const quizParts = (line: string) => line.split(quizGap);

// ----------------------------------------------------------------------------------------------- the story pages

/** A story page's size; the picture is three times it (1080 by 1920). */
export const storyPageSize = { width: 360, height: 640 } as const;

/** Deep colours, a page each, light ink on all of them. */
export const storyPalette: readonly [string, string][] = [
  ['#2B2350', '#120F24'],
  ['#7A2E3A', '#2A0F16'],
  ['#1F5A4C', '#0B231D'],
  ['#8A4B1C', '#2E1708'],
  ['#1D4E78', '#0A1C2D'],
  ['#5B2A6E', '#1E0D26'],
  ['#3F5A1E', '#151F08'],
  ['#6E2A1E', '#250C07'],
  ['#253A5E', '#0C1322'],
];

/** A line on a story page: a kicker in gold capitals, a big number or name, a small line, a quote, a gap. */
export type StoryLine =
  | { kind: 'kicker'; text: string }
  | { kind: 'big'; text: string; size: number; gold?: boolean; heavy?: boolean }
  | { kind: 'small'; text: string }
  | { kind: 'quote'; text: string; lines: number }
  | { kind: 'gap'; height: number };

/** The pages of `story`, those it has something for (book_story.dart's `storyPages`). */
export function storyPages(story: BookStory): StoryLine[][] {
  const gap: StoryLine = { kind: 'gap', height: 14 };
  const kicker = (text: string): StoryLine => ({ kind: 'kicker', text });
  const big = (text: string, size: number): StoryLine => ({ kind: 'big', text, size });
  const small = (text: string): StoryLine => ({ kind: 'small', text });
  const quote = (text: string, lines: number): StoryLine => ({ kind: 'quote', text, lines });
  const pages: StoryLine[][] = [
    [kicker('YOUR BOOK SO FAR'), gap, big(story.title.length === 0 ? 'Your novel' : story.title, 36), gap, small('A story in pages, read from your own.')],
    [
      kicker('YOU HAVE WRITTEN'),
      gap,
      big(formatNumber(story.words), 64),
      small('words'),
      gap,
      small(`${plural(story.pages, 'page')} · a ${formatNumber(story.minutes)}-minute read · ${plural(story.chapters, 'chapter')}`),
    ],
  ];
  if (story.daysWritten > 0) {
    pages.push([
      kicker('DAYS AT THE DESK'),
      gap,
      big(formatNumber(story.daysWritten), 64),
      small(story.firstDay === null ? 'days of writing' : `days of writing since ${mediumDay(story.firstDay)}`),
      gap,
      ...(story.longestRun > 1 ? [small(`Your longest run: ${story.longestRun} days in a row`)] : []),
      ...(story.bestDay !== null ? [small(`Your best day: ${mediumDay(story.bestDay.day)}, ${plural(story.bestDay.words, 'word')}`)] : []),
    ]);
  }
  if (story.biggest !== null) {
    pages.push([kicker('YOUR BIGGEST CHAPTER'), gap, big(story.biggest.title, 34), gap, small(plural(story.biggest.words, 'word'))]);
  }
  if (story.lead !== null) {
    pages.push([kicker('YOUR BOOK IS ABOUT'), gap, big(story.lead.name, 40), gap, small(`named ${plural(story.lead.mentions, 'time')} in your pages`)]);
  }
  if (story.talker !== null) {
    pages.push([
      kicker('WHO TALKS MOST'),
      gap,
      big(story.talker.name, 34),
      small(plural(story.talker.lines, 'line')),
      { kind: 'gap', height: 24 },
      quote(`“${story.talker.line}”`, 4),
    ]);
  }
  if (story.leanWords.length > 0) {
    pages.push([
      kicker('THE WORDS YOU LEAN ON'),
      gap,
      ...story.leanWords.map((w, i): StoryLine => ({ kind: 'big', text: w.word, size: 40 - i * 4, gold: i % 2 === 1, heavy: i === 0 })),
      gap,
      small(`“${story.leanWords[0].word}”, ${plural(story.leanWords[0].count, 'time')}`),
    ]);
  }
  if (story.opening.length > 0) {
    pages.push([
      kicker('IT BEGINS'),
      gap,
      quote(story.opening, 5),
      ...(story.latest.length > 0 && story.latest !== story.opening
        ? [{ kind: 'gap', height: 30 } as StoryLine, kicker('AND IT STANDS'), gap, quote(story.latest, 5)]
        : []),
    ]);
  }
  pages.push([
    kicker('NEXT STOP'),
    gap,
    ...(story.next !== null
      ? [big(story.next.name, 32), gap, small(`${plural(story.next.words, 'word')} to go`)]
      : [big('The whole draft. Written.', 32)]),
  ]);
  return pages;
}

/** A story page's foot: the app and which page of how many. */
export const storyFoot = (index: number, count: number) => `${dartToUpperCase(brand)}  ·  ${index + 1} / ${count}`;

// ------------------------------------------------------------------------------------------------ the fingerprint

/** The print's size; the picture is three times it (1080 by 1350). */
export const printSize = { width: 360, height: 450 } as const;

/** Whose colours are whose: the five with the most paragraphs, most first. */
export function printLegend(print: BookPrint): { id: string; colour: string }[] {
  return dartSort([...print.shares], (a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => ({ id, colour: castTone(id) }));
}

/** The print's threads at `width` by `height`: a column a chapter hanging from a hairline, a rectangle a paragraph in
 * its character's colour (bright where someone speaks), as book_print_page.dart's painter draws them. */
export function printThreads(
  print: BookPrint,
  width: number,
  height: number,
): { hairline: { width: number; colour: string }; threads: { x: number; y: number; width: number; height: number; colour: string }[] } {
  const hairline = { width, colour: withAlpha('#F4EEDF', 0.35) };
  const chapters = print.chapters;
  if (chapters.length === 0 || width <= 0 || height <= 0) return { hairline, threads: [] };
  const longest = chapters.reduce((m, c) => Math.max(m, c.lines.reduce((n, l) => n + l.words, 0)), 0);
  if (longest === 0) return { hairline, threads: [] };
  const n = chapters.length;
  const gap = n > 60 ? 1 : n > 24 ? 2 : 4;
  const w = (width - gap * (n - 1)) / n;
  const threads: { x: number; y: number; width: number; height: number; colour: string }[] = [];
  chapters.forEach((c, i) => {
    const x = i * (w + gap);
    let y = 3;
    for (const l of c.lines) {
      const h = Math.max(0.6, (l.words / longest) * (height - 3));
      const tone = l.who === null ? '#F4EEDF' : castTone(l.who);
      const alpha = l.who === null ? (l.spoken ? 0.28 : 0.12) : l.spoken ? 1 : 0.5;
      // A hair of paper between threads, where there is room for one.
      threads.push({ x, y, width: w, height: h > 2 ? h - 0.4 : h, colour: withAlpha(tone, alpha) });
      y += h;
    }
  });
  return { hairline, threads };
}

// --------------------------------------------------------------------------------------------------- the jacket

/** The spread's size; the picture is three times it. */
export const jacketSize = { width: 480, height: 330 } as const;

/** How thick the spine is for `words`: a page a 250 words, a little over a tenth of a point a page, between a
 * pamphlet's and a doorstop's. */
export function spineWidth(words: number): number {
  return Math.min(46, Math.max(10, 8 + (words / 250) * 0.09));
}

/** The back's line of what kind of book it is. */
export function backKind(primaryGenre: string): string {
  return ['A NOVEL', ...(dartTrim(primaryGenre).length > 0 ? [dartToUpperCase(dartTrim(primaryGenre))] : [])].join('  ·  ');
}

/** The barcode's seed for a book: Dart's `novel.id.hashCode ^ words`. */
export const barcodeSeed = (novelId: string, words: number) => dartStringHash(novelId) ^ words;

/** The barcode's bars in a box `width` by `height`: bars from the book itself, as full_jacket.dart's painter draws. */
export function barcodeBars(seed: number, width: number): { x: number; width: number }[] {
  const random = new DartRandom(seed);
  const bars: { x: number; width: number }[] = [];
  let x = 0;
  // Each turn moves on at least 0.75: bounded by the width.
  for (let turns = 0; x < width && turns < 10000; turns++) {
    const w = 0.4 + random.nextInt(3) * 0.4;
    // Dart's `nextBool` on the VM is `nextInt(2) == 0`.
    if (random.nextInt(2) === 0) bars.push({ x, width: w });
    x += w + 0.35;
  }
  return bars;
}

// --------------------------------------------------------------------------------------------------- the gazette

/** The front page's width as it is set; the picture is three times it. */
export const frontPageWidth = 400;

/** The press that prints the paper: "The Old Merrow Gazette" is printed by the Old Merrow Press. */
export function townOf(name: string): string {
  const words = name.replace(/^The\s+/, '').split(' ');
  words.pop();
  return words.join(' ');
}

/** The foot of a front page. */
export function pressLine(name: string): string {
  const town = townOf(name);
  return `PRINTED BY THE ${town.length === 0 ? 'TOWN' : dartToUpperCase(town)} PRESS · MADE WITH ${dartToUpperCase(brand)}`;
}

/** The lead story split in two columns of about the same length, at a paragraph, or within one at a sentence. */
export function twoColumns(lead: readonly string[]): [string[], string[]] {
  const sentences: { text: string; starts: boolean }[] = [];
  for (const p of lead) {
    Array.from(p.matchAll(/[^.!?…]+[.!?…]+["”’]*\s*|[^.!?…]+$/g), (m) => m[0]).forEach((s, i) => sentences.push({ text: s, starts: i === 0 }));
  }
  const total = sentences.reduce((n, s) => n + s.text.length, 0);
  let running = 0;
  let cut = sentences.length;
  for (let i = 0; i < sentences.length; i++) {
    running += sentences[i].text.length;
    if (running >= total / 2) {
      cut = i + 1;
      break;
    }
  }
  const join = (part: readonly { text: string; starts: boolean }[]): string[] => {
    const out: string[] = [];
    for (const s of part) {
      if (s.starts || out.length === 0) out.push(dartTrim(s.text));
      else out[out.length - 1] = `${out[out.length - 1]} ${dartTrim(s.text)}`;
    }
    return out;
  };
  return [join(sentences.slice(0, cut)), join(sentences.slice(cut))];
}

/** The second column's paragraphs: the lead's second half, then where the story goes on. */
export const secondColumn = (columns: [string[], string[]], e: Edition) => [
  ...columns[1],
  ...(e.continues ? [`→ Continued in chapter ${e.chapter}.`] : []),
];

/** The story's first words, in capitals, and the rest. */
export function firstWords(p: string): [string, string] {
  const words = p.split(' ');
  return [dartToUpperCase(words.slice(0, 3).join(' ')), ` ${words.slice(3).join(' ')}`];
}

/** A line said about town, without its trailing comma or colon. */
export const saidWords = (words: string) => `“${words.replace(/[,;:]$/, '')}” `;

/** The weather's icon (Material Community's name). */
export const weatherIcon: Readonly<Record<Weather, string>> = {
  storm: 'weather-lightning-rainy',
  rain: 'umbrella-outline',
  snow: 'snowflake',
  fog: 'weather-fog',
  wind: 'weather-windy',
  sun: 'weather-sunny',
  night: 'weather-night',
  fair: 'weather-cloudy',
};

/** The sentence "Read it there" looks for: the lead's first. */
export function leadFirstSentence(e: Edition): string {
  return e.lead.length === 0 ? '' : e.lead[0].split(/(?<=[.!?…])\s/)[0];
}

/** The picture's name. */
export const gazetteFile = (paper: string, chapter: number) => `${dartToLowerCase(fileSlug(paper))}-chapter-${chapter}.png`;

/** Under the pages: which edition. */
export const editionAt = (e: Edition, at: number, of: number) => `Chapter ${e.chapter} edition · ${at + 1} of ${of}`;

/** Under the last edition: tomorrow's paper is blank. */
export const tomorrowLine = (chapter: number) =>
  `The presses are waiting. Chapter ${chapter} has not happened yet, and nobody in town knows what it holds.`;

// --------------------------------------------------------------------------------------------------- the trailer

/** The poster's size; the picture is three times it (1080 by 1920). */
export const posterSize = { width: 360, height: 640 } as const;

/** How long `shot` holds the screen, in milliseconds: a line long enough to read twice. */
export function shotLength(shot: Shot): number {
  switch (shot.kind) {
    case 'from':
      return 2600;
    case 'name':
      return 2400;
    case 'title':
      return 4000;
    case 'line':
      return Math.min(6000, Math.max(3000, 1400 + 300 * shot.text.split(/\s+/).length));
  }
}

/** A shot at `t` (0 to 1) through it: up out of the dark, closer, and down again; the light drifting across. */
export function shotFrame(
  shot: Shot,
  t: number,
  still: boolean,
): { opacity: number; drift: number; scale: number; spacing: number; flare: number } {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  // The title does not fade: the poster follows it.
  const fadeOut = shot.kind === 'title' ? 1 : clamp01((1 - t) / 0.16);
  const opacity = Math.min(clamp01(t / 0.16), fadeOut);
  return {
    opacity,
    drift: still ? 0 : -0.5 + t,
    scale: still ? 1 : 0.96 + 0.07 * t,
    spacing: shot.kind === 'from' ? 4 + 3 * t : shot.kind === 'name' ? 4 + 8 * t : 5,
    flare: still ? 1 : clamp01(t * 1.6),
  };
}

/** The poster's top line, and the small print at its foot. */
export function posterWords(args: {
  title: string;
  author: string;
  cast: readonly string[];
  words: number;
  chapters: number;
}): { top: string; title: string; byline: string | null; billing: string } {
  const author = dartTrim(args.author);
  const title = dartTrim(args.title).length === 0 ? 'Untitled' : dartTrim(args.title);
  const upper = args.cast.map(dartToUpperCase);
  return {
    top: upper.length > 0 ? upper.join('    ') : author.length === 0 ? '' : dartToUpperCase(author),
    title: dartToUpperCase(title),
    byline: author.length === 0 ? null : `A NOVEL BY ${dartToUpperCase(author)}`,
    billing: [
      ...(author.length > 0 ? [`WRITTEN BY ${dartToUpperCase(author)}`] : []),
      ...(upper.length > 0 ? [`STARRING ${upper.join('  ')}`] : []),
      dartToUpperCase(plural(args.chapters, 'chapter')),
      `${formatNumber(args.words)} WORDS AND COUNTING`,
      `MADE WITH ${dartToUpperCase(brand)}`,
    ].join('   '),
  };
}

// --------------------------------------------------------------------------------------------------- the sampler

/** A sample page as it is drawn: half a US Letter page in points. */
export const samplerPageSize = { width: 306, height: 396 } as const;

/** The pages the sample is shown as: the title page, each chapter (its first page), and the end. */
export function samplerPages(sample: Compiled): Block[][] {
  const pages: Block[][] = [[]];
  for (const b of sample.blocks) {
    if (b instanceof HeadingBlock && b.pageBreak) pages.push([]);
    pages[pages.length - 1].push(b);
  }
  // The last three blocks (a rule, how much more there is, where it was made) are a page of their own here.
  if (pages.length > 1 && pages[pages.length - 1].length > 3) {
    const last = pages.pop()!;
    pages.push(last.slice(0, last.length - 3), last.slice(last.length - 3));
  }
  return pages;
}

/** Whether a page is the last (its few lines in the middle of the sheet). */
export const samplerEndPage = (blocks: readonly Block[]) => blocks.length > 0 && blocks[0] instanceof DividerBlock;

/** What the sample holds, said in a line: its chapters, its words, and how long it takes to read. */
export function whatIsInIt(sample: Compiled): string {
  const n = sample.chapterCount;
  const minutes = Math.min(999, Math.max(1, Math.ceil(sample.wordCount / 250)));
  const words = `${sample.wordCount}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `A title page, ${n === 1 ? 'the first chapter' : `the first ${n} chapters`} · ${words} words · about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} to read`;
}

/** The PDF's name. */
export const samplerFile = (title: string) => `${dartToLowerCase(fileSlug(title))}-sampler.pdf`;

// -------------------------------------------------------------------------------------------- the submission kit

/** The way to make a thing ready, where it is not: edit the book's details, see the slips in the opening chapters, or
 * (the opening clean) make the sample pages. Null where there is nothing to do. */
export function kitAction(k: KitCheck, openingSlips: number): 'details' | 'slips' | 'sampler' | null {
  switch (k.item) {
    case 'title':
    case 'author':
    case 'genre':
    case 'synopsis':
      return k.ready ? null : 'details';
    case 'opening':
      return openingSlips > 0 ? 'slips' : 'sampler';
    case 'length':
      return null;
  }
}

export const kitActionLabel = { details: 'Edit the book’s details', slips: 'See the slips', sampler: 'Make the sample pages' } as const;

/** The kit's first line. */
export function kitHead(title: string, kit: readonly KitCheck[]): string {
  const name = dartTrim(title).length === 0 ? 'your book' : dartTrim(title);
  return `What an agent or a publisher asks for, and how far ${name} has come: ${kit.filter((k) => k.ready).length} of ${kit.length} ready.`;
}

/** The letter in parts: its words, and its gaps (what only the author can write), each to be marked. */
export function letterParts(letter: string): { text: string; gap: boolean }[] {
  const out: { text: string; gap: boolean }[] = [];
  let at = 0;
  for (const m of letter.matchAll(/\[\[([^\]]*)\]\]/g)) {
    if (m.index > at) out.push({ text: letter.substring(at, m.index), gap: false });
    out.push({ text: ` ${m[1]} `, gap: true });
    at = m.index + m[0].length;
  }
  if (at < letter.length) out.push({ text: letter.substring(at), gap: false });
  return out;
}

/** Whether the letter says the book is complete: as long as its genre runs, or as its own target. */
export const letterFinished = (words: number, low: number, target: number | null) => words >= low || (target !== null && words >= target);

/** The slips counted against the opening (those in its first chapters). */
export const openingSlipsOf = (proofs: readonly { chapter: number }[]) => proofs.filter((p) => p.chapter <= openingChapters).length;

/** The letter's file name. */
export const letterFile = (title: string) => `query-letter-${dartToLowerCase(fileSlug(dartTrim(title).length === 0 ? 'your book' : dartTrim(title)))}.txt`;
