// NAME THIS CHAPTER: a chapter called "Chapter 7" is a chapter its writer has not had a moment to name. Its own pages
// hold its title already, most of the time: what is most present in it, the thing it has that no other chapter has, the
// phrase it ends on. These are offered as ideas, each the author's own words; nothing is made up, and nothing is named
// until the author picks one.
//
// Reads only. Pure TypeScript. A port of flutter_app/lib/shared/domain/manuscript/title_ideas.dart.

import { isMap } from '../json';
import { docBlocks } from '../prose';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { compareNum, dartSort } from './dartSort';
import { dartUpperUnit } from './dartUpper';

/** Whether [title] is a stand-in rather than a name: nothing, "Untitled…", or a kind and a number ("Chapter 1",
 * "Ch. 12", "Scene iv", "Chapter One"). */
export function placeholderTitle(title: string): boolean {
  const t = dartToLowerCase(dartTrim(title));
  if (t === '' || t.startsWith('untitled')) return true;
  return /^(chapter|ch\.?|chap\.?|scene|part|section)\s*(\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)?\s*[:.]?$/.test(
    t,
  );
}

/** The most ideas offered. */
export const titleIdeasShown = 5;

/** The fewest words a chapter has before it is offered names: too little written, and there is nothing to name. */
export const titleIdeasMinWords = 80;

/** A word kept small inside a title. */
const small = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but', 'by', 'from', 'with', 'into', 'over',
  'under', 'upon', 'as', 'off',
]);

/** Words too common to name anything: the glue of English and the stock of every story's sentences. */
const common = new Set([
  // Words that describe rather than name: "the sixth day", "the kind of", "the real reason".
  'kind', 'sort', 'sixth', 'second', 'third', 'fourth', 'fifth', 'seventh', 'eighth', 'ninth', 'tenth', 'short',
  'real', 'small', 'large', 'young', 'whole', 'half', 'full', 'best', 'worst', 'rest', 'only', 'same', 'next',
  'other', 'first', 'last', 'little', 'big', 'new', 'old', 'own', 'few', 'more', 'most', 'many', 'much', 'such',
  'very', 'thin', 'dark', 'cold', 'high', 'deep', 'wide', 'empty', 'quiet', 'strange', 'single', 'whole',
  'about', 'above', 'across', 'after', 'again', 'against', 'almost', 'alone', 'along', 'already', 'also', 'always',
  'among', 'another', 'anyone', 'anything', 'around', 'asked', 'away', 'back', 'because', 'been', 'before', 'began',
  'behind', 'being', 'below', 'beside', 'better', 'between', 'beyond', 'both', 'cannot', 'could', 'didn', 'doing',
  'done', 'down', 'during', 'each', 'either', 'else', 'enough', 'even', 'ever', 'every', 'everyone', 'everything',
  'eyes', 'face', 'felt', 'first', 'from', 'gave', 'getting', 'give', 'going', 'gone', 'good', 'great', 'hand',
  'hands', 'have', 'having', 'head', 'heard', 'hers', 'herself', 'himself', 'into', 'just', 'keep', 'kept', 'knew',
  'know', 'known', 'last', 'later', 'least', 'left', 'less', 'like', 'little', 'long', 'look', 'looked', 'looking',
  'made', 'make', 'many', 'maybe', 'might', 'more', 'most', 'much', 'must', 'myself', 'need', 'never', 'next',
  'nothing', 'once', 'only', 'other', 'others', 'over', 'perhaps', 'place', 'quite', 'rather', 'really', 'right',
  'said', 'same', 'seemed', 'seen', 'should', 'side', 'since', 'some', 'someone', 'something', 'soon', 'still',
  'such', 'sure', 'take', 'taken', 'tell', 'than', 'that', 'their', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'thing', 'things', 'think', 'this', 'those', 'though', 'thought', 'through', 'time', 'told', 'took',
  'toward', 'towards', 'turned', 'under', 'until', 'upon', 'very', 'voice', 'wanted', 'warm', 'well', 'went',
  'were', 'what', 'when', 'where', 'whether', 'which', 'while', 'whole', 'whom', 'whose', 'will', 'with', 'within',
  'without', 'word', 'words', 'would', 'year', 'years', 'your', 'yours', 'yourself', 'away', 'came', 'come',
  'comes', 'does', 'feet', 'find', 'found', 'have', 'here', 'himself', 'it’s', "it's", 'just', 'last', 'let’s',
  'moment', 'mind', 'nobody', 'none', 'nowhere', 'onto', 'open', 'part', 'past', 'people', 'point', 'room', 'seems',
  'shall', 'shook', 'smiled', 'speak', 'spoke', 'stood', 'stop', 'tried', 'turn', 'walked', 'walking', 'wasn’t',
  'watched', 'what’s', 'yes', 'yet', 'answer', 'answered', 'began', 'began', 'called', 'decided', 'enough',
  'everything', 'least', 'nodded', 'reached', 'replied', 'sound', 'started', 'thank', 'together', 'trying', 'wait',
]);

