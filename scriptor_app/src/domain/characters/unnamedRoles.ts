// WAITING FOR A NAME: the people a book's pages keep coming back to without naming them ("the waitress", "the old
// innkeeper", "the captain"), each a character in all but name. Read where the page says "the" (or "a", "an") and a
// word that is someone's place in the world, with up to two words before it ("the old guard", "the one-eyed captain");
// counted by that word, in every chapter.
//
// Nobody too general to be anyone ("the man", "the boy"), and not one the cast already is (their title, an alias, or
// what they do). A port of flutter_app/lib/shared/domain/characters/unnamed_roles.dart. Reads only.

import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { allMatches, paragraphsOf, sentencePattern, storedPages } from './pageText';

/** Someone unnamed: the word for who they are, as the page puts it most ("the waitress"), how often and in how many
 * chapters, and the first place (the chapter's place from 1, its id, the paragraph, the sentence). */
export type UnnamedRole = {
  role: string;
  phrase: string;
  times: number;
  chapters: number;
  chapter: number;
  nodeId: string;
  block: number;
  said: string;
};

/** The fewest times someone is mentioned before they are offered a name. */
export const unnamedAtLeast = 2;

/** Words that are someone's place in the world. */
export const roleWords: ReadonlySet<string> = new Set([
  'waitress', 'waiter', 'barmaid', 'bartender', 'barkeep', 'innkeeper', 'landlord', 'landlady', 'cook', 'chef',
  'maid', 'servant', 'butler', 'steward', 'squire', 'herald', 'messenger', 'courier', 'clerk', 'scribe',
  'guard', 'guardsman', 'sentry', 'watchman', 'soldier', 'sergeant', 'captain', 'lieutenant', 'commander',
  'general', 'knight', 'mercenary', 'sellsword', 'archer', 'warrior', 'champion', 'king', 'queen', 'prince',
  'princess', 'duke', 'duchess', 'lord', 'lady', 'baron', 'baroness', 'countess', 'emperor', 'empress',
  'priest', 'priestess', 'monk', 'nun', 'abbot', 'bishop', 'cleric', 'healer', 'physician', 'doctor', 'nurse',
  'apothecary', 'alchemist', 'mage', 'wizard', 'witch', 'sorcerer', 'sorceress', 'necromancer', 'seer', 'oracle',
  'merchant', 'trader', 'shopkeeper', 'vendor', 'peddler', 'smith', 'blacksmith', 'carpenter', 'tailor',
  'farmer', 'shepherd', 'hunter', 'fisherman', 'ferryman', 'boatman', 'sailor', 'pirate', 'smuggler', 'thief',
  'bandit', 'assassin', 'spy', 'beggar', 'stranger', 'traveller', 'traveler', 'pilgrim', 'bard', 'minstrel',
  'driver', 'coachman', 'teacher', 'professor', 'student', 'detective', 'inspector', 'officer', 'constable',
  'sheriff', 'judge', 'magistrate', 'mayor', 'governor', 'ambassador', 'envoy', 'boss', 'employer', 'master',
  'mistress', 'receptionist', 'secretary', 'janitor', 'librarian', 'archivist', 'cartographer', 'navigator',
  'pilot', 'engineer', 'mechanic', 'scientist', 'agent', 'dealer', 'broker', 'banker', 'executioner', 'jailer',
  'warden', 'gatekeeper', 'porter', 'stablehand', 'stableboy', 'midwife', 'widow', 'hermit', 'elder',
  'chieftain', 'shaman', 'druid', 'paladin', 'ranger', 'rogue', 'adventurer', 'guildmaster',
]);

// "the", and the three words after it ("the one-eyed old captain"), the first of them that is someone taken.
const the = /\b(?:the|a|an)\s+([a-z’'\-]+(?:\s+[a-z’'\-]+){0,2})/gi;

