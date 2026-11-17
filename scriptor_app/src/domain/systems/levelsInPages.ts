// LEVELS IN YOUR PAGES: everything a book's chapters give a level to, kept as the book is written and never by hand:
// an armor and its versions ("Archer Armor", "Hunter Armor"), a skill, a weapon, a spell, a character. Where it is
// now, and every step it took, each with its chapter and the sentence that says so. It changes only when the pages
// say it changed: write in chapter 100 that the Hunter Armor reached Level 100, and from chapter 100 it is at 100.
//
// Read the ways these books write a level:
//
// - "the Hunter Armor reached Level 100" (and rose to, hit, climbed to, is now, became, evolved to, dropped to…);
// - "Hunter Armor Level 2", "Hunter Armor Lv. 2", "Hunter Armor (Lv 2)", "[Hunter Armor: Level 2]";
// - "a Level 3 Hunter Armor";
// - "the Hunter Armor's level rose to 4";
// - "the Hunter Armor leveled up", "[Hunter Armor Level Up!]": one level up from where it was.
//
// The name is what comes before (or after) the level, capitalised, up to four words ("of" and "the" between them
// allowed): the words that open a sentence ("Then", "Now"…), "the", "his" and the like are left off, and an owner
// too ("James's Hunter Armor" is the Hunter Armor). Names that share their last word are versions of one thing
// (Archer Armor and Hunter Armor are both Armor). A level lower than one the pages already gave, where the sentence
// does not say it fell, is marked.
//
// **Whose it is**, so it is kept on that character's page: a character's own level when the name is theirs ("Kade
// reached Level 5"); else the owner the pages name ("Kade's Hunter Armor", weighing most), the characters named in the
// sentence that gives the level, else in its paragraph, else the one the chapter is seen through (`pov.ts`: "his
// Hunter Armor reached Level 2" is the wearer's), clearly ahead. The author's word over all of it: a thing given to
// someone, or to no one.
//
// Reads only. A port of flutter_app/lib/shared/domain/systems/levels_in_pages.dart (Dart's regular expressions are
// JavaScript's, so the patterns are the same).

import { type EyesPerson } from '../characters/castNames';
import { allMatches, dartEscape, paragraphsOf, storedPages } from '../characters/pageText';
import { chapterEyes } from '../characters/pov';
import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** A step a thing took: the chapter (1 first) and its id, the paragraph, the level, and the sentence that says so;
 * `up` when the page said only that it leveled up; `backwards` when it is lower than before and the page does not say
 * it fell. */
export type LevelStep = {
  chapter: number;
  nodeId: string;
  block: number;
  level: number;
  sentence: string;
  up: boolean;
  backwards: boolean;
};

/** A thing the pages give a level to: its name, what it is a version of ('' when it stands alone), its steps (the
 * first mention and every change, in the book's order), how often the pages give it a level, whose it is (a
 * character's id; null when no one's), and whether it is that character's own level. */
export type Levelled = {
  name: string;
  family: string;
  steps: LevelStep[];
  mentions: number;
  owner: string | null;
  self: boolean;
};

/** A chapter for the reading: its id and paragraphs. */
export type LevelChapter = { id: string; paragraphs: readonly string[] };

/** The weight of an owner the pages name ("Kade's Hunter Armor"), of a character named in the same sentence, in the
 * same paragraph, and of the one the chapter is seen through, toward whose a thing is. */
const ownerWeights = { named: 5, sentence: 2, paragraph: 1, eyes: 1 } as const;

const word = String.raw`[\p{Lu}][\p{L}\p{N}’'\-]*`;
const name = `(${word}(?:\\s+(?:of\\s+the\\s+|of\\s+|the\\s+)?${word}){0,3})`;
const level = String.raw`(?:[Ll][Ee][Vv][Ee][Ll]|[Ll][Vv][Ll]?[.․]?|LVL[.․]?)`;