const wordSource = "[\\p{L}][\\p{L}'’\\-]*";
const wordRe = () => new RegExp(wordSource, 'gu');

/** A word's first letter is a capital: its first UTF-16 unit is not its own lower case, as Dart reads `w[0]`. */
const capital = (w: string) => w[0] !== dartToLowerCase(w[0]);

function titled(phrase: string): string {
  const words = dartTrim(phrase).split(/\s+/);
  return words
    .map((w, i) =>
      i > 0 && small.has(dartToLowerCase(w))
        ? dartToLowerCase(w)
        : w === ''
          ? w
          : `${dartUpperUnit(w[0])}${w.substring(1)}`,
    )
    .join(' ');
}

const sentenceEndSource = '[.!?…]+["”’»)\\]]*(?=\\s|$)';

function sentences(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (const m of text.matchAll(new RegExp(sentenceEndSource, 'g'))) {
    const end = m.index + m[0].length;
    const s = dartTrim(text.substring(from, end));
    if (s !== '') out.push(s);
    from = end;
  }
  const rest = dartTrim(text.substring(from));
  if (rest !== '') out.push(rest);
  return out;
}

/** Words that begin the phrase a sentence can end on ("towards the Inn", "into the dark"). */
const lead = new Set([
  'towards', 'toward', 'into', 'across', 'beyond', 'beneath', 'under', 'over', 'through', 'after', 'before',
  'behind', 'below', 'above', 'among', 'against', 'without', 'within', 'from', 'of', 'to', 'at', 'in', 'on',
]);

/** The words a thing's name follows: "the bell", "her lamp". */
const determiners = new Set(['the', 'a', 'an', 'his', 'her', 'its', 'their', 'my', 'our', 'your', 'this', 'that']);

/** The phrase [sentence] ends on, from its last leading word ("…walking towards the Inn." → "Towards the Inn"), when
 * it runs two to five words and is not all small words. */
