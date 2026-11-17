// THE DRAMATIS PERSONAE for the book (dramatis.ts makes it): the cast list that epic and ensemble novels print before
// the story, made from the cast and shown as it will be printed, on a page. Grouped by faction, by the part each plays,
// or as one list; in the order the reader meets them (entrances) or by name; only those on the page, or the whole
// cast. **Put it in the book** keeps it with the book's matter, so the reader, the PDF and the ebook print it before
// chapter one (and Book details edits it); **Copy** takes the text. Nothing is put in the book until it is pressed,
// and a list already there is not replaced without asking. The pure parts of
// flutter_app/lib/features/characters/widgets/dramatis_page.dart.
//
// The order of appearance is read away from the screen, as the Flutter page reads it: the entrances job (entrances.ts,
// owned by the cast's views) over `dramatisEntranceInput(cast)`; its order's entries on stage, in turn, give
// `appearanceFrom(order)`. Until it arrives the page shows "Reading the book…".
//
// What a press changes: the arrangement only changes the page. "Put it in the book" / "Put this one in the book": when
// the book has a different cast list, first `replaceDialog` (Keep the one there: nothing changes); then the book's
// matter row becomes `castListMatter(stored, …)` (matterWithChanges with `{ castList: text }`), written at once, and
// `putMessage` is said with "Read the book" (to /write/read). Copy puts `copyText` on the clipboard and says "The cast
// list is copied."

import { type JsonMap, str } from '../../json';
import { readingOrder } from '../../model/storyOrder';
import { BookMatter, type CastLine, castLines } from '../../reader/book';
import { matterWithChanges } from '../../reader/matterChanges';
import { StoryNode } from '../../records/storyNode';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { dartTrim } from '../../text/dartString';
import { fieldNamed } from '../cast';
import { type CastData } from '../castData';
import { type CastGrouping, type CastOrder, type DramatisPerson, aboutOf, composeDramatis } from '../dramatis';

/** The cast for the list: those not archived, each with who they are (aboutOf: their epithet, their summary's first
 * sentence, their Occupation), their factions and roles. */
export function dramatisPeople(cast: CastData): DramatisPerson[] {
  return cast.list
    .filter((l) => !l.profile.archived)
    .map((l) => ({
      id: l.entry.id,
      name: l.entry.name,
      about: aboutOf({ epithet: l.profile.epithet, summary: l.entry.summary, occupation: fieldNamed(l.entry, 'Occupation') }),
      factions: l.factions,
      roles: l.profile.roles,
    }));
}

/** What the entrances job reads: the chapters and scenes in reading order, and those not archived who have names to
 * look for (namesToFind), with them. */
export function dramatisEntranceInput(cast: CastData): { nodeIds: string[]; people: { id: string; names: string[] }[] } {
  const nodeIds = readingOrder(cast.snapshot.rows('chapters').map((r) => new StoryNode(r)))
    .filter((n) => n.kind === 'chapter' || n.kind === 'scene')
    .map((n) => n.id);
  const names = cast.findNames;
  const people = cast.list
    .filter((l) => !l.profile.archived && (names[l.entry.id] ?? []).length > 0)
    .map((l) => ({ id: l.entry.id, names: names[l.entry.id] }));
  return { nodeIds, people };
}

/** Each one's place in the order of appearance: the order the entrances job read, those on stage, in turn. */
export function appearanceFrom(order: readonly { id: string; onStage: boolean }[]): Map<string, number> {
  const out = new Map<string, number>();
  order.filter((e) => e.onStage).forEach((e, i) => out.set(e.id, i));
  return out;
}

/** The book's matter (the row with the lowest id), or the empty one. */
export function bookMatterOf(rows: readonly JsonMap[]): BookMatter {
  const sorted = [...rows].sort((a, b) => (str(a['id']) < str(b['id']) ? -1 : str(a['id']) > str(b['id']) ? 1 : 0));
  return sorted.length === 0 ? BookMatter.empty : new BookMatter(sorted[0]);
}

export const dramatisWords = {
  title: 'Dramatis personae',
  copy: 'Copy',
  copied: 'The cast list is copied.',
  reading: 'Reading the book…',
  intro:
    'The cast list a reader turns back to, printed before chapter one: made from your cast, who each one is in a phrase a reader may know from the start (the title they go by, the first line of their summary, or their trade). Never their fate or their secrets.',
  nobodyOnPage: 'No one is on the page yet, so the whole cast is listed, by name.',
  nobody: 'No one to list yet.',
  same: 'This is the cast list in the book.',
  replaces: 'The book has a cast list already; this one would replace it.',
  putMessage: 'In the book, before chapter one. Book details can change it.',
  readTheBook: 'Read the book',
  readTheBookPath: '/write/read',
} as const;

