// FOUND IN YOUR PAGES (the world): the places, groups, powers and things the manuscript names that the world does not
// hold yet, found by what the words themselves say, never guessed:
//
// - a run of capitalised words whose last word says what it is: a place ("Mimir Forest", "Lantern Street",
//   "Glass River"; or begun with Mount, Lake, Isle, Port, Fort, Cape: "Mount Ash"), a group ("the Salt Guild",
//   "House Vane", "Order of the Rose"), a thing ("the Brass Compass", "Sword of Dawn");
// - a run of capitalised words followed by a word that says it is a power ("the Smart Atoms skill", "a Fireball
//   spell", "his Empathic Mimicry ability").
//
// "of" and "the" may join the words of a name ("Isle of Skye", "Order of the Rose"); a leading "The" is not part of
// it. A name of one word alone ("Forest") names nothing in particular and is left out, unless it is called a power.
// A port of flutter_app/lib/shared/domain/codex/world_finder.dart.

import { dartToLowerCase, dartTrim, dartTrimRight } from '../text/dartString';

/** A name found, the kind of entry it reads as (a category key), why, how often, in how many chapters, and the first. */
export type WorldFind = { name: string; kind: string; why: string; times: number; chapters: number; first: number };

const places = new Set([
  'forest', 'woods', 'wood', 'city', 'town', 'village', 'hamlet', 'river', 'lake', 'sea', 'ocean', 'bay', 'harbour',
  'harbor', 'port', 'mountain', 'mountains', 'hill', 'hills', 'valley', 'vale', 'plain', 'plains', 'desert', 'island',
  'islands', 'isle', 'kingdom', 'empire', 'realm', 'republic', 'duchy', 'province', 'region', 'district', 'quarter',
  'street', 'road', 'lane', 'avenue', 'square', 'bridge', 'gate', 'gates', 'tower', 'castle', 'keep', 'fort',
  'fortress', 'citadel', 'palace', 'temple', 'cathedral', 'abbey', 'monastery', 'shrine', 'inn', 'tavern', 'cave',
  'caves', 'cavern', 'caverns', 'marsh', 'swamp', 'fen', 'moor', 'coast', 'cliffs', 'peak', 'peaks', 'pass', 'falls',
  'springs', 'garden', 'gardens', 'park', 'hall', 'halls', 'lands', 'land', 'shire', 'reach', 'ford', 'crossing',
  'canyon', 'gorge', 'glacier', 'tundra', 'jungle', 'grove', 'meadow', 'field', 'fields', 'mine', 'mines', 'ruins',
  'wastes', 'wasteland', 'highlands', 'lowlands', 'station', 'base', 'colony', 'planet', 'moon', 'galaxy', 'sector',
]);
const placeFirst = new Set(['mount', 'lake', 'isle', 'port', 'fort', 'cape', 'castle', 'mt']);

const groups = new Set([
  'guild', 'order', 'company', 'council', 'clan', 'tribe', 'army', 'legion', 'brotherhood', 'sisterhood', 'circle',
  'church', 'cult', 'society', 'alliance', 'league', 'knights', 'academy', 'court', 'senate', 'syndicate', 'gang',
  'empire', 'federation', 'union', 'coalition', 'covenant', 'conclave', 'watch', 'guard', 'wardens', 'rangers',
  'family', 'dynasty', 'house', 'corporation', 'corps', 'collective', 'faction', 'party', 'band', 'crew',
]);
const groupFirst = new Set(['house', 'clan', 'order']);

const things = new Set([
  'sword', 'blade', 'dagger', 'axe', 'spear', 'bow', 'shield', 'armour', 'armor', 'helm', 'crown', 'ring', 'amulet',
  'pendant', 'necklace', 'staff', 'wand', 'orb', 'stone', 'gem', 'crystal', 'book', 'tome', 'grimoire', 'scroll',
  'map', 'compass', 'key', 'chalice', 'cup', 'grail', 'cloak', 'mask', 'mirror', 'lantern', 'bell', 'horn', 'chart',
  'codex', 'relic', 'idol', 'engine', 'device',
]);

const powers = new Set([
  'skill', 'skills', 'ability', 'abilities', 'spell', 'spells', 'power', 'powers', 'technique', 'techniques', 'magic',
  'curse', 'blessing', 'talent', 'rune', 'runes', 'incantation', 'ritual',
]);

/** Joining words inside a name. */
const joins = new Set(['of', 'de', 'du', 'von', 'van']);

