// FOILS AND TWINS: the cast's temperaments set against each other, from the traits This or that keeps (thisOrThat.ts).
// A **foil** is a pair who answer most of what they both answer the other way (the contrast a scene between them runs
// on); **twins** answer nearly everything the same way (a reader may mix them up); and a trait the **whole cast shares**
// (everyone honest) is a cast with no one to break it. Read from what the author chose, never guessed; a pair with too
// few answers in common is not compared. A port of flutter_app/lib/shared/domain/characters/foils.dart. Reads only.

import { compareNum, dartSort } from '../manuscript/dartSort';
import { traitAxes } from './thisOrThat';

/** A character's answers: their id, and the side of each axis they are on (-1 left, 1 right). */
export type Temperament = { id: string; sides: ReadonlyMap<string, number> };

/** Two characters compared: who, on how many axes both answered, how many the other way and how many the same, and
 * the axes they differ on (in the deck's order). */
export type Pairing = { a: string; b: string; both: number; opposed: number; alike: number; differ: string[] };

/** A trait the whole cast shares: the axis, the side, and how many answered it. */
export type Shared = { axis: string; side: number; count: number };

/** What the cast's temperaments say. */
export type Foils = { foils: Pairing[]; twins: Pairing[]; shared: Shared[] };

/** How many axes two must both have answered to be compared. */
export const comparedFrom = 3;

/** The foils (two opposed on at least three in five of what they both answered, the most opposed first), the twins
 * (alike on all but at most one of four or more), and the traits all of four or more share, among `cast`. */
export function foilsOf(cast: readonly Temperament[]): Foils {
  const foils: Pairing[] = [];
  const twins: Pairing[] = [];
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      const p = pair(cast[i], cast[j]);
      if (p.both < comparedFrom) continue;
      if (p.opposed * 5 >= p.both * 3) foils.push(p);
      if (p.both >= 4 && p.opposed <= 1) twins.push(p);
    }
  }
  dartSort(foils, (x, y) => (y.opposed !== x.opposed ? y.opposed - x.opposed : x.both - y.both));
  dartSort(twins, (x, y) => (y.alike !== x.alike ? y.alike - x.alike : x.opposed - y.opposed));
  const shared: Shared[] = [];
  for (const axis of traitAxes) {
    const sides: number[] = [];
    for (const t of cast) {
      const s = t.sides.get(axis.id);
      if (s !== undefined) sides.push(s);
    }
    if (sides.length >= 4 && sides.every((s) => s === sides[0])) {
      shared.push({ axis: axis.id, side: sides[0], count: sides.length });
    }
  }
  return { foils, twins, shared };
}

/** `a` and `b` compared, axis by axis. */
export function pair(a: Temperament, b: Temperament): Pairing {
  let both = 0;
  let opposed = 0;
  const differ: string[] = [];
  for (const axis of traitAxes) {
    const x = a.sides.get(axis.id);
    const y = b.sides.get(axis.id);
    if (x === undefined || y === undefined) continue;
    both++;
    if (x !== y) {
      opposed++;
      differ.push(axis.id);
    }
  }
  return { a: a.id, b: b.id, both, opposed, alike: both - opposed, differ };
}

/** The trait `side` of the axis `id` keeps ("Rational", "Emotional"). Throws (Dart's StateError) for an axis not on the
 * deck. */
export function traitOf(id: string, side: number): string {
  const a = traitAxes.find((x) => x.id === id);
  if (a === undefined) throw new Error('Bad state: No element');
  return side < 0 ? a.leftTrait : a.rightTrait;
}

/** The two axes the cast's answers spread across most (answered by the most, split the most evenly), for a compass
 * that shows them apart; the deck's first two when nothing is answered. */
export function spreadAxes(cast: readonly Temperament[]): [string, string] {
  const spread = (id: string): number => {
    let l = 0;
    let r = 0;
    for (const t of cast) {
      const s = t.sides.get(id);
      if (s === -1) l++;
      if (s === 1) r++;
    }
    return l + r + (l < r ? l : r) * 2.0;
  };
  const order = traitAxes.map((a) => a.id);
  // The widest spread first; a tie in the deck's order, so the compass is the same each time.
  const ranked = dartSort([...order], (x, y) =>
    spread(y) !== spread(x) ? compareNum(spread(y), spread(x)) : order.indexOf(x) - order.indexOf(y),
  );
  return [ranked[0], ranked[1]];
}
