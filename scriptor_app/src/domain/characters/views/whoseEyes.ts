// WHOSE EYES, a view of the cast (pov.ts reads it): the book as a ribbon, a band a chapter, as wide as it is long, in
// the colour of the one it is told through (first person and unclear in their own). A band pressed says the chapter,
// through whom, and the sentence that shows it, with **Read it there**. Then each one it is told through, with their
// chapters and their share of the book; and what that means: the longest run through the same eyes, and how long since
// each was last. It only reads.
//
// The pure parts of flutter_app/lib/features/characters/widgets/whose_eyes.dart: what to read (`eyesReading`, then
// chapterEyesJob(service.storedChapters(novelId), order, titles, people)), and what is shown of it.
//
// The ribbon: 44 high, radius 8, a band a chapter, each `flex` wide (its words, at least 1), 1.5 apart; filled in its
// `colour`; the one picked bordered onSurface 2.5; its number (11, bold, `ink`) when it is more than 3% of the book,
// made smaller to fit. Each row: a face of 40 × 48 (radius 9; an icon for the first person, person_outline, and the
// unclear, blur_on), the name (15, bold), what is said (13.5), and a bar 6 high (radius 3) of the share in its colour
// over onSurface at 8%. A note: a visibility icon (18, the accent) and the words (14.5). The chapter picked: the high
// surface, radius 10, a 4 wide rule in its colour down the left, "Chapter n · Title, through Ilse" (14, bold), the
// sentence in quotes (14.5, italic), **Read it there** (menu_book icon).

import { dartRound } from '../../desk/format';
import { dartSort } from '../../manuscript/dartSort';
import { dartTrim } from '../../text/dartString';
import { type Listed } from '../cast';
import { type CastData } from '../castData';
import { type ChapterEyes, type EyesPerson, eyesSummary } from '../pov';
import { castTone } from '../screens/library';
import { luminance } from './common';
import { type ReadThere, bookReading, readThere } from './readings';

/** What to read: the chapters' ids in reading order, their titles, the cast, and the key the reading is kept by. */
export function eyesReading(cast: CastData): {
  order: string[];
  titles: Map<string, string>;
  people: EyesPerson[];
  key: string;
} {
  const { nodes, people, key } = bookReading(cast);
  return { order: nodes.map((n) => n.id), titles: new Map(nodes.map((n) => [n.id, n.title])), people, key };
}

/** A colour the ribbon is drawn in: a character's own (`#rrggbb`), or the theme's for the first person (onSurface at
 * 55%) and the unclear (outlineVariant at 50%; the row's bar outlineVariant itself). */
export type EyesColour = { kind: 'character'; hex: string } | { kind: 'firstPerson' } | { kind: 'unclear' };

export function eyesColour(e: ChapterEyes): EyesColour {
  return e.telling === 'through'
    ? { kind: 'character', hex: castTone(e.who!) }
    : e.telling === 'firstPerson'
      ? { kind: 'firstPerson' }
      : { kind: 'unclear' };
}

/** Dark ink on a light colour, light on a dark one, for a band's number (its colour as `#rrggbb`, alpha left out). */
export function eyesInk(hex: string): string {
  return luminance(hex) > 0.45 ? '#1B1712' : '#FFFFFF';
}

/** Through whom a chapter is told, in words. */
export function whose(e: ChapterEyes, byId: ReadonlyMap<string, Listed>): string {
  switch (e.telling) {
    case 'through':
      return `through ${byId.get(e.who!)?.entry.name ?? 'someone'}`;
    case 'firstPerson':
      return 'in the first person';
    case 'unclear':
      return 'through no one clearly';
  }
}

/** A row under the ribbon. */
export type EyesRow = {
  kind: 'character' | 'firstPerson' | 'unclear';
  listed: Listed | null;
  name: string;
  said: string;
  share: number;
  colour: EyesColour;
};

