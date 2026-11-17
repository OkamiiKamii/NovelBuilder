// What the writing desk shows around the page, as data: THE MARGIN's index cards beside it, THE FIRST PAGE of a chapter
// with no words yet, THE CHAPTER'S END under its last line, and A NOTE FOR NEXT TIME. Read from the chapter's plan
// (`chapterPlans`), its threads (`plotThreads`), the characters (`loreEntries`) and the chapter before (`chapters`,
// `chapterContents`); it writes nothing. Pure TypeScript. Ports of flutter_app/lib/features/write/margin.dart,
// first_page.dart, chapter_end.dart and next_note.dart, and of `closingWords` in
// flutter_app/lib/shared/domain/manuscript/prose.dart.

import { type JsonMap, idOrNull, isMap, listOf, numOrNull, str, strOrNull } from '../json';
import { type StoryNode, kindLabel, readingOrder, storyNode } from '../outline';
import { docBlocks } from '../prose';
import { dartTrim, dartTrimLeft } from '../text/dartString';
import { plural } from './format';

/** The rows of one collection of the open novel (`(c) => snapshot.rows(c)`, or `(c) => store.rowsIn(novelId, c)`). */
export type DeskRows = (collection: string) => readonly JsonMap[];

/** The name shown for a chapter or scene: its title, or "Untitled chapter" and the like (`StoryNode.displayTitle`). */
export function displayTitle(node: StoryNode): string {
  return node.title !== '' ? node.title : `Untitled ${node.kind ? kindLabel[node.kind].toLowerCase() : 'item'}`;
}

// ---------------------------------------------------------------------------------------------------- closing words

/** The last words of a document, for showing where the story stands: the last paragraphs (headings left out, each
 * trimmed) as written, joined by a blank line, up to [max] characters (code points). An ending too long to fit is cut
 * at a space, never inside a word (`cut` says so); an earlier paragraph that does not fit is left out whole, unless
 * more than 40 characters of room are left, when its end is kept from a space. */
export function closingWords(doc: unknown, max = 320): { text: string; cut: boolean } {
  const paragraphs = docBlocks(doc)
    .filter((b) => !b.heading && dartTrim(b.text) !== '')
    .map((b) => dartTrim(b.text));
  const kept: string[] = [];
  let length = 0;
  let cut = false;
  for (const p of [...paragraphs].reverse()) {
    const room = max - length;
    const runes = Array.from(p);
    if (runes.length <= room) {
      kept.unshift(p);
      length += runes.length + 2;
      continue;
    }
    cut = true;
    if (kept.length === 0 || room > 40) {
      // The end of this paragraph, from the first space that leaves it within the room.
      const take = room > 40 ? room : 40;
      const from = runes.length > take ? runes.length - take : 0;
      let start = from;
      while (start > 0 && start < runes.length && dartTrim(runes[start]) !== '') start++;
      const tail = dartTrimLeft(runes.slice(start).join(''));
      if (tail !== '') {
        kept.unshift(tail);
      } else if (kept.length === 0) {
        // One unbroken run longer than the room: its end, as it is.
        kept.unshift(runes.slice(from).join(''));
      }
    }
    break;
  }
  return { text: kept.join('\n\n'), cut };
}

// ---------------------------------------------------------------------------------------------------- the margin

/** Whether the margin is shown beside the page, kept on this device (on unless stored as `false`). */
export const marginKey = 'write.margin';

/** Someone on the page, by the plan: `pov` when the chapter is told from their point of view. */
export type MarginPerson = { id: string; name: string; pov: boolean };

/** A plot thread with a development placed at this chapter or scene (`development` is that beat's title, as stored). */
export type MarginThread = { id: string; title: string; development: string };

/** How the chapter or scene before ends: its title, its closing words, and whether they were cut. */
export type MarginBefore = { title: string; text: string; cut: boolean };