function around(text: string, at: number): string {
  for (const m of allMatches(sentencePattern, text)) {
    if (m.start <= at && at < m.end) return dartTrim(m.text);
  }
  return dartTrim(text);
}

/** The unnamed people of `chapters` (in reading order, each its id and paragraphs), not those whose role is in `taken`
 * (the cast's titles, aliases and occupations, in lower case) or `setAside`; the most mentioned first. */
export function unnamedRoles(
  chapters: readonly { id: string; paragraphs: readonly string[] }[],
  options: { taken?: ReadonlySet<string>; setAside?: ReadonlySet<string> } = {},
): UnnamedRole[] {
  const skip = new Set<string>();
  for (const t of new Set([...(options.taken ?? []), ...(options.setAside ?? [])])) {
    skip.add(dartToLowerCase(dartTrim(t)).replace(/^(the|a|an)\s+/, ''));
  }
  const counts = new Map<string, number>();
  const inChapters = new Map<string, Set<number>>();
  const phrases = new Map<string, Map<string, number>>();
  const first = new Map<string, { chapter: number; nodeId: string; block: number; said: string }>();
  chapters.forEach((chapter, c) => {
    chapter.paragraphs.forEach((text, b) => {
      for (const m of allMatches(the, text)) {
        const group = m.groups[0]!;
        // "the guard's" is the guard; "the guards" is not someone.
        const after = dartToLowerCase(group)
          .split(/\s+/)
          .map((w) => w.replace(/[’']s$/, ''));
        const i = after.findIndex((w) => roleWords.has(w));
        if (i < 0) continue;
        // "a Warden", written with a capital, is a title the page treats as a name (the names in the manuscript
        // offer it); only the plain word is someone waiting for one.
        const written = group.split(/\s+/)[i];
        if (written[0] !== dartToLowerCase(written[0])) continue;
        const role = after[i];
        if (skip.has(role)) continue;
        const words = after.slice(0, i + 1).join(' ');
        if (skip.has(words)) continue;
        counts.set(role, (counts.get(role) ?? 0) + 1);
        let where = inChapters.get(role);
        if (where === undefined) inChapters.set(role, (where = new Set()));
        where.add(c);
        const said = `the ${words}`;
        let saidAs = phrases.get(role);
        if (saidAs === undefined) phrases.set(role, (saidAs = new Map()));
        saidAs.set(said, (saidAs.get(said) ?? 0) + 1);
        if (!first.has(role)) first.set(role, { chapter: c + 1, nodeId: chapter.id, block: b, said: around(text, m.start) });
      }
    });
  });
  const out: UnnamedRole[] = [];
  for (const [role, n] of counts) {
    if (n < unnamedAtLeast) continue;
    // As the page puts it most; the plainest between equals.
    const said = dartSort([...phrases.get(role)!.entries()], (a, b) =>
      b[1] !== a[1] ? b[1] - a[1] : a[0].length - b[0].length,
    );
    const at = first.get(role)!;
    out.push({
      role,
      phrase: said[0][0],
      times: n,
      chapters: inChapters.get(role)!.size,
      chapter: at.chapter,
      nodeId: at.nodeId,
      block: at.block,
      said: at.said,
    });
  }
  return dartSort(out, (a, b) => (b.times !== a.times ? b.times - a.times : a.chapter - b.chapter));
}

/** unnamedRoles over the chapters as stored (each record as JSON text, CharacterService.storedChapters), in reading
 * order `order`, as a job to run away from the screen. */
export function unnamedRolesJob(
  storedContents: readonly string[],
  order: readonly string[],
  options: { taken?: ReadonlySet<string>; setAside?: ReadonlySet<string> } = {},
): () => UnnamedRole[] {
  return () => {
    const pages = storedPages(storedContents, new Set(order), paragraphsOf);
    return unnamedRoles(
      order.map((id) => ({ id, paragraphs: pages.get(id) ?? [] })),
      options,
    );
  };
}