function endPhrase(sentence: string): string | null {
  const words = [...sentence.replace(/["“”‘’]/g, ' ').matchAll(wordRe())].map((m) => m[0]);
  for (let i = words.length - 2; i >= Math.max(0, words.length - 5); i--) {
    if (!lead.has(dartToLowerCase(words[i]))) continue;
    const phrase = words.slice(i);
    if (phrase.length < 2) return null;
    // Shaped as a place or a thing: the word after the lead a determiner ("the Inn", "its open crown") or a name.
    const next = phrase[1];
    const named = capital(next) && phrase.slice(1).every(capital);
    if (!determiners.has(dartToLowerCase(next)) && !named) return null;
    if (phrase.slice(1).every((w) => small.has(dartToLowerCase(w)) || determiners.has(dartToLowerCase(w)))) {
      return null;
    }
    return titled(phrase.join(' '));
  }
  return null;
}

// As Dart's RegExp.escape: the characters with a meaning in a pattern, each behind a backslash.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Ideas for naming a chapter, best first, none twice: [present] are the names of those most present on its pages
 * (`presentIn`'s order, places and things before people where they tie), [paragraphs] its text, and [others] the other
 * chapters' texts (each joined), against which its own words stand out. */
export function titleIdeas(args: {
  paragraphs: readonly string[];
  others: readonly string[];
  present?: readonly string[];
}): string[] {
  const { paragraphs, others, present = [] } = args;
  const text = paragraphs.join('\n');
  const ideas: string[] = [];
  const add = (idea: string | null | undefined) => {
    const t = idea == null ? '' : dartTrim(idea);
    if (t === '' || t.length > 40) return;
    const lower = dartToLowerCase(t);
    if (ideas.some((i) => dartToLowerCase(i) === lower)) return;
    ideas.push(t);
  };

  // What is most present on its pages.
  for (const name of present.slice(0, 2)) add(name);

  // The words this chapter has that the others have little of: how often here, against how many chapters have them.
  // Counted only where they follow a determiner ("the bell", "her lamp"), as things are named, so the verbs and the
  // adverbs are left out; and never a word written with a capital mid-sentence anywhere (a name: those come from
  // [present]), nor a word with an apostrophe ("can't").
  const words = [...text.matchAll(wordRe())];
  const names = new Set<string>();
  words.forEach((m, i) => {
    const w = m[0];
    const start = i === 0 || /[.!?…"“]\s*$/.test(text.substring(Math.max(0, m.index - 3), m.index));
    if (!start && capital(w)) names.add(dartToLowerCase(w));
  });
  const counts = new Map<string, number>();
  words.forEach((m, i) => {
    if (i === 0 || !determiners.has(dartToLowerCase(words[i - 1][0]))) return;
    const w = dartToLowerCase(m[0]);
    if (w.length < 4 || w.includes("'") || w.includes('’') || common.has(w) || small.has(w)) return;
    if (names.has(w)) return;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  });
  const elsewhere = others.map((o) => dartToLowerCase(o));
  const weight = (w: string, n: number) => {
    const pattern = new RegExp(`(?<![\\p{L}])${escapeRegExp(w)}(?![\\p{L}])`, 'u');
    const having = elsewhere.filter((o) => pattern.test(o)).length;
    return n * Math.log((elsewhere.length + 1) / (having + 1) + 1);
  };

  const standing: [string, number][] = [];
  for (const [w, n] of counts) if (n >= 2) standing.push([w, weight(w, n)]);
  dartSort(standing, (a, b) => compareNum(b[1], a[1]));
  for (const [w] of standing.slice(0, 2)) add(`The ${titled(w)}`);

  // The phrase it ends on, then the one it opens on.
  const paragraphsWithText = paragraphs.filter((p) => dartTrim(p) !== '');
  if (paragraphsWithText.length > 0) {
    const last = sentences(paragraphsWithText[paragraphsWithText.length - 1]);
    if (last.length > 0) add(endPhrase(last[last.length - 1]));
    const first = sentences(paragraphsWithText[0]);
    if (first.length > 0) add(endPhrase(first[0]));
  }
  return ideas.slice(0, titleIdeasShown);
}

/** [titleIdeas] for the chapter [nodeId], over the chapters as stored (each record as JSON text), as a job to run away
 * from the screen. Only plain data in and out. Chapters with fewer than [titleIdeasMinWords] words get none. */
export function titleIdeasJob(
  storedContents: readonly string[],
  nodeId: string,
  present: readonly string[],
): () => string[] {
  return () => {
    let mine: string[] | null = null;
    const others: string[] = [];
    for (const json of storedContents) {
      let row: unknown;
      try {
        row = JSON.parse(json);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
      if (!isMap(row)) continue;
      const paragraphs = docBlocks(row['doc'])
        .filter((b) => !b.heading)
        .map((b) => b.text);
      if (row['id'] === nodeId) {
        mine = paragraphs;
      } else {
        others.push(paragraphs.join('\n'));
      }
    }
    if (mine === null) return [];
    const words = mine
      .join(' ')
      .split(/\s+/)
      .filter((w) => w !== '').length;
    if (words < titleIdeasMinWords) return [];
    return titleIdeas({ paragraphs: mine, others, present });
  };
}