/** What the margin (and the first page, and the nudges) know of one chapter or scene. */
export type MarginNotes = {
  /** The chapter's summary, trimmed. */
  summary: string;
  /** The plan's objective, trimmed. */
  objective: string;
  /** The plan's beats with words, trimmed, in order. */
  beats: string[];
  /** Point-of-view characters first, then those who appear; only characters that exist. */
  people: MarginPerson[];
  /** Names of the characters mentioned (not on the page); those without a name are left out. */
  mentioned: string[];
  threads: MarginThread[];
  /** The nearest chapter or scene before this one (in reading order) that has words, when its ending has text. */
  before: MarginBefore | null;
};

/** Whether the chapter has a plan to show: a summary, objective, beats, people or threads. */
export function hasPlan(n: MarginNotes): boolean {
  return n.summary !== '' || n.objective !== '' || n.beats.length > 0 || n.people.length > 0 || n.threads.length > 0;
}

function byId(rows: readonly JsonMap[]): Map<string, JsonMap> {
  const out = new Map<string, JsonMap>();
  for (const r of rows) {
    const id = str(r['id']);
    if (!out.has(id)) out.set(id, r);
  }
  return out;
}

const strings = (value: unknown): string[] =>
  listOf(value)
    .map(strOrNull)
    .filter((s): s is string => s !== null);
const maps = (value: unknown): JsonMap[] => listOf(value).filter(isMap);

/** The margin's notes for [nodeId]: its plan and summary, the threads with a development placed there, and the closing
 * words (up to 220 characters) of the nearest chapter or scene before it in reading order that has words. */
export function marginNotesOf(rows: DeskRows, nodeId: string): MarginNotes {
  const chapters = rows('chapters');
  const nodeRow = byId(chapters).get(nodeId);
  const plan = byId(rows('chapterPlans')).get(nodeId) ?? null;
  const entries = byId(rows('loreEntries'));
  const nameOf = (id: string) => {
    const e = entries.get(id);
    return e ? str(e['name']) : '';
  };

  const povs = plan ? strings(plan['povIds']) : [];
  const people: MarginPerson[] = [];
  for (const id of new Set([...povs, ...(plan ? strings(plan['appearIds']) : [])])) {
    const e = entries.get(id);
    if (e) people.push({ id, name: str(e['name']), pov: povs.includes(id) });
  }
  // Point of view first; otherwise as listed (Dart's sort keeps the order of equals in a list of up to 32).
  people.sort((a, b) => (a.pov === b.pov ? 0 : a.pov ? -1 : 1));

  const threads: MarginThread[] = [];
  for (const t of rows('plotThreads')) {
    for (const b of maps(t['beats'])) {
      if (idOrNull(b['nodeId']) === nodeId) {
        const title = str(t['title']);
        threads.push({ id: str(t['id']), title: title === '' ? 'Untitled thread' : title, development: str(b['title']) });
      }
    }
  }

  let before: MarginBefore | null = null;
  const order = readingOrder(chapters.map(storyNode)).map((x) => x.node);
  const at = order.findIndex((n) => n.id === nodeId);
  const contents = byId(rows('chapterContents'));
  for (let i = at - 1; i >= 0; i--) {
    const n = order[i];
    if ((n.kind !== 'chapter' && n.kind !== 'scene') || n.wordCount === 0) continue;
    const closing = closingWords(contents.get(n.id)?.['doc'], 220);
    if (closing.text !== '') before = { title: displayTitle(n), text: closing.text, cut: closing.cut };
    break;
  }

  return {
    summary: nodeRow ? dartTrim(str(nodeRow['summary'])) : '',
    objective: plan ? dartTrim(str(plan['objective'])) : '',
    beats: (plan ? maps(plan['beats']) : []).map((b) => dartTrim(str(b['text']))).filter((t) => t !== ''),
    people,
    mentioned: (plan ? strings(plan['mentionIds']) : []).map(nameOf).filter((name) => name !== ''),
    threads,
    before,
  };
}

