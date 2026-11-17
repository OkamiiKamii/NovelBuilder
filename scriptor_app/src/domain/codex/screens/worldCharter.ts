// THE FIRST PAGE OF THE WORLD (FEATURES.md #206): an empty world opens on a page with one short paragraph to finish,
// a blank for a place, a power that rules it, a thing everyone wants, a thing everyone fears and a thing no one
// forgets. **Begin this world** makes an entry for each blank filled (any one is enough), all linked to the place.
// Only the kinds the novel has (and has not archived) are asked for. Nothing is made until the press. The pure parts of
// flutter_app/lib/features/codex/widgets/world_charter.dart.
//
// The page (a vault frame, padded 24 24 24 20): the title (vault heading 18, weight 700), 6, the intro (book face
// 15.5, italic, onSurfaceVariant), the vault rule, then the paragraph (book face 20) word by word, wrapping as prose
// (8 apart, 10 between lines), each blank in it: a field as wide as what is written or its example (+ 28, from 80 to
// the room less 40, at most 420), book face 20 italic, an underline in its kind's colour at 60% (2 wide in full colour
// when focused), its example as the hint, under it the kind's singular before any " / " (vault heading 10.5, 700), a
// full stop kept with its blank. 20 under it, **Begin this world** (an open book; disabled until a blank is filled)
// and the note (bodySmall).

import type { Category } from '../../records/category';
import { dartTrim } from '../../text/dartString';
import type { CodexChanges } from '../codexChanges';

/** One blank of the charter: the words around it, the kind of entry it makes, an example, and how the entry it makes
 * is linked to the place (the place's own blank has none). */
export type CharterClause = { kind: string; before: string; after: string; hint: string; linkLabel: string | null };

export const charterClauses: readonly CharterClause[] = [
  { kind: 'location', before: 'My story takes place in', after: '.', hint: 'Vell', linkLabel: null },
  { kind: 'faction', before: '', after: 'hold power there.', hint: 'The Lantern Guild', linkLabel: 'holds power in' },
  { kind: 'item', before: 'Everyone wants', after: '.', hint: 'the Ninth Key', linkLabel: 'sought in' },
  { kind: 'power', before: 'Everyone fears', after: '.', hint: 'tide-magic', linkLabel: 'feared in' },
  { kind: 'lore', before: 'And no one has forgotten', after: '.', hint: 'the night the river burned', linkLabel: 'remembered in' },
];

/** The blanks asked for: those whose kind the novel has and has not archived. */
export function charterAsked(kinds: ReadonlyMap<string, Category>): CharterClause[] {
  return charterClauses.filter((c) => {
    const k = kinds.get(c.kind);
    return k !== undefined && !k.archived;
  });
}

/** Whether **Begin this world** can be pressed: a blank asked for has something in it. */
export function charterAny(asked: readonly CharterClause[], names: ReadonlyMap<string, string>): boolean {
  return asked.some((c) => dartTrim(names.get(c.kind) ?? '').length > 0);
}

/** Makes the entries of a filled charter (inside one change): one entry for each filled blank, named exactly as
 * written, each linked to the place when there is one. Returns how many were made (none when every blank is empty). */
export function foundWorld(c: CodexChanges, names: ReadonlyMap<string, string>): number {
  const filled = charterClauses.filter((cl) => dartTrim(names.get(cl.kind) ?? '').length > 0);
  if (filled.length === 0) return 0;
  const first = filled.find((cl) => cl.linkLabel === null);
  const place = first === undefined ? null : c.createEntry(first.kind, names.get(first.kind));
  for (const cl of filled) {
    if (cl.linkLabel === null) continue;
    const e = c.createEntry(cl.kind, names.get(cl.kind));
    if (place !== null) c.linkEntries(e.id, place.id, cl.linkLabel);
  }
  return filled.length;
}

/** What is said once the world is begun. */
export function charterMessage(made: number): string | null {
  if (made <= 0) return null;
  return made === 1 ? 'Your world has its first entry.' : `Your world has its first ${made} entries.`;
}

/** A blank's tag under it: "Power System / Rule" as "Power System", so it fits under the shortest blank. */
export function blankTag(kind: Category): string {
  return kind.singular.split(' / ')[0];
}

/** The paragraph as it wraps: the words before each blank, the blank (with its full stop when it ends the sentence),
 * the words after it. */
export function charterParts(asked: readonly CharterClause[]): ({ kind: 'word'; text: string } | { kind: 'blank'; clause: CharterClause; stop: boolean })[] {
  const out: ({ kind: 'word'; text: string } | { kind: 'blank'; clause: CharterClause; stop: boolean })[] = [];
  const words = (s: string) => s.split(' ').filter((w) => w.length > 0);
  for (const c of asked) {
    for (const w of words(c.before)) out.push({ kind: 'word', text: w });
    if (c.after.startsWith('.')) {
      out.push({ kind: 'blank', clause: c, stop: true });
    } else {
      out.push({ kind: 'blank', clause: c, stop: false });
      for (const w of words(c.after)) out.push({ kind: 'word', text: w });
    }
  }
  return out;
}

/** A blank's width, from what is written in it (or its example) as measured, and the room the paragraph has. */
export function blankWidth(measured: number, room: number): number {
  const most = Math.min(420, Math.max(80, room - 40));
  return Math.min(most, Math.max(80, measured + 28));
}

export const charterWords = {
  title: 'The first page of your world',
  intro: 'Finish the paragraph. Each blank you fill becomes an entry you can build on; leave any of them empty.',
  begin: 'Begin this world',
  note: 'Places, factions, items, powers and lore can also be added one at a time with New entry.',
  allArchived: 'Every kind of world entry is archived. Restore one under Categories & fields to add entries.',
} as const;
