// YOUR BOOK SO FAR: the novel told back to its writer as a short story in pages, the way a year in music is: how much
// is written, the days it was written on, the biggest chapter, who the book is about and who talks most, the words the
// writer leans on, where it begins and where it stands, and what comes next. Every page is read from the book:
// nothing is guessed, and nothing is changed.
//
// A port of flutter_app/lib/shared/domain/analytics/book_story.dart.

import { spokenBy } from '../characters/voice';
import { presentIn } from '../codex/inChapter';
import { addDays } from '../desk/dayBook';
import { sentencePattern, storedParagraphs } from '../manuscript/bestLines';
import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { milestonesFor } from './milestones';

/** A chapter (or scene), in reading order: its id, title and words. */
export type StoryChapter = { id: string; title: string; words: number };

/** What the story is told from: the title and target, its chapters in order, its days of writing (each day's net
 * words), and its people (each character's id, name and every name they go by). */
export type StoryInputs = {
  title: string;
  target: number | null;
  chapters: StoryChapter[];
  days: { day: string; words: number }[];
  people: { id: string; name: string; names: string[] }[];
};

/** The story's facts, page by page. */
export type BookStory = {
  title: string;
  words: number;
  pages: number;
  minutes: number;
  chapters: number;
  daysWritten: number;
  longestRun: number;
  bestDay: { day: string; words: number } | null;
  firstDay: string | null;
  biggest: StoryChapter | null;
  lead: { id: string; name: string; mentions: number } | null;
  talker: { id: string; name: string; lines: number; line: string } | null;
  leanWords: { word: string; count: number }[];
  opening: string;
  latest: string;
  next: { name: string; words: number } | null;
};

/** Words that say nothing of a writer: the glue of English, and the stock of every story. */
const plain = new Set([
  'about', 'after', 'again', 'against', 'almost', 'along', 'already', 'always', 'another', 'around', 'asked',
  'away', 'back', 'because', 'been', 'before', 'began', 'behind', 'being', 'below', 'between', 'both', 'could',
  'didn', 'doing', 'down', 'each', 'even', 'ever', 'every', 'everything', 'first', 'from', 'going', 'have',
  'having', 'here', 'herself', 'himself', 'into', 'just', 'knew', 'know', 'like', 'little', 'looked', 'made',
  'make', 'might', 'more', 'most', 'much', 'must', 'never', 'nothing', 'once', 'only', 'other', 'over', 'said',
  'same', 'should', 'since', 'some', 'something', 'still', 'such', 'than', 'that', 'their', 'them', 'then',
  'there', 'these', 'they', 'thing', 'think', 'this', 'those', 'though', 'thought', 'through', 'time', 'told',
  'took', 'toward', 'towards', 'under', 'until', 'very', 'want', 'wanted', 'well', 'went', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'whose', 'will', 'with', 'without', 'would', 'your', 'yours',
  'came', 'come', 'does', 'done', 'felt', 'find', 'found', 'gave', 'give', 'good', 'great', 'head', 'hand',
  'hands', 'face', 'eyes', 'look', 'long', 'last', 'left', 'right', 'turned', 'upon', 'also', 'stood', 'years',
  'it’s', "it's", 'didn’t', "didn't", 'don’t', "don't", 'couldn’t', "couldn't", 'wasn’t', "wasn't", 'i’m', "i'm",
]);

const word = /[\p{L}][\p{L}'’]*/gu;

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Tells the story of the book from `inputs` and `pages` (each chapter's paragraphs, by id). */
export function bookStory(inputs: StoryInputs, pages: ReadonlyMap<string, readonly string[]>): BookStory {
  const words = inputs.chapters.reduce((n, c) => n + c.words, 0);
  // Days written: those with net words added, in order.
  const written = dartSort(
    inputs.days.filter((d) => d.words > 0),
    (a, b) => byCodeUnits(a.day, b.day),
  );
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const d of written) {
    run = previous !== null && addDays(previous, 1) === d.day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = d.day;
  }
  const best = written.length === 0 ? null : written.reduce((a, b) => (b.words > a.words ? b : a));
  const biggest = !inputs.chapters.some((c) => c.words > 0)
    ? null
    : inputs.chapters.reduce((a, b) => (b.words > a.words ? b : a));

  // Paragraphs in reading order.
  const order = inputs.chapters.map((c) => c.id);
  const paragraphs = order.flatMap((id) => pages.get(id) ?? []).filter((p) => dartTrim(p).length > 0);

  // Who the book is about: named most.
  const names = new Map(inputs.people.map((p) => [p.id, p.names] as const));
  const present = presentIn(paragraphs, names);
  const leadId = present.length === 0 ? null : present[0].id;
  const lead =
    leadId === null
      ? null
      : { id: leadId, name: inputs.people.find((p) => p.id === leadId)!.name, mentions: present[0].mentions };

  // Who talks most, and a line of theirs (one of a few words or more).
  let talker: BookStory['talker'] = null;
  for (const p of inputs.people) {
    const lines = spokenBy(pages, order, p.names, { limit: 400 });
    if (lines.length === 0) continue;
    if (talker === null || lines.length > talker.lines) {
      const good = lines.find((l) => l.words.split(' ').length >= 4) ?? lines[0];
      talker = { id: p.id, name: p.name, lines: lines.length, line: good.words };
    }
  }

  // The words leaned on: the longer words used most, not names, not the glue.
  const nameWords = new Set<string>();
  for (const p of inputs.people) {
    for (const n of p.names) {
      for (const w of n.split(/\s+/)) nameWords.add(dartToLowerCase(w));
    }
  }
  const counts = new Map<string, number>();
  for (const p of paragraphs) {
    for (const m of p.matchAll(word)) {
      const w = dartToLowerCase(m[0]);
      if (w.length < 5 || plain.has(w) || nameWords.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const lean = dartSort(
    [...counts].filter(([, n]) => n >= 3).map(([w, n]) => ({ word: w, count: n })),
    (a, b) => (b.count !== a.count ? b.count - a.count : byCodeUnits(a.word, b.word)),
  );

  const firstSentence = (p: string): string => {
    const m = new RegExp(sentencePattern.source).exec(p);
    return m === null ? dartTrim(p) : dartTrim(m[0]);
  };
  const lastSentence = (p: string): string => {
    const all = Array.from(p.matchAll(sentencePattern));
    return all.length === 0 ? dartTrim(p) : dartTrim(all[all.length - 1][0]);
  };

  const next = milestonesFor(inputs.target).find((m) => m.words > words) ?? null;
  return {
    title: inputs.title,
    words,
    pages: Math.ceil(words / 250),
    minutes: Math.max(1, Math.round(words / 230)),
    chapters: inputs.chapters.length,
    daysWritten: written.length,
    longestRun: longest,
    bestDay: best,
    firstDay: written.length === 0 ? null : written[0].day,
    biggest,
    lead,
    talker,
    leanWords: lean.slice(0, 6),
    opening: paragraphs.length === 0 ? '' : firstSentence(paragraphs[0]),
    latest: paragraphs.length === 0 ? '' : lastSentence(paragraphs[paragraphs.length - 1]),
    next: next === null ? null : { name: next.name, words: next.words - words },
  };
}

/** `bookStory` over the chapters as stored (JSON text, a row each), as a job to run away from the screen. */
export function bookStoryJob(inputs: StoryInputs, storedContents: readonly string[]): () => BookStory {
  return () => bookStory(inputs, storedParagraphs(storedContents, inputs.chapters.map((c) => c.id)));
}
