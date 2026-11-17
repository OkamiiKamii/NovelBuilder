// IN ONE SENTENCE (logline.ts): the character pitched in a sentence, at the top of their page, made from their
// profile. What the profile does not say yet is a blank in the sentence; a press on a blank (or on any part, to change
// it) asks for it, and the answer is kept in their profile, in the field it belongs to (Occupation; what they want,
// what is in the way, what they could lose, as the stakes board keeps them). Whole, it can be copied. The pure parts
// of flutter_app/lib/features/characters/widgets/in_one_sentence.dart.

import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type CastData } from '../castData';
import { type CharacterChanges } from '../characterChanges';
import { type LoglinePart, type LoglinePiece, loglineOf, loglineText, whoFields } from '../logline';
import { recordIn, recordStake } from '../recordLook';
import { type Stake, askStake, stakesOf } from '../stakes';

export type OneSentence = {
  pieces: LoglinePiece[];
  /** The sentence as text, when it has no blanks (Copy is offered then); else null. */
  whole: string | null;
  gaps: number;
  /** Under the sentence. */
  caption: string;
  /** For each part: what is stored now (the answer the question starts from), the question and its hint. */
  ask: (part: LoglinePart) => { value: string; question: string; hint: string };
  /** A part's words to a screen reader: "Fill in: who he is", "Change: a locksmith’s apprentice". */
  partLabel: (piece: LoglinePiece) => string;
};

export const oneSentenceWords = {
  title: 'IN ONE SENTENCE',
  copy: 'Copy the sentence',
  copied: 'The sentence is copied.',
  cancel: 'Cancel',
  keep: 'Keep it',
} as const;

const stakeOf = (part: LoglinePart): Stake => (part === 'wants' ? 'wants' : part === 'inTheWay' ? 'inTheWay' : 'atStake');

/** The sentence for a character of the cast; null when they are not in it. */
export function oneSentence(cast: CastData, entryId: string): OneSentence | null {
  const listed = cast.list.find((l) => l.entry.id === entryId);
  if (listed === undefined) return null;
  const entry = listed.entry;
  const fields = new Map<string, string>();
  for (const f of entry.fields) fields.set(dartToLowerCase(dartTrim(f.key)), f.value);
  const occupation = whoFields.map((n) => dartTrim(fields.get(n) ?? '')).find((v) => v.length > 0) ?? '';
  const stakes = stakesOf(fields);
  const pieces = loglineOf({
    name: entry.name,
    age: fields.get('age') ?? '',
    gender: fields.get('gender') ?? fields.get('sex') ?? '',
    who: occupation.length > 0 ? occupation : listed.profile.epithet,
    stakes,
  });
  const whole = loglineText(pieces);
  const gaps = pieces.filter((p) => p.gap).length;
  return {
    pieces,
    whole,
    gaps,
    caption:
      whole !== null
        ? `${entry.name} in one sentence: the pitch, the stakes board and the sparks to write them in all read from it. ` +
          'Press any part to change it.'
        : `${gaps === 1 ? 'One blank' : `${gaps} blanks`} to fill. Press one: what you write is kept in ${entry.name}’s ` +
          'profile.',
    ask: (part) => ({
      value: part === 'who' ? occupation : (stakes.get(stakeOf(part)) ?? ''),
      question: part === 'who' ? `Who is ${entry.name}, in a few words?` : askStake(stakeOf(part), entry.name),
      hint:
        part === 'who'
          ? 'A locksmith’s apprentice, the queen’s spy…'
          : part === 'wants'
            ? 'To open the last door'
            : part === 'inTheWay'
              ? 'The Architect, his own fear…'
              : 'His sister, the city, his name…',
    }),
    partLabel: (p) => (p.gap ? `Fill in: ${p.text}` : `Change: ${p.text}`),
  };
}

/** Whether an answer can be kept ("Keep it"): it is the answer trimmed, and a blank one is not kept. */
export function keptAnswer(text: string): string | null {
  const t = dartTrim(text);
  return t.length === 0 ? null : t;
}

/** Keeps an answer in the profile: who they are in their Occupation (or the trade field they keep), anything else as
 * the stake it answers. Run inside CharacterService.change. */
export function keepAnswer(c: CharacterChanges, entryId: string, part: LoglinePart, answer: string): void {
  if (part === 'who') {
    recordIn(c, entryId, 'Occupation', whoFields, answer, { sections: ['identity', 'position'], newSection: 'Core Identity' });
  } else {
    recordStake(c, entryId, stakeOf(part), answer);
  }
}
