// IN THEIR HAND (journal.ts): a character's journal. A prompt made of what the book knows of them, a page of ruled
// paper to write on as them, in the first person, and the pages written before, the newest first. A page is kept as
// it is written (one of their notes, tagged journal, its prompt its title), so nothing is lost on the way out;
// **Another prompt** deals the next; an old page pressed opens it again to go on with. The pure parts of
// flutter_app/lib/features/characters/widgets/journal_page.dart.
//
// What a press changes: typing on a blank page (anything but white space) makes the page at once:
// `saveNote(entryId, null, { title: journalTitlePrefix + prompt, content, tags: [journalTag] })`, and the page is that
// note from then on; typing more saves through autosave under the key `journal:<noteId>`:
// `saveNote(entryId, noteId, { content })`. "Another prompt" / "A new page" writes what is waiting (flush), deals the
// next prompt and starts a blank page; an earlier page pressed writes what is waiting and opens it to go on with.
// Nothing is kept for a page left blank.

import { plural } from '../../desk/format';
import { CharacterRelation } from '../../records/relation';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type CastData } from '../castData';
import { type CharacterChanges } from '../characterChanges';
import { type CharacterNote } from '../characterRecords';
import {
  type JournalOther,
  type JournalPrompt,
  journalPages,
  journalPrompts,
  journalTag,
  journalTitlePrefix,
  promptOf,
  wordsIn,
} from '../journal';
import { stakesOf } from '../stakes';

/** Those `entryId` is tied to, each once by name, with what they are to them: the latest stage's title, else its
 * label (in the relationships' stored order). */
export function journalOthers(cast: CastData, entryId: string): JournalOther[] {
  const byId = new Map(cast.list.map((l) => [l.entry.id, l]));
  const out: JournalOther[] = [];
  for (const r of cast.snapshot.rows('characterRelations').map((row) => new CharacterRelation(row))) {
    const other = r.fromId === entryId ? r.toId : r.toId === entryId ? r.fromId : null;
    const them = other === null ? undefined : byId.get(other);
    if (them === undefined || out.some((o) => o.name === them.entry.name)) continue;
    const stages = r.stages;
    const stage = stages.length > 0 ? stages[stages.length - 1] : null;
    out.push({
      name: them.entry.name,
      tie: stage === null ? '' : dartTrim(stage.title).length > 0 ? dartTrim(stage.title) : dartTrim(stage.label),
    });
  }
  return out;
}

/** The prompts for a character of the cast (null when they are not in it). */
export function journalPromptsFor(cast: CastData, entryId: string): JournalPrompt[] | null {
  const me = cast.listed(entryId);
  if (me === null) return null;
  const fields = new Map<string, string>();
  for (const f of me.entry.fields) fields.set(dartToLowerCase(dartTrim(f.key)), f.value);
  return journalPrompts(me.entry.name, { others: journalOthers(cast, entryId), wants: stakesOf(fields).get('wants') ?? '' });
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day as a page is dated: "14 Nov 2026" (local time). */
export function shortDate(t: Date): string {
  return `${t.getDate()} ${months[t.getMonth()]} ${t.getFullYear()}`;
}

/** An earlier page, as listed: when it was written and how long it is, its prompt (2 lines), its first lines (3). */
export function earlierPage(page: CharacterNote): { when: string; prompt: string; text: string } {
  return {
    when: `${shortDate(new Date(Math.trunc(page.createdAt)))} · ${plural(wordsIn(page.content), 'word')}`,
    prompt: promptOf(page),
    text: dartTrim(page.content),
  };
}

export const journalWords = {
  title: (name: string) => `${name}’s journal`,
  intro: (name: string) =>
    `Write as ${name}, in the first person. Not for the book: to hear them. Every page is kept in their notes.`,
  hint: 'Dear diary…',
  earlier: 'EARLIER PAGES',
} as const;

/** The page of paper: its colours and measures. The prompt (17, italic, line height 1.35) over ruled lines; the
 * writing (19, italic, line height 1.6, so a line every 30.4) starts 12 down, between 52 from the left (the margin
 * rule at 42, 1.2 wide) and 18 from the right; at least 12 lines. Rules run from 12 to the width less 12, the first at
 * 12 + 30.4 − 4, then one a line. The paper is rounded 6, with a shadow (#00000033, blur 14, 6 down), padded 18 above
 * and below. */
export const journalPaper = {
  paper: '#f7f1e1',
  ink: '#2b2a45',
  rule: '#b9c7d8',
  margin: '#d9a3a3',
  promptInk: '#6b5a48',
  hintInk: '#7a6a5866',
  size: 19,
  height: 1.6,
  line: 19 * 1.6,
  top: 12,
  textLeft: 52,
  textRight: 18,
  marginX: 42,
  minLines: 12,
} as const;

/** Where the ruled lines go in a paper `height` high. */
export function journalRules(height: number): number[] {
  const out: number[] = [];
  for (let y = journalPaper.top + journalPaper.line - 4; y < height; y += journalPaper.line) out.push(y);
  return out;
}

/** The journal's state: which prompt is dealt, the page open (its note, once kept, and its prompt), the text. */
export class JournalState {
  deal = 0;
  noteId: string | null = null;
  prompt: string | null = null;
  text = '';

  constructor(readonly entryId: string) {}

  /** The prompt the page is written to. */
  promptNow(prompts: readonly JournalPrompt[]): string {
    return this.prompt ?? prompts[this.deal % prompts.length].ask;
  }

  /** Typing: what to write. 'make' (a new note, at once; give `made.id` to `kept`), 'save' (autosave under `key`), or
   * nothing for white space. */
  typed(text: string, prompts: readonly JournalPrompt[]):
    | { kind: 'make'; apply: (c: CharacterChanges) => CharacterNote }
    | { kind: 'save'; key: string; apply: (c: CharacterChanges) => CharacterNote }
    | null {
    this.text = text;
    if (dartTrim(text).length === 0) return null;
    const id = this.noteId;
    if (id === null) {
      const title = `${journalTitlePrefix}${this.promptNow(prompts)}`;
      return {
        kind: 'make',
        apply: (c) => c.saveNote(this.entryId, null, { title, content: text, tags: [journalTag] }),
      };
    }
    return { kind: 'save', key: `journal:${id}`, apply: (c) => c.saveNote(this.entryId, id, { content: text }) };
  }

  /** The note the first words made. */
  kept(noteId: string): void {
    this.noteId = noteId;
  }

  /** "Another prompt" / "A new page" (after writing what is waiting). */
  turn(prompts: number): void {
    this.deal = (this.deal + 1) % prompts;
    this.noteId = null;
    this.prompt = null;
    this.text = '';
  }

  /** An earlier page pressed (after writing what is waiting). */
  open(page: CharacterNote): void {
    this.noteId = page.id;
    this.prompt = promptOf(page);
    this.text = page.content;
  }

  /** Under the page: "Begin anywhere." on a blank page, "7 words · kept in Mark’s notes" once kept. */
  footer(name: string): string {
    const words = wordsIn(this.text);
    return this.noteId === null ? (words === 0 ? 'Begin anywhere.' : '') : `${plural(words, 'word')} · kept in ${name}’s notes`;
  }

  get turnLabel(): string {
    return this.noteId === null ? 'Another prompt' : 'A new page';
  }

  /** The pages written before, the one open now left out, newest first. */
  earlier(notes: readonly CharacterNote[]): CharacterNote[] {
    return journalPages(notes).filter((p) => p.id !== this.noteId);
  }
}
