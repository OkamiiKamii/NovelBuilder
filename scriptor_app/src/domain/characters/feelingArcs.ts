// ARCS: each character's line through the book, read from the words of feeling in the sentences that name them: bright
// (hope, laughed, safe, proud) above the line, dark (fear, wept, alone, ashamed) below, a negation turning a word over
// ("not afraid"). A point a chapter they are named in; the shape of the whole named in plain words, with the classic
// name for it where there is one (the falling and rising again of "a man in a hole"). Nothing is guessed: a chapter
// with no word of feeling about them has no reading, and one named too little has no line.
//
// A port of flutter_app/lib/shared/domain/characters/feeling_arcs.dart. Reads only.

import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { CastNames, type EyesPerson } from './castNames';
import { allMatches, blocksOf, sentencePattern, storedPages } from './pageText';

/** The shape of a line through the book. */
export type ArcShape = 'rises' | 'falls' | 'fallsThenRises' | 'risesThenFalls' | 'wavers' | 'flat';
export const arcShapes: readonly ArcShape[] = ['rises', 'falls', 'fallsThenRises', 'risesThenFalls', 'wavers', 'flat'];

/** The shape, said plainly. */
export const arcShapeLabel: Readonly<Record<ArcShape, string>> = {
  rises: 'Rises',
  falls: 'Falls',
  fallsThenRises: 'Falls, then rises',
  risesThenFalls: 'Rises, then falls',
  wavers: 'Rises and falls, ending where it began',
  flat: 'Flat: it barely moves',
};

/** Its classic name, if it has one ('' when it has none). */
export const arcShapeClassic: Readonly<Record<ArcShape, string>> = {
  rises: 'rags to riches',
  falls: 'a tragedy',
  fallsThenRises: 'a man in a hole',
  risesThenFalls: 'an Icarus',
  wavers: '',
  flat: '',
};

/** A sentence that carries feeling about a character: the sentence, its paragraph (as the editor counts blocks), and
 * its weight (bright above nought, dark below). */
export type FeelingLine = { sentence: string; block: number; score: number };

/** A chapter a character is named in: the chapter (1 first), its id, how often they are named, the feeling read from
 * the words around them (from -1, dark, to 1, bright; null when there are none), and the strongest lines. */
export type ArcPoint = { chapter: number; nodeId: string; mentions: number; feeling: number | null; lines: FeelingLine[] };

/** One character's line: their chapters, how often named in all, its shape (null when too few readings to say), and
 * its highest and lowest chapters. */
export type CharacterArc = {
  id: string;
  points: ArcPoint[];
  mentions: number;
  shape: ArcShape | null;
  high: ArcPoint | null;
  low: ArcPoint | null;
};

/** The arcs of a book: how many chapters it has, the lines (the most named first), and those named too little to
 * draw. */
export type FeelingArcs = { chapters: number; arcs: CharacterArc[]; thin: string[] };

/** A chapter for the reading: its id and its blocks in order, headings marked. */
export type ArcChapter = { id: string; blocks: readonly { heading: boolean; text: string }[] };

const bright = new Set([
  'happy', 'happier', 'happily', 'glad', 'joy', 'joyful', 'laughed', 'laugh', 'laughing', 'laughter', 'smiled', 'smile',
  'smiling', 'grinned', 'grin', 'hope', 'hoped', 'hopeful', 'love', 'loved', 'loving', 'warm', 'warmth', 'safe',
  'safely', 'relief', 'relieved', 'calm', 'peace', 'peaceful', 'proud', 'pride', 'delight', 'delighted', 'kind',
  'kindly', 'gentle', 'gently', 'grateful', 'thankful', 'triumph', 'triumphant', 'won', 'victory', 'free', 'freedom',
  'eager', 'excited', 'cheer', 'cheerful', 'content', 'comfort', 'comforted', 'trust', 'trusted', 'brave', 'courage',
  'confident', 'tender', 'tenderly', 'sweet', 'beautiful', 'wonder', 'wonderful', 'fond', 'embraced', 'hugged',
  'kissed', 'alive', 'healed', 'rescued', 'saved', 'together', 'sang', 'danced', 'amused', 'admired', 'blessed', 'lucky',
  'glowed', 'bliss', 'hopes', 'joked', 'thrilled', 'elated', 'soothed', 'reassured', 'forgave', 'forgiven', 'belonged',
  'welcome', 'welcomed', 'beloved', 'playful', 'radiant', 'serene', 'easy',
]);

