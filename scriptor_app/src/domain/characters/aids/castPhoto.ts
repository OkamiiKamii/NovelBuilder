// THE CAST PHOTOGRAPH, at the head of Characters: the whole cast stood together as for a company photograph, each as
// their portrait or cameo (cameo.ts, bare), overlapping a little, on a small stage with a light on the middle; the
// principals in front, the minor and background cast behind and smaller. Under it, the caption of an old photograph:
// "Front, from the left: … · Behind: …". A press on anyone opens them. With fewer than two, there is no photograph.
// The pure parts of flutter_app/lib/features/characters/widgets/cast_photo.dart. (Of a small cast, the empty chairs
// stand in its place: emptyChairsStage.ts `chairsFor`.)
//
// What a press changes: nothing; a figure pressed opens that character.

import { dartSort } from '../../manuscript/dartSort';
import { type Listed } from '../cast';

/** The most stood in each row of the photograph; the rest are named as "and N more". */
export const photoFront = 7;
export const photoBack = 8;

const rank: Readonly<Record<string, number>> = { Protagonist: 0, Antagonist: 1, Supporting: 2, Minor: 4, Background: 5 };

/** A character's place in the company (0 a protagonist … 5 the background cast): the most important of their roles;
 * with none, between the principals and the minor cast. */
export function castRank(l: Listed): number {
  const roles = l.profile.roles;
  return roles.length === 0 ? 3 : Math.min(...roles.map((r) => rank[r] ?? 3));
}

/** Who stands where in the cast photograph: the principals in front (protagonists, antagonists, the supporting cast),
 * the most important in the middle and the rest out to either side in turn; the minor and background cast behind.
 * With no roles recorded, the five most in the book stand in front. Left to right in each row, and how many more
 * there are than are stood. */
export function castPhotoRows(cast: readonly Listed[]): { front: Listed[]; back: Listed[]; more: number } {
  const ordered = dartSort([...cast], (a, b) => {
    const r = castRank(a) - castRank(b);
    if (r !== 0) return r;
    const seen = b.seenIn.length - a.seenIn.length;
    if (seen !== 0) return seen;
    return a.entry.name < b.entry.name ? -1 : a.entry.name > b.entry.name ? 1 : 0;
  });
  const anyRoles = ordered.some((l) => castRank(l) !== 3);
  const principals = anyRoles ? ordered.filter((l) => castRank(l) <= 3) : ordered.slice(0, 5);
  const rest = ordered.filter((l) => !principals.includes(l));
  // From the middle outward: the first in the middle, then left, right, left…
  const centred = (people: readonly Listed[]) => {
    const out: Listed[] = [];
    people.forEach((l, i) => {
      if (i % 2 === 1) out.unshift(l);
      else out.push(l);
    });
    return out;
  };
  const front = centred(principals.slice(0, photoFront));
  const back = centred([...principals.slice(photoFront), ...rest].slice(0, photoBack));
  return { front, back, more: cast.length - front.length - back.length };
}

/** The caption: "Front, from the left: Ilse, Wren, Kai · Behind: Nan, Jory · and 2 more". Null with fewer than two
 * (no photograph). */
export function castPhotoCaption(cast: readonly Listed[]): string | null {
  if (cast.length < 2) return null;
  const rows = castPhotoRows(cast);
  const names = (people: readonly Listed[]) => people.map((l) => l.entry.name).join(', ');
  const parts = [`Front, from the left: ${names(rows.front)}`];
  if (rows.back.length > 0) parts.push(`Behind: ${names(rows.back)}`);
  if (rows.more > 0) parts.push(`and ${rows.more} more`);
  return parts.join(' · ');
}

/** A figure's words to a screen reader ("Wren Hollis, Protagonist"), and its tooltip (the name). */
export function figureLabel(l: Listed): string {
  return [l.entry.name, ...l.profile.roles].join(', ');
}

/** Where everyone stands on a stage `width` wide: each figure's box (a portrait or bare cameo drawn 100 × 126 and
 * fitted to it), the back row first (drawn under the front), and the stage's height. Padding 14; figures overlap by
 * 22% of their width; the front at most 120 wide, the back at most 74% of the front; heights 1.26 times the width; the
 * front row's top half a back figure down when there is a back row. The light: a radial gradient of the primary colour
 * at 16% to nothing, at (0, 0.15), radius 0.75; the stage's edge a line 1.5 high, 8.4 (0.6 × 14) above the foot. */
export function castPhotoStage(
  rows: { front: readonly Listed[]; back: readonly Listed[] },
  width: number,
): {
  height: number;
  figures: { listed: Listed; row: 'front' | 'back'; left: number; top: number; width: number; height: number }[];
  edgeBottom: number;
} {
  const pad = 14;
  const overlap = 0.22;
  const room = width - pad * 2;
  const sizeFor = (n: number, most: number) =>
    n === 0 ? 0 : Math.min(Math.max(room / (n * (1 - overlap) + overlap), 0), most);
  const fw = sizeFor(rows.front.length, 120);
  const bw = rows.back.length === 0 ? 0 : sizeFor(rows.back.length, fw * 0.74);
  const fh = fw * 1.26;
  const bh = bw * 1.26;
  const frontTop = rows.back.length === 0 ? pad : pad + bh * 0.5;
  const height = frontTop + fh + pad;
  const row = (people: readonly Listed[], w: number, h: number, top: number, which: 'front' | 'back') => {
    const step = w * (1 - overlap);
    const span = w + step * (people.length - 1);
    const left = (width - span) / 2;
    return people.map((listed, i) => ({ listed, row: which, left: left + step * i, top, width: w, height: h }));
  };
  return {
    height,
    figures: [...row(rows.back, bw, bh, pad, 'back'), ...row(rows.front, fw, fh, frontTop, 'front')],
    edgeBottom: pad * 0.6,
  };
}
