// IN ONE SENTENCE: a character's logline, the sentence writers pitch a character in, made from their profile: who they
// are, what they want, what is in their way, what they would lose. "Mark, 21, a locksmith's apprentice, wants to open
// the last door, but the Architect stands in his way. If he fails, he loses his sister." What the profile does not say
// is left as a gap to fill, never guessed; each gap is one field of the profile. A port of
// flutter_app/lib/shared/domain/characters/logline.dart.
//
// Reads only.

import { dartToUpperCase } from '../exchange/dartUpperCase';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type Stake } from './stakes';

/** A part of the sentence that comes from the profile, and so can be a gap. */
export type LoglinePart = 'who' | 'wants' | 'inTheWay' | 'atStake';
export const loglineParts: readonly LoglinePart[] = ['who', 'wants', 'inTheWay', 'atStake'];

/** A piece of the sentence: plain words, or a part (filled, or a gap with what it asks for). */
export type LoglinePiece = { text: string; part: LoglinePart | null; gap: boolean };

/** The fields that say who someone is, beside the title they go by. */
export const whoFields: readonly string[] = ['occupation', 'job', 'profession', 'trade'];

/** The pronouns for a profile's gender: he, his; she, her; else they, their. */
export function pronounsFor(gender: string): { they: string; their: string; fails: string } {
  switch (dartToLowerCase(dartTrim(gender))) {
    case 'male':
    case 'man':
    case 'm':
    case 'boy':
      return { they: 'he', their: 'his', fails: 'fails' };
    case 'female':
    case 'woman':
    case 'f':
    case 'girl':
      return { they: 'she', their: 'her', fails: 'fails' };
    default:
      return { they: 'they', their: 'their', fails: 'fail' };
  }
}

/** The sentence for `name`, from what their profile says: `age` (left out when blank), `who` (their title or trade),
 * and their `stakes`; the pronouns from `gender`. A part the profile does not give is a gap. */
export function loglineOf(args: {
  name: string;
  age: string;
  gender: string;
  who: string;
  stakes: ReadonlyMap<Stake, string>;
}): LoglinePiece[] {
  const { name, age, gender, who, stakes } = args;
  const p = pronounsFor(gender);
  const words = (text: string): LoglinePiece => ({ text, part: null, gap: false });
  const part = (part: LoglinePart, value: string, ask: string): LoglinePiece =>
    dartTrim(value).length === 0 ? { text: ask, part, gap: true } : { text: inSentence(value), part, gap: false };
  return [
    words(dartTrim(age).length === 0 ? `${name}, ` : `${name}, ${dartTrim(age)}, `),
    part('who', who, `who ${p.they} ${p.they === 'they' ? 'are' : 'is'}`),
    words(', wants '),
    part('wants', stakes.get('wants') ?? '', `what ${p.they} ${p.they === 'they' ? 'want' : 'wants'}`),
    words(', but '),
    part('inTheWay', stakes.get('inTheWay') ?? '', 'what is in the way'),
    words(` stands in ${p.their} way. If ${p.they} ${p.fails}, ${p.they} ${p.they === 'they' ? 'lose' : 'loses'} `),
    part('atStake', stakes.get('atStake') ?? '', 'what is at stake'),
    words('.'),
  ];
}

/** The sentence as plain text, when it has no gaps; else null. */
export function loglineText(pieces: readonly LoglinePiece[]): string | null {
  return pieces.some((p) => p.gap)
    ? null
    : dartTrim(
        pieces
          .map((p) => p.text)
          .join('')
          .replace(/\s+/g, ' '),
      );
}

const lowered = new Set(['the', 'a', 'an', 'to', 'his', 'her', 'their', 'its', 'my', 'being', 'that', 'what', 'how', 'some']);

/** An answer as it reads inside the sentence: one line, its last stop dropped, and its first word in lower case when
 * it is an ordinary word ("To open the last door." reads "to open the last door"; "Revenge on his father" reads
 * "revenge on his father"), but not a name ("Kai's betrayal", "Old Tam"). */
export function inSentence(value: string): string {
  let t = dartTrim(value).replace(/\s+/g, ' ');
  t = t.replace(/[.;!]+$/, '');
  const words = t.split(' ');
  if (words.length === 0 || words[0].length === 0) return t;
  const first = words[0];
  const second = words.length > 1 ? words[1] : '';
  const ordinary =
    lowered.has(dartToLowerCase(first)) ||
    (second.length > 0 && second[0] === dartToLowerCase(second[0]) && !/[’']s$/.test(first));
  // An acronym ("NASA") keeps its capitals; "A" is the article.
  const acronym = first.length > 1 && dartToUpperCase(first) === first;
  if (!ordinary || acronym || (first.length < 2 && !lowered.has(dartToLowerCase(first)))) return t;
  return `${dartToLowerCase(first[0])}${first.substring(1)}${t.substring(first.length)}`;
}
