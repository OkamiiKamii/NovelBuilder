// WRITE THEM IN: from a character to the page. Where a scene with them can go (a chapter still blank, a new chapter at
// the end, a new scene in the latest chapter), and the sparks to start it from, made of what the author has already
// written about them: what they want, what is in the way, what they could lose, the people they are tied to. Plain
// prompts in the author's own words, never prose put in their mouth; with nothing written about them yet, a few that
// fit anyone. A port of flutter_app/lib/shared/domain/characters/write_them_in.dart.

import { dartTrim } from '../text/dartString';
import { type Stake } from './stakes';

/** A spark for a scene: what it comes from, and the note it leaves in the chapter's plan. */
export type SceneSpark = { from: string; text: string };

/** Where the scene goes: into a chapter that is still blank, a new chapter at the end, or a new scene in a chapter. */
export type PlaceKind = 'blank' | 'newChapter' | 'newScene';
export const placeKinds: readonly PlaceKind[] = ['blank', 'newChapter', 'newScene'];

/** A place for the scene: its kind, the chapter it is in or after (null for a new chapter in an empty book), and how
 * it is said. */
export type ScenePlace = { kind: PlaceKind; nodeId: string | null; label: string };

/** A chapter or scene, as far as placing a scene needs: its id, kind ("chapter" or "scene"), parent, title, words, and
 * whether it has a plan with an objective. */
export type PlaceNode = {
  id: string;
  kind: string;
  parentId: string | null;
  title: string;
  words: number;
  planned: boolean;
};

/** Someone a character is tied to: the other's name, and what they are to them (may be empty). */
export type SparkTie = { other: string; tie: string };

/** The sparks for a scene with `name`, from their `stakes` and their `ties` (each the other's name and what they are
 * to them), the strongest first; with nothing written about them, the ones that fit anyone. */
export function sparksFor(
  name: string,
  stakes: ReadonlyMap<Stake, string>,
  ties: readonly SparkTie[],
): SceneSpark[] {
  const quoted = (s: string) => {
    const t = dartTrim(s).replace(/\s+/g, ' ');
    const short =
      t.length > 140 ? `${t.substring(0, Math.min(Math.max(t.lastIndexOf(' ', 140), 60), 140))}…` : t;
    return `“${short}”`;
  };
  const said = (stake: Stake) => {
    const w = stakes.get(stake);
    return w !== undefined && dartTrim(w).length > 0 ? w : null;
  };
  const out: SceneSpark[] = [];
  const wants = said('wants');
  if (wants !== null) out.push({ from: 'What they want', text: `${name} goes after what they want: ${quoted(wants)}` });
  const inTheWay = said('inTheWay');
  if (inTheWay !== null) {
    out.push({ from: 'What is in the way', text: `What stands in ${name}’s way shows itself: ${quoted(inTheWay)}` });
  }
  const atStake = said('atStake');
  if (atStake !== null) {
    out.push({ from: 'What they could lose', text: `${name} comes close to losing it: ${quoted(atStake)}` });
  }
  for (const t of ties.slice(0, 2)) {
    out.push({
      from: 'A tie',
      text:
        dartTrim(t.tie).length === 0
          ? `${name} and ${t.other}, in the same room, wanting different things.`
          : `${name} and ${t.other} (${dartTrim(t.tie)}), in the same room, wanting different things.`,
    });
  }
  // These fit anyone, and are always there to choose.
  out.push(
    { from: 'Anyone', text: `${name} doing what they do best, and it goes wrong.` },
    { from: 'Anyone', text: `${name} wants something small and urgent, right now.` },
    { from: 'Anyone', text: `Someone sees ${name} for the first time.` },
  );
  return out;
}

/** Where a scene can go in the book, from its chapters and scenes in reading order (`nodes`); the best first. A blank
 * chapter with no plan comes first (the latest one), so a book that has only its empty first chapter starts there. */
export function placesFor(nodes: readonly PlaceNode[]): ScenePlace[] {
  const chapters = nodes.filter((n) => n.kind === 'chapter');
  let blank: PlaceNode | null = null;
  for (let i = chapters.length - 1; i >= 0; i--) {
    const c = chapters[i];
    if (c.words === 0 && !c.planned && !nodes.some((n) => n.parentId === c.id)) {
      blank = c;
      break;
    }
  }
  const last = chapters.length > 0 ? chapters[chapters.length - 1] : null;
  const name = (n: PlaceNode) => (dartTrim(n.title).length === 0 ? 'the untitled chapter' : dartTrim(n.title));
  const out: ScenePlace[] = [];
  // (Dart's stand-in for "no blank chapter" has an empty id; a chapter whose id is empty is never blank there.)
  const blankId = blank !== null && blank.id.length > 0 ? blank.id : null;
  if (blank !== null && blankId !== null) out.push({ kind: 'blank', nodeId: blankId, label: `In ${name(blank)}, still blank` });
  out.push({ kind: 'newChapter', nodeId: last?.id ?? null, label: 'A new chapter at the end of the book' });
  if (last !== null && last.id !== (blank?.id ?? '')) {
    out.push({ kind: 'newScene', nodeId: last.id, label: `A new scene in ${name(last)}` });
  }
  return out;
}
