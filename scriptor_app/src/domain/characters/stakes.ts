// THE STAKES: what drives a cast, read from the profiles. A port of
// flutter_app/lib/shared/domain/characters/stakes.dart. Every layout asks it in its own words ("What they want",
// "Initial Goals", "Motivations"; "What stands in the way", "External Conflict"; "Intended Resolution", "How they
// change, if they do"), and here they are one question each: what they **want**, what they **need**, what **stands in
// the way**, what is **at stake**, and how they **end**. And where the wants of two of them **collide**: one wants what
// names the other, or both want the same thing.
//
// Reads only.

import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** A question every character's profile answers, or does not yet. */
export type Stake = 'wants' | 'needs' | 'inTheWay' | 'atStake' | 'ends';
export const stakes: readonly Stake[] = ['wants', 'needs', 'inTheWay', 'atStake', 'ends'];

/** What it is called on the board. */
export const stakeLabel: Readonly<Record<Stake, string>> = {
  wants: 'Wants',
  needs: 'Needs',
  inTheWay: 'In the way',
  atStake: 'At stake',
  ends: 'Ends',
};

/** The field it is written in when the profile has none of `stakeFieldNames`. */
export const stakeField: Readonly<Record<Stake, string>> = {
  wants: 'What they want',
  needs: 'What they need',
  inTheWay: 'What stands in the way',
  atStake: 'What they stand to lose',
  ends: 'Intended Resolution',
};

/** The fields that answer it, in lower case, the first written answering. */
export const stakeFieldNames: Readonly<Record<Stake, readonly string[]>> = {
  wants: ['what they want', 'initial goals', 'goals', 'goal', 'want', 'wants', 'desires'],
  needs: ['what they need', 'need', 'needs'],
  inTheWay: [
    'what stands in the way',
    'obstacles',
    'obstacle',
    'external conflict',
    'internal conflict',
    'internal conflicts',
  ],
  atStake: ['what they stand to lose', 'stakes', 'at stake'],
  ends: ['intended resolution', 'how they change, if they do', 'what would make them stop', 'resolution', 'ending'],
};

/** The question, of `name` (Dart's `Stake.ask`). */
export function askStake(stake: Stake, name: string): string {
  switch (stake) {
    case 'wants':
      return `What does ${name} want?`;
    case 'needs':
      return `What does ${name} need, without knowing it?`;
    case 'inTheWay':
      return `What stands in ${name}’s way?`;
    case 'atStake':
      return `What could ${name} lose?`;
    case 'ends':
      return `Where does ${name} end?`;
  }
}

/** The stakes `fields` (each field's name in lower case, and its value) answer, by question; and the motivation, when
 * nothing answers what they want ("Motivations"). */
export function stakesOf(fields: ReadonlyMap<string, string>): Map<Stake, string> {
  const out = new Map<Stake, string>();
  for (const s of stakes) {
    for (const n of stakeFieldNames[s]) {
      const v = dartTrim(fields.get(n) ?? '');
      if (v.length > 0) {
        out.set(s, v);
        break;
      }
    }
  }
  if (!out.has('wants')) {
    const m = dartTrim(fields.get('motivations') ?? '');
    if (m.length > 0) out.set('wants', m);
  }
  return out;
}

/** The stakes that make the board: what they want, what is in the way, what is at stake, how they end. */
export const boardStakes: readonly Stake[] = ['wants', 'inTheWay', 'atStake', 'ends'];

/** One of the cast, for finding where wants collide: their id, name, every name they go by, and their stakes. */
export type StakeHolder = {
  id: string;
  name: string;
  names: readonly string[];
  stakes: ReadonlyMap<Stake, string>;
};

/** Two whose wants collide, and why, in words. */
export type Collision = { a: string; b: string; why: string };

const stop = new Set([
  'that', 'this', 'with', 'from', 'they', 'them', 'their', 'what', 'when', 'where', 'which', 'would', 'could',
  'should', 'about', 'into', 'over', 'have', 'been', 'being', 'make', 'made', 'keep', 'kept', 'want', 'wants',
  'wanted', 'more', 'most', 'some', 'only', 'never', 'ever', 'once', 'again', 'there', 'here', 'than', 'then',
  'like', 'just', 'also', 'even', 'still', 'other', 'others', 'every', 'each', 'own', 'your', 'yours', 'whom',
  'whose', 'will', 'shall', 'must', 'very', 'much', 'many', 'such', 'after', 'before', 'without', 'within',
  'because', 'while', 'until', 'know', 'knows', 'find', 'finds', 'take', 'takes', 'give', 'gives', 'come', 'back',
  'something', 'anything', 'nothing', 'everything', 'someone', 'anyone', 'everyone', 'people', 'place', 'thing',
  'things', 'world',
]);

function words(text: string): string[] {
  return [...dartToLowerCase(text).matchAll(/[\p{L}’\x27]+/gu)].map((m) => m[0].replace(/[’\x27]s?$/, ''));
}

// As Dart's RegExp.escape.
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function names(text: string, all: readonly string[]): boolean {
  return all.some(
    (n) =>
      dartTrim(n).length >= 2 && new RegExp(`(?<![\\p{L}])${escape(dartTrim(n))}(?![\\p{L}])`, 'iu').test(text),
  );
}

const pairKey = (a: string, b: string) =>
  dartSort([a, b], (x, y) => (x < y ? -1 : x > y ? 1 : 0)).join('|');

/** Where the wants of `cast` collide, the strongest first, at most `most`: one's want (or what stands in their way)
 * names the other; or both want something called the same ("the chart" and "the chart"), a word of five letters or
 * more that is not a common one, alike in its first five letters. */
export function collisions(cast: readonly StakeHolder[], options: { most?: number } = {}): Collision[] {
  const most = options.most ?? 4;
  const named: Collision[] = [];
  const shared: Collision[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < cast.length; i++) {
    for (let j = 0; j < cast.length; j++) {
      if (i === j) continue;
      const a = cast[i];
      const b = cast[j];
      const pair = pairKey(a.id, b.id);
      if (seen.has(pair)) continue;
      const aWants = a.stakes.get('wants') ?? '';
      const aWay = a.stakes.get('inTheWay') ?? '';
      if (names(aWants, b.names)) {
        named.push({ a: a.id, b: b.id, why: `${a.name}’s want names ${b.name}` });
        seen.add(pair);
      } else if (names(aWay, b.names)) {
        named.push({ a: a.id, b: b.id, why: `${b.name} stands in ${a.name}’s way` });
        seen.add(pair);
      }
    }
  }
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      const a = cast[i];
      const b = cast[j];
      const pair = pairKey(a.id, b.id);
      if (seen.has(pair)) continue;
      const wa = new Set(words(a.stakes.get('wants') ?? '').filter((w) => w.length >= 5 && !stop.has(w)));
      const wb = words(b.stakes.get('wants') ?? '');
      let common: string | null = null;
      for (const w of wb) {
        if (w.length < 5 || stop.has(w)) continue;
        if ([...wa].some((x) => x.substring(0, 5) === w.substring(0, 5))) {
          common = w;
          break;
        }
      }
      if (common !== null) {
        shared.push({ a: a.id, b: b.id, why: `Both want “${common}”` });
        seen.add(pair);
      }
    }
  }
  return [...named, ...shared].slice(0, most);
}