/** The view, once read (`eyes`: what chapterEyesJob gave). `picked`: the chapter pressed, or null. */
export function whoseEyes(
  cast: CastData,
  eyes: readonly ChapterEyes[],
  picked: number | null,
):
  | { empty: string }
  | {
      caption: string;
      ribbon: { chapter: number; key: string; flex: number; colour: EyesColour; numbered: boolean; picked: boolean }[];
      semanticsLabel: string;
      hint: string;
      picked: { eyes: ChapterEyes; heading: string; quote: string | null; colour: EyesColour; read: ReadThere; button: string } | null;
      rows: EyesRow[];
      notes: string[];
    } {
  if (eyes.length === 0) {
    return { empty: 'No chapter has words yet. Once there are, each is read for whose eyes it is told through.' };
  }
  const byId = new Map(cast.list.map((l) => [l.entry.id, l]));
  const summary = eyesSummary(eyes);
  const total = summary.words === 0 ? 1 : summary.words;
  const chosen = picked === null ? null : (eyes.find((e) => e.chapter === picked) ?? null);
  const told = dartSort([...summary.each], (a, b) => b[1].words - a[1].words);
  const firsts = eyes.filter((e) => e.telling === 'firstPerson');
  const unclear = eyes.filter((e) => e.telling === 'unclear');
  const run = summary.longestRun;

  const rows: EyesRow[] = [];
  for (const [id, v] of told) {
    const l = byId.get(id);
    if (l === undefined) continue;
    rows.push({
      kind: 'character',
      listed: l,
      name: l.entry.name,
      said: `${v.chapters} ${v.chapters === 1 ? 'chapter' : 'chapters'} · ${dartRound((v.words * 100) / total)}% of the book`,
      share: v.words / total,
      colour: { kind: 'character', hex: castTone(id) },
    });
  }
  if (firsts.length > 0) {
    rows.push({
      kind: 'firstPerson',
      listed: null,
      name: 'In the first person',
      said: `Chapter${firsts.length === 1 ? '' : 's'} ${firsts.map((e) => e.chapter).join(', ')}`,
      share: firsts.reduce((n, e) => n + e.words, 0) / total,
      colour: { kind: 'firstPerson' },
    });
  }
  if (unclear.length > 0) {
    rows.push({
      kind: 'unclear',
      listed: null,
      name: 'Unclear',
      said: `Chapter${unclear.length === 1 ? '' : 's'} ${unclear.map((e) => e.chapter).join(', ')}: no one thinks or notices clearly`,
      share: unclear.reduce((n, e) => n + e.words, 0) / total,
      colour: { kind: 'unclear' },
    });
  }

  // What it means.
  const notes: string[] = [];
  if (run !== null && run.to - run.from >= 2) {
    notes.push(
      `Chapters ${run.from} to ${run.to} are all through ${byId.get(run.who)?.entry.name ?? 'one character'}: ` +
        `${run.to - run.from + 1} in a row.`,
    );
  }
  for (const [id, since] of summary.since) {
    if (since >= 4 && summary.each.size > 1) {
      notes.push(
        `${byId.get(id)?.entry.name ?? 'Someone'} has not been seen through for ${since} chapters, since chapter ` +
          `${eyes.length - since}.`,
      );
    }
  }
  if (told.length === 1 && firsts.length === 0) {
    notes.push(`The whole book so far is seen through ${byId.get(told[0][0])?.entry.name ?? 'one character'}.`);
  }

  return {
    caption: 'Whose eyes each chapter is told through, read from who thinks, feels and notices in it.',
    ribbon: eyes.map((e) => ({
      chapter: e.chapter,
      key: `eyes-${e.chapter}`,
      flex: Math.min(Math.max(e.words, 1), 1 << 30),
      colour: eyesColour(e),
      numbered: e.words / total > 0.03,
      picked: picked === e.chapter,
    })),
    semanticsLabel: `The book, chapter by chapter: ${eyes.map((e) => `chapter ${e.chapter} ${whose(e, byId)}`).join(', ')}`,
    hint: chosen === null ? 'Press a chapter to see why.' : '',
    picked:
      chosen === null
        ? null
        : {
            eyes: chosen,
            heading: `${dartTrim(chosen.title).length === 0 ? `Chapter ${chosen.chapter}` : `Chapter ${chosen.chapter} · ${dartTrim(chosen.title)}`}, ${whose(chosen, byId)}`,
            quote: chosen.evidence.length === 0 ? null : `“${chosen.evidence}”`,
            colour: eyesColour(chosen),
            // With no sentence to find, the chapter is opened without one (term '').
            read: readThere(chosen.nodeId, chosen.evidence, 0),
            button: 'Read it there',
          },
    rows,
    notes,
  };
}

/** A band pressed: the chapter picked after it (the same again unpicks it). */
export function eyesPicked(picked: number | null, chapter: number): number | null {
  return picked === chapter ? null : chapter;
}