/** Asked before a cast list already in the book (and different) is replaced. */
export const replaceDialog = {
  title: 'Replace the cast list in the book?',
  message: 'The book already has a cast list, perhaps one you have written in yourself. This one would take its place.',
  keep: 'Keep the one there',
  replace: 'Replace it',
} as const;

/** The page's choices: the grouping (null until chosen: by faction when anyone has one, else by part), the order, and
 * "Only those on the page" (null until chosen: on). */
export type DramatisChoices = { by: CastGrouping | null; order: CastOrder; onlyOnPage: boolean | null };

export const dramatisStart: DramatisChoices = { by: null, order: 'appearance', onlyOnPage: null };

/** The page as shown, for the cast, the choices, the order of appearance once read (null before), and the book's
 * matter as stored. */
export function dramatisView(
  people: readonly DramatisPerson[],
  choices: DramatisChoices,
  appearance: ReadonlyMap<string, number> | null,
  matter: BookMatter,
): {
  by: CastGrouping;
  /** How many are on a page; with none, the order and "Only those on the page" are not offered. */
  onPage: number;
  onlyOnPage: boolean;
  showOrder: boolean;
  onlyLabel: string;
  text: string;
  inBook: string;
  same: boolean;
  /** The button under the page: null when there is nothing to list or it is the list in the book already. */
  put: string | null;
  copyText: string | null;
  title: string;
  lines: CastLine[];
} {
  const hasFactions = people.some((p) => p.factions.some((f) => dartTrim(f).length > 0));
  const by = choices.by ?? (hasFactions ? 'faction' : 'role');
  // Before the pages are read, or when no one is on a page yet, the whole cast.
  const onPage = appearance?.size ?? 0;
  const onlyOnPage = (choices.onlyOnPage ?? true) && onPage > 0;
  const text =
    appearance === null ? '' : composeDramatis(people, { by, order: choices.order, appearance, onlyOnPage });
  const inBook = dartTrim(matter.castList);
  const same = inBook.length > 0 && inBook === dartTrim(text);
  return {
    by,
    onPage,
    onlyOnPage,
    showOrder: onPage > 0,
    onlyLabel: `Only those on the page (${onPage})`,
    text,
    inBook,
    same,
    put: text.length === 0 || same ? null : inBook.length === 0 ? 'Put it in the book' : 'Put this one in the book',
    copyText: text.length === 0 ? null : `${matter.castTitle}\n\n${text}`,
    title: matter.castTitle,
    lines: castLines(text),
  };
}

/** Whether putting `text` in the book asks first (a different list is there). */
export function asksToReplace(matter: BookMatter, text: string): boolean {
  const had = dartTrim(matter.castList);
  return had.length > 0 && had !== dartTrim(text);
}

/** The book's matter row with `text` as its cast list. */
export function castListMatter(
  stored: JsonMap | null,
  args: { projectId: string; text: string; now: number; newId: () => string },
): JsonMap {
  return matterWithChanges(stored, { projectId: args.projectId, changes: { castList: args.text }, now: args.now, newId: args.newId });
}

/** The cast list as printed, on a page of paper (#f8f3e6, rounded 4, a shadow #00000033 blur 14 six down; padded 28
 * at the sides, 32 above, 36 below; ink #2a2420, line height 1.35, the book's text face): the title in capitals (21,
 * letter spacing 3.2, weight 600, centred); under it, 8 down, a rule 44 × 1, 8, a diamond 6 × 6 (turned 45°), 8, a
 * rule (all #7a6e62); 16 down, each line: a group's name in capitals (13, letter spacing 2, #7a6e62, centred; 18 above
 * it but for the first, 6 below), or a person: the name bold, then " — who they are" (16.5; 5 below). */
export function castListPage(title: string, text: string): {
  paper: string;
  ink: string;
  faint: string;
  title: string;
  lines: ({ kind: 'group'; text: string; top: number } | { kind: 'person'; name: string; about: string | null })[];
} {
  return {
    paper: '#f8f3e6',
    ink: '#2a2420',
    faint: '#7a6e62',
    title: dartToUpperCase(title),
    lines: castLines(text).map((l, i) =>
      l.group
        ? { kind: 'group' as const, text: dartToUpperCase(l.name), top: i === 0 ? 0 : 18 }
        : { kind: 'person' as const, name: l.name, about: l.about.length > 0 ? ` — ${l.about}` : null },
    ),
  };
}
