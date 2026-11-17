// IN THEIR PAGES: what the book says where someone (or somewhere, or something) is in it. For every chapter or scene
// they are named or linked in, in reading order, the sentence their name first appears in, with the name picked out,
// under the chapter's name. A press opens that chapter with the name found and selected (from paragraph `block` on).
// The pure parts of flutter_app/lib/features/characters/widgets/in_their_pages.dart: what to read (`theirPagesInputs`,
// then sightingsJob(service.storedChapters(novelId), where, names)) and how a passage is shown. It only reads.

import { stableSorted } from '../../reader/stableSort';
import { type CastData } from '../castData';
import { type Sighting } from '../namedIn';
import { documentName } from './parts';

/** How many passages are shown before "Show all". */
export const passagesShown = 6;

/** Where the entry is in the book, in reading order (linked there, or named), and the names it goes by; null when
 * there is nothing to read (nowhere yet, or no name). Worked out once a cast. */
export function theirPagesInputs(cast: CastData, entryId: string): { where: string[]; names: string[] } | null {
  const model = cast.model;
  const linked = [...model.nodes.values()].filter((n) => n.mentions.includes(entryId)).map((n) => n.id);
  const ids = [...new Set([...linked, ...(cast.named.get(entryId) ?? [])])].filter((id) => model.order.position.has(id));
  const where = stableSorted(ids, (a, b) => model.order.position.get(a)! - model.order.position.get(b)!);
  const names = cast.findNames[entryId] ?? [];
  return where.length === 0 || names.length === 0 ? null : { where, names };
}

/** The box of passages, or null when nothing was found (it then leaves no gap). `all`: "Show all" was pressed. */
export function theirPages(
  cast: CastData,
  found: readonly Sighting[] | null,
  all: boolean,
  title = 'In their pages',
): {
  title: string;
  caption: string;
  passages: { sighting: Sighting; chapter: string; quote: { before: string; name: string; after: string } }[];
  toggle: string | null;
} | null {
  if (found === null || found.length === 0) return null;
  const shown = all ? found : found.slice(0, passagesShown);
  return {
    title,
    caption: 'Where the name first comes in each chapter. Press one to read it there.',
    passages: shown.map((s) => ({
      sighting: s,
      chapter: documentName(cast, s.nodeId),
      quote: { before: `“${s.before}`, name: s.name, after: `${s.after}”` },
    })),
    toggle: found.length > passagesShown ? (all ? 'Show fewer' : `Show all ${found.length}`) : null,
  };
}
