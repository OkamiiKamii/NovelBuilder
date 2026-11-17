// THEIR VOICE: how a character talks, measured from the lines the book gives them (voice.ts ties each line to its
// speaker) and set against the rest of the cast: how long their lines run, how often they ask or exclaim, how formally
// they speak (contractions), how long their words are, the words they use and no one else does, and whom they sound
// most like. A port of flutter_app/lib/shared/domain/characters/voice_print.dart. Reads only.

import { dartRound } from '../desk/format';
import { compareNum, dartSort } from '../manuscript/dartSort';
import { blockTexts } from '../prose';
import { dartToLowerCase, dartTrimRight } from '../text/dartString';
import { allMatches, storedPages } from './pageText';
import { spokenByEach } from './voice';

/** How someone talks, in numbers: their lines, words a line, the shares of lines that ask and that exclaim,
 * contractions in a hundred words, letters a word, and their signature words. */
export type VoicePrint = {
  id: string;
  lines: number;
  wordsPerLine: number;
  questions: number;
  cries: number;
  contractions: number;
  wordLength: number;
  signature: string[];
};

/** What is said of one voice: the traits that set it apart, and whom it sounds most like (and whether too alike). */
export type VoiceReading = { traits: string[]; soundsLike: string | null; alike: boolean };

/** The fewest lines a voice is measured from. */
export const voiceLinesAtLeast = 5;

