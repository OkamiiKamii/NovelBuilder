// THE EMPTY CHAIRS: the people a story usually has round its lead that this cast does not have yet. Who stands against
// them (while no one in the cast is an antagonist), who taught them, their rival, a friend, someone they love, their
// family: each only while the lead has no tie of that kind recorded. Only what is recorded is read; a chair is a
// question for the author, never a guess about the book. A port of
// flutter_app/lib/shared/domain/characters/empty_chairs.dart.

import { dartSort } from '../manuscript/dartSort';
import { type CharacterRelation } from '../records/relation';
import { dartTrim } from '../text/dartString';
import { type Listed } from './cast';

/** One empty chair: which part of a story it is, the question it asks about the lead (by name, never a pronoun), and
 * the line a new character's card begins with, after their name, which says so ("…, Wren's rival"). */
export type EmptyChair = { key: string; question: string; line: string };

/** The empty chairs round `lead`, from the `cast` and every relationship recorded. */
export function emptyChairs(lead: Listed, cast: readonly Listed[], relations: Iterable<CharacterRelation>): EmptyChair[] {
  const name = dartTrim(lead.entry.name);
  const first = name.split(/\s+/)[0];
  const kinds = new Set<string>();
  for (const r of relations) {
    if (r.fromId === lead.entry.id || r.toId === lead.entry.id) for (const s of r.stages) kinds.add(s.preset);
  }
  const has = (any: readonly string[]) => any.some((k) => kinds.has(k));
  const antagonist = cast.some((l) => l.profile.roles.includes('Antagonist'));
  const out: EmptyChair[] = [];
  if (!antagonist && !has(['enemies'])) {
    out.push({ key: 'against', question: `Who stands against ${first}?`, line: `, the villain, ${name}’s enemy` });
  }
  if (!has(['mentor-student'])) out.push({ key: 'mentor', question: `Who taught ${first}?`, line: `, ${name}’s mentor` });
  if (!has(['rivals'])) out.push({ key: 'rival', question: `Who is ${first}’s rival?`, line: `, ${name}’s rival` });
  if (!has(['friends', 'allies'])) {
    out.push({ key: 'friend', question: `Who stands with ${first}?`, line: `, ${name}’s friend` });
  }
  if (!has(['partners', 'spouses'])) {
    out.push({ key: 'love', question: `Who does ${first} love?`, line: `, ${name}’s lover` });
  }
  if (!has(['siblings', 'parent-child', 'relatives'])) {
    out.push({ key: 'family', question: `Who is ${first}’s family?`, line: `, ${name}’s sibling` });
  }
  return out;
}

/** Whose story the chairs are set round: the protagonist (the one most in the book when there are several); with
 * none, the one character in the book most. Null when no one is a protagonist and no one is on the page yet. */
export function chairsLead(cast: readonly Listed[]): Listed | null {
  const bySeen = (a: Listed, b: Listed) => b.seenIn.length - a.seenIn.length;
  const leads = dartSort(
    cast.filter((l) => l.profile.roles.includes('Protagonist')),
    bySeen,
  );
  if (leads.length > 0) return leads[0];
  const seen = dartSort(
    cast.filter((l) => l.seenIn.length > 0),
    bySeen,
  );
  return seen[0] ?? null;
}
