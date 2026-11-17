// THIS OR THAT: a character's temperament, a quick choice at a time: quiet or loud, planner or improviser, head or
// heart. Each choice is a trait, kept in their **Core Traits** (one to a line, as a list field keeps them), so the deck
// and the profile are one: what is already there is where the deck starts, and choosing again puts the other word in
// its place. Traits not on the deck are left as they are.
//
// A choice is pressed by what it says ("Heart", "Break them"), and kept as the trait it makes them ("Emotional",
// "Rebellious"): a profile's traits are traits. What an earlier deck kept (the words pressed) is still read as the
// choice, and becomes the trait when the deck is next saved.
//
// Reads only; recordLook.ts (`recordTraits`) writes. A port of flutter_app/lib/shared/domain/characters/this_or_that.dart.

import { dartToLowerCase, dartTrim } from '../text/dartString';

/** One choice: a question, what either side says, and the trait either side keeps. */
export type TraitAxis = {
  readonly id: string;
  readonly question: string;
  readonly left: string;
  readonly right: string;
  readonly leftTrait: string;
  readonly rightTrait: string;
};

const axis = (id: string, question: string, left: string, right: string, leftTrait: string, rightTrait: string) =>
  ({ id, question, left, right, leftTrait, rightTrait }) as const;

/** The deck, in the order it is dealt. */
export const traitAxes: readonly TraitAxis[] = [
  axis('room', 'In a crowded room, {name} is…', 'Quiet', 'Loud', 'Quiet', 'Loud'),
  axis('plan', 'Faced with a journey, {name} is…', 'A planner', 'An improviser', 'Methodical', 'Spontaneous'),
  axis('head', 'When it matters, {name} follows their…', 'Head', 'Heart', 'Rational', 'Emotional'),
  axis('risk', 'At the edge of something dangerous, {name} is…', 'Cautious', 'Bold', 'Cautious', 'Bold'),
  axis('truth', 'When the truth would cost them, {name} is…', 'Honest', 'A liar', 'Honest', 'Deceitful'),
  axis('grudge', 'Wronged, {name} is…', 'Forgiving', 'Unforgiving', 'Forgiving', 'Unforgiving'),
  axis('lead', 'In a group, {name} would rather…', 'Lead', 'Follow', 'Commanding', 'Deferential'),
  axis('hope', 'About tomorrow, {name} is…', 'An optimist', 'A pessimist', 'Optimistic', 'Pessimistic'),
  axis('trust', 'Meeting a stranger, {name} is…', 'Trusting', 'Suspicious', 'Trusting', 'Suspicious'),
  axis('rules', 'When the rules are in the way, {name} would…', 'Keep them', 'Break them', 'Law-abiding', 'Rebellious'),
  axis('fight', 'Cornered, {name} would…', 'Fight', 'Run', 'Combative', 'Evasive'),
  axis('pride', 'About themselves, {name} is…', 'Proud', 'Humble', 'Proud', 'Humble'),
  axis('give', 'With what they have, {name} is…', 'Generous', 'Grasping', 'Generous', 'Grasping'),
  axis('talk', 'In a conversation, {name} is…', 'A talker', 'A listener', 'Talkative', 'Attentive'),
  axis('hour', '{name} is…', 'An early riser', 'A night owl', 'An early riser', 'A night owl'),
  axis('feel', 'What they feel, {name} would rather…', 'Show', 'Hide', 'Expressive', 'Reserved'),
];

/** The traits a stored list (one to a line, or by commas) holds. */
export function traitsIn(stored: string): string[] {
  return stored
    .split(/[\n,]/)
    .filter((t) => dartTrim(t).length > 0)
    .map((t) => dartTrim(t));
}

/** The words that put an axis on its left side, and on its right: the trait kept, and what an earlier deck kept. */
function wordsOf(a: TraitAxis): { left: Set<string>; right: Set<string> } {
  return {
    left: new Set([dartToLowerCase(a.leftTrait), dartToLowerCase(a.left)]),
    right: new Set([dartToLowerCase(a.rightTrait), dartToLowerCase(a.right)]),
  };
}

/** The side each axis is on in `traits`: -1 the left, 1 the right; an axis with neither (or both) is not in it. */
export function sidesOf(traits: readonly string[]): Map<string, number> {
  const lower = new Set(traits.map(dartToLowerCase));
  const has = (words: Set<string>) => [...lower].some((t) => words.has(t));
  const out = new Map<string, number>();
  for (const a of traitAxes) {
    const { left, right } = wordsOf(a);
    if (has(left) !== has(right)) out.set(a.id, has(left) ? -1 : 1);
  }
  return out;
}

/** `stored` with the deck's `sides` in it: each axis chosen holds its trait and not the other (nor what an earlier
 * deck kept for either); an axis left unchosen (null or missing) keeps neither; traits not on the deck stay, first, in
 * their order. */
export function traitsAfter(stored: string, sides: ReadonlyMap<string, number | null>): string {
  const deckWords = new Set<string>();
  for (const a of traitAxes) for (const w of wordsOf(a).left) deckWords.add(w);
  for (const a of traitAxes) for (const w of wordsOf(a).right) deckWords.add(w);
  const kept = traitsIn(stored).filter((t) => !deckWords.has(dartToLowerCase(t)));
  const chosen: string[] = [];
  for (const a of traitAxes) {
    const s = sides.get(a.id);
    if (s !== undefined && s !== null) chosen.push(s < 0 ? a.leftTrait : a.rightTrait);
  }
  return [...kept, ...chosen].join('\n');
}

/** `axis`'s question, asked of `name`. */
export function askOf(axis: TraitAxis, name: string): string {
  return axis.question.split('{name}').join(name);
}
