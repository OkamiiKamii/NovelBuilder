// THE CAST'S NAMES, FOUND: every place the cast's names stand in a text, found in one reading of it. A port of
// flutter_app/lib/shared/domain/characters/cast_names.dart.
//
// Reading a book for its cast used to mean a search per character, per name they go by, over every paragraph: a cost
// that grew with the cast times the book. Here the text is read once, word by word; each word is looked up among the
// words the cast's names begin with, and only a name that begins with it is checked, where it stands. The cost grows
// with the book alone.
//
// A name is found as a word of its own: no letter just before it, none just after it ("Kade" in "Kade’s" and "Kade,",
// but not in "Kaden"), and matched exactly, case and all.
//
// Reads only.

import { dartSort } from '../manuscript/dartSort';
import { dartTrim } from '../text/dartString';
import { matchAt } from './pageText';
import { isLetter, runsOf } from '../text/letters';

/** A character for the readings of the pages: their id and the names they are found by (Dart's `EyesPerson`, in
 * pov.dart). */
export type EyesPerson = { id: string; names: readonly string[] };

/** A name found: where it starts and ends in the text, whose it is, and which of their names (its place in their list). */
export type NameHit = { start: number; end: number; id: string; name: number };

/** The runs of letters a name is looked up by: read a character at a time instead, as runsOf(text, isLetter), the same
 * runs (test/perf/letters.test.ts checks them). */
export const letters = /\p{L}+/gu;
const lettersAtStart = /\p{L}+/uy;
const letter = /\p{L}/uy;
const letterLast = /\p{L}$/u;

/** Every place `name` stands in `text` as a word of its own: no letter just before it, none just after, matched exactly
 * (the next looked for after the end of the last). Checked by hand rather than by a pattern's look behind. */
export function standingAt(text: string, name: string): number[] {
  const out: number[] = [];
  if (name.length === 0) return out;
  let from = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at < 0) return out;
    const end = at + name.length;
    // The character before (two code units when it is a pair) and the one after.
    const before = at > 0 && letterLast.test(text.substring(at >= 2 ? at - 2 : 0, at));
    const after = end < text.length && matchAt(letter, text, end) !== null;
    if (!before && !after) {
      out.push(at);
      from = end;
    } else {
      from = at + 1;
    }
  }
}

type Wanted = { id: string; index: number; name: string };

/** The cast's names, ready to be found in any text. */
export class CastNames {
  /** The names, by the run of letters each begins with. */
  private readonly byFirst = new Map<string, Wanted[]>();
  private readonly slow: Wanted[] = [];

  constructor(people: readonly EyesPerson[]) {
    for (const p of people) {
      p.names.forEach((raw, i) => {
        const name = dartTrim(raw);
        if (name.length === 0) return;
        const first = matchAt(lettersAtStart, name, 0);
        if (first === null) {
          // A name that does not begin with a letter ("3PO"): found where it stands, by hand.
          this.slow.push({ id: p.id, index: i, name });
        } else {
          let list = this.byFirst.get(first.text);
          if (list === undefined) this.byFirst.set(first.text, (list = []));
          list.push({ id: p.id, index: i, name });
        }
      });
    }
  }

  /** Whether there is any name to find. */
  get isEmpty(): boolean {
    return this.byFirst.size === 0 && this.slow.length === 0;
  }

  /** Every place in `text` where a name of the cast stands as a word of its own, in the order they stand (at one place,
   * the longest name first). Every name is found where it stands, so one place may hold several. */
  all(text: string): NameHit[] {
    const out: NameHit[] = [];
    if (this.byFirst.size > 0) {
      // The runs of letters (the pattern `letters`), read a character at a time (text/letters.ts): the same runs.
      for (const word of runsOf(text, isLetter)) {
        const candidates = this.byFirst.get(word[0]);
        if (candidates === undefined) continue;
        const at = word.index!;
        for (const c of candidates) {
          const end = at + c.name.length;
          if (!text.startsWith(c.name, at)) continue;
          if (end < text.length && matchAt(letter, text, end) !== null) continue;
          out.push({ start: at, end, id: c.id, name: c.index });
        }
      }
    }
    for (const s of this.slow) {
      for (const at of standingAt(text, s.name)) {
        out.push({ start: at, end: at + s.name.length, id: s.id, name: s.index });
      }
    }
    return dartSort(out, (a, b) => (a.start !== b.start ? a.start - b.start : b.end - b.start - (a.end - a.start)));
  }

  /** The ids of everyone named in `text`, in the order first found. */
  named(text: string): Set<string> {
    return new Set(this.all(text).map((h) => h.id));
  }
}
