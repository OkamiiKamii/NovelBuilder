// IN THEIR HAND: a character's journal, the exercise writers use to find a voice: writing as them, in the first person,
// to a prompt. The prompts are made of what the book already holds about them (who they are tied to, what they want),
// and fall back to ones that fit anyone; each page the author writes is kept as one of the character's notes, tagged
// `journalTag`, with the prompt as its title, so it is there in their Notes too.
//
// Makes prompts and reads notes only; the notes are written through `CharacterChanges.saveNote`. A port of
// flutter_app/lib/shared/domain/characters/journal.dart.

import { dartSort } from '../manuscript/dartSort';
import { dartTrim } from '../text/dartString';
import { type CharacterNote } from './characterRecords';

/** The tag a journal page is kept under. */
export const journalTag = 'journal';

/** What a journal page's title begins with, before its prompt. */
export const journalTitlePrefix = 'Journal · ';

/** A prompt: an id (so the same one is not dealt twice in a row), and what it asks, written to the character. */
export type JournalPrompt = { id: string; ask: string };

/** Someone the character is tied to: their name, and what they are to them (may be empty). */
export type JournalOther = { name: string; tie: string };

/** The prompts for `name`, in the order they are dealt: those made of what is known of them first (a tie, `others` by
 * name, each with what they are to them; what they `wants`), then those that fit anyone. */
export function journalPrompts(
  name: string,
  options: { others?: readonly JournalOther[]; wants?: string } = {},
): JournalPrompt[] {
  const others = options.others ?? [];
  const wants = options.wants ?? '';
  const first = others.length > 0 ? others[0] : null;
  const second = others.length > 1 ? others[1] : null;
  const who = (o: JournalOther) => (dartTrim(o.tie).length === 0 ? o.name : `${o.name} (${dartTrim(o.tie)})`);
  const out: JournalPrompt[] = [
    { id: 'night-before', ask: `The night before everything changes. Write it as ${name}, tonight.` },
  ];
  if (first !== null) out.push({ id: 'unsent', ask: `A letter ${name} will never send, to ${who(first)}.` });
  if (dartTrim(wants).length > 0) {
    out.push({ id: 'want', ask: `${name} on what they want (“${short(wants)}”), and the real reason, last.` });
  } else {
    out.push({ id: 'want', ask: `Everything ${name} wants, in a list. The real reason goes last.` });
  }
  out.push({ id: 'never-tell', ask: `What ${name} would never tell anyone. Not even here, at first.` });
  if (second !== null) out.push({ id: 'describe', ask: `${name} describes ${second.name} to a stranger.` });
  out.push(
    { id: 'pockets', ask: `What is in ${name}’s pockets right now, and why each thing is there.` },
    { id: 'afraid', ask: `What ${name} is most afraid of, and why it is not foolish.` },
    { id: 'earliest', ask: `${name}’s earliest memory, and who is in it.` },
    { id: 'worst-day', ask: `The worst day ${name} ever had, told as if it were nothing.` },
    { id: 'younger', ask: `What ${name} would say to themselves ten years ago.` },
    { id: 'home', ask: `The place ${name} grew up, the way only they would describe it.` },
    { id: 'complaint', ask: `${name}’s complaint about how this story is going.` },
  );
  return out;
}

function short(text: string): string {
  const t = dartTrim(text).replace(/\s+/g, ' ').replace(/[.;!]+$/, '');
  if (t.length <= 60) return t;
  const cut = Math.min(Math.max(t.lastIndexOf(' ', 60), 30), 60);
  return `${t.substring(0, cut)}…`;
}

/** The journal pages among `notes`, the newest first (as Dart's sort orders them). */
export function journalPages(notes: readonly CharacterNote[]): CharacterNote[] {
  return dartSort(
    notes.filter((n) => n.tags.includes(journalTag)),
    (a, b) => (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0),
  );
}

/** The prompt a page was written to, from its title. */
export function promptOf(page: CharacterNote): string {
  return page.title.startsWith(journalTitlePrefix) ? page.title.substring(journalTitlePrefix.length) : page.title;
}

/** How many words are written in `text`. */
export function wordsIn(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu)?.length ?? 0;
}
