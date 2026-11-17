// What the views that read the whole book (Eyes, Entrances, the Table read, Arcs) read it for: its chapters and scenes
// in reading order, the cast by the names they are found by, and the key a reading is kept by (it is read again only
// when one of these changes). As each of their Dart widgets works it out (flutter_app/lib/features/characters/
// widgets/whose_eyes.dart, entrances_view.dart, cast_arcs.dart, table_read_view.dart). The reading itself is a job run
// away from the screen over CharacterService.storedChapters(novelId).

import { readingOrder } from '../../model/storyOrder';
import { isDocument } from '../../outline';
import { type StoryNode } from '../../records/storyNode';
import { type CastData } from '../castData';
import { type EyesPerson } from '../castNames';

/** The chapters and scenes, in reading order. */
export function bookDocuments(cast: CastData): StoryNode[] {
  return readingOrder(cast.model.nodes.values()).filter((n) => isDocument(n.kind));
}

/** The cast the book is read for: everyone not archived who has a name to be found by, with those names. */
export function bookPeople(cast: CastData): EyesPerson[] {
  const names = cast.findNames;
  return cast.list
    .filter((l) => !l.profile.archived && (names[l.entry.id] ?? []).length > 0)
    .map((l) => ({ id: l.entry.id, names: names[l.entry.id] }));
}

/** What a reading of the whole book is made of, and the key it is kept by: each chapter with its words, and each
 * person with their names. */
export function bookReading(cast: CastData): { nodes: StoryNode[]; people: EyesPerson[]; key: string } {
  const nodes = bookDocuments(cast);
  const people = bookPeople(cast);
  return {
    nodes,
    people,
    key: `${nodes.map((n) => `${n.id}:${n.wordCount}`).join(',')}\u0000${people
      .map((p) => `${p.id}:${p.names.join('|')}`)
      .join(',')}`,
  };
}

/** What "Read it there" asks of the editor: open `nodeId` with `term` found and selected, from paragraph `block` on
 * (pendingFind, then the chapter chosen and Write shown). */
export type ReadThere = { nodeId: string; term: string; block: number; path: string };

export function readThere(nodeId: string, term: string, block: number): ReadThere {
  return { nodeId, term, block, path: '/write' };
}

/** The line shown while the book is being read. */
export const readingTheBook = 'Reading the book…';
