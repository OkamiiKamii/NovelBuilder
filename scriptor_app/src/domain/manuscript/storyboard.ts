// THE STORYBOARD: the book as its writer revises it, a reverse outline read from the text itself. For each chapter and
// scene, how it opens (its first sentence), how it ends (its last), and who and what is on its pages, most present
// first. Editors ask for exactly this in revision: does each chapter open on something, and end on something?
//
// Reads only. Nothing is guessed: the lines are the author's own, whole or cut at a word. Pure TypeScript. A port of
// flutter_app/lib/shared/domain/manuscript/storyboard.dart.

import { isMap } from '../json';
import { docBlocks } from '../prose';
import { dartTrim } from '../text/dartString';
import { presentIn } from './inChapter';

/** One chapter's (or scene's) card: its first sentence and its last (empty when it has only one), and the entries on
 * its pages, most mentioned first. */
export type StoryCard = { opening: string; closing: string; present: string[] };

/** The longest a line on the card runs before it is cut, at a word, with an ellipsis. */
export const storyLineChars = 150;

/** How many of those present a card shows. */
export const storyPresentShown = 5;

const sentenceEndSource = '[.!?…]+["”’»)\\]]*(?=\\s|$)';

/** The sentences of [paragraph], each trimmed. */
function sentences(paragraph: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (const m of paragraph.matchAll(new RegExp(sentenceEndSource, 'g'))) {
    const end = m.index + m[0].length;
    const s = dartTrim(paragraph.substring(from, end));
    if (s !== '') out.push(s);
    from = end;
  }
  const rest = dartTrim(paragraph.substring(from));
  if (rest !== '') out.push(rest);
  return out;
}

function cutEnd(s: string): string {
  if (s.length <= storyLineChars) return s;
  const cut = s.lastIndexOf(' ', storyLineChars - 1);
  return `${s.substring(0, cut < 40 ? storyLineChars - 1 : cut)}…`;
}

function cutStart(s: string): string {
  if (s.length <= storyLineChars) return s;
  const cut = s.indexOf(' ', s.length - storyLineChars + 1);
  return `…${s.substring(cut < 0 || cut > s.length - 40 ? s.length - storyLineChars + 1 : cut + 1)}`;
}

/** The card for one chapter's [blocks] (its paragraphs and headings, in order); [names] say who and what to look for
 * (`namesToFind`'s names). */
export function storyCardOf(
  blocks: readonly { heading: boolean; text: string }[],
  names: Readonly<Record<string, readonly string[]>>,
): StoryCard {
  const paragraphs = blocks.filter((b) => !b.heading && dartTrim(b.text) !== '').map((b) => dartTrim(b.text));
  if (paragraphs.length === 0) return { opening: '', closing: '', present: [] };
  const first = sentences(paragraphs[0]);
  const last = sentences(paragraphs[paragraphs.length - 1]);
  const opening = first.length === 0 ? '' : first[0];
  const closingRaw = last.length === 0 ? '' : last[last.length - 1];
  const only = paragraphs.length === 1 && first.length <= 1;
  return {
    opening: cutEnd(opening),
    closing: only || closingRaw === opening ? '' : cutStart(closingRaw),
    present: presentIn(paragraphs, names)
      .slice(0, storyPresentShown)
      .map((p) => p.id),
  };
}

/** Dart's `'${value}'` for a decoded JSON id: text as it is; null, true and false by name; a number as JSON reads it
 * (a whole number written with a fraction, "3.0", is a double in Dart and reads "3.0" there, "3" here). */
function interpolated(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined ? 'null' : String(value);
}

/** The cards for every chapter and scene stored (each record as JSON text), by id, as a job to run away from the
 * screen: decoded and read there. Only plain data in and out. A record that is not JSON is passed over. */
export function storyboardJob(
  storedContents: readonly string[],
  names: Readonly<Record<string, readonly string[]>>,
): () => Map<string, StoryCard> {
  return () => {
    const out = new Map<string, StoryCard>();
    for (const json of storedContents) {
      let row: unknown;
      try {
        row = JSON.parse(json);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
      if (!isMap(row)) continue;
      out.set(interpolated(row['id']), storyCardOf(docBlocks(row['doc']), names));
    }
    return out;
  };
}