/** Stands for the stop of "Lv." while sentences are found (one character for one, so nothing moves), and is put back. */
const stop = '․';
const verbs =
  String.raw`(?:is\s+now\s+at|was\s+now\s+at|reached|reaches|reach|hit|hits|rose\s+to|rises\s+to|rise\s+to|climbed\s+to|` +
  String.raw`climbs\s+to|climb\s+to|grew\s+to|grows\s+to|grow\s+to|advance\s+to|` +
  String.raw`(?:leveled|levelled)\s+up\s+to|advanced\s+to|advances\s+to|is\s+now|was\s+now|is\s+at|was\s+at|became|becomes|` +
  String.raw`evolved\s+to|evolved\s+into|upgraded\s+to|went\s+up\s+to|jumped\s+to|dropped\s+to|fell\s+to|` +
  String.raw`went\s+down\s+to|is|was|at)`;

const patterns: readonly { re: RegExp; up: boolean }[] = [
  // "the Hunter Armor reached Level 100"
  {
    re: new RegExp(
      `${name}(?:’s|'s)?\\s+(?:(?:has|had|have|just|finally|now|already)\\s+)*${verbs}\\s+(?:the\\s+)?${level}\\s*(\\d{1,5})\\b`,
      'gu',
    ),
    up: false,
  },
  // "the Hunter Armor's level rose to 4"
  {
    re: new RegExp(
      `${name}(?:’s|'s)\\s+level\\s+(?:had\\s+|has\\s+)?(?:rose|went\\s+up|increased|reached|is\\s+now|was\\s+now|jumped|` +
        'climbed|grew|dropped|fell|went\\s+down|is|was)(?:\\s+to)?\\s+(\\d{1,5})\\b',
      'gu',
    ),
    up: false,
  },
  // "a Level 3 Hunter Armor"
  { re: new RegExp(`\\b(?:a|an|the|his|her|their|its|my|your|our)\\s+${level}\\s*(\\d{1,5})\\s+${name}`, 'gu'), up: false },
  // "Hunter Armor Level 2", "Hunter Armor (Lv. 2)", "[Hunter Armor: Level 2]"
  { re: new RegExp(`${name}\\s*[\\(\\[:—–\\-]?\\s*${level}\\s*(\\d{1,5})\\b`, 'gu'), up: false },
  // "the Hunter Armor leveled up", "[Hunter Armor Level Up!]"
  {
    re: new RegExp(`${name}(?:’s|'s)?\\s+(?:(?:has|had|just|finally)\\s+)*(?:(?:leveled|levelled)\\s+up(?!\\s+to)|[Ll]evel\\s+[Uu]p)`, 'gu'),
    up: true,
  },
];

