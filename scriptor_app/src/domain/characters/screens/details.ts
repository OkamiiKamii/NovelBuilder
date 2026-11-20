// THE DETAILS TAB: the profile's detail sections (sections.ts), the description, and what the character is tied to
// (abilities, possessions, factions, places): records kept elsewhere, linked here, never copied. The pure parts of
// flutter_app/lib/features/characters/tabs/details_tab.dart.
//
// What a press changes: the description, through autosave under `description:<entryId>`
// (CodexChanges.updateEntry(entryId, { description })); a link's role, through autosave under `linklabel:<linkId>`
// (CodexChanges.labelLink(linkId, entryId, text)); its status at once (CharacterChanges.setLinkStatus(entryId, linkId,
// status), '' for Not set); removing it (CodexChanges.unlink(linkId)); a new link (CodexChanges.linkEntries(entryId,
// otherId, role)).

import { type RelatedEntry } from '../../codex/codexChanges';
import { localeCompare } from '../../collation';
import { stableSorted } from '../../reader/stableSort';
import { type Entry } from '../../records/entry';
import { type CastData } from '../castData';
import { type CharacterProfile } from '../characterRecords';

/** The statuses a link to a faction, item or place can be given (or the author's own, kept). */
export const linkStatuses: readonly string[] = ['Active', 'Former', 'Secret'];

/** One link, as its row shows it. */
export type LinkRow = {
  link: RelatedEntry;
  /** What the other end is ("Faction / Species"). */
  kind: string;
  /** Its status ('' for not set), and the choices: Not set (''), the three, and its own when it is none of them. */
  status: string;
  statuses: { value: string; label: string }[] | null;
  roleLabel: string;
  removeTooltip: string;
};

/** The details' boxes: each linked entry where it belongs (powers, items, everything else). */
export function detailsLinks(
  cast: CastData,
  entry: Entry,
  profile: CharacterProfile,
): {
  description: { title: string; hint: string };
  powers: { title: string; empty: string | null; rows: LinkRow[] };
  items: { title: string; empty: string | null; rows: LinkRow[] };
  others: { title: string; caption: string; empty: string | null; rows: LinkRow[] };
  /** What can be linked: every codex entry but characters and those already linked, by name. */
  add: {
    linkable: { id: string; label: string }[];
    empty: string | null;
    label: string;
    roleLabel: string;
    roleHint: string;
    button: string;
  };
} {
  const related = cast.relatedOf(entry.id).filter((r) => r.entry.category !== 'character');
  const of = (categories: ReadonlySet<string>) => related.filter((r) => categories.has(r.entry.category));
  const others = related.filter((r) => r.entry.category !== 'power' && r.entry.category !== 'item' && r.entry.category !== 'artifact');
  const kind = (e: Entry) => cast.model.categories.get(e.category)?.singular ?? e.category;
  const row = (link: RelatedEntry, withStatus: boolean): LinkRow => {
    const status = profile.linkStatus.get(link.linkId) ?? '';
    return {
      link,
      kind: kind(link.entry),
      status,
      statuses: withStatus
        ? [
            { value: '', label: 'Not set' },
            ...[...new Set([...linkStatuses, ...(status.length > 0 ? [status] : [])])].map((s) => ({ value: s, label: s })),
          ]
        : null,
      roleLabel: 'Role or position',
      removeTooltip: `Remove the link to ${link.entry.name}`,
    };
  };
  const powers = of(new Set(['power']));
  const items = of(new Set(['item', 'artifact']));
  const already = new Set(related.map((r) => r.entry.id));
  const linkable = stableSorted(
    cast.entries.filter((e) => e.category !== 'character' && !already.has(e.id)),
    (a, b) => localeCompare(a.name, b.name),
  );
  return {
    description: { title: 'Description', hint: `Who ${entry.name} is, at whatever length you like.` },
    powers: {
      title: 'Skills, powers & abilities',
      empty:
        powers.length === 0 ? 'None linked. Link a power or rule from the codex below; it is shown here, not copied.' : null,
      rows: powers.map((r) => row(r, false)),
    },
    items: {
      title: 'Equipment & possessions',
      empty: items.length === 0 ? 'None linked. Link an item from the codex below.' : null,
      rows: items.map((r) => row(r, true)),
    },
    others: {
      title: 'Affiliations & links',
      caption: `Each link is one record, seen from both ends: open the faction and ${entry.name} is listed there too.`,
      empty: others.length === 0 ? 'Not linked to any faction, place or other entry yet.' : null,
      rows: others.map((r) => row(r, true)),
    },
    add: {
      linkable: linkable.map((e) => ({ id: e.id, label: `${e.name} (${kind(e)})` })),
      empty:
        linkable.length === 0
          ? 'Every codex entry is already linked, or the novel has none besides characters.'
          : null,
      label: 'Link to a faction, item, place…',
      roleLabel: 'Role or position there',
      roleHint: 'Captain',
      button: 'Link',
    },
  };
}
