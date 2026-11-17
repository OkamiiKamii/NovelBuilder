// ENTRANCES: the cast in order of appearance, as a reader meets them. Where each character first steps onto the page
// (named in the narration, not only spoken of), the sentence they enter in, and what that first moment gives the reader
// to hold on to: how they look, a line they say, something they do, or a thought of theirs. One who is talked of in
// dialogue before they appear is marked so, with where. Chapters and paragraphs where many enter at once, and those in
// the cast the pages have not brought on yet.
//
// Read from the prose, never guessed at. A port of flutter_app/lib/shared/domain/characters/entrances.dart. Reads only.

import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { CastNames, type EyesPerson } from './castNames';
import { allMatches, blocksOf, firstMatch, sentenceAt, sentencePattern, storedPages } from './pageText';
import { perceiving } from './pov';

/** What an entrance gives the reader. */
export type Gives = 'seen' | 'speaks' | 'acts' | 'thinks';
export const givesAll: readonly Gives[] = ['seen', 'speaks', 'acts', 'thinks'];

/** A place in the book: the chapter (1 first), its id, the paragraph (as the editor counts its blocks) and the
 * sentence. */
export type EntrancePlace = { chapter: number; nodeId: string; block: number; sentence: string };

/** One character's entrance: who, where, what it gives (in the order found), and where they were talked of first, if
 * they were. `onStage` is false for one the pages only ever speak of. */
export type Entrance = {
  id: string;
  at: EntrancePlace;
  gives: ReadonlySet<Gives>;
  talkedOf: EntrancePlace | null;
  onStage: boolean;
};

/** A paragraph several people enter in at once. */
export type Crowd = { chapter: number; nodeId: string; block: number; ids: string[] };

/** The cast's entrances in reading order; the ids of those the pages never name; how many enter in each chapter (one a
 * chapter, in order); and the crowded paragraphs. */
export type Entrances = { order: Entrance[]; unseen: string[]; perChapter: number[]; crowds: Crowd[] };

/** A chapter for the reading: its id and its blocks in order, headings marked. */
export type EntranceChapter = { id: string; blocks: readonly { heading: boolean; text: string }[] };

/** How many entering one paragraph make a crowd. */
export const crowdedParagraph = 3;

/** How many entering one chapter make a crowded chapter. */
export const crowdedChapter = 5;

const quoted = /“[^”]*”|"[^"]*"/g;

/** Words that describe how someone looks. */
const looks = new Set([
  'hair', 'eyes', 'eye', 'face', 'beard', 'scar', 'scarred', 'freckles', 'freckled', 'skin', 'tall', 'short', 'thin',
  'broad', 'stout', 'slight', 'lean', 'wiry', 'heavy', 'old', 'young', 'grey', 'gray', 'white-haired', 'bald', 'braid',
  'braided', 'cloak', 'coat', 'robe', 'robes', 'dress', 'gown', 'boots', 'hat', 'hood', 'hooded', 'armour', 'armor',
  'wore', 'dressed', 'clad', 'smile', 'smiled', 'grin', 'jaw', 'nose', 'lips', 'mouth', 'brow', 'shoulders', 'hands',
  'fingers', 'beautiful', 'handsome', 'plain', 'pale', 'tanned', 'weathered', 'wrinkled', 'blond', 'blonde',
  'red-haired', 'dark-haired', 'curls', 'curly', 'tattoo', 'tattooed', 'spectacles', 'glasses',
]);

/** Words of speaking, after or before a name. */
const speaking = new Set([
  'said', 'asked', 'called', 'shouted', 'whispered', 'replied', 'answered', 'muttered', 'cried', 'snapped', 'murmured',
  'told', 'yelled', 'laughed', 'sang', 'began', 'added', 'says', 'asks',
]);

/** Doing, in the few common words that do not end in -ed. */
const doing = new Set([
  'ran', 'drew', 'took', 'came', 'went', 'stood', 'sat', 'held', 'threw', 'struck', 'caught', 'fell', 'rose', 'made',
  'put', 'kept', 'left', 'led', 'swung', 'spun', 'shot', 'hit', 'cut', 'bit', 'broke', 'dug', 'fought', 'flew', 'gave',
  'got', 'grabbed', 'hid', 'leapt', 'lit', 'met', 'paid', 'rode', 'rang', 'sent', 'set', 'shook', 'slid', 'slept',
  'spoke', 'stole', 'strode', 'swam', 'swore', 'tore', 'wrote', 'woke', 'won', 'bent', 'built', 'climbed', 'crossed',
  'dropped', 'opened', 'closed', 'pushed', 'pulled', 'turned', 'walked', 'stepped',
]);

