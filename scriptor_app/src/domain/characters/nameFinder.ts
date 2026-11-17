// NAMES IN THE MANUSCRIPT: who the author has been writing about but has not added to the cast, found by a plain rule
// (no model, nothing sent anywhere, the text never changed): a name is a capitalised word that recurs in the middle of
// sentences (where capitals are not just the start of a sentence), is not already the name or alias of a character or
// an entry, is not a common word ("I", days, months, titles), and is not more often written in lower case (so "Rose"
// the name, not "rose" the flower). The author decides; nothing is added until they press. A port of
// flutter_app/lib/shared/domain/characters/name_finder.dart.

import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrimRight } from '../text/dartString';
import { allMatches } from './pageText';

/** A recurring name: how often it is written, in how many chapters, and the first chapter it is in. */
export type ManuscriptName = { name: string; times: number; chapters: number; first: number };

/** Words capitalised for reasons other than being someone's name. */
const common = new Set([
  'i', 'im', 'ill', 'ive', 'id', 'mr', 'mrs', 'ms', 'dr', 'sir', 'madam', 'lady', 'lord', 'miss', 'master', 'monday',
  'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may',
  'june', 'july', 'august', 'september', 'october', 'november', 'december', 'god', 'oh', 'ok', 'okay', 'yes', 'no',
  'the', 'a', 'an', 'and', 'but', 'or', 'he', 'she', 'it', 'they', 'we', 'you', 'his', 'her', 'their', 'chapter',
  'part', 'book', 'volume', 'mom', 'mum', 'dad', 'english',
]);

const word = /\p{L}[\p{L}'’]*/gu;
const upper = /^\p{Lu}/u;
const lower = /\p{Ll}/u;

/** What ends a sentence or opens speech: a capital after one is not evidence of a name. */
const boundary = /[.!?…:;"“”'‘’—–(\[]$/;

const plain = (w: string) => dartToLowerCase(w.replace(/['’]s$/, '').replace(/['’]/g, ''));

/** Dart's String.compareTo: by UTF-16 code units. */
const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The recurring names in `chapters` (each its number in reading order and its paragraphs), most written first, at
 * most `limit` (12). `known` are words already taken (every word of every name and alias in the novel, any case);
 * `setAside` are names the author said are not characters. */
export function manuscriptNames(
  chapters: Iterable<readonly [number, readonly string[]]>,
  options: { known?: ReadonlySet<string>; setAside?: ReadonlySet<string>; limit?: number } = {},
): ManuscriptName[] {
  const known = options.known ?? new Set<string>();
  const setAside = options.setAside ?? new Set<string>();
  const limit = options.limit ?? 12;
  const spelled = new Map<string, string>();
  const times = new Map<string, number>();
  const midSentence = new Map<string, number>();
  const lowerCase = new Map<string, number>();
  const inChapters = new Map<string, Set<number>>();
  for (const [number, blocks] of chapters) {
    for (const block of blocks) {
      for (const m of allMatches(word, block)) {
        const raw = m.text;
        const key = plain(raw);
        if (key.length < 2) continue;
        const capital = upper.test(raw) && lower.test(raw);
        if (!capital) {
          if (!upper.test(raw)) lowerCase.set(key, (lowerCase.get(key) ?? 0) + 1);
          continue;
        }
        if (!spelled.has(key)) spelled.set(key, raw.replace(/['’]s$/, ''));
        times.set(key, (times.get(key) ?? 0) + 1);
        let where = inChapters.get(key);
        if (where === undefined) inChapters.set(key, (where = new Set()));
        where.add(number);
        const before = dartTrimRight(block.substring(0, m.start));
        if (before.length > 0 && !boundary.test(before)) midSentence.set(key, (midSentence.get(key) ?? 0) + 1);
      }
    }
  }
  const found: ManuscriptName[] = [];
  for (const key of times.keys()) {
    const mid = midSentence.get(key) ?? 0;
    if (mid >= 2 && !common.has(key) && !known.has(key) && !setAside.has(key) && (lowerCase.get(key) ?? 0) < mid) {
      const where = [...inChapters.get(key)!];
      found.push({
        name: spelled.get(key)!,
        times: times.get(key)!,
        chapters: where.length,
        first: where.reduce((a, b) => (a < b ? a : b)),
      });
    }
  }
  dartSort(found, (a, b) => (b.times !== a.times ? b.times - a.times : byCodeUnits(a.name, b.name)));
  return found.slice(0, limit);
}

/** Every word of `names`, in the finder's plain form, for manuscriptNames' `known`. */
export function knownWords(names: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const n of names) for (const m of allMatches(word, n)) out.add(plain(m.text));
  return out;
}

/** A name in the finder's plain form, for remembering one set aside. */
export function plainName(name: string): string {
  return plain(name);
}