const word = /[\p{L}][\p{L}’']*/gu;
const contraction = /\b\w+(?:n[’']t|[’'](?:re|ll|ve|m|d|s))\b/gi;
const apostrophe = /[’']/;
const apostrophes = /[’']/g;

const common = new Set([
  'the', 'and', 'you', 'that', 'was', 'for', 'are', 'with', 'his', 'her', 'they', 'this', 'have', 'from', 'not',
  'but', 'what', 'all', 'were', 'when', 'your', 'can', 'there', 'she', 'him', 'had', 'has', 'one', 'our', 'out',
  'who', 'will', 'would', 'about', 'them', 'then', 'some', 'into', 'just', 'like', 'know', 'now', 'here', 'yes',
  'did', 'does', 'don’t', "don't", 'it’s', "it's", 'i’m', "i'm", 'can’t', "can't", 'how', 'why', 'where', 'come',
  'go', 'get', 'got', 'see', 'say', 'said', 'too', 'very', 'well', 'back', 'only', 'their', 'over', 'been', 'any',
]);

/** The voice of each of `lines` (by id, the words they say), those with at least voiceLinesAtLeast lines, in the order
 * of `lines`. */
export function voicePrints(lines: ReadonlyMap<string, readonly string[]>): VoicePrint[] {
  const counts = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const prints: VoicePrint[] = [];
  for (const [id, said] of lines) {
    if (said.length < voiceLinesAtLeast) continue;
    const words = said.flatMap((l) => allMatches(word, l).map((m) => dartToLowerCase(m.text)));
    if (words.length === 0) continue;
    const mine = new Map<string, number>();
    for (const w of words) mine.set(w, (mine.get(w) ?? 0) + 1);
    counts.set(id, mine);
    totals.set(id, words.length);
    const contractions = said.reduce((n, l) => n + allMatches(contraction, l).length, 0);
    prints.push({
      id,
      lines: said.length,
      wordsPerLine: words.length / said.length,
      questions: said.filter((l) => dartTrimRight(l).endsWith('?')).length / said.length,
      cries: said.filter((l) => dartTrimRight(l).endsWith('!')).length / said.length,
      contractions: (contractions * 100) / words.length,
      wordLength: words.reduce((n, w) => n + w.replace(apostrophes, '').length, 0) / words.length,
      signature: [],
    });
  }
  // Signature words: said at least twice, at three times the rate the rest of the cast says them (or never by them).
  return prints.map((p) => {
    const mine = counts.get(p.id)!;
    let othersTotal = 0;
    for (const [k, v] of totals) if (k !== p.id) othersTotal += v;
    const scored: [string, number][] = [];
    for (const [w, n] of mine) {
      if (n < 2 || w.length < 4 || common.has(w) || apostrophe.test(w)) continue;
      let others = 0;
      for (const [k, v] of counts) if (k !== p.id) others += v.get(w) ?? 0;
      const rate = n / totals.get(p.id)!;
      const otherRate = othersTotal === 0 ? 0 : others / othersTotal;
      if (otherRate > 0 && rate < otherRate * 3) continue;
      scored.push([w, n * (otherRate === 0 ? 3.0 : rate / otherRate)]);
    }
    dartSort(scored, (a, b) => compareNum(b[1], a[1]));
    return { ...p, signature: scored.slice(0, 5).map((s) => s[0]) };
  });
}

const features = (p: VoicePrint) => [p.wordsPerLine, p.questions, p.cries, p.contractions, p.wordLength];

/** A number as the traits say it: whole from ten, or when it is whole; else to one place. */
export function voiceNumber(v: number): string {
  return v >= 10 || v === Math.round(v) ? String(dartRound(v)) : v.toFixed(1);
}

/** A share as a percentage: "40%". */
export function voicePercent(v: number): string {
  return `${dartRound(v * 100)}%`;
}

/** What sets `id`'s voice apart among `prints`, and whom it sounds most like (`names` by id); null when they have no
 * voice among them. */
export function readVoice(
  id: string,
  prints: readonly VoicePrint[],
  names: ReadonlyMap<string, string>,
): VoiceReading | null {
  const me = prints.find((p) => p.id === id);
  if (me === undefined) return null;
  const others = prints.filter((p) => p.id !== id);
  if (others.length === 0) return { traits: [], soundsLike: null, alike: false };
  const mean = (f: (p: VoicePrint) => number) => others.reduce((n, p) => n + f(p), 0.0) / others.length;
  const traits: string[] = [];
  const compare = (
    mine: number,
    theirs: number,
    more: string,
    less: string,
    say: (v: number) => string,
    floor = 0,
  ): void => {
    if (Math.max(mine, theirs) <= floor) return;
    if (mine >= theirs * 1.4 && mine - theirs > floor) {
      traits.push(`${more} (${say(mine)}, the others ${say(theirs)}).`);
    } else if (mine <= theirs * 0.7 && theirs - mine > floor) {
      traits.push(`${less} (${say(mine)}, the others ${say(theirs)}).`);
    }
  };

  compare(
    me.wordsPerLine,
    mean((p) => p.wordsPerLine),
    'Longer lines than the others',
    'Shorter lines than the others',
    (v) => `${voiceNumber(v)} words a line`,
    1,
  );
  compare(me.questions, mean((p) => p.questions), 'Asks more than the others', 'Asks less than the others', voicePercent, 0.05);
  compare(
    me.cries,
    mean((p) => p.cries),
    'Exclaims more than the others',
    'Exclaims less than the others',
    voicePercent,
    0.05,
  );
  compare(
    me.contractions,
    mean((p) => p.contractions),
    'Speaks loosely: more contractions',
    'Speaks formally: fewer contractions',
    (v) => `${voiceNumber(v)} in 100 words`,
    1,
  );
  compare(
    me.wordLength,
    mean((p) => p.wordLength),
    'Longer words than the others',
    'Plainer words than the others',
    (v) => `${voiceNumber(v)} letters a word`,
    0.3,
  );

  // Whom they sound most like: the nearest voice, each measure weighed by how much the cast's voices differ in it.
  const all = prints.map(features);
  const spread: number[] = [];
  for (let i = 0; i < 5; i++) {
    const values = all.map((f) => f[i]);
    const m = values.reduce((a, b) => a + b) / values.length;
    const sd = Math.sqrt(values.reduce((n, v) => n + (v - m) * (v - m), 0.0) / values.length);
    spread.push(sd > 1e-9 ? sd : 1.0);
  }
  // The spread a measure must clear to matter: for a cast of two, the spread is the gap itself, so a fixed scale.
  const scale = [3.0, 0.12, 0.12, 2.0, 0.4];
  const distance = (a: VoicePrint, b: VoicePrint): number => {
    const fa = features(a);
    const fb = features(b);
    let d = 0.0;
    for (let i = 0; i < 5; i++) {
      const s = prints.length >= 4 ? spread[i] : scale[i];
      d += Math.pow((fa[i] - fb[i]) / s, 2);
    }
    return Math.sqrt(d / 5);
  };

  let nearest: VoicePrint | null = null;
  let best = Infinity;
  for (const o of others) {
    const d = distance(me, o);
    if (d < best) {
      best = d;
      nearest = o;
    }
  }
  const alike = best < 0.5 && me.lines >= 8 && nearest!.lines >= 8 && traits.length === 0;
  return { traits, soundsLike: nearest === null ? null : (names.get(nearest.id) ?? null), alike };
}

/** The voices of `people` (by id, the names they go by), from the chapters as stored (each record as JSON text,
 * CharacterService.storedChapters) in reading order `nodeIds`, as a job to run away from the screen. */
export function voicePrintsJob(
  storedContents: readonly string[],
  nodeIds: readonly string[],
  people: ReadonlyMap<string, readonly string[]>,
): () => VoicePrint[] {
  return () => {
    const pages = storedPages(storedContents, new Set(nodeIds), blockTexts);
    // Everyone's lines in one reading of the book's lines (spokenByEach), not a reading a person.
    const spoken = spokenByEach(pages, nodeIds, people, { limit: 400 });
    const lines = new Map<string, string[]>();
    for (const id of people.keys()) lines.set(id, spoken.get(id)!.map((s) => s.words));
    return voicePrints(lines);
  };
}