const dark = new Set([
  'sad', 'sadly', 'sadness', 'sorrow', 'grief', 'grieved', 'grieving', 'wept', 'weep', 'weeping', 'tears', 'afraid',
  'fear', 'feared', 'fearful', 'terror', 'terrified', 'scared', 'frightened', 'dread', 'dreaded', 'panic', 'panicked',
  'anxious', 'worry', 'worried', 'angry', 'anger', 'rage', 'furious', 'fury', 'hate', 'hated', 'hatred', 'bitter',
  'bitterly', 'alone', 'lonely', 'loneliness', 'lost', 'loss', 'hurt', 'pain', 'painful', 'wounded', 'bleeding', 'dead',
  'death', 'died', 'dying', 'killed', 'despair', 'hopeless', 'shame', 'ashamed', 'guilt', 'guilty', 'regret',
  'regretted', 'miserable', 'misery', 'cruel', 'betrayed', 'betrayal', 'trapped', 'failed', 'failure', 'defeat',
  'defeated', 'weak', 'sick', 'exhausted', 'numb', 'ached', 'aching', 'screamed', 'trembled', 'trembling', 'grim',
  'desperate', 'desperately', 'horror', 'horrified', 'cursed', 'ruined', 'suffered', 'suffering', 'jealous', 'resented',
  'disgust', 'disgusted', 'nervous', 'mourned', 'mourning', 'frowned', 'scowled', 'flinched', 'winced', 'sobbed',
  'sobbing', 'shivered', 'heartbroken', 'humiliated', 'helpless', 'abandoned', 'wretched', 'furiously', 'snarled',
  'hopelessly', 'agony', 'anguish', 'dreadful', 'gloom', 'tormented',
]);

const turning = new Set(['not', 'never', 'no', 'nor', 'without', 'hardly', 'barely']);

