// MADE FOR YOUR STORY: which genre modules a novel's own words call for. A port of
// flutter_app/lib/shared/domain/modules/module_match.dart. Each text is read once into its words; a word is then a
// look-up, so the time grows with the length of the book once (a long book matched word by word froze the Flutter app).

import { isMap } from '../json';
import { dartSort } from '../manuscript/dartSort';
import { blockTexts } from '../prose';
import { foldText } from '../text/fold';

/** The words that say a story is of a module's kind, by module id: a plain list, matched as whole words in the
 * novel's genres, tags, summary and chapters. Nothing is guessed about meaning; a word is there or it is not. */
export const moduleWords: ReadonlyMap<string, readonly string[]> = new Map([
  ['high-fantasy', ['fantasy', 'magic', 'mage', 'wizard', 'sorcerer', 'dragon', 'elf', 'elves', 'dwarf', 'spell', 'kingdom', 'sword']],
  [
    'progression',
    ['litrpg', 'progression', 'cultivation', 'level', 'levels', 'skill', 'skills', 'rank', 'ranks', 'stats', 'experience', 'evolution', 'class', 'dungeon', 'system'],
  ],
  [
    'scifi',
    ['science fiction', 'sci-fi', 'scifi', 'space', 'starship', 'spaceship', 'planet', 'galaxy', 'alien', 'android', 'robot', 'cyberpunk'],
  ],
  ['mystery', ['mystery', 'detective', 'murder', 'clue', 'clues', 'suspect', 'investigation', 'crime', 'thriller']],
  ['romance', ['romance', 'love', 'lover', 'kiss', 'wedding', 'heart', 'romantic']],
  ['horror', ['horror', 'ghost', 'monster', 'haunted', 'demon', 'curse', 'nightmare', 'blood', 'vampire', 'vampirism']],
  ['superhero', ['superhero', 'superpower', 'superpowers', 'powers', 'hero', 'villain', 'mutant', 'vigilante']],
  ['historical', ['historical', 'history', 'century', 'war', 'empire', 'medieval', 'victorian', 'ancient']],
  ['contemporary', ['contemporary', 'family', 'school', 'college', 'friendship', 'coming of age', 'slice of life']],
  ['politics', ['politics', 'political', 'court', 'throne', 'faction', 'factions', 'council', 'senate', 'intrigue', 'king', 'queen']],
]);

/** A module the story seems to call for: which, and the words found that say so (at most four, most found first). */
export type ModuleFit = { moduleId: string; words: string[]; score: number };

/** A run of letters and digits: a word, as the matching counts words. */
const wordRun = /[\p{L}\p{N}]+/gu;
const wordRunAt = /^[\p{L}\p{N}]+/u;
const letterOrDigit = /^[\p{L}\p{N}]$/u;

/** One text made ready to ask about words: the words it holds, read once, and the text itself for the few phrases
 * with a space or a hyphen in them ("science fiction", "sci-fi"). */
class Words {
  private readonly text: string;
  private readonly words = new Set<string>();

  constructor(text: string) {
    this.text = foldText(text);
    for (const m of this.text.matchAll(wordRun)) this.words.add(m[0]);
  }

  /** Whether `word` (lower case) is in the text as a whole word: not inside a longer word. */
  has(word: string): boolean {
    const whole = wordRunAt.exec(word);
    if (whole !== null && whole[0].length === word.length) return this.words.has(word);
    // Counted: each turn moves on by at least one code unit, so it stops by the end of the text.
    for (let at = this.text.indexOf(word), turns = 0; at >= 0 && turns <= this.text.length; at = this.text.indexOf(word, at + 1), turns++) {
      if (!this.wordCharBefore(at) && !this.wordCharAt(at + word.length)) return true;
    }
    return false;
  }

  private wordCharBefore(i: number): boolean {
    if (i <= 0) return false;
    const low = this.text.charCodeAt(i - 1);
    // A character outside the first plane is two code units: read it whole.
    const start = (low & 0xfc00) === 0xdc00 && i >= 2 && (this.text.charCodeAt(i - 2) & 0xfc00) === 0xd800 ? i - 2 : i - 1;
    return letterOrDigit.test(this.text.substring(start, i));
  }

  private wordCharAt(i: number): boolean {
    if (i >= this.text.length) return false;
    const high = this.text.charCodeAt(i);
    const end = (high & 0xfc00) === 0xd800 && i + 1 < this.text.length ? i + 2 : i + 1;
    return letterOrDigit.test(this.text.substring(i, end));
  }
}

/** The modules whose words the story uses, best first, those already on left out, at most `limit`. A word in the
 * genres or tags counts five times, in the summary twice, in the chapters once per chapter it is in (so one word
 * repeated in one chapter does not decide). A module needs a score of at least 2. */
export function fittingModules(args: {
  genres: readonly string[];
  tags: readonly string[];
  synopsis: string;
  chapters: readonly string[];
  on?: ReadonlySet<string>;
  limit?: number;
}): ModuleFit[] {
  const on = args.on ?? new Set<string>();
  const limit = args.limit ?? 2;
  const label = new Words([...args.genres, ...args.tags].join(' · '));
  const summary = new Words(args.synopsis);
  const texts = args.chapters.map((c) => new Words(c));

  const fits: ModuleFit[] = [];
  for (const [id, words] of moduleWords) {
    if (on.has(id)) continue;
    const found = new Map<string, number>();
    for (const w of words) {
      let s = 0;
      if (label.has(w)) s += 5;
      if (summary.has(w)) s += 2;
      for (const t of texts) if (t.has(w)) s += 1;
      if (s > 0) found.set(w, s);
    }
    let score = 0;
    for (const v of found.values()) score += v;
    if (score < 2) continue;
    const ranked = dartSort([...found.keys()], (a, b) => found.get(b)! - found.get(a)!);
    // One form of a word: "skills" said, "skill" left out.
    const said: string[] = [];
    for (const w of ranked) {
      if (said.some((s) => s === `${w}s` || w === `${s}s`)) continue;
      said.push(w);
    }
    fits.push({ moduleId: id, words: said.slice(0, 4), score });
  }
  dartSort(fits, (a, b) => b.score - a.score);
  return fits.slice(0, limit);
}

/** fittingModules from the chapters as stored (`storedContents`: each chapter's record as JSON text). A record that
 * cannot be read counts as an empty chapter. */
export function fittingModulesFromStored(args: {
  genres: readonly string[];
  tags: readonly string[];
  synopsis: string;
  storedContents: readonly string[];
  on?: ReadonlySet<string>;
}): ModuleFit[] {
  const chapters: string[] = [];
  for (const json of args.storedContents) {
    try {
      const row: unknown = JSON.parse(json);
      chapters.push(isMap(row) ? blockTexts(row['doc']).join('\n') : '');
    } catch {
      chapters.push('');
    }
  }
  return fittingModules({ genres: args.genres, tags: args.tags, synopsis: args.synopsis, chapters, on: args.on });
}

/** The job fittingModulesFromStored as a function holding only plain data, to run away from the screen. */
export function modulesSuggestionJob(args: {
  genres: readonly string[];
  tags: readonly string[];
  synopsis: string;
  storedContents: readonly string[];
  on: ReadonlySet<string>;
}): () => ModuleFit[] {
  return () => fittingModulesFromStored(args);
}
