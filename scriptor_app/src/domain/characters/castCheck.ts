// THE CAST, CHECKED: what an editor says of a cast, read from where each of them is in the book. A principal the book
// forgets (a lead in hardly any of its chapters); one who goes quiet (there for a stretch, then gone, long before the
// end: a thread left hanging); two always on the page together (could they be one?); and one in a single chapter, tied
// to no one (do they earn their place?). Only what the chapters show is said; a book of fewer than three chapters is
// too young to judge. A port of flutter_app/lib/shared/domain/characters/cast_check.dart. Reads only.

import { dartToLowerCase, dartTrim } from '../text/dartString';

/** What a note is about. */
export type NoteKind = 'forgotten' | 'quiet' | 'together' | 'light';
export const noteKinds: readonly NoteKind[] = ['forgotten', 'quiet', 'together', 'light'];

/** One of the cast as the check sees them: their id, name, roles, the chapters they are in (by number), how many ties
 * they have, and whether they are gone from the story (dead, departed), which explains a silence. */
export type CastMember = {
  id: string;
  name: string;
  roles: readonly string[];
  chapters: ReadonlySet<number>;
  ties: number;
  gone: boolean;
};

/** A note on the cast: what it is about, who (one, or a pair), and what it says. */
export type CastNote = { kind: NoteKind; who: string[]; says: string };

const principal = new Set(['protagonist', 'antagonist', 'deuteragonist', 'supporting', 'love interest', 'mentor']);

const roleOf = (r: string) => dartToLowerCase(dartTrim(r));
const isPrincipal = (m: CastMember) => m.roles.some((r) => principal.has(roleOf(r)));
const isLead = (m: CastMember) => m.roles.some((r) => roleOf(r) === 'protagonist' || roleOf(r) === 'antagonist');

/** "3, 5 and 8". */
function listed(numbers: Iterable<number>): string {
  const n = [...numbers].sort((a, b) => a - b);
  if (n.length <= 1) return n.join('');
  return `${n.slice(0, n.length - 1).join(', ')} and ${n[n.length - 1]}`;
}

/** The notes on `cast` in a book of `chapters` chapters, the weightiest kind first (as they are found), at most `most`
 * (4); one of each person (two only in a pair). */
export function castCheck(cast: readonly CastMember[], options: { chapters: number; most?: number }): CastNote[] {
  const { chapters } = options;
  const most = options.most ?? 4;
  if (chapters < 3) return [];
  const notes: CastNote[] = [];
  const said = new Set<string>();
  const note = (kind: NoteKind, who: readonly CastMember[], says: string) => {
    if (who.some((m) => said.has(m.id))) return;
    for (const m of who) said.add(m.id);
    notes.push({ kind, who: who.map((m) => m.id), says });
  };

  // A principal the book forgets: in a fifth of its chapters or fewer, from five chapters.
  if (chapters >= 5) {
    for (const m of cast) {
      if (!isPrincipal(m) || m.gone) continue;
      const share = m.chapters.size / chapters;
      if (share > 0.2) continue;
      const named = roleOf(m.roles.find((r) => principal.has(roleOf(r)))!);
      const role = named === 'protagonist' || named === 'antagonist' ? `your ${named}` : 'one of your principals';
      note(
        'forgotten',
        [m],
        m.chapters.size === 0
          ? `${m.name} is ${role}, but not yet in any of the ${chapters} chapters.`
          : `${m.name} is ${role}, but in ${m.chapters.size} of ${chapters} chapters.`,
      );
    }
  }

  // Gone quiet: in two or more chapters, the last of them no further than three fifths through a book of six or more.
  if (chapters >= 6) {
    for (const m of cast) {
      if (m.gone || m.chapters.size < 2) continue;
      const all = [...m.chapters];
      const last = all.reduce((a, b) => (a > b ? a : b));
      if (last > chapters * 0.6) continue;
      const first = all.reduce((a, b) => (a < b ? a : b));
      note(
        'quiet',
        [m],
        `${m.name} is in chapters ${first} to ${last}, then gone: ${chapters - last} chapters without them. A thread ` +
          'left hanging?',
      );
    }
  }

  // Always together: two (neither a lead) in the same chapters, two or more, every time or all but one.
  const others = cast.filter((m) => !isLead(m) && m.chapters.size >= 2);
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      const a = others[i];
      const b = others[j];
      const both = [...a.chapters].filter((n) => b.chapters.has(n));
      const either = new Set([...a.chapters, ...b.chapters]);
      if (both.length < 2 || either.size - both.length > 1) continue;
      const always = both.length === either.size;
      note(
        'together',
        [a, b],
        `${a.name} and ${b.name} are on the page together ${always ? 'every time' : 'almost every time'} ` +
          `(chapters ${listed(both)}). Could they be one character?`,
      );
    }
  }

  // Light: in one chapter, tied to no one, not a principal, in a book of four or more.
  if (chapters >= 4) {
    for (const m of cast) {
      if (isPrincipal(m) || m.chapters.size !== 1 || m.ties > 0) continue;
      note(
        'light',
        [m],
        `${m.name} is in one chapter (${[...m.chapters][0]}) and tied to no one. Do they earn their place, or could ` +
          'someone already there do what they do?',
      );
    }
  }

  return notes.slice(0, most);
}
