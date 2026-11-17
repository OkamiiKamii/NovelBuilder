// A CHARACTER IN A LINE: who someone is, as an author jots it ("Mira Vance, 34, a smuggler from Glass River, Kai's
// sister"), read into what the profile records. A port of flutter_app/lib/shared/domain/characters/one_line.dart.
// Only what the words plainly say, and nothing guessed:
//
// - the **name**: what comes before the first comma;
// - an **age**: "34", "aged 34", "34 years old";
// - a **gender**: woman, man, girl, boy, lady, female, male;
// - a **species**: elf, dwarf, orc, vampire, android… (a word of a known list);
// - a **role**: protagonist, hero or heroine; antagonist or villain;
// - an **epithet**: "called the Fox", "known as the Fox";
// - an **occupation** and where they are **from**: "a smuggler from Glass River", or "from Glass River" alone;
// - **ties** to someone already in the cast: "Kai's sister", "Ilse's apprentice", each with who is which;
// - and anything else, as it was written, for the summary.

import { dartToUpperCase } from '../exchange/dartUpperCase';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** A tie the line names: to whom (an id of the cast), the kind (a relationship preset), whether the new character is
 * the first of a pair that has a direction (the parent, the mentor), and the words that said so. */
export type LineTie = { otherId: string; otherName: string; preset: string; newIsFrom: boolean; said: string };

export type OneLine = {
  name: string;
  age: string;
  gender: string;
  species: string;
  occupation: string;
  origin: string;
  role: string;
  epithet: string;
  ties: LineTie[];
  summary: string;
};

/** One of the cast, for ties. */
export type CastMember = { id: string; name: string };

const species = new Set([
  'human', 'elf', 'elven', 'half-elf', 'dwarf', 'orc', 'half-orc', 'goblin', 'halfling', 'hobbit', 'gnome', 'troll',
  'ogre', 'giant', 'vampire', 'werewolf', 'dragon', 'fae', 'faerie', 'fairy', 'demon', 'angel', 'ghost', 'witch',
  'android', 'robot', 'cyborg', 'alien', 'mermaid', 'merman', 'centaur', 'nymph', 'spirit', 'golem', 'undead',
]);

const women = new Set([
  'woman', 'girl', 'lady', 'female', 'heroine', 'queen', 'princess', 'mother', 'wife', 'widow', 'sister', 'daughter',
  'aunt', 'niece', 'mistress',
]);
const men = new Set([
  'man', 'boy', 'gentleman', 'male', 'king', 'prince', 'widower', 'brother', 'son', 'father', 'husband', 'uncle',
  'nephew',
]);

/** A tie's word, what kind of tie it is, and whether the one named first ("Kai's") is the first of the pair. */
const tieWords: ReadonlyMap<string, readonly [string, boolean]> = new Map([
  ['sister', ['siblings', false]],
  ['brother', ['siblings', false]],
  ['sibling', ['siblings', false]],
  ['twin', ['siblings', false]],
  ['cousin', ['relatives', false]],
  ['aunt', ['relatives', false]],
  ['uncle', ['relatives', false]],
  ['niece', ['relatives', false]],
  ['nephew', ['relatives', false]],
  ['mother', ['parent-child', false]],
  ['father', ['parent-child', false]],
  ['parent', ['parent-child', false]],
  ['son', ['parent-child', true]],
  ['daughter', ['parent-child', true]],
  ['child', ['parent-child', true]],
  ['wife', ['spouses', false]],
  ['husband', ['spouses', false]],
  ['spouse', ['spouses', false]],
  ['friend', ['friends', false]],
  ['ally', ['allies', false]],
  ['rival', ['rivals', false]],
  ['enemy', ['enemies', false]],
  ['nemesis', ['enemies', false]],
  ['lover', ['partners', false]],
  ['partner', ['partners', false]],
  ['mentor', ['mentor-student', false]],
  ['teacher', ['mentor-student', false]],
  ['master', ['master-servant', false]],
  ['student', ['mentor-student', true]],
  ['apprentice', ['mentor-student', true]],
  ['pupil', ['mentor-student', true]],
  ['servant', ['master-servant', true]],
  ['employer', ['employer-employee', false]],
  ['boss', ['employer-employee', false]],
  ['employee', ['employer-employee', true]],
]);

const roleWords = new Set(['protagonist', 'hero', 'heroine', 'antagonist', 'villain', 'young', 'old']);

const tie = () =>
  new RegExp(`(\\p{Lu}[\\p{L}'’-]*(?:\\s+\\p{Lu}[\\p{L}'’-]*)*)['’]s\\s+(${[...tieWords.keys()].join('|')})\\b`, 'giu');