const openers: ReadonlySet<string> = new Set([
  'then', 'now', 'finally', 'when', 'after', 'suddenly', 'at', 'with', 'as', 'and', 'but', 'so', 'once', 'soon', 'the', //
  'his', 'her', 'their', 'its', 'my', 'your', 'our', 'a', 'an', 'this', 'that', 'by', 'in', 'on', 'if', 'while', //
  'before', 'still', 'yet', 'even', 'only', 'just', 'there', 'here', 'meanwhile', 'later', 'today', 'tonight',
]);
const notNames: ReadonlySet<string> = new Set([
  'he', 'she', 'it', 'i', 'you', 'they', 'we', 'level', 'lv', 'lvl', 'status', 'system', 'warning', 'notice', //
  'congratulations',
]);
const fell = /\b(dropped|drops|fell|falls|lost|loses|reduced|down|decreased|weakened|regressed|downgraded)\b/i;
const sentencePattern = /[^.!?…\]]+[.!?…\]]+["”’]*|[^.!?…\]]+$/g;
const possessive = /(’s|\x27s)$/;
const digits = /^\d+$/;
const lvStop = /\b([Ll][Vv][Ll]?|LVL)\.(?=\s*\d)/g;

/** The name a match gives, cleaned: the opening words and an owner left off; null when nothing is left. */
export function cleanLevelName(raw: string): string | null {
  const words = dartTrim(raw).split(/\s+/);
  while (words.length > 0 && openers.has(dartToLowerCase(words[0]))) words.shift();
  // An owner: "James's Hunter Armor" is the Hunter Armor.
  const owner = lastIndexWhere(words, (w) => possessive.test(w));
  if (owner >= 0 && owner < words.length - 1) words.splice(0, owner + 1);
  while (words.length > 0 && ['of', 'the'].includes(dartToLowerCase(words[words.length - 1]))) words.pop();
  if (words.length === 0) return null;
  const named = words.join(' ').replace(possessive, '');
  if (notNames.has(dartToLowerCase(named))) return null;
  return named;
}

/** The owner a match names, if any: the word before "'s" ("James's Hunter Armor" is James's). */
export function ownerIn(raw: string): string | null {
  const words = dartTrim(raw).split(/\s+/);
  const at = lastIndexWhere(words, (w) => possessive.test(w));
  if (at < 0 || at === words.length - 1) return null;
  return words[at].replace(possessive, '');
}

function lastIndexWhere<T>(list: readonly T[], test: (x: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return i;
  return -1;
}

/** What a thing is a version of: its last word, when another name the pages level shares it. */
const head = (n: string): string => {
  const parts = n.split(' ');
  return parts[parts.length - 1];
};

/** The name standing on its own (no letter either side), to test for and, with `global`, to take out. */
const named = (n: string, global = false): RegExp =>
  new RegExp(`(?<![\\p{L}])${dartEscape(n)}(?![\\p{L}])`, global ? 'gu' : 'u');

/** Everything `chapters` (in reading order) give a level to, in the order the book first does, but those set aside
 * (`setAside`, by name in lower case); whose each is, among `people`, unless `assigned` says (by name in lower case: a
 * character's id, or '' for no one's). */
export function levelsInPages(
  chapters: readonly LevelChapter[],
  options: { setAside?: ReadonlySet<string>; people?: readonly EyesPerson[]; assigned?: ReadonlyMap<string, string> } = {},
): Levelled[] {
  const setAside = options.setAside ?? new Set<string>();
  const people = options.people ?? [];
  const assigned = options.assigned ?? new Map<string, string>();
  const steps = new Map<string, LevelStep[]>();
  const names = new Map<string, string>();
  const mentions = new Map<string, number>();
  // Whose each thing is: a score for each character.
  const scores = new Map<string, Map<string, number>>();
  const finds = new Map(people.map((p) => [p.id, p.names.map((n) => named(n))]));
  const namedIn = (text: string, id: string) => finds.get(id)!.some((f) => f.test(text));
  // Whose eyes each chapter is seen through, only when there is someone to give a thing to.
  const eyes = new Map<string, string | null>();
  if (people.length > 0) {
    for (const e of chapterEyes(
      chapters.map((c) => ({ id: c.id, title: '', paragraphs: c.paragraphs })),
      people,
    )) {
      eyes.set(e.nodeId, e.who);
    }
  }
  chapters.forEach((chapter, c) => {
    chapter.paragraphs.forEach((paragraph, b) => {
      // "Lv. 2" is not the end of a sentence: the stop before a number is left off, so the sentence is read whole.
      const text = paragraph.replace(lvStop, (_m, g1: string) => `${g1}${stop}`);
      for (const s of allMatches(sentencePattern, text)) {
        const sentence = dartTrim(s.text);
        if (sentence.length === 0) continue;
        // Each place in the sentence read once, by the first way of writing that finds it.
        const taken: [number, number][] = [];
        const found: { at: number; name: string; level: number | null; up: boolean; owner: string | null }[] = [];
        for (const p of patterns) {
          for (const m of allMatches(p.re, sentence)) {
            if (taken.some(([start, end]) => m.start < end && start < m.end)) continue;
            // Which group is the name and which the number depends on the way of writing.
            const g = m.groups;
            const number = g.find((x) => x !== undefined && digits.test(x));
            const raw = g.find((x) => x !== undefined && !digits.test(x));
            const cleaned = raw === undefined ? null : cleanLevelName(raw);
            if (cleaned === null) continue;
            taken.push([m.start, m.end]);
            found.push({
              at: m.start,
              name: cleaned,
              level: number === undefined ? null : parseInt(number, 10),
              up: p.up,
              owner: ownerIn(raw!),
            });
          }
        }
        dartSort(found, (x, y) => x.at - y.at);
        for (const f of found) {
          const key = dartToLowerCase(f.name);
          if (setAside.has(key)) continue;
          let list = steps.get(key);
          if (list === undefined) steps.set(key, (list = []));
          if (!names.has(key)) names.set(key, f.name);
          const last = list.length === 0 ? null : list[list.length - 1];
          const lvl = f.level ?? (last === null ? null : last.level + 1);
          if (lvl === null) continue;
          mentions.set(key, (mentions.get(key) ?? 0) + 1);
          // Whose it is, from this mention: the owner named, else who is in the sentence, else in the paragraph,
          // else whose eyes the chapter is seen through. The thing's own name is not someone in the sentence.
          if (people.length > 0) {
            let score = scores.get(key);
            if (score === undefined) scores.set(key, (score = new Map()));
            const add = (id: string, by: number) => score!.set(id, (score!.get(id) ?? 0) + by);
            const around = sentence.replace(named(f.name, true), ' ');
            let anyone = false;
            for (const p of people) {
              if (f.owner !== null && p.names.some((n) => dartToLowerCase(n) === dartToLowerCase(f.owner!))) {
                add(p.id, ownerWeights.named);
                anyone = true;
              } else if (namedIn(around, p.id)) {
                add(p.id, ownerWeights.sentence);
                anyone = true;
              }
            }
            if (!anyone) {
              const whole = paragraph.replace(named(f.name, true), ' ');
              for (const p of people) {
                if (namedIn(whole, p.id)) {
                  add(p.id, ownerWeights.paragraph);
                  anyone = true;
                }
              }
            }
            const who = anyone ? null : (eyes.get(chapter.id) ?? null);
            if (who !== null) add(who, ownerWeights.eyes);
          }
          // A step only when the level changes: saying it again is not a step.
          if (last !== null && last.level === lvl) continue;
          list.push({
            chapter: c + 1,
            nodeId: chapter.id,
            block: b,
            level: lvl,
            sentence: sentence.split(stop).join('.'),
            up: f.level === null,
            backwards: last !== null && lvl < last.level && !fell.test(sentence),
          });
        }
      }
    });
  });
  const keys = [...steps].filter(([, v]) => v.length > 0).map(([k]) => k);
  const heads = new Map<string, number>();
  for (const k of keys) {
    const n = names.get(k)!;
    if (n.includes(' ')) {
      const h = dartToLowerCase(head(n));
      heads.set(h, (heads.get(h) ?? 0) + 1);
    }
  }
  const whose = (key: string): { owner: string | null; self: boolean } => {
    // A character's own level: the name is theirs.
    const self = people.find((p) => p.names.some((n) => dartToLowerCase(n) === key)) ?? null;
    // The author's word first.
    const id = assigned.get(key);
    if (id !== undefined) return { owner: id.length === 0 ? null : id, self: self !== null && self.id === id };
    if (self !== null) return { owner: self.id, self: true };
    const ranked = dartSort([...(scores.get(key) ?? new Map<string, number>())], (a, b) => b[1] - a[1]);
    const top = ranked[0];
    if (top === undefined) return { owner: null, self: false };
    const second = ranked.length > 1 ? ranked[1][1] : 0;
    return top[1] * 2 >= second * 3 && top[1] > second ? { owner: top[0], self: false } : { owner: null, self: false };
  };
  return keys.map((k) => {
    const n = names.get(k)!;
    const w = whose(k);
    return {
      name: n,
      family: (heads.get(dartToLowerCase(head(n))) ?? 0) >= 2 ? head(n) : '',
      steps: steps.get(k)!,
      mentions: mentions.get(k) ?? 0,
      owner: w.owner,
      self: w.self,
    };
  });
}

/** `levelsInPages` over the chapters as stored (JSON text, as the store reads them), in reading order `order`, among
 * `people`, with `assigned`. A job to run away from the screen. */
export function levelsInPagesJob(
  storedContents: readonly string[],
  order: readonly string[],
  setAside: ReadonlySet<string>,
  options: { people?: readonly EyesPerson[]; assigned?: ReadonlyMap<string, string> } = {},
): () => Levelled[] {
  return () => {
    const pages = storedPages(storedContents, new Set(order), paragraphsOf);
    return levelsInPages(
      order.map((id) => ({ id, paragraphs: pages.get(id) ?? [] })),
      { setAside, people: options.people, assigned: options.assigned },
    );
  };
}