const token = /[\p{L}][\p{L}’'\-]*/gu;

/** How many chapters someone must be named in, with how many readings of feeling, to be drawn. */
export const arcChapters = 3;
export const arcReadings = 2;

/** The arcs of `people` through `chapters` (in reading order). */
export function feelingArcs(chapters: readonly ArcChapter[], people: readonly EyesPerson[]): FeelingArcs {
  // The cast's names, found in one reading of each sentence (castNames.ts), not a search per name per character.
  const names = new CastNames(people);
  const order = new Map(people.map((p, i) => [p.id, i]));
  const points = new Map(people.map((p) => [p.id, [] as ArcPoint[]]));

  chapters.forEach((chapter, c) => {
    const mentions = new Map<string, number>();
    const up = new Map<string, number>();
    const down = new Map<string, number>();
    const lines = new Map<string, FeelingLine[]>();
    chapter.blocks.forEach((block, b) => {
      if (block.heading || dartTrim(block.text).length === 0) return;
      for (const s of allMatches(sentencePattern, block.text)) {
        const sentence = s.text;
        const named = [...names.named(sentence)].sort((x, y) => order.get(x)! - order.get(y)!);
        if (named.length === 0) continue;
        const [brightWords, darkWords] = weigh(sentence);
        for (const id of named) {
          mentions.set(id, (mentions.get(id) ?? 0) + 1);
          if (brightWords + darkWords === 0) continue;
          up.set(id, (up.get(id) ?? 0) + brightWords);
          down.set(id, (down.get(id) ?? 0) + darkWords);
          let mine = lines.get(id);
          if (mine === undefined) lines.set(id, (mine = []));
          mine.push({ sentence: dartTrim(sentence), block: b, score: brightWords - darkWords });
        }
      }
    });
    for (const [id, n] of mentions) {
      const u = up.get(id) ?? 0;
      const d = down.get(id) ?? 0;
      const strongest = dartSort([...(lines.get(id) ?? [])], (x, y) => Math.abs(y.score) - Math.abs(x.score));
      points.get(id)!.push({
        chapter: c + 1,
        nodeId: chapter.id,
        mentions: n,
        // Damped, so one word is not the whole sky: a single "afraid" is -0.33, three of them -0.6.
        feeling: u + d === 0 ? null : (u - d) / (u + d + 2),
        lines: strongest.slice(0, 3),
      });
    }
  });

  const arcs: CharacterArc[] = [];
  const thin: string[] = [];
  for (const p of people) {
    const mine = points.get(p.id)!;
    if (mine.length === 0) continue;
    const readings = mine.filter((x) => x.feeling !== null);
    if (mine.length < arcChapters || readings.length < arcReadings) {
      thin.push(p.id);
      continue;
    }
    let high: ArcPoint | null = null;
    let low: ArcPoint | null = null;
    for (const r of readings) {
      if (high === null || r.feeling! > high.feeling!) high = r;
      if (low === null || r.feeling! < low.feeling!) low = r;
    }
    arcs.push({
      id: p.id,
      points: mine,
      mentions: mine.reduce((n, x) => n + x.mentions, 0),
      shape: shapeOf(readings.map((r) => r.feeling!)),
      high,
      low,
    });
  }
  dartSort(arcs, (a, b) => b.mentions - a.mentions);
  return { chapters: chapters.length, arcs, thin };
}

/** The bright and dark words of `sentence`, a word turned over by a "not" or "never" just before it. */
function weigh(sentence: string): [number, number] {
  const words = allMatches(token, sentence).map((m) => dartToLowerCase(m.text));
  let up = 0;
  let down = 0;
  words.forEach((w, i) => {
    const isBright = bright.has(w);
    const isDark = dark.has(w);
    if (!isBright && !isDark) return;
    const turned = words
      .slice(Math.max(0, i - 2), i)
      .some((t) => turning.has(t) || t.endsWith('n’t') || t.endsWith("n't"));
    if (isBright !== turned) {
      up++;
    } else {
      down++;
    }
  });
  return [up, down];
}

/** The shape of a line of `feelings` (in the book's order), or null with fewer than four. */
export function shapeOf(feelings: readonly number[]): ArcShape | null {
  if (feelings.length < 4) return null;
  // Smoothed over its neighbours, so one dark chapter in a bright book is not a fall; a short line is read as drawn,
  // since smoothing four points blurs the turn at its end.
  const smooth =
    feelings.length < 6
      ? feelings
      : feelings.map((_, i) => {
          const lo = Math.max(0, i - 1);
          const hi = Math.min(feelings.length - 1, i + 1);
          let sum = feelings[lo];
          for (let j = lo + 1; j <= hi; j++) sum += feelings[j];
          return sum / (hi - lo + 1);
        });
  const n = smooth.length;
  const third = Math.max(1, Math.trunc(n / 3));
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b) / xs.length;
  const start = mean(smooth.slice(0, third));
  const end = mean(smooth.slice(n - third));
  const top = smooth.reduce((a, b) => Math.max(a, b));
  const bottom = smooth.reduce((a, b) => Math.min(a, b));
  const step = 0.2;
  if (top - bottom < step) return 'flat';
  const lowAt = smooth.indexOf(bottom);
  const highAt = smooth.indexOf(top);
  const middle = (i: number) => i >= n * 0.2 && i <= n * 0.8;
  if (middle(lowAt) && start - bottom >= step && end - bottom >= step) return 'fallsThenRises';
  if (middle(highAt) && top - start >= step && top - end >= step) return 'risesThenFalls';
  if (end - start >= step) return 'rises';
  if (start - end >= step) return 'falls';
  return 'wavers';
}

/** feelingArcs over the chapters as stored (each record as JSON text, CharacterService.storedChapters): `order` is the
 * chapters' ids in reading order. A job to run away from the screen. */
export function feelingArcsJob(
  storedContents: readonly string[],
  order: readonly string[],
  people: readonly EyesPerson[],
): () => FeelingArcs {
  return () => {
    const pages = storedPages(storedContents, new Set(order), blocksOf);
    return feelingArcs(
      order.map((id) => ({ id, blocks: pages.get(id) ?? [] })),
      people,
    );
  };
}