/** What ends a sentence or opens speech: a capital after one is the sentence's. */
const boundary = /[.!?…:;"“”'‘’—–([]$/;

/** Words that point at something and name nothing. */
const determiners = new Set([
  'this', 'that', 'these', 'those', 'his', 'her', 'its', 'my', 'your', 'our', 'their', 'each', 'every', 'any', 'some',
  'no', 'one', 'another', 'such', 'which', 'what', 'whose', 'i', 'he', 'she', 'we', 'they', 'it',
]);

const wordPattern = /\p{L}[\p{L}'’-]*/gu;
const upper = /^\p{Lu}/u;
const lower = /\p{Ll}/u;
const possessiveEnd = /['’]s$/;

/** A name's form for comparing: lower case, without a leading "the", a possessive or apostrophes. */
export function worldKey(name: string): string {
  return dartToLowerCase(dartTrim(name))
    .replace(/^the\s+/, '')
    .replace(/['’]s\b/g, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ');
}

const isCapital = (w: string): boolean => upper.test(w) && (lower.test(w) || w.length > 1);

/** Only spaces between two words: a comma or a full stop ends a name. */
const gap = (text: string, from: number, to: number): boolean => dartTrim(text.substring(from, to)).length === 0;

/** The kind a run reads as, and why, from its last word, its first, or the word after it. */
function kindOf(run: readonly string[], next: string | null): [string, string] | null {
  const after = next === null ? null : dartToLowerCase(next);
  // Called a power, and not someone's ("the Provost's power" is not a power called Provost).
  const possessive = possessiveEnd.test(run[run.length - 1]);
  if (after !== null && !isCapital(next!) && powers.has(after) && !possessive) {
    return ['power', `called a ${after}`];
  }
  if (run.length < 2) return null;
  const head = dartToLowerCase(run[run.length - 1]).replace(/['’]s$/, '');
  const first = dartToLowerCase(run[0]);
  if (groupFirst.has(first) || groups.has(head)) return ['faction', 'reads as a group'];
  if (placeFirst.has(first) || places.has(head)) return ['location', 'reads as a place'];
  if (things.has(head)) return ['item', 'reads as a thing'];
  return null;
}

/** The names in `chapters` (each its number in reading order and its paragraphs) that read as a place, a group, a
 * power or a thing, most written first, at most `limit` (12). `known` are the world's names and aliases already (as
 * worldKey gives them); `setAside` are names the author said are not entries, in the same form. */
export function worldFinds(
  chapters: Iterable<readonly [number, readonly string[]]>,
  options: { known?: ReadonlySet<string>; setAside?: ReadonlySet<string>; limit?: number } = {},
): WorldFind[] {
  const known = options.known ?? new Set<string>();
  const setAside = options.setAside ?? new Set<string>();
  const limit = options.limit ?? 12;
  const spelled = new Map<string, string>();
  const kinds = new Map<string, [string, string]>();
  const times = new Map<string, number>();
  const inChapters = new Map<string, Set<number>>();
  for (const [number, blocks] of chapters) {
    for (const block of blocks) {
      const words = Array.from(block.matchAll(wordPattern), (m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
      let i = 0;
      while (i < words.length) {
        if (!isCapital(words[i].text)) {
          i++;
          continue;
        }
        // The run: capitalised words, joined by "of", "de"… (never ending on one), with nothing but spaces between.
        // "the" joins only after "of" ("Order of the Rose"): "Into the Mimir Forest" is not a name.
        let end = i;
        let j = i + 1;
        while (j < words.length && gap(block, words[j - 1].end, words[j].start)) {
          const w = words[j].text;
          if (isCapital(w)) {
            end = j;
          } else if (dartToLowerCase(w) === 'the' && dartToLowerCase(words[j - 1].text) === 'of') {
            // joined
          } else if (!joins.has(dartToLowerCase(w))) {
            break;
          }
          j++;
        }
        let from = i;
        // "The", "A", or a pointing word ("His Fireball spell", "This Glass River") is not part of the name.
        const lead = dartToLowerCase(words[from].text);
        if (from < end && (lead === 'the' || lead === 'a' || lead === 'an' || determiners.has(lead))) from++;
        const run: string[] = [];
        for (let k = from; k <= end; k++) run.push(words[k].text);
        const next =
          end + 1 < words.length && gap(block, words[end].end, words[end + 1].start) ? words[end + 1].text : null;
        i = end + 1;
        if (run.length === 0) continue;
        // A single word is a name only where its capital is not the sentence's ("This skill…", "His power…").
        if (run.length === 1) {
          const before = dartTrimRight(block.substring(0, words[from].start));
          if (before.length === 0 || boundary.test(before) || determiners.has(dartToLowerCase(run[0]))) continue;
        }
        const kind = kindOf(run, next);
        if (kind === null) continue;
        const name = block.substring(words[from].start, words[end].end).replace(/['’]s$/, '');
        const key = worldKey(name);
        if (key.length < 3 || known.has(key) || setAside.has(key)) continue;
        if (!spelled.has(key)) spelled.set(key, name);
        if (!kinds.has(key)) kinds.set(key, kind);
        times.set(key, (times.get(key) ?? 0) + 1);
        let seen = inChapters.get(key);
        if (seen === undefined) inChapters.set(key, (seen = new Set()));
        seen.add(number);
      }
    }
  }
  const found: WorldFind[] = [...times.keys()].map((key) => ({
    name: spelled.get(key)!,
    kind: kinds.get(key)![0],
    why: kinds.get(key)![1],
    times: times.get(key)!,
    chapters: inChapters.get(key)!.size,
    first: [...inChapters.get(key)!].reduce((a, b) => (a < b ? a : b)),
  }));
  found.sort((a, b) => (b.times !== a.times ? b.times - a.times : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return found.slice(0, limit);
}