const age = /^(?:aged\s+)?(\d{1,3})(?:\s*(?:years?|yrs?)(?:\s+old)?)?$/i;
const ageIn = () => /\b(\d{1,3})\s*(?:years?|yrs?)\s+old\b|\baged\s+(\d{1,3})\b/gi;
const called = /^(?:called|known as|nicknamed|named)\s+(.+)$/i;
const what = /^(?:an?|the)\s+(.+?)(?:\s+(?:from|of)\s+(\p{Lu}.*))?$/iu;
const from = /^(?:from|born in|of)\s+(\p{Lu}.*)$/u;
const word = () => /[\p{L}'’-]+/gu;
const onTheName = /^(.+?)\s+(the\s+\p{Lu}.*)$/u;

/** Reads `line` into a character. `cast` are the characters already in the novel (id and name), for ties. */
export function readOneLine(line: string, options: { cast?: readonly CastMember[] } = {}): OneLine {
  const cast = options.cast ?? [];
  const parts = line
    .split(/[,;]|\s+[—–-]\s+/)
    .filter((p) => dartTrim(p).length > 0)
    .map((p) => dartTrim(p));
  let name = parts.length === 0 ? '' : parts[0];
  let ageSaid = '';
  let gender = '';
  let speciesSaid = '';
  let occupation = '';
  let origin = '';
  let role = '';
  let epithet = '';
  const ties: LineTie[] = [];
  const rest: string[] = [];

  const castId = (said: string): string | null => {
    const s = dartToLowerCase(dartTrim(said));
    const whole = cast.filter((c) => dartToLowerCase(c.name) === s);
    if (whole.length === 1) return whole[0].id;
    // A part of a name that is one character's alone ("Kai" for Kai Doyle).
    const part = cast.filter((c) => dartToLowerCase(c.name).split(/\s+/).includes(s));
    return part.length === 1 ? part[0].id : null;
  };

  const words = (text: string) => {
    for (const m of text.matchAll(word())) {
      const w = dartToLowerCase(m[0]);
      if (gender.length === 0 && women.has(w)) gender = 'Female';
      if (gender.length === 0 && men.has(w)) gender = 'Male';
      if (speciesSaid.length === 0 && species.has(w)) speciesSaid = dartToUpperCase(w[0]) + w.substring(1);
      if (role.length === 0 && (w === 'protagonist' || w === 'hero' || w === 'heroine')) role = 'Protagonist';
      if (role.length === 0 && (w === 'antagonist' || w === 'villain')) role = 'Antagonist';
    }
  };

  for (const part of parts.slice(1)) {
    let used = false;
    for (const m of part.matchAll(tie())) {
      const id = castId(m[1]);
      if (id === null) continue;
      const [preset, namedFirst] = tieWords.get(dartToLowerCase(m[2]))!;
      ties.push({
        otherId: id,
        otherName: cast.find((c) => c.id === id)!.name,
        preset,
        newIsFrom: namedFirst,
        said: m[0],
      });
      words(m[2]);
      used = true;
    }
    if (used) continue;
    const a = age.exec(part);
    if (a !== null) {
      ageSaid = a[1];
      continue;
    }
    const c = called.exec(part);
    if (c !== null) {
      epithet = dartTrim(c[1]);
      continue;
    }
    const f = from.exec(part);
    if (f !== null) {
      origin = dartTrim(f[1]);
      continue;
    }
    const inPart = ageIn().exec(part);
    if (inPart !== null) ageSaid = inPart[1] ?? inPart[2];
    words(part);
    const w = what.exec(part);
    if (w !== null) {
      const said = dartTrim(w[1].replace(ageIn(), ''));
      const plain = dartToLowerCase(said);
      // "a woman", "an elf", "the villain" say who they are, not what they do.
      const onlyWho = [...plain.matchAll(word())].every(
        (x) => women.has(x[0]) || men.has(x[0]) || species.has(x[0]) || roleWords.has(x[0]),
      );
      if (!onlyWho && occupation.length === 0) occupation = said;
      if (w[2] !== undefined) origin = dartTrim(w[2]);
      continue;
    }
    rest.push(part);
  }
  // "Mira Vance the Fox": an epithet written on the name.
  if (epithet.length === 0) {
    const the = onTheName.exec(name);
    if (the !== null) {
      name = dartTrim(the[1]);
      epithet = dartTrim(the[2]);
    }
  }
  return {
    name,
    age: ageSaid,
    gender,
    species: speciesSaid,
    occupation,
    origin,
    role,
    epithet,
    ties,
    summary: rest.join(', '),
  };
}