/** One of the margin's index cards, in the order they stand. */
export type MarginCard =
  /** "Last time", under the chapter before's title: its closing words, "…" first when they were cut. */
  | { card: 'lastTime'; title: 'Last time'; subtitle: string; text: string }
  /** "This chapter" with no plan: "No plan yet." and the offer to plan it. */
  | { card: 'noPlan'; title: 'This chapter'; text: 'No plan yet.'; action: 'Plan this chapter' }
  /** "This chapter": the summary and/or the objective (shown after "Goal"), and a way to open the chapter's plan. */
  | { card: 'thisChapter'; title: 'This chapter'; summary: string; objective: string; actionTooltip: string }
  /** "Beats", numbered from 1. */
  | { card: 'beats'; title: 'Beats'; beats: { number: number; text: string }[] }
  /** "On the page": each person ("Point of view" beside those it is told through), then "Mentioned: …". */
  | { card: 'onThePage'; title: 'On the page'; people: MarginPerson[]; mentioned: string | null }
  /** "Threads here": each thread's title, with its development under it when it has one. */
  | { card: 'threads'; title: 'Threads here'; threads: MarginThread[] };

/** The margin's cards for [n], as `ChapterMargin` lays them out. */
export function marginCards(n: MarginNotes): MarginCard[] {
  const out: MarginCard[] = [];
  if (n.before) {
    out.push({ card: 'lastTime', title: 'Last time', subtitle: n.before.title, text: `${n.before.cut ? '…' : ''}${n.before.text}` });
  }
  if (!hasPlan(n)) {
    out.push({ card: 'noPlan', title: 'This chapter', text: 'No plan yet.', action: 'Plan this chapter' });
    return out;
  }
  if (n.summary !== '' || n.objective !== '') {
    out.push({
      card: 'thisChapter',
      title: 'This chapter',
      summary: n.summary,
      objective: n.objective,
      actionTooltip: "Open the chapter's plan",
    });
  }
  if (n.beats.length > 0) {
    out.push({ card: 'beats', title: 'Beats', beats: n.beats.map((text, i) => ({ number: i + 1, text })) });
  }
  if (n.people.length > 0 || n.mentioned.length > 0) {
    out.push({
      card: 'onThePage',
      title: 'On the page',
      people: n.people,
      mentioned: n.mentioned.length > 0 ? `Mentioned: ${n.mentioned.join(', ')}` : null,
    });
  }
  if (n.threads.length > 0) out.push({ card: 'threads', title: 'Threads here', threads: n.threads });
  return out;
}

// ---------------------------------------------------------------------------------------------------- the first page

/** Ways into a first line: the openings writers reach for. Prompts to think with; nothing is written for the author. */
export const firstPageWays: readonly { label: string; prompt: string }[] = [
  { label: 'A line of dialogue', prompt: 'Someone speaks. Who, to whom, and what do they want from them?' },
  { label: 'A place', prompt: 'Where are we? Give one detail only this point of view would notice.' },
  { label: 'The middle of things', prompt: 'Something is already happening. Begin as it happens, and explain later.' },
];

/** Whether a page holds no words yet: every paragraph empty or only spaces. The first page shows only then, and goes
 * with the first word (and comes back if the page is emptied). */
export function documentIsEmpty(paragraphs: readonly string[]): boolean {
  return paragraphs.every((p) => dartTrim(p) === '');
}

/** What the first page shows. With [notesBeside] (the margin shows the same notes beside the page) only the ways in. */
export type FirstPageView = {
  intro: string;
  /** "Where the story stands": "<title> ends:", then the closing words ("…" first when cut; shown up to 5 lines). */
  before: { heading: 'Where the story stands'; ends: string; text: string } | null;
  /** "This chapter is for": the objective, else the summary. Empty: not shown. */
  purpose: string;
  /** "Planned": the beats, numbered "1.", "2.", … */
  beats: { number: string; text: string }[];
  /** "On the page": "Mira Vance (point of view), Kai". Null: not shown. */
  onThePage: string | null;
  /** "Moving here": "<thread>: <development>", or the thread alone. */
  movingHere: string[];
  /** No plan to show: "No plan for it yet." and "Plan this chapter". */
  offerPlan: boolean;
  /** "A way in": the ways' labels; a pressed one shows its prompt under them. */
  waysIn: readonly { label: string; prompt: string }[];
  footer: string;
};

