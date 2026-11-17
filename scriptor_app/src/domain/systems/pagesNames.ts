// IN YOUR PAGES, NOT IN THE SYSTEM: the skills, titles, classes and items a progression story's chapters name the
// system's way, that its blueprint does not hold yet. A system begun from the pages is in step with them on the day it
// begins; every skill written after that had to be added by hand. Read here:
//
// - the system's messages: "[Skill acquired: Tide Sense (E)]", "Title earned: Giant Slayer", "Class unlocked:
//   Warden", "Item obtained: Tide Glass" (the word before says which kind; a short word in brackets after is its rank);
// - "New skill: Spark", "Skill: Spark";
// - and a name in the system's brackets alone, "[Power Strike]", "【Tide Sense】": a skill, unless named otherwise.
//
// Not the system's own words ("[Status]", "[Level up!]", "[Warning]"), nothing that ends as a cry or a question, and
// nothing of more than five words. Reads only. A port of flutter_app/lib/shared/domain/systems/pages_names.dart.

import { allMatches, paragraphsOf, storedPages } from '../characters/pageText';
import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** What kind of thing the pages name. (Dart's `PageThing`; `kit` is a class.) */
export type PageThing = 'skill' | 'title' | 'kit' | 'item';
export const pageThings: readonly PageThing[] = ['skill', 'title', 'kit', 'item'];
export const pageThingLabel: Readonly<Record<PageThing, string>> = {
  skill: 'Skill',
  title: 'Title',
  kit: 'Class',
  item: 'Item',
};

/** A name the pages give: as written, its kind, its rank (when one is written), how often, and the first place (the
 * chapter's place from 1, its id, the paragraph, the sentence). */
export type PageName = {
  name: string;
  thing: PageThing;
  rank: string;
  times: number;
  chapter: number;
  nodeId: string;
  block: number;
  said: string;
};

const kinds: Readonly<Record<string, PageThing>> = {
  skill: 'skill',
  spell: 'skill',
  technique: 'skill',
  ability: 'skill',
  power: 'skill',
  title: 'title',
  class: 'kit',
  item: 'item',
};

const message = new RegExp(
  String.raw`\b(skill|spell|technique|ability|power|title|class|item)s?\s+` +
    String.raw`(?:acquired|learned|learnt|gained|unlocked|earned|obtained|received|granted|chosen|awarded)\s*:\s*` +
    String.raw`([^\]】>\n(:.!?]{2,40}?)\s*(?:\(([^)\n]{1,12})\))?\s*(?=[\]】>\n.!?]|$)`,
  'gi',
);
const labelled =
  /\b(?:new\s+)?(skill|spell|technique|title|class|item)\s*:\s*([A-Z][^\]】>\n(:.!?]{1,40}?)\s*(?:\(([^)\n]{1,12})\))?\s*(?=[\]】>\n.!?,;]|$)/gi;
const bare = /[\[【]([A-Z][\p{L}'’ \-]{2,40})[\]】]/gu;

/** The system's own words, in its brackets. */
const systemWords: ReadonlySet<string> = new Set([
  'status', 'system', 'level up', 'warning', 'notice', 'alert', 'error', 'quest', 'new quest', 'quest complete', //
  'quest failed', 'achievement', 'congratulations', 'notification', 'inventory', 'skills', 'titles', 'stats',
]);

const stopThenSpace = /[.!?…]\s/y;
const stopThenEnd = /[.!?…](\s|$)/g;

/** Dart's `text.lastIndexOf(RegExp(r'[.!?…]\s'), at)`: the last place at or before `at` where it matches. */
function lastStop(text: string, at: number): number {
  for (let i = Math.min(at, text.length); i >= 0; i--) {
    stopThenSpace.lastIndex = i;
    if (stopThenSpace.test(text)) return i;
  }
  return -1;
}

/** Dart's `text.indexOf(RegExp(r'[.!?…](\s|$)'), at)`: the first match starting at or after `at`. */
function nextStop(text: string, at: number): number {
  stopThenEnd.lastIndex = at;
  const m = stopThenEnd.exec(text);
  return m === null ? -1 : m.index;
}

/** The sentence of `text` around `at`. */
function around(text: string, at: number): string {
  const start = lastStop(text, at);
  const end = nextStop(text, at);
  return dartTrim(text.substring(start < 0 ? 0 : start + 1, end < 0 ? text.length : end + 1));
}

/** The names `chapters` (in reading order, each its id and paragraphs) give the system's way that are not in `known`
 * (names the blueprint holds, any case) nor `setAside`; the most named first. */
export function namesInPages(
  chapters: readonly { id: string; paragraphs: readonly string[] }[],
  options: { known?: Iterable<string>; setAside?: Iterable<string> } = {},
): PageName[] {
  const skip = new Set<string>();
  for (const k of new Set([...(options.known ?? []), ...(options.setAside ?? [])])) skip.add(dartToLowerCase(dartTrim(k)));
  const found = new Map<string, PageName>();
  const add = (raw: string, thing: PageThing, rank: string, c: number, id: string, b: number, text: string, at: number, sure = true) => {
    const nameIs = dartTrim(raw).replace(/\s+/g, ' ');
    const key = dartToLowerCase(nameIs);
    if (nameIs.length < 3 || skip.has(key) || systemWords.has(key)) return;
    if (nameIs.split(' ').length > 5) return;
    const was = found.get(key);
    if (was === undefined) {
      found.set(key, {
        name: nameIs,
        thing,
        rank: dartTrim(rank),
        times: 1,
        chapter: c + 1,
        nodeId: id,
        block: b,
        said: around(text, at),
      });
    } else {
      found.set(key, {
        name: was.name,
        // What a message says it is wins over a name in brackets alone.
        thing: sure ? thing : was.thing,
        rank: was.rank.length === 0 ? dartTrim(rank) : was.rank,
        times: was.times + 1,
        chapter: was.chapter,
        nodeId: was.nodeId,
        block: was.block,
        said: was.said,
      });
    }
  };

  chapters.forEach((chapter, c) => {
    chapter.paragraphs.forEach((text, b) => {
      const taken: [number, number][] = [];
      for (const re of [message, labelled]) {
        for (const m of allMatches(re, text)) {
          if (taken.some(([start, end]) => m.start < end && m.end > start)) continue;
          taken.push([m.start, m.end]);
          add(m.groups[1]!, kinds[dartToLowerCase(m.groups[0]!)] ?? 'skill', m.groups[2] ?? '', c, chapter.id, b, text, m.start);
        }
      }
      for (const m of allMatches(bare, text)) {
        if (taken.some(([start, end]) => m.start < end && m.end > start)) continue;
        add(m.groups[0]!, 'skill', '', c, chapter.id, b, text, m.start, false);
      }
    });
  });
  return dartSort([...found.values()], (a, b) => (b.times !== a.times ? b.times - a.times : a.chapter - b.chapter));
}

/** `namesInPages` over the chapters as stored (JSON text, as the store reads them), in reading order `order`, as a job
 * to run away from the screen. */
export function namesInPagesJob(
  storedContents: readonly string[],
  order: readonly string[],
  options: { known?: Iterable<string>; setAside?: Iterable<string> } = {},
): () => PageName[] {
  return () => {
    const pages = storedPages(storedContents, new Set(order), paragraphsOf);
    return namesInPages(
      order.map((id) => ({ id, paragraphs: pages.get(id) ?? [] })),
      options,
    );
  };
}
