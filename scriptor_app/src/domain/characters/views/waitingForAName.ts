// WAITING FOR A NAME, on Characters (unnamedRoles.ts finds them): the people the pages keep coming back to without a
// name ("the waitress", "the old guard"), each with how often and where, and the sentence. **Name them** opens the name
// forge; **Write a name** asks for one. Either makes them a character: that name, "the waitress" as their title and an
// alias (so every mention in the pages is theirs), and what they do as their Occupation. **Not a character** sets the
// role aside on this device. With nobody unnamed, nothing is shown.
//
// The pure parts of flutter_app/lib/features/characters/widgets/waiting_for_a_name.dart: what to read
// (`waitingInputs`, then unnamedRolesJob(service.storedChapters(novelId), order, { taken, setAside })), the cards, and
// what a name given makes.
//
// A card: 14/12/10/6 padding, the low surface, radius 14, an outline; a circle of 34 ringed 1.5 in the accent with a
// "?" (17, bold, the accent); the phrase (15, bold) and where (14); the sentence in quotes, italic, at most two lines.

import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { readingOrder } from '../../model/storyOrder';
import { isDocument } from '../../outline';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { fieldNamed } from '../cast';
import { type CastData } from '../castData';
import { type CharacterChanges } from '../characterChanges';
import { recordIn } from '../recordLook';
import { type Entry } from '../../records/entry';
import { type UnnamedRole, roleWords } from '../unnamedRoles';
import { storedStrings } from './common';

/** Where the roles set aside ("Not a character") are kept, for a novel: on this device. */
export const unnamedAsideKey = (novelId: string): string => `characters.unnamedAside.${novelId}`;

/** How many cards are shown. */
export const waitingShown = 5;

const capital = (s: string) => `${dartToUpperCase(s[0])}${s.substring(1)}`;

/** The names a role is called by on the page, so a character given it is found where the page names them so. */
export function roleAliases(phrase: string): string[] {
  const p = dartTrim(phrase);
  if (p.length === 0) return [];
  return [...new Set([p, capital(p)])];
}

/** What the reading is made of: the chapters and scenes in reading order, who the cast already is (their titles,
 * aliases and what they do, in lower case, and the role words their summary or title holds), the roles set aside
 * (`stored`: what is under unnamedAsideKey), and the key it is kept by (with the store's count of writes to the text:
 * NovelStore.versionOf(novelId, ['chapterContents']), given as `textVersion`). */
export function waitingInputs(
  cast: CastData,
  stored: unknown,
  textVersion: number,
): { order: string[]; taken: Set<string>; setAside: Set<string>; key: string } {
  const order = readingOrder(cast.model.nodes.values())
    .filter((n) => isDocument(n.kind))
    .map((n) => n.id);
  const said = new Set<string>();
  for (const l of cast.list) {
    for (const t of [
      l.profile.epithet,
      ...l.profile.aliases,
      fieldNamed(l.entry, 'Occupation'),
      fieldNamed(l.entry, 'Job'),
      fieldNamed(l.entry, 'Profession'),
    ]) {
      said.add(t);
    }
  }
  const taken = new Set([...said].filter((t) => dartTrim(t).length > 0).map((t) => dartToLowerCase(dartTrim(t))));
  // And what a summary says they are ("Apprentice cartographer"): they are the one.
  for (const l of cast.list) {
    for (const w of dartToLowerCase(`${l.entry.summary} ${l.profile.epithet}`).match(/[a-z]+/g) ?? []) {
      if (roleWords.has(w)) taken.add(w);
    }
  }
  return { order, taken, setAside: new Set(storedStrings(stored)), key: `${order.join(',')}\u0000${[...taken].join('|')}\u0000${textVersion}` };
}

/** One card: the phrase (capitalised), how often and where, the sentence, and the three presses. */
export type WaitingCard = {
  role: UnnamedRole;
  title: string;
  where: string;
  said: string;
  nameThem: string;
  writeName: string;
  notOne: string;
};

/** The panel, or null with nobody waiting. `roles`: what was read (null while it is read); `done`: the roles named or
 * set aside since (by role). The count (of all, not only the five shown) is what the strip of notes says ('waiting'). */
export function waitingForAName(
  roles: readonly UnnamedRole[] | null,
  done: ReadonlySet<string>,
): { icon: string; heading: string; caption: string; cards: WaitingCard[]; count: number } | null {
  const left = (roles ?? []).filter((r) => !done.has(r.role));
  if (left.length === 0) return null;
  return {
    icon: 'person_search_outlined',
    heading: 'WAITING FOR A NAME',
    caption: 'People your pages keep coming back to, without a name yet.',
    cards: left.slice(0, waitingShown).map((r) => ({
      role: r,
      title: capital(r.phrase),
      where: `${r.times} times, ${r.chapters === 1 ? `in chapter ${r.chapter}` : `in ${r.chapters} chapters, from chapter ${r.chapter}`}`,
      said: `“${r.said}”`,
      nameThem: 'Name them',
      writeName: 'Write a name',
      notOne: 'Not a character',
    })),
    count: left.length,
  };
}

/** **Write a name**: the prompt it asks with. */
export function writeNamePrompt(role: UnnamedRole): { title: string; label: string; confirmLabel: string } {
  return { title: `Who is ${role.phrase}?`, label: 'Their name', confirmLabel: 'Add to the cast' };
}

/** **Name them**: who the name forge is told of (everyone's names, so it does not offer one already taken). */
export function forgePeople(cast: CastData): string[] {
  return cast.entries.map((e) => e.name);
}

/** Whether a name given (by the forge or the prompt) makes them a character: one with words in it. */
export function nameGiven(name: string | null): name is string {
  return name !== null && dartTrim(name).length > 0;
}

/** A name given: makes them a character (inside CharacterService.change): that name, the phrase as their title, its
 * aliases, what they do as their Occupation. Then the role is done, and the toast: "Mira is the waitress now: all 3
 * mentions are theirs." with **Open** to them. */
export function nameRole(c: CharacterChanges, role: UnnamedRole, name: string): { made: Entry; tell: string; action: string } {
  const e = c.create({ name: dartTrim(name), epithet: role.phrase });
  c.identity(e.id, { aliases: roleAliases(role.phrase) });
  recordIn(c, e.id, 'Occupation', ['occupation', 'job', 'profession', 'trade'], capital(role.role), {
    sections: ['identity', 'position'],
    newSection: 'Core Identity',
  });
  return {
    made: e,
    tell: `${dartTrim(name)} is ${role.phrase} now: ${role.times === 1 ? 'the mention is' : `all ${role.times} mentions are`} theirs.`,
    action: 'Open',
  };
}

/** What to store under unnamedAsideKey when `role` is set aside ("Not a character"). */
export function unnamedAsideAfter(stored: unknown, role: UnnamedRole): string[] {
  return [...new Set(storedStrings(stored)), role.role];
}
