// THE KEEPSAKES: everything a book can be made into. One list (`keepsakesOf`), shown two ways: a row of tiles, the ones
// not yet opened first; and the shelf, all of them at once on wooden shelves. A keepsake not yet opened wears a gold
// ribbon, NEW, until it is; the row's heading says how many are left. What has been opened is remembered on this
// device (`keepsakes.opened`), for every book. The pure parts of flutter_app/lib/app/shell/keepsakes.dart.

/** The setting that holds the keepsakes opened (their ids). */
export const keepsakesOpenedSettingKey = 'keepsakes.opened';

/** The keepsakes, in their order. */
export type KeepsakeId = 'gazette' | 'quiz' | 'postcards' | 'trailer' | 'lines' | 'sampler' | 'story' | 'print' | 'jacket';

/** A keepsake: its id, the capitals at its head, its line, what a screen reader says, its icon (Material's name and
 * Material Community's), its colours, black bars (a film) or threads of colour (the print) on its tile, and the page
 * it opens (Scriptor's route). */
export type Keepsake = {
  id: KeepsakeId;
  kicker: string;
  line: string;
  label: string;
  icon: string;
  colours: string[];
  bars: boolean;
  stripes: boolean;
  path: string;
};

/** Every keepsake of the book called `title`, in their order. */
export function keepsakesOf(title: string): Keepsake[] {
  const book = title.trim().length === 0 ? 'your novel' : title.trim();
  const k = (
    id: KeepsakeId,
    kicker: string,
    line: string,
    label: string,
    icon: string,
    colours: string[],
    page: string,
    marks: { bars?: boolean; stripes?: boolean } = {},
  ): Keepsake => ({
    id,
    kicker,
    line,
    label,
    icon,
    colours,
    bars: marks.bars ?? false,
    stripes: marks.stripes ?? false,
    path: `/keepsakes/${page}`,
  });
  return [
    k('gazette', 'THE GAZETTE', 'Every chapter a front page of your world’s paper.', `The Gazette: each chapter of ${book} as the front page of its world’s newspaper`, 'newspaper', ['#3B352C', '#8C7F68'], 'gazette'),
    k('quiz', 'QUIZ', 'How well do you know your own book?', `The book quiz: how well do you know ${book}? Who said it, which chapter, the missing word`, 'quiz_outlined', ['#14233A', '#2C4A6E'], 'quiz'),
    k('postcards', 'POSTCARDS', 'Greetings from the places in your book.', `Postcards: greetings from the places in ${book}, a painted postcard each`, 'local_post_office_outlined', ['#2E6F8E', '#D98B5F'], 'postcards'),
    k('trailer', 'TRAILER', 'Your book as a film trailer, cut from its own lines.', `The trailer: ${book} as a film trailer, cut from its own lines`, 'play_circle_outline', ['#07070B', '#2A0E12'], 'trailer', { bars: true }),
    k('lines', 'BEST LINES', 'The sentences most worth quoting, as cards to share.', `Your best lines: the sentences of ${book} most worth quoting, as cards to share`, 'format_quote', ['#3D2F1E', '#7A5B2E'], 'lines'),
    k('sampler', 'SAMPLER', 'Your opening chapters as a PDF to send to a reader.', `The sampler: the opening of ${book} as a reader’s sample, a PDF to send`, 'picture_as_pdf_outlined', ['#1E3A34', '#2F5E4E'], 'sampler'),
    k('story', 'SO FAR', 'Your words, days and people, told as a story.', `Your book so far: ${book} told as a story`, 'auto_stories_outlined', ['#2B2350', '#7A2E3A', '#8A4B1C'], 'story'),
    k('print', 'FINGERPRINT', 'Every paragraph a thread, in its character’s colour.', `Its fingerprint: ${book} as a print, every paragraph a thread`, 'fingerprint', ['#14121A', '#1F2B3A'], 'print', { stripes: true }),
    k('jacket', 'FULL JACKET', 'Back, spine and front, as a printer lays them out.', `The full jacket: ${book} as a printed cover, back, spine and front`, 'menu_book_outlined', ['#3A2A1C', '#1A130D'], 'jacket'),
  ];
}

/** The keepsakes opened, as stored (a list of ids; anything else is none). */
export function openedOf(stored: unknown): Set<string> {
  return new Set(Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : []);
}

/** What is stored once `id` is opened: every id opened, in order. Null when it was opened already. */
export function openedAfter(opened: ReadonlySet<string>, id: string): string[] | null {
  if (opened.has(id)) return null;
  return [...opened, id].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The row's order: the ones not yet opened first, each part in the keepsakes' own order. */
export function rowOrder(keepsakes: readonly Keepsake[], opened: ReadonlySet<string>): Keepsake[] {
  return [...keepsakes.filter((k) => !opened.has(k.id)), ...keepsakes.filter((k) => opened.has(k.id))];
}

/** The row's heading after KEEPSAKES: how many are new, or how many there are when none is. */
export function rowCount(keepsakes: readonly Keepsake[], opened: ReadonlySet<string>): string {
  const fresh = keepsakes.filter((k) => !opened.has(k.id)).length;
  return fresh === 0 ? `  ·  ${keepsakes.length}` : `  ·  ${fresh} new`;
}

/** What a screen reader says of a tile. */
export function tileLabel(k: Keepsake, isNew: boolean): string {
  return isNew ? `${k.label}, not yet opened` : k.label;
}

/** The shelf's line under its title. */
export function shelfLine(keepsakes: readonly Keepsake[], opened: ReadonlySet<string>): string {
  const fresh = keepsakes.filter((k) => !opened.has(k.id)).length;
  return fresh === 0
    ? 'Everything your book can be made into. You have opened them all.'
    : `Everything your book can be made into. ${fresh} of ${keepsakes.length} not yet opened.`;
}

/** How many stand on a shelf at `width`: two to four. */
export function shelfAcross(width: number): number {
  return Math.max(2, Math.min(4, Math.trunc((width - 32) / 190)));
}

/** The shelves: the keepsakes `across` at a time. */
export function shelvesOf<T>(keepsakes: readonly T[], across: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < keepsakes.length; i += across) rows.push(keepsakes.slice(i, Math.min(i + across, keepsakes.length)));
  return rows;
}

/** How far a keepsake on the shelf leans (radians): a little askew, each its own way. */
export function tiltOf(shelf: number, place: number, across: number): number {
  return (((shelf * across + place) % 3) - 1) * 0.018;
}

/** The threads of colour along the fingerprint's tile, each its colour, height and strength. */
export const tileThreads: readonly { colour: string; height: number; alpha: number }[] = [
  '#5B8DEF',
  '#E07A5F',
  '#81B29A',
  '#F2CC8F',
  '#9D7BD8',
  '#5B8DEF',
  '#E07A5F',
].map((colour, i) => ({ colour, height: 6 + ((i * 7) % 11), alpha: i % 2 === 0 ? 1 : 0.55 }));
