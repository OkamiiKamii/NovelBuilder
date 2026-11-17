// FROM YOUR PAGES: what the book says about the cast (who is on the page together with no tie, what an editor would
// ask, people waiting for a name, names in the pages not in the cast yet) is kept under the cast, so the cast itself
// comes first. At the top, a strip of notes says how many of each there are, a press from each (it scrolls to that
// panel, brought up near the top: Flutter's `Scrollable.ensureVisible` with alignment 0.05, 350 ms, ease out).
//
// The pure parts of flutter_app/lib/features/characters/widgets/page_notes.dart. Each panel tells the page how many it
// shows (its `count`, after it is drawn, and only when that changes); the page keeps the counts and draws the strip.

/** A kind of note from the pages, in the strip's order. */
export type PageNote = 'together' | 'check' | 'waiting' | 'names';
export const pageNotes: readonly PageNote[] = ['together', 'check', 'waiting', 'names'];

/** Each kind's icon (Material Icons' names). */
export const pageNoteIcon: Readonly<Record<PageNote, string>> = {
  together: 'people_outline',
  check: 'fact_check_outlined',
  waiting: 'person_search_outlined',
  names: 'badge_outlined',
};

/** What `n` of them are called, in a few words. */
export function pageNoteSaid(note: PageNote, n: number): string {
  switch (note) {
    case 'together':
      return n === 1 ? '1 pair often together' : `${n} pairs often together`;
    case 'check':
      return n === 1 ? '1 note on the cast' : `${n} notes on the cast`;
    case 'waiting':
      return `${n} waiting for a name`;
    case 'names':
      return n === 1 ? '1 name in your pages' : `${n} names in your pages`;
  }
}

/** The strip of notes under the cast's photograph: a chip for each kind with something to say (in pageNotes' order),
 * its test key `note-<kind>`; null (nothing drawn) when none has. Over the chips, `heading` (11, bold, the accent,
 * letter spacing 2). */
export function notesStrip(
  counts: ReadonlyMap<PageNote, number>,
): { heading: string; chips: { note: PageNote; icon: string; label: string; key: string }[] } | null {
  const shown = pageNotes.filter((n) => (counts.get(n) ?? 0) > 0);
  if (shown.length === 0) return null;
  return {
    heading: 'FROM YOUR PAGES',
    chips: shown.map((n) => ({ note: n, icon: pageNoteIcon[n], label: pageNoteSaid(n, counts.get(n)!), key: `note-${n}` })),
  };
}

/** Whether the panels under the cast are set off by a divider (any of them has something to show). */
export function anyPageNotes(counts: ReadonlyMap<PageNote, number>): boolean {
  return [...counts.values()].some((n) => n > 0);
}

/** The counts after a panel told its own: the same map when nothing changed (so nothing is drawn again). */
export function counted(
  counts: ReadonlyMap<PageNote, number>,
  note: PageNote,
  count: number,
): ReadonlyMap<PageNote, number> {
  if (counts.get(note) === count) return counts;
  return new Map(counts).set(note, count);
}
