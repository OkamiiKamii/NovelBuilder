// THIS OR THAT, full screen (thisOrThat.ts holds the deck): a character's temperament a card at a time. Each card asks
// one thing ("In a crowded room, Mira is…") and holds its two answers side by side, Quiet or Loud: swipe the card
// towards one, or press it. Skip passes; Back returns. What their Core Traits already say is chosen when the card
// comes up. At the end, their **compass**: every axis with where they fell, and **Keep these traits** writes them into
// Core Traits (traits not on the deck kept). Nothing changes until Keep. The pure parts of
// flutter_app/lib/features/characters/widgets/this_or_that.dart.
//
// What a press changes: a side (pressed, or the card swiped past a quarter of the screen's width or flung faster
// than 700 px/s) chooses it and the next card comes (the card flies out over 220 ms, ease out, to 1.2 screen widths
// that way); Skip (or Next, on a card already chosen) passes; Back returns a card. "Keep these traits" (only once a
// choice differs from what was read) calls `recordTraits(c, entryId, deck.sides)` in one change (CharacterChanges),
// closes, and says `keptMessage`. "Back to the deck" goes to the first card again.

import { type Entry } from '../../records/entry';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type CharacterChanges } from '../characterChanges';
import { recordTraits } from '../recordLook';
import { type TraitAxis, askOf, sidesOf, traitAxes, traitsIn } from '../thisOrThat';

const traitFields = ['core traits', 'traits', 'personality traits', 'personality'];

/** The deck's state for one character. */
export class ThisOrThatDeck {
  /** Each axis's side: -1 left, 1 right, null or absent not chosen. */
  readonly sides: Map<string, number | null>;
  /** Where they were when the deck was dealt, so Keep knows what changed. */
  readonly was: ReadonlyMap<string, number | null>;
  at = 0;

  constructor(
    readonly entryId: string,
    readonly entryName: string,
    storedTraits: string,
  ) {
    this.sides = new Map(sidesOf(traitsIn(storedTraits)));
    this.was = new Map(this.sides);
  }

  /** The deck as dealt to `entry`, from the traits field they keep (Core Traits, Traits, Personality Traits or
   * Personality, the first they have). */
  static of(entry: Entry): ThisOrThatDeck {
    const field = entry.fields.find((f) => traitFields.includes(dartToLowerCase(dartTrim(f.key))));
    return new ThisOrThatDeck(entry.id, entry.name, field?.value ?? '');
  }

  get name(): string {
    return dartTrim(this.entryName).length === 0 ? 'They' : dartTrim(this.entryName);
  }

  get done(): boolean {
    return this.at >= traitAxes.length;
  }

  /** The card now (null at the compass). */
  get axis(): TraitAxis | null {
    return traitAxes[this.at] ?? null;
  }

  /** At the head, while a card is up: "3 of 16". */
  get count(): string | null {
    return this.done ? null : `${this.at + 1} of ${traitAxes.length}`;
  }

  /** The question, asked of them by name. */
  get question(): string | null {
    return this.axis === null ? null : askOf(this.axis, this.name);
  }

  /** How far through the deck, for the bar under the question: 0 to 1. */
  get progress(): number {
    return this.at / traitAxes.length;
  }

  /** The side chosen on the card now, if any. */
  get chosen(): number | null {
    return this.axis === null ? null : (this.sides.get(this.axis.id) ?? null);
  }

  /** The card's two halves: what each says, whether it is chosen, and its words to a screen reader. */
  get halves(): { side: -1 | 1; word: string; on: boolean; label: string }[] {
    const a = this.axis;
    if (a === null) return [];
    return ([-1, 1] as const).map((side) => {
      const word = side < 0 ? a.left : a.right;
      return { side, word, on: this.chosen === side, label: `${this.name} is: ${word}` };
    });
  }

  /** The button beside Back: "Skip", or "Next" on a card already chosen. Back is pressable after the first card. */
  get passLabel(): string {
    return this.chosen === null ? 'Skip' : 'Next';
  }

  get canGoBack(): boolean {
    return this.at > 0;
  }

  choose(side: number): void {
    const a = this.axis;
    if (a === null) return;
    this.sides.set(a.id, side);
    this.at++;
  }

  skip(): void {
    this.at++;
  }

  back(): void {
    if (this.at > 0) this.at--;
  }

  /** "Back to the deck", from the compass. */
  restart(): void {
    this.at = 0;
  }

  /** Whether Keep can be pressed: a choice differs from what was read. */
  get changed(): boolean {
    return traitAxes.some((a) => (this.sides.get(a.id) ?? null) !== (this.was.get(a.id) ?? null));
  }

  /** Keep these traits. */
  keep(c: CharacterChanges): void {
    recordTraits(c, this.entryId, this.sides);
  }

  get keptMessage(): string {
    return `${this.name}’s traits are in their profile, under Core Traits.`;
  }

  /** The compass: each axis, its two words, where they fell (null in the middle), and its words to a screen reader. */
  get compass(): { axis: TraitAxis; side: number | null; label: string; mark: CompassMark }[] {
    return traitAxes.map((axis) => {
      const side = this.sides.get(axis.id) ?? null;
      return {
        axis,
        side,
        label: side === null ? `${axis.left} or ${axis.right}: not chosen` : side < 0 ? axis.left : axis.right,
        mark: compassMark(side),
      };
    });
  }

  get compassTitle(): string {
    return `${this.name}’s compass`;
  }
}

export const thisOrThatWords = {
  title: 'This or that',
  close: 'Close',
  or: 'or',
  swipe: 'Swipe the card towards one, or press it.',
  back: 'Back',
  compassNote: 'Where they fell on each. Keep it, and it is in their Core Traits.',
  backToDeck: 'Back to the deck',
  keep: 'Keep these traits',
} as const;

/** Where a drag let go sends the card: a side (-1, 1), or null (back to the middle). `dx` how far it was dragged,
 * `velocity` how fast it was let go (px/s, along the drag), `width` the screen's. */
export function swipeSide(dx: number, velocity: number, width: number): -1 | 1 | null {
  if (Math.abs(dx) > width * 0.25 || Math.abs(velocity) > 700) {
    const s = Math.sign(Math.abs(dx) > 4 ? dx : velocity);
    return s < 0 ? -1 : s > 0 ? 1 : null;
  }
  return null;
}

/** How the card leans as it is dragged (-1 to 1): it turns by lean × 0.12 radians, and each half is lit towards
 * "chosen" by how far the card leans its way (`halfPull`). */
export function cardLean(dx: number, width: number): number {
  return Math.min(Math.max(dx / (width * 0.3), -1), 1);
}

export function halfPull(side: number, lean: number): number {
  return side < 0 ? Math.min(Math.max(-lean, 0), 1) : Math.min(Math.max(lean, 0), 1);
}

/** The compass line's track (a box `height` 16 high, the width of the line): a line across its middle (2 wide, the
 * outline colour), a dot of 2.5 at its centre; the mark, at 12% (left) or 88% (right) of the width, radius 7 in the
 * primary colour with a halo of 7 + max(2, 15% of the height) at 18% opacity; unchosen, a dot of 4 in the middle in the
 * outline colour. The words either side are 112 wide, the chosen one bold in the primary colour. */
export type CompassMark = { at: number; radius: number; halo: number | null; chosen: boolean };

export function compassMark(side: number | null, height = 16): CompassMark {
  if (side === null) return { at: 0.5, radius: 4, halo: null, chosen: false };
  return { at: side < 0 ? 0.12 : 0.88, radius: 7, halo: 7 + Math.max(2, height * 0.15), chosen: true };
}