export function firstPageView(n: MarginNotes, notesBeside: boolean): FirstPageView {
  const beside = notesBeside;
  const purpose = beside ? '' : n.objective !== '' ? n.objective : n.summary;
  const planned = beside || purpose !== '' || n.beats.length > 0 || n.people.length > 0 || n.threads.length > 0;
  return {
    intro: beside
      ? 'Nothing written here yet. What you know of it is beside the page.'
      : 'Nothing written here yet. What you already know of it:',
    before:
      n.before && !beside
        ? { heading: 'Where the story stands', ends: `${n.before.title} ends:`, text: `${n.before.cut ? '…' : ''}${n.before.text}` }
        : null,
    purpose,
    beats: beside ? [] : n.beats.map((text, i) => ({ number: `${i + 1}.`, text })),
    onThePage: !beside && n.people.length > 0 ? n.people.map((p) => (p.pov ? `${p.name} (point of view)` : p.name)).join(', ') : null,
    movingHere: beside ? [] : n.threads.map((t) => (t.development === '' ? t.title : `${t.title}: ${t.development}`)),
    offerPlan: !planned,
    waysIn: firstPageWays,
    footer: 'Write on the first line above; this page goes with your first word.',
  };
}

// ---------------------------------------------------------------------------------------------------- the chapter's end

/** What the end of a chapter or scene shows: what follows it in reading order, or, at the end of the manuscript, the
 * next chapter to begin. */
export type ChapterEndView = {
  /** The chapter or scene that follows (the chapter's first scene, or the next chapter); null at the end. */
  next: StoryNode | null;
  /** "Next", or "The end, so far". */
  heading: string;
  /** The next one's title, or "Chapter <n + 1>" (n: the chapters there are). */
  title: string;
  /** Under the title: "A scene · 1,234 words", "Not begun"; null at the end. */
  detail: string | null;
  /** "Continue to “<title>”", or "Begin the next chapter". */
  action: string;
  /** At the end of a manuscript with words, the author's name to sign it with; else empty (not shown). */
  signature: string;
  /** Where "Begin the next chapter" makes the chapter: the parent of this chapter (of a scene's chapter). */
  beginIn: string | null;
};

/** [nodes]: the outline; [node]: the chapter or scene on the page; [author]: the novel's author as stored. */
export function chapterEndOf(nodes: readonly StoryNode[], node: StoryNode, author: string): ChapterEndView {
  const documents = readingOrder(nodes)
    .map((x) => x.node)
    .filter((n) => n.kind === 'chapter' || n.kind === 'scene');
  const at = documents.findIndex((n) => n.id === node.id);
  const next = at >= 0 && at + 1 < documents.length ? documents[at + 1] : null;
  const chapters = documents.filter((n) => n.kind === 'chapter').length;
  const signature = next !== null || documents.every((n) => n.wordCount === 0) ? '' : author;
  // After this chapter (a scene's chapter), in the same part.
  const chapter = node.kind === 'scene' ? (nodes.find((n) => n.id === node.parentId) ?? node) : node;
  return {
    next,
    heading: next === null ? 'The end, so far' : 'Next',
    title: next === null ? `Chapter ${chapters + 1}` : displayTitle(next),
    detail:
      next === null
        ? null
        : [...(next.kind === 'scene' ? ['A scene'] : []), next.wordCount === 0 ? 'Not begun' : plural(next.wordCount, 'word')].join(
            ' · ',
          ),
    action: next === null ? 'Begin the next chapter' : `Continue to “${displayTitle(next)}”`,
    signature,
    beginIn: chapter.parentId,
  };
}