/** Words after a name that are not doing ("Kade was", "Kade and", "Kade’s"). */
const notDoing = new Set(['was', 'were', 'is', 'are', 'had', 'has', 'and', 'or', 'but', 'of', 'the', 'a', 'to', 'in', 'on']);

const helpers = new Set(['could', 'couldn’t', "couldn't", 'did', 'didn’t', "didn't", 'had']);

const wordAfter = /^\s+(?:([\p{L}]+ly)\s+)?([\p{L}’'\-]+)(?:\s+([\p{L}’'\-]+))?/u;

/** "-ing" words after "was" that are not doing ("was nothing", "was something"). */
const notActing = new Set(['nothing', 'something', 'anything', 'everything', 'being', 'king', 'spring', 'thing']);

/** Past participles of doing that do not end in -ed, after "had". */
const participles = new Set([
  'fallen', 'gone', 'taken', 'broken', 'driven', 'ridden', 'thrown', 'drawn', 'run', 'come', 'done', 'given', 'stolen',
  'swum', 'written', 'woken', 'beaten', 'begun', 'bitten', 'chosen', 'eaten', 'flown', 'hidden', 'risen', 'shaken',
  'sworn', 'torn', 'worn', 'struck', 'fought', 'caught', 'brought', 'bought', 'built', 'held', 'kept', 'left',
]);
const wordBefore = /([\p{L}’'\-]+)[\s,]*$/u;
const anyWord = /[\p{L}][\p{L}’'\-]*/gu;

/** The cast's entrances over `chapters` (in reading order) among `people`. */
export function entrancesIn(chapters: readonly EntranceChapter[], people: readonly EyesPerson[]): Entrances {
  // The cast's names, found in one reading of each paragraph (castNames.ts), not a search per name per character.
  const names = new CastNames(people);
  const order = new Map(people.map((p, i) => [p.id, i]));
  const entered = new Map<string, Entrance>();
  const talked = new Map<string, EntrancePlace>();
  const perChapter = chapters.map(() => 0);
  const crowds: Crowd[] = [];
  // The position of each entrance, for the reading order: chapter, block, offset.
  const where = new Map<string, [number, number, number]>();

  chapters.forEach((chapter, c) => {
    chapter.blocks.forEach((block, b) => {
      if (block.heading || dartTrim(block.text).length === 0) return;
      const text = block.text;
      const quotes = allMatches(quoted, text).map((q): [number, number] => [q.start, q.end]);
      const isQuoted = (at: number) => quotes.some((q) => at > q[0] && at < q[1]);
      const here: string[] = [];
      // The first time a name of each is in the narration of this paragraph, and the first time in its speech: the
      // names are found in the order they stand (at one place, the longest first), so the first of each is the one.
      const onPages = new Map<string, { start: number; end: number }>();
      const spokens = new Map<string, number>();
      for (const h of names.all(text)) {
        if (entered.has(h.id)) continue;
        if (isQuoted(h.start)) {
          if (!spokens.has(h.id)) spokens.set(h.id, h.start);
        } else if (!onPages.has(h.id)) {
          onPages.set(h.id, { start: h.start, end: h.end });
        }
      }
      const ids = dartSort([...new Set([...onPages.keys(), ...spokens.keys()])], (x, y) => order.get(x)! - order.get(y)!);
      for (const id of ids) {
        const onPage = onPages.get(id);
        const spoken = spokens.get(id);
        if (spoken !== undefined && !talked.has(id) && (onPage === undefined || spoken < onPage.start)) {
          talked.set(id, { chapter: c + 1, nodeId: chapter.id, block: b, sentence: sentenceAt(text, spoken) });
        }
        if (onPage === undefined) continue;
        const at = { chapter: c + 1, nodeId: chapter.id, block: b, sentence: sentenceAt(text, onPage.start) };
        entered.set(id, { id, at, gives: givesOf(text, onPage, quotes), talkedOf: talked.get(id) ?? null, onStage: true });
        where.set(id, [c, b, onPage.start]);
        here.push(id);
      }
      perChapter[c] += here.length;
      if (here.length >= crowdedParagraph) {
        dartSort(here, (x, y) => where.get(x)![2] - where.get(y)![2]);
        crowds.push({ chapter: c + 1, nodeId: chapter.id, block: b, ids: here });
      }
    });
  });

  // Those only ever spoken of: their entrance is where they were first talked of, and they are not on the page.
  for (const p of people) {
    if (entered.has(p.id)) continue;
    const t = talked.get(p.id);
    if (t === undefined) continue;
    entered.set(p.id, { id: p.id, at: t, gives: new Set(), talkedOf: t, onStage: false });
    where.set(p.id, [t.chapter - 1, t.block, 0]);
  }

  const byPlace = (a: Entrance, b: Entrance): number => {
    const x = where.get(a.id)!;
    const y = where.get(b.id)!;
    if (x[0] !== y[0]) return x[0] - y[0];
    if (x[1] !== y[1]) return x[1] - y[1];
    return x[2] - y[2];
  };

  return {
    order: dartSort([...entered.values()], byPlace),
    unseen: people.filter((p) => !entered.has(p.id)).map((p) => p.id),
    perChapter,
    crowds,
  };
}

/** What a character's first moment on the page gives: read from the sentence they enter in and the one after it, and
 * the paragraph's speech. */
function givesOf(text: string, name: { start: number; end: number }, quotes: readonly [number, number][]): Set<Gives> {
  const gives = new Set<Gives>();
  // The sentence they enter in and the next.
  const sentences = allMatches(sentencePattern, text);
  const i = sentences.findIndex((s) => s.end > name.start);
  const from = i < 0 ? 0 : sentences[i].start;
  const to = i < 0 ? text.length : i + 1 < sentences.length ? sentences[i + 1].end : sentences[i].end;
  // Their own name is not a description of them ("the Grey Abbot").
  const unnamed = text.substring(0, name.start) + ' '.repeat(name.end - name.start) + text.substring(name.end);
  const near = unnamed.substring(from, to).replace(quoted, ' ');
  const words = new Set(allMatches(anyWord, near).map((m) => dartToLowerCase(m.text)));
  if ([...words].some((w) => looks.has(w))) gives.add('seen');

  const after = firstMatch(wordAfter, text.substring(name.end));
  const next = after?.groups[1] === undefined ? '' : dartToLowerCase(after.groups[1]);
  const beforeWord = firstMatch(wordBefore, text.substring(0, name.start))?.groups[0];
  const before = beforeWord === undefined ? '' : dartToLowerCase(beforeWord);
  // Speaking: a quotation in the paragraph, with a word of speech beside the name or the name beside the quotation.
  const quotedNear = quotes.some((q) => Math.abs(name.start - q[1]) <= 3 || Math.abs(q[0] - name.end) <= 12);
  if (quotes.length > 0 && (speaking.has(next) || speaking.has(before) || quotedNear)) gives.add('speaks');
  if (perceiving.has(next) && !helpers.has(next)) gives.add('thinks');
  if (
    next.length > 0 &&
    !notDoing.has(next) &&
    !perceiving.has(next) &&
    !speaking.has(next) &&
    (doing.has(next) || (next.endsWith('ed') && next.length > 3))
  ) {
    gives.add('acts');
  }
  // "Tobiah was mending a net", "Jory had fallen": doing, a word later.
  const then = after?.groups[2] === undefined ? '' : dartToLowerCase(after.groups[2]);
  if (
    ((next === 'was' || next === 'were') && then.endsWith('ing') && then.length > 4 && !notActing.has(then)) ||
    (next === 'had' && (doing.has(then) || participles.has(then) || (then.endsWith('ed') && then.length > 3)))
  ) {
    gives.add('acts');
  }
  return gives;
}

/** entrancesIn over the chapters as stored (each record as JSON text, CharacterService.storedChapters): `order` is the
 * chapters' ids in reading order. A job to run away from the screen. */
export function entrancesJob(
  storedContents: readonly string[],
  order: readonly string[],
  people: readonly EyesPerson[],
): () => Entrances {
  return () => {
    const pages = storedPages(storedContents, new Set(order), blocksOf);
    return entrancesIn(
      order.map((id) => ({ id, blocks: pages.get(id) ?? [] })),
      people,
    );
  };
}
