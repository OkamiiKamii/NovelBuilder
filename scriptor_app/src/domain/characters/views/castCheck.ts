// THE CAST, CHECKED, on Characters (castCheck.ts makes the notes): what an editor would say of the cast, in a few notes,
// each with the faces it is about: a principal the book forgets, one who goes quiet, two always together, one too light
// to keep. A press on a face opens them; **Not now** sets a note aside (on this device). Nothing is changed by it.
//
// The pure parts of flutter_app/lib/features/characters/widgets/cast_check.dart. A note is a card ruled in the accent
// down its left edge (a stripe of its own), its kind in small capitals beside its icon (14, the accent), what it says
// (15.5), the faces it is about (each "Open <name>"), and **Not now**.

import { CharacterRelation } from '../../records/relation';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type Listed } from '../cast';
import { type CastData } from '../castData';
import { type CastMember, type CastNote, type NoteKind, castCheck } from '../castCheck';
import { byCodeUnits, storedStrings } from './common';

/** Where the notes set aside are kept, for a novel: on this device. */
export const castCheckKey = (novelId: string): string => `characters.checkSetAside.${novelId}`;

/** A note's key: what it is about and who. */
export function noteKey(n: CastNote): string {
  return `${n.kind}:${[...n.who].sort(byCodeUnits).join(',')}`;
}

/** Each kind's icon (Material Icons' name) and heading. */
export const noteKindHead: Readonly<Record<NoteKind, { icon: string; heading: string }>> = {
  forgotten: { icon: 'visibility_off_outlined', heading: 'A PRINCIPAL THE BOOK FORGETS' },
  quiet: { icon: 'hourglass_bottom', heading: 'GONE QUIET' },
  together: { icon: 'people_outline', heading: 'ALWAYS TOGETHER' },
  light: { icon: 'content_cut', heading: 'LIGHT ENOUGH TO CUT?' },
};

const goneWords = /\b(dead|deceased|late|killed|fallen|departed)\b/;

/** Whether their status says they are gone from the story (dead, departed), which explains a silence. */
export function goneFromStory(l: Listed): boolean {
  return goneWords.test(dartToLowerCase(l.profile.status));
}

/** The cast as the check sees it: everyone not archived, the chapters each is in, how many ties. */
export function castMembers(cast: CastData): CastMember[] {
  const of = cast.chaptersOf();
  const ties = new Map<string, number>();
  for (const row of cast.snapshot.rows('characterRelations')) {
    const r = new CharacterRelation(row);
    ties.set(r.fromId, (ties.get(r.fromId) ?? 0) + 1);
    ties.set(r.toId, (ties.get(r.toId) ?? 0) + 1);
  }
  return cast.list
    .filter((l) => !l.profile.archived)
    .map((l) => ({
      id: l.entry.id,
      name: dartTrim(l.entry.name).length === 0 ? 'Someone unnamed' : dartTrim(l.entry.name),
      roles: l.profile.roles,
      chapters: of.get(l.entry.id) ?? new Set<number>(),
      ties: ties.get(l.entry.id) ?? 0,
      gone: goneFromStory(l),
    }));
}

/** The notes shown (`stored`: what is under castCheckKey); their count is what the strip of notes says ('check'). */
export function castCheckNotes(cast: CastData, stored: unknown): CastNote[] {
  const aside = new Set(storedStrings(stored));
  return castCheck(castMembers(cast), { chapters: cast.model.order.chapters.length }).filter(
    (n) => !aside.has(noteKey(n)),
  );
}

/** What to store under castCheckKey when `note` is set aside ("Not now"). */
export function castCheckAfter(stored: unknown, note: CastNote): string[] {
  return [...new Set(storedStrings(stored)), noteKey(note)];
}

/** The panel, or null (nothing drawn) with no notes. Each note's faces are the cast it names that are still listed. */
export function castCheckPanel(
  cast: CastData,
  stored: unknown,
): {
  icon: string;
  heading: string;
  caption: string;
  notes: { note: CastNote; icon: string; heading: string; says: string; who: { listed: Listed; label: string }[]; notNow: string }[];
  count: number;
} | null {
  const notes = castCheckNotes(cast, stored);
  if (notes.length === 0) return null;
  const byId = new Map(cast.list.map((l) => [l.entry.id, l]));
  return {
    icon: 'balance',
    heading: 'THE CAST, CHECKED',
    caption: 'What an editor would ask of your cast, from where each of them is in the book.',
    notes: notes.map((n) => ({
      note: n,
      icon: noteKindHead[n.kind].icon,
      heading: noteKindHead[n.kind].heading,
      says: n.says,
      who: n.who.flatMap((id) => {
        const l = byId.get(id);
        return l === undefined ? [] : [{ listed: l, label: `Open ${l.entry.name}` }];
      }),
      notNow: 'Not now',
    })),
    count: notes.length,
  };
}