// ---------------------------------------------------------------------------------------------------- next time

/** A note left for the next sitting: what comes next on this page, in the author's own words, and when it was left
 * (milliseconds since the epoch). */
export type NextNote = { text: string; at: number };

/** Words written in a sitting before leaving the page offers a note for next time. */
export const nextNoteAfterWords = 100;

/** The note's field holds at most this many characters (Flutter's `maxLength`, which counts what a reader sees as one
 * character: an emoji or an accented letter made of several code points is one). */
export const nextNoteMaxLength = 280;

/** Ways to begin a note, put in the field with a press (replacing what is there, the caret after it). The chips show
 * each one trimmed ("Next,"). Only a start: the author writes the rest. */
export const nextNoteStarts: readonly string[] = ['Next, ', 'Finish the scene where ', 'Remember: ', 'The line I want: '];

/** Where the open novel's notes are kept in this device's settings (never in the novel): one note to a chapter or
 * scene, `{nodeId: {text, at}}`. */
export function nextNotesKey(novelId: string): string {
  return `write.nextNotes.${novelId}`;
}

/** The notes as kept in the settings: those with a text that is not only spaces; a missing `at` reads as 0. */
export function readNextNotes(raw: unknown): Map<string, NextNote> {
  const out = new Map<string, NextNote>();
  if (!isMap(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (isMap(value) && typeof value['text'] === 'string' && dartTrim(value['text']) !== '') {
      const at = numOrNull(value['at']);
      out.set(key, { text: value['text'], at: at === null ? 0 : Math.trunc(at) });
    }
  }
  return out;
}

/** The notes with [text] kept (trimmed, left at [nowMs]) as the note for [nodeId]; an empty one puts the note away. */
export function withNextNote(
  notes: ReadonlyMap<string, NextNote>,
  nodeId: string,
  text: string,
  nowMs: number,
): Map<string, NextNote> {
  const next = new Map(notes);
  if (dartTrim(text) === '') {
    next.delete(nodeId);
  } else {
    next.set(nodeId, { text: dartTrim(text), at: Math.trunc(nowMs) });
  }
  return next;
}

/** The notes as they are written to the settings. */
export function storedNextNotes(notes: ReadonlyMap<string, NextNote>): JsonMap {
  const out: JsonMap = {};
  for (const [key, value] of notes) out[key] = { text: value.text, at: value.at };
  return out;
}

/** Whether leaving the page first offers a note: after a real sitting ([wordsWritten] since the page opened, at least
 * [nextNoteAfterWords]) on a page with no note left for it. */
export function offersNoteOnLeaving(wordsWritten: number, hasNote: boolean): boolean {
  return wordsWritten >= nextNoteAfterWords && !hasNote;
}

/** The words of the sheet for leaving (or changing) the note for the page titled [title]. [leaving]: offered as the
 * author leaves the page. "Pin the note" is pressable only while the field holds more than spaces. */
export function nextNoteSheet(title: string, leaving: boolean) {
  return {
    heading: leaving ? 'Before you go' : 'A note for next time',
    body: `One line for when you come back to “${title}”: what happens next, while you still know. It waits under your last line.`,
    hint: 'Next, they reach the gate and…',
    starts: nextNoteStarts.map((s) => ({ label: dartTrim(s), text: s })),
    dismiss: leaving ? 'Leave without one' : 'Cancel',
    pin: 'Pin the note',
  };
}

/** Whether the field's text can be pinned (and, once the sheet closes with it, whether a note is kept). */
export function canPinNote(text: string): boolean {
  return dartTrim(text) !== '';
}

/** Under the page's last line: the note pinned (to "Change" or be "Done with it"), or, with none, "Leave a note for
 * next time" (unless [offer] is off, in focus mode: then nothing). */
export function nextNoteSlip(note: NextNote | undefined, offer: boolean): 'pinned' | 'offer' | 'none' {
  if (note) return 'pinned';
  return offer ? 'offer' : 'none';
}
