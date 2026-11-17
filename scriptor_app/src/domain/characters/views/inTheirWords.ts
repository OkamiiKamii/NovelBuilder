// IN THEIR OWN WORDS: what a character says in the book (voice.ts), every line tied to them by how the dialogue is
// written, in reading order, set as the quotations they are, each over its chapter's name. A press opens the chapter
// at that line. To hear a voice, keep it their own, and catch the line that sounds like someone else. Read from the
// saved text away from the screen. It only reads.
//
// The pure parts of flutter_app/lib/features/characters/widgets/in_their_words.dart: what to read (`wordsInputs`; kept
// by readingKey(inputs, textVersion) in KeptReadings; read with spokenJob(service.storedChapters(novelId),
// cast.documentIds, names)), and what the box shows.
//
// In a profile box: each line a press (radius 6, 10/4 padding): a large opening quotation mark (40, the accent, line
// height 0.9), the words and a closing mark (18, italic, at most six lines; read aloud without the marks), the chapter's
// name under them (11.5, bold, the accent), and a chevron (18, the accent). Five, then "Show all".

import { type CastData } from '../castData';
import { documentName } from '../screens/parts';
import { type Spoken } from '../voice';
import { type ReadThere, readThere } from './readings';

/** How many lines are shown before "Show all". */
export const linesShown = 5;

/** The names a character is found by, and what the reading is made of (null when there is nothing to read). */
export function wordsInputs(cast: CastData, entryId: string): { names: string[]; inputs: string | null } {
  const names = cast.findNames[entryId] ?? [];
  const chapters = cast.documentIds;
  return {
    names,
    inputs:
      chapters.length === 0 || names.length === 0
        ? null
        : `spoken\u0000${cast.novelId}\u0000${chapters.join(',')}\u0000${names.join('|')}`,
  };
}

/** A short run of the line's first words, enough to find it in the chapter. */
export function findable(words: string): string {
  return words
    .split(/\s+/)
    .slice(0, 5)
    .join(' ')
    .replace(/[.,!?…—–]+$/, '');
}

/** The box, or null (nothing shown) while it is read or when they say nothing. `all`: "Show all" was pressed. */
export function inTheirWords(
  cast: CastData,
  lines: readonly Spoken[] | null,
  all: boolean,
): {
  title: string;
  caption: string;
  lines: { spoken: Spoken; text: string; semanticsLabel: string; chapter: string; read: ReadThere }[];
  toggle: string | null;
} | null {
  if (lines === null || lines.length === 0) return null;
  const shown = all ? lines : lines.slice(0, linesShown);
  return {
    title: 'In their own words',
    caption: 'The lines the book gives them to say. Press one to read it there.',
    lines: shown.map((s) => ({
      spoken: s,
      text: `${s.words}”`,
      semanticsLabel: s.words,
      chapter: documentName(cast, s.nodeId),
      read: readThere(s.nodeId, findable(s.words), s.block),
    })),
    toggle: lines.length > linesShown ? (all ? 'Show fewer' : `Show all ${lines.length}`) : null,
  };
}
